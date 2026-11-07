/*
 * スタックのデータ形式に関わる定数。
 * 保存したファイルの中身の意味を決めるので、値を変えると以前のファイルの読み込みに影響する。
 */

// ファイルの種類と、ファイル形式の版（スタックの版 stack.version とは別）。
export const STACK_TYPE = "HycarPerdStack";
export const STACK_FORMAT_VERSION = 1;

// 1スタックあたりのカード枚数の上限。
export const MAX_CARDS = 10;

// 新しいスタックのカードの論理サイズ。スマホに合わせて縦長にする。
export const DEFAULT_CARD_SIZE = { width: 320, height: 480 };

// サイズを持たない古いスタックは、オリジナルのHyperCardと同じ横長とみなす。
export const LEGACY_CARD_SIZE = { width: 512, height: 342 };

// カードの幅・高さとして受け付ける範囲（ドット）。
export const CARD_SIZE_RANGE = { min: 160, max: 1024 };

// 部品の幅・高さの最小値（ドット）。これより小さいと指で掴めない。
export const MIN_PART_SIZE = 16;

// 置ける部品の種類。テキストパーツ（"text"）は保存形式の上では、文字を固定したフィールド（"field"）。
export const NEW_PART_KIND = { button: "button", field: "field", text: "text" };

// 置いたときの部品の既定値。namePrefix は自動で付ける名前（「ボタン1」など）の頭。
export const PART_DEFAULTS = {
  button: { namePrefix: "ボタン", width: 120, height: 40, style: "roundrect", script: "on mouseUp\n  \nend mouseUp" },
  field: { namePrefix: "フィールド", width: 200, height: 80, style: "rectangle", script: "" }
};

// テキストパーツは、置くときの名前と、枠線のない透明なスタイルだけフィールドと変える。
export const TEXT_PART_DEFAULTS = { ...PART_DEFAULTS.field, namePrefix: "テキスト", style: "transparent" };

// 新しい部品を置く位置。重ならないよう、既存の部品の数に応じて斜めにずらす。
export const NEW_PART_PLACEMENT = {
  // 中央から左へずらす量。右へずれていくぶんを見込んで、中央より少し左から始める。
  leftShift: 24,
  // カードの高さをこの数で割った所（上から3分の1）に置く。
  topDivisor: 3,
  // 1つずらすごとの量と、何個でずらしを最初に戻すか。
  step: 12,
  cycle: 8
};

// フィールドの文字の揃え。揃えを持たない古いスタックは左揃え。
export const TEXT_ALIGNS = ["left", "center", "right"];
export const DEFAULT_TEXT_ALIGN = "left";

// カードを切り替えるときの効果（スクリプトで visual effect を指定しなかったとき）。
// wipe は次のカードへなら左へ、前のカードへなら右へ拭き取る。
// カードごとに設定でき、移る先のカードの効果を使う。カードの効果が空ならスタックの効果に従う。
export const CARD_EFFECTS = ["wipe", "dissolve", "none"];
export const DEFAULT_STACK_EFFECT = "wipe";

// ボタン・フィールドの文字の大きさ（ドット）。設定画面の選択肢と、スクリプトで指定できる範囲。
export const PART_TEXT_SIZES = [12, 14, 16, 18, 24];
export const DEFAULT_PART_TEXT_SIZE = 16;
export const PART_TEXT_SIZE_RANGE = { min: 6, max: 96 };

// beep で鳴らす音の既定。音の名前は js/ui/Sound.js のもの（知らない名前なら鳴らさない）。
export const DEFAULT_BEEP_SOUND = "beep";

// カード・背景の絵はPNGのデータURLで持つ。
export const PICTURE_PREFIX = "data:image/png;base64,";

// 自動で付ける名前。
export const DEFAULT_BACKGROUND_NAME = "標準背景";
export const FIRST_CARD_NAME = "カード1";
