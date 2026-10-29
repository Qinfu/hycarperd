import { MIN_PART_SIZE, fsFieldText } from "../storage/StackIO.js";

// 大きな画面で引き伸ばしすぎないための上限。
const MAX_SCALE = 2;

// 横方向にこれだけ動かしたらスワイプとみなす（画面上のピクセル）。
const SWIPE_DISTANCE = 60;

// この時間内に同じ部品を2回押したら、ダブルクリック（ダブルタップ）とみなす。
const DOUBLE_TAP_TIME = 400;

// カードを切り替える効果の長さ（ミリ秒）。visual effect の速さの指定に対応する。
const EFFECT_DURATIONS = { "very fast": 150, fast: 250, normal: 400, slow: 700, "very slow": 1100 };

// ディゾルブで崩していく粒の大きさ（論理ピクセル）と段数。段ごとにまとめて崩し、昔のMacらしいカクカクした動きにする。
const DISSOLVE_DOT = 2;
const DISSOLVE_STEPS = 12;

/*
 * カードの表示領域。スタックの論理サイズ（例：320×480）で部品を並べ、
 * 表示できる範囲いっぱいに収まるよう縮小・拡大する。
 * 背景層（全カード共通）の上にカード層を重ねて描く。各層は下から「絵 → 本文 → 部品」の順。
 * 編集中は、編集している層の部品だけをドラッグで移動・リサイズできる。
 * 描画中は、描いている層の絵を Painter のキャンバスに置き換え、一番上に描画用の板を重ねる。
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
export class CardView {
  constructor(xArea, xWindow, xStage, xHandlers) {
    this.area = xArea;
    this.window = xWindow;
    this.stage = xStage;
    this.handlers = xHandlers;
    this.size = { width: 320, height: 480 };
    this.scale = 1;
    this.editing = false;
    this.painting = false;
    this.card = null;
    this.selectedId = null;
    this.swipeStart = null;
    this.suppressClick = false;
    this.lastTap = null;
    this.effectSnapshot = null;
    this.effectAnimation = null;
    this.effectFrame = 0;
    this.layer = document.createElement("div");
    this.layer.className = "card-layer";
    this.stage.append(this.layer);

    new ResizeObserver(() => this.fit()).observe(this.area);

    this.layer.addEventListener("click", (xEvent) => {
      if (!this.editing && (xEvent.target === this.layer || xEvent.target.classList.contains("card-content"))) {
        this.handlers.onCardClick();
      }
    });

    // スワイプした指がボタンの上で離れても、ボタンが押されたことにしない。
    this.layer.addEventListener("click", (xEvent) => {
      if (this.suppressClick) {
        this.suppressClick = false;
        xEvent.stopPropagation();
        xEvent.preventDefault();
      }
    }, true);

    this.layer.addEventListener("pointerdown", (xEvent) => {
      if (this.editing) {
        if (!this.painting && !xEvent.target.closest(".part")) {
          this.select(null);
        }

        return;
      }

      const xEditableField = xEvent.target.tagName === "TEXTAREA" && !xEvent.target.readOnly;
      this.suppressClick = false;
      this.swipeStart = xEvent.pointerType === "touch" && !xEditableField
        ? { x: xEvent.clientX, y: xEvent.clientY }
        : null;
    });

    this.layer.addEventListener("pointerup", (xEvent) => {
      if (!this.swipeStart) {
        return;
      }

      const xDx = xEvent.clientX - this.swipeStart.x;
      const xDy = xEvent.clientY - this.swipeStart.y;
      this.swipeStart = null;

      if (Math.abs(xDx) >= SWIPE_DISTANCE && Math.abs(xDx) > Math.abs(xDy) * 2) {
        this.suppressClick = true;
        this.handlers.onSwipe(xDx < 0 ? "next" : "prev");
      }
    });
  }

  // 表示できる範囲に収まる倍率を求め、カードの大きさを決める。
  // カードと並べて置いたもの（描画の道具パレット）の分は、範囲から差し引く。
  fit() {
    const { width: xWidth, height: xHeight } = this.size;
    const xAreaStyle = getComputedStyle(this.area);
    const xRow = !xAreaStyle.flexDirection.startsWith("column");
    const xGap = parseFloat(xRow ? xAreaStyle.columnGap : xAreaStyle.rowGap) || 0;
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

    this.scale = xScale > 0 ? xScale : 1;
    this.stage.style.width = `${Math.floor(xWidth * this.scale)}px`;
    this.stage.style.height = `${Math.floor(xHeight * this.scale)}px`;
    this.layer.style.width = `${xWidth}px`;
    this.layer.style.height = `${xHeight}px`;
    this.layer.style.transform = `scale(${this.scale})`;
  }

  // scene: { card, background, editing, painter, layer: "card" | "background", selectedId, size }
  // painter は描画中だけ渡す（描画中は editing も true）。
  render(xScene) {
    const { card: xCard, background: xBackground, editing: xEditing, layer: xLayer, painter: xPainter } = xScene;
    const xPainting = Boolean(xPainter);
    const xEditBackground = xEditing && xLayer === "background";
    const xEditCard = xEditing && xLayer === "card";
    const xElements = [
      ...this.xBuildPicture(xBackground, xEditBackground ? xPainter : null),
      this.xBuildContent(xBackground, xEditBackground && !xPainting)
    ];

    this.editing = xEditing;
    this.painting = xPainting;
    this.card = xCard;
    this.selectedId = xScene.selectedId;
    this.size = xScene.size;
    this.stage.classList.toggle("is-browsing", !xEditing);

    for (const xPart of xBackground.parts) {
      if (xEditBackground && !xPainting) {
        xElements.push(this.xBuildEditPart(xPart, true));
      } else if (xPart.visible) {
        // カードの編集中と描画中は、部品は見えるだけで触れない。
        xElements.push(this.xBuildPart(xPart, true, xEditCard || xPainting));
      }
    }

    // 背景の編集中は、カード層を隠して背景だけを見せる。
    if (!xEditBackground) {
      xElements.push(
        ...this.xBuildPicture(xCard, xEditCard ? xPainter : null),
        this.xBuildContent(xCard, xEditCard && !xPainting)
      );

      for (const xPart of xCard.parts) {
        if (xEditCard && !xPainting) {
          xElements.push(this.xBuildEditPart(xPart, false));
        } else if (xPart.visible) {
          xElements.push(this.xBuildPart(xPart, false, xPainting));
        }
      }
    }

    if (xPainting) {
      xElements.push(xPainter.surface);
    }

    this.layer.replaceChildren(...xElements);
    this.fit();
  }

  // 今の見た目を写し取ってから render（xRender）し、写しを効果付きで消していく。
  // effect: { name: "wipe left" | "wipe right" | "dissolve", speed }。null なら効果なしで切り替える。
  async transition(xEffect, xRender) {
    // 前の効果が終わる前に次の切り替えが来たら、前の写しはすぐ消す。
    this.xFinishEffect();

    if (!xEffect) {
      xRender();
      return;
    }

    const xSnapshot = this.xSnapshot();
    const xDuration = EFFECT_DURATIONS[xEffect.speed] ?? EFFECT_DURATIONS.normal;

    xRender();
    this.stage.append(xSnapshot);
    this.effectSnapshot = xSnapshot;

    if (xEffect.name === "dissolve") {
      await this.xDissolve(xSnapshot, xDuration);
    } else {
      await this.xWipe(xSnapshot, xEffect.name === "wipe left", xDuration);
    }

    if (this.effectSnapshot === xSnapshot) {
      this.xFinishEffect();
    }
  }

  // 今のカードの写し。入力中の文字や描画中の絵も写す。
  xSnapshot() {
    const xSnapshot = document.createElement("div");
    const xCopy = this.layer.cloneNode(true);
    const xFields = this.layer.querySelectorAll("textarea");
    const xCanvases = this.layer.querySelectorAll("canvas");

    xCopy.querySelectorAll("textarea").forEach((xField, xIndex) => {
      xField.value = xFields[xIndex].value;
    });

    xCopy.querySelectorAll("canvas").forEach((xCanvas, xIndex) => {
      xCanvas.getContext("2d").drawImage(xCanvases[xIndex], 0, 0);
    });

    xSnapshot.className = "card-snapshot";
    xSnapshot.inert = true;
    xSnapshot.append(xCopy);
    return xSnapshot;
  }

  // wipe left は右端から、wipe right は左端から、新しいカードが現れる。
  async xWipe(xSnapshot, xLeft, xDuration) {
    this.effectAnimation = xSnapshot.animate(
      [
        { clipPath: "inset(0 0 0 0)" },
        { clipPath: xLeft ? "inset(0 100% 0 0)" : "inset(0 0 0 100%)" }
      ],
      { duration: xDuration, easing: "linear", fill: "forwards" }
    );

    try {
      await this.effectAnimation.finished;
    } catch {
      // 途中で次の切り替えが来て取り消された。
    }
  }

  // 写しを粒ごとにばらばらの順番で消していく（消す粒は透明なマスクで隠す）。
  xDissolve(xSnapshot, xDuration) {
    const xColumns = Math.ceil(this.size.width / DISSOLVE_DOT);
    const xRows = Math.ceil(this.size.height / DISSOLVE_DOT);
    const xCanvas = document.createElement("canvas");
    const xContext = xCanvas.getContext("2d");
    const xOrder = Array.from({ length: xColumns * xRows }, (_, xIndex) => xIndex);

    xCanvas.width = xColumns;
    xCanvas.height = xRows;

    const xMask = xContext.createImageData(xColumns, xRows);
    xMask.data.fill(255);

    for (let xIndex = xOrder.length - 1; xIndex > 0; xIndex -= 1) {
      const xOther = Math.floor(Math.random() * (xIndex + 1));
      [xOrder[xIndex], xOrder[xOther]] = [xOrder[xOther], xOrder[xIndex]];
    }

    return new Promise((xResolve) => {
      const xStart = performance.now();
      let xHidden = 0;

      const xStep = (xNow) => {
        if (this.effectSnapshot !== xSnapshot) {
          xResolve();
          return;
        }

        const xStepIndex = Math.min(DISSOLVE_STEPS, Math.floor(((xNow - xStart) / xDuration) * DISSOLVE_STEPS) + 1);
        const xTarget = Math.round((xOrder.length * xStepIndex) / DISSOLVE_STEPS);

        if (xTarget > xHidden) {
          for (; xHidden < xTarget; xHidden += 1) {
            xMask.data[xOrder[xHidden] * 4 + 3] = 0;
          }

          xContext.putImageData(xMask, 0, 0);

          const xUrl = `url(${xCanvas.toDataURL()})`;
          xSnapshot.style.maskImage = xUrl;
          xSnapshot.style.webkitMaskImage = xUrl;
        }

        if (xStepIndex >= DISSOLVE_STEPS) {
          xResolve();
          return;
        }

        this.effectFrame = requestAnimationFrame(xStep);
      };

      this.effectFrame = requestAnimationFrame(xStep);
    });
  }

  xFinishEffect() {
    cancelAnimationFrame(this.effectFrame);
    this.effectAnimation?.cancel();
    this.effectSnapshot?.remove();
    this.effectFrame = 0;
    this.effectAnimation = null;
    this.effectSnapshot = null;
  }

  select(xPartId) {
    this.selectedId = xPartId;

    for (const xElement of this.layer.querySelectorAll(".part")) {
      xElement.classList.toggle("is-selected", xElement.dataset.id === xPartId);
    }

    this.handlers.onSelect(xPartId);
  }

  // xOwner はカードまたは背景。描画中の層なら Painter のキャンバスを置く。
  xBuildPicture(xOwner, xPainter) {
    if (xPainter) {
      return [xPainter.canvas];
    }

    if (!xOwner.picture) {
      return [];
    }

    const xImage = document.createElement("img");
    xImage.className = "card-picture";
    xImage.src = xOwner.picture;
    xImage.alt = "";
    xImage.draggable = false;
    return [xImage];
  }

  // xOwner はカードまたは背景。editable なら本文を書き換えられる。
  xBuildContent(xOwner, xEditable) {
    if (xEditable) {
      const xInput = document.createElement("textarea");
      xInput.className = "card-content card-content-input";
      xInput.value = xOwner.content;
      xInput.setAttribute("aria-label", "本文");
      xInput.addEventListener("input", () => this.handlers.onContentInput(xInput.value));
      return xInput;
    }

    const xContent = document.createElement("div");
    xContent.className = "card-content";
    xContent.textContent = xOwner.content;
    return xContent;
  }

  xPlace(xElement, xPart) {
    xElement.style.left = `${xPart.left}px`;
    xElement.style.top = `${xPart.top}px`;
    xElement.style.width = `${xPart.width}px`;
    xElement.style.height = `${xPart.height}px`;
    xElement.style.fontSize = `${xPart.textSize}px`;
  }

  // inactive なら、見えるだけで触れない部品にする。
  xBuildPart(xPart, xIsBackground, xInactive = false) {
    let xElement;

    if (xPart.type === "button") {
      xElement = document.createElement("button");
      xElement.type = "button";
      xElement.textContent = xPart.name;
      xElement.addEventListener("click", () => this.handlers.onPartClick(xPart, xIsBackground));
    } else {
      xElement = document.createElement("textarea");
      xElement.value = fsFieldText(xPart, this.card, xIsBackground);
      xElement.readOnly = xPart.lockText;
      xElement.setAttribute("aria-label", xPart.name);
      xElement.addEventListener("input", () => {
        this.handlers.onFieldInput(xPart, xElement.value, xIsBackground);
      });

      // 文字を固定したフィールドは、ボタンと同じく押すとスクリプトが動く。
      if (xPart.lockText) {
        xElement.addEventListener("click", () => this.handlers.onPartClick(xPart, xIsBackground));
      }
    }

    xElement.className = `part part-${xPart.type} style-${xPart.style}`;
    xElement.dataset.id = xPart.id;
    this.xPlace(xElement, xPart);

    if (xInactive) {
      xElement.inert = true;
      xElement.classList.add("is-other-layer");
    }

    return xElement;
  }

  xBuildEditPart(xPart, xIsBackground) {
    const xElement = document.createElement("div");
    const xLabel = document.createElement("span");
    const xHandle = document.createElement("div");

    xElement.className = `part part-${xPart.type} style-${xPart.style} is-edit`;
    xElement.classList.toggle("is-hidden-part", !xPart.visible);
    xElement.classList.toggle("is-selected", xPart.id === this.selectedId);
    xElement.dataset.id = xPart.id;
    xLabel.className = "part-label";
    xLabel.textContent = xPart.type === "button"
      ? xPart.name
      : fsFieldText(xPart, this.card, xIsBackground) || xPart.name;
    xHandle.className = "part-handle";
    xHandle.setAttribute("aria-hidden", "true");
    xElement.append(xLabel, xHandle);
    this.xPlace(xElement, xPart);

    xElement.addEventListener("pointerdown", (xEvent) => {
      const xNow = Date.now();

      if (this.lastTap?.id === xPart.id && xNow - this.lastTap.time < DOUBLE_TAP_TIME) {
        xEvent.preventDefault();
        this.lastTap = null;
        this.handlers.onPartOpen(xPart);
        return;
      }

      this.lastTap = { id: xPart.id, time: xNow };
      this.select(xPart.id);
      this.xStartDrag(xEvent, xElement, xPart, xEvent.target === xHandle ? "resize" : "move");
    });

    return xElement;
  }

  xStartDrag(xEvent, xElement, xPart, xMode) {
    xEvent.preventDefault();

    // 指が部品の外に出てもドラッグを続けられるようにする。
    try {
      xElement.setPointerCapture(xEvent.pointerId);
    } catch {
      // 対応するポインタがない場合（プログラムから送られたイベントなど）は無視する。
    }

    const { width: xCardWidth, height: xCardHeight } = this.size;
    const xStartX = xEvent.clientX;
    const xStartY = xEvent.clientY;
    const xStart = { ...xPart };
    let xMoved = false;

    const xOnMove = (xMoveEvent) => {
      const xDx = Math.round((xMoveEvent.clientX - xStartX) / this.scale);
      const xDy = Math.round((xMoveEvent.clientY - xStartY) / this.scale);

      if (!xMoved && Math.abs(xDx) < 2 && Math.abs(xDy) < 2) {
        return;
      }

      xMoved = true;

      if (xMode === "move") {
        xPart.left = Math.min(Math.max(0, xStart.left + xDx), xCardWidth - xPart.width);
        xPart.top = Math.min(Math.max(0, xStart.top + xDy), xCardHeight - xPart.height);
      } else {
        xPart.width = Math.min(Math.max(MIN_PART_SIZE, xStart.width + xDx), xCardWidth - xPart.left);
        xPart.height = Math.min(Math.max(MIN_PART_SIZE, xStart.height + xDy), xCardHeight - xPart.top);
      }

      this.xPlace(xElement, xPart);
    };

    const xOnEnd = () => {
      xElement.removeEventListener("pointermove", xOnMove);
      xElement.removeEventListener("pointerup", xOnEnd);
      xElement.removeEventListener("pointercancel", xOnEnd);

      if (xMoved) {
        // 動かした後の次のタップは、ダブルタップに数えない。
        this.lastTap = null;
        this.handlers.onPartMoved(xPart);
      }
    };

    xElement.addEventListener("pointermove", xOnMove);
    xElement.addEventListener("pointerup", xOnEnd);
    xElement.addEventListener("pointercancel", xOnEnd);
  }
}
