// クラシックMac風のダイアログ。answer / ask 命令から使う。

function xBuildDialog(xMessage) {
  const xBackdrop = document.createElement("div");
  const xDialog = document.createElement("div");
  const xText = document.createElement("p");

  xBackdrop.className = "dialog-backdrop";
  xDialog.className = "dialog";
  xDialog.setAttribute("role", "alertdialog");
  xDialog.setAttribute("aria-modal", "true");
  xText.className = "dialog-message";
  xText.textContent = xMessage;
  xDialog.append(xText);
  xBackdrop.append(xDialog);

  return { xBackdrop, xDialog };
}

function xBuildButtons(xLabels, xOnChoose) {
  const xRow = document.createElement("div");
  xRow.className = "dialog-buttons";

  xLabels.forEach((xLabel, xIndex) => {
    const xButton = document.createElement("button");
    xButton.type = "button";
    xButton.textContent = xLabel;

    // 最後のボタンを既定のボタン（太枠）にする。
    if (xIndex === xLabels.length - 1) {
      xButton.classList.add("is-default");
    }

    xButton.addEventListener("click", () => xOnChoose(xIndex));
    xRow.append(xButton);
  });

  return xRow;
}

// 押されたボタンの文字を返す。
export function xAnswer(xMessage, xLabels = ["OK"]) {
  return new Promise((xResolve) => {
    const { xBackdrop, xDialog } = xBuildDialog(xMessage);

    const xChoose = (xIndex) => {
      xBackdrop.remove();
      xResolve(xLabels[xIndex]);
    };

    const xButtons = xBuildButtons(xLabels, xChoose);
    xDialog.append(xButtons);
    xDialog.addEventListener("keydown", (xEvent) => {
      if (xEvent.key === "Enter") {
        xEvent.preventDefault();
        xChoose(xLabels.length - 1);
      }
    });

    document.body.append(xBackdrop);
    xButtons.lastElementChild.focus();
  });
}

// 入力された文字を返す。キャンセルされたら null。
export function xAsk(xMessage, xDefault = "") {
  return new Promise((xResolve) => {
    const { xBackdrop, xDialog } = xBuildDialog(xMessage);
    const xInput = document.createElement("input");

    xInput.type = "text";
    xInput.className = "text-input dialog-input";
    xInput.value = xDefault;
    xInput.setAttribute("aria-label", xMessage);

    const xChoose = (xIndex) => {
      xBackdrop.remove();
      xResolve(xIndex === 1 ? xInput.value : null);
    };

    xDialog.append(xInput, xBuildButtons(["キャンセル", "OK"], xChoose));
    xDialog.addEventListener("keydown", (xEvent) => {
      if (xEvent.key === "Enter" && !xEvent.isComposing) {
        xEvent.preventDefault();
        xChoose(1);
      } else if (xEvent.key === "Escape") {
        xChoose(0);
      }
    });

    document.body.append(xBackdrop);
    xInput.focus();
    xInput.select();
  });
}
