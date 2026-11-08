/*
 * スクリプトの値の扱い。HyperTalk と同じく、値は文字・数・真偽値のどれでも、使う場面に合わせて読み替える。
 */
import { ScriptError } from "./ScriptError.js";
import { CHUNK_UNIT } from "./ScriptVocabulary.js";

// 小数を文字にするときの桁数。0.1 + 0.2 が 0.30000000000000004 と出ないよう、ここで丸める。
const DECIMAL_PLACES = 6;

// 全角の数字・記号。スマホでは全角で入力されることが多いので、数として読むときに半角にする。
const FULL_WIDTH_NUMBER_CHARACTERS = /[０-９．－＋]/g;
// 全角の文字コードから半角の文字コードを得るための差。
const FULL_WIDTH_OFFSET = 0xfee0;

const fsToHalfWidthDigits = (xText) => {
  return xText.replace(FULL_WIDTH_NUMBER_CHARACTERS, (xCharacter) =>
    String.fromCharCode(xCharacter.charCodeAt(0) - FULL_WIDTH_OFFSET)
  );
};

const fsNumberToText = (xNumber) => {
  if (Number.isInteger(xNumber)) {
    return String(xNumber);
  }

  if (Number.isNaN(xNumber)) {
    return "NAN";
  }

  if (!Number.isFinite(xNumber)) {
    return xNumber > 0 ? "INF" : "-INF";
  }

  return String(Number.parseFloat(xNumber.toFixed(DECIMAL_PLACES)));
};

export const fsToText = (xValue) => {
  if (typeof xValue === "number") {
    return fsNumberToText(xValue);
  }

  if (typeof xValue === "boolean") {
    return xValue ? "true" : "false";
  }

  return String(xValue ?? "");
};

export const fsIsNumeric = (xValue) => {
  if (typeof xValue === "number") {
    return true;
  }

  if (typeof xValue !== "string") {
    return false;
  }

  const xText = fsToHalfWidthDigits(xValue.trim());
  return xText !== "" && !Number.isNaN(Number(xText));
};

// 数として読む。空の文字は 0（HyperTalk と同じ）。数として読めなければ ScriptError。
export const fsToNumber = (xValue) => {
  if (typeof xValue === "number") {
    return xValue;
  }

  const xText = fsToHalfWidthDigits(fsToText(xValue).trim());

  if (xText === "") {
    return 0;
  }

  const xNumber = Number(xText);

  if (Number.isNaN(xNumber) || typeof xValue === "boolean") {
    throw new ScriptError(`「${fsToText(xValue)}」は数値ではありません。`);
  }

  return xNumber;
};

// 真偽値として読む。true / false（大文字・小文字は問わない）以外は ScriptError。
export const fsToBoolean = (xValue) => {
  if (typeof xValue === "boolean") {
    return xValue;
  }

  const xText = fsToText(xValue).trim().toLowerCase();

  if (xText === "true") {
    return true;
  }

  if (xText === "false") {
    return false;
  }

  throw new ScriptError(`「${fsToText(xValue)}」は true でも false でもありません。`);
};

// どちらも数として読めれば数として、そうでなければ大文字・小文字を区別しない文字として比べる。
export const fsEquals = (xLeft, xRight) => {
  if (fsIsNumeric(xLeft) && fsIsNumeric(xRight)) {
    return fsToNumber(xLeft) === fsToNumber(xRight);
  }

  return fsToText(xLeft).toLowerCase() === fsToText(xRight).toLowerCase();
};

// 大小を比べる。負なら left が小さい、0 なら等しい、正なら left が大きい。
export const fsCompare = (xLeft, xRight) => {
  if (fsIsNumeric(xLeft) && fsIsNumeric(xRight)) {
    return fsToNumber(xLeft) - fsToNumber(xRight);
  }

  return fsToText(xLeft).toLowerCase().localeCompare(fsToText(xRight).toLowerCase());
};

// 大文字・小文字を区別せず、text が part を含むか。
export const fsContainsText = (xText, xPart) => {
  return fsToText(xText).toLowerCase().includes(fsToText(xPart).toLowerCase());
};

// ---- チャンク ----

// チャンクをつなぎ直すときの区切り。
const CHUNK_JOINERS = {
  [CHUNK_UNIT.character]: "",
  [CHUNK_UNIT.word]: " ",
  [CHUNK_UNIT.line]: "\n",
  [CHUNK_UNIT.item]: ","
};

const WORD_SEPARATOR = /\s+/;

// 文字をチャンクの単位で分ける。文字は書記素ではなくコードポイントで数える（絵文字1つは1文字）。
export const fsSplitChunks = (xText, xUnit) => {
  switch (xUnit) {
    case CHUNK_UNIT.character:
      return [...xText];
    case CHUNK_UNIT.word:
      return xText.split(WORD_SEPARATOR).filter((xWord) => xWord !== "");
    case CHUNK_UNIT.line:
      return xText === "" ? [] : xText.split(CHUNK_JOINERS[CHUNK_UNIT.line]);
    default:
      return xText === "" ? [] : xText.split(CHUNK_JOINERS[CHUNK_UNIT.item]);
  }
};

// from 番目から to 番目まで（1から数える）を取り出す。範囲が正しくなければ空の文字。
export const fsExtractChunk = (xText, xUnit, xFrom, xTo) => {
  if (xFrom < 1 || xTo < xFrom) {
    return "";
  }

  return fsSplitChunks(xText, xUnit).slice(xFrom - 1, xTo).join(CHUNK_JOINERS[xUnit]);
};
