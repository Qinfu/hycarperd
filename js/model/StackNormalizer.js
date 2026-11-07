/*
 * 読み込んだスタックのデータを検査し、古い形式や項目の抜けたデータを今の形にそろえる。
 * 検査に通らないデータは StackDataError にする（画面にはそのメッセージを出す）。
 */
import {
  CARD_EFFECTS,
  CARD_SIZE_RANGE,
  DEFAULT_BACKGROUND_NAME,
  DEFAULT_BEEP_SOUND,
  DEFAULT_STACK_EFFECT,
  DEFAULT_TEXT_ALIGN,
  LEGACY_CARD_SIZE,
  MAX_CARDS,
  MIN_PART_SIZE,
  PART_DEFAULTS,
  PICTURE_PREFIX,
  STACK_TYPE,
  TEXT_ALIGNS
} from "./StackFormat.js";
import { fsClampTextSize, fsCreateBackground, fsCreateId } from "./StackModel.js";

// スタックのデータとして読めないことを表す。message はそのまま画面に出せる文にする。
export class StackDataError extends Error {
  constructor(xMessage) {
    super(xMessage);
    this.name = "StackDataError";
  }
}

// ---- 値をそろえる ----

const fsTextOr = (xValue, xFallback = "") => {
  return typeof xValue === "string" ? xValue : xFallback;
};

const fsRoundedNumberOr = (xValue, xFallback) => {
  return Number.isFinite(xValue) ? Math.round(xValue) : xFallback;
};

const fsClamp = (xValue, xMin, xMax) => {
  return Math.min(Math.max(xMin, xValue), xMax);
};

// 絵は PNG のデータURLだけを受け付ける（ほかの形式は描画の処理で扱えないため、空にする）。
const fsPictureOr = (xValue) => {
  return typeof xValue === "string" && xValue.startsWith(PICTURE_PREFIX) ? xValue : "";
};

const fsCardLengthOr = (xValue, xFallback) => {
  if (!Number.isFinite(xValue)) {
    return xFallback;
  }

  return fsClamp(Math.round(xValue), CARD_SIZE_RANGE.min, CARD_SIZE_RANGE.max);
};

const fsChoiceOr = (xValue, xChoices, xFallback) => {
  return xChoices.includes(xValue) ? xValue : xFallback;
};

// ---- 形の検査 ----

const fsCheckCardShape = (xCard) => {
  if (!xCard || typeof xCard.id !== "string" || typeof xCard.name !== "string") {
    throw new StackDataError("カードのデータが正しくありません。");
  }

  if (xCard.content !== undefined && typeof xCard.content !== "string") {
    throw new StackDataError("カード本文の形式が正しくありません。");
  }

  if (xCard.parts !== undefined && !Array.isArray(xCard.parts)) {
    throw new StackDataError("カード部品の形式が正しくありません。");
  }
};

// 欠けていると補えない項目だけを調べる（補える項目は正規化でそろえる）。
const fsCheckStackShape = (xData) => {
  if (!xData || typeof xData !== "object") {
    throw new StackDataError("JSONの形式が正しくありません。");
  }

  if (xData.type !== STACK_TYPE) {
    throw new StackDataError("HycarPerdのスタックではありません。");
  }

  if (!xData.stack || typeof xData.stack.name !== "string") {
    throw new StackDataError("スタック名がありません。");
  }

  if (!Array.isArray(xData.cards) || xData.cards.length === 0) {
    throw new StackDataError("カードが1枚もありません。");
  }

  if (xData.cards.length > MAX_CARDS) {
    throw new StackDataError(`カードは${MAX_CARDS}枚までです。`);
  }

  xData.cards.forEach(fsCheckCardShape);
};

// ---- 正規化 ----

const fsNormalizeStackInfo = (xInfo) => {
  xInfo.width = fsCardLengthOr(xInfo.width, LEGACY_CARD_SIZE.width);
  xInfo.height = fsCardLengthOr(xInfo.height, LEGACY_CARD_SIZE.height);
  xInfo.script = fsTextOr(xInfo.script);
  xInfo.author = fsTextOr(xInfo.author);
  xInfo.version = fsTextOr(xInfo.version);
  xInfo.effect = fsChoiceOr(xInfo.effect, CARD_EFFECTS, DEFAULT_STACK_EFFECT);
  xInfo.beepSound = fsTextOr(xInfo.beepSound).toLowerCase() || DEFAULT_BEEP_SOUND;
};

// 部品の大きさはカードに収め、位置は部品がカードからはみ出さない範囲に収める。
const fsNormalizePart = (xPart, xCardSize) => {
  const xDefaults = PART_DEFAULTS[xPart.type];
  const xWidth = fsClamp(fsRoundedNumberOr(xPart.width, xDefaults.width), MIN_PART_SIZE, xCardSize.width);
  const xHeight = fsClamp(fsRoundedNumberOr(xPart.height, xDefaults.height), MIN_PART_SIZE, xCardSize.height);
  const xName = fsTextOr(xPart.name, xDefaults.namePrefix);

  return {
    id: fsTextOr(xPart.id) || fsCreateId(xPart.type),
    type: xPart.type,
    name: xName,
    // ラベルを持たない古いスタックでは、これまでどおり名前を表示する。
    label: typeof xPart.label === "string" ? xPart.label : xName,
    left: fsClamp(fsRoundedNumberOr(xPart.left, 0), 0, xCardSize.width - xWidth),
    top: fsClamp(fsRoundedNumberOr(xPart.top, 0), 0, xCardSize.height - xHeight),
    width: xWidth,
    height: xHeight,
    text: fsTextOr(xPart.text),
    style: fsTextOr(xPart.style, xDefaults.style),
    visible: xPart.visible !== false,
    lockText: xPart.lockText === true,
    clickable: xPart.clickable !== false,
    textAlign: fsChoiceOr(xPart.textAlign, TEXT_ALIGNS, DEFAULT_TEXT_ALIGN),
    scrollbar: xPart.scrollbar !== false,
    sharedText: xPart.sharedText === true,
    textSize: fsClampTextSize(xPart.textSize),
    // ボタンを押したときの音（空なら鳴らさない）
    sound: fsTextOr(xPart.sound).toLowerCase(),
    script: fsTextOr(xPart.script)
  };
};

// 知らない種類の部品は捨てる（新しい版で増えた部品を、古い版で開いたときなど）。
const fsNormalizeParts = (xParts, xCardSize) => {
  if (!Array.isArray(xParts)) {
    return [];
  }

  return xParts
    .filter((xPart) => xPart && PART_DEFAULTS[xPart.type])
    .map((xPart) => fsNormalizePart(xPart, xCardSize));
};

const fsNormalizeBackground = (xBackground, xCardSize) => {
  return {
    id: fsTextOr(xBackground.id) || fsCreateId("bg"),
    name: fsTextOr(xBackground.name, DEFAULT_BACKGROUND_NAME),
    content: fsTextOr(xBackground.content),
    picture: fsPictureOr(xBackground.picture),
    parts: fsNormalizeParts(xBackground.parts, xCardSize),
    script: fsTextOr(xBackground.script)
  };
};

const fsNormalizeBackgrounds = (xBackgrounds, xCardSize) => {
  const xValidBackgrounds = Array.isArray(xBackgrounds)
    ? xBackgrounds.filter((xBackground) => xBackground && typeof xBackground === "object")
    : [];
  const xNormalized = xValidBackgrounds.map((xBackground) => fsNormalizeBackground(xBackground, xCardSize));

  // カードは必ずどれかの背景に属するので、背景が1つもなければ作る。
  if (xNormalized.length === 0) {
    xNormalized.push(fsCreateBackground());
  }

  return xNormalized;
};

// 背景のフィールドの中身（部品の id → 文字）は、文字のものだけを残す。
const fsNormalizeBackgroundTexts = (xBackgroundTexts) => {
  if (!xBackgroundTexts || typeof xBackgroundTexts !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(xBackgroundTexts).filter(([, xText]) => typeof xText === "string")
  );
};

const fsNormalizeCard = (xCard, xCardSize, xBackgroundIds, xFallbackBackgroundId) => {
  xCard.content = fsTextOr(xCard.content);
  xCard.picture = fsPictureOr(xCard.picture);
  xCard.script = fsTextOr(xCard.script);
  xCard.effect = fsChoiceOr(xCard.effect, CARD_EFFECTS, "");
  xCard.parts = fsNormalizeParts(xCard.parts, xCardSize);

  if (!xBackgroundIds.has(xCard.backgroundId)) {
    xCard.backgroundId = xFallbackBackgroundId;
  }

  xCard.bgText = fsNormalizeBackgroundTexts(xCard.bgText);
};

// 読み込んだデータを検査し、今の形にそろえて返す（渡したデータを書き換える）。
export const fsValidateStack = (xData) => {
  fsCheckStackShape(xData);
  fsNormalizeStackInfo(xData.stack);

  const xCardSize = { width: xData.stack.width, height: xData.stack.height };
  xData.backgrounds = fsNormalizeBackgrounds(xData.backgrounds, xCardSize);

  const xBackgroundIds = new Set(xData.backgrounds.map((xBackground) => xBackground.id));

  for (const xCard of xData.cards) {
    fsNormalizeCard(xCard, xCardSize, xBackgroundIds, xData.backgrounds[0].id);
  }

  return xData;
};
