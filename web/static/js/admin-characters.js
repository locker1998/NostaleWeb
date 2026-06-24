const listEl = document.getElementById("admin-characters-list");
const summaryEl = document.getElementById("admin-characters-summary");
const errorEl = document.getElementById("admin-characters-error");

function showError(message) {
  errorEl.hidden = !message;
  errorEl.textContent = message || "";
}

function createCharacterRow(character) {
  const item = document.createElement("li");
  item.className = "server-status__row admin-record-list__row";
  if (character.isDeleted) {
    item.classList.add("admin-record-list__row--deleted");
  }

  const info = document.createElement("div");
  info.className = "server-status__info admin-record-list__info";

  const title = document.createElement("span");
  title.className = "server-status__name";
  title.textContent = character.name;

  const meta = document.createElement("span");
  meta.className = "server-status__port";
  const flags = [];
  if (character.isGm) {
    flags.push("GM");
  }
  if (character.isDeleted) {
    flags.push("Deleted");
  }
  meta.textContent =
    `${character.jobLabel} · Lv.${character.level} JobLv.${character.jobLevel} · Slot ${character.slotIndex} · Account: ${character.accountUsername}${flags.length ? ` · ${flags.join(", ")}` : ""}`;

  info.append(title, meta);

  const actions = document.createElement("div");
  actions.className = "admin-record-list__actions";

  if (!character.isDeleted) {
    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "btn btn--ghost btn--sm";
    deleteBtn.textContent = "Delete";
    deleteBtn.addEventListener("click", () => {
      void deleteCharacter(character, deleteBtn);
    });
    actions.appendChild(deleteBtn);
  }

  item.append(info, actions);
  return item;
}

async function deleteCharacter(character, button) {
  if (!window.confirm(`Soft-delete character "${character.name}"?`)) {
    return;
  }

  button.disabled = true;
  showError("");

  try {
    const response = await fetch("/api/admin/delete-character", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ characterId: character.id }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      showError(result.error || "Could not delete character.");
      button.disabled = false;
      return;
    }
    await loadCharacters();
  } catch {
    showError("Could not reach the server.");
    button.disabled = false;
  }
}

function renderCharacters(characters) {
  listEl.innerHTML = "";
  const activeCount = characters.filter((character) => !character.isDeleted).length;
  summaryEl.textContent = `${activeCount} active / ${characters.length} total`;

  if (!characters.length) {
    const empty = document.createElement("li");
    empty.className = "server-status__row server-status__row--message";
    empty.textContent = "No characters found.";
    listEl.appendChild(empty);
    return;
  }

  for (const character of characters) {
    listEl.appendChild(createCharacterRow(character));
  }
}

async function loadCharacters() {
  showError("");
  try {
    const response = await fetch("/api/admin/characters", { credentials: "same-origin" });
    if (response.status === 401 || response.status === 403) {
      window.location.href = "/admin/login";
      return;
    }
    if (!response.ok) {
      throw new Error("Request failed");
    }
    const payload = await response.json();
    renderCharacters(payload.characters || []);
  } catch {
    showError("Could not load characters.");
    listEl.innerHTML = "";
    summaryEl.textContent = "Failed to load characters.";
  }
}

void loadCharacters();
