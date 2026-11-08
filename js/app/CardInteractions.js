/*
 * カードの上での操作（CardView から届くもの）への応え方。
 * ブラウズ中はスクリプトにメッセージを送り、エディット中は部品の選択・移動・設定を受け持つ。
 */
import { NEW_PART_KIND } from "../model/StackFormat.js";
import { fsSetFieldText } from "../model/StackModel.js";
import { SWIPE_DIRECTION } from "../ui/CardView.js";
import { fsPlaySound } from "../sound/Sound.js";
import { fsCardScriptObject, fsCurrentCard, fsEditOwner, fsPartScriptObject } from "./AppState.js";

export const fsCreateCardViewHandlers = (xApp) => {
  const { state: xState } = xApp;

  // スクリプトが動いている間は、次の mouseUp を送らない（前のスクリプトの途中で別のものが始まらないように）。
  const fsSendMouseUp = (xTarget) => {
    if (!xApp.interpreter.busy) {
      xApp.interpreter.sendMessage("mouseUp", xTarget);
    }
  };

  return {
    onPartClick: (xPart, xIsBackground) => {
      // 押したときの音は、スクリプトが動いている最中でも鳴らす。
      if (xPart.type === NEW_PART_KIND.button && xPart.sound) {
        fsPlaySound(xPart.sound);
      }

      fsSendMouseUp(fsPartScriptObject(xState, xPart, xIsBackground));
    },
    onCardClick: () => {
      fsSendMouseUp(fsCardScriptObject(xState));
    },
    onFieldInput: (xPart, xText, xIsBackground) => {
      fsSetFieldText(xPart, fsCurrentCard(xState), xIsBackground, xText);
      xApp.session.markChanged();
    },
    onSwipe: (xDirection) => {
      if (xDirection === SWIPE_DIRECTION.next) {
        xApp.navigation.next();
      } else {
        xApp.navigation.previous();
      }
    },
    onContentInput: (xText) => {
      fsEditOwner(xState).content = xText;
      xApp.session.markChanged();
    },
    onSelect: (xPartId) => {
      xState.selectedPartId = xPartId;
      // パレットの削除ボタンを、選んでいるかどうかに合わせて押せる・押せないにする。
      xApp.palette.update();
    },
    onPartOpen: (xPart) => xApp.editor.openPart(xPart),
    onPartMoved: () => xApp.session.markChanged()
  };
};
