/*
 * 状態を画面に映す：カード、道具パレット、メニュー、タイトル、端末（PC・スマホ）に合わせた画面。
 */
import { fsCardSize } from "../model/StackModel.js";
import { fsCurrentBackground, fsCurrentCard, fsEditOwner, fsIsBackgroundEditing, fsIsEditingParts } from "./AppState.js";

// 画面の種類。CSS は html 要素の data-ui で出し分ける。
const UI_MODE = { mobile: "mobile", pc: "pc" };

// html 要素に付ける印。CSS で見た目を出し分ける。
const DOCUMENT_FLAG = {
  // 背景の編集中は、オリジナルと同じくメニューバーを縞模様にして知らせる。
  backgroundLayer: "background",
  // 編集中・描画中はメッセージボックスを出さない（中身と開閉の状態はブラウズに戻ったときに戻る）。
  editingAttribute: "data-editing"
};

// 部品を扱っている間だけ、カードに編集用の方眼を出す（描画中は絵だけを見やすくする）。
const EDITING_WINDOW_CLASS = "is-editing";

export class AppView {
  constructor(xApp) {
    this.app = xApp;
  }

  // 状態が変わるたびに呼ぶ。スタックをまだ開いていなければ何もしない。
  render() {
    const { state: xState, elements: xElements, painter: xPainter } = this.app;

    if (!xState.stack) {
      return;
    }

    // 描画中は、カードを移動したら描く相手もそのカード（または背景）に変える。
    if (xState.painting) {
      xPainter.begin(fsEditOwner(xState), fsCardSize(xState.stack));
    }

    xElements.paletteRoot.hidden = !xState.editing;

    this.app.cardView.render({
      card: fsCurrentCard(xState),
      background: fsCurrentBackground(xState),
      editing: xState.editing,
      painter: xState.painting ? xPainter : null,
      layer: xState.editLayer,
      selectedId: xState.selectedPartId,
      size: fsCardSize(xState.stack)
    });

    const xRoot = document.documentElement;
    xRoot.dataset.editLayer = fsIsBackgroundEditing(xState) ? DOCUMENT_FLAG.backgroundLayer : "";
    xElements.cardWindow.classList.toggle(EDITING_WINDOW_CLASS, fsIsEditingParts(xState));
    xRoot.toggleAttribute(DOCUMENT_FLAG.editingAttribute, xState.editing);
    this.app.palette.update();
    this.app.menuBar.update();
    this.updateTitles();
  }

  // カードの上の名前と、メニューバーのスタック名・カードの位置。何を編集中かも添える。
  updateTitles() {
    const { state: xState, elements: xElements, menuBar: xMenuBar } = this.app;
    const xCard = fsCurrentCard(xState);
    const xPosition = `${xState.cardIndex + 1} / ${xState.stack.cards.length}`;
    const xStackName = xState.stack.stack.name;

    if (fsIsBackgroundEditing(xState)) {
      const xDoing = xState.painting ? "背景に描画中" : "背景を編集中";
      xElements.cardName.textContent = `背景：${fsCurrentBackground(xState).name}`;
      xMenuBar.setTitle(xStackName, `${xDoing}（${xCard.name}　${xPosition}）`);
    } else if (xState.painting) {
      xElements.cardName.textContent = `${xCard.name}（描画中）`;
      xMenuBar.setTitle(xStackName, `描画中（${xCard.name}　${xPosition}）`);
    } else {
      xElements.cardName.textContent = xCard.name;
      xMenuBar.setTitle(xStackName, `${xCard.name}　${xPosition}`);
    }
  }

  // PC とスマホで、メニューの形とカードの置き方を切り替える。画面の大きさが変わったときにも呼ぶ。
  applyDevice(xIsMobile) {
    const xMode = xIsMobile ? UI_MODE.mobile : UI_MODE.pc;
    document.documentElement.dataset.ui = xMode;
    this.app.menuBar.setMode(xMode);

    if (this.app.state.stack) {
      this.updateTitles();
    }

    this.app.cardView.fit();
  }

  // スタックを開けなかったときに、カードの名前の所に出す。
  showNoStack() {
    this.app.elements.cardName.textContent = "スタックを開けません";
  }
}
