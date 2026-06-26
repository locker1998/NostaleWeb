const loginForm = document.getElementById("login-form");
const loginBtn = document.getElementById("login-btn");
const loginCancel = document.getElementById("login-cancel");
const usernameInput = document.getElementById("login-username");
const passwordInput = document.getElementById("login-password");
const infoLayer = document.getElementById("login-info-layer");
const infoMessage = document.getElementById("login-info-message");
const infoPrimary = document.getElementById("login-info-primary");
const infoSecondary = document.getElementById("login-info-secondary");

let infoPrimaryHandler = null;
let infoSecondaryHandler = null;
let loginInProgress = false;

function isInfoDialogOpen() {
  return !infoLayer.hidden;
}

function setLoginFormEnabled(enabled) {
  usernameInput.disabled = !enabled;
  passwordInput.disabled = !enabled;
  loginBtn.disabled = !enabled;
  loginCancel.disabled = !enabled;
}

function hideInfoDialog() {
  infoLayer.hidden = true;
  infoPrimary.disabled = false;
  infoSecondary.disabled = false;
  infoPrimaryHandler = null;
  infoSecondaryHandler = null;
  setLoginFormEnabled(true);
}

function showInfoDialog(message, { showCancel = false, onConfirm, onCancel } = {}) {
  infoMessage.textContent = message;
  infoSecondary.hidden = !showCancel;
  infoPrimary.disabled = false;
  infoSecondary.disabled = false;
  infoPrimaryHandler = onConfirm || hideInfoDialog;
  infoSecondaryHandler = onCancel || hideInfoDialog;
  window.bringDialogLayerToFront?.(infoLayer);
  infoLayer.hidden = false;
  setLoginFormEnabled(false);
}

function formatLoginError(serverError) {
  const text = (serverError || "").toLowerCase();
  if (text.includes("invalid username") || text.includes("password")) {
    return (
      "Error: Your account name or password is incorrect.\n" +
      "Too many incorrect attempts will lead to a temporary ban."
    );
  }
  if (serverError) {
    return `Error: ${serverError}`;
  }
  return "Error: Login failed.";
}

function formatNetworkError() {
  return (
    "Error: Could not reach the server.\n" +
    "Start it with NostaleWeb.exe"
  );
}

function isLogoutReturn() {
  return new URLSearchParams(window.location.search).get("logout") === "1";
}

async function checkServerHealth() {
  try {
    const response = await fetch("/api/health", { credentials: "same-origin" });
    if (!response.ok) {
      return;
    }

    const payload = await response.json();
    if (payload.db === false) {
      showInfoDialog(
        "Error: Database is not ready.\nClose and restart NostaleWeb.exe.",
      );
    }
  } catch {
    showInfoDialog(formatNetworkError());
  }
}

async function clearLogoutSession() {
  if (!isLogoutReturn()) {
    return;
  }

  try {
    await fetch("/api/logout", {
      method: "POST",
      credentials: "same-origin",
    });
  } catch {
    // Stay on login even if logout request fails.
  }
}

async function checkExistingSession() {
  if (loginInProgress) {
    return;
  }

  try {
    await window.SessionFlow.redirectIfAuthenticatedForPlay({ skipWhenLogout: true });
  } catch {
    // Stay on login page.
  }
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (isInfoDialogOpen() || loginInProgress) {
    return;
  }

  loginInProgress = true;
  setLoginFormEnabled(false);

  const username = usernameInput.value.trim();
  const password = passwordInput.value;

  try {
    const response = await fetch("/api/login", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    let result = {};
    try {
      result = await response.json();
    } catch {
      // Non-JSON response (e.g. proxy error page).
    }

    if (!response.ok) {
      showInfoDialog(formatLoginError(result.error));
      return;
    }

    const target = result.redirect || "/play/select-channel";
    if (window.ScreenTransition?.navigateInstant) {
      await window.ScreenTransition.navigateInstant(target);
    } else {
      await window.SessionFlow.navigateToUrl(target);
    }
  } catch {
    showInfoDialog(formatNetworkError());
  } finally {
    loginInProgress = false;
    if (!isInfoDialogOpen()) {
      setLoginFormEnabled(true);
    }
  }
});

document.getElementById("login-cancel").addEventListener("click", () => {
  if (isInfoDialogOpen()) {
    return;
  }

  if (isLogoutReturn()) {
    void window.SessionFlow.navigateToUrl("/");
    return;
  }

  showInfoDialog("Do you really want to quit NosTale?", {
    showCancel: true,
    onConfirm: async () => {
      infoPrimary.disabled = true;
      infoSecondary.disabled = true;

      const result = await window.SessionFlow.logoutToIndex();
      await window.UiSound?.waitForClickSound?.();
      window.location.replace(result.indexUrl || "/");
    },
  });
});

infoPrimary.addEventListener("click", async () => {
  const handler = infoPrimaryHandler;
  if (!handler) {
    hideInfoDialog();
    return;
  }
  await handler();
});

infoSecondary.addEventListener("click", async () => {
  const handler = infoSecondaryHandler;
  if (!handler) {
    hideInfoDialog();
    return;
  }
  await handler();
});

void clearLogoutSession().then(() => checkExistingSession());
void checkServerHealth();
