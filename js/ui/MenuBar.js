/*
 * プルダウンメニュー。同じメニュー定義から、端末に合わせて2通りに描く。
 *   pc     : クラシックMac風のメニューバー（見出しごとにプルダウン）
 *   mobile : 上部にスタック名とカード名、右端の「☰」で全メニューを一覧表示
 *
 * menus: [{ title, items: [{ label, action, enabled?(), checked?() } | "-"] }]
 */
export class MenuBar {
  constructor(xRoot, xMenus) {
    this.root = xRoot;
    this.menus = xMenus;
    this.mode = "pc";
    this.openIndex = -1;
    this.title = "";
    this.subtitle = "";

    document.addEventListener("pointerdown", (xEvent) => {
      if (this.openIndex >= 0 && !this.root.contains(xEvent.target)) {
        this.close();
      }
    });

    document.addEventListener("keydown", (xEvent) => {
      if (xEvent.key === "Escape" && this.openIndex >= 0) {
        this.close();
      }
    });
  }

  setMode(xMode) {
    this.mode = xMode;
    this.openIndex = -1;
    this.render();
  }

  setTitle(xTitle, xSubtitle) {
    this.title = xTitle;
    this.subtitle = xSubtitle;

    for (const xElement of this.root.querySelectorAll("[data-title]")) {
      xElement.textContent = xElement.dataset.title === "main" ? xTitle : xSubtitle;
    }
  }

  open(xIndex) {
    this.openIndex = xIndex;
    this.render();
    this.root.querySelector(".menu-item:not(:disabled)")?.focus({ preventScroll: true });
  }

  close() {
    this.openIndex = -1;
    this.render();
  }

  render() {
    this.root.replaceChildren();

    if (this.mode === "mobile") {
      this.xRenderMobile();
    } else {
      this.xRenderPc();
    }
  }

  xTitleElement(xTag, xKind, xClassName) {
    const xElement = document.createElement(xTag);
    xElement.className = xClassName;
    xElement.dataset.title = xKind;
    xElement.textContent = xKind === "main" ? this.title : this.subtitle;
    return xElement;
  }

  xRenderPc() {
    const xNav = document.createElement("nav");
    xNav.className = "menubar-menus";
    xNav.setAttribute("aria-label", "メニュー");

    this.menus.forEach((xMenu, xIndex) => {
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
        if (this.openIndex >= 0 && this.openIndex !== xIndex) {
          this.open(xIndex);
        }
      });

      xWrapper.append(xTitle);

      if (xIsOpen) {
        const xDropdown = this.xBuildDropdown();
        this.xAppendItems(xDropdown, xMenu.items);
        xWrapper.append(xDropdown);
      }

      xNav.append(xWrapper);
    });

    this.root.append(
      xNav,
      this.xTitleElement("span", "main", "menubar-stack"),
      this.xTitleElement("span", "sub", "menubar-card")
    );
  }

  xRenderMobile() {
    const xTitles = document.createElement("div");
    const xTrigger = document.createElement("button");
    const xIsOpen = this.openIndex >= 0;

    xTitles.className = "menubar-titles";
    xTitles.append(
      this.xTitleElement("strong", "main", "menubar-stack"),
      this.xTitleElement("span", "sub", "menubar-card")
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
      const xDropdown = this.xBuildDropdown();
      xDropdown.classList.add("is-mobile");

      for (const xMenu of this.menus) {
        const xHeading = document.createElement("div");
        xHeading.className = "menu-section-title";
        xHeading.textContent = xMenu.title;
        xDropdown.append(xHeading);
        this.xAppendItems(xDropdown, xMenu.items);
      }

      this.root.append(xDropdown);
    }
  }

  xBuildDropdown() {
    const xDropdown = document.createElement("div");
    xDropdown.className = "menu-dropdown";
    xDropdown.setAttribute("role", "menu");
    return xDropdown;
  }

  xAppendItems(xDropdown, xItems) {
    for (const xItem of xItems) {
      if (xItem === "-") {
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
      });

      xDropdown.append(xButton);
    }
  }
}
