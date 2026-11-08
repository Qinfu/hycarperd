/*
 * カード（または背景）の絵を描く。指やマウスの操作を受け取り、道具に応じて DotImage を書き換えて画面に映す。
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
import { fsReadPicturePixels } from "./CanvasPixels.js";
import { fsDotsFromPixels, fsWriteDotsToPixels } from "./DotConversion.js";
import { DotImage, fsHasVisibleDots } from "./DotImage.js";
import {
  DEFAULT_PAINT_SETTINGS,
  DOT,
  ERASER_SCALE,
  MAX_UNDO,
  PAINT_PATTERNS,
  PAINT_TOOL,
  SHAPE_TOOLS
} from "./PaintSettings.js";
import {
  fsCreateImagePlacement,
  fsCreateSelectionPlacement,
  fsMovePlacement,
  fsRenderPlacementDots,
  fsResizePlacement
} from "./Placement.js";

// ドラッグ中の操作の種類。
const STROKE_KIND = {
  // 道具で描いている。
  drawing: "drawing",
  // 選択の道具で、切り取る範囲を囲んでいる。
  selection: "selection",
  // 浮かせている画像（または選択範囲）を動かしている・大きさを変えている。
  placement: "placement"
};

const PLACEMENT_DRAG = { move: "move", resize: "resize" };

const PICTURE_MIME_TYPE = "image/png";

// CSS のクラス名。見た目は css/app.css で決める。
const CLASS_NAME = {
  canvas: "card-picture",
  surface: "paint-surface",
  frame: "paint-placement",
  frameHandle: "paint-placement-handle",
  marquee: "paint-marquee"
};

const fsCreateElement = (xTagName, xClassName) => {
  const xElement = document.createElement(xTagName);
  xElement.className = xClassName;
  return xElement;
};

const fsPlaceElement = (xElement, xLeft, xTop, xWidth, xHeight) => {
  xElement.style.left = `${xLeft}px`;
  xElement.style.top = `${xTop}px`;
  xElement.style.width = `${xWidth}px`;
  xElement.style.height = `${xHeight}px`;
};

export class Painter {
  constructor(xHandlers) {
    this.handlers = xHandlers;
    this.tool = DEFAULT_PAINT_SETTINGS.tool;
    this.size = DEFAULT_PAINT_SETTINGS.size;
    this.pattern = DEFAULT_PAINT_SETTINGS.pattern;
    // 描いている相手（カードか背景のデータ）。描いていない間は null。
    this.owner = null;
    this.picture = new DotImage(0, 0);
    this.undoStack = [];
    this.stroke = null;
    // 保存してある絵を読み込んでいる間は描かない。古い読み込みの結果を捨てるため、読み込むたびに番号を進める。
    this.loading = false;
    this.loadToken = 0;
    this.placement = null;
    this.previewFrame = 0;

    this.canvas = fsCreateElement("canvas", CLASS_NAME.canvas);
    this.context = this.canvas.getContext("2d");

    this.surface = fsCreateElement("div", CLASS_NAME.surface);
    this.surface.addEventListener("pointerdown", (xEvent) => this.handlePointerDown(xEvent));
    this.surface.addEventListener("pointermove", (xEvent) => this.handlePointerMove(xEvent));
    this.surface.addEventListener("pointerup", (xEvent) => this.handlePointerEnd(xEvent));
    this.surface.addEventListener("pointercancel", (xEvent) => this.handlePointerEnd(xEvent));

    // 浮かせているものの枠と、大きさを変える右下の四角。
    this.frame = fsCreateElement("div", CLASS_NAME.frame);
    this.frameHandle = fsCreateElement("div", CLASS_NAME.frameHandle);
    this.frame.append(this.frameHandle);

    // 選択の道具でドラッグしている間の、囲む範囲の点線。
    this.marquee = fsCreateElement("div", CLASS_NAME.marquee);
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

  // ---- 描く相手 ----

  // 描く相手（カードまたは背景）を決める。同じ相手・同じ大きさなら、描きかけの状態をそのまま使う。
  begin(xOwner, xSize) {
    const xSameSize = this.picture.width === xSize.width && this.picture.height === xSize.height;

    if (this.owner === xOwner && xSameSize) {
      return;
    }

    this.endPlacement();
    this.owner = xOwner;
    this.picture = new DotImage(xSize.width, xSize.height);
    this.canvas.width = xSize.width;
    this.canvas.height = xSize.height;
    this.undoStack = [];
    this.stroke = null;
    this.draw();
    this.loadPicture(xOwner.picture);
    this.handlers.onState();
  }

  end() {
    this.endPlacement();
    this.owner = null;
    this.stroke = null;
    this.undoStack = [];
    this.loading = false;
    this.loadToken += 1;
  }

  // 保存してある絵（PNG）を、黒・白・透明のドットに戻す。
  async loadPicture(xPictureUrl) {
    const xToken = ++this.loadToken;
    this.loading = false;

    if (!xPictureUrl) {
      return;
    }

    const xImage = new Image();
    this.loading = true;
    xImage.src = xPictureUrl;

    try {
      await xImage.decode();
    } catch {
      // 壊れた絵は読み込まず、白紙から描けるようにする。
      if (xToken === this.loadToken) {
        this.loading = false;
      }

      return;
    }

    // 読み込んでいる間に、ほかのカードに移っていた。
    if (xToken !== this.loadToken) {
      return;
    }

    const { width: xWidth, height: xHeight } = this.picture;
    const xPixels = fsReadPicturePixels(xImage, xWidth, xHeight);
    this.picture.restore(fsDotsFromPixels(xPixels, xWidth * xHeight));
    this.loading = false;
    this.draw();
  }

  // ---- 取り消し・全消去 ----

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
    this.picture.restore(this.undoStack.pop());
    this.draw();
    this.commit();
  }

  clear() {
    if (this.picture.isEmpty()) {
      return;
    }

    this.pushUndo();
    this.picture.clear();
    this.draw();
    this.commit();
  }

  // ---- 画像・選択範囲の配置 ----

  // 画像を取り込んで、貼る前の調整を始める。
  // image は img 要素か canvas 要素。isText は fsTextImage で作った文字の画像のとき true。
  placeImage(xImage, xIsText = false) {
    if (!this.owner) {
      return;
    }

    this.stroke = null;
    this.startPlacement(fsCreateImagePlacement(xImage, xIsText, this.picture));
  }

  setAdjust(xBrightness, xContrast) {
    if (this.placement) {
      this.placement.brightness = xBrightness;
      this.placement.contrast = xContrast;
      this.updatePlacement(true);
    }
  }

  pasteImage() {
    if (!this.placement) {
      return;
    }

    this.ensurePlacementDots();

    // 選択した範囲は、切り取ったときに取り消しの記録を残してある。
    if (!this.placement.source) {
      this.pushUndo();
    }

    this.picture.restore(this.compositeDots());
    this.endPlacement();
    this.draw();
    this.commit();
  }

  // 選択した範囲なら、切り取る前の絵に戻す（途中で残した写しも消える）。
  cancelImage() {
    if (!this.placement) {
      return;
    }

    if (this.placement.source) {
      this.picture.restore(this.undoStack.pop());
    }

    this.endPlacement();
    this.draw();
    this.handlers.onState();
  }

  // 浮かせている範囲の写しを今の位置に残す。浮かせた方は続けて動かせる。
  copySelection() {
    if (!this.selecting) {
      return;
    }

    this.ensurePlacementDots();
    this.picture.restore(this.compositeDots());
    this.draw();
  }

  // 浮かせている範囲を捨てる（切り取った所は消えたまま）。取り消しで戻せる。
  deleteSelection() {
    if (this.selecting) {
      this.endPlacement();
      this.draw();
      this.commit();
    }
  }

  startPlacement(xPlacement) {
    this.placement = xPlacement;
    this.surface.append(this.frame);
    this.updatePlacement(!xPlacement.dots);
    this.handlers.onState();
  }

  // 選択の道具で囲んだ範囲のドットを絵から切り取り、画像を置くときと同じ枠で動かせるようにする。
  // 何も描いていない範囲なら何もしない。
  liftSelection(xFrom, xTo) {
    const xRegion = this.picture.regionBetween(xFrom, xTo);

    if (!xRegion) {
      return;
    }

    const xDots = this.picture.copyRegion(xRegion);

    if (!fsHasVisibleDots(xDots)) {
      return;
    }

    this.pushUndo();
    this.picture.clearRegion(xRegion);
    this.startPlacement(fsCreateSelectionPlacement(xRegion, xDots));
  }

  endPlacement() {
    cancelAnimationFrame(this.previewFrame);
    this.previewFrame = 0;
    this.placement = null;
    this.frame.remove();
  }

  // 枠の位置を合わせ、次の描画のときにまとめて見た目を作り直す（ドラッグ中に何度も計算しないため）。
  // redither は大きさや明るさが変わって、ドットを作り直す必要があるとき true。
  updatePlacement(xRedither) {
    const xPlacement = this.placement;
    fsPlaceElement(this.frame, xPlacement.x, xPlacement.y, xPlacement.width, xPlacement.height);

    if (xRedither) {
      xPlacement.dots = null;
    }

    if (this.previewFrame) {
      return;
    }

    this.previewFrame = requestAnimationFrame(() => {
      this.previewFrame = 0;

      if (this.placement) {
        this.ensurePlacementDots();
        this.draw();
      }
    });
  }

  ensurePlacementDots() {
    if (!this.placement.dots) {
      this.placement.dots = fsRenderPlacementDots(this.placement);
    }
  }

  // ---- 画面への反映と保存 ----

  // 今の絵に、浮かせているものを重ねたドット。
  compositeDots() {
    return this.placement?.dots ? this.picture.withOverlay(this.placement) : this.picture.dots;
  }

  draw() {
    // 大きさ 0 の画像は作れないので、描く相手がないときも 1×1 にする。
    const xImage = this.context.createImageData(this.picture.width || 1, this.picture.height || 1);
    fsWriteDotsToPixels(this.compositeDots(), xImage.data);
    this.context.putImageData(xImage, 0, 0);
  }

  commit() {
    const xPictureUrl = this.picture.isEmpty() ? "" : this.canvas.toDataURL(PICTURE_MIME_TYPE);
    this.handlers.onChange(this.owner, xPictureUrl);
    this.handlers.onState();
  }

  pushUndo() {
    this.undoStack.push(this.picture.snapshot());

    if (this.undoStack.length > MAX_UNDO) {
      this.undoStack.shift();
    }
  }

  // ---- 指・マウスの操作 ----

  // 画面上の位置を、絵のドットの位置に直す（カードは拡大・縮小して表示している）。
  pointOf(xEvent) {
    const xRect = this.surface.getBoundingClientRect();

    return {
      x: Math.floor(((xEvent.clientX - xRect.left) * this.picture.width) / xRect.width),
      y: Math.floor(((xEvent.clientY - xRect.top) * this.picture.height) / xRect.height)
    };
  }

  handlePointerDown(xEvent) {
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

    const xPoint = this.pointOf(xEvent);

    if (this.placement) {
      this.startPlacementDrag(xEvent, xPoint);
    } else if (this.tool === PAINT_TOOL.select) {
      this.startSelection(xEvent, xPoint);
    } else if (this.tool === PAINT_TOOL.fill) {
      this.fillAt(xPoint);
    } else {
      this.startDrawing(xEvent, xPoint);
    }
  }

  handlePointerMove(xEvent) {
    if (this.stroke?.id !== xEvent.pointerId) {
      return;
    }

    const xPoint = this.pointOf(xEvent);

    if (this.stroke.kind === STROKE_KIND.placement) {
      this.dragPlacement(xPoint);
    } else if (this.stroke.kind === STROKE_KIND.selection) {
      this.stroke.last = xPoint;
      this.updateMarquee(this.stroke.start, xPoint);
    } else {
      this.drawStrokeTo(xPoint);
    }
  }

  handlePointerEnd(xEvent) {
    if (this.stroke?.id !== xEvent.pointerId) {
      return;
    }

    const xStroke = this.stroke;
    this.stroke = null;

    if (xStroke.kind === STROKE_KIND.selection) {
      this.marquee.remove();
      this.liftSelection(xStroke.start, xStroke.last);
    } else if (xStroke.kind === STROKE_KIND.drawing) {
      this.commit();
    }
  }

  // 浮かせているものは、右下の四角なら大きさを、それ以外なら位置を変える。
  startPlacementDrag(xEvent, xPoint) {
    const { x: xX, y: xY, width: xWidth } = this.placement;
    const xMode = xEvent.target === this.frameHandle ? PLACEMENT_DRAG.resize : PLACEMENT_DRAG.move;

    this.stroke = {
      kind: STROKE_KIND.placement,
      id: xEvent.pointerId,
      start: xPoint,
      mode: xMode,
      origin: { x: xX, y: xY, width: xWidth }
    };
  }

  dragPlacement(xPoint) {
    // ドラッグの途中で取り込みをやめていた。
    if (!this.placement) {
      return;
    }

    const { start: xStart, mode: xMode, origin: xOrigin } = this.stroke;
    const xDelta = { x: xPoint.x - xStart.x, y: xPoint.y - xStart.y };

    if (xMode === PLACEMENT_DRAG.move) {
      fsMovePlacement(this.placement, xOrigin, xDelta, this.picture);
      this.updatePlacement(false);
    } else {
      fsResizePlacement(this.placement, xOrigin.width, xDelta, this.picture);
      this.updatePlacement(true);
    }
  }

  // 選択の道具は、ドラッグで囲んだ範囲を指を離したときに切り取る。
  startSelection(xEvent, xPoint) {
    this.stroke = { kind: STROKE_KIND.selection, id: xEvent.pointerId, start: xPoint, last: xPoint };
    this.updateMarquee(xPoint, xPoint);
    this.surface.append(this.marquee);
  }

  updateMarquee(xFrom, xTo) {
    fsPlaceElement(
      this.marquee,
      Math.min(xFrom.x, xTo.x),
      Math.min(xFrom.y, xTo.y),
      Math.abs(xTo.x - xFrom.x) + 1,
      Math.abs(xTo.y - xFrom.y) + 1
    );
  }

  // 塗りつぶしは押しただけで終わる。塗っても何も変わらなかったら、取り消しの記録も残さない。
  fillAt(xPoint) {
    if (!this.picture.contains(xPoint)) {
      return;
    }

    this.pushUndo();

    if (this.picture.fill(xPoint, PAINT_PATTERNS[this.pattern])) {
      this.draw();
      this.commit();
    } else {
      this.undoStack.pop();
    }
  }

  startDrawing(xEvent, xPoint) {
    this.pushUndo();
    this.stroke = {
      kind: STROKE_KIND.drawing,
      id: xEvent.pointerId,
      start: xPoint,
      last: xPoint,
      // 図形は描き始める前の絵に毎回描き直す。
      base: this.picture.snapshot()
    };
    this.drawStrokeTo(xPoint);
  }

  // 鉛筆・消しゴムは前の点から線をつなぎ、図形は押した点から今の点までを描き直す。
  drawStrokeTo(xPoint) {
    const { start: xStart, last: xLast, base: xBase } = this.stroke;

    if (SHAPE_TOOLS.has(this.tool)) {
      this.picture.dots.set(xBase);
      this.drawShape(xStart, xPoint);
    } else if (this.tool === PAINT_TOOL.eraser) {
      this.picture.drawLine(xLast, xPoint, DOT.clear, this.size * ERASER_SCALE);
    } else {
      this.picture.drawLine(xLast, xPoint, DOT.black, this.size);
    }

    this.stroke.last = xPoint;
    this.draw();
  }

  drawShape(xFrom, xTo) {
    if (this.tool === PAINT_TOOL.line) {
      this.picture.drawLine(xFrom, xTo, DOT.black, this.size);
    } else if (this.tool === PAINT_TOOL.rect) {
      this.picture.drawRect(xFrom, xTo, DOT.black, this.size);
    } else {
      this.picture.drawOval(xFrom, xTo, DOT.black, this.size);
    }
  }
}
