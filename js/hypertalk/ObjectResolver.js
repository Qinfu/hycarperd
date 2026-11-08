/*
 * スクリプトの中のオブジェクトの指定（button "OK"、next card など）を、実際のスタックのデータに結び付ける。
 * 実行時のオブジェクトの形は ScriptNodes.js の OBJECT_KIND を参照。
 */
import { fsBackgroundOf, fsFieldText } from "../model/StackModel.js";
import { ScriptError } from "./ScriptError.js";
import { CARD_ORDINAL, OBJECT_KIND, PART_LAYER, REFERENCE_TYPE } from "./ScriptNodes.js";
import { fsIsNumeric, fsToNumber, fsToText } from "./ScriptValues.js";

// エラーのメッセージや、エラーの出どころに出す部品の呼び名。
const PART_TYPE_NAMES = { button: "ボタン", field: "フィールド" };
const BACKGROUND_PREFIX = "背景";

// 「card」「bg」の指定がないときに、部品を探す層の順番。
const AUTO_LAYER_ORDER = [PART_LAYER.card, PART_LAYER.background];

export class ObjectResolver {
  // host は Interpreter と同じ画面側の機能。evaluate(expression, context) は式の値を求める関数。
  constructor(xHost, xEvaluate) {
    this.host = xHost;
    this.evaluate = xEvaluate;
  }

  stack() {
    return this.host.getStack();
  }

  currentCard() {
    return this.stack().cards[this.host.getCardIndex()];
  }

  currentBackground() {
    return fsBackgroundOf(this.stack(), this.currentCard());
  }

  // 今のカード（または背景）の、ある種類の部品。並びは重なり順で、button 2 などの番号もこの順。
  partsOf(xLayer, xPartType) {
    const xOwner = xLayer === PART_LAYER.background ? this.currentBackground() : this.currentCard();
    return xOwner.parts.filter((xPart) => xPart.type === xPartType);
  }

  // 数なら何番目か、文字なら名前（大文字・小文字を区別しない）で探す。
  findPart(xParts, xKey) {
    if (fsIsNumeric(xKey)) {
      return xParts[Math.trunc(fsToNumber(xKey)) - 1];
    }

    const xName = fsToText(xKey).toLowerCase();
    return xParts.find((xPart) => xPart.name.toLowerCase() === xName);
  }

  // ---- カード ----

  // 順番の語（next など）から、カードの番号（0から数える）を求める。端では反対側の端へ回り込む。
  indexOfOrdinal(xOrdinal) {
    const xCurrentIndex = this.host.getCardIndex();
    const xCardCount = this.stack().cards.length;

    switch (xOrdinal) {
      case CARD_ORDINAL.this:
        return xCurrentIndex;
      case CARD_ORDINAL.next:
        return (xCurrentIndex + 1) % xCardCount;
      case CARD_ORDINAL.previous:
        return (xCurrentIndex - 1 + xCardCount) % xCardCount;
      case CARD_ORDINAL.first:
        return 0;
      case CARD_ORDINAL.last:
        return xCardCount - 1;
      default:
        return null;
    }
  }

  // 番号（1から数える）か名前で指定されたカードの番号（0から数える）。
  indexOfCardKey(xKey) {
    const xCards = this.stack().cards;

    if (fsIsNumeric(xKey)) {
      const xIndex = Math.trunc(fsToNumber(xKey)) - 1;

      if (xIndex < 0 || xIndex >= xCards.length) {
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

  // カードの指定から、カードの番号（0から数える）を求める。me / the target はカードのときだけ。
  async resolveCardIndex(xReference, xContext) {
    if (xReference.type === REFERENCE_TYPE.me || xReference.type === REFERENCE_TYPE.target) {
      const xObject = xReference.type === REFERENCE_TYPE.me ? xContext.me : xContext.target;

      if (xObject.kind !== OBJECT_KIND.card) {
        throw new ScriptError("カードを指定してください。");
      }

      return this.stack().cards.indexOf(xObject.card);
    }

    const xOrdinalIndex = this.indexOfOrdinal(xReference.which);

    if (xOrdinalIndex !== null) {
      return xOrdinalIndex;
    }

    return this.indexOfCardKey(await this.evaluate(xReference.which, xContext));
  }

  // ---- オブジェクト ----

  async resolveObject(xReference, xContext) {
    switch (xReference.type) {
      case REFERENCE_TYPE.me:
        return xContext.me;
      case REFERENCE_TYPE.target:
        return xContext.target;
      case REFERENCE_TYPE.stack:
        return { kind: OBJECT_KIND.stack };
      case REFERENCE_TYPE.card: {
        const xIndex = await this.resolveCardIndex(xReference, xContext);
        return { kind: OBJECT_KIND.card, card: this.stack().cards[xIndex] };
      }
      case REFERENCE_TYPE.background:
        return { kind: OBJECT_KIND.background, background: this.currentBackground() };
      default:
        return this.resolvePartObject(xReference, xContext);
    }
  }

  // 部品の指定から、今のカードでの部品のオブジェクトを求める。
  // 「card」「bg」の指定がなければ、カードの部品を探し、なければ背景の部品を探す。
  async resolvePartObject(xReference, xContext) {
    // 名前の式を求める間にカードが変わることもあるので（自作の関数の中で go したときなど）、先に控えておく。
    const xCard = this.currentCard();
    const xKey = await this.evaluate(xReference.which, xContext);
    const xLayers = xReference.layer === PART_LAYER.auto ? AUTO_LAYER_ORDER : [xReference.layer];

    for (const xLayer of xLayers) {
      const xPart = this.findPart(this.partsOf(xLayer, xReference.type), xKey);

      if (xPart) {
        return { kind: OBJECT_KIND.part, part: xPart, card: xCard, isBackground: xLayer === PART_LAYER.background };
      }
    }

    const xPrefix = xReference.layer === PART_LAYER.background ? BACKGROUND_PREFIX : "";
    throw new ScriptError(`${xPrefix}${PART_TYPE_NAMES[xReference.type]}「${fsToText(xKey)}」が見つかりません。`);
  }

  // ボタンかフィールドでなければならない指定（hide / show、put の書き込み先）から、部品のオブジェクトを求める。
  async resolveRequiredPart(xReference, xContext) {
    const xObject = await this.resolveObject(xReference, xContext);
    this.ensurePart(xObject);
    return xObject;
  }

  ensurePart(xObject) {
    if (xObject.kind !== OBJECT_KIND.part) {
      throw new ScriptError("ボタンかフィールドを指定してください。");
    }
  }

  // ---- オブジェクトの中身と呼び名 ----

  // field 1 などと書いたときの値。部品は文字、カード・背景・スタックは名前。
  valueOf(xObject) {
    switch (xObject.kind) {
      case OBJECT_KIND.part:
        return fsFieldText(xObject.part, xObject.card, xObject.isBackground);
      case OBJECT_KIND.card:
        return xObject.card.name;
      case OBJECT_KIND.background:
        return xObject.background.name;
      case OBJECT_KIND.stack:
        return this.stack().stack.name;
      default:
        return "";
    }
  }

  // エラーのメッセージに出す呼び名（例：背景ボタン「次へ」）。
  describe(xObject) {
    switch (xObject.kind) {
      case OBJECT_KIND.part: {
        const xPrefix = xObject.isBackground ? BACKGROUND_PREFIX : "";
        return `${xPrefix}${PART_TYPE_NAMES[xObject.part.type]}「${xObject.part.name}」`;
      }
      case OBJECT_KIND.card:
        return `カード「${xObject.card.name}」`;
      case OBJECT_KIND.background:
        return "背景";
      default:
        return "スタック";
    }
  }

  // オブジェクトのスクリプト。
  scriptOf(xObject) {
    switch (xObject.kind) {
      case OBJECT_KIND.part:
        return xObject.part.script;
      case OBJECT_KIND.card:
        return xObject.card.script;
      case OBJECT_KIND.background:
        return xObject.background.script;
      default:
        return this.stack().stack.script;
    }
  }

  // メッセージが渡る順番：部品 → カード → 背景 → スタック。
  messagePathOf(xObject) {
    const xPath = [xObject];
    let xCard = null;

    if (xObject.kind === OBJECT_KIND.part) {
      xCard = xObject.card;
      xPath.push({ kind: OBJECT_KIND.card, card: xCard });
    } else if (xObject.kind === OBJECT_KIND.card) {
      xCard = xObject.card;
    }

    if (xCard) {
      xPath.push({ kind: OBJECT_KIND.background, background: fsBackgroundOf(this.stack(), xCard) });
    }

    if (xObject.kind !== OBJECT_KIND.stack) {
      xPath.push({ kind: OBJECT_KIND.stack });
    }

    return xPath;
  }
}
