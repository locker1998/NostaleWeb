const listEl = document.getElementById("admin-accounts-list");
const summaryEl = document.getElementById("admin-accounts-summary");
const errorEl = document.getElementById("admin-accounts-error");

function showError(message) {
  errorEl.hidden = !message;
  errorEl.textContent = message || "";
}

function createAccountRow(account) {
  const item = document.createElement("li");
  item.className = "server-status__row admin-record-list__row";
  if (account.isDeleted) {
    item.classList.add("admin-record-list__row--deleted");
  }

  const info = document.createElement("div");
  info.className = "server-status__info admin-record-list__info";

  const title = document.createElement("span");
  title.className = "server-status__name";
  title.textContent = account.username;

  const meta = document.createElement("span");
  meta.className = "server-status__port";
  const flags = [];
  if (account.isAdmin) {
    flags.push("Admin");
  }
  if (account.isDeleted) {
    flags.push("Deleted");
  }
  meta.textContent = `ID ${account.id} · ${account.characterCount} character(s)${flags.length ? ` · ${flags.join(", ")}` : ""}`;

  info.append(title, meta);

  const actions = document.createElement("div");
  actions.className = "admin-record-list__actions";

  if (!account.isDeleted) {
    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "btn btn--ghost btn--sm";
    deleteBtn.textContent = "Delete";
    deleteBtn.addEventListener("click", () => {
      void deleteAccount(account, deleteBtn);
    });
    actions.appendChild(deleteBtn);
  }

  item.append(info, actions);
  return item;
}

async function deleteAccount(account, button) {
  if (!window.confirm(`Soft-delete account "${account.username}"?`)) {
    return;
  }

  button.disabled = true;
  showError("");

  try {
    const response = await fetch("/api/admin/delete-account", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId: account.id }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      showError(result.error || "Could not delete account.");
      button.disabled = false;
      return;
    }
    await loadAccounts();
  } catch {
    showError("Could not reach the server.");
    button.disabled = false;
  }
}

function renderAccounts(accounts) {
  listEl.innerHTML = "";
  const activeCount = accounts.filter((account) => !account.isDeleted).length;
  summaryEl.textContent = `${activeCount} active / ${accounts.length} total`;

  if (!accounts.length) {
    const empty = document.createElement("li");
    empty.className = "server-status__row server-status__row--message";
    empty.textContent = "No accounts found.";
    listEl.appendChild(empty);
    return;
  }

  for (const account of accounts) {
    listEl.appendChild(createAccountRow(account));
  }
}

async function loadAccounts() {
  showError("");
  try {
    const response = await fetch("/api/admin/accounts", { credentials: "same-origin" });
    if (response.status === 401 || response.status === 403) {
      window.location.href = "/admin/login";
      return;
    }
    if (!response.ok) {
      throw new Error("Request failed");
    }
    const payload = await response.json();
    renderAccounts(payload.accounts || []);
  } catch {
    showError("Could not load accounts.");
    listEl.innerHTML = "";
    summaryEl.textContent = "Failed to load accounts.";
  }
}

void loadAccounts();
