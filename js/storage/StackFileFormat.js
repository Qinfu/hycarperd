/*
 * スタックのファイル（.stack.json）の名前と中身の決まり。
 * どこに保存するか・どこから読むかは、StackFiles.js と StackLoader.js が受け持つ。
 */
import { StackDataError, fsValidateStack } from "../model/StackNormalizer.js";

// 保存するファイルの名前の後ろに付ける文字。
export const STACK_FILE_SUFFIX = ".stack.json";
export const STACK_FILE_MIME_TYPE = "application/json";

// スタック名が空などで名前を作れないときのファイル名。
const FALLBACK_FILE_BASE_NAME = "stack";

// OSのファイル名に使えない文字。
const UNSAFE_FILE_NAME_CHARACTERS = /[\\/:*?"<>|]/g;
const UNSAFE_CHARACTER_REPLACEMENT = "_";

// 拡張子が .json かどうか（大文字・小文字は問わない）。
const JSON_EXTENSION = /\.json$/i;

// 書き出す JSON の字下げ（人が開いて読めるようにする）。
const JSON_INDENT = 2;

const fsSafeFileName = (xName) => {
  return String(xName ?? "").trim().replace(UNSAFE_FILE_NAME_CHARACTERS, UNSAFE_CHARACTER_REPLACEMENT);
};

export const fsHasJsonExtension = (xFileName) => {
  return JSON_EXTENSION.test(xFileName);
};

// スタック名から作る、既定のファイル名。
export const fsStackFileName = (xStackData) => {
  return `${fsSafeFileName(xStackData.stack.name) || FALLBACK_FILE_BASE_NAME}${STACK_FILE_SUFFIX}`;
};

// 入力されたファイル名を整える。空なら既定の名前、.json で終わらなければ .stack.json を付ける。
export const fsNormalizeFileName = (xFileName, xStackData) => {
  const xBaseName = fsSafeFileName(xFileName);

  if (!xBaseName) {
    return fsStackFileName(xStackData);
  }

  return fsHasJsonExtension(xBaseName) ? xBaseName : `${xBaseName}${STACK_FILE_SUFFIX}`;
};

export const fsStackBlob = (xStackData) => {
  return new Blob([JSON.stringify(xStackData, null, JSON_INDENT)], { type: STACK_FILE_MIME_TYPE });
};

export const fsStackFile = (xStackData, xFileName) => {
  return new File([fsStackBlob(xStackData)], xFileName, { type: STACK_FILE_MIME_TYPE });
};

// ファイルの中身（文字）をスタックとして読む。JSONでなければ StackDataError。
export const fsParseStackText = (xText) => {
  let xData;

  try {
    xData = JSON.parse(xText);
  } catch {
    throw new StackDataError("JSONとして読み込めません。");
  }

  return fsValidateStack(xData);
};
