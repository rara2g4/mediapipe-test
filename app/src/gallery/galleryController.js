import { GALLERY_DB_NAME, GALLERY_STORE_NAME } from "../core/config.js";
import { EFFECT_METADATA } from "../effects/effectMetadata.js";
import { createTemporaryCaptureStore } from "./store.js";
import {
  renderTemporaryGallery,
  selectedTemporaryCapture,
  syncGalleryActionButtons,
} from "./view.js";

function formatCaptureTime(isoString) {
  const date = new Date(isoString);
  return `${date.getMonth() + 1}/${date.getDate()} ${date.getHours().toString().padStart(2, "0")}:${date
    .getMinutes()
    .toString()
    .padStart(2, "0")}`;
}

function createCaptureId() {
  if (globalThis.crypto?.randomUUID) {
    return crypto.randomUUID();
  }

  return `capture-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function downloadCaptureAsPng(capture) {
  const link = document.createElement("a");
  const safeEffectId = capture.effectId.replace(/[^a-z0-9_-]/gi, "-");
  link.download = `${safeEffectId}-${capture.createdAt.replace(/[:.]/g, "-")}.png`;
  link.href = capture.dataUrl;
  link.click();
}

export function createTemporaryGalleryController({
  state,
  stateActions,
  elements,
  captureFeedback,
  setStatus,
  store = createTemporaryCaptureStore({
    dbName: GALLERY_DB_NAME,
    storeName: GALLERY_STORE_NAME,
  }),
}) {
  function selectedCapture() {
    return selectedTemporaryCapture(state.temporaryCaptures, state.selectedCaptureId);
  }

  function syncActionButtons() {
    syncGalleryActionButtons({
      elements,
      captures: state.temporaryCaptures,
      selectedCaptureId: state.selectedCaptureId,
      effectMetadata: EFFECT_METADATA,
      formatCaptureTime,
    });
  }

  function render() {
    renderTemporaryGallery({
      elements,
      captures: state.temporaryCaptures,
      selectedCaptureId: state.selectedCaptureId,
      effectMetadata: EFFECT_METADATA,
      formatCaptureTime,
    });
  }

  function select(captureId) {
    stateActions.setSelectedCaptureId(captureId);
    render();
  }

  async function hydrate() {
    const captures = await store.readAll(state.temporaryCaptures);
    stateActions.setTemporaryCaptures(captures);
    stateActions.setSelectedCaptureId(captures[0]?.id || null);
    render();
  }

  async function addCurrentFrame() {
    if (captureFeedback.isActive()) {
      return;
    }

    if (!elements.outputCanvas.width || !elements.outputCanvas.height) {
      setStatus("保存できる結果がまだありません");
      return;
    }

    captureFeedback.play();

    const capture = {
      id: createCaptureId(),
      createdAt: new Date().toISOString(),
      effectId: state.activeEffectId,
      sourceMode: state.sourceMode,
      dataUrl: elements.outputCanvas.toDataURL("image/png"),
    };

    stateActions.setTemporaryCaptures([capture, ...state.temporaryCaptures.filter((item) => item.id !== capture.id)]);
    stateActions.setSelectedCaptureId(capture.id);
    render();
    await store.save(capture);
    setStatus("一時保存へ追加しました");
  }

  async function deleteSelected() {
    const capture = selectedCapture();
    if (!capture) {
      return;
    }

    const captures = state.temporaryCaptures.filter((item) => item.id !== capture.id);
    stateActions.setTemporaryCaptures(captures);
    await store.remove(capture.id);
    stateActions.setSelectedCaptureId(captures[0]?.id || null);
    render();
    setStatus("選択中の一時保存を削除しました");
  }

  function downloadSelected() {
    const capture = selectedCapture();
    if (!capture) {
      return;
    }

    downloadCaptureAsPng(capture);
    setStatus("選択中の一時保存を PNG 出力しました");
  }

  function hasCaptures() {
    return state.temporaryCaptures.length > 0;
  }

  return {
    addCurrentFrame,
    deleteSelected,
    downloadSelected,
    hasCaptures,
    hydrate,
    select,
    syncActionButtons,
  };
}
