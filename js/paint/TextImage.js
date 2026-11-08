/*
 * 文字を絵として置くための画像を作る。作った画像は Painter.placeImage に渡し、取り込んだ画像と同じように位置と大きさを決めて貼る。
 */
import { fsHardenAlpha } from "./DotConversion.js";

// 文字の大きさ（ドット）の選択肢。
export const TEXT_SIZES = [12, 16, 24, 32, 48];

// 文字を置くときのフォント。端末にないフォントは、同じ系統の標準のフォントになる。
// 丸ゴシックはMac・iPhone以外ではふつうのゴシックになる。
export const TEXT_FONTS = {
  gothic: { label: "ゴシック", family: 'Arial, "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif' },
  maru: { label: "丸ゴシック", family: '"Hiragino Maru Gothic ProN", "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif' },
  mincho: { label: "明朝", family: '"Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", serif' },
  mono: { label: "等幅", family: 'Menlo, Consolas, "Noto Sans Mono CJK JP", monospace' }
};
const DEFAULT_TEXT_FONT = "gothic";

// 行の高さ（文字の大きさに対する倍率）。
const TEXT_LINE_HEIGHT = 1.25;

// 文字の左右に空けるドット。斜めの字の端が欠けないようにする。
const TEXT_SIDE_MARGIN = 1;

const LINE_BREAK = "\n";

// 文字を黒、ほかを透明にした canvas を作る。fontName は TEXT_FONTS の名前（知らない名前ならゴシック）。
export const fsTextImage = (xText, xSize, xFontName, xBold) => {
  const xLines = xText.split(LINE_BREAK);
  const xFamily = (TEXT_FONTS[xFontName] ?? TEXT_FONTS[DEFAULT_TEXT_FONT]).family;
  const xFont = `${xBold ? "bold " : ""}${xSize}px ${xFamily}`;
  const xLineHeight = Math.ceil(xSize * TEXT_LINE_HEIGHT);
  const xCanvas = document.createElement("canvas");
  let xContext = xCanvas.getContext("2d");

  // 幅を決めるために、先に一番長い行の幅を測る。
  xContext.font = xFont;
  const xTextWidth = Math.ceil(Math.max(...xLines.map((xLine) => xContext.measureText(xLine).width)));
  xCanvas.width = Math.max(1, xTextWidth + TEXT_SIDE_MARGIN * 2);
  xCanvas.height = xLineHeight * xLines.length;

  // 大きさを変えると描画の設定が消えるので、設定し直す。
  xContext = xCanvas.getContext("2d");
  xContext.font = xFont;
  xContext.fillStyle = "#000";
  xContext.textBaseline = "middle";
  xLines.forEach((xLine, xIndex) => {
    xContext.fillText(xLine, TEXT_SIDE_MARGIN, xLineHeight * (xIndex + 0.5));
  });

  const xImage = xContext.getImageData(0, 0, xCanvas.width, xCanvas.height);
  fsHardenAlpha(xImage.data);
  xContext.putImageData(xImage, 0, 0);
  return xCanvas;
};
