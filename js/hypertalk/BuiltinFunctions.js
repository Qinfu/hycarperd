/*
 * 組み込み関数（random(6)、max(1, 5) など）。引数は評価済みの値の配列で受け取る。
 * 名前は小文字で持つ（スクリプトは大文字・小文字を区別しない）。
 */
import { fsToNumber, fsToText } from "./ScriptValues.js";

const ITEM_SEPARATOR = ",";

// 引数がひとつで「,」を含む場合は、項目の並びとして扱う（max(field 1) で、フィールドの「3,5,1」を比べられるように）。
const fsNumberList = (xArgs) => {
  const xValues = xArgs.length === 1 ? fsToText(xArgs[0]).split(ITEM_SEPARATOR) : xArgs;
  return xValues.map(fsToNumber);
};

const fsSum = (xNumbers) => {
  return xNumbers.reduce((xTotal, xNumber) => xTotal + xNumber, 0);
};

// 1 から max までの整数をひとつ選ぶ。max が 1 より小さければ 1。
const fsRandom = ([xMax]) => {
  const xUpperBound = Math.max(1, Math.trunc(fsToNumber(xMax)));
  return Math.floor(Math.random() * xUpperBound) + 1;
};

// 大文字・小文字を区別せずに探し、見つかった位置（1から数える）を返す。なければ 0。
const fsOffset = ([xNeedle, xHaystack]) => {
  return fsToText(xHaystack).toLowerCase().indexOf(fsToText(xNeedle).toLowerCase()) + 1;
};

const fsAverage = (xArgs) => {
  const xNumbers = fsNumberList(xArgs);
  return fsSum(xNumbers) / xNumbers.length;
};

const BUILTIN_FUNCTIONS = {
  random: fsRandom,
  abs: ([xValue]) => Math.abs(fsToNumber(xValue)),
  round: ([xValue]) => Math.round(fsToNumber(xValue)),
  trunc: ([xValue]) => Math.trunc(fsToNumber(xValue)),
  sqrt: ([xValue]) => Math.sqrt(fsToNumber(xValue)),
  // 文字数は書記素ではなくコードポイントで数える（チャンクの char と同じ）。
  length: ([xValue]) => [...fsToText(xValue)].length,
  max: (xArgs) => Math.max(...fsNumberList(xArgs)),
  min: (xArgs) => Math.min(...fsNumberList(xArgs)),
  sum: (xArgs) => fsSum(fsNumberList(xArgs)),
  average: fsAverage,
  offset: fsOffset,
  chartonum: ([xValue]) => fsToText(xValue).codePointAt(0) ?? 0,
  numtochar: ([xValue]) => String.fromCodePoint(fsToNumber(xValue))
};

export const fsHasBuiltinFunction = (xName) => {
  return Object.hasOwn(BUILTIN_FUNCTIONS, xName);
};

export const fsCallBuiltinFunction = (xName, xArgs) => {
  return BUILTIN_FUNCTIONS[xName](xArgs);
};
