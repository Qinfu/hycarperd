/*
 * スクリプトで使える語の表。語はすべて小文字で持つ（スクリプトは大文字・小文字を区別しない）。
 */
import { CARD_ORDINAL, PART_LAYER, REFERENCE_TYPE } from "./ScriptNodes.js";

// 名前で書ける定数とその値。
export const CONSTANT_VALUES = {
  empty: "",
  true: true,
  false: false,
  return: "\n",
  space: " ",
  tab: "\t",
  quote: "\"",
  comma: ","
};

// チャンクの単位（word 2 of x の word）。
export const CHUNK_UNIT = {
  character: "char",
  word: "word",
  line: "line",
  item: "item"
};

// チャンクの単位の書き方（単数）。
export const CHUNK_UNIT_WORDS = {
  char: CHUNK_UNIT.character,
  character: CHUNK_UNIT.character,
  word: CHUNK_UNIT.word,
  line: CHUNK_UNIT.line,
  item: CHUNK_UNIT.item
};

// the number of の後のチャンクの単位の書き方（複数）。
export const CHUNK_UNIT_PLURAL_WORDS = {
  chars: CHUNK_UNIT.character,
  characters: CHUNK_UNIT.character,
  words: CHUNK_UNIT.word,
  lines: CHUNK_UNIT.line,
  items: CHUNK_UNIT.item
};

// 部品の種類の書き方（単数）。
export const PART_TYPE_WORDS = {
  field: REFERENCE_TYPE.field,
  fld: REFERENCE_TYPE.field,
  button: REFERENCE_TYPE.button,
  btn: REFERENCE_TYPE.button
};

// the number of の後の部品の種類の書き方（複数）。
export const PART_TYPE_PLURAL_WORDS = {
  fields: REFERENCE_TYPE.field,
  flds: REFERENCE_TYPE.field,
  buttons: REFERENCE_TYPE.button,
  btns: REFERENCE_TYPE.button
};

export const CARD_WORDS = new Set(["card", "cd"]);
export const CARD_PLURAL_WORDS = ["cards", "cds"];
export const BACKGROUND_WORDS = new Set(["bg", "bkgnd", "background"]);
export const STACK_WORD = "stack";

// 部品の前の「card」「bg」から、どちらの層の部品かを決める。どちらでもなければ auto。
export const fsLayerOfWord = (xWord) => {
  if (CARD_WORDS.has(xWord)) {
    return PART_LAYER.card;
  }

  return BACKGROUND_WORDS.has(xWord) ? PART_LAYER.background : PART_LAYER.auto;
};

// カードの順番の書き方。
export const CARD_ORDINAL_WORDS = {
  next: CARD_ORDINAL.next,
  prev: CARD_ORDINAL.previous,
  previous: CARD_ORDINAL.previous,
  first: CARD_ORDINAL.first,
  last: CARD_ORDINAL.last
};

// 式の始まりには置けない語（if の then などの区切り）。
export const RESERVED_WORDS = new Set(["then", "else", "end"]);

// 文の頭に来ると「位置が正しくない」語。
export const MISPLACED_STATEMENT_WORDS = new Set(["end", "else", "then", "on", "function"]);

// 「the X of」のXのうち、オブジェクトのプロパティとして扱うもの（ほかは関数の呼び出しになる）。
export const PROPERTY_NAMES = new Set([
  "name", "label", "text", "visible", "locktext", "clickable", "sharedtext", "style", "textsize", "textalign",
  "scrollbar", "sound", "left", "top", "width", "height", "id", "number", "script"
]);

// 「the long date」などの形容詞。
export const THE_ADJECTIVES = ["short", "long", "abbreviated", "abbrev", "abbr"];
export const LONG_ADJECTIVE = "long";

// 「word」「line」などは変数名にも使えるため、後ろにこれらの語が続くときはチャンクとみなさない。
export const NOT_CHUNK_FOLLOWERS = new Set([
  "into", "after", "before", "then", "else", "and", "or", "is", "contains",
  "to", "of", "in", "with", "mod", "div", "from", "by"
]);

// put の書き込み先の位置の語。
export const PUT_PREPOSITION = { into: "into", after: "after", before: "before" };

// メッセージボックスの書き方（msg / message、後ろに box を付けてもよい）。
export const MESSAGE_BOX_WORDS = ["msg", "message"];

// wait の単位の書き方。何も書かなければ tick。
export const WAIT_UNIT = { second: "second", millisecond: "millisecond", tick: "tick" };
export const WAIT_UNIT_WORDS = {
  second: ["seconds", "second", "secs", "sec"],
  millisecond: ["milliseconds", "millisecond", "ms"],
  tick: ["ticks", "tick"]
};

// visual effect の効果と速さ。
export const VISUAL_EFFECT_NAMES = { dissolve: "dissolve", plain: "plain", wipe: "wipe" };
export const WIPE_DIRECTIONS = ["left", "right"];
export const EFFECT_SPEED = { normal: "normal", fast: "fast", slow: "slow" };
export const VERY_WORD = "very";

// exit to の後に書ける名前。
export const EXIT_TO_NAMES = ["hycarperd", "hypercard"];

// 比較演算子。記号の別の書き方は、同じ意味の演算子にそろえる。
export const COMPARISON_OPERATORS = ["=", "<>", "≠", "<", ">", "<=", ">=", "≤", "≥"];
export const OPERATOR_ALIASES = { "≠": "<>", "≤": "<=", "≥": ">=" };

// 単語で書く演算子。
export const WORD_OPERATOR = {
  and: "and",
  or: "or",
  not: "not",
  contains: "contains",
  isIn: "in",
  isNotIn: "notin",
  div: "div",
  mod: "mod"
};
