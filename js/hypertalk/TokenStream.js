/*
 * 1行分のトークンを、先頭から順に読む。期待した語や演算子がなければ、その行の ScriptError を投げる。
 */
import { ScriptError } from "./ScriptError.js";
import { TOKEN_TYPE } from "./ScriptNodes.js";

export class TokenStream {
  constructor(xTokens, xLineNumber) {
    this.tokens = xTokens;
    this.position = 0;
    this.line = xLineNumber;
  }

  atEnd() {
    return this.position >= this.tokens.length;
  }

  peek(xOffset = 0) {
    return this.tokens[this.position + xOffset];
  }

  next() {
    const xToken = this.tokens[this.position];
    this.position += 1;
    return xToken;
  }

  // 語なら小文字にしたもの、語でなければ null。
  peekWord(xOffset = 0) {
    const xToken = this.peek(xOffset);
    return xToken?.type === TOKEN_TYPE.word ? xToken.word : null;
  }

  isWord(...xWords) {
    const xWord = this.peekWord();
    return xWord !== null && xWords.includes(xWord);
  }

  // 次がどれかの語なら読み進めてその語を返す。違えば読まずに null。
  acceptWord(...xWords) {
    return this.isWord(...xWords) ? this.next().word : null;
  }

  expectWord(...xWords) {
    const xWord = this.acceptWord(...xWords);

    if (!xWord) {
      this.fail(`「${xWords[0]}」が必要です。`);
    }

    return xWord;
  }

  isOperator(...xOperators) {
    const xToken = this.peek();
    return xToken?.type === TOKEN_TYPE.operator && xOperators.includes(xToken.value);
  }

  acceptOperator(...xOperators) {
    return this.isOperator(...xOperators) ? this.next().value : null;
  }

  expectOperator(xOperator) {
    if (!this.acceptOperator(xOperator)) {
      this.fail(`「${xOperator}」が必要です。`);
    }
  }

  // 名前（語）を読み、書かれたままの文字（大文字・小文字を保つ）を返す。xWhat はエラーで「〜が必要です」と出す名前。
  expectName(xWhat) {
    const xToken = this.peek();

    if (xToken?.type !== TOKEN_TYPE.word) {
      this.fail(`${xWhat}が必要です。`);
    }

    this.next();
    return xToken.value;
  }

  expectEnd() {
    if (!this.atEnd()) {
      this.fail(`「${this.describe(this.peek())}」の位置が正しくありません。`);
    }
  }

  // エラーのメッセージに出すための、トークンの書かれた形。
  describe(xToken) {
    if (!xToken) {
      return "";
    }

    return xToken.type === TOKEN_TYPE.string ? `"${xToken.value}"` : String(xToken.value);
  }

  fail(xMessage) {
    throw new ScriptError(xMessage, this.line);
  }
}
