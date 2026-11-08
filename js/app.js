/*
 * アプリの入口。画面の部品と処理の受け持ち（js/app/ の各クラス）を作って結び付け、ホームのスタックを開く。
 *
 * 状態は app.state の1か所にまとめ、各処理は app を通して互いを呼ぶ：
 *   app.view        状態を画面に映す（AppView）
 *   app.navigation  カードの移動（Navigation）
 *   app.session     スタックを開く・保存する（StackSession）
 *   app.editor      エディットの操作（EditActions）
 *   app.paint       画像・文字の取り込みなど描画の操作（PaintActions）
 */
import { MOBILE_MEDIA_QUERY, REDUCED_MOTION_MEDIA_QUERY } from "./config/AppConfig.js";
import { fsLogError } from "./diagnostics/Log.js";
import { Interpreter } from "./hypertalk/Interpreter.js";
import { Painter } from "./paint/Painter.js";
import { fsCanPickOpenFile } from "./storage/StackFiles.js";
import { fsLoadHomeStack } from "./storage/StackLoader.js";
import { LastOpenedPlace } from "./storage/LastOpenedPlace.js";
import { CardView } from "./ui/CardView.js";
import { Inspector } from "./ui/Inspector.js";
import { MenuBar } from "./ui/MenuBar.js";
import { PaintPalette } from "./ui/PaintPalette.js";
import { fsUnlockSound } from "./sound/Sound.js";
import { fsFindAppElements } from "./app/AppElements.js";
import { fsCreateAppState } from "./app/AppState.js";
import { AppView } from "./app/AppView.js";
import { fsCreateCardViewHandlers } from "./app/CardInteractions.js";
import { EditActions } from "./app/EditActions.js";
import { fsHandleShortcutKey } from "./app/KeyboardShortcuts.js";
import { fsCreateMenus } from "./app/MenuDefinition.js";
import { MessageBox } from "./app/MessageBox.js";
import { Navigation } from "./app/Navigation.js";
import { PaintActions } from "./app/PaintActions.js";
import { fsCreateScriptHost } from "./app/ScriptHost.js";
import { StackSession } from "./app/StackSession.js";
import { StatusNotice } from "./app/StatusNotice.js";

// 処理の受け持ちを作る。互いの呼び出しは操作が起きたときに app を通して行うので、作る順番は問わない。
const fsCreateControllers = (xApp, xMediaQueries) => {
  xApp.view = new AppView(xApp);
  xApp.navigation = new Navigation(xApp, xMediaQueries.reducedMotion);
  xApp.session = new StackSession(xApp, xMediaQueries.mobile);
  xApp.editor = new EditActions(xApp);
  xApp.paint = new PaintActions(xApp);
};

// 画面の部品を作る。作るときに互いを使うものがあるので、この順番を保つ
// （パレットは作るときにカードの大きさを合わせ直し、メニューは作るときに状態を読む）。
const fsCreateComponents = (xApp) => {
  const { elements: xElements } = xApp;

  xApp.interpreter = new Interpreter(fsCreateScriptHost(xApp));
  xApp.cardView = new CardView(xElements.cardArea, xElements.cardWindow, xElements.cardStage, fsCreateCardViewHandlers(xApp));
  xApp.inspector = new Inspector({
    onChange: (xRerender) => {
      if (xRerender) {
        xApp.view.render();
      }

      xApp.session.markChanged();
    },
    onDeletePart: (xPart) => xApp.editor.deletePart(xPart)
  });
  xApp.painter = new Painter({
    onChange: (xOwner, xPictureUrl) => {
      xOwner.picture = xPictureUrl;
      xApp.session.markChanged();
    },
    // パレットを作る前にも呼ばれることがある。
    onState: () => xApp.palette?.update()
  });
  xApp.palette = new PaintPalette(xElements.paletteRoot, xApp.painter, xApp.paint.paletteHandlers());
  xApp.menuBar = new MenuBar(xElements.menuBar, fsCreateMenus(xApp));
};

const fsListenToPage = (xApp, xMediaQueries) => {
  const { elements: xElements } = xApp;

  xElements.stackFileInput.addEventListener("change", () => xApp.session.handleStackFileInput());
  xElements.imageFileInput.addEventListener("change", () => xApp.paint.handleImageFileInput());
  document.addEventListener("keydown", (xEvent) => fsHandleShortcutKey(xApp, xEvent));
  window.addEventListener("beforeunload", (xEvent) => xApp.session.handleBeforeUnload(xEvent));
  xMediaQueries.mobile.addEventListener("change", () => xApp.view.applyDevice(xMediaQueries.mobile.matches));
};

// 起動時はホームのスタックを表示する。そこから doMenu や go stack でスタックを開く。
const fsOpenHomeStack = async (xApp) => {
  try {
    xApp.session.open(await fsLoadHomeStack(), "", true);
  } catch (xError) {
    fsLogError("ホームのスタックを開けませんでした。", xError);
    xApp.notice.show(`起動エラー：${xError.message}`);
    xApp.view.showNoStack();
  }
};

const fsStartApp = () => {
  const xElements = fsFindAppElements();
  const xMediaQueries = {
    mobile: matchMedia(MOBILE_MEDIA_QUERY),
    reducedMotion: matchMedia(REDUCED_MOTION_MEDIA_QUERY)
  };
  const xApp = {
    state: fsCreateAppState(),
    elements: xElements,
    notice: new StatusNotice(xElements.statusNotice),
    messageBox: new MessageBox(xElements.messageBox),
    // 「開く…」で最後に選んだファイルの場所。
    lastOpenedPlace: new LastOpenedPlace()
  };

  fsCreateControllers(xApp, xMediaQueries);
  fsCreateComponents(xApp);
  fsListenToPage(xApp, xMediaQueries);

  xApp.view.applyDevice(xMediaQueries.mobile.matches);
  fsUnlockSound();

  if (fsCanPickOpenFile()) {
    xApp.lastOpenedPlace.load();
  }

  fsOpenHomeStack(xApp);
};

fsStartApp();
