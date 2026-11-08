/*
 * カードの表示領域。スタックの論理サイズ（例：320×480）で部品を並べ、
 * 表示できる範囲いっぱいに収まるよう縮小・拡大する。
 * 背景層（全カード共通）の上にカード層を重ねて描く。各層は下から「絵 → 本文 → 部品」の順。
 * 編集中は、編集している層の部品だけをドラッグで移動・リサイズできる。
 * 描画中は、描いている層の絵を Painter のキャンバスに置き換え、一番上に描画用の板を重ねる。
 * 部品の要素は PartElements.js、ドラッグは PartDrag.js、切り替えの効果は CardTransition.js が作る。
 *
 * handlers（isBackground は背景層の部品なら true）:
 *   onPartClick(part, isBackground)        閲覧中にボタン（またはロックしたフィールド）を押した
 *   onCardClick()                          閲覧中にカードの何もない所を押した
 *   onFieldInput(part, text, isBackground) 閲覧中にフィールドへ入力した
 *   onSwipe(direction)       閲覧中に指で左右にはらった（"next" / "prev"）
 *   onContentInput(text)     編集中に、編集している層の本文を書き換えた
 *   onSelect(partId)         編集中に部品を選んだ（null で選択解除）
 *   onPartOpen(part)         編集中に部品をダブルクリック（ダブルタップ）した
 *   onPartMoved(part)        編集中に部品を動かした・大きさを変えた
 */
import { NEW_PART_KIND } from "../model/StackFormat.js";
import { fsFieldText } from "../model/StackModel.js";
import { CardTransition } from "./CardTransition.js";
import { PART_DRAG_MODE, fsStartPartDrag } from "./PartDrag.js";
import { fsCreateEditPartElement, fsCreatePartElement, fsMarkSelectedPart, fsPlacePartElement } from "./PartElements.js";

// 大きな画面で引き伸ばしすぎないための上限。
const MAX_SCALE = 2;

// 描く前のカードの大きさ。render で実際のスタックの大きさに置き換わる。
const INITIAL_CARD_SIZE = { width: 320, height: 480 };

// 横方向にこれだけ動かしたらスワイプとみなす（画面上のピクセル）。縦の動きの2倍より大きいことも条件にする。
const SWIPE_DISTANCE = 60;
const SWIPE_DIRECTION_RATIO = 2;
export const SWIPE_DIRECTION = { next: "next", prev: "prev" };

// この時間内に同じ部品を2回押したら、ダブルクリック（ダブルタップ）とみなす。
const DOUBLE_TAP_TIME = 400;

// 編集している層。
const EDIT_LAYER = { card: "card", background: "background" };

const CLASS_NAME = {
  layer: "card-layer",
  picture: "card-picture",
  content: "card-content",
  contentInput: "card-content-input",
  browsing: "is-browsing",
  part: "part"
};

export class CardView {
  constructor(xArea, xWindow, xStage, xHandlers) {
    this.area = xArea;
    this.window = xWindow;
    this.stage = xStage;
    this.handlers = xHandlers;
    this.size = INITIAL_CARD_SIZE;
    this.scale = 1;
    this.editing = false;
    this.painting = false;
    this.card = null;
    this.selectedId = null;
    this.swipeStart = null;
    this.suppressClick = false;
    this.lastTap = null;
    this.layer = document.createElement("div");
    this.layer.className = CLASS_NAME.layer;
    this.stage.append(this.layer);
    this.cardTransition = new CardTransition(this.stage, this.layer);

    new ResizeObserver(() => this.fit()).observe(this.area);

    this.layer.addEventListener("click", (xEvent) => this.handleCardClick(xEvent));
    // スワイプした指がボタンの上で離れても、ボタンが押されたことにしない（部品より先に受け取る）。
    this.layer.addEventListener("click", (xEvent) => this.suppressClickAfterSwipe(xEvent), true);
    this.layer.addEventListener("pointerdown", (xEvent) => this.handlePointerDown(xEvent));
    this.layer.addEventListener("pointerup", (xEvent) => this.handlePointerUp(xEvent));
  }

  // ---- 大きさ ----

  // 表示できる範囲に収まる倍率を求め、カードの大きさを決める。
  // カードと並べて置いたもの（描画の道具パレット）の分は、範囲から差し引く。
  fit() {
    const { width: xWidth, height: xHeight } = this.size;
    const xAreaStyle = getComputedStyle(this.area);
    const xRow = !xAreaStyle.flexDirection.startsWith("column");
    const xGap = parseFloat(xRow ? xAreaStyle.columnGap : xAreaStyle.rowGap) || 0;
    // カードの枠やタイトルバーの分。
    let xChromeWidth = this.window.offsetWidth - this.stage.offsetWidth;
    let xChromeHeight = this.window.offsetHeight - this.stage.offsetHeight;

    for (const xSibling of this.area.children) {
      if (xSibling === this.window || xSibling.hidden) {
        continue;
      }

      if (xRow) {
        xChromeWidth += xSibling.offsetWidth + xGap;
      } else {
        xChromeHeight += xSibling.offsetHeight + xGap;
      }
    }

    const xScale = Math.min(
      (this.area.clientWidth - xChromeWidth) / xWidth,
      (this.area.clientHeight - xChromeHeight) / xHeight,
      MAX_SCALE
    );

    // 表示する前など、範囲の大きさがまだ分からないときは等倍にしておく。
    this.scale = xScale > 0 ? xScale : 1;
    this.stage.style.width = `${Math.floor(xWidth * this.scale)}px`;
    this.stage.style.height = `${Math.floor(xHeight * this.scale)}px`;
    this.layer.style.width = `${xWidth}px`;
    this.layer.style.height = `${xHeight}px`;
    this.layer.style.transform = `scale(${this.scale})`;
  }

  // ---- 表示 ----

  // scene: { card, background, editing, painter, layer: "card" | "background", selectedId, size }
  // painter は描画中だけ渡す（描画中は editing も true）。
  render(xScene) {
    const { card: xCard, background: xBackground, editing: xEditing, painter: xPainter } = xScene;
    const xPainting = Boolean(xPainter);
    const xEditBackground = xEditing && xScene.layer === EDIT_LAYER.background;
    const xEditCard = xEditing && xScene.layer === EDIT_LAYER.card;

    this.editing = xEditing;
    this.painting = xPainting;
    this.card = xCard;
    this.selectedId = xScene.selectedId;
    this.size = xScene.size;
    this.stage.classList.toggle(CLASS_NAME.browsing, !xEditing);

    // 背景の部品は、カードの編集中と描画中は見えるだけで触れない。
    const xElements = this.buildLayer(xBackground, true, {
      painter: xEditBackground ? xPainter : null,
      editParts: xEditBackground && !xPainting,
      inactive: xEditCard || xPainting
    });

    // 背景の編集中は、カード層を隠して背景だけを見せる。
    if (!xEditBackground) {
      xElements.push(...this.buildLayer(xCard, false, {
        painter: xEditCard ? xPainter : null,
        editParts: xEditCard && !xPainting,
        inactive: xPainting
      }));
    }

    if (xPainting) {
      xElements.push(xPainter.surface);
    }

    this.layer.replaceChildren(...xElements);
    this.fit();
  }

  // 1つの層（カードか背景）の要素。下から「絵 → 本文 → 部品」の順。
  // options: { painter（この層に描いているとき）, editParts（部品を編集する）, inactive（部品に触れない）}
  buildLayer(xOwner, xIsBackground, { painter: xPainter, editParts: xEditParts, inactive: xInactive }) {
    const xElements = [
      ...this.buildPicture(xOwner, xPainter),
      this.buildContent(xOwner, xEditParts)
    ];

    for (const xPart of xOwner.parts) {
      if (xEditParts) {
        xElements.push(this.buildEditPart(xPart, xIsBackground));
      } else if (xPart.visible) {
        xElements.push(this.buildPart(xPart, xIsBackground, xInactive));
      }
    }

    return xElements;
  }

  // 今の見た目を写し取ってから render（xRender）し、写しを効果付きで消していく。
  // effect: { name: "wipe left" | "wipe right" | "dissolve", speed }。null なら効果なしで切り替える。
  transition(xEffect, xRender) {
    return this.cardTransition.run(xEffect, xRender, () => this.size);
  }

  select(xPartId) {
    this.selectedId = xPartId;
    fsMarkSelectedPart(this.layer, xPartId);
    this.handlers.onSelect(xPartId);
  }

  // 描画中の層なら Painter のキャンバスを置く。
  buildPicture(xOwner, xPainter) {
    if (xPainter) {
      return [xPainter.canvas];
    }

    if (!xOwner.picture) {
      return [];
    }

    const xImage = document.createElement("img");
    xImage.className = CLASS_NAME.picture;
    xImage.src = xOwner.picture;
    xImage.alt = "";
    xImage.draggable = false;
    return [xImage];
  }

  // editable なら本文を書き換えられる。
  buildContent(xOwner, xEditable) {
    if (xEditable) {
      const xInput = document.createElement("textarea");
      xInput.className = `${CLASS_NAME.content} ${CLASS_NAME.contentInput}`;
      xInput.value = xOwner.content;
      xInput.setAttribute("aria-label", "本文");
      xInput.addEventListener("input", () => this.handlers.onContentInput(xInput.value));
      return xInput;
    }

    const xContent = document.createElement("div");
    xContent.className = CLASS_NAME.content;
    xContent.textContent = xOwner.content;
    return xContent;
  }

  // ボタンには文字の中身がないので、フィールドのときだけ今のカードの文字を読む。
  fieldTextOf(xPart, xIsBackground) {
    return xPart.type === NEW_PART_KIND.button ? "" : fsFieldText(xPart, this.card, xIsBackground);
  }

  buildPart(xPart, xIsBackground, xInactive) {
    return fsCreatePartElement(xPart, {
      fieldText: this.fieldTextOf(xPart, xIsBackground),
      inactive: xInactive,
      actions: {
        onPress: () => this.handlers.onPartClick(xPart, xIsBackground),
        onInput: (xText) => this.handlers.onFieldInput(xPart, xText, xIsBackground),
        onCardPress: () => this.handlers.onCardClick()
      }
    });
  }

  buildEditPart(xPart, xIsBackground) {
    const { element: xElement, handle: xHandle } = fsCreateEditPartElement(xPart, {
      fieldText: this.fieldTextOf(xPart, xIsBackground),
      selected: xPart.id === this.selectedId
    });

    xElement.addEventListener("pointerdown", (xEvent) => this.handleEditPartPress(xEvent, xElement, xHandle, xPart));
    return xElement;
  }

  // ---- 操作 ----

  handleCardClick(xEvent) {
    const xOnCard = xEvent.target === this.layer || xEvent.target.classList.contains(CLASS_NAME.content);

    if (!this.editing && xOnCard) {
      this.handlers.onCardClick();
    }
  }

  suppressClickAfterSwipe(xEvent) {
    if (this.suppressClick) {
      this.suppressClick = false;
      xEvent.stopPropagation();
      xEvent.preventDefault();
    }
  }

  handlePointerDown(xEvent) {
    // 編集中は、部品の外を押したら選択を外す。描画中は描画用の板が受け取るので何もしない。
    if (this.editing) {
      if (!this.painting && !xEvent.target.closest(`.${CLASS_NAME.part}`)) {
        this.select(null);
      }

      return;
    }

    // 入力できるフィールドの上では、文字を選ぶ操作をスワイプと取り違えないよう、スワイプを数えない。
    const xEditableField = xEvent.target.tagName === "TEXTAREA" && !xEvent.target.readOnly;
    this.suppressClick = false;
    this.swipeStart = xEvent.pointerType === "touch" && !xEditableField
      ? { x: xEvent.clientX, y: xEvent.clientY }
      : null;
  }

  handlePointerUp(xEvent) {
    if (!this.swipeStart) {
      return;
    }

    const xDx = xEvent.clientX - this.swipeStart.x;
    const xDy = xEvent.clientY - this.swipeStart.y;
    this.swipeStart = null;

    if (Math.abs(xDx) >= SWIPE_DISTANCE && Math.abs(xDx) > Math.abs(xDy) * SWIPE_DIRECTION_RATIO) {
      this.suppressClick = true;
      this.handlers.onSwipe(xDx < 0 ? SWIPE_DIRECTION.next : SWIPE_DIRECTION.prev);
    }
  }

  // 2回続けて押したら設定を開き、そうでなければ選んでドラッグを始める。
  handleEditPartPress(xEvent, xElement, xHandle, xPart) {
    const xNow = Date.now();

    if (this.lastTap?.id === xPart.id && xNow - this.lastTap.time < DOUBLE_TAP_TIME) {
      xEvent.preventDefault();
      this.lastTap = null;
      this.handlers.onPartOpen(xPart);
      return;
    }

    this.lastTap = { id: xPart.id, time: xNow };
    this.select(xPart.id);

    fsStartPartDrag(xEvent, xElement, {
      part: xPart,
      mode: xEvent.target === xHandle ? PART_DRAG_MODE.resize : PART_DRAG_MODE.move,
      scale: this.scale,
      cardSize: this.size,
      onUpdate: () => fsPlacePartElement(xElement, xPart),
      onEnd: (xMoved) => {
        if (xMoved) {
          // 動かした後の次のタップは、ダブルタップに数えない。
          this.lastTap = null;
          this.handlers.onPartMoved(xPart);
        }
      }
    });
  }
}
