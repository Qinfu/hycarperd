// 1スタックあたりのカード枚数の上限。
export const MAX_CARDS = 10;

// 新しいスタックのカードの論理サイズ。スマホに合わせて縦長にする。
export const DEFAULT_CARD_SIZE = { width: 320, height: 480 };

// サイズを持たない古いスタックは、オリジナルのHyperCardと同じ横長とみなす。
const LEGACY_CARD_SIZE = { width: 512, height: 342 };
const CARD_SIZE_RANGE = [160, 1024];

export const MIN_PART_SIZE = 16;

const PART_DEFAULTS = {
  button: { label: "ボタン", width: 120, height: 40, style: "roundrect", script: "on mouseUp\n  \nend mouseUp" },
  field: { label: "フィールド", width: 200, height: 80, style: "rectangle", script: "" }
};

// テキストパーツは、文字を固定したフィールド。置くときの名前と、枠線のない透明なスタイルだけ変える。
const TEXT_PART_DEFAULTS = { ...PART_DEFAULTS.field, label: "テキスト", style: "transparent" };

// フィールドの文字の揃え。置いたとき・揃えを持たない古いスタックは左揃え。
export const TEXT_ALIGNS = ["left", "center", "right"];

const STACK_TYPE = "HycarPerdStack";

// カードを切り替えるときの効果（スクリプトで visual effect を指定しなかったとき）。
// wipe は次のカードへなら左へ、前のカードへなら右へ拭き取る。
// カードごとに設定でき、移る先のカードの効果を使う。カードが空ならスタックの効果に従う。
export const CARD_EFFECTS = ["wipe", "dissolve", "none"];

// ボタン・フィールドの文字の大きさ（ドット）。設定画面の選択肢と、スクリプトで指定できる範囲。
export const PART_TEXT_SIZES = [12, 14, 16, 18, 24];
export const DEFAULT_PART_TEXT_SIZE = 16;
export const PART_TEXT_SIZE_RANGE = [6, 96];

// 文字の大きさを範囲に収める。数でなければ既定の大きさ。
export const fsClampTextSize = (xValue) => {
  const [xMin, xMax] = PART_TEXT_SIZE_RANGE;
  return Number.isFinite(xValue) ? Math.min(Math.max(xMin, Math.round(xValue)), xMax) : DEFAULT_PART_TEXT_SIZE;
};

// beep で鳴らす音の既定。音の名前は js/ui/Sound.js のもの（知らない名前なら鳴らさない）。
export const DEFAULT_BEEP_SOUND = "beep";

// カード・背景の絵はPNGのデータURLで持つ。
const PICTURE_PREFIX = "data:image/png;base64,";

export const fsCardSize = (xStack) => {
  return { width: xStack.stack.width, height: xStack.stack.height };
};

// カードが属する背景。今は1スタックに背景1つだが、データは複数持てる形にしてある。
export const fsBackgroundOf = (xStack, xCard) => {
  return xStack.backgrounds.find((xBackground) => xBackground.id === xCard.backgroundId)
    ?? xStack.backgrounds[0];
};

// 背景のフィールドは、置き場所は全カード共通で、中身はカードごとに持つ（sharedText のときは共通）。
const fsHasCardText = (xPart, xIsBackground) => {
  return xIsBackground && xPart.type === "field" && !xPart.sharedText;
};

export const fsFieldText = (xPart, xCard, xIsBackground) => {
  return fsHasCardText(xPart, xIsBackground) ? xCard.bgText[xPart.id] ?? "" : xPart.text;
};

export const fsSetFieldText = (xPart, xCard, xIsBackground, xText) => {
  if (fsHasCardText(xPart, xIsBackground)) {
    xCard.bgText[xPart.id] = xText;
  } else {
    xPart.text = xText;
  }
};

// 保存するファイルの名前の後ろに付ける文字。
const FILE_SUFFIX = ".stack.json";

const fsSafeFileName = (xName) => {
  return String(xName ?? "").trim().replace(/[\\/:*?"<>|]/g, "_");
};

const fsStackBlob = (xData) => {
  return new Blob([JSON.stringify(xData, null, 2)], { type: "application/json" });
};

const fsStackFile = (xData, xFileName) => {
  return new File([fsStackBlob(xData)], xFileName, { type: "application/json" });
};

const fsCreateId = (xPrefix) => {
  const xRandom = Math.random().toString(36).slice(2, 8);
  return `${xPrefix}-${Date.now().toString(36)}-${xRandom}`;
};

// ---- 最後に開いたファイルの場所 ----
// ブラウザはファイルのパスを教えないので、「開く」で選んだファイルの手がかり（FileSystemFileHandle）を
// IndexedDB に残し、次に「開く」ときにそのフォルダから始める。スタックの中身は残さない。

const PLACE_DB_NAME = "hycarperd";
const PLACE_STORE = "places";
const LAST_FILE_KEY = "lastStackFile";
const STACK_FILE_TYPES = [{ description: "HycarPerdのスタック", accept: { "application/json": [".json"] } }];

let pLastStackFile = null;

const fsOpenPlaceDb = () => new Promise((xResolve, xReject) => {
  const xRequest = indexedDB.open(PLACE_DB_NAME, 1);
  xRequest.onupgradeneeded = () => xRequest.result.createObjectStore(PLACE_STORE);
  xRequest.onsuccess = () => xResolve(xRequest.result);
  xRequest.onerror = () => xReject(xRequest.error);
});

// 覚えておけなくても開くことはできるので、失敗は無視する。
const fsStorePlace = async (xHandle) => {
  try {
    const xDb = await fsOpenPlaceDb();
    const xStore = xDb.transaction(PLACE_STORE, "readwrite").objectStore(PLACE_STORE);

    if (xHandle) {
      xStore.put(xHandle, LAST_FILE_KEY);
    } else {
      xStore.delete(LAST_FILE_KEY);
    }
  } catch {
    // プライベートモードなどで IndexedDB が使えない。
  }
};

// アプリに同梱したスタックを読み込む。
const fsLoadBundled = async (xPath, xName) => {
  const xResponse = await fetch(xPath);

  if (!xResponse.ok) {
    throw new Error(`${xName}を読み込めません。`);
  }

  return StackIO.validate(await xResponse.json());
};

export const StackIO = {
  loadSample() {
    return fsLoadBundled("./stacks/sample.stack.json", "サンプルスタック");
  },

  // 起動時に表示するホームのスタック。
  loadHome() {
    return fsLoadBundled("./stacks/HOME.stack.json", "ホームのスタック");
  },

  // スクリプトの go stack。このページ（index.html）から見たパスかURLで、Webサーバー上のスタックを読み込む。
  // 名前が .json で終わらなければ .stack.json を付ける（"stacks/reference" → "stacks/reference.stack.json"）。
  // ブラウザはパソコンの中のファイルを勝手に読ませないので、ローカルのパスは開けない。
  async loadFromPath(xPath) {
    const xFileName = /\.json$/i.test(xPath) ? xPath : `${xPath}${FILE_SUFFIX}`;
    let xUrl;

    try {
      xUrl = new URL(xFileName, location.href);
    } catch {
      throw new Error(`「${xPath}」はパスとして読めません。`);
    }

    if (xUrl.protocol !== "http:" && xUrl.protocol !== "https:") {
      throw new Error(`「${xPath}」は開けません（Webサーバー上のパスかURLだけ）。`);
    }

    try {
      return await fsLoadBundled(xUrl.href, `「${xPath}」`);
    } catch (xError) {
      throw xError instanceof SyntaxError ? new Error(`「${xPath}」はスタックのファイルではありません。`) : xError;
    }
  },

  async readFile(xFile) {
    const xText = await xFile.text();
    let xData;

    try {
      xData = JSON.parse(xText);
    } catch {
      throw new Error("JSONとして読み込めません。");
    }

    return this.validate(xData);
  },

  createEmpty(xName) {
    const xBackgroundId = fsCreateId("bg");

    return {
      formatVersion: 1,
      type: STACK_TYPE,
      stack: {
        id: fsCreateId("stack"),
        name: xName,
        // 作者とスタックの版（どちらも自由な文字。ファイル形式の版 formatVersion とは別）
        author: "",
        version: "",
        width: DEFAULT_CARD_SIZE.width,
        height: DEFAULT_CARD_SIZE.height,
        effect: "wipe",
        beepSound: DEFAULT_BEEP_SOUND,
        script: ""
      },
      backgrounds: [this.createBackground(xBackgroundId)],
      cards: [this.createCard(xBackgroundId, "カード1")]
    };
  },

  createBackground(xId = fsCreateId("bg")) {
    return {
      id: xId,
      name: "標準背景",
      content: "",
      picture: "",
      parts: [],
      script: ""
    };
  },

  // カードを丸ごと写したもの（部品・本文・絵・スクリプト・背景フィールドの中身・切り替え効果）。
  // カードと部品の id は新しくする。背景フィールドの中身は背景の部品の id で持つので、そのまま写す。
  duplicateCard(xCard, xName) {
    const xCopy = structuredClone(xCard);
    xCopy.id = fsCreateId("card");
    xCopy.name = xName;
    xCopy.parts = xCopy.parts.map((xPart) => ({ ...xPart, id: fsCreateId(xPart.type) }));
    return xCopy;
  },

  createCard(xBackgroundId, xName) {
    return {
      id: fsCreateId("card"),
      name: xName,
      backgroundId: xBackgroundId,
      content: "",
      picture: "",
      parts: [],
      bgText: {},
      effect: "",
      script: ""
    };
  },

  // xOwner はカードまたは背景（どちらも parts を持つ）。
  // xType は "button" / "field" / "text"。"text"（テキストパーツ）は文字を固定したフィールドとして作る。
  createPart(xType, xOwner, xSize) {
    const xIsText = xType === "text";
    const xPartType = xIsText ? "field" : xType;
    const xDefaults = xIsText ? TEXT_PART_DEFAULTS : PART_DEFAULTS[xType];
    const xSameType = xOwner.parts.filter((xPart) => xPart.type === xPartType && xPart.lockText === xIsText);
    let xNumber = xSameType.length + 1;

    while (xSameType.some((xPart) => xPart.name === `${xDefaults.label}${xNumber}`)) {
      xNumber += 1;
    }

    // 重ならないよう、既存の部品の数だけ少しずらして置く。
    const xOffset = (xOwner.parts.length % 8) * 12;
    const xName = `${xDefaults.label}${xNumber}`;

    return {
      id: fsCreateId(xPartType),
      type: xPartType,
      // name はスクリプトから部品を探すときの名前、label はボタンに表示する文字。
      name: xName,
      label: xName,
      left: Math.max(0, Math.round((xSize.width - xDefaults.width) / 2) - 24 + xOffset),
      top: Math.max(0, Math.round(xSize.height / 3) + xOffset),
      width: xDefaults.width,
      height: xDefaults.height,
      text: "",
      style: xDefaults.style,
      visible: true,
      lockText: xIsText,
      // テキストパーツの「スクリプト有効」。オフなら閲覧中に押しても選ばれず（枠線も出ず）、スクリプトも動かない
      clickable: true,
      textAlign: "left",
      scrollbar: true,
      sharedText: false,
      textSize: DEFAULT_PART_TEXT_SIZE,
      sound: "",
      script: xDefaults.script
    };
  },

  // ---- ファイルへの保存 ----
  // 保存のしかたは3つ。どれが使えるかは端末とブラウザによる。
  //   saveWithPicker：OSの「名前を付けて保存」で場所と名前を選ぶ（PCのChrome・Edge）
  //   share         ：共有シートに渡し、「"ファイル"に保存」などで場所を選ぶ（スマホ）
  //   download      ：ブラウザのダウンロード先に保存する（どこでも使える）
  // saveWithPicker と share は、押した操作の中から await より前に呼ぶこと（ブラウザが操作なしの呼び出しを断るため）。

  // ファイル名に使えない文字を除いた、既定のファイル名。
  fileNameOf(xData) {
    return `${fsSafeFileName(xData.stack.name) || "stack"}${FILE_SUFFIX}`;
  },

  // 入力されたファイル名を整える。空なら既定の名前、.json で終わらなければ .stack.json を付ける。
  normalizeFileName(xName, xData) {
    const xBaseName = fsSafeFileName(xName);

    if (!xBaseName) {
      return this.fileNameOf(xData);
    }

    return /\.json$/i.test(xBaseName) ? xBaseName : `${xBaseName}${FILE_SUFFIX}`;
  },

  canPickSaveFile() {
    return typeof window.showSaveFilePicker === "function";
  },

  // OSの「開く」が使えるか（PCのChrome・Edge）。使えなければ input の type="file" で選ぶ。
  canPickOpenFile() {
    return typeof window.showOpenFilePicker === "function";
  },

  // 前に「開く」で選んだファイルの手がかりを読み込んでおく。起動時に呼ぶ。
  // 「開く」の画面は押した操作の中で開く必要があるので、そのときに待たなくて済むよう先に読んでおく。
  async loadLastPlace() {
    if (!this.canPickOpenFile()) {
      return;
    }

    try {
      const xDb = await fsOpenPlaceDb();
      const xRequest = xDb.transaction(PLACE_STORE).objectStore(PLACE_STORE).get(LAST_FILE_KEY);
      pLastStackFile = await new Promise((xResolve) => {
        xRequest.onsuccess = () => xResolve(xRequest.result ?? null);
        xRequest.onerror = () => xResolve(null);
      });
    } catch {
      pLastStackFile = null;
    }
  },

  // OSの「開く」でスタックのファイルを選ぶ。前にここで開いたファイルのあるフォルダから始める。
  // 選んだファイル（File）を返す。キャンセルされたら null。
  async pickOpenFile() {
    const xOptions = { id: "hycarperd-stack", types: STACK_FILE_TYPES };
    let xHandles;

    try {
      xHandles = await window.showOpenFilePicker(pLastStackFile ? { ...xOptions, startIn: pLastStackFile } : xOptions);
    } catch (xError) {
      if (xError.name === "AbortError") {
        return null;
      }

      // 前のファイルが消えたなどで始める場所に使えないときは、忘れてから開き直す。
      if (!pLastStackFile) {
        throw xError;
      }

      pLastStackFile = null;
      fsStorePlace(null);
      return this.pickOpenFile();
    }

    pLastStackFile = xHandles[0];
    fsStorePlace(xHandles[0]);
    return xHandles[0].getFile();
  },

  // 渡せるかどうかは名前と種類で決まるので、中身の無いファイルで確かめる。
  canShare(xData) {
    return typeof navigator.canShare === "function"
      && navigator.canShare({ files: [new File([""], this.fileNameOf(xData), { type: "application/json" })] });
  },

  // 保存したファイル名を返す。キャンセルされたら null。
  async saveWithPicker(xData) {
    let xHandle;

    try {
      xHandle = await window.showSaveFilePicker({
        suggestedName: this.fileNameOf(xData),
        types: STACK_FILE_TYPES
      });
    } catch (xError) {
      if (xError.name === "AbortError") {
        return null;
      }

      throw xError;
    }

    const xWritable = await xHandle.createWritable();
    await xWritable.write(fsStackBlob(xData));
    await xWritable.close();
    return xHandle.name;
  },

  // 共有シートを閉じたら true。キャンセルされたら false。
  async share(xData) {
    try {
      await navigator.share({ files: [fsStackFile(xData, this.fileNameOf(xData))] });
      return true;
    } catch (xError) {
      if (xError.name === "AbortError") {
        return false;
      }

      throw xError;
    }
  },

  download(xData, xFileName = this.fileNameOf(xData)) {
    const xUrl = URL.createObjectURL(fsStackBlob(xData));
    const xLink = document.createElement("a");

    xLink.href = xUrl;
    xLink.download = xFileName;
    document.body.append(xLink);
    xLink.click();
    xLink.remove();

    // Safariではすぐに解放するとダウンロードが失敗することがある。
    setTimeout(() => URL.revokeObjectURL(xUrl), 1000);
  },

  validate(xData) {
    if (!xData || typeof xData !== "object") {
      throw new Error("JSONの形式が正しくありません。");
    }

    if (xData.type !== STACK_TYPE) {
      throw new Error("HycarPerdのスタックではありません。");
    }

    if (!xData.stack || typeof xData.stack.name !== "string") {
      throw new Error("スタック名がありません。");
    }

    if (!Array.isArray(xData.cards) || xData.cards.length === 0) {
      throw new Error("カードが1枚もありません。");
    }

    if (xData.cards.length > MAX_CARDS) {
      throw new Error(`カードは${MAX_CARDS}枚までです。`);
    }

    for (const xCard of xData.cards) {
      if (
        !xCard ||
        typeof xCard.id !== "string" ||
        typeof xCard.name !== "string"
      ) {
        throw new Error("カードのデータが正しくありません。");
      }

      if (
        xCard.content !== undefined &&
        typeof xCard.content !== "string"
      ) {
        throw new Error("カード本文の形式が正しくありません。");
      }

      if (xCard.parts !== undefined && !Array.isArray(xCard.parts)) {
        throw new Error("カード部品の形式が正しくありません。");
      }
    }

    return this.normalize(xData);
  },

  // 古い形式や項目の抜けたデータを、今の形にそろえる。
  normalize(xData) {
    const xText = (xValue, xDefault = "") => (typeof xValue === "string" ? xValue : xDefault);
    const xPicture = (xValue) => (typeof xValue === "string" && xValue.startsWith(PICTURE_PREFIX) ? xValue : "");
    const xNumber = (xValue, xDefault) => (Number.isFinite(xValue) ? Math.round(xValue) : xDefault);
    const xSize = (xValue, xDefault) => {
      const [xMin, xMax] = CARD_SIZE_RANGE;
      return Number.isFinite(xValue) ? Math.min(Math.max(xMin, Math.round(xValue)), xMax) : xDefault;
    };

    xData.stack.width = xSize(xData.stack.width, LEGACY_CARD_SIZE.width);
    xData.stack.height = xSize(xData.stack.height, LEGACY_CARD_SIZE.height);
    xData.stack.script = xText(xData.stack.script);
    xData.stack.author = xText(xData.stack.author);
    xData.stack.version = xText(xData.stack.version);
    xData.stack.effect = CARD_EFFECTS.includes(xData.stack.effect) ? xData.stack.effect : "wipe";
    xData.stack.beepSound = xText(xData.stack.beepSound).toLowerCase() || DEFAULT_BEEP_SOUND;

    const xCardWidth = xData.stack.width;
    const xCardHeight = xData.stack.height;

    const xNormalizeParts = (xParts) => (Array.isArray(xParts) ? xParts : [])
      .filter((xPart) => xPart && PART_DEFAULTS[xPart.type])
      .map((xPart) => {
        const xDefaults = PART_DEFAULTS[xPart.type];
        const xWidth = Math.min(Math.max(MIN_PART_SIZE, xNumber(xPart.width, xDefaults.width)), xCardWidth);
        const xHeight = Math.min(Math.max(MIN_PART_SIZE, xNumber(xPart.height, xDefaults.height)), xCardHeight);
        const xName = xText(xPart.name, xDefaults.label);

        return {
          id: xText(xPart.id) || fsCreateId(xPart.type),
          type: xPart.type,
          name: xName,
          // 表示する文字を持たない古いスタックでは、これまでどおり名前を表示する。
          label: typeof xPart.label === "string" ? xPart.label : xName,
          left: Math.min(Math.max(0, xNumber(xPart.left, 0)), xCardWidth - xWidth),
          top: Math.min(Math.max(0, xNumber(xPart.top, 0)), xCardHeight - xHeight),
          width: xWidth,
          height: xHeight,
          text: xText(xPart.text),
          style: xText(xPart.style, xDefaults.style),
          visible: xPart.visible !== false,
          lockText: xPart.lockText === true,
          clickable: xPart.clickable !== false,
          textAlign: TEXT_ALIGNS.includes(xPart.textAlign) ? xPart.textAlign : "left",
          scrollbar: xPart.scrollbar !== false,
          sharedText: xPart.sharedText === true,
          textSize: fsClampTextSize(xPart.textSize),
          // ボタンを押したときの音（空なら鳴らさない）
          sound: xText(xPart.sound).toLowerCase(),
          script: xText(xPart.script)
        };
      });

    xData.backgrounds = (Array.isArray(xData.backgrounds) ? xData.backgrounds : [])
      .filter((xBackground) => xBackground && typeof xBackground === "object")
      .map((xBackground) => ({
        id: xText(xBackground.id) || fsCreateId("bg"),
        name: xText(xBackground.name, "標準背景"),
        content: xText(xBackground.content),
        picture: xPicture(xBackground.picture),
        parts: xNormalizeParts(xBackground.parts),
        script: xText(xBackground.script)
      }));

    if (xData.backgrounds.length === 0) {
      xData.backgrounds.push(this.createBackground());
    }

    const xBackgroundIds = new Set(xData.backgrounds.map((xBackground) => xBackground.id));

    for (const xCard of xData.cards) {
      xCard.content = xText(xCard.content);
      xCard.picture = xPicture(xCard.picture);
      xCard.script = xText(xCard.script);
      xCard.effect = CARD_EFFECTS.includes(xCard.effect) ? xCard.effect : "";
      xCard.parts = xNormalizeParts(xCard.parts);

      if (!xBackgroundIds.has(xCard.backgroundId)) {
        xCard.backgroundId = xData.backgrounds[0].id;
      }

      const xBgText = xCard.bgText && typeof xCard.bgText === "object" ? xCard.bgText : {};
      xCard.bgText = Object.fromEntries(
        Object.entries(xBgText).filter(([, xValue]) => typeof xValue === "string")
      );
    }

    return xData;
  }
};
