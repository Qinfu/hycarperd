/*
 * 絵を描く操作のうち、パレットやメニューから呼ぶもの：画像・文字の取り込み、全消去、選択範囲のコピー。
 * 道具パレット（PaintPalette）に渡す handlers もここで作る。
 */
import { TEXT_FONTS, TEXT_SIZES, fsTextImage } from "../paint/TextImage.js";
import { fsAskText } from "../ui/Dialog.js";
import { EDIT_LAYER, fsIsBackgroundEditing, fsSelectedPart } from "./AppState.js";
import { APP_TOOL, fsToolFor } from "./EditTool.js";
import { fsConfirm } from "./StackSession.js";

const PLACE_IMAGE_NOTICE = "枠をドラッグして位置を、右下の四角で大きさを決めて「貼り付け」を押します。";

export class PaintActions {
  constructor(xApp) {
    this.app = xApp;
  }

  // 道具パレットからの操作。パレットはエディット中ずっと出し、先頭の矢印で部品を、ほかの道具で絵を扱う。
  paletteHandlers() {
    const xApp = this.app;

    return {
      onText: () => this.placeText(),
      onClear: () => this.clearPicture(),
      onUndo: () => xApp.painter.undo(),
      onCopy: () => this.copySelection(),
      onPartsTool: () => xApp.editor.setEditTarget(xApp.state.editLayer, false),
      onAddPart: (xKind) => xApp.editor.addPart(xKind),
      onDeletePart: () => xApp.editor.deleteSelectedPart(),
      hasSelectedPart: () => Boolean(fsSelectedPart(xApp.state)),
      onPaintTool: () => xApp.editor.setEditTarget(xApp.state.editLayer, true),
      isPainting: () => xApp.state.painting,
      // 「完了」でエディットを終え、ブラウズに戻る。
      onDone: () => xApp.editor.setTool(APP_TOOL.browse),
      onLayout: () => xApp.cardView.fit()
    };
  }

  // 描画中でなければ、今の層（背景の編集中なら背景）の描画に切り替えてから画像を選んでもらう。
  // 選んだら handleImageFileInput が呼ばれる。
  chooseImage() {
    const xState = this.app.state;

    if (!xState.painting) {
      const xLayer = fsIsBackgroundEditing(xState) ? EDIT_LAYER.background : EDIT_LAYER.card;
      this.app.editor.setTool(fsToolFor(xLayer, true));
    }

    this.app.elements.imageFileInput.click();
  }

  async handleImageFileInput() {
    const { state: xState, elements: xElements } = this.app;
    const xFile = xElements.imageFileInput.files?.[0];

    // 同じファイルをもう一度選べるように選択を解除しておく。
    xElements.imageFileInput.value = "";

    if (!xFile || !xState.painting) {
      return;
    }

    // 前に取り込んだ画像のURLは、新しい画像を選んだときに解放する。
    if (xState.importedImageUrl) {
      URL.revokeObjectURL(xState.importedImageUrl);
    }

    const xImage = new Image();
    xState.importedImageUrl = URL.createObjectURL(xFile);
    xImage.src = xState.importedImageUrl;

    try {
      await xImage.decode();
    } catch {
      this.app.notice.show("この画像は読み込めません。");
      return;
    }

    this.app.painter.placeImage(xImage);
    this.app.notice.show(PLACE_IMAGE_NOTICE);
  }

  // 文字を白黒のドットにして、取り込んだ画像と同じように枠で位置と大きさを決めて貼る。
  // 大きさ・フォント・太さは前に選んだものを次の既定にする。
  async placeText() {
    const xState = this.app.state;
    const xFontChoices = Object.entries(TEXT_FONTS).map(([xName, xFont]) => [xName, xFont.label]);
    const xAnswer = await fsAskText("絵として置く文字", { sizes: TEXT_SIZES, fonts: xFontChoices }, xState.textPictureOptions);

    // 文字を聞いている間にブラウズへ戻っていたら置かない。
    if (!xAnswer || !xState.editing) {
      return;
    }

    // 部品を扱っているときに押したなら、今の層の描画に切り替えてから置く。
    this.app.editor.setEditTarget(xState.editLayer, true);
    xState.textPictureOptions = { size: xAnswer.size, font: xAnswer.font, bold: xAnswer.bold };
    this.app.painter.placeImage(fsTextImage(xAnswer.text, xAnswer.size, xAnswer.font, xAnswer.bold), true);
    this.app.notice.show(PLACE_IMAGE_NOTICE);
  }

  async clearPicture() {
    const xWhere = this.app.state.editLayer === EDIT_LAYER.background ? "背景" : "このカード";

    if (await fsConfirm(`${xWhere}の絵をすべて消しますか？\n（「描画を取り消す」で元に戻せます）`)) {
      this.app.painter.clear();
    }
  }

  copySelection() {
    this.app.painter.copySelection();
    this.app.notice.show("今の位置に写しを残しました。枠を動かして置き場所を決めてください。");
  }
}
