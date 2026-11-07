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
