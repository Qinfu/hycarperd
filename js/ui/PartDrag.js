/*
 * 編集中に部品をドラッグして、動かす・大きさを変える。
 */
import { MIN_PART_SIZE } from "../model/StackFormat.js";

export const PART_DRAG_MODE = { move: "move", resize: "resize" };

// 押した指が少し揺れただけで動かさないよう、この距離（論理ピクセル）より動いてからドラッグとみなす。
const DRAG_THRESHOLD = 2;

const fsClamp = (xValue, xMin, xMax) => Math.min(Math.max(xValue, xMin), xMax);

// ドラッグを始めたときの部品（start）から delta だけ動かした位置・大きさを part に入れる。
// 部品はカードからはみ出さないようにし、大きさは MIN_PART_SIZE より小さくしない。
export const fsApplyPartDrag = (xPart, xStart, xDelta, xMode, xCardSize) => {
  if (xMode === PART_DRAG_MODE.move) {
    xPart.left = Math.min(Math.max(0, xStart.left + xDelta.x), xCardSize.width - xPart.width);
    xPart.top = Math.min(Math.max(0, xStart.top + xDelta.y), xCardSize.height - xPart.height);
    return;
  }

  xPart.width = Math.min(Math.max(MIN_PART_SIZE, xStart.width + xDelta.x), xCardSize.width - xPart.left);
  xPart.height = Math.min(Math.max(MIN_PART_SIZE, xStart.height + xDelta.y), xCardSize.height - xPart.top);
};

// pointerdown から指を離すまで、部品を動かし続ける。
// options: { part, mode, scale（画面の倍率）, cardSize, onUpdate()（動かすたび）, onEnd(moved) }
export const fsStartPartDrag = (xEvent, xElement, xOptions) => {
  const { part: xPart, mode: xMode, scale: xScale, cardSize: xCardSize } = xOptions;

  xEvent.preventDefault();

  // 指が部品の外に出てもドラッグを続けられるようにする。
  try {
    xElement.setPointerCapture(xEvent.pointerId);
  } catch {
    // 対応するポインタがない場合（プログラムから送られたイベントなど）は無視する。
  }

  const xStartX = xEvent.clientX;
  const xStartY = xEvent.clientY;
  const xStart = { ...xPart };
  let xMoved = false;

  const xOnMove = (xMoveEvent) => {
    // 画面上の移動量を、カードの論理ピクセルに直す。
    const xDelta = {
      x: Math.round((xMoveEvent.clientX - xStartX) / xScale),
      y: Math.round((xMoveEvent.clientY - xStartY) / xScale)
    };

    if (!xMoved && Math.abs(xDelta.x) < DRAG_THRESHOLD && Math.abs(xDelta.y) < DRAG_THRESHOLD) {
      return;
    }

    xMoved = true;
    fsApplyPartDrag(xPart, xStart, xDelta, xMode, xCardSize);
    xOptions.onUpdate();
  };

  const xOnEnd = () => {
    xElement.removeEventListener("pointermove", xOnMove);
    xElement.removeEventListener("pointerup", xOnEnd);
    xElement.removeEventListener("pointercancel", xOnEnd);
    xOptions.onEnd(xMoved);
  };

  xElement.addEventListener("pointermove", xOnMove);
  xElement.addEventListener("pointerup", xOnEnd);
  xElement.addEventListener("pointercancel", xOnEnd);
};
