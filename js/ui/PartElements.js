/*
 * カードに並べる部品（ボタン・フィールド・テキストパーツ）の画面の要素を作る。
 * 閲覧用の要素（押せる・入力できる）と、編集用の要素（掴んで動かす枠）の2通りがある。
 * 見た目は css/app.css のクラスで決める。
 */
import { NEW_PART_KIND } from "../model/StackFormat.js";

const PART_TYPE = { button: NEW_PART_KIND.button, field: NEW_PART_KIND.field };

const CLASS_NAME = {
  part: "part",
  editPart: "is-edit",
  selected: "is-selected",
  hiddenPart: "is-hidden-part",
  label: "part-label",
  handle: "part-handle",
  // 文字を固定し、スクリプトも無効なテキストパーツ（押しても反応しない）。
  unclickable: "is-unclickable",
  noScrollbar: "is-no-scrollbar",
  // ラベルが空のボタン（絵の上に置く透明なボタン）。
  unlabeled: "is-unlabeled",
  // 編集していない層の部品（見えるだけで触れない）。
  otherLayer: "is-other-layer"
};

const fsPartClassName = (xPart) => {
  return `${CLASS_NAME.part} part-${xPart.type} style-${xPart.style}`;
};

// 部品の位置・大きさ・文字の見た目を要素に当てる。部品を動かしている間も呼ぶ。
export const fsPlacePartElement = (xElement, xPart) => {
  xElement.style.left = `${xPart.left}px`;
  xElement.style.top = `${xPart.top}px`;
  xElement.style.width = `${xPart.width}px`;
  xElement.style.height = `${xPart.height}px`;
  xElement.style.fontSize = `${xPart.textSize}px`;

  if (xPart.type === PART_TYPE.field) {
    xElement.style.textAlign = xPart.textAlign;
  }
};

const fsCreateButtonElement = (xPart, xActions) => {
  const xElement = document.createElement("button");
  xElement.type = "button";
  xElement.textContent = xPart.label;
  xElement.setAttribute("aria-label", xPart.label || xPart.name);
  xElement.addEventListener("click", () => xActions.onPress());
  return xElement;
};

const fsCreateFieldElement = (xPart, xFieldText, xActions) => {
  const xElement = document.createElement("textarea");
  xElement.value = xFieldText;
  xElement.readOnly = xPart.lockText;
  xElement.setAttribute("aria-label", xPart.name);
  xElement.addEventListener("input", () => xActions.onInput(xElement.value));

  // 文字を固定したフィールド（テキストパーツ）は、スクリプト有効ならボタンと同じく押すとスクリプトが動く。
  // スクリプト無効なら、押しても選ばず（枠線も出さず）、カードを押したことにする。スクロールはできる。
  if (xPart.lockText && xPart.clickable) {
    xElement.addEventListener("click", () => xActions.onPress());
  } else if (xPart.lockText) {
    xElement.tabIndex = -1;
    xElement.addEventListener("mousedown", (xEvent) => xEvent.preventDefault());
    xElement.addEventListener("focus", () => xElement.blur());
    xElement.addEventListener("click", () => xActions.onCardPress());
  }

  return xElement;
};

// 閲覧用の部品。
// options: { fieldText, inactive, actions: { onPress(), onInput(text), onCardPress() } }
// inactive なら、見えるだけで触れない部品にする（ほかの層を編集しているときなど）。
export const fsCreatePartElement = (xPart, { fieldText: xFieldText, inactive: xInactive, actions: xActions }) => {
  const xElement = xPart.type === PART_TYPE.button
    ? fsCreateButtonElement(xPart, xActions)
    : fsCreateFieldElement(xPart, xFieldText, xActions);
  const xIsField = xPart.type === PART_TYPE.field;

  xElement.className = fsPartClassName(xPart);
  xElement.classList.toggle(CLASS_NAME.unclickable, xIsField && xPart.lockText && !xPart.clickable);
  xElement.classList.toggle(CLASS_NAME.noScrollbar, xIsField && !xPart.scrollbar);
  xElement.classList.toggle(CLASS_NAME.unlabeled, xPart.type === PART_TYPE.button && !xPart.label);
  xElement.dataset.id = xPart.id;
  fsPlacePartElement(xElement, xPart);

  if (xInactive) {
    xElement.inert = true;
    xElement.classList.add(CLASS_NAME.otherLayer);
  }

  return xElement;
};

// 編集用の部品。中身の代わりに名前（または中身の文字）を見せ、右下に大きさを変える四角を付ける。
// 操作（選ぶ・動かす）は呼び出し側が element に付ける。handle は大きさを変える四角。
export const fsCreateEditPartElement = (xPart, { fieldText: xFieldText, selected: xSelected }) => {
  const xElement = document.createElement("div");
  const xLabel = document.createElement("span");
  const xHandle = document.createElement("div");

  xElement.className = `${fsPartClassName(xPart)} ${CLASS_NAME.editPart}`;
  xElement.classList.toggle(CLASS_NAME.hiddenPart, !xPart.visible);
  xElement.classList.toggle(CLASS_NAME.selected, xSelected);
  xElement.dataset.id = xPart.id;
  xLabel.className = CLASS_NAME.label;
  xLabel.textContent = xPart.type === PART_TYPE.button
    ? xPart.label || xPart.name
    : xFieldText || xPart.name;
  xHandle.className = CLASS_NAME.handle;
  xHandle.setAttribute("aria-hidden", "true");
  xElement.append(xLabel, xHandle);
  fsPlacePartElement(xElement, xPart);

  return { element: xElement, handle: xHandle };
};

// 選んでいる部品の印を付け替える。
export const fsMarkSelectedPart = (xContainer, xPartId) => {
  for (const xElement of xContainer.querySelectorAll(`.${CLASS_NAME.part}`)) {
    xElement.classList.toggle(CLASS_NAME.selected, xElement.dataset.id === xPartId);
  }
};
