/*
 * スクリプトの文字を、行ごとのトークンの並びにする。
 */
import { ScriptError } from "./ScriptError.js";
import { TOKEN_TYPE } from "./ScriptNodes.js";

// 演算子。「<=」と「<」のように頭が同じものがあるので、長いものから順に照合する。
const OPERATORS = [
  "<=", ">=", "<>", "&&",
  "≤", "≥", "≠", "&", "+", "-", "*", "/", "^", "=", "<", ">", "(", ")", ","
];

const WHITESPACE_PATTERN = /^\s+/;
const WORD_PATTERN = /^[\p{L}_][\p{L}\p{N}_]*/u;
const NUMBER_PATTERN = /^(\d+(\.\d*)?|\.\d+)/;

// コメントの始まり。iOSが「--」を「—」に変えて入力することがあるので、それも受け付ける。
const COMMENT_MARKERS = ["--", "—"];

// 行の途中にあると、次の行とつなげる印（オリジナルの HyperCard と同じ）。
const LINE_CONTINUATION = "¬";

// 文字列の開きと閉じの引用符。iOSのスマート句読点が入力した引用符も受け付ける。
const QUOTE_PAIRS = { "\"": "\"", "“": "”", "”": "”", "„": "“" };

const LINE_BREAK_PATTERN = /\r?\n/;

// 1行をトークンにする。continued はその行が次の行へ続くか。
const fsTokenizeLine = (xText, xLineNumber) => {
  const xTokens = [];
  let xRest = xText;
  let xContinued = false;

  const fsConsume = (xLength) => {
    xRest = xRest.slice(xLength);
  };

  while (xRest.length > 0) {
    const xWhitespace = xRest.match(WHITESPACE_PATTERN);

    if (xWhitespace) {
      fsConsume(xWhitespace[0].length);
      continue;
    }

    if (COMMENT_MARKERS.some((xMarker) => xRest.startsWith(xMarker))) {
      break;
    }

    if (xRest[0] === LINE_CONTINUATION) {
      xContinued = true;
      fsConsume(LINE_CONTINUATION.length);
      continue;
    }

    const xClosingQuote = QUOTE_PAIRS[xRest[0]];

    if (xClosingQuote) {
      const xClosingIndex = xRest.indexOf(xClosingQuote, 1);

      if (xClosingIndex < 0) {
        throw new ScriptError("文字列の \" が閉じていません。", xLineNumber);
      }

      xTokens.push({ type: TOKEN_TYPE.string, value: xRest.slice(1, xClosingIndex) });
      fsConsume(xClosingIndex + 1);
      continue;
    }

    const xNumber = xRest.match(NUMBER_PATTERN);

    if (xNumber) {
      xTokens.push({ type: TOKEN_TYPE.number, value: Number(xNumber[0]) });
      fsConsume(xNumber[0].length);
      continue;
    }

    const xWord = xRest.match(WORD_PATTERN);

    if (xWord) {
      xTokens.push({ type: TOKEN_TYPE.word, value: xWord[0], word: xWord[0].toLowerCase() });
      fsConsume(xWord[0].length);
      continue;
    }

    const xOperator = OPERATORS.find((xCandidate) => xRest.startsWith(xCandidate));

    if (xOperator) {
      xTokens.push({ type: TOKEN_TYPE.operator, value: xOperator });
      fsConsume(xOperator.length);
      continue;
    }

    throw new ScriptError(`使えない文字があります：${xRest[0]}`, xLineNumber);
  }

  return { tokens: xTokens, continued: xContinued };
};

// スクリプト全体をトークンにする。{ tokens, line } の配列を返す（空行は除く）。
// 「¬」のある行は次の行とつなげ、つないだ行の番号は最初の行のものにする。
export const fsTokenizeScript = (xText) => {
  const xLines = [];
  let xPendingLine = null;

  xText.split(LINE_BREAK_PATTERN).forEach((xLineText, xIndex) => {
    const xLineNumber = xIndex + 1;
    const xTokenized = fsTokenizeLine(xLineText, xLineNumber);

    if (xPendingLine) {
      xPendingLine.tokens.push(...xTokenized.tokens);
    } else {
      xPendingLine = { tokens: xTokenized.tokens, line: xLineNumber };
    }

    if (!xTokenized.continued) {
      if (xPendingLine.tokens.length > 0) {
        xLines.push(xPendingLine);
      }

      xPendingLine = null;
    }
  });

  if (xPendingLine && xPendingLine.tokens.length > 0) {
    xLines.push(xPendingLine);
  }

  return xLines;
};
