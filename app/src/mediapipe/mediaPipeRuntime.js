export function createMediaPipeRuntime({ logger = console } = {}) {
  let detectorModulePromise = null;

  function loadDetectorModule() {
    if (!detectorModulePromise) {
      detectorModulePromise = import("./detectors.js").catch((error) => {
        detectorModulePromise = null;
        throw error;
      });
    }

    return detectorModulePromise;
  }

  function hasLoadStarted() {
    return Boolean(detectorModulePromise);
  }

  async function createFaceDetector(options) {
    const detectorModule = await loadDetectorModule();
    return detectorModule.createFaceDetector(options);
  }

  async function createSegmentationDetector(options) {
    const detectorModule = await loadDetectorModule();
    return detectorModule.createSegmentationDetector(options);
  }

  async function setRunningMode(options) {
    const detectorModule = await loadDetectorModule();
    return detectorModule.setDetectorRunningMode(options);
  }

  function segmentSource(options) {
    if (!detectorModulePromise) {
      return Promise.resolve(null);
    }

    return detectorModulePromise
      .then((detectorModule) => detectorModule.segmentSource(options))
      .catch((error) => {
        logger.error(error);
        return null;
      });
  }

  return {
    createFaceDetector,
    createSegmentationDetector,
    hasLoadStarted,
    segmentSource,
    setRunningMode,
  };
}
