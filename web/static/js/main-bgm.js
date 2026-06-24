const MAIN_BGM_SRC = "/assets/Milano%20Village.mp3";
const MAIN_BGM_VOLUME = 0.45;

let mainBgmAudio = null;
let mainBgmStarted = false;
let mainBgmStartScheduled = false;
let bgmVolume = MAIN_BGM_VOLUME;
let bgmMuted = false;
function getMainBgmAudio() {
  if (!mainBgmAudio) {
    mainBgmAudio = new Audio(MAIN_BGM_SRC);
    mainBgmAudio.loop = true;
    mainBgmAudio.preload = "auto";
    mainBgmAudio.volume = bgmMuted ? 0 : bgmVolume;
  }
  return mainBgmAudio;
}

function applyBgmVolume() {
  const audio = getMainBgmAudio();
  audio.volume = bgmMuted ? 0 : bgmVolume;
}

function setBgmVolume(volume) {
  const normalized = Number(volume);
  bgmVolume = Number.isFinite(normalized) ? Math.min(1, Math.max(0, normalized)) : MAIN_BGM_VOLUME;
  applyBgmVolume();
}

function setBgmMuted(muted) {
  bgmMuted = Boolean(muted);
  applyBgmVolume();
  const audio = getMainBgmAudio();
  if (bgmMuted) {
    audio.pause();
    return;
  }
  void resumeMainBgm();
}
function shouldDelayForScreenFadeIn() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return false;
  }
  try {
    return (
      sessionStorage.getItem("nosbazaar.fadeIn") === "1" ||
      new URLSearchParams(window.location.search).get("fadeIn") === "1"
    );
  } catch {
    return false;
  }
}

function getMainBgmStartDelayMs() {
  if (!shouldDelayForScreenFadeIn()) {
    return 0;
  }
  const fadeMs = window.ScreenTransition?.FADE_MS ?? 700;
  const holdMs = window.ScreenTransition?.BLACK_HOLD_MS ?? 120;
  return fadeMs + holdMs;
}

async function startMainBgm() {
  if (bgmMuted) {
    return;
  }

  const audio = getMainBgmAudio();
  try {
    await audio.play();
    mainBgmStarted = true;
  } catch {
    // Autoplay blocked until the player interacts.
  }
}

async function resumeMainBgm() {
  if (bgmMuted) {
    return;
  }

  const audio = getMainBgmAudio();
  try {
    if (audio.paused) {
      await audio.play();
    }
    mainBgmStarted = true;
  } catch {
    // Playback may still be blocked until the player interacts.
  }
}

function scheduleMainBgmStart() {
  if (mainBgmStartScheduled) {
    return;
  }
  mainBgmStartScheduled = true;

  window.setTimeout(() => {
    void startMainBgm();
  }, getMainBgmStartDelayMs());

  document.addEventListener(
    "pointerdown",
    () => {
      void startMainBgm();
    },
    { capture: true, passive: true },
  );
}

function initMainBgm() {
  if (!document.body.classList.contains("page-main")) {
    return;
  }
  scheduleMainBgmStart();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initMainBgm);
} else {
  initMainBgm();
}

window.MainBgm = {
  start: startMainBgm,
  resume: resumeMainBgm,
  setVolume: setBgmVolume,
  setMuted: setBgmMuted,
  pause() {
    getMainBgmAudio().pause();
  },
};