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

const STORAGE_KEY = "hycarperd:stack";
const STACK_TYPE = "HycarPerdStack";

// カードを切り替えるときの効果（スクリプトで visual effect を指定しなかったとき）。
// wipe は次のカードへなら左へ、前のカードへなら右へ拭き取る。
export const CARD_EFFECTS = ["wipe", "dissolve", "none"];

// beep で鳴らす音の既定。音の名前は js/ui/Sound.js のもの（知らない名前なら鳴らさない）。
export const DEFAULT_BEEP_SOUND = "beep";

// カード・背景の絵はPNGのデータURLで持つ。
const PICTURE_PREFIX = "data:image/png;base64,";

export function xCardSize(xStack) {
  return { width: xStack.stack.width, height: xStack.stack.height };
}

// カードが属する背景。今は1スタックに背景1つだが、データは複数持てる形にしてある。
export function xBackgroundOf(xStack, xCard) {
  return xStack.backgrounds.find((xBackground) => xBackground.id === xCard.backgroundId)
    ?? xStack.backgrounds[0];
}

// 背景のフィールドは、置き場所は全カード共通で、中身はカードごとに持つ（sharedText のときは共通）。
function xHasCardText(xPart, xIsBackground) {
  return xIsBackground && xPart.type === "field" && !xPart.sharedText;
}

export function xFieldText(xPart, xCard, xIsBackground) {
  return xHasCardText(xPart, xIsBackground) ? xCard.bgText[xPart.id] ?? "" : xPart.text;
}

export function xSetFieldText(xPart, xCard, xIsBackground, xText) {
  if (xHasCardText(xPart, xIsBackground)) {
    xCard.bgText[xPart.id] = xText;
  } else {
    xPart.text = xText;
  }
}

function xCreateId(xPrefix) {
  const xRandom = Math.random().toString(36).slice(2, 8);
  return `${xPrefix}-${Date.now().toString(36)}-${xRandom}`;
}

export const StackIO = {
  async loadSample() {
    const xResponse = await fetch("./stacks/sample.stack.json");

    if (!xResponse.ok) {
      throw new Error("サンプルスタックを読み込めません。");
    }

    const xData = await xResponse.json();
    return this.validate(xData);
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
    const xBackgroundId = xCreateId("bg");

    return {
      formatVersion: 1,
      type: STACK_TYPE,
      stack: {
        id: xCreateId("stack"),
        name: xName,
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

  createBackground(xId = xCreateId("bg")) {
    return {
      id: xId,
      name: "標準背景",
      content: "",
      picture: "",
      parts: [],
      script: ""
    };
  },

  createCard(xBackgroundId, xName) {
    return {
      id: xCreateId("card"),
      name: xName,
      backgroundId: xBackgroundId,
      content: "",
      picture: "",
      parts: [],
      bgText: {},
      script: ""
    };
  },

  // xOwner はカードまたは背景（どちらも parts を持つ）。
  createPart(xType, xOwner, xSize) {
    const xDefaults = PART_DEFAULTS[xType];
    const xSameType = xOwner.parts.filter((xPart) => xPart.type === xType);
    let xNumber = xSameType.length + 1;

    while (xSameType.some((xPart) => xPart.name === `${xDefaults.label}${xNumber}`)) {
      xNumber += 1;
    }

    // 重ならないよう、既存の部品の数だけ少しずらして置く。
    const xOffset = (xOwner.parts.length % 8) * 12;

    return {
      id: xCreateId(xType),
      type: xType,
      name: `${xDefaults.label}${xNumber}`,
      left: Math.max(0, Math.round((xSize.width - xDefaults.width) / 2) - 24 + xOffset),
      top: Math.max(0, Math.round(xSize.height / 3) + xOffset),
      width: xDefaults.width,
      height: xDefaults.height,
      text: "",
      style: xDefaults.style,
      visible: true,
      lockText: false,
      sharedText: false,
      sound: "",
      script: xDefaults.script
    };
  },

  // ブラウザ内に保存する。保存できない環境（プライベートモード等）ではfalseを返す。
  saveLocal(xData) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(xData));
      return true;
    } catch {
      return false;
    }
  },

  // 保存済みのスタックがない、または壊れている場合はnullを返す。
  loadLocal() {
    try {
      const xText = localStorage.getItem(STORAGE_KEY);

      if (!xText) {
        return null;
      }

      return this.validate(JSON.parse(xText));
    } catch {
      return null;
    }
  },

  download(xData) {
    const xText = JSON.stringify(xData, null, 2);
    const xBlob = new Blob([xText], { type: "application/json" });
    const xUrl = URL.createObjectURL(xBlob);
    const xLink = document.createElement("a");
    const xBaseName = xData.stack.name.replace(/[\\/:*?"<>|]/g, "_") || "stack";

    xLink.href = xUrl;
    xLink.download = `${xBaseName}.stack.json`;
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

        return {
          id: xText(xPart.id) || xCreateId(xPart.type),
          type: xPart.type,
          name: xText(xPart.name, xDefaults.label),
          left: Math.min(Math.max(0, xNumber(xPart.left, 0)), xCardWidth - xWidth),
          top: Math.min(Math.max(0, xNumber(xPart.top, 0)), xCardHeight - xHeight),
          width: xWidth,
          height: xHeight,
          text: xText(xPart.text),
          style: xText(xPart.style, xDefaults.style),
          visible: xPart.visible !== false,
          lockText: xPart.lockText === true,
          sharedText: xPart.sharedText === true,
          // ボタンを押したときの音（空なら鳴らさない）
          sound: xText(xPart.sound).toLowerCase(),
          script: xText(xPart.script)
        };
      });

    xData.backgrounds = (Array.isArray(xData.backgrounds) ? xData.backgrounds : [])
      .filter((xBackground) => xBackground && typeof xBackground === "object")
      .map((xBackground) => ({
        id: xText(xBackground.id) || xCreateId("bg"),
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
