const serverListEl = document.getElementById("server-list");
const channelListEl = document.getElementById("channel-list");
const leaveBtn = document.getElementById("channel-leave-btn");
const infoLayer = document.getElementById("login-info-layer");
const infoMessage = document.getElementById("login-info-message");
const infoPrimary = document.getElementById("login-info-primary");
const infoSecondary = document.getElementById("login-info-secondary");

let infoPrimaryHandler = null;
let infoSecondaryHandler = null;
let servers = [];
let channels = [];
let selectedServerId = null;
let selectedChannelId = null;
let channelEntering = false;

const STATUS_LABELS = {
  full: "Full",
  normal: "Normal",
  recommended: "Recommended",
};

const CHANNEL_FULL_RATIO = 0.9;
const CHANNEL_HALF_RATIO = 0.5;
const DEFAULT_MAX_PLAYERS = 100;

function hideInfoDialog() {
  infoLayer.hidden = true;
  infoSecondary.hidden = true;
  infoPrimaryHandler = null;
  infoSecondaryHandler = null;
}

function showInfoDialog(message) {
  infoMessage.textContent = message;
  infoSecondary.hidden = true;
  infoPrimaryHandler = hideInfoDialog;
  infoSecondaryHandler = null;
  window.bringDialogLayerToFront?.(infoLayer);
  infoLayer.hidden = false;
}

function showAlertDialog(message, onConfirm) {
  infoMessage.textContent = message;
  infoSecondary.hidden = true;
  infoPrimaryHandler = async () => {
    infoPrimary.disabled = true;
    try {
      await onConfirm?.();
    } finally {
      infoPrimary.disabled = false;
      hideInfoDialog();
    }
  };
  infoSecondaryHandler = null;
  window.bringDialogLayerToFront?.(infoLayer);
  infoLayer.hidden = false;
}

window.showPlayDisconnectDialog = (onConfirm) => {
  showAlertDialog(
    window.SessionFlow?.DISCONNECT_MESSAGE || "Connection was lost.\nThe game client will be closed.",
    onConfirm,
  );
};

function showConfirmDialog(message, onConfirm) {
  infoMessage.textContent = message;
  infoSecondary.hidden = false;
  infoPrimaryHandler = async () => {
    infoPrimary.disabled = true;
    infoSecondary.disabled = true;
    try {
      await onConfirm();
    } finally {
      infoPrimary.disabled = false;
      infoSecondary.disabled = false;
      hideInfoDialog();
    }
  };
  infoSecondaryHandler = hideInfoDialog;
  window.bringDialogLayerToFront?.(infoLayer);
  infoLayer.hidden = false;
}

function serverHostLabel() {
  return window.location.hostname || "127.0.0.1";
}

function buildServers() {
  return [{ id: "local", host: serverHostLabel() }];
}

function channelNumber(channel) {
  if (channel.number) {
    return channel.number;
  }
  if (channel.channel != null) {
    return String(channel.channel).padStart(2, "0");
  }
  return "??";
}

function resolveChannelStatus(channel) {
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

function channelStatus(channel) {
  if (!channel.running || channel.status === "offline") {
    return null;
  }
  if (channel.status === "full" || channel.status === "normal" || channel.status === "recommended") {
    return channel.status;
  }
  return resolveChannelStatus(channel);
}

function channelDisplayName(channel) {
  const status = channelStatus(channel);
  if (!status) {
    return "";
  }
  const statusLabel = STATUS_LABELS[status] || "Normal";
  return `Channel ${channelNumber(channel)} (${statusLabel})`;
}

function clearChannelList() {
  channelListEl.innerHTML = "";
  selectedChannelId = null;
}

function appendChannelMessage(text) {
  const item = document.createElement("li");
  item.className = "server-select__item server-select__item--message";
  item.textContent = text;
  channelListEl.appendChild(item);
}

function renderChannels() {
  clearChannelList();

  if (!selectedServerId) {
    return;
  }

  if (!channels.length) {
    appendChannelMessage("Loading channels...");
    return;
  }

  let renderedCount = 0;

  for (const channel of channels) {
    const status = channelStatus(channel);
    if (!channel.running || !status) {
      continue;
    }

    const item = document.createElement("li");
    item.className = "server-select__item server-select__item--channel";
    item.classList.add(`server-select__item--status-${status}`);
    item.setAttribute("role", "option");
    item.dataset.channelId = String(channel.channel);

    const dot = document.createElement("span");
    dot.className = "server-select__dot";
    dot.setAttribute("aria-hidden", "true");

    const label = document.createElement("span");
    label.className = "server-select__label";
    label.textContent = channelDisplayName(channel);

    item.append(dot, label);

    if (channel.status !== "full") {
      item.addEventListener("click", () => {
        selectChannelRow(channel.channel);
        void enterChannel(channel);
      });
      renderedCount += 1;
    } else {
      item.setAttribute("aria-disabled", "true");
    }

    channelListEl.appendChild(item);
  }

  if (renderedCount === 0) {
    appendChannelMessage("No online channels. Start channels from Admin.");
  }
}

function selectChannelRow(channelId) {
  selectedChannelId = channelId;
  for (const row of channelListEl.querySelectorAll(".server-select__item--channel")) {
    const isSelected = Number(row.dataset.channelId) === channelId;
    row.classList.toggle("server-select__item--selected", isSelected);
    row.setAttribute("aria-selected", isSelected ? "true" : "false");
  }
}

function renderServers() {
  serverListEl.innerHTML = "";

  for (const server of servers) {
    const item = document.createElement("li");
    const isSelected = server.id === selectedServerId;
    item.className = `server-select__item server-select__item--server${isSelected ? " server-select__item--selected" : ""}`;
    item.setAttribute("role", "option");
    item.setAttribute("aria-selected", isSelected ? "true" : "false");
    item.dataset.serverId = server.id;

    const dot = document.createElement("span");
    dot.className = "server-select__dot";
    dot.setAttribute("aria-hidden", "true");

    const label = document.createElement("span");
    label.className = "server-select__label";
    label.textContent = server.host;

    item.append(dot, label);
    item.addEventListener("click", () => {
      selectServer(server.id);
    });
    serverListEl.appendChild(item);
  }
}

function selectServer(serverId) {
  if (selectedServerId === serverId) {
    return;
  }
  selectedServerId = serverId;
  renderServers();
  renderChannels();
}

function initializeServerSelection() {
  servers = buildServers();
  renderServers();
  renderChannels();
}

async function loadChannels() {
  const response = await fetch("/api/channels", { credentials: "same-origin" });
  if (await window.SessionFlow.respondToUnauthorized(response)) {
    return;
  }

  if (!response.ok) {
    showInfoDialog("Error: Could not load channels.");
    return;
  }

  const payload = await response.json();
  channels = payload.channels || [];
  renderServers();
  renderChannels();
}

async function enterChannel(channel) {
  if (channelEntering) {
    return;
  }

  if (channel.status === "full") {
    showInfoDialog("Error: This channel is full.");
    return;
  }

  channelEntering = true;

  try {
    const response = await fetch("/api/select-channel", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel: channel.channel }),
    });

    const result = await response.json().catch(() => ({}));
    if (await window.SessionFlow.respondToUnauthorized(response)) {
      channelEntering = false;
      return;
    }
    if (!response.ok) {
      channelEntering = false;
      showInfoDialog(result.error ? `Error: ${result.error}` : "Error: Channel selection failed.");
      return;
    }

    await window.ScreenTransition.navigateWithFade("/play/select-character");
  } catch {
    channelEntering = false;
    void window.SessionFlow.handleConnectionLost();
  }
}

async function quitGame() {
  const result = await window.SessionFlow.logoutToIndex();
  await window.ScreenTransition.navigateWithFade(result.indexUrl || "/");
}

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

leaveBtn.addEventListener("click", () => {
  showConfirmDialog("Do you really want to quit NosTale?", () => quitGame());
});

channelListEl.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || selectedChannelId === null) {
    return;
  }
  const channel = channels.find((entry) => entry.channel === selectedChannelId && entry.running);
  if (channel) {
    void enterChannel(channel);
  }
});

void (async () => {
  initializeServerSelection();
  const status = await window.SessionFlow.redirectForSessionStatus("channel");
  await loadChannels();
})();
