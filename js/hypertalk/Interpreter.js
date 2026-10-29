import { ScriptError } from "./Lexer.js";
import { fsParseScript } from "./Parser.js";
import { MIN_PART_SIZE, fsBackgroundOf, fsClampTextSize, fsFieldText, fsSetFieldText } from "../storage/StackIO.js";

// 無限ループで画面が固まらないよう、実行できる文の数に上限を設ける。
const MAX_STEPS = 1_000_000;
const YIELD_INTERVAL = 2000;

// どのハンドラもなくてもエラーにしないメッセージ。
const SYSTEM_MESSAGES = new Set([
  "mouseup", "mousedown", "opencard", "closecard", "openstack", "closestack"
]);

const PART_LABELS = { button: "ボタン", field: "フィールド" };

class AbortScript extends Error {}
class ExitToTop extends Error {}

const xSleep = (xMs) => new Promise((xResolve) => setTimeout(xResolve, xMs));

// 全角の数字・記号を半角にそろえる（スマホで全角入力されることが多いため）。
const fsNormalizeDigits = (xText) => {
  return xText.replace(/[０-９．－＋]/g, (xChar) =>
    String.fromCharCode(xChar.charCodeAt(0) - 0xfee0)
  );
};

export const fsToText = (xValue) => {
  if (typeof xValue === "number") {
    if (Number.isInteger(xValue)) {
      return String(xValue);
    }

    if (!Number.isFinite(xValue)) {
      return xValue > 0 ? "INF" : xValue < 0 ? "-INF" : "NAN";
    }

    return String(Number.parseFloat(xValue.toFixed(6)));
  }

  if (typeof xValue === "boolean") {
    return xValue ? "true" : "false";
  }

  return String(xValue ?? "");
};

const fsIsNumeric = (xValue) => {
  if (typeof xValue === "number") {
    return true;
  }

  if (typeof xValue !== "string") {
    return false;
  }

  const xText = fsNormalizeDigits(xValue.trim());
  return xText !== "" && !Number.isNaN(Number(xText));
};

const fsToNumber = (xValue) => {
  if (typeof xValue === "number") {
    return xValue;
  }

  const xText = fsNormalizeDigits(fsToText(xValue).trim());

  if (xText === "") {
    return 0;
  }

  const xNumber = Number(xText);

  if (Number.isNaN(xNumber) || typeof xValue === "boolean") {
    throw new ScriptError(`「${fsToText(xValue)}」は数値ではありません。`);
  }

  return xNumber;
};

const fsToBoolean = (xValue) => {
  if (typeof xValue === "boolean") {
    return xValue;
  }

  const xText = fsToText(xValue).trim().toLowerCase();

  if (xText === "true") {
    return true;
  }

  if (xText === "false") {
    return false;
  }

  throw new ScriptError(`「${fsToText(xValue)}」は true でも false でもありません。`);
};

const fsEquals = (xA, xB) => {
  if (fsIsNumeric(xA) && fsIsNumeric(xB)) {
    return fsToNumber(xA) === fsToNumber(xB);
  }

  return fsToText(xA).toLowerCase() === fsToText(xB).toLowerCase();
};

const fsCompare = (xA, xB) => {
  if (fsIsNumeric(xA) && fsIsNumeric(xB)) {
    return fsToNumber(xA) - fsToNumber(xB);
  }

  return fsToText(xA).toLowerCase().localeCompare(fsToText(xB).toLowerCase());
};

const CHUNK_JOINERS = { char: "", word: " ", line: "\n", item: "," };

const fsSplitChunks = (xText, xUnit) => {
  switch (xUnit) {
    case "char":
      return [...xText];
    case "word":
      return xText.split(/\s+/).filter((xWord) => xWord !== "");
    case "line":
      return xText === "" ? [] : xText.split("\n");
    default:
      return xText === "" ? [] : xText.split(",");
  }
};

// 引数がひとつで「,」を含む場合は、項目の並びとして扱う（max(field 1) など）。
const fsNumberList = (xArgs) => {
  const xValues = xArgs.length === 1 ? fsToText(xArgs[0]).split(",") : xArgs;
  return xValues.map(fsToNumber);
};

const BUILTIN_FUNCTIONS = {
  random: ([xMax]) => Math.floor(Math.random() * Math.max(1, Math.trunc(fsToNumber(xMax)))) + 1,
  abs: ([xValue]) => Math.abs(fsToNumber(xValue)),
  round: ([xValue]) => Math.round(fsToNumber(xValue)),
  trunc: ([xValue]) => Math.trunc(fsToNumber(xValue)),
  sqrt: ([xValue]) => Math.sqrt(fsToNumber(xValue)),
  length: ([xValue]) => [...fsToText(xValue)].length,
  max: (xArgs) => Math.max(...fsNumberList(xArgs)),
  min: (xArgs) => Math.min(...fsNumberList(xArgs)),
  sum: (xArgs) => fsNumberList(xArgs).reduce((xA, xB) => xA + xB, 0),
  average: (xArgs) => {
    const xList = fsNumberList(xArgs);
    return xList.reduce((xA, xB) => xA + xB, 0) / xList.length;
  },
  offset: ([xNeedle, xHaystack]) =>
    fsToText(xHaystack).toLowerCase().indexOf(fsToText(xNeedle).toLowerCase()) + 1,
  chartonum: ([xValue]) => fsToText(xValue).codePointAt(0) ?? 0,
  numtochar: ([xValue]) => String.fromCodePoint(fsToNumber(xValue))
};

/*
 * スクリプトの実行系。画面側（host）は次のメソッドを用意する。
 *   getStack(), getCardIndex(), goToCard(index, effect), goBack(effect), changed(),
 *   getMessage(), setMessage(text), answer(text, buttons), ask(text, default),
 *   beep(), play(name), reportError(error)
 *
 * beep() と play(name) は鳴らした音の長さ（ミリ秒）を返す。play は知らない音なら null。
 *
 * effect は visual effect で指定した { name, speed }。指定がなければ null（画面側の既定の効果）。
 *
 * オブジェクトは { kind: "part", part, card } / { kind: "card", card } /
 * { kind: "background", background } / { kind: "stack" } で表す。
 */
export class Interpreter {
  constructor(xHost) {
    this.host = xHost;
    this.globals = new Map();
    this.cache = new Map();
    this.depth = 0;
    this.steps = 0;
    this.aborted = false;
    this.result = "";
    this.visualEffect = null;
  }

  get busy() {
    return this.depth > 0;
  }

  abort() {
    if (this.depth > 0) {
      this.aborted = true;
    }
  }

  // 画面からもスクリプトからも使う入口。最上位の呼び出しでだけエラーを表示する。
  async sendMessage(xMessage, xTarget, xArgs = []) {
    const xTop = this.depth === 0;

    if (xTop) {
      this.steps = 0;
      this.aborted = false;
      this.visualEffect = null;
    }

    this.depth += 1;

    try {
      return await this.xDispatch(xMessage.toLowerCase(), xTarget, xArgs, xTarget, "handlers");
    } catch (xError) {
      if (!xTop) {
        throw xError;
      }

      if (!(xError instanceof AbortScript) && !(xError instanceof ExitToTop)) {
        this.host.reportError(xError);
      }

      return { handled: true, value: "" };
    } finally {
      this.depth -= 1;
    }
  }

  // ---- メッセージの受け渡し ----

  xChainOf(xObject) {
    const xStack = this.host.getStack();
    const xChain = [xObject];
    let xCard = null;

    if (xObject.kind === "part") {
      xCard = xObject.card;
      xChain.push({ kind: "card", card: xCard });
    } else if (xObject.kind === "card") {
      xCard = xObject.card;
    }

    if (xCard) {
      xChain.push({ kind: "background", background: fsBackgroundOf(xStack, xCard) });
    }

    if (xObject.kind !== "stack") {
      xChain.push({ kind: "stack" });
    }

    return xChain;
  }

  xScriptOf(xObject) {
    switch (xObject.kind) {
      case "part":
        return xObject.part.script;
      case "card":
        return xObject.card.script;
      case "background":
        return xObject.background.script;
      default:
        return this.host.getStack().stack.script;
    }
  }

  xDescribe(xObject) {
    switch (xObject.kind) {
      case "part":
        return `${xObject.isBackground ? "背景" : ""}${PART_LABELS[xObject.part.type]}「${xObject.part.name}」`;
      case "card":
        return `カード「${xObject.card.name}」`;
      case "background":
        return "背景";
      default:
        return "スタック";
    }
  }

  xParse(xObject) {
    const xScript = this.xScriptOf(xObject);

    if (typeof xScript !== "string" || xScript.trim() === "") {
      return null;
    }

    if (!this.cache.has(xScript)) {
      try {
        this.cache.set(xScript, fsParseScript(xScript));
      } catch (xError) {
        if (xError instanceof ScriptError) {
          xError.where = this.xDescribe(xObject);
        }

        throw xError;
      }
    }

    return this.cache.get(xScript);
  }

  async xDispatch(xName, xStart, xArgs, xTarget, xKind) {
    for (const xObject of this.xChainOf(xStart)) {
      const xHandler = this.xParse(xObject)?.[xKind].get(xName);

      if (!xHandler) {
        continue;
      }

      const xOutcome = await this.xRunHandler(xHandler, xObject, xTarget, xArgs);

      if (!xOutcome.passed) {
        return { handled: true, value: xOutcome.value };
      }
    }

    return { handled: false, value: "" };
  }

  async xRunHandler(xHandler, xObject, xTarget, xArgs) {
    const xContext = {
      me: xObject,
      target: xTarget,
      vars: new Map(),
      globalNames: new Set()
    };

    xHandler.params.forEach((xParam, xIndex) => {
      xContext.vars.set(xParam, xArgs[xIndex] ?? "");
    });

    try {
      const xSignal = await this.xExecBlock(xHandler.body, xContext);

      if (xSignal?.type === "pass") {
        return { passed: true };
      }

      return { value: xSignal?.type === "return" ? xSignal.value : "" };
    } catch (xError) {
      if (xError instanceof ScriptError && !xError.where) {
        xError.where = this.xDescribe(xObject);
      }

      throw xError;
    }
  }

  // ---- 文の実行 ----

  async xTick() {
    this.steps += 1;

    if (this.aborted) {
      throw new AbortScript();
    }

    if (this.steps > MAX_STEPS) {
      throw new ScriptError("処理の回数が多すぎるため止めました。");
    }

    if (this.steps % YIELD_INTERVAL === 0) {
      await xSleep(0);
    }
  }

  async xExecBlock(xStatements, xContext) {
    for (const xStatement of xStatements) {
      const xSignal = await this.xExec(xStatement, xContext);

      if (xSignal) {
        return xSignal;
      }
    }

    return null;
  }

  async xExec(xStatement, xContext) {
    try {
      await this.xTick();
      return await this.xRun(xStatement, xContext);
    } catch (xError) {
      if (xError instanceof ScriptError && xError.line === null) {
        xError.line = xStatement.line;
      }

      throw xError;
    }
  }

  async xRun(xStatement, xContext) {
    switch (xStatement.k) {
      case "put": {
        const xValue = await this.xEval(xStatement.value, xContext);
        await this.xWriteContainer(xStatement.dest, xStatement.prep, xValue, xContext);
        return null;
      }

      case "get":
        this.xSetVar("it", await this.xEval(xStatement.value, xContext), xContext);
        return null;

      case "visual":
        this.visualEffect = xStatement.effect;
        return null;

      // visual effect の効果は、次の1回の go にだけ使う。
      case "go": {
        const xEffect = this.visualEffect;
        this.visualEffect = null;

        if (xStatement.back) {
          await this.host.goBack(xEffect);
        } else {
          await this.host.goToCard(await this.xResolveCardIndex(xStatement.ref, xContext), xEffect);
        }

        return null;
      }

      case "answer": {
        const xText = fsToText(await this.xEval(xStatement.value, xContext));
        const xButtons = [];

        for (const xButton of xStatement.buttons) {
          xButtons.push(fsToText(await this.xEval(xButton, xContext)));
        }

        const xChoice = await this.host.answer(xText, xButtons.length > 0 ? xButtons : ["OK"]);
        this.xSetVar("it", xChoice, xContext);
        return null;
      }

      case "ask": {
        const xText = fsToText(await this.xEval(xStatement.value, xContext));
        const xDefault = xStatement.def
          ? fsToText(await this.xEval(xStatement.def, xContext))
          : "";
        const xReply = await this.host.ask(xText, xDefault);

        this.xSetVar("it", xReply ?? "", xContext);
        this.result = xReply === null ? "Cancel" : "";
        return null;
      }

      case "beep": {
        const xCount = xStatement.count
          ? Math.max(1, Math.trunc(fsToNumber(await this.xEval(xStatement.count, xContext))))
          : 1;

        // 次の音は前の音が鳴り終わってから鳴らす。
        for (let xIndex = 0; xIndex < Math.min(xCount, 10); xIndex += 1) {
          await this.xWait(Math.max(200, this.host.beep() || 0));
        }

        return null;
      }

      // 音は鳴らしたまま、すぐ次の行へ進む（オリジナルの HyperCard と同じ）。
      case "play": {
        const xName = fsToText(await this.xEval(xStatement.sound, xContext)).trim();

        if (this.host.play(xName) === null) {
          throw new ScriptError(`「${xName}」という音はありません。`, xStatement.line);
        }

        return null;
      }

      case "wait": {
        const xAmount = fsToNumber(await this.xEval(xStatement.amount, xContext));
        const xFactor = { sec: 1000, ms: 1, tick: 1000 / 60 }[xStatement.unit];
        await this.xWait(xAmount * xFactor);
        return null;
      }

      case "hide":
      case "show": {
        const xPart = await this.xResolvePart(xStatement.ref, xContext);
        xPart.visible = xStatement.k === "show";
        this.host.changed();
        return null;
      }

      case "set": {
        const xObject = await this.xResolveObject(xStatement.ref, xContext);
        const xValue = await this.xEval(xStatement.value, xContext);
        this.xSetProperty(xObject, xStatement.prop, xValue);
        this.host.changed();
        return null;
      }

      case "math": {
        const xCurrent = fsToNumber(await this.xReadContainer(xStatement.dest, xContext));
        const xValue = fsToNumber(await this.xEval(xStatement.value, xContext));
        let xResult;

        if (xStatement.op === "add") {
          xResult = xCurrent + xValue;
        } else if (xStatement.op === "subtract") {
          xResult = xCurrent - xValue;
        } else if (xStatement.op === "multiply") {
          xResult = xCurrent * xValue;
        } else {
          if (xValue === 0) {
            throw new ScriptError("0 で割ることはできません。");
          }

          xResult = xCurrent / xValue;
        }

        await this.xWriteContainer(xStatement.dest, "into", xResult, xContext);
        return null;
      }

      case "global":
        for (const xName of xStatement.names) {
          xContext.globalNames.add(xName);

          if (!this.globals.has(xName)) {
            this.globals.set(xName, "");
          }
        }

        return null;

      case "return":
        return { type: "return", value: await this.xEval(xStatement.value, xContext) };

      case "pass":
        return { type: "pass" };

      case "exit":
        return { type: "exit" };

      case "exitRepeat":
        return { type: "exitRepeat" };

      case "nextRepeat":
        return { type: "nextRepeat" };

      case "exitAll":
        throw new ExitToTop();

      case "send": {
        const xMessage = fsToText(await this.xEval(xStatement.message, xContext)).trim();
        const xObject = xStatement.ref
          ? await this.xResolveObject(xStatement.ref, xContext)
          : xContext.me;
        await this.sendMessage(xMessage, xObject);
        return null;
      }

      case "command": {
        const xArgs = [];

        for (const xArg of xStatement.args) {
          xArgs.push(await this.xEval(xArg, xContext));
        }

        const xOutcome = await this.xDispatch(
          xStatement.name, xContext.me, xArgs, xContext.target, "handlers"
        );

        if (!xOutcome.handled && !SYSTEM_MESSAGES.has(xStatement.name)) {
          throw new ScriptError(`「${xStatement.name}」という命令はありません。`);
        }

        return null;
      }

      case "if": {
        const xCondition = fsToBoolean(await this.xEval(xStatement.cond, xContext));
        return this.xExecBlock(xCondition ? xStatement.then : xStatement.else, xContext);
      }

      case "repeat":
        return this.xRunRepeat(xStatement, xContext);

      default:
        throw new ScriptError(`未対応の文です：${xStatement.k}`);
    }
  }

  async xRunRepeat(xStatement, xContext) {
    // 1回分を実行し、"break" / "continue" / 外へ伝える信号 のどれかを返す。
    const xRunBody = async () => {
      await this.xTick();
      const xSignal = await this.xExecBlock(xStatement.body, xContext);

      if (xSignal?.type === "exitRepeat") {
        return "break";
      }

      if (!xSignal || xSignal.type === "nextRepeat") {
        return "continue";
      }

      return xSignal;
    };

    const xCheck = async () => fsToBoolean(await this.xEval(xStatement.cond, xContext));

    const xLoop = async (xShouldContinue) => {
      while (await xShouldContinue()) {
        const xOutcome = await xRunBody();

        if (xOutcome === "break") {
          return null;
        }

        if (xOutcome !== "continue") {
          return xOutcome;
        }
      }

      return null;
    };

    switch (xStatement.mode) {
      case "forever":
        return xLoop(async () => true);

      case "while":
        return xLoop(xCheck);

      case "until":
        return xLoop(async () => !(await xCheck()));

      case "count": {
        const xCount = fsToNumber(await this.xEval(xStatement.count, xContext));
        let xIndex = 0;
        return xLoop(async () => xIndex++ < xCount);
      }

      default: {
        let xValue = fsToNumber(await this.xEval(xStatement.from, xContext));
        const xEnd = fsToNumber(await this.xEval(xStatement.to, xContext));
        const xStep = xStatement.down ? -1 : 1;
        let xFirst = true;

        return xLoop(async () => {
          if (!xFirst) {
            xValue = fsToNumber(this.xGetVar(xStatement.variable, xContext)) + xStep;
          }

          xFirst = false;
          this.xSetVar(xStatement.variable, xValue, xContext);
          return xStatement.down ? xValue >= xEnd : xValue <= xEnd;
        });
      }
    }
  }

  // 中断できるよう、細かく区切って待つ。
  async xWait(xMs) {
    const xEnd = Date.now() + xMs;

    while (Date.now() < xEnd) {
      if (this.aborted) {
        throw new AbortScript();
      }

      await xSleep(Math.min(100, xEnd - Date.now()));
    }
  }

  // ---- 変数と書き込み先 ----

  xGetVar(xName, xContext) {
    if (xContext.globalNames.has(xName)) {
      return this.globals.get(xName);
    }

    if (xContext.vars.has(xName)) {
      return xContext.vars.get(xName);
    }

    // HyperTalk と同じく、値の入っていない名前はその名前の文字列として扱う。
    return xName === "it" ? "" : xName;
  }

  xSetVar(xName, xValue, xContext) {
    if (xContext.globalNames.has(xName)) {
      this.globals.set(xName, xValue);
    } else {
      xContext.vars.set(xName, xValue);
    }
  }

  async xReadContainer(xDest, xContext) {
    if (xDest.k === "var") {
      return this.xGetVar(xDest.name, xContext);
    }

    if (xDest.k === "msg") {
      return this.host.getMessage();
    }

    return this.xValueOf(await this.xResolveObject(xDest, xContext));
  }

  async xWriteContainer(xDest, xPrep, xValue, xContext) {
    const xCurrent = xPrep === "into" ? "" : fsToText(await this.xReadContainer(xDest, xContext));
    let xNewValue = xValue;

    if (xPrep === "after") {
      xNewValue = xCurrent + fsToText(xValue);
    } else if (xPrep === "before") {
      xNewValue = fsToText(xValue) + xCurrent;
    }

    if (xDest.k === "var") {
      this.xSetVar(xDest.name, xNewValue, xContext);
      return;
    }

    if (xDest.k === "msg") {
      this.host.setMessage(fsToText(xNewValue));
      return;
    }

    const xObject = await this.xResolveObject(xDest, xContext);

    if (xObject.kind !== "part") {
      throw new ScriptError("ボタンかフィールドを指定してください。");
    }

    fsSetFieldText(xObject.part, xObject.card, xObject.isBackground, fsToText(xNewValue));
    this.host.changed();
  }

  // ---- オブジェクトの特定 ----

  xCurrentCard() {
    return this.host.getStack().cards[this.host.getCardIndex()];
  }

  async xResolveCardIndex(xRef, xContext) {
    if (xRef.type === "me" || xRef.type === "target") {
      const xObject = xRef.type === "me" ? xContext.me : xContext.target;

      if (xObject.kind !== "card") {
        throw new ScriptError("カードを指定してください。");
      }

      return this.host.getStack().cards.indexOf(xObject.card);
    }

    const xCards = this.host.getStack().cards;
    const xCurrent = this.host.getCardIndex();
    const xCount = xCards.length;

    switch (xRef.which) {
      case "this":
        return xCurrent;
      case "next":
        return (xCurrent + 1) % xCount;
      case "prev":
        return (xCurrent - 1 + xCount) % xCount;
      case "first":
        return 0;
      case "last":
        return xCount - 1;
      default:
        break;
    }

    const xKey = await this.xEval(xRef.which, xContext);

    if (fsIsNumeric(xKey)) {
      const xIndex = Math.trunc(fsToNumber(xKey)) - 1;

      if (xIndex < 0 || xIndex >= xCount) {
        throw new ScriptError(`カード ${fsToText(xKey)} はありません。`);
      }

      return xIndex;
    }

    const xName = fsToText(xKey).toLowerCase();
    const xIndex = xCards.findIndex((xCard) => xCard.name.toLowerCase() === xName);

    if (xIndex < 0) {
      throw new ScriptError(`カード「${fsToText(xKey)}」が見つかりません。`);
    }

    return xIndex;
  }

  async xResolveObject(xRef, xContext) {
    switch (xRef.type) {
      case "me":
        return xContext.me;

      case "target":
        return xContext.target;

      case "stack":
        return { kind: "stack" };

      case "card": {
        const xIndex = await this.xResolveCardIndex(xRef, xContext);
        return { kind: "card", card: this.host.getStack().cards[xIndex] };
      }

      case "background":
        return { kind: "background", background: this.xCurrentBackground() };

      default: {
        const xCard = this.xCurrentCard();
        const xKey = await this.xEval(xRef.which, xContext);

        // 「card」「bg」の指定がなければ、カードの部品を探し、なければ背景の部品を探す。
        const xLayers = xRef.layer === "auto" ? ["card", "background"] : [xRef.layer];

        for (const xLayer of xLayers) {
          const xPart = this.xFindPart(this.xPartsOf(xLayer, xRef.type), xKey);

          if (xPart) {
            return { kind: "part", part: xPart, card: xCard, isBackground: xLayer === "background" };
          }
        }

        const xLabel = `${xRef.layer === "background" ? "背景" : ""}${PART_LABELS[xRef.type]}`;
        throw new ScriptError(`${xLabel}「${fsToText(xKey)}」が見つかりません。`);
      }
    }
  }

  xCurrentBackground() {
    return fsBackgroundOf(this.host.getStack(), this.xCurrentCard());
  }

  xPartsOf(xLayer, xType) {
    const xOwner = xLayer === "background" ? this.xCurrentBackground() : this.xCurrentCard();
    return xOwner.parts.filter((xPart) => xPart.type === xType);
  }

  // 数なら何番目か、文字なら名前で探す。
  xFindPart(xParts, xKey) {
    if (fsIsNumeric(xKey)) {
      return xParts[Math.trunc(fsToNumber(xKey)) - 1];
    }

    const xName = fsToText(xKey).toLowerCase();
    return xParts.find((xPart) => xPart.name.toLowerCase() === xName);
  }

  async xResolvePart(xRef, xContext) {
    const xObject = await this.xResolveObject(xRef, xContext);

    if (xObject.kind !== "part") {
      throw new ScriptError("ボタンかフィールドを指定してください。");
    }

    return xObject.part;
  }

  xValueOf(xObject) {
    switch (xObject.kind) {
      case "part":
        return fsFieldText(xObject.part, xObject.card, xObject.isBackground);
      case "card":
        return xObject.card.name;
      case "background":
        return xObject.background.name;
      case "stack":
        return this.host.getStack().stack.name;
      default:
        return "";
    }
  }

  xGetProperty(xObject, xProp) {
    const xStack = this.host.getStack();

    if (xObject.kind === "part") {
      const xPart = xObject.part;

      switch (xProp) {
        case "name":
          return xPart.name;
        case "text":
          return fsFieldText(xPart, xObject.card, xObject.isBackground);
        case "sharedtext":
          return xPart.sharedText;
        case "visible":
          return xPart.visible;
        case "locktext":
          return xPart.lockText;
        case "style":
          return xPart.style;
        case "textsize":
          return xPart.textSize;
        case "sound":
          return xPart.sound;
        case "left":
        case "top":
        case "width":
        case "height":
          return xPart[xProp];
        case "id":
          return xPart.id;
        case "number": {
          const xLayer = xObject.isBackground ? "background" : "card";
          return this.xPartsOf(xLayer, xPart.type).indexOf(xPart) + 1;
        }
        case "script":
          return xPart.script;
        default:
          break;
      }
    } else if (xObject.kind === "card") {
      switch (xProp) {
        case "name":
          return xObject.card.name;
        case "number":
          return xStack.cards.indexOf(xObject.card) + 1;
        case "id":
          return xObject.card.id;
        case "script":
          return xObject.card.script;
        default:
          break;
      }
    } else if (xObject.kind === "background") {
      if (xProp === "name" || xProp === "id" || xProp === "script") {
        return xObject.background[xProp];
      }
    } else if (xObject.kind === "stack") {
      if (xProp === "name") {
        return xStack.stack.name;
      }

      if (xProp === "script") {
        return xStack.stack.script;
      }
    }

    throw new ScriptError(`${this.xDescribe(xObject)}に「${xProp}」はありません。`);
  }

  xSetProperty(xObject, xProp, xValue) {
    if (xObject.kind === "part") {
      const xPart = xObject.part;

      switch (xProp) {
        case "name":
          xPart.name = fsToText(xValue);
          return;
        case "text":
          fsSetFieldText(xPart, xObject.card, xObject.isBackground, fsToText(xValue));
          return;
        case "sharedtext":
          xPart.sharedText = fsToBoolean(xValue);
          return;
        case "visible":
          xPart.visible = fsToBoolean(xValue);
          return;
        case "locktext":
          xPart.lockText = fsToBoolean(xValue);
          return;
        case "sound":
          xPart.sound = fsToText(xValue).trim().toLowerCase();
          return;
        case "textsize":
          xPart.textSize = fsClampTextSize(fsToNumber(xValue));
          return;
        case "left":
        case "top":
          xPart[xProp] = Math.round(fsToNumber(xValue));
          return;
        case "width":
        case "height":
          xPart[xProp] = Math.max(MIN_PART_SIZE, Math.round(fsToNumber(xValue)));
          return;
        default:
          break;
      }
    } else if (xObject.kind === "card" && xProp === "name") {
      xObject.card.name = fsToText(xValue);
      return;
    } else if (xObject.kind === "background" && xProp === "name") {
      xObject.background.name = fsToText(xValue);
      return;
    } else if (xObject.kind === "stack" && xProp === "name") {
      this.host.getStack().stack.name = fsToText(xValue);
      return;
    }

    throw new ScriptError(`${this.xDescribe(xObject)}の「${xProp}」は変更できません。`);
  }

  // ---- 式の評価 ----

  async xEval(xNode, xContext) {
    switch (xNode.k) {
      case "lit":
        return xNode.v;

      case "var":
        return this.xGetVar(xNode.name, xContext);

      case "un": {
        const xValue = await this.xEval(xNode.a, xContext);
        return xNode.op === "not" ? !fsToBoolean(xValue) : -fsToNumber(xValue);
      }

      case "bin":
        return this.xEvalBinary(xNode, xContext);

      case "call":
        return this.xCall(xNode, xContext);

      case "the":
        return this.xEvalThe(xNode);

      case "prop":
        return this.xGetProperty(await this.xResolveObject(xNode.ref, xContext), xNode.prop);

      case "refval":
        return this.xValueOf(await this.xResolveObject(xNode.ref, xContext));

      case "chunk": {
        const xItems = fsSplitChunks(fsToText(await this.xEval(xNode.of, xContext)), xNode.unit);
        const xFrom = Math.trunc(fsToNumber(await this.xEval(xNode.from, xContext)));
        const xTo = xNode.to ? Math.trunc(fsToNumber(await this.xEval(xNode.to, xContext))) : xFrom;

        if (xFrom < 1 || xTo < xFrom) {
          return "";
        }

        return xItems.slice(xFrom - 1, xTo).join(CHUNK_JOINERS[xNode.unit]);
      }

      case "count": {
        if (xNode.what === "card") {
          return this.host.getStack().cards.length;
        }

        if (xNode.what === "button" || xNode.what === "field") {
          return this.xPartsOf(xNode.layer, xNode.what).length;
        }

        return fsSplitChunks(fsToText(await this.xEval(xNode.of, xContext)), xNode.what).length;
      }

      default:
        throw new ScriptError(`未対応の式です：${xNode.k}`);
    }
  }

  async xEvalBinary(xNode, xContext) {
    if (xNode.op === "and") {
      return fsToBoolean(await this.xEval(xNode.a, xContext))
        && fsToBoolean(await this.xEval(xNode.b, xContext));
    }

    if (xNode.op === "or") {
      return fsToBoolean(await this.xEval(xNode.a, xContext))
        || fsToBoolean(await this.xEval(xNode.b, xContext));
    }

    const xA = await this.xEval(xNode.a, xContext);
    const xB = await this.xEval(xNode.b, xContext);

    switch (xNode.op) {
      case "&":
        return fsToText(xA) + fsToText(xB);
      case "&&":
        return `${fsToText(xA)} ${fsToText(xB)}`;
      case "+":
        return fsToNumber(xA) + fsToNumber(xB);
      case "-":
        return fsToNumber(xA) - fsToNumber(xB);
      case "*":
        return fsToNumber(xA) * fsToNumber(xB);
      case "^":
        return fsToNumber(xA) ** fsToNumber(xB);
      case "/":
      case "div":
      case "mod": {
        const xDivisor = fsToNumber(xB);

        if (xDivisor === 0) {
          throw new ScriptError("0 で割ることはできません。");
        }

        const xDividend = fsToNumber(xA);

        if (xNode.op === "/") {
          return xDividend / xDivisor;
        }

        return xNode.op === "div" ? Math.trunc(xDividend / xDivisor) : xDividend % xDivisor;
      }
      case "=":
        return fsEquals(xA, xB);
      case "<>":
        return !fsEquals(xA, xB);
      case "<":
        return fsCompare(xA, xB) < 0;
      case ">":
        return fsCompare(xA, xB) > 0;
      case "<=":
        return fsCompare(xA, xB) <= 0;
      case ">=":
        return fsCompare(xA, xB) >= 0;
      case "contains":
        return fsToText(xA).toLowerCase().includes(fsToText(xB).toLowerCase());
      case "in":
        return fsToText(xB).toLowerCase().includes(fsToText(xA).toLowerCase());
      case "notin":
        return !fsToText(xB).toLowerCase().includes(fsToText(xA).toLowerCase());
      default:
        throw new ScriptError(`未対応の演算子です：${xNode.op}`);
    }
  }

  async xCall(xNode, xContext) {
    const xArgs = [];

    for (const xArg of xNode.args) {
      xArgs.push(await this.xEval(xArg, xContext));
    }

    // 自作の function を先に探し、なければ組み込み関数を使う。
    const xOutcome = await this.xDispatch(xNode.name, xContext.me, xArgs, xContext.target, "functions");

    if (xOutcome.handled) {
      return xOutcome.value;
    }

    const xBuiltin = BUILTIN_FUNCTIONS[xNode.name];

    if (!xBuiltin) {
      throw new ScriptError(`「${xNode.name}」という関数はありません。`);
    }

    return xBuiltin(xArgs);
  }

  xEvalThe(xNode) {
    const xNow = new Date();
    const xLong = xNode.adj === "long";

    switch (xNode.name) {
      case "date":
        return xNow.toLocaleDateString("ja-JP", xLong
          ? { year: "numeric", month: "long", day: "numeric", weekday: "long" }
          : undefined);
      case "time":
        return xNow.toLocaleTimeString("ja-JP", xLong
          ? undefined
          : { hour: "2-digit", minute: "2-digit" });
      case "seconds":
        return Math.floor(xNow.getTime() / 1000);
      case "ticks":
        return Math.floor(performance.now() * 60 / 1000);
      case "result":
        return this.result;
      default:
        throw new ScriptError(`「the ${xNode.name}」は使えません。`);
    }
  }
}
