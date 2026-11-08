/*
 * 解析の結果（トークン・構文木）と、実行時のオブジェクトの種類を表す名前。
 * 解析（Lexer / Parser）と実行（Interpreter）の間の取り決めなので、両方がここを参照する。
 */

// トークンの種類。トークンは { type, value, word }（word は語のときだけ、小文字にしたもの）。
export const TOKEN_TYPE = {
  string: "string",
  number: "number",
  word: "word",
  operator: "operator"
};

// 式の種類。式は { kind, ... }。
export const EXPRESSION_KIND = {
  // { value }
  literal: "literal",
  // { name }
  variable: "variable",
  // { operator, operand }
  unary: "unary",
  // { operator, left, right }
  binary: "binary",
  // { name, args }
  call: "call",
  // the date など。{ name, adjective }
  theFunction: "theFunction",
  // the name of button 1 など。{ property, reference }
  property: "property",
  // field 1 など、オブジェクトの中身。{ reference }
  objectValue: "objectValue",
  // word 2 of x など。{ unit, from, to, source }
  chunk: "chunk",
  // the number of cards など。{ what, layer, source }
  count: "count",
  // msg / message / message box の中身。{}
  messageBox: "messageBox"
};

// 文の種類。文は { kind, line, ... }。
export const STATEMENT_KIND = {
  put: "put",
  get: "get",
  go: "go",
  goBack: "goBack",
  goStack: "goStack",
  visualEffect: "visualEffect",
  answer: "answer",
  ask: "ask",
  beep: "beep",
  play: "play",
  doMenu: "doMenu",
  openUrl: "openUrl",
  wait: "wait",
  hide: "hide",
  show: "show",
  set: "set",
  arithmetic: "arithmetic",
  global: "global",
  return: "return",
  pass: "pass",
  exitHandler: "exitHandler",
  exitRepeat: "exitRepeat",
  nextRepeat: "nextRepeat",
  exitToTop: "exitToTop",
  send: "send",
  command: "command",
  if: "if",
  repeat: "repeat"
};

// repeat の回し方。
export const REPEAT_MODE = {
  forever: "forever",
  while: "while",
  until: "until",
  count: "count",
  with: "with"
};

// put / get などの書き込み先・読み取り元。{ kind: message } / { kind: variable, name } / オブジェクトの指定。
export const CONTAINER_KIND = {
  message: "messageBox",
  variable: "variable"
};

// オブジェクトの指定（構文木の中）。{ kind: reference, type, layer, which }。
export const REFERENCE_KIND = "reference";

export const REFERENCE_TYPE = {
  me: "me",
  target: "target",
  stack: "stack",
  card: "card",
  background: "background",
  button: "button",
  field: "field"
};

// 部品の層。auto は「カードの部品を探し、なければ背景の部品」。
export const PART_LAYER = {
  auto: "auto",
  card: "card",
  background: "background"
};

// カードの順番の指定。
export const CARD_ORDINAL = {
  this: "this",
  next: "next",
  previous: "prev",
  first: "first",
  last: "last"
};

// 実行時のオブジェクト。{ kind: part, part, card, isBackground } / { kind: card, card } /
// { kind: background, background } / { kind: stack }。
export const OBJECT_KIND = {
  part: "part",
  card: "card",
  background: "background",
  stack: "stack"
};

// ハンドラの終わり方。ハンドラ・ブロックの実行はこれを返して、外側に伝える（null はそのまま続ける）。
export const FLOW_SIGNAL = {
  return: "return",
  pass: "pass",
  exitHandler: "exitHandler",
  exitRepeat: "exitRepeat",
  nextRepeat: "nextRepeat"
};
