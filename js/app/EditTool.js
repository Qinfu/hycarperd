/*
 * ブラウズ・エディットと、エディット中に何を扱うか（どの層の部品か絵か）の組み合わせ。
 * メニュー・道具パレット・スクリプトの doMenu のどこから切り替えても、EditActions.setTool を通す。
 */
import { EDIT_LAYER } from "./AppState.js";

export const APP_TOOL = {
  // 閲覧（スクリプトが動く）。
  browse: "browse",
  // カードの部品を編集する。
  card: "card",
  // 背景の部品を編集する。
  background: "background",
  // カードに絵を描く。
  paintCard: "paint-card",
  // 背景に絵を描く。
  paintBackground: "paint-background"
};

// 道具を選び直したときのお知らせ。
export const TOOL_NOTICES = {
  [APP_TOOL.browse]: "ブラウズに戻りました。",
  [APP_TOOL.card]: "編集中：部品はドラッグで移動、右下の黒い四角で大きさを変更、2回続けて押すと設定を開きます。絵はパレットの道具で描きます。",
  [APP_TOOL.background]: "背景を編集中：ここに置いた部品は全カードに表示されます。",
  [APP_TOOL.paintCard]: "描画中：パレットで道具を選んで描きます。部品を扱うときはパレットの矢印を押します。",
  [APP_TOOL.paintBackground]: "背景に描画中：ここで描いた絵は全カードに表示されます。"
};

// 層と、絵を描くかどうかから道具を決める。
export const fsToolFor = (xLayer, xPainting) => {
  if (xLayer === EDIT_LAYER.background) {
    return xPainting ? APP_TOOL.paintBackground : APP_TOOL.background;
  }

  return xPainting ? APP_TOOL.paintCard : APP_TOOL.card;
};

// 道具を、状態の項目（editing・painting・editLayer）に直す。ブラウズは今の層を覚えたままにする。
export const fsModeOfTool = (xTool, xCurrentLayer) => {
  const xEditing = xTool !== APP_TOOL.browse;
  const xPainting = xTool === APP_TOOL.paintCard || xTool === APP_TOOL.paintBackground;
  const xBackground = xTool === APP_TOOL.background || xTool === APP_TOOL.paintBackground;
  let xLayer = xCurrentLayer;

  if (xEditing) {
    xLayer = xBackground ? EDIT_LAYER.background : EDIT_LAYER.card;
  }

  return { editing: xEditing, painting: xPainting, editLayer: xLayer };
};
