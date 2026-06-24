function iconUrl(listing) {
  if (listing.iconUrl) return listing.iconUrl;
  if (window.ItemIcons?.itemIconUrl) return window.ItemIcons.itemIconUrl(listing);
  return null;
}

let data = null;
let allListings = [];
let filteredItems = [];
let currentPage = 1;
let goldBalance = 0;
let itemsPerPage = 10;
let defaultSort = "price-asc";

const tbody = document.getElementById("item-rows");
const pageNumbersEl = document.getElementById("page-numbers");
const pageJumpInput = document.getElementById("page-jump");
const goldBalanceEl = document.getElementById("gold-balance");

function formatGold(n) {
  return n.toLocaleString("en-US");
}

function totalPages() {
  return Math.max(1, Math.ceil(filteredItems.length / itemsPerPage));
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
    tdTime.textContent = `${item.days} Day(s)`;

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
  renderRows();
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

function applyFilters() {
  const name = document.getElementById("filter-name").value.trim().toLowerCase();
  const category = document.getElementById("filter-category").value;
  const sort = document.getElementById("filter-sort").value;

  filteredItems = allListings.filter((item) => {
    if (name && !item.name.toLowerCase().includes(name)) return false;
    if (category && normalizeListingCategory(item.category) !== category) return false;
    return true;
  });

  filteredItems.sort((a, b) => {
    switch (sort) {
      case "price-desc": return b.price - a.price;
      case "amount-asc": return a.amount - b.amount;
      case "amount-desc": return b.amount - a.amount;
      default: return a.price - b.price;
    }
  });

  currentPage = 1;
  renderRows();
  renderPagination();
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

let purchaseDialogState = null;
let purchaseOutsideHandler = null;

function closePurchaseDialog() {
  if (!purchaseDialogState) return;
  purchaseDialogState.el.remove();
  purchaseDialogState = null;
  if (purchaseOutsideHandler) {
    document.removeEventListener("mousedown", purchaseOutsideHandler);
    purchaseOutsideHandler = null;
  }
}

function bindPurchaseOutsideClose() {
  if (purchaseOutsideHandler) {
    document.removeEventListener("mousedown", purchaseOutsideHandler);
  }

  purchaseOutsideHandler = (event) => {
    if (!purchaseDialogState) return;
    if (purchaseDialogState.el.contains(event.target)) return;
    closePurchaseDialog();
  };

  document.addEventListener("mousedown", purchaseOutsideHandler);
}

function formatPurchaseSummary(item, quantity) {
  const total = Number(item.price) * quantity;
  return `${item.name} ${quantity} units ${formatGold(total)} gold`;
}

function syncPurchaseControlsWidth(summary, controls) {
  summary.style.width = "max-content";
  const width = Math.ceil(summary.getBoundingClientRect().width);
  controls.style.width = `${width}px`;
}

function positionPurchaseDialog(el, container, clientX, clientY) {
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

function openPurchaseDialog(item, globalIndex, event) {
  const container = document.getElementById("bazaar-layer") || document.getElementById("bazaar-root");
  if (!container) return;

  closePurchaseDialog();

  const maxQuantity = Math.max(1, Number(item.amount) || 1);
  let quantity = 1;

  const el = document.createElement("div");
  el.className = "bazaar__purchase";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-label", "Select purchase amount");

  const title = document.createElement("div");
  title.className = "bazaar__purchase-title";
  title.textContent = "Select purchase amount";

  const summary = document.createElement("div");
  summary.className = "bazaar__purchase-summary";

  const controls = document.createElement("div");
  controls.className = "bazaar__purchase-controls";

  const input = document.createElement("input");
  input.type = "text";
  input.className = "bazaar__purchase-input";
  input.inputMode = "numeric";
  input.value = "1";

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
  el.append(title, summary, controls);
  container.appendChild(el);

  function syncQuantity(nextValue) {
    const parsed = Number.parseInt(String(nextValue), 10);
    quantity = Number.isNaN(parsed) ? 1 : Math.min(maxQuantity, Math.max(1, parsed));
    input.value = String(quantity);
    summary.textContent = formatPurchaseSummary(item, quantity);
    syncPurchaseControlsWidth(summary, controls);
  }

  function changeQuantity(delta) {
    syncQuantity(quantity + delta);
  }

  function confirmPurchase() {
    syncQuantity(input.value);
    void executeBuy(item, globalIndex, quantity);
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
    confirmPurchase();
  });
  input.addEventListener("input", () => syncQuantity(input.value));
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      confirmPurchase();
    }
  });
  el.addEventListener("mousedown", (e) => e.stopPropagation());

  purchaseDialogState = { el, item, globalIndex };
  syncQuantity(1);

  requestAnimationFrame(() => {
    syncPurchaseControlsWidth(summary, controls);
    positionPurchaseDialog(el, container, event.clientX, event.clientY);
    input.focus({ preventScroll: true });
    input.select();
  });

  setTimeout(bindPurchaseOutsideClose, 0);
}

async function executeBuy(item, globalIndex, quantity) {
  closePurchaseDialog();
  try {
    const response = await fetch(`/api/buy/${item.id}`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quantity }),
    });
    const result = await response.json();
    if (!response.ok) {
      showToast(result.error || "Purchase failed");
      return;
    }

    goldBalance = result.gold;
    goldBalanceEl.value = `${formatGold(goldBalance)} Gold`;

    if (result.remaining > 0) {
      item.amount = result.remaining;
    } else {
      const sourceIdx = allListings.findIndex((i) => i.id === item.id);
      if (sourceIdx !== -1) allListings.splice(sourceIdx, 1);
      filteredItems.splice(globalIndex, 1);
      if (currentPage > totalPages()) currentPage = totalPages();
    }

    showToast(`Purchased ${result.quantity}x ${result.name}`);
    renderRows();
    renderPagination();
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

  document.getElementById("search-btn").addEventListener("click", applyFilters);
  document.getElementById("filter-name").addEventListener("keydown", (e) => {
    if (e.key === "Enter") applyFilters();
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
      const tabId = tab.dataset.tab;
      document.querySelectorAll(".bazaar__tab").forEach((t) => t.classList.remove("bazaar__tab--active"));
      tab.classList.add("bazaar__tab--active");
      document.querySelectorAll(".bazaar__tab-panel").forEach((panel) => {
        const active = panel.dataset.tab === tabId;
        panel.classList.toggle("bazaar__tab-panel--active", active);
      });
    });
  });

  document.getElementById("btn-close").addEventListener("click", () => {
    if (isEmbeddedBazaar()) {
      window.NosBazaar.close();
      return;
    }
    window.location.href = "/play/main";
  });

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

  document.getElementById("window-title").textContent = data.config?.windowTitle ?? "NosBazaar";
  goldBalanceEl.value = `${formatGold(goldBalance)} Gold`;

  fillSelect(document.getElementById("filter-category"), data.categories);
  updateCategoryFilters();
  fillSelect(document.getElementById("filter-sort"), data.sortOptions);
  document.getElementById("filter-sort").value = defaultSort;

  document.getElementById("filter-category").addEventListener("change", updateCategoryFilters);

  enhanceAllSelects();

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
      `<div class="bazaar-error">Failed to load from SQLite API: ${err.message}<br>Run <code>py scripts/init_db.py</code> then start <code>NostaleWeb.exe</code></div>`;
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
};

if (!isEmbeddedBazaar()) {
  loadData();
}
