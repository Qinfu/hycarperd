/*
 * スタックを開く・保存する・新しく作る処理と、保存していない変更の管理。
 * スタックはブラウザ内に保存しない。変更があったことだけを覚えておき、
 * スタックを置き換えるときやページを離れるときに確かめる。
 */
import { fsLogError, fsLogWarning } from "../diagnostics/Log.js";
import { fsCreateEmptyStack, fsIsStackLocked } from "../model/StackModel.js";
import { fsNormalizeFileName, fsStackFileName } from "../storage/StackFileFormat.js";
import {
  fsCanPickOpenFile,
  fsCanPickSaveFile,
  fsCanShareStack,
  fsDownloadStack,
  fsPickStackFile,
  fsReadStackFile,
  fsSaveStackWithPicker,
  fsShareStack
} from "../storage/StackFiles.js";
import { fsLoadSampleStack, fsLoadStackFromPath } from "../storage/StackLoader.js";
import { fsAnswer, fsAsk, fsShowFacts } from "../ui/Dialog.js";
import { EDIT_LAYER, STACK_SCRIPT_OBJECT, fsCardScriptObject } from "./AppState.js";

const NEW_STACK_DEFAULT_NAME = "新しいスタック";

const CONFIRM_LABELS = { cancel: "キャンセル", ok: "OK" };

const UNSAVED_CHANGES_WARNING =
  "保存していない変更は失われます。\n残したい場合は先にファイルメニューの「保存…」をしてください。\n続けますか？";

const LOCKED_SAVE_NOTICE = "このスタックは閲覧専用のため、保存できません。";

// 「OK」を押したら true。
export const fsConfirm = async (xMessage) => {
  return (await fsAnswer(xMessage, [CONFIRM_LABELS.cancel, CONFIRM_LABELS.ok])) === CONFIRM_LABELS.ok;
};

export class StackSession {
  // mobileQuery：スマホ用の画面かどうかの MediaQueryList（スマホでは共有シートで保存する）。
  constructor(xApp, xMobileQuery) {
    this.app = xApp;
    this.mobileQuery = xMobileQuery;
  }

  // ---- 変更の管理 ----

  // ホームとロックしたスタックは保存しないので、スクリプトが中身を変えても確かめない。
  markChanged() {
    const xState = this.app.state;

    if (xState.stack && !xState.isHome && !fsIsStackLocked(xState.stack)) {
      xState.hasUnsavedChanges = true;
    }
  }

  // ファイルに保存していない変更があるときだけ、スタックを置き換える前に確認する。
  async confirmReplace() {
    return !this.app.state.hasUnsavedChanges || fsConfirm(UNSAVED_CHANGES_WARNING);
  }

  // ファイルに保存していない変更があるときは、ページを離れる前にブラウザに確かめてもらう。
  handleBeforeUnload(xEvent) {
    if (this.app.state.hasUnsavedChanges) {
      xEvent.preventDefault();
      xEvent.returnValue = "";
    }
  }

  // ---- 開く ----

  // message が空ならお知らせを出さない。isHome はホームのスタックを開くときだけ true。
  // ブラウズかエディットかは、呼ぶ側が先に決めておく。
  async open(xStackData, xMessage, xIsHome = false) {
    const { state: xState, interpreter: xInterpreter } = this.app;

    xState.stack = xStackData;
    xState.isHome = xIsHome;
    xState.cardIndex = 0;
    xState.selectedPartId = null;
    xState.history = [];
    this.app.inspector.close();
    xInterpreter.clearGlobals();
    this.app.messageBox.clear();
    xState.hasUnsavedChanges = false;
    this.app.view.render();

    if (xMessage) {
      this.app.notice.show(xMessage);
    }

    if (!xState.editing) {
      await xInterpreter.sendMessage("openStack", STACK_SCRIPT_OBJECT);
      await xInterpreter.sendMessage("openCard", fsCardScriptObject(xState));
    }
  }

  // 読み込んだスタックはブラウズで開く。描きかけの絵や動いているスクリプトは止める。
  openInBrowse(xStackData, xMessage) {
    const xState = this.app.state;
    this.app.interpreter.abort();
    xState.editing = false;
    xState.painting = false;
    this.open(xStackData, xMessage);
  }

  async openSample() {
    if (!(await this.confirmReplace())) {
      return;
    }

    try {
      this.openInBrowse(await fsLoadSampleStack(), "サンプルを開きました。");
    } catch (xError) {
      fsLogError("サンプルを開けませんでした。", xError);
      this.app.notice.show(`読み込みエラー：${xError.message}`);
    }
  }

  // スクリプトの go stack。Webサーバー上のスタックを開く（スクリプトはその前に止まっている）。
  async openFromPath(xPath) {
    if (!(await this.confirmReplace())) {
      return;
    }

    try {
      const xStackData = await fsLoadStackFromPath(xPath);
      this.openInBrowse(xStackData, `「${xStackData.stack.name}」を開きました。`);
    } catch (xError) {
      fsLogError(`go stack でスタックを開けませんでした：${xPath}`, xError);
      this.app.notice.show(`スタックを開けません：${xError.message}`);
    }
  }

  // 選んだファイルのスタックを開く。
  async openFile(xFile) {
    if (!(await this.confirmReplace())) {
      return;
    }

    try {
      this.openInBrowse(await fsReadStackFile(xFile), "スタックを読み込みました。");
    } catch (xError) {
      fsLogError(`ファイルを開けませんでした：${xFile.name}`, xError);
      this.app.notice.show(`読み込みエラー：${xError.message}`);
    }
  }

  // ファイルメニューの「開く…」。PCのChrome・Edgeは、前に開いたファイルのあるフォルダから選べるOSの画面を使う。
  // ほかのブラウザはファイルの入力欄を押して選んでもらう（選んだら handleStackFileInput が呼ばれる）。
  // どちらの画面も押した操作の中で開く必要があるので、先に await しない。
  async chooseFile() {
    if (!fsCanPickOpenFile()) {
      this.app.elements.stackFileInput.click();
      return;
    }

    try {
      const xFile = await fsPickStackFile(this.app.lastOpenedPlace);

      if (xFile) {
        await this.openFile(xFile);
      }
    } catch (xError) {
      fsLogError("「開く」の画面を使えませんでした。", xError);
      this.app.notice.show(`ファイルを開けません：${xError.message}`);
    }
  }

  handleStackFileInput() {
    const xInput = this.app.elements.stackFileInput;
    const xFile = xInput.files?.[0];

    // 同じファイルをもう一度選べるように選択を解除しておく。
    xInput.value = "";

    if (xFile) {
      this.openFile(xFile);
    }
  }

  // 新しいスタックは、カードの部品の編集で開く。描画中から作ったときは、描きかけの状態を片付ける。
  async createNew() {
    if (!(await this.confirmReplace())) {
      return;
    }

    const xName = await fsAsk("新しいスタックの名前", NEW_STACK_DEFAULT_NAME);

    if (xName === null) {
      return;
    }

    const xState = this.app.state;
    this.app.interpreter.abort();
    this.app.painter.end();
    xState.editing = true;
    xState.painting = false;
    xState.editLayer = EDIT_LAYER.card;
    this.open(fsCreateEmptyStack(xName.trim() || NEW_STACK_DEFAULT_NAME), "新しいスタックを作成しました。");
  }

  // ---- 保存 ----

  // 使える方法で保存する：PCは保存ダイアログ、スマホは共有シート、どちらも無ければ名前を聞いてダウンロード。
  // 保存ダイアログと共有シートは、メニューを押した操作の中で開く必要があるので、先に await しない。
  async save() {
    const { state: xState, notice: xNotice } = this.app;

    // メニューは押せなくしてあるが、doMenu "保存…" からも来るのでここでも止める。
    if (fsIsStackLocked(xState.stack)) {
      xNotice.show(LOCKED_SAVE_NOTICE);
      return;
    }

    try {
      if (fsCanPickSaveFile()) {
        const xFileName = await fsSaveStackWithPicker(xState.stack);

        if (xFileName) {
          xState.hasUnsavedChanges = false;
          xNotice.show(`「${xFileName}」に保存しました。`);
        }

        return;
      }

      if (this.mobileQuery.matches && fsCanShareStack(xState.stack)) {
        if (await fsShareStack(xState.stack)) {
          xState.hasUnsavedChanges = false;
          xNotice.show("スタックのファイルを渡しました。");
        }

        return;
      }
    } catch (xError) {
      // 保存ダイアログや共有シートが使えなかったときは、ダウンロードで保存する。
      fsLogWarning("保存ダイアログや共有シートが使えなかったので、ダウンロードで保存します。", xError);
    }

    await this.downloadWithName();
  }

  // 名前を聞いてから、ブラウザのダウンロード先に保存する。
  async downloadWithName() {
    const xState = this.app.state;
    const xName = await fsAsk("保存するファイルの名前", fsStackFileName(xState.stack));

    if (xName === null) {
      return;
    }

    fsDownloadStack(xState.stack, fsNormalizeFileName(xName, xState.stack));
    xState.hasUnsavedChanges = false;
    this.app.notice.show("スタックを保存しました。");
  }

  canSave() {
    const xStack = this.app.state.stack;
    return Boolean(xStack) && !fsIsStackLocked(xStack);
  }

  // 見るだけ。変えるのはエディット中のツールメニューの「スタック設定…」。
  showFacts() {
    const xInfo = this.app.state.stack.stack;

    fsShowFacts("スタック情報", [
      ["スタック名", xInfo.name],
      ["ヴァージョン", xInfo.version],
      ["作者", xInfo.author]
    ]);
  }
}
