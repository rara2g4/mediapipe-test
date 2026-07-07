import { createTextElement } from "../ui/dom.js";

export function selectedTemporaryCapture(captures, selectedCaptureId) {
  return captures.find((capture) => capture.id === selectedCaptureId) || null;
}

export function syncGalleryActionButtons({ elements, captures, selectedCaptureId, effectMetadata, formatCaptureTime }) {
  const capture = selectedTemporaryCapture(captures, selectedCaptureId);
  const hasCapture = Boolean(capture);
  elements.downloadSelectedShotButton.disabled = !hasCapture;
  elements.deleteSelectedShotButton.disabled = !hasCapture;
  elements.openGalleryButton.disabled = !captures.length;

  if (!captures.length) {
    elements.galleryStatusLabel.textContent = "一時保存はまだありません。";
    return;
  }

  if (!capture) {
    elements.galleryStatusLabel.textContent = `一時保存 ${captures.length} 件。保存したい画像を選択してください。`;
    return;
  }

  elements.galleryStatusLabel.textContent = `${formatCaptureTime(capture.createdAt)} / ${
    effectMetadata[capture.effectId]?.shortLabel || capture.effectId
  } / ${capture.sourceMode}`;
}

export function renderGalleryPreview({ elements, capture, effectMetadata, formatCaptureTime }) {
  if (!capture) {
    elements.galleryPreviewImage.style.display = "none";
    elements.galleryPreviewImage.removeAttribute("src");
    elements.galleryPreviewEmpty.hidden = false;
    elements.galleryPreviewTitle.textContent = "選択中の画像はありません";
    elements.galleryPreviewDescription.textContent =
      "左の一覧から画像をクリックすると、保存や削除の対象を切り替えられます。";
    return;
  }

  const effectLabel = effectMetadata[capture.effectId]?.shortLabel || capture.effectId;
  elements.galleryPreviewImage.src = capture.dataUrl;
  elements.galleryPreviewImage.style.display = "block";
  elements.galleryPreviewEmpty.hidden = true;
  elements.galleryPreviewTitle.textContent = `${effectLabel} / ${formatCaptureTime(capture.createdAt)}`;
  elements.galleryPreviewDescription.textContent =
    `${capture.sourceMode} で保存した画像です。ここで大きく確認してから保存や削除を選べます。`;
}

export function renderTemporaryGallery({
  elements,
  captures,
  selectedCaptureId,
  effectMetadata,
  formatCaptureTime,
}) {
  const selectedCapture = selectedTemporaryCapture(captures, selectedCaptureId);

  if (!captures.length) {
    elements.temporaryGallery.replaceChildren(createTextElement("p", "一時保存はまだありません。", "gallery-empty"));
    syncGalleryActionButtons({ elements, captures, selectedCaptureId, effectMetadata, formatCaptureTime });
    renderGalleryPreview({ elements, capture: selectedCapture, effectMetadata, formatCaptureTime });
    return;
  }

  const cards = captures.map((capture) => {
    const isSelected = capture.id === selectedCaptureId;
    const effectLabel = effectMetadata[capture.effectId]?.shortLabel || capture.effectId;

    const card = document.createElement("button");
    card.className = `gallery-card ${isSelected ? "is-selected" : ""}`.trim();
    card.type = "button";
    card.dataset.galleryAction = "select";
    card.dataset.captureId = capture.id;
    card.setAttribute("aria-pressed", String(isSelected));

    const image = document.createElement("img");
    image.className = "gallery-thumb";
    image.src = capture.dataUrl;
    image.alt = `一時保存 ${formatCaptureTime(capture.createdAt)}`;

    const meta = document.createElement("div");
    meta.className = "gallery-meta";
    meta.append(
      createTextElement("strong", effectLabel),
      createTextElement("span", formatCaptureTime(capture.createdAt)),
      createTextElement("span", capture.sourceMode)
    );

    card.append(image, meta);
    return card;
  });

  elements.temporaryGallery.replaceChildren(...cards);
  syncGalleryActionButtons({ elements, captures, selectedCaptureId, effectMetadata, formatCaptureTime });
  renderGalleryPreview({ elements, capture: selectedCapture, effectMetadata, formatCaptureTime });
}
