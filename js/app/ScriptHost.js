/*
 * スクリプトの実行系（Interpreter）に渡す、画面側の機能。スクリプトからできることは、ここに書いたものだけ。
 */
import { fsHasSound, fsPlaySound } from "../sound/Sound.js";
import { fsAnswer, fsAsk } from "../ui/Dialog.js";

// 開いたページから、このページを操作できないようにする。
const OPEN_URL_TARGET = "_blank";
const OPEN_URL_FEATURES = "noopener,noreferrer";

// エラーが起きた場所（どのスクリプトの何行目か）を添えて、ダイアログで知らせる。
const fsReportScriptError = (xError) => {
  const xWhere = [xError.where, xError.line ? `${xError.line}行目` : ""]
    .filter(Boolean)
    .join(" ");
  fsAnswer(`スクリプトエラー\n${xWhere}\n\n${xError.message}`);
};

export const fsCreateScriptHost = (xApp) => {
  return {
    getStack: () => xApp.state.stack,
    getCardIndex: () => xApp.state.cardIndex,
    goToCard: (xIndex, xEffect) => xApp.navigation.goToCard(xIndex, true, xEffect),
    goBack: (xEffect) => xApp.navigation.goBack(xEffect),
    // スクリプトがスタックの中身を変えた。
    changed: () => {
      xApp.view.render();
      xApp.session.markChanged();
    },
    getMessage: () => xApp.messageBox.text,
    setMessage: (xText) => xApp.messageBox.write(xText),
    answer: (xText, xButtons) => fsAnswer(xText, xButtons),
    ask: (xText, xDefault) => fsAsk(xText, xDefault),
    beep: () => fsPlaySound(xApp.state.stack.stack.beepSound),
    // 知らない音の名前なら null を返し、Interpreter がエラーにする。
    play: (xName) => (fsHasSound(xName) ? fsPlaySound(xName) : null),
    doMenu: (xLabel) => xApp.menuBar.choose(xLabel),
    goStack: (xPath) => xApp.session.openFromPath(xPath),
    openUrl: (xUrl) => window.open(xUrl, OPEN_URL_TARGET, OPEN_URL_FEATURES),
    reportError: fsReportScriptError
  };
};
