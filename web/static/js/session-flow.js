const PLAY_HOME = "/play";
const PLAY_LOGIN = "/play/login";
const PLAY_MAIN = "/play/main";
const PLAY_SELECT_CHANNEL = "/play/select-channel";
const PLAY_SELECT_CHARACTER = "/play/select-character";
const ADMIN_HOME = "/admin";
const ADMIN_LOGIN = "/admin/login";

const SESSION_ROUTES = {
  none: PLAY_LOGIN,
  channel: PLAY_SELECT_CHANNEL,
  character: PLAY_SELECT_CHARACTER,
  game: PLAY_MAIN,
  admin: ADMIN_HOME,
};

const DEFAULT_LOGIN_PORT = 8080;
const LOGIN_ORIGIN_STORAGE_KEY = "nosbazaar.loginOrigin";
const CONNECTION_WATCH_MS = 4000;
const DISCONNECT_MESSAGE = "Disconnected from server.";

function bringDialogLayerToFront(layer) {
  if (!layer) {
    return;
  }
  const host = document.querySelector(".play-viewport") || document.body;
  host.appendChild(layer);
}

window.bringDialogLayerToFront = bringDialogLayerToFront;

const nativeFetch = window.fetch.bind(window);

function isPlayPath(pathname = window.location.pathname) {
  return pathname === PLAY_HOME || pathname.startsWith(`${PLAY_HOME}/`);
}

function playRouteForStatus(status) {
  if (status.step === "admin" && isPlayPath()) {
    return PLAY_SELECT_CHANNEL;
  }
  return SESSION_ROUTES[status.step];
}

function isProtectedPlayPage() {
  return isPlayPath() && window.location.pathname !== PLAY_LOGIN;
}

let cachedLoginOrigin = null;

function defaultLoginOrigin() {
  return `${window.location.protocol}//${window.location.hostname}:${DEFAULT_LOGIN_PORT}`;
}

function persistLoginOrigin(origin) {
  if (!origin) {
    return;
  }

  cachedLoginOrigin = origin;
  try {
    sessionStorage.setItem(LOGIN_ORIGIN_STORAGE_KEY, origin);
  } catch {
    // Ignore storage errors.
  }
}

function readStoredLoginOrigin() {
  try {
    return sessionStorage.getItem(LOGIN_ORIGIN_STORAGE_KEY);
  } catch {
    return null;
  }
}

async function resolveLoginOrigin() {
  if (cachedLoginOrigin) {
    return cachedLoginOrigin;
  }

  const stored = readStoredLoginOrigin();
  if (stored) {
    cachedLoginOrigin = stored;
    return cachedLoginOrigin;
  }

  if (isPlayLoginUrl(window.location.href)) {
    persistLoginOrigin(window.location.origin);
    return cachedLoginOrigin;
  }

  try {
    const response = await nativeFetch("/api/health", { credentials: "same-origin" });
    if (response.ok) {
      const data = await response.json();
      const loginUrl =
        data.loginUrl || `${defaultLoginOrigin()}${PLAY_LOGIN}`;
      persistLoginOrigin(new URL(loginUrl, window.location.href).origin);
      return cachedLoginOrigin;
    }
  } catch {
    // Game port may already be down; fall through to defaults.
  }

  persistLoginOrigin(defaultLoginOrigin());
  return cachedLoginOrigin;
}

async function resolveLoginPageUrl({ logout = false } = {}) {
  const origin = await resolveLoginOrigin();
  const target = new URL(`${origin}${PLAY_LOGIN}`);
  if (logout) {
    target.searchParams.set("logout", "1");
  }
  return target.toString();
}

async function fetchSessionStatus() {
  try {
    const response = await nativeFetch("/api/session-status", {
      credentials: "same-origin",
    });
    if (!response.ok) {
      return { step: "none", authenticated: false };
    }
    return response.json();
  } catch {
    return { step: "none", authenticated: false, connectionFailed: true };
  }
}

function isOnLoginPort() {
  const loginPort = String(DEFAULT_LOGIN_PORT);
  const currentPort = window.location.port || (window.location.protocol === "https:" ? "443" : "80");
  if (currentPort === loginPort) {
    return true;
  }

  const storedOrigin = cachedLoginOrigin || readStoredLoginOrigin();
  if (!storedOrigin) {
    return false;
  }

  try {
    return new URL(storedOrigin).port === currentPort;
  } catch {
    return false;
  }
}

async function fetchSessionStatusFromLogin() {
  if (!isOnLoginPort()) {
    return fetchSessionStatus();
  }

  const origin = await resolveLoginOrigin();

  try {
    const response = await nativeFetch(`${origin}/api/session-status`, {
      credentials: "same-origin",
    });
    if (!response.ok) {
      return { step: "none", authenticated: false };
    }
    return response.json();
  } catch {
    return { step: "none", authenticated: false, connectionFailed: true };
  }
}

async function logoutOnLoginPort() {
  stopConnectionWatch();
  const loginUrl = await resolveLoginPageUrl({ logout: true });

  try {
    await nativeFetch("/api/logout", {
      method: "POST",
      credentials: "same-origin",
    });
  } catch {
    // Game port may already be offline.
  }

  await navigateToUrl(loginUrl);
}

let builtinDisconnectWired = false;
let builtinDisconnectConfirm = null;

function ensureBuiltinDisconnectDialog() {
  let layer = document.getElementById("session-disconnect-layer");
  if (!layer) {
    layer = document.createElement("div");
    layer.className = "login-info-layer";
    layer.id = "session-disconnect-layer";
    layer.hidden = true;
    layer.innerHTML = `
      <div class="login-info" role="dialog" aria-labelledby="session-disconnect-title">
        <h2 class="login-info__title" id="session-disconnect-title">Info</h2>
        <p class="login-info__message" id="session-disconnect-message"></p>
        <div class="login-info__actions">
          <button type="button" class="bazaar__btn login-info__btn" id="session-disconnect-primary">Confirm</button>
        </div>
      </div>
    `;
    const host = document.querySelector(".play-viewport") || document.body;
    host.appendChild(layer);
  }

  if (!builtinDisconnectWired) {
    const primary = document.getElementById("session-disconnect-primary");
    primary?.addEventListener("click", async () => {
      const handler = builtinDisconnectConfirm;
      primary.disabled = true;
      try {
        await handler?.();
      } finally {
        primary.disabled = false;
        layer.hidden = true;
        builtinDisconnectConfirm = null;
      }
    });
    builtinDisconnectWired = true;
  }

  return {
    layer,
    message: document.getElementById("session-disconnect-message"),
  };
}

function showBuiltinDisconnectDialog(onConfirm) {
  const dialog = ensureBuiltinDisconnectDialog();
  if (!dialog.layer || !dialog.message) {
    void onConfirm?.();
    return;
  }

  dialog.message.textContent = DISCONNECT_MESSAGE;
  builtinDisconnectConfirm = onConfirm;
  bringDialogLayerToFront(dialog.layer);
  dialog.layer.hidden = false;
}

function showDisconnectDialog(onConfirm) {
  if (typeof window.showPlayDisconnectDialog === "function") {
    window.showPlayDisconnectDialog(onConfirm);
    return;
  }

  if (window.PlayDialog?.showAlert) {
    window.PlayDialog.showAlert(DISCONNECT_MESSAGE, onConfirm);
    return;
  }

  showBuiltinDisconnectDialog(onConfirm);
}

let channelEjectTimer = null;
let connectionWatchTimer = null;
let serverDisconnectShown = false;

async function handleServerDisconnect() {
  if (serverDisconnectShown) {
    return;
  }
  serverDisconnectShown = true;
  stopChannelEjectWatch();
  stopConnectionWatch();
  window.ChatUI?.stopPolling?.();

  return new Promise((resolve) => {
    showDisconnectDialog(async () => {
      await logoutOnLoginPort();
      resolve();
    });
  });
}

async function handleConnectionLost() {
  await handleServerDisconnect();
}

async function respondToUnauthorized(response) {
  if (!response || response.status !== 401) {
    return false;
  }
  await handleServerDisconnect();
  return true;
}

async function respondToConnectionFailure() {
  if (!isProtectedPlayPage() || serverDisconnectShown) {
    return false;
  }
  await handleServerDisconnect();
  return true;
}

function requestApiUrl(input) {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof URL) {
    return input.toString();
  }
  if (input instanceof Request) {
    return input.url;
  }
  return "";
}

function shouldWatchApiRequest(input) {
  if (!isProtectedPlayPage() || serverDisconnectShown) {
    return false;
  }

  try {
    const parsed = new URL(requestApiUrl(input), window.location.href);
    if (parsed.origin !== window.location.origin) {
      return false;
    }
    if (!parsed.pathname.startsWith("/api/")) {
      return false;
    }
    if (parsed.pathname === "/api/logout" || parsed.pathname === "/api/health") {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function pollChannelEjectWatch() {
  const status = await fetchSessionStatus();
  if (status.connectionFailed) {
    await handleServerDisconnect();
    return true;
  }
  if (status.channelDisconnect) {
    await handleServerDisconnect();
    return true;
  }

  return false;
}

function startChannelEjectWatch() {
  stopChannelEjectWatch();
  void resolveLoginOrigin();
  void pollChannelEjectWatch();
  channelEjectTimer = window.setInterval(() => {
    void pollChannelEjectWatch();
  }, 3000);
}

function stopChannelEjectWatch() {
  if (channelEjectTimer) {
    window.clearInterval(channelEjectTimer);
    channelEjectTimer = null;
  }
}

let connectionWatchFailures = 0;
const CONNECTION_WATCH_FAILURE_LIMIT = 2;

async function pollConnectionHealthWithRetry() {
  if (!isProtectedPlayPage() || serverDisconnectShown) {
    return;
  }

  try {
    const response = await nativeFetch("/api/health", { credentials: "same-origin" });
    if (!response.ok) {
      connectionWatchFailures += 1;
    } else {
      connectionWatchFailures = 0;
      const data = await response.json();
      if (data.loginUrl) {
        persistLoginOrigin(new URL(data.loginUrl, window.location.href).origin);
      } else if (data.loginPort) {
        persistLoginOrigin(`${window.location.protocol}//${window.location.hostname}:${data.loginPort}`);
      }
      return;
    }
  } catch {
    connectionWatchFailures += 1;
  }

  if (connectionWatchFailures >= CONNECTION_WATCH_FAILURE_LIMIT) {
    await handleServerDisconnect();
  }
}

function startConnectionWatch() {
  if (!isProtectedPlayPage()) {
    return;
  }

  stopConnectionWatch();
  connectionWatchFailures = 0;
  void resolveLoginOrigin();
  void pollConnectionHealthWithRetry();
  connectionWatchTimer = window.setInterval(() => {
    void pollConnectionHealthWithRetry();
  }, CONNECTION_WATCH_MS);
}

function stopConnectionWatch() {
  if (connectionWatchTimer) {
    window.clearInterval(connectionWatchTimer);
    connectionWatchTimer = null;
  }
}

async function resolveEjectedSessionStatus() {
  const localStatus = await fetchSessionStatus();
  if (localStatus.channelDisconnect || localStatus.connectionFailed) {
    return localStatus;
  }
  return localStatus;
}

async function handleChannelEject(status) {
  if (
    status?.channelDisconnect ||
    status?.connectionFailed ||
    (status?.step === "none" && !status?.authenticated)
  ) {
    await handleServerDisconnect();
    return;
  }

  stopChannelEjectWatch();
  window.ChatUI?.stopPolling?.();
  await redirectForStatus(status);
}

function isPlayLoginUrl(url) {
  try {
    return new URL(url, window.location.href).pathname === PLAY_LOGIN;
  } catch {
    return false;
  }
}

async function navigateToUrl(url) {
  if (!url) {
    return;
  }

  const resolved = new URL(url, window.location.href);
  const current = new URL(window.location.href);
  if (resolved.pathname === current.pathname && resolved.search === current.search) {
    return;
  }

  if (isPlayLoginUrl(resolved.toString()) && window.ScreenTransition?.navigateWithFade) {
    await window.ScreenTransition.navigateWithFade(resolved.toString());
    return;
  }

  window.location.href = resolved.toString();
}

async function navigateToLogin(url = PLAY_LOGIN, { logout = false } = {}) {
  const target = new URL(url || PLAY_LOGIN, window.location.href);
  if (logout && !target.searchParams.has("logout")) {
    target.searchParams.set("logout", "1");
  }
  await navigateToUrl(target.toString());
}

async function redirectForStatus(status) {
  if (status.redirect) {
    await navigateToUrl(status.redirect);
    return true;
  }

  if (status.step === "admin" && !isPlayPath()) {
    await navigateToUrl(status.adminUrl || SESSION_ROUTES.admin);
    return true;
  }

  if (status.step === "admin" && isPlayPath()) {
    await navigateToUrl(PLAY_SELECT_CHANNEL);
    return true;
  }

  if (status.step === "game" && status.ready) {
    await navigateToUrl(SESSION_ROUTES.game);
    return true;
  }

  if (status.lobbyUrl) {
    await navigateToUrl(status.lobbyUrl);
    return true;
  }

  const target = SESSION_ROUTES[status.step];
  if (target && window.location.pathname !== target) {
    const url = status.step === "none" && status.loginUrl ? status.loginUrl : target;
    await navigateToUrl(url);
    return true;
  }

  return false;
}

async function redirectIfAuthenticatedForPlay({ skipWhenLogout = false } = {}) {
  if (skipWhenLogout) {
    const params = new URLSearchParams(window.location.search);
    if (params.get("logout") === "1") {
      return null;
    }
  }

  const status = await fetchSessionStatus();
  if (!status.authenticated && status.step === "none") {
    return status;
  }

  if (await redirectForStatus(status)) {
    return status;
  }

  return status;
}

async function redirectIfAuthenticatedForAdmin() {
  const status = await fetchSessionStatus();
  if (status.isAdmin) {
    await navigateToUrl(status.adminUrl || ADMIN_HOME);
    return status;
  }
  return status;
}

async function redirectForSessionStatus(expectedStep) {
  const status = await fetchSessionStatus();

  if (
    !status.authenticated &&
    status.step === "none" &&
    isProtectedPlayPage() &&
    expectedStep !== "none"
  ) {
    if (status.connectionFailed) {
      await handleServerDisconnect();
    } else {
      const url = status.loginUrl || (await resolveLoginPageUrl({ logout: true }));
      await navigateToUrl(url);
    }
    return status;
  }

  if (status.redirect) {
    await navigateToUrl(status.redirect);
    return status;
  }

  if (status.step === "admin" && !isPlayPath()) {
    await navigateToUrl(status.adminUrl || SESSION_ROUTES.admin);
    return status;
  }

  if (status.step === "admin" && isPlayPath()) {
    if (window.location.pathname !== PLAY_SELECT_CHANNEL) {
      await navigateToUrl(PLAY_SELECT_CHANNEL);
    }
    return status;
  }

  if (status.lobbyUrl) {
    await navigateToUrl(status.lobbyUrl);
    return status;
  }

  if (status.step === "game" && status.ready) {
    if (expectedStep !== "game") {
      await navigateToUrl(SESSION_ROUTES.game);
    }
    return status;
  }

  if (status.step !== expectedStep && status.step !== "game") {
    const target = SESSION_ROUTES[status.step];
    if (target && window.location.pathname !== target) {
      const url = status.step === "none" && status.loginUrl ? status.loginUrl : target;
      await navigateToUrl(url);
    }
  }

  return status;
}

async function logoutToIndex() {
  const fallback = { indexUrl: "/" };
  try {
    const response = await nativeFetch("/api/logout", {
      method: "POST",
      credentials: "same-origin",
    });
    return { ...fallback, ...(await response.json().catch(() => ({}))) };
  } catch {
    return fallback;
  }
}

async function logoutToLogin() {
  await logoutOnLoginPort();
}

async function logoutToAdminLogin() {
  try {
    await nativeFetch("/api/logout", {
      method: "POST",
      credentials: "same-origin",
    });
  } catch {
    // Continue to admin login even if logout request fails.
  }
  window.location.href = ADMIN_LOGIN;
}

window.fetch = async function patchedFetch(input, init) {
  try {
    const response = await nativeFetch(input, init);
    return response;
  } catch (error) {
    if (shouldWatchApiRequest(input)) {
      void handleServerDisconnect();
    }
    throw error;
  }
};

window.SessionFlow = {
  fetchSessionStatus,
  fetchSessionStatusFromLogin,
  resolveLoginOrigin,
  resolveLoginPageUrl,
  resolveEjectedSessionStatus,
  handleChannelEject,
  handleServerDisconnect,
  handleConnectionLost,
  respondToUnauthorized,
  respondToConnectionFailure,
  logoutOnLoginPort,
  startChannelEjectWatch,
  stopChannelEjectWatch,
  startConnectionWatch,
  stopConnectionWatch,
  redirectForStatus,
  redirectIfAuthenticatedForPlay,
  redirectIfAuthenticatedForAdmin,
  redirectForSessionStatus,
  playRouteForStatus,
  navigateToUrl,
  navigateToLogin,
  logoutToLogin,
  logoutToAdminLogin,
  logoutToIndex,
  PLAY_HOME,
  PLAY_LOGIN,
  PLAY_MAIN,
  PLAY_SELECT_CHANNEL,
  PLAY_SELECT_CHARACTER,
  ADMIN_HOME,
  ADMIN_LOGIN,
  SESSION_ROUTES,
};

if (isProtectedPlayPage()) {
  startConnectionWatch();
}
