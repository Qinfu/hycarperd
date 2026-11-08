/*
 * 1回のハンドラの実行で使う情報：me（スクリプトを持つオブジェクト）、target（最初にメッセージを受けたもの）、変数。
 * 変数はハンドラごとに別々。global で宣言した名前だけは、全ハンドラで共有する値（globals）を読み書きする。
 */

// 値を入れていない it は空。ほかの名前は、HyperTalk と同じく名前そのものの文字として読む。
const IT_VARIABLE = "it";

export class HandlerContext {
  // globals はインタプリタが持つ、全ハンドラで共有する変数（名前 → 値の Map）。
  constructor(xMe, xTarget, xGlobals) {
    this.me = xMe;
    this.target = xTarget;
    this.globals = xGlobals;
    this.locals = new Map();
    this.globalNames = new Set();
  }

  declareGlobal(xName) {
    this.globalNames.add(xName);

    if (!this.globals.has(xName)) {
      this.globals.set(xName, "");
    }
  }

  getVariable(xName) {
    if (this.globalNames.has(xName)) {
      return this.globals.get(xName);
    }

    if (this.locals.has(xName)) {
      return this.locals.get(xName);
    }

    return xName === IT_VARIABLE ? "" : xName;
  }

  setVariable(xName, xValue) {
    if (this.globalNames.has(xName)) {
      this.globals.set(xName, xValue);
    } else {
      this.locals.set(xName, xValue);
    }
  }

  setIt(xValue) {
    this.setVariable(IT_VARIABLE, xValue);
  }
}
