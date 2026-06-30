import { EFFECT_METADATA } from "./effectMetadata.js";
import { isHeadCategory, isPersonCategory, rowHasMask } from "../mediapipe/detectionSnapshot.js";
import { clamp, lerp } from "../core/math.js";

function createEffect({ id, requiredDetections, run }) {
  return {
    id,
    requiredDetections,
    ...EFFECT_METADATA[id],
    run,
  };
}

function faceStickerEffect(effectContext) {
  const stickerImage = effectContext.assets.faceSticker;
  const stickerScale = effectContext.params.stickerScale || 1.25;
  const stickerYOffset = effectContext.params.stickerYOffset || -0.04;
  const stickerOpacity = effectContext.params.stickerOpacity || 0.92;

  effectContext.detections.face.trackedFaces.forEach(({ bounds, anchors }) => {
    const eyeDistance = Math.hypot(
      anchors.rightEyeCenter.x - anchors.leftEyeCenter.x,
      anchors.rightEyeCenter.y - anchors.leftEyeCenter.y
    );
    const drawWidth = Math.max(bounds.faceW * stickerScale, eyeDistance * 2.6);
    const drawHeight = drawWidth * (stickerImage.height / stickerImage.width);
    const centerX = (anchors.leftEyeCenter.x + anchors.rightEyeCenter.x) / 2;
    const centerY = (anchors.leftEyeCenter.y + anchors.rightEyeCenter.y) / 2 + bounds.faceH * stickerYOffset;

    effectContext.ctx.save();
    effectContext.ctx.globalAlpha = stickerOpacity;
    effectContext.ctx.drawImage(
      stickerImage,
      centerX - drawWidth / 2,
      centerY - drawHeight / 2,
      drawWidth,
      drawHeight
    );
    effectContext.ctx.restore();
  });
}

function clownNoseEffect(effectContext) {
  const noseScale = effectContext.params.clownNoseScale || 1;
  const noseOpacity = effectContext.params.clownNoseOpacity || 0.96;

  effectContext.detections.face.trackedFaces.forEach(({ bounds, anchors }) => {
    const radius = clamp(bounds.faceW * 0.11 * noseScale, 8, Math.max(18, bounds.faceW * 0.18));
    const centerX = anchors.noseTip.x;
    const centerY = anchors.noseTip.y + bounds.faceH * 0.015;
    const highlightRadius = Math.max(2, radius * 0.22);

    effectContext.ctx.save();
    effectContext.ctx.globalAlpha = noseOpacity;
    effectContext.ctx.shadowColor = "rgba(80, 0, 0, 0.35)";
    effectContext.ctx.shadowBlur = radius * 0.45;
    effectContext.ctx.shadowOffsetY = radius * 0.16;

    const noseGradient = effectContext.ctx.createRadialGradient(
      centerX - radius * 0.35,
      centerY - radius * 0.38,
      radius * 0.1,
      centerX,
      centerY,
      radius
    );
    noseGradient.addColorStop(0, "#ff8c92");
    noseGradient.addColorStop(0.45, "#ef233c");
    noseGradient.addColorStop(1, "#9f1239");

    effectContext.ctx.fillStyle = noseGradient;
    effectContext.ctx.beginPath();
    effectContext.ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    effectContext.ctx.fill();

    effectContext.ctx.shadowColor = "transparent";
    effectContext.ctx.fillStyle = "rgba(255, 255, 255, 0.68)";
    effectContext.ctx.beginPath();
    effectContext.ctx.ellipse(
      centerX - radius * 0.34,
      centerY - radius * 0.38,
      highlightRadius * 1.25,
      highlightRadius,
      -0.45,
      0,
      Math.PI * 2
    );
    effectContext.ctx.fill();
    effectContext.ctx.restore();
  });
}

function fallbackSquareHeadEffect(effectContext) {
  effectContext.detections.face.trackedFaces.forEach(({ squareRoi, sourceRect }) => {
    effectContext.ctx.drawImage(
      effectContext.frameBufferCanvas,
      sourceRect.x,
      sourceRect.y,
      sourceRect.width,
      sourceRect.height,
      squareRoi.squareX,
      squareRoi.squareY,
      squareRoi.squareSize,
      squareRoi.squareSize
    );
  });
}

function copyPixel(sourceData, targetData, sourceIndex, targetIndex) {
  targetData[targetIndex] = sourceData[sourceIndex];
  targetData[targetIndex + 1] = sourceData[sourceIndex + 1];
  targetData[targetIndex + 2] = sourceData[sourceIndex + 2];
  targetData[targetIndex + 3] = sourceData[sourceIndex + 3];
}

function copyNearestPixel(sourceData, targetData, frameWidth, frameHeight, sourceX, sourceY, targetIndex) {
  const clampedX = clamp(Math.round(sourceX), 0, frameWidth - 1);
  const clampedY = clamp(Math.round(sourceY), 0, frameHeight - 1);
  const sourceIndex = (clampedY * frameWidth + clampedX) * 4;
  copyPixel(sourceData, targetData, sourceIndex, targetIndex);
}

function targetHeadHalfWidth(headMask, rowBounds, rowIndex, params) {
  const centerX = headMask.center.x;
  const originalHalfWidth = Math.max(centerX - rowBounds.minX[rowIndex], rowBounds.maxX[rowIndex] - centerX, 1);
  const intensity = clamp((params.intensity || 0.8) / 1.3, 0, 1);
  const squareScale = clamp((params.squareScale || 1.8) * 0.66, 0.7, 1.6);
  const stretchX = clamp((params.stretchX || 1.25) / 1.25, 0.65, 1.6);
  const squareHalfWidth = Math.max(
    headMask.height * 0.5 * squareScale * stretchX,
    headMask.representativeHalfWidth
  );
  return Math.max(originalHalfWidth, lerp(originalHalfWidth, squareHalfWidth, intensity));
}

function targetTriangleHeadHalfWidth(headMask, rowBounds, rowIndex, params) {
  const centerX = headMask.center.x;
  const originalHalfWidth = Math.max(centerX - rowBounds.minX[rowIndex], rowBounds.maxX[rowIndex] - centerX, 1);
  const intensity = clamp((params.intensity || 0.8) / 1.3, 0, 1);
  const stretchX = clamp((params.stretchX || 1.25) / 1.25, 0.65, 1.6);
  const verticalT = clamp(
    (rowIndex - headMask.bounds.minY) / Math.max(1, headMask.bounds.maxY - headMask.bounds.minY),
    0,
    1
  );
  const topHalfWidth = Math.max(headMask.height * 0.52 * stretchX, headMask.representativeHalfWidth);
  const bottomHalfWidth = Math.max(headMask.representativeHalfWidth * 0.16, headMask.height * 0.08);
  const triangleHalfWidth = lerp(topHalfWidth, bottomHalfWidth, verticalT);
  return Math.max(1, lerp(originalHalfWidth, triangleHalfWidth, intensity));
}

function backgroundColorAroundHead(sourceData, frameWidth, frameHeight, segmentation) {
  const { headMask, frameCategories } = segmentation;
  const padding = Math.max(12, Math.round(headMask.height * 0.16));
  const minX = clamp(headMask.bounds.minX - padding, 0, frameWidth - 1);
  const maxX = clamp(headMask.bounds.maxX + padding, 0, frameWidth - 1);
  const minY = clamp(headMask.bounds.minY - padding, 0, frameHeight - 1);
  const maxY = clamp(headMask.bounds.maxY + padding, 0, frameHeight - 1);
  let totalR = 0;
  let totalG = 0;
  let totalB = 0;
  let count = 0;

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const category = frameCategories[y * frameWidth + x];
      if (isPersonCategory(category)) {
        continue;
      }

      const pixelIndex = (y * frameWidth + x) * 4;
      totalR += sourceData[pixelIndex];
      totalG += sourceData[pixelIndex + 1];
      totalB += sourceData[pixelIndex + 2];
      count += 1;
    }
  }

  if (!count) {
    return "rgba(20, 26, 24, 1)";
  }

  return `rgb(${Math.round(totalR / count)}, ${Math.round(totalG / count)}, ${Math.round(totalB / count)})`;
}

function coverOriginalHeadArea(ctx, segmentation, frameWidth, frameHeight, fillStyle) {
  const { headMask } = segmentation;
  ctx.save();
  ctx.fillStyle = fillStyle;

  for (let y = headMask.bounds.minY; y <= headMask.bounds.maxY; y += 1) {
    if (!rowHasMask(headMask.rowBounds, y)) {
      continue;
    }

    const width = headMask.rowBounds.maxX[y] - headMask.rowBounds.minX[y] + 1;
    ctx.fillRect(clamp(headMask.rowBounds.minX[y], 0, frameWidth - 1), clamp(y, 0, frameHeight - 1), width, 1);
  }

  ctx.restore();
}

function createPersonLayerWithoutHead(sourceData, frameWidth, frameHeight, segmentation) {
  const personImage = new ImageData(frameWidth, frameHeight);
  const personData = personImage.data;
  const { frameCategories, headMask, personMask } = segmentation;

  for (let y = 0; y < frameHeight; y += 1) {
    if (!rowHasMask(personMask.rowBounds, y)) {
      continue;
    }

    for (let x = personMask.rowBounds.minX[y]; x <= personMask.rowBounds.maxX[y]; x += 1) {
      const category = frameCategories[y * frameWidth + x];
      if (!isPersonCategory(category) || isHeadCategory(category)) {
        continue;
      }

      const pixelIndex = (y * frameWidth + x) * 4;
      copyPixel(sourceData, personData, pixelIndex, pixelIndex);
    }
  }

  return {
    personImage,
    personData,
    headMask,
  };
}

function drawWarpedHeadRows(sourceData, personData, frameWidth, frameHeight, headMask, params, targetHalfWidthForRow) {
  for (let y = headMask.bounds.minY; y <= headMask.bounds.maxY; y += 1) {
    if (!rowHasMask(headMask.rowBounds, y)) {
      continue;
    }

    const targetHalfWidth = targetHalfWidthForRow(headMask, headMask.rowBounds, y, params);
    const targetMinX = clamp(Math.floor(headMask.center.x - targetHalfWidth), 0, frameWidth - 1);
    const targetMaxX = clamp(Math.ceil(headMask.center.x + targetHalfWidth), 0, frameWidth - 1);
    const sourceHalfWidth = Math.max(
      headMask.center.x - headMask.rowBounds.minX[y],
      headMask.rowBounds.maxX[y] - headMask.center.x,
      1
    );

    for (let x = targetMinX; x <= targetMaxX; x += 1) {
      const normalizedX = (x - headMask.center.x) / Math.max(1, targetHalfWidth);
      const sampleX = headMask.center.x + normalizedX * sourceHalfWidth;
      const targetIndex = (y * frameWidth + x) * 4;
      copyNearestPixel(sourceData, personData, frameWidth, frameHeight, sampleX, y, targetIndex);
    }
  }
}

function squareHeadEffect(effectContext) {
  const { detections, params } = effectContext;
  const { segmentation } = detections;

  if (!segmentation.enabled || !segmentation.headMask.valid || !segmentation.personMask.valid) {
    fallbackSquareHeadEffect(effectContext);
    return;
  }

  const frameWidth = effectContext.frameBufferCanvas.width;
  const frameHeight = effectContext.frameBufferCanvas.height;
  const sourceImage = effectContext.frameBufferContext.getImageData(0, 0, frameWidth, frameHeight);
  const sourceData = sourceImage.data;
  const { personImage, personData, headMask } = createPersonLayerWithoutHead(
    sourceData,
    frameWidth,
    frameHeight,
    segmentation
  );

  drawWarpedHeadRows(sourceData, personData, frameWidth, frameHeight, headMask, params, targetHeadHalfWidth);

  effectContext.personLayerContext.clearRect(0, 0, frameWidth, frameHeight);
  effectContext.personLayerContext.putImageData(personImage, 0, 0);
  effectContext.ctx.drawImage(effectContext.personLayerCanvas, 0, 0);
}

function triangleHeadEffect(effectContext) {
  const { detections, params } = effectContext;
  const { segmentation } = detections;

  if (!segmentation.enabled || !segmentation.headMask.valid || !segmentation.personMask.valid) {
    fallbackSquareHeadEffect(effectContext);
    return;
  }

  const frameWidth = effectContext.frameBufferCanvas.width;
  const frameHeight = effectContext.frameBufferCanvas.height;
  const sourceImage = effectContext.frameBufferContext.getImageData(0, 0, frameWidth, frameHeight);
  const sourceData = sourceImage.data;
  const backgroundFill = backgroundColorAroundHead(sourceData, frameWidth, frameHeight, segmentation);
  const { personImage, personData, headMask } = createPersonLayerWithoutHead(
    sourceData,
    frameWidth,
    frameHeight,
    segmentation
  );

  coverOriginalHeadArea(effectContext.ctx, segmentation, frameWidth, frameHeight, backgroundFill);
  drawWarpedHeadRows(sourceData, personData, frameWidth, frameHeight, headMask, params, targetTriangleHeadHalfWidth);

  effectContext.personLayerContext.clearRect(0, 0, frameWidth, frameHeight);
  effectContext.personLayerContext.putImageData(personImage, 0, 0);
  effectContext.ctx.drawImage(effectContext.personLayerCanvas, 0, 0);
}

export const effects = [
  createEffect({
    id: "faceSticker",
    requiredDetections: ["face"],
    run: faceStickerEffect,
  }),
  createEffect({
    id: "clownNose",
    requiredDetections: ["face"],
    run: clownNoseEffect,
  }),
  createEffect({
    id: "squareHead",
    requiredDetections: ["face", "segmentation"],
    run: squareHeadEffect,
  }),
  createEffect({
    id: "triangleHead",
    requiredDetections: ["face", "segmentation"],
    run: triangleHeadEffect,
  }),
];

const effectMap = new Map(effects.map((effect) => [effect.id, effect]));

export function getEffectById(effectId) {
  return effectMap.get(effectId) || effects[0];
}
