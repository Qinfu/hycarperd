/*
 * index.html にある、アプリが使う画面の要素。id はここでだけ書く。
 */

const ELEMENT_IDS = {
  menuBar: "menubar",
  cardArea: "card-area",
  cardWindow: "card-window",
  cardStage: "card-stage",
  cardName: "card-name",
  messageBox: "message-box",
  statusNotice: "toast",
  paletteRoot: "paint-palette",
  stackFileInput: "stack-file",
  imageFileInput: "image-file"
};

// index.html を書き換えて要素がなくなったときに、どれが見つからないのかすぐ分かるようにする。
export const fsFindAppElements = () => {
  const xElements = {};

  for (const [xName, xId] of Object.entries(ELEMENT_IDS)) {
    const xElement = document.querySelector(`#${xId}`);

    if (!xElement) {
      throw new Error(`index.html に id="${xId}" の要素がありません。`);
    }

    xElements[xName] = xElement;
  }

  return xElements;
};
