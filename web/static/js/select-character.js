const characterListEl = document.getElementById("character-list");
const heroEl = document.getElementById("character-select-hero");
const heroStageEl = document.getElementById("character-select-hero-stage");
const slotsRowEl = document.querySelector(".character-select__slots-row");
const slotsViewportEl = document.querySelector(".character-select__slots-viewport");
const slotsPrevBtn = document.getElementById("character-slots-prev");
const slotsNextBtn = document.getElementById("character-slots-next");
const selectServerBtn = document.getElementById("character-select-server-btn");
const startBtn = document.getElementById("character-start-btn");
const deleteBtn = document.getElementById("character-delete-btn");
const infoLayer = document.getElementById("login-info-layer");
const infoMessage = document.getElementById("login-info-message");
const infoPrimary = document.getElementById("login-info-primary");
const infoSecondary = document.getElementById("login-info-secondary");

const MODEL_SRC = "/assets/select-character-model.png";
const SLOT_BTN_WIDTH = 175;
const SLOT_GAP = 12;
const NAV_BTN_WIDTH = 32;

let infoPrimaryHandler = null;
let infoSecondaryHandler = null;
let characters = [];
let maxCharacters = 4;
let channelNumber = 1;
let championLevelThreshold = 90;
let selectedCharacterId = null;
let actionInProgress = false;
let slotScrollIndex = 0;
let visibleSlotCount = 4;
let slotCarouselActive = false;
const characterViews = new Map();
let heroCharacterView = null;

function hideInfoDialog() {
  infoLayer.hidden = true;
  infoSecondary.hidden = true;
  infoPrimaryHandler = null;
  infoSecondaryHandler = null;
}

function showAlertDialog(message, onConfirm) {
  infoMessage.textContent = message;
  infoSecondary.hidden = true;
  infoPrimaryHandler = async () => {
    infoPrimary.disabled = true;
    try {
      await onConfirm?.();
    } finally {
      infoPrimary.disabled = false;
      hideInfoDialog();
    }
  };
  infoSecondaryHandler = null;
  window.bringDialogLayerToFront?.(infoLayer);
  infoLayer.hidden = false;
}

window.showPlayDisconnectDialog = (onConfirm) => {
  showAlertDialog(
    window.SessionFlow?.DISCONNECT_MESSAGE || "Connection was lost.\nThe game client will be closed.",
    onConfirm,
  );
};

function showInfoDialog(message) {
  infoMessage.textContent = message;
  infoSecondary.hidden = true;
  infoPrimaryHandler = hideInfoDialog;
  infoSecondaryHandler = null;
  window.bringDialogLayerToFront?.(infoLayer);
  infoLayer.hidden = false;
}

function showConfirmDialog(message, onConfirm) {
  infoMessage.textContent = message;
  infoSecondary.hidden = false;
  infoPrimaryHandler = async () => {
    infoPrimary.disabled = true;
    infoSecondary.disabled = true;
    try {
      await onConfirm();
    } finally {
      infoPrimary.disabled = false;
      infoSecondary.disabled = false;
      hideInfoDialog();
    }
  };
  infoSecondaryHandler = hideInfoDialog;
  window.bringDialogLayerToFront?.(infoLayer);
  infoLayer.hidden = false;
}

function formatLevelLine(character) {
  const level = Number(character.level) || 1;
  const championLevel = Number(character.championLevel) || 0;
  if (championLevel <= 0) {
    return `Lv.${level}`;
  }
  return `Lv.${level} CLv.${championLevel}`;
}

function updateActionButtons() {
  const hasSelection = selectedCharacterId !== null;
  startBtn.disabled = !hasSelection || actionInProgress;
  deleteBtn.disabled = !hasSelection || actionInProgress;
  selectServerBtn.disabled = actionInProgress;
}

function slotStepPx() {
  return SLOT_BTN_WIDTH + SLOT_GAP;
}

function viewportWidthForSlots(count) {
  if (count <= 0) {
    return 0;
  }
  return count * SLOT_BTN_WIDTH + (count - 1) * SLOT_GAP;
}

function countVisibleSlots(availableWidth) {
  return Math.max(1, Math.floor((availableWidth + SLOT_GAP) / slotStepPx()));
}

function updateSlotCarousel() {
  if (!slotsRowEl || !slotsViewportEl || !characterListEl) {
    return;
  }

  const totalSlots = characterListEl.children.length;
  if (totalSlots === 0) {
    return;
  }

  const rowWidth = slotsRowEl.clientWidth;
  let available = rowWidth;
  let nextVisible = countVisibleSlots(available);

  slotCarouselActive = nextVisible < totalSlots;
  slotsRowEl.classList.toggle("character-select__slots-row--carousel", slotCarouselActive);

  if (slotCarouselActive) {
    if (slotsPrevBtn) {
      slotsPrevBtn.hidden = false;
    }
    if (slotsNextBtn) {
      slotsNextBtn.hidden = false;
    }
    available = rowWidth - NAV_BTN_WIDTH * 2 - 8 * 2;
    nextVisible = countVisibleSlots(available);
  } else if (slotsPrevBtn && slotsNextBtn) {
    slotsPrevBtn.hidden = true;
    slotsNextBtn.hidden = true;
    slotScrollIndex = 0;
  }

  visibleSlotCount = Math.min(nextVisible, totalSlots);
  const maxScrollIndex = Math.max(0, totalSlots - visibleSlotCount);
  slotScrollIndex = Math.min(slotScrollIndex, maxScrollIndex);

  if (slotsPrevBtn) {
    slotsPrevBtn.disabled = slotScrollIndex <= 0;
  }
  if (slotsNextBtn) {
    slotsNextBtn.disabled = slotScrollIndex >= maxScrollIndex;
  }

  if (slotCarouselActive) {
    slotsViewportEl.style.width = `${viewportWidthForSlots(visibleSlotCount)}px`;
    characterListEl.style.transform = `translateX(-${slotScrollIndex * slotStepPx()}px)`;
  } else {
    slotsViewportEl.style.width = "";
    characterListEl.style.transform = "";
  }
}

function ensureSlotIndexVisible(slotIndex) {
  if (!slotCarouselActive) {
    return;
  }

  const index = slotIndex - 1;
  if (index < slotScrollIndex) {
    slotScrollIndex = index;
  } else if (index >= slotScrollIndex + visibleSlotCount) {
    slotScrollIndex = index - visibleSlotCount + 1;
  }
  updateSlotCarousel();
}

function scheduleSlotCarouselUpdate() {
  requestAnimationFrame(updateSlotCarousel);
}

function selectCharacterRow(characterId) {
  selectedCharacterId = characterId;
  for (const button of characterListEl.querySelectorAll(".character-select__slot-btn--character")) {
    const isSelected = Number(button.dataset.characterId) === characterId;
    button.classList.toggle("character-select__slot-btn--selected", isSelected);
    button.setAttribute("aria-selected", isSelected ? "true" : "false");
  }

  const character = characters.find((entry) => entry.id === characterId);
  if (character?.slotIndex) {
    ensureSlotIndexVisible(character.slotIndex);
  }

  updateHeroPreview(character ?? null);
  updateActionButtons();
}

function characterViewConfig(character) {
  return {
    gender: character.gender,
    job: character.job,
    hairStyle: character.hairStyle || "A",
    hairColour: character.hairColour ?? 1,
  };
}

function updateHeroPreview(character) {
  if (!heroEl) {
    return;
  }

  if (!character) {
    heroEl.hidden = true;
    heroEl.setAttribute("aria-hidden", "true");
    return;
  }

  heroEl.hidden = false;
  heroEl.setAttribute("aria-hidden", "false");

  if (!window.CharacterView?.render || !heroStageEl) {
    return;
  }

  heroCharacterView = window.CharacterView.render(
    heroStageEl,
    characterViewConfig(character),
    { profile: "main", build: true, view: heroCharacterView },
  );
}

function disposeHeroView() {
  heroCharacterView?.observer?.disconnect();
  heroCharacterView = null;
  if (heroStageEl) {
    heroStageEl.innerHTML = "";
  }
  if (heroEl) {
    heroEl.hidden = true;
    heroEl.setAttribute("aria-hidden", "true");
  }
}

function disposeCharacterViews() {
  for (const view of characterViews.values()) {
    view.observer?.disconnect();
  }
  characterViews.clear();
  disposeHeroView();
}

function mountCharacterPortrait(stageEl, character) {
  if (!window.CharacterView?.render) {
    return null;
  }

  return window.CharacterView.render(
    stageEl,
    characterViewConfig(character),
    { profile: "selectSlot", build: true },
  );
}

function buildSlotTextRows(topText, bottomText) {
  const text = document.createElement("span");
  text.className = "character-select__slot-text";

  const topRow = document.createElement("span");
  topRow.className = "character-select__slot-row character-select__slot-row--top";
  topRow.textContent = topText || "";

  const bottomRow = document.createElement("span");
  bottomRow.className = "character-select__slot-row character-select__slot-row--bottom";
  bottomRow.textContent = bottomText;

  text.append(topRow, bottomRow);
  return text;
}

function buildSlotElement(slot, character) {
  const slotWrap = document.createElement("div");
  slotWrap.className = "character-select__slot";

  const button = document.createElement("button");
  button.type = "button";
  button.className = "character-select__slot-btn";
  button.setAttribute("role", "option");

  const portrait = document.createElement("div");
  portrait.className = "character-select__portrait";

  if (character) {
    button.classList.add("character-select__slot-btn--character");
    button.dataset.characterId = String(character.id);
    button.setAttribute("aria-selected", "false");

    const stage = document.createElement("div");
    stage.className = "character-select__portrait-stage character-view-stage";
    portrait.appendChild(stage);

    button.append(portrait, buildSlotTextRows(formatLevelLine(character), character.name));

    button.addEventListener("click", (event) => {
      selectCharacterRow(character.id);
      if (event.detail >= 2) {
        void enterSelectedCharacter();
      }
    });

    slotWrap.appendChild(button);
    return { slotWrap, stageEl: stage, character };
  }

  button.classList.add("character-select__slot-btn--empty");
  button.dataset.slotIndex = String(slot);

  const model = document.createElement("img");
  model.className = "character-select__model";
  model.src = MODEL_SRC;
  model.alt = "";
  portrait.appendChild(model);

  button.append(portrait, buildSlotTextRows("", "Create Character"));

  button.addEventListener("click", (event) => {
    event.preventDefault();
    void window.ScreenTransition.navigateInstant(
      `/play/create-character?slot=${slot}`,
    );
  });

  slotWrap.appendChild(button);
  return { slotWrap, stageEl: null, character: null };
}

function renderSlotList(maxSlots, characterRows) {
  disposeCharacterViews();
  characterListEl.innerHTML = "";
  characterListEl.dataset.slotCount = String(maxSlots);
  characterListEl.closest(".character-select")?.setAttribute("data-slot-count", String(maxSlots));

  for (let slot = 1; slot <= maxSlots; slot += 1) {
    const character = characterRows.find((entry) => entry.slotIndex === slot);
    const built = buildSlotElement(slot, character);
    characterListEl.appendChild(built.slotWrap);

    if (built.stageEl && built.character) {
      const view = mountCharacterPortrait(built.stageEl, built.character);
      if (view) {
        characterViews.set(built.character.id, view);
      }
    }
  }

  scheduleSlotCarouselUpdate();
}

function renderPlaceholderCharacterSlots(maxSlots) {
  characters = [];
  maxCharacters = maxSlots;
  selectedCharacterId = null;
  disposeHeroView();
  renderSlotList(maxSlots, []);
  updateActionButtons();
}

function renderCharacters(characterRows, maxSlots, channel) {
  characters = characterRows;
  maxCharacters = maxSlots;
  channelNumber = channel;
  selectedCharacterId = null;
  disposeHeroView();
  renderSlotList(maxSlots, characterRows);
  updateActionButtons();
}

async function loadCharacters() {
  const response = await fetch("/api/characters", { credentials: "same-origin" });
  if (await window.SessionFlow.respondToUnauthorized(response)) {
    return;
  }

  if (!response.ok) {
    showInfoDialog("Error: Could not load characters.");
    return;
  }

  const payload = await response.json();
  championLevelThreshold = Number(payload.championLevelThreshold) || 90;
  renderCharacters(payload.characters, payload.maxCharacters, payload.channel);
}

async function enterSelectedCharacter() {
  if (selectedCharacterId === null || actionInProgress) {
    return;
  }

  actionInProgress = true;
  updateActionButtons();

  try {
    const response = await fetch("/api/select-character", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ characterId: selectedCharacterId }),
    });

    const result = await response.json().catch(() => ({}));
    if (await window.SessionFlow.respondToUnauthorized(response)) {
      actionInProgress = false;
      updateActionButtons();
      return;
    }
    if (!response.ok) {
      actionInProgress = false;
      updateActionButtons();
      showInfoDialog(result.error ? `Error: ${result.error}` : "Error: Character selection failed.");
      return;
    }

    if (result.redirect) {
      await window.ScreenTransition.navigateWithFade(result.redirect);
      return;
    }

    actionInProgress = false;
    updateActionButtons();
    showInfoDialog("Error: Could not enter the game world.");
  } catch {
    await window.SessionFlow.handleConnectionLost();
  }
}

async function returnToSelectChannel() {
  if (actionInProgress) {
    return;
  }

  window.SessionFlow.stopChannelEjectWatch();
  actionInProgress = true;
  updateActionButtons();

  try {
    const response = await fetch("/api/reset-selection", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope: "channel" }),
    });
    const result = await response.json().catch(() => ({}));
    await window.ScreenTransition.navigateWithFade(result.lobbyUrl || "/play/select-channel");
  } catch {
    await window.ScreenTransition.navigateWithFade("/play/select-channel");
  }
}

async function deleteSelectedCharacter() {
  if (selectedCharacterId === null || actionInProgress) {
    return;
  }

  const character = characters.find((entry) => entry.id === selectedCharacterId);
  const characterName = character?.name || "this character";

  showConfirmDialog(`Delete ${characterName}?`, async () => {
    actionInProgress = true;
    updateActionButtons();

    try {
      const response = await fetch("/api/delete-character", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterId: selectedCharacterId }),
      });

      const result = await response.json().catch(() => ({}));
      if (await window.SessionFlow.respondToUnauthorized(response)) {
        return;
      }
      if (!response.ok) {
        showInfoDialog(result.error ? `Error: ${result.error}` : "Error: Could not delete character.");
        return;
      }

      await loadCharacters();
    } catch {
      await window.SessionFlow.handleConnectionLost();
    } finally {
      actionInProgress = false;
      updateActionButtons();
    }
  });
}

infoPrimary.addEventListener("click", async () => {
  const handler = infoPrimaryHandler;
  if (!handler) {
    hideInfoDialog();
    return;
  }
  await handler();
});

infoSecondary.addEventListener("click", async () => {
  const handler = infoSecondaryHandler;
  if (!handler) {
    hideInfoDialog();
    return;
  }
  await handler();
});

selectServerBtn.addEventListener("click", () => {
  void returnToSelectChannel();
});

startBtn.addEventListener("click", () => {
  void enterSelectedCharacter();
});

deleteBtn.addEventListener("click", () => {
  void deleteSelectedCharacter();
});

if (slotsPrevBtn) {
  slotsPrevBtn.addEventListener("click", () => {
    if (slotScrollIndex > 0) {
      slotScrollIndex -= 1;
      updateSlotCarousel();
    }
  });
}

if (slotsNextBtn) {
  slotsNextBtn.addEventListener("click", () => {
    const totalSlots = characterListEl.children.length;
    const maxScrollIndex = Math.max(0, totalSlots - visibleSlotCount);
    if (slotScrollIndex < maxScrollIndex) {
      slotScrollIndex += 1;
      updateSlotCarousel();
    }
  });
}

if (typeof ResizeObserver !== "undefined" && slotsRowEl) {
  const carouselObserver = new ResizeObserver(() => {
    updateSlotCarousel();
  });
  carouselObserver.observe(slotsRowEl);
} else {
  window.addEventListener("resize", () => {
    updateSlotCarousel();
  });
}

void (async () => {
  const status = await window.SessionFlow.redirectForSessionStatus("character");
  if (status.step !== "character") {
    return;
  }

  const maxSlots = Math.max(1, Number(status.maxCharacters) || 4);
  renderPlaceholderCharacterSlots(maxSlots);
  window.SessionFlow.startChannelEjectWatch();
  await loadCharacters();
})();
