/*
 * カードを切り替えるときの効果（ワイプ・ディゾルブ）。
 * 切り替える前の見た目を写し取って新しいカードの上に重ね、その写しを効果付きで消していく。
 */

// 効果の名前。スクリプトの visual effect と、カード・スタックの設定の両方から使う。
export const TRANSITION_EFFECT = {
  // 右端から新しいカードが現れる（次のカードへ）。
  wipeLeft: "wipe left",
  // 左端から新しいカードが現れる（前のカードへ）。
  wipeRight: "wipe right",
  dissolve: "dissolve"
};

// 効果の長さ（ミリ秒）。visual effect の速さの指定に対応する。
export const TRANSITION_DURATIONS = { "very fast": 150, fast: 250, normal: 400, slow: 700, "very slow": 1100 };
export const DEFAULT_TRANSITION_SPEED = "normal";

// ディゾルブで崩していく粒の大きさ（論理ピクセル）と段数。段ごとにまとめて崩し、昔のMacらしいカクカクした動きにする。
const DISSOLVE_DOT = 2;
const DISSOLVE_STEPS = 12;

const SNAPSHOT_CLASS_NAME = "card-snapshot";

// 透明にする粒のアルファ値と、画素あたりの値の数（RGBA）。
const HIDDEN_ALPHA = 0;
const CHANNELS_PER_PIXEL = 4;
const ALPHA_CHANNEL = 3;

// 粒を消す順番。毎回ばらばらにする（フィッシャー–イェーツのシャッフル）。
const fsShuffledOrder = (xCount) => {
  const xOrder = Array.from({ length: xCount }, (_, xIndex) => xIndex);

  for (let xIndex = xOrder.length - 1; xIndex > 0; xIndex -= 1) {
    const xOther = Math.floor(Math.random() * (xIndex + 1));
    [xOrder[xIndex], xOrder[xOther]] = [xOrder[xOther], xOrder[xIndex]];
  }

  return xOrder;
};

export class CardTransition {
  // stage：カードを表示する枠（写しをここに重ねる）。layer：写し取るカードの中身。
  constructor(xStage, xLayer) {
    this.stage = xStage;
    this.layer = xLayer;
    this.snapshot = null;
    this.animation = null;
    this.frame = 0;
  }

  // 今の見た目を写し取ってから render を呼び、写しを効果付きで消していく。
  // effect: { name: TRANSITION_EFFECT の値, speed }。null なら効果なしで切り替える。
  // readCardSize() はカードの論理サイズを返す。ディゾルブの粒の数に使う。
  async run(xEffect, xRender, xReadCardSize) {
    // 前の効果が終わる前に次の切り替えが来たら、前の写しはすぐ消す。
    this.finish();

    if (!xEffect) {
      xRender();
      return;
    }

    const xSnapshot = this.createSnapshot();
    const xDuration = TRANSITION_DURATIONS[xEffect.speed] ?? TRANSITION_DURATIONS[DEFAULT_TRANSITION_SPEED];

    xRender();
    this.stage.append(xSnapshot);
    this.snapshot = xSnapshot;

    if (xEffect.name === TRANSITION_EFFECT.dissolve) {
      // 別のスタックへ移ったときは大きさが変わるので、render の後の大きさで粒を作る。
      await this.dissolve(xSnapshot, xDuration, xReadCardSize());
    } else {
      await this.wipe(xSnapshot, xEffect.name === TRANSITION_EFFECT.wipeLeft, xDuration);
    }

    // 待っている間に次の切り替えが始まっていたら、その写しには触れない。
    if (this.snapshot === xSnapshot) {
      this.finish();
    }
  }

  // 途中の効果をやめ、写しを消す。
  finish() {
    cancelAnimationFrame(this.frame);
    this.animation?.cancel();
    this.snapshot?.remove();
    this.frame = 0;
    this.animation = null;
    this.snapshot = null;
  }

  // 今のカードの写し。cloneNode では写らない、入力中の文字と描画中の絵も写す。
  createSnapshot() {
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

    xSnapshot.className = SNAPSHOT_CLASS_NAME;
    // 写しは見せるだけ。下の新しいカードの操作を邪魔しない。
    xSnapshot.inert = true;
    xSnapshot.append(xCopy);
    return xSnapshot;
  }

  async wipe(xSnapshot, xToLeft, xDuration) {
    this.animation = xSnapshot.animate(
      [
        { clipPath: "inset(0 0 0 0)" },
        { clipPath: xToLeft ? "inset(0 100% 0 0)" : "inset(0 0 0 100%)" }
      ],
      { duration: xDuration, easing: "linear", fill: "forwards" }
    );

    try {
      await this.animation.finished;
    } catch {
      // 途中で次の切り替えが来て取り消された。
    }
  }

  // 写しを粒ごとにばらばらの順番で消していく（消す粒は透明なマスクで隠す）。
  dissolve(xSnapshot, xDuration, xCardSize) {
    const xColumns = Math.ceil(xCardSize.width / DISSOLVE_DOT);
    const xRows = Math.ceil(xCardSize.height / DISSOLVE_DOT);
    const xCanvas = document.createElement("canvas");
    const xContext = xCanvas.getContext("2d");
    const xOrder = fsShuffledOrder(xColumns * xRows);

    xCanvas.width = xColumns;
    xCanvas.height = xRows;

    // 最初はすべての粒を見せる（不透明）マスク。
    const xMask = xContext.createImageData(xColumns, xRows);
    xMask.data.fill(255);

    return new Promise((xResolve) => {
      const xStart = performance.now();
      let xHiddenCount = 0;

      const xStep = (xNow) => {
        if (this.snapshot !== xSnapshot) {
          xResolve();
          return;
        }

        const xElapsedSteps = Math.floor(((xNow - xStart) / xDuration) * DISSOLVE_STEPS) + 1;
        const xStepIndex = Math.min(DISSOLVE_STEPS, xElapsedSteps);
        const xTargetCount = Math.round((xOrder.length * xStepIndex) / DISSOLVE_STEPS);

        if (xTargetCount > xHiddenCount) {
          for (; xHiddenCount < xTargetCount; xHiddenCount += 1) {
            xMask.data[xOrder[xHiddenCount] * CHANNELS_PER_PIXEL + ALPHA_CHANNEL] = HIDDEN_ALPHA;
          }

          xContext.putImageData(xMask, 0, 0);

          const xMaskUrl = `url(${xCanvas.toDataURL()})`;
          xSnapshot.style.maskImage = xMaskUrl;
          xSnapshot.style.webkitMaskImage = xMaskUrl;
        }

        if (xStepIndex >= DISSOLVE_STEPS) {
          xResolve();
          return;
        }

        this.frame = requestAnimationFrame(xStep);
      };

      this.frame = requestAnimationFrame(xStep);
    });
  }
}
