import { MIN_PART_SIZE, PART_TEXT_SIZES, fsFieldText, fsSetFieldText } from "../storage/StackIO.js";
import { fsCheckScript } from "../hypertalk/Parser.js";
import { fsPlaySound, fsSoundOptions } from "./Sound.js";

// スクリプトで visual effect を指定しなかったときの効果。
const EFFECT_OPTIONS = [
  ["wipe", "ワイプ（進む向きに拭き取る）"],
  ["dissolve", "ディゾルブ（点々に崩れる）"],
  ["none", "なし"]
];

// カードの効果。空ならスタックの効果に従う。
const CARD_EFFECT_OPTIONS = [["", "スタックの設定に従う"], ...EFFECT_OPTIONS];

const STYLE_OPTIONS = {
  button: [
    ["roundrect", "角丸"],
    ["rectangle", "四角"],
    ["shadow", "影付き"],
    ["transparent", "透明"]
  ],
  field: [
    ["rectangle", "四角"],
    ["shadow", "影付き"],
    ["transparent", "透明"]
  ]
};

/*
 * 部品・カード・背景・スタックの設定を、モーダルのダイアログで表示する。
 * 変更はその場で反映し、「OK」で閉じる。
 *
 * handlers:
 *   onChange(rerender) 値が変わるたびに呼ばれる。rerender が true ならカードを描き直す。
 *   onDeletePart(part) 部品の削除ボタンで呼ばれる。
 *   onClose()          ダイアログを閉じた。
 */
export class Inspector {
  constructor(xHandlers) {
    this.handlers = xHandlers;
    this.backdrop = null;
    this.container = null;
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
    this.container = null;
    this.handlers.onClose();
  }

  // 背景のフィールドの中身はカードごとなので、今のカード（xCard）を受け取る。
  showPart(xPart, xCardSize, xCard, xIsBackground) {
    const xTypeName = `${xIsBackground ? "背景" : ""}${xPart.type === "button" ? "ボタン" : "フィールド"}`;
    let xTextInput = null;
    this.xStart(`${xTypeName}情報`);

    this.xTextInput("名前", xPart.name, (xValue) => {
      xPart.name = xValue;
      this.handlers.onChange(true);
    });

    if (xPart.type === "field") {
      const xLabel = xIsBackground && !xPart.sharedText ? "テキスト（このカードの内容）" : "テキスト";
      xTextInput = this.xTextArea(xLabel, fsFieldText(xPart, xCard, xIsBackground), "field-text-input", (xValue) => {
        fsSetFieldText(xPart, xCard, xIsBackground, xValue);
        this.handlers.onChange(true);
      });
    }

    this.xSelect("スタイル", STYLE_OPTIONS[xPart.type], xPart.style, (xValue) => {
      xPart.style = xValue;
      this.handlers.onChange(true);
    });

    // スクリプトで選択肢にない大きさにしたときは、その大きさも選択肢に出す。
    const xTextSizes = [...new Set([...PART_TEXT_SIZES, xPart.textSize])].sort((xA, xB) => xA - xB);
    this.xSelect("文字の大きさ", xTextSizes.map((xSize) => [String(xSize), `${xSize} ドット`]),
      String(xPart.textSize), (xValue) => {
        xPart.textSize = Number(xValue);
        this.handlers.onChange(true);
      });

    this.xCheckbox("表示する", xPart.visible, (xValue) => {
      xPart.visible = xValue;
      this.handlers.onChange(true);
    });

    if (xPart.type === "field") {
      this.xCheckbox("文字を固定（押すとスクリプトが動く）", xPart.lockText, (xValue) => {
        xPart.lockText = xValue;
        this.handlers.onChange(true);
      });
    }

    if (xPart.type === "button") {
      this.xSoundSelect("押したときの音", [["", "なし"], ...fsSoundOptions()], xPart.sound, (xValue) => {
        xPart.sound = xValue;
        this.handlers.onChange(false);
      });
    }

    if (xPart.type === "field" && xIsBackground) {
      this.xCheckbox("全カードで同じ文字にする", xPart.sharedText, (xValue) => {
        xPart.sharedText = xValue;
        xTextInput.value = fsFieldText(xPart, xCard, xIsBackground);
        xTextInput.closest("label").firstChild.textContent = xValue ? "テキスト" : "テキスト（このカードの内容）";
        this.handlers.onChange(true);
      });
    }

    this.xRectInputs(xPart, xCardSize);
    this.xScriptInput(`${xTypeName}のスクリプト`, xPart);

    const xDelete = document.createElement("button");
    xDelete.type = "button";
    xDelete.className = "info-delete";
    xDelete.textContent = "削除…";
    xDelete.addEventListener("click", () => this.handlers.onDeletePart(xPart));
    this.footer.prepend(xDelete);
    this.xFocusDefault();
  }

  showCard(xCard) {
    this.xStart("カード設定");

    this.xTextInput("カード名", xCard.name, (xValue) => {
      xCard.name = xValue;
      this.handlers.onChange(true);
    });

    this.xSelect("このカードへ移るときの効果", CARD_EFFECT_OPTIONS, xCard.effect, (xValue) => {
      xCard.effect = xValue;
      this.handlers.onChange(false);
    });

    this.xScriptInput("カードのスクリプト", xCard);
    this.xFocusDefault();
  }

  showBackground(xBackground) {
    this.xStart("背景設定");

    this.xTextInput("背景名", xBackground.name, (xValue) => {
      xBackground.name = xValue;
      this.handlers.onChange(true);
    });

    this.xHint(`背景の部品：ボタン ${xBackground.parts.filter((xPart) => xPart.type === "button").length} 個、`
      + `フィールド ${xBackground.parts.filter((xPart) => xPart.type === "field").length} 個`);
    this.xScriptInput("背景のスクリプト", xBackground);
    this.xFocusDefault();
  }

  showStack(xStack) {
    this.xStart("スタック設定");

    this.xTextInput("スタック名", xStack.stack.name, (xValue) => {
      xStack.stack.name = xValue;
      this.handlers.onChange(true);
    });

    this.xTextInput("作者", xStack.stack.author, (xValue) => {
      xStack.stack.author = xValue;
      this.handlers.onChange(false);
    });

    this.xTextInput("ヴァージョン", xStack.stack.version, (xValue) => {
      xStack.stack.version = xValue;
      this.handlers.onChange(false);
    });

    this.xSelect("カードの切り替え効果（既定）", EFFECT_OPTIONS, xStack.stack.effect, (xValue) => {
      xStack.stack.effect = xValue;
      this.handlers.onChange(false);
    });

    this.xSoundSelect("beep で鳴らす音", fsSoundOptions(), xStack.stack.beepSound, (xValue) => {
      xStack.stack.beepSound = xValue;
      this.handlers.onChange(false);
    });

    this.xHint(`カードの大きさ：${xStack.stack.width} × ${xStack.stack.height}`);
    this.xScriptInput("スタックのスクリプト", xStack.stack);
    this.xFocusDefault();
  }

  // クラシックMac風のダイアログを作り、項目を入れる場所（this.container）を用意する。
  xStart(xTitle) {
    this.close();

    const xBackdrop = document.createElement("div");
    const xDialog = document.createElement("div");
    const xHeading = document.createElement("h2");
    const xBody = document.createElement("div");
    const xFooter = document.createElement("div");
    const xOk = document.createElement("button");

    xBackdrop.className = "dialog-backdrop";
    xDialog.className = "dialog info-dialog";
    xDialog.setAttribute("role", "dialog");
    xDialog.setAttribute("aria-modal", "true");
    xDialog.setAttribute("aria-labelledby", "info-title");
    xHeading.id = "info-title";
    xHeading.textContent = xTitle;
    xBody.className = "info-body";
    xFooter.className = "dialog-buttons info-footer";
    xOk.type = "button";
    xOk.className = "is-default";
    xOk.textContent = "OK";
    xOk.addEventListener("click", () => this.close());
    xFooter.append(xOk);
    xDialog.append(xHeading, xBody, xFooter);
    xBackdrop.append(xDialog);

    xDialog.addEventListener("keydown", (xEvent) => {
      if (xEvent.key === "Escape") {
        this.close();
      }
    });

    document.body.append(xBackdrop);
    this.backdrop = xBackdrop;
    this.container = xBody;
    this.footer = xFooter;
  }

  // 入力欄に合わせるとスマホでキーボードが勝手に開くため、OKボタンに合わせる。
  xFocusDefault() {
    this.footer.querySelector(".is-default").focus({ preventScroll: true });
  }

  xHint(xText) {
    const xHint = document.createElement("p");
    xHint.className = "inspector-hint";
    xHint.textContent = xText;
    this.container.append(xHint);
  }

  xField(xLabelText, xControl) {
    const xLabel = document.createElement("label");
    const xText = document.createElement("span");
    xLabel.className = "inspector-field";
    xText.textContent = xLabelText;
    xLabel.append(xText, xControl);
    this.container.append(xLabel);
    return xLabel;
  }

  xTextInput(xLabelText, xValue, xOnInput) {
    const xInput = document.createElement("input");
    xInput.type = "text";
    xInput.className = "text-input";
    xInput.maxLength = 60;
    xInput.value = xValue;
    xInput.addEventListener("input", () => xOnInput(xInput.value));
    this.xField(xLabelText, xInput);
  }

  xTextArea(xLabelText, xValue, xClassName, xOnInput) {
    const xInput = document.createElement("textarea");
    xInput.className = `text-input ${xClassName}`;
    xInput.value = xValue;
    xInput.addEventListener("input", () => xOnInput(xInput.value));
    this.xField(xLabelText, xInput);
    return xInput;
  }

  xSelect(xLabelText, xOptions, xValue, xOnChange) {
    const xSelect = document.createElement("select");
    xSelect.className = "text-input";

    for (const [xOptionValue, xOptionText] of xOptions) {
      xSelect.add(new Option(xOptionText, xOptionValue, false, xOptionValue === xValue));
    }

    xSelect.addEventListener("change", () => xOnChange(xSelect.value));
    this.xField(xLabelText, xSelect);
  }

  // 選んだ音をその場で鳴らして確かめられるようにする。
  // 一覧にない名前（後から音を減らした場合など）も、消さずに選択肢に残す。
  xSoundSelect(xLabelText, xOptions, xValue, xOnChange) {
    const xAll = xOptions.some(([xName]) => xName === xValue) ? xOptions : [...xOptions, [xValue, xValue]];

    this.xSelect(xLabelText, xAll, xValue, (xName) => {
      fsPlaySound(xName);
      xOnChange(xName);
    });
  }

  xCheckbox(xLabelText, xChecked, xOnChange) {
    const xInput = document.createElement("input");
    xInput.type = "checkbox";
    xInput.checked = xChecked;
    xInput.addEventListener("change", () => xOnChange(xInput.checked));
    this.xField(xLabelText, xInput).classList.add("is-checkbox");
  }

  xRectInputs(xPart, xCardSize) {
    const xGroup = document.createElement("fieldset");
    const xLegend = document.createElement("legend");
    const xLimits = {
      left: () => [0, xCardSize.width - xPart.width],
      top: () => [0, xCardSize.height - xPart.height],
      width: () => [MIN_PART_SIZE, xCardSize.width - xPart.left],
      height: () => [MIN_PART_SIZE, xCardSize.height - xPart.top]
    };
    const xLabels = { left: "X", top: "Y", width: "幅", height: "高さ" };

    xGroup.className = "inspector-rect";
    xLegend.textContent = "位置と大きさ";
    xGroup.append(xLegend);

    for (const xKey of Object.keys(xLabels)) {
      const xLabel = document.createElement("label");
      const xInput = document.createElement("input");

      xInput.type = "number";
      xInput.inputMode = "numeric";
      xInput.className = "text-input";
      xInput.value = xPart[xKey];
      xInput.addEventListener("change", () => {
        const [xMin, xMax] = xLimits[xKey]();
        const xNumber = Math.round(Number(xInput.value));
        xPart[xKey] = Number.isFinite(xNumber) ? Math.min(Math.max(xMin, xNumber), xMax) : xPart[xKey];
        xInput.value = xPart[xKey];
        this.handlers.onChange(true);
      });

      xLabel.append(xLabels[xKey], xInput);
      xGroup.append(xLabel);
    }

    this.container.append(xGroup);
  }

  // スクリプト欄。入力のたびに構文を確かめ、誤りがあれば下に表示する。
  xScriptInput(xLabelText, xOwner) {
    const xInput = this.xTextArea(xLabelText, xOwner.script ?? "", "script-input", (xValue) => {
      xOwner.script = xValue;
      xShowCheck();
      this.handlers.onChange(false);
    });
    const xMessage = document.createElement("p");

    xInput.spellcheck = false;
    xInput.setAttribute("autocapitalize", "off");
    xInput.setAttribute("autocomplete", "off");
    xInput.setAttribute("autocorrect", "off");
    xInput.wrap = "off";
    xMessage.className = "script-check";
    xMessage.setAttribute("aria-live", "polite");

    const xShowCheck = () => {
      const xError = fsCheckScript(xInput.value);
      xMessage.textContent = xError || "構文OK";
      xMessage.classList.toggle("is-error", Boolean(xError));
    };

    xShowCheck();
    this.container.append(xMessage);
  }
}
