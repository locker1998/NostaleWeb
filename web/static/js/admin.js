const channelListEl = document.getElementById("admin-channel-list");
const channelSummaryEl = document.getElementById("admin-channel-summary");
const errorEl = document.getElementById("admin-error");
const startAllBtn = document.getElementById("admin-start-all");
const stopAllBtn = document.getElementById("admin-stop-all");

const REFRESH_MS = 10000;
const DEFAULT_MAX_PLAYERS = 100;
const CHANNEL_FULL_RATIO = 0.9;
const CHANNEL_HALF_RATIO = 0.5;

const ADMIN_LOAD_LABELS = {
  full: "Nearly full",
  normal: "Moderate load",
  recommended: "Light load",
  offline: "Offline",
};

let channels = [];
let busy = false;

function showError(message) {
  if (!errorEl) return;
  errorEl.textContent = message;
  errorEl.hidden = !message;
}

function setBusy(nextBusy) {
  busy = nextBusy;
  updateBulkButtons();
  renderChannels();
}

function updateBulkButtons() {
  if (!startAllBtn || !stopAllBtn) return;

  const hasStopped = channels.some((channel) => !channel.running);
  const hasRunning = channels.some((channel) => channel.running);

  startAllBtn.disabled = busy || !hasStopped;
  stopAllBtn.disabled = busy || !hasRunning;
}

function resolveLoadStatus(channel) {
  if (!channel.running) {
    return "offline";
  }
  if (
    channel.status === "full" ||
    channel.status === "normal" ||
    channel.status === "recommended"
  ) {
    return channel.status;
  }

  const maxPlayers = channel.maxPlayers > 0 ? channel.maxPlayers : DEFAULT_MAX_PLAYERS;
  const population = typeof channel.population === "number" ? channel.population : 0;
  const fillRatio = population / maxPlayers;

  if (fillRatio >= CHANNEL_FULL_RATIO) {
    return "full";
  }
  if (fillRatio > CHANNEL_HALF_RATIO) {
    return "normal";
  }
  return "recommended";
}

function formatChannelCapacity(channel) {
  const maxPlayers = channel.maxPlayers > 0 ? channel.maxPlayers : DEFAULT_MAX_PLAYERS;
  const population = typeof channel.population === "number" ? channel.population : 0;
  const loadStatus = resolveLoadStatus(channel);
  const loadLabel = ADMIN_LOAD_LABELS[loadStatus] || "—";
  return `${population} / ${maxPlayers} · ${loadLabel}`;
}

function renderSummary() {
  if (!channelSummaryEl) return;

  if (!channels.length) {
    channelSummaryEl.textContent = "No channels configured.";
    return;
  }

  const online = channels.filter((channel) => channel.running);
  const totalPlayers = online.reduce(
    (sum, channel) => sum + (typeof channel.population === "number" ? channel.population : 0),
    0,
  );
  channelSummaryEl.textContent = `${online.length} of ${channels.length} channel(s) online · ${totalPlayers} player(s) in channel`;
}

function renderChannels() {
  if (!channelListEl) return;

  channelListEl.innerHTML = "";
  renderSummary();
  updateBulkButtons();

  if (!channels.length) {
    const empty = document.createElement("li");
    empty.className = "server-status__row server-status__row--message";
    empty.textContent = "No channels found in config/channels.json.";
    channelListEl.appendChild(empty);
    return;
  }

  for (const channel of channels) {
    const item = document.createElement("li");
    item.className = "server-status__row server-status__row--managed";

    const info = document.createElement("div");
    info.className = "server-status__info";

    const title = document.createElement("span");
    title.className = "server-status__name";
    title.textContent = channel.label || `CH${channel.channel}`;

    const meta = document.createElement("span");
    meta.className = "server-status__port";
    meta.textContent = `Index ${channel.channel} · port ${channel.port}`;

    const capacity = document.createElement("span");
    capacity.className = "server-status__capacity";
    capacity.textContent = formatChannelCapacity(channel);

    info.append(title, meta, capacity);

    const badge = document.createElement("span");
    badge.className = `status-badge ${channel.running ? "status-badge--online" : "status-badge--offline"}`;
    badge.textContent = channel.running ? "Online" : "Offline";

    const actionBtn = document.createElement("button");
    actionBtn.type = "button";
    actionBtn.className = `btn server-status__action-btn ${
      channel.running ? "btn--ghost" : "btn--primary"
    }`;
    actionBtn.textContent = channel.running ? "Stop" : "Start";
    actionBtn.disabled = busy;
    actionBtn.addEventListener("click", () => {
      void controlChannel(channel.running ? "stop" : "start", channel.channel);
    });

    item.append(info, badge, actionBtn);
    channelListEl.appendChild(item);
  }
}

async function loadChannels() {
  showError("");
  const response = await fetch("/api/health", { credentials: "same-origin" });
  if (!response.ok) {
    throw new Error("Could not load channel status.");
  }

  const payload = await response.json();
  channels = Array.isArray(payload.channels)
    ? [...payload.channels].sort((left, right) => left.channel - right.channel)
    : [];
  renderChannels();
}

async function controlChannel(action, channel = null) {
  showError("");
  setBusy(true);

  const path = action === "start" ? "/api/start-channels" : "/api/shutdown-channels";
  const body = channel == null ? {} : { channel };

  try {
    const response = await fetch(path, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      showError(result.error || `Could not ${action} channel.`);
      return;
    }
    await loadChannels();
  } catch {
    showError("Could not reach the server.");
  } finally {
    setBusy(false);
  }
}

startAllBtn?.addEventListener("click", () => {
  void controlChannel("start");
});

stopAllBtn?.addEventListener("click", () => {
  void controlChannel("stop");
});

void (async () => {
  try {
    await loadChannels();
    setInterval(() => {
      if (!busy) {
        void loadChannels().catch(() => {
          // Keep the last known status visible during transient errors.
        });
      }
    }, REFRESH_MS);
  } catch {
    channels = [];
    renderChannels();
    showError("Could not load admin panel data.");
  }
})();
