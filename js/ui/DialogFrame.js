/*
 * クラシックMac風のモーダルダイアログの枠。answer / ask のダイアログ（Dialog.js）と設定の画面（Inspector.js）で使う。
 * 見た目は css/app.css の .dialog-* で決める。開いている間は .dialog-backdrop があるので、
 * キー操作（KeyboardShortcuts.js）はそれを見てカードの操作を止める。
 */

export const DIALOG_LABELS = { ok: "OK", cancel: "キャンセル" };

export const DIALOG_CLASS = {
  backdrop: "dialog-backdrop",
  dialog: "dialog",
  message: "dialog-message",
  buttons: "dialog-buttons",
  defaultButton: "is-default"
};

// 背景を暗くする板と、ダイアログの箱。role は "alertdialog"（知らせ・問いかけ）か "dialog"（設定の画面）。
export const fsCreateDialogFrame = (xClassName, xRole) => {
  const xBackdrop = document.createElement("div");
  const xDialog = document.createElement("div");

  xBackdrop.className = DIALOG_CLASS.backdrop;
  xDialog.className = xClassName;
  xDialog.setAttribute("role", xRole);
  xDialog.setAttribute("aria-modal", "true");
  xBackdrop.append(xDialog);
  return { backdrop: xBackdrop, dialog: xDialog };
};

// 文字を1つ見せるダイアログ（answer / ask など）。
export const fsCreateMessageDialog = (xMessage) => {
  const xFrame = fsCreateDialogFrame(DIALOG_CLASS.dialog, "alertdialog");
  const xText = document.createElement("p");

  xText.className = DIALOG_CLASS.message;
  xText.textContent = xMessage;
  xFrame.dialog.append(xText);
  return { ...xFrame, message: xText };
};

// ボタンの並び。最後のボタンを既定のボタン（太枠・Enter で押される）にする。押されたらその番号で onChoose を呼ぶ。
export const fsCreateDialogButtons = (xLabels, xOnChoose) => {
  const xRow = document.createElement("div");
  xRow.className = DIALOG_CLASS.buttons;

  xLabels.forEach((xLabel, xIndex) => {
    const xButton = document.createElement("button");
    xButton.type = "button";
    xButton.textContent = xLabel;

    if (xIndex === xLabels.length - 1) {
      xButton.classList.add(DIALOG_CLASS.defaultButton);
    }

    xButton.addEventListener("click", () => xOnChoose(xIndex));
    xRow.append(xButton);
  });

  return xRow;
};

// [[値, 表示名], ...] を select の選択肢にする。value と同じ値を選んでおく。
export const fsFillSelect = (xSelect, xOptions, xValue) => {
  for (const [xOptionValue, xOptionText] of xOptions) {
    xSelect.add(new Option(xOptionText, xOptionValue, false, xOptionValue === xValue));
  }
};
