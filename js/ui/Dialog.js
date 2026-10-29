// クラシックMac風のダイアログ。answer / ask 命令から使う。

const fsBuildDialog = (xMessage) => {
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
};

const fsBuildButtons = (xLabels, xOnChoose) => {
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
};

// 押されたボタンの文字を返す。
export const fsAnswer = (xMessage, xLabels = ["OK"]) => {
  return new Promise((xResolve) => {
    const { xBackdrop, xDialog } = fsBuildDialog(xMessage);

    const xChoose = (xIndex) => {
      xBackdrop.remove();
      xResolve(xLabels[xIndex]);
    };

    const xButtons = fsBuildButtons(xLabels, xChoose);
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
};

// 入力された文字を返す。キャンセルされたら null。
export const fsAsk = (xMessage, xDefault = "") => {
  return new Promise((xResolve) => {
    const { xBackdrop, xDialog } = fsBuildDialog(xMessage);
    const xInput = document.createElement("input");

    xInput.type = "text";
    xInput.className = "text-input dialog-input";
    xInput.value = xDefault;
    xInput.setAttribute("aria-label", xMessage);

    const xChoose = (xIndex) => {
      xBackdrop.remove();
      xResolve(xIndex === 1 ? xInput.value : null);
    };

    xDialog.append(xInput, fsBuildButtons(["キャンセル", "OK"], xChoose));
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
};

// 選択欄を1つ作り、「名前 [選択]」の行にする。options は [[値, 表示名], ...]。
const fsBuildSelect = (xLabelText, xOptions, xValue) => {
  const xLabel = document.createElement("label");
  const xSelect = document.createElement("select");

  for (const [xOptionValue, xOptionText] of xOptions) {
    xSelect.add(new Option(xOptionText, xOptionValue, false, xOptionValue === xValue));
  }

  xSelect.className = "text-input";
  xLabel.className = "dialog-input dialog-select";
  xLabel.append(xLabelText, xSelect);
  return { xLabel, xSelect };
};

// 絵として置く文字と、大きさ・フォント・太さを入力する。キャンセルされたら null。
// choices: { sizes: [ドット...], fonts: [[値, 表示名]...] }
// defaults: { size, font, bold }（前に選んだもの）
// 文字欄では Enter で改行し、⌘Enter / Ctrl+Enter で決定する。
export const fsAskText = (xMessage, xChoices, xDefaults) => {
  return new Promise((xResolve) => {
    const { xBackdrop, xDialog } = fsBuildDialog(xMessage);
    const xInput = document.createElement("textarea");
    const xSize = fsBuildSelect("大きさ", xChoices.sizes.map((xValue) => [String(xValue), `${xValue} ドット`]),
      String(xDefaults.size));
    const xFont = fsBuildSelect("フォント", xChoices.fonts, xDefaults.font);
    const xWeight = fsBuildSelect("太さ", [["normal", "標準"], ["bold", "太字"]], xDefaults.bold ? "bold" : "normal");

    xInput.className = "text-input dialog-input dialog-textarea";
    xInput.rows = 3;
    xInput.setAttribute("aria-label", xMessage);

    const xChoose = (xIndex) => {
      if (xIndex === 1 && !xInput.value.trim()) {
        xInput.focus();
        return;
      }

      xBackdrop.remove();
      xResolve(xIndex === 1
        ? {
          text: xInput.value,
          size: Number(xSize.xSelect.value),
          font: xFont.xSelect.value,
          bold: xWeight.xSelect.value === "bold"
        }
        : null);
    };

    xDialog.append(xInput, xFont.xLabel, xSize.xLabel, xWeight.xLabel,
      fsBuildButtons(["キャンセル", "OK"], xChoose));
    xDialog.addEventListener("keydown", (xEvent) => {
      if (xEvent.key === "Enter" && (xEvent.metaKey || xEvent.ctrlKey) && !xEvent.isComposing) {
        xEvent.preventDefault();
        xChoose(1);
      } else if (xEvent.key === "Escape") {
        xChoose(0);
      }
    });

    document.body.append(xBackdrop);
    xInput.focus();
  });
};

// 見出しと「名前：値」の一覧を見せるだけのダイアログ。OK（Enter / Esc）で閉じる。
// rows: [[名前, 値], ...]。値が空なら「（未設定）」と出す。
export const fsShowFacts = (xTitle, xRows) => {
  return new Promise((xResolve) => {
    const { xBackdrop, xDialog } = fsBuildDialog(xTitle);
    const xList = document.createElement("dl");

    xDialog.querySelector(".dialog-message").classList.add("dialog-title");
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

    const xButtons = fsBuildButtons(["OK"], xClose);
    xDialog.append(xList, xButtons);
    xDialog.addEventListener("keydown", (xEvent) => {
      if (xEvent.key === "Enter" || xEvent.key === "Escape") {
        xEvent.preventDefault();
        xClose();
      }
    });

    document.body.append(xBackdrop);
    xButtons.lastElementChild.focus();
  });
};
