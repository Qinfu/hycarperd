/*
 * 画像（img 要素・canvas 要素）の画素を、作業用のキャンバスに描いて読み取る。
 */

const fsCreateWorkCanvas = (xWidth, xHeight) => {
  const xCanvas = document.createElement("canvas");
  xCanvas.width = xWidth;
  xCanvas.height = xHeight;
  return xCanvas;
};

// 保存してある絵を、元の大きさのまま左上に合わせて読む（絵の大きさはカードと同じはず）。
export const fsReadPicturePixels = (xImage, xWidth, xHeight) => {
  const xContext = fsCreateWorkCanvas(xWidth, xHeight).getContext("2d");
  xContext.drawImage(xImage, 0, 0);
  return xContext.getImageData(0, 0, xWidth, xHeight).data;
};

// 取り込んだ画像を、指定の大きさに伸び縮みさせて読む。縮小で細部がつぶれないよう、なめらかに縮める。
export const fsReadScaledImagePixels = (xImage, xWidth, xHeight) => {
  const xContext = fsCreateWorkCanvas(xWidth, xHeight).getContext("2d");
  xContext.imageSmoothingQuality = "high";
  xContext.drawImage(xImage, 0, 0, xWidth, xHeight);
  return xContext.getImageData(0, 0, xWidth, xHeight).data;
};
