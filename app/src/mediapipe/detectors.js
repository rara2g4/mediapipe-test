import {
  FaceLandmarker,
  FilesetResolver,
  ImageSegmenter,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/vision_bundle.mjs";

import { FACE_MODEL_URL, SEGMENTATION_MODEL_URL, WASM_ROOT } from "../core/config.js";

export async function setDetectorRunningMode({ detectors, currentMode, mode }) {
  if (currentMode === mode) {
    return currentMode;
  }

  await detectors.face.setOptions({ runningMode: mode });
  if (detectors.segmentation) {
    await detectors.segmentation.setOptions({ runningMode: mode });
  }

  return mode;
}

export async function createFaceDetector({ setStatus }) {
  setStatus("FaceLandmarker 初期化中");
  const fileset = await FilesetResolver.forVisionTasks(WASM_ROOT);
  const options = {
    baseOptions: {
      modelAssetPath: FACE_MODEL_URL,
      delegate: "GPU",
    },
    outputFaceBlendshapes: true,
    outputFacialTransformationMatrixes: true,
    runningMode: "IMAGE",
    numFaces: 1,
  };

  try {
    return await FaceLandmarker.createFromOptions(fileset, options);
  } catch (gpuError) {
    return FaceLandmarker.createFromOptions(fileset, {
      ...options,
      baseOptions: {
        modelAssetPath: FACE_MODEL_URL,
      },
    });
  }
}

export async function createSegmentationDetector({ setStatus, logger = console }) {
  setStatus("ImageSegmenter 初期化中");
  try {
    const fileset = await FilesetResolver.forVisionTasks(WASM_ROOT);
    const options = {
      baseOptions: {
        modelAssetPath: SEGMENTATION_MODEL_URL,
      },
      outputCategoryMask: true,
      outputConfidenceMasks: false,
      runningMode: "IMAGE",
    };

    try {
      return await ImageSegmenter.createFromOptions(fileset, {
        ...options,
        baseOptions: {
          ...options.baseOptions,
          delegate: "GPU",
        },
      });
    } catch (gpuError) {
      return await ImageSegmenter.createFromOptions(fileset, options);
    }
  } catch (error) {
    logger.error(error);
    setStatus("Segmentation 初期化失敗");
    return null;
  }
}

export function segmentSource({ detector, runningMode, source, timestampMs = performance.now(), enabled, logger = console }) {
  return new Promise((resolve) => {
    if (!detector || !enabled) {
      resolve(null);
      return;
    }

    const callback = (result) => resolve(result);
    try {
      if (runningMode === "VIDEO") {
        detector.segmentForVideo(source, timestampMs, callback);
        return;
      }

      detector.segment(source, callback);
    } catch (error) {
      logger.error(error);
      resolve(null);
    }
  });
}
