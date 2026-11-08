/*
 * スクリプトの実行系。メッセージをオブジェクトに渡し、受け取ったハンドラの文を順に実行する。
 *
 * 画面側（host）は次のメソッドを用意する。
 *   getStack(), getCardIndex()        今のスタックとカードの番号（0から数える）
 *   goToCard(index, effect), goBack(effect)
 *                                     カードを移る。effect は visual effect の { name, speed }、指定がなければ null
 *   goStack(path)                     別のスタックを開く（待たない。開けたかどうかは画面側が知らせる）
 *   changed()                         スクリプトがスタックのデータを書き換えた
 *   getMessage(), setMessage(text)    メッセージボックス
 *   answer(text, buttons), ask(text, default)
 *                                     ダイアログ。ask はキャンセルなら null
 *   beep(), play(name)                音を鳴らし、音の長さ（ミリ秒）を返す。play は知らない音なら null
 *   doMenu(label)                     メニュー項目を選ぶ。"done" / "missing" / "disabled" を返す
 *   openUrl(url)                      別のページで URL を開く
 *   reportError(error)                ScriptError を画面に出す
 */
import { OPEN_URL_PROTOCOLS, SCRIPT_RUNTIME } from "../config/AppConfig.js";
import { fsSetFieldText } from "../model/StackModel.js";
import { ExpressionEvaluator, fsEnsureNonZeroDivisor } from "./ExpressionEvaluator.js";
import { HandlerContext } from "./HandlerContext.js";
import { ObjectResolver } from "./ObjectResolver.js";
import { fsSetProperty } from "./ObjectProperties.js";
import { fsParseScript } from "./Parser.js";
import { ScriptAborted, ScriptError, ScriptExitedToTop } from "./ScriptError.js";
import { CONTAINER_KIND, FLOW_SIGNAL, REPEAT_MODE, STATEMENT_KIND } from "./ScriptNodes.js";
import { PUT_PREPOSITION, WAIT_UNIT } from "./ScriptVocabulary.js";
import { fsToBoolean, fsToNumber, fsToText } from "./ScriptValues.js";

// どのハンドラも受け取らなくてもエラーにしないメッセージ（命令として書いたときも）。
const SYSTEM_MESSAGES = new Set(["mouseup", "mousedown", "opencard", "closecard", "openstack", "closestack"]);

// host.doMenu の結果（js/ui/MenuBar.js の MENU_CHOICE と同じ値）。選べたときは "done"。
const DO_MENU_OUTCOME = { missing: "missing", disabled: "disabled" };

// ハンドラの表の種類（解析結果の handlers / functions）。
const HANDLER_TABLE = { messages: "handlers", functions: "functions" };

// wait の単位ごとの、1あたりのミリ秒。
const MILLISECONDS_PER_WAIT_UNIT = {
  [WAIT_UNIT.second]: 1000,
  [WAIT_UNIT.millisecond]: 1,
  [WAIT_UNIT.tick]: 1000 / 60
};

// add / subtract / multiply の計算。divide は 0 で割れないので別に扱う。
const ARITHMETIC_STATEMENTS = {
  add: (xCurrent, xValue) => xCurrent + xValue,
  subtract: (xCurrent, xValue) => xCurrent - xValue,
  multiply: (xCurrent, xValue) => xCurrent * xValue
};

// ask でキャンセルしたときの the result。
const CANCEL_RESULT = "Cancel";

// 文の種類と、それを実行するメソッドの名前。
const STATEMENT_RUNNERS = {
  [STATEMENT_KIND.put]: "runPut",
  [STATEMENT_KIND.get]: "runGet",
  [STATEMENT_KIND.visualEffect]: "runVisualEffect",
  [STATEMENT_KIND.go]: "runGo",
  [STATEMENT_KIND.goBack]: "runGo",
  [STATEMENT_KIND.goStack]: "runGoStack",
  [STATEMENT_KIND.answer]: "runAnswer",
  [STATEMENT_KIND.ask]: "runAsk",
  [STATEMENT_KIND.beep]: "runBeep",
  [STATEMENT_KIND.play]: "runPlay",
  [STATEMENT_KIND.openUrl]: "runOpenUrl",
  [STATEMENT_KIND.doMenu]: "runDoMenu",
  [STATEMENT_KIND.wait]: "runWait",
  [STATEMENT_KIND.hide]: "runVisibility",
  [STATEMENT_KIND.show]: "runVisibility",
  [STATEMENT_KIND.set]: "runSet",
  [STATEMENT_KIND.arithmetic]: "runArithmetic",
  [STATEMENT_KIND.global]: "runGlobal",
  [STATEMENT_KIND.return]: "runReturn",
  [STATEMENT_KIND.pass]: "runFlowSignal",
  [STATEMENT_KIND.exitHandler]: "runFlowSignal",
  [STATEMENT_KIND.exitRepeat]: "runFlowSignal",
  [STATEMENT_KIND.nextRepeat]: "runFlowSignal",
  [STATEMENT_KIND.exitToTop]: "runExitToTop",
  [STATEMENT_KIND.send]: "runSend",
  [STATEMENT_KIND.command]: "runCommand",
  [STATEMENT_KIND.if]: "runIf",
  [STATEMENT_KIND.repeat]: "runRepeat"
};

// 文がそのままハンドラの終わり方になるもの。
const FLOW_SIGNAL_OF_STATEMENT = {
  [STATEMENT_KIND.pass]: FLOW_SIGNAL.pass,
  [STATEMENT_KIND.exitHandler]: FLOW_SIGNAL.exitHandler,
  [STATEMENT_KIND.exitRepeat]: FLOW_SIGNAL.exitRepeat,
  [STATEMENT_KIND.nextRepeat]: FLOW_SIGNAL.nextRepeat
};

// repeat の1回分の結果。
const LOOP_STEP = { stop: "stop", continue: "continue" };

const fsSleep = (xMilliseconds) => new Promise((xResolve) => setTimeout(xResolve, xMilliseconds));

export class Interpreter {
  constructor(xHost) {
    this.host = xHost;
    // global で宣言した変数（名前 → 値）。スタックを開き直すまで残る。
    this.globals = new Map();
    // 解析したスクリプト（スクリプトの文字 → 解析結果）。同じスクリプトを何度も解析しない。
    this.parsedScripts = new Map();
    // 実行中のメッセージの入れ子の深さ。0 なら何も実行していない。
    this.depth = 0;
    this.steps = 0;
    this.aborted = false;
    // the result の値。
    this.result = "";
    // visual effect で指定した、次の1回の go の効果。
    this.visualEffect = null;
    this.resolver = new ObjectResolver(xHost, (xExpression, xContext) => this.evaluator.evaluate(xExpression, xContext));
    this.evaluator = new ExpressionEvaluator({
      resolver: this.resolver,
      callUserFunction: (xName, xArgs, xContext) =>
        this.dispatch(xName, xContext.me, xArgs, xContext.target, HANDLER_TABLE.functions),
      readResult: () => this.result,
      readMessage: () => this.host.getMessage()
    });
  }

  get busy() {
    return this.depth > 0;
  }

  // 実行中のスクリプトを止める（次の文に進むとき、または wait の途中で止まる）。
  abort() {
    if (this.depth > 0) {
      this.aborted = true;
    }
  }

  clearGlobals() {
    this.globals.clear();
  }

  // 画面からもスクリプトからも使う入口。エラーは一番外側の呼び出しでだけ画面に出す。
  // { handled（どれかのハンドラが受け取ったか）, value（return の値） } を返す。
  async sendMessage(xMessage, xTarget, xArgs = []) {
    const xIsOutermost = this.depth === 0;

    if (xIsOutermost) {
      this.steps = 0;
      this.aborted = false;
      this.visualEffect = null;
    }

    this.depth += 1;

    try {
      return await this.dispatch(xMessage.toLowerCase(), xTarget, xArgs, xTarget, HANDLER_TABLE.messages);
    } catch (xError) {
      if (!xIsOutermost) {
        throw xError;
      }

      if (!(xError instanceof ScriptAborted) && !(xError instanceof ScriptExitedToTop)) {
        this.host.reportError(xError);
      }

      return { handled: true, value: "" };
    } finally {
      this.depth -= 1;
    }
  }

  // ---- メッセージの受け渡し ----

  // スクリプトを解析する（結果は覚えておく）。スクリプトが空なら null。
  parsedScriptOf(xObject) {
    const xScript = this.resolver.scriptOf(xObject);

    if (typeof xScript !== "string" || xScript.trim() === "") {
      return null;
    }

    if (!this.parsedScripts.has(xScript)) {
      try {
        this.parsedScripts.set(xScript, fsParseScript(xScript));
      } catch (xError) {
        if (xError instanceof ScriptError) {
          xError.where = this.resolver.describe(xObject);
        }

        throw xError;
      }
    }

    return this.parsedScripts.get(xScript);
  }

  // start から順に（部品 → カード → 背景 → スタック）、名前の合うハンドラを探して実行する。
  // pass されたら次へ渡す。tableName はメッセージのハンドラか関数か。
  async dispatch(xName, xStart, xArgs, xTarget, xTableName) {
    for (const xObject of this.resolver.messagePathOf(xStart)) {
      const xHandler = this.parsedScriptOf(xObject)?.[xTableName].get(xName);

      if (!xHandler) {
        continue;
      }

      const xOutcome = await this.runHandler(xHandler, xObject, xTarget, xArgs);

      if (!xOutcome.passed) {
        return { handled: true, value: xOutcome.value };
      }
    }

    return { handled: false, value: "" };
  }

  async runHandler(xHandler, xObject, xTarget, xArgs) {
    const xContext = new HandlerContext(xObject, xTarget, this.globals);

    xHandler.params.forEach((xParameterName, xIndex) => {
      xContext.setVariable(xParameterName, xArgs[xIndex] ?? "");
    });

    try {
      const xEnding = await this.runBlock(xHandler.body, xContext);

      if (xEnding?.signal === FLOW_SIGNAL.pass) {
        return { passed: true };
      }

      return { passed: false, value: xEnding?.signal === FLOW_SIGNAL.return ? xEnding.value : "" };
    } catch (xError) {
      if (xError instanceof ScriptError && !xError.where) {
        xError.where = this.resolver.describe(xObject);
      }

      throw xError;
    }
  }

  // ---- 文の実行 ----

  // 文を1つ実行するたびに呼ぶ。中断・回数の上限を確かめ、ときどきブラウザに処理を返す。
  async countStep() {
    this.steps += 1;

    if (this.aborted) {
      throw new ScriptAborted();
    }

    if (this.steps > SCRIPT_RUNTIME.maxSteps) {
      throw new ScriptError("処理の回数が多すぎるため止めました。");
    }

    if (this.steps % SCRIPT_RUNTIME.stepsBetweenYields === 0) {
      await fsSleep(0);
    }
  }

  // 文を順に実行する。途中でハンドラの終わり方（return など）が出たら、そこで止めて返す。
  async runBlock(xStatements, xContext) {
    for (const xStatement of xStatements) {
      const xEnding = await this.runStatement(xStatement, xContext);

      if (xEnding) {
        return xEnding;
      }
    }

    return null;
  }

  async runStatement(xStatement, xContext) {
    try {
      await this.countStep();
      const xRunnerName = STATEMENT_RUNNERS[xStatement.kind];

      if (!xRunnerName) {
        throw new ScriptError(`未対応の文です：${xStatement.kind}`);
      }

      return await this[xRunnerName](xStatement, xContext);
    } catch (xError) {
      // 行の分からないエラー（値の読み替えなど）には、この文の行を付ける。
      if (xError instanceof ScriptError && xError.line === null) {
        xError.line = xStatement.line;
      }

      throw xError;
    }
  }

  evaluate(xExpression, xContext) {
    return this.evaluator.evaluate(xExpression, xContext);
  }

  async evaluateText(xExpression, xContext) {
    return fsToText(await this.evaluate(xExpression, xContext));
  }

  async evaluateTrimmedText(xExpression, xContext) {
    return (await this.evaluateText(xExpression, xContext)).trim();
  }

  async runPut(xStatement, xContext) {
    const xValue = await this.evaluate(xStatement.value, xContext);
    await this.writeContainer(xStatement.destination, xStatement.preposition, xValue, xContext);
    return null;
  }

  async runGet(xStatement, xContext) {
    xContext.setIt(await this.evaluate(xStatement.value, xContext));
    return null;
  }

  runVisualEffect(xStatement) {
    this.visualEffect = xStatement.effect;
    return null;
  }

  // visual effect の効果は、次の1回の go（go back も）にだけ使う。
  async runGo(xStatement, xContext) {
    const xEffect = this.visualEffect;
    this.visualEffect = null;

    if (xStatement.kind === STATEMENT_KIND.goBack) {
      await this.host.goBack(xEffect);
    } else {
      await this.host.goToCard(await this.resolver.resolveCardIndex(xStatement.target, xContext), xEffect);
    }

    return null;
  }

  // 別のスタックを開く。スタックが置き換わるので、このスクリプトはここで止める。
  async runGoStack(xStatement, xContext) {
    const xPath = await this.evaluateTrimmedText(xStatement.path, xContext);

    if (!xPath) {
      throw new ScriptError("開くスタックのパスが空です。", xStatement.line);
    }

    this.host.goStack(xPath);
    throw new ScriptExitedToTop();
  }

  // 押したボタンの文字を it に入れる。ボタンを指定しなければ「OK」だけ。
  async runAnswer(xStatement, xContext) {
    const xPrompt = await this.evaluateText(xStatement.prompt, xContext);
    const xButtons = [];

    for (const xButton of xStatement.buttons) {
      xButtons.push(await this.evaluateText(xButton, xContext));
    }

    xContext.setIt(await this.host.answer(xPrompt, xButtons.length > 0 ? xButtons : ["OK"]));
    return null;
  }

  // 入力を it に入れる。キャンセルなら it は空、the result は Cancel。
  async runAsk(xStatement, xContext) {
    const xPrompt = await this.evaluateText(xStatement.prompt, xContext);
    const xDefaultValue = xStatement.defaultValue ? await this.evaluateText(xStatement.defaultValue, xContext) : "";
    const xReply = await this.host.ask(xPrompt, xDefaultValue);

    xContext.setIt(xReply ?? "");
    this.result = xReply === null ? CANCEL_RESULT : "";
    return null;
  }

  // 次の音は前の音が鳴り終わってから鳴らす。
  async runBeep(xStatement, xContext) {
    const xRequestedCount = xStatement.count
      ? Math.max(1, Math.trunc(fsToNumber(await this.evaluate(xStatement.count, xContext))))
      : 1;
    const xCount = Math.min(xRequestedCount, SCRIPT_RUNTIME.maxBeepCount);

    for (let xIndex = 0; xIndex < xCount; xIndex += 1) {
      const xSoundLength = this.host.beep() || 0;
      await this.wait(Math.max(SCRIPT_RUNTIME.minBeepInterval, xSoundLength));
    }

    return null;
  }

  // 音は鳴らしたまま、すぐ次の行へ進む（オリジナルの HyperCard と同じ）。
  async runPlay(xStatement, xContext) {
    const xSoundName = await this.evaluateTrimmedText(xStatement.sound, xContext);

    if (this.host.play(xSoundName) === null) {
      throw new ScriptError(`「${xSoundName}」という音はありません。`, xStatement.line);
    }

    return null;
  }

  // URL を別のページ（タブ）で開く。相対URLはこのページの場所を基準にする。
  async runOpenUrl(xStatement, xContext) {
    const xText = await this.evaluateTrimmedText(xStatement.url, xContext);
    let xUrl;

    try {
      xUrl = new URL(xText, globalThis.location?.href);
    } catch {
      throw new ScriptError(`「${xText}」はURLとして読めません。`, xStatement.line);
    }

    if (!OPEN_URL_PROTOCOLS.includes(xUrl.protocol)) {
      throw new ScriptError(`「${xUrl.protocol}」のURLは開けません（http / https / mailto / tel だけ）。`, xStatement.line);
    }

    this.host.openUrl(xUrl.href);
    return null;
  }

  // メニュー項目を選んだときと同じことをする。項目の処理の終わりは待たずに次の行へ進む
  // （ファイルを選ぶ画面は、押した操作の中で開く必要があるため）。
  async runDoMenu(xStatement, xContext) {
    const xLabel = await this.evaluateTrimmedText(xStatement.label, xContext);
    const xOutcome = this.host.doMenu(xLabel);

    if (xOutcome === DO_MENU_OUTCOME.missing) {
      throw new ScriptError(`「${xLabel}」というメニュー項目はありません。`, xStatement.line);
    }

    if (xOutcome === DO_MENU_OUTCOME.disabled) {
      throw new ScriptError(`「${xLabel}」は今は選べません。`, xStatement.line);
    }

    return null;
  }

  async runWait(xStatement, xContext) {
    const xAmount = fsToNumber(await this.evaluate(xStatement.amount, xContext));
    await this.wait(xAmount * MILLISECONDS_PER_WAIT_UNIT[xStatement.unit]);
    return null;
  }

  // hide / show。
  async runVisibility(xStatement, xContext) {
    const xPartObject = await this.resolver.resolveRequiredPart(xStatement.reference, xContext);
    xPartObject.part.visible = xStatement.kind === STATEMENT_KIND.show;
    this.host.changed();
    return null;
  }

  async runSet(xStatement, xContext) {
    const xObject = await this.resolver.resolveObject(xStatement.reference, xContext);
    const xValue = await this.evaluate(xStatement.value, xContext);
    fsSetProperty(xObject, xStatement.property, xValue, this.resolver);
    this.host.changed();
    return null;
  }

  // add / subtract / multiply / divide。今の値を先に数として読み、それから足す値などを読む。
  async runArithmetic(xStatement, xContext) {
    const xCurrent = fsToNumber(await this.readContainer(xStatement.destination, xContext));
    const xValue = fsToNumber(await this.evaluate(xStatement.value, xContext));
    let xResult;

    if (xStatement.operation === "divide") {
      fsEnsureNonZeroDivisor(xValue);
      xResult = xCurrent / xValue;
    } else {
      xResult = ARITHMETIC_STATEMENTS[xStatement.operation](xCurrent, xValue);
    }

    await this.writeContainer(xStatement.destination, PUT_PREPOSITION.into, xResult, xContext);
    return null;
  }

  runGlobal(xStatement, xContext) {
    xStatement.names.forEach((xName) => xContext.declareGlobal(xName));
    return null;
  }

  async runReturn(xStatement, xContext) {
    return { signal: FLOW_SIGNAL.return, value: await this.evaluate(xStatement.value, xContext) };
  }

  // pass / exit ハンドラ名 / exit repeat / next repeat。
  runFlowSignal(xStatement) {
    return { signal: FLOW_SIGNAL_OF_STATEMENT[xStatement.kind] };
  }

  runExitToTop() {
    throw new ScriptExitedToTop();
  }

  // send メッセージ [to オブジェクト]。送り先を省くと、このスクリプトを持つオブジェクトに送る。
  async runSend(xStatement, xContext) {
    const xMessage = await this.evaluateTrimmedText(xStatement.message, xContext);
    const xObject = xStatement.reference
      ? await this.resolver.resolveObject(xStatement.reference, xContext)
      : xContext.me;
    await this.sendMessage(xMessage, xObject);
    return null;
  }

  // 自作のハンドラを呼ぶ命令。どのハンドラも受け取らなければエラー（画面から送るメッセージは除く）。
  async runCommand(xStatement, xContext) {
    const xArgs = [];

    for (const xArgument of xStatement.args) {
      xArgs.push(await this.evaluate(xArgument, xContext));
    }

    const xOutcome = await this.dispatch(xStatement.name, xContext.me, xArgs, xContext.target, HANDLER_TABLE.messages);

    if (!xOutcome.handled && !SYSTEM_MESSAGES.has(xStatement.name)) {
      throw new ScriptError(`「${xStatement.name}」という命令はありません。`);
    }

    return null;
  }

  async runIf(xStatement, xContext) {
    const xCondition = fsToBoolean(await this.evaluate(xStatement.condition, xContext));
    return this.runBlock(xCondition ? xStatement.thenStatements : xStatement.elseStatements, xContext);
  }

  // ---- repeat ----

  // 中身を1回実行する。exit repeat なら stop、最後まで進んだか next repeat なら continue、
  // それ以外のハンドラの終わり方（return など）はそのまま返して外へ伝える。
  async runLoopBody(xStatement, xContext) {
    await this.countStep();
    const xEnding = await this.runBlock(xStatement.body, xContext);

    if (xEnding?.signal === FLOW_SIGNAL.exitRepeat) {
      return LOOP_STEP.stop;
    }

    if (!xEnding || xEnding.signal === FLOW_SIGNAL.nextRepeat) {
      return LOOP_STEP.continue;
    }

    return xEnding;
  }

  // shouldContinue() が true の間、中身を繰り返す。
  async runLoop(xStatement, xContext, xShouldContinue) {
    while (await xShouldContinue()) {
      const xStep = await this.runLoopBody(xStatement, xContext);

      if (xStep === LOOP_STEP.stop) {
        return null;
      }

      if (xStep !== LOOP_STEP.continue) {
        return xStep;
      }
    }

    return null;
  }

  async runRepeat(xStatement, xContext) {
    const xConditionHolds = async () => fsToBoolean(await this.evaluate(xStatement.condition, xContext));

    switch (xStatement.mode) {
      case REPEAT_MODE.forever:
        return this.runLoop(xStatement, xContext, async () => true);
      case REPEAT_MODE.while:
        return this.runLoop(xStatement, xContext, xConditionHolds);
      case REPEAT_MODE.until:
        return this.runLoop(xStatement, xContext, async () => !(await xConditionHolds()));
      case REPEAT_MODE.count:
        return this.runCountedRepeat(xStatement, xContext);
      default:
        return this.runRepeatWith(xStatement, xContext);
    }
  }

  // repeat [for] 回数 [times]。回数は最初に1回だけ求める。
  async runCountedRepeat(xStatement, xContext) {
    const xCount = fsToNumber(await this.evaluate(xStatement.count, xContext));
    let xDoneCount = 0;

    return this.runLoop(xStatement, xContext, async () => {
      const xShouldContinue = xDoneCount < xCount;
      xDoneCount += 1;
      return xShouldContinue;
    });
  }

  // repeat with 変数 = 始め [down] to 終わり。
  // 2回目からは変数の今の値から次の値を作るので、中身で変数を書き換えると、その続きから数える。
  async runRepeatWith(xStatement, xContext) {
    let xValue = fsToNumber(await this.evaluate(xStatement.from, xContext));
    const xEnd = fsToNumber(await this.evaluate(xStatement.to, xContext));
    const xStep = xStatement.down ? -1 : 1;
    let xIsFirst = true;

    return this.runLoop(xStatement, xContext, async () => {
      if (!xIsFirst) {
        xValue = fsToNumber(xContext.getVariable(xStatement.variable)) + xStep;
      }

      xIsFirst = false;
      xContext.setVariable(xStatement.variable, xValue);
      return xStatement.down ? xValue >= xEnd : xValue <= xEnd;
    });
  }

  // 中断できるよう、細かく区切って待つ。
  async wait(xMilliseconds) {
    const xEndTime = Date.now() + xMilliseconds;

    while (Date.now() < xEndTime) {
      if (this.aborted) {
        throw new ScriptAborted();
      }

      await fsSleep(Math.min(SCRIPT_RUNTIME.waitSlice, xEndTime - Date.now()));
    }
  }

  // ---- 書き込み先 ----

  async readContainer(xContainer, xContext) {
    if (xContainer.kind === CONTAINER_KIND.variable) {
      return xContext.getVariable(xContainer.name);
    }

    if (xContainer.kind === CONTAINER_KIND.message) {
      return this.host.getMessage();
    }

    return this.resolver.valueOf(await this.resolver.resolveObject(xContainer, xContext));
  }

  // into は置き換え、after / before は今の値の後ろ・前に足す。
  async writeContainer(xContainer, xPreposition, xValue, xContext) {
    const xNewValue = await this.combineWithCurrent(xContainer, xPreposition, xValue, xContext);

    if (xContainer.kind === CONTAINER_KIND.variable) {
      xContext.setVariable(xContainer.name, xNewValue);
      return;
    }

    if (xContainer.kind === CONTAINER_KIND.message) {
      this.host.setMessage(fsToText(xNewValue));
      return;
    }

    const xPartObject = await this.resolver.resolveRequiredPart(xContainer, xContext);
    fsSetFieldText(xPartObject.part, xPartObject.card, xPartObject.isBackground, fsToText(xNewValue));
    this.host.changed();
  }

  async combineWithCurrent(xContainer, xPreposition, xValue, xContext) {
    if (xPreposition === PUT_PREPOSITION.into) {
      return xValue;
    }

    const xCurrent = fsToText(await this.readContainer(xContainer, xContext));
    return xPreposition === PUT_PREPOSITION.after ? xCurrent + fsToText(xValue) : fsToText(xValue) + xCurrent;
  }
}
