(() => {
  const LIST_BATCH = 40;
  const CHANGE_PRICE_FEE = 20_000;
  const SELL_MAX_UNIT_PRICE_DEFAULT = 2_000_000;
  const SELL_MAX_UNIT_PRICE_MEDAL = 2_000_000_000;
  const OWN_LISTING_MESSAGE = "This is an item that you put up for sale.";
  const OWN_AUCTION_MESSAGE = "This is an item that you put up on auction.";
  const AUCTION_POLL_MS = 2000;
  const FIXED_PERIOD_OPTIONS = [
    { value: "1", label: "1 Day(s)" },
    { value: "7", label: "7 Day(s)" },
    { value: "15", label: "15 Day(s)" },
    { value: "30", label: "30 Day(s)" },
  ];
  const AUCTION_PERIOD_OPTIONS = [
    { value: "60", label: "1 Hour" },
    { value: "180", label: "3 Hours" },
    { value: "360", label: "6 Hours" },
    { value: "720", label: "12 Hours" },
    { value: "1440", label: "1 Day" },
    { value: "4320", label: "3 Days" },
    { value: "10080", label: "1 Week" },
  ];

  const layerEl = document.getElementById("bazaar-v2-layer");
  const rootEl = document.getElementById("bazaar-v2-root");
  const titlebarEl = document.getElementById("bazaar-v2-titlebar");
  const closeBtn = document.getElementById("bazaar-v2-close");
  const windowTitleEl = document.getElementById("bazaar-v2-window-title");
  const goldEl = document.getElementById("bazaar-v2-gold");
  const searchInputEl = document.getElementById("bazaar-v2-search-input");
  const searchBtn = document.getElementById("bazaar-v2-search-btn");
  const listingsScrollEl = document.getElementById("bazaar-v2-listings-scroll");
  const listingsListEl = document.getElementById("bazaar-v2-listings-list");
  const filterOpenBtn = document.getElementById("bazaar-v2-filter-open");
  const filterCloseBtn = document.getElementById("bazaar-v2-filter-close");
  const filterBackdropEl = document.getElementById("bazaar-v2-filter-backdrop");
  const filterDrawerEl = document.getElementById("bazaar-v2-filter-drawer");
  const filterApplyBtn = document.getElementById("bazaar-v2-filter-apply");
  const filterResetBtn = document.getElementById("bazaar-v2-filter-reset");
  const detailEmptyEl = document.querySelector("#bazaar-v2-panel-detail .bazaar-v2__panel-empty");
  const detailContentEl = document.getElementById("bazaar-v2-detail-content");
  const adminListEl = document.getElementById("bazaar-v2-admin-list");
  const sellSlotEl = document.getElementById("bazaar-v2-sell-slot");
  const sellQuantityEl = document.getElementById("bazaar-v2-sell-quantity");
  const sellPeriodEl = document.getElementById("bazaar-v2-sell-period");
  const sellMethodEl = document.getElementById("bazaar-v2-sell-method");
  const sellPriceEl = document.getElementById("bazaar-v2-sell-price");
  const sellTotalEl = document.getElementById("bazaar-v2-sell-total");
  const sellFeeEl = document.getElementById("bazaar-v2-sell-fee");
  const sellSubmitBtn = document.getElementById("bazaar-v2-sell-submit");
  const sellFixedFieldsEl = document.getElementById("bazaar-v2-sell-fixed-fields");
  const sellAuctionFieldsEl = document.getElementById("bazaar-v2-sell-auction-fields");
  const sellStartPriceEl = document.getElementById("bazaar-v2-sell-start-price");
  const sellInstantPriceEl = document.getElementById("bazaar-v2-sell-instant-price");
  const sellIncrementEl = document.getElementById("bazaar-v2-sell-increment");
  const sellAnonymousSellerEl = document.getElementById("bazaar-v2-sell-anonymous-seller");
  const sellAnonymousBuyerEl = document.getElementById("bazaar-v2-sell-anonymous-buyer");
  const sellQuantityRowEl = document.getElementById("bazaar-v2-sell-quantity-row");
  const bidLayerEl = document.getElementById("bazaar-v2-bid-layer");
  const bidAmountEl = document.getElementById("bazaar-v2-bid-amount");
  const bidAnonymousEl = document.getElementById("bazaar-v2-bid-anonymous");
  const bidAnonymousWrapEl = document.getElementById("bazaar-v2-bid-anonymous-wrap");
  const bidConfirmBtn = document.getElementById("bazaar-v2-bid-confirm");
  const bidCancelBtn = document.getElementById("bazaar-v2-bid-cancel");
  const sceneEl = document.querySelector(".scene--main");
  const footerMedalEl = document.getElementById("bazaar-v2-footer-medal");
  const footerMedalIconEl = document.getElementById("bazaar-v2-footer-medal-icon");
  const footerMedalTimeEl = document.getElementById("bazaar-v2-footer-medal-time");

  const ADMIN_ACTION_ICONS = {
    change:
      '<svg class="bazaar-v2__admin-icon-svg" viewBox="0 0 14 14" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" d="M10.5 4.5H3.5M5 2.5 3.5 4.5 5 6.5"/><path fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" d="M3.5 9.5h7M9 7.5l1.5 2-1.5 2"/></svg>',
    quit:
      '<svg class="bazaar-v2__admin-icon-svg" viewBox="0 0 14 14" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" d="M4 4l6 6M10 4l-6 6"/></svg>',
    received:
      '<svg class="bazaar-v2__admin-icon-svg" viewBox="0 0 14 14" aria-hidden="true"><path fill="currentColor" d="M2.2 7.2l2.8 2.8 6.8-6.8v2.2L5 12.2 2.2 9.4V7.2z"/></svg>',
    claim:
      '<svg class="bazaar-v2__admin-icon-svg" viewBox="0 0 14 14" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" d="M3 7.5 5.5 10 11 4"/></svg>',
    refund:
      '<svg class="bazaar-v2__admin-icon-svg" viewBox="0 0 14 14" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" d="M9.5 3.5H4.5M6 1.5 4.5 3.5 6 5.5"/><path fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" d="M4.5 10.5h5M8 8.5l1.5 2-1.5 2"/></svg>',
  };

  let bootstrapData = null;
  let allListings = [];
  let filteredListings = [];
  let renderedCount = 0;
  let selectedListing = null;
  let selectedListingIndex = -1;
  let allAdminListings = [];
  let activePanel = "detail";
  let sellType = "fixed";
  let sellListingDraft = null;
  let sellQuantity = 0;
  let merchantMedal = null;
  let goldBalance = 0;
  let playerName = "";
  let playerCharacterId = 0;
  let defaultSort = "price-asc";
  let activeQuickSearch = "";
  let committedDrawerFilters = {
    name: "",
    category: "",
    level: "",
    rarity: "",
    upgrade: "",
    dynamic: "",
    sort: "price-asc",
  };
  let userMoved = false;
  let sellSlotDropHighlight = null;
  let selectedListingBids = [];
  let bidDialogListing = null;
  let auctionPollTimer = null;
  let auctionTickTimer = null;

  function formatAuctionTimeRemaining(totalSeconds) {
    let seconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
    const days = Math.floor(seconds / 86400);
    seconds %= 86400;
    const hours = Math.floor(seconds / 3600);
    seconds %= 3600;
    const minutes = Math.floor(seconds / 60);
    seconds %= 60;
    const pad = (value) => String(value).padStart(2, "0");
    if (days > 0) return `${days}d ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }

  function auctionSecondsRemaining(listing) {
    if (listing?.expiresAt) {
      const expiresMs = Date.parse(String(listing.expiresAt));
      if (Number.isFinite(expiresMs)) {
        return Math.max(0, Math.floor((expiresMs - Date.now()) / 1000));
      }
    }
    return Math.max(0, Number(listing?.secondsRemaining) || 0);
  }

  function updateSellPeriodOptions() {
    if (!sellPeriodEl) return;
    const options = sellType === "auction" ? AUCTION_PERIOD_OPTIONS : FIXED_PERIOD_OPTIONS;
    const previous = sellPeriodEl.value;
    sellPeriodEl.replaceChildren();
    options.forEach((option) => {
      const el = document.createElement("option");
      el.value = option.value;
      el.textContent = option.label;
      sellPeriodEl.appendChild(el);
    });
    const fallback = options[0]?.value || "1";
    sellPeriodEl.value = options.some((option) => option.value === previous) ? previous : fallback;
  }

  function tickAuctionCountdowns() {
    document.querySelectorAll(".bazaar-v2__auction-time-remaining").forEach((el) => {
      const expiresAt = el.dataset.expiresAt;
      if (!expiresAt) return;
      const expiresMs = Date.parse(expiresAt);
      if (!Number.isFinite(expiresMs)) return;
      const seconds = Math.max(0, Math.floor((expiresMs - Date.now()) / 1000));
      el.textContent = formatAuctionTimeRemaining(seconds);
    });
  }

  function hasActiveAuctionListings() {
    return allListings.some(isAuctionListing);
  }

  async function pollAuctionUpdates() {
    if (!layerEl || layerEl.hidden) return;
    if (!hasActiveAuctionListings() && !(selectedListing && isAuctionListing(selectedListing))) return;
    try {
      const response = await fetch("/api/listings", { credentials: "same-origin" });
      if (await window.SessionFlow?.respondToUnauthorized?.(response)) return;
      if (!response.ok) return;
      const payload = await response.json();
      refreshListingsFromServer(payload.listings || [], { preserveSelection: true, reloadBids: true });
    } catch {
      // Ignore transient network errors during polling.
    }
  }

  function startAuctionTimers() {
    stopAuctionTimers();
    auctionPollTimer = window.setInterval(() => void pollAuctionUpdates(), AUCTION_POLL_MS);
    auctionTickTimer = window.setInterval(tickAuctionCountdowns, 1000);
  }

  function stopAuctionTimers() {
    if (auctionPollTimer) {
      window.clearInterval(auctionPollTimer);
      auctionPollTimer = null;
    }
    if (auctionTickTimer) {
      window.clearInterval(auctionTickTimer);
      auctionTickTimer = null;
    }
  }
  function formatDisplayName(name) {
    const text = String(name ?? "").trim();
    if (!text) return "";
    if (text === "???" || text === "Anonymous") return "Anonymous";
    return text;
  }

  function createAuctionBadge() {
    const badge = document.createElement("span");
    badge.className = "bazaar-v2__auction-badge";
    badge.title = "Auction";
    badge.setAttribute("aria-label", "Auction");
    return badge;
  }

  function createAdminIconButton(kind, label, onClick) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `bazaar-v2__admin-icon-btn bazaar-v2__admin-icon-btn--${kind}`;
    btn.setAttribute("aria-label", label);
    btn.title = label;
    btn.innerHTML = ADMIN_ACTION_ICONS[kind];
    btn.addEventListener("click", onClick);
    return btn;
  }

  function formatGold(value) {
    return Math.max(0, Number(value) || 0).toLocaleString("en-US");
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
    showToast._timer = window.setTimeout(() => toast.classList.remove("toast--visible"), 2200);
  }

  function listingIconUrl(listing) {
    if (listing?.iconUrl) return listing.iconUrl;
    if (window.ItemIcons?.itemIconUrl) return window.ItemIcons.itemIconUrl(listing);
    if (listing?.iconId) return `https://nosapki.com/images/icons/${listing.iconId}.png`;
    return null;
  }

  function createItemIcon(listing) {
    const wrap = document.createElement("span");
    wrap.className = "bazaar__item-icon-wrap";
    const url = listingIconUrl(listing);
    if (!url) {
      const fallback = document.createElement("span");
      fallback.className = "bazaar__item-icon--fallback";
      wrap.appendChild(fallback);
    } else {
      const img = document.createElement("img");
      img.className = "bazaar__item-icon";
      img.src = url;
      img.alt = "";
      img.draggable = false;
      wrap.appendChild(img);
    }
    wrap.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      event.stopPropagation();
      window.MainUI?.openItemInfo?.({ ...listing, icon: url, item: listing.item || listing });
    });
    return wrap;
  }

  function isAuctionListing(listing) {
    return Boolean(listing?.isAuction || listing?.auction);
  }

  function hasInstantPrice(listing) {
    const price = Number(listing?.instantPrice);
    return Number.isFinite(price) && price > 0;
  }

  function ownListingMessage(listing) {
    return isAuctionListing(listing) ? OWN_AUCTION_MESSAGE : OWN_LISTING_MESSAGE;
  }

  function isOwnListing(listing) {
    const sellerId = Number(listing?.sellerCharacterId);
    const viewerId = Number(playerCharacterId);
    if (Number.isFinite(sellerId) && Number.isFinite(viewerId) && sellerId > 0 && viewerId > 0) {
      return sellerId === viewerId;
    }
    const seller = String(listing?.seller ?? "").trim();
    const buyer = String(playerName || window.ChatUI?.getPlayerName?.() || "").trim();
    if (!seller || !buyer) return false;
    return seller.toLowerCase() === buyer.toLowerCase();
  }

  function normalizeListingCategory(category) {
    const legacy = { accessory: "accessories", armor: "armour", material: "miscellaneous" };
    return legacy[category] || category;
  }

  function getListingItemMeta(listing) {
    return listing?.item || listing || {};
  }

  function matchesNumericRange(value, range) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return false;
    const match = /^(\d+)-(\d+)$/.exec(String(range || ""));
    if (!match) return false;
    return numeric >= Number(match[1]) && numeric <= Number(match[2]);
  }

  function matchesLevelFilter(meta, levelValue) {
    if (!levelValue) return true;
    const requiredLv = Number(meta.requiredLv);
    const requiredCLv = Number(meta.requiredCLv);
    if (levelValue === "champion_gear") return Number.isFinite(requiredCLv) && requiredCLv > 0;
    if (levelValue.startsWith("champion_")) return matchesNumericRange(requiredCLv, levelValue.slice("champion_".length));
    return matchesNumericRange(requiredLv, levelValue);
  }

  function matchesRarityFilter(meta, rarityValue) {
    if (!rarityValue) return true;
    if (rarityValue.startsWith("perfection_")) return matchesNumericRange(meta.rarity, rarityValue.slice("perfection_".length));
    return String(meta.rarity ?? "") === String(rarityValue);
  }

  function matchesUpgradeFilter(meta, upgradeValue) {
    if (!upgradeValue) return true;
    const upgrade = Number(meta.shell);
    if (!Number.isFinite(upgrade)) return upgradeValue === "0";
    return String(upgrade) === String(upgradeValue);
  }

  function matchesDynamicFilter(meta, dynamicValue) {
    if (!dynamicValue) return true;
    const classFlags = {
      swordsman: "isSwordsman",
      archer: "isArcher",
      magician: "isMage",
      mage: "isMage",
      adventurer: "isAdventurer",
      martial_artist: "isMartialArtist",
    };
    const flag = classFlags[dynamicValue];
    if (flag) return Boolean(meta[flag]);
    const group = String(meta.dynamicGroupName || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
    const needle = dynamicValue.toLowerCase();
    return group === needle || group.includes(needle);
  }

  function getDefaultDrawerFilters() {
    return {
      name: "",
      category: "",
      level: "",
      rarity: "",
      upgrade: "",
      dynamic: "",
      sort: defaultSort,
    };
  }

  function readDrawerFiltersFromDom() {
    return {
      name: document.getElementById("bazaar-v2-filter-name")?.value.trim().toLowerCase() || "",
      category: document.getElementById("bazaar-v2-filter-category")?.value || "",
      level: document.getElementById("bazaar-v2-filter-level")?.value || "",
      rarity: document.getElementById("bazaar-v2-filter-rarity")?.value || "",
      upgrade: document.getElementById("bazaar-v2-filter-upgrade")?.value || "",
      dynamic: document.getElementById("bazaar-v2-filter-dynamic")?.value || "",
      sort: document.getElementById("bazaar-v2-filter-sort")?.value || defaultSort,
    };
  }

  function hasActiveDrawerFilters() {
    const defaults = getDefaultDrawerFilters();
    return Object.keys(defaults).some((key) => committedDrawerFilters[key] !== defaults[key]);
  }

  function updateFilterButtonState() {
    filterOpenBtn?.classList.toggle("bazaar-v2__filter-btn--active", hasActiveDrawerFilters());
  }

  function readFilters() {
    return {
      name: committedDrawerFilters.name,
      quickSearch: activeQuickSearch,
      category: committedDrawerFilters.category,
      level: committedDrawerFilters.level,
      rarity: committedDrawerFilters.rarity,
      upgrade: committedDrawerFilters.upgrade,
      dynamic: committedDrawerFilters.dynamic,
      sort: committedDrawerFilters.sort,
    };
  }

  function listingMatchesFilters(listing, filters) {
    const meta = getListingItemMeta(listing);
    const nameNeedle = filters.quickSearch || filters.name;
    if (nameNeedle && !String(listing.name || "").toLowerCase().includes(nameNeedle)) return false;
    if (filters.category && normalizeListingCategory(listing.category) !== filters.category) return false;
    if (!matchesLevelFilter(meta, filters.level)) return false;
    if (!matchesRarityFilter(meta, filters.rarity)) return false;
    if (!matchesUpgradeFilter(meta, filters.upgrade)) return false;
    if (!matchesDynamicFilter(meta, filters.dynamic)) return false;
    return true;
  }

  function applyFilters() {
    const filters = readFilters();
    filteredListings = allListings.filter((item) => listingMatchesFilters(item, filters));
    filteredListings.sort((a, b) => {
      switch (filters.sort) {
        case "price-desc":
          return listingSortPrice(b) - listingSortPrice(a);
        case "amount-asc":
          return a.amount - b.amount;
        case "amount-desc":
          return b.amount - a.amount;
        default:
          return listingSortPrice(a) - listingSortPrice(b);
      }
    });
    renderedCount = 0;
    renderListings(true);
    if (selectedListing) {
      const idx = filteredListings.findIndex((item) => item.id === selectedListing.id);
      if (idx === -1) {
        clearSelection();
      } else {
        selectedListingIndex = idx;
        selectedListing = filteredListings[idx];
        renderDetailPanel();
        highlightSelectedRow();
      }
    }
  }

  function listingSortPrice(listing) {
    if (isAuctionListing(listing)) {
      return auctionCurrentOffer(listing);
    }
    return Number(listing.price) || 0;
  }

  function auctionCurrentOffer(listing) {
    const current = Number(listing?.currentOffer);
    if (Number.isFinite(current) && current > 0) return current;
    return Number(listing?.startingPrice ?? listing?.price) || 0;
  }

  function minimumAuctionBid(listing) {
    return auctionCurrentOffer(listing) + (Number(listing?.bidIncrement) || 0);
  }

  function formatRelativeBidTime(isoString) {
    if (!isoString) return "—";
    const then = Date.parse(isoString);
    if (!Number.isFinite(then)) return "—";
    const diffMs = Math.max(0, Date.now() - then);
    const minutes = Math.floor(diffMs / 60000);
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  }

  function parseYesNoSelect(el) {
    return el?.value === "yes";
  }

  function formatListingPrice(listing) {
    if (isAuctionListing(listing)) {
      return formatGold(auctionCurrentOffer(listing));
    }
    return formatGold(listing.price);
  }

  function renderListingRow(listing, index) {
    const tr = document.createElement("tr");
    tr.dataset.listingId = String(listing.id);
    if (selectedListing?.id === listing.id) {
      tr.classList.add("bazaar-v2__row--selected");
    }

    const tdItem = document.createElement("td");
    tdItem.className = "col-name";
    const cell = document.createElement("div");
    cell.className = "bazaar__item";
    cell.appendChild(createItemIcon(listing));
    const textWrap = document.createElement("div");
    const nameRow = document.createElement("div");
    nameRow.className = "bazaar-v2__listing-name-row";
    const name = document.createElement("span");
    name.className = "bazaar__item-name";
    name.textContent = listing.name;
    name.title = listing.name;
    nameRow.appendChild(name);
    const seller = document.createElement("span");
    seller.className = "bazaar-v2__listing-subline";
    const sellerLabel = formatDisplayName(listing.seller);
    seller.textContent = sellerLabel;
    seller.title = sellerLabel;
    textWrap.append(nameRow, seller);
    if (isAuctionListing(listing)) {
      const badges = document.createElement("div");
      badges.className = "bazaar-v2__listing-badges";
      badges.appendChild(createAuctionBadge());
      textWrap.appendChild(badges);
    }
    cell.appendChild(textWrap);
    tdItem.appendChild(cell);

    const tdQty = document.createElement("td");
    tdQty.className = "col-amount";
    tdQty.textContent = String(listing.amount ?? 0);

    const tdPrice = document.createElement("td");
    tdPrice.className = "col-price";
    tdPrice.textContent = formatListingPrice(listing);

    tr.append(tdItem, tdQty, tdPrice);
    tr.addEventListener("click", () => selectListing(listing, index));
    return tr;
  }

  function renderListings(reset = false) {
    if (!listingsListEl) return;
    if (reset) listingsListEl.replaceChildren();
    const nextItems = filteredListings.slice(renderedCount, renderedCount + LIST_BATCH);
    nextItems.forEach((listing, offset) => {
      listingsListEl.appendChild(renderListingRow(listing, renderedCount + offset));
    });
    renderedCount += nextItems.length;
  }

  function highlightSelectedRow() {
    listingsListEl?.querySelectorAll("tr[data-listing-id]").forEach((row) => {
      row.classList.toggle(
        "bazaar-v2__row--selected",
        Boolean(selectedListing && row.dataset.listingId === String(selectedListing.id)),
      );
    });
  }

  async function loadSelectedListingBids(listingId) {
    try {
      const response = await fetch(`/api/bazaar/${listingId}/bids`, { credentials: "same-origin" });
      if (await window.SessionFlow?.respondToUnauthorized?.(response)) return;
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      selectedListingBids = payload.bids || [];
    } catch {
      selectedListingBids = [];
    }
  }

  function selectListing(listing, index) {
    selectedListing = listing;
    selectedListingIndex = index;
    highlightSelectedRow();
    if (activePanel !== "detail") setPanel("detail");
    if (isAuctionListing(listing)) {
      void loadSelectedListingBids(listing.id).then(() => renderDetailPanel());
      return;
    }
    selectedListingBids = [];
    renderDetailPanel();
  }

  function clearSelection() {
    selectedListing = null;
    selectedListingIndex = -1;
    renderDetailPanel();
    highlightSelectedRow();
  }

  function renderDetailPanel() {
    if (!detailContentEl || !detailEmptyEl) return;
    if (!selectedListing) {
      detailEmptyEl.hidden = false;
      detailContentEl.hidden = true;
      detailContentEl.replaceChildren();
      return;
    }

    detailEmptyEl.hidden = true;
    detailContentEl.hidden = false;
    detailContentEl.replaceChildren();

    const listing = selectedListing;
    const head = document.createElement("div");
    head.className = "bazaar-v2__detail-head";
    head.appendChild(createItemIcon(listing));
    const title = document.createElement("div");
    title.className = "bazaar-v2__detail-name";
    title.textContent = listing.name;
    head.appendChild(title);
    detailContentEl.appendChild(head);

    const grid = document.createElement("dl");
    grid.className = "bazaar-v2__detail-grid";

    function addRow(label, value) {
      const dt = document.createElement("dt");
      dt.textContent = label;
      const dd = document.createElement("dd");
      dd.textContent = value;
      grid.append(dt, dd);
    }

    function addAuctionTimeRow() {
      const dt = document.createElement("dt");
      dt.textContent = "Time Remaining";
      const dd = document.createElement("dd");
      dd.className = "bazaar-v2__auction-time-remaining";
      dd.dataset.expiresAt = listing.expiresAt || "";
      dd.textContent = formatAuctionTimeRemaining(auctionSecondsRemaining(listing));
      grid.append(dt, dd);
    }

    if (isAuctionListing(listing)) {
      addRow("Seller", formatDisplayName(listing.seller));
      addRow("Starting Price", `${formatGold(listing.startingPrice ?? listing.price)} Gold`);
      addRow("Current Offer", `${formatGold(auctionCurrentOffer(listing))} Gold`);
      addRow("Increment", `${formatGold(listing.bidIncrement ?? 0)} Gold`);
      addAuctionTimeRow();
      if (hasInstantPrice(listing)) {
        addRow("Instant Price", `${formatGold(listing.instantPrice)} Gold`);
      }
      addRow("Highest Bidder", formatDisplayName(listing.highestBidder) || "—");
    } else {
      addRow("Seller", formatDisplayName(listing.seller));
      addRow("Quantity", String(listing.amount ?? 0));
      addRow("Price per unit", `${formatGold(listing.price)} Gold`);
    }

    detailContentEl.appendChild(grid);

    if (isAuctionListing(listing)) {
      const bidsSection = document.createElement("div");
      bidsSection.className = "bazaar-v2__auction-bids";
      const bidsTitle = document.createElement("div");
      bidsTitle.className = "bazaar-v2__auction-section-title";
      bidsTitle.textContent = "Bidding status";
      bidsSection.appendChild(bidsTitle);

      const bidsScroll = document.createElement("div");
      bidsScroll.className = "bazaar-v2__auction-bids-scroll";

      const bidsTable = document.createElement("table");
      bidsTable.className = "bazaar-v2__auction-bids-table";
      bidsTable.innerHTML = `
        <thead>
          <tr>
            <th>Time</th>
            <th>Bidder</th>
            <th>Bid</th>
          </tr>
        </thead>
        <tbody></tbody>
      `;
      const bidsBody = bidsTable.querySelector("tbody");
      if (selectedListingBids.length === 0) {
        const emptyRow = document.createElement("tr");
        const emptyCell = document.createElement("td");
        emptyCell.colSpan = 3;
        emptyCell.textContent = "No bids yet.";
        emptyRow.appendChild(emptyCell);
        bidsBody.appendChild(emptyRow);
      } else {
        selectedListingBids.forEach((bid) => {
          const row = document.createElement("tr");
          const timeCell = document.createElement("td");
          timeCell.textContent = formatRelativeBidTime(bid.createdAt);
          const bidderCell = document.createElement("td");
          bidderCell.textContent = formatDisplayName(bid.bidder) || "—";
          const amountCell = document.createElement("td");
          amountCell.textContent = `${formatGold(bid.amount)} Gold`;
          row.append(timeCell, bidderCell, amountCell);
          bidsBody.appendChild(row);
        });
      }
      bidsScroll.appendChild(bidsTable);
      bidsSection.appendChild(bidsScroll);
      detailContentEl.appendChild(bidsSection);

      const actionsSection = document.createElement("div");
      actionsSection.className = "bazaar-v2__detail-actions-section";

      const actions = document.createElement("div");
      actions.className = "bazaar-v2__detail-actions bazaar-v2__auction-actions";

      const bidBtn = document.createElement("button");
      bidBtn.type = "button";
      bidBtn.className = "bazaar__btn bazaar__btn--buy";
      bidBtn.textContent = "Bid";
      bidBtn.addEventListener("click", () => openAuctionBidDialog(listing));

      actions.append(bidBtn);
      if (hasInstantPrice(listing)) {
        const buyBtn = document.createElement("button");
        buyBtn.type = "button";
        buyBtn.className = "bazaar__btn bazaar__btn--yellow";
        buyBtn.textContent = "Buy";
        buyBtn.addEventListener("click", () => {
          void executeAuctionBuyInstantly(listing);
        });
        actions.append(buyBtn);
      }
      actionsSection.appendChild(actions);
      detailContentEl.appendChild(actionsSection);
      return;
    }

    const actionsSection = document.createElement("div");
    actionsSection.className = "bazaar-v2__detail-actions-section";

    const actions = document.createElement("div");
    actions.className = "bazaar-v2__detail-actions";
    const buyBtn = document.createElement("button");
    buyBtn.type = "button";
    buyBtn.className = "bazaar__btn bazaar__btn--buy";
    buyBtn.textContent = "Buy";
    buyBtn.addEventListener("click", (event) => openPurchaseFlow(listing, event));
    actions.appendChild(buyBtn);
    actionsSection.appendChild(actions);
    detailContentEl.appendChild(actionsSection);
  }

  function closeAuctionBidDialog() {
    bidDialogListing = null;
    if (bidLayerEl) bidLayerEl.hidden = true;
  }

  function openAuctionBidDialog(listing) {
    if (!bidLayerEl || !bidAmountEl) return;
    if (isOwnListing(listing)) {
      window.showMainAlertDialog?.(OWN_AUCTION_MESSAGE);
      return;
    }
    bidDialogListing = listing;
    const minBid = minimumAuctionBid(listing);
    bidAmountEl.value = formatGold(minBid);
    const allowsAnonymous = Boolean(listing.allowsAnonymousBuyer);
    if (bidAnonymousEl) {
      bidAnonymousEl.checked = false;
      bidAnonymousEl.disabled = !allowsAnonymous;
    }
    if (bidAnonymousWrapEl) {
      bidAnonymousWrapEl.hidden = !allowsAnonymous;
    }
    bidLayerEl.hidden = false;
    window.NosWindowFocus?.bringToFront?.(rootEl);
    bidAmountEl.focus();
    bidAmountEl.select();
  }

  function initAuctionBidDialog() {
    bidCancelBtn?.addEventListener("click", closeAuctionBidDialog);
    bidLayerEl?.addEventListener("click", (event) => {
      if (event.target === bidLayerEl) closeAuctionBidDialog();
    });
    bidConfirmBtn?.addEventListener("click", () => {
      if (!bidDialogListing) return;
      const listing = bidDialogListing;
      const amount = parseSellPrice(bidAmountEl?.value);
      const anonymous = Boolean(bidAnonymousEl?.checked);
      closeAuctionBidDialog();
      void executeAuctionBid(listing, amount, anonymous);
    });
  }

  async function executeAuctionBid(listing, amount, anonymous) {
    if (isOwnListing(listing)) {
      window.showMainAlertDialog?.(OWN_AUCTION_MESSAGE);
      return;
    }
    const minBid = minimumAuctionBid(listing);
    if (amount < minBid) {
      showToast(`Bid must be at least ${formatGold(minBid)} Gold.`);
      return;
    }
    const escrowHeld = Math.max(0, Number(listing.myEscrowHeld) || 0);
    const delta = Math.max(0, amount - escrowHeld);
    if (delta > 0 && goldBalance < delta) {
      window.showMainAlertDialog?.("Not enough gold.");
      return;
    }
    try {
      const response = await fetch(`/api/bazaar/bid/${listing.id}`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, anonymous: Boolean(anonymous) }),
      });
      if (await window.SessionFlow?.respondToUnauthorized?.(response)) return;
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
      if (typeof result.gold === "number") setGold(result.gold);
      refreshListingsFromServer(result.listings);
      if (Array.isArray(result.adminListings)) {
        allAdminListings = result.adminListings.map((entry) => ({ ...entry }));
        renderAdminList();
      }
      const updated = filteredListings.find((item) => item.id === listing.id);
      if (updated) {
        selectedListing = updated;
        await loadSelectedListingBids(updated.id);
        renderDetailPanel();
        highlightSelectedRow();
      }
      showToast("Bid placed.");
    } catch (err) {
      showToast(err.message || "Could not place bid.");
    }
  }

  async function executeAuctionBuyInstantly(listing) {
    if (isOwnListing(listing)) {
      window.showMainAlertDialog?.(OWN_AUCTION_MESSAGE);
      return;
    }
    const instantPrice = Number(listing.instantPrice) || 0;
    if (instantPrice < 1) return;
    if (goldBalance < instantPrice) {
      window.showMainAlertDialog?.("Not enough gold.");
      return;
    }
    window.showMainInfoDialog?.("Buy this item?", {
      hideTitle: true,
      onConfirm: async () => {
        window.hideMainInfoDialog?.();
        try {
          const response = await fetch(`/api/bazaar/buy-now/${listing.id}`, {
            method: "POST",
            credentials: "same-origin",
          });
          if (await window.SessionFlow?.respondToUnauthorized?.(response)) return;
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
          if (typeof result.gold === "number") setGold(result.gold);
          refreshListingsFromServer(result.listings);
          if (Array.isArray(result.adminListings)) {
            allAdminListings = result.adminListings.map((entry) => ({ ...entry }));
            renderAdminList();
          }
          clearSelection();
          showToast("Purchased. Claim your item in Administration.");
        } catch (err) {
          showToast(err.message || "Could not buy instantly.");
        }
      },
      onCancel: () => window.hideMainInfoDialog?.(),
    });
  }

  function openPurchaseFlow(item, event) {
    if (isOwnListing(item)) {
      window.showMainAlertDialog?.(ownListingMessage(item));
      return;
    }
    window.NosQuantityDialog?.open?.({
      useBodyOverlay: true,
      clientX: event.clientX,
      clientY: event.clientY,
      title: "Select purchase amount",
      ariaLabel: "Select purchase amount",
      getSummaryText: (quantity) => `${item.name} ${quantity} units`,
      maxQuantity: Math.max(1, Number(item.amount) || 1),
      onConfirm: (quantity) => confirmPurchase(item, quantity),
    });
  }

  function confirmPurchase(item, quantity) {
    const qty = Math.max(1, Number(quantity) || 1);
    const totalPrice = (Number(item.price) || 0) * qty;
    window.showMainInfoDialog?.("Confirm purchase?", {
      hideTitle: true,
      onConfirm: async () => {
        window.hideMainInfoDialog?.();
        await executeBuy(item, qty, totalPrice);
      },
      onCancel: () => window.hideMainInfoDialog?.(),
    });
  }

  async function executeBuy(item, quantity, totalPrice) {
    if (goldBalance < totalPrice) {
      window.showMainAlertDialog?.("Not enough gold.");
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
        const errorText = String(result.error || "");
        if (isOwnListing(item) || errorText.includes("own listing")) {
          window.showMainAlertDialog?.(ownListingMessage(item));
          return;
        }
        if (errorText.toLowerCase().includes("not enough gold")) {
          window.showMainAlertDialog?.("Not enough gold.");
          return;
        }
        showToast(errorText || "Purchase failed");
        return;
      }
      setGold(result.gold);
      if (result.remaining > 0) {
        item.amount = result.remaining;
      } else {
        const sourceIdx = allListings.findIndex((entry) => entry.id === item.id);
        if (sourceIdx !== -1) allListings.splice(sourceIdx, 1);
      }
      applyFilters();
      void window.NosInventory?.reload?.();
      showToast(`Purchased ${quantity}x ${item.name}.`);
    } catch (err) {
      showToast(`Purchase failed: ${err.message}`);
    }
  }

  function auctionHasWinner(item) {
    if (typeof item.hasWinner === "boolean") return item.hasWinner;
    return Number(item.currentBid) > 0;
  }

  function getAdminListingState(item) {
    const role = item.adminRole || "seller";

    if (isAuctionListing(item)) {
      if (role === "winner") {
        return {
          status: "Auction won",
          statusKey: "claim-item",
          rowClass: "is-admin-completed",
          actionMode: "claim-item",
        };
      }
      if (role === "refund") {
        return {
          status: "Refund available",
          statusKey: "refund",
          rowClass: "is-admin-completed",
          actionMode: "claim-refund",
        };
      }

      const auctionState = String(item.auctionState || "active");
      const hasBids = Boolean(item.hasBids);
      const listingExpired = Boolean(item.isExpired);

      if (item.sellerCollected) {
        return {
          status: "Gold collected",
          statusKey: "completed",
          rowClass: "",
          actionMode: "none",
        };
      }
      if (
        (auctionState === "ended" || auctionState === "sold") &&
        auctionHasWinner(item)
      ) {
        return {
          status: "Auction ended",
          statusKey: "collect",
          rowClass: "is-admin-completed",
          actionMode: "received",
        };
      }
      if (hasBids && auctionState === "active") {
        return {
          status: "Locked by bids",
          statusKey: "locked",
          rowClass: "",
          actionMode: "locked",
        };
      }
      if (listingExpired || auctionState === "ended") {
        return {
          status: "Deadline has expired",
          statusKey: "expired",
          rowClass: "is-admin-expired",
          actionMode: "quit",
        };
      }
      return {
        status: item.timeRemaining || "On Auction",
        statusKey: "on-auction",
        rowClass: "",
        actionMode: "quit",
      };
    }

    const listedQty = Math.max(0, Number(item.listedQuantity) || Number(item.amount) || 0);
    const currentQty = Math.max(0, Number(item.amount) || 0);
    const soldCount = Math.max(0, Number(item.soldQuantity) ?? listedQty - currentQty);
    const listingExpired = Boolean(item.isExpired);

    if (soldCount > 0 && currentQty === 0) {
      return {
        status: "Sale completed",
        statusKey: "collect",
        rowClass: "is-admin-completed",
        actionMode: "received",
      };
    }
    if (soldCount > 0 && currentQty > 0) {
      return {
        status: listingExpired ? "Deadline has expired" : "On Sale",
        statusKey: listingExpired ? "expired" : "on-sale",
        rowClass: listingExpired ? "is-admin-expired" : "",
        actionMode: "partial",
      };
    }
    if (listingExpired && currentQty > 0) {
      return {
        status: "Deadline has expired",
        statusKey: "expired",
        rowClass: "is-admin-expired",
        actionMode: "quit",
      };
    }
    return { status: "On Sale", statusKey: "on-sale", rowClass: "", actionMode: "quit" };
  }

  function isAdminEntryVisible(item) {
    return getAdminListingState(item).actionMode !== "none";
  }

  function adminSortKey(item) {
    const state = getAdminListingState(item);
    const order = { refund: 0, "claim-item": 1, collect: 2, locked: 3, expired: 4, "on-auction": 5, "on-sale": 6, partial: 7 };
    return order[state.statusKey] ?? 8;
  }

  function formatAdminAmount(item) {
    if (isAuctionListing(item)) {
      if (item.adminRole === "refund") {
        return formatGold(item.escrowHeld || 0);
      }
      return "1 / 1";
    }
    const listedQty = Math.max(0, Number(item.listedQuantity) || Number(item.amount) || 0);
    const currentQty = Math.max(0, Number(item.amount) || 0);
    const sold = Math.max(0, Number(item.soldQuantity) ?? listedQty - currentQty);
    return `${sold} / ${listedQty}`;
  }

  function formatAdminPrice(item) {
    if (isAuctionListing(item)) {
      if (item.adminRole === "refund") {
        return formatGold(item.escrowHeld || 0);
      }
      const offer = Number(item.currentOffer) || Number(item.startingPrice) || Number(item.price) || 0;
      return formatGold(offer);
    }
    return formatGold(item.price);
  }

  function formatAdminStatusLine(item, state) {
    if (state.statusKey === "collect") {
      return "Collect gold";
    }
    if (state.statusKey === "claim-item") {
      return "Claim item";
    }
    if (state.statusKey === "refund") {
      return "Claim refund";
    }
    if (state.statusKey === "locked") {
      return item.timeRemaining || "Locked";
    }
    if (state.statusKey === "expired") {
      return "Expired";
    }
    if (state.statusKey === "on-auction") {
      return item.timeRemaining || "On Auction";
    }
    const days = Math.max(1, Math.ceil(Number(item.days) || 1));
    return `${days} Day(s)`;
  }

  function renderAdminList() {
    if (!adminListEl) return;
    adminListEl.replaceChildren();
    const sorted = [...allAdminListings]
      .filter(isAdminEntryVisible)
      .sort((a, b) => adminSortKey(a) - adminSortKey(b));
    sorted.forEach((item) => {
      const state = getAdminListingState(item);
      const tr = document.createElement("tr");
      if (state.rowClass) tr.className = state.rowClass;

      const tdItem = document.createElement("td");
      tdItem.className = "col-name";
      const cell = document.createElement("div");
      cell.className = "bazaar__item";
      cell.appendChild(createItemIcon(item));
      const textWrap = document.createElement("div");
      const name = document.createElement("span");
      name.className = "bazaar__item-name";
      name.textContent = item.name;
      name.title = item.name;
      const statusLine = document.createElement("span");
      statusLine.className = "bazaar-v2__listing-subline";
      statusLine.textContent = formatAdminStatusLine(item, state);
      textWrap.append(name, statusLine);
      cell.appendChild(textWrap);
      tdItem.appendChild(cell);

      const tdAmount = document.createElement("td");
      tdAmount.className = "col-amount";
      tdAmount.textContent = formatAdminAmount(item);

      const tdPrice = document.createElement("td");
      tdPrice.className = "col-price";
      tdPrice.textContent = formatAdminPrice(item);

      const tdActions = document.createElement("td");
      tdActions.className = "col-admin-actions";
      const actions = document.createElement("div");
      actions.className = "bazaar-v2__admin-actions";

      if (state.actionMode === "quit") {
        if (!isAuctionListing(item)) {
          actions.appendChild(
            createAdminIconButton("change", "Change", (event) => {
              event.stopPropagation();
              openChangePriceFlow(item, event);
            }),
          );
        }
        actions.appendChild(
          createAdminIconButton("quit", "Quit", (event) => {
            event.stopPropagation();
            openQuitConfirm(item);
          }),
        );
      } else if (state.actionMode === "partial") {
        actions.appendChild(
          createAdminIconButton("quit", "Quit", (event) => {
            event.stopPropagation();
            openQuitConfirm(item);
          }),
        );
      } else if (state.actionMode === "received") {
        actions.appendChild(
          createAdminIconButton("received", "Received", (event) => {
            event.stopPropagation();
            openReceivedConfirm(item);
          }),
        );
      } else if (state.actionMode === "claim-item") {
        actions.appendChild(
          createAdminIconButton("claim", "Claim item", (event) => {
            event.stopPropagation();
            openClaimItemConfirm(item);
          }),
        );
      } else if (state.actionMode === "claim-refund") {
        actions.appendChild(
          createAdminIconButton("refund", "Claim refund", (event) => {
            event.stopPropagation();
            openClaimRefundConfirm(item);
          }),
        );
      }

      tdActions.appendChild(actions);
      tr.append(tdItem, tdAmount, tdPrice, tdActions);
      adminListEl.appendChild(tr);
    });
  }

  async function loadAdminListings() {
    try {
      const response = await fetch("/api/bazaar/my-listings", { credentials: "same-origin" });
      if (await window.SessionFlow?.respondToUnauthorized?.(response)) return;
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      allAdminListings = (payload.listings || []).map((item) => ({ ...item }));
      renderAdminList();
    } catch (err) {
      showToast(err.message || "Failed to load administration listings.");
    }
  }

  function openQuitConfirm(item) {
    window.showMainInfoDialog?.("Quit this listing?", {
      hideTitle: true,
      onConfirm: async () => {
        window.hideMainInfoDialog?.();
        await executeQuitListing(item);
      },
      onCancel: () => window.hideMainInfoDialog?.(),
    });
  }

  async function executeQuitListing(item) {
    try {
      const response = await fetch(`/api/bazaar/quit/${item.id}`, {
        method: "POST",
        credentials: "same-origin",
      });
      const result = await response.json();
      if (!response.ok) {
        showToast(result.error || "Could not quit listing.");
        return;
      }
      setGold(result.gold);
      refreshListingsFromServer(result.marketListings || result.listings);
      await loadAdminListings();
      void window.NosInventory?.applyPayload?.({ inventory: result.inventory, gold: result.gold });
      showToast("Listing withdrawn.");
    } catch (err) {
      showToast(err.message || "Could not quit listing.");
    }
  }

  function openReceivedConfirm(item) {
    window.showMainInfoDialog?.("Collect gold from this sale?", {
      hideTitle: true,
      onConfirm: async () => {
        window.hideMainInfoDialog?.();
        await executeReceiveListing(item);
      },
      onCancel: () => window.hideMainInfoDialog?.(),
    });
  }

  async function executeReceiveListing(item) {
    try {
      const response = await fetch(`/api/bazaar/receive/${item.id}`, {
        method: "POST",
        credentials: "same-origin",
      });
      const result = await response.json();
      if (!response.ok) {
        showToast(result.error || "Could not collect gold.");
        return;
      }
      setGold(result.gold);
      refreshListingsFromServer(result.marketListings || result.listings);
      await loadAdminListings();
      showToast("Gold collected.");
    } catch (err) {
      showToast(err.message || "Could not collect gold.");
    }
  }

  function openClaimItemConfirm(item) {
    window.showMainInfoDialog?.("Claim this auction item?", {
      hideTitle: true,
      onConfirm: async () => {
        window.hideMainInfoDialog?.();
        await executeClaimAuctionItem(item);
      },
      onCancel: () => window.hideMainInfoDialog?.(),
    });
  }

  async function executeClaimAuctionItem(item) {
    try {
      const response = await fetch(`/api/bazaar/claim-item/${item.id}`, {
        method: "POST",
        credentials: "same-origin",
      });
      const result = await response.json();
      if (!response.ok) {
        showToast(result.error || "Could not claim item.");
        return;
      }
      setGold(result.gold);
      refreshListingsFromServer(result.marketListings || result.listings);
      await loadAdminListings();
      void window.NosInventory?.applyPayload?.({ inventory: result.inventory, gold: result.gold });
      showToast(`Claimed ${result.name || item.name}.`);
    } catch (err) {
      showToast(err.message || "Could not claim item.");
    }
  }

  function openClaimRefundConfirm(item) {
    window.showMainInfoDialog?.("Claim your escrowed gold back?", {
      hideTitle: true,
      onConfirm: async () => {
        window.hideMainInfoDialog?.();
        await executeClaimAuctionRefund(item);
      },
      onCancel: () => window.hideMainInfoDialog?.(),
    });
  }

  async function executeClaimAuctionRefund(item) {
    try {
      const response = await fetch(`/api/bazaar/claim-refund/${item.id}`, {
        method: "POST",
        credentials: "same-origin",
      });
      const result = await response.json();
      if (!response.ok) {
        showToast(result.error || "Could not claim refund.");
        return;
      }
      setGold(result.gold);
      refreshListingsFromServer(result.marketListings || result.listings);
      await loadAdminListings();
      showToast("Refund claimed.");
    } catch (err) {
      showToast(err.message || "Could not claim refund.");
    }
  }

  function openChangePriceFlow(item, event) {
    const unitPrice = Math.max(1, Number(item.price) || 1);
    window.NosQuantityDialog?.open?.({
      useBodyOverlay: true,
      clientX: event.clientX,
      clientY: event.clientY,
      title: "Change",
      ariaLabel: "Change listing price",
      inputMode: "price",
      getSummaryText: () => "Change the prices of the items you are offering.",
      maxQuantity: maxSellUnitPrice(),
      minQuantity: 1,
      defaultQuantity: unitPrice,
      onConfirm: (price) => {
        const nextPrice = Math.max(1, Number(price) || 1);
        if (nextPrice === unitPrice) {
          showToast("Price is unchanged.");
          return;
        }
        if (nextPrice > maxSellUnitPrice()) {
          showToast(`Price cannot exceed ${formatGold(maxSellUnitPrice())} gold per unit.`);
          return;
        }
        window.showMainInfoDialog?.(`Change price for ${formatGold(CHANGE_PRICE_FEE)} gold?`, {
          hideTitle: true,
          onConfirm: async () => {
            window.hideMainInfoDialog?.();
            await executeChangePrice(item, nextPrice);
          },
          onCancel: () => window.hideMainInfoDialog?.(),
        });
      },
    });
  }

  async function executeChangePrice(item, newPrice) {
    if (goldBalance < CHANGE_PRICE_FEE) {
      window.showMainAlertDialog?.("Not enough gold.");
      return;
    }
    try {
      const response = await fetch(`/api/bazaar/change-price/${item.id}`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unitPrice: newPrice }),
      });
      const result = await response.json();
      if (!response.ok) {
        showToast(result.error || "Could not change price.");
        return;
      }
      setGold(result.gold);
      refreshListingsFromServer(result.marketListings || result.listings);
      await loadAdminListings();
      showToast("Listing price updated.");
    } catch (err) {
      showToast(err.message || "Could not change price.");
    }
  }

  function fillSelect(select, options) {
    if (!select) return;
    select.replaceChildren();
    (options || []).forEach((opt) => {
      const el = document.createElement("option");
      el.value = String(opt.value);
      el.textContent = opt.label;
      select.appendChild(el);
    });
  }

  function syncFilterSelect(selectId, options) {
    const select = document.getElementById(selectId);
    fillSelect(select, options);
    if (select && options.length > 0) select.selectedIndex = 0;
  }

  function updateDynamicSelect() {
    const category = document.getElementById("bazaar-v2-filter-category")?.value || "";
    syncFilterSelect("bazaar-v2-filter-dynamic", category ? bootstrapData?.dynamicOptions?.[category] ?? [] : []);
  }

  function updateLevelSelect() {
    const category = document.getElementById("bazaar-v2-filter-category")?.value || "";
    const setKey = bootstrapData?.levelOptionsByCategory?.[category];
    syncFilterSelect("bazaar-v2-filter-level", setKey ? bootstrapData?.levelOptionSets?.[setKey] ?? [] : []);
  }

  function updateRaritySelect() {
    const category = document.getElementById("bazaar-v2-filter-category")?.value || "";
    const setKey = bootstrapData?.rarityOptionsByCategory?.[category];
    syncFilterSelect("bazaar-v2-filter-rarity", setKey ? bootstrapData?.rarityOptionSets?.[setKey] ?? [] : []);
  }

  function updateUpgradeSelect() {
    const category = document.getElementById("bazaar-v2-filter-category")?.value || "";
    const setKey = bootstrapData?.upgradeOptionsByCategory?.[category];
    syncFilterSelect("bazaar-v2-filter-upgrade", setKey ? bootstrapData?.upgradeOptionSets?.[setKey] ?? [] : []);
  }

  function updateCategoryFilters() {
    updateDynamicSelect();
    updateLevelSelect();
    updateRaritySelect();
    updateUpgradeSelect();
  }

  function openFilterDrawer() {
    filterDrawerEl?.classList.add("bazaar-v2__filter-drawer--open");
    filterBackdropEl?.classList.add("bazaar-v2__filter-backdrop--open");
    filterDrawerEl?.setAttribute("aria-hidden", "false");
    filterBackdropEl?.setAttribute("aria-hidden", "false");
  }

  function closeFilterDrawer() {
    filterDrawerEl?.classList.remove("bazaar-v2__filter-drawer--open");
    filterBackdropEl?.classList.remove("bazaar-v2__filter-backdrop--open");
    filterDrawerEl?.setAttribute("aria-hidden", "true");
    filterBackdropEl?.setAttribute("aria-hidden", "true");
  }

  function resetDrawerFiltersToDefaults() {
    const nameInput = document.getElementById("bazaar-v2-filter-name");
    if (nameInput) nameInput.value = "";
    const categorySelect = document.getElementById("bazaar-v2-filter-category");
    if (categorySelect && categorySelect.options.length > 0) categorySelect.selectedIndex = 0;
    updateCategoryFilters();
    const sortSelect = document.getElementById("bazaar-v2-filter-sort");
    if (sortSelect) sortSelect.value = defaultSort;
  }

  function resetListingFilters() {
    resetDrawerFiltersToDefaults();
    if (searchInputEl) searchInputEl.value = "";
    runListingSearch();
  }

  function commitQuickSearch() {
    activeQuickSearch = String(searchInputEl?.value || "").trim().toLowerCase();
  }

  function commitSearchState() {
    commitQuickSearch();
    committedDrawerFilters = readDrawerFiltersFromDom();
    updateFilterButtonState();
  }

  function runListingSearch() {
    commitSearchState();
    applyFilters();
    void fetch("/api/listings", { credentials: "same-origin" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = await response.json();
        refreshListingsFromServer(payload.listings);
      })
      .catch((err) => showToast(err.message || "Search failed."));
  }

  function formatMedalFooterRemainingText(remainingText) {
    if (!remainingText) return "";
    const daysMatch = String(remainingText).match(/(\d+)Day\(s\)/);
    if (daysMatch) return `${daysMatch[1]}Day(s)`;
    const hoursMatch = String(remainingText).match(/(\d+)Hours/);
    if (hoursMatch) return `${hoursMatch[1]}Hours`;
    return "";
  }

  function renderMerchantMedalFooter() {
    if (!footerMedalEl || !footerMedalIconEl) return;
    if (!hasMerchantMedal()) {
      footerMedalEl.hidden = true;
      footerMedalIconEl.removeAttribute("src");
      if (footerMedalTimeEl) footerMedalTimeEl.textContent = "";
      return;
    }

    footerMedalEl.hidden = false;
    if (footerMedalTimeEl) {
      footerMedalTimeEl.textContent = formatMedalFooterRemainingText(merchantMedal.remainingText);
    }
    const iconId = merchantMedal.iconId || merchantMedal.itemVNum;
    footerMedalIconEl.src = listingIconUrl({ iconId, itemVNum: merchantMedal.itemVNum }) || "";
  }

  function bindFooterMedalIcon() {
    if (!footerMedalIconEl || footerMedalIconEl.dataset.bound === "1") return;
    footerMedalIconEl.dataset.bound = "1";
    footerMedalIconEl.addEventListener("contextmenu", (event) => {
      if (!hasMerchantMedal()) return;
      event.preventDefault();
      const iconId = merchantMedal.iconId || merchantMedal.itemVNum;
      window.MainUI?.openItemInfo?.({
        name: merchantMedal.name,
        icon: listingIconUrl({ iconId, itemVNum: merchantMedal.itemVNum }),
        item: {
          itemVNum: merchantMedal.itemVNum,
          name: merchantMedal.name,
        },
      });
    });
  }

  function resetSellFormInputs() {
    clearSellListingDraft();
    updateSellPeriodOptions();
    if (sellPeriodEl) sellPeriodEl.value = sellType === "auction" ? "60" : "1";
    if (sellMethodEl) sellMethodEl.value = "individual";
  }

  function updateSellFormMode() {
    if (sellFixedFieldsEl) sellFixedFieldsEl.hidden = sellType === "auction";
    if (sellAuctionFieldsEl) sellAuctionFieldsEl.hidden = sellType !== "auction";
    if (sellQuantityRowEl) sellQuantityRowEl.hidden = sellType === "auction";
    updateSellPeriodOptions();
    updateSellSummary();
  }

  function setPanel(panelId) {
    activePanel = panelId;
    document.querySelectorAll(".bazaar-v2__panel-tab").forEach((btn) => {
      btn.classList.toggle("bazaar-v2__panel-tab--active", btn.dataset.bazaarV2Panel === panelId);
    });
    document.querySelectorAll(".bazaar-v2__panel-section").forEach((section) => {
      const active = section.dataset.bazaarV2Panel === panelId;
      section.classList.toggle("bazaar-v2__panel-section--active", active);
      section.hidden = !active;
    });
    if (panelId === "admin") void loadAdminListings();
  }

  function hasMerchantMedal() {
    return merchantMedal != null;
  }

  function maxSellUnitPrice() {
    return hasMerchantMedal() ? SELL_MAX_UNIT_PRICE_MEDAL : SELL_MAX_UNIT_PRICE_DEFAULT;
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

  function parseSellPrice(value) {
    const parsed = Number.parseInt(String(value || "").replace(/[^\d]/g, ""), 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function isPriceInputControlKey(event) {
    if (event.ctrlKey || event.metaKey || event.altKey) return true;
    return [
      "Backspace",
      "Delete",
      "ArrowLeft",
      "ArrowRight",
      "ArrowUp",
      "ArrowDown",
      "Home",
      "End",
      "Enter",
    ].includes(event.key);
  }

  function syncPriceInputElement(input, { max = null, onChange = null } = {}) {
    if (!input) return;
    let value = parseSellPrice(input.value);
    const maxValue = typeof max === "function" ? max() : max;
    if (maxValue != null && value > maxValue) value = maxValue;
    input.value = value > 0 ? formatGold(value) : "";
    onChange?.();
  }

  function bindPriceInput(input, { max = null, onChange = null } = {}) {
    if (!input) return;
    const sync = () => syncPriceInputElement(input, { max, onChange });

    input.addEventListener("input", sync);
    input.addEventListener("paste", (event) => {
      event.preventDefault();
      const digits = String(event.clipboardData?.getData("text") || "").replace(/[^\d]/g, "");
      if (!digits) return;
      const start = input.selectionStart ?? input.value.length;
      const end = input.selectionEnd ?? input.value.length;
      input.value = `${input.value.slice(0, start)}${digits}${input.value.slice(end)}`;
      sync();
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Tab") {
        event.preventDefault();
        let value = parseSellPrice(input.value);
        if (value > 0) {
          value *= 1000;
          const maxValue = typeof max === "function" ? max() : max;
          if (maxValue != null && value > maxValue) value = maxValue;
          input.value = formatGold(value);
          onChange?.();
        }
        return;
      }
      if (isPriceInputControlKey(event)) return;
      if (event.key.length === 1 && !/^\d$/.test(event.key)) {
        event.preventDefault();
      }
    });
  }

  function updateSellSummary() {
    const unitPrice = sellType === "auction" ? parseSellPrice(sellStartPriceEl?.value) : parseSellPrice(sellPriceEl?.value);
    const quantity = sellType === "auction" ? 1 : sellQuantity;
    const total = quantity * unitPrice;
    const fee = calculateListingFee(total, hasMerchantMedal());
    if (sellTotalEl) sellTotalEl.textContent = `${formatGold(total)} Gold`;
    if (sellFeeEl) sellFeeEl.textContent = `${formatGold(fee)} Gold`;
  }

  function formatSellQuantityLabel(quantity) {
    const qty = Math.max(0, Number(quantity) || 0);
    return `${qty} ${qty === 1 ? "Piece" : "Pieces"}`;
  }

  function clearSellListingDraft() {
    sellListingDraft = null;
    sellQuantity = 0;
    sellSlotEl?.classList.remove("inventory__slot--filled");
    sellSlotEl?.replaceChildren();
    if (sellQuantityEl) sellQuantityEl.textContent = formatSellQuantityLabel(0);
    if (sellPriceEl) sellPriceEl.value = "";
    if (sellStartPriceEl) sellStartPriceEl.value = "";
    if (sellInstantPriceEl) sellInstantPriceEl.value = "";
    if (sellIncrementEl) sellIncrementEl.value = "";
    if (sellAnonymousSellerEl) sellAnonymousSellerEl.value = "no";
    if (sellAnonymousBuyerEl) sellAnonymousBuyerEl.value = "no";
    updateSellSummary();
  }

  function applySellListingDraft(entry, quantity) {
    sellListingDraft = {
      instanceId: entry.instanceId,
      itemVNum: entry.item?.itemVNum,
      iconId: entry.item?.iconId || entry.item?.itemVNum,
      name: entry.item?.name || "Item",
      maxQuantity: Math.max(1, Number(entry.quantity) || 1),
    };
    sellQuantity = Math.min(Math.max(1, quantity), sellListingDraft.maxQuantity);
    if (!sellSlotEl) return;
    sellSlotEl.classList.add("inventory__slot--filled");
    sellSlotEl.replaceChildren();
    const img = document.createElement("img");
    img.className = "inventory__slot-icon";
    img.src = listingIconUrl({ iconId: sellListingDraft.iconId, item: entry.item });
    img.alt = "";
    img.draggable = false;
    sellSlotEl.appendChild(img);
    if (sellQuantityEl) sellQuantityEl.textContent = formatSellQuantityLabel(sellQuantity);
    updateSellSummary();
  }

  function openSellQuantityDialog(entry, event) {
    const itemName = entry.item?.name || "Item";
    const maxQuantity = Math.max(1, Number(entry.quantity) || 1);
    window.NosQuantityDialog?.open?.({
      useBodyOverlay: true,
      clientX: event.clientX,
      clientY: event.clientY,
      title: "Select sale amount",
      ariaLabel: "Select sale amount",
      getSummaryText: (quantity) => `${itemName} ${quantity} units`,
      maxQuantity,
      defaultQuantity: maxQuantity,
      confirmOnOutsideClick: true,
      onQuantityChange: (quantity) => applySellListingDraft(entry, quantity),
      onConfirm: (quantity) => {
        applySellListingDraft(entry, quantity);
        setPanel("list");
      },
    });
  }

  async function executeCreateListing() {
    if (!sellListingDraft || sellQuantity < 1) {
      showToast("Put an item in the listing slot first.");
      return;
    }
    const listingPeriod = Number.parseInt(sellPeriodEl?.value, 10) || 1;
    const anonymousSeller = parseYesNoSelect(sellAnonymousSellerEl);

    if (sellType === "auction") {
      const startingPrice = parseSellPrice(sellStartPriceEl?.value);
      const bidIncrement = parseSellPrice(sellIncrementEl?.value);
      const instantRaw = parseSellPrice(sellInstantPriceEl?.value);
      const instantPrice = instantRaw > 0 ? instantRaw : null;
      const anonymousBuyer = parseYesNoSelect(sellAnonymousBuyerEl);
      if (startingPrice < 1) {
        showToast("Enter a starting price.");
        return;
      }
      if (bidIncrement < 1) {
        showToast("Enter a bid increment.");
        return;
      }
      if (sellQuantity !== 1) {
        showToast("Auction listings must be for a single item.");
        return;
      }
      const fee = calculateListingFee(startingPrice, hasMerchantMedal());
      if (goldBalance < fee) {
        window.showMainAlertDialog?.("You don't have enough Gold to pay the listing fee.");
        return;
      }
      try {
        const response = await fetch("/api/bazaar/list", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            listingType: "auction",
            instanceId: sellListingDraft.instanceId,
            quantity: 1,
            startingPrice,
            instantPrice,
            bidIncrement,
            listingPeriod,
            anonymousSeller,
            anonymousBuyer,
          }),
        });
        if (await window.SessionFlow?.respondToUnauthorized?.(response)) return;
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
        if (typeof result.gold === "number") setGold(result.gold);
        if (result.listings) refreshListingsFromServer(result.listings);
        else await loadBootstrap();
        void window.NosInventory?.reload?.();
        clearSellListingDraft();
        await loadAdminListings();
        showToast("Auction listed on the NosBazaar.");
      } catch (err) {
        showToast(err.message || "Could not create auction listing.");
      }
      return;
    }

    const unitPrice = parseSellPrice(sellPriceEl?.value);
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
    const bundleSale = sellMethodEl?.value === "bundle";
    try {
      const response = await fetch("/api/bazaar/list", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingType: "fixed",
          instanceId: sellListingDraft.instanceId,
          quantity: sellQuantity,
          unitPrice,
          listingPeriod,
          bundleSale,
          anonymousSeller,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        showToast(result.error || "Could not create listing.");
        return;
      }
      setGold(result.gold);
      refreshListingsFromServer(result.listings);
      if (result.inventory) {
        window.NosInventory?.applyPayload?.({ inventory: result.inventory, gold: result.gold });
      } else {
        void window.NosInventory?.reload?.();
      }
      clearSellListingDraft();
      await loadAdminListings();
      showToast("Item listed on the NosBazaar.");
    } catch {
      showToast("Could not create listing.");
    }
  }

  function refreshListingsFromServer(listings, options = {}) {
    const { preserveSelection = false, reloadBids = false } = options;
    const selectedId = preserveSelection ? selectedListing?.id : null;
    allListings = (listings || []).map((item) => ({ ...item }));
    applyFilters();
    if (!selectedId) return;
    const updated = allListings.find((item) => String(item.id) === String(selectedId));
    if (!updated) {
      clearSelection();
      return;
    }
    selectedListing = updated;
    highlightSelectedRow();
    if (activePanel !== "detail" || !isAuctionListing(updated)) return;
    if (reloadBids) {
      void loadSelectedListingBids(updated.id).then(() => renderDetailPanel());
      return;
    }
    renderDetailPanel();
  }

  function setGold(gold) {
    goldBalance = Math.max(0, Number(gold) || 0);
    if (goldEl) goldEl.value = `${formatGold(goldBalance)} Gold`;
    window.NosBazaarClassic?.setGold?.(goldBalance);
  }

  function setMerchantMedal(medal) {
    merchantMedal = medal || null;
    renderMerchantMedalFooter();
    updateSellSummary();
  }

  function isSellDropActive() {
    if (!layerEl || layerEl.hidden) return false;
    return activePanel === "list";
  }

  function ensureFixedSellMode() {
    if (sellType === "fixed") {
      updateSellFormMode();
      return;
    }
    sellType = "fixed";
    document.querySelectorAll(".bazaar-v2__sell-type-btn").forEach((el) => {
      el.classList.toggle("bazaar-v2__sell-type-btn--active", el.dataset.sellType === "fixed");
    });
    updateSellFormMode();
    resetSellFormInputs();
  }

  function lowestFixedPriceForItemVNum(itemVNum) {
    let lowest = null;
    for (const listing of allListings) {
      if (isAuctionListing(listing)) continue;
      if (Number(listing.itemVNum) !== Number(itemVNum)) continue;
      const price = Number(listing.price) || 0;
      if (price < 1) continue;
      if (lowest == null || price < lowest) lowest = price;
    }
    return lowest;
  }

  function searchByItemName(name) {
    const query = String(name || "").trim();
    if (!query) return;
    openBazaarWindow();
    setPanel("detail");
    if (searchInputEl) searchInputEl.value = query;
    activeQuickSearch = query.toLowerCase();
    runListingSearch();
  }

  async function quickSellFromInventory(entry, event) {
    if (!entry?.instanceId) return;
    openBazaarWindow();
    try {
      await loadBootstrap();
    } catch (err) {
      showToast(err.message || "Could not load bazaar.");
      return;
    }

    setPanel("list");
    ensureFixedSellMode();
    const quantity = Math.max(1, Number(entry.quantity) || 1);
    applySellListingDraft(entry, quantity);

    const itemVNum = Number(entry.item?.itemVNum);
    const referencePrice = lowestFixedPriceForItemVNum(itemVNum);
    if (referencePrice == null) {
      window.NosQuantityDialog?.open?.({
        useBodyOverlay: true,
        clientX: event?.clientX ?? window.innerWidth / 2,
        clientY: event?.clientY ?? window.innerHeight / 2,
        title: "Set listing price",
        ariaLabel: "Set listing price",
        inputMode: "price",
        maxQuantity: maxSellUnitPrice(),
        minQuantity: 1,
        defaultQuantity: 1,
        getSummaryText: () => `Set price per unit for ${entry.item?.name || "item"}.`,
        onConfirm: (price) => {
          const unitPrice = Math.max(1, Number(price) || 1);
          if (sellPriceEl) sellPriceEl.value = formatGold(unitPrice);
          updateSellSummary();
          void executeCreateListing();
        },
      });
      return;
    }

    if (sellPriceEl) sellPriceEl.value = formatGold(referencePrice);
    updateSellSummary();
    await executeCreateListing();
  }

  function onInventoryDropForSell(drag, event) {
    if (!drag?.entry || !isSellDropActive()) return;
    const stackQuantity = Math.max(1, Number(drag.entry.quantity) || 1);
    if (sellType === "auction") {
      if (stackQuantity > 1) {
        window.showMainAlertDialog?.("Auction listings must be for a single item.");
        return;
      }
      resetSellFormInputs();
      applySellListingDraft(drag.entry, 1);
      setPanel("list");
      return;
    }
    resetSellFormInputs();
    openSellQuantityDialog(drag.entry, event);
  }

  function highlightSellSlot(active) {
    sellSlotDropHighlight?.classList.remove("bazaar__sell-slot--drop-target");
    sellSlotDropHighlight = active ? sellSlotEl : null;
    sellSlotEl?.classList.toggle("bazaar__sell-slot--drop-target", Boolean(active));
  }

  function positionBazaarWindow(resetPosition = false) {
    if (!rootEl || !sceneEl) return;
    if (!resetPosition && userMoved) return;

    const pad = 12;
    const width = 700;
    const height = 440;
    const sceneWidth = sceneEl.clientWidth;
    const sceneHeight = sceneEl.clientHeight;

    rootEl.style.width = `${width}px`;
    rootEl.style.height = `${height}px`;
    rootEl.style.right = "auto";
    rootEl.style.bottom = "auto";

    let left = (sceneWidth - width) / 2;
    let top = (sceneHeight - height) / 2;
    left = Math.max(pad, Math.min(left, sceneWidth - width - pad));
    top = Math.max(pad, Math.min(top, sceneHeight - height - pad));

    rootEl.style.left = `${left}px`;
    rootEl.style.top = `${top}px`;
  }

  async function loadBootstrap() {
    const response = await fetch("/api/bootstrap", { credentials: "same-origin" });
    if (await window.SessionFlow?.respondToUnauthorized?.(response)) return false;
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json = await response.json();
    bootstrapData = json;
    defaultSort = json.config?.defaultSort ?? "price-asc";
    committedDrawerFilters = getDefaultDrawerFilters();
    allListings = (json.listings || []).map((item) => ({ ...item }));
    goldBalance = json.player?.gold ?? 0;
    playerName = json.player?.name ?? "";
    playerCharacterId = Number(json.player?.id) || 0;
    merchantMedal = json.merchantMedal || null;
    if (windowTitleEl) windowTitleEl.textContent = json.config?.windowTitle ?? "NosBazaar";
    setGold(goldBalance);
    renderMerchantMedalFooter();
    fillSelect(document.getElementById("bazaar-v2-filter-category"), json.categories);
    updateCategoryFilters();
    fillSelect(document.getElementById("bazaar-v2-filter-sort"), json.sortOptions);
    const sortSelect = document.getElementById("bazaar-v2-filter-sort");
    if (sortSelect) sortSelect.value = defaultSort;
    updateFilterButtonState();
    applyFilters();
    return true;
  }

  function openBazaarWindow() {
    if (!layerEl || !rootEl) return;
    rootEl.classList.remove("bazaar-v2--dragging");
    layerEl.hidden = false;
    positionBazaarWindow(false);
    window.NosWindowFocus?.bringToFront?.(rootEl);
    startAuctionTimers();
    void loadBootstrap().then(() => loadAdminListings());
  }

  function closeBazaarWindow() {
    closeFilterDrawer();
    closeAuctionBidDialog();
    stopAuctionTimers();
    window.NosQuantityDialog?.close?.();
    highlightSellSlot(false);
    if (layerEl) layerEl.hidden = true;
  }

  function initTitlebarDrag() {
    if (!titlebarEl || !rootEl || !sceneEl) return;
    titlebarEl.addEventListener("mousedown", (event) => {
      if (event.button !== 0 || event.target.closest(".bazaar__close")) return;
      event.preventDefault();
      const rect = rootEl.getBoundingClientRect();
      const sceneRect = sceneEl.getBoundingClientRect();
      const drag = {
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top,
        sceneLeft: sceneRect.left,
        sceneTop: sceneRect.top,
        sceneWidth: sceneRect.width,
        sceneHeight: sceneRect.height,
        width: rect.width,
        height: rect.height,
      };

      function onMove(moveEvent) {
        userMoved = true;
        let left = moveEvent.clientX - drag.sceneLeft - drag.offsetX;
        let top = moveEvent.clientY - drag.sceneTop - drag.offsetY;
        const pad = 8;
        left = Math.max(pad, Math.min(left, drag.sceneWidth - drag.width - pad));
        top = Math.max(pad, Math.min(top, drag.sceneHeight - drag.height - pad));
        rootEl.style.left = `${left}px`;
        rootEl.style.top = `${top}px`;
        rootEl.style.right = "auto";
        rootEl.style.bottom = "auto";
        rootEl.style.width = `${drag.width}px`;
        rootEl.style.height = `${drag.height}px`;
      }

      function onUp() {
        rootEl.classList.remove("bazaar-v2--dragging");
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      }

      rootEl.classList.add("bazaar-v2--dragging");
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
  }

  listingsScrollEl?.addEventListener("scroll", () => {
    if (!listingsScrollEl) return;
    if (listingsScrollEl.scrollTop + listingsScrollEl.clientHeight >= listingsScrollEl.scrollHeight - 48) {
      renderListings(false);
    }
  });

  searchBtn?.addEventListener("click", runListingSearch);
  searchInputEl?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      runListingSearch();
    }
  });
  filterOpenBtn?.addEventListener("click", openFilterDrawer);
  filterCloseBtn?.addEventListener("click", closeFilterDrawer);
  filterBackdropEl?.addEventListener("click", closeFilterDrawer);
  filterApplyBtn?.addEventListener("click", () => {
    closeFilterDrawer();
    runListingSearch();
  });
  filterResetBtn?.addEventListener("click", () => {
    resetListingFilters();
  });
  document.getElementById("bazaar-v2-filter-category")?.addEventListener("change", updateCategoryFilters);

  document.querySelectorAll(".bazaar-v2__panel-tab").forEach((btn) => {
    btn.addEventListener("click", () => setPanel(btn.dataset.bazaarV2Panel || "detail"));
  });

  document.querySelectorAll(".bazaar-v2__sell-type-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const nextType = btn.dataset.sellType === "auction" ? "auction" : "fixed";
      if (nextType === sellType) return;
      sellType = nextType;
      document.querySelectorAll(".bazaar-v2__sell-type-btn").forEach((el) => {
        el.classList.toggle("bazaar-v2__sell-type-btn--active", el === btn);
      });
      resetSellFormInputs();
      updateSellFormMode();
    });
  });

  initAuctionBidDialog();
  updateSellFormMode();

  const sellPriceMax = () => maxSellUnitPrice();
  bindPriceInput(sellPriceEl, { max: sellPriceMax, onChange: updateSellSummary });
  bindPriceInput(sellStartPriceEl, { max: sellPriceMax, onChange: updateSellSummary });
  bindPriceInput(sellInstantPriceEl, { max: sellPriceMax, onChange: updateSellSummary });
  bindPriceInput(sellIncrementEl);
  bindPriceInput(bidAmountEl);
  sellSubmitBtn?.addEventListener("click", () => void executeCreateListing());
  closeBtn?.addEventListener("click", closeBazaarWindow);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && layerEl && !layerEl.hidden) {
      if (filterDrawerEl?.classList.contains("bazaar-v2__filter-drawer--open")) {
        closeFilterDrawer();
      } else if (bidLayerEl && !bidLayerEl.hidden) {
        closeAuctionBidDialog();
      }
    }
  });

  initTitlebarDrag();
  bindFooterMedalIcon();
  updateFilterButtonState();
  window.NosWindowFocus?.watch?.(rootEl);

  window.NosBazaarV2 = {
    open: openBazaarWindow,
    close: closeBazaarWindow,
    reposition: positionBazaarWindow,
    setGold,
    setMerchantMedal,
    onInventoryDropForSell,
    isSellDropActive,
    searchByItemName,
    quickSellFromInventory,
  };

  window.NosReplaceableWindows?.register("bazaar-v2", {
    group: "bazaar",
    close: closeBazaarWindow,
  });

  window.addEventListener("resize", () => {
    if (layerEl && !layerEl.hidden && !userMoved) positionBazaarWindow(false);
  });
})();
