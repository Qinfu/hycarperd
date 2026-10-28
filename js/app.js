import { StackIO, MAX_CARDS, xCardSize, xBackgroundOf, xSetFieldText } from "./storage/StackIO.js";
import { Interpreter } from "./hypertalk/Interpreter.js";
import { CardView } from "./ui/CardView.js";
import { Inspector } from "./ui/Inspector.js";
import { MenuBar } from "./ui/MenuBar.js";
import { Painter } from "./ui/Painter.js";
import { PaintPalette } from "./ui/PaintPalette.js";
import { xAnswer, xAsk } from "./ui/Dialog.js";
import { xHasSound, xPlaySound, xUnlockSound } from "./ui/Sound.js";

const xCardWindow = document.querySelector("#card-window");
const xCardName = document.querySelector("#card-name");
const xMessageBox = document.querySelector("#message-box");
const xToast = document.querySelector("#toast");
const xStackFile = document.querySelector("#stack-file");
const xPaletteRoot = document.querySelector("#paint-palette");
const xImageFile = document.querySelector("#image-file");

const SAVE_DELAY = 500;
const MAX_HISTORY = 50;
const TOAST_TIME = 2500;

// 画面が狭い、またはタッチ操作が主で中くらいまでの幅ならスマホ用の画面にする。
const MOBILE_QUERY = matchMedia("(max-width: 600px), (pointer: coarse) and (max-width: 900px)");

// 動きを減らす設定の端末では、カードの切り替え効果を付けない。
const REDUCED_MOTION_QUERY = matchMedia("(prefers-reduced-motion: reduce)");

let pStack = null;
let pCardIndex = 0;
let pEditing = false;
let pPainting = false;
let pEditLayer = "card";
let pSelectedId = null;
let pSaveTimer = null;
let pToastTimer = null;
let pHistory = [];
let pImageUrl = "";

// アプリからのお知らせ。少しの間だけ表示する。
function xShowStatus(xMessage) {
  clearTimeout(pToastTimer);
  xToast.textContent = xMessage;
  xToast.hidden = false;
  pToastTimer = setTimeout(() => {
    xToast.hidden = true;
  }, TOAST_TIME);
}

// スクリプトの put の表示先。書き込まれたら表示する。
function xShowMessage(xText) {
  xMessageBox.textContent = xText;
  xMessageBox.hidden = false;
}

function xSaveNow() {
  clearTimeout(pSaveTimer);
  pSaveTimer = null;

  if (pStack && !StackIO.saveLocal(pStack)) {
    xShowStatus("ブラウザに保存できません。JSONで保存してください。");
  }
}

// 文字入力のたびに保存しないよう、少し待ってからまとめて保存する。
function xScheduleSave() {
  clearTimeout(pSaveTimer);
  pSaveTimer = setTimeout(xSaveNow, SAVE_DELAY);
}

function xCurrentCard() {
  return pStack.cards[pCardIndex];
}

function xCurrentBackground() {
  return xBackgroundOf(pStack, xCurrentCard());
}

// 編集している層（カードまたは背景）。部品の追加・選択・削除はこの層に対して行う。
function xEditOwner() {
  return pEditLayer === "background" ? xCurrentBackground() : xCurrentCard();
}

function xSelectedPart() {
  if (!pStack || !pEditing || pPainting) {
    return null;
  }

  return xEditOwner().parts.find((xPart) => xPart.id === pSelectedId) ?? null;
}

function xCardObject() {
  return { kind: "card", card: xCurrentCard() };
}

function xPartObject(xPart, xIsBackground) {
  return { kind: "part", part: xPart, card: xCurrentCard(), isBackground: xIsBackground };
}

async function xConfirm(xMessage) {
  return (await xAnswer(xMessage, ["キャンセル", "OK"])) === "OK";
}

// 現在のスタックはブラウザ内に1つしか保存しないため、置き換える前に確認する。
function xConfirmReplace() {
  return xConfirm(
    "現在のスタックは置き換えられます。\n残したい場合は先に「JSONで保存」してください。\n続けますか？"
  );
}

// スクリプトの実行中は、画面からの操作を受け付けない。
function xIsBusy() {
  if (pInterpreter.busy) {
    xShowStatus("スクリプトを実行中です。ツールメニューで中断できます。");
    return true;
  }

  return false;
}

// ---- スクリプトの実行系に渡す画面側の機能 ----

const pInterpreter = new Interpreter({
  getStack: () => pStack,
  getCardIndex: () => pCardIndex,
  goToCard: (xIndex, xEffect) => xGoToCard(xIndex, true, xEffect),
  goBack: (xEffect) => xGoBack(xEffect),
  changed: () => {
    xRenderCard();
    xScheduleSave();
  },
  getMessage: () => xMessageBox.textContent,
  setMessage: (xText) => xShowMessage(xText),
  answer: (xText, xButtons) => xAnswer(xText, xButtons),
  ask: (xText, xDefault) => xAsk(xText, xDefault),
  beep: () => xPlaySound(pStack.stack.beepSound),
  play: (xName) => (xHasSound(xName) ? xPlaySound(xName) : null),
  reportError: (xError) => {
    const xWhere = [xError.where, xError.line ? `${xError.line}行目` : ""]
      .filter(Boolean)
      .join(" ");
    xAnswer(`スクリプトエラー\n${xWhere}\n\n${xError.message}`);
  }
});

const pCardView = new CardView(
  document.querySelector("#card-area"),
  xCardWindow,
  document.querySelector("#card-stage"),
  {
    onPartClick: (xPart, xIsBackground) => {
      // 押したときの音は、スクリプトが動いている最中でも鳴らす。
      if (xPart.type === "button" && xPart.sound) {
        xPlaySound(xPart.sound);
      }

      if (!pInterpreter.busy) {
        pInterpreter.sendMessage("mouseUp", xPartObject(xPart, xIsBackground));
      }
    },
    onCardClick: () => {
      if (!pInterpreter.busy) {
        pInterpreter.sendMessage("mouseUp", xCardObject());
      }
    },
    onFieldInput: (xPart, xText, xIsBackground) => {
      xSetFieldText(xPart, xCurrentCard(), xIsBackground, xText);
      xScheduleSave();
    },
    onSwipe: (xDirection) => {
      xNavigate(pCardIndex + (xDirection === "next" ? 1 : -1));
    },
    onContentInput: (xText) => {
      xEditOwner().content = xText;
      xScheduleSave();
    },
    onSelect: (xPartId) => {
      pSelectedId = xPartId;
    },
    onPartOpen: (xPart) => {
      pSelectedId = xPart.id;
      xShowInfo("part");
    },
    onPartMoved: () => {
      xScheduleSave();
    }
  }
);

const pInspector = new Inspector({
  onChange: (xRerender) => {
    if (xRerender) {
      xRenderCard();
    }

    xScheduleSave();
  },
  onDeletePart: (xPart) => xDeletePart(xPart),
  onClose: () => xSaveNow()
});

// 描画中は pEditing も true にして、スクリプトを動かさない（openCard なども送らない）。
const pPainter = new Painter({
  onChange: (xOwner, xPicture) => {
    xOwner.picture = xPicture;
    xScheduleSave();
  },
  onState: () => pPalette?.update()
});

const pPalette = new PaintPalette(xPaletteRoot, pPainter, {
  onUndo: () => pPainter.undo(),
  onDone: () => xSetTool("browse"),
  onLayout: () => pCardView.fit()
});

// ---- メニュー ----

const pMenuBar = new MenuBar(document.querySelector("#menubar"), [
  {
    title: "ファイル",
    items: [
      { label: "新規スタック…", action: () => xNewStack() },
      { label: "JSONを開く…", action: () => xStackFile.click() },
      { label: "JSONで保存", action: () => xSaveJson(), enabled: () => Boolean(pStack) },
      "-",
      { label: "サンプルを開く", action: () => xOpenSample() }
    ]
  },
  {
    title: "編集",
    items: [
      {
        label: "新規カード",
        action: () => xNewCard(),
        enabled: () => Boolean(pStack) && pStack.cards.length < MAX_CARDS
      },
      {
        label: "カードを削除",
        action: () => xDeleteCard(),
        enabled: () => Boolean(pStack) && pStack.cards.length > 1
      },
      "-",
      {
        label: "部品を削除",
        action: () => xDeletePart(xSelectedPart()),
        enabled: () => pEditing && Boolean(xSelectedPart())
      },
      "-",
      {
        label: "描画を取り消す",
        action: () => pPainter.undo(),
        enabled: () => pPainting && (pPainter.canUndo || pPainter.placing)
      },
      { label: "絵をすべて消す", action: () => xClearPicture(), enabled: () => pPainting && !pPainter.placing },
      { label: "画像を取り込む…", action: () => xChooseImage(), enabled: () => Boolean(pStack) }
    ]
  },
  {
    title: "移動",
    items: [
      { label: "戻る", action: () => xGoBack(), enabled: () => pHistory.length > 0 },
      "-",
      { label: "最初のカード", action: () => xNavigate(0), enabled: () => pCardIndex > 0 },
      { label: "前のカード", action: () => xNavigate(pCardIndex - 1), enabled: () => pCardIndex > 0 },
      { label: "次のカード", action: () => xNavigate(pCardIndex + 1), enabled: () => xHasNextCard() },
      { label: "最後のカード", action: () => xNavigate(pStack.cards.length - 1), enabled: () => xHasNextCard() },
      "-",
      {
        label: "メッセージボックス",
        action: () => {
          xMessageBox.hidden = !xMessageBox.hidden;
        },
        checked: () => !xMessageBox.hidden
      }
    ]
  },
  {
    title: "ツール",
    items: [
      { label: "ブラウズ", action: () => xSetTool("browse"), checked: () => !pEditing },
      {
        label: "カードを編集",
        action: () => xSetTool("card"),
        checked: () => pEditing && !pPainting && pEditLayer === "card"
      },
      {
        label: "背景を編集",
        action: () => xSetTool("background"),
        checked: () => pEditing && !pPainting && pEditLayer === "background"
      },
      "-",
      {
        label: "カードに描く",
        action: () => xSetTool("paint-card"),
        checked: () => pPainting && pEditLayer === "card"
      },
      {
        label: "背景に描く",
        action: () => xSetTool("paint-background"),
        checked: () => pPainting && pEditLayer === "background"
      }
    ]
  },
  {
    title: "オブジェクト",
    items: [
      { label: "新規ボタン", action: () => xAddPart("button"), enabled: () => Boolean(pStack) },
      { label: "新規フィールド", action: () => xAddPart("field"), enabled: () => Boolean(pStack) },
      "-",
      {
        label: "部品の情報…",
        action: () => xShowInfo("part"),
        enabled: () => pEditing && Boolean(xSelectedPart())
      },
      { label: "カード情報…", action: () => xShowInfo("card"), enabled: () => Boolean(pStack) },
      { label: "背景情報…", action: () => xShowInfo("background"), enabled: () => Boolean(pStack) },
      { label: "スタック情報…", action: () => xShowInfo("stack"), enabled: () => Boolean(pStack) }
    ]
  }
]);

// ---- 描画 ----

function xHasNextCard() {
  return Boolean(pStack) && pCardIndex < pStack.cards.length - 1;
}

function xIsBackgroundEditing() {
  return pEditing && pEditLayer === "background";
}

function xUpdateTitles() {
  const xCard = xCurrentCard();
  const xPosition = `${pCardIndex + 1} / ${pStack.cards.length}`;

  if (xIsBackgroundEditing()) {
    const xDoing = pPainting ? "背景に描画中" : "背景を編集中";
    xCardName.textContent = `背景：${xCurrentBackground().name}`;
    pMenuBar.setTitle(pStack.stack.name, `${xDoing}（${xCard.name}　${xPosition}）`);
  } else if (pPainting) {
    xCardName.textContent = `${xCard.name}（描画中）`;
    pMenuBar.setTitle(pStack.stack.name, `描画中（${xCard.name}　${xPosition}）`);
  } else {
    xCardName.textContent = xCard.name;
    pMenuBar.setTitle(pStack.stack.name, `${xCard.name}　${xPosition}`);
  }
}

function xRenderCard() {
  if (!pStack) {
    return;
  }

  // 描画中は、カードを移動したら描く相手もそのカード（または背景）に変える。
  if (pPainting) {
    pPainter.begin(xEditOwner(), xCardSize(pStack));
  }

  xPaletteRoot.hidden = !pPainting;

  pCardView.render({
    card: xCurrentCard(),
    background: xCurrentBackground(),
    editing: pEditing,
    painter: pPainting ? pPainter : null,
    layer: pEditLayer,
    selectedId: pSelectedId,
    size: xCardSize(pStack)
  });

  // 背景の編集中は、オリジナルと同じくメニューバーを縞模様にして知らせる。
  document.documentElement.dataset.editLayer = xIsBackgroundEditing() ? "background" : "";
  // 描画中は編集用の方眼を出さず、絵だけを見やすくする。
  xCardWindow.classList.toggle("is-editing", pEditing && !pPainting);
  xUpdateTitles();
}

// ---- カードの移動 ----

// 切り替えの効果。visual effect の指定（effect）があればそれを、なければスタックの設定に従う。
// 編集中・描画中は効果を付けない。
function xEffectFor(xIndex, xEffect) {
  if (pEditing || xIndex === pCardIndex || REDUCED_MOTION_QUERY.matches) {
    return null;
  }

  if (xEffect) {
    return xEffect.name === "plain" ? null : xEffect;
  }

  if (pStack.stack.effect === "dissolve") {
    return { name: "dissolve", speed: "normal" };
  }

  if (pStack.stack.effect === "wipe") {
    return { name: xIndex > pCardIndex ? "wipe left" : "wipe right", speed: "normal" };
  }

  return null;
}

// 閲覧中は closeCard / openCard を送る。
async function xGoToCard(xIndex, xRemember = true, xEffect = null) {
  if (!pStack || xIndex < 0 || xIndex >= pStack.cards.length) {
    return;
  }

  const xUseEffect = xEffectFor(xIndex, xEffect);

  if (!pEditing) {
    await pInterpreter.sendMessage("closeCard", xCardObject());
  }

  if (xRemember && xIndex !== pCardIndex) {
    pHistory = [...pHistory, pCardIndex].slice(-MAX_HISTORY);
  }

  pCardIndex = xIndex;
  pSelectedId = null;
  await pCardView.transition(xUseEffect, () => xRenderCard());

  // 効果の途中で別のカードへ移っていたら、そちらの openCard に任せる。
  if (!pEditing && pCardIndex === xIndex) {
    await pInterpreter.sendMessage("openCard", xCardObject());
  }
}

async function xGoBack(xEffect = null) {
  if (pHistory.length > 0) {
    await xGoToCard(pHistory.pop(), false, xEffect);
  }
}

// 画面の操作（メニュー・スワイプ・キー）からの移動。
function xNavigate(xIndex) {
  if (pStack && !xIsBusy()) {
    xGoToCard(xIndex);
  }
}

async function xOpenStack(xData, xMessage) {
  pStack = xData;
  pCardIndex = 0;
  pSelectedId = null;
  pHistory = [];
  pInspector.close();
  pInterpreter.globals.clear();
  xMessageBox.textContent = "";
  xRenderCard();
  xSaveNow();
  xShowStatus(xMessage);

  if (!pEditing) {
    await pInterpreter.sendMessage("openStack", { kind: "stack" });
    await pInterpreter.sendMessage("openCard", xCardObject());
  }
}

// ---- メニューの操作 ----

// tool: "browse"（閲覧） / "card"（カードを編集） / "background"（背景を編集）
//       / "paint-card"（カードに描く） / "paint-background"（背景に描く）
function xSetTool(xTool) {
  // 実行中のスクリプトは、ツールを選び直すと中断する。
  pInterpreter.abort();

  const xEditing = xTool !== "browse";
  const xPainting = xTool.startsWith("paint-");
  const xLayer = xEditing ? xTool.replace("paint-", "") : pEditLayer;

  if (!pStack || (pEditing === xEditing && pPainting === xPainting && pEditLayer === xLayer)) {
    return;
  }

  if (!xPainting) {
    pPainter.end();
  }

  pEditing = xEditing;
  pPainting = xPainting;
  pEditLayer = xLayer;
  pSelectedId = null;
  xRenderCard();

  if (xTool === "paint-background") {
    xShowStatus("背景に描画中：ここで描いた絵は全カードに表示されます。");
  } else if (xTool === "paint-card") {
    xShowStatus("描画中：パレットで道具を選んで描きます。終わったら「完了」を押します。");
  } else if (xTool === "background") {
    xShowStatus("背景を編集中：ここに置いた部品は全カードに表示されます。");
  } else if (xTool === "card") {
    xShowStatus("編集中：ドラッグで移動、右下の黒い四角で大きさを変更、部品を2回続けて押すと設定を開きます。");
  } else {
    xSaveNow();
    xShowStatus("ブラウズに戻りました。");
  }
}

// 部品・カード・背景・スタックの設定をモーダルで開く。
function xShowInfo(xTarget) {
  const xPart = xSelectedPart();

  if (xTarget === "part" && xPart) {
    pInspector.showPart(xPart, xCardSize(pStack), xCurrentCard(), pEditLayer === "background");
  } else if (xTarget === "background") {
    pInspector.showBackground(xCurrentBackground());
  } else if (xTarget === "stack") {
    pInspector.showStack(pStack);
  } else if (xTarget === "card") {
    pInspector.showCard(xCurrentCard());
  }
}

// 描画中でなければ、今の層（背景の編集中なら背景）の描画に切り替えてから画像を選ぶ。
function xChooseImage() {
  if (!pPainting) {
    xSetTool(pEditing && pEditLayer === "background" ? "paint-background" : "paint-card");
  }

  xImageFile.click();
}

async function xClearPicture() {
  const xWhere = pEditLayer === "background" ? "背景" : "このカード";

  if (await xConfirm(`${xWhere}の絵をすべて消しますか？\n（「描画を取り消す」で元に戻せます）`)) {
    pPainter.clear();
  }
}

async function xNewStack() {
  if (pStack && !(await xConfirmReplace())) {
    return;
  }

  const xName = await xAsk("新しいスタックの名前", "新しいスタック");

  if (xName === null) {
    return;
  }

  pInterpreter.abort();
  pEditing = true;
  pPainting = false;
  pEditLayer = "card";
  xOpenStack(StackIO.createEmpty(xName.trim() || "新しいスタック"), "新しいスタックを作成しました。");
}

function xSaveJson() {
  xSaveNow();
  StackIO.download(pStack);
  xShowStatus("JSONファイルを保存しました。");
}

async function xOpenSample() {
  if (pStack && !(await xConfirmReplace())) {
    return;
  }

  try {
    const xData = await StackIO.loadSample();
    pInterpreter.abort();
    pEditing = false;
    pPainting = false;
    xOpenStack(xData, "サンプルを開きました。");
  } catch (xError) {
    xShowStatus(`読み込みエラー：${xError.message}`);
  }
}

function xNewCard() {
  if (pStack.cards.length >= MAX_CARDS) {
    xShowStatus(`カードは${MAX_CARDS}枚までです。`);
    return;
  }

  const xNewCardData = StackIO.createCard(xCurrentCard().backgroundId, `カード${pStack.cards.length + 1}`);

  // 現在のカードの直後に追加する。
  pStack.cards.splice(pCardIndex + 1, 0, xNewCardData);
  xSaveNow();
  xGoToCard(pCardIndex + 1);
  xShowStatus("カードを追加しました。");
}

async function xDeleteCard() {
  if (pStack.cards.length <= 1) {
    xShowStatus("最後の1枚は削除できません。");
    return;
  }

  if (!(await xConfirm(`カード「${xCurrentCard().name}」を削除しますか？`))) {
    return;
  }

  pStack.cards.splice(pCardIndex, 1);
  pCardIndex = Math.min(pCardIndex, pStack.cards.length - 1);
  pSelectedId = null;
  pHistory = [];
  xRenderCard();
  xSaveNow();
  xShowStatus("カードを削除しました。");
}

function xAddPart(xType) {
  // ブラウズ中ならカードの編集に切り替える。編集中・描画中なら、その層の編集に切り替えて追加する。
  if (!pEditing || pPainting) {
    xSetTool(pEditing ? pEditLayer : "card");
  }

  const xPart = StackIO.createPart(xType, xEditOwner(), xCardSize(pStack));
  xEditOwner().parts.push(xPart);
  pSelectedId = xPart.id;
  xRenderCard();
  xSaveNow();
  xShowStatus(`「${xPart.name}」を追加しました。`);
}

async function xDeletePart(xPart) {
  if (!xPart || !(await xConfirm(`「${xPart.name}」を削除しますか？`))) {
    return;
  }

  const xParts = xEditOwner().parts;
  xParts.splice(xParts.indexOf(xPart), 1);

  // 背景のフィールドなら、各カードに保存していた中身も消す。
  if (pEditLayer === "background") {
    for (const xCard of pStack.cards) {
      delete xCard.bgText[xPart.id];
    }
  }

  pSelectedId = null;
  pInspector.close();
  xRenderCard();
  xSaveNow();
  xShowStatus("部品を削除しました。");
}

xStackFile.addEventListener("change", async () => {
  const xFile = xStackFile.files?.[0];

  // 同じファイルをもう一度選べるように選択を解除しておく。
  xStackFile.value = "";

  if (!xFile || (pStack && !(await xConfirmReplace()))) {
    return;
  }

  try {
    const xData = await StackIO.readFile(xFile);
    pInterpreter.abort();
    pEditing = false;
    pPainting = false;
    xOpenStack(xData, "スタックを読み込みました。");
  } catch (xError) {
    xShowStatus(`読み込みエラー：${xError.message}`);
  }
});

xImageFile.addEventListener("change", async () => {
  const xFile = xImageFile.files?.[0];

  // 同じファイルをもう一度選べるように選択を解除しておく。
  xImageFile.value = "";

  if (!xFile || !pPainting) {
    return;
  }

  // 前に取り込んだ画像のURLは、新しい画像を選んだときに解放する。
  if (pImageUrl) {
    URL.revokeObjectURL(pImageUrl);
  }

  const xImage = new Image();
  pImageUrl = URL.createObjectURL(xFile);
  xImage.src = pImageUrl;

  try {
    await xImage.decode();
  } catch {
    xShowStatus("この画像は読み込めません。");
    return;
  }

  pPainter.placeImage(xImage);
  xShowStatus("枠をドラッグして位置を、右下の四角で大きさを決めて「貼り付け」を押します。");
});

// パソコンでは左右の矢印キーでカードを移動する。
document.addEventListener("keydown", (xEvent) => {
  const xTarget = xEvent.target;
  const xTyping = xTarget.closest?.("input, textarea, select, [contenteditable]");

  if (xTyping || document.querySelector(".dialog-backdrop")) {
    return;
  }

  // 画像を置いている間は、Esc で取り込みをやめる。
  if (pPainter.placing && xEvent.key === "Escape") {
    pPainter.cancelImage();
    return;
  }

  // 描画中は ⌘Z（Ctrl+Z）で取り消す。
  if (pPainting && (xEvent.metaKey || xEvent.ctrlKey) && xEvent.key.toLowerCase() === "z") {
    xEvent.preventDefault();
    pPainter.undo();
    return;
  }

  if (xEvent.metaKey || xEvent.ctrlKey) {
    return;
  }

  if (xEvent.key === "ArrowRight" && xHasNextCard()) {
    xNavigate(pCardIndex + 1);
  } else if (xEvent.key === "ArrowLeft" && pCardIndex > 0) {
    xNavigate(pCardIndex - 1);
  }
});

// タブを閉じる・アプリを切り替える直前に、保存待ちの変更を書き込む。
window.addEventListener("pagehide", () => {
  if (pSaveTimer) {
    xSaveNow();
  }
});

// ---- 端末に合わせた画面の切り替え ----

function xApplyDevice() {
  const xMode = MOBILE_QUERY.matches ? "mobile" : "pc";
  document.documentElement.dataset.ui = xMode;
  pMenuBar.setMode(xMode);

  if (pStack) {
    xUpdateTitles();
  }

  pCardView.fit();
}

MOBILE_QUERY.addEventListener("change", xApplyDevice);

async function xInitialize() {
  xApplyDevice();
  xUnlockSound();

  const xSaved = StackIO.loadLocal();

  if (xSaved) {
    xOpenStack(xSaved, "前回のスタックを開きました。");
    return;
  }

  try {
    const xData = await StackIO.loadSample();
    xOpenStack(xData, "スタックを読み込みました。");
  } catch (xError) {
    xShowStatus(`起動エラー：${xError.message}`);
    xCardName.textContent = "スタックを開けません";
  }
}

xInitialize();
