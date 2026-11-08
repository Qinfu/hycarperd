/*
 * アプリの状態（開いているスタック、表示しているカード、ブラウズかエディットか、など）と、状態から分かること。
 * 状態はこのオブジェクト1つにまとめ、各処理には app.state として渡す。
 */
import { DEFAULT_TEXT_PICTURE_OPTIONS } from "../config/AppConfig.js";
import { fsBackgroundOf } from "../model/StackModel.js";

// エディット中に編集している層。
export const EDIT_LAYER = { card: "card", background: "background" };

export const fsCreateAppState = () => {
  return {
    // 開いているスタックのデータ。起動直後で、まだ開いていなければ null。
    stack: null,
    // 起動時に表示するホームのスタックを開いているか。ホームの変更は保存の対象にしない。
    isHome: false,
    // ファイルに保存していない変更があるか。
    hasUnsavedChanges: false,
    cardIndex: 0,
    // エディット中か。絵を描いているときも true（スクリプトを動かさない）。
    editing: false,
    // エディット中に、描画の道具を使っているか（false なら部品を扱う）。
    painting: false,
    editLayer: EDIT_LAYER.card,
    selectedPartId: null,
    // 「戻る」で戻るカードの番号。
    history: [],
    // 文字を絵として置くときに前に選んだ大きさ・フォント・太さ。
    textPictureOptions: { ...DEFAULT_TEXT_PICTURE_OPTIONS },
    // 前に取り込んだ画像の URL。次の画像を選んだときに解放する。
    importedImageUrl: ""
  };
};

export const fsCurrentCard = (xState) => {
  return xState.stack.cards[xState.cardIndex];
};

export const fsCurrentBackground = (xState) => {
  return fsBackgroundOf(xState.stack, fsCurrentCard(xState));
};

export const fsIsBackgroundEditing = (xState) => {
  return xState.editing && xState.editLayer === EDIT_LAYER.background;
};

// 部品を扱っている（エディット中で、描画の道具を使っていない）か。
export const fsIsEditingParts = (xState) => {
  return xState.editing && !xState.painting;
};

// 編集している層（カードまたは背景）。部品の追加・選択・削除はこの層に対して行う。
export const fsEditOwner = (xState) => {
  return xState.editLayer === EDIT_LAYER.background ? fsCurrentBackground(xState) : fsCurrentCard(xState);
};

// 部品を扱っているときに選んでいる部品。なければ null。
export const fsSelectedPart = (xState) => {
  if (!xState.stack || !fsIsEditingParts(xState)) {
    return null;
  }

  return fsEditOwner(xState).parts.find((xPart) => xPart.id === xState.selectedPartId) ?? null;
};

export const fsHasNextCard = (xState) => {
  return Boolean(xState.stack) && xState.cardIndex < xState.stack.cards.length - 1;
};

export const fsHasPreviousCard = (xState) => {
  return xState.cardIndex > 0;
};

// スクリプトにメッセージを送る相手（ObjectResolver が扱う形）。
export const fsCardScriptObject = (xState) => {
  return { kind: "card", card: fsCurrentCard(xState) };
};

export const fsPartScriptObject = (xState, xPart, xIsBackground) => {
  return { kind: "part", part: xPart, card: fsCurrentCard(xState), isBackground: xIsBackground };
};

export const STACK_SCRIPT_OBJECT = { kind: "stack" };
