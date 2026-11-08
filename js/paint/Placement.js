/*
 * 絵の上に浮かせて置くもの（取り込んだ画像・文字の画像・選択の道具で切り取った範囲）。
 * 貼り付けるまでは絵とは別に持ち、枠のドラッグで移動、右下の四角で大きさを変える。
 *
 * placement: {
 *   image       取り込んだ画像（img 要素か canvas 要素）。選択した範囲なら null
 *   source      選択した範囲の元のドット { dots, width, height }。画像なら null
 *   isText      文字の画像か（文字には明るさ・コントラストを使わない）
 *   aspect      幅 ÷ 高さ（大きさを変えても保つ）
 *   x, y, width, height  絵の上の位置と大きさ（ドット）
 *   brightness, contrast 画像に当てる明るさ・コントラスト（-100〜100）
 *   dots        今の大きさで白黒にしたドット。大きさや明るさが変わったら null にして作り直す
 * }
 */
import { fsReadScaledImagePixels } from "./CanvasPixels.js";
import { fsDitherPixels, fsScaleDots } from "./DotConversion.js";
import { PLACEMENT_LIMITS } from "./PaintSettings.js";

const fsClamp = (xValue, xMin, xMax) => Math.min(Math.max(xValue, xMin), xMax);

// 小さな画像は元の大きさ、大きな画像は絵に収まる大きさにして、中央に置く。
export const fsCreateImagePlacement = (xImage, xIsText, xCanvasSize) => {
  const xImageWidth = xImage.naturalWidth || xImage.width;
  const xImageHeight = xImage.naturalHeight || xImage.height;
  const xScale = Math.min(xCanvasSize.width / xImageWidth, xCanvasSize.height / xImageHeight, 1);
  const xWidth = Math.max(1, Math.round(xImageWidth * xScale));
  const xHeight = Math.max(1, Math.round(xImageHeight * xScale));

  return {
    image: xImage,
    source: null,
    isText: xIsText,
    aspect: xImageWidth / xImageHeight,
    x: Math.round((xCanvasSize.width - xWidth) / 2),
    y: Math.round((xCanvasSize.height - xHeight) / 2),
    width: xWidth,
    height: xHeight,
    brightness: 0,
    contrast: 0,
    dots: null
  };
};

// 選択の道具で切り取った範囲。切り取った場所にそのまま浮かせる。
export const fsCreateSelectionPlacement = (xRegion, xDots) => {
  return {
    image: null,
    source: { dots: xDots, width: xRegion.width, height: xRegion.height },
    isText: false,
    aspect: xRegion.width / xRegion.height,
    x: xRegion.left,
    y: xRegion.top,
    width: xRegion.width,
    height: xRegion.height,
    brightness: 0,
    contrast: 0,
    dots: xDots
  };
};

// ドラッグを始めた位置（origin）から delta だけ動かす。見失わないよう、少なくとも端は絵の中に残す。
export const fsMovePlacement = (xPlacement, xOrigin, xDelta, xCanvasSize) => {
  // 小さな選択範囲は、その大きさだけ残ればよい。
  const xKeepWidth = Math.min(PLACEMENT_LIMITS.minImageSize, xPlacement.width);
  const xKeepHeight = Math.min(PLACEMENT_LIMITS.minImageSize, xPlacement.height);

  xPlacement.x = fsClamp(xOrigin.x + xDelta.x, xKeepWidth - xPlacement.width, xCanvasSize.width - xKeepWidth);
  xPlacement.y = fsClamp(xOrigin.y + xDelta.y, xKeepHeight - xPlacement.height, xCanvasSize.height - xKeepHeight);
};

// ドラッグを始めたときの幅（originWidth）から、縦横の比を保って大きさを変える。
// 横と縦のうち、大きく動かした方に合わせる。
export const fsResizePlacement = (xPlacement, xOriginWidth, xDelta, xCanvasSize) => {
  const xVerticalAsWidth = xDelta.y * xPlacement.aspect;
  const xWidthDelta = Math.abs(xDelta.x) >= Math.abs(xVerticalAsWidth) ? xDelta.x : xVerticalAsWidth;
  const xMinWidth = xPlacement.source ? PLACEMENT_LIMITS.minSelectionSize : PLACEMENT_LIMITS.minImageSize;
  const xMaxWidth = xCanvasSize.width * PLACEMENT_LIMITS.maxImageScale;
  const xWidth = Math.round(fsClamp(xOriginWidth + xWidthDelta, xMinWidth, xMaxWidth));

  xPlacement.width = xWidth;
  xPlacement.height = Math.max(1, Math.round(xWidth / xPlacement.aspect));
  xPlacement.dots = null;
};

// 今の大きさのドットを作る。選択した範囲はドットのまま拡大・縮小し、画像は縮小してからディザで白黒にする。
export const fsRenderPlacementDots = (xPlacement) => {
  const { width: xWidth, height: xHeight } = xPlacement;

  if (xPlacement.source) {
    return fsScaleDots(xPlacement.source, xWidth, xHeight);
  }

  const xPixels = fsReadScaledImagePixels(xPlacement.image, xWidth, xHeight);
  return fsDitherPixels(xPixels, xWidth, xHeight, xPlacement.brightness, xPlacement.contrast);
};
