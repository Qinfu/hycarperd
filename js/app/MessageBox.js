/*
 * メッセージボックス。スクリプトの put の書き込み先で、ブラウズ中だけ表示する（エディット中は CSS で隠す）。
 */

export class MessageBox {
  constructor(xElement) {
    this.element = xElement;
  }

  get text() {
    return this.element.textContent;
  }

  get isOpen() {
    return !this.element.hidden;
  }

  // 書き込まれたら、閉じていても開く。
  write(xText) {
    this.element.textContent = xText;
    this.element.hidden = false;
  }

  // スタックを開き直したときに中身だけ消す（開閉の状態はそのまま）。
  clear() {
    this.element.textContent = "";
  }

  toggle() {
    this.element.hidden = !this.element.hidden;
  }
}
