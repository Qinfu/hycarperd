/*
 * 画素（RGBA の並び）とドット（DOT の値の並び）の変換。画像の白黒化（ディザ）と、ドットの拡大・縮小。
 * 画面には触れない。キャンバスから画素を読む処理は CanvasPixels.js にある。
 */
import { DOT, PIXEL_THRESHOLD } from "./PaintSettings.js";

const CHANNELS_PER_PIXEL = 4;
const ALPHA_CHANNEL = 3;
const MAX_LEVEL = 255;

// カラーを灰色にするときの重み（ITU-R BT.601。人の目に明るく見える緑を重くする）。
const LUMA_WEIGHTS = { red: 0.299, green: 0.587, blue: 0.114 };

// 明るさ・コントラストの指定の幅（-100〜100）と、明るさ 100 で灰色の値をどれだけ上げるか（灰色の中間の値）。
const ADJUST_RANGE = 100;
const MIDDLE_LEVEL = 128;

// アトキンソン方式のディザで、誤差を配る先（右・2つ右・左下・下・右下・2つ下）と、配る割合（1/8 ずつ）。
// 誤差の 6/8 だけを周りに配るので、明るい所と暗い所がつぶれにくい。
const ATKINSON_SPREAD = [[1, 0], [2, 0], [-1, 1], [0, 1], [1, 1], [0, 2]];
const ATKINSON_DIVISOR = 8;

// 明るさ・コントラスト（どちらも -100〜100）を灰色の値（0〜255）に当てはめる。
export const fsAdjustLevel = (xGray, xBrightness, xContrast) => {
  const xFactor = ((ADJUST_RANGE + xContrast) / ADJUST_RANGE) ** 2;
  return (xGray - MIDDLE_LEVEL) * xFactor + MIDDLE_LEVEL + xBrightness * (MIDDLE_LEVEL / ADJUST_RANGE);
};

// アトキンソン方式のディザ（初期のMacの標準）。灰色の値を黒と白のドットに置き換える。gray は書き換わる。
export const fsDitherGray = (xGray, xWidth, xHeight) => {
  const xDots = new Uint8Array(xWidth * xHeight);

  for (let xY = 0; xY < xHeight; xY += 1) {
    for (let xX = 0; xX < xWidth; xX += 1) {
      const xIndex = xY * xWidth + xX;
      const xOld = xGray[xIndex];
      const xNew = xOld < PIXEL_THRESHOLD ? 0 : MAX_LEVEL;
      const xError = (xOld - xNew) / ATKINSON_DIVISOR;

      xDots[xIndex] = xNew === 0 ? DOT.black : DOT.white;

      for (const [xDx, xDy] of ATKINSON_SPREAD) {
        const xNextX = xX + xDx;
        const xNextY = xY + xDy;

        if (xNextX >= 0 && xNextX < xWidth && xNextY < xHeight) {
          xGray[xNextY * xWidth + xNextX] += xError;
        }
      }
    }
  }

  return xDots;
};

const fsIsTransparent = (xPixels, xOffset) => {
  return xPixels[xOffset + ALPHA_CHANNEL] < PIXEL_THRESHOLD;
};

// 写真などの画素を、明るさ・コントラストを当ててからディザで白黒にする。透明な所は透明のまま。
export const fsDitherPixels = (xPixels, xWidth, xHeight, xBrightness, xContrast) => {
  const xCount = xWidth * xHeight;
  const xGray = new Float32Array(xCount);
  const xTransparent = new Uint8Array(xCount);

  for (let xIndex = 0; xIndex < xCount; xIndex += 1) {
    const xOffset = xIndex * CHANNELS_PER_PIXEL;

    if (fsIsTransparent(xPixels, xOffset)) {
      // 透明な所は白として誤差を配り、周りの黒が増えすぎないようにする。
      xTransparent[xIndex] = 1;
      xGray[xIndex] = MAX_LEVEL;
    } else {
      const xLevel = LUMA_WEIGHTS.red * xPixels[xOffset]
        + LUMA_WEIGHTS.green * xPixels[xOffset + 1]
        + LUMA_WEIGHTS.blue * xPixels[xOffset + 2];
      xGray[xIndex] = fsAdjustLevel(xLevel, xBrightness, xContrast);
    }
  }

  const xDots = fsDitherGray(xGray, xWidth, xHeight);

  for (let xIndex = 0; xIndex < xCount; xIndex += 1) {
    if (xTransparent[xIndex]) {
      xDots[xIndex] = DOT.clear;
    }
  }

  return xDots;
};

// 保存してある絵（白黒と透明だけの PNG）の画素を、ドットに戻す。
export const fsDotsFromPixels = (xPixels, xCount) => {
  const xDots = new Uint8Array(xCount);

  for (let xIndex = 0; xIndex < xCount; xIndex += 1) {
    const xOffset = xIndex * CHANNELS_PER_PIXEL;

    if (fsIsTransparent(xPixels, xOffset)) {
      xDots[xIndex] = DOT.clear;
    } else {
      xDots[xIndex] = xPixels[xOffset] < PIXEL_THRESHOLD ? DOT.black : DOT.white;
    }
  }

  return xDots;
};

// ドットを画素に書き込む。pixels は透明（すべて 0）で用意しておく。
export const fsWriteDotsToPixels = (xDots, xPixels) => {
  for (let xIndex = 0; xIndex < xDots.length; xIndex += 1) {
    const xValue = xDots[xIndex];

    if (xValue !== DOT.clear) {
      const xOffset = xIndex * CHANNELS_PER_PIXEL;
      const xLevel = xValue === DOT.white ? MAX_LEVEL : 0;
      xPixels[xOffset] = xLevel;
      xPixels[xOffset + 1] = xLevel;
      xPixels[xOffset + 2] = xLevel;
      xPixels[xOffset + ALPHA_CHANNEL] = MAX_LEVEL;
    }
  }
};

// 文字の画像のなめらかな縁を、半分より濃い所だけ不透明にして、白黒のドットにそろえる。pixels は書き換わる。
export const fsHardenAlpha = (xPixels) => {
  for (let xOffset = ALPHA_CHANNEL; xOffset < xPixels.length; xOffset += CHANNELS_PER_PIXEL) {
    xPixels[xOffset] = xPixels[xOffset] >= PIXEL_THRESHOLD ? MAX_LEVEL : 0;
  }
};

// ドットを、ぼかさずに（一番近いドットを使って）拡大・縮小する。source は { dots, width, height }。
export const fsScaleDots = (xSource, xWidth, xHeight) => {
  const xDots = new Uint8Array(xWidth * xHeight);

  for (let xY = 0; xY < xHeight; xY += 1) {
    const xSourceY = Math.min(xSource.height - 1, Math.floor((xY * xSource.height) / xHeight));

    for (let xX = 0; xX < xWidth; xX += 1) {
      const xSourceX = Math.min(xSource.width - 1, Math.floor((xX * xSource.width) / xWidth));
      xDots[xY * xWidth + xX] = xSource.dots[xSourceY * xSource.width + xSourceX];
    }
  }

  return xDots;
};
