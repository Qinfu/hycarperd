/*
 * 開発者向けのログ。画面には出さず、ブラウザの開発者ツールのコンソールに出す。
 * 画面のお知らせは短くしているので、原因（元のエラー）はここで確かめられるようにする。
 */

const LOG_PREFIX = "[HycarPerd]";

// 処理は続けられたが、知っておくべきこと（保存できなかった設定など）。
export const fsLogWarning = (xWhat, xError) => {
  console.warn(`${LOG_PREFIX} ${xWhat}`, xError ?? "");
};

// 操作が失敗したこと。xError に cause があれば、それも一緒に出る。
export const fsLogError = (xWhat, xError) => {
  console.error(`${LOG_PREFIX} ${xWhat}`, xError ?? "");
};
