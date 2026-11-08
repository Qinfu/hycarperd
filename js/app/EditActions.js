/*
 * エディットの操作：ブラウズ・エディットの切り替え、部品の追加・削除、カードの追加・複製・削除、設定の画面。
 */
import { MAX_CARDS } from "../model/StackFormat.js";
import { fsCardSize, fsCreateCard, fsCreatePart, fsDuplicateCard, fsIsStackLocked } from "../model/StackModel.js";
import { EDIT_LAYER, fsCurrentBackground, fsCurrentCard, fsEditOwner, fsSelectedPart } from "./AppState.js";
import { APP_TOOL, TOOL_NOTICES, fsModeOfTool, fsToolFor } from "./EditTool.js";
import { fsConfirm } from "./StackSession.js";

// 設定の画面で開くもの。
export const INFO_TARGET = { part: "part", card: "card", background: "background", stack: "stack" };

const LOCKED_EDIT_NOTICE = "このスタックは閲覧専用のため、エディットできません。";

export class EditActions {
  constructor(xApp) {
    this.app = xApp;
  }

  // ---- ブラウズ・エディット ----

  // tool は APP_TOOL の値。同じ状態を選び直しても何もしない（実行中のスクリプトは止める）。
  setTool(xTool) {
    const { state: xState, notice: xNotice } = this.app;

    // 実行中のスクリプトは、ブラウズ・エディットを選び直すと中断する。
    this.app.interpreter.abort();

    const xMode = fsModeOfTool(xTool, xState.editLayer);
    const xSameMode = xState.editing === xMode.editing
      && xState.painting === xMode.painting
      && xState.editLayer === xMode.editLayer;

    if (!xState.stack || xSameMode) {
      return;
    }

    // ロックしたスタックはエディットに入れない（メニュー・doMenu・パレットのどこから来てもここで止める）。
    if (xMode.editing && fsIsStackLocked(xState.stack)) {
      xNotice.show(LOCKED_EDIT_NOTICE);
      return;
    }

    if (!xMode.painting) {
      this.app.painter.end();
    }

    xState.editing = xMode.editing;
    xState.painting = xMode.painting;
    xState.editLayer = xMode.editLayer;
    xState.selectedPartId = null;
    this.app.view.render();
    xNotice.show(TOOL_NOTICES[xTool]);
  }

  // エディットの中で、層（カード・背景）や扱うもの（部品・絵）を切り替える。
  setEditTarget(xLayer, xPainting) {
    this.setTool(fsToolFor(xLayer, xPainting));
  }

  // 層だけを変える。部品を扱うか絵を描くかは今のまま。
  setEditLayer(xLayer) {
    this.setEditTarget(xLayer, this.app.state.painting);
  }

  // 前に編集していた層（カードか背景）の部品の編集から始める。
  startEditing() {
    this.setEditTarget(this.app.state.editLayer, false);
  }

  canStartEditing() {
    const xStack = this.app.state.stack;
    return Boolean(xStack) && !fsIsStackLocked(xStack);
  }

  // ---- 設定の画面 ----

  // 部品・カード・背景・スタックの設定をモーダルで開く。部品は選んでいるときだけ。
  showInfo(xTarget) {
    const { state: xState, inspector: xInspector } = this.app;
    const xPart = fsSelectedPart(xState);

    if (xTarget === INFO_TARGET.part && xPart) {
      const xIsBackground = xState.editLayer === EDIT_LAYER.background;
      xInspector.showPart(xPart, fsCardSize(xState.stack), fsCurrentCard(xState), xIsBackground);
    } else if (xTarget === INFO_TARGET.background) {
      xInspector.showBackground(fsCurrentBackground(xState));
    } else if (xTarget === INFO_TARGET.stack) {
      xInspector.showStack(xState.stack);
    } else if (xTarget === INFO_TARGET.card) {
      xInspector.showCard(fsCurrentCard(xState));
    }
  }

  // ---- 部品 ----

  // kind は NEW_PART_KIND の値。ブラウズ中ならカードの編集に、描画中ならその層の部品の編集に切り替えて追加する。
  addPart(xKind) {
    const xState = this.app.state;

    if (!xState.editing || xState.painting) {
      this.setTool(xState.editing ? fsToolFor(xState.editLayer, false) : APP_TOOL.card);
    }

    const xPart = fsCreatePart(xKind, fsEditOwner(xState), fsCardSize(xState.stack));
    fsEditOwner(xState).parts.push(xPart);
    xState.selectedPartId = xPart.id;
    this.app.view.render();
    this.app.session.markChanged();
    this.app.notice.show(`「${xPart.name}」を追加しました。`);
  }

  // 確認してから削除する。part が null なら何もしない。
  async deletePart(xPart) {
    if (!xPart || !(await fsConfirm(`「${xPart.name}」を削除しますか？`))) {
      return;
    }

    const xState = this.app.state;
    const xParts = fsEditOwner(xState).parts;
    xParts.splice(xParts.indexOf(xPart), 1);

    // 背景のフィールドなら、各カードに保存していた中身も消す。
    if (xState.editLayer === EDIT_LAYER.background) {
      for (const xCard of xState.stack.cards) {
        delete xCard.bgText[xPart.id];
      }
    }

    xState.selectedPartId = null;
    this.app.inspector.close();
    this.app.view.render();
    this.app.session.markChanged();
    this.app.notice.show("部品を削除しました。");
  }

  deleteSelectedPart() {
    return this.deletePart(fsSelectedPart(this.app.state));
  }

  // ダブルクリックした部品は、同じ層の一番上（最前面）に移してから情報を開く。
  openPart(xPart) {
    const xState = this.app.state;
    const xParts = fsEditOwner(xState).parts;
    const xIndex = xParts.indexOf(xPart);

    if (xIndex >= 0 && xIndex < xParts.length - 1) {
      xParts.splice(xIndex, 1);
      xParts.push(xPart);
      this.app.view.render();
      this.app.session.markChanged();
    }

    xState.selectedPartId = xPart.id;
    this.showInfo(INFO_TARGET.part);
  }

  // ---- カード ----

  canAddCard() {
    const xStack = this.app.state.stack;
    return Boolean(xStack) && xStack.cards.length < MAX_CARDS;
  }

  canDeleteCard() {
    const xStack = this.app.state.stack;
    return Boolean(xStack) && xStack.cards.length > 1;
  }

  // カードの追加・削除はエディット中（描画中を含む）だけ。上限に達していたら知らせる。
  canChangeCards() {
    if (!this.app.state.editing) {
      return false;
    }

    if (this.app.state.stack.cards.length >= MAX_CARDS) {
      this.app.notice.show(`カードは${MAX_CARDS}枚までです。`);
      return false;
    }

    return true;
  }

  // 新しいカードを今のカードの直後に入れて、そこへ移る。
  insertCardAfterCurrent(xCard) {
    const xState = this.app.state;
    xState.stack.cards.splice(xState.cardIndex + 1, 0, xCard);
    this.app.session.markChanged();
    this.app.navigation.goToCard(xState.cardIndex + 1);
  }

  addCard() {
    if (!this.canChangeCards()) {
      return;
    }

    const xState = this.app.state;
    const xName = `カード${xState.stack.cards.length + 1}`;
    this.insertCardAfterCurrent(fsCreateCard(fsCurrentCard(xState).backgroundId, xName));
    this.app.notice.show("カードを追加しました。");
  }

  // 今のカードを丸ごと複製して、すぐ後ろに入れる。
  duplicateCard() {
    if (!this.canChangeCards()) {
      return;
    }

    const xCard = fsCurrentCard(this.app.state);
    this.insertCardAfterCurrent(fsDuplicateCard(xCard, `${xCard.name}のコピー`));
    this.app.notice.show(`「${xCard.name}」を複製しました。`);
  }

  // 削除するとカードの番号がずれるので、「戻る」の履歴も消す。最後の1枚は消せない。
  async deleteCard() {
    const xState = this.app.state;

    if (!xState.editing) {
      return;
    }

    if (xState.stack.cards.length <= 1) {
      this.app.notice.show("最後の1枚は削除できません。");
      return;
    }

    if (!(await fsConfirm(`カード「${fsCurrentCard(xState).name}」を削除しますか？`))) {
      return;
    }

    xState.stack.cards.splice(xState.cardIndex, 1);
    xState.cardIndex = Math.min(xState.cardIndex, xState.stack.cards.length - 1);
    xState.selectedPartId = null;
    xState.history = [];
    this.app.view.render();
    this.app.session.markChanged();
    this.app.notice.show("カードを削除しました。");
  }
}
