const CLICK_SOUND_SRC = "/assets/click.mp3";

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
  ".chatbox__tab",
  ".chatbox__scroll-btn",
  ".chatbox__channel-btn",
  ".chatbox__channel-arrow",
  ".chatbox__macro-btn",
  ".server-select__item--server",
  ".server-select__item--channel",
  ".server-select__leave",
  ".selection-list__item",
  ".create-character__tile",
  ".create-character__btn",
  "#create-character-submit-btn",
  "#create-character-cancel-btn",
  ".login__btn",
  ".login-info__btn",
].join(", ");

let clickAudio = null;
let lastPlayedAt = 0;
let audioUnlocked = false;

function getClickAudio() {
  if (!clickAudio) {
    clickAudio = new Audio(CLICK_SOUND_SRC);
    clickAudio.preload = "auto";
  }
  return clickAudio;
}

function unlockAudio() {
  if (audioUnlocked) {
    return;
  }
  const audio = getClickAudio();
  audio.volume = 1;
  const attempt = audio.play();
  if (!attempt) {
    audioUnlocked = true;
    return;
  }
  attempt
    .then(() => {
      audio.pause();
      audio.currentTime = 0;
      audioUnlocked = true;
      window.MainBgm?.start?.();
    })
    .catch(() => {});
}

function playClickSound() {
  if (!audioUnlocked) {
    unlockAudio();
  }

  const now = Date.now();
  if (now - lastPlayedAt < 80) {
    return;
  }
  lastPlayedAt = now;

  const audio = getClickAudio();
  audio.currentTime = 0;
  void audio.play().catch(() => {});
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
  if (!isGameButton(event.target)) {
    return;
  }
  playClickSound();
}

document.addEventListener(
  "pointerdown",
  (event) => {
    unlockAudio();
    handleGameButtonPress(event);
  },
  { capture: true, passive: true },
);
document.addEventListener("click", handleGameButtonPress, true);
document.addEventListener("contextmenu", (event) => {
  event.preventDefault();
});

window.UiSound = {
  playClickSound,
};
