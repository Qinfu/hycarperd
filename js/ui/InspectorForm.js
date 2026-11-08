/*
 * 設定の画面（Inspector.js）の入力欄を作る。作った欄は container に順に並べる。
 * 値が変わったら、それぞれの欄に渡した関数で、すぐにデータへ反映する。
 */
import { fsCheckScript } from "../hypertalk/Parser.js";
import { MIN_PART_SIZE } from "../model/StackFormat.js";
import { fsPlaySound } from "../sound/Sound.js";
import { fsFillSelect } from "./DialogFrame.js";

// 名前などの1行の入力欄に入れられる文字数。
const TEXT_INPUT_MAX_LENGTH = 60;

const TEXT_INPUT_CLASS = "text-input";
const SCRIPT_OK_MESSAGE = "構文OK";

// 位置と大きさの欄。キーは部品のデータの項目名。
const RECT_LABELS = { left: "X", top: "Y", width: "幅", height: "高さ" };

export class InspectorForm {
  // onPartChange(rerender)：位置と大きさを変えたときに呼ぶ（Inspector の onChange）。
  constructor(xContainer, xOnPartChange) {
    this.container = xContainer;
    this.onPartChange = xOnPartChange;
  }

  hint(xText) {
    const xHint = document.createElement("p");
    xHint.className = "inspector-hint";
    xHint.textContent = xText;
    this.container.append(xHint);
  }

  // 「名前 [入力欄]」の行。押せる範囲を名前まで広げるため label で包む。
  field(xLabelText, xControl) {
    const xLabel = document.createElement("label");
    const xText = document.createElement("span");
    xLabel.className = "inspector-field";
    xText.textContent = xLabelText;
    xLabel.append(xText, xControl);
    this.container.append(xLabel);
    return xLabel;
  }

  textInput(xLabelText, xValue, xOnInput) {
    const xInput = document.createElement("input");
    xInput.type = "text";
    xInput.className = TEXT_INPUT_CLASS;
    xInput.maxLength = TEXT_INPUT_MAX_LENGTH;
    xInput.value = xValue;
    xInput.addEventListener("input", () => xOnInput(xInput.value));
    this.field(xLabelText, xInput);
  }

  textArea(xLabelText, xValue, xClassName, xOnInput) {
    const xInput = document.createElement("textarea");
    xInput.className = `${TEXT_INPUT_CLASS} ${xClassName}`;
    xInput.value = xValue;
    xInput.addEventListener("input", () => xOnInput(xInput.value));
    this.field(xLabelText, xInput);
    return xInput;
  }

  // options は [[値, 表示名], ...]。
  select(xLabelText, xOptions, xValue, xOnChange) {
    const xSelect = document.createElement("select");
    xSelect.className = TEXT_INPUT_CLASS;
    fsFillSelect(xSelect, xOptions, xValue);
    xSelect.addEventListener("change", () => xOnChange(xSelect.value));
    this.field(xLabelText, xSelect);
  }

  // 選んだ音をその場で鳴らして確かめられるようにする。
  // 一覧にない名前（後から音を減らした場合など）も、消さずに選択肢に残す。
  soundSelect(xLabelText, xOptions, xValue, xOnChange) {
    const xKnown = xOptions.some(([xName]) => xName === xValue);
    const xAllOptions = xKnown ? xOptions : [...xOptions, [xValue, xValue]];

    this.select(xLabelText, xAllOptions, xValue, (xName) => {
      fsPlaySound(xName);
      xOnChange(xName);
    });
  }

  checkbox(xLabelText, xChecked, xOnChange) {
    const xInput = document.createElement("input");
    xInput.type = "checkbox";
    xInput.checked = xChecked;
    xInput.addEventListener("change", () => xOnChange(xInput.checked));
    this.field(xLabelText, xInput).classList.add("is-checkbox");
  }

  // 部品の位置と大きさ。カードからはみ出す値や、小さすぎる値は直してから入れる。
  rectInputs(xPart, xCardSize) {
    const xGroup = document.createElement("fieldset");
    const xLegend = document.createElement("legend");
    // 範囲はほかの欄の値で変わるので、入力されたときに求める。
    const xLimits = {
      left: () => [0, xCardSize.width - xPart.width],
      top: () => [0, xCardSize.height - xPart.height],
      width: () => [MIN_PART_SIZE, xCardSize.width - xPart.left],
      height: () => [MIN_PART_SIZE, xCardSize.height - xPart.top]
    };

    xGroup.className = "inspector-rect";
    xLegend.textContent = "位置と大きさ";
    xGroup.append(xLegend);

    for (const [xKey, xLabelText] of Object.entries(RECT_LABELS)) {
      const xLabel = document.createElement("label");
      const xInput = document.createElement("input");

      xInput.type = "number";
      xInput.inputMode = "numeric";
      xInput.className = TEXT_INPUT_CLASS;
      xInput.value = xPart[xKey];
      xInput.addEventListener("change", () => {
        const [xMin, xMax] = xLimits[xKey]();
        const xNumber = Math.round(Number(xInput.value));

        // 数でなければ元の値に戻す。
        if (Number.isFinite(xNumber)) {
          xPart[xKey] = Math.min(Math.max(xMin, xNumber), xMax);
        }

        xInput.value = xPart[xKey];
        this.onPartChange(true);
      });

      xLabel.append(xLabelText, xInput);
      xGroup.append(xLabel);
    }

    this.container.append(xGroup);
  }

  // スクリプト欄。入力のたびに構文を確かめ、誤りがあれば下に表示する。
  // スマホの自動修正・大文字化はスクリプトを壊すので切る。
  scriptInput(xLabelText, xOwner, xOnChange) {
    const xMessage = document.createElement("p");
    const xShowCheck = (xScript) => {
      const xError = fsCheckScript(xScript);
      xMessage.textContent = xError || SCRIPT_OK_MESSAGE;
      xMessage.classList.toggle("is-error", Boolean(xError));
    };
    const xInput = this.textArea(xLabelText, xOwner.script ?? "", "script-input", (xValue) => {
      xOwner.script = xValue;
      xShowCheck(xValue);
      xOnChange();
    });

    xInput.spellcheck = false;
    xInput.setAttribute("autocapitalize", "off");
    xInput.setAttribute("autocomplete", "off");
    xInput.setAttribute("autocorrect", "off");
    xInput.wrap = "off";
    xMessage.className = "script-check";
    xMessage.setAttribute("aria-live", "polite");
    xShowCheck(xInput.value);
    this.container.append(xMessage);
  }
}
