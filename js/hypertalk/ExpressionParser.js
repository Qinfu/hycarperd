/*
 * 式と、オブジェクト（ボタン・フィールド・カードなど）の指定を読む。
 * 文の解析（Parser.js の ScriptParser）がこのクラスを継承して使う。
 */
import {
  CONTAINER_KIND,
  EXPRESSION_KIND,
  PART_LAYER,
  REFERENCE_KIND,
  REFERENCE_TYPE,
  TOKEN_TYPE
} from "./ScriptNodes.js";
import {
  BACKGROUND_WORDS,
  CARD_ORDINAL_WORDS,
  CARD_PLURAL_WORDS,
  CARD_WORDS,
  CHUNK_UNIT_PLURAL_WORDS,
  CHUNK_UNIT_WORDS,
  COMPARISON_OPERATORS,
  CONSTANT_VALUES,
  MESSAGE_BOX_WORDS,
  NOT_CHUNK_FOLLOWERS,
  OPERATOR_ALIASES,
  PART_TYPE_PLURAL_WORDS,
  PART_TYPE_WORDS,
  PROPERTY_NAMES,
  RESERVED_WORDS,
  STACK_WORD,
  THE_ADJECTIVES,
  WORD_OPERATOR,
  fsLayerOfWord
} from "./ScriptVocabulary.js";

const fsReference = (xType, xDetails = {}) => {
  return { kind: REFERENCE_KIND, type: xType, ...xDetails };
};

const fsBinary = (xOperator, xLeft, xRight) => {
  return { kind: EXPRESSION_KIND.binary, operator: xOperator, left: xLeft, right: xRight };
};

const fsLiteral = (xValue) => {
  return { kind: EXPRESSION_KIND.literal, value: xValue };
};

// 「word」「line」などは変数名にも使えるため、後ろに位置の指定が続くときだけチャンクとみなす。
const fsLooksLikeChunk = (xStream) => {
  if (!CHUNK_UNIT_WORDS[xStream.peekWord()]) {
    return false;
  }

  const xFollowing = xStream.peek(1);

  if (!xFollowing) {
    return false;
  }

  if (xFollowing.type === TOKEN_TYPE.number || xFollowing.type === TOKEN_TYPE.string) {
    return true;
  }

  if (xFollowing.type === TOKEN_TYPE.operator) {
    return xFollowing.value === "(" || xFollowing.value === "-";
  }

  return !NOT_CHUNK_FOLLOWERS.has(xFollowing.word);
};

export class ExpressionParser {
  // ---- オブジェクトの指定 ----

  // オブジェクトの指定を読む。required が false で見つからなければ null（読み進めない）。
  parseObjectReference(xStream, xRequired) {
    const xWord = xStream.peekWord();
    const xFollowingWord = xStream.peekWord(1);

    if (xWord === "me") {
      xStream.next();
      return fsReference(REFERENCE_TYPE.me);
    }

    if (xWord === "the" && xFollowingWord === "target") {
      xStream.next();
      xStream.next();
      return fsReference(REFERENCE_TYPE.target);
    }

    if (xWord === "this" && this.isThisTarget(xFollowingWord)) {
      return this.parseThisReference(xStream, xFollowingWord);
    }

    if (CARD_ORDINAL_WORDS[xWord] && CARD_WORDS.has(xFollowingWord)) {
      xStream.next();
      xStream.next();
      return fsReference(REFERENCE_TYPE.card, { which: CARD_ORDINAL_WORDS[xWord] });
    }

    const xPartReference = this.parsePartReference(xStream);

    if (xPartReference) {
      return xPartReference;
    }

    if (BACKGROUND_WORDS.has(xWord)) {
      xStream.next();
      return fsReference(REFERENCE_TYPE.background);
    }

    if (CARD_WORDS.has(xWord)) {
      xStream.next();
      return this.parseCardAfterWord(xStream);
    }

    if (xRequired) {
      xStream.fail("ボタン・フィールド・カードなどを指定してください。");
    }

    return null;
  }

  isThisTarget(xWord) {
    return CARD_WORDS.has(xWord) || BACKGROUND_WORDS.has(xWord) || xWord === STACK_WORD;
  }

  // this card / this bg / this stack。
  parseThisReference(xStream, xTargetWord) {
    xStream.next();
    xStream.next();

    if (BACKGROUND_WORDS.has(xTargetWord)) {
      return fsReference(REFERENCE_TYPE.background);
    }

    if (xTargetWord === STACK_WORD) {
      return fsReference(REFERENCE_TYPE.stack);
    }

    return fsReference(REFERENCE_TYPE.card, { which: "this" });
  }

  // button "OK" / card field 2 / bg button "次へ" など。部品の指定でなければ null（読み進めない）。
  // 前に「card」「bg」がなければ、実行時にカード→背景の順に探す。
  parsePartReference(xStream) {
    let xLayer = PART_LAYER.auto;
    const xLayerOfFirstWord = fsLayerOfWord(xStream.peekWord());

    if (xLayerOfFirstWord !== PART_LAYER.auto && PART_TYPE_WORDS[xStream.peekWord(1)]) {
      xLayer = xLayerOfFirstWord;
      xStream.next();
    }

    const xPartType = PART_TYPE_WORDS[xStream.peekWord()];

    if (!xPartType) {
      return null;
    }

    xStream.next();
    return fsReference(xPartType, { layer: xLayer, which: this.parsePrimary(xStream) });
  }

  // 「card」の後：card next / card 2 / card "ホーム"。
  parseCardAfterWord(xStream) {
    const xOrdinal = CARD_ORDINAL_WORDS[xStream.peekWord()];

    if (xOrdinal) {
      xStream.next();
      return fsReference(REFERENCE_TYPE.card, { which: xOrdinal });
    }

    return fsReference(REFERENCE_TYPE.card, { which: this.parsePrimary(xStream) });
  }

  // go の移動先：next card / prev / card "ホーム" など。
  parseCardTarget(xStream) {
    const xOrdinal = CARD_ORDINAL_WORDS[xStream.peekWord()];

    if (xOrdinal) {
      xStream.next();
      xStream.acceptWord(...CARD_WORDS);
      return fsReference(REFERENCE_TYPE.card, { which: xOrdinal });
    }

    const xReference = this.parseObjectReference(xStream, false);

    if (xReference?.type === REFERENCE_TYPE.card) {
      return xReference;
    }

    return xStream.fail("移動先のカードを指定してください。");
  }

  // put の書き込み先など、値を入れられる場所。
  parseContainer(xStream) {
    if (xStream.acceptWord(...MESSAGE_BOX_WORDS)) {
      xStream.acceptWord("box");
      return { kind: CONTAINER_KIND.message };
    }

    if (fsLooksLikeChunk(xStream)) {
      xStream.fail("文字や単語の一部への書き込みは、まだ使えません。");
    }

    const xReference = this.parseObjectReference(xStream, false);

    if (xReference) {
      return xReference;
    }

    return { kind: CONTAINER_KIND.variable, name: xStream.expectName("書き込み先").toLowerCase() };
  }

  // ---- 式（優先順位の低い順） ----

  parseExpression(xStream) {
    return this.parseOr(xStream);
  }

  parseOr(xStream) {
    let xLeft = this.parseAnd(xStream);

    while (xStream.acceptWord(WORD_OPERATOR.or)) {
      xLeft = fsBinary(WORD_OPERATOR.or, xLeft, this.parseAnd(xStream));
    }

    return xLeft;
  }

  parseAnd(xStream) {
    let xLeft = this.parseComparison(xStream);

    while (xStream.acceptWord(WORD_OPERATOR.and)) {
      xLeft = fsBinary(WORD_OPERATOR.and, xLeft, this.parseComparison(xStream));
    }

    return xLeft;
  }

  parseComparison(xStream) {
    let xLeft = this.parseConcatenation(xStream);

    while (true) {
      const xOperator = this.acceptComparisonOperator(xStream);

      if (!xOperator) {
        return xLeft;
      }

      xLeft = fsBinary(xOperator, xLeft, this.parseConcatenation(xStream));
    }
  }

  // 比較の演算子を読む。is / is not / is in / is not in / contains も記号の演算子にそろえる。
  acceptComparisonOperator(xStream) {
    const xSymbol = xStream.acceptOperator(...COMPARISON_OPERATORS);

    if (xSymbol) {
      return OPERATOR_ALIASES[xSymbol] ?? xSymbol;
    }

    if (xStream.acceptWord("is")) {
      const xNegated = Boolean(xStream.acceptWord(WORD_OPERATOR.not));

      if (xStream.acceptWord("in")) {
        return xNegated ? WORD_OPERATOR.isNotIn : WORD_OPERATOR.isIn;
      }

      return xNegated ? "<>" : "=";
    }

    if (xStream.acceptWord(WORD_OPERATOR.contains)) {
      return WORD_OPERATOR.contains;
    }

    return null;
  }

  parseConcatenation(xStream) {
    let xLeft = this.parseAddition(xStream);
    let xOperator = xStream.acceptOperator("&", "&&");

    while (xOperator) {
      xLeft = fsBinary(xOperator, xLeft, this.parseAddition(xStream));
      xOperator = xStream.acceptOperator("&", "&&");
    }

    return xLeft;
  }

  parseAddition(xStream) {
    let xLeft = this.parseMultiplication(xStream);
    let xOperator = xStream.acceptOperator("+", "-");

    while (xOperator) {
      xLeft = fsBinary(xOperator, xLeft, this.parseMultiplication(xStream));
      xOperator = xStream.acceptOperator("+", "-");
    }

    return xLeft;
  }

  parseMultiplication(xStream) {
    let xLeft = this.parsePower(xStream);

    while (true) {
      const xOperator = xStream.acceptOperator("*", "/") ?? xStream.acceptWord(WORD_OPERATOR.div, WORD_OPERATOR.mod);

      if (!xOperator) {
        return xLeft;
      }

      xLeft = fsBinary(xOperator, xLeft, this.parsePower(xStream));
    }
  }

  // ^ は右から結合する（2 ^ 3 ^ 2 は 2 ^ 9）。
  parsePower(xStream) {
    const xBase = this.parseUnary(xStream);

    if (xStream.acceptOperator("^")) {
      return fsBinary("^", xBase, this.parsePower(xStream));
    }

    return xBase;
  }

  parseUnary(xStream) {
    if (xStream.acceptWord(WORD_OPERATOR.not)) {
      return { kind: EXPRESSION_KIND.unary, operator: WORD_OPERATOR.not, operand: this.parseUnary(xStream) };
    }

    if (xStream.acceptOperator("-")) {
      return { kind: EXPRESSION_KIND.unary, operator: "-", operand: this.parseUnary(xStream) };
    }

    return this.parsePrimary(xStream);
  }

  parsePrimary(xStream) {
    const xToken = xStream.peek();

    if (!xToken) {
      return xStream.fail("式が途中で終わっています。");
    }

    if (xToken.type === TOKEN_TYPE.number || xToken.type === TOKEN_TYPE.string) {
      xStream.next();
      return fsLiteral(xToken.value);
    }

    if (xToken.type === TOKEN_TYPE.operator) {
      return this.parseParenthesized(xStream, xToken);
    }

    return this.parseWordExpression(xStream, xToken);
  }

  parseParenthesized(xStream, xToken) {
    if (!xStream.acceptOperator("(")) {
      return xStream.fail(`「${xToken.value}」の位置が正しくありません。`);
    }

    const xInner = this.parseExpression(xStream);
    xStream.expectOperator(")");
    return xInner;
  }

  // 語で始まる式：定数、the 〜、チャンク、オブジェクトの中身、関数の呼び出し、変数。
  parseWordExpression(xStream, xToken) {
    const xWord = xToken.word;

    if (RESERVED_WORDS.has(xWord)) {
      return xStream.fail(`「${xToken.value}」の前に式が必要です。`);
    }

    if (Object.hasOwn(CONSTANT_VALUES, xWord)) {
      xStream.next();
      return fsLiteral(CONSTANT_VALUES[xWord]);
    }

    if (xWord === "the") {
      return this.parseThe(xStream);
    }

    if (fsLooksLikeChunk(xStream)) {
      return this.parseChunk(xStream);
    }

    // msg は変数ではなくメッセージボックス（put の書き込み先と同じ扱い）。
    if (MESSAGE_BOX_WORDS.includes(xWord)) {
      xStream.next();
      xStream.acceptWord("box");
      return { kind: EXPRESSION_KIND.messageBox };
    }

    const xReference = this.parseObjectReference(xStream, false);

    if (xReference) {
      return { kind: EXPRESSION_KIND.objectValue, reference: xReference };
    }

    xStream.next();

    if (xStream.acceptOperator("(")) {
      return { kind: EXPRESSION_KIND.call, name: xWord, args: this.parseCallArguments(xStream) };
    }

    return { kind: EXPRESSION_KIND.variable, name: xWord };
  }

  // 「(」の後から「)」まで、関数の引数を読む。
  parseCallArguments(xStream) {
    const xArgs = [];

    if (xStream.acceptOperator(")")) {
      return xArgs;
    }

    do {
      xArgs.push(this.parseExpression(xStream));
    } while (xStream.acceptOperator(","));

    xStream.expectOperator(")");
    return xArgs;
  }

  // word 2 of x / char 1 to 3 in field "memo" など。
  parseChunk(xStream) {
    const xUnit = CHUNK_UNIT_WORDS[xStream.next().word];
    const xFrom = this.parseAddition(xStream);
    const xTo = xStream.acceptWord("to") ? this.parseAddition(xStream) : null;
    xStream.expectWord("of", "in");
    return { kind: EXPRESSION_KIND.chunk, unit: xUnit, from: xFrom, to: xTo, source: this.parsePrimary(xStream) };
  }

  // the 〜：the target / the date / the name of me / the number of cards / the abs of x など。
  parseThe(xStream) {
    xStream.next();
    const xAdjective = xStream.acceptWord(...THE_ADJECTIVES);
    const xName = xStream.expectName("「the」の後の名前").toLowerCase();

    if (xName === "target") {
      return { kind: EXPRESSION_KIND.objectValue, reference: fsReference(REFERENCE_TYPE.target) };
    }

    if (!xStream.isWord("of", "in")) {
      return { kind: EXPRESSION_KIND.theFunction, name: xName, adjective: xAdjective };
    }

    xStream.next();

    if (xName === "number") {
      return this.parseNumberOf(xStream);
    }

    if (PROPERTY_NAMES.has(xName)) {
      return { kind: EXPRESSION_KIND.property, property: xName, reference: this.parseObjectReference(xStream, true) };
    }

    // the abs of x などは、関数の呼び出しとして扱う。the abs of -4 のように、符号の付いた値も受け付ける。
    return { kind: EXPRESSION_KIND.call, name: xName, args: [this.parseUnary(xStream)] };
  }

  // 「the number of」の後：cards / [card|bg] buttons / words in x / me（部品の番号）など。
  parseNumberOf(xStream) {
    if (xStream.acceptWord(...CARD_PLURAL_WORDS)) {
      return { kind: EXPRESSION_KIND.count, what: REFERENCE_TYPE.card };
    }

    let xLayer = PART_LAYER.card;
    const xLayerOfFirstWord = fsLayerOfWord(xStream.peekWord());

    if (xLayerOfFirstWord !== PART_LAYER.auto && PART_TYPE_PLURAL_WORDS[xStream.peekWord(1)]) {
      xStream.next();
      xLayer = xLayerOfFirstWord;
    }

    const xPartType = PART_TYPE_PLURAL_WORDS[xStream.peekWord()];

    if (xPartType) {
      xStream.next();
      return { kind: EXPRESSION_KIND.count, what: xPartType, layer: xLayer };
    }

    const xUnit = CHUNK_UNIT_PLURAL_WORDS[xStream.peekWord()];

    if (xUnit) {
      xStream.next();
      xStream.expectWord("in", "of");
      return { kind: EXPRESSION_KIND.count, what: xUnit, source: this.parsePrimary(xStream) };
    }

    return { kind: EXPRESSION_KIND.property, property: "number", reference: this.parseObjectReference(xStream, true) };
  }
}
