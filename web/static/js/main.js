const MAX_INFO_WINDOWS = 5;

const HOTKEY_ROWS_DEFAULT = [
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
  ["Q", "W", "E", "R", "T", "Ct+Q", "Ct+W", "Ct+E", "Ct+R", "Ct+T"],
  ["Ct+1", "Ct+2", "Ct+3", "Ct+4", "Ct+5", "Ct+6", "Ct+7", "Ct+8", "Ct+9", "Ct+0"],
];

const HOTKEY_ROWS_ALT = [
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
  ["Ct+1", "Ct+2", "Ct+3", "Ct+4", "Ct+5", "Ct+6", "Ct+7", "Ct+8", "Ct+9", "Ct+0"],
  ["Al+1", "Al+2", "Al+3", "Al+4", "Al+5", "Al+6", "Al+7", "Al+8", "Al+9", "Al+0"],
];

const SKILL_SLOTS = [
  {
    name: "NosBazaar",
    icon: "https://nosapki.com/images/icons/5011.png",
    action: "bazaar",
    hotkey: "1",
    page: 1,
  },
];

const skillSlotsEl = document.getElementById("skill-slots");
const skillbarEl = document.querySelector(".skillbar");
const sceneEl = document.querySelector(".scene--main");
const infoLayerEl = document.getElementById("skill-info-layer");
const pageButtons = document.querySelectorAll(".skillbar__page");
const switchBtn = document.getElementById("skillbar-switch");
const lockBtn = document.getElementById("skillbar-lock");
const settingsBtn = document.getElementById("settings-btn");
const settingsMenu = document.getElementById("settings-menu");
const settingsServerBtn = document.getElementById("settings-server-btn");
const settingsQuitBtn = document.getElementById("settings-quit-btn");
const mainInfoLayer = document.getElementById("main-info-layer");
const mainInfoMessage = document.getElementById("main-info-message");
const mainInfoPrimary = document.getElementById("main-info-primary");
const mainInfoSecondary = document.getElementById("main-info-secondary");
const serverClockTextEl = document.getElementById("server-clock-text");
const mainCharacterViewEl = document.getElementById("main-character-view");
const mainCharacterSpriteEl = document.getElementById("main-character-view-sprite");
const mainCharacterNameEl = document.getElementById("main-character-name");

let settingsOutsideHandler = null;
let mainInfoPrimaryHandler = null;
let mainInfoSecondaryHandler = null;

let skillsByName = new Map();
let infoWindows = [];
let nextReplaceSlot = 1;
let activePage = 1;
let altHotkeys = false;
let slotsLocked = false;
let dragState = null;
let bazaarDragState = null;
let preferencesReady = false;
let mainCharacterView = null;

function getHotkeyRows() {
  return altHotkeys ? HOTKEY_ROWS_ALT : HOTKEY_ROWS_DEFAULT;
}

function resolveSkill(slotConfig) {
  const dbSkill = skillsByName.get(slotConfig.name);
  return {
    ...slotConfig,
    description: dbSkill?.description ?? null,
  };
}

function skillsForPage(page) {
  return new Map(
    SKILL_SLOTS.filter((slot) => slot.page === page).map((slot) => [
      slot.hotkey,
      resolveSkill(slot),
    ]),
  );
}

function openBazaarOverlay() {
  if (typeof window.NosBazaar?.open === "function") {
    window.NosBazaar.open();
    return;
  }

  const layer = document.getElementById("bazaar-layer");
  if (!layer) return;

  layer.hidden = false;
  requestAnimationFrame(() => {
    window.NosBazaar?.reposition?.();
  });
}

function activateSkill(skill) {
  if (!skill) return;
  if (skill.action === "bazaar" || skill.name === "NosBazaar") {
    openBazaarOverlay();
  }
}

async function loadMain() {
  try {
    const meResponse = await fetch("/api/me", { credentials: "same-origin" });
    if (await window.SessionFlow.respondToUnauthorized(meResponse)) {
      return;
    }

    if (meResponse.ok) {
      const me = await meResponse.json();
      window.ChatUI?.setPlayerName(me.name);
      window.ChatUI?.setPlayerChannel(me.channel);
      window.ChatUI?.setPlayerIsGm(me.isGm);
      window.ChatUI?.startPolling?.();
      setServerClockChannel(me.channel);
      window.SessionFlow.startChannelEjectWatch();
      showMainCharacter(me);
    }

    const [skillsResponse, prefsResponse] = await Promise.all([
      fetch("/api/skills", { credentials: "same-origin" }),
      fetch("/api/preferences", { credentials: "same-origin" }),
    ]);

    if (await window.SessionFlow.respondToUnauthorized(skillsResponse)) {
      return;
    }
    if (await window.SessionFlow.respondToUnauthorized(prefsResponse)) {
      return;
    }

    if (skillsResponse.ok) {
      const skillsPayload = await skillsResponse.json();
      skillsByName = new Map(skillsPayload.skills.map((skill) => [skill.name, skill]));
    } else {
      console.warn(`Skills API unavailable: HTTP ${skillsResponse.status}`);
    }

    if (prefsResponse.ok) {
      applyPreferences(await prefsResponse.json());
    } else {
      console.warn(`Preferences API unavailable: HTTP ${prefsResponse.status}`);
      preferencesReady = true;
    }

    renderSkillSlots();
  } catch {
    await window.SessionFlow.handleConnectionLost();
  }
}

function savePreferences() {
  if (!preferencesReady) return;

  void fetch("/api/preferences", {
    method: "PUT",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      skillPage: activePage,
      skillSlotsLocked: slotsLocked,
      skillAltHotkeys: altHotkeys,
    }),
  });
}

function applyPreferences(prefs) {
  preferencesReady = false;
  setActivePage(prefs.skillPage === 2 ? 2 : 1, { persist: false });
  setSlotsLocked(Boolean(prefs.skillSlotsLocked), { persist: false });
  setAltHotkeys(Boolean(prefs.skillAltHotkeys), { persist: false });
  preferencesReady = true;
}

function bringInfoWindowToFront(entry) {
  infoLayerEl.appendChild(entry.el);
}

function acquireInfoSlot() {
  const used = new Set(infoWindows.map((window) => window.slotNumber));
  for (let slot = 1; slot <= MAX_INFO_WINDOWS; slot += 1) {
    if (!used.has(slot)) return slot;
  }

  const slot = nextReplaceSlot;
  const existing = infoWindows.find((window) => window.slotNumber === slot);
  if (existing) closeInfoWindow(existing);

  nextReplaceSlot = (nextReplaceSlot % MAX_INFO_WINDOWS) + 1;
  return slot;
}

function closeInfoWindow(entry) {
  const index = infoWindows.indexOf(entry);
  if (index === -1) return;
  entry.el.remove();
  infoWindows.splice(index, 1);
  refreshInfoWindowTitles();
}

function refreshInfoWindowTitles() {
  const total = infoWindows.length;
  infoWindows.forEach((entry, index) => {
    entry.titleEl.textContent = `Information${index + 1}/${total}`;
  });
}

function positionInfoWindow(el, index) {
  const width = 268;
  const height = 300;
  const sceneWidth = sceneEl.clientWidth;
  const sceneHeight = sceneEl.clientHeight;
  const left = Math.max(8, (sceneWidth - width) / 2 + index * 18);
  const top = Math.max(8, (sceneHeight - height) / 2 - 60 + index * 18);
  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
}

function makeDraggable(entry) {
  entry.el.addEventListener("mousedown", (event) => {
    if (event.button !== 0 || event.target.closest(".skill-info__close")) return;

    bringInfoWindowToFront(entry);
    const rect = entry.el.getBoundingClientRect();
    const sceneRect = sceneEl.getBoundingClientRect();

    dragState = {
      entry,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      sceneLeft: sceneRect.left,
      sceneTop: sceneRect.top,
      sceneWidth: sceneRect.width,
      sceneHeight: sceneRect.height,
      windowWidth: rect.width,
      windowHeight: rect.height,
    };

    entry.el.classList.add("skill-info--dragging");
    event.preventDefault();
  });
}

function onDragMove(event) {
  if (bazaarDragState) {
    const { root, offsetX, offsetY, sceneLeft, sceneTop, sceneWidth, sceneHeight, windowWidth, windowHeight } =
      bazaarDragState;

    let left = event.clientX - sceneLeft - offsetX;
    let top = event.clientY - sceneTop - offsetY;

    left = Math.max(0, Math.min(left, sceneWidth - windowWidth));
    top = Math.max(0, Math.min(top, sceneHeight - windowHeight));

    root.style.left = `${left}px`;
    root.style.top = `${top}px`;
    return;
  }

  if (!dragState) return;

  const { entry, offsetX, offsetY, sceneLeft, sceneTop, sceneWidth, sceneHeight, windowWidth, windowHeight } =
    dragState;

  let left = event.clientX - sceneLeft - offsetX;
  let top = event.clientY - sceneTop - offsetY;

  left = Math.max(0, Math.min(left, sceneWidth - windowWidth));
  top = Math.max(0, Math.min(top, sceneHeight - windowHeight));

  entry.el.style.left = `${left}px`;
  entry.el.style.top = `${top}px`;
}

function onDragEnd() {
  if (bazaarDragState) {
    bazaarDragState.root.classList.remove("bazaar--dragging");
    bazaarDragState = null;
  }
  if (dragState) {
    dragState.entry.el.classList.remove("skill-info--dragging");
    dragState = null;
  }
}

function initBazaarDrag() {
  const root = document.getElementById("bazaar-root");
  const titlebar = document.getElementById("bazaar-titlebar");
  if (!root || !titlebar) return;

  titlebar.addEventListener("mousedown", (event) => {
    if (event.button !== 0 || event.target.closest(".bazaar__close")) return;

    const rect = root.getBoundingClientRect();
    const sceneRect = sceneEl.getBoundingClientRect();

    bazaarDragState = {
      root,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      sceneLeft: sceneRect.left,
      sceneTop: sceneRect.top,
      sceneWidth: sceneRect.width,
      sceneHeight: sceneRect.height,
      windowWidth: rect.width,
      windowHeight: rect.height,
    };

    root.classList.add("bazaar--dragging");
    event.preventDefault();
  });
}

function formatInfoGold(value) {
  return Number(value).toLocaleString("en-US");
}

function formatItemClassLine(item) {
  const classes = [];
  if (item.isSwordsman) classes.push("Swordsman");
  if (item.isArcher) classes.push("Archer");
  if (item.isMage) classes.push("Mage");
  if (item.isMartialArtist) classes.push("Martial Artist");
  if (!classes.length) return null;
  return `${classes.join(", ")} only`;
}

function formatItemRequiredLevel(item) {
  const lines = [];
  if (item.requiredLv != null) lines.push(`RequiredLevel: ${item.requiredLv}Lv`);
  if (item.requiredCLv != null) lines.push(`RequiredClassLevel: ${item.requiredCLv}Lv`);
  return lines.length ? lines.join("\n") : null;
}

function formatItemStats(item) {
  const lines = [];
  const add = (label, value) => {
    if (value != null) lines.push(`${label}: ${value}`);
  };

  if (item.minAttack != null && item.maxAttack != null && item.minAttack !== item.maxAttack) {
    add("MinAttack", item.minAttack);
    add("MaxAttack", item.maxAttack);
  } else if (item.maxAttack != null) {
    add("Attack", item.maxAttack);
  } else if (item.minAttack != null) {
    add("Attack", item.minAttack);
  }

  add("HitRate", item.hitRate);
  add("CritChance", item.critChance);
  add("CritDmg", item.critDmg);
  add("Concentration", item.concentration);
  add("MeleeDefence", item.meleeDefence);
  add("RangedDefence", item.rangedDefence);
  add("MagicDefence", item.magicDefence);
  add("Dodge", item.dodge);
  add("Duration", item.duration);

  return lines;
}

function buildItemSections(item) {
  if (!item) return [];

  const sections = [];
  const push = (kind, lines) => {
    const content = (Array.isArray(lines) ? lines : [lines]).filter(
      (line) => line != null && line !== "",
    );
    if (content.length) sections.push({ kind, lines: content });
  };

  const classLine = formatItemClassLine(item);
  if (classLine) push("class", classLine);

  const requiredLevel = formatItemRequiredLevel(item);
  if (requiredLevel) push("requiredlv", requiredLevel.split("\n"));

  if (item.rarity) push("rarity", item.rarity);

  const stats = formatItemStats(item);
  if (stats.length) push("stats", stats);

  if (item.dynamicGroupName) push("dynamic_group_name", item.dynamicGroupName);

  if (item.price != null) push("price", `Price: ${formatInfoGold(item.price)}`);

  if (item.shell) push("shell", item.shell);

  if (item.effects) push("effects", item.effects);
  if (item.description) push("description", item.description);

  return sections;
}

function appendInfoSections(scroll, sections) {
  for (const section of sections || []) {
    const text = (section.lines || []).filter((line) => line != null && line !== "").join("\n");
    if (!text) continue;

    const block = document.createElement("div");
    block.className = `skill-info__section skill-info__section--${section.kind}`;

    const paragraph = document.createElement("p");
    paragraph.className = "skill-info__text";
    paragraph.textContent = text;
    block.appendChild(paragraph);
    scroll.appendChild(block);
  }
}

function createInfoWindow({ name, icon: iconSrc, sections }, slotNumber) {
  const el = document.createElement("div");
  el.className = "skill-info";
  el.setAttribute("role", "dialog");

  const header = document.createElement("div");
  header.className = "skill-info__header";

  const title = document.createElement("span");
  title.className = "skill-info__title";
  title.textContent = "Information";
  header.appendChild(title);

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "skill-info__close";
  closeBtn.setAttribute("aria-label", "Close");
  header.appendChild(closeBtn);

  const body = document.createElement("div");
  body.className = "skill-info__body";

  const head = document.createElement("div");
  head.className = "skill-info__head";

  const iconEl = document.createElement("img");
  iconEl.className = "skill-info__icon";
  iconEl.src = iconSrc || "";
  iconEl.alt = "";
  head.appendChild(iconEl);

  const nameEl = document.createElement("span");
  nameEl.className = "skill-info__name";
  nameEl.textContent = name;
  head.appendChild(nameEl);

  const scroll = document.createElement("div");
  scroll.className = "skill-info__scroll";
  appendInfoSections(scroll, sections);

  body.appendChild(head);
  body.appendChild(scroll);
  el.appendChild(header);
  el.appendChild(body);

  const entry = { el, headerEl: header, titleEl: title, closeBtn, slotNumber };

  closeBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    closeInfoWindow(entry);
  });

  el.addEventListener("mousedown", (event) => {
    if (event.button !== 0 || event.target.closest(".skill-info__close")) return;
    bringInfoWindowToFront(entry);
  });

  makeDraggable(entry);

  return entry;
}

function openSkillInfo(skill) {
  openInfoWindow({
    name: skill.name,
    icon: skill.icon,
    sections: skill.description ? [{ kind: "description", lines: [skill.description] }] : [],
  });
}

function openItemInfo(listing) {
  const item = listing.item || listing;
  openInfoWindow({
    name: item.name || listing.name,
    icon: listing.icon,
    sections: buildItemSections(item),
  });
}

function openInfoWindow({ name, icon, sections }) {
  const slotNumber = acquireInfoSlot();
  const entry = createInfoWindow({ name, icon, sections }, slotNumber);
  infoWindows.push(entry);
  infoLayerEl.appendChild(entry.el);
  positionInfoWindow(entry.el, infoWindows.length - 1);
  bringInfoWindowToFront(entry);
  refreshInfoWindowTitles();
}

function createSlot(hotkey, skill) {
  const slot = document.createElement("div");
  slot.className = `skill-slot${skill ? " skill-slot--filled" : " skill-slot--empty"}`;
  slot.dataset.hotkey = hotkey;

  const label = document.createElement("span");
  label.className = "skill-slot__hotkey";
  label.textContent = hotkey;
  slot.appendChild(label);

  if (skill) {
    slot.title = skill.name;
    slot.setAttribute("aria-label", `${skill.name} (${hotkey})`);

    const icon = document.createElement("img");
    icon.className = "skill-slot__icon";
    icon.src = skill.icon;
    icon.alt = "";
    slot.appendChild(icon);

    label.classList.add("skill-slot__hotkey--cast");
    label.addEventListener("click", (event) => {
      event.stopPropagation();
      activateSkill(skill);
    });
    slot.addEventListener("dblclick", () => activateSkill(skill));
    slot.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      openSkillInfo(skill);
    });
  } else {
    slot.setAttribute("aria-label", `Empty slot (${hotkey})`);
  }

  return slot;
}

function renderSkillSlots() {
  if (!skillSlotsEl) return;

  const skillsByHotkey = skillsForPage(activePage);
  const hotkeyRows = getHotkeyRows();
  skillSlotsEl.replaceChildren();

  for (let row = hotkeyRows.length - 1; row >= 0; row -= 1) {
    for (const hotkey of hotkeyRows[row]) {
      skillSlotsEl.appendChild(createSlot(hotkey, skillsByHotkey.get(hotkey)));
    }
  }
}

function setActivePage(page, { persist = true } = {}) {
  activePage = page;
  pageButtons.forEach((btn) => {
    btn.classList.toggle("skillbar__page--active", Number(btn.dataset.page) === page);
  });
  renderSkillSlots();
  if (persist) savePreferences();
}

function setAltHotkeys(enabled, { persist = true } = {}) {
  altHotkeys = enabled;
  switchBtn?.classList.toggle("skillbar__side-btn--active", altHotkeys);
  switchBtn?.setAttribute("aria-pressed", String(altHotkeys));
  renderSkillSlots();
  if (persist) savePreferences();
}

function setSlotsLocked(enabled, { persist = true } = {}) {
  slotsLocked = enabled;
  lockBtn?.classList.toggle("skillbar__side-btn--active", slotsLocked);
  lockBtn?.setAttribute("aria-pressed", String(slotsLocked));
  skillbarEl?.classList.toggle("skillbar--slots-locked", slotsLocked);
  if (persist) savePreferences();
}

function hotkeyFromEvent(event) {
  if (event.target.closest("input, textarea, select")) return null;

  let key = event.key;
  if (/^Numpad[0-9]$/.test(event.code)) {
    key = event.code.slice(-1);
  }
  const ctrl = event.ctrlKey;
  const alt = event.altKey;

  if (altHotkeys) {
    if (alt && !ctrl) {
      if (key >= "1" && key <= "9") return `Al+${key}`;
      if (key === "0") return "Al+0";
      return null;
    }
    if (ctrl && !alt) {
      if (key >= "1" && key <= "9") return `Ct+${key}`;
      if (key === "0") return "Ct+0";
      return null;
    }
    if (!ctrl && !alt) {
      if (key >= "1" && key <= "9") return key;
      if (key === "0") return "0";
    }
    return null;
  }

  if (ctrl) {
    if (key >= "1" && key <= "9") return `Ct+${key}`;
    if (key === "0") return "Ct+0";
    if (/^[qewrt]$/i.test(key)) return `Ct+${key.toUpperCase()}`;
    return null;
  }

  if (alt) return null;

  if (key >= "1" && key <= "9") return key;
  if (key === "0") return "0";
  if (/^[qewrt]$/i.test(key)) return key.toUpperCase();
  return null;
}

function onKeyDown(event) {
  if (event.key === "Escape" && mainInfoLayer && !mainInfoLayer.hidden) {
    hideMainInfoDialog();
    return;
  }

  if (event.key === "Escape" && settingsMenu && !settingsMenu.hidden) {
    closeSettingsMenu();
    return;
  }

  if (event.key === "Escape" && infoWindows.length > 0) {
    closeInfoWindow(infoWindows[infoWindows.length - 1]);
    return;
  }

  const hotkey = hotkeyFromEvent(event);
  if (!hotkey) return;

  const skill = skillsForPage(activePage).get(hotkey);
  if (!skill) return;

  event.preventDefault();
  activateSkill(skill);
}

pageButtons.forEach((btn) => {
  btn.addEventListener("click", () => setActivePage(Number(btn.dataset.page)));
});

switchBtn?.addEventListener("click", () => {
  setAltHotkeys(!altHotkeys);
});

lockBtn?.addEventListener("click", () => {
  setSlotsLocked(!slotsLocked);
});

function positionSettingsMenu() {
  if (!settingsBtn || !settingsMenu) return;

  const viewport = document.querySelector(".play-viewport");
  const anchor = settingsBtn.getBoundingClientRect();
  const width = settingsMenu.offsetWidth;
  const height = settingsMenu.offsetHeight;

  if (viewport) {
    const viewportRect = viewport.getBoundingClientRect();
    settingsMenu.style.left = `${anchor.left - viewportRect.left - width}px`;
    settingsMenu.style.top = `${anchor.top - viewportRect.top - height}px`;
    return;
  }

  settingsMenu.style.left = `${anchor.left - width}px`;
  settingsMenu.style.top = `${anchor.top - height}px`;
}

function closeSettingsMenu() {
  if (!settingsMenu || settingsMenu.hidden) return;

  settingsMenu.hidden = true;
  settingsBtn?.setAttribute("aria-expanded", "false");

  if (settingsOutsideHandler) {
    document.removeEventListener("mousedown", settingsOutsideHandler);
    settingsOutsideHandler = null;
  }
}

function openSettingsMenu() {
  if (!settingsMenu) return;

  settingsMenu.hidden = false;
  settingsBtn?.setAttribute("aria-expanded", "true");
  positionSettingsMenu();

  if (settingsOutsideHandler) {
    document.removeEventListener("mousedown", settingsOutsideHandler);
  }

  settingsOutsideHandler = (event) => {
    if (settingsMenu.contains(event.target) || settingsBtn?.contains(event.target)) {
      return;
    }
    closeSettingsMenu();
  };
  document.addEventListener("mousedown", settingsOutsideHandler);
}

function toggleSettingsMenu() {
  if (!settingsMenu || (mainInfoLayer && !mainInfoLayer.hidden)) return;
  if (settingsMenu.hidden) {
    openSettingsMenu();
  } else {
    closeSettingsMenu();
  }
}

function hideMainInfoDialog() {
  if (!mainInfoLayer) return;

  mainInfoLayer.hidden = true;
  mainInfoPrimary.disabled = false;
  mainInfoSecondary.disabled = false;
  mainInfoPrimaryHandler = null;
  mainInfoSecondaryHandler = null;
}

function showMainAlertDialog(message, onConfirm) {
  if (!mainInfoLayer) {
    void onConfirm?.();
    return;
  }

  closeSettingsMenu();
  mainInfoMessage.textContent = message;
  mainInfoSecondary.hidden = true;
  mainInfoPrimary.disabled = false;
  mainInfoPrimaryHandler = async () => {
    mainInfoPrimary.disabled = true;
    try {
      await onConfirm?.();
    } finally {
      mainInfoPrimary.disabled = false;
      hideMainInfoDialog();
    }
  };
  mainInfoSecondaryHandler = null;
  mainInfoLayer.hidden = false;
}

window.showPlayDisconnectDialog = (onConfirm) => {
  showMainAlertDialog("Disconnected from server.", onConfirm);
};

function showMainInfoDialog(message, { onConfirm, onCancel } = {}) {
  if (!mainInfoLayer) return;

  closeSettingsMenu();
  mainInfoMessage.textContent = message;
  mainInfoSecondary.hidden = false;
  mainInfoPrimary.disabled = false;
  mainInfoSecondary.disabled = false;
  mainInfoPrimaryHandler = onConfirm || hideMainInfoDialog;
  mainInfoSecondaryHandler = onCancel || hideMainInfoDialog;
  mainInfoLayer.hidden = false;
}

async function logoutToLogin() {
  hideMainInfoDialog();
  await window.SessionFlow.logoutToLogin();
}

async function quitGame() {
  const result = await window.SessionFlow.logoutToIndex();
  await window.ScreenTransition.navigateWithFade(result.indexUrl || "/");
}

async function returnToSelectChannel() {
  hideMainInfoDialog();
  closeSettingsMenu();
  window.SessionFlow.stopChannelEjectWatch();

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

settingsBtn?.addEventListener("click", (event) => {
  event.stopPropagation();
  toggleSettingsMenu();
});

settingsServerBtn?.addEventListener("click", () => {
  showMainInfoDialog("Log-out?", {
    onConfirm: async () => {
      mainInfoPrimary.disabled = true;
      mainInfoSecondary.disabled = true;
      await returnToSelectChannel();
    },
  });
});

settingsQuitBtn?.addEventListener("click", () => {
  showMainInfoDialog("Do you really want to quit NosTale?", {
    onConfirm: async () => {
      mainInfoPrimary.disabled = true;
      mainInfoSecondary.disabled = true;
      await quitGame();
    },
  });
});

mainInfoPrimary?.addEventListener("click", async () => {
  const handler = mainInfoPrimaryHandler;
  if (!handler) {
    hideMainInfoDialog();
    return;
  }
  await handler();
});

mainInfoSecondary?.addEventListener("click", async () => {
  const handler = mainInfoSecondaryHandler;
  if (!handler) {
    hideMainInfoDialog();
    return;
  }
  await handler();
});

window.addEventListener("resize", () => {
  if (settingsMenu && !settingsMenu.hidden) {
    positionSettingsMenu();
  }
});

document.addEventListener("keydown", onKeyDown);
document.addEventListener("mousemove", onDragMove);
document.addEventListener("mouseup", onDragEnd);

let serverClockChannel = 1;

function formatServerClockTime(date) {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${hours}:${minutes}:${seconds} CH${serverClockChannel}`;
}

function updateServerClock() {
  if (!serverClockTextEl) return;
  serverClockTextEl.textContent = formatServerClockTime(new Date());
}

function setServerClockChannel(channelNumber) {
  serverClockChannel = Number(channelNumber) || 1;
  updateServerClock();
}

function showMainCharacter(me) {
  if (!mainCharacterSpriteEl || !window.CharacterView) {
    return;
  }

  if (!mainCharacterView) {
    mainCharacterView = window.CharacterView.mount(mainCharacterSpriteEl, {
      build: true,
      previewZoom: window.CharacterView.DEFAULT_PREVIEW_ZOOM,
    });
  }

  if (!mainCharacterView) {
    return;
  }

  window.CharacterView.update(mainCharacterView, {
    gender: me.gender,
    job: me.job,
    hairStyle: me.hairStyle,
    hairColour: me.hairColour,
  });

  if (mainCharacterNameEl) {
    mainCharacterNameEl.textContent = me.name || "";
    if (mainCharacterNameEl.parentElement !== mainCharacterView.innerEl) {
      mainCharacterView.innerEl.appendChild(mainCharacterNameEl);
    }
    mainCharacterNameEl.hidden = !me.name;
  }

  if (mainCharacterViewEl) {
    mainCharacterViewEl.hidden = false;
    mainCharacterViewEl.setAttribute("aria-hidden", "false");
  }
}

function initServerClock() {
  updateServerClock();
  window.setInterval(updateServerClock, 1000);
}

function boot() {
  renderSkillSlots();
  initBazaarDrag();
  initServerClock();
  void loadMain();
}

boot();

window.MainUI = {
  openItemInfo,
};
