const chatboxEl = document.getElementById("chatbox");
const chatLogEl = document.getElementById("chat-log");
const chatInputEl = document.getElementById("chat-input");
const chatTabs = document.querySelectorAll(".chatbox__tab");
const scrollUpBtn = document.getElementById("chat-scroll-up");
const scrollDownBtn = document.getElementById("chat-scroll-down");
const scrollEndBtn = document.getElementById("chat-scroll-end");

let activeTab = "all";
let chatPlayerName = "";
let playerChannel = 1;
let playerIsGm = false;
let messages = [];
let lastMessageId = 0;
let pollTimer = null;
let outsideClickHandler = null;

function isChatOpen() {
  return Boolean(chatboxEl?.classList.contains("chatbox--open"));
}

function isEnterKey(event) {
  return event.key === "Enter" || event.code === "NumpadEnter";
}

function isTypingTarget(target) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  if (target.closest(".chatbox__composer") && !isChatOpen()) {
    return false;
  }

  if (target.id === "chat-input" && isChatOpen()) {
    return true;
  }

  const tag = target.tagName;
  if (tag === "TEXTAREA" || target.isContentEditable) {
    return true;
  }
  if (tag === "INPUT") {
    const input = target;
    if (input.readOnly || input.disabled) {
      return false;
    }
    return true;
  }
  if (tag === "SELECT") {
    const select = target;
    if (select.disabled || select.classList.contains("bazaar__select--native")) {
      return false;
    }
    return true;
  }
  return false;
}

function messageVisible(message) {
  if (
    message.kind === "speaker" ||
    message.kind === "command" ||
    (message.kind === "app" && message.recipientName)
  ) {
    return true;
  }
  return activeTab === "all" || message.channel === activeTab;
}

function formatSpeakerMessage(playerName, text, channelNumber = null) {
  const prefix =
    channelNumber === null || channelNumber === undefined
      ? "<Speaker>"
      : `<Speaker CH: ${channelNumber}>`;
  return `${prefix} [${playerName}]:${text}`;
}

function formatOutgoingWhisper(senderName, text) {
  return `(whisper)[${senderName}]:${text}`;
}

function formatIncomingWhisper(senderName, text, sourceChannel) {
  const base = `(whisper)[${senderName}]:${text}`;
  if (sourceChannel != null && Number(sourceChannel) !== Number(playerChannel)) {
    return `${base} <Channel:${sourceChannel}>`;
  }
  return base;
}

function formatFamilyMessage(playerName, text, sourceChannel = null) {
  if (sourceChannel != null && Number(sourceChannel) !== Number(playerChannel)) {
    return `<Channel ${sourceChannel}>[${playerName}]:${text}`;
  }
  return `[${playerName}]:${text}`;
}

function formatGeneralMessage(playerName, text) {
  return `[${playerName}]:${text}`;
}

function formatPartyMessage(playerName, text) {
  return `[${playerName}]:${text}`;
}

function isCrossChannelMessage(sourceChannel) {
  return sourceChannel != null && Number(sourceChannel) !== Number(playerChannel);
}

function formatWhisperChannelNotice(targetName, channelNumber) {
  return `Sent to '${targetName}' on channel ${channelNumber}.`;
}

function isCrossChannelWhisper(targetChannel) {
  return isCrossChannelMessage(targetChannel);
}

function renderWhisperText(message) {
  if (message.direction === "incoming") {
    return formatIncomingWhisper(
      message.playerName,
      message.body,
      message.sourceChannel,
    );
  }

  return formatOutgoingWhisper(message.playerName, message.body);
}

function renderFamilyText(message) {
  return formatFamilyMessage(
    message.playerName,
    message.body,
    message.sourceChannel,
  );
}

function renderPartyText(message) {
  return formatPartyMessage(message.playerName, message.body);
}

function getOutgoingWhisperNotice(message) {
  if (message.kind !== "whisper" || message.direction !== "outgoing") {
    return null;
  }

  if (!isCrossChannelWhisper(message.targetChannel) || !message.targetName) {
    return null;
  }

  return formatWhisperChannelNotice(message.targetName, message.targetChannel);
}

function setPlayerChannel(channelNumber) {
  playerChannel = Number(channelNumber);
  renderChatLog();
}

function setPlayerName(name) {
  chatPlayerName = name;
}

function setPlayerIsGm(value) {
  playerIsGm = Boolean(value);
}

function extractPlayerNameFromMessage(message) {
  if (message.kind === "speaker") {
    const match = message.text.match(/\[(.+?)\]:/);
    return match ? match[1] : null;
  }

  if (
    message.kind === "party" ||
    message.kind === "family" ||
    message.kind === "whisper" ||
    message.kind === "general"
  ) {
    return message.playerName || null;
  }

  return null;
}

function fillWhisperTarget(name) {
  if (!chatInputEl || !name) return;

  chatInputEl.value = `/${name} `;
  chatInputEl.focus();
  const end = chatInputEl.value.length;
  chatInputEl.setSelectionRange(end, end);
}

function parseOutgoingChat(raw) {
  const text = raw.trim();
  if (!text) {
    return null;
  }

  if (text.startsWith("$") || text.startsWith("%")) {
    const normalized = `$${text.slice(1)}`;
    return { type: "command", body: normalized };
  }

  if (text.startsWith("/")) {
    const spaceIndex = text.indexOf(" ");
    if (spaceIndex === -1) {
      return null;
    }

    const targetName = text.slice(1, spaceIndex).trim();
    const body = text.slice(spaceIndex + 1).trim();
    if (!targetName || !body) {
      return null;
    }

    return { type: "whisper", targetName, body };
  }

  if (text.startsWith(":")) {
    const body = text.slice(1).trimStart();
    if (!body) {
      return null;
    }
    return { type: "family", body };
  }

  if (text.startsWith(";")) {
    const body = text.slice(1).trimStart();
    if (!body) {
      return null;
    }
    return { type: "party", body };
  }

  return { type: "general", body: text };
}

function isServerMessageForPlayer(message) {
  if (!chatPlayerName) {
    return true;
  }

  if (message.kind === "whisper") {
    if (message.direction === "outgoing") {
      return message.playerName === chatPlayerName;
    }
    if (message.direction === "incoming") {
      return message.recipientName === chatPlayerName;
    }
    return false;
  }

  if (message.kind === "whisper-error" || message.kind === "command") {
    return message.recipientName === chatPlayerName;
  }

  if (message.kind === "app" && message.recipientName) {
    return message.recipientName === chatPlayerName;
  }

  return true;
}

function shouldRefreshInventory(message) {
  if (!message) {
    return false;
  }
  if (message.inventoryChanged) {
    return true;
  }
  if (message.kind !== "app" && message.kind !== "command") {
    return false;
  }
  return /^Created \d+x /i.test(message.text || "");
}

function ingestServerMessage(message) {
  if (message.id != null) {
    if (messages.some((entry) => entry.id === message.id)) {
      lastMessageId = Math.max(lastMessageId, message.id);
      return;
    }
    lastMessageId = Math.max(lastMessageId, message.id);
  }

  if (!isServerMessageForPlayer(message)) {
    return;
  }

  pushMessage(message);

  if (shouldRefreshInventory(message)) {
    void window.NosInventory?.reload?.();
  }

  if (message.goldChanged && message.gold != null) {
    window.NosBazaar?.setGold?.(message.gold);
  }
}

async function pollChat() {
  if (!chatPlayerName) {
    return;
  }

  try {
    const response = await fetch(`/api/chat?since=${lastMessageId}`, {
      credentials: "same-origin",
    });
    if (!response.ok) {
      if (response.status === 401) {
        stopChatPolling();
        void window.SessionFlow.handleServerDisconnect();
      }
      return;
    }

    const payload = await response.json();
    for (const message of payload.messages || []) {
      ingestServerMessage(message);
    }
  } catch {
    // Ignore transient network errors; connection watch handles sustained outages.
  }
}

async function initializeChatCursor() {
  if (!chatPlayerName) {
    return;
  }

  try {
    const response = await fetch("/api/chat?since=0", {
      credentials: "same-origin",
    });
    if (!response.ok) {
      return;
    }

    const payload = await response.json();
    const latestId = Number(payload.latestId);
    if (Number.isInteger(latestId) && latestId >= 0) {
      lastMessageId = latestId;
    }
  } catch {
    // Ignore; regular polling will retry.
  }
}

function startChatPolling() {
  stopChatPolling();
  messages = [];
  lastMessageId = 0;
  renderChatLog();

  void (async () => {
    await initializeChatCursor();
    await pollChat();
    pollTimer = window.setInterval(() => {
      void pollChat();
    }, 2000);
  })();
}

function stopChatPolling() {
  if (pollTimer !== null) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

async function sendChatMessage(raw) {
  const parsed = parseOutgoingChat(raw);
  if (!parsed || !chatPlayerName) {
    return;
  }

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: parsed.type,
        body: parsed.body,
        targetName: parsed.targetName,
      }),
    });

    if (!response.ok) {
      return;
    }

    const payload = await response.json();
    for (const message of payload.messages || []) {
      ingestServerMessage(message);
    }
  } catch {
    // Ignore send failures for now.
  }
}

function pushMessage(message) {
  messages.push(message);
  renderChatLog({ scrollToEnd: isChatOpen() });
}

function appendServerMessage(text) {
  pushMessage({ channel: "system", kind: "server", text });
}

function appendAppMessage(text) {
  pushMessage({ channel: "system", kind: "app", text });
}

function appendSpeakerMessage(senderName, text, channelNumber = null) {
  pushMessage({
    channel: "general",
    kind: "speaker",
    text: formatSpeakerMessage(senderName, text, channelNumber),
  });
}

function appendOutgoingWhisper(
  senderName,
  text,
  { targetName, targetChannel = playerChannel } = {},
) {
  pushMessage({
    channel: "whisper",
    kind: "whisper",
    direction: "outgoing",
    playerName: senderName,
    body: text,
    targetName,
    targetChannel,
  });
}

function appendIncomingWhisper(
  senderName,
  text,
  { sourceChannel = playerChannel } = {},
) {
  pushMessage({
    channel: "whisper",
    kind: "whisper",
    direction: "incoming",
    playerName: senderName,
    body: text,
    sourceChannel,
  });
}

function appendWhisperNotConnected(text = "User is not connected.") {
  pushMessage({
    channel: "whisper",
    kind: "whisper-error",
    text,
  });
}

function appendWhisperMessage(
  senderName,
  text,
  { targetName, targetChannel = playerChannel } = {},
) {
  appendOutgoingWhisper(senderName, text, { targetName, targetChannel });
}

function appendFamilyMessage(
  senderName,
  text,
  { sourceChannel = playerChannel } = {},
) {
  pushMessage({
    channel: "family",
    kind: "family",
    playerName: senderName,
    body: text,
    sourceChannel,
  });
}

function appendPartyMessage(senderName, text) {
  pushMessage({
    channel: "party",
    kind: "party",
    playerName: senderName,
    body: text,
  });
}

function appendGeneralMessage(senderName, text, { isGm = false } = {}) {
  pushMessage({
    channel: "general",
    kind: "general",
    playerName: senderName,
    body: text,
    isGm: Boolean(isGm),
  });
}

function scrollChatToEnd() {
  if (!chatLogEl) return;
  chatLogEl.scrollTop = chatLogEl.scrollHeight;
}

function attachMessageLine(line, message) {
  if (!isChatOpen()) {
    return;
  }

  const senderName = extractPlayerNameFromMessage(message);
  if (!senderName) {
    return;
  }

  line.classList.add("chatbox__line--clickable");
  line.addEventListener("click", () => {
    fillWhisperTarget(senderName);
  });
}

function renderChatLog({ scrollToEnd = false } = {}) {
  if (!chatLogEl) return;

  const previousScrollTop = chatLogEl.scrollTop;

  chatLogEl.innerHTML = "";
  for (const message of messages) {
    if (!messageVisible(message)) continue;

    const line = document.createElement("div");
    if (message.kind === "whisper") {
      line.className = "chatbox__line chatbox__line--whisper";
      line.textContent = renderWhisperText(message);
    } else if (message.kind === "family") {
      line.className = "chatbox__line chatbox__line--family";
      line.textContent = renderFamilyText(message);
    } else if (message.kind === "party") {
      line.className = "chatbox__line chatbox__line--party";
      line.textContent = renderPartyText(message);
    } else if (message.kind === "general") {
      line.className = "chatbox__line chatbox__line--general";
      if (message.isGm) {
        line.classList.add("chatbox__line--gm");
      }
      line.textContent = message.playerName
        ? formatGeneralMessage(message.playerName, message.body)
        : message.text;
    } else if (message.kind === "whisper-error") {
      line.className = "chatbox__line chatbox__line--whisper-error";
      line.textContent = message.text;
    } else if (message.kind === "app") {
      line.className = "chatbox__line chatbox__line--app";
      if (message.recipientName) {
        line.classList.add("chatbox__line--command");
      }
      line.textContent = message.text;
    } else if (message.kind === "command") {
      line.className = "chatbox__line chatbox__line--app chatbox__line--command";
      line.textContent = message.text;
    } else {
      line.className = `chatbox__line chatbox__line--${message.kind}`;
      line.textContent = message.text;
    }
    attachMessageLine(line, message);
    chatLogEl.appendChild(line);

    const whisperNotice = getOutgoingWhisperNotice(message);
    if (whisperNotice) {
      const notice = document.createElement("div");
      notice.className = "chatbox__line chatbox__line--whisper-channel";
      notice.textContent = whisperNotice;
      chatLogEl.appendChild(notice);
    }
  }

  if (scrollToEnd) {
    scrollChatToEnd();
  } else {
    chatLogEl.scrollTop = previousScrollTop;
  }
}

function setActiveTab(tab) {
  activeTab = tab;
  chatTabs.forEach((button) => {
    const isActive = button.dataset.tab === tab;
    button.classList.toggle("chatbox__tab--active", isActive);
    button.setAttribute("aria-selected", isActive ? "true" : "false");
  });
  renderChatLog();
}

function scrollChatBy(delta) {
  if (!chatLogEl || !isChatOpen()) return;
  chatLogEl.scrollTop += delta;
}

function openChatbox() {
  if (!chatboxEl || isChatOpen()) return;

  chatboxEl.classList.remove("chatbox--closed");
  chatboxEl.classList.add("chatbox--open");
  renderChatLog();

  if (outsideClickHandler) {
    document.removeEventListener("mousedown", outsideClickHandler);
  }

  outsideClickHandler = (event) => {
    if (chatboxEl.contains(event.target)) {
      return;
    }
    closeChatbox();
  };
  document.addEventListener("mousedown", outsideClickHandler);

  requestAnimationFrame(() => {
    if (chatInputEl) {
      chatInputEl.tabIndex = 0;
      chatInputEl.focus();
    }
  });
}

function closeChatbox() {
  if (!chatboxEl || !isChatOpen()) return;

  chatboxEl.classList.add("chatbox--closed");
  chatboxEl.classList.remove("chatbox--open");
  if (chatInputEl) {
    chatInputEl.blur();
    chatInputEl.tabIndex = -1;
  }
  renderChatLog();

  if (outsideClickHandler) {
    document.removeEventListener("mousedown", outsideClickHandler);
    outsideClickHandler = null;
  }
}

function appendChatMessage(text, channel = "general") {
  if (channel === "general") {
    void sendChatMessage(text);
    return;
  }

  pushMessage({ channel, kind: "general", text });
}

function onDocumentKeyDown(event) {
  if (!isEnterKey(event) || event.shiftKey || event.repeat) {
    return;
  }

  if (isChatOpen()) {
    return;
  }

  if (isTypingTarget(event.target)) {
    return;
  }

  event.preventDefault();
  openChatbox();
}

function initChat() {
  if (!chatboxEl || !chatLogEl) return;

  if (chatInputEl) {
    chatInputEl.tabIndex = -1;
  }

  chatTabs.forEach((button) => {
    button.addEventListener("click", () => {
      setActiveTab(button.dataset.tab || "all");
    });
  });

  scrollUpBtn?.addEventListener("click", () => scrollChatBy(-48));
  scrollDownBtn?.addEventListener("click", () => scrollChatBy(48));
  scrollEndBtn?.addEventListener("click", () => {
    if (isChatOpen()) {
      scrollChatToEnd();
    }
  });

  chatInputEl?.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeChatbox();
      return;
    }

    if (event.key !== "Enter" || event.shiftKey) {
      return;
    }

    event.preventDefault();

    const text = chatInputEl.value;
    if (!text.trim()) {
      return;
    }

    void sendChatMessage(text);
    chatInputEl.value = "";
  });

  window.addEventListener("keydown", onDocumentKeyDown, true);
  renderChatLog({ scrollToEnd: true });

  window.addEventListener("beforeunload", stopChatPolling);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initChat);
} else {
  initChat();
}

window.ChatUI = {
  appendMessage: appendChatMessage,
  appendServerMessage,
  appendAppMessage,
  appendSpeakerMessage,
  appendOutgoingWhisper,
  appendIncomingWhisper,
  appendWhisperNotConnected,
  appendWhisperMessage,
  appendFamilyMessage,
  appendPartyMessage,
  appendGeneralMessage,
  formatSpeakerMessage,
  formatOutgoingWhisper,
  formatIncomingWhisper,
  formatFamilyMessage,
  formatPartyMessage,
  formatGeneralMessage,
  formatWhisperChannelNotice,
  setPlayerName,
  getPlayerName: () => chatPlayerName,
  setPlayerIsGm,
  getPlayerIsGm: () => playerIsGm,
  setPlayerChannel,
  getPlayerChannel: () => playerChannel,
  setTab: setActiveTab,
  open: openChatbox,
  close: closeChatbox,
  isOpen: isChatOpen,
  startPolling: startChatPolling,
  stopPolling: stopChatPolling,
};
