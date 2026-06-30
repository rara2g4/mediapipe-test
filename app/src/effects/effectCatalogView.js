import { createTextElement } from "../ui/dom.js";

function effectEntriesFromMetadata(effectMetadata) {
  return Object.entries(effectMetadata).map(([id, metadata]) => ({
    id,
    ...metadata,
  }));
}

function uniqueCategories(effects) {
  const categoryMap = new Map();
  effects.forEach((effect) => {
    if (!categoryMap.has(effect.category)) {
      categoryMap.set(effect.category, effect.categoryLabel || effect.category);
    }
  });

  return [
    { id: "all", label: "すべて" },
    ...[...categoryMap].map(([id, label]) => ({ id, label })),
  ];
}

function createCategoryButton(category, isActive) {
  const button = document.createElement("button");
  button.className = `category-tab ${isActive ? "is-active" : ""}`.trim();
  button.type = "button";
  button.dataset.effectCategory = category.id;
  button.textContent = category.label;
  return button;
}

function createEffectOption(effect) {
  const option = document.createElement("option");
  option.value = effect.id;
  option.textContent = effect.title;
  return option;
}

function createRequirementList(effect) {
  const list = document.createElement("div");
  list.className = "effect-card-requirements";
  (effect.requiredFeatures || []).forEach((feature) => {
    list.append(createTextElement("span", feature));
  });
  return list;
}

function createEffectCard(effect) {
  const button = document.createElement("button");
  button.className = "effect-choice-card";
  button.type = "button";
  button.dataset.effectChoice = effect.id;
  button.dataset.effectCategoryValue = effect.category || "";
  button.dataset.effectSearchText = [
    effect.title,
    effect.shortLabel,
    effect.description,
    effect.categoryLabel,
    ...(effect.keywords || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const thumb = document.createElement("span");
  thumb.className = `effect-card-thumb effect-card-thumb-${effect.category || "default"}`;
  thumb.textContent = effect.badge || effect.shortLabel.slice(0, 2);

  const body = document.createElement("span");
  body.className = "effect-card-body";
  body.append(
    createTextElement("strong", effect.shortLabel),
    createTextElement("span", effect.categoryLabel || "エフェクト"),
    createRequirementList(effect)
  );

  button.append(thumb, body);
  return button;
}

function applyFilters({ railElement, categoryTabsElement, activeCategory, query }) {
  const normalizedQuery = query.trim().toLowerCase();
  const cards = [...railElement.querySelectorAll("[data-effect-choice]")];

  cards.forEach((card) => {
    const matchesCategory = activeCategory === "all" || card.dataset.effectCategoryValue === activeCategory;
    const matchesQuery = !normalizedQuery || card.dataset.effectSearchText.includes(normalizedQuery);
    card.hidden = !(matchesCategory && matchesQuery);
  });

  [...categoryTabsElement.querySelectorAll("[data-effect-category]")].forEach((button) => {
    button.classList.toggle("is-active", button.dataset.effectCategory === activeCategory);
  });
}

export function renderEffectCatalog({
  effectMetadata,
  railElement,
  selectElement,
  categoryTabsElement,
  searchInput,
}) {
  const effects = effectEntriesFromMetadata(effectMetadata);
  const categories = uniqueCategories(effects);
  let activeCategory = "all";

  selectElement.replaceChildren(...effects.map(createEffectOption));
  categoryTabsElement.replaceChildren(...categories.map((category) => createCategoryButton(category, category.id === "all")));
  railElement.replaceChildren(...effects.map(createEffectCard));

  categoryTabsElement.addEventListener("click", (event) => {
    const button = event.target.closest("[data-effect-category]");
    if (!button) {
      return;
    }

    activeCategory = button.dataset.effectCategory;
    applyFilters({ railElement, categoryTabsElement, activeCategory, query: searchInput.value });
  });

  searchInput.addEventListener("input", () => {
    applyFilters({ railElement, categoryTabsElement, activeCategory, query: searchInput.value });
  });

  applyFilters({ railElement, categoryTabsElement, activeCategory, query: "" });
}
