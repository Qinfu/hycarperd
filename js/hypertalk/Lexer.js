// スクリプトの誤り。行番号と、どのオブジェクトのスクリプトかを持つ。
export class ScriptError extends Error {
  constructor(xMessage, xLine = null) {
    super(xMessage);
    this.name = "ScriptError";
    this.line = xLine;
    this.where = null;
  }
}

// 長いものから順に照合する。
const OPERATORS = [
  "<=", ">=", "<>", "&&",
  "≤", "≥", "≠", "&", "+", "-", "*", "/", "^", "=", "<", ">", "(", ")", ","
];

const WORD_PATTERN = /^[\p{L}_][\p{L}\p{N}_]*/u;
const NUMBER_PATTERN = /^(\d+(\.\d*)?|\.\d+)/;

// iOSのスマート句読点が入力した引用符も受け付ける。
const QUOTE_PAIRS = { "\"": "\"", "“": "”", "”": "”", "„": "“" };

function xTokenizeLine(xText, xLine) {
  const xTokens = [];
  let xRest = xText;
  let xContinued = false;

  while (xRest.length > 0) {
    const xSpace = xRest.match(/^\s+/);

    if (xSpace) {
      xRest = xRest.slice(xSpace[0].length);
      continue;
    }

    // コメント。iOSが「--」を「—」に変換する場合にも対応する。
    if (xRest.startsWith("--") || xRest.startsWith("—")) {
      break;
    }

    if (xRest[0] === "¬") {
      xContinued = true;
      xRest = xRest.slice(1);
      continue;
    }

    const xClose = QUOTE_PAIRS[xRest[0]];

    if (xClose) {
      const xEnd = xRest.indexOf(xClose, 1);

      if (xEnd < 0) {
        throw new ScriptError("文字列の \" が閉じていません。", xLine);
      }

      xTokens.push({ t: "str", v: xRest.slice(1, xEnd) });
      xRest = xRest.slice(xEnd + 1);
      continue;
    }

    const xNumber = xRest.match(NUMBER_PATTERN);

    if (xNumber) {
      xTokens.push({ t: "num", v: Number(xNumber[0]) });
      xRest = xRest.slice(xNumber[0].length);
      continue;
    }

    const xWord = xRest.match(WORD_PATTERN);

    if (xWord) {
      xTokens.push({ t: "word", v: xWord[0], w: xWord[0].toLowerCase() });
      xRest = xRest.slice(xWord[0].length);
      continue;
    }

    const xOperator = OPERATORS.find((xOp) => xRest.startsWith(xOp));

    if (xOperator) {
      xTokens.push({ t: "op", v: xOperator });
      xRest = xRest.slice(xOperator.length);
      continue;
    }

    throw new ScriptError(`使えない文字があります：${xRest[0]}`, xLine);
  }

  return { tokens: xTokens, continued: xContinued };
}

// 空行を除いた行の配列を返す。「¬」で終わる行は次の行とつなげる。
export function xTokenizeScript(xText) {
  const xLines = [];
  let xPending = null;

  xText.split(/\r?\n/).forEach((xRaw, xIndex) => {
    const xResult = xTokenizeLine(xRaw, xIndex + 1);

    if (xPending) {
      xPending.tokens.push(...xResult.tokens);
    } else {
      xPending = { tokens: xResult.tokens, line: xIndex + 1 };
    }

    if (!xResult.continued) {
      if (xPending.tokens.length > 0) {
        xLines.push(xPending);
      }

      xPending = null;
    }
  });

  if (xPending && xPending.tokens.length > 0) {
    xLines.push(xPending);
  }

  return xLines;
}
