/*
 * 描画の道具・ドットの値・模様と、描画の動きを決める数。
 */

// 絵のドットの値。白は透明と違い、下の層を隠す。保存した PNG の読み書きもこの3つだけにする。
export const DOT = { clear: 0, black: 1, white: 2 };

// 描画の道具。パレットにはこの順に並べる。
export const PAINT_TOOL = {
  pencil: "pencil",
  eraser: "eraser",
  line: "line",
  rect: "rect",
  oval: "oval",
  fill: "fill",
  select: "select"
};
export const PAINT_TOOLS = Object.values(PAINT_TOOL);

// 押した点から今の点までを、ドラッグのたびに描き直す道具（図形）。
export const SHAPE_TOOLS = new Set([PAINT_TOOL.line, PAINT_TOOL.rect, PAINT_TOOL.oval]);

// 線の太さ（ドット）。消しゴムはこの倍の大きさで消す。
export const PAINT_SIZES = [1, 2, 4];
export const ERASER_SCALE = 4;

// 塗りつぶしの模様。位置 (x, y) のドットを黒にするか白にするかを返す。
export const PAINT_PATTERNS = {
  black: () => DOT.black,
  white: () => DOT.white,
  checker: (xX, xY) => ((xX + xY) % 2 === 0 ? DOT.black : DOT.white),
  vertical: (xX) => (xX % 2 === 0 ? DOT.black : DOT.white),
  horizontal: (xX, xY) => (xY % 2 === 0 ? DOT.black : DOT.white)
};

// 描き始めの道具・太さ・模様。
export const DEFAULT_PAINT_SETTINGS = { tool: PAINT_TOOL.pencil, size: 2, pattern: "black" };

// 取り消せる回数。1回分はカードの大きさのドット数（320×480なら約150KB）を覚える。
export const MAX_UNDO = 20;

// 取り込んだ画像を置くときの決まり。
export const PLACEMENT_LIMITS = {
  // 画像の最小の幅。動かすときも、少なくともこの大きさはカードに残す。
  minImageSize: 16,
  // カードの幅に対する最大の倍率。
  maxImageScale: 4,
  // 選択した範囲は、1ドットまで縮められる。
  minSelectionSize: 1
};

// PNG の画素を白黒のドットにするときの境目（0〜255）。これより薄い所は透明、明るい所は白とみなす。
export const PIXEL_THRESHOLD = 128;
