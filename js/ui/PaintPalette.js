import { PAINT_PATTERNS, PAINT_SIZES, PAINT_TOOLS } from "./Painter.js";

const SVG_START = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" ' +
  'stroke-width="2" stroke-linejoin="miter" aria-hidden="true">';

const TOOL_INFO = {
  pencil: { label: "鉛筆", icon: '<path d="M4 20l2-6L16 4l4 4-10 10zM14 6l4 4"/>' },
  eraser: { label: "消しゴム", icon: '<path d="M3 15l9-9 8 8-6 6H8zM8 10l8 8"/>' },
  line: { label: "直線", icon: '<path d="M4 20L20 4"/>' },
  rect: { label: "四角", icon: '<rect x="4" y="6" width="16" height="12"/>' },
  oval: { label: "楕円", icon: '<ellipse cx="12" cy="12" rx="8" ry="6"/>' },
  fill: { label: "塗りつぶし", icon: '<path d="M4 11l7-7 8 8-7 7zM4 11h15M20 14c1 2 2 4 0 6"/>' }
};

// 消しゴムをこの時間（ミリ秒）のうちに2回押すと、絵をすべて消す。
// スマホでは dblclick が来ないことがあるので、押した間隔で見分ける。
const DOUBLE_PRESS_TIME = 400;

// 文字を絵として置くボタン（道具を切り替えず、文字を入れるダイアログを開く）。
const TEXT_ICON = '<path d="M5 20L12 4l7 16M8 14h8"/>';

// 塗りつぶしの模様の見本。2×2ドットの模様を枠の中に敷き詰める。
const PATTERN_INFO = {
  black: { label: "黒", tile: '<rect width="2" height="2"/>' },
  white: { label: "白", tile: "" },
  checker: { label: "チェック", tile: '<rect width="1" height="1"/><rect x="1" y="1" width="1" height="1"/>' },
  vertical: { label: "縦縞", tile: '<rect width="1" height="2"/>' },
  horizontal: { label: "横縞", tile: '<rect width="2" height="1"/>' }
};

/*
 * 描画中だけ出す道具パレット（PCはカードの左、スマホはカードの下）。
 * 画像を取り込んでいる間は、道具の代わりに明るさ・コントラストと「貼り付け」を出す。
 * handlers:
 *   onText()   文字を絵として置く
 *   onClear()  絵をすべて消す（消しゴムを2回続けて押した）
 *   onUndo()   取り消し
 *   onDone()   描画を終える（部品の編集に戻る）
 *   onLayout() パレットの大きさが変わった（模様と太さの入れ替え、取り込み中の切り替え）
 */
export class PaintPalette {
  constructor(xRoot, xPainter, xHandlers) {
    this.root = xRoot;
    this.painter = xPainter;
    this.handlers = xHandlers;
    this.layout = "";
    this.toolButtons = new Map();
    this.sizeButtons = new Map();

    const xTools = this.xGroup("道具");

    for (const xTool of PAINT_TOOLS) {
      const xInfo = TOOL_INFO[xTool];
      const xButton = this.xButton(xInfo.label, `${SVG_START}${xInfo.icon}</svg>`, () => {
        this.painter.tool = xTool;
        this.update();
      });
      this.toolButtons.set(xTool, xButton);
      xTools.append(xButton);
    }

    const xEraser = this.toolButtons.get("eraser");
    let xLastEraserPress = 0;
    xEraser.title = "消しゴム（2回続けて押すと絵をすべて消す）";
    xEraser.addEventListener("click", (xEvent) => {
      if (xEvent.timeStamp - xLastEraserPress < DOUBLE_PRESS_TIME) {
        xLastEraserPress = 0;
        xHandlers.onClear();
        return;
      }

      xLastEraserPress = xEvent.timeStamp;
    });

    xTools.append(this.xButton("文字", `${SVG_START}${TEXT_ICON}</svg>`, () => xHandlers.onText()));

    const xSizes = this.xGroup("線の太さ");

    for (const xSize of PAINT_SIZES) {
      const xIcon = `${SVG_START}<path d="M4 12h16" stroke-width="${xSize * 1.5}"/></svg>`;
      const xButton = this.xButton(`太さ ${xSize}`, xIcon, () => {
        this.painter.size = xSize;
        this.update();
      });
      this.sizeButtons.set(xSize, xButton);
      xSizes.append(xButton);
    }

    // 塗りつぶしには太さが関係ないので、塗りつぶしを選んでいる間は太さの代わりに模様を出す。
    const xPatterns = this.xGroup("塗りつぶしの模様");
    this.sizeGroup = xSizes;
    this.patternGroup = xPatterns;
    this.patternButtons = new Map();

    for (const xPattern of Object.keys(PAINT_PATTERNS)) {
      const xInfo = PATTERN_INFO[xPattern];
      const xId = `paint-pattern-${xPattern}`;
      const xIcon = '<svg viewBox="0 0 24 24" width="24" height="24" shape-rendering="crispEdges" aria-hidden="true">' +
        `<defs><pattern id="${xId}" width="2" height="2" patternUnits="userSpaceOnUse">${xInfo.tile}</pattern></defs>` +
        `<rect x="2.5" y="2.5" width="19" height="19" fill="#fff" stroke="#000"/>` +
        `<rect x="3" y="3" width="18" height="18" fill="url(#${xId})"/></svg>`;
      const xButton = this.xButton(`模様：${xInfo.label}`, xIcon, () => {
        this.painter.pattern = xPattern;
        this.update();
      });
      xButton.classList.add("is-pattern");
      this.patternButtons.set(xPattern, xButton);
      xPatterns.append(xButton);
    }

    const xActions = this.xGroup("操作");
    this.undoButton = this.xButton("取り消し", "取消", () => xHandlers.onUndo());
    this.undoButton.classList.add("is-text");
    const xDone = this.xButton("描画を終えて部品の編集に戻る", "完了", () => xHandlers.onDone());
    xDone.classList.add("is-text");
    xActions.append(this.undoButton, xDone);

    this.toolGroup = xTools;
    this.actionGroup = xActions;
    this.importPane = this.xBuildImportPane();
    this.root.replaceChildren(xTools, xSizes, xPatterns, xActions, this.importPane);
    this.update();
  }

  xBuildImportPane() {
    const xPane = document.createElement("div");
    const xButtons = document.createElement("div");
    const xCancel = document.createElement("button");
    const xPaste = document.createElement("button");
    const xApply = () => this.painter.setAdjust(Number(this.brightness.value), Number(this.contrast.value));

    xPane.className = "paint-import";
    xPane.setAttribute("role", "group");
    xPane.setAttribute("aria-label", "画像の取り込み");
    this.brightness = this.xSlider(xPane, "明るさ", xApply);
    this.contrast = this.xSlider(xPane, "コントラスト", xApply);
    this.sliders = [this.brightness.closest("label"), this.contrast.closest("label")];

    xButtons.className = "paint-import-buttons";
    xCancel.type = "button";
    xCancel.textContent = "キャンセル";
    xCancel.addEventListener("click", () => this.painter.cancelImage());
    xPaste.type = "button";
    xPaste.className = "is-default";
    xPaste.textContent = "貼り付け";
    xPaste.addEventListener("click", () => this.painter.pasteImage());
    xButtons.append(xCancel, xPaste);
    xPane.append(xButtons);
    return xPane;
  }

  xSlider(xPane, xLabel, xOnInput) {
    const xField = document.createElement("label");
    const xName = document.createElement("span");
    const xInput = document.createElement("input");

    xField.className = "paint-slider";
    xName.textContent = xLabel;
    xInput.type = "range";
    xInput.min = "-100";
    xInput.max = "100";
    xInput.value = "0";
    xInput.addEventListener("input", xOnInput);
    xField.append(xName, xInput);
    xPane.append(xField);
    return xInput;
  }

  // 選んでいる道具・太さ・模様と、取り消しできるかどうかを表示に反映する。
  update() {
    for (const [xTool, xButton] of this.toolButtons) {
      xButton.setAttribute("aria-pressed", String(xTool === this.painter.tool));
    }

    // 消しゴムを選んでいるときも、太さで消す大きさが変わる。
    for (const [xSize, xButton] of this.sizeButtons) {
      xButton.setAttribute("aria-pressed", String(xSize === this.painter.size));
    }

    for (const [xPattern, xButton] of this.patternButtons) {
      xButton.setAttribute("aria-pressed", String(xPattern === this.painter.pattern));
    }

    const xFilling = this.painter.tool === "fill";
    const xPlacing = this.painter.placing;
    const xLayout = `${xFilling}:${xPlacing}:${this.painter.placingText}`;

    this.toolGroup.hidden = xPlacing;
    this.actionGroup.hidden = xPlacing;
    this.sizeGroup.hidden = xPlacing || xFilling;
    this.patternGroup.hidden = xPlacing || !xFilling;
    this.importPane.hidden = !xPlacing;
    this.importPane.setAttribute("aria-label", this.painter.placingText ? "文字の配置" : "画像の取り込み");

    for (const xSlider of this.sliders) {
      xSlider.hidden = this.painter.placingText;
    }
    this.undoButton.disabled = !this.painter.canUndo;

    // 取り込みを始めるたびに、明るさ・コントラストを元に戻す。
    if (xPlacing && this.layout.split(":")[1] !== "true") {
      this.brightness.value = "0";
      this.contrast.value = "0";
    }

    if (xLayout !== this.layout) {
      this.layout = xLayout;
      this.handlers.onLayout();
    }
  }

  xGroup(xLabel) {
    const xGroup = document.createElement("div");
    xGroup.className = "paint-group";
    xGroup.setAttribute("role", "group");
    xGroup.setAttribute("aria-label", xLabel);
    return xGroup;
  }

  xButton(xLabel, xContent, xAction) {
    const xButton = document.createElement("button");
    xButton.type = "button";
    xButton.className = "paint-button";
    xButton.title = xLabel;
    xButton.setAttribute("aria-label", xLabel);
    xButton.innerHTML = xContent;
    xButton.addEventListener("click", xAction);
    return xButton;
  }
}
