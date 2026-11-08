/*
 * 部品・カード・背景・スタックの設定を、モーダルのダイアログで表示する。
 * 変更はその場で反映し、「OK」（Esc）で閉じる。入力欄そのものは InspectorForm.js が作る。
 *
 * handlers:
 *   onChange(rerender) 値が変わるたびに呼ばれる。rerender が true ならカードを描き直す。
 *   onDeletePart(part) 部品の削除ボタンで呼ばれる。
 */
import { CARD_EFFECT, NEW_PART_KIND, PART_TEXT_SIZES, TEXT_ALIGNS } from "../model/StackFormat.js";
import { fsFieldText, fsSetFieldText } from "../model/StackModel.js";
import { fsSoundOptions } from "../sound/Sound.js";
import { DIALOG_CLASS, DIALOG_LABELS, fsCreateDialogFrame } from "./DialogFrame.js";
import { InspectorForm } from "./InspectorForm.js";

// スクリプトで visual effect を指定しなかったときの効果。
const EFFECT_OPTIONS = [
  [CARD_EFFECT.wipe, "ワイプ（進む向きに拭き取る）"],
  [CARD_EFFECT.dissolve, "ディゾルブ（点々に崩れる）"],
  [CARD_EFFECT.none, "なし"]
];

// カードの効果。空ならスタックの効果に従う。
const FOLLOW_STACK_EFFECT = "";
const CARD_EFFECT_OPTIONS = [[FOLLOW_STACK_EFFECT, "スタックの設定に従う"], ...EFFECT_OPTIONS];

const TEXT_ALIGN_NAMES = { left: "左揃え", center: "中央揃え", right: "右揃え" };
const TEXT_ALIGN_OPTIONS = TEXT_ALIGNS.map((xAlign) => [xAlign, TEXT_ALIGN_NAMES[xAlign]]);

// 部品の種類ごとに選べる見た目（保存形式の style の値）。
const STYLE_OPTIONS = {
  [NEW_PART_KIND.button]: [
    ["roundrect", "角丸"],
    ["rectangle", "四角"],
    ["shadow", "影付き"],
    ["transparent", "透明"]
  ],
  [NEW_PART_KIND.field]: [
    ["rectangle", "四角"],
    ["shadow", "影付き"],
    ["transparent", "透明"]
  ]
};

const NO_SOUND_OPTION = ["", "なし"];

// 背景のフィールドの文字は、全カードで同じにしていなければカードごと。
const FIELD_TEXT_LABEL = { shared: "テキスト", perCard: "テキスト（このカードの内容）" };

const TITLE_ID = "info-title";

const fsFieldTextLabel = (xIsBackground, xSharedText) => {
  return xIsBackground && !xSharedText ? FIELD_TEXT_LABEL.perCard : FIELD_TEXT_LABEL.shared;
};

// 見出しに出す部品の種類の名前。テキストパーツは文字を固定したフィールド。
const fsPartKindName = (xPart) => {
  if (xPart.type === NEW_PART_KIND.button) {
    return "ボタン";
  }

  return xPart.lockText ? "テキスト" : "フィールド";
};

const fsCountParts = (xOwner, xType) => {
  return xOwner.parts.filter((xPart) => xPart.type === xType).length;
};

export class Inspector {
  constructor(xHandlers) {
    this.handlers = xHandlers;
    this.backdrop = null;
    this.form = null;
    this.footer = null;
  }

  get isOpen() {
    return this.backdrop !== null;
  }

  close() {
    if (!this.backdrop) {
      return;
    }

    this.backdrop.remove();
    this.backdrop = null;
    this.form = null;
  }

  // 値を変えたら、カードを描き直すかどうかを添えて知らせる。setValue(value) でデータに入れる。
  changeWith(xRerender, xSetValue) {
    return (xValue) => {
      xSetValue(xValue);
      this.handlers.onChange(xRerender);
    };
  }

  // 背景のフィールドの中身はカードごとなので、今のカード（card）を受け取る。
  showPart(xPart, xCardSize, xCard, xIsBackground) {
    const xIsButton = xPart.type === NEW_PART_KIND.button;
    const xIsField = xPart.type === NEW_PART_KIND.field;
    // テキストパーツは文字を固定したフィールド。入力フィールドとは出す項目を変える。
    const xIsTextPart = xIsField && xPart.lockText;
    const xTypeName = `${xIsBackground ? "背景" : ""}${fsPartKindName(xPart)}`;
    const xForm = this.start(`${xTypeName}情報`);
    let xTextInput = null;

    // パーツIDは部品の名前で、スクリプトで部品を指すときに使う（button "名前"）。ボタンの見た目は「ラベル」。
    xForm.textInput("パーツID", xPart.name, this.changeWith(true, (xValue) => {
      xPart.name = xValue;
    }));

    if (xIsButton) {
      xForm.textInput("ラベル", xPart.label, this.changeWith(true, (xValue) => {
        xPart.label = xValue;
      }));
    }

    if (xIsField) {
      const xLabel = fsFieldTextLabel(xIsBackground, xPart.sharedText);
      const xText = fsFieldText(xPart, xCard, xIsBackground);
      xTextInput = xForm.textArea(xLabel, xText, "field-text-input", this.changeWith(true, (xValue) => {
        fsSetFieldText(xPart, xCard, xIsBackground, xValue);
      }));
    }

    xForm.select("スタイル", STYLE_OPTIONS[xPart.type], xPart.style, this.changeWith(true, (xValue) => {
      xPart.style = xValue;
    }));

    // スクリプトで選択肢にない大きさにしたときは、その大きさも選択肢に出す。
    const xTextSizes = [...new Set([...PART_TEXT_SIZES, xPart.textSize])].sort((xA, xB) => xA - xB);
    const xTextSizeOptions = xTextSizes.map((xSize) => [String(xSize), `${xSize} ドット`]);
    xForm.select("文字の大きさ", xTextSizeOptions, String(xPart.textSize), this.changeWith(true, (xValue) => {
      xPart.textSize = Number(xValue);
    }));

    if (xIsTextPart) {
      xForm.select("文字の揃え", TEXT_ALIGN_OPTIONS, xPart.textAlign, this.changeWith(true, (xValue) => {
        xPart.textAlign = xValue;
      }));
    }

    xForm.checkbox("表示する", xPart.visible, this.changeWith(true, (xValue) => {
      xPart.visible = xValue;
    }));

    if (xIsTextPart) {
      xForm.checkbox("スクロールバーを表示", xPart.scrollbar, this.changeWith(true, (xValue) => {
        xPart.scrollbar = xValue;
      }));

      // オフなら、閲覧中に押しても選ばれず（枠線も出ず）、スクリプトも動かない。
      xForm.checkbox("スクリプト有効", xPart.clickable, this.changeWith(true, (xValue) => {
        xPart.clickable = xValue;
      }));
    }

    if (xIsButton) {
      const xSoundOptions = [NO_SOUND_OPTION, ...fsSoundOptions()];
      xForm.soundSelect("押したときの音", xSoundOptions, xPart.sound, this.changeWith(false, (xValue) => {
        xPart.sound = xValue;
      }));
    }

    // 切り替えると、文字欄の中身と名前を、全カード共通の文字とカードごとの文字で入れ替える。
    if (xIsField && xIsBackground) {
      xForm.checkbox("全カードで同じ文字にする", xPart.sharedText, this.changeWith(true, (xValue) => {
        xPart.sharedText = xValue;
        xTextInput.value = fsFieldText(xPart, xCard, xIsBackground);
        xTextInput.closest("label").firstChild.textContent = fsFieldTextLabel(xIsBackground, xValue);
      }));
    }

    xForm.rectInputs(xPart, xCardSize);
    this.addScriptInput(xForm, `${xTypeName}のスクリプト`, xPart);
    this.addDeleteButton(xPart);
    this.focusDefaultButton();
  }

  showCard(xCard) {
    const xForm = this.start("カード設定");

    xForm.textInput("カード名", xCard.name, this.changeWith(true, (xValue) => {
      xCard.name = xValue;
    }));

    xForm.select("このカードへ移るときの効果", CARD_EFFECT_OPTIONS, xCard.effect, this.changeWith(false, (xValue) => {
      xCard.effect = xValue;
    }));

    this.addScriptInput(xForm, "カードのスクリプト", xCard);
    this.focusDefaultButton();
  }

  showBackground(xBackground) {
    const xForm = this.start("背景設定");

    xForm.textInput("背景名", xBackground.name, this.changeWith(true, (xValue) => {
      xBackground.name = xValue;
    }));

    const xButtonCount = fsCountParts(xBackground, NEW_PART_KIND.button);
    const xFieldCount = fsCountParts(xBackground, NEW_PART_KIND.field);
    xForm.hint(`背景の部品：ボタン ${xButtonCount} 個、フィールド ${xFieldCount} 個`);
    this.addScriptInput(xForm, "背景のスクリプト", xBackground);
    this.focusDefaultButton();
  }

  showStack(xStack) {
    const xInfo = xStack.stack;
    const xForm = this.start("スタック設定");

    xForm.textInput("スタック名", xInfo.name, this.changeWith(true, (xValue) => {
      xInfo.name = xValue;
    }));

    xForm.textInput("作者", xInfo.author, this.changeWith(false, (xValue) => {
      xInfo.author = xValue;
    }));

    xForm.textInput("ヴァージョン", xInfo.version, this.changeWith(false, (xValue) => {
      xInfo.version = xValue;
    }));

    xForm.select("カードの切り替え効果（既定）", EFFECT_OPTIONS, xInfo.effect, this.changeWith(false, (xValue) => {
      xInfo.effect = xValue;
    }));

    xForm.soundSelect("beep で鳴らす音", fsSoundOptions(), xInfo.beepSound, this.changeWith(false, (xValue) => {
      xInfo.beepSound = xValue;
    }));

    xForm.hint(`カードの大きさ：${xInfo.width} × ${xInfo.height}`);
    this.addScriptInput(xForm, "スタックのスクリプト", xInfo);
    this.focusDefaultButton();
  }

  // ダイアログを作り、項目を入れる InspectorForm を返す。前に開いていたものは閉じる。
  start(xTitle) {
    this.close();

    const { backdrop: xBackdrop, dialog: xDialog } = fsCreateDialogFrame(`${DIALOG_CLASS.dialog} info-dialog`, "dialog");
    const xHeading = document.createElement("h2");
    const xBody = document.createElement("div");
    const xFooter = document.createElement("div");
    const xOk = document.createElement("button");

    xDialog.setAttribute("aria-labelledby", TITLE_ID);
    xHeading.id = TITLE_ID;
    xHeading.textContent = xTitle;
    xBody.className = "info-body";
    xFooter.className = `${DIALOG_CLASS.buttons} info-footer`;
    xOk.type = "button";
    xOk.className = DIALOG_CLASS.defaultButton;
    xOk.textContent = DIALOG_LABELS.ok;
    xOk.addEventListener("click", () => this.close());
    xFooter.append(xOk);
    xDialog.append(xHeading, xBody, xFooter);

    xDialog.addEventListener("keydown", (xEvent) => {
      if (xEvent.key === "Escape") {
        this.close();
      }
    });

    document.body.append(xBackdrop);
    this.backdrop = xBackdrop;
    this.footer = xFooter;
    this.form = new InspectorForm(xBody, (xRerender) => this.handlers.onChange(xRerender));
    return this.form;
  }

  // スクリプトを書き換えても見た目は変わらないので、カードは描き直さない。
  addScriptInput(xForm, xLabelText, xOwner) {
    xForm.scriptInput(xLabelText, xOwner, () => this.handlers.onChange(false));
  }

  addDeleteButton(xPart) {
    const xDelete = document.createElement("button");
    xDelete.type = "button";
    xDelete.className = "info-delete";
    xDelete.textContent = "削除…";
    xDelete.addEventListener("click", () => this.handlers.onDeletePart(xPart));
    this.footer.prepend(xDelete);
  }

  // 入力欄に合わせるとスマホでキーボードが勝手に開くため、OKボタンに合わせる。
  focusDefaultButton() {
    this.footer.querySelector(`.${DIALOG_CLASS.defaultButton}`).focus({ preventScroll: true });
  }
}
