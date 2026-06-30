export function bindUiEvents({ elements, effectControlElements, actions, logger = console }) {
  function reportError(statusMessage, error) {
    actions.setStatus(error?.userMessage || statusMessage);
    logger.error(error);
  }

  elements.startCameraButton.addEventListener("click", async () => {
    try {
      await actions.startCamera();
    } catch (error) {
      reportError("カメラ開始失敗", error);
    }
  });

  elements.stopCameraButton.addEventListener("click", () => {
    actions.stopCamera();
  });

  elements.imageInput.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    try {
      await actions.handleImageUpload(file);
    } catch (error) {
      reportError("画像読込失敗", error);
    }
  });

  elements.activeEffectSelect.addEventListener("change", async (event) => {
    await actions.setActiveEffect(event.target.value);
  });

  elements.effectRail.addEventListener("click", async (event) => {
    const choiceButton = event.target.closest("[data-effect-choice]");
    if (!choiceButton) {
      return;
    }

    await actions.setActiveEffect(choiceButton.dataset.effectChoice);
  });

  elements.saveToGalleryButton.addEventListener("click", async () => {
    await actions.saveCurrentFrame();
  });

  elements.openGalleryButton.addEventListener("click", () => {
    actions.openGallery();
  });

  elements.backToCaptureButton.addEventListener("click", () => {
    actions.showCaptureScreen();
  });

  elements.downloadSelectedShotButton.addEventListener("click", () => {
    actions.downloadSelectedShot();
  });

  elements.deleteSelectedShotButton.addEventListener("click", async () => {
    await actions.deleteSelectedShot();
  });

  elements.temporaryGallery.addEventListener("click", (event) => {
    const target = event.target.closest("[data-gallery-action]");
    if (!target) {
      return;
    }

    if (target.dataset.galleryAction === "select") {
      actions.selectTemporaryCapture(target.dataset.captureId);
    }
  });

  elements.temporaryGallery.addEventListener("keydown", (event) => {
    const target = event.target.closest("[data-gallery-action]");
    if (!target) {
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (target.dataset.galleryAction === "select") {
        actions.selectTemporaryCapture(target.dataset.captureId);
      }
    }
  });

  effectControlElements.forEach((element) => {
    element.addEventListener("input", async () => {
      await actions.rerenderCurrentSourceIfNeeded();
    });
  });
}
