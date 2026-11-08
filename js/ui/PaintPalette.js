/*
 * エディット中に出す道具パレット（PCはカードの左、スマホはカードの下）。
 * 先頭の矢印で部品を扱い、ほかの道具で絵を描く。部品を扱っている間は、太さ・模様・取り消しを隠す。
 * 画像を取り込んでいる間は、道具の代わりに明るさ・コントラストと「貼り付け」を出す。
 * 選択の道具で囲んだ範囲を浮かせている間は、明るさ・コントラストの代わりに「コピー」「削除」を出す。
 *
 * handlers:
 *   onText()          文字を絵として置く
 *   onClear()         絵をすべて消す（消しゴムを2回続けて押した）
 *   onUndo()          取り消し
 *   onCopy()          浮かせている範囲の写しを今の位置に残す
 *   onPartsTool()     矢印を選んだ（部品を扱う）
 *   onAddPart(kind)   部品を追加する（"button" / "field" / "text"）
 *   onDeletePart()    選んでいる部品を削除する
 *   hasSelectedPart() 部品を選んでいるか（削除ボタンを押せるか）
 *   onPaintTool()     描画の道具を選んだ（絵を描く）
 *   isPainting()      今、描画の道具を使っているか
 *   onDone()          エディットを終える（ブラウズに戻る）
 *   onLayout()        パレットの大きさが変わった（模様と太さの入れ替え、取り込み中の切り替え）
 */
import { NEW_PART_KIND } from "../model/StackFormat.js";
import { PAINT_PATTERNS, PAINT_SIZES, PAINT_TOOL, PAINT_TOOLS } from "../paint/PaintSettings.js";

const SVG_START = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" ' +
  'stroke-width="2" stroke-linejoin="miter" aria-hidden="true">';
const SVG_END = "</svg>";

const fsIcon = (xShapes) => `${SVG_START}${xShapes}${SVG_END}`;

const TOOL_INFO = {
  [PAINT_TOOL.pencil]: { label: "鉛筆", icon: '<path d="M4 20l2-6L16 4l4 4-10 10zM14 6l4 4"/>' },
  [PAINT_TOOL.eraser]: { label: "消しゴム", icon: '<path d="M3 15l9-9 8 8-6 6H8zM8 10l8 8"/>' },
  [PAINT_TOOL.line]: { label: "直線", icon: '<path d="M4 20L20 4"/>' },
  [PAINT_TOOL.rect]: { label: "四角", icon: '<rect x="4" y="6" width="16" height="12"/>' },
  [PAINT_TOOL.oval]: { label: "楕円", icon: '<ellipse cx="12" cy="12" rx="8" ry="6"/>' },
  [PAINT_TOOL.fill]: { label: "塗りつぶし", icon: '<path d="M4 11l7-7 8 8-7 7zM4 11h15M20 14c1 2 2 4 0 6"/>' },
  [PAINT_TOOL.select]: { label: "選択（囲んだ範囲を動かす・コピー・削除）", icon: '<rect x="4" y="5" width="16" height="14" stroke-dasharray="3 2"/>' }
};

const ERASER_LABEL = "消しゴム（2回続けて押すと絵をすべて消す）";

// 消しゴムをこの時間（ミリ秒）のうちに2回押すと、絵をすべて消す。
// スマホでは dblclick が来ないことがあるので、押した間隔で見分ける。
const DOUBLE_PRESS_TIME = 400;

// 部品を扱う道具（矢印）。選ぶと絵は描かず、部品を掴む・動かす・設定を開く。
const PARTS_TOOL_LABEL = "部品（選ぶ・動かす・2回押すと設定）";
const PARTS_TOOL_ICON = '<path d="M6 3v16l4-4 3 6 2-1-3-6h6z"/>';

// 部品を追加するボタン。押すと部品を扱う方に切り替えてから、今の層に置く。
const ADD_PART_INFO = {
  [NEW_PART_KIND.button]: { label: "ボタンを追加", icon: '<rect x="3" y="7" width="18" height="10" rx="5"/>' },
  [NEW_PART_KIND.field]: { label: "入力フィールドを追加", icon: '<rect x="3" y="5" width="18" height="14"/><path d="M6 10h12M6 14h8"/>' },
  [NEW_PART_KIND.text]: { label: "テキストパーツを追加", icon: '<path d="M6 6h12M12 6v12M9 18h6"/>' }
};

// 選んでいる部品を削除するボタン（スマホには Delete キーがないため、パレットにも置く）。
const DELETE_PART_LABEL = "選んでいる部品を削除";
const DELETE_PART_ICON = '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/>';

// 文字を絵として置くボタン（道具を切り替えず、文字を入れるダイアログを開く）。
const TEXT_LABEL = "文字";
const TEXT_ICON = '<path d="M5 20L12 4l7 16M8 14h8"/>';

// 線の太さの見本は、実際の太さよりこの倍だけ太く描いて見分けやすくする。
const SIZE_ICON_SCALE = 1.5;

// 塗りつぶしの模様の見本。2×2ドットの模様を枠の中に敷き詰める。
const PATTERN_INFO = {
  black: { label: "黒", tile: '<rect width="2" height="2"/>' },
  white: { label: "白", tile: "" },
  checker: { label: "チェック", tile: '<rect width="1" height="1"/><rect x="1" y="1" width="1" height="1"/>' },
  vertical: { label: "縦縞", tile: '<rect width="1" height="2"/>' },
  horizontal: { label: "横縞", tile: '<rect width="2" height="1"/>' }
};

const fsPatternIcon = (xPattern) => {
  const xId = `paint-pattern-${xPattern}`;
  return '<svg viewBox="0 0 24 24" width="24" height="24" shape-rendering="crispEdges" aria-hidden="true">' +
    `<defs><pattern id="${xId}" width="2" height="2" patternUnits="userSpaceOnUse">${PATTERN_INFO[xPattern].tile}</pattern></defs>` +
    `<rect x="2.5" y="2.5" width="19" height="19" fill="#fff" stroke="#000"/>` +
    `<rect x="3" y="3" width="18" height="18" fill="url(#${xId})"/>${SVG_END}`;
};

// 明るさ・コントラストのつまみの範囲（PaintSettings の調整の幅と同じ）。
const ADJUST_SLIDER_RANGE = { min: "-100", max: "100", initial: "0" };

const CLASS_NAME = {
  group: "paint-group",
  button: "paint-button",
  patternButton: "is-pattern",
  textButton: "is-text",
  importPane: "paint-import",
  importButtons: "paint-import-buttons",
  defaultButton: "is-default",
  slider: "paint-slider"
};

// 浮かせているものの調整欄の名前（読み上げ用）。
const IMPORT_PANE_LABEL = { selection: "選択した範囲", text: "文字の配置", image: "画像の取り込み" };

const fsCreateGroup = (xLabel) => {
  const xGroup = document.createElement("div");
  xGroup.className = CLASS_NAME.group;
  xGroup.setAttribute("role", "group");
  xGroup.setAttribute("aria-label", xLabel);
  return xGroup;
};

// content はアイコンの SVG か、ボタンに書く文字。
const fsCreatePaletteButton = (xLabel, xContent, xAction) => {
  const xButton = document.createElement("button");
  xButton.type = "button";
  xButton.className = CLASS_NAME.button;
  xButton.title = xLabel;
  xButton.setAttribute("aria-label", xLabel);
  xButton.innerHTML = xContent;
  xButton.addEventListener("click", xAction);
  return xButton;
};

// 文字だけのボタン。options: { title（説明）, className }。
const fsCreateTextButton = (xText, xAction, xOptions = {}) => {
  const xButton = document.createElement("button");
  xButton.type = "button";

  if (xOptions.className) {
    xButton.className = xOptions.className;
  }

  xButton.textContent = xText;

  if (xOptions.title) {
    xButton.title = xOptions.title;
  }

  xButton.addEventListener("click", xAction);
  return xButton;
};

const fsMarkPressed = (xButtons, xSelectedValue, xActive = true) => {
  for (const [xValue, xButton] of xButtons) {
    xButton.setAttribute("aria-pressed", String(xActive && xValue === xSelectedValue));
  }
};

export class PaintPalette {
  constructor(xRoot, xPainter, xHandlers) {
    this.root = xRoot;
    this.painter = xPainter;
    this.handlers = xHandlers;
    // パレットの並び（どのグループを出しているか）。変わったときだけ onLayout を呼ぶ。
    this.layout = "";
    this.wasPlacing = false;
    this.toolButtons = new Map();
    this.sizeButtons = new Map();
    this.patternButtons = new Map();

    this.toolGroup = this.buildToolGroup();
    this.addPartGroup = this.buildAddPartGroup();
    this.sizeGroup = this.buildSizeGroup();
    // 塗りつぶしには太さが関係ないので、塗りつぶしを選んでいる間は太さの代わりに模様を出す。
    this.patternGroup = this.buildPatternGroup();
    this.actionGroup = this.buildActionGroup();
    this.importPane = this.buildImportPane();
    this.root.replaceChildren(
      this.toolGroup,
      this.addPartGroup,
      this.sizeGroup,
      this.patternGroup,
      this.actionGroup,
      this.importPane
    );
    this.update();
  }

  buildToolGroup() {
    const xGroup = fsCreateGroup("道具");

    this.partsButton = fsCreatePaletteButton(PARTS_TOOL_LABEL, fsIcon(PARTS_TOOL_ICON), () => this.handlers.onPartsTool());
    xGroup.append(this.partsButton);

    for (const xTool of PAINT_TOOLS) {
      const xInfo = TOOL_INFO[xTool];
      const xButton = fsCreatePaletteButton(xInfo.label, fsIcon(xInfo.icon), () => {
        this.painter.tool = xTool;
        // 部品を扱っているときは、絵を描く方に切り替える（切り替えた先で update される）。
        this.handlers.onPaintTool();
        this.update();
      });
      this.toolButtons.set(xTool, xButton);
      xGroup.append(xButton);
    }

    this.listenForEraserDoublePress(this.toolButtons.get(PAINT_TOOL.eraser));
    xGroup.append(fsCreatePaletteButton(TEXT_LABEL, fsIcon(TEXT_ICON), () => this.handlers.onText()));
    return xGroup;
  }

  listenForEraserDoublePress(xEraser) {
    let xLastPressTime = 0;
    xEraser.title = ERASER_LABEL;
    xEraser.addEventListener("click", (xEvent) => {
      if (xEvent.timeStamp - xLastPressTime < DOUBLE_PRESS_TIME) {
        xLastPressTime = 0;
        this.handlers.onClear();
        return;
      }

      xLastPressTime = xEvent.timeStamp;
    });
  }

  buildAddPartGroup() {
    const xGroup = fsCreateGroup("部品の追加と削除");

    for (const [xKind, xInfo] of Object.entries(ADD_PART_INFO)) {
      xGroup.append(fsCreatePaletteButton(xInfo.label, fsIcon(xInfo.icon), () => this.handlers.onAddPart(xKind)));
    }

    this.deletePartButton = fsCreatePaletteButton(DELETE_PART_LABEL, fsIcon(DELETE_PART_ICON), () => this.handlers.onDeletePart());
    xGroup.append(this.deletePartButton);
    return xGroup;
  }

  buildSizeGroup() {
    const xGroup = fsCreateGroup("線の太さ");

    for (const xSize of PAINT_SIZES) {
      const xIcon = fsIcon(`<path d="M4 12h16" stroke-width="${xSize * SIZE_ICON_SCALE}"/>`);
      const xButton = fsCreatePaletteButton(`太さ ${xSize}`, xIcon, () => {
        this.painter.size = xSize;
        this.update();
      });
      this.sizeButtons.set(xSize, xButton);
      xGroup.append(xButton);
    }

    return xGroup;
  }

  buildPatternGroup() {
    const xGroup = fsCreateGroup("塗りつぶしの模様");

    for (const xPattern of Object.keys(PAINT_PATTERNS)) {
      const xButton = fsCreatePaletteButton(`模様：${PATTERN_INFO[xPattern].label}`, fsPatternIcon(xPattern), () => {
        this.painter.pattern = xPattern;
        this.update();
      });
      xButton.classList.add(CLASS_NAME.patternButton);
      this.patternButtons.set(xPattern, xButton);
      xGroup.append(xButton);
    }

    return xGroup;
  }

  buildActionGroup() {
    const xGroup = fsCreateGroup("操作");
    const xDone = fsCreatePaletteButton("エディットを終えてブラウズに戻る", "完了", () => this.handlers.onDone());

    this.undoButton = fsCreatePaletteButton("取り消し", "取消", () => this.handlers.onUndo());
    this.undoButton.classList.add(CLASS_NAME.textButton);
    xDone.classList.add(CLASS_NAME.textButton);
    xGroup.append(this.undoButton, xDone);
    return xGroup;
  }

  // 浮かせている間に、道具の代わりに出す欄。画像なら明るさ・コントラスト、選択範囲ならコピー・削除。
  buildImportPane() {
    const xPane = document.createElement("div");
    const xApplyAdjust = () => this.painter.setAdjust(Number(this.brightness.value), Number(this.contrast.value));

    xPane.className = CLASS_NAME.importPane;
    xPane.setAttribute("role", "group");
    xPane.setAttribute("aria-label", IMPORT_PANE_LABEL.image);
    this.brightness = this.appendSlider(xPane, "明るさ", xApplyAdjust);
    this.contrast = this.appendSlider(xPane, "コントラスト", xApplyAdjust);
    this.sliders = [this.brightness.closest("label"), this.contrast.closest("label")];

    const xPlaceButtons = document.createElement("div");
    xPlaceButtons.className = CLASS_NAME.importButtons;
    xPlaceButtons.append(
      fsCreateTextButton("キャンセル", () => this.painter.cancelImage()),
      fsCreateTextButton("貼り付け", () => this.painter.pasteImage(), { className: CLASS_NAME.defaultButton })
    );

    // 選択した範囲だけに使うボタン。
    this.selectButtons = document.createElement("div");
    this.selectButtons.className = CLASS_NAME.importButtons;
    this.selectButtons.append(
      fsCreateTextButton("コピー", () => this.handlers.onCopy(), { title: "今の位置に写しを残す（浮かせた方は続けて動かせる）" }),
      fsCreateTextButton("削除", () => this.painter.deleteSelection())
    );

    xPane.append(this.selectButtons, xPlaceButtons);
    return xPane;
  }

  appendSlider(xPane, xLabelText, xOnInput) {
    const xField = document.createElement("label");
    const xName = document.createElement("span");
    const xInput = document.createElement("input");

    xField.className = CLASS_NAME.slider;
    xName.textContent = xLabelText;
    xInput.type = "range";
    xInput.min = ADJUST_SLIDER_RANGE.min;
    xInput.max = ADJUST_SLIDER_RANGE.max;
    xInput.value = ADJUST_SLIDER_RANGE.initial;
    xInput.addEventListener("input", xOnInput);
    xField.append(xName, xInput);
    xPane.append(xField);
    return xInput;
  }

  // 選んでいる道具・太さ・模様と、取り消しできるかどうかを表示に反映する。
  update() {
    const { painter: xPainter } = this;
    const xPainting = this.handlers.isPainting();
    const xFilling = xPainting && xPainter.tool === PAINT_TOOL.fill;
    // 選択の道具と部品の矢印には、太さも模様も関係ない。
    const xChoosing = !xPainting || xPainter.tool === PAINT_TOOL.select;
    const xPlacing = xPainter.placing;
    const xSelecting = xPainter.selecting;

    this.partsButton.setAttribute("aria-pressed", String(!xPainting));
    fsMarkPressed(this.toolButtons, xPainter.tool, xPainting);
    // 消しゴムを選んでいるときも、太さで消す大きさが変わる。
    fsMarkPressed(this.sizeButtons, xPainter.size);
    fsMarkPressed(this.patternButtons, xPainter.pattern);

    this.toolGroup.hidden = xPlacing;
    this.addPartGroup.hidden = xPlacing;
    this.actionGroup.hidden = xPlacing;
    this.sizeGroup.hidden = xPlacing || xFilling || xChoosing;
    this.patternGroup.hidden = xPlacing || !xFilling;
    this.updateImportPane(xPlacing, xSelecting);

    // 取り消しは絵だけが対象なので、部品を扱っている間は出さない。
    this.undoButton.hidden = !xPainting;
    this.undoButton.disabled = !xPainter.canUndo;
    this.deletePartButton.disabled = !this.handlers.hasSelectedPart();

    const xLayout = [xFilling, xPlacing, xPainter.placingText, xSelecting, xChoosing, xPainting].join(":");

    if (xLayout !== this.layout) {
      this.layout = xLayout;
      this.handlers.onLayout();
    }
  }

  updateImportPane(xPlacing, xSelecting) {
    const xPlacingText = this.painter.placingText;
    let xPaneLabel = IMPORT_PANE_LABEL.image;

    if (xSelecting) {
      xPaneLabel = IMPORT_PANE_LABEL.selection;
    } else if (xPlacingText) {
      xPaneLabel = IMPORT_PANE_LABEL.text;
    }

    this.importPane.hidden = !xPlacing;
    this.importPane.setAttribute("aria-label", xPaneLabel);
    this.selectButtons.hidden = !xSelecting;

    // 明るさ・コントラストは写真などの画像だけに使う。
    for (const xSlider of this.sliders) {
      xSlider.hidden = xPlacingText || xSelecting;
    }

    // 取り込みを始めるたびに、明るさ・コントラストを元に戻す。
    if (xPlacing && !this.wasPlacing) {
      this.brightness.value = ADJUST_SLIDER_RANGE.initial;
      this.contrast.value = ADJUST_SLIDER_RANGE.initial;
    }

    this.wasPlacing = xPlacing;
  }
}
