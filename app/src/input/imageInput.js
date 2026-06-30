function loadImageFile(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.addEventListener(
      "load",
      () => {
        resolve({ image, objectUrl });
      },
      { once: true },
    );

    image.addEventListener(
      "error",
      () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("Failed to load image file"));
      },
      { once: true },
    );

    image.src = objectUrl;
  });
}

export function createImageUploadController({
  state,
  stateActions,
  elements,
  stopCameraStream,
  setStatus,
  setSourceModeLabel,
  updateStageVisibility,
  renderUploadedImage,
}) {
  function releaseCurrentImage() {
    if (state.currentImageObjectUrl) {
      URL.revokeObjectURL(state.currentImageObjectUrl);
    }

    stateActions.setCurrentImage(null);
    stateActions.setCurrentImageObjectUrl(null);
    elements.uploadedPreview.removeAttribute("src");
  }

  async function handleImageUpload(file) {
    if (!file) {
      return;
    }

    stopCameraStream();

    const { image, objectUrl } = await loadImageFile(file);
    releaseCurrentImage();

    stateActions.setCurrentImage(image);
    stateActions.setCurrentImageObjectUrl(objectUrl);
    stateActions.setSourceMode("image");
    setSourceModeLabel("image");
    setStatus("画像解析完了");
    elements.uploadedPreview.src = objectUrl;
    updateStageVisibility();
    await renderUploadedImage();
  }

  return {
    handleImageUpload,
    releaseCurrentImage,
  };
}
