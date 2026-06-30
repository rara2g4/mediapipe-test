export function createCaptureFeedback({ state, stateActions, elements, stageFrameElement, durationMs = 240 }) {
  function clear() {
    if (state.captureFeedbackTimerId) {
      clearTimeout(state.captureFeedbackTimerId);
      stateActions.setCaptureFeedbackTimerId(0);
    }

    stateActions.setCaptureFeedbackActive(false);
    elements.saveToGalleryButton.disabled = false;
    elements.captureFreezeOverlay.removeAttribute("src");
    elements.captureFreezeOverlay.style.opacity = "0";
    stageFrameElement.classList.remove("is-capturing");
  }

  function play() {
    if (!elements.outputCanvas.width || !elements.outputCanvas.height) {
      return false;
    }

    clear();
    stateActions.setCaptureFeedbackActive(true);
    elements.saveToGalleryButton.disabled = true;
    elements.captureFreezeOverlay.src = elements.outputCanvas.toDataURL("image/png");
    elements.captureFreezeOverlay.style.opacity = "1";
    stageFrameElement.classList.add("is-capturing");
    stateActions.setCaptureFeedbackTimerId(window.setTimeout(() => {
      clear();
    }, durationMs));

    return true;
  }

  function isActive() {
    return state.isCaptureFeedbackActive;
  }

  return {
    clear,
    play,
    isActive,
  };
}
