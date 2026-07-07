import { FACE_LANDMARK_INDEX, SEGMENTATION_CATEGORY } from "./detectionConstants.js";
import { clamp, lerp } from "../core/math.js";

function topBlendshapeItems(faceResult, limit = 5) {
  if (!faceResult.faceBlendshapes?.length) {
    return [];
  }

  return [...faceResult.faceBlendshapes[0].categories]
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map((item) => ({
      name: item.categoryName,
      score: item.score,
    }));
}

function pointFromLandmark(landmark, mirror, width, height) {
  const x = landmark.x * width;
  return {
    x: mirror ? width - x : x,
    y: landmark.y * height,
  };
}

function landmarkPointAt(landmarks, index, mirror, width, height) {
  return pointFromLandmark(landmarks[index], mirror, width, height);
}

function averagePoints(points) {
  const total = points.reduce(
    (sum, point) => ({
      x: sum.x + point.x,
      y: sum.y + point.y,
    }),
    { x: 0, y: 0 }
  );

  return {
    x: total.x / Math.max(1, points.length),
    y: total.y / Math.max(1, points.length),
  };
}

function computeFaceBounds(landmarks, width, height, mirror) {
  let faceMinX = Number.POSITIVE_INFINITY;
  let faceMaxX = Number.NEGATIVE_INFINITY;
  let faceMinY = Number.POSITIVE_INFINITY;
  let faceMaxY = Number.NEGATIVE_INFINITY;

  landmarks.forEach((landmark) => {
    const point = pointFromLandmark(landmark, mirror, width, height);
    faceMinX = Math.min(faceMinX, point.x);
    faceMaxX = Math.max(faceMaxX, point.x);
    faceMinY = Math.min(faceMinY, point.y);
    faceMaxY = Math.max(faceMaxY, point.y);
  });

  const faceW = Math.max(1, faceMaxX - faceMinX);
  const faceH = Math.max(1, faceMaxY - faceMinY);
  const centerX = (faceMinX + faceMaxX) / 2;
  const centerY = (faceMinY + faceMaxY) / 2;

  return {
    faceMinX,
    faceMaxX,
    faceMinY,
    faceMaxY,
    faceW,
    faceH,
    centerX,
    centerY,
  };
}

function computeFaceAnchors(landmarks, width, height, mirror) {
  const leftEyeOuter = landmarkPointAt(landmarks, FACE_LANDMARK_INDEX.leftEyeOuter, mirror, width, height);
  const leftEyeInner = landmarkPointAt(landmarks, FACE_LANDMARK_INDEX.leftEyeInner, mirror, width, height);
  const rightEyeInner = landmarkPointAt(landmarks, FACE_LANDMARK_INDEX.rightEyeInner, mirror, width, height);
  const rightEyeOuter = landmarkPointAt(landmarks, FACE_LANDMARK_INDEX.rightEyeOuter, mirror, width, height);
  const noseTip = landmarkPointAt(landmarks, FACE_LANDMARK_INDEX.noseTip, mirror, width, height);
  const mouthUpper = landmarkPointAt(landmarks, FACE_LANDMARK_INDEX.mouthUpper, mirror, width, height);
  const mouthLower = landmarkPointAt(landmarks, FACE_LANDMARK_INDEX.mouthLower, mirror, width, height);

  const leftEyeCenter = averagePoints([leftEyeOuter, leftEyeInner]);
  const rightEyeCenter = averagePoints([rightEyeOuter, rightEyeInner]);
  const mouthCenter = averagePoints([mouthUpper, mouthLower]);

  return {
    leftEyeOuter,
    leftEyeInner,
    rightEyeInner,
    rightEyeOuter,
    leftEyeCenter,
    rightEyeCenter,
    noseTip,
    mouthUpper,
    mouthLower,
    mouthCenter,
  };
}

function computeSquareRoi(faceBounds, params) {
  const intensityBoost = lerp(0.96, 1.08, clamp(params.intensity / 1.3, 0, 1));
  const squareSize =
    Math.max(faceBounds.faceW, faceBounds.faceH) * (params.squareScale || 1.8) * intensityBoost;
  const squareX = faceBounds.centerX - squareSize / 2;
  const squareY = faceBounds.faceMinY - faceBounds.faceH * (params.topOffset || 0.35);

  return {
    squareSize,
    squareX,
    squareY,
    centerX: faceBounds.centerX,
    centerY: squareY + squareSize / 2,
  };
}

function clampSourceRect(x, y, width, height, frameWidth, frameHeight) {
  const clampedWidth = Math.min(width, frameWidth);
  const clampedHeight = Math.min(height, frameHeight);
  const clampedX = clamp(x, 0, frameWidth - clampedWidth);
  const clampedY = clamp(y, 0, frameHeight - clampedHeight);

  return {
    x: clampedX,
    y: clampedY,
    width: clampedWidth,
    height: clampedHeight,
  };
}

function computeSourceRect(faceBounds, squareRoi, params, frameWidth, frameHeight) {
  const intensityT = clamp((params.intensity || 0.8) / 1.3, 0, 1);
  const baseSourceW = faceBounds.faceW * lerp(1.06, 0.82, intensityT);
  const baseSourceH = faceBounds.faceH * lerp(1.18, 0.9, intensityT);

  const sourceTopBias = faceBounds.faceH * (0.18 + (params.topOffset || 0.35) * 0.55);
  const sourceBottomBias = faceBounds.faceH * 0.08;
  const sourceCenterY =
    (faceBounds.faceMinY - sourceTopBias + faceBounds.faceMaxY + sourceBottomBias) / 2;

  const sourceWidth = baseSourceW / Math.max(0.01, params.stretchX || 1.25);
  const sourceHeight =
    (baseSourceH + sourceTopBias + sourceBottomBias) / Math.max(0.01, params.stretchY || 0.9);

  const rawSourceX = faceBounds.centerX - sourceWidth / 2;
  const rawSourceY = sourceCenterY - sourceHeight / 2;
  const clampedRect = clampSourceRect(
    rawSourceX,
    rawSourceY,
    sourceWidth,
    sourceHeight,
    frameWidth,
    frameHeight
  );

  return {
    ...clampedRect,
    sourceCenterY,
    debugFillRateX: squareRoi.squareSize / Math.max(1, clampedRect.width),
    debugFillRateY: squareRoi.squareSize / Math.max(1, clampedRect.height),
  };
}

function buildTrackedFaces(faceLandmarks, sourceWidth, sourceHeight, mirror, params) {
  return faceLandmarks.map((landmarks) => {
    const bounds = computeFaceBounds(landmarks, sourceWidth, sourceHeight, mirror);
    const anchors = computeFaceAnchors(landmarks, sourceWidth, sourceHeight, mirror);
    const squareRoi = computeSquareRoi(bounds, params);
    const sourceRect = computeSourceRect(bounds, squareRoi, params, sourceWidth, sourceHeight);

    return {
      landmarks,
      bounds,
      anchors,
      squareRoi,
      sourceRect,
    };
  });
}

function categoryFromMaskValue(value) {
  return Math.round(value);
}

export function isHeadCategory(category) {
  return category === SEGMENTATION_CATEGORY.hair || category === SEGMENTATION_CATEGORY.faceSkin;
}

export function isPersonCategory(category) {
  return category !== SEGMENTATION_CATEGORY.background;
}

function createEmptyRowBounds(rowCount, frameWidth) {
  const minX = new Int32Array(rowCount);
  const maxX = new Int32Array(rowCount);
  minX.fill(frameWidth);
  maxX.fill(-1);
  return { minX, maxX };
}

function markRowBounds(rowBounds, rowIndex, x) {
  rowBounds.minX[rowIndex] = Math.min(rowBounds.minX[rowIndex], x);
  rowBounds.maxX[rowIndex] = Math.max(rowBounds.maxX[rowIndex], x);
}

export function rowHasMask(rowBounds, rowIndex) {
  return rowBounds.maxX[rowIndex] >= rowBounds.minX[rowIndex];
}

function readCategoryMaskData(categoryMask) {
  if (!categoryMask) {
    return null;
  }

  if (typeof categoryMask.getAsUint8Array === "function") {
    return categoryMask.getAsUint8Array();
  }

  if (typeof categoryMask.getAsFloat32Array === "function") {
    return categoryMask.getAsFloat32Array();
  }

  return null;
}

function createEmptySegmentationSnapshot() {
  return {
    enabled: false,
    masks: [],
    categoryMask: null,
    frameCategories: null,
    headMask: {
      valid: false,
      rowBounds: createEmptyRowBounds(0, 0),
      center: { x: 0, y: 0 },
      bounds: null,
      height: 0,
      representativeHalfWidth: 0,
      pixelCount: 0,
    },
    personMask: {
      valid: false,
      rowBounds: createEmptyRowBounds(0, 0),
      bounds: null,
      pixelCount: 0,
    },
  };
}

function buildSegmentationSnapshot(segmentationResult, frameWidth, frameHeight, mirror) {
  const categoryMask = segmentationResult?.categoryMask;
  const maskData = readCategoryMaskData(categoryMask);

  if (!categoryMask || !maskData || !frameWidth || !frameHeight) {
    return createEmptySegmentationSnapshot();
  }

  const maskWidth = categoryMask.width || frameWidth;
  const maskHeight = categoryMask.height || Math.max(1, Math.floor(maskData.length / maskWidth));
  const frameCategories = new Uint8Array(frameWidth * frameHeight);
  const headRows = createEmptyRowBounds(frameHeight, frameWidth);
  const personRows = createEmptyRowBounds(frameHeight, frameWidth);

  let headPixelCount = 0;
  let personPixelCount = 0;
  let headSumX = 0;
  let headSumY = 0;
  let headMinX = frameWidth;
  let headMaxX = -1;
  let headMinY = frameHeight;
  let headMaxY = -1;
  let personMinX = frameWidth;
  let personMaxX = -1;
  let personMinY = frameHeight;
  let personMaxY = -1;

  for (let y = 0; y < frameHeight; y += 1) {
    const maskY = clamp(Math.floor((y / frameHeight) * maskHeight), 0, maskHeight - 1);

    for (let x = 0; x < frameWidth; x += 1) {
      const sourceX = mirror ? frameWidth - 1 - x : x;
      const maskX = clamp(Math.floor((sourceX / frameWidth) * maskWidth), 0, maskWidth - 1);
      const category = categoryFromMaskValue(maskData[maskY * maskWidth + maskX]);
      const frameIndex = y * frameWidth + x;
      frameCategories[frameIndex] = category;

      if (isPersonCategory(category)) {
        markRowBounds(personRows, y, x);
        personPixelCount += 1;
        personMinX = Math.min(personMinX, x);
        personMaxX = Math.max(personMaxX, x);
        personMinY = Math.min(personMinY, y);
        personMaxY = Math.max(personMaxY, y);
      }

      if (isHeadCategory(category)) {
        markRowBounds(headRows, y, x);
        headPixelCount += 1;
        headSumX += x;
        headSumY += y;
        headMinX = Math.min(headMinX, x);
        headMaxX = Math.max(headMaxX, x);
        headMinY = Math.min(headMinY, y);
        headMaxY = Math.max(headMaxY, y);
      }
    }
  }

  const headCenter = headPixelCount
    ? {
        x: headSumX / headPixelCount,
        y: headSumY / headPixelCount,
      }
    : { x: 0, y: 0 };
  const headHeight = headPixelCount ? headMaxY - headMinY + 1 : 0;
  const representativeHalfWidth = headPixelCount
    ? Math.max(headCenter.x - headMinX, headMaxX - headCenter.x, 1)
    : 0;

  return {
    enabled: true,
    masks: [categoryMask],
    categoryMask: {
      width: maskWidth,
      height: maskHeight,
    },
    frameCategories,
    headMask: {
      valid: headPixelCount > 0,
      rowBounds: headRows,
      center: headCenter,
      bounds: headPixelCount
        ? {
            minX: headMinX,
            maxX: headMaxX,
            minY: headMinY,
            maxY: headMaxY,
          }
        : null,
      height: headHeight,
      representativeHalfWidth,
      pixelCount: headPixelCount,
    },
    personMask: {
      valid: personPixelCount > 0,
      rowBounds: personRows,
      bounds: personPixelCount
        ? {
            minX: personMinX,
            maxX: personMaxX,
            minY: personMinY,
            maxY: personMaxY,
          }
        : null,
      pixelCount: personPixelCount,
    },
  };
}

export function buildDetectionSnapshot(source, faceResult, segmentationResult, params, mirror) {
  const sourceWidth = source.videoWidth || source.naturalWidth || source.width;
  const sourceHeight = source.videoHeight || source.naturalHeight || source.height;
  const faceLandmarks = faceResult.faceLandmarks || [];
  const trackedFaces = buildTrackedFaces(faceLandmarks, sourceWidth, sourceHeight, mirror, params);
  const segmentation = buildSegmentationSnapshot(segmentationResult, sourceWidth, sourceHeight, mirror);

  return {
    sourceWidth,
    sourceHeight,
    face: {
      rawResult: faceResult,
      count: faceLandmarks.length,
      trackedFaces,
      blendshapeItems: topBlendshapeItems(faceResult),
    },
    hand: {
      count: 0,
      trackedHands: [],
    },
    pose: {
      count: 0,
      trackedPoses: [],
    },
    segmentation,
  };
}
