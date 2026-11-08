/*
 * 画面の下に少しの間だけ出す、アプリからのお知らせ。
 */
import { STATUS_DISPLAY_TIME } from "../config/AppConfig.js";

export class StatusNotice {
  constructor(xElement) {
    this.element = xElement;
    this.hideTimer = null;
  }

  // 続けて出したときは、前のお知らせを置き換えて、表示する時間を数え直す。
  show(xMessage) {
    clearTimeout(this.hideTimer);
    this.element.textContent = xMessage;
    this.element.hidden = false;
    this.hideTimer = setTimeout(() => {
      this.element.hidden = true;
    }, STATUS_DISPLAY_TIME);
  }
}
