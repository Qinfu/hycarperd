/*
 * 白黒（と透明）のドットでできた絵。ドットの値は PaintSettings.js の DOT。
 * 点・線・四角・楕円・塗りつぶし・範囲の切り取りなど、ドットを書き換える処理だけを持つ（画面には触れない）。
 * 位置は { x, y }（左上が 0, 0）、範囲は { left, top, width, height } で表す。
 */
import { DOT } from "./PaintSettings.js";

export class DotImage {
  constructor(xWidth, xHeight) {
    this.width = xWidth;
    this.height = xHeight;
    this.dots = new Uint8Array(xWidth * xHeight);
  }

  isEmpty() {
    return !this.dots.some((xValue) => xValue !== DOT.clear);
  }

  contains({ x: xX, y: xY }) {
    return xX >= 0 && xY >= 0 && xX < this.width && xY < this.height;
  }

  // 取り消し用の写し。restore で戻す。
  snapshot() {
    return this.dots.slice();
  }

  restore(xDots) {
    this.dots = xDots;
  }

  clear() {
    this.dots.fill(DOT.clear);
  }

  // 太さ brush の四角いペン先で1点を打つ。絵からはみ出した所は打たない。
  stamp(xX, xY, xValue, xBrush) {
    const xOffset = Math.floor((xBrush - 1) / 2);

    for (let xDy = 0; xDy < xBrush; xDy += 1) {
      const xPy = xY - xOffset + xDy;

      if (xPy < 0 || xPy >= this.height) {
        continue;
      }

      for (let xDx = 0; xDx < xBrush; xDx += 1) {
        const xPx = xX - xOffset + xDx;

        if (xPx >= 0 && xPx < this.width) {
          this.dots[xPy * this.width + xPx] = xValue;
        }
      }
    }
  }

  // ブレゼンハムの方法で、ドットを打ちながら直線を引く。
  drawLine(xFrom, xTo, xValue, xBrush) {
    let { x: xX, y: xY } = xFrom;
    const xDistanceX = Math.abs(xTo.x - xX);
    const xDistanceY = -Math.abs(xTo.y - xY);
    const xStepX = xX < xTo.x ? 1 : -1;
    const xStepY = xY < xTo.y ? 1 : -1;
    let xError = xDistanceX + xDistanceY;

    for (;;) {
      this.stamp(xX, xY, xValue, xBrush);

      if (xX === xTo.x && xY === xTo.y) {
        break;
      }

      const xDoubledError = xError * 2;

      if (xDoubledError >= xDistanceY) {
        xError += xDistanceY;
        xX += xStepX;
      }

      if (xDoubledError <= xDistanceX) {
        xError += xDistanceX;
        xY += xStepY;
      }
    }
  }

  // 2点を対角とする四角の枠。
  drawRect(xFrom, xTo, xValue, xBrush) {
    const xCorners = [
      { x: xFrom.x, y: xFrom.y },
      { x: xTo.x, y: xFrom.y },
      { x: xTo.x, y: xTo.y },
      { x: xFrom.x, y: xTo.y }
    ];

    xCorners.forEach((xCorner, xIndex) => {
      this.drawLine(xCorner, xCorners[(xIndex + 1) % xCorners.length], xValue, xBrush);
    });
  }

  // 2点を対角とする四角に内接する楕円（A. Zingl の方法）。幅か高さが 0 なら直線になる。
  drawOval(xFrom, xTo, xValue, xBrush) {
    if (xFrom.x === xTo.x || xFrom.y === xTo.y) {
      this.drawLine(xFrom, xTo, xValue, xBrush);
      return;
    }

    const xPlot = (xX, xY) => this.stamp(xX, xY, xValue, xBrush);
    let xLeft = Math.min(xFrom.x, xTo.x);
    let xRight = Math.max(xFrom.x, xTo.x);
    let xLower = Math.min(xFrom.y, xTo.y);
    let xWidthTerm = xRight - xLeft;
    const xHeight = Math.max(xFrom.y, xTo.y) - xLower;
    let xHeightTerm = xHeight & 1;
    let xStepX = 4 * (1 - xWidthTerm) * xHeight * xHeight;
    let xStepY = 4 * (xHeightTerm + 1) * xWidthTerm * xWidthTerm;
    let xError = xStepX + xStepY + xHeightTerm * xWidthTerm * xWidthTerm;
    let xUpper;

    xLower += (xHeight + 1) >> 1;
    xUpper = xLower - xHeightTerm;
    xWidthTerm *= 8 * xWidthTerm;
    xHeightTerm = 8 * xHeight * xHeight;

    do {
      xPlot(xRight, xLower);
      xPlot(xLeft, xLower);
      xPlot(xLeft, xUpper);
      xPlot(xRight, xUpper);

      const xDoubledError = 2 * xError;

      if (xDoubledError <= xStepY) {
        xLower += 1;
        xUpper -= 1;
        xStepY += xWidthTerm;
        xError += xStepY;
      }

      if (xDoubledError >= xStepX || 2 * xError > xStepY) {
        xLeft += 1;
        xRight -= 1;
        xStepX += xHeightTerm;
        xError += xStepX;
      }
    } while (xLeft <= xRight);

    // 細長い楕円の両端を補う。
    while (xLower - xUpper <= xHeight) {
      xPlot(xLeft - 1, xLower);
      xPlot(xRight + 1, xLower);
      xPlot(xLeft - 1, xUpper);
      xPlot(xRight + 1, xUpper);
      xLower += 1;
      xUpper -= 1;
    }
  }

  // 押した所とつながっている同じ値の部分を、模様（PAINT_PATTERNS の関数）で塗る。何か変わったら true を返す。
  fill(xPoint, xPattern) {
    const xWidth = this.width;
    const xStart = xPoint.y * xWidth + xPoint.x;
    const xTarget = this.dots[xStart];
    const xVisited = new Uint8Array(this.dots.length);
    const xPending = [xStart];
    let xChanged = false;

    // 模様には元と同じ値のドットも含まれるので、塗ったかどうかは値ではなく別に覚えておく。
    xVisited[xStart] = 1;

    while (xPending.length > 0) {
      const xIndex = xPending.pop();
      const xX = xIndex % xWidth;
      const xValue = xPattern(xX, Math.floor(xIndex / xWidth));

      if (this.dots[xIndex] !== xValue) {
        this.dots[xIndex] = xValue;
        xChanged = true;
      }

      // 左右は同じ行の中だけ。上下は絵の外なら下の範囲の確認で外れる。
      const xNeighbors = [
        xX > 0 ? xIndex - 1 : -1,
        xX < xWidth - 1 ? xIndex + 1 : -1,
        xIndex - xWidth,
        xIndex + xWidth
      ];

      for (const xNext of xNeighbors) {
        if (xNext >= 0 && xNext < this.dots.length && !xVisited[xNext] && this.dots[xNext] === xTarget) {
          xVisited[xNext] = 1;
          xPending.push(xNext);
        }
      }
    }

    return xChanged;
  }

  // 2点を対角とする範囲を、絵の中に収めて返す。絵と重ならなければ null。
  regionBetween(xFrom, xTo) {
    const xLeft = Math.max(0, Math.min(xFrom.x, xTo.x));
    const xTop = Math.max(0, Math.min(xFrom.y, xTo.y));
    const xWidth = Math.min(this.width - 1, Math.max(xFrom.x, xTo.x)) - xLeft + 1;
    const xHeight = Math.min(this.height - 1, Math.max(xFrom.y, xTo.y)) - xTop + 1;

    if (xWidth < 1 || xHeight < 1) {
      return null;
    }

    return { left: xLeft, top: xTop, width: xWidth, height: xHeight };
  }

  // 範囲のドットの写し（絵は変えない）。
  copyRegion({ left: xLeft, top: xTop, width: xWidth, height: xHeight }) {
    const xDots = new Uint8Array(xWidth * xHeight);

    for (let xY = 0; xY < xHeight; xY += 1) {
      const xStart = (xTop + xY) * this.width + xLeft;
      xDots.set(this.dots.subarray(xStart, xStart + xWidth), xY * xWidth);
    }

    return xDots;
  }

  clearRegion({ left: xLeft, top: xTop, width: xWidth, height: xHeight }) {
    for (let xY = 0; xY < xHeight; xY += 1) {
      const xStart = (xTop + xY) * this.width + xLeft;
      this.dots.fill(DOT.clear, xStart, xStart + xWidth);
    }
  }

  // 絵に、上に置いたドット（{ dots, x, y, width, height }）を重ねた結果。絵そのものは変えない。
  // 置いたドットの透明な所は下の絵を見せ、絵からはみ出した所は捨てる。
  withOverlay(xOverlay) {
    const xResult = this.dots.slice();

    for (let xY = 0; xY < xOverlay.height; xY += 1) {
      const xTargetY = xOverlay.y + xY;

      if (xTargetY < 0 || xTargetY >= this.height) {
        continue;
      }

      for (let xX = 0; xX < xOverlay.width; xX += 1) {
        const xTargetX = xOverlay.x + xX;
        const xValue = xOverlay.dots[xY * xOverlay.width + xX];

        if (xTargetX >= 0 && xTargetX < this.width && xValue !== DOT.clear) {
          xResult[xTargetY * this.width + xTargetX] = xValue;
        }
      }
    }

    return xResult;
  }
}

// 範囲の中に何か描いてあるか。
export const fsHasVisibleDots = (xDots) => {
  return xDots.some((xValue) => xValue !== DOT.clear);
};
