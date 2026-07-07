import { BLENDSHAPE_COLORS } from "./core/config.js";
import { createCaptureFeedback } from "./capture/captureFeedback.js";
import { collectDomRefs, collectEffectControls, setListMessage } from "./ui/dom.js";
import { ensureEffectAssets } from "./effects/effectAssets.js";
import { renderEffectCatalog } from "./effects/effectCatalogView.js";
import { getEffectById } from "./effects/effectRegistry.js";
import { EFFECT_METADATA } from "./effects/effectMetadata.js";
import { createTemporaryGalleryController } from "./gallery/galleryController.js";
import { createCameraInputController } from "./input/cameraInput.js";
import { createImageUploadController } from "./input/imageInput.js";
import { bindPageLifecycleCleanup } from "./core/pageCleanup.js";
import { createMediaPipeRuntime } from "./mediapipe/mediaPipeRuntime.js";
import { buildDetectionSnapshot } from "./mediapipe/detectionSnapshot.js";
import { createBlendshapeView } from "./rendering/blendshapeView.js";
import { createStageRenderer } from "./rendering/stageRenderer.js";
import { createInitialState, createStateActions } from "./core/appState.js";
import { bindUiEvents } from "./ui/events.js";
import { clamp, lerp } from "./core/math.js";

const state = createInitialState();
const stateActions = createStateActions(state);
const elements = collectDomRefs();
renderEffectCatalog({
  effectMetadata: EFFECT_METADATA,
  railElement: elements.effectRail,
  selectElement: elements.activeEffectSelect,
  categoryTabsElement: elements.effectCategoryTabs,
  searchInput: elements.effectSearchInput,
});
const { effectControlElements, effectPanelElements, effectChoiceElements } = collectEffectControls();
const mediaPipeRuntime = createMediaPipeRuntime();

const stageFrameElement = elements.outputCanvas.closest(".stage-frame");
const stageRenderer = createStageRenderer({
  outputCanvas: elements.outputCanvas,
});
const captureFeedback = createCaptureFeedback({
  state,
  stateActions,
  elements,
  stageFrameElement,
});
const galleryController = createTemporaryGalleryController({
  state,
  stateActions,
  elements,
  captureFeedback,
  setStatus,
});
const blendshapeView = createBlendshapeView({
  chartCanvas: elements.blendshapeChart,
  listElement: elements.blendshapeList,
  colors: BLENDSHAPE_COLORS,
});

// ---------------------------------------------------------------------------
// 基本 UI ヘルパー
// 画面文言の更新や、共通的な数値補助だけを置く。
// 「見た目の更新」と「推論 / 描画そのもの」を分けて追えるようにするための層。
// ---------------------------------------------------------------------------

function setStatus(message) {
  elements.statusLabel.textContent = message;
}

function setSourceModeLabel(label) {
  elements.sourceModeLabel.textContent = label;
}

function setTrackingEffectLabel(label) {
  elements.trackingEffectLabel.textContent = label;
}

function setCameraStartEnabled(isEnabled) {
  elements.startCameraButton.disabled = !isEnabled;
}

function setAppScreen(screen) {
  // ここが画面遷移の根幹。
  // 撮影画面とギャラリー画面を hidden 切り替えだけで入れ替え、
  // 後から Editor 画面を足す場合も同じ考え方で増やせるようにしている。
  stateActions.setAppScreen(screen);
  elements.captureScreen.hidden = screen !== "capture";
  elements.galleryScreen.hidden = screen !== "gallery";
}

function readEffectControlValue(control) {
  if (control.type === "checkbox") {
    return control.checked;
  }

  if (control.type === "range" || control.type === "number") {
    return Number(control.value);
  }

  return control.value;
}

function currentParams() {
  return effectControlElements.reduce((params, control) => {
    params[control.dataset.effectParam] = readEffectControlValue(control);
    return params;
  }, {});
}


function updateStageVisibility() {
  elements.cameraFeed.style.opacity = state.sourceMode === "camera" ? "1" : "0";
  elements.uploadedPreview.style.opacity = state.sourceMode === "image" ? "1" : "0";
}

function resetTrackingUi() {
  elements.faceCountLabel.textContent = "0";
  elements.handCountLabel.textContent = "0";
  elements.poseCountLabel.textContent = "0";
  elements.segmentationLabel.textContent = "off";
  blendshapeView.reset();
}


function updateTrackingSummary(detectionSnapshot) {
  elements.faceCountLabel.textContent = String(detectionSnapshot.face.count);
  elements.handCountLabel.textContent = String(detectionSnapshot.hand.count);
  elements.poseCountLabel.textContent = String(detectionSnapshot.pose.count);
  elements.segmentationLabel.textContent = detectionSnapshot.segmentation.enabled ? "on" : "off";
  blendshapeView.render(detectionSnapshot.face.blendshapeItems);
}


// ---------------------------------------------------------------------------
// 描画層
// 認識層が返した detection snapshot と、エフェクト定義を受けて実際に canvas へ描く。
// エフェクトは必ず run(effectContext) で統一し、UI 層から直接 canvas を触らせない。
// ---------------------------------------------------------------------------


function activeEffect() {
  return getEffectById(state.activeEffectId);
}

function updateEffectPanels() {
  effectPanelElements.forEach((panel) => {
    const supportedEffects = panel.dataset.effectPanel.split(/\s+/);
    panel.hidden = !supportedEffects.includes(state.activeEffectId);
  });
}

function updateActiveEffectUi() {
  const effect = activeEffect();
  elements.activeEffectTitle.textContent = effect.title;
  elements.activeEffectDescription.textContent = effect.description;
  elements.activeEffectSelect.value = effect.id;
  setTrackingEffectLabel(effect.shortLabel);
  effectChoiceElements.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.effectChoice === effect.id);
  });
  updateEffectPanels();
}


function buildEffectContext(source, detections, params) {
  return stageRenderer.buildEffectContext({
    source,
    params,
    mirror: state.sourceMode === "camera",
    assets: state.assets,
    detections,
    helpers: {
      clamp,
      lerp,
    },
  });
}

function runActiveEffect(effectContext) {
  const effect = activeEffect();
  effect.run(effectContext);

  if (effect.requiredDetections.includes("segmentation") && effectContext.params.debugRoiEnabled) {
    if (effectContext.detections.segmentation.headMask.valid) {
      stageRenderer.drawSegmentationDebug(effectContext.detections.segmentation.headMask);
    } else {
      effectContext.detections.face.trackedFaces.forEach(({ squareRoi, sourceRect }) => {
        stageRenderer.drawRoiDebug(squareRoi, sourceRect);
      });
    }
  }
}

function renderProcessedFrame(source, detectionSnapshot) {
  const isCamera = state.sourceMode === "camera";

  stageRenderer.resize(detectionSnapshot.sourceWidth, detectionSnapshot.sourceHeight);
  stageRenderer.drawBaseSource(source, isCamera);
  updateTrackingSummary(detectionSnapshot);

  if (!detectionSnapshot.face.count) {
    stageRenderer.drawNoFaceOverlay();
    stateActions.setLastDetectionSnapshot(detectionSnapshot);
    return;
  }

  const params = currentParams();
  const effectContext = buildEffectContext(source, detectionSnapshot, params);
  runActiveEffect(effectContext);

  stageRenderer.drawLandmarkBadge(detectionSnapshot.face.trackedFaces[0].bounds, `${activeEffect().shortLabel} tracked`);
  stateActions.setLastDetectionSnapshot(detectionSnapshot);
}

function renderCameraPreview(source) {
  if (!source.videoWidth || !source.videoHeight) {
    return;
  }

  stageRenderer.resize(source.videoWidth, source.videoHeight);
  stageRenderer.drawBaseSource(source, true);
}

// ---------------------------------------------------------------------------
// MediaPipe 初期化と入力処理
// 認識層の実行タイミングをここで制御する。
// 画像モードとカメラモードで detect / detectForVideo を切り替えるのが重要な分岐。
// ---------------------------------------------------------------------------

async function setRunningMode(mode) {
  stateActions.setRunningMode(await mediaPipeRuntime.setRunningMode({
    detectors: state.detectors,
    currentMode: state.runningMode,
    mode,
  }));
}

async function createFaceDetector() {
  try {
    stateActions.setFaceDetector(await mediaPipeRuntime.createFaceDetector({ setStatus }));
    setCameraStartEnabled(true);
    await cameraInput.enableDetection();
    setStatus("初期化完了");
  } catch (error) {
    stateActions.setFaceDetector(null);
    setCameraStartEnabled(true);
    setStatus("顔認識初期化失敗 / カメラのみ利用可");
    console.error(error);
  }
}

async function createSegmentationDetector() {
  if (!state.detectors.face) {
    stateActions.setSegmentationDetector(null);
    return;
  }

  stateActions.setSegmentationDetector(await mediaPipeRuntime.createSegmentationDetector({ setStatus }));
  if (state.detectors.segmentation) {
    setStatus("初期化完了");
  }
}

function activeEffectNeedsSegmentation() {
  return activeEffect().requiredDetections.includes("segmentation");
}

function segmentSource(source, timestampMs = performance.now()) {
  if (!state.detectors.segmentation || !mediaPipeRuntime.hasLoadStarted()) {
    return Promise.resolve(null);
  }

  return mediaPipeRuntime.segmentSource({
    detector: state.detectors.segmentation,
    runningMode: state.runningMode,
    source,
    timestampMs,
    enabled: activeEffectNeedsSegmentation(),
  });
}

const cameraInput = createCameraInputController({
  state,
  stateActions,
  elements,
  setStatus,
  setSourceModeLabel,
  setRunningMode,
  readEffectParams: currentParams,
  segmentSource,
  renderCameraPreview,
  renderProcessedFrame,
  updateStageVisibility,
});

async function renderUploadedImage() {
  if (!state.currentImage || !state.detectors.face) {
    return;
  }

  await setRunningMode("IMAGE");
  const params = currentParams();
  const faceResult = state.detectors.face.detect(state.currentImage);
  const segmentationResult = await segmentSource(state.currentImage);
  const detectionSnapshot = buildDetectionSnapshot(state.currentImage, faceResult, segmentationResult, params, false);
  renderProcessedFrame(state.currentImage, detectionSnapshot);
}

const imageUploadInput = createImageUploadController({
  state,
  stateActions,
  elements,
  stopCameraStream: cameraInput.stopCameraStream,
  setStatus,
  setSourceModeLabel,
  updateStageVisibility,
  renderUploadedImage,
});

function cleanupRuntimeResources() {
  cameraInput.stopCameraStream();
  captureFeedback.clear();
  imageUploadInput.releaseCurrentImage();
}

// ---------------------------------------------------------------------------
// UI イベント
// ここでは「何を押したらどの層を呼ぶか」だけを管理する。
// エフェクト処理そのものはこの層へ書かないことで、コードの役割を混ぜないようにする。
// ---------------------------------------------------------------------------

async function rerenderCurrentSourceIfNeeded() {
  if (state.sourceMode === "image") {
    await renderUploadedImage();
  }
}

async function setActiveEffect(effectId) {
  stateActions.setActiveEffectId(effectId);
  updateActiveEffectUi();
  await rerenderCurrentSourceIfNeeded();
}

function stopCameraAndReset() {
  cameraInput.stopCameraStream();
  stateActions.setSourceMode("idle");
  stateActions.setLastDetectionSnapshot(null);
  setSourceModeLabel("stopped");
  setStatus("停止中");
  resetTrackingUi();
  stageRenderer.clearOutput();
  updateStageVisibility();
}

function openGallery() {
  if (!galleryController.hasCaptures()) {
    setStatus("一時保存がまだありません");
    return;
  }

  setAppScreen("gallery");
}

function bindApplicationEvents() {
  bindUiEvents({
    elements,
    effectControlElements,
    actions: {
      setStatus,
      startCamera: cameraInput.startCamera,
      stopCamera: stopCameraAndReset,
      handleImageUpload: imageUploadInput.handleImageUpload,
      setActiveEffect,
      saveCurrentFrame: galleryController.addCurrentFrame,
      openGallery,
      showCaptureScreen: () => setAppScreen("capture"),
      downloadSelectedShot: galleryController.downloadSelected,
      deleteSelectedShot: galleryController.deleteSelected,
      selectTemporaryCapture: galleryController.select,
      rerenderCurrentSourceIfNeeded,
    },
  });
}

// ---------------------------------------------------------------------------
// 起動
// アプリ全体の立ち上げ順をここで固定する。
// アセット準備 -> UI 準備 -> MediaPipe 初期化 -> ギャラリー復元の順で揃えるのが根幹。
// ---------------------------------------------------------------------------

async function bootstrap() {
  stateActions.setActiveEffectId(elements.activeEffectSelect.value);
  setCameraStartEnabled(true);
  setAppScreen("capture");
  setSourceModeLabel("idle");
  updateStageVisibility();
  updateActiveEffectUi();
  resetTrackingUi();
  bindApplicationEvents();
  bindPageLifecycleCleanup({ cleanup: cleanupRuntimeResources });
  await ensureEffectAssets(state.assets);
  await createFaceDetector();
  await createSegmentationDetector();
  await galleryController.hydrate();
  galleryController.syncActionButtons();
  setStatus(state.detectors.segmentation ? "初期化完了" : "Segmentationなしで初期化完了");
  setListMessage(elements.blendshapeList, "入力待ち");
}

bootstrap().catch((error) => {
  setCameraStartEnabled(true);
  setStatus("初期化失敗");
  setListMessage(elements.blendshapeList, "初期化エラー");
  console.error(error);
});






