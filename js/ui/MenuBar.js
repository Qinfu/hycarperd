/*
 * プルダウンメニュー。同じメニュー定義から、端末に合わせて2通りに描く。
 *   pc     : クラシックMac風のメニューバー（見出しごとにプルダウン）
 *   mobile : 上部にスタック名、右端の「☰」で全メニューを一覧表示
 *
 * menus: [{ title, visible?(), items: [{ label, action, enabled?(), checked?(), visible?() } | "-"] }]
 * visible が false のメニュー・項目は出さない。状態が変わったら update() を呼ぶ。
 */
// メニュー定義の区切り線。
export const MENU_SEPARATOR = "-";

// 描き方。PC はメニューバー、スマホは「☰」で開く一覧。
export const MENU_MODE = { pc: "pc", mobile: "mobile" };

// choose の結果。スクリプトの doMenu はこれを見て、選べなかったときにエラーを出す。
export const MENU_CHOICE = { done: "done", missing: "missing", disabled: "disabled" };

// どのメニューも開いていない。
const NO_MENU_OPEN = -1;

// タイトルの要素の data-title の値。setTitle で中身を差し替える。
const TITLE_KIND = { main: "main", sub: "sub" };

// doMenu の名前は、末尾の「…」「...」を省いてもよい。
const fsNormalizeMenuLabel = (xText) => xText.trim().replace(/(…|\.\.\.)$/, "");

const fsIsSeparator = (xItem) => xItem === MENU_SEPARATOR;

export class MenuBar {
  constructor(xRoot, xMenus) {
    this.root = xRoot;
    this.menus = xMenus;
    this.mode = MENU_MODE.pc;
    this.openIndex = NO_MENU_OPEN;
    this.title = "";
    this.subtitle = "";
    this.visibleKey = "";

    document.addEventListener("pointerdown", (xEvent) => {
      if (this.isOpen && !this.root.contains(xEvent.target)) {
        this.close();
      }
    });

    document.addEventListener("keydown", (xEvent) => {
      if (xEvent.key === "Escape" && this.isOpen) {
        this.close();
      }
    });
  }

  get isOpen() {
    return this.openIndex !== NO_MENU_OPEN;
  }

  setMode(xMode) {
    this.mode = xMode;
    this.openIndex = NO_MENU_OPEN;
    this.render();
  }

  setTitle(xTitle, xSubtitle) {
    this.title = xTitle;
    this.subtitle = xSubtitle;

    for (const xElement of this.root.querySelectorAll("[data-title]")) {
      xElement.textContent = xElement.dataset.title === TITLE_KIND.main ? xTitle : xSubtitle;
    }
  }

  // 出すメニューが変わったときだけ描き直す（開いているメニューを閉じないため）。
  update() {
    if (this.visibleMenusKey() !== this.visibleKey) {
      this.openIndex = NO_MENU_OPEN;
      this.render();
    }
  }

  // スクリプトの doMenu から、名前でメニュー項目を選ぶ。今は出ていないメニューの項目も選べる。
  // 名前の末尾の「…」「...」は省いてもよい。
  // 選べたら "done"、見つからなければ "missing"、選べない状態なら "disabled" を返す。
  choose(xLabel) {
    const xWanted = fsNormalizeMenuLabel(xLabel);
    const xItem = this.menus
      .flatMap((xMenu) => xMenu.items)
      .find((xEntry) => !fsIsSeparator(xEntry) && fsNormalizeMenuLabel(xEntry.label) === xWanted);

    if (!xItem) {
      return MENU_CHOICE.missing;
    }

    if (!(xItem.enabled?.() ?? true)) {
      return MENU_CHOICE.disabled;
    }

    this.close();
    xItem.action();
    return MENU_CHOICE.done;
  }

  // 出すメニューと、その元の番号。項目が1つも出ないメニューも出さない。
  visibleMenus() {
    return this.menus
      .map((xMenu, xIndex) => ({ menu: xMenu, index: xIndex }))
      .filter(({ menu: xMenu }) => (xMenu.visible?.() ?? true) && this.visibleItems(xMenu.items).length > 0);
  }

  // 出しているメニューの組み合わせ。変わったときだけ描き直すのに使う。
  visibleMenusKey() {
    return this.visibleMenus().map(({ index: xIndex }) => xIndex).join(",");
  }

  // 出す項目。隠した項目のせいで区切り線が先頭・末尾・続けて並ばないようにする。
  visibleItems(xItems) {
    const xResult = [];

    for (const xItem of xItems) {
      if (fsIsSeparator(xItem)) {
        if (xResult.length > 0 && !fsIsSeparator(xResult.at(-1))) {
          xResult.push(xItem);
        }
      } else if (xItem.visible?.() ?? true) {
        xResult.push(xItem);
      }
    }

    if (fsIsSeparator(xResult.at(-1))) {
      xResult.pop();
    }

    return xResult;
  }

  open(xIndex) {
    this.openIndex = xIndex;
    this.render();
    this.root.querySelector(".menu-item:not(:disabled)")?.focus({ preventScroll: true });
  }

  close() {
    this.openIndex = NO_MENU_OPEN;
    this.render();
  }

  render() {
    this.root.replaceChildren();
    this.visibleKey = this.visibleMenusKey();

    if (this.mode === MENU_MODE.mobile) {
      this.renderMobile();
    } else {
      this.renderPc();
    }
  }

  // スタック名（main）と、カードの位置など（sub）を出す要素。
  createTitleElement(xTag, xKind, xClassName) {
    const xElement = document.createElement(xTag);
    xElement.className = xClassName;
    xElement.dataset.title = xKind;
    xElement.textContent = xKind === TITLE_KIND.main ? this.title : this.subtitle;
    return xElement;
  }

  renderPc() {
    const xNav = document.createElement("nav");
    xNav.className = "menubar-menus";
    xNav.setAttribute("aria-label", "メニュー");

    this.visibleMenus().forEach(({ menu: xMenu, index: xIndex }) => {
      const xWrapper = document.createElement("div");
      const xTitle = document.createElement("button");
      const xIsOpen = xIndex === this.openIndex;

      xWrapper.className = "menu";
      xTitle.type = "button";
      xTitle.className = "menu-title";
      xTitle.textContent = xMenu.title;
      xTitle.setAttribute("aria-haspopup", "menu");
      xTitle.setAttribute("aria-expanded", String(xIsOpen));
      xTitle.addEventListener("click", () => (xIsOpen ? this.close() : this.open(xIndex)));

      // どれかのメニューが開いている間は、見出しに触れるだけで切り替える（Macと同じ）。
      xTitle.addEventListener("pointerenter", () => {
        if (this.isOpen && this.openIndex !== xIndex) {
          this.open(xIndex);
        }
      });

      xWrapper.append(xTitle);

      if (xIsOpen) {
        const xDropdown = this.createDropdown();
        this.appendItems(xDropdown, xMenu.items);
        xWrapper.append(xDropdown);
      }

      xNav.append(xWrapper);
    });

    this.root.append(
      xNav,
      this.createTitleElement("span", TITLE_KIND.main, "menubar-stack"),
      this.createTitleElement("span", TITLE_KIND.sub, "menubar-card")
    );
  }

  // スマホでは、どのメニューを開いても、すべてのメニューを見出し付きで1つの一覧に並べる。
  renderMobile() {
    const xTitles = document.createElement("div");
    const xTrigger = document.createElement("button");
    const xIsOpen = this.isOpen;

    xTitles.className = "menubar-titles";
    xTitles.append(
      this.createTitleElement("strong", TITLE_KIND.main, "menubar-stack"),
      this.createTitleElement("span", TITLE_KIND.sub, "menubar-card")
    );

    xTrigger.type = "button";
    xTrigger.className = "menu-trigger";
    xTrigger.textContent = "☰";
    xTrigger.setAttribute("aria-label", "メニュー");
    xTrigger.setAttribute("aria-haspopup", "menu");
    xTrigger.setAttribute("aria-expanded", String(xIsOpen));
    xTrigger.addEventListener("click", () => (xIsOpen ? this.close() : this.open(0)));

    this.root.append(xTitles, xTrigger);

    if (xIsOpen) {
      const xDropdown = this.createDropdown();
      xDropdown.classList.add("is-mobile");

      for (const { menu: xMenu } of this.visibleMenus()) {
        const xHeading = document.createElement("div");
        xHeading.className = "menu-section-title";
        xHeading.textContent = xMenu.title;
        xDropdown.append(xHeading);
        this.appendItems(xDropdown, xMenu.items);
      }

      this.root.append(xDropdown);
    }
  }

  createDropdown() {
    const xDropdown = document.createElement("div");
    xDropdown.className = "menu-dropdown";
    xDropdown.setAttribute("role", "menu");
    return xDropdown;
  }

  appendItems(xDropdown, xItems) {
    for (const xItem of this.visibleItems(xItems)) {
      if (fsIsSeparator(xItem)) {
        const xSeparator = document.createElement("div");
        xSeparator.className = "menu-separator";
        xSeparator.setAttribute("role", "separator");
        xDropdown.append(xSeparator);
        continue;
      }

      const xButton = document.createElement("button");
      const xChecked = xItem.checked?.() ?? null;

      xButton.type = "button";
      xButton.className = "menu-item";
      xButton.textContent = xItem.label;
      xButton.disabled = xItem.enabled ? !xItem.enabled() : false;

      if (xChecked === null) {
        xButton.setAttribute("role", "menuitem");
      } else {
        xButton.setAttribute("role", "menuitemcheckbox");
        xButton.setAttribute("aria-checked", String(xChecked));
        xButton.classList.toggle("is-checked", xChecked);
      }

      xButton.addEventListener("click", () => {
        this.close();
        xItem.action();
        // ブラウズ・エディットの切り替えなどで、出すメニューが変わることがある。
        this.update();
      });

      xDropdown.append(xButton);
    }
  }
}
