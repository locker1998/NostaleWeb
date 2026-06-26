const CLICK_SOUND_SRC = "/assets/click.mp3";
const CLICK_SOUND_FALLBACK_MS = 280;
const CLICK_SOUND_DEBOUNCE_MS = 60;

// Game UI actions that play the click sound — not every HTML <button>.
const GAME_BUTTON_SELECTOR = [
  ".bazaar__btn",
  ".bazaar__tab",
  ".bazaar__close",
  ".bazaar__pager-arrow",
  ".bazaar__page-num",
  ".bazaar__custom-select__trigger",
  ".bazaar__custom-select__option",
  ".bazaar__purchase-step",
  ".bazaar__purchase-ok",
  ".skillbar__page",
  ".skillbar__side-btn",
  ".skill-info__close",
  ".settings-btn",
  ".settings-menu__inventory-btn",
  ".chatbox__tab",
  ".chatbox__scroll-btn",
  ".chatbox__channel-btn",
  ".chatbox__channel-arrow",
  ".chatbox__macro-btn",
  ".server-select__item--server",
  ".server-select__item--channel",
  ".server-select__leave",
  ".character-select__slot-btn",
  ".character-select__action-btn",
  ".character-select__nav",
  ".selection-list__item",
  ".selection-list__item--empty",
  ".create-character__tile",
  ".create-character__btn",
  "#create-character-submit-btn",
  "#create-character-cancel-btn",
  ".login__btn",
  ".login-info__btn",
  ".game-config__display-btn",
  ".game-config__footer-btn",
  ".game-config__window-mode",
  ".game-config__mute",
  ".inventory__tab",
].join(", ");

let unlockProbe = null;
let lastPlayedAt = 0;
let audioUnlocked = false;
let sfxVolume = 1;
let sfxMuted = false;
let clickSoundPlayback = null;

function getEffectiveSfxVolume() {
  return sfxMuted ? 0 : sfxVolume;
}

function getUnlockProbe() {
  if (!unlockProbe) {
    unlockProbe = new Audio(CLICK_SOUND_SRC);
    unlockProbe.preload = "auto";
  }
  return unlockProbe;
}

function markAudioUnlocked() {
  if (audioUnlocked) {
    return;
  }
  audioUnlocked = true;
  try {
    sessionStorage.setItem("nosbazaar.audioUnlocked", "1");
  } catch {
    // Ignore storage errors.
  }
  void window.MainBgm?.start?.();
}

function tryStartMainBgm() {
  if (document.body.classList.contains("page-main")) {
    void window.MainBgm?.start?.();
  }
}

function unlockAudio() {
  if (audioUnlocked) {
    return;
  }

  const probe = getUnlockProbe();
  probe.volume = 0.001;
  probe.currentTime = 0;
  const attempt = probe.play();
  if (!attempt) {
    markAudioUnlocked();
    return;
  }

  attempt
    .then(() => {
      probe.pause();
      probe.currentTime = 0;
      markAudioUnlocked();
    })
    .catch(() => {});
}

function playClickSound() {
  if (sfxMuted) {
    clickSoundPlayback = Promise.resolve();
    return clickSoundPlayback;
  }

  if (!audioUnlocked) {
    unlockAudio();
  }

  const now = Date.now();
  if (now - lastPlayedAt < CLICK_SOUND_DEBOUNCE_MS && clickSoundPlayback) {
    return clickSoundPlayback;
  }
  lastPlayedAt = now;

  const audio = new Audio(CLICK_SOUND_SRC);
  audio.preload = "auto";
  audio.volume = getEffectiveSfxVolume();

  const playback = new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) {
        return;
      }
      settled = true;
      resolve();
    };

    audio.addEventListener("ended", finish, { once: true });
    window.setTimeout(finish, CLICK_SOUND_FALLBACK_MS);
    void audio.play().catch(finish);
  });

  clickSoundPlayback = playback;
  void playback.finally(() => {
    if (clickSoundPlayback === playback) {
      clickSoundPlayback = null;
    }
  });

  return playback;
}

async function waitForClickSound() {
  const pending = clickSoundPlayback || Promise.resolve();
  const cap = new Promise((resolve) => {
    window.setTimeout(resolve, CLICK_SOUND_FALLBACK_MS + 60);
  });
  await Promise.race([pending, cap]);
}

function setSfxVolume(volume) {
  const normalized = Number(volume);
  sfxVolume = Number.isFinite(normalized) ? Math.min(1, Math.max(0, normalized)) : 1;
}

function setSfxMuted(muted) {
  sfxMuted = Boolean(muted);
}

function pressTargetElement(target) {
  if (target instanceof Element) {
    return target;
  }
  if (target instanceof Node) {
    return target.parentElement;
  }
  return null;
}

function isGameButton(target) {
  const element = pressTargetElement(target);
  if (!element) {
    return false;
  }
  if (element.closest(".skill-slot")) {
    return false;
  }
  return Boolean(element.closest(GAME_BUTTON_SELECTOR));
}

function handleGameButtonPress(event) {
  if (event.button !== 0) {
    return;
  }
  if (!isGameButton(event.target)) {
    return;
  }
  playClickSound();
}

function shouldPlayKeyboardAction(target, key) {
  if (!(target instanceof Element)) {
    return false;
  }
  if (target.closest(".chatbox")) {
    return false;
  }
  if (key === " " && target.matches("input, textarea, select")) {
    return false;
  }
  if (target.matches("input, select, textarea")) {
    const form = target.form;
    return Boolean(form?.querySelector(GAME_BUTTON_SELECTOR));
  }
  return isGameButton(target);
}

function handleGameButtonKeydown(event) {
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }
  if (event.repeat || event.defaultPrevented) {
    return;
  }
  if (!shouldPlayKeyboardAction(event.target, event.key)) {
    return;
  }
  playClickSound();
}

document.addEventListener(
  "pointerdown",
  (event) => {
    unlockAudio();
    tryStartMainBgm();
    handleGameButtonPress(event);
  },
  { capture: true, passive: true },
);
document.addEventListener("keydown", (event) => {
  unlockAudio();
  tryStartMainBgm();
  handleGameButtonKeydown(event);
}, true);
document.addEventListener("contextmenu", (event) => {
  event.preventDefault();
});

window.UiSound = {
  playClickSound,
  waitForClickSound,
  setVolume: setSfxVolume,
  setMuted: setSfxMuted,
};
