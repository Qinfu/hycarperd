/*
 * カードの移動：切り替えの効果、「戻る」の履歴、ブラウズ中の closeCard / openCard。
 */
import { MAX_CARD_HISTORY } from "../config/AppConfig.js";
import { VISUAL_EFFECT_NAMES } from "../hypertalk/ScriptVocabulary.js";
import { CARD_EFFECT } from "../model/StackFormat.js";
import { DEFAULT_TRANSITION_SPEED, TRANSITION_EFFECT } from "../ui/CardTransition.js";
import { fsCardScriptObject } from "./AppState.js";

// 切り替えの効果を決める。スクリプトの visual effect の指定（scriptEffect）があればそれを、
// なければ移る先のカードの設定、カードが空ならスタックの設定に従う。
// エディット中、同じカードへの移動、動きを減らす設定の端末では効果を付けない。
export const fsTransitionEffectFor = (xState, xIndex, xScriptEffect, xReducedMotion) => {
  if (xState.editing || xIndex === xState.cardIndex || xReducedMotion) {
    return null;
  }

  if (xScriptEffect) {
    return xScriptEffect.name === VISUAL_EFFECT_NAMES.plain ? null : xScriptEffect;
  }

  const xCardEffect = xState.stack.cards[xIndex].effect || xState.stack.stack.effect;

  if (xCardEffect === CARD_EFFECT.dissolve) {
    return { name: TRANSITION_EFFECT.dissolve, speed: DEFAULT_TRANSITION_SPEED };
  }

  // ワイプは、次のカードへなら左へ、前のカードへなら右へ拭き取る。
  if (xCardEffect === CARD_EFFECT.wipe) {
    const xName = xIndex > xState.cardIndex ? TRANSITION_EFFECT.wipeLeft : TRANSITION_EFFECT.wipeRight;
    return { name: xName, speed: DEFAULT_TRANSITION_SPEED };
  }

  return null;
};

export class Navigation {
  // reducedMotionQuery：動きを減らす設定かどうかの MediaQueryList（設定は途中で変わることがある）。
  constructor(xApp, xReducedMotionQuery) {
    this.app = xApp;
    this.reducedMotionQuery = xReducedMotionQuery;
  }

  // remember が true なら、今のカードを「戻る」の履歴に残す。effect はスクリプトの visual effect の指定。
  async goToCard(xIndex, xRemember = true, xEffect = null) {
    const { state: xState, interpreter: xInterpreter } = this.app;

    if (!xState.stack || xIndex < 0 || xIndex >= xState.stack.cards.length) {
      return;
    }

    const xTransition = fsTransitionEffectFor(xState, xIndex, xEffect, this.reducedMotionQuery.matches);

    if (!xState.editing) {
      await xInterpreter.sendMessage("closeCard", fsCardScriptObject(xState));
    }

    if (xRemember && xIndex !== xState.cardIndex) {
      xState.history = [...xState.history, xState.cardIndex].slice(-MAX_CARD_HISTORY);
    }

    xState.cardIndex = xIndex;
    xState.selectedPartId = null;
    await this.app.cardView.transition(xTransition, () => this.app.view.render());

    // 効果の途中で別のカードへ移っていたら、そちらの openCard に任せる。
    if (!xState.editing && xState.cardIndex === xIndex) {
      await xInterpreter.sendMessage("openCard", fsCardScriptObject(xState));
    }
  }

  async goBack(xEffect = null) {
    const xHistory = this.app.state.history;

    if (xHistory.length > 0) {
      await this.goToCard(xHistory.pop(), false, xEffect);
    }
  }

  // 画面の操作（メニュー・スワイプ・キー）からの移動。スクリプトの実行中は受け付けない。
  navigate(xIndex) {
    if (this.app.state.stack && !this.isScriptBusy()) {
      this.goToCard(xIndex);
    }
  }

  // スクリプトが動いている間に画面からカードを動かすと、スクリプトの思わぬ所で表示が変わるので止める。
  isScriptBusy() {
    if (!this.app.interpreter.busy) {
      return false;
    }

    this.app.notice.show("スクリプトを実行中です。スタックメニューの「ブラウズ」「エディット」で中断できます。");
    return true;
  }

  next() {
    this.navigate(this.app.state.cardIndex + 1);
  }

  previous() {
    this.navigate(this.app.state.cardIndex - 1);
  }
}
