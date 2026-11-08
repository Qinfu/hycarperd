/*
 * オブジェクトのプロパティ（the name of me、set the visible of button 1 to false など）の読み書き。
 * オブジェクトの種類ごとに「プロパティ名（小文字）→ 読み方・書き方」の表を持つ。表にない組み合わせは ScriptError。
 */
import { MIN_PART_SIZE, TEXT_ALIGNS } from "../model/StackFormat.js";
import { fsClampTextSize, fsFieldText, fsSetFieldText } from "../model/StackModel.js";
import { ScriptError } from "./ScriptError.js";
import { OBJECT_KIND, PART_LAYER } from "./ScriptNodes.js";
import { fsToBoolean, fsToNumber, fsToText } from "./ScriptValues.js";

// 部品のデータの項目をそのまま読み書きするプロパティ。値の読み替え方ごとにまとめる。
const fsPartField = (xFieldName, xConvert) => ({
  get: (xObject) => xObject.part[xFieldName],
  set: (xObject, xValue) => {
    xObject.part[xFieldName] = xConvert(xValue);
  }
});

const fsReadOnlyPartField = (xFieldName) => ({
  get: (xObject) => xObject.part[xFieldName]
});

const fsRoundedNumber = (xValue) => Math.round(fsToNumber(xValue));

// 幅・高さは、指で掴めないほど小さくならないようにする。
const fsPartLength = (xValue) => Math.max(MIN_PART_SIZE, fsRoundedNumber(xValue));

const fsSoundName = (xValue) => fsToText(xValue).trim().toLowerCase();

const fsTextAlign = (xValue) => {
  const xAlign = fsToText(xValue).trim().toLowerCase();

  if (!TEXT_ALIGNS.includes(xAlign)) {
    throw new ScriptError(`textAlign は left / center / right のどれかです（「${fsToText(xValue)}」）。`);
  }

  return xAlign;
};

const PART_PROPERTIES = {
  name: fsPartField("name", fsToText),
  label: fsPartField("label", fsToText),
  // フィールドの文字。背景のフィールドは、カードごとの文字を読み書きする。
  text: {
    get: (xObject) => fsFieldText(xObject.part, xObject.card, xObject.isBackground),
    set: (xObject, xValue) => fsSetFieldText(xObject.part, xObject.card, xObject.isBackground, fsToText(xValue))
  },
  sharedtext: fsPartField("sharedText", fsToBoolean),
  visible: fsPartField("visible", fsToBoolean),
  locktext: fsPartField("lockText", fsToBoolean),
  clickable: fsPartField("clickable", fsToBoolean),
  style: fsReadOnlyPartField("style"),
  textsize: fsPartField("textSize", (xValue) => fsClampTextSize(fsToNumber(xValue))),
  textalign: fsPartField("textAlign", fsTextAlign),
  scrollbar: fsPartField("scrollbar", fsToBoolean),
  sound: fsPartField("sound", fsSoundName),
  left: fsPartField("left", fsRoundedNumber),
  top: fsPartField("top", fsRoundedNumber),
  width: fsPartField("width", fsPartLength),
  height: fsPartField("height", fsPartLength),
  id: fsReadOnlyPartField("id"),
  // 同じ層・同じ種類の部品の中での番号（重なり順）。
  number: {
    get: (xObject, xResolver) => {
      const xLayer = xObject.isBackground ? PART_LAYER.background : PART_LAYER.card;
      return xResolver.partsOf(xLayer, xObject.part.type).indexOf(xObject.part) + 1;
    }
  },
  script: fsReadOnlyPartField("script")
};

const CARD_PROPERTIES = {
  name: {
    get: (xObject) => xObject.card.name,
    set: (xObject, xValue) => {
      xObject.card.name = fsToText(xValue);
    }
  },
  number: { get: (xObject, xResolver) => xResolver.stack().cards.indexOf(xObject.card) + 1 },
  id: { get: (xObject) => xObject.card.id },
  script: { get: (xObject) => xObject.card.script }
};

const BACKGROUND_PROPERTIES = {
  name: {
    get: (xObject) => xObject.background.name,
    set: (xObject, xValue) => {
      xObject.background.name = fsToText(xValue);
    }
  },
  id: { get: (xObject) => xObject.background.id },
  script: { get: (xObject) => xObject.background.script }
};

const STACK_PROPERTIES = {
  name: {
    get: (xObject, xResolver) => xResolver.stack().stack.name,
    set: (xObject, xValue, xResolver) => {
      xResolver.stack().stack.name = fsToText(xValue);
    }
  },
  script: { get: (xObject, xResolver) => xResolver.stack().stack.script }
};

const PROPERTIES_BY_KIND = {
  [OBJECT_KIND.part]: PART_PROPERTIES,
  [OBJECT_KIND.card]: CARD_PROPERTIES,
  [OBJECT_KIND.background]: BACKGROUND_PROPERTIES,
  [OBJECT_KIND.stack]: STACK_PROPERTIES
};

const fsPropertyOf = (xObject, xPropertyName) => {
  const xTable = PROPERTIES_BY_KIND[xObject.kind];
  return xTable && Object.hasOwn(xTable, xPropertyName) ? xTable[xPropertyName] : null;
};

// resolver は ObjectResolver（番号を数えるのと、エラーに出す呼び名に使う）。
export const fsGetProperty = (xObject, xPropertyName, xResolver) => {
  const xProperty = fsPropertyOf(xObject, xPropertyName);

  if (!xProperty) {
    throw new ScriptError(`${xResolver.describe(xObject)}に「${xPropertyName}」はありません。`);
  }

  return xProperty.get(xObject, xResolver);
};

export const fsSetProperty = (xObject, xPropertyName, xValue, xResolver) => {
  const xProperty = fsPropertyOf(xObject, xPropertyName);

  if (!xProperty?.set) {
    throw new ScriptError(`${xResolver.describe(xObject)}の「${xPropertyName}」は変更できません。`);
  }

  xProperty.set(xObject, xValue, xResolver);
};
