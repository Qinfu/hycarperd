/*
 * スタックをファイルに保存する・ファイルから開く。どの方法が使えるかは端末とブラウザによる。
 *   保存：OSの「名前を付けて保存」（PCのChrome・Edge） / 共有シート（スマホ） / ダウンロード（どこでも）
 *   開く：OSの「開く」（PCのChrome・Edge。前に開いたフォルダから始める） / input の type="file"（それ以外）
 * OSの画面と共有シートは、ブラウザが「人の操作から開いたもの」しか許さないので、
 * 押した操作の中から await より前に呼ぶこと。
 */
import { STACK_FILE_MIME_TYPE, fsParseStackText, fsStackBlob, fsStackFile, fsStackFileName } from "./StackFileFormat.js";

// OSのファイル選択で見せるファイルの種類。
const PICKER_FILE_TYPES = [{ description: "HycarPerdのスタック", accept: { [STACK_FILE_MIME_TYPE]: [".json"] } }];

// OSの「開く」画面にこの名前で前回のフォルダを覚えてもらう（startIn が使えないときの控え）。
const OPEN_PICKER_ID = "hycarperd-stack";

// ダウンロードのリンクを解放するまでの時間（ミリ秒）。Safariではすぐに解放するとダウンロードが失敗することがある。
const DOWNLOAD_URL_LIFETIME = 1000;

// ユーザーがOSの画面や共有シートを閉じたときのエラー名。失敗ではなくキャンセルとして扱う。
const USER_CANCEL_ERROR = "AbortError";

const fsIsUserCancel = (xError) => {
  return xError?.name === USER_CANCEL_ERROR;
};

// ---- 使えるかどうか ----

export const fsCanPickSaveFile = () => {
  return typeof window.showSaveFilePicker === "function";
};

export const fsCanPickOpenFile = () => {
  return typeof window.showOpenFilePicker === "function";
};

// 渡せるかどうかは名前と種類で決まるので、中身の無いファイルで確かめる。
export const fsCanShareStack = (xStackData) => {
  if (typeof navigator.canShare !== "function") {
    return false;
  }

  const xEmptyFile = new File([""], fsStackFileName(xStackData), { type: STACK_FILE_MIME_TYPE });
  return navigator.canShare({ files: [xEmptyFile] });
};

// ---- 保存 ----

// OSの「名前を付けて保存」で保存し、保存したファイル名を返す。キャンセルされたら null。
export const fsSaveStackWithPicker = async (xStackData) => {
  let xFileHandle;

  try {
    xFileHandle = await window.showSaveFilePicker({
      suggestedName: fsStackFileName(xStackData),
      types: PICKER_FILE_TYPES
    });
  } catch (xError) {
    if (fsIsUserCancel(xError)) {
      return null;
    }

    throw xError;
  }

  const xWritable = await xFileHandle.createWritable();
  await xWritable.write(fsStackBlob(xStackData));
  await xWritable.close();
  return xFileHandle.name;
};

// 共有シートに渡す。渡したら true、キャンセルされたら false。
export const fsShareStack = async (xStackData) => {
  try {
    await navigator.share({ files: [fsStackFile(xStackData, fsStackFileName(xStackData))] });
    return true;
  } catch (xError) {
    if (fsIsUserCancel(xError)) {
      return false;
    }

    throw xError;
  }
};

// ブラウザのダウンロード先に保存する。
export const fsDownloadStack = (xStackData, xFileName) => {
  const xUrl = URL.createObjectURL(fsStackBlob(xStackData));
  const xLink = document.createElement("a");

  xLink.href = xUrl;
  xLink.download = xFileName;
  document.body.append(xLink);
  xLink.click();
  xLink.remove();

  setTimeout(() => URL.revokeObjectURL(xUrl), DOWNLOAD_URL_LIFETIME);
};

// ---- 開く ----

const fsShowOpenPicker = (xStartFileHandle) => {
  const xOptions = { id: OPEN_PICKER_ID, types: PICKER_FILE_TYPES };
  return window.showOpenFilePicker(xStartFileHandle ? { ...xOptions, startIn: xStartFileHandle } : xOptions);
};

// OSの「開く」でスタックのファイルを選ぶ。lastPlace（LastOpenedPlace）が覚えているファイルのフォルダから始める。
// 選んだファイル（File）を返す。キャンセルされたら null。
export const fsPickStackFile = async (xLastPlace) => {
  let xFileHandles;

  try {
    xFileHandles = await fsShowOpenPicker(xLastPlace.fileHandle);
  } catch (xError) {
    if (fsIsUserCancel(xError)) {
      return null;
    }

    // 前のファイルが消えたなどで始める場所に使えないときは、忘れてから開き直す。
    if (!xLastPlace.fileHandle) {
      throw xError;
    }

    xLastPlace.forget();
    return fsPickStackFile(xLastPlace);
  }

  const [xChosenFileHandle] = xFileHandles;
  xLastPlace.remember(xChosenFileHandle);
  return xChosenFileHandle.getFile();
};

// 選んだファイルをスタックとして読む。
export const fsReadStackFile = async (xFile) => {
  return fsParseStackText(await xFile.text());
};
