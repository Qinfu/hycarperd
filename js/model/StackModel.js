/*
 * スタック・背景・カード・部品のデータを作る処理と、データを調べる処理。
 * データの形は js/model/StackFormat.js の定数に従う。画面や保存の処理はここに入れない。
 */
import {
  DEFAULT_BACKGROUND_NAME,
  DEFAULT_BEEP_SOUND,
  DEFAULT_CARD_SIZE,
  DEFAULT_PART_TEXT_SIZE,
  DEFAULT_STACK_EFFECT,
  DEFAULT_TEXT_ALIGN,
  FIRST_CARD_NAME,
  STACK_LOCK_ON,
  NEW_PART_KIND,
  NEW_PART_PLACEMENT,
  PART_DEFAULTS,
  PART_TEXT_SIZE_RANGE,
  STACK_FORMAT_VERSION,
  STACK_TYPE,
  TEXT_PART_DEFAULTS
} from "./StackFormat.js";

// ID に付ける乱数の桁数（36進数）。作った時刻と組み合わせるので、この桁数で十分に重ならない。
const ID_RANDOM_LENGTH = 6;
const ID_RADIX = 36;

// 「button-lq3x…-a8f2k1」のような、種類の分かる ID を作る。
export const fsCreateId = (xPrefix) => {
  const xRandomPart = Math.random().toString(ID_RADIX).slice(2, 2 + ID_RANDOM_LENGTH);
  return `${xPrefix}-${Date.now().toString(ID_RADIX)}-${xRandomPart}`;
};

// ---- 作る ----

export const fsCreateBackground = (xBackgroundId = fsCreateId("bg")) => {
  return {
    id: xBackgroundId,
    name: DEFAULT_BACKGROUND_NAME,
    content: "",
    picture: "",
    parts: [],
    script: ""
  };
};

export const fsCreateCard = (xBackgroundId, xCardName) => {
  return {
    id: fsCreateId("card"),
    name: xCardName,
    backgroundId: xBackgroundId,
    content: "",
    picture: "",
    parts: [],
    // 背景のフィールドに、このカードで入れた文字（背景の部品の id → 文字）。
    bgText: {},
    effect: "",
    script: ""
  };
};

export const fsCreateEmptyStack = (xStackName) => {
  const xBackgroundId = fsCreateId("bg");

  return {
    formatVersion: STACK_FORMAT_VERSION,
    type: STACK_TYPE,
    stack: {
      id: fsCreateId("stack"),
      name: xStackName,
      // 作者とスタックの版（どちらも自由な文字。ファイル形式の版 formatVersion とは別）
      author: "",
      version: "",
      width: DEFAULT_CARD_SIZE.width,
      height: DEFAULT_CARD_SIZE.height,
      effect: DEFAULT_STACK_EFFECT,
      beepSound: DEFAULT_BEEP_SOUND,
      script: ""
    },
    backgrounds: [fsCreateBackground(xBackgroundId)],
    cards: [fsCreateCard(xBackgroundId, FIRST_CARD_NAME)]
  };
};

// カードを丸ごと写したもの（部品・本文・絵・スクリプト・背景フィールドの中身・切り替え効果）。
// カードと部品の id は新しくする。背景フィールドの中身は背景の部品の id で持つので、そのまま写す。
export const fsDuplicateCard = (xCard, xCardName) => {
  const xCopy = structuredClone(xCard);
  xCopy.id = fsCreateId("card");
  xCopy.name = xCardName;
  xCopy.parts = xCopy.parts.map((xPart) => ({ ...xPart, id: fsCreateId(xPart.type) }));
  return xCopy;
};

// 同じ種類の部品と重ならない名前（「ボタン1」「ボタン2」…）。数えた個数の次の番号から空いている番号を探す。
const fsNextPartName = (xNamePrefix, xSameKindParts) => {
  let xNumber = xSameKindParts.length + 1;

  while (xSameKindParts.some((xPart) => xPart.name === `${xNamePrefix}${xNumber}`)) {
    xNumber += 1;
  }

  return `${xNamePrefix}${xNumber}`;
};

// 新しい部品の位置。既存の部品の数に応じて斜めにずらし、重なって見分けられなくなるのを防ぐ。
const fsNewPartPosition = (xDefaults, xExistingPartCount, xCardSize) => {
  const xShift = (xExistingPartCount % NEW_PART_PLACEMENT.cycle) * NEW_PART_PLACEMENT.step;
  const xCenteredLeft = Math.round((xCardSize.width - xDefaults.width) / 2);

  return {
    left: Math.max(0, xCenteredLeft - NEW_PART_PLACEMENT.leftShift + xShift),
    top: Math.max(0, Math.round(xCardSize.height / NEW_PART_PLACEMENT.topDivisor) + xShift)
  };
};

// xKind は NEW_PART_KIND のどれか。テキストパーツは文字を固定したフィールドとして作る。
// xOwner はカードまたは背景（どちらも parts を持つ）。
export const fsCreatePart = (xKind, xOwner, xCardSize) => {
  const xIsTextPart = xKind === NEW_PART_KIND.text;
  const xPartType = xIsTextPart ? NEW_PART_KIND.field : xKind;
  const xDefaults = xIsTextPart ? TEXT_PART_DEFAULTS : PART_DEFAULTS[xKind];
  const xSameKindParts = xOwner.parts.filter(
    (xPart) => xPart.type === xPartType && xPart.lockText === xIsTextPart
  );
  const xName = fsNextPartName(xDefaults.namePrefix, xSameKindParts);
  const xPosition = fsNewPartPosition(xDefaults, xOwner.parts.length, xCardSize);

  return {
    id: fsCreateId(xPartType),
    type: xPartType,
    // name はスクリプトから部品を探すときの名前（パーツID）、label はボタンに表示する文字。
    name: xName,
    label: xName,
    left: xPosition.left,
    top: xPosition.top,
    width: xDefaults.width,
    height: xDefaults.height,
    text: "",
    style: xDefaults.style,
    visible: true,
    lockText: xIsTextPart,
    // テキストパーツの「スクリプト有効」。オフなら閲覧中に押しても選ばれず（枠線も出ず）、スクリプトも動かない。
    clickable: true,
    textAlign: DEFAULT_TEXT_ALIGN,
    scrollbar: true,
    sharedText: false,
    textSize: DEFAULT_PART_TEXT_SIZE,
    sound: "",
    script: xDefaults.script
  };
};

// ---- 調べる ----

export const fsCardSize = (xStack) => {
  return { width: xStack.stack.width, height: xStack.stack.height };
};

// 手で書く項目なので、"on" 以外の値（"off"、空、文字でない値、項目なし）はすべてロックしていないものとする。
export const fsIsStackLocked = (xStack) => {
  const xLock = xStack.stack.lock;
  return typeof xLock === "string" && xLock.trim().toLowerCase() === STACK_LOCK_ON;
};

// カードが属する背景。今は1スタックに背景1つだが、データは複数持てる形にしてある。
export const fsBackgroundOf = (xStack, xCard) => {
  const xOwnBackground = xStack.backgrounds.find((xBackground) => xBackground.id === xCard.backgroundId);
  return xOwnBackground ?? xStack.backgrounds[0];
};

// 文字の大きさを受け付ける範囲に収める。数でなければ既定の大きさ。
export const fsClampTextSize = (xValue) => {
  if (!Number.isFinite(xValue)) {
    return DEFAULT_PART_TEXT_SIZE;
  }

  return Math.min(Math.max(PART_TEXT_SIZE_RANGE.min, Math.round(xValue)), PART_TEXT_SIZE_RANGE.max);
};

// ---- フィールドの文字 ----
// 背景のフィールドは、置き場所は全カード共通で、中身はカードごとに持つ（sharedText のときは共通）。

const fsKeepsTextPerCard = (xPart, xIsBackground) => {
  return xIsBackground && xPart.type === NEW_PART_KIND.field && !xPart.sharedText;
};

export const fsFieldText = (xPart, xCard, xIsBackground) => {
  if (fsKeepsTextPerCard(xPart, xIsBackground)) {
    return xCard.bgText[xPart.id] ?? "";
  }

  return xPart.text;
};

export const fsSetFieldText = (xPart, xCard, xIsBackground, xText) => {
  if (fsKeepsTextPerCard(xPart, xIsBackground)) {
    xCard.bgText[xPart.id] = xText;
  } else {
    xPart.text = xText;
  }
};
