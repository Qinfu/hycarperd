/*
 * 「開く…」で最後に選んだファイルの場所を覚えておき、次に「開く…」ときにそのフォルダから始める。
 * ブラウザはファイルのパスを教えないので、選んだファイルの手がかり（FileSystemFileHandle）を IndexedDB に残す。
 * スタックの中身は残さない。覚えておけなくても開くことはできるので、失敗はログに残して先へ進む。
 */
import { fsLogWarning } from "../diagnostics/Log.js";

const DATABASE_NAME = "hycarperd";
const DATABASE_VERSION = 1;
const STORE_NAME = "places";
const LAST_FILE_KEY = "lastStackFile";

const fsOpenDatabase = () => {
  return new Promise((xResolve, xReject) => {
    const xRequest = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    xRequest.onupgradeneeded = () => xRequest.result.createObjectStore(STORE_NAME);
    xRequest.onsuccess = () => xResolve(xRequest.result);
    xRequest.onerror = () => xReject(xRequest.error);
  });
};

const fsReadLastFile = async () => {
  const xDatabase = await fsOpenDatabase();
  const xRequest = xDatabase.transaction(STORE_NAME).objectStore(STORE_NAME).get(LAST_FILE_KEY);

  return new Promise((xResolve, xReject) => {
    xRequest.onsuccess = () => xResolve(xRequest.result ?? null);
    xRequest.onerror = () => xReject(xRequest.error);
  });
};

// handle が null なら、覚えていた場所を消す。
const fsWriteLastFile = async (xFileHandle) => {
  const xDatabase = await fsOpenDatabase();
  const xStore = xDatabase.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME);

  if (xFileHandle) {
    xStore.put(xFileHandle, LAST_FILE_KEY);
  } else {
    xStore.delete(LAST_FILE_KEY);
  }
};

export class LastOpenedPlace {
  constructor() {
    this.fileHandle = null;
  }

  // 起動時に読み込んでおく。「開く」の画面は押した操作の中で開く必要があるので、そのときに待たずに済むようにする。
  async load() {
    try {
      this.fileHandle = await fsReadLastFile();
    } catch (xError) {
      // プライベートモードなどで IndexedDB が使えない。
      this.fileHandle = null;
      fsLogWarning("最後に開いた場所を読み込めませんでした。", xError);
    }
  }

  async remember(xFileHandle) {
    this.fileHandle = xFileHandle;

    try {
      await fsWriteLastFile(xFileHandle);
    } catch (xError) {
      fsLogWarning("最後に開いた場所を覚えておけませんでした。", xError);
    }
  }

  forget() {
    return this.remember(null);
  }
}
