// 描画の道具と線の太さ（ドット）。
export const PAINT_TOOLS = ["pencil", "eraser", "line", "rect", "oval", "fill", "select"];
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

// 選んで浮かせたドットを、ぼかさずに（一番近いドットを使って）拡大・縮小する。
const fsScaleDots = (xSource, xWidth, xHeight) => {
  const xDots = new Uint8Array(xWidth * xHeight);

  for (let xY = 0; xY < xHeight; xY += 1) {
    const xSy = Math.min(xSource.height - 1, Math.floor((xY * xSource.height) / xHeight));

    for (let xX = 0; xX < xWidth; xX += 1) {
      const xSx = Math.min(xSource.width - 1, Math.floor((xX * xSource.width) / xWidth));
      xDots[xY * xWidth + xX] = xSource.dots[xSy * xSource.width + xSx];
    }
  }

  return xDots;
};

// 明るさ・コントラスト（どちらも -100〜100）を灰色の値（0〜255）に当てはめる。
export const fsAdjustLevel = (xGray, xBrightness, xContrast) => {
  const xFactor = ((100 + xContrast) / 100) ** 2;
  return (xGray - 128) * xFactor + 128 + xBrightness * 1.28;
};

// アトキンソン方式のディザ（初期のMacの標準）。灰色の値を黒と白のドットに置き換える。
// 誤差の 6/8 だけを周りに配るので、明るい所と暗い所がつぶれにくい。gray は書き換わる。
export const fsDitherGray = (xGray, xWidth, xHeight) => {
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
};

// 文字を絵として置くときの大きさ（ドット）と、行の高さの倍率。
export const TEXT_SIZES = [12, 16, 24, 32, 48];
const TEXT_LINE_HEIGHT = 1.25;

// 文字を絵として置くときのフォント。端末にないフォントは、同じ系統の標準のフォントになる。
// 丸ゴシックはMac・iPhone以外ではふつうのゴシックになる。
export const TEXT_FONTS = {
  gothic: { label: "ゴシック", family: 'Arial, "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif' },
  maru: { label: "丸ゴシック", family: '"Hiragino Maru Gothic ProN", "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif' },
  mincho: { label: "明朝", family: '"Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", serif' },
  mono: { label: "等幅", family: 'Menlo, Consolas, "Noto Sans Mono CJK JP", monospace' }
};

// 文字を黒、ほかを透明にした画像を作る。placeImage に渡すと、画像と同じように位置と大きさを決めて貼れる。
// 文字のなめらかな縁は半分より濃い所だけ黒にして、白黒のドットにそろえる。
// font は TEXT_FONTS の名前。
export const fsTextImage = (xText, xSize, xFontName, xBold) => {
  const xLines = xText.split("\n");
  const xFont = `${xBold ? "bold " : ""}${xSize}px ${(TEXT_FONTS[xFontName] ?? TEXT_FONTS.gothic).family}`;
  const xLineHeight = Math.ceil(xSize * TEXT_LINE_HEIGHT);
  const xCanvas = document.createElement("canvas");
  let xContext = xCanvas.getContext("2d");

  xContext.font = xFont;
  xCanvas.width = Math.max(1, Math.ceil(Math.max(...xLines.map((xLine) => xContext.measureText(xLine).width))) + 2);
  xCanvas.height = xLineHeight * xLines.length;

  // 大きさを変えると描画の設定が消えるので、設定し直す。
  xContext = xCanvas.getContext("2d");
  xContext.font = xFont;
  xContext.fillStyle = "#000";
  xContext.textBaseline = "middle";
  xLines.forEach((xLine, xIndex) => xContext.fillText(xLine, 1, xLineHeight * (xIndex + 0.5)));

  const xImage = xContext.getImageData(0, 0, xCanvas.width, xCanvas.height);

  for (let xOffset = 3; xOffset < xImage.data.length; xOffset += 4) {
    xImage.data[xOffset] = xImage.data[xOffset] >= 128 ? 255 : 0;
  }

  xContext.putImageData(xImage, 0, 0);
  return xCanvas;
};

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
 * 選択の道具で囲んだ範囲も、そのドットを絵から切り取って同じ枠で動かす（selecting）。
 * copySelection で今の位置に写しを残し、deleteSelection で捨てる。
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

    // 選択の道具でドラッグしている間の、囲む範囲の点線。
    this.marquee = document.createElement("div");
    this.marquee.className = "paint-marquee";
  }

  get canUndo() {
    return this.undoStack.length > 0;
  }

  get placing() {
    return Boolean(this.placement);
  }

  // 置いているのが文字か（文字には明るさ・コントラストを使わない）。
  get placingText() {
    return Boolean(this.placement?.isText);
  }

  // 選択の道具で囲んだ範囲を浮かせているか（明るさ・コントラストは使わず、コピー・削除ができる）。
  get selecting() {
    return Boolean(this.placement?.source);
  }

  // 画像を取り込んで、貼る前の調整を始める。小さな画像は元の大きさ、大きな画像はカードに収まる大きさで中央に置く。
  // image は img 要素か canvas 要素。isText は fsTextImage で作った文字の画像のとき true。
  placeImage(xImage, xIsText = false) {
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
      isText: xIsText,
      source: null,
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

    // 選択した範囲は、切り取ったときに取り消しの記録を残してある。
    if (!this.placement.source) {
      this.xPushUndo();
    }

    this.mask = this.xComposite();
    this.xEndPlacement();
    this.xDraw();
    this.xCommit();
  }

  // 選択した範囲なら、切り取る前の絵に戻す（途中で残した写しも消える）。
  cancelImage() {
    if (this.placement) {
      if (this.placement.source) {
        this.mask = this.undoStack.pop();
      }

      this.xEndPlacement();
      this.xDraw();
      this.handlers.onState();
    }
  }

  // 浮かせている範囲の写しを今の位置に残す。浮かせた方は続けて動かせる。
  copySelection() {
    if (!this.selecting) {
      return;
    }

    if (!this.placement.dots) {
      this.xDitherPlacement();
    }

    this.mask = this.xComposite();
    this.xDraw();
  }

  // 浮かせている範囲を捨てる（切り取った所は消えたまま）。取り消しで戻せる。
  deleteSelection() {
    if (this.selecting) {
      this.xEndPlacement();
      this.xDraw();
      this.xCommit();
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

  // 選択の道具で囲んだ範囲のドットを絵から切り取り、画像を置くときと同じ枠で動かせるようにする。
  // 何も描いていない範囲なら何もしない。
  xLift(xFrom, xTo) {
    const xLeft = Math.max(0, Math.min(xFrom.x, xTo.x));
    const xTop = Math.max(0, Math.min(xFrom.y, xTo.y));
    const xWidth = Math.min(this.width - 1, Math.max(xFrom.x, xTo.x)) - xLeft + 1;
    const xHeight = Math.min(this.height - 1, Math.max(xFrom.y, xTo.y)) - xTop + 1;

    if (xWidth < 1 || xHeight < 1) {
      return;
    }

    const xDots = new Uint8Array(xWidth * xHeight);

    for (let xY = 0; xY < xHeight; xY += 1) {
      const xStart = (xTop + xY) * this.width + xLeft;
      xDots.set(this.mask.subarray(xStart, xStart + xWidth), xY * xWidth);
    }

    if (!xDots.some((xValue) => xValue !== CLEAR)) {
      return;
    }

    this.xPushUndo();

    for (let xY = 0; xY < xHeight; xY += 1) {
      const xStart = (xTop + xY) * this.width + xLeft;
      this.mask.fill(CLEAR, xStart, xStart + xWidth);
    }

    this.placement = {
      image: null,
      aspect: xWidth / xHeight,
      x: xLeft,
      y: xTop,
      width: xWidth,
      height: xHeight,
      brightness: 0,
      contrast: 0,
      isText: false,
      source: { dots: xDots, width: xWidth, height: xHeight },
      dots: xDots
    };
    this.surface.append(this.frame);
    this.xUpdatePlacement(false);
    this.handlers.onState();
  }

  xUpdateMarquee(xFrom, xTo) {
    this.marquee.style.left = `${Math.min(xFrom.x, xTo.x)}px`;
    this.marquee.style.top = `${Math.min(xFrom.y, xTo.y)}px`;
    this.marquee.style.width = `${Math.abs(xTo.x - xFrom.x) + 1}px`;
    this.marquee.style.height = `${Math.abs(xTo.y - xFrom.y) + 1}px`;
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
  // 選択した範囲は、ディザをかけずにドットのまま大きさを変える。
  xDitherPlacement() {
    const { image: xImage, width: xWidth, height: xHeight, source: xSource } = this.placement;

    if (xSource) {
      this.placement.dots = fsScaleDots(xSource, xWidth, xHeight);
      return;
    }

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
        xGray[xIndex] = fsAdjustLevel(xLevel, this.placement.brightness, this.placement.contrast);
      }
    }

    const xDots = fsDitherGray(xGray, xWidth, xHeight);

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

    // 選択の道具は、ドラッグで囲んだ範囲を指を離したときに切り取る。
    if (this.tool === "select") {
      this.stroke = { id: xEvent.pointerId, start: xPoint, last: xPoint, selecting: true };
      this.xUpdateMarquee(xPoint, xPoint);
      this.surface.append(this.marquee);
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
    } else if (this.stroke.selecting) {
      this.stroke.last = this.xPoint(xEvent);
      this.xUpdateMarquee(this.stroke.start, this.stroke.last);
    } else {
      this.xApply(this.xPoint(xEvent));
    }
  }

  xOnEnd(xEvent) {
    if (this.stroke?.id === xEvent.pointerId) {
      const xStroke = this.stroke;
      this.stroke = null;

      if (xStroke.selecting) {
        this.marquee.remove();
        this.xLift(xStroke.start, xStroke.last);
      } else if (!xStroke.placing) {
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
      // 小さな選択範囲は、その大きさだけカードに残ればよい。
      const xKeepWidth = Math.min(MIN_IMAGE_SIZE, xPlacement.width);
      const xKeepHeight = Math.min(MIN_IMAGE_SIZE, xPlacement.height);
      xPlacement.x = xClamp(xFrom.x + xDx, xKeepWidth - xPlacement.width, this.width - xKeepWidth);
      xPlacement.y = xClamp(xFrom.y + xDy, xKeepHeight - xPlacement.height, this.height - xKeepHeight);
      this.xUpdatePlacement(false);
      return;
    }

    // 横と縦のうち、大きく動かした方に合わせる。選択範囲は1ドットまで縮められる。
    const xDelta = Math.abs(xDx) >= Math.abs(xDy * xPlacement.aspect) ? xDx : xDy * xPlacement.aspect;
    const xMinWidth = xPlacement.source ? 1 : MIN_IMAGE_SIZE;
    const xWidth = Math.round(xClamp(xFrom.width + xDelta, xMinWidth, this.width * MAX_IMAGE_SCALE));

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
