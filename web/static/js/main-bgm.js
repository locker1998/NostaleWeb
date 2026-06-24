const MAIN_BGM_SRC = "/assets/Milano%20Village.mp3";
const MAIN_BGM_VOLUME = 0.45;

let mainBgmAudio = null;
let mainBgmStarted = false;
let mainBgmStartScheduled = false;

function getMainBgmAudio() {
  if (!mainBgmAudio) {
    mainBgmAudio = new Audio(MAIN_BGM_SRC);
    mainBgmAudio.loop = true;
    mainBgmAudio.preload = "auto";
    mainBgmAudio.volume = MAIN_BGM_VOLUME;
  }
  return mainBgmAudio;
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
  if (mainBgmStarted) {
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
  pause() {
    getMainBgmAudio().pause();
  },
};
