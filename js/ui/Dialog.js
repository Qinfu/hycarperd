/*
 * answer / ask などの、答えを待つダイアログ。どれも Promise を返し、閉じたときに答えで解決する。
 */
import {
  DIALOG_LABELS,
  fsCreateDialogButtons,
  fsCreateMessageDialog,
  fsFillSelect
} from "./DialogFrame.js";

const KEY = { enter: "Enter", escape: "Escape" };

// 入力欄に共通のクラス。
const TEXT_INPUT_CLASS = "text-input";
const DIALOG_INPUT_CLASS = "dialog-input";

// 「キャンセル」「OK」の並び。押された番号がこれなら OK。
const CANCEL_OK_LABELS = [DIALOG_LABELS.cancel, DIALOG_LABELS.ok];
const OK_INDEX = 1;
const CANCEL_INDEX = 0;

// 絵として置く文字の太さの選択肢。
const FONT_WEIGHT = { normal: "normal", bold: "bold" };
const FONT_WEIGHT_OPTIONS = [[FONT_WEIGHT.normal, "標準"], [FONT_WEIGHT.bold, "太字"]];

// 漢字に変換している途中の Enter は、決定に使わない。
const fsIsConfirmedEnter = (xEvent) => xEvent.key === KEY.enter && !xEvent.isComposing;

const fsOpen = (xBackdrop, xFocusTarget) => {
  document.body.append(xBackdrop);
  xFocusTarget.focus();
};

// 押されたボタンの文字を返す。Enter で最後（既定）のボタンを押す。
export const fsAnswer = (xMessage, xLabels = [DIALOG_LABELS.ok]) => {
  return new Promise((xResolve) => {
    const { backdrop: xBackdrop, dialog: xDialog } = fsCreateMessageDialog(xMessage);

    const xChoose = (xIndex) => {
      xBackdrop.remove();
      xResolve(xLabels[xIndex]);
    };

    const xButtons = fsCreateDialogButtons(xLabels, xChoose);
    xDialog.append(xButtons);
    xDialog.addEventListener("keydown", (xEvent) => {
      if (xEvent.key === KEY.enter) {
        xEvent.preventDefault();
        xChoose(xLabels.length - 1);
      }
    });

    fsOpen(xBackdrop, xButtons.lastElementChild);
  });
};

// 入力された文字を返す。キャンセルされたら null。Enter で OK、Esc でキャンセル。
export const fsAsk = (xMessage, xDefault = "") => {
  return new Promise((xResolve) => {
    const { backdrop: xBackdrop, dialog: xDialog } = fsCreateMessageDialog(xMessage);
    const xInput = document.createElement("input");

    xInput.type = "text";
    xInput.className = `${TEXT_INPUT_CLASS} ${DIALOG_INPUT_CLASS}`;
    xInput.value = xDefault;
    xInput.setAttribute("aria-label", xMessage);

    const xChoose = (xIndex) => {
      xBackdrop.remove();
      xResolve(xIndex === OK_INDEX ? xInput.value : null);
    };

    xDialog.append(xInput, fsCreateDialogButtons(CANCEL_OK_LABELS, xChoose));
    xDialog.addEventListener("keydown", (xEvent) => {
      if (fsIsConfirmedEnter(xEvent)) {
        xEvent.preventDefault();
        xChoose(OK_INDEX);
      } else if (xEvent.key === KEY.escape) {
        xChoose(CANCEL_INDEX);
      }
    });

    fsOpen(xBackdrop, xInput);
    xInput.select();
  });
};

// 選択欄を1つ作り、「名前 [選択]」の行にする。options は [[値, 表示名], ...]。
const fsCreateLabeledSelect = (xLabelText, xOptions, xValue) => {
  const xLabel = document.createElement("label");
  const xSelect = document.createElement("select");

  fsFillSelect(xSelect, xOptions, xValue);
  xSelect.className = TEXT_INPUT_CLASS;
  xLabel.className = `${DIALOG_INPUT_CLASS} dialog-select`;
  xLabel.append(xLabelText, xSelect);
  return { label: xLabel, select: xSelect };
};

// 絵として置く文字と、大きさ・フォント・太さを入力する。キャンセルされたら null。
// choices: { sizes: [ドット...], fonts: [[値, 表示名]...] }
// defaults: { size, font, bold }（前に選んだもの）
// 文字欄では Enter で改行し、⌘Enter / Ctrl+Enter で決定する。文字が空なら OK を押しても閉じない。
export const fsAskText = (xMessage, xChoices, xDefaults) => {
  return new Promise((xResolve) => {
    const { backdrop: xBackdrop, dialog: xDialog } = fsCreateMessageDialog(xMessage);
    const xInput = document.createElement("textarea");
    const xSizeOptions = xChoices.sizes.map((xValue) => [String(xValue), `${xValue} ドット`]);
    const xSize = fsCreateLabeledSelect("大きさ", xSizeOptions, String(xDefaults.size));
    const xFont = fsCreateLabeledSelect("フォント", xChoices.fonts, xDefaults.font);
    const xWeightValue = xDefaults.bold ? FONT_WEIGHT.bold : FONT_WEIGHT.normal;
    const xWeight = fsCreateLabeledSelect("太さ", FONT_WEIGHT_OPTIONS, xWeightValue);

    xInput.className = `${TEXT_INPUT_CLASS} ${DIALOG_INPUT_CLASS} dialog-textarea`;
    xInput.rows = 3;
    xInput.setAttribute("aria-label", xMessage);

    const xChoose = (xIndex) => {
      if (xIndex === OK_INDEX && !xInput.value.trim()) {
        xInput.focus();
        return;
      }

      xBackdrop.remove();

      if (xIndex !== OK_INDEX) {
        xResolve(null);
        return;
      }

      xResolve({
        text: xInput.value,
        size: Number(xSize.select.value),
        font: xFont.select.value,
        bold: xWeight.select.value === FONT_WEIGHT.bold
      });
    };

    xDialog.append(xInput, xFont.label, xSize.label, xWeight.label, fsCreateDialogButtons(CANCEL_OK_LABELS, xChoose));
    xDialog.addEventListener("keydown", (xEvent) => {
      if (fsIsConfirmedEnter(xEvent) && (xEvent.metaKey || xEvent.ctrlKey)) {
        xEvent.preventDefault();
        xChoose(OK_INDEX);
      } else if (xEvent.key === KEY.escape) {
        xChoose(CANCEL_INDEX);
      }
    });

    fsOpen(xBackdrop, xInput);
  });
};

// 見出しと「名前：値」の一覧を見せるだけのダイアログ。OK（Enter / Esc）で閉じる。
// rows: [[名前, 値], ...]。値が空なら「（未設定）」と出す。
export const fsShowFacts = (xTitle, xRows) => {
  return new Promise((xResolve) => {
    const { backdrop: xBackdrop, dialog: xDialog, message: xHeading } = fsCreateMessageDialog(xTitle);
    const xList = document.createElement("dl");

    xHeading.classList.add("dialog-title");
    xList.className = "dialog-facts";

    for (const [xName, xValue] of xRows) {
      const xTerm = document.createElement("dt");
      const xDetail = document.createElement("dd");
      xTerm.textContent = xName;
      xDetail.textContent = xValue || "（未設定）";
      xDetail.classList.toggle("is-empty", !xValue);
      xList.append(xTerm, xDetail);
    }

    const xClose = () => {
      xBackdrop.remove();
      xResolve();
    };

    const xButtons = fsCreateDialogButtons([DIALOG_LABELS.ok], xClose);
    xDialog.append(xList, xButtons);
    xDialog.addEventListener("keydown", (xEvent) => {
      if (xEvent.key === KEY.enter || xEvent.key === KEY.escape) {
        xEvent.preventDefault();
        xClose();
      }
    });

    fsOpen(xBackdrop, xButtons.lastElementChild);
  });
};
