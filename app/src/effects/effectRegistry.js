import { EFFECT_METADATA } from "./effectMetadata.js";
import { SEGMENTATION_CATEGORY } from "../mediapipe/detectionConstants.js";
import { isHeadCategory, isPersonCategory, rowHasMask } from "../mediapipe/detectionSnapshot.js";
import { clamp, lerp } from "../core/math.js";
import {
  crownEffect,
  laserEyesEffect,
  mustacheEffect,
  partyHatEffect,
  roundGlassesEffect,
} from "./accessoryEffects.js";

const FACE_OVAL_LANDMARKS = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148,
  176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109,
];
const LEFT_EYE_LANDMARKS = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246];
const RIGHT_EYE_LANDMARKS = [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398];
const LEFT_BROW_LANDMARKS = [70, 63, 105, 66, 107, 55, 65, 52, 53, 46];
const RIGHT_BROW_LANDMARKS = [336, 296, 334, 293, 300, 276, 283, 282, 295, 285];
const OUTER_LIP_LANDMARKS = [
  61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185,
];
const INNER_LIP_LANDMARKS = [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 415, 310, 311, 312, 13, 82, 81, 80, 191];
const NOSTRIL_LANDMARKS = [98, 327];
const SKIN_MASK_SCRATCH = {
  maskCanvas: null,
  maskContext: null,
  limitCanvas: null,
  limitContext: null,
  blurCanvas: null,
  blurContext: null,
};
const SPATIAL_WEIGHT_CACHE = new Map();

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

function roundedRectPath(ctx, x, y, width, height, radius) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + safeRadius, y);
  ctx.lineTo(x + width - safeRadius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  ctx.lineTo(x + width, y + height - safeRadius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  ctx.lineTo(x + safeRadius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  ctx.lineTo(x, y + safeRadius);
  ctx.quadraticCurveTo(x, y, x + safeRadius, y);
  ctx.closePath();
}

function drawSunglassesLens(ctx, x, y, width, height, radius) {
  roundedRectPath(ctx, x, y, width, height, radius);
  ctx.fill();
  ctx.stroke();
}

function sunglassesEffect(effectContext) {
  const sunglassesScale = effectContext.params.sunglassesScale || 1;
  const sunglassesOpacity = effectContext.params.sunglassesOpacity || 0.92;

  effectContext.detections.face.trackedFaces.forEach(({ bounds, anchors }) => {
    const leftEye = anchors.leftEyeCenter;
    const rightEye = anchors.rightEyeCenter;
    const eyeDistance = Math.hypot(rightEye.x - leftEye.x, rightEye.y - leftEye.y);
    const lensWidth = clamp(eyeDistance * 0.58 * sunglassesScale, 18, bounds.faceW * 0.46);
    const lensHeight = lensWidth * 0.58;
    const lensRadius = lensHeight * 0.28;
    const bridgeTopY = -lensHeight * 0.1;
    const centerX = (leftEye.x + rightEye.x) / 2;
    const centerY = (leftEye.y + rightEye.y) / 2 + bounds.faceH * 0.015;
    const angle = Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x);
    const leftLensX = -eyeDistance / 2 - lensWidth / 2;
    const rightLensX = eyeDistance / 2 - lensWidth / 2;
    const lensY = -lensHeight / 2;
    const lineWidth = Math.max(2, lensHeight * 0.08);

    effectContext.ctx.save();
    effectContext.ctx.translate(centerX, centerY);
    effectContext.ctx.rotate(angle);
    effectContext.ctx.globalAlpha = sunglassesOpacity;
    effectContext.ctx.fillStyle = "rgba(4, 8, 18, 0.94)";
    effectContext.ctx.strokeStyle = "rgba(255, 255, 255, 0.24)";
    effectContext.ctx.lineWidth = lineWidth;
    effectContext.ctx.shadowColor = "rgba(0, 0, 0, 0.34)";
    effectContext.ctx.shadowBlur = lensHeight * 0.18;
    effectContext.ctx.shadowOffsetY = lensHeight * 0.08;

    drawSunglassesLens(effectContext.ctx, leftLensX, lensY, lensWidth, lensHeight, lensRadius);
    drawSunglassesLens(effectContext.ctx, rightLensX, lensY, lensWidth, lensHeight, lensRadius);

    effectContext.ctx.shadowColor = "transparent";
    effectContext.ctx.strokeStyle = "rgba(4, 8, 18, 0.96)";
    effectContext.ctx.lineWidth = Math.max(3, lensHeight * 0.12);
    effectContext.ctx.beginPath();
    effectContext.ctx.moveTo(leftLensX + lensWidth * 0.9, bridgeTopY);
    effectContext.ctx.quadraticCurveTo(0, -lensHeight * 0.26, rightLensX + lensWidth * 0.1, bridgeTopY);
    effectContext.ctx.stroke();

    effectContext.ctx.globalAlpha = sunglassesOpacity * 0.28;
    effectContext.ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    roundedRectPath(effectContext.ctx, leftLensX + lensWidth * 0.16, lensY + lensHeight * 0.18, lensWidth * 0.36, lensHeight * 0.1, lensHeight * 0.05);
    effectContext.ctx.fill();
    roundedRectPath(effectContext.ctx, rightLensX + lensWidth * 0.16, lensY + lensHeight * 0.18, lensWidth * 0.36, lensHeight * 0.1, lensHeight * 0.05);
    effectContext.ctx.fill();
    effectContext.ctx.restore();
  });
}

function numericParam(params, key, fallback) {
  const value = Number(params[key]);
  return Number.isFinite(value) ? value : fallback;
}

function readSkinFilterParams(params) {
  return {
    smoothStrength: clamp(numericParam(params, "skinSmoothStrength", 0.35), 0, 1),
    brightness: clamp(numericParam(params, "skinBrightness", 0.04), 0, 0.2),
    rednessReduction: clamp(numericParam(params, "skinRednessReduction", 0.04), 0, 0.2),
    maskBlur: clamp(Math.round(numericParam(params, "skinMaskBlur", 21)), 0, 45),
    detailPreservation: clamp(numericParam(params, "skinDetailPreservation", 0.15), 0, 0.45),
  };
}

function ensureSkinMaskScratch(width, height) {
  if (!SKIN_MASK_SCRATCH.maskCanvas) {
    SKIN_MASK_SCRATCH.maskCanvas = document.createElement("canvas");
    SKIN_MASK_SCRATCH.maskContext = SKIN_MASK_SCRATCH.maskCanvas.getContext("2d", { willReadFrequently: true });
    SKIN_MASK_SCRATCH.limitCanvas = document.createElement("canvas");
    SKIN_MASK_SCRATCH.limitContext = SKIN_MASK_SCRATCH.limitCanvas.getContext("2d");
    SKIN_MASK_SCRATCH.blurCanvas = document.createElement("canvas");
    SKIN_MASK_SCRATCH.blurContext = SKIN_MASK_SCRATCH.blurCanvas.getContext("2d", { willReadFrequently: true });
  }

  for (const canvas of [SKIN_MASK_SCRATCH.maskCanvas, SKIN_MASK_SCRATCH.limitCanvas, SKIN_MASK_SCRATCH.blurCanvas]) {
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
  }

  return SKIN_MASK_SCRATCH;
}

function landmarkToPoint(landmarks, index, frameWidth, frameHeight, mirror, roi) {
  const landmark = landmarks[index];
  if (!landmark) {
    return null;
  }

  const sourceX = landmark.x * frameWidth;
  return {
    x: (mirror ? frameWidth - sourceX : sourceX) - roi.x,
    y: landmark.y * frameHeight - roi.y,
  };
}

function landmarkPoints(landmarks, indices, frameWidth, frameHeight, mirror, roi) {
  return indices
    .map((index) => landmarkToPoint(landmarks, index, frameWidth, frameHeight, mirror, roi))
    .filter(Boolean);
}

function polygonCenter(points) {
  const sum = points.reduce(
    (total, point) => ({
      x: total.x + point.x,
      y: total.y + point.y,
    }),
    { x: 0, y: 0 }
  );

  return {
    x: sum.x / Math.max(1, points.length),
    y: sum.y / Math.max(1, points.length),
  };
}

function expandedPolygon(points, scale) {
  const center = polygonCenter(points);
  return points.map((point) => ({
    x: center.x + (point.x - center.x) * scale,
    y: center.y + (point.y - center.y) * scale,
  }));
}

function fillPolygon(ctx, points) {
  if (points.length < 3) {
    return;
  }

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let index = 1; index < points.length; index += 1) {
    ctx.lineTo(points[index].x, points[index].y);
  }
  ctx.closePath();
  ctx.fill();
}

function drawExpandedLandmarkPolygon(ctx, face, indices, frameWidth, frameHeight, mirror, roi, scale) {
  const points = landmarkPoints(face.landmarks, indices, frameWidth, frameHeight, mirror, roi);
  fillPolygon(ctx, expandedPolygon(points, scale));
}

function drawFaceLimitMask(ctx, faces, frameWidth, frameHeight, mirror, roi) {
  ctx.fillStyle = "rgba(255, 255, 255, 1)";
  faces.forEach((face) => {
    drawExpandedLandmarkPolygon(ctx, face, FACE_OVAL_LANDMARKS, frameWidth, frameHeight, mirror, roi, 0.965);
  });
}

function drawFeatureExclusionMask(ctx, faces, frameWidth, frameHeight, mirror, roi) {
  ctx.globalCompositeOperation = "destination-out";
  ctx.fillStyle = "rgba(0, 0, 0, 1)";

  faces.forEach((face) => {
    drawExpandedLandmarkPolygon(ctx, face, LEFT_EYE_LANDMARKS, frameWidth, frameHeight, mirror, roi, 1.85);
    drawExpandedLandmarkPolygon(ctx, face, RIGHT_EYE_LANDMARKS, frameWidth, frameHeight, mirror, roi, 1.85);
    drawExpandedLandmarkPolygon(ctx, face, LEFT_BROW_LANDMARKS, frameWidth, frameHeight, mirror, roi, 1.7);
    drawExpandedLandmarkPolygon(ctx, face, RIGHT_BROW_LANDMARKS, frameWidth, frameHeight, mirror, roi, 1.7);
    drawExpandedLandmarkPolygon(ctx, face, OUTER_LIP_LANDMARKS, frameWidth, frameHeight, mirror, roi, 1.45);
    drawExpandedLandmarkPolygon(ctx, face, INNER_LIP_LANDMARKS, frameWidth, frameHeight, mirror, roi, 1.35);

    const eyeDistance = Math.hypot(
      face.anchors.rightEyeCenter.x - face.anchors.leftEyeCenter.x,
      face.anchors.rightEyeCenter.y - face.anchors.leftEyeCenter.y
    );
    const nostrilRadius = clamp(eyeDistance * 0.055, 3, face.bounds.faceW * 0.048);
    NOSTRIL_LANDMARKS.forEach((index) => {
      const point = landmarkToPoint(face.landmarks, index, frameWidth, frameHeight, mirror, roi);
      if (!point) {
        return;
      }

      ctx.beginPath();
      ctx.arc(point.x, point.y, nostrilRadius, 0, Math.PI * 2);
      ctx.fill();
    });
  });

  ctx.globalCompositeOperation = "source-over";
}

function skinFilterRoi(faces, frameWidth, frameHeight, maskBlur) {
  let minX = frameWidth;
  let minY = frameHeight;
  let maxX = -1;
  let maxY = -1;

  faces.forEach(({ bounds }) => {
    const padX = bounds.faceW * 0.18 + maskBlur;
    const padTop = bounds.faceH * 0.22 + maskBlur;
    const padBottom = bounds.faceH * 0.12 + maskBlur;
    minX = Math.min(minX, Math.floor(bounds.faceMinX - padX));
    maxX = Math.max(maxX, Math.ceil(bounds.faceMaxX + padX));
    minY = Math.min(minY, Math.floor(bounds.faceMinY - padTop));
    maxY = Math.max(maxY, Math.ceil(bounds.faceMaxY + padBottom));
  });

  const x = clamp(minX, 0, frameWidth - 1);
  const y = clamp(minY, 0, frameHeight - 1);
  const right = clamp(maxX, 0, frameWidth - 1);
  const bottom = clamp(maxY, 0, frameHeight - 1);
  return {
    x,
    y,
    width: Math.max(0, right - x + 1),
    height: Math.max(0, bottom - y + 1),
  };
}

function drawSegmentationSkinBase(maskContext, segmentation, roi) {
  const image = maskContext.createImageData(roi.width, roi.height);
  const data = image.data;
  let skinPixels = 0;

  for (let localY = 0; localY < roi.height; localY += 1) {
    const frameY = roi.y + localY;
    for (let localX = 0; localX < roi.width; localX += 1) {
      const frameX = roi.x + localX;
      const category = segmentation.frameCategories[frameY * segmentation.frameWidth + frameX];
      if (category !== SEGMENTATION_CATEGORY.faceSkin) {
        continue;
      }

      const targetIndex = (localY * roi.width + localX) * 4;
      data[targetIndex] = 255;
      data[targetIndex + 1] = 255;
      data[targetIndex + 2] = 255;
      data[targetIndex + 3] = 255;
      skinPixels += 1;
    }
  }

  maskContext.putImageData(image, 0, 0);
  return skinPixels;
}

function buildSkinAlphaMask(effectContext, faces, frameWidth, frameHeight, params) {
  const roi = skinFilterRoi(faces, frameWidth, frameHeight, params.maskBlur);
  if (!roi.width || !roi.height) {
    return null;
  }

  const { maskCanvas, maskContext, limitCanvas, limitContext, blurCanvas, blurContext } = ensureSkinMaskScratch(
    roi.width,
    roi.height
  );
  maskContext.clearRect(0, 0, roi.width, roi.height);
  limitContext.clearRect(0, 0, roi.width, roi.height);
  blurContext.clearRect(0, 0, roi.width, roi.height);

  const segmentation = {
    ...effectContext.detections.segmentation,
    frameWidth,
  };
  const canUseSegmentation =
    segmentation.enabled && segmentation.frameCategories && segmentation.frameCategories.length >= frameWidth * frameHeight;

  if (canUseSegmentation) {
    drawSegmentationSkinBase(maskContext, segmentation, roi);
    drawFaceLimitMask(limitContext, faces, frameWidth, frameHeight, effectContext.mirror, roi);
    maskContext.globalCompositeOperation = "destination-in";
    maskContext.drawImage(limitCanvas, 0, 0);
    maskContext.globalCompositeOperation = "source-over";
  } else {
    drawFaceLimitMask(maskContext, faces, frameWidth, frameHeight, effectContext.mirror, roi);
  }

  drawFeatureExclusionMask(maskContext, faces, frameWidth, frameHeight, effectContext.mirror, roi);

  if (params.maskBlur > 0 && "filter" in blurContext) {
    blurContext.filter = `blur(${params.maskBlur}px)`;
    blurContext.drawImage(maskCanvas, 0, 0);
    blurContext.filter = "none";
  } else {
    blurContext.drawImage(maskCanvas, 0, 0);
  }

  const maskData = blurContext.getImageData(0, 0, roi.width, roi.height).data;
  const alpha = new Float32Array(roi.width * roi.height);
  let alphaSum = 0;

  for (let index = 0; index < alpha.length; index += 1) {
    const value = maskData[index * 4 + 3] / 255;
    alpha[index] = value;
    alphaSum += value;
  }

  if (alphaSum < 8) {
    return null;
  }

  return {
    alpha,
    roi,
  };
}

function spatialWeightsForRadius(radius) {
  if (SPATIAL_WEIGHT_CACHE.has(radius)) {
    return SPATIAL_WEIGHT_CACHE.get(radius);
  }

  const sigma = Math.max(1, radius * 0.72);
  const weights = [];
  for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
    for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
      weights.push({
        offsetX,
        offsetY,
        weight: Math.exp(-(offsetX * offsetX + offsetY * offsetY) / (2 * sigma * sigma)),
      });
    }
  }

  SPATIAL_WEIGHT_CACHE.set(radius, weights);
  return weights;
}

function bilateralSmoothRoi(sourceData, width, height, alpha, smoothStrength) {
  const radius = smoothStrength > 0.62 ? 3 : 2;
  const spatialWeights = spatialWeightsForRadius(radius);
  const sigmaColor = 18 + smoothStrength * 30;
  const colorDenominator = 2 * sigmaColor * sigmaColor;
  const smoothed = new Float32Array(width * height * 3);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixelIndex = y * width + x;
      const sourceIndex = pixelIndex * 4;

      if (alpha[pixelIndex] <= 0.006) {
        smoothed[pixelIndex * 3] = sourceData[sourceIndex];
        smoothed[pixelIndex * 3 + 1] = sourceData[sourceIndex + 1];
        smoothed[pixelIndex * 3 + 2] = sourceData[sourceIndex + 2];
        continue;
      }

      const centerR = sourceData[sourceIndex];
      const centerG = sourceData[sourceIndex + 1];
      const centerB = sourceData[sourceIndex + 2];
      let totalR = 0;
      let totalG = 0;
      let totalB = 0;
      let totalWeight = 0;

      spatialWeights.forEach(({ offsetX, offsetY, weight }) => {
        const sampleX = x + offsetX;
        const sampleY = y + offsetY;
        if (sampleX < 0 || sampleX >= width || sampleY < 0 || sampleY >= height) {
          return;
        }

        const samplePixelIndex = sampleY * width + sampleX;
        if (alpha[samplePixelIndex] <= 0.04) {
          return;
        }

        const sampleIndex = samplePixelIndex * 4;
        const diffR = sourceData[sampleIndex] - centerR;
        const diffG = sourceData[sampleIndex + 1] - centerG;
        const diffB = sourceData[sampleIndex + 2] - centerB;
        const colorWeight = Math.exp(-(diffR * diffR + diffG * diffG + diffB * diffB) / colorDenominator);
        const finalWeight = weight * colorWeight;
        totalR += sourceData[sampleIndex] * finalWeight;
        totalG += sourceData[sampleIndex + 1] * finalWeight;
        totalB += sourceData[sampleIndex + 2] * finalWeight;
        totalWeight += finalWeight;
      });

      const targetIndex = pixelIndex * 3;
      smoothed[targetIndex] = totalWeight ? totalR / totalWeight : centerR;
      smoothed[targetIndex + 1] = totalWeight ? totalG / totalWeight : centerG;
      smoothed[targetIndex + 2] = totalWeight ? totalB / totalWeight : centerB;
    }
  }

  return smoothed;
}

function srgbToLinear(value) {
  const normalized = value / 255;
  return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(value) {
  const clampedValue = clamp(value, 0, 1);
  const normalized = clampedValue <= 0.0031308 ? clampedValue * 12.92 : 1.055 * clampedValue ** (1 / 2.4) - 0.055;
  return clamp(Math.round(normalized * 255), 0, 255);
}

function labPivot(value) {
  return value > 0.008856 ? Math.cbrt(value) : 7.787 * value + 16 / 116;
}

function inverseLabPivot(value) {
  const cubed = value ** 3;
  return cubed > 0.008856 ? cubed : (value - 16 / 116) / 7.787;
}

function rgbToLab(r, g, b) {
  const linearR = srgbToLinear(r);
  const linearG = srgbToLinear(g);
  const linearB = srgbToLinear(b);
  const x = (linearR * 0.4124564 + linearG * 0.3575761 + linearB * 0.1804375) / 0.95047;
  const y = linearR * 0.2126729 + linearG * 0.7151522 + linearB * 0.072175;
  const z = (linearR * 0.0193339 + linearG * 0.119192 + linearB * 0.9503041) / 1.08883;
  const fx = labPivot(x);
  const fy = labPivot(y);
  const fz = labPivot(z);

  return {
    l: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  };
}

function labToRgb(l, a, b) {
  const fy = (l + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;
  const x = 0.95047 * inverseLabPivot(fx);
  const y = inverseLabPivot(fy);
  const z = 1.08883 * inverseLabPivot(fz);
  const linearR = x * 3.2404542 + y * -1.5371385 + z * -0.4985314;
  const linearG = x * -0.969266 + y * 1.8760108 + z * 0.041556;
  const linearB = x * 0.0556434 + y * -0.2040259 + z * 1.0572252;

  return {
    r: linearToSrgb(linearR),
    g: linearToSrgb(linearG),
    b: linearToSrgb(linearB),
  };
}

function adjustSkinToneLab(r, g, b, brightness, rednessReduction) {
  const lab = rgbToLab(r, g, b);
  lab.l = clamp(lab.l + brightness * 50, 0, 100);
  if (lab.a > 0) {
    lab.a *= 1 - clamp(rednessReduction * 2.4, 0, 0.55);
  }
  return labToRgb(lab.l, lab.a, lab.b);
}

function applySkinFilterToRoi(imageData, alpha, params) {
  const { width, height, data } = imageData;
  const needsSmoothing = params.smoothStrength > 0.001;
  const smoothed = needsSmoothing ? bilateralSmoothRoi(data, width, height, alpha, params.smoothStrength) : null;
  const detailPreservation = needsSmoothing ? params.detailPreservation : 0;

  for (let pixelIndex = 0; pixelIndex < alpha.length; pixelIndex += 1) {
    const maskAlpha = alpha[pixelIndex];
    if (maskAlpha <= 0.006) {
      continue;
    }

    const sourceIndex = pixelIndex * 4;
    const smoothIndex = pixelIndex * 3;
    const originalR = data[sourceIndex];
    const originalG = data[sourceIndex + 1];
    const originalB = data[sourceIndex + 2];
    const smoothR = smoothed ? smoothed[smoothIndex] : originalR;
    const smoothG = smoothed ? smoothed[smoothIndex + 1] : originalG;
    const smoothB = smoothed ? smoothed[smoothIndex + 2] : originalB;
    const detailLimit = 18;
    const softenedR =
      originalR * (1 - params.smoothStrength) +
      smoothR * params.smoothStrength +
      clamp(originalR - smoothR, -detailLimit, detailLimit) * detailPreservation;
    const softenedG =
      originalG * (1 - params.smoothStrength) +
      smoothG * params.smoothStrength +
      clamp(originalG - smoothG, -detailLimit, detailLimit) * detailPreservation;
    const softenedB =
      originalB * (1 - params.smoothStrength) +
      smoothB * params.smoothStrength +
      clamp(originalB - smoothB, -detailLimit, detailLimit) * detailPreservation;
    const adjusted = adjustSkinToneLab(
      clamp(softenedR, 0, 255),
      clamp(softenedG, 0, 255),
      clamp(softenedB, 0, 255),
      params.brightness,
      params.rednessReduction
    );

    data[sourceIndex] = clamp(Math.round(originalR * (1 - maskAlpha) + adjusted.r * maskAlpha), 0, 255);
    data[sourceIndex + 1] = clamp(Math.round(originalG * (1 - maskAlpha) + adjusted.g * maskAlpha), 0, 255);
    data[sourceIndex + 2] = clamp(Math.round(originalB * (1 - maskAlpha) + adjusted.b * maskAlpha), 0, 255);
  }
}

function skinSofteningEffect(effectContext) {
  const faces = effectContext.detections.face.trackedFaces;
  if (!faces.length) {
    return;
  }

  const params = readSkinFilterParams(effectContext.params);
  if (
    params.smoothStrength <= 0 &&
    params.brightness <= 0 &&
    params.rednessReduction <= 0
  ) {
    return;
  }

  const frameWidth = effectContext.frameBufferCanvas.width;
  const frameHeight = effectContext.frameBufferCanvas.height;
  const maskInfo = buildSkinAlphaMask(effectContext, faces, frameWidth, frameHeight, params);
  if (!maskInfo) {
    return;
  }

  const { roi, alpha } = maskInfo;
  const roiImage = effectContext.frameBufferContext.getImageData(roi.x, roi.y, roi.width, roi.height);
  applySkinFilterToRoi(roiImage, alpha, params);
  effectContext.ctx.putImageData(roiImage, roi.x, roi.y);
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
    id: "sunglasses",
    requiredDetections: ["face"],
    run: sunglassesEffect,
  }),
  createEffect({
    id: "roundGlasses",
    requiredDetections: ["face"],
    run: roundGlassesEffect,
  }),
  createEffect({
    id: "mustache",
    requiredDetections: ["face"],
    run: mustacheEffect,
  }),
  createEffect({
    id: "crown",
    requiredDetections: ["face"],
    run: crownEffect,
  }),
  createEffect({
    id: "partyHat",
    requiredDetections: ["face"],
    run: partyHatEffect,
  }),
  createEffect({
    id: "laserEyes",
    requiredDetections: ["face"],
    run: laserEyesEffect,
  }),
  createEffect({
    id: "skinSoftening",
    requiredDetections: ["face", "segmentation"],
    run: skinSofteningEffect,
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
