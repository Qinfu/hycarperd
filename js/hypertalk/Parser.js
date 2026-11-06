import { ScriptError, fsTokenizeScript } from "./Lexer.js";

const CONSTANTS = {
  empty: "",
  true: true,
  false: false,
  return: "\n",
  space: " ",
  tab: "\t",
  quote: "\"",
  comma: ","
};

const CHUNK_UNITS = {
  char: "char",
  character: "char",
  word: "word",
  line: "line",
  item: "item"
};

const COUNT_UNITS = {
  chars: "char",
  characters: "char",
  words: "word",
  lines: "line",
  items: "item"
};

const PART_TYPES = {
  field: "field",
  fld: "field",
  button: "button",
  btn: "button"
};

const PART_COUNTS = {
  fields: "field",
  flds: "field",
  buttons: "button",
  btns: "button"
};

const CARD_WORDS = new Set(["card", "cd"]);
const BG_WORDS = new Set(["bg", "bkgnd", "background"]);

// 部品の前の「card」「bg」から、どちらの層の部品かを決める。何もなければ "auto"。
const fsLayerOf = (xWord) => {
  if (CARD_WORDS.has(xWord)) {
    return "card";
  }

  return BG_WORDS.has(xWord) ? "background" : "auto";
};
const ORDINALS = { next: "next", prev: "prev", previous: "prev", first: "first", last: "last" };
const RESERVED = new Set(["then", "else", "end"]);

// 「the X of」のXのうち、オブジェクトのプロパティとして扱うもの。
export const PROPERTIES = new Set([
  "name", "label", "text", "visible", "locktext", "clickable", "sharedtext", "style", "textsize", "textalign", "scrollbar", "sound",
  "left", "top", "width", "height", "id", "number", "script"
]);

// 1行分のトークンを順に読む。
class TokenStream {
  constructor(xTokens, xLine) {
    this.tokens = xTokens;
    this.pos = 0;
    this.line = xLine;
  }

  atEnd() {
    return this.pos >= this.tokens.length;
  }

  peek(xOffset = 0) {
    return this.tokens[this.pos + xOffset];
  }

  next() {
    return this.tokens[this.pos++];
  }

  peekWord(xOffset = 0) {
    const xToken = this.peek(xOffset);
    return xToken?.t === "word" ? xToken.w : null;
  }

  isWord(...xWords) {
    const xWord = this.peekWord();
    return xWord !== null && xWords.includes(xWord);
  }

  acceptWord(...xWords) {
    if (this.isWord(...xWords)) {
      return this.next().w;
    }

    return null;
  }

  expectWord(...xWords) {
    const xWord = this.acceptWord(...xWords);

    if (!xWord) {
      this.fail(`「${xWords[0]}」が必要です。`);
    }

    return xWord;
  }

  isOp(...xOps) {
    const xToken = this.peek();
    return xToken?.t === "op" && xOps.includes(xToken.v);
  }

  acceptOp(...xOps) {
    if (this.isOp(...xOps)) {
      return this.next().v;
    }

    return null;
  }

  expectOp(xOp) {
    if (!this.acceptOp(xOp)) {
      this.fail(`「${xOp}」が必要です。`);
    }
  }

  expectName(xWhat) {
    const xToken = this.peek();

    if (xToken?.t !== "word") {
      this.fail(`${xWhat}が必要です。`);
    }

    this.next();
    return xToken.v;
  }

  expectEnd() {
    if (!this.atEnd()) {
      this.fail(`「${this.describe(this.peek())}」の位置が正しくありません。`);
    }
  }

  describe(xToken) {
    if (!xToken) {
      return "";
    }

    return xToken.t === "str" ? `"${xToken.v}"` : String(xToken.v);
  }

  fail(xMessage) {
    throw new ScriptError(xMessage, this.line);
  }
}

// 「word」「line」などは変数名にも使えるため、後ろに位置の指定が続くときだけチャンクとみなす。
const NOT_CHUNK_FOLLOWERS = new Set([
  "into", "after", "before", "then", "else", "and", "or", "is", "contains",
  "to", "of", "in", "with", "mod", "div", "from", "by"
]);

const fsLooksLikeChunk = (xStream) => {
  if (!CHUNK_UNITS[xStream.peekWord()]) {
    return false;
  }

  const xNext = xStream.peek(1);

  if (!xNext) {
    return false;
  }

  if (xNext.t === "num" || xNext.t === "str") {
    return true;
  }

  if (xNext.t === "op") {
    return xNext.v === "(" || xNext.v === "-";
  }

  return !NOT_CHUNK_FOLLOWERS.has(xNext.w);
};

const fsFirstWords = (xTokens) => {
  return xTokens.map((xToken) => (xToken.t === "word" ? xToken.w : null));
};

const fsIsEnd = (xTokens, xName) => {
  const xWords = fsFirstWords(xTokens);
  return xWords[0] === "end" && xWords[1] === xName;
};

const fsIsElse = (xTokens) => {
  return fsFirstWords(xTokens)[0] === "else";
};

class ScriptParser {
  constructor(xLines) {
    this.lines = xLines;
    this.index = 0;
  }

  parseScript() {
    const xHandlers = new Map();
    const xFunctions = new Map();

    while (this.index < this.lines.length) {
      const xLine = this.lines[this.index++];
      const xStream = new TokenStream(xLine.tokens, xLine.line);
      const xKind = xStream.acceptWord("on", "function");

      if (!xKind) {
        xStream.fail("「on」か「function」で始めてください。");
      }

      const xName = xStream.expectName("ハンドラ名");
      const xParams = [];

      while (!xStream.atEnd()) {
        xParams.push(xStream.expectName("引数名").toLowerCase());

        if (!xStream.atEnd()) {
          xStream.expectOp(",");
        }
      }

      const xLower = xName.toLowerCase();
      const xBody = this.parseBlock(
        (xTokens) => fsIsEnd(xTokens, xLower),
        `end ${xName}`,
        xLine.line
      );

      this.index += 1;
      (xKind === "on" ? xHandlers : xFunctions).set(xLower, {
        name: xName,
        params: xParams,
        body: xBody,
        line: xLine.line
      });
    }

    return { handlers: xHandlers, functions: xFunctions };
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
    const xStream = new TokenStream(xLine.tokens, xLine.line);

    if (xStream.acceptWord("if")) {
      return this.parseIf(xStream);
    }

    if (xStream.acceptWord("repeat")) {
      return this.parseRepeat(xStream);
    }

    const xStatement = this.parseSimple(xStream);
    xStream.expectEnd();
    return xStatement;
  }

  parseIf(xStream) {
    const xLine = xStream.line;
    const xCondition = this.parseExpr(xStream);
    xStream.expectWord("then");

    // 1行の if：if 条件 then 文 [else 文]
    if (!xStream.atEnd()) {
      const xThen = [this.parseSimple(xStream)];
      let xElse = [];

      if (xStream.acceptWord("else")) {
        xElse = this.parseElse(xStream);
      } else {
        xStream.expectEnd();

        if (this.index < this.lines.length && fsIsElse(this.lines[this.index].tokens)) {
          const xElseLine = this.lines[this.index++];
          const xElseStream = new TokenStream(xElseLine.tokens, xElseLine.line);
          xElseStream.next();
          xElse = this.parseElse(xElseStream);
        }
      }

      return { k: "if", line: xLine, cond: xCondition, then: xThen, else: xElse };
    }

    const xIsEndIf = (xTokens) => fsIsEnd(xTokens, "if");
    const xThen = this.parseBlock(
      (xTokens) => fsIsElse(xTokens) || xIsEndIf(xTokens),
      "end if",
      xLine
    );
    const xNextLine = this.lines[this.index++];
    let xElse = [];

    if (fsIsElse(xNextLine.tokens)) {
      const xElseStream = new TokenStream(xNextLine.tokens, xNextLine.line);
      xElseStream.next();
      xElse = this.parseElse(xElseStream);
    }

    return { k: "if", line: xLine, cond: xCondition, then: xThen, else: xElse };
  }

  // 「else」の直後から読む。
  parseElse(xStream) {
    if (xStream.atEnd()) {
      const xBody = this.parseBlock((xTokens) => fsIsEnd(xTokens, "if"), "end if", xStream.line);
      this.index += 1;
      return xBody;
    }

    // else if は、内側の if が最後の end if を読む。
    if (xStream.acceptWord("if")) {
      return [this.parseIf(xStream)];
    }

    const xStatement = this.parseSimple(xStream);
    xStream.expectEnd();
    return [xStatement];
  }

  parseRepeat(xStream) {
    const xNode = { k: "repeat", line: xStream.line, mode: "forever" };

    if (xStream.atEnd() || xStream.acceptWord("forever")) {
      xNode.mode = "forever";
    } else if (xStream.acceptWord("while")) {
      xNode.mode = "while";
      xNode.cond = this.parseExpr(xStream);
    } else if (xStream.acceptWord("until")) {
      xNode.mode = "until";
      xNode.cond = this.parseExpr(xStream);
    } else if (xStream.acceptWord("with")) {
      xNode.mode = "with";
      xNode.variable = xStream.expectName("変数名").toLowerCase();
      xStream.expectOp("=");
      xNode.from = this.parseAdd(xStream);
      xNode.down = Boolean(xStream.acceptWord("down"));
      xStream.expectWord("to");
      xNode.to = this.parseAdd(xStream);
    } else {
      xStream.acceptWord("for");
      xNode.mode = "count";
      xNode.count = this.parseAdd(xStream);
      xStream.acceptWord("times");
    }

    xStream.expectEnd();
    xNode.body = this.parseBlock((xTokens) => fsIsEnd(xTokens, "repeat"), "end repeat", xStream.line);
    this.index += 1;
    return xNode;
  }

  parseSimple(xStream) {
    const xLine = xStream.line;
    const xWord = xStream.peekWord();

    if (!xWord) {
      xStream.fail("命令の名前が必要です。");
    }

    xStream.next();

    switch (xWord) {
      case "put": {
        const xValue = this.parseExpr(xStream);
        const xPrep = xStream.acceptWord("into", "after", "before");
        const xDest = xPrep ? this.parseContainer(xStream) : { k: "msg" };
        return { k: "put", line: xLine, value: xValue, prep: xPrep ?? "into", dest: xDest };
      }

      case "get":
        return { k: "get", line: xLine, value: this.parseExpr(xStream) };

      case "go": {
        xStream.acceptWord("to");

        if (xStream.acceptWord("back")) {
          return { k: "go", line: xLine, back: true };
        }

        // go stack "stacks/reference"。このページと同じ場所にあるスタックのファイルを開く。
        if (xStream.acceptWord("stack")) {
          if (!this.xHasArgument(xStream)) {
            throw new ScriptError("go stack のあとに開くスタックのパスを書いてください（例：go stack \"stacks/reference\"）。", xLine);
          }

          return { k: "goStack", line: xLine, path: this.parseExpr(xStream) };
        }

        return { k: "go", line: xLine, ref: this.parseCardTarget(xStream) };
      }

      // visual effect wipe left [very fast|fast|slow|very slow]。次の go に効果を付ける。
      case "visual": {
        xStream.acceptWord("effect");
        let xName = xStream.acceptWord("dissolve", "plain");

        if (!xName && xStream.acceptWord("wipe")) {
          xName = `wipe ${xStream.expectWord("left", "right")}`;
        }

        if (!xName) {
          xStream.fail("使える効果は wipe left / wipe right / dissolve / plain です。");
        }

        let xSpeed = "normal";

        if (xStream.acceptWord("very")) {
          xSpeed = `very ${xStream.expectWord("fast", "slow")}`;
        } else {
          xSpeed = xStream.acceptWord("fast", "slow") ?? "normal";
        }

        return { k: "visual", line: xLine, effect: { name: xName, speed: xSpeed } };
      }

      case "answer": {
        const xValue = this.parseExpr(xStream);
        const xButtons = [];

        if (xStream.acceptWord("with")) {
          do {
            xButtons.push(this.parseConcat(xStream));
          } while (xStream.acceptWord("or"));
        }

        return { k: "answer", line: xLine, value: xValue, buttons: xButtons };
      }

      case "ask": {
        const xValue = this.parseExpr(xStream);
        const xDefault = xStream.acceptWord("with") ? this.parseExpr(xStream) : null;
        return { k: "ask", line: xLine, value: xValue, def: xDefault };
      }

      case "beep":
        return {
          k: "beep",
          line: xLine,
          count: this.xHasArgument(xStream) ? this.parseExpr(xStream) : null
        };

      // play "chime"。音の名前は式で書ける。
      case "play":
        if (!this.xHasArgument(xStream)) {
          throw new ScriptError("play のあとに音の名前を書いてください（例：play \"chime\"）。", xLine);
        }

        return { k: "play", line: xLine, sound: this.parseExpr(xStream) };

      // doMenu "サンプルを開く"。メニュー項目の名前は式で書ける。
      case "domenu":
        if (!this.xHasArgument(xStream)) {
          throw new ScriptError("doMenu のあとにメニュー項目の名前を書いてください（例：doMenu \"開く…\"）。", xLine);
        }

        return { k: "doMenu", line: xLine, label: this.parseExpr(xStream) };

      // open url "https://example.com"。URL は式で書ける。
      case "open":
        if (!xStream.acceptWord("url") || !this.xHasArgument(xStream)) {
          throw new ScriptError("open url のあとに開くURLを書いてください（例：open url \"https://example.com\"）。", xLine);
        }

        return { k: "openUrl", line: xLine, url: this.parseExpr(xStream) };

      case "wait": {
        xStream.acceptWord("for");
        const xAmount = this.parseAdd(xStream);
        let xUnit = "tick";

        if (xStream.acceptWord("seconds", "second", "secs", "sec")) {
          xUnit = "sec";
        } else if (xStream.acceptWord("milliseconds", "millisecond", "ms")) {
          xUnit = "ms";
        } else {
          xStream.acceptWord("ticks", "tick");
        }

        return { k: "wait", line: xLine, amount: xAmount, unit: xUnit };
      }

      case "hide":
      case "show":
        return { k: xWord, line: xLine, ref: this.parseObjRef(xStream, true) };

      case "set": {
        xStream.acceptWord("the");
        const xProp = xStream.expectName("プロパティ名").toLowerCase();
        xStream.expectWord("of");
        const xRef = this.parseObjRef(xStream, true);
        xStream.expectWord("to");
        return { k: "set", line: xLine, prop: xProp, ref: xRef, value: this.parseExpr(xStream) };
      }

      case "add":
      case "subtract": {
        const xValue = this.parseExpr(xStream);
        xStream.expectWord(xWord === "add" ? "to" : "from");
        return { k: "math", line: xLine, op: xWord, value: xValue, dest: this.parseContainer(xStream) };
      }

      case "multiply":
      case "divide": {
        const xDest = this.parseContainer(xStream);
        xStream.expectWord("by");
        return { k: "math", line: xLine, op: xWord, value: this.parseExpr(xStream), dest: xDest };
      }

      case "global": {
        const xNames = [];

        do {
          xNames.push(xStream.expectName("変数名").toLowerCase());
        } while (xStream.acceptOp(","));

        return { k: "global", line: xLine, names: xNames };
      }

      case "return":
        return {
          k: "return",
          line: xLine,
          value: this.xHasArgument(xStream) ? this.parseExpr(xStream) : { k: "lit", v: "" }
        };

      case "pass":
        xStream.expectName("メッセージ名");
        return { k: "pass", line: xLine };

      case "exit":
        if (xStream.acceptWord("repeat")) {
          return { k: "exitRepeat", line: xLine };
        }

        if (xStream.acceptWord("to")) {
          if (!xStream.acceptWord("hycarperd")) {
            xStream.expectWord("hypercard");
          }

          return { k: "exitAll", line: xLine };
        }

        xStream.expectName("ハンドラ名");
        return { k: "exit", line: xLine };

      case "next":
        xStream.expectWord("repeat");
        return { k: "nextRepeat", line: xLine };

      case "send": {
        const xMessage = this.parseConcat(xStream);
        const xRef = xStream.acceptWord("to") ? this.parseObjRef(xStream, true) : null;
        return { k: "send", line: xLine, message: xMessage, ref: xRef };
      }

      case "end":
      case "else":
      case "then":
      case "on":
      case "function":
        return xStream.fail(`「${xWord}」の位置が正しくありません。`);

      default: {
        const xArgs = [];

        if (this.xHasArgument(xStream)) {
          do {
            xArgs.push(this.parseExpr(xStream));
          } while (xStream.acceptOp(","));
        }

        return { k: "command", line: xLine, name: xWord, args: xArgs };
      }
    }
  }

  xHasArgument(xStream) {
    return !xStream.atEnd() && !xStream.isWord("else");
  }

  // put の書き込み先など、値を入れられる場所。
  parseContainer(xStream) {
    if (xStream.acceptWord("msg", "message")) {
      xStream.acceptWord("box");
      return { k: "msg" };
    }

    if (fsLooksLikeChunk(xStream)) {
      xStream.fail("文字や単語の一部への書き込みは、まだ使えません。");
    }

    const xRef = this.parseObjRef(xStream, false);

    if (xRef) {
      return xRef;
    }

    return { k: "var", name: xStream.expectName("書き込み先").toLowerCase() };
  }

  parseCardTarget(xStream) {
    const xOrdinal = ORDINALS[xStream.peekWord()];

    if (xOrdinal) {
      xStream.next();
      xStream.acceptWord("card", "cd");
      return { k: "ref", type: "card", which: xOrdinal };
    }

    const xRef = this.parseObjRef(xStream, false);

    if (xRef?.type === "card") {
      return xRef;
    }

    return xStream.fail("移動先のカードを指定してください。");
  }

  // オブジェクトの指定を読む。required が false で見つからなければ null。
  parseObjRef(xStream, xRequired) {
    const xWord = xStream.peekWord();
    const xNext = xStream.peekWord(1);

    if (xWord === "me") {
      xStream.next();
      return { k: "ref", type: "me" };
    }

    if (xWord === "the" && xNext === "target") {
      xStream.next();
      xStream.next();
      return { k: "ref", type: "target" };
    }

    if (xWord === "this" && (CARD_WORDS.has(xNext) || BG_WORDS.has(xNext) || xNext === "stack")) {
      xStream.next();
      xStream.next();

      if (BG_WORDS.has(xNext)) {
        return { k: "ref", type: "background" };
      }

      return { k: "ref", type: xNext === "stack" ? "stack" : "card", which: "this" };
    }

    if (ORDINALS[xWord] && CARD_WORDS.has(xNext)) {
      xStream.next();
      xStream.next();
      return { k: "ref", type: "card", which: ORDINALS[xWord] };
    }

    // card field / bg button など。前に何もなければ、カード→背景の順に探す。
    let xLayer = "auto";

    if (fsLayerOf(xWord) !== "auto" && PART_TYPES[xNext]) {
      xLayer = fsLayerOf(xWord);
      xStream.next();
    }

    const xPartType = PART_TYPES[xStream.peekWord()];

    if (xPartType) {
      xStream.next();
      return { k: "ref", type: xPartType, layer: xLayer, which: this.parsePrimary(xStream) };
    }

    if (BG_WORDS.has(xWord)) {
      xStream.next();
      return { k: "ref", type: "background" };
    }

    if (CARD_WORDS.has(xWord)) {
      xStream.next();
      const xOrdinal = ORDINALS[xStream.peekWord()];

      if (xOrdinal) {
        xStream.next();
        return { k: "ref", type: "card", which: xOrdinal };
      }

      return { k: "ref", type: "card", which: this.parsePrimary(xStream) };
    }

    if (xRequired) {
      xStream.fail("ボタン・フィールド・カードなどを指定してください。");
    }

    return null;
  }

  // ---- 式（優先順位の低い順） ----

  parseExpr(xStream) {
    return this.parseOr(xStream);
  }

  parseOr(xStream) {
    let xLeft = this.parseAnd(xStream);

    while (xStream.acceptWord("or")) {
      xLeft = { k: "bin", op: "or", a: xLeft, b: this.parseAnd(xStream) };
    }

    return xLeft;
  }

  parseAnd(xStream) {
    let xLeft = this.parseCompare(xStream);

    while (xStream.acceptWord("and")) {
      xLeft = { k: "bin", op: "and", a: xLeft, b: this.parseCompare(xStream) };
    }

    return xLeft;
  }

  parseCompare(xStream) {
    let xLeft = this.parseConcat(xStream);

    while (true) {
      let xOp = xStream.acceptOp("=", "<>", "≠", "<", ">", "<=", ">=", "≤", "≥");

      if (xOp) {
        xOp = { "≠": "<>", "≤": "<=", "≥": ">=" }[xOp] ?? xOp;
      } else if (xStream.acceptWord("is")) {
        const xNot = Boolean(xStream.acceptWord("not"));

        if (xStream.acceptWord("in")) {
          xOp = xNot ? "notin" : "in";
        } else {
          xOp = xNot ? "<>" : "=";
        }
      } else if (xStream.acceptWord("contains")) {
        xOp = "contains";
      } else {
        return xLeft;
      }

      xLeft = { k: "bin", op: xOp, a: xLeft, b: this.parseConcat(xStream) };
    }
  }

  parseConcat(xStream) {
    let xLeft = this.parseAdd(xStream);
    let xOp;

    while ((xOp = xStream.acceptOp("&", "&&"))) {
      xLeft = { k: "bin", op: xOp, a: xLeft, b: this.parseAdd(xStream) };
    }

    return xLeft;
  }

  parseAdd(xStream) {
    let xLeft = this.parseMul(xStream);
    let xOp;

    while ((xOp = xStream.acceptOp("+", "-"))) {
      xLeft = { k: "bin", op: xOp, a: xLeft, b: this.parseMul(xStream) };
    }

    return xLeft;
  }

  parseMul(xStream) {
    let xLeft = this.parsePow(xStream);

    while (true) {
      const xOp = xStream.acceptOp("*", "/") ?? xStream.acceptWord("div", "mod");

      if (!xOp) {
        return xLeft;
      }

      xLeft = { k: "bin", op: xOp, a: xLeft, b: this.parsePow(xStream) };
    }
  }

  parsePow(xStream) {
    const xBase = this.parseUnary(xStream);

    if (xStream.acceptOp("^")) {
      return { k: "bin", op: "^", a: xBase, b: this.parsePow(xStream) };
    }

    return xBase;
  }

  parseUnary(xStream) {
    if (xStream.acceptWord("not")) {
      return { k: "un", op: "not", a: this.parseUnary(xStream) };
    }

    if (xStream.acceptOp("-")) {
      return { k: "un", op: "-", a: this.parseUnary(xStream) };
    }

    return this.parsePrimary(xStream);
  }

  parsePrimary(xStream) {
    const xToken = xStream.peek();

    if (!xToken) {
      return xStream.fail("式が途中で終わっています。");
    }

    if (xToken.t === "num" || xToken.t === "str") {
      xStream.next();
      return { k: "lit", v: xToken.v };
    }

    if (xToken.t === "op") {
      if (xStream.acceptOp("(")) {
        const xInner = this.parseExpr(xStream);
        xStream.expectOp(")");
        return xInner;
      }

      return xStream.fail(`「${xToken.v}」の位置が正しくありません。`);
    }

    const xWord = xToken.w;

    if (RESERVED.has(xWord)) {
      return xStream.fail(`「${xToken.v}」の前に式が必要です。`);
    }

    if (Object.hasOwn(CONSTANTS, xWord)) {
      xStream.next();
      return { k: "lit", v: CONSTANTS[xWord] };
    }

    if (xWord === "the") {
      return this.parseThe(xStream);
    }

    if (fsLooksLikeChunk(xStream)) {
      return this.parseChunk(xStream);
    }

    const xRef = this.parseObjRef(xStream, false);

    if (xRef) {
      return { k: "refval", ref: xRef };
    }

    xStream.next();

    if (xStream.acceptOp("(")) {
      const xArgs = [];

      if (!xStream.acceptOp(")")) {
        do {
          xArgs.push(this.parseExpr(xStream));
        } while (xStream.acceptOp(","));

        xStream.expectOp(")");
      }

      return { k: "call", name: xWord, args: xArgs };
    }

    return { k: "var", name: xWord };
  }

  parseChunk(xStream) {
    const xUnit = CHUNK_UNITS[xStream.next().w];
    const xFrom = this.parseAdd(xStream);
    const xTo = xStream.acceptWord("to") ? this.parseAdd(xStream) : null;
    xStream.expectWord("of", "in");
    return { k: "chunk", unit: xUnit, from: xFrom, to: xTo, of: this.parsePrimary(xStream) };
  }

  parseThe(xStream) {
    xStream.next();
    const xAdjective = xStream.acceptWord("short", "long", "abbreviated", "abbrev", "abbr");
    const xName = xStream.expectName("「the」の後の名前").toLowerCase();

    if (xName === "target") {
      return { k: "refval", ref: { k: "ref", type: "target" } };
    }

    if (!xStream.isWord("of", "in")) {
      return { k: "the", name: xName, adj: xAdjective };
    }

    xStream.next();

    if (xName === "number") {
      return this.parseNumberOf(xStream);
    }

    if (PROPERTIES.has(xName)) {
      return { k: "prop", prop: xName, ref: this.parseObjRef(xStream, true) };
    }

    return { k: "call", name: xName, args: [this.parsePrimary(xStream)] };
  }

  // 「the number of」の後を読む。
  parseNumberOf(xStream) {
    if (xStream.acceptWord("cards", "cds")) {
      return { k: "count", what: "card" };
    }

    let xLayer = "card";

    if (fsLayerOf(xStream.peekWord()) !== "auto" && PART_COUNTS[xStream.peekWord(1)]) {
      xLayer = fsLayerOf(xStream.next().w);
    }

    const xPart = PART_COUNTS[xStream.peekWord()];

    if (xPart) {
      xStream.next();
      return { k: "count", what: xPart, layer: xLayer };
    }

    const xUnit = COUNT_UNITS[xStream.peekWord()];

    if (xUnit) {
      xStream.next();
      xStream.expectWord("in", "of");
      return { k: "count", what: xUnit, of: this.parsePrimary(xStream) };
    }

    return { k: "prop", prop: "number", ref: this.parseObjRef(xStream, true) };
  }
}

export const fsParseScript = (xText) => {
  return new ScriptParser(fsTokenizeScript(xText)).parseScript();
};

// 構文の誤りがあればメッセージを、なければ空文字を返す。
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
