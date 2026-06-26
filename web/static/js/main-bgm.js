const MAIN_BGM_SRC = "/assets/Milano%20Village.mp3";
const MAIN_BGM_VOLUME = 0.45;
const AUDIO_UNLOCK_KEY = "nosbazaar.audioUnlocked";

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
  void startMainBgm();
}

function markAudioUnlocked() {
  try {
    sessionStorage.setItem(AUDIO_UNLOCK_KEY, "1");
  } catch {
    // Ignore storage errors.
  }
}

function wasAudioUnlocked() {
  try {
    return sessionStorage.getItem(AUDIO_UNLOCK_KEY) === "1";
  } catch {
    return false;
  }
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

function waitForBgmReady(audio) {
  if (audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      audio.removeEventListener("canplaythrough", onReady);
      audio.removeEventListener("canplay", onReady);
      audio.removeEventListener("error", onError);
    };
    const onReady = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("BGM failed to load"));
    };

    audio.addEventListener("canplaythrough", onReady, { once: true });
    audio.addEventListener("canplay", onReady, { once: true });
    audio.addEventListener("error", onError, { once: true });
    audio.load();
  });
}

async function startMainBgm() {
  if (bgmMuted || !document.body.classList.contains("page-main")) {
    return false;
  }

  const audio = getMainBgmAudio();
  try {
    await waitForBgmReady(audio);
    if (audio.paused) {
      await audio.play();
    }
    mainBgmStarted = true;
    markAudioUnlocked();
    return true;
  } catch {
    return false;
  }
}

async function resumeMainBgm() {
  return startMainBgm();
}

function scheduleMainBgmStart() {
  if (mainBgmStartScheduled) {
    return;
  }
  mainBgmStartScheduled = true;

  const tryStart = () => {
    void startMainBgm();
  };

  window.setTimeout(tryStart, getMainBgmStartDelayMs());

  if (wasAudioUnlocked()) {
    window.setTimeout(tryStart, getMainBgmStartDelayMs() + 120);
  }

  const onUserActivate = () => {
    void startMainBgm();
  };

  document.addEventListener("pointerdown", onUserActivate, { capture: true, passive: true });
  document.addEventListener("keydown", onUserActivate, { capture: true });
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
