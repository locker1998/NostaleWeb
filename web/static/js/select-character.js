const characterListEl = document.getElementById("character-list");
const channelHintEl = document.getElementById("character-channel-hint");
const selectServerBtn = document.getElementById("character-select-server-btn");
const startBtn = document.getElementById("character-start-btn");
const deleteBtn = document.getElementById("character-delete-btn");
const infoLayer = document.getElementById("login-info-layer");
const infoMessage = document.getElementById("login-info-message");
const infoPrimary = document.getElementById("login-info-primary");
const infoSecondary = document.getElementById("login-info-secondary");

let infoPrimaryHandler = null;
let infoSecondaryHandler = null;
let characters = [];
let maxCharacters = 3;
let channelNumber = 1;
let championLevelThreshold = 90;
let selectedCharacterId = null;
let actionInProgress = false;

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
  infoLayer.hidden = false;
}

window.showPlayDisconnectDialog = (onConfirm) => {
  showAlertDialog("Disconnected from server.", onConfirm);
};

function showInfoDialog(message) {
  infoMessage.textContent = message;
  infoSecondary.hidden = true;
  infoPrimaryHandler = hideInfoDialog;
  infoSecondaryHandler = null;
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

function selectCharacterRow(characterId) {
  selectedCharacterId = characterId;
  for (const row of characterListEl.querySelectorAll(".selection-list__item--character")) {
    const isSelected = Number(row.dataset.characterId) === characterId;
    row.classList.toggle("selection-list__item--selected", isSelected);
    row.setAttribute("aria-selected", isSelected ? "true" : "false");
  }
  updateActionButtons();
}

function renderCharacters(characterRows, maxSlots, channel) {
  characters = characterRows;
  maxCharacters = maxSlots;
  channelNumber = channel;
  selectedCharacterId = null;
  characterListEl.innerHTML = "";
  channelHintEl.textContent = `Entering CH${channel}`;

  for (let slot = 1; slot <= maxSlots; slot += 1) {
    const character = characterRows.find((entry) => entry.slotIndex === slot);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "selection-list__item bazaar__btn";
    button.setAttribute("role", "option");

    if (character) {
      button.classList.add("selection-list__item--character");
      button.dataset.characterId = String(character.id);
      button.setAttribute("aria-selected", "false");

      const levels = document.createElement("span");
      levels.className = "selection-list__levels";
      levels.textContent = formatLevelLine(character);

      const name = document.createElement("span");
      name.className = "selection-list__name";
      name.textContent = character.name;

      button.append(levels, name);
      button.addEventListener("click", () => {
        selectCharacterRow(character.id);
      });
      button.addEventListener("dblclick", () => {
        selectCharacterRow(character.id);
        void enterSelectedCharacter();
      });
    } else {
      button.classList.add("selection-list__item--empty");
      button.disabled = false;
      button.dataset.slotIndex = String(slot);

      const label = document.createElement("span");
      label.className = "selection-list__create";
      label.textContent = "Create Character";
      button.appendChild(label);
      button.addEventListener("click", () => {
        void window.ScreenTransition.navigateInstant(
          `/play/create-character?slot=${slot}`,
        );
      });
    }

    characterListEl.appendChild(button);
  }

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

void (async () => {
  const status = await window.SessionFlow.redirectForSessionStatus("character");
  if (status.step === "character") {
    window.SessionFlow.startChannelEjectWatch();
    await loadCharacters();
  }
})();
