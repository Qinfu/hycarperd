/*
 * パソコンのキー操作。文字の入力中とダイアログを開いている間は受け付けない。
 *   ←・→        前・次のカードへ
 *   Esc          画像・文字の取り込みをやめる
 *   Delete・⌫    浮かせている選択範囲、または選んでいる部品を削除する
 *   ⌘Z（Ctrl+Z） 描画を取り消す
 */
import { fsHasNextCard, fsHasPreviousCard, fsSelectedPart } from "./AppState.js";

const KEY = {
  left: "ArrowLeft",
  right: "ArrowRight",
  escape: "Escape",
  delete: "Delete",
  backspace: "Backspace",
  undo: "z"
};

// 入力欄で打っているキーは、その入力欄のものとして扱う。
const TYPING_TARGETS = "input, textarea, select, [contenteditable]";
const DIALOG_SELECTOR = ".dialog-backdrop";

const fsIsDeleteKey = (xEvent) => xEvent.key === KEY.delete || xEvent.key === KEY.backspace;
const fsHasCommandKey = (xEvent) => xEvent.metaKey || xEvent.ctrlKey;

export const fsHandleShortcutKey = (xApp, xEvent) => {
  const { state: xState, painter: xPainter } = xApp;
  const xTyping = xEvent.target.closest?.(TYPING_TARGETS);

  if (xTyping || document.querySelector(DIALOG_SELECTOR)) {
    return;
  }

  if (xPainter.placing && xEvent.key === KEY.escape) {
    xPainter.cancelImage();
    return;
  }

  if (xPainter.selecting && fsIsDeleteKey(xEvent)) {
    xEvent.preventDefault();
    xPainter.deleteSelection();
    return;
  }

  // 部品を扱っている間だけ（描画中は fsSelectedPart が null）。削除の前に確認を出す。
  if (fsSelectedPart(xState) && fsIsDeleteKey(xEvent)) {
    xEvent.preventDefault();
    xApp.editor.deleteSelectedPart();
    return;
  }

  if (xState.painting && fsHasCommandKey(xEvent) && xEvent.key.toLowerCase() === KEY.undo) {
    xEvent.preventDefault();
    xPainter.undo();
    return;
  }

  // ⌘← などはブラウザの操作（戻るなど）に任せる。
  if (fsHasCommandKey(xEvent)) {
    return;
  }

  if (xEvent.key === KEY.right && fsHasNextCard(xState)) {
    xApp.navigation.next();
  } else if (xEvent.key === KEY.left && fsHasPreviousCard(xState)) {
    xApp.navigation.previous();
  }
};
