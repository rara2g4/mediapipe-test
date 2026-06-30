function imageFromDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = dataUrl;
  });
}

async function createFaceStickerAsset() {
  const stickerCanvas = document.createElement("canvas");
  stickerCanvas.width = 512;
  stickerCanvas.height = 240;
  const stickerContext = stickerCanvas.getContext("2d");

  const leftLensX = 144;
  const rightLensX = 368;
  const lensY = 118;
  const lensWidth = 170;
  const lensHeight = 112;
  const bridgeWidth = 54;

  stickerContext.clearRect(0, 0, stickerCanvas.width, stickerCanvas.height);

  function drawLens(centerX) {
    stickerContext.save();
    stickerContext.fillStyle = "rgba(239, 71, 111, 0.52)";
    stickerContext.strokeStyle = "rgba(255, 255, 255, 0.88)";
    stickerContext.lineWidth = 8;
    stickerContext.beginPath();
    stickerContext.roundRect(centerX - lensWidth / 2, lensY - lensHeight / 2, lensWidth, lensHeight, 36);
    stickerContext.fill();
    stickerContext.stroke();

    stickerContext.fillStyle = "rgba(255, 255, 255, 0.16)";
    stickerContext.beginPath();
    stickerContext.roundRect(centerX - lensWidth / 2 + 16, lensY - lensHeight / 2 + 14, lensWidth * 0.42, 24, 12);
    stickerContext.fill();
    stickerContext.restore();
  }

  drawLens(leftLensX);
  drawLens(rightLensX);

  stickerContext.save();
  stickerContext.strokeStyle = "rgba(255, 255, 255, 0.92)";
  stickerContext.lineWidth = 10;
  stickerContext.lineCap = "round";
  stickerContext.beginPath();
  stickerContext.moveTo(leftLensX + lensWidth / 2 - 2, lensY);
  stickerContext.lineTo(rightLensX - lensWidth / 2 + 2, lensY);
  stickerContext.stroke();

  stickerContext.fillStyle = "rgba(255, 255, 255, 0.9)";
  stickerContext.beginPath();
  stickerContext.roundRect(
    stickerCanvas.width / 2 - bridgeWidth / 2,
    lensY - 10,
    bridgeWidth,
    20,
    10
  );
  stickerContext.fill();
  stickerContext.restore();

  function drawSparkle(x, y, scale, hue) {
    stickerContext.save();
    stickerContext.translate(x, y);
    stickerContext.scale(scale, scale);
    stickerContext.fillStyle = hue;
    stickerContext.beginPath();
    stickerContext.moveTo(0, -18);
    stickerContext.lineTo(8, -6);
    stickerContext.lineTo(20, 0);
    stickerContext.lineTo(8, 6);
    stickerContext.lineTo(0, 18);
    stickerContext.lineTo(-8, 6);
    stickerContext.lineTo(-20, 0);
    stickerContext.lineTo(-8, -6);
    stickerContext.closePath();
    stickerContext.fill();
    stickerContext.restore();
  }

  drawSparkle(64, 64, 1.3, "rgba(255, 183, 3, 0.92)");
  drawSparkle(456, 56, 1, "rgba(14, 165, 233, 0.92)");
  drawSparkle(420, 188, 0.9, "rgba(255, 255, 255, 0.86)");

  return imageFromDataUrl(stickerCanvas.toDataURL("image/png"));
}

export async function ensureEffectAssets(assets) {
  if (!assets.faceSticker) {
    assets.faceSticker = await createFaceStickerAsset();
  }
}
