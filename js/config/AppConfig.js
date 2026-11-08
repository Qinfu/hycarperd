/*
 * アプリの動きを決める設定値。スタックのデータ形式に関わる値は js/model/StackFormat.js に置く。
 */

// アプリに同梱しているスタック（index.html から見たパス）。
export const BUNDLED_STACK_PATHS = {
  // 起動時に表示するホームのスタック。
  home: "./stacks/HOME.stack.json",
  // ファイルメニューの「サンプルを開く」で開くスタック。
  sample: "./stacks/sample.stack.json"
};

// スクリプトの実行の決まり。
export const SCRIPT_RUNTIME = {
  // 無限ループで画面が固まらないよう、1回のメッセージで実行できる文の数に上限を設ける。
  maxSteps: 1_000_000,
  // この数の文を実行するごとに、画面の更新や操作を受け付けるため、ブラウザに処理を返す。
  stepsBetweenYields: 2000,
  // wait の途中でも中断できるよう、この長さ（ミリ秒）ずつ区切って待つ。
  waitSlice: 100,
  // beep 100 などで長く鳴り続けないよう、鳴らす回数に上限を設ける。
  maxBeepCount: 10,
  // 続けて鳴らす beep の間隔の最小値（ミリ秒）。音の長さが分からないときもこれだけ空ける。
  minBeepInterval: 200
};

// open url で開ける URL の種類。スタックから任意のスクリプト（javascript: など）を動かせないよう、これだけに限る。
export const OPEN_URL_PROTOCOLS = ["http:", "https:", "mailto:", "tel:"];

// 「戻る」で戻れるカードの数。古いものから捨てる。
export const MAX_CARD_HISTORY = 50;

// 画面の下に出すお知らせを表示しておく時間（ミリ秒）。
export const STATUS_DISPLAY_TIME = 2500;

// 画面が狭い、またはタッチ操作が主で中くらいまでの幅ならスマホ用の画面にする。
export const MOBILE_MEDIA_QUERY = "(max-width: 600px), (pointer: coarse) and (max-width: 900px)";

// 動きを減らす設定の端末では、カードの切り替え効果を付けない。
export const REDUCED_MOTION_MEDIA_QUERY = "(prefers-reduced-motion: reduce)";

// 文字を絵として置くときの、最初の大きさ・フォント・太さ。次からは前に選んだものを使う。
export const DEFAULT_TEXT_PICTURE_OPTIONS = { size: 16, font: "gothic", bold: false };
