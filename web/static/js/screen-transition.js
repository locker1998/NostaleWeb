const FADE_MS = 700;
const BLACK_HOLD_MS = 120;
const STORAGE_KEY = "nosbazaar.fadeIn";

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function applyFadeDuration() {
  document.documentElement.style.setProperty("--screen-fade-ms", `${FADE_MS}ms`);
}

function hold(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function nextFrame() {
  return new Promise((resolve) => {
    requestAnimationFrame(resolve);
  });
}

async function nextPaint() {
  await nextFrame();
  await nextFrame();
}

function ensureOverlay() {
  let overlay = document.querySelector(".screen-transition__overlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.className = "screen-transition__overlay";
    overlay.setAttribute("aria-hidden", "true");
    document.body.appendChild(overlay);
  }
  return overlay;
}

function animateOverlay(overlay, toVisible) {
  return new Promise((resolve) => {
    let finished = false;

    const finish = () => {
      if (finished) {
        return;
      }
      finished = true;
      overlay.removeEventListener("transitionend", onTransitionEnd);
      resolve();
    };

    const onTransitionEnd = (event) => {
      if (event.target !== overlay || event.propertyName !== "opacity") {
        return;
      }
      finish();
    };

    overlay.addEventListener("transitionend", onTransitionEnd);
    window.setTimeout(finish, FADE_MS + 100);

    if (toVisible) {
      overlay.classList.remove("screen-transition__overlay--instant");
      void overlay.offsetHeight;
      overlay.classList.add("screen-transition__overlay--visible");
      return;
    }

    overlay.classList.remove("screen-transition__overlay--visible");
  });
}

function shouldFadeInFromPage() {
  try {
    if (sessionStorage.getItem(STORAGE_KEY) === "1") {
      return true;
    }
  } catch {
    // Ignore storage errors.
  }

  try {
    return new URLSearchParams(window.location.search).get("fadeIn") === "1";
  } catch {
    return false;
  }
}

function withFadeInFlag(url) {
  try {
    const target = new URL(url, window.location.href);
    target.searchParams.set("fadeIn", "1");
    return target.toString();
  } catch {
    return url;
  }
}

function clearFadeInFromUrl() {
  try {
    const current = new URL(window.location.href);
    if (!current.searchParams.has("fadeIn")) {
      return;
    }
    current.searchParams.delete("fadeIn");
    const nextUrl = `${current.pathname}${current.search}${current.hash}`;
    window.history.replaceState({}, "", nextUrl);
  } catch {
    // Ignore URL cleanup errors.
  }
}

function markPendingFadeIn() {
  if (prefersReducedMotion()) {
    return;
  }

  if (!shouldFadeInFromPage()) {
    return;
  }

  const root = document.documentElement;
  root.classList.add("screen-transition--pending-in");
  root.style.backgroundColor = "#000";
}

async function fadeToBlack() {
  if (prefersReducedMotion()) {
    return;
  }

  const overlay = ensureOverlay();
  overlay.classList.remove("screen-transition__overlay--visible", "screen-transition__overlay--instant");
  void overlay.offsetHeight;

  await nextPaint();
  await animateOverlay(overlay, true);
  await hold(BLACK_HOLD_MS);
}

async function navigateWithFade(url) {
  await fadeToBlack();

  try {
    sessionStorage.setItem(STORAGE_KEY, "1");
  } catch {
    // Continue without fade-in on the next page.
  }

  window.location.href = withFadeInFlag(url);
}

function navigateInstant(url) {
  window.location.href = url;
}

function removeOverlay(overlay) {
  overlay.classList.remove(
    "screen-transition__overlay--visible",
    "screen-transition__overlay--instant",
  );
  overlay.remove();
}

async function fadeInIfNeeded() {
  const root = document.documentElement;

  if (prefersReducedMotion()) {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore storage errors.
    }
    root.classList.remove("screen-transition--pending-in");
    root.style.backgroundColor = "";
    return;
  }

  let shouldFadeIn = shouldFadeInFromPage();
  if (shouldFadeIn) {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore storage errors.
    }
  }

  if (!shouldFadeIn) {
    return;
  }

  const overlay = ensureOverlay();
  overlay.classList.add("screen-transition__overlay--visible", "screen-transition__overlay--instant");
  void overlay.offsetHeight;

  await nextPaint();
  await hold(BLACK_HOLD_MS);

  overlay.classList.remove("screen-transition__overlay--instant");
  await nextPaint();
  await animateOverlay(overlay, false);

  root.classList.remove("screen-transition--pending-in");
  root.style.backgroundColor = "";
  clearFadeInFromUrl();
  removeOverlay(overlay);
}

window.ScreenTransition = {
  FADE_MS,
  BLACK_HOLD_MS,
  markPendingFadeIn,
  fadeToBlack,
  navigateWithFade,
  navigateInstant,
  fadeInIfNeeded,
};

applyFadeDuration();
markPendingFadeIn();

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    void fadeInIfNeeded();
  });
} else {
  void fadeInIfNeeded();
}
