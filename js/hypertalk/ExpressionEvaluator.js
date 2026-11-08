/*
 * 式の値を求める。オブジェクトの指定は ObjectResolver、自作の関数の呼び出しは Interpreter に任せる。
 */
import { fsCallBuiltinFunction, fsHasBuiltinFunction } from "./BuiltinFunctions.js";
import { fsGetProperty } from "./ObjectProperties.js";
import { ScriptError } from "./ScriptError.js";
import { EXPRESSION_KIND, REFERENCE_TYPE } from "./ScriptNodes.js";
import { LONG_ADJECTIVE, WORD_OPERATOR } from "./ScriptVocabulary.js";
import {
  fsCompare,
  fsContainsText,
  fsEquals,
  fsExtractChunk,
  fsSplitChunks,
  fsToBoolean,
  fsToNumber,
  fsToText
} from "./ScriptValues.js";

// the date / the time の書式（日本語の表記）。
const DATE_LOCALE = "ja-JP";
const LONG_DATE_FORMAT = { year: "numeric", month: "long", day: "numeric", weekday: "long" };
const SHORT_TIME_FORMAT = { hour: "2-digit", minute: "2-digit" };
const MILLISECONDS_PER_SECOND = 1000;
const TICKS_PER_SECOND = 60;

// 算術の演算子。左右は数として読む（割り算は別に扱う）。
const ARITHMETIC_OPERATIONS = {
  "+": (xLeft, xRight) => xLeft + xRight,
  "-": (xLeft, xRight) => xLeft - xRight,
  "*": (xLeft, xRight) => xLeft * xRight,
  "^": (xLeft, xRight) => xLeft ** xRight
};

// 割り算の演算子。0 で割ることはできない。
const DIVISION_OPERATIONS = {
  "/": (xDividend, xDivisor) => xDividend / xDivisor,
  [WORD_OPERATOR.div]: (xDividend, xDivisor) => Math.trunc(xDividend / xDivisor),
  [WORD_OPERATOR.mod]: (xDividend, xDivisor) => xDividend % xDivisor
};

// 比較・連結・含むかの演算子。左右の値をそのまま渡す。
const VALUE_OPERATIONS = {
  "&": (xLeft, xRight) => fsToText(xLeft) + fsToText(xRight),
  "&&": (xLeft, xRight) => `${fsToText(xLeft)} ${fsToText(xRight)}`,
  "=": (xLeft, xRight) => fsEquals(xLeft, xRight),
  "<>": (xLeft, xRight) => !fsEquals(xLeft, xRight),
  "<": (xLeft, xRight) => fsCompare(xLeft, xRight) < 0,
  ">": (xLeft, xRight) => fsCompare(xLeft, xRight) > 0,
  "<=": (xLeft, xRight) => fsCompare(xLeft, xRight) <= 0,
  ">=": (xLeft, xRight) => fsCompare(xLeft, xRight) >= 0,
  [WORD_OPERATOR.contains]: (xLeft, xRight) => fsContainsText(xLeft, xRight),
  [WORD_OPERATOR.isIn]: (xLeft, xRight) => fsContainsText(xRight, xLeft),
  [WORD_OPERATOR.isNotIn]: (xLeft, xRight) => !fsContainsText(xRight, xLeft)
};

export const fsEnsureNonZeroDivisor = (xDivisor) => {
  if (xDivisor === 0) {
    throw new ScriptError("0 で割ることはできません。");
  }
};

export class ExpressionEvaluator {
  // resolver：ObjectResolver。
  // callUserFunction(name, args, context)：自作の function を探して呼ぶ。{ handled, value } を返す。
  // readResult()：the result の値。readMessage()：メッセージボックスの中身。
  constructor({ resolver, callUserFunction, readResult, readMessage }) {
    this.resolver = resolver;
    this.callUserFunction = callUserFunction;
    this.readResult = readResult;
    this.readMessage = readMessage;
  }

  async evaluate(xExpression, xContext) {
    switch (xExpression.kind) {
      case EXPRESSION_KIND.literal:
        return xExpression.value;
      case EXPRESSION_KIND.variable:
        return xContext.getVariable(xExpression.name);
      case EXPRESSION_KIND.unary:
        return this.evaluateUnary(xExpression, xContext);
      case EXPRESSION_KIND.binary:
        return this.evaluateBinary(xExpression, xContext);
      case EXPRESSION_KIND.call:
        return this.evaluateCall(xExpression, xContext);
      case EXPRESSION_KIND.theFunction:
        return this.evaluateTheFunction(xExpression);
      case EXPRESSION_KIND.property: {
        const xObject = await this.resolver.resolveObject(xExpression.reference, xContext);
        return fsGetProperty(xObject, xExpression.property, this.resolver);
      }
      case EXPRESSION_KIND.objectValue:
        return this.resolver.valueOf(await this.resolver.resolveObject(xExpression.reference, xContext));
      case EXPRESSION_KIND.chunk:
        return this.evaluateChunk(xExpression, xContext);
      case EXPRESSION_KIND.count:
        return this.evaluateCount(xExpression, xContext);
      case EXPRESSION_KIND.messageBox:
        return this.readMessage();
      default:
        throw new ScriptError(`未対応の式です：${xExpression.kind}`);
    }
  }

  async evaluateUnary(xExpression, xContext) {
    const xValue = await this.evaluate(xExpression.operand, xContext);
    return xExpression.operator === WORD_OPERATOR.not ? !fsToBoolean(xValue) : -fsToNumber(xValue);
  }

  async evaluateBinary(xExpression, xContext) {
    const { operator: xOperator } = xExpression;

    // and / or は、左だけで結果が決まれば右を求めない。
    if (xOperator === WORD_OPERATOR.and) {
      return fsToBoolean(await this.evaluate(xExpression.left, xContext))
        && fsToBoolean(await this.evaluate(xExpression.right, xContext));
    }

    if (xOperator === WORD_OPERATOR.or) {
      return fsToBoolean(await this.evaluate(xExpression.left, xContext))
        || fsToBoolean(await this.evaluate(xExpression.right, xContext));
    }

    const xLeft = await this.evaluate(xExpression.left, xContext);
    const xRight = await this.evaluate(xExpression.right, xContext);

    if (ARITHMETIC_OPERATIONS[xOperator]) {
      return ARITHMETIC_OPERATIONS[xOperator](fsToNumber(xLeft), fsToNumber(xRight));
    }

    if (DIVISION_OPERATIONS[xOperator]) {
      // 割る数を先に読んで確かめる（"abc" / 0 は、数でないことより先に 0 で割ることを知らせる）。
      const xDivisor = fsToNumber(xRight);
      fsEnsureNonZeroDivisor(xDivisor);
      return DIVISION_OPERATIONS[xOperator](fsToNumber(xLeft), xDivisor);
    }

    if (VALUE_OPERATIONS[xOperator]) {
      return VALUE_OPERATIONS[xOperator](xLeft, xRight);
    }

    throw new ScriptError(`未対応の演算子です：${xOperator}`);
  }

  // 自作の function を先に探し、なければ組み込み関数を使う。
  async evaluateCall(xExpression, xContext) {
    const xArgs = [];

    for (const xArgument of xExpression.args) {
      xArgs.push(await this.evaluate(xArgument, xContext));
    }

    const xOutcome = await this.callUserFunction(xExpression.name, xArgs, xContext);

    if (xOutcome.handled) {
      return xOutcome.value;
    }

    if (!fsHasBuiltinFunction(xExpression.name)) {
      throw new ScriptError(`「${xExpression.name}」という関数はありません。`);
    }

    return fsCallBuiltinFunction(xExpression.name, xArgs);
  }

  evaluateTheFunction(xExpression) {
    const xNow = new Date();
    const xIsLong = xExpression.adjective === LONG_ADJECTIVE;

    switch (xExpression.name) {
      case "date":
        return xNow.toLocaleDateString(DATE_LOCALE, xIsLong ? LONG_DATE_FORMAT : undefined);
      case "time":
        return xNow.toLocaleTimeString(DATE_LOCALE, xIsLong ? undefined : SHORT_TIME_FORMAT);
      case "seconds":
        return Math.floor(xNow.getTime() / MILLISECONDS_PER_SECOND);
      case "ticks":
        return Math.floor((performance.now() * TICKS_PER_SECOND) / MILLISECONDS_PER_SECOND);
      case "result":
        return this.readResult();
      default:
        throw new ScriptError(`「the ${xExpression.name}」は使えません。`);
    }
  }

  // 取り出し元・始まり・終わりの順に求める（関数の呼び出しなどで順番が結果に響くため、この順を保つ）。
  async evaluateChunk(xExpression, xContext) {
    const xSourceText = fsToText(await this.evaluate(xExpression.source, xContext));
    const xFrom = Math.trunc(fsToNumber(await this.evaluate(xExpression.from, xContext)));
    const xTo = xExpression.to ? Math.trunc(fsToNumber(await this.evaluate(xExpression.to, xContext))) : xFrom;
    return fsExtractChunk(xSourceText, xExpression.unit, xFrom, xTo);
  }

  async evaluateCount(xExpression, xContext) {
    if (xExpression.what === REFERENCE_TYPE.card) {
      return this.resolver.stack().cards.length;
    }

    if (xExpression.what === REFERENCE_TYPE.button || xExpression.what === REFERENCE_TYPE.field) {
      return this.resolver.partsOf(xExpression.layer, xExpression.what).length;
    }

    const xSourceText = fsToText(await this.evaluate(xExpression.source, xContext));
    return fsSplitChunks(xSourceText, xExpression.what).length;
  }
}
