const STATUS_REFRESH_MS = 15000;

const listEl = document.getElementById("server-status-list");
const updatedEl = document.getElementById("server-status-updated");
const liveCountEl = document.getElementById("live-channel-count");
const siteNoticeEl = document.getElementById("site-notice");

function showSiteNotice() {
  if (!siteNoticeEl) {
    return;
  }

  let notice = null;
  const stored = sessionStorage.getItem("nosbazaar.notice");
  if (stored) {
    try {
      notice = JSON.parse(stored);
    } catch {
      notice = null;
    }
    sessionStorage.removeItem("nosbazaar.notice");
  }

  if (!notice || !notice.message) {
    siteNoticeEl.hidden = true;
    siteNoticeEl.textContent = "";
    siteNoticeEl.className = "site-notice";
    return;
  }

  siteNoticeEl.hidden = false;
  siteNoticeEl.textContent = notice.message;
  siteNoticeEl.className = `site-notice site-notice--${notice.type === "success" ? "success" : "error"}`;
}

function formatTime(date) {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function createStatusRow({ name, port, online, role }) {
  const item = document.createElement("li");
  item.className = "server-status__row";

  const info = document.createElement("div");
  info.className = "server-status__info";

  const title = document.createElement("span");
  title.className = "server-status__name";
  title.textContent = name;

  const meta = document.createElement("span");
  meta.className = "server-status__port";
  meta.textContent = role === "login" ? `Login · port ${port}` : `Channel ${name.replace("CH", "")} · port ${port}`;

  info.append(title, meta);

  const badge = document.createElement("span");
  badge.className = `status-badge ${online ? "status-badge--online" : "status-badge--offline"}`;
  badge.textContent = online ? "Online" : "Offline";

  item.append(info, badge);
  return item;
}

function renderServerStatus(data) {
  listEl.innerHTML = "";

  const loginPort = data.loginPort ?? 8080;
  listEl.appendChild(
    createStatusRow({
      name: "Login Server",
      port: loginPort,
      online: true,
      role: "login",
    }),
  );

  const channels = Array.isArray(data.channels) ? data.channels : [];
  for (const channel of channels) {
    listEl.appendChild(
      createStatusRow({
        name: channel.label || `CH${channel.channel}`,
        port: channel.port,
        online: Boolean(channel.running),
        role: "channel",
      }),
    );
  }

  if (liveCountEl) {
    const liveCount = channels.filter((channel) => channel.running).length;
    liveCountEl.textContent = String(liveCount);
  }

  if (updatedEl) {
    updatedEl.hidden = false;
    updatedEl.textContent = `Last updated ${formatTime(new Date())}`;
  }
}

function renderUnreachableStatus() {
  listEl.innerHTML = "";

  listEl.appendChild(
    createStatusRow({
      name: "Login Server",
      port: "—",
      online: false,
      role: "login",
    }),
  );

  const message = document.createElement("li");
  message.className = "server-status__row server-status__row--message";
  message.textContent = "Could not reach the login server. Start it with NostaleWeb.exe";
  listEl.appendChild(message);

  if (liveCountEl) {
    liveCountEl.textContent = "0";
  }

  if (updatedEl) {
    updatedEl.hidden = false;
    updatedEl.textContent = `Last checked ${formatTime(new Date())}`;
  }
}

async function refreshServerStatus() {
  try {
    const response = await fetch("/api/health", { credentials: "same-origin" });
    if (!response.ok) {
      throw new Error("Health check failed");
    }
    renderServerStatus(await response.json());
  } catch {
    renderUnreachableStatus();
  }
}

async function navigateFromIndexToPlay(event) {
  event.preventDefault();

  try {
    const status = await window.SessionFlow.fetchSessionStatus();
    if (!status.authenticated || status.step === "none") {
      await window.SessionFlow.navigateToLogin(status.loginUrl);
      return;
    }

    if (status.redirect) {
      await window.SessionFlow.navigateToUrl(status.redirect);
      return;
    }

    if (status.lobbyUrl) {
      await window.SessionFlow.navigateToUrl(status.lobbyUrl);
      return;
    }

    const target = window.SessionFlow.playRouteForStatus(status);
    if (target) {
      await window.SessionFlow.navigateToUrl(target);
      return;
    }

    await window.SessionFlow.navigateToLogin(status.loginUrl);
  } catch {
    await window.SessionFlow.navigateToLogin();
  }
}

for (const link of document.querySelectorAll('a[href="/play"]')) {
  link.addEventListener("click", (event) => {
    void navigateFromIndexToPlay(event);
  });
}

void refreshServerStatus();
showSiteNotice();
setInterval(refreshServerStatus, STATUS_REFRESH_MS);
