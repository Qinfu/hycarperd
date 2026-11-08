/*
 * メニューの項目。MenuBar に渡す形（js/ui/MenuBar.js の menus）で作る。
 * 項目の名前はスクリプトの doMenu でも使うので、変えると既存のスタックのスクリプトが動かなくなる。
 *
 * メニューは「ブラウズ」と「エディット」の2つのモードで出し分ける。
 *   ブラウズ  ：ファイル / 移動 / スタック
 *   エディット：ファイル / 編集 / ツール / 移動 / スタック
 * エディットの中で、どの層（カード・背景）を編集するかは編集メニューの先頭で選ぶ。
 * 部品を扱うか絵を描くかは、メニューではなく道具パレットで選ぶ。
 */
import { EDIT_LAYER, fsHasNextCard, fsHasPreviousCard, fsIsEditingParts, fsSelectedPart } from "./AppState.js";
import { INFO_TARGET } from "./EditActions.js";
import { APP_TOOL } from "./EditTool.js";
import { MENU_SEPARATOR } from "../ui/MenuBar.js";

const SEPARATOR = MENU_SEPARATOR;

export const fsCreateMenus = (xApp) => {
  const { state: xState, editor: xEditor, navigation: xNavigation, session: xSession } = xApp;
  const fsInEdit = () => xState.editing;
  const fsInParts = () => fsIsEditingParts(xState);
  const fsInPaint = () => xState.painting;
  const fsHasSelectedPart = () => Boolean(fsSelectedPart(xState));

  return [
    {
      title: "ファイル",
      items: [
        { label: "開く…", action: () => xSession.chooseFile() },
        { label: "保存…", action: () => xSession.save(), enabled: () => xSession.canSave() },
        SEPARATOR,
        { label: "サンプルを開く", action: () => xSession.openSample() }
      ]
    },
    {
      title: "編集",
      visible: fsInEdit,
      items: [
        { label: "カード編集", action: () => xEditor.setEditLayer(EDIT_LAYER.card), checked: () => xState.editLayer === EDIT_LAYER.card },
        {
          label: "背景編集",
          action: () => xEditor.setEditLayer(EDIT_LAYER.background),
          checked: () => xState.editLayer === EDIT_LAYER.background
        },
        SEPARATOR,
        {
          label: "描画を取り消す",
          action: () => xApp.painter.undo(),
          visible: fsInPaint,
          enabled: () => xApp.painter.canUndo || xApp.painter.placing
        },
        // 部品を扱っているときに選んでも、描画に切り替えてから取り込む。
        { label: "画像を取り込む…", action: () => xApp.paint.chooseImage() },
        { label: "部品を削除", action: () => xEditor.deleteSelectedPart(), visible: fsInParts, enabled: fsHasSelectedPart },
        SEPARATOR,
        { label: "新規カード", action: () => xEditor.addCard(), enabled: () => xEditor.canAddCard() },
        { label: "カード複製", action: () => xEditor.duplicateCard(), enabled: () => xEditor.canAddCard() },
        { label: "カードを削除", action: () => xEditor.deleteCard(), enabled: () => xEditor.canDeleteCard() },
        SEPARATOR,
        { label: "新規スタック…", action: () => xSession.createNew() }
      ]
    },
    {
      title: "ツール",
      visible: fsInEdit,
      items: [
        { label: "部品の情報…", action: () => xEditor.showInfo(INFO_TARGET.part), visible: fsInParts, enabled: fsHasSelectedPart },
        SEPARATOR,
        { label: "カード設定…", action: () => xEditor.showInfo(INFO_TARGET.card) },
        { label: "背景設定…", action: () => xEditor.showInfo(INFO_TARGET.background) },
        { label: "スタック設定…", action: () => xEditor.showInfo(INFO_TARGET.stack) }
      ]
    },
    {
      title: "移動",
      items: [
        { label: "戻る", action: () => xNavigation.goBack(), enabled: () => xState.history.length > 0 },
        SEPARATOR,
        { label: "最初のカード", action: () => xNavigation.navigate(0), enabled: () => fsHasPreviousCard(xState) },
        { label: "前のカード", action: () => xNavigation.previous(), enabled: () => fsHasPreviousCard(xState) },
        { label: "次のカード", action: () => xNavigation.next(), enabled: () => fsHasNextCard(xState) },
        {
          label: "最後のカード",
          action: () => xNavigation.navigate(xState.stack.cards.length - 1),
          enabled: () => fsHasNextCard(xState)
        }
      ]
    },
    {
      title: "スタック",
      items: [
        { label: "ブラウズ", action: () => xEditor.setTool(APP_TOOL.browse), checked: () => !xState.editing },
        {
          label: "エディット",
          action: () => xEditor.startEditing(),
          enabled: () => xEditor.canStartEditing(),
          checked: () => xState.editing
        },
        SEPARATOR,
        { label: "スタック情報", action: () => xSession.showFacts(), enabled: () => Boolean(xState.stack) },
        // メッセージボックスはブラウズ中だけ出す。
        {
          label: "メッセージボックス",
          action: () => xApp.messageBox.toggle(),
          visible: () => !xState.editing,
          checked: () => xApp.messageBox.isOpen
        }
      ]
    }
  ];
};
