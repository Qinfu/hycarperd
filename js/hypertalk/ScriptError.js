/*
 * スクリプトの実行と解析で使うエラー。
 */

// スクリプトの誤り。画面に出すので、message はそのまま読める文にする。
// line は何行目か、where はどのオブジェクトのスクリプトか（例：ボタン「OK」）。分かった時点で後から埋める。
export class ScriptError extends Error {
  constructor(xMessage, xLine = null) {
    super(xMessage);
    this.name = "ScriptError";
    this.line = xLine;
    this.where = null;
  }
}

// ブラウズ・エディットの切り替えなどで、実行中のスクリプトを止めたことを表す（画面には出さない）。
export class ScriptAborted extends Error {
  constructor() {
    super("スクリプトを中断しました。");
    this.name = "ScriptAborted";
  }
}

// exit to HyperCard と go stack で、呼び出し元のハンドラもまとめて終えることを表す（画面には出さない）。
export class ScriptExitedToTop extends Error {
  constructor() {
    super("スクリプトを終了しました。");
    this.name = "ScriptExitedToTop";
  }
}
