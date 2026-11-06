import { StackIO, MAX_CARDS, fsCardSize, fsBackgroundOf, fsSetFieldText } from "./storage/StackIO.js";
import { Interpreter } from "./hypertalk/Interpreter.js";
import { CardView } from "./ui/CardView.js";
import { Inspector } from "./ui/Inspector.js";
import { MenuBar } from "./ui/MenuBar.js";
import { Painter, TEXT_FONTS, TEXT_SIZES, fsTextImage } from "./ui/Painter.js";
import { PaintPalette } from "./ui/PaintPalette.js";
import { fsAnswer, fsAsk, fsAskText, fsShowFacts } from "./ui/Dialog.js";
import { fsHasSound, fsPlaySound, fsUnlockSound } from "./ui/Sound.js";

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
// 文字を絵として置くときに前に選んだ大きさ・フォント・太さ。
let pTextOptions = { size: 16, font: "gothic", bold: false };

// アプリからのお知らせ。少しの間だけ表示する。
const fsShowStatus = (xMessage) => {
  clearTimeout(pToastTimer);
  xToast.textContent = xMessage;
  xToast.hidden = false;
  pToastTimer = setTimeout(() => {
    xToast.hidden = true;
  }, TOAST_TIME);
};

// スクリプトの put の表示先。書き込まれたら表示する。
const fsShowMessage = (xText) => {
  xMessageBox.textContent = xText;
  xMessageBox.hidden = false;
};

const fsSaveNow = () => {
  clearTimeout(pSaveTimer);
  pSaveTimer = null;

  if (pStack && !StackIO.saveLocal(pStack)) {
    fsShowStatus("ブラウザに保存できません。ファイルメニューの「保存…」でファイルに保存してください。");
  }
};

// 文字入力のたびに保存しないよう、少し待ってからまとめて保存する。
const fsScheduleSave = () => {
  clearTimeout(pSaveTimer);
  pSaveTimer = setTimeout(fsSaveNow, SAVE_DELAY);
};

const fsCurrentCard = () => {
  return pStack.cards[pCardIndex];
};

const fsCurrentBackground = () => {
  return fsBackgroundOf(pStack, fsCurrentCard());
};

// 編集している層（カードまたは背景）。部品の追加・選択・削除はこの層に対して行う。
const fsEditOwner = () => {
  return pEditLayer === "background" ? fsCurrentBackground() : fsCurrentCard();
};

const fsSelectedPart = () => {
  if (!pStack || !pEditing || pPainting) {
    return null;
  }

  return fsEditOwner().parts.find((xPart) => xPart.id === pSelectedId) ?? null;
};

const fsCardObject = () => {
  return { kind: "card", card: fsCurrentCard() };
};

const fsPartObject = (xPart, xIsBackground) => {
  return { kind: "part", part: xPart, card: fsCurrentCard(), isBackground: xIsBackground };
};

const fsConfirm = async (xMessage) => {
  return (await fsAnswer(xMessage, ["キャンセル", "OK"])) === "OK";
};

// 現在のスタックはブラウザ内に1つしか保存しないため、置き換える前に確認する。
const fsConfirmReplace = () => {
  return fsConfirm(
    "現在のスタックは置き換えられます。\n残したい場合は先にファイルメニューの「保存…」をしてください。\n続けますか？"
  );
};

// スクリプトの実行中は、画面からの操作を受け付けない。
const fsIsBusy = () => {
  if (pInterpreter.busy) {
    fsShowStatus("スクリプトを実行中です。スタックメニューの「ブラウズ」「エディット」で中断できます。");
    return true;
  }

  return false;
};

// ---- スクリプトの実行系に渡す画面側の機能 ----

const pInterpreter = new Interpreter({
  getStack: () => pStack,
  getCardIndex: () => pCardIndex,
  goToCard: (xIndex, xEffect) => fsGoToCard(xIndex, true, xEffect),
  goBack: (xEffect) => fsGoBack(xEffect),
  changed: () => {
    fsRenderCard();
    fsScheduleSave();
  },
  getMessage: () => xMessageBox.textContent,
  setMessage: (xText) => fsShowMessage(xText),
  answer: (xText, xButtons) => fsAnswer(xText, xButtons),
  ask: (xText, xDefault) => fsAsk(xText, xDefault),
  beep: () => fsPlaySound(pStack.stack.beepSound),
  play: (xName) => (fsHasSound(xName) ? fsPlaySound(xName) : null),
  reportError: (xError) => {
    const xWhere = [xError.where, xError.line ? `${xError.line}行目` : ""]
      .filter(Boolean)
      .join(" ");
    fsAnswer(`スクリプトエラー\n${xWhere}\n\n${xError.message}`);
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
        fsPlaySound(xPart.sound);
      }

      if (!pInterpreter.busy) {
        pInterpreter.sendMessage("mouseUp", fsPartObject(xPart, xIsBackground));
      }
    },
    onCardClick: () => {
      if (!pInterpreter.busy) {
        pInterpreter.sendMessage("mouseUp", fsCardObject());
      }
    },
    onFieldInput: (xPart, xText, xIsBackground) => {
      fsSetFieldText(xPart, fsCurrentCard(), xIsBackground, xText);
      fsScheduleSave();
    },
    onSwipe: (xDirection) => {
      fsNavigate(pCardIndex + (xDirection === "next" ? 1 : -1));
    },
    onContentInput: (xText) => {
      fsEditOwner().content = xText;
      fsScheduleSave();
    },
    onSelect: (xPartId) => {
      pSelectedId = xPartId;
    },
    onPartOpen: (xPart) => {
      pSelectedId = xPart.id;
      fsShowInfo("part");
    },
    onPartMoved: () => {
      fsScheduleSave();
    }
  }
);

const pInspector = new Inspector({
  onChange: (xRerender) => {
    if (xRerender) {
      fsRenderCard();
    }

    fsScheduleSave();
  },
  onDeletePart: (xPart) => fsDeletePart(xPart),
  onClose: () => fsSaveNow()
});

// 描画中は pEditing も true にして、スクリプトを動かさない（openCard なども送らない）。
const pPainter = new Painter({
  onChange: (xOwner, xPicture) => {
    xOwner.picture = xPicture;
    fsScheduleSave();
  },
  onState: () => pPalette?.update()
});

const pPalette = new PaintPalette(xPaletteRoot, pPainter, {
  onText: () => fsPlaceText(),
  onClear: () => fsClearPicture(),
  onUndo: () => pPainter.undo(),
  // 「完了」で絵を描くのを終え、同じ層の部品の編集に戻る。
  onDone: () => fsSetEditTarget(pEditLayer, false),
  onLayout: () => pCardView.fit()
});

// ---- メニュー ----

// メニューは「ブラウズ」と「エディット」の2つのモードで出し分ける。
//   ブラウズ  ：ファイル / 移動 / スタック
//   エディット：ファイル / 編集 / ツール / 移動 / スタック
// エディットの中で、何を編集するか（カード・背景、部品・絵）は編集メニューの先頭で選ぶ。
const xInEdit = () => pEditing;
const xInParts = () => pEditing && !pPainting;
const xInPaint = () => pPainting;

// エディットの中で、層（カード・背景）や編集するもの（部品・絵）を切り替える。
const fsSetEditTarget = (xLayer, xPaint) => {
  fsSetTool(xPaint ? `paint-${xLayer}` : xLayer);
};

const pMenuBar = new MenuBar(document.querySelector("#menubar"), [
  {
    title: "ファイル",
    items: [
      { label: "開く…", action: () => xStackFile.click() },
      { label: "保存…", action: () => fsSaveStack(), enabled: () => Boolean(pStack) },
      "-",
      { label: "サンプルを開く", action: () => fsOpenSample() }
    ]
  },
  {
    title: "編集",
    visible: xInEdit,
    items: [
      // 何を編集するか（カード・背景、部品・絵）を選ぶ。
      { label: "カード編集", action: () => fsSetEditTarget("card", pPainting), checked: () => pEditLayer === "card" },
      {
        label: "背景編集",
        action: () => fsSetEditTarget("background", pPainting),
        checked: () => pEditLayer === "background"
      },
      "-",
      { label: "部品編集", action: () => fsSetEditTarget(pEditLayer, false), checked: () => !pPainting },
      { label: "描画編集", action: () => fsSetEditTarget(pEditLayer, true), checked: () => pPainting },
      "-",
      {
        label: "描画を取り消す",
        action: () => pPainter.undo(),
        visible: xInPaint,
        enabled: () => pPainter.canUndo || pPainter.placing
      },
      { label: "画像を取り込む…", action: () => fsChooseImage(), visible: xInPaint },
      {
        label: "部品を削除",
        action: () => fsDeletePart(fsSelectedPart()),
        visible: xInParts,
        enabled: () => Boolean(fsSelectedPart())
      },
      "-",
      {
        label: "新規カード",
        action: () => fsNewCard(),
        enabled: () => Boolean(pStack) && pStack.cards.length < MAX_CARDS
      },
      {
        label: "カード複製",
        action: () => fsDuplicateCard(),
        enabled: () => Boolean(pStack) && pStack.cards.length < MAX_CARDS
      },
      {
        label: "カードを削除",
        action: () => fsDeleteCard(),
        enabled: () => Boolean(pStack) && pStack.cards.length > 1
      },
      "-",
      { label: "新規スタック…", action: () => fsNewStack() }
    ]
  },
  {
    title: "ツール",
    visible: xInEdit,
    items: [
      { label: "ボタン追加", action: () => fsAddPart("button"), visible: xInParts },
      { label: "入力フィールド追加", action: () => fsAddPart("field"), visible: xInParts },
      { label: "テキストエリア追加", action: () => fsAddPart("field", { lockText: true }), visible: xInParts },
      "-",
      {
        label: "部品の情報…",
        action: () => fsShowInfo("part"),
        visible: xInParts,
        enabled: () => Boolean(fsSelectedPart())
      },
      "-",
      { label: "カード設定…", action: () => fsShowInfo("card") },
      { label: "背景設定…", action: () => fsShowInfo("background") },
      { label: "スタック設定…", action: () => fsShowInfo("stack") }
    ]
  },
  {
    title: "移動",
    items: [
      { label: "戻る", action: () => fsGoBack(), enabled: () => pHistory.length > 0 },
      "-",
      { label: "最初のカード", action: () => fsNavigate(0), enabled: () => pCardIndex > 0 },
      { label: "前のカード", action: () => fsNavigate(pCardIndex - 1), enabled: () => pCardIndex > 0 },
      { label: "次のカード", action: () => fsNavigate(pCardIndex + 1), enabled: () => fsHasNextCard() },
      { label: "最後のカード", action: () => fsNavigate(pStack.cards.length - 1), enabled: () => fsHasNextCard() }
    ]
  },
  {
    title: "スタック",
    items: [
      { label: "ブラウズ", action: () => fsSetTool("browse"), checked: () => !pEditing },
      // 前に編集していた層（カードか背景）の部品の編集から始める。
      { label: "エディット", action: () => fsSetEditTarget(pEditLayer, false), checked: () => pEditing },
      "-",
      // 見るだけ。変えるのはエディット中のツールメニューの「スタック設定…」。
      { label: "スタック情報", action: () => fsShowStackFacts(), enabled: () => Boolean(pStack) },
      // メッセージボックスはブラウズ中だけ出す。
      {
        label: "メッセージボックス",
        action: () => {
          xMessageBox.hidden = !xMessageBox.hidden;
        },
        visible: () => !pEditing,
        checked: () => !xMessageBox.hidden
      }
    ]
  }
]);

// ---- 描画 ----

const fsHasNextCard = () => {
  return Boolean(pStack) && pCardIndex < pStack.cards.length - 1;
};

const fsIsBackgroundEditing = () => {
  return pEditing && pEditLayer === "background";
};

const fsUpdateTitles = () => {
  const xCard = fsCurrentCard();
  const xPosition = `${pCardIndex + 1} / ${pStack.cards.length}`;

  if (fsIsBackgroundEditing()) {
    const xDoing = pPainting ? "背景に描画中" : "背景を編集中";
    xCardName.textContent = `背景：${fsCurrentBackground().name}`;
    pMenuBar.setTitle(pStack.stack.name, `${xDoing}（${xCard.name}　${xPosition}）`);
  } else if (pPainting) {
    xCardName.textContent = `${xCard.name}（描画中）`;
    pMenuBar.setTitle(pStack.stack.name, `描画中（${xCard.name}　${xPosition}）`);
  } else {
    xCardName.textContent = xCard.name;
    pMenuBar.setTitle(pStack.stack.name, `${xCard.name}　${xPosition}`);
  }
};

const fsRenderCard = () => {
  if (!pStack) {
    return;
  }

  // 描画中は、カードを移動したら描く相手もそのカード（または背景）に変える。
  if (pPainting) {
    pPainter.begin(fsEditOwner(), fsCardSize(pStack));
  }

  xPaletteRoot.hidden = !pPainting;

  pCardView.render({
    card: fsCurrentCard(),
    background: fsCurrentBackground(),
    editing: pEditing,
    painter: pPainting ? pPainter : null,
    layer: pEditLayer,
    selectedId: pSelectedId,
    size: fsCardSize(pStack)
  });

  // 背景の編集中は、オリジナルと同じくメニューバーを縞模様にして知らせる。
  document.documentElement.dataset.editLayer = fsIsBackgroundEditing() ? "background" : "";
  // 描画中は編集用の方眼を出さず、絵だけを見やすくする。
  xCardWindow.classList.toggle("is-editing", pEditing && !pPainting);
  // 編集中・描画中はメッセージボックスを出さない（中身と開閉の状態はブラウズに戻ったときに戻る）。
  document.documentElement.toggleAttribute("data-editing", pEditing);
  pMenuBar.update();
  fsUpdateTitles();
};

// ---- カードの移動 ----

// 切り替えの効果。visual effect の指定（effect）があればそれを、
// なければ移る先のカードの設定、カードが空ならスタックの設定に従う。
// 編集中・描画中は効果を付けない。
const fsEffectFor = (xIndex, xEffect) => {
  if (pEditing || xIndex === pCardIndex || REDUCED_MOTION_QUERY.matches) {
    return null;
  }

  if (xEffect) {
    return xEffect.name === "plain" ? null : xEffect;
  }

  const xName = pStack.cards[xIndex].effect || pStack.stack.effect;

  if (xName === "dissolve") {
    return { name: "dissolve", speed: "normal" };
  }

  if (xName === "wipe") {
    return { name: xIndex > pCardIndex ? "wipe left" : "wipe right", speed: "normal" };
  }

  return null;
};

// 閲覧中は closeCard / openCard を送る。
const fsGoToCard = async (xIndex, xRemember = true, xEffect = null) => {
  if (!pStack || xIndex < 0 || xIndex >= pStack.cards.length) {
    return;
  }

  const xUseEffect = fsEffectFor(xIndex, xEffect);

  if (!pEditing) {
    await pInterpreter.sendMessage("closeCard", fsCardObject());
  }

  if (xRemember && xIndex !== pCardIndex) {
    pHistory = [...pHistory, pCardIndex].slice(-MAX_HISTORY);
  }

  pCardIndex = xIndex;
  pSelectedId = null;
  await pCardView.transition(xUseEffect, () => fsRenderCard());

  // 効果の途中で別のカードへ移っていたら、そちらの openCard に任せる。
  if (!pEditing && pCardIndex === xIndex) {
    await pInterpreter.sendMessage("openCard", fsCardObject());
  }
};

const fsGoBack = async (xEffect = null) => {
  if (pHistory.length > 0) {
    await fsGoToCard(pHistory.pop(), false, xEffect);
  }
};

// 画面の操作（メニュー・スワイプ・キー）からの移動。
const fsNavigate = (xIndex) => {
  if (pStack && !fsIsBusy()) {
    fsGoToCard(xIndex);
  }
};

const fsOpenStack = async (xData, xMessage) => {
  pStack = xData;
  pCardIndex = 0;
  pSelectedId = null;
  pHistory = [];
  pInspector.close();
  pInterpreter.globals.clear();
  xMessageBox.textContent = "";
  fsRenderCard();
  fsSaveNow();
  fsShowStatus(xMessage);

  if (!pEditing) {
    await pInterpreter.sendMessage("openStack", { kind: "stack" });
    await pInterpreter.sendMessage("openCard", fsCardObject());
  }
};

// ---- メニューの操作 ----

// tool: "browse"（閲覧） / "card"（カードの部品を編集） / "background"（背景の部品を編集）
//       / "paint-card"（カードに絵を描く） / "paint-background"（背景に絵を描く）
// メニューの「エディット」と、編集メニューの「カード編集」などは、fsSetEditTarget を通してここを呼ぶ。
const fsSetTool = (xTool) => {
  // 実行中のスクリプトは、ブラウズ・エディットを選び直すと中断する。
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
  fsRenderCard();

  if (xTool === "paint-background") {
    fsShowStatus("背景に描画中：ここで描いた絵は全カードに表示されます。");
  } else if (xTool === "paint-card") {
    fsShowStatus("描画中：パレットで道具を選んで描きます。終わったら「完了」を押します。");
  } else if (xTool === "background") {
    fsShowStatus("背景を編集中：ここに置いた部品は全カードに表示されます。");
  } else if (xTool === "card") {
    fsShowStatus("編集中：ドラッグで移動、右下の黒い四角で大きさを変更、部品を2回続けて押すと設定を開きます。");
  } else {
    fsSaveNow();
    fsShowStatus("ブラウズに戻りました。");
  }
};

const fsShowStackFacts = () => {
  fsShowFacts("スタック情報", [
    ["スタック名", pStack.stack.name],
    ["ヴァージョン", pStack.stack.version],
    ["作者", pStack.stack.author]
  ]);
};

// 部品・カード・背景・スタックの設定をモーダルで開く。
const fsShowInfo = (xTarget) => {
  const xPart = fsSelectedPart();

  if (xTarget === "part" && xPart) {
    pInspector.showPart(xPart, fsCardSize(pStack), fsCurrentCard(), pEditLayer === "background");
  } else if (xTarget === "background") {
    pInspector.showBackground(fsCurrentBackground());
  } else if (xTarget === "stack") {
    pInspector.showStack(pStack);
  } else if (xTarget === "card") {
    pInspector.showCard(fsCurrentCard());
  }
};

// 描画中でなければ、今の層（背景の編集中なら背景）の描画に切り替えてから画像を選ぶ。
const fsChooseImage = () => {
  if (!pPainting) {
    fsSetTool(pEditing && pEditLayer === "background" ? "paint-background" : "paint-card");
  }

  xImageFile.click();
};

// 文字を白黒のドットにして、取り込んだ画像と同じように枠で位置と大きさを決めて貼る。
// 描画の道具パレットから呼ぶ。大きさ・フォント・太さは前に選んだものを次の既定にする。
const fsPlaceText = async () => {
  const xAnswerText = await fsAskText(
    "絵として置く文字",
    { sizes: TEXT_SIZES, fonts: Object.entries(TEXT_FONTS).map(([xName, xFont]) => [xName, xFont.label]) },
    pTextOptions
  );

  if (!xAnswerText || !pPainting) {
    return;
  }

  pTextOptions = { size: xAnswerText.size, font: xAnswerText.font, bold: xAnswerText.bold };
  pPainter.placeImage(fsTextImage(xAnswerText.text, xAnswerText.size, xAnswerText.font, xAnswerText.bold), true);
  fsShowStatus("枠をドラッグして位置を、右下の四角で大きさを決めて「貼り付け」を押します。");
};

const fsClearPicture = async () => {
  const xWhere = pEditLayer === "background" ? "背景" : "このカード";

  if (await fsConfirm(`${xWhere}の絵をすべて消しますか？\n（「描画を取り消す」で元に戻せます）`)) {
    pPainter.clear();
  }
};

const fsNewStack = async () => {
  if (pStack && !(await fsConfirmReplace())) {
    return;
  }

  const xName = await fsAsk("新しいスタックの名前", "新しいスタック");

  if (xName === null) {
    return;
  }

  // 描画中から作ったときは、描きかけの状態を片付けてからカードの部品の編集で開く。
  pInterpreter.abort();
  pPainter.end();
  pEditing = true;
  pPainting = false;
  pEditLayer = "card";
  fsOpenStack(StackIO.createEmpty(xName.trim() || "新しいスタック"), "新しいスタックを作成しました。");
};

// 名前を聞いてから、ブラウザのダウンロード先に保存する。
const fsDownloadStack = async () => {
  const xName = await fsAsk("保存するファイルの名前", StackIO.fileNameOf(pStack));

  if (xName === null) {
    return;
  }

  StackIO.download(pStack, StackIO.normalizeFileName(xName, pStack));
  fsShowStatus("スタックを保存しました。");
};

// 使える方法で保存する：PCは保存ダイアログ、スマホは共有シート、どちらも無ければ名前を聞いてダウンロード。
// 保存ダイアログと共有シートは、メニューを押した操作の中で開く必要があるので、先に await しない。
const fsSaveStack = async () => {
  fsSaveNow();

  try {
    if (StackIO.canPickSaveFile()) {
      const xFileName = await StackIO.saveWithPicker(pStack);

      if (xFileName) {
        fsShowStatus(`「${xFileName}」に保存しました。`);
      }

      return;
    }

    if (MOBILE_QUERY.matches && StackIO.canShare(pStack)) {
      if (await StackIO.share(pStack)) {
        fsShowStatus("スタックのファイルを渡しました。");
      }

      return;
    }
  } catch {
    // 保存ダイアログや共有シートが使えなかったときは、ダウンロードで保存する。
  }

  await fsDownloadStack();
};

const fsOpenSample = async () => {
  if (pStack && !(await fsConfirmReplace())) {
    return;
  }

  try {
    const xData = await StackIO.loadSample();
    pInterpreter.abort();
    pEditing = false;
    pPainting = false;
    fsOpenStack(xData, "サンプルを開きました。");
  } catch (xError) {
    fsShowStatus(`読み込みエラー：${xError.message}`);
  }
};

// カードの追加・削除は編集中（描画中を含む）だけ。ブラウズ中はメニューも押せない。
const fsNewCard = () => {
  if (!pEditing) {
    return;
  }

  if (pStack.cards.length >= MAX_CARDS) {
    fsShowStatus(`カードは${MAX_CARDS}枚までです。`);
    return;
  }

  const xNewCardData = StackIO.createCard(fsCurrentCard().backgroundId, `カード${pStack.cards.length + 1}`);

  // 現在のカードの直後に追加する。
  pStack.cards.splice(pCardIndex + 1, 0, xNewCardData);
  fsSaveNow();
  fsGoToCard(pCardIndex + 1);
  fsShowStatus("カードを追加しました。");
};

// 今のカードを複製して、すぐ後ろに入れる。
const fsDuplicateCard = () => {
  if (!pEditing) {
    return;
  }

  if (pStack.cards.length >= MAX_CARDS) {
    fsShowStatus(`カードは${MAX_CARDS}枚までです。`);
    return;
  }

  const xCard = fsCurrentCard();
  pStack.cards.splice(pCardIndex + 1, 0, StackIO.duplicateCard(xCard, `${xCard.name}のコピー`));
  fsSaveNow();
  fsGoToCard(pCardIndex + 1);
  fsShowStatus(`「${xCard.name}」を複製しました。`);
};

const fsDeleteCard = async () => {
  if (!pEditing) {
    return;
  }

  if (pStack.cards.length <= 1) {
    fsShowStatus("最後の1枚は削除できません。");
    return;
  }

  if (!(await fsConfirm(`カード「${fsCurrentCard().name}」を削除しますか？`))) {
    return;
  }

  pStack.cards.splice(pCardIndex, 1);
  pCardIndex = Math.min(pCardIndex, pStack.cards.length - 1);
  pSelectedId = null;
  pHistory = [];
  fsRenderCard();
  fsSaveNow();
  fsShowStatus("カードを削除しました。");
};

// options は作った部品に上書きする設定（編集不可のフィールドなら { lockText: true }）。
const fsAddPart = (xType, xOptions = {}) => {
  // ブラウズ中ならカードの編集に切り替える。編集中・描画中なら、その層の編集に切り替えて追加する。
  if (!pEditing || pPainting) {
    fsSetTool(pEditing ? pEditLayer : "card");
  }

  const xPart = { ...StackIO.createPart(xType, fsEditOwner(), fsCardSize(pStack)), ...xOptions };
  fsEditOwner().parts.push(xPart);
  pSelectedId = xPart.id;
  fsRenderCard();
  fsSaveNow();
  fsShowStatus(`「${xPart.name}」を追加しました。`);
};

const fsDeletePart = async (xPart) => {
  if (!xPart || !(await fsConfirm(`「${xPart.name}」を削除しますか？`))) {
    return;
  }

  const xParts = fsEditOwner().parts;
  xParts.splice(xParts.indexOf(xPart), 1);

  // 背景のフィールドなら、各カードに保存していた中身も消す。
  if (pEditLayer === "background") {
    for (const xCard of pStack.cards) {
      delete xCard.bgText[xPart.id];
    }
  }

  pSelectedId = null;
  pInspector.close();
  fsRenderCard();
  fsSaveNow();
  fsShowStatus("部品を削除しました。");
};

xStackFile.addEventListener("change", async () => {
  const xFile = xStackFile.files?.[0];

  // 同じファイルをもう一度選べるように選択を解除しておく。
  xStackFile.value = "";

  if (!xFile || (pStack && !(await fsConfirmReplace()))) {
    return;
  }

  try {
    const xData = await StackIO.readFile(xFile);
    pInterpreter.abort();
    pEditing = false;
    pPainting = false;
    fsOpenStack(xData, "スタックを読み込みました。");
  } catch (xError) {
    fsShowStatus(`読み込みエラー：${xError.message}`);
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
    fsShowStatus("この画像は読み込めません。");
    return;
  }

  pPainter.placeImage(xImage);
  fsShowStatus("枠をドラッグして位置を、右下の四角で大きさを決めて「貼り付け」を押します。");
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

  if (xEvent.key === "ArrowRight" && fsHasNextCard()) {
    fsNavigate(pCardIndex + 1);
  } else if (xEvent.key === "ArrowLeft" && pCardIndex > 0) {
    fsNavigate(pCardIndex - 1);
  }
});

// タブを閉じる・アプリを切り替える直前に、保存待ちの変更を書き込む。
window.addEventListener("pagehide", () => {
  if (pSaveTimer) {
    fsSaveNow();
  }
});

// ---- 端末に合わせた画面の切り替え ----

const fsApplyDevice = () => {
  const xMode = MOBILE_QUERY.matches ? "mobile" : "pc";
  document.documentElement.dataset.ui = xMode;
  pMenuBar.setMode(xMode);

  if (pStack) {
    fsUpdateTitles();
  }

  pCardView.fit();
};

MOBILE_QUERY.addEventListener("change", fsApplyDevice);

const fsInitialize = async () => {
  fsApplyDevice();
  fsUnlockSound();

  const xSaved = StackIO.loadLocal();

  if (xSaved) {
    fsOpenStack(xSaved, "前回のスタックを開きました。");
    return;
  }

  try {
    const xData = await StackIO.loadSample();
    fsOpenStack(xData, "スタックを読み込みました。");
  } catch (xError) {
    fsShowStatus(`起動エラー：${xError.message}`);
    xCardName.textContent = "スタックを開けません";
  }
};

fsInitialize();
