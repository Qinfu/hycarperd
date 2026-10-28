// 描画の道具と線の太さ（ドット）。
export const PAINT_TOOLS = ["pencil", "eraser", "line", "rect", "oval", "fill"];
export const PAINT_SIZES = [1, 2, 4];

// 絵のドットの値。白は透明と違い、下の層を隠す。
const CLEAR = 0;
const BLACK = 1;
const WHITE = 2;

// 塗りつぶしの模様。位置 (x, y) のドットを黒にするか白にするかを返す。
export const PAINT_PATTERNS = {
  black: () => BLACK,
  white: () => WHITE,
  checker: (xX, xY) => ((xX + xY) % 2 === 0 ? BLACK : WHITE),
  vertical: (xX) => (xX % 2 === 0 ? BLACK : WHITE),
  horizontal: (xX, xY) => (xY % 2 === 0 ? BLACK : WHITE)
};

// 取り消せる回数。1回分はカードの大きさのドット数（320×480なら約150KB）。
const MAX_UNDO = 20;

// 消しゴムは線の太さのこの倍の大きさで消す。
const ERASER_SCALE = 4;

// 図形をドラッグで描く道具。押した点から今の点までを毎回描き直す。
const SHAPE_TOOLS = new Set(["line", "rect", "oval"]);

// 取り込んだ画像を置くときの最小の幅と、カードの幅に対する最大の倍率。
const MIN_IMAGE_SIZE = 16;
const MAX_IMAGE_SCALE = 4;

// 明るさ・コントラスト（どちらも -100〜100）を灰色の値（0〜255）に当てはめる。
export function xAdjustLevel(xGray, xBrightness, xContrast) {
  const xFactor = ((100 + xContrast) / 100) ** 2;
  return (xGray - 128) * xFactor + 128 + xBrightness * 1.28;
}

// アトキンソン方式のディザ（初期のMacの標準）。灰色の値を黒と白のドットに置き換える。
// 誤差の 6/8 だけを周りに配るので、明るい所と暗い所がつぶれにくい。gray は書き換わる。
export function xDitherGray(xGray, xWidth, xHeight) {
  const xDots = new Uint8Array(xWidth * xHeight);
  const xSpread = [[1, 0], [2, 0], [-1, 1], [0, 1], [1, 1], [0, 2]];

  for (let xY = 0; xY < xHeight; xY += 1) {
    for (let xX = 0; xX < xWidth; xX += 1) {
      const xIndex = xY * xWidth + xX;
      const xOld = xGray[xIndex];
      const xNew = xOld < 128 ? 0 : 255;
      const xError = (xOld - xNew) / 8;

      xDots[xIndex] = xNew === 0 ? BLACK : WHITE;

      for (const [xDx, xDy] of xSpread) {
        const xNx = xX + xDx;
        const xNy = xY + xDy;

        if (xNx >= 0 && xNx < xWidth && xNy < xHeight) {
          xGray[xNy * xWidth + xNx] += xError;
        }
      }
    }
  }

  return xDots;
}

/*
 * カード（または背景）の絵を描く。
 * 絵はスタックの論理サイズのドットで持ち、黒・白・透明の3つの値だけにする。
 * 線はなめらかにせず、ドットを1つずつ打つ。保存するときはPNGにする。
 *
 * canvas  … 描いている絵。CardView がその層の絵の位置に置く。
 * surface … 指やマウスを受け取る透明な板。CardView が一番上に置く。
 *
 * 画像の取り込み（placeImage）中は、ディザで白黒にした画像を枠付きで重ねて見せ、
 * 枠のドラッグで移動、右下の四角で大きさを変えられる。pasteImage で絵に書き込む。
 *
 * handlers:
 *   onChange(owner, picture)  1回描き終えた（picture はPNGのデータURL。何もなければ空文字）
 *   onState()                 取り消しできるかどうか、画像を置いているかどうかが変わった
 */
export class Painter {
  constructor(xHandlers) {
    this.handlers = xHandlers;
    this.tool = "pencil";
    this.size = 2;
    this.pattern = "black";
    this.owner = null;
    this.width = 0;
    this.height = 0;
    this.mask = new Uint8Array(0);
    this.undoStack = [];
    this.stroke = null;
    this.loading = false;
    this.loadToken = 0;
    this.placement = null;
    this.previewFrame = 0;

    this.canvas = document.createElement("canvas");
    this.canvas.className = "card-picture";
    this.context = this.canvas.getContext("2d");

    this.surface = document.createElement("div");
    this.surface.className = "paint-surface";
    this.surface.addEventListener("pointerdown", (xEvent) => this.xOnDown(xEvent));
    this.surface.addEventListener("pointermove", (xEvent) => this.xOnMove(xEvent));
    this.surface.addEventListener("pointerup", (xEvent) => this.xOnEnd(xEvent));
    this.surface.addEventListener("pointercancel", (xEvent) => this.xOnEnd(xEvent));

    // 取り込んだ画像の枠と、大きさを変える右下の四角。
    this.frame = document.createElement("div");
    this.frame.className = "paint-placement";
    this.frameHandle = document.createElement("div");
    this.frameHandle.className = "paint-placement-handle";
    this.frame.append(this.frameHandle);
  }

  get canUndo() {
    return this.undoStack.length > 0;
  }

  get placing() {
    return Boolean(this.placement);
  }

  // 画像を取り込んで、貼る前の調整を始める。小さな画像は元の大きさ、大きな画像はカードに収まる大きさで中央に置く。
  placeImage(xImage) {
    if (!this.owner) {
      return;
    }

    const xImageWidth = xImage.naturalWidth || xImage.width;
    const xImageHeight = xImage.naturalHeight || xImage.height;
    const xScale = Math.min(this.width / xImageWidth, this.height / xImageHeight, 1);
    const xWidth = Math.max(1, Math.round(xImageWidth * xScale));
    const xHeight = Math.max(1, Math.round(xImageHeight * xScale));

    this.stroke = null;
    this.placement = {
      image: xImage,
      aspect: xImageWidth / xImageHeight,
      x: Math.round((this.width - xWidth) / 2),
      y: Math.round((this.height - xHeight) / 2),
      width: xWidth,
      height: xHeight,
      brightness: 0,
      contrast: 0,
      dots: null
    };
    this.surface.append(this.frame);
    this.xUpdatePlacement(true);
    this.handlers.onState();
  }

  setAdjust(xBrightness, xContrast) {
    if (this.placement) {
      this.placement.brightness = xBrightness;
      this.placement.contrast = xContrast;
      this.xUpdatePlacement(true);
    }
  }

  pasteImage() {
    if (!this.placement) {
      return;
    }

    if (!this.placement.dots) {
      this.xDitherPlacement();
    }

    this.xPushUndo();
    this.mask = this.xComposite();
    this.xEndPlacement();
    this.xDraw();
    this.xCommit();
  }

  cancelImage() {
    if (this.placement) {
      this.xEndPlacement();
      this.xDraw();
      this.handlers.onState();
    }
  }

  // 描く相手（カードまたは背景）を決める。同じ相手なら描きかけの状態をそのまま使う。
  begin(xOwner, xSize) {
    if (this.owner === xOwner && this.width === xSize.width && this.height === xSize.height) {
      return;
    }

    this.xEndPlacement();
    this.owner = xOwner;
    this.width = xSize.width;
    this.height = xSize.height;
    this.canvas.width = xSize.width;
    this.canvas.height = xSize.height;
    this.mask = new Uint8Array(xSize.width * xSize.height);
    this.undoStack = [];
    this.stroke = null;
    this.xDraw();
    this.xLoad(xOwner.picture);
    this.handlers.onState();
  }

  end() {
    this.xEndPlacement();
    this.owner = null;
    this.stroke = null;
    this.undoStack = [];
    this.loading = false;
    this.loadToken += 1;
  }

  // 画像を置いている途中なら、取り込みをやめる。
  undo() {
    if (this.placement) {
      this.cancelImage();
      return;
    }

    if (!this.canUndo) {
      return;
    }

    this.stroke = null;
    this.mask = this.undoStack.pop();
    this.xDraw();
    this.xCommit();
  }

  clear() {
    if (this.xIsEmpty()) {
      return;
    }

    this.xPushUndo();
    this.mask.fill(CLEAR);
    this.xDraw();
    this.xCommit();
  }

  // 保存してある絵（PNG）を、黒・白・透明のドットに戻す。
  async xLoad(xPicture) {
    const xToken = ++this.loadToken;
    this.loading = false;

    if (!xPicture) {
      return;
    }

    const xImage = new Image();
    this.loading = true;
    xImage.src = xPicture;

    try {
      await xImage.decode();
    } catch {
      // 壊れた絵は読み込まず、白紙から描けるようにする。
      if (xToken === this.loadToken) {
        this.loading = false;
      }

      return;
    }

    if (xToken !== this.loadToken) {
      return;
    }

    const xWork = document.createElement("canvas");
    xWork.width = this.width;
    xWork.height = this.height;

    const xContext = xWork.getContext("2d");
    xContext.drawImage(xImage, 0, 0);

    const xPixels = xContext.getImageData(0, 0, this.width, this.height).data;

    for (let xIndex = 0; xIndex < this.mask.length; xIndex += 1) {
      const xOffset = xIndex * 4;

      if (xPixels[xOffset + 3] < 128) {
        this.mask[xIndex] = CLEAR;
      } else {
        this.mask[xIndex] = xPixels[xOffset] < 128 ? BLACK : WHITE;
      }
    }

    this.loading = false;
    this.xDraw();
  }

  xEndPlacement() {
    cancelAnimationFrame(this.previewFrame);
    this.previewFrame = 0;
    this.placement = null;
    this.frame.remove();
  }

  // 枠の位置を合わせ、次の描画のときにまとめて見た目を作り直す（ドラッグ中に何度も計算しないため）。
  xUpdatePlacement(xRedither) {
    const xPlacement = this.placement;

    this.frame.style.left = `${xPlacement.x}px`;
    this.frame.style.top = `${xPlacement.y}px`;
    this.frame.style.width = `${xPlacement.width}px`;
    this.frame.style.height = `${xPlacement.height}px`;

    if (xRedither) {
      xPlacement.dots = null;
    }

    if (!this.previewFrame) {
      this.previewFrame = requestAnimationFrame(() => {
        this.previewFrame = 0;

        if (this.placement) {
          if (!this.placement.dots) {
            this.xDitherPlacement();
          }

          this.xDraw();
        }
      });
    }
  }

  // 画像を今の大きさに縮小し、明るさ・コントラストを当ててからディザで白黒にする。透明な所は透明のまま。
  xDitherPlacement() {
    const { image: xImage, width: xWidth, height: xHeight } = this.placement;
    const xWork = document.createElement("canvas");
    xWork.width = xWidth;
    xWork.height = xHeight;

    const xContext = xWork.getContext("2d");
    xContext.imageSmoothingQuality = "high";
    xContext.drawImage(xImage, 0, 0, xWidth, xHeight);

    const xPixels = xContext.getImageData(0, 0, xWidth, xHeight).data;
    const xGray = new Float32Array(xWidth * xHeight);
    const xClear = new Uint8Array(xWidth * xHeight);

    for (let xIndex = 0; xIndex < xGray.length; xIndex += 1) {
      const xOffset = xIndex * 4;

      if (xPixels[xOffset + 3] < 128) {
        xClear[xIndex] = 1;
        xGray[xIndex] = 255;
      } else {
        const xLevel = 0.299 * xPixels[xOffset] + 0.587 * xPixels[xOffset + 1] + 0.114 * xPixels[xOffset + 2];
        xGray[xIndex] = xAdjustLevel(xLevel, this.placement.brightness, this.placement.contrast);
      }
    }

    const xDots = xDitherGray(xGray, xWidth, xHeight);

    for (let xIndex = 0; xIndex < xDots.length; xIndex += 1) {
      if (xClear[xIndex]) {
        xDots[xIndex] = CLEAR;
      }
    }

    this.placement.dots = xDots;
  }

  // 今の絵に、置いている画像を重ねたもの。カードからはみ出した所は捨てる。
  xComposite() {
    const xPlacement = this.placement;

    if (!xPlacement?.dots) {
      return this.mask;
    }

    const xResult = this.mask.slice();

    for (let xY = 0; xY < xPlacement.height; xY += 1) {
      const xTy = xPlacement.y + xY;

      if (xTy < 0 || xTy >= this.height) {
        continue;
      }

      for (let xX = 0; xX < xPlacement.width; xX += 1) {
        const xTx = xPlacement.x + xX;
        const xValue = xPlacement.dots[xY * xPlacement.width + xX];

        if (xTx >= 0 && xTx < this.width && xValue !== CLEAR) {
          xResult[xTy * this.width + xTx] = xValue;
        }
      }
    }

    return xResult;
  }

  xDraw() {
    const xImage = this.context.createImageData(this.width || 1, this.height || 1);
    const xValues = this.xComposite();

    for (let xIndex = 0; xIndex < xValues.length; xIndex += 1) {
      const xValue = xValues[xIndex];

      if (xValue !== CLEAR) {
        const xOffset = xIndex * 4;
        const xLevel = xValue === WHITE ? 255 : 0;
        xImage.data[xOffset] = xLevel;
        xImage.data[xOffset + 1] = xLevel;
        xImage.data[xOffset + 2] = xLevel;
        xImage.data[xOffset + 3] = 255;
      }
    }

    this.context.putImageData(xImage, 0, 0);
  }

  xIsEmpty() {
    return !this.mask.some((xValue) => xValue !== CLEAR);
  }

  xCommit() {
    const xPicture = this.xIsEmpty() ? "" : this.canvas.toDataURL("image/png");
    this.handlers.onChange(this.owner, xPicture);
    this.handlers.onState();
  }

  xPushUndo() {
    this.undoStack.push(this.mask.slice());

    if (this.undoStack.length > MAX_UNDO) {
      this.undoStack.shift();
    }
  }

  // 画面上の位置を、絵のドットの位置に直す（カードは拡大・縮小して表示している）。
  xPoint(xEvent) {
    const xRect = this.surface.getBoundingClientRect();

    return {
      x: Math.floor(((xEvent.clientX - xRect.left) * this.width) / xRect.width),
      y: Math.floor(((xEvent.clientY - xRect.top) * this.height) / xRect.height)
    };
  }

  xOnDown(xEvent) {
    // 2本目の指は無視する。読み込みが終わるまでは描かない。
    if (!this.owner || this.loading || this.stroke) {
      return;
    }

    xEvent.preventDefault();

    try {
      this.surface.setPointerCapture(xEvent.pointerId);
    } catch {
      // プログラムから送られたイベントなど、対応するポインタがない場合は無視する。
    }

    const xPoint = this.xPoint(xEvent);

    // 画像を置いている間は、右下の四角なら大きさを、それ以外なら位置を変える。
    if (this.placement) {
      const { x: xX, y: xY, width: xWidth } = this.placement;
      const xMode = xEvent.target === this.frameHandle ? "resize" : "move";
      this.stroke = { id: xEvent.pointerId, start: xPoint, placing: { mode: xMode, x: xX, y: xY, width: xWidth } };
      return;
    }

    if (this.tool === "fill") {
      if (this.xIsInside(xPoint)) {
        this.xPushUndo();

        // 塗っても何も変わらなかったら、取り消しの記録も残さない。
        if (this.xFill(xPoint)) {
          this.xDraw();
          this.xCommit();
        } else {
          this.undoStack.pop();
        }
      }

      return;
    }

    this.xPushUndo();
    this.stroke = { id: xEvent.pointerId, start: xPoint, last: xPoint, base: this.mask.slice() };
    this.xApply(xPoint);
  }

  xOnMove(xEvent) {
    if (this.stroke?.id !== xEvent.pointerId) {
      return;
    }

    if (this.stroke.placing) {
      this.xMovePlacement(this.xPoint(xEvent));
    } else {
      this.xApply(this.xPoint(xEvent));
    }
  }

  xOnEnd(xEvent) {
    if (this.stroke?.id === xEvent.pointerId) {
      const xPlacing = this.stroke.placing;
      this.stroke = null;

      if (!xPlacing) {
        this.xCommit();
      }
    }
  }

  // 位置は、少なくとも端がカードに残る範囲で動かす。大きさは縦横の比を保って変える。
  xMovePlacement(xPoint) {
    const xPlacement = this.placement;
    const { start: xStart, placing: xFrom } = this.stroke;
    const xDx = xPoint.x - xStart.x;
    const xDy = xPoint.y - xStart.y;
    const xClamp = (xValue, xMin, xMax) => Math.min(Math.max(xValue, xMin), xMax);

    if (!xPlacement) {
      return;
    }

    if (xFrom.mode === "move") {
      xPlacement.x = xClamp(xFrom.x + xDx, MIN_IMAGE_SIZE - xPlacement.width, this.width - MIN_IMAGE_SIZE);
      xPlacement.y = xClamp(xFrom.y + xDy, MIN_IMAGE_SIZE - xPlacement.height, this.height - MIN_IMAGE_SIZE);
      this.xUpdatePlacement(false);
      return;
    }

    // 横と縦のうち、大きく動かした方に合わせる。
    const xDelta = Math.abs(xDx) >= Math.abs(xDy * xPlacement.aspect) ? xDx : xDy * xPlacement.aspect;
    const xWidth = Math.round(xClamp(xFrom.width + xDelta, MIN_IMAGE_SIZE, this.width * MAX_IMAGE_SCALE));

    xPlacement.width = xWidth;
    xPlacement.height = Math.max(1, Math.round(xWidth / xPlacement.aspect));
    this.xUpdatePlacement(true);
  }

  xApply(xPoint) {
    const { start: xStart, last: xLast, base: xBase } = this.stroke;

    if (SHAPE_TOOLS.has(this.tool)) {
      this.mask.set(xBase);

      if (this.tool === "line") {
        this.xLine(xStart, xPoint, BLACK, this.size);
      } else if (this.tool === "rect") {
        this.xRect(xStart, xPoint);
      } else {
        this.xOval(xStart, xPoint);
      }
    } else if (this.tool === "eraser") {
      this.xLine(xLast, xPoint, CLEAR, this.size * ERASER_SCALE);
    } else {
      this.xLine(xLast, xPoint, BLACK, this.size);
    }

    this.stroke.last = xPoint;
    this.xDraw();
  }

  xIsInside({ x: xX, y: xY }) {
    return xX >= 0 && xY >= 0 && xX < this.width && xY < this.height;
  }

  // 太さ brush の四角いペン先で1点を打つ。
  xStamp(xX, xY, xValue, xBrush) {
    const xOffset = Math.floor((xBrush - 1) / 2);

    for (let xDy = 0; xDy < xBrush; xDy += 1) {
      const xPy = xY - xOffset + xDy;

      if (xPy < 0 || xPy >= this.height) {
        continue;
      }

      for (let xDx = 0; xDx < xBrush; xDx += 1) {
        const xPx = xX - xOffset + xDx;

        if (xPx >= 0 && xPx < this.width) {
          this.mask[xPy * this.width + xPx] = xValue;
        }
      }
    }
  }

  // ブレゼンハムの方法で、ドットを打ちながら直線を引く。
  xLine(xFrom, xTo, xValue, xBrush) {
    let { x: xX, y: xY } = xFrom;
    const xDx = Math.abs(xTo.x - xX);
    const xDy = -Math.abs(xTo.y - xY);
    const xSx = xX < xTo.x ? 1 : -1;
    const xSy = xY < xTo.y ? 1 : -1;
    let xError = xDx + xDy;

    for (;;) {
      this.xStamp(xX, xY, xValue, xBrush);

      if (xX === xTo.x && xY === xTo.y) {
        break;
      }

      const xError2 = xError * 2;

      if (xError2 >= xDy) {
        xError += xDy;
        xX += xSx;
      }

      if (xError2 <= xDx) {
        xError += xDx;
        xY += xSy;
      }
    }
  }

  xRect(xFrom, xTo) {
    const xCorners = [
      { x: xFrom.x, y: xFrom.y },
      { x: xTo.x, y: xFrom.y },
      { x: xTo.x, y: xTo.y },
      { x: xFrom.x, y: xTo.y }
    ];

    xCorners.forEach((xCorner, xIndex) => {
      this.xLine(xCorner, xCorners[(xIndex + 1) % 4], BLACK, this.size);
    });
  }

  // 2点を対角とする四角に内接する楕円（A. Zingl の方法）。
  xOval(xFrom, xTo) {
    if (xFrom.x === xTo.x || xFrom.y === xTo.y) {
      this.xLine(xFrom, xTo, BLACK, this.size);
      return;
    }

    const xPlot = (xX, xY) => this.xStamp(xX, xY, BLACK, this.size);
    let xX0 = Math.min(xFrom.x, xTo.x);
    let xX1 = Math.max(xFrom.x, xTo.x);
    let xY0 = Math.min(xFrom.y, xTo.y);
    let xA = xX1 - xX0;
    const xB = Math.max(xFrom.y, xTo.y) - xY0;
    let xB1 = xB & 1;
    let xDx = 4 * (1 - xA) * xB * xB;
    let xDy = 4 * (xB1 + 1) * xA * xA;
    let xError = xDx + xDy + xB1 * xA * xA;
    let xY1;

    xY0 += (xB + 1) >> 1;
    xY1 = xY0 - xB1;
    xA *= 8 * xA;
    xB1 = 8 * xB * xB;

    do {
      xPlot(xX1, xY0);
      xPlot(xX0, xY0);
      xPlot(xX0, xY1);
      xPlot(xX1, xY1);

      const xError2 = 2 * xError;

      if (xError2 <= xDy) {
        xY0 += 1;
        xY1 -= 1;
        xDy += xA;
        xError += xDy;
      }

      if (xError2 >= xDx || 2 * xError > xDy) {
        xX0 += 1;
        xX1 -= 1;
        xDx += xB1;
        xError += xDx;
      }
    } while (xX0 <= xX1);

    // 細長い楕円の両端を補う。
    while (xY0 - xY1 <= xB) {
      xPlot(xX0 - 1, xY0);
      xPlot(xX1 + 1, xY0);
      xPlot(xX0 - 1, xY1);
      xPlot(xX1 + 1, xY1);
      xY0 += 1;
      xY1 -= 1;
    }
  }

  // 押した所とつながっている同じ値の部分を、選んでいる模様で塗る。何か変わったら true を返す。
  xFill(xPoint) {
    const xWidth = this.width;
    const xStart = xPoint.y * xWidth + xPoint.x;
    const xTarget = this.mask[xStart];
    const xPattern = PAINT_PATTERNS[this.pattern];
    const xVisited = new Uint8Array(this.mask.length);
    const xStack = [xStart];
    let xChanged = false;

    // 模様には元と同じ値のドットも含まれるので、塗ったかどうかは別に覚えておく。
    xVisited[xStart] = 1;

    while (xStack.length > 0) {
      const xIndex = xStack.pop();
      const xX = xIndex % xWidth;
      const xValue = xPattern(xX, Math.floor(xIndex / xWidth));

      if (this.mask[xIndex] !== xValue) {
        this.mask[xIndex] = xValue;
        xChanged = true;
      }

      const xNeighbors = [
        xX > 0 ? xIndex - 1 : -1,
        xX < xWidth - 1 ? xIndex + 1 : -1,
        xIndex - xWidth,
        xIndex + xWidth
      ];

      for (const xNext of xNeighbors) {
        if (xNext >= 0 && xNext < this.mask.length && !xVisited[xNext] && this.mask[xNext] === xTarget) {
          xVisited[xNext] = 1;
          xStack.push(xNext);
        }
      }
    }

    return xChanged;
  }
}
