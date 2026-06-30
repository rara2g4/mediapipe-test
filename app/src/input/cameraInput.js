import { buildDetectionSnapshot } from "../mediapipe/detectionSnapshot.js";

function createUserFacingError(message, cause) {
  const error = new Error(message);
  error.userMessage = message;
  error.cause = cause;
  return error;
}

function getCameraAccessErrorMessage(error) {
  if (error?.name === "NotAllowedError" || error?.name === "PermissionDeniedError") {
    return "カメラ許可が拒否されています。ブラウザのサイト設定でカメラを許可してください";
  }

  if (error?.name === "NotFoundError" || error?.name === "DevicesNotFoundError") {
    return "利用できるカメラが見つかりません";
  }

  if (error?.name === "NotReadableError" || error?.name === "TrackStartError") {
    return "カメラを開けません。他のアプリが使用中かもしれません";
  }

  if (error?.name === "OverconstrainedError") {
    return "指定した条件でカメラを起動できません";
  }

  if (error?.name === "SecurityError") {
    return "このページではカメラを使えません。http://127.0.0.1:8000/ で開いてください";
  }

  return "カメラ開始に失敗しました";
}

export function createCameraInputController({
  state,
  stateActions,
  elements,
  setStatus,
  setSourceModeLabel,
  setRunningMode,
  readEffectParams,
  segmentSource,
  renderCameraPreview,
  renderProcessedFrame,
  updateStageVisibility,
}) {
  let isDetectionReady = false;

  function stopCameraStream() {
    if (state.animationFrameId) {
      cancelAnimationFrame(state.animationFrameId);
      stateActions.setAnimationFrameId(0);
    }

    if (state.webcamStream) {
      state.webcamStream.getTracks().forEach((track) => track.stop());
      stateActions.setWebcamStream(null);
    }

    elements.cameraFeed.srcObject = null;
    stateActions.setCameraActive(false);
    stateActions.setLastVideoTime(-1);
    isDetectionReady = false;
  }

  async function enableDetection() {
    if (!state.detectors.face || !state.isCameraActive) {
      isDetectionReady = false;
      return false;
    }

    try {
      await setRunningMode("VIDEO");
      isDetectionReady = true;
      setStatus("カメラ実行中");
      return true;
    } catch (error) {
      isDetectionReady = false;
      console.error(error);
      setStatus("カメラ表示中 / 顔認識準備失敗");
      return false;
    }
  }

  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw createUserFacingError("このブラウザまたはURLではカメラを使えません。http://127.0.0.1:8000/ で開いてください");
    }

    stopCameraStream();
    setStatus("カメラ許可待ち");

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
    } catch (error) {
      throw createUserFacingError(getCameraAccessErrorMessage(error), error);
    }

    try {
      elements.cameraFeed.srcObject = stream;
      setStatus("カメラ映像準備中");
      await elements.cameraFeed.play();
    } catch (error) {
      stream.getTracks().forEach((track) => track.stop());
      elements.cameraFeed.srcObject = null;
      throw createUserFacingError("カメラ映像の準備に失敗しました", error);
    }

    stateActions.setWebcamStream(stream);
    stateActions.setSourceMode("camera");
    stateActions.setCameraActive(true);
    stateActions.setCurrentImage(null);
    setSourceModeLabel("camera");
    setStatus("カメラ実行中");
    elements.uploadedPreview.removeAttribute("src");

    updateStageVisibility();
    renderCameraPreview(elements.cameraFeed);
    predictCameraFrame();

    if (!(await enableDetection())) {
      setStatus(state.detectors.face ? "カメラ表示中 / 顔認識準備失敗" : "カメラ表示中 / 顔認識初期化待ち");
    }
  }

  async function detectFromCurrentCameraFrame() {
    const params = readEffectParams();
    const timestampMs = performance.now();
    const faceResult = state.detectors.face.detectForVideo(elements.cameraFeed, timestampMs);
    const segmentationResult = await segmentSource(elements.cameraFeed, timestampMs);
    return buildDetectionSnapshot(elements.cameraFeed, faceResult, segmentationResult, params, true);
  }

  async function predictCameraFrame() {
    if (!state.isCameraActive) {
      return;
    }

    if (elements.cameraFeed.currentTime !== state.lastVideoTime) {
      stateActions.setLastVideoTime(elements.cameraFeed.currentTime);

      renderCameraPreview(elements.cameraFeed);

      if (isDetectionReady) {
        try {
          const detectionSnapshot = await detectFromCurrentCameraFrame();
          if (state.isCameraActive) {
            renderProcessedFrame(elements.cameraFeed, detectionSnapshot);
          }
        } catch (error) {
          isDetectionReady = false;
          console.error(error);
          setStatus("カメラ表示中 / 顔認識一時停止");
        }
      }
    }

    stateActions.setAnimationFrameId(requestAnimationFrame(predictCameraFrame));
  }

  return {
    enableDetection,
    startCamera,
    stopCameraStream,
  };
}
