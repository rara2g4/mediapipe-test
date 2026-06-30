export function createInitialState() {
  return {
    appScreen: "capture",
    detectors: {
      face: null,
      hand: null,
      pose: null,
      segmentation: null,
    },
    runningMode: "IMAGE",
    lastVideoTime: -1,
    animationFrameId: 0,
    webcamStream: null,
    sourceMode: "idle",
    currentImage: null,
    currentImageObjectUrl: null,
    isCameraActive: false,
    activeEffectId: "faceSticker",
    assets: {
      faceSticker: null,
    },
    temporaryCaptures: [],
    selectedCaptureId: null,
    lastDetectionSnapshot: null,
    captureFeedbackTimerId: 0,
    isCaptureFeedbackActive: false,
  };
}

export function createStateActions(state) {
  return {
    setActiveEffectId(effectId) {
      state.activeEffectId = effectId;
    },

    setAnimationFrameId(animationFrameId) {
      state.animationFrameId = animationFrameId;
    },

    setAppScreen(appScreen) {
      state.appScreen = appScreen;
    },

    setCameraActive(isCameraActive) {
      state.isCameraActive = isCameraActive;
    },

    setCaptureFeedbackActive(isCaptureFeedbackActive) {
      state.isCaptureFeedbackActive = isCaptureFeedbackActive;
    },

    setCaptureFeedbackTimerId(captureFeedbackTimerId) {
      state.captureFeedbackTimerId = captureFeedbackTimerId;
    },

    setCurrentImage(currentImage) {
      state.currentImage = currentImage;
    },

    setCurrentImageObjectUrl(currentImageObjectUrl) {
      state.currentImageObjectUrl = currentImageObjectUrl;
    },

    setFaceDetector(faceDetector) {
      state.detectors.face = faceDetector;
    },

    setLastDetectionSnapshot(lastDetectionSnapshot) {
      state.lastDetectionSnapshot = lastDetectionSnapshot;
    },

    setLastVideoTime(lastVideoTime) {
      state.lastVideoTime = lastVideoTime;
    },

    setRunningMode(runningMode) {
      state.runningMode = runningMode;
    },

    setSegmentationDetector(segmentationDetector) {
      state.detectors.segmentation = segmentationDetector;
    },

    setSelectedCaptureId(selectedCaptureId) {
      state.selectedCaptureId = selectedCaptureId;
    },

    setSourceMode(sourceMode) {
      state.sourceMode = sourceMode;
    },

    setTemporaryCaptures(temporaryCaptures) {
      state.temporaryCaptures = temporaryCaptures;
    },

    setWebcamStream(webcamStream) {
      state.webcamStream = webcamStream;
    },
  };
}
