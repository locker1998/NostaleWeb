let sceneEl = null;
let formEl = null;
let channelHintEl = null;
let gendersEl = null;
let hairEl = null;
let jobsEl = null;
let jobNameEl = null;
let jobLine1El = null;
let jobLine2El = null;
let nameInput = null;
let hairColoursEl = null;
let hairStyleCardEl = null;
let cancelBtn = null;
let submitBtn = null;
let characterPreviewView = null;
let pageBooted = false;
let formWired = false;

const TILE_BASE = "/assets/create-character/tiles";
const JOB_DISPLAY_ORDER = ["Adventurer", "Swordsman", "Archer", "Mage", "MartialArtist"];

const JOB_TILES = {
  MartialArtist: { selected: 0, hover: 1, normal: 2, locked: 3 },
  Adventurer: { selected: 4, hover: 5, normal: 6 },
  Swordsman: { selected: 7, hover: 8, normal: 9, locked: 10 },
  Archer: { selected: 11, hover: 12, normal: 13, locked: 14 },
  Mage: { selected: 15, hover: 16, normal: 17, locked: 18 },
};

const GENDER_TILES = {
  male: { normal: 19, active: 20 },
  female: { normal: 21, active: 22 },
};

const HAIR_TILES = {
  A: { normal: 23, selected: 24, pressed: 25 },
  B: { normal: 26, selected: 27, pressed: 28 },
};

const JOB_LABELS = {
  Adventurer: "Adventurer",
  MartialArtist: "Martial Artist",
  Swordsman: "Swordsman",
  Archer: "Archer",
  Mage: "Mage",
};

const PREVIEW_IMAGES = {
  male: {
    Adventurer: "/assets/create-character/male-adventurer.png",
    MartialArtist: "/assets/create-character/male-martial-artist.png",
    Swordsman: "/assets/create-character/male-swordsman.png",
    Archer: "/assets/create-character/male-archer.png",
    Mage: "/assets/create-character/male-mage.png",
  },
  female: {
    Adventurer: "/assets/create-character/female-adventurer.png",
    MartialArtist: "/assets/create-character/female-martial-artist.png",
    Swordsman: "/assets/create-character/female-swordsman.png",
    Archer: "/assets/create-character/female-archer.png",
    Mage: "/assets/create-character/female-mage.png",
  },
};


const JOB_DESCRIPTIONS = {
  Adventurer: {
    name: "Adventurer",
    lines(jobChangeLevel = 15, jobChangeJobLevel = 20) {
      return [
        "If you choose the Adventurer as your starting class, you will start your journey in NosTale at level 1 without a job. You'll learn the most important elements of the game before continuing your journey.",
        `Once you reach level ${jobChangeLevel} and job level ${jobChangeJobLevel}, you can choose one of the three jobs (Swordsmen, Archer or Mage).`,
      ];
    },
  },
  Mage: {
    name: "Mage",
    lines(startLevel = 56) {
      return [
        `If you choose the Mage, you'll start at level ${startLevel} and have some equipment items ready to use. You can use powerful magic attacks which deal huge damage, or support your allies with healing and buff spells.`,
        "As a Mage you can use various specialist cards such as the Voodoo Priest, Holy Mage or Archmage, each of which offers you a unique gaming experience.",
      ];
    },
  },
  Archer: {
    name: "Archer",
    lines(startLevel = 56) {
      return [
        `If you choose the Archer, you'll start at level ${startLevel} and have some equipment items ready to use. You'll be able to use your deadly precision and unbeatable agility to hit your enemies from distance.`,
        "As an Archer you can use various specialist cards such as the Assassin, Scout or Fog Hunter, each of which offers you a unique gaming experience.",
      ];
    },
  },
  Swordsman: {
    name: "Swordsman",
    lines(startLevel = 56) {
      return [
        `If you choose the Swordsman, you'll start at level ${startLevel} and have some equipment items ready to use. You'll fight on the front lines, proving your worth with strong melee combat and stalwart defence.`,
        "As a Swordsman you can use various specialist cards such as the Warrior, Death Reaper or Dragon Knight, each of which offers you a unique gaming experience.",
      ];
    },
  },
  MartialArtist: {
    name: "Martial Artist",
    lines(startLevel = 81) {
      return [
        `If you choose the Martial Artist, you'll start at level ${startLevel} and have some equipment items ready to use. You'll fight your enemies with powerful melee combat techniques.`,
        "As a Martial Artist you can use various specialist cards such as the Thunderer, Mystic Arts or Master Wolf, each of which offers you a unique gaming experience.",
      ];
    },
  },
};

/** Create-character grid order with NosApki hairColors recolor hex (see color-image.js). */
const DEFAULT_HAIR_RECOLOR_HEX = {
  1: "ee6666",
  2: "ff8800",
  3: "cc8844",
  4: "998877",
  5: "aabbcc",
  6: "ffdd55",
  7: "77cc99",
  8: "88ccff",
  9: "bb88ee",
  10: "eedd55",
};

function hairColourOptions() {
  const palette = window.CharacterView?.HAIR_RECOLOR_HEX ?? DEFAULT_HAIR_RECOLOR_HEX;
  return Object.entries(palette).map(([id, hex]) => ({
    id,
    color: `#${hex}`,
  }));
}

const GENDER_DISPLAY_ORDER = ["male", "female"];

let slotIndex = 1;
let selectedGender = "female";
let selectedHairStyle = "A";
let selectedHairColour = "1";
let selectedJob = "Adventurer";
let availableJobs = [];
let actionInProgress = false;
let createOptions = null;
let hoveredGender = null;
let hoveredJob = null;
let pressedHairStyle = null;

const jobButtons = new Map();
const genderButtons = new Map();
const hairButtons = new Map();
const hairColourButtons = new Map();

function tileUrl(index) {
  return `${TILE_BASE}/tile${String(index).padStart(3, "0")}.png`;
}

function setTileBackground(button, index) {
  button.style.backgroundImage = `url("${tileUrl(index)}")`;
}

function getSlotFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const raw = Number(params.get("slot"));
  if (!Number.isInteger(raw) || raw < 1 || raw > 3) {
    return 1;
  }
  return raw;
}

function showError(message) {
  if (!message) {
    window.PlayDialog?.hideAlert?.();
    return;
  }

  window.PlayDialog?.showAlert?.(message);
}

function setFormEnabled(enabled) {
  actionInProgress = !enabled;
  if (nameInput) {
    nameInput.disabled = !enabled;
  }
  if (submitBtn) {
    submitBtn.disabled = !enabled;
  }
  if (cancelBtn) {
    cancelBtn.disabled = !enabled;
  }

  for (const [jobId, button] of jobButtons) {
    const job = availableJobs.find((entry) => entry.id === jobId);
    const locked = !job?.unlocked;
    button.disabled = !enabled || locked;
  }

  for (const button of genderButtons.values()) {
    button.disabled = !enabled;
  }
  for (const button of hairButtons.values()) {
    button.disabled = !enabled;
  }
  for (const button of hairColourButtons.values()) {
    button.disabled = !enabled;
  }
}

function previewImageForSelection(gender, job) {
  return PREVIEW_IMAGES[gender]?.[job] || PREVIEW_IMAGES.female.Adventurer;
}

function updateCharacterPreview() {
  if (!characterPreviewView) {
    return;
  }
  window.CharacterView.update(characterPreviewView, {
    gender: selectedGender,
    job: selectedJob,
    hairStyle: selectedHairStyle,
    hairColour: selectedHairColour,
  });
}

function updatePreviewBackground() {
  if (!sceneEl) {
    return;
  }
  const previewSrc = previewImageForSelection(selectedGender, selectedJob);
  sceneEl.style.backgroundImage = `url("${previewSrc}")`;
  updateCharacterPreview();
}

function jobTileIndex(jobId, unlocked) {
  const tiles = JOB_TILES[jobId];
  if (!tiles) {
    return 6;
  }
  if (!unlocked) {
    return tiles.locked ?? tiles.normal;
  }
  if (selectedJob === jobId) {
    return tiles.selected;
  }
  if (hoveredJob === jobId) {
    return tiles.hover;
  }
  return tiles.normal;
}

function genderTileIndex(gender) {
  const tiles = GENDER_TILES[gender];
  if (selectedGender === gender || hoveredGender === gender) {
    return tiles.active;
  }
  return tiles.normal;
}

function hairTileIndex(style) {
  const tiles = HAIR_TILES[style];
  if (selectedHairStyle === style && pressedHairStyle === style) {
    return tiles.pressed;
  }
  if (selectedHairStyle === style) {
    return tiles.selected;
  }
  return tiles.normal;
}

function refreshJobTiles() {
  for (const [jobId, button] of jobButtons) {
    const job = availableJobs.find((entry) => entry.id === jobId);
    const unlocked = Boolean(job?.unlocked);
    button.disabled = actionInProgress || !unlocked;
    button.dataset.locked = unlocked ? "0" : "1";
    setTileBackground(button, jobTileIndex(jobId, unlocked));
  }
}

function refreshGenderTiles() {
  for (const [gender, button] of genderButtons) {
    button.disabled = actionInProgress;
    setTileBackground(button, genderTileIndex(gender));
  }
}

function refreshHairTiles() {
  for (const [style, button] of hairButtons) {
    button.disabled = actionInProgress;
    setTileBackground(button, hairTileIndex(style));
  }
}

function refreshAllTiles() {
  refreshGenderTiles();
  refreshHairTiles();
  refreshJobTiles();
}

function updateHairStyleCardVisibility() {
  if (!hairStyleCardEl) {
    return;
  }

  const martialArtistSelected = selectedJob === "MartialArtist";
  hairStyleCardEl.style.visibility = martialArtistSelected ? "hidden" : "visible";

  if (martialArtistSelected && selectedHairStyle !== "A") {
    selectedHairStyle = "A";
    pressedHairStyle = null;
    for (const [style, button] of hairButtons) {
      button.setAttribute("aria-pressed", style === "A" ? "true" : "false");
    }
    refreshHairTiles();
    updateCharacterPreview();
  }
}

function renderGenderChoices(genders) {
  if (!gendersEl) {
    return;
  }
  gendersEl.innerHTML = "";
  genderButtons.clear();

  for (const gender of GENDER_DISPLAY_ORDER.filter((value) => genders.includes(value))) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "create-character__tile create-character__tile--gender";
    button.dataset.value = gender;
    button.setAttribute("aria-label", gender === "male" ? "Male" : "Female");
    button.setAttribute("aria-pressed", gender === selectedGender ? "true" : "false");

    button.addEventListener("mouseenter", () => {
      hoveredGender = gender;
      refreshGenderTiles();
    });
    button.addEventListener("mouseleave", () => {
      hoveredGender = null;
      refreshGenderTiles();
    });
    button.addEventListener("click", () => {
      if (actionInProgress) {
        return;
      }
      selectedGender = gender;
      for (const [key, entry] of genderButtons) {
        entry.setAttribute("aria-pressed", key === gender ? "true" : "false");
      }
      updatePreviewBackground();
      refreshGenderTiles();
    });

    genderButtons.set(gender, button);
    gendersEl.appendChild(button);
  }

  refreshGenderTiles();
}

function renderHairChoices(hairStyles) {
  if (!hairEl) {
    return;
  }
  hairEl.innerHTML = "";
  hairButtons.clear();

  for (const style of hairStyles) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "create-character__tile create-character__tile--hair";
    button.dataset.value = style;
    button.setAttribute("aria-label", `Hair style ${style}`);
    button.setAttribute("aria-pressed", style === selectedHairStyle ? "true" : "false");

    button.addEventListener("mousedown", () => {
      if (actionInProgress || selectedHairStyle !== style) {
        return;
      }
      pressedHairStyle = style;
      refreshHairTiles();
    });
    button.addEventListener("mouseup", () => {
      pressedHairStyle = null;
      refreshHairTiles();
    });
    button.addEventListener("mouseleave", () => {
      if (pressedHairStyle === style) {
        pressedHairStyle = null;
        refreshHairTiles();
      }
    });
    button.addEventListener("click", () => {
      if (actionInProgress) {
        return;
      }
      selectedHairStyle = style;
      for (const [key, entry] of hairButtons) {
        entry.setAttribute("aria-pressed", key === style ? "true" : "false");
      }
      refreshHairTiles();
      updateCharacterPreview();
    });

    hairButtons.set(style, button);
    hairEl.appendChild(button);
  }

  refreshHairTiles();
}

function refreshHairColourButtons() {
  for (const [colourId, button] of hairColourButtons) {
    button.classList.toggle(
      "create-character__hair-colour--selected",
      colourId === selectedHairColour,
    );
    button.setAttribute("aria-pressed", colourId === selectedHairColour ? "true" : "false");
  }
}

function renderHairColours() {
  if (!hairColoursEl) {
    return;
  }

  hairColoursEl.innerHTML = "";
  hairColourButtons.clear();

  for (const entry of hairColourOptions()) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "create-character__hair-colour";
    button.dataset.value = entry.id;
    button.style.backgroundColor = entry.color;
    button.setAttribute("aria-label", `Hair colour ${entry.color}`);
    button.setAttribute("aria-pressed", entry.id === selectedHairColour ? "true" : "false");
    if (entry.id === selectedHairColour) {
      button.classList.add("create-character__hair-colour--selected");
    }

    button.addEventListener("click", () => {
      if (actionInProgress) {
        return;
      }
      selectedHairColour = entry.id;
      refreshHairColourButtons();
      updateCharacterPreview();
    });

    hairColourButtons.set(entry.id, button);
    hairColoursEl.appendChild(button);
  }

  refreshHairColourButtons();
}

function renderJobChoices(jobs) {
  if (!jobsEl) {
    return;
  }
  availableJobs = jobs;
  jobsEl.innerHTML = "";
  jobButtons.clear();

  const jobsById = new Map(jobs.map((job) => [job.id, job]));
  let hasSelectable = false;

  for (const jobId of JOB_DISPLAY_ORDER) {
    const job = jobsById.get(jobId);
    if (!job) {
      continue;
    }

    const button = document.createElement("button");
    button.type = "button";
    button.className = "create-character__tile create-character__tile--job";
    button.dataset.value = job.id;
    button.dataset.locked = job.unlocked ? "0" : "1";
    button.setAttribute("aria-label", job.label);
    button.setAttribute("aria-pressed", job.id === selectedJob ? "true" : "false");
    button.disabled = !job.unlocked;

    if (job.unlocked) {
      hasSelectable = true;
    }

    button.addEventListener("mouseenter", () => {
      if (!job.unlocked || actionInProgress) {
        return;
      }
      hoveredJob = job.id;
      refreshJobTiles();
    });
    button.addEventListener("mouseleave", () => {
      if (hoveredJob === job.id) {
        hoveredJob = null;
        refreshJobTiles();
      }
    });
    button.addEventListener("click", () => {
      if (!job.unlocked || actionInProgress) {
        return;
      }
      selectedJob = job.id;
      for (const [key, entry] of jobButtons) {
        entry.setAttribute("aria-pressed", key === job.id ? "true" : "false");
      }
      updatePreviewBackground();
      updateJobDescription();
      updateHairStyleCardVisibility();
      refreshJobTiles();
    });

    jobButtons.set(job.id, button);
    jobsEl.appendChild(button);
  }

  if (!hasSelectable) {
    selectedJob = "";
  } else if (!jobs.some((job) => job.id === selectedJob && job.unlocked)) {
    const firstUnlocked = JOB_DISPLAY_ORDER.map((id) => jobsById.get(id)).find((job) => job?.unlocked);
    selectedJob = firstUnlocked ? firstUnlocked.id : "Adventurer";
  }

  for (const [jobId, button] of jobButtons) {
    button.setAttribute("aria-pressed", jobId === selectedJob ? "true" : "false");
  }

  updatePreviewBackground();
  updateJobDescription();
  updateHairStyleCardVisibility();
  refreshJobTiles();
}

function getJobStartLevel(jobId) {
  const job = availableJobs.find((entry) => entry.id === jobId);
  return job?.startLevel ?? (jobId === "MartialArtist" ? 81 : 56);
}

function updateJobDescription() {
  if (!jobNameEl || !jobLine1El || !jobLine2El) {
    return;
  }
  if (!selectedJob || !JOB_DESCRIPTIONS[selectedJob]) {
    jobNameEl.textContent = "";
    jobLine1El.textContent = "";
    jobLine2El.textContent = "";
    return;
  }

  const description = JOB_DESCRIPTIONS[selectedJob];
  const jobChangeLevel = createOptions?.jobChangeLevel ?? 15;
  const jobChangeJobLevel = createOptions?.jobChangeJobLevel ?? 20;
  const startLevel = getJobStartLevel(selectedJob);

  let lines;
  if (selectedJob === "Adventurer") {
    lines = description.lines(jobChangeLevel, jobChangeJobLevel);
  } else {
    lines = description.lines(startLevel);
  }

  jobNameEl.textContent = description.name;
  jobLine1El.textContent = lines[0] || "";
  jobLine2El.textContent = lines[1] || "";
}

async function loadOptions() {
  slotIndex = getSlotFromQuery();
  const response = await fetch(`/api/create-character/options?slot=${slotIndex}`, {
    credentials: "same-origin",
  });

  if (await window.SessionFlow.respondToUnauthorized(response)) {
    return;
  }

  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    showError(result.error || "Could not load character creation options.");
    setFormEnabled(false);
    return;
  }

  createOptions = await response.json();
  slotIndex = createOptions.slotIndex;
  if (channelHintEl) {
    channelHintEl.textContent = `Slot ${slotIndex} · CH${createOptions.channel}`;
  }
  renderGenderChoices(createOptions.genders);
  renderHairChoices(createOptions.hairStyles || ["A", "B"]);
  renderHairColours();
  renderJobChoices(createOptions.jobs);
}

function defaultJobChoices() {
  return JOB_DISPLAY_ORDER.map((id) => ({
    id,
    label: JOB_LABELS[id] || id,
    unlocked: id !== "MartialArtist",
    startLevel: 1,
    startJobLevel: 1,
  }));
}

function renderDefaultCharacterChoices() {
  renderGenderChoices(GENDER_DISPLAY_ORDER);
  renderHairChoices(["A", "B"]);
  renderHairColours();
  renderJobChoices(defaultJobChoices());
}

function preloadCreateCharacterTiles() {
  const indices = new Set();
  for (const group of [JOB_TILES, GENDER_TILES, HAIR_TILES]) {
    for (const tiles of Object.values(group)) {
      for (const index of Object.values(tiles)) {
        indices.add(index);
      }
    }
  }
  for (const index of indices) {
    const img = new Image();
    img.src = tileUrl(index);
  }
}

function bindPageElements() {
  sceneEl = document.getElementById("create-character-scene");
  formEl = document.getElementById("create-character-form");
  channelHintEl = document.getElementById("create-character-channel-hint");
  gendersEl = document.getElementById("create-character-genders");
  hairEl = document.getElementById("create-character-hair");
  jobsEl = document.getElementById("create-character-jobs");
  jobNameEl = document.getElementById("create-character-job-name");
  jobLine1El = document.getElementById("create-character-job-line-1");
  jobLine2El = document.getElementById("create-character-job-line-2");
  nameInput = document.getElementById("create-character-name");
  hairColoursEl = document.getElementById("create-character-hair-colours");
  hairStyleCardEl = document.getElementById("create-character-hair-style-card");
  cancelBtn = document.getElementById("create-character-cancel-btn");
  submitBtn = document.getElementById("create-character-submit-btn");

  const previewStageEl = document.querySelector(".create-character__preview-stage");
  if (window.CharacterView?.render) {
    characterPreviewView = window.CharacterView.render(
      previewStageEl,
      null,
      { profile: "createCharacter" },
    );
  }
}

function wireFormHandlers() {
  if (formWired || !formEl || !cancelBtn) {
    return;
  }

  formWired = true;

  formEl.addEventListener("submit", async (event) => {
    event.preventDefault();
    showError("");

    const name = nameInput.value.trim();
    if (!name) {
      showError("Character name is required.");
      nameInput.focus();
      return;
    }
    if (!selectedJob) {
      showError("Select a class.");
      return;
    }

    setFormEnabled(false);
    refreshAllTiles();

    try {
      const response = await fetch("/api/create-character", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slotIndex,
          name,
          gender: selectedGender,
          hairStyle: selectedHairStyle,
          hairColour: Number(selectedHairColour),
          job: selectedJob,
        }),
      });

      const result = await response.json().catch(() => ({}));
      if (await window.SessionFlow.respondToUnauthorized(response)) {
        return;
      }
      if (!response.ok) {
        showError(result.error || "Could not create character.");
        setFormEnabled(true);
        refreshAllTiles();
        return;
      }

      await window.ScreenTransition.navigateWithFade("/play/select-character");
    } catch {
      await window.SessionFlow.handleConnectionLost();
      setFormEnabled(true);
      refreshAllTiles();
    }
  });

  cancelBtn.addEventListener("click", () => {
    if (actionInProgress) {
      return;
    }
    void window.ScreenTransition.navigateInstant("/play/select-character");
  });
}

function pageNeedsBoot() {
  return !document.getElementById("create-character-hair-colours")?.childElementCount;
}

async function bootCreateCharacterPage() {
  if (!document.getElementById("create-character-scene")) {
    return;
  }

  if (pageBooted && !pageNeedsBoot()) {
    return;
  }

  pageBooted = true;
  bindPageElements();
  wireFormHandlers();
  renderDefaultCharacterChoices();
  updatePreviewBackground();
  updateJobDescription();
  updateHairStyleCardVisibility();
  preloadCreateCharacterTiles();

  const optionsPromise = loadOptions();
  const status = await window.SessionFlow.redirectForSessionStatus("character");
  if (status.step !== "character") {
    return;
  }

  window.SessionFlow.startChannelEjectWatch();
  await optionsPromise;
}

window.addEventListener("pageshow", (event) => {
  if (event.persisted || pageNeedsBoot()) {
    pageBooted = false;
    void bootCreateCharacterPage();
  }
});

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    void bootCreateCharacterPage();
  });
} else {
  void bootCreateCharacterPage();
}
