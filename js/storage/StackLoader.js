/*
 * Webサーバー上のスタックを読み込む（同梱のスタックと、スクリプトの go stack）。
 * ブラウザはパソコンの中のファイルを勝手に読ませないので、ローカルのパスは開けない。
 */
import { BUNDLED_STACK_PATHS } from "../config/AppConfig.js";
import { fsValidateStack } from "../model/StackNormalizer.js";
import { STACK_FILE_SUFFIX, fsHasJsonExtension } from "./StackFileFormat.js";

// go stack で開いてよい URL の種類。
const LOADABLE_PROTOCOLS = ["http:", "https:"];

// URL のスタックを読み込む。displayName はエラーのメッセージに出す名前。
// 失敗の理由（通信・HTTPの状態・中身）ごとにメッセージを分け、元のエラーは cause に残す。
const fsFetchStack = async (xUrl, xDisplayName) => {
  let xResponse;

  try {
    xResponse = await fetch(xUrl);
  } catch (xError) {
    // fetch が通信そのものに失敗したとき。ほかのサイトでは、そのサイトが読み込みを許していない（CORS）ことが多い。
    throw new Error(`${xDisplayName}を読み込めません（つながっていないか、そのサイトが読み込みを許していません）。`, { cause: xError });
  }

  if (!xResponse.ok) {
    throw new Error(`${xDisplayName}を読み込めません（HTTP ${xResponse.status}）。`);
  }

  let xData;

  try {
    xData = await xResponse.json();
  } catch (xError) {
    throw new Error(`${xDisplayName}はスタックのファイルではありません。`, { cause: xError });
  }

  return fsValidateStack(xData);
};

export const fsLoadHomeStack = () => {
  return fsFetchStack(BUNDLED_STACK_PATHS.home, "ホームのスタック");
};

export const fsLoadSampleStack = () => {
  return fsFetchStack(BUNDLED_STACK_PATHS.sample, "サンプルスタック");
};

// go stack のパスを、読み込む URL にする。index.html から見たパスか URL で指定する。
// 名前が .json で終わらなければ .stack.json を付ける（"stacks/reference" → "stacks/reference.stack.json"）。
const fsStackUrlOf = (xPath) => {
  let xUrl;

  try {
    xUrl = new URL(xPath, location.href);
  } catch (xError) {
    throw new Error(`「${xPath}」はパスとして読めません。`, { cause: xError });
  }

  if (!LOADABLE_PROTOCOLS.includes(xUrl.protocol)) {
    throw new Error(`「${xPath}」は開けません（Webサーバー上のパスかURLだけ）。`);
  }

  // 「?raw=1」などが付いたURLでも、パスの部分で見分ける。
  if (!fsHasJsonExtension(xUrl.pathname)) {
    xUrl.pathname += STACK_FILE_SUFFIX;
  }

  return xUrl;
};

// スクリプトの go stack で指定されたスタックを読み込む。パスの誤りも、読み込みの失敗と同じく reject で返す。
export const fsLoadStackFromPath = async (xPath) => {
  return fsFetchStack(fsStackUrlOf(xPath).href, `「${xPath}」`);
};
