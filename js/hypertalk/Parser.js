/*
 * スクリプトを読み、ハンドラ（on 〜 end）と関数（function 〜 end）の構文木にする。
 * 式とオブジェクトの指定は ExpressionParser が読む。
 */
import { ExpressionParser } from "./ExpressionParser.js";
import { fsTokenizeScript } from "./Lexer.js";
import { ScriptError } from "./ScriptError.js";
import { CONTAINER_KIND, EXPRESSION_KIND, REPEAT_MODE, STATEMENT_KIND, TOKEN_TYPE } from "./ScriptNodes.js";
import { TokenStream } from "./TokenStream.js";
import {
  EFFECT_SPEED,
  EXIT_TO_NAMES,
  MISPLACED_STATEMENT_WORDS,
  PUT_PREPOSITION,
  VERY_WORD,
  VISUAL_EFFECT_NAMES,
  WAIT_UNIT,
  WAIT_UNIT_WORDS,
  WIPE_DIRECTIONS
} from "./ScriptVocabulary.js";

const HANDLER_KIND = { message: "on", function: "function" };

// 行の頭の語（語でないトークンは null）。
const fsLeadingWords = (xTokens) => {
  return xTokens.map((xToken) => (xToken.type === TOKEN_TYPE.word ? xToken.word : null));
};

// 「end 名前」の行か。
const fsIsEndLine = (xTokens, xLowerName) => {
  const xWords = fsLeadingWords(xTokens);
  return xWords[0] === "end" && xWords[1] === xLowerName;
};

const fsIsElseLine = (xTokens) => {
  return fsLeadingWords(xTokens)[0] === "else";
};

// 命令の語と、それを読むメソッドの名前。ここにない語は、自作のハンドラを呼ぶ命令として読む。
const STATEMENT_PARSERS = {
  put: "parsePut",
  get: "parseGet",
  go: "parseGo",
  visual: "parseVisualEffect",
  answer: "parseAnswer",
  ask: "parseAsk",
  beep: "parseBeep",
  play: "parsePlay",
  domenu: "parseDoMenu",
  open: "parseOpenUrl",
  wait: "parseWait",
  hide: "parseVisibility",
  show: "parseVisibility",
  set: "parseSet",
  add: "parseAddOrSubtract",
  subtract: "parseAddOrSubtract",
  multiply: "parseMultiplyOrDivide",
  divide: "parseMultiplyOrDivide",
  global: "parseGlobal",
  return: "parseReturn",
  pass: "parsePass",
  exit: "parseExit",
  next: "parseNextRepeat",
  send: "parseSend"
};

class ScriptParser extends ExpressionParser {
  constructor(xLines) {
    super();
    this.lines = xLines;
    this.index = 0;
  }

  // { handlers, functions }（どちらも 小文字の名前 → { name, params, body, line } の Map）を返す。
  parseScript() {
    const xHandlers = new Map();
    const xFunctions = new Map();

    while (this.index < this.lines.length) {
      const xHeaderLine = this.lines[this.index];
      this.index += 1;
      const xHandler = this.parseHandler(xHeaderLine);
      const xTable = xHandler.kind === HANDLER_KIND.message ? xHandlers : xFunctions;
      xTable.set(xHandler.name.toLowerCase(), xHandler.definition);
    }

    return { handlers: xHandlers, functions: xFunctions };
  }

  // 「on 名前 引数, …」から「end 名前」までを読む。
  parseHandler(xHeaderLine) {
    const xStream = this.streamOf(xHeaderLine);
    const xKind = xStream.acceptWord(HANDLER_KIND.message, HANDLER_KIND.function);

    if (!xKind) {
      xStream.fail("「on」か「function」で始めてください。");
    }

    const xName = xStream.expectName("ハンドラ名");
    const xParams = this.parseParameterNames(xStream);
    const xLowerName = xName.toLowerCase();
    const xBody = this.parseBlock((xTokens) => fsIsEndLine(xTokens, xLowerName), `end ${xName}`, xHeaderLine.line);

    // 「end 名前」の行を読み飛ばす。
    this.index += 1;

    return {
      kind: xKind,
      name: xName,
      definition: { name: xName, params: xParams, body: xBody, line: xHeaderLine.line }
    };
  }

  parseParameterNames(xStream) {
    const xParams = [];

    while (!xStream.atEnd()) {
      xParams.push(xStream.expectName("引数名").toLowerCase());

      if (!xStream.atEnd()) {
        xStream.expectOperator(",");
      }
    }

    return xParams;
  }

  streamOf(xLine) {
    return new TokenStream(xLine.tokens, xLine.line);
  }

  // 終わりの行（isTerminator が true の行）の手前まで読む。終わりの行は読み進めない。
  parseBlock(xIsTerminator, xEndText, xStartLine) {
    const xStatements = [];

    while (true) {
      if (this.index >= this.lines.length) {
        throw new ScriptError(`「${xEndText}」が見つかりません。`, xStartLine);
      }

      const xLine = this.lines[this.index];

      if (xIsTerminator(xLine.tokens)) {
        return xStatements;
      }

      this.index += 1;
      xStatements.push(this.parseLine(xLine));
    }
  }

  parseLine(xLine) {
    const xStream = this.streamOf(xLine);

    if (xStream.acceptWord("if")) {
      return this.parseIf(xStream);
    }

    if (xStream.acceptWord("repeat")) {
      return this.parseRepeat(xStream);
    }

    const xStatement = this.parseSimpleStatement(xStream);
    xStream.expectEnd();
    return xStatement;
  }

  // ---- if ----

  parseIf(xStream) {
    const xLine = xStream.line;
    const xCondition = this.parseExpression(xStream);
    xStream.expectWord("then");

    if (xStream.atEnd()) {
      return this.parseBlockIf(xLine, xCondition);
    }

    return this.parseSingleLineIf(xStream, xLine, xCondition);
  }

  // if 条件 then 文 [else 文]。else は次の行に書いてもよい。
  parseSingleLineIf(xStream, xLine, xCondition) {
    const xThenStatements = [this.parseSimpleStatement(xStream)];
    let xElseStatements = [];

    if (xStream.acceptWord("else")) {
      xElseStatements = this.parseElse(xStream);
    } else {
      xStream.expectEnd();

      if (this.index < this.lines.length && fsIsElseLine(this.lines[this.index].tokens)) {
        // else の後に複数行が続くときは、else の次の行から読むので、先に else の行を読み進める。
        const xElseLine = this.lines[this.index];
        this.index += 1;
        xElseStatements = this.parseElseLine(xElseLine);
      }
    }

    return this.ifStatement(xLine, xCondition, xThenStatements, xElseStatements);
  }

  // if 条件 then の後に、複数行の文と [else …] end if が続く形。
  parseBlockIf(xLine, xCondition) {
    const xThenStatements = this.parseBlock(
      (xTokens) => fsIsElseLine(xTokens) || fsIsEndLine(xTokens, "if"),
      "end if",
      xLine
    );
    // 閉じた行（else か end if）を読み進めてから、else なら続きを読む。
    const xClosingLine = this.lines[this.index];
    this.index += 1;
    const xElseStatements = fsIsElseLine(xClosingLine.tokens) ? this.parseElseLine(xClosingLine) : [];
    return this.ifStatement(xLine, xCondition, xThenStatements, xElseStatements);
  }

  // 「else …」の行を、else の後から読む。
  parseElseLine(xLine) {
    const xStream = this.streamOf(xLine);
    xStream.next();
    return this.parseElse(xStream);
  }

  // 「else」の直後から読む。行末なら end if までの複数行、else if なら内側の if、それ以外は1つの文。
  parseElse(xStream) {
    if (xStream.atEnd()) {
      const xBody = this.parseBlock((xTokens) => fsIsEndLine(xTokens, "if"), "end if", xStream.line);
      this.index += 1;
      return xBody;
    }

    // else if は、内側の if が最後の end if を読む。
    if (xStream.acceptWord("if")) {
      return [this.parseIf(xStream)];
    }

    const xStatement = this.parseSimpleStatement(xStream);
    xStream.expectEnd();
    return [xStatement];
  }

  ifStatement(xLine, xCondition, xThenStatements, xElseStatements) {
    return {
      kind: STATEMENT_KIND.if,
      line: xLine,
      condition: xCondition,
      thenStatements: xThenStatements,
      elseStatements: xElseStatements
    };
  }

  // ---- repeat ----

  parseRepeat(xStream) {
    const xStatement = { kind: STATEMENT_KIND.repeat, line: xStream.line, ...this.parseRepeatMode(xStream) };
    xStream.expectEnd();
    xStatement.body = this.parseBlock((xTokens) => fsIsEndLine(xTokens, "repeat"), "end repeat", xStream.line);
    this.index += 1;
    return xStatement;
  }

  // repeat [forever] / while 条件 / until 条件 / with i = 1 [down] to 10 / [for] 5 [times]。
  parseRepeatMode(xStream) {
    if (xStream.atEnd() || xStream.acceptWord("forever")) {
      return { mode: REPEAT_MODE.forever };
    }

    if (xStream.acceptWord("while")) {
      return { mode: REPEAT_MODE.while, condition: this.parseExpression(xStream) };
    }

    if (xStream.acceptWord("until")) {
      return { mode: REPEAT_MODE.until, condition: this.parseExpression(xStream) };
    }

    if (xStream.acceptWord("with")) {
      const xVariable = xStream.expectName("変数名").toLowerCase();
      xStream.expectOperator("=");
      const xFrom = this.parseAddition(xStream);
      const xDown = Boolean(xStream.acceptWord("down"));
      xStream.expectWord("to");
      return { mode: REPEAT_MODE.with, variable: xVariable, from: xFrom, down: xDown, to: this.parseAddition(xStream) };
    }

    xStream.acceptWord("for");
    const xCount = this.parseAddition(xStream);
    xStream.acceptWord("times");
    return { mode: REPEAT_MODE.count, count: xCount };
  }

  // ---- 1行の文 ----

  parseSimpleStatement(xStream) {
    const xWord = xStream.peekWord();

    if (!xWord) {
      xStream.fail("命令の名前が必要です。");
    }

    xStream.next();

    if (MISPLACED_STATEMENT_WORDS.has(xWord)) {
      return xStream.fail(`「${xWord}」の位置が正しくありません。`);
    }

    const xMethodName = STATEMENT_PARSERS[xWord];

    if (xMethodName) {
      return { line: xStream.line, ...this[xMethodName](xStream, xWord) };
    }

    return { kind: STATEMENT_KIND.command, line: xStream.line, name: xWord, args: this.parseCommandArguments(xStream) };
  }

  // 行末か else の手前なら、引数は書かれていない。
  hasArgument(xStream) {
    return !xStream.atEnd() && !xStream.isWord("else");
  }

  // 引数が必要な命令で、引数がなければ書き方の例を添えて知らせる。
  expectArgument(xStream, xMessage) {
    if (!this.hasArgument(xStream)) {
      xStream.fail(xMessage);
    }
  }

  parseCommandArguments(xStream) {
    const xArgs = [];

    if (!this.hasArgument(xStream)) {
      return xArgs;
    }

    do {
      xArgs.push(this.parseExpression(xStream));
    } while (xStream.acceptOperator(","));

    return xArgs;
  }

  // put 値 [into|after|before 書き込み先]。書き込み先を省くとメッセージボックスへ。
  parsePut(xStream) {
    const xValue = this.parseExpression(xStream);
    const xPreposition = xStream.acceptWord(PUT_PREPOSITION.into, PUT_PREPOSITION.after, PUT_PREPOSITION.before);
    const xDestination = xPreposition ? this.parseContainer(xStream) : { kind: CONTAINER_KIND.message };
    return { kind: STATEMENT_KIND.put, value: xValue, preposition: xPreposition ?? PUT_PREPOSITION.into, destination: xDestination };
  }

  parseGet(xStream) {
    return { kind: STATEMENT_KIND.get, value: this.parseExpression(xStream) };
  }

  // go [to] back / go [to] stack パス / go [to] カード。
  parseGo(xStream) {
    xStream.acceptWord("to");

    if (xStream.acceptWord("back")) {
      return { kind: STATEMENT_KIND.goBack };
    }

    if (xStream.acceptWord("stack")) {
      this.expectArgument(xStream, "go stack のあとに開くスタックのパスを書いてください（例：go stack \"stacks/reference\"）。");
      return { kind: STATEMENT_KIND.goStack, path: this.parseExpression(xStream) };
    }

    return { kind: STATEMENT_KIND.go, target: this.parseCardTarget(xStream) };
  }

  // visual [effect] wipe left|right / dissolve / plain [[very] fast|slow]。次の go に効果を付ける。
  parseVisualEffect(xStream) {
    xStream.acceptWord("effect");
    let xName = xStream.acceptWord(VISUAL_EFFECT_NAMES.dissolve, VISUAL_EFFECT_NAMES.plain);

    if (!xName && xStream.acceptWord(VISUAL_EFFECT_NAMES.wipe)) {
      xName = `${VISUAL_EFFECT_NAMES.wipe} ${xStream.expectWord(...WIPE_DIRECTIONS)}`;
    }

    if (!xName) {
      xStream.fail("使える効果は wipe left / wipe right / dissolve / plain です。");
    }

    return { kind: STATEMENT_KIND.visualEffect, effect: { name: xName, speed: this.parseEffectSpeed(xStream) } };
  }

  parseEffectSpeed(xStream) {
    if (xStream.acceptWord(VERY_WORD)) {
      return `${VERY_WORD} ${xStream.expectWord(EFFECT_SPEED.fast, EFFECT_SPEED.slow)}`;
    }

    return xStream.acceptWord(EFFECT_SPEED.fast, EFFECT_SPEED.slow) ?? EFFECT_SPEED.normal;
  }

  // answer 文 [with ボタン or ボタン …]。ボタンの名前は or で区切るので、連結までの式として読む。
  parseAnswer(xStream) {
    const xPrompt = this.parseExpression(xStream);
    const xButtons = [];

    if (xStream.acceptWord("with")) {
      do {
        xButtons.push(this.parseConcatenation(xStream));
      } while (xStream.acceptWord("or"));
    }

    return { kind: STATEMENT_KIND.answer, prompt: xPrompt, buttons: xButtons };
  }

  parseAsk(xStream) {
    const xPrompt = this.parseExpression(xStream);
    const xDefaultValue = xStream.acceptWord("with") ? this.parseExpression(xStream) : null;
    return { kind: STATEMENT_KIND.ask, prompt: xPrompt, defaultValue: xDefaultValue };
  }

  parseBeep(xStream) {
    return { kind: STATEMENT_KIND.beep, count: this.hasArgument(xStream) ? this.parseExpression(xStream) : null };
  }

  parsePlay(xStream) {
    this.expectArgument(xStream, "play のあとに音の名前を書いてください（例：play \"chime\"）。");
    return { kind: STATEMENT_KIND.play, sound: this.parseExpression(xStream) };
  }

  parseDoMenu(xStream) {
    this.expectArgument(xStream, "doMenu のあとにメニュー項目の名前を書いてください（例：doMenu \"開く…\"）。");
    return { kind: STATEMENT_KIND.doMenu, label: this.parseExpression(xStream) };
  }

  parseOpenUrl(xStream) {
    if (!xStream.acceptWord("url") || !this.hasArgument(xStream)) {
      xStream.fail("open url のあとに開くURLを書いてください（例：open url \"https://example.com\"）。");
    }

    return { kind: STATEMENT_KIND.openUrl, url: this.parseExpression(xStream) };
  }

  // wait [for] 量 [seconds|milliseconds|ticks]。単位を省くと tick（60分の1秒）。
  parseWait(xStream) {
    xStream.acceptWord("for");
    const xAmount = this.parseAddition(xStream);
    let xUnit = WAIT_UNIT.tick;

    if (xStream.acceptWord(...WAIT_UNIT_WORDS.second)) {
      xUnit = WAIT_UNIT.second;
    } else if (xStream.acceptWord(...WAIT_UNIT_WORDS.millisecond)) {
      xUnit = WAIT_UNIT.millisecond;
    } else {
      xStream.acceptWord(...WAIT_UNIT_WORDS.tick);
    }

    return { kind: STATEMENT_KIND.wait, amount: xAmount, unit: xUnit };
  }

  // hide / show オブジェクト。
  parseVisibility(xStream, xWord) {
    return { kind: STATEMENT_KIND[xWord], reference: this.parseObjectReference(xStream, true) };
  }

  // set [the] プロパティ of オブジェクト to 値。
  parseSet(xStream) {
    xStream.acceptWord("the");
    const xProperty = xStream.expectName("プロパティ名").toLowerCase();
    xStream.expectWord("of");
    const xReference = this.parseObjectReference(xStream, true);
    xStream.expectWord("to");
    return { kind: STATEMENT_KIND.set, property: xProperty, reference: xReference, value: this.parseExpression(xStream) };
  }

  // add 値 to 書き込み先 / subtract 値 from 書き込み先。
  parseAddOrSubtract(xStream, xWord) {
    const xValue = this.parseExpression(xStream);
    xStream.expectWord(xWord === "add" ? "to" : "from");
    return { kind: STATEMENT_KIND.arithmetic, operation: xWord, value: xValue, destination: this.parseContainer(xStream) };
  }

  // multiply 書き込み先 by 値 / divide 書き込み先 by 値。
  parseMultiplyOrDivide(xStream, xWord) {
    const xDestination = this.parseContainer(xStream);
    xStream.expectWord("by");
    return { kind: STATEMENT_KIND.arithmetic, operation: xWord, value: this.parseExpression(xStream), destination: xDestination };
  }

  parseGlobal(xStream) {
    const xNames = [];

    do {
      xNames.push(xStream.expectName("変数名").toLowerCase());
    } while (xStream.acceptOperator(","));

    return { kind: STATEMENT_KIND.global, names: xNames };
  }

  parseReturn(xStream) {
    const xValue = this.hasArgument(xStream)
      ? this.parseExpression(xStream)
      : { kind: EXPRESSION_KIND.literal, value: "" };
    return { kind: STATEMENT_KIND.return, value: xValue };
  }

  parsePass(xStream) {
    xStream.expectName("メッセージ名");
    return { kind: STATEMENT_KIND.pass };
  }

  // exit repeat / exit to HyperCard（HycarPerd も可）/ exit ハンドラ名。
  parseExit(xStream) {
    if (xStream.acceptWord("repeat")) {
      return { kind: STATEMENT_KIND.exitRepeat };
    }

    if (xStream.acceptWord("to")) {
      if (!xStream.acceptWord(...EXIT_TO_NAMES)) {
        xStream.expectWord("hypercard");
      }

      return { kind: STATEMENT_KIND.exitToTop };
    }

    xStream.expectName("ハンドラ名");
    return { kind: STATEMENT_KIND.exitHandler };
  }

  parseNextRepeat(xStream) {
    xStream.expectWord("repeat");
    return { kind: STATEMENT_KIND.nextRepeat };
  }

  // send メッセージ [to オブジェクト]。
  parseSend(xStream) {
    const xMessage = this.parseConcatenation(xStream);
    const xReference = xStream.acceptWord("to") ? this.parseObjectReference(xStream, true) : null;
    return { kind: STATEMENT_KIND.send, message: xMessage, reference: xReference };
  }
}

export const fsParseScript = (xText) => {
  return new ScriptParser(fsTokenizeScript(xText)).parseScript();
};

// 構文の誤りがあればメッセージを、なければ空文字を返す（スクリプトを編集する画面で使う）。
export const fsCheckScript = (xText) => {
  try {
    fsParseScript(xText);
    return "";
  } catch (xError) {
    if (xError instanceof ScriptError) {
      return xError.line ? `${xError.line}行目：${xError.message}` : xError.message;
    }

    throw xError;
  }
};
