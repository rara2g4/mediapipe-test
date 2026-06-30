function requiredElement(id) {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing required element: #${id}`);
  }
  return element;
}

export function collectDomRefs() {
  return {
    startCameraButton: requiredElement("startCameraButton"),
    stopCameraButton: requiredElement("stopCameraButton"),
    saveToGalleryButton: requiredElement("saveToGalleryButton"),
    openGalleryButton: requiredElement("openGalleryButton"),
    downloadSelectedShotButton: requiredElement("downloadSelectedShotButton"),
    deleteSelectedShotButton: requiredElement("deleteSelectedShotButton"),
    backToCaptureButton: requiredElement("backToCaptureButton"),
    imageInput: requiredElement("imageInput"),
    activeEffectSelect: requiredElement("activeEffectSelect"),
    effectRail: requiredElement("effectRail"),
    effectCategoryTabs: requiredElement("effectCategoryTabs"),
    effectSearchInput: requiredElement("effectSearchInput"),
    activeEffectTitle: requiredElement("activeEffectTitle"),
    activeEffectDescription: requiredElement("activeEffectDescription"),
    sourceModeLabel: requiredElement("sourceModeLabel"),
    faceCountLabel: requiredElement("faceCountLabel"),
    handCountLabel: requiredElement("handCountLabel"),
    poseCountLabel: requiredElement("poseCountLabel"),
    segmentationLabel: requiredElement("segmentationLabel"),
    trackingEffectLabel: requiredElement("trackingEffectLabel"),
    statusLabel: requiredElement("statusLabel"),
    galleryStatusLabel: requiredElement("galleryStatusLabel"),
    temporaryGallery: requiredElement("temporaryGallery"),
    captureScreen: requiredElement("captureScreen"),
    galleryScreen: requiredElement("galleryScreen"),
    galleryPreviewImage: requiredElement("galleryPreviewImage"),
    galleryPreviewEmpty: requiredElement("galleryPreviewEmpty"),
    galleryPreviewTitle: requiredElement("galleryPreviewTitle"),
    galleryPreviewDescription: requiredElement("galleryPreviewDescription"),
    blendshapeChart: requiredElement("blendshapeChart"),
    blendshapeList: requiredElement("blendshapeList"),
    cameraFeed: requiredElement("cameraFeed"),
    uploadedPreview: requiredElement("uploadedPreview"),
    captureFreezeOverlay: requiredElement("captureFreezeOverlay"),
    captureFlashOverlay: requiredElement("captureFlashOverlay"),
    outputCanvas: requiredElement("outputCanvas"),
  };
}

export function collectEffectControls() {
  return {
    effectControlElements: [...document.querySelectorAll("[data-effect-param]")],
    effectPanelElements: [...document.querySelectorAll("[data-effect-panel]")],
    effectChoiceElements: [...document.querySelectorAll("[data-effect-choice]")],
  };
}

export function createTextElement(tagName, text, className = "") {
  const element = document.createElement(tagName);
  if (className) {
    element.className = className;
  }
  element.textContent = text;
  return element;
}

export function setListMessage(listElement, message) {
  listElement.replaceChildren(createTextElement("li", message));
}
