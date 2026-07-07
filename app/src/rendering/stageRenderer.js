export function createStageRenderer({ outputCanvas }) {
  const canvasContext = outputCanvas.getContext("2d");
  const frameBufferCanvas = document.createElement("canvas");
  const frameBufferContext = frameBufferCanvas.getContext("2d");
  const personLayerCanvas = document.createElement("canvas");
  const personLayerContext = personLayerCanvas.getContext("2d");

  function resize(width, height) {
    if (outputCanvas.width !== width || outputCanvas.height !== height) {
      outputCanvas.width = width;
      outputCanvas.height = height;
    }

    if (frameBufferCanvas.width !== width || frameBufferCanvas.height !== height) {
      frameBufferCanvas.width = width;
      frameBufferCanvas.height = height;
    }

    if (personLayerCanvas.width !== width || personLayerCanvas.height !== height) {
      personLayerCanvas.width = width;
      personLayerCanvas.height = height;
    }
  }

  function clearOutput() {
    canvasContext.clearRect(0, 0, outputCanvas.width, outputCanvas.height);
  }

  function drawBaseSource(source, mirror) {
    const { width, height } = outputCanvas;
    canvasContext.save();
    canvasContext.clearRect(0, 0, width, height);
    if (mirror) {
      canvasContext.translate(width, 0);
      canvasContext.scale(-1, 1);
    }
    canvasContext.drawImage(source, 0, 0, width, height);
    canvasContext.restore();

    frameBufferContext.clearRect(0, 0, width, height);
    frameBufferContext.drawImage(outputCanvas, 0, 0);
  }

  function drawRoiDebug(squareRoi, sourceRect) {
    const { squareX, squareY, squareSize } = squareRoi;

    canvasContext.save();
    canvasContext.lineWidth = 3;
    canvasContext.strokeStyle = "rgba(255, 80, 80, 0.95)";
    canvasContext.setLineDash([12, 8]);
    canvasContext.strokeRect(squareX, squareY, squareSize, squareSize);

    canvasContext.fillStyle = "rgba(255, 80, 80, 0.14)";
    canvasContext.fillRect(squareX, squareY, squareSize, squareSize);

    canvasContext.setLineDash([6, 6]);
    canvasContext.strokeStyle = "rgba(255, 255, 255, 0.9)";
    canvasContext.strokeRect(sourceRect.x, sourceRect.y, sourceRect.width, sourceRect.height);

    canvasContext.fillStyle = "rgba(12, 16, 20, 0.68)";
    canvasContext.beginPath();
    canvasContext.roundRect(squareX, Math.max(8, squareY - 44), 228, 34, 12);
    canvasContext.fill();
    canvasContext.fillStyle = "#ffffff";
    canvasContext.font = '600 13px "Segoe UI", "Yu Gothic UI", sans-serif';
    canvasContext.fillText(
      `fill x${sourceRect.debugFillRateX.toFixed(2)} / y${sourceRect.debugFillRateY.toFixed(2)}`,
      squareX + 12,
      Math.max(30, squareY - 22)
    );
    canvasContext.restore();
  }

  function drawLandmarkBadge(faceBounds, label) {
    const boxWidth = Math.max(164, faceBounds.faceW * 0.96);
    const boxHeight = 34;
    const x = Math.max(16, faceBounds.centerX - boxWidth / 2);
    const y = Math.max(16, faceBounds.faceMinY - faceBounds.faceH * 0.42);

    canvasContext.save();
    canvasContext.fillStyle = "rgba(13, 18, 21, 0.58)";
    canvasContext.strokeStyle = "rgba(255, 255, 255, 0.18)";
    canvasContext.beginPath();
    canvasContext.roundRect(x, y, boxWidth, boxHeight, 16);
    canvasContext.fill();
    canvasContext.stroke();
    canvasContext.fillStyle = "#f8fafc";
    canvasContext.font = '600 14px "Segoe UI", "Yu Gothic UI", sans-serif';
    canvasContext.fillText(label, x + 14, y + 22);
    canvasContext.restore();
  }

  function drawSegmentationDebug(headMask) {
    if (!headMask.valid || !headMask.bounds) {
      return;
    }

    canvasContext.save();
    canvasContext.lineWidth = 3;
    canvasContext.strokeStyle = "rgba(255, 80, 80, 0.95)";
    canvasContext.setLineDash([12, 8]);
    canvasContext.strokeRect(
      headMask.bounds.minX,
      headMask.bounds.minY,
      headMask.bounds.maxX - headMask.bounds.minX + 1,
      headMask.bounds.maxY - headMask.bounds.minY + 1
    );
    canvasContext.fillStyle = "rgba(255, 80, 80, 0.95)";
    canvasContext.beginPath();
    canvasContext.arc(headMask.center.x, headMask.center.y, 6, 0, Math.PI * 2);
    canvasContext.fill();
    canvasContext.restore();
  }

  function drawNoFaceOverlay() {
    canvasContext.save();
    canvasContext.fillStyle = "rgba(10, 10, 10, 0.55)";
    canvasContext.beginPath();
    canvasContext.roundRect(18, 18, 228, 42, 20);
    canvasContext.fill();
    canvasContext.fillStyle = "rgba(255,255,255,0.92)";
    canvasContext.font = '600 15px "Segoe UI", "Yu Gothic UI", sans-serif';
    canvasContext.fillText("Face not detected", 34, 45);
    canvasContext.restore();
  }

  function buildEffectContext({ source, params, mirror, assets, detections, helpers }) {
    return {
      source,
      params,
      mirror,
      ctx: canvasContext,
      frameBufferCanvas,
      frameBufferContext,
      personLayerCanvas,
      personLayerContext,
      assets,
      detections,
      helpers,
    };
  }

  return {
    buildEffectContext,
    clearOutput,
    drawBaseSource,
    drawLandmarkBadge,
    drawNoFaceOverlay,
    drawRoiDebug,
    drawSegmentationDebug,
    resize,
  };
}
