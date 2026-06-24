(() => {
  // Client-only UI preferences — localStorage only, not server/DB.
  const STORAGE_KEY = "nostaleweb.gameConfig";

  const DEFAULT_SETTINGS = {
    displayMode: "1024x768",
    windowMode: true,
    sfxVolume: 100,
    sfxMuted: false,
    bgmVolume: 45,
    bgmMuted: false,
    position: null,
  };

  const DISPLAY_MODES = [
    { id: "1024x768", label: "1024 x 768" },
    { id: "1280x1024", label: "1280 x 1024" },
    { id: "1280x800", label: "1280 x 800" },
    { id: "1440x900", label: "1440 x 900" },
    { id: "1024x700", label: "1024 x 700" },
    { id: "1680x1050", label: "1680 x 1050" },
    { id: "fullscreen-window", label: "Full Screen Window Mode", fullWidth: true },
  ];

  const layerEl = document.getElementById("game-config-layer");
  const rootEl = document.getElementById("game-config-root");
  const titlebarEl = document.getElementById("game-config-titlebar");
  const closeBtn = document.getElementById("game-config-close");
  const windowModeEl = document.getElementById("game-config-window-mode");
  const displayGridEl = document.getElementById("game-config-display-grid");
  const sfxVolumeEl = document.getElementById("game-config-sfx-volume");
  const sfxMuteEl = document.getElementById("game-config-sfx-mute");
  const bgmVolumeEl = document.getElementById("game-config-bgm-volume");
  const bgmMuteEl = document.getElementById("game-config-bgm-mute");
  const resetUiBtn = document.getElementById("game-config-reset-ui");
  const optionsBtn = document.getElementById("game-config-options");
  const sceneEl = document.querySelector(".scene--main");

  let settings = loadSettings();
  let userMoved = Boolean(settings.position);

  function loadSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return { ...DEFAULT_SETTINGS };
      }
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  function saveSettings() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Ignore storage errors.
    }
  }

  function showNotImplemented() {
    window.showMainAlertDialog?.("This feature is not implemented yet.");
  }

  function applyAudioSettings() {
    window.UiSound?.setVolume?.(settings.sfxMuted ? 0 : settings.sfxVolume / 100);
    window.UiSound?.setMuted?.(settings.sfxMuted);
    window.MainBgm?.setVolume?.(settings.bgmMuted ? 0 : settings.bgmVolume / 100);
    window.MainBgm?.setMuted?.(settings.bgmMuted);
  }

  function setDisplayMode(modeId) {
    settings.displayMode = modeId;
    saveSettings();
    renderDisplayButtons();
  }

  function renderDisplayButtons() {
    if (!displayGridEl) {
      return;
    }

    displayGridEl.querySelectorAll("[data-display-mode]").forEach((button) => {
      const active = button.dataset.displayMode === settings.displayMode;
      button.classList.toggle("game-config__display-btn--active", active);
    });
  }

  function buildDisplayButtons() {
    if (!displayGridEl) {
      return;
    }

    displayGridEl.replaceChildren();
    for (const mode of DISPLAY_MODES) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "bazaar__btn game-config__display-btn";
      if (mode.fullWidth) {
        button.classList.add("game-config__display-btn--full");
      }
      button.dataset.displayMode = mode.id;
      button.textContent = mode.label;
    button.addEventListener("click", () => {
      showNotImplemented();
    });
      displayGridEl.appendChild(button);
    }
    renderDisplayButtons();
  }

  async function applyWindowMode(windowMode) {
    settings.windowMode = windowMode;
    saveSettings();

    try {
      if (windowMode) {
        if (document.fullscreenElement) {
          await document.exitFullscreen();
        }
        return;
      }
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      windowModeEl.checked = true;
      settings.windowMode = true;
      saveSettings();
    }
  }

  function syncWindowModeCheckbox() {
    if (!windowModeEl) {
      return;
    }
    const inFullscreen = Boolean(document.fullscreenElement);
    windowModeEl.checked = inFullscreen ? false : settings.windowMode;
  }

  function syncControlsFromSettings() {
    if (windowModeEl) {
      windowModeEl.checked = settings.windowMode;
    }
    if (sfxVolumeEl) {
      sfxVolumeEl.value = String(settings.sfxVolume);
    }
    if (sfxMuteEl) {
      sfxMuteEl.checked = settings.sfxMuted;
    }
    if (bgmVolumeEl) {
      bgmVolumeEl.value = String(settings.bgmVolume);
    }
    if (bgmMuteEl) {
      bgmMuteEl.checked = settings.bgmMuted;
    }
    renderDisplayButtons();
    applyAudioSettings();
    syncWindowModeCheckbox();
  }

  function positionGameConfigWindow() {
    if (!rootEl || !sceneEl) {
      return;
    }

    const pad = 8;
    const width = rootEl.offsetWidth || 320;
    const height = rootEl.offsetHeight || 420;

    if (settings.position && userMoved) {
      rootEl.style.right = "auto";
      rootEl.style.bottom = "auto";
      rootEl.style.left = `${settings.position.left}px`;
      rootEl.style.top = `${settings.position.top}px`;
      return;
    }

    const left = Math.max(pad, sceneEl.clientWidth - width - pad);
    const top = Math.max(pad, sceneEl.clientHeight - height - pad);
    rootEl.style.right = "auto";
    rootEl.style.bottom = "auto";
    rootEl.style.left = `${left}px`;
    rootEl.style.top = `${top}px`;
  }

  function rememberWindowPosition() {
    if (!rootEl) {
      return;
    }
    settings.position = {
      left: Number.parseFloat(rootEl.style.left) || 0,
      top: Number.parseFloat(rootEl.style.top) || 0,
    };
    userMoved = true;
    saveSettings();
  }

  function openGameConfigWindow() {
    if (!layerEl || !rootEl) {
      return;
    }

    settings = loadSettings();
    userMoved = Boolean(settings.position);
    syncControlsFromSettings();
  layerEl.hidden = false;
  positionGameConfigWindow();
  window.NosWindowFocus?.bringToFront?.(rootEl);
}

  function closeGameConfigWindow() {
    if (layerEl) {
      layerEl.hidden = true;
    }
  }

  function wireControls() {
    windowModeEl?.addEventListener("change", () => {
      void applyWindowMode(windowModeEl.checked);
    });

    sfxVolumeEl?.addEventListener("input", () => {
      settings.sfxVolume = Number(sfxVolumeEl.value);
      saveSettings();
      applyAudioSettings();
    });

    sfxMuteEl?.addEventListener("change", () => {
      settings.sfxMuted = sfxMuteEl.checked;
      saveSettings();
      applyAudioSettings();
    });

    bgmVolumeEl?.addEventListener("input", () => {
      settings.bgmVolume = Number(bgmVolumeEl.value);
      saveSettings();
      applyAudioSettings();
    });

    bgmMuteEl?.addEventListener("change", () => {
      settings.bgmMuted = bgmMuteEl.checked;
      saveSettings();
      applyAudioSettings();
    });

    resetUiBtn?.addEventListener("click", showNotImplemented);
    optionsBtn?.addEventListener("click", showNotImplemented);
    closeBtn?.addEventListener("click", closeGameConfigWindow);

    document.addEventListener("fullscreenchange", () => {
      if (!layerEl || layerEl.hidden) {
        return;
      }
      syncWindowModeCheckbox();
    });
  }

  buildDisplayButtons();
  wireControls();
  syncControlsFromSettings();

  window.GameConfig = {
    open: openGameConfigWindow,
    close: closeGameConfigWindow,
    reposition: positionGameConfigWindow,
    rememberPosition: rememberWindowPosition,
  };

  window.addEventListener("resize", () => {
    if (layerEl && !layerEl.hidden && !userMoved) {
      positionGameConfigWindow();
    }
  });
})();
