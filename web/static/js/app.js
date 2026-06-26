function iconUrl(listing) {
  if (listing.iconUrl) return listing.iconUrl;
  if (window.ItemIcons?.itemIconUrl) return window.ItemIcons.itemIconUrl(listing);
  return null;
}

let data = null;
let allListings = [];
let filteredItems = [];
let allAdminListings = [];
let filteredAdminItems = [];
let activeBazaarTab = "buy";
let currentPage = 1;
let goldBalance = 0;
let playerName = "";
let itemsPerPage = 10;
let defaultSort = "price-asc";

const tbody = document.getElementById("item-rows");
const adminTbody = document.getElementById("admin-item-rows");
const pageNumbersEl = document.getElementById("page-numbers");
const pageJumpInput = document.getElementById("page-jump");
const goldBalanceEl = document.getElementById("gold-balance");

function formatGold(n) {
  return n.toLocaleString("en-US");
}

function formatListingTimePeriod(days) {
  const remaining = Number(days);
  if (!Number.isFinite(remaining) || remaining <= 0) {
    return "1 Day(s)";
  }
  return `${Math.max(1, Math.ceil(remaining))} Day(s)`;
}

function totalPages() {
  const count = activeBazaarTab === "admin" ? filteredAdminItems.length : filteredItems.length;
  return Math.max(1, Math.ceil(count / itemsPerPage));
}

function renderCurrentRows() {
  if (activeBazaarTab === "admin") {
    renderAdminRows();
    return;
  }
  renderRows();
}

function fillSelect(select, options) {
  select.replaceChildren();
  options.forEach((opt) => {
    const el = document.createElement("option");
    el.value = String(opt.value);
    el.textContent = opt.label;
    select.appendChild(el);
  });
}

function closeCustomSelect(wrap) {
  if (!wrap) return;
  wrap.classList.remove("is-open");
  const list = wrap.querySelector(".bazaar__custom-select__list");
  if (list) list.hidden = true;
}

function closeAllCustomSelects() {
  document.querySelectorAll(".bazaar__custom-select.is-open").forEach((wrap) => {
    closeCustomSelect(wrap);
  });
}

function enhanceSelect(select) {
  if (select.classList.contains("bazaar__select--native")) return;

  const placementClasses = [...select.classList].filter((c) => c.startsWith("bazaar__filters__"));
  placementClasses.forEach((c) => select.classList.remove(c));

  const wrap = document.createElement("div");
  wrap.className = "bazaar__custom-select";
  placementClasses.forEach((c) => wrap.classList.add(c));

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "bazaar__custom-select__trigger bazaar__input bazaar__select";

  const list = document.createElement("ul");
  list.className = "bazaar__custom-select__list";
  list.hidden = true;

  const ariaLabel = select.getAttribute("aria-label");
  if (ariaLabel) trigger.setAttribute("aria-label", ariaLabel);

  select.classList.add("bazaar__select--native");
  select.tabIndex = -1;
  select.setAttribute("aria-hidden", "true");

  select.parentNode.insertBefore(wrap, select);
  wrap.appendChild(trigger);
  wrap.appendChild(list);
  wrap.appendChild(select);

  function syncTrigger() {
    const opt = select.options[select.selectedIndex];
    trigger.textContent = opt ? opt.textContent : "";
  }

  function buildList() {
    list.replaceChildren();
    [...select.options].forEach((opt) => {
      if (opt.disabled) return;
      const li = document.createElement("li");
      li.className = "bazaar__custom-select__option";
      li.textContent = opt.textContent;
      li.addEventListener("mousedown", (e) => {
        e.preventDefault();
        select.value = opt.value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
        syncTrigger();
        closeCustomSelect(wrap);
      });
      list.appendChild(li);
    });
  }

  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    if (wrap.classList.contains("is-open")) {
      closeCustomSelect(wrap);
      return;
    }
    buildList();
    list.hidden = false;
    wrap.classList.add("is-open");
  });

  wrap.addEventListener("click", (e) => e.stopPropagation());

  select.addEventListener("change", syncTrigger);

  new MutationObserver(() => {
    syncTrigger();
    if (wrap.classList.contains("is-open")) buildList();
  }).observe(select, { childList: true });

  syncTrigger();
}

function enhanceAllSelects() {
  document.querySelectorAll("select.bazaar__select:not(.bazaar__select--native)").forEach(enhanceSelect);
}

function iconUrl(listing) {
  if (listing.iconUrl) return listing.iconUrl;
  if (listing.iconId) return `${ICON_BASE}/${listing.iconId}.png`;
  return null;
}

function createItemIcon(listing) {
  const wrap = document.createElement("span");
  wrap.className = "bazaar__item-icon-wrap";

  const url = iconUrl(listing);
  if (!url) {
    const span = document.createElement("span");
    span.className = "bazaar__item-icon--fallback";
    wrap.appendChild(span);
  } else {
    const img = document.createElement("img");
    img.className = "bazaar__item-icon";
    img.src = url;
    img.alt = "";
    img.addEventListener("error", () => {
      const fallback = document.createElement("span");
      fallback.className = "bazaar__item-icon--fallback";
      img.replaceWith(fallback);
    });
    wrap.appendChild(img);
  }

  wrap.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    event.stopPropagation();
    window.MainUI?.openItemInfo?.({
      ...listing,
      icon: url,
    });
  });

  return wrap;
}

function renderRows() {
  const start = (currentPage - 1) * itemsPerPage;
  const pageItems = filteredItems.slice(start, start + itemsPerPage);

  tbody.replaceChildren();

  pageItems.forEach((item, idx) => {
    const tr = document.createElement("tr");

    const tdItem = document.createElement("td");
    const cell = document.createElement("div");
    cell.className = "bazaar__item";
    cell.appendChild(createItemIcon(item));
    const name = document.createElement("span");
    name.className = "bazaar__item-name";
    name.textContent = item.name;
    name.title = item.name;
    cell.appendChild(name);
    tdItem.appendChild(cell);

    const tdAmount = document.createElement("td");
    tdAmount.className = "col-amount";
    tdAmount.textContent = item.amount;

    const tdPrice = document.createElement("td");
    tdPrice.className = "col-price";
    tdPrice.textContent = formatGold(item.price);

    const tdTime = document.createElement("td");
    tdTime.className = "col-time";
    tdTime.textContent = formatListingTimePeriod(item.days);

    const tdSeller = document.createElement("td");
    tdSeller.className = "col-seller";
    tdSeller.textContent = item.seller;

    const tdBuy = document.createElement("td");
    tdBuy.className = "col-buy";
    const buyBtn = document.createElement("button");
    buyBtn.type = "button";
    buyBtn.className = "bazaar__btn bazaar__btn--buy";
    buyBtn.textContent = "Buy";
    buyBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      openPurchaseDialog(item, start + idx, event);
    });
    tdBuy.appendChild(buyBtn);

    tr.append(tdItem, tdAmount, tdPrice, tdTime, tdSeller, tdBuy);
    tbody.appendChild(tr);
  });

  for (let i = pageItems.length; i < itemsPerPage; i++) {
    const tr = document.createElement("tr");
    tr.className = "is-empty";
    for (let c = 0; c < 6; c++) {
      const td = document.createElement("td");
      td.innerHTML = "&nbsp;";
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
}

function formatAdminListingTimePeriod(item) {
  if (item.isExpired) {
    return "0 Day(s)";
  }
  return formatListingTimePeriod(item.days);
}

function formatAdminListingAmount(item) {
  const listedQty = Math.max(0, Number(item.listedQuantity) || Number(item.amount) || 0);
  const currentQty = Math.max(0, Number(item.amount) || 0);
  const amountSold = Math.max(0, listedQty - currentQty);
  return `${amountSold} / ${listedQty}`;
}

function getAdminListingState(item) {
  const listedQty = Math.max(0, Number(item.listedQuantity) || Number(item.amount) || 0);
  const currentQty = Math.max(0, Number(item.amount) || 0);
  const soldCount = listedQty - currentQty;
  const isExpired = Boolean(item.isExpired);

  if (currentQty === 0 && soldCount > 0) {
    return {
      status: "Sale completed",
      statusKey: "completed",
      rowClass: "is-admin-completed",
      actionMode: "received",
    };
  }

  if (soldCount > 0 && currentQty > 0) {
    return {
      status: isExpired ? "Deadline has expired" : "On Sale",
      statusKey: isExpired ? "expired" : "on-sale",
      rowClass: isExpired ? "is-admin-expired" : "",
      actionMode: "partial",
    };
  }

  if (isExpired && currentQty > 0) {
    return {
      status: "Deadline has expired",
      statusKey: "expired",
      rowClass: "is-admin-expired",
      actionMode: "quit",
    };
  }

  return {
    status: "On Sale",
    statusKey: "on-sale",
    rowClass: "",
    actionMode: "quit",
  };
}

function renderAdminRows() {
  if (!adminTbody) return;

  const start = (currentPage - 1) * itemsPerPage;
  const pageItems = filteredAdminItems.slice(start, start + itemsPerPage);

  adminTbody.replaceChildren();

  pageItems.forEach((item) => {
    const state = getAdminListingState(item);
    const tr = document.createElement("tr");
    if (state.rowClass) {
      tr.className = state.rowClass;
    }

    const tdItem = document.createElement("td");
    const cell = document.createElement("div");
    cell.className = "bazaar__item";
    cell.appendChild(createItemIcon(item));
    const name = document.createElement("span");
    name.className = "bazaar__item-name";
    name.textContent = item.name;
    name.title = item.name;
    cell.appendChild(name);
    tdItem.appendChild(cell);

    const tdAmount = document.createElement("td");
    tdAmount.className = "col-amount";
    tdAmount.textContent = formatAdminListingAmount(item);

    const tdPrice = document.createElement("td");
    tdPrice.className = "col-price";
    tdPrice.textContent = formatGold(item.price);

    const tdTime = document.createElement("td");
    tdTime.className = "col-time";
    tdTime.textContent = formatAdminListingTimePeriod(item);

    const tdStatus = document.createElement("td");
    tdStatus.className = "col-status";
    tdStatus.textContent = state.status;

    const tdActions = document.createElement("td");
    tdActions.className = "col-admin-actions";
    const actions = document.createElement("div");
    actions.className = "bazaar__admin-actions";

    if (state.actionMode === "quit") {
      const changeBtn = document.createElement("button");
      changeBtn.type = "button";
      changeBtn.className = "bazaar__btn bazaar__btn--yellow";
      changeBtn.textContent = "Change";
      changeBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        openChangePriceDialog(item, event);
      });
      actions.appendChild(changeBtn);

      const quitBtn = document.createElement("button");
      quitBtn.type = "button";
      quitBtn.className = "bazaar__btn bazaar__btn--buy";
      quitBtn.textContent = "Quit";
      quitBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        openQuitConfirmDialog(item);
      });
      actions.appendChild(quitBtn);
    } else if (state.actionMode === "partial") {
      const quitBtn = document.createElement("button");
      quitBtn.type = "button";
      quitBtn.className = "bazaar__btn bazaar__btn--buy";
      quitBtn.textContent = "Quit";
      quitBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        openQuitConfirmDialog(item);
      });
      actions.appendChild(quitBtn);
    } else {
      const receivedBtn = document.createElement("button");
      receivedBtn.type = "button";
      receivedBtn.className = "bazaar__btn bazaar__btn--buy";
      receivedBtn.textContent = "Received";
      receivedBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        openReceivedConfirmDialog(item);
      });
      actions.appendChild(receivedBtn);
    }

    tdActions.appendChild(actions);
    tr.append(tdItem, tdAmount, tdPrice, tdTime, tdStatus, tdActions);
    adminTbody.appendChild(tr);
  });

  for (let i = pageItems.length; i < itemsPerPage; i++) {
    const tr = document.createElement("tr");
    tr.className = "is-empty";
    for (let c = 0; c < 6; c++) {
      const td = document.createElement("td");
      td.innerHTML = "&nbsp;";
      tr.appendChild(td);
    }
    adminTbody.appendChild(tr);
  }
}

function renderPagination() {
  const pages = totalPages();
  pageNumbersEl.replaceChildren();

  for (let i = 1; i <= Math.min(pages, 3); i++) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "bazaar__page-num" + (i === currentPage ? " bazaar__page-num--active" : "");
    btn.textContent = String(i);
    btn.addEventListener("click", () => goToPage(i));
    pageNumbersEl.appendChild(btn);
  }

  pageJumpInput.value = String(currentPage);

  document.querySelectorAll(".bazaar__pager-arrow").forEach((btn) => {
    const action = btn.dataset.page;
    btn.disabled =
      (action === "first" || action === "prev") && currentPage <= 1 ||
      (action === "next" || action === "last") && currentPage >= pages;
  });
}

function goToPage(page) {
  currentPage = Math.min(Math.max(1, page), totalPages());
  renderCurrentRows();
  renderPagination();
}

function normalizeListingCategory(category) {
  const legacy = {
    accessory: "accessories",
    armor: "armour",
    material: "miscellaneous",
  };
  return legacy[category] || category;
}

function getListingItemMeta(listing) {
  return listing?.item || listing || {};
}

function matchesNumericRange(value, range) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return false;
  }

  const match = /^(\d+)-(\d+)$/.exec(String(range || ""));
  if (!match) {
    return false;
  }

  const min = Number(match[1]);
  const max = Number(match[2]);
  return numeric >= min && numeric <= max;
}

function matchesLevelFilter(meta, levelValue) {
  if (!levelValue) {
    return true;
  }

  const requiredLv = Number(meta.requiredLv);
  const requiredCLv = Number(meta.requiredCLv);

  if (levelValue === "champion_gear") {
    return Number.isFinite(requiredCLv) && requiredCLv > 0;
  }

  if (levelValue.startsWith("champion_")) {
    return matchesNumericRange(requiredCLv, levelValue.slice("champion_".length));
  }

  return matchesNumericRange(requiredLv, levelValue);
}

function matchesRarityFilter(meta, rarityValue) {
  if (!rarityValue) {
    return true;
  }

  if (rarityValue.startsWith("perfection_")) {
    return matchesNumericRange(meta.rarity, rarityValue.slice("perfection_".length));
  }

  return String(meta.rarity ?? "") === String(rarityValue);
}

function matchesUpgradeFilter(meta, upgradeValue) {
  if (!upgradeValue) {
    return true;
  }

  const upgrade = Number(meta.shell);
  if (!Number.isFinite(upgrade)) {
    return upgradeValue === "0";
  }

  return String(upgrade) === String(upgradeValue);
}

function matchesDynamicFilter(meta, dynamicValue) {
  if (!dynamicValue) {
    return true;
  }

  const classFlags = {
    swordsman: "isSwordsman",
    archer: "isArcher",
    magician: "isMage",
    mage: "isMage",
    adventurer: "isAdventurer",
    martial_artist: "isMartialArtist",
  };

  const flag = classFlags[dynamicValue];
  if (flag) {
    return Boolean(meta[flag]);
  }

  const group = String(meta.dynamicGroupName || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  const needle = dynamicValue.toLowerCase();
  return group === needle || group.includes(needle);
}

function listingMatchesFilters(listing, filters) {
  const meta = getListingItemMeta(listing);

  if (filters.name && !listing.name.toLowerCase().includes(filters.name)) {
    return false;
  }

  if (
    filters.category &&
    normalizeListingCategory(listing.category) !== filters.category
  ) {
    return false;
  }

  if (!matchesLevelFilter(meta, filters.level)) {
    return false;
  }

  if (!matchesRarityFilter(meta, filters.rarity)) {
    return false;
  }

  if (!matchesUpgradeFilter(meta, filters.upgrade)) {
    return false;
  }

  if (!matchesDynamicFilter(meta, filters.dynamic)) {
    return false;
  }

  return true;
}

function readBazaarFilters() {
  return {
    name: document.getElementById("filter-name")?.value.trim().toLowerCase() || "",
    category: document.getElementById("filter-category")?.value || "",
    level: document.getElementById("filter-level")?.value || "",
    rarity: document.getElementById("filter-rarity")?.value || "",
    upgrade: document.getElementById("filter-upgrade")?.value || "",
    dynamic: document.getElementById("filter-dynamic")?.value || "",
    sort: document.getElementById("filter-sort")?.value || "price-asc",
  };
}

function applyFilters() {
  const filters = readBazaarFilters();

  filteredItems = allListings.filter((item) => listingMatchesFilters(item, filters));

  filteredItems.sort((a, b) => {
    switch (filters.sort) {
      case "price-desc":
        return b.price - a.price;
      case "amount-asc":
        return a.amount - b.amount;
      case "amount-desc":
        return b.amount - a.amount;
      default:
        return a.price - b.price;
    }
  });

  currentPage = 1;
  renderCurrentRows();
  renderPagination();
}

async function fetchAdminListingsFromServer() {
  const response = await fetch("/api/bazaar/my-listings", { credentials: "same-origin" });
  if (await window.SessionFlow.respondToUnauthorized(response)) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const result = await response.json();
  return result.listings || [];
}

function applyAdminFilters() {
  const statusFilter = document.getElementById("admin-filter-status")?.value || "all";
  filteredAdminItems = allAdminListings.filter((item) => {
    const state = getAdminListingState(item);
    if (statusFilter === "all") {
      return true;
    }
    return state.statusKey === statusFilter;
  });
  currentPage = 1;
  renderCurrentRows();
  renderPagination();
}

async function loadAdminListings() {
  if (!adminTbody) return;

  try {
    const listings = await fetchAdminListingsFromServer();
    if (listings == null) return;
    allAdminListings = listings.map((item) => ({ ...item }));
    applyAdminFilters();
  } catch (err) {
    showToast(err.message || "Failed to load administration listings.");
  }
}

async function runAdminSearch() {
  await loadAdminListings();
}

async function fetchListingsFromServer() {
  const response = await fetch("/api/listings", { credentials: "same-origin" });
  if (await window.SessionFlow?.respondToUnauthorized?.(response)) {
    return false;
  }
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = await response.json();
  refreshListingsFromServer(payload.listings);
  return true;
}

async function runBazaarSearch() {
  try {
    const refreshed = await fetchListingsFromServer();
    if (refreshed === false) {
      return;
    }
  } catch (err) {
    showToast(`Search failed: ${err.message}`);
  }
}

function showToast(message) {
  const host = document.querySelector(".play-viewport") || document.body;
  let toast = host.querySelector(".toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.className = "toast";
    host.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add("toast--visible");
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => toast.classList.remove("toast--visible"), 2200);
}

let quantityDialogState = null;
let quantityOutsideHandler = null;

function closeQuantityDialog() {
  if (!quantityDialogState) return;
  quantityDialogState.el.remove();
  quantityDialogState = null;
  if (quantityOutsideHandler) {
    document.removeEventListener("mousedown", quantityOutsideHandler);
    quantityOutsideHandler = null;
  }
}

function closePurchaseDialog() {
  closeQuantityDialog();
  closeBuyDialog();
}

function showBazaarInfoDialog(message) {
  if (window.showMainAlertDialog) {
    window.showMainAlertDialog(message);
    return;
  }
  window.PlayDialog?.showAlert?.(message);
}

function formatBuyConfirmAmount(quantity) {
  const qty = Math.max(1, Number(quantity) || 1);
  return qty === 1 ? "1 Piece" : `${qty} Pieces`;
}

function appendBuyConfirmDetail(details, label, value) {
  const dt = document.createElement("dt");
  dt.textContent = label;
  const dd = document.createElement("dd");
  dd.textContent = value;
  details.append(dt, dd);
}

function buildConfirmNameOnly(item) {
  const itemRow = document.createElement("div");
  itemRow.className = "bazaar__buy-confirm-item bazaar__buy-confirm-item--name-only";
  const itemName = document.createElement("span");
  itemName.className = "bazaar__buy-confirm-item-name";
  itemName.textContent = item.name;
  itemName.title = item.name;
  itemRow.appendChild(itemName);
  return itemRow;
}

function buildConfirmItemRow(item) {
  const itemRow = document.createElement("div");
  itemRow.className = "bazaar__buy-confirm-item";
  itemRow.appendChild(createItemIcon(item));
  const itemName = document.createElement("span");
  itemName.className = "bazaar__buy-confirm-item-name";
  itemName.textContent = item.name;
  itemName.title = item.name;
  itemRow.appendChild(itemName);
  return itemRow;
}

function buildConfirmDetails(detailRows) {
  const details = document.createElement("dl");
  details.className = "bazaar__buy-confirm-details";
  for (const row of detailRows) {
    appendBuyConfirmDetail(details, row.label, row.value);
  }
  return details;
}

function buildBuyDialogDetails(item, quantity) {
  const qty = Math.max(1, Number(quantity) || 1);
  const unitPrice = Number(item.price) || 0;
  const totalPrice = unitPrice * qty;

  const itemRow = buildConfirmItemRow(item);

  const details = buildConfirmDetails([
    { label: "Seller", value: item.seller || "" },
    { label: "Amount", value: formatBuyConfirmAmount(qty) },
    { label: "Price per unit", value: `${formatGold(unitPrice)} Gold` },
    { label: "Total amount", value: `${formatGold(totalPrice)} Gold` },
  ]);

  return { itemRow, details, qty, unitPrice, totalPrice };
}

let buyDialogState = null;

function closeBuyDialog() {
  if (!buyDialogState) return;
  buyDialogState.layer.remove();
  buyDialogState = null;
}

function closeBuyConfirmDialog() {
  closeBuyDialog();
}

function getBuyConfirmMount() {
  return document.querySelector(".play-viewport") || document.body;
}

function mountBuyDialog({
  title,
  ariaLabel,
  item,
  quantity,
  detailRows = null,
  hint,
  actions,
  itemDisplay = "icon",
  hideTitle = false,
  showItem = true,
  showDetails = true,
}) {
  const mount = getBuyConfirmMount();
  if (!mount) return null;

  closeBuyDialog();

  const layer = document.createElement("div");
  layer.className = "bazaar__buy-confirm-layer";
  layer.setAttribute("role", "presentation");

  const dialog = document.createElement("div");
  dialog.className = "bazaar__buy-confirm";
  if (hideTitle && !showItem && !showDetails) {
    dialog.classList.add("bazaar__buy-confirm--minimal");
  }
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-label", ariaLabel);

  const children = [];

  if (!hideTitle) {
    const titleEl = document.createElement("h2");
    titleEl.className = "bazaar__buy-confirm-title";
    titleEl.textContent = title;
    children.push(titleEl);
  }

  if (showItem && item) {
    const itemRow = itemDisplay === "name" ? buildConfirmNameOnly(item) : buildConfirmItemRow(item);
    children.push(itemRow);
  }

  if (showDetails && item) {
    const details = detailRows
      ? buildConfirmDetails(detailRows)
      : buildBuyDialogDetails(item, quantity).details;
    children.push(details);
  }

  const hintEl = document.createElement("p");
  hintEl.className = "bazaar__buy-confirm-prompt";
  hintEl.textContent = hint;

  const actionsEl = document.createElement("div");
  actionsEl.className = "bazaar__buy-confirm-actions";
  if (actions.length === 1) {
    actionsEl.classList.add("bazaar__buy-confirm-actions--solo");
  }
  for (const button of actions) {
    actionsEl.appendChild(button);
  }

  children.push(hintEl, actionsEl);
  dialog.append(...children);
  layer.appendChild(dialog);
  mount.appendChild(layer);
  window.bringDialogLayerToFront?.(layer);

  layer.addEventListener("mousedown", (event) => {
    event.stopPropagation();
  });

  buyDialogState = { layer };
  return layer;
}

function openBuyConfirmDialog(item, globalIndex, quantity) {
  const qty = Math.max(1, Number(quantity) || 1);
  const totalPrice = (Number(item.price) || 0) * qty;

  const buyBtn = document.createElement("button");
  buyBtn.type = "button";
  buyBtn.className = "bazaar__btn bazaar__btn--buy";
  buyBtn.textContent = "Buy";

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "bazaar__btn bazaar__btn--buy";
  cancelBtn.textContent = "Cancel";

  mountBuyDialog({
    title: "Confirm goods sale",
    ariaLabel: "Confirm goods sale",
    item,
    quantity,
    hint: "Do you really want to purchase the item?",
    actions: [buyBtn, cancelBtn],
  });

  buyBtn.addEventListener("click", () => {
    if (goldBalance < totalPrice) {
      closeBuyDialog();
      showBazaarInfoDialog("Not enough gold.");
      return;
    }
    closeBuyDialog();
    void executeBuy(item, globalIndex, qty);
  });

  cancelBtn.addEventListener("click", () => {
    closeBuyDialog();
  });
}

function openBuyResultDialog(item, quantity) {
  const okBtn = document.createElement("button");
  okBtn.type = "button";
  okBtn.className = "bazaar__btn bazaar__btn--buy";
  okBtn.textContent = "OK";

  mountBuyDialog({
    title: "Sales completed",
    ariaLabel: "Sales completed",
    item,
    quantity,
    hint: "The items purchased are in the inventory.",
    actions: [okBtn],
  });

  okBtn.addEventListener("click", () => {
    closeBuyDialog();
  });
}

function getAdminListingAmounts(item) {
  const listedQty = Math.max(0, Number(item.listedQuantity) || Number(item.amount) || 0);
  const currentQty = Math.max(0, Number(item.amount) || 0);
  const amountSold = Math.max(0, listedQty - currentQty);
  return { listedQty, currentQty, amountSold };
}

function formatAdminConfirmQuantity(listedQty, amountSold) {
  const sold = Math.max(0, amountSold);
  const listed = Math.max(0, listedQty);
  const unit = listed === 1 ? "Piece" : "Pieces";
  return `${sold} / ${listed} ${unit}`;
}

function calculateSaleFee(totalPrice) {
  if (hasMerchantMedal()) {
    return 0;
  }
  return calculateListingFee(totalPrice, false);
}

function buildQuitConfirmSummary(item) {
  const { listedQty, currentQty, amountSold } = getAdminListingAmounts(item);
  const unitPrice = Number(item.price) || 0;
  const soldGross = unitPrice * amountSold;
  const remainingGross = unitPrice * currentQty;
  const soldFee = amountSold > 0 ? calculateSaleFee(soldGross) : 0;
  const quitFee = currentQty > 0 ? calculateSaleFee(remainingGross) : 0;
  const receivedGold = Math.max(0, soldGross - soldFee);

  return {
    amountSold,
    saleFee: quitFee,
    receivedGold,
    detailRows: [
      { label: "Price per unit", value: `${formatGold(unitPrice)} Gold` },
      { label: "Quantity", value: formatAdminConfirmQuantity(listedQty, amountSold) },
      ...(amountSold > 0
        ? [
            { label: "Sale fee", value: `${formatGold(soldFee)} Gold` },
            { label: "Total amount", value: `${formatGold(receivedGold)} Gold` },
          ]
        : []),
      ...(currentQty > 0
        ? [{ label: "Withdrawal fee", value: `${formatGold(quitFee)} Gold` }]
        : []),
    ],
  };
}

function openQuitConfirmDialog(item) {
  const summary = buildQuitConfirmSummary(item);

  const okBtn = document.createElement("button");
  okBtn.type = "button";
  okBtn.className = "bazaar__btn bazaar__btn--buy";
  okBtn.textContent = "OK";

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "bazaar__btn bazaar__btn--buy";
  cancelBtn.textContent = "Cancel";

  mountBuyDialog({
    title: "Complete sale",
    ariaLabel: "Complete sale",
    item,
    detailRows: summary.detailRows,
    hint: "Do you want to complete the sale of goods and receive the items and good?",
    actions: [okBtn, cancelBtn],
  });

  okBtn.addEventListener("click", () => {
    const requiredGold = Math.max(0, summary.saleFee - summary.receivedGold);
    if (goldBalance < requiredGold) {
      closeBuyDialog();
      showBazaarInfoDialog("Not enough gold.");
      return;
    }
    closeBuyDialog();
    void executeQuitListing(item);
  });

  cancelBtn.addEventListener("click", () => {
    closeBuyDialog();
  });
}

function buildReceivedConfirmSummary(item) {
  const { listedQty, amountSold } = getAdminListingAmounts(item);
  const unitPrice = Number(item.price) || 0;
  const gross = unitPrice * amountSold;
  const saleFee = calculateSaleFee(gross);
  const totalAmount = Math.max(0, gross - saleFee);

  return {
    amountSold,
    detailRows: [
      { label: "Price per unit", value: `${formatGold(unitPrice)} Gold` },
      { label: "Quantity", value: formatAdminConfirmQuantity(listedQty, amountSold) },
      { label: "Sale fee", value: `${formatGold(saleFee)} Gold` },
      { label: "Total amount", value: `${formatGold(totalAmount)} Gold` },
    ],
  };
}

function openReceivedConfirmDialog(item) {
  const summary = buildReceivedConfirmSummary(item);
  const receivedCount = Math.max(1, summary.amountSold);

  const okBtn = document.createElement("button");
  okBtn.type = "button";
  okBtn.className = "bazaar__btn bazaar__btn--buy";
  okBtn.textContent = "OK";

  mountBuyDialog({
    title: `Received(${receivedCount})`,
    ariaLabel: `Received(${receivedCount})`,
    item,
    itemDisplay: "name",
    detailRows: summary.detailRows,
    hint: "You have received the displayed gold.",
    actions: [okBtn],
  });

  okBtn.addEventListener("click", () => {
    closeBuyDialog();
    void executeReceiveListing(item);
  });
}

async function executeReceiveListing(item) {
  try {
    const response = await fetch(`/api/bazaar/receive/${item.id}`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    const result = await response.json();
    if (!response.ok) {
      showToast(String(result.error || "Failed to receive gold."));
      return;
    }

    if (result.gold != null) {
      setGold(result.gold);
    }
    if (Array.isArray(result.listings)) {
      allAdminListings = result.listings.map((entry) => ({ ...entry }));
      applyAdminFilters();
    } else {
      void loadAdminListings();
    }
    if (Array.isArray(result.marketListings)) {
      allListings = result.marketListings.map((entry) => ({ ...entry }));
      if (activeBazaarTab === "buy") {
        applyFilters();
      }
    }
  } catch (err) {
    showToast(`Failed to receive gold: ${err.message}`);
  }
}

async function executeQuitListing(item) {
  try {
    const response = await fetch(`/api/bazaar/quit/${item.id}`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    const result = await response.json();
    if (!response.ok) {
      const errorText = String(result.error || "");
      if (errorText.toLowerCase().includes("not enough gold")) {
        showBazaarInfoDialog("Not enough gold.");
        return;
      }
      if (errorText.toLowerCase().includes("inventory space")) {
        showBazaarInfoDialog("Not enough inventory space.");
        return;
      }
      showToast(errorText || "Failed to withdraw listing.");
      return;
    }

    if (result.gold != null) {
      setGold(result.gold);
    }
    if (Array.isArray(result.listings)) {
      allAdminListings = result.listings.map((entry) => ({ ...entry }));
      applyAdminFilters();
    } else {
      void loadAdminListings();
    }
    if (Array.isArray(result.marketListings)) {
      allListings = result.marketListings.map((entry) => ({ ...entry }));
      if (activeBazaarTab === "buy") {
        applyFilters();
      }
    }
    void window.NosInventory?.reload?.();
  } catch (err) {
    showToast(`Failed to withdraw listing: ${err.message}`);
  }
}

function bindQuantityOutsideClose() {
  if (quantityOutsideHandler) {
    document.removeEventListener("mousedown", quantityOutsideHandler);
  }

  quantityOutsideHandler = (event) => {
    if (!quantityDialogState) return;
    if (quantityDialogState.el.contains(event.target)) return;
    if (quantityDialogState.confirmOnOutsideClick && quantityDialogState.confirm) {
      quantityDialogState.confirm();
      return;
    }
    closeQuantityDialog();
  };

  document.addEventListener("mousedown", quantityOutsideHandler);
}

function formatPurchaseSummary(item, quantity) {
  const total = Number(item.price) * quantity;
  return `${item.name} ${quantity} units ${formatGold(total)} gold`;
}

function syncQuantityControlsWidth(summary, controls) {
  summary.style.width = "max-content";
  const width = Math.ceil(summary.getBoundingClientRect().width);
  controls.style.width = `${width}px`;
}

function positionQuantityDialog(el, clientX, clientY, { container, useBodyOverlay = false } = {}) {
  if (useBodyOverlay) {
    const pad = 8;
    let left = clientX;
    let top = clientY;
    const overflowRight = left + el.offsetWidth - window.innerWidth + pad;
    const overflowBottom = top + el.offsetHeight - window.innerHeight + pad;
    if (overflowRight > 0) left -= overflowRight;
    if (overflowBottom > 0) top -= overflowBottom;
    if (left < pad) left = pad;
    if (top < pad) top = pad;
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    return;
  }

  if (!container) return;

  const rect = container.getBoundingClientRect();
  let left = clientX - rect.left;
  let top = clientY - rect.top;

  const overflowRight = left + el.offsetWidth - container.clientWidth;
  const overflowBottom = top + el.offsetHeight - container.clientHeight;
  if (overflowRight > 0) left -= overflowRight;
  if (overflowBottom > 0) top -= overflowBottom;
  if (left < 0) left = 0;
  if (top < 0) top = 0;

  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
}

function openQuantityDialog({
  container,
  clientX,
  clientY,
  title,
  getSummaryText = null,
  maxQuantity,
  minQuantity = 1,
  defaultQuantity = null,
  onConfirm,
  onQuantityChange = null,
  confirmOnOutsideClick = false,
  ariaLabel = "Select amount",
  useBodyOverlay = false,
}) {
  const mountTarget = useBodyOverlay ? document.body : container;
  if (!mountTarget) return;

  closeQuantityDialog();

  const maxQ = Math.max(minQuantity, Number(maxQuantity) || minQuantity);
  const initialQuantity =
    defaultQuantity == null
      ? minQuantity
      : Math.min(maxQ, Math.max(minQuantity, Number(defaultQuantity) || minQuantity));
  let quantity = initialQuantity;
  const hasSummary = typeof getSummaryText === "function";

  const el = document.createElement("div");
  el.className = "bazaar__purchase";
  if (useBodyOverlay) {
    el.classList.add("bazaar__purchase--overlay");
  }
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-label", ariaLabel);

  const titleEl = document.createElement("div");
  titleEl.className = "bazaar__purchase-title";
  titleEl.textContent = title;

  const summary = document.createElement("div");
  summary.className = "bazaar__purchase-summary";

  const controls = document.createElement("div");
  controls.className = "bazaar__purchase-controls";
  if (!hasSummary) {
    controls.classList.add("bazaar__purchase-controls--solo");
  }

  const input = document.createElement("input");
  input.type = "text";
  input.className = "bazaar__purchase-input";
  input.inputMode = "numeric";
  input.value = String(initialQuantity);

  const stepper = document.createElement("div");
  stepper.className = "bazaar__purchase-stepper";

  const upBtn = document.createElement("button");
  upBtn.type = "button";
  upBtn.className = "bazaar__purchase-step bazaar__purchase-step--up";
  upBtn.setAttribute("aria-label", "Increase amount");

  const downBtn = document.createElement("button");
  downBtn.type = "button";
  downBtn.className = "bazaar__purchase-step bazaar__purchase-step--down";
  downBtn.setAttribute("aria-label", "Decrease amount");

  stepper.append(upBtn, downBtn);

  const okBtn = document.createElement("button");
  okBtn.type = "button";
  okBtn.className = "bazaar__purchase-ok";
  okBtn.textContent = "OK";

  controls.append(input, stepper, okBtn);
  if (hasSummary) {
    el.append(titleEl, summary, controls);
  } else {
    el.append(titleEl, controls);
  }
  mountTarget.appendChild(el);

  function syncQuantity(nextValue) {
    const parsed = Number.parseInt(String(nextValue), 10);
    quantity = Number.isNaN(parsed) ? minQuantity : Math.min(maxQ, Math.max(minQuantity, parsed));
    input.value = String(quantity);
    if (hasSummary) {
      summary.textContent = getSummaryText(quantity);
      syncQuantityControlsWidth(summary, controls);
    }
    void onQuantityChange?.(quantity);
  }

  function changeQuantity(delta) {
    syncQuantity(quantity + delta);
  }

  function confirmQuantity() {
    syncQuantity(input.value);
    closeQuantityDialog();
    void onConfirm?.(quantity);
  }

  upBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    changeQuantity(1);
  });
  downBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    changeQuantity(-1);
  });
  okBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    confirmQuantity();
  });
  input.addEventListener("input", () => syncQuantity(input.value));
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      confirmQuantity();
    }
  });
  el.addEventListener("mousedown", (e) => e.stopPropagation());

  quantityDialogState = { el, confirmOnOutsideClick, confirm: confirmQuantity };
  syncQuantity(initialQuantity);

  requestAnimationFrame(() => {
    if (hasSummary) {
      syncQuantityControlsWidth(summary, controls);
    }
    positionQuantityDialog(el, clientX, clientY, { container, useBodyOverlay });
    input.focus({ preventScroll: true });
    input.select();
  });

  setTimeout(bindQuantityOutsideClose, 0);
}

function openChangePriceDialog(item, event) {
  const unitPrice = Math.max(1, Number(item.price) || 1);

  openQuantityDialog({
    useBodyOverlay: true,
    clientX: event.clientX,
    clientY: event.clientY,
    title: "Change",
    ariaLabel: "Change listing price",
    getSummaryText: () => "Change the prices of the items you are offering.",
    maxQuantity: maxSellUnitPrice(),
    minQuantity: 1,
    defaultQuantity: unitPrice,
    onConfirm: (price) => {
      const nextPrice = Math.max(1, Number(price) || 1);
      if (nextPrice > maxSellUnitPrice()) {
        showToast(`Price cannot exceed ${formatGold(maxSellUnitPrice())} gold per unit.`);
        return;
      }
      if (nextPrice === unitPrice) {
        showToast("Price is unchanged.");
        return;
      }
      openChangePriceConfirmDialog(item, nextPrice);
    },
  });
}

function openChangePriceConfirmDialog(item, newPrice) {
  const confirmBtn = document.createElement("button");
  confirmBtn.type = "button";
  confirmBtn.className = "bazaar__btn bazaar__btn--buy";
  confirmBtn.textContent = "Confirm";

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "bazaar__btn bazaar__btn--buy";
  cancelBtn.textContent = "Cancel";

  mountBuyDialog({
    hideTitle: true,
    showItem: false,
    showDetails: false,
    ariaLabel: "Change item price confirmation",
    item,
    hint: `Do you want to change the item price? It will cost ${formatGold(CHANGE_PRICE_FEE)} gold.`,
    actions: [confirmBtn, cancelBtn],
  });

  confirmBtn.addEventListener("click", () => {
    if (goldBalance < CHANGE_PRICE_FEE) {
      closeBuyDialog();
      showBazaarInfoDialog("Not enough gold.");
      return;
    }
    closeBuyDialog();
    void executeChangeListingPrice(item, newPrice);
  });

  cancelBtn.addEventListener("click", () => {
    closeBuyDialog();
  });
}

async function executeChangeListingPrice(item, newPrice) {
  const unitPrice = Math.max(1, Number(newPrice) || 1);
  if (unitPrice > maxSellUnitPrice()) {
    showToast(`Price cannot exceed ${formatGold(maxSellUnitPrice())} gold per unit.`);
    return;
  }

  try {
    const response = await fetch(`/api/bazaar/change-price/${item.id}`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ unitPrice }),
    });
    const result = await response.json();
    if (!response.ok) {
      const errorText = String(result.error || "");
      if (errorText.toLowerCase().includes("not enough gold")) {
        showBazaarInfoDialog("Not enough gold.");
        return;
      }
      showToast(errorText || "Failed to change listing price.");
      return;
    }

    if (result.gold != null) {
      setGold(result.gold);
    }
    if (Array.isArray(result.listings)) {
      allAdminListings = result.listings.map((entry) => ({ ...entry }));
      applyAdminFilters();
    } else {
      void loadAdminListings();
    }
    if (Array.isArray(result.marketListings)) {
      allListings = result.marketListings.map((entry) => ({ ...entry }));
      if (activeBazaarTab === "buy") {
        applyFilters();
      }
    }
  } catch (err) {
    showToast(`Failed to change listing price: ${err.message}`);
  }
}

window.NosQuantityDialog = {
  open: openQuantityDialog,
  close: closeQuantityDialog,
};

const OWN_LISTING_MESSAGE = "This is an item that you put up for sale.";

function isOwnListing(item) {
  const seller = String(item?.seller ?? "").trim();
  const buyer = String(playerName || window.ChatUI?.getPlayerName?.() || "").trim();
  if (!seller || !buyer) return false;
  return seller.toLowerCase() === buyer.toLowerCase();
}

function openPurchaseDialog(item, globalIndex, event) {
  if (isOwnListing(item)) {
    closePurchaseDialog();
    window.showMainAlertDialog?.(OWN_LISTING_MESSAGE);
    return;
  }

  openQuantityDialog({
    useBodyOverlay: true,
    clientX: event.clientX,
    clientY: event.clientY,
    title: "Select purchase amount",
    ariaLabel: "Select purchase amount",
    getSummaryText: (quantity) => formatPurchaseSummary(item, quantity),
    maxQuantity: Math.max(1, Number(item.amount) || 1),
    onConfirm: (quantity) => {
      openBuyConfirmDialog(item, globalIndex, quantity);
    },
  });
}

async function executeBuy(item, globalIndex, quantity) {
  closePurchaseDialog();
  const totalPrice = (Number(item.price) || 0) * Math.max(1, Number(quantity) || 1);
  if (goldBalance < totalPrice) {
    showBazaarInfoDialog("Not enough gold.");
    return;
  }

  try {
    const response = await fetch(`/api/buy/${item.id}`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quantity }),
    });
    const result = await response.json();
    if (!response.ok) {
      if (isOwnListing(item) || String(result.error || "").includes("own listing")) {
        window.showMainAlertDialog?.(OWN_LISTING_MESSAGE);
        return;
      }
      const errorText = String(result.error || "");
      if (errorText.toLowerCase().includes("not enough gold")) {
        showBazaarInfoDialog("Not enough gold.");
        return;
      }
      if (errorText.toLowerCase().includes("inventory space")) {
        showBazaarInfoDialog("Not enough inventory space.");
        return;
      }
      showToast(errorText || "Purchase failed");
      return;
    }

    goldBalance = result.gold;
    if (goldBalanceEl) {
      goldBalanceEl.value = `${formatGold(goldBalance)} Gold`;
    }
    window.NosBazaar?.setGold?.(goldBalance);

    if (result.remaining > 0) {
      item.amount = result.remaining;
    } else {
      const sourceIdx = allListings.findIndex((i) => i.id === item.id);
      if (sourceIdx !== -1) allListings.splice(sourceIdx, 1);
      filteredItems.splice(globalIndex, 1);
      if (currentPage > totalPages()) currentPage = totalPages();
    }

    renderCurrentRows();
    renderPagination();
    void window.NosInventory?.reload?.();
    openBuyResultDialog(item, quantity);
  } catch (err) {
    showToast(`Purchase failed: ${err.message}`);
  }
}

let eventsBound = false;

function isEmbeddedBazaar() {
  return document.body.classList.contains("page-main");
}

function bindEvents() {
  if (eventsBound) return;
  eventsBound = true;

  document.getElementById("search-btn").addEventListener("click", () => {
    void runBazaarSearch();
  });
  document.getElementById("filter-name").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      void runBazaarSearch();
    }
  });

  document.getElementById("filter-category").addEventListener("change", updateCategoryFilters);

  document.getElementById("admin-search-btn")?.addEventListener("click", () => {
    void runAdminSearch();
  });

  document.querySelectorAll(".bazaar__pager-arrow").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.disabled) return;
      const pages = totalPages();
      switch (btn.dataset.page) {
        case "first": goToPage(1); break;
        case "prev": goToPage(currentPage - 1); break;
        case "next": goToPage(currentPage + 1); break;
        case "last": goToPage(pages); break;
      }
    });
  });

  document.getElementById("page-go").addEventListener("click", () => {
    const val = parseInt(pageJumpInput.value, 10);
    if (!Number.isNaN(val)) goToPage(val);
  });

  document.querySelectorAll(".bazaar__tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      setBazaarTab(tab.dataset.tab);
    });
  });

  document.getElementById("btn-close").addEventListener("click", async () => {
    if (isEmbeddedBazaar()) {
      window.NosBazaar.close();
      return;
    }
    await window.UiSound?.waitForClickSound?.();
    window.location.href = "/play/main";
  });

  bindSellTab();
}

let sellQuantity = 0;
let merchantMedal = null;
let sellListingDraft = null;

function formatSaleSummary(itemName, quantity) {
  return `${itemName} ${quantity} units`;
}

function formatSellQuantityLabel(quantity) {
  const qty = Math.max(0, Number(quantity) || 0);
  return `${qty} ${qty === 1 ? "Piece" : "Pieces"}`;
}

function updateSellQuantityUI() {
  const quantityEl = document.getElementById("sell-quantity");
  if (quantityEl) {
    quantityEl.textContent = formatSellQuantityLabel(sellQuantity);
  }
  updateSellTotal();
}

function renderSellSlot() {
  const slotEl = document.getElementById("sell-slot");
  if (!slotEl) return;

  slotEl.replaceChildren();
  if (!sellListingDraft) {
    slotEl.classList.remove("inventory__slot--filled");
    return;
  }

  slotEl.classList.add("inventory__slot--filled");
  const iconId = sellListingDraft.iconId || sellListingDraft.itemVNum;
  const img = document.createElement("img");
  img.className = "inventory__slot-icon";
  img.src = `https://nosapki.com/images/icons/${iconId}.png`;
  img.alt = "";
  img.draggable = false;
  slotEl.appendChild(img);

  if (sellListingDraft.quantity > 1) {
    const qty = document.createElement("span");
    qty.className = "inventory__slot-qty";
    qty.textContent = String(sellListingDraft.quantity);
    slotEl.appendChild(qty);
  }
}

function clearSellListingDraft() {
  sellListingDraft = null;
  sellQuantity = 0;
  renderSellSlot();
  updateSellQuantityUI();
}

function applySellListingDraft(entry, quantity) {
  const item = entry?.item || {};
  const maxQuantity = Math.max(1, Number(entry?.quantity) || 1);
  const qty = Math.min(maxQuantity, Math.max(1, Number(quantity) || 1));

  sellListingDraft = {
    instanceId: entry.instanceId,
    itemVNum: Number(item.itemVNum),
    name: item.name || "Item",
    iconId: item.iconId || item.itemVNum,
    maxQuantity,
    item,
  };
  sellQuantity = qty;
  renderSellSlot();
  updateSellQuantityUI();
}

function resetSellFormInputs() {
  const priceInput = document.getElementById("sell-price");
  if (priceInput) priceInput.value = "";
  resetSellMethodDefault();
  updateSellPeriodOptions();
  updateSellTotal();
}

function openSellQuantityDialog(entry, event) {
  if (!entry) return;

  const itemName = entry.item?.name || "Item";
  const maxQuantity = Math.max(1, Number(entry.quantity) || 1);

  applySellListingDraft(entry, maxQuantity);

  openQuantityDialog({
    useBodyOverlay: true,
    clientX: event.clientX,
    clientY: event.clientY,
    title: "Select sale amount",
    ariaLabel: "Select sale amount",
    getSummaryText: (quantity) => formatSaleSummary(itemName, quantity),
    maxQuantity,
    defaultQuantity: maxQuantity,
    confirmOnOutsideClick: true,
    onQuantityChange: (quantity) => {
      applySellListingDraft(entry, quantity);
    },
    onConfirm: (quantity) => {
      applySellListingDraft(entry, quantity);
    },
  });
}

function onInventoryDropForSell(drag, event) {
  if (!drag?.entry) return;
  resetSellFormInputs();
  openSellQuantityDialog(drag.entry, event);
}

function refreshListingsFromServer(listings) {
  allListings = (listings || []).map((item) => ({ ...item }));
  applyFilters();
}

async function executeCreateListing() {
  if (!sellListingDraft || sellQuantity < 1) {
    showToast("Put an item in the listing slot first.");
    return;
  }

  const priceInput = document.getElementById("sell-price");
  const periodSelect = document.getElementById("sell-period");
  const methodSelect = document.getElementById("sell-method");
  const unitPrice = parseSellPrice(priceInput?.value);
  if (unitPrice < 1) {
    showToast("Enter a price per unit.");
    return;
  }

  const total = sellQuantity * unitPrice;
  const fee = calculateListingFee(total, hasMerchantMedal());
  if (goldBalance < fee) {
    window.showMainAlertDialog?.("You don't have enough Gold to pay the listing fee.");
    return;
  }

  const listingPeriod = Number.parseInt(periodSelect?.value, 10) || 1;
  const bundleSale = methodSelect?.value === "bundle";

  try {
    const response = await fetch("/api/bazaar/list", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        instanceId: sellListingDraft.instanceId,
        quantity: sellQuantity,
        unitPrice,
        listingPeriod,
        bundleSale,
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = result.error || "Could not create listing.";
      if (message.includes("enough Gold")) {
        window.showMainAlertDialog?.("You don't have enough Gold to pay the listing fee.");
      } else {
        showToast(message);
      }
      return;
    }

    goldBalance = result.gold ?? goldBalance;
    if (goldBalanceEl) {
      goldBalanceEl.value = `${formatGold(goldBalance)} Gold`;
    }
    refreshListingsFromServer(result.listings);
    if (result.inventory) {
      window.NosInventory?.applyPayload?.({ inventory: result.inventory, gold: result.gold });
    } else {
      void window.NosInventory?.reload?.();
    }
    clearSellListingDraft();
    if (priceInput) priceInput.value = "";
    resetSellMethodDefault();
    updateSellPeriodOptions();
    showToast("Item listed on the NosBazaar.");
  } catch {
    showToast("Could not create listing.");
  }
}

const SELL_MAX_UNIT_PRICE_DEFAULT = 2_000_000;
const SELL_MAX_UNIT_PRICE_MEDAL = 2_000_000_000;
const CHANGE_PRICE_FEE = 20_000;

function hasMerchantMedal() {
  return merchantMedal != null;
}

function calculateListingFee(totalPrice, withMedal) {
  const price = Math.max(0, Number(totalPrice) || 0);
  if (withMedal) {
    if (price < 4000) return 50;
    const fee = 60 + Math.floor((price - 4000) / 2000) * 30;
    return Math.min(fee, 10_000);
  }
  if (price > 100_000) return Math.floor(price / 200);
  return 500;
}

function maxSellUnitPrice() {
  return hasMerchantMedal() ? SELL_MAX_UNIT_PRICE_MEDAL : SELL_MAX_UNIT_PRICE_DEFAULT;
}

function syncNativeSelect(selectId) {
  const select = document.getElementById(selectId);
  if (!select) return;

  const wrap = select.closest(".bazaar__custom-select");
  if (!wrap) return;

  const trigger = wrap.querySelector(".bazaar__custom-select__trigger");
  const enabledOptions = [...select.options].filter((opt) => !opt.disabled);
  const selected = select.options[select.selectedIndex];
  if (trigger) {
    trigger.disabled = enabledOptions.length === 0;
    trigger.textContent = selected && !selected.disabled ? selected.textContent : enabledOptions[0]?.textContent ?? "";
  }
}

function longestEnabledSelectValue(select) {
  let longestValue = -1;
  let longestOptionValue = null;

  for (const opt of select.options) {
    if (opt.disabled) continue;
    const days = Number.parseInt(opt.value, 10);
    if (!Number.isFinite(days) || days <= longestValue) continue;
    longestValue = days;
    longestOptionValue = opt.value;
  }

  return longestOptionValue ?? select.options[0]?.value ?? "1";
}

function updateSellPeriodOptions() {
  const select = document.getElementById("sell-period");
  if (!select) return;

  const withMedal = hasMerchantMedal();
  [...select.options].forEach((opt) => {
    const days = Number.parseInt(opt.value, 10);
    opt.disabled = !withMedal && days !== 1;
  });

  select.value = longestEnabledSelectValue(select);
  syncNativeSelect("sell-period");
}

function resetSellMethodDefault() {
  const select = document.getElementById("sell-method");
  if (!select) return;
  select.value = "individual";
  syncNativeSelect("sell-method");
}

function updateSellMedalUI() {
  const medalEl = document.getElementById("sell-medal");
  const feesNoteEl = document.querySelector(".bazaar__sell-fees-note");
  const footerEl = document.querySelector(".bazaar__sell-footer");
  if (!medalEl) return;

  const slotEl = medalEl.querySelector(".bazaar__sell-medal-slot");
  const nameEl = medalEl.querySelector(".bazaar__sell-medal-name");
  const timeEl = medalEl.querySelector(".bazaar__sell-medal-time");

  if (!hasMerchantMedal()) {
    medalEl.hidden = true;
    footerEl?.classList.remove("bazaar__sell-footer--centered");
    if (feesNoteEl) feesNoteEl.hidden = false;
    slotEl?.classList.remove("inventory__slot--filled");
    slotEl?.replaceChildren();
    if (nameEl) nameEl.textContent = "";
    if (timeEl) timeEl.textContent = "";
    return;
  }

  if (feesNoteEl) feesNoteEl.hidden = true;
  footerEl?.classList.add("bazaar__sell-footer--centered");
  medalEl.hidden = false;
  if (nameEl) nameEl.textContent = merchantMedal.name;
  if (timeEl) timeEl.textContent = merchantMedal.remainingText;

  const iconId = merchantMedal.iconId || merchantMedal.itemVNum;
  if (!slotEl) return;

  slotEl.classList.add("inventory__slot--filled");
  let icon = slotEl.querySelector(".bazaar__sell-medal-icon");
  if (!icon) {
    icon = document.createElement("img");
    icon.className = "inventory__slot-icon bazaar__sell-medal-icon";
    icon.alt = "";
    icon.draggable = false;
    slotEl.appendChild(icon);
  }
  icon.src = `https://nosapki.com/images/icons/${iconId}.png`;
}

function updateSellListingFee() {
  const feeEl = document.getElementById("sell-fee");
  const priceInput = document.getElementById("sell-price");
  if (!feeEl || !priceInput) return;

  const unitPrice = parseSellPrice(priceInput.value);
  const total = sellQuantity * unitPrice;
  const fee = calculateListingFee(total, hasMerchantMedal());
  feeEl.textContent = `${formatGold(fee)} Gold`;
}

function parseSellPrice(raw) {
  const digits = String(raw ?? "").replace(/[^\d]/g, "");
  if (!digits) return 0;
  const value = Number.parseInt(digits, 10);
  return Number.isFinite(value) ? value : 0;
}

function updateSellTotal() {
  const priceInput = document.getElementById("sell-price");
  const totalEl = document.getElementById("sell-total");
  if (!priceInput || !totalEl) return;

  const unitPrice = parseSellPrice(priceInput.value);
  const total = sellQuantity * unitPrice;
  totalEl.textContent = `${formatGold(total)} Gold`;
  updateSellListingFee();
}

function initSellFromData(json) {
  const medal = json.merchantMedal ?? null;
  if (medal) {
    const { activatedItemName: _activatedItemName, ...state } = medal;
    merchantMedal = state;
  } else {
    merchantMedal = null;
  }
  updateSellPeriodOptions();
  resetSellMethodDefault();
  updateSellMedalUI();
  updateSellTotal();
}

function setMerchantMedal(medal) {
  if (!medal) {
    merchantMedal = null;
  } else {
    const { activatedItemName: _activatedItemName, ...state } = medal;
    merchantMedal = state;
  }
  updateSellPeriodOptions();
  resetSellMethodDefault();
  updateSellMedalUI();
  updateSellListingFee();
}

function bindSellMedalSlot() {
  const slotEl = document.querySelector("#sell-medal .bazaar__sell-medal-slot");
  if (!slotEl || slotEl.dataset.bound === "1") return;
  slotEl.dataset.bound = "1";

  slotEl.addEventListener("contextmenu", (event) => {
    if (!hasMerchantMedal()) return;
    event.preventDefault();
    const iconId = merchantMedal.iconId || merchantMedal.itemVNum;
    window.MainUI?.openItemInfo?.({
      name: merchantMedal.name,
      icon: `https://nosapki.com/images/icons/${iconId}.png`,
      item: {
        itemVNum: merchantMedal.itemVNum,
        name: merchantMedal.name,
      },
    });
  });
}

function bindSellSlot() {
  const slotEl = document.getElementById("sell-slot");
  if (!slotEl || slotEl.dataset.bound === "1") return;
  slotEl.dataset.bound = "1";

  slotEl.addEventListener("contextmenu", (event) => {
    if (!sellListingDraft) return;
    event.preventDefault();
    const iconId = sellListingDraft.iconId || sellListingDraft.itemVNum;
    window.MainUI?.openItemInfo?.({
      name: sellListingDraft.name,
      icon: `https://nosapki.com/images/icons/${iconId}.png`,
      item: sellListingDraft.item,
    });
  });
}

function bindSellTab() {
  bindSellMedalSlot();
  bindSellSlot();
  updateSellMedalUI();
  resetSellMethodDefault();
  updateSellQuantityUI();
  renderSellSlot();
  const priceInput = document.getElementById("sell-price");
  const listBtn = document.getElementById("sell-list-btn");
  if (!priceInput) return;

  priceInput.addEventListener("input", () => {
    let value = parseSellPrice(priceInput.value);
    const maxPrice = maxSellUnitPrice();
    if (value > maxPrice) value = maxPrice;
    priceInput.value = value > 0 ? formatGold(value) : "";
    updateSellTotal();
  });

  listBtn?.addEventListener("click", () => {
    void executeCreateListing();
  });
}

function setBazaarTab(tabId) {
  activeBazaarTab = tabId;
  document.querySelectorAll(".bazaar__tab").forEach((tab) => {
    tab.classList.toggle("bazaar__tab--active", tab.dataset.tab === tabId);
  });
  document.querySelectorAll(".bazaar__tab-panel").forEach((panel) => {
    panel.classList.toggle("bazaar__tab-panel--active", panel.dataset.tab === tabId);
  });
  document.getElementById("bazaar-footer")?.classList.toggle("bazaar__footer--gold-only", tabId === "list");

  if (tabId === "admin") {
    void loadAdminListings();
    return;
  }

  currentPage = 1;
  renderCurrentRows();
  renderPagination();
}

function syncFilterSelect(selectId, options) {
  const select = document.getElementById(selectId);
  fillSelect(select, options);
  select.selectedIndex = options.length > 0 ? 0 : -1;

  const wrap = select.closest(".bazaar__custom-select");
  if (wrap) {
    const trigger = wrap.querySelector(".bazaar__custom-select__trigger");
    if (trigger) {
      trigger.disabled = options.length === 0;
      trigger.textContent = options.length > 0 ? select.options[0].textContent : "";
    }
    closeCustomSelect(wrap);
  }
}

function updateDynamicSelect() {
  const category = document.getElementById("filter-category").value;
  const options = category ? (data.dynamicOptions?.[category] ?? []) : [];
  syncFilterSelect("filter-dynamic", options);
}

function updateLevelSelect() {
  const category = document.getElementById("filter-category").value;
  const setKey = data.levelOptionsByCategory?.[category];
  const options = setKey ? (data.levelOptionSets?.[setKey] ?? []) : [];
  syncFilterSelect("filter-level", options);
}

function updateRaritySelect() {
  const category = document.getElementById("filter-category").value;
  const setKey = data.rarityOptionsByCategory?.[category];
  const options = setKey ? (data.rarityOptionSets?.[setKey] ?? []) : [];
  syncFilterSelect("filter-rarity", options);
}

function updateUpgradeSelect() {
  const category = document.getElementById("filter-category").value;
  const setKey = data.upgradeOptionsByCategory?.[category];
  const options = setKey ? (data.upgradeOptionSets?.[setKey] ?? []) : [];
  syncFilterSelect("filter-upgrade", options);
}

function updateCategoryFilters() {
  updateDynamicSelect();
  updateLevelSelect();
  updateRaritySelect();
  updateUpgradeSelect();
}

function initFromData(json) {
  data = json;
  itemsPerPage = data.config?.itemsPerPage ?? 10;
  defaultSort = data.config?.defaultSort ?? "price-asc";
  allListings = data.listings.map((item) => ({ ...item }));
  filteredItems = [...allListings];
  goldBalance = data.player?.gold ?? 0;
  playerName = data.player?.name ?? "";

  document.getElementById("window-title").textContent = data.config?.windowTitle ?? "NosBazaar";
  goldBalanceEl.value = `${formatGold(goldBalance)} Gold`;

  fillSelect(document.getElementById("filter-category"), data.categories);
  updateCategoryFilters();
  fillSelect(document.getElementById("filter-sort"), data.sortOptions);
  document.getElementById("filter-sort").value = defaultSort;

  enhanceAllSelects();
  initSellFromData(json);

  bindEvents();
  applyFilters();
  scheduleBazaarReposition();
}

function scheduleBazaarReposition() {
  if (!isEmbeddedBazaar()) return;

  requestAnimationFrame(() => {
    positionBazaarWindow();
    requestAnimationFrame(() => positionBazaarWindow());
  });
}

async function loadData() {
  const frame = document.querySelector(".bazaar__frame");
  if (!frame) return;

  try {
    const response = await fetch("/api/bootstrap", { credentials: "same-origin" });
    if (await window.SessionFlow.respondToUnauthorized(response)) {
      return;
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    initFromData(await response.json());
  } catch (err) {
    frame.innerHTML =
      `<div class="bazaar-error">Failed to load from SQLite API: ${err.message}<br>Close and restart <code>NostaleWeb.exe</code>.</div>`;
  }
}

function positionBazaarWindow() {
  const root = document.getElementById("bazaar-root");
  const scene = document.querySelector(".scene--main");
  if (!root || !scene) return;

  const pad = 12;
  const rect = root.getBoundingClientRect();
  const width = rect.width || root.offsetWidth || 786;
  const height = rect.height || root.offsetHeight || 520;
  const sceneWidth = scene.clientWidth;
  const sceneHeight = scene.clientHeight;

  let left = (sceneWidth - width) / 2;
  let top = (sceneHeight - height) / 2;

  if (height >= sceneHeight - pad * 2) {
    top = pad;
  } else {
    top = Math.max(pad, Math.min(top, sceneHeight - height - pad));
  }

  left = Math.max(pad, Math.min(left, sceneWidth - width - pad));

  root.style.left = `${left}px`;
  root.style.top = `${top}px`;
}

function openBazaarWindow() {
  const layer = document.getElementById("bazaar-layer");
  const root = document.getElementById("bazaar-root");
  if (!layer || !root) {
    window.location.href = "/bazaar";
    return;
  }

  root.classList.remove("bazaar--dragging");
  root.style.left = "0px";
  root.style.top = "0px";
  layer.hidden = false;
  scheduleBazaarReposition();
  window.NosWindowFocus?.bringToFront?.(root);
  loadData();
}

function setGold(gold) {
  goldBalance = Math.max(0, Number(gold) || 0);
  if (goldBalanceEl) {
    goldBalanceEl.value = `${formatGold(goldBalance)} Gold`;
  }
  const inventoryGoldEl = document.getElementById("inventory-gold");
  if (inventoryGoldEl) {
    inventoryGoldEl.value = `${formatGold(goldBalance)} Gold`;
  }
}

function closeBazaarWindow() {
  const layer = document.getElementById("bazaar-layer");
  if (layer) layer.hidden = true;
  closePurchaseDialog();
  closeAllCustomSelects();
}

window.NosBazaar = {
  open: openBazaarWindow,
  close: closeBazaarWindow,
  reposition: positionBazaarWindow,
  setMerchantMedal,
  setGold,
  onInventoryDropForSell,
};

window.NosReplaceableWindows?.register("bazaar", {
  group: "bazaar",
  close: closeBazaarWindow,
});

if (!isEmbeddedBazaar()) {
  loadData();
}
