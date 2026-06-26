(() => {
  const TABS = [
    { id: "equip", label: "EQUIP", pocket: "equip" },
    { id: "main", label: "MAIN", pocket: "main" },
    { id: "etc", label: "ETC", pocket: "etc" },
    { id: "card", label: "CARD", pocket: "card" },
    { id: "costume", label: "COSTUME", pocket: "costume" },
    { id: "mount", label: "MOUNT", pocket: "mount" },
    { id: "raid", label: "RAID", pocket: "raid" },
    { id: "tarot", label: "TAROT", pocket: "tarot" },
  ];

  const GRID_COLUMNS = 9;
  const GRID_ROWS = 24;

  const POCKET_LAYOUTS = {
    equip: { unlockedRows: 16 },
    main: { unlockedRows: 18 },
    etc: { unlockedRows: 20 },
    card: { unlockedSlots: 45 },
    costume: { unlockedSlots: 60 },
    mount: { unlockedSlots: 20 },
    raid: { unlockedSlots: 49 },
    tarot: { unlockedRows: GRID_ROWS },
  };

  const POCKETS_WITH_QTY = new Set(["main", "etc", "mount"]);
  const MERCHANT_MEDAL_VNUMS = new Set([5060, 5061, 5062, 9066, 9067, 9068]);

  const INVENTORY_TYPE_TO_POCKET = {
    0: "equip",
    1: "main",
    2: "etc",
    3: "etc",
    4: "equip",
    6: "card",
    7: "costume",
    8: "equip",
    9: "main",
    10: "main",
  };

  const layerEl = document.getElementById("inventory-v2-layer");
  const rootEl = document.getElementById("inventory-v2-root");
  const titlebarEl = document.getElementById("inventory-v2-titlebar");
  const closeBtn = document.getElementById("inventory-v2-close");
  const gridEl = document.getElementById("inventory-v2-grid");
  const goldEl = document.getElementById("inventory-v2-gold");
  const searchInput = document.getElementById("inventory-v2-search");
  const tabsEl = document.getElementById("inventory-v2-tabs");
  const tabsViewportEl = document.querySelector(".inventory-v2__tabs-viewport");
  const tabsPrevBtn = document.getElementById("inventory-v2-tabs-prev");
  const tabsNextBtn = document.getElementById("inventory-v2-tabs-next");
  const discardBtn = document.getElementById("inventory-v2-discard");
  const sceneEl = document.querySelector(".scene--main");

  let inventoryData = null;
  let activeTab = "equip";
  let searchQuery = "";
  let userMoved = false;
  let itemDragState = null;
  let dragGhostEl = null;
  let dropHighlightEl = null;
  let sellSlotDropHighlight = null;

  function layoutFor(pocketKey) {
    return POCKET_LAYOUTS[pocketKey] || POCKET_LAYOUTS.equip;
  }

  function resetGridScroll() {
    const scrollEl = rootEl?.querySelector(".inventory-v2__grid-scroll");
    if (scrollEl) scrollEl.scrollTop = 0;
  }

  function activePocket() {
    return TABS.find((tab) => tab.id === activeTab)?.pocket || "equip";
  }

  function formatGold(value) {
    const amount = Math.max(0, Number(value) || 0);
    return `${amount.toLocaleString("en-US")} Gold`;
  }

  function defaultPocketForItem(item) {
    const inventoryType = Number(item?.inventoryType ?? 0);
    return INVENTORY_TYPE_TO_POCKET[inventoryType] || "main";
  }

  function canAcceptItemInPocket(entry, destPocketKey) {
    if (destPocketKey === "raid" || destPocketKey === "tarot") return false;
    const pocket = destPocketKey === "mount" ? "equip" : destPocketKey;
    return defaultPocketForItem(entry?.item) === pocket;
  }

  function resolveDropPocket(viewPocketKey) {
    return viewPocketKey === "mount" ? "equip" : viewPocketKey;
  }

  function pocketItems(pocketKey) {
    if (!inventoryData?.pockets) return [];
    if (pocketKey === "mount") {
      return inventoryData.pockets.mount?.items || [];
    }
    if (pocketKey === "raid" || pocketKey === "tarot") {
      return [];
    }
    return inventoryData.pockets[pocketKey]?.items || [];
  }

  function totalSlotsFor() {
    return GRID_COLUMNS * GRID_ROWS;
  }

  function unlockedSlotsFor(pocketKey) {
    const layout = layoutFor(pocketKey);
    if (layout.unlockedSlots != null) return layout.unlockedSlots;
    return GRID_COLUMNS * layout.unlockedRows;
  }

  function isSlotLocked(pocketKey, slotIndex) {
    return slotIndex >= unlockedSlotsFor(pocketKey);
  }

  function buildSlotMap(items, pocketKey) {
    const map = new Map();
    items.forEach((entry, index) => {
      const slot = pocketKey === "mount" ? index : entry.slot;
      if (isSlotLocked(pocketKey, slot)) return;
      map.set(slot, entry);
    });
    return map;
  }

  function matchesSearch(entry) {
    if (!searchQuery) return true;
    const name = String(entry?.item?.name || "").toLowerCase();
    return name.includes(searchQuery);
  }

  async function moveInventoryItem(instanceId, pocket, slot) {
    const response = await fetch("/api/inventory/move", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instanceId, pocket, slot }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || "Could not move item.");
    }
    applyInventoryPayload(payload);
    return payload;
  }

  async function discardInventoryItem(instanceId) {
    const response = await fetch("/api/inventory/discard", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instanceId }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || "Could not discard item.");
    }
    applyInventoryPayload(payload);
    return payload;
  }

  async function useMerchantMedal(instanceId) {
    const response = await fetch("/api/inventory/use-merchant-medal", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instanceId }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || "Could not use NosMerchant Medal.");
    }
    applyInventoryPayload(payload);
    if (payload.merchantMedal) {
      window.NosBazaar?.setMerchantMedal?.(payload.merchantMedal);
    }
    return payload;
  }

  function applyInventoryPayload(payload) {
    if (!payload?.inventory) return;
    inventoryData = payload.inventory;
    if (goldEl && payload.gold != null) {
      goldEl.value = formatGold(payload.gold);
    }
    renderGrid();
  }

  function clearDropHighlight() {
    dropHighlightEl?.classList.remove("inventory-v2__slot--drop-target");
    dropHighlightEl = null;
    sellSlotDropHighlight?.classList.remove("bazaar__sell-slot--drop-target");
    sellSlotDropHighlight = null;
    discardBtn?.classList.remove("inventory-v2__discard-btn--drop-target");
  }

  function isSellSlotDropActive() {
    if (!window.NosFeatureFlags?.useNewBazaarInventory?.()) return false;
    const panel = document.querySelector('.bazaar__tab-panel[data-tab="list"]');
    if (!panel?.classList.contains("bazaar__tab-panel--active")) return false;
    const layer = document.getElementById("bazaar-layer");
    return Boolean(layer && !layer.hidden);
  }

  function removeDragGhost() {
    dragGhostEl?.remove();
    dragGhostEl = null;
  }

  function cleanupItemDrag() {
    itemDragState?.sourceEl?.classList.remove("inventory-v2__slot--drag-source");
    clearDropHighlight();
    removeDragGhost();
    itemDragState = null;
    rootEl?.classList.remove("inventory-v2--item-dragging");
    document.removeEventListener("mousemove", onItemDragMove);
    document.removeEventListener("mouseup", onItemDragEnd);
  }

  function elementUnderDragPoint(x, y) {
    if (!dragGhostEl) return document.elementFromPoint(x, y);
    dragGhostEl.style.visibility = "hidden";
    const target = document.elementFromPoint(x, y);
    dragGhostEl.style.visibility = "visible";
    return target;
  }

  function findSellSlotTarget(clientX, clientY) {
    const sellSlotEl = document.getElementById("sell-slot");
    if (!sellSlotEl || !isSellSlotDropActive()) return null;
    const rect = sellSlotEl.getBoundingClientRect();
    if (
      clientX >= rect.left &&
      clientX <= rect.right &&
      clientY >= rect.top &&
      clientY <= rect.bottom
    ) {
      return { type: "sell-slot", slotEl: sellSlotEl };
    }
    return null;
  }

  function findDropTarget(clientX, clientY) {
    if (discardBtn) {
      const rect = discardBtn.getBoundingClientRect();
      if (
        clientX >= rect.left &&
        clientX <= rect.right &&
        clientY >= rect.top &&
        clientY <= rect.bottom
      ) {
        return { type: "discard" };
      }
    }

    const sellSlotTarget = findSellSlotTarget(clientX, clientY);
    if (sellSlotTarget) return sellSlotTarget;

    const target = elementUnderDragPoint(clientX, clientY);
    const slotEl = target?.closest?.(".inventory-v2__slot:not(.inventory-v2__slot--locked)");
    if (!slotEl || !gridEl?.contains(slotEl)) return null;

    return {
      type: "slot",
      slotEl,
      pocket: activePocket(),
      slot: Number.parseInt(slotEl.dataset.slotIndex || "0", 10),
    };
  }

  function isDestSlotEmpty(pocketKey, slotIndex) {
    const items = pocketItems(pocketKey);
    if (pocketKey === "mount") {
      return !items[slotIndex];
    }
    return !items.some((entry) => entry.slot === slotIndex);
  }

  async function confirmDiscardItem(instanceId) {
    window.showMainInfoDialog?.("Discard this item?", {
      hideTitle: true,
      onConfirm: async () => {
        try {
          await discardInventoryItem(instanceId);
        } catch {
          // Ignore discard failures for now.
        }
        window.hideMainInfoDialog?.();
      },
      onCancel: () => window.hideMainInfoDialog?.(),
    });
  }

  async function onItemDragEnd(event) {
    const drag = itemDragState;
    cleanupItemDrag();
    if (!drag) return;

    const dropTarget = findDropTarget(event.clientX, event.clientY);
    if (!dropTarget) return;

    if (dropTarget.type === "discard") {
      await confirmDiscardItem(drag.instanceId);
      return;
    }

    if (dropTarget.type === "sell-slot") {
      window.NosBazaar?.onInventoryDropForSell?.(drag, event);
      return;
    }

    if (dropTarget.type !== "slot") return;

    if (drag.sourcePocket === dropTarget.pocket && drag.sourceSlot === dropTarget.slot) {
      return;
    }

    if (!canAcceptItemInPocket(drag.entry, dropTarget.pocket)) return;
    if (isSlotLocked(dropTarget.pocket, dropTarget.slot)) return;
    if (!isDestSlotEmpty(dropTarget.pocket, dropTarget.slot)) return;

    try {
      await moveInventoryItem(
        drag.instanceId,
        resolveDropPocket(dropTarget.pocket),
        dropTarget.slot,
      );
    } catch {
      await loadInventory().catch(() => {});
    }
  }

  function onItemDragMove(event) {
    if (!itemDragState || !dragGhostEl) return;
    dragGhostEl.style.left = `${event.clientX + 8}px`;
    dragGhostEl.style.top = `${event.clientY + 8}px`;

    clearDropHighlight();
    const dropTarget = findDropTarget(event.clientX, event.clientY);
    if (dropTarget?.type === "discard") {
      discardBtn?.classList.add("inventory-v2__discard-btn--drop-target");
      return;
    }
    if (dropTarget?.type === "sell-slot") {
      sellSlotDropHighlight = dropTarget.slotEl;
      sellSlotDropHighlight.classList.add("bazaar__sell-slot--drop-target");
      return;
    }
    if (dropTarget?.type === "slot") {
      dropHighlightEl = dropTarget.slotEl;
      dropHighlightEl.classList.add("inventory-v2__slot--drop-target");
    }
  }

  function beginItemDrag(event, entry, pocketKey, slotIndex, slotEl) {
    if (!entry?.instanceId || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();

    const iconUrl =
      entry.item?.iconUrl ||
      window.ItemIcons?.itemIconUrl?.({ item: entry.item, itemVNum: entry.item?.itemVNum });

    itemDragState = {
      entry,
      instanceId: entry.instanceId,
      sourcePocket: pocketKey,
      sourceSlot: slotIndex,
      sourceEl: slotEl,
    };

    slotEl.classList.add("inventory-v2__slot--drag-source");
    if (iconUrl) {
      dragGhostEl = document.createElement("img");
      dragGhostEl.className = "inventory-v2__item-drag-ghost";
      dragGhostEl.src = iconUrl;
      dragGhostEl.alt = "";
      document.body.appendChild(dragGhostEl);
    }

    rootEl?.classList.add("inventory-v2--item-dragging");
    onItemDragMove(event);
    document.addEventListener("mousemove", onItemDragMove);
    document.addEventListener("mouseup", onItemDragEnd);
  }

  function createSlotElement(entry, pocketKey, slotIndex) {
    const slot = document.createElement("div");
    slot.className = "inventory__slot inventory-v2__slot";
    slot.dataset.slotIndex = String(slotIndex);
    slot.dataset.pocket = pocketKey;

    if (isSlotLocked(pocketKey, slotIndex)) {
      slot.classList.add("inventory-v2__slot--locked");
      return slot;
    }

    if (!entry) return slot;

    if (!matchesSearch(entry)) {
      slot.classList.add("inventory-v2__slot--hidden-by-search");
      return slot;
    }

    slot.classList.add("inventory-v2__slot--filled");
    slot.dataset.instanceId = String(entry.instanceId);

    const iconUrl =
      entry.item?.iconUrl ||
      window.ItemIcons?.itemIconUrl?.({ item: entry.item, itemVNum: entry.item?.itemVNum });

    if (iconUrl) {
      const img = document.createElement("img");
      img.className = "inventory-v2__slot-icon";
      img.src = iconUrl;
      img.alt = "";
      img.draggable = false;
      slot.appendChild(img);
    }

    if (POCKETS_WITH_QTY.has(pocketKey)) {
      const qty = document.createElement("span");
      qty.className = "inventory-v2__slot-qty";
      qty.textContent = String(entry.quantity || 1);
      slot.appendChild(qty);
    }

    slot.addEventListener("mousedown", (e) => beginItemDrag(e, entry, pocketKey, slotIndex, slot));
    slot.addEventListener("dblclick", () => {
      const itemVNum = Number(entry.item?.itemVNum);
      if (!MERCHANT_MEDAL_VNUMS.has(itemVNum)) return;
      window.showMainInfoDialog?.("Use the item.", {
        hideTitle: true,
        onConfirm: async () => {
          try {
            const payload = await useMerchantMedal(entry.instanceId);
            if (payload.activatedItemName) {
              window.ChatUI?.appendAppMessage?.(
                `The ${payload.activatedItemName} effect has been activated!`,
              );
            }
          } catch {
            // Ignore use failures for now.
          }
          window.hideMainInfoDialog?.();
        },
        onCancel: () => window.hideMainInfoDialog?.(),
      });
    });
    slot.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      window.MainUI?.openItemInfo?.({
        name: entry.item?.name,
        icon: iconUrl,
        item: entry.item,
      });
    });

    return slot;
  }

  function renderGrid() {
    if (!gridEl) return;
    const pocketKey = activePocket();
    const items = pocketItems(pocketKey);
    const slotMap = buildSlotMap(items, pocketKey);
    const totalSlots = totalSlotsFor();

    gridEl.replaceChildren();
    for (let index = 0; index < totalSlots; index += 1) {
      gridEl.appendChild(createSlotElement(slotMap.get(index), pocketKey, index));
    }
  }

  function renderTabs() {
    if (!tabsEl) return;
    tabsEl.replaceChildren();
    for (const tab of TABS) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "inventory-v2__tab";
      btn.dataset.tab = tab.id;
      btn.textContent = tab.label;
      if (tab.id === activeTab) {
        btn.classList.add("inventory-v2__tab--active");
      }
      btn.addEventListener("click", () => setActiveTab(tab.id));
      tabsEl.appendChild(btn);
    }
    window.requestAnimationFrame(() => {
      syncTabScrollButtons();
      scrollActiveTabIntoView();
    });
  }

  function setActiveTab(tabId) {
    activeTab = tabId;
    updateTabActiveStates();
    scrollActiveTabIntoView();
    resetGridScroll();
    renderGrid();
  }

  function updateTabActiveStates() {
    if (!tabsEl) return;
    tabsEl.querySelectorAll(".inventory-v2__tab").forEach((btn) => {
      btn.classList.toggle("inventory-v2__tab--active", btn.dataset.tab === activeTab);
    });
  }

  function tabsScrollEl() {
    return tabsViewportEl || tabsEl;
  }

  function scrollActiveTabIntoView() {
    const scrollEl = tabsScrollEl();
    if (!scrollEl || !tabsEl) return;
    const active = tabsEl.querySelector(".inventory-v2__tab--active");
    if (!active) return;

    const viewLeft = scrollEl.scrollLeft;
    const viewRight = viewLeft + scrollEl.clientWidth;
    const tabLeft = active.offsetLeft;
    const tabRight = tabLeft + active.offsetWidth;

    if (tabLeft < viewLeft) {
      scrollEl.scrollLeft = tabLeft;
    } else if (tabRight > viewRight) {
      scrollEl.scrollLeft = tabRight - scrollEl.clientWidth;
    }
    syncTabScrollButtons();
  }

  function scrollTabsBy(delta) {
    const scrollEl = tabsScrollEl();
    if (!scrollEl) return;
    scrollEl.scrollBy({ left: delta, behavior: "smooth" });
    window.setTimeout(syncTabScrollButtons, 180);
  }

  function syncTabScrollButtons() {
    const scrollEl = tabsScrollEl();
    if (!scrollEl) return;
    const maxScroll = Math.max(0, scrollEl.scrollWidth - scrollEl.clientWidth);
    if (tabsPrevBtn) tabsPrevBtn.disabled = maxScroll <= 0 || scrollEl.scrollLeft <= 0;
    if (tabsNextBtn) tabsNextBtn.disabled = maxScroll <= 0 || scrollEl.scrollLeft >= maxScroll - 1;
  }

  function positionInventoryWindow(resetPosition = false) {
    if (!rootEl || !sceneEl) return;
    if (!resetPosition && userMoved) return;

    const sceneWidth = sceneEl.clientWidth;
    const sceneHeight = sceneEl.clientHeight;
    const width = rootEl.offsetWidth || 340;
    const height = rootEl.offsetHeight || 320;
    const pad = 12;

    let left = Math.max(pad, (sceneWidth - width) / 2);
    let top = Math.max(pad, (sceneHeight - height) / 2 - 24);
    left = Math.min(left, sceneWidth - width - pad);
    top = Math.min(top, sceneHeight - height - pad);

    rootEl.style.left = `${left}px`;
    rootEl.style.top = `${top}px`;
  }

  async function loadInventory() {
    const response = await fetch("/api/inventory", { credentials: "same-origin" });
    if (await window.SessionFlow?.respondToUnauthorized?.(response)) return;
    if (!response.ok) throw new Error("Could not load inventory.");
    const payload = await response.json();
    inventoryData = payload.inventory;
    if (goldEl) goldEl.value = formatGold(payload.gold);
    renderGrid();
  }

  function openInventoryWindow() {
    if (!layerEl || !rootEl) return;
    rootEl.classList.remove("inventory-v2--dragging");
    layerEl.hidden = false;
    positionInventoryWindow(false);
    window.NosWindowFocus?.bringToFront?.(rootEl);
    loadInventory().catch(() => {
      if (goldEl) goldEl.value = formatGold(0);
      renderGrid();
    });
    window.requestAnimationFrame(() => {
      syncTabScrollButtons();
      window.requestAnimationFrame(syncTabScrollButtons);
    });
  }

  function closeInventoryWindow() {
    window.NosQuantityDialog?.close?.();
    if (layerEl) layerEl.hidden = true;
    cleanupItemDrag();
  }

  function toggleInventoryWindow() {
    if (!layerEl) return;
    if (layerEl.hidden) openInventoryWindow();
    else closeInventoryWindow();
  }

  function initTitlebarDrag() {
    if (!titlebarEl || !rootEl || !sceneEl) return;
    titlebarEl.addEventListener("mousedown", (event) => {
      if (event.button !== 0 || event.target.closest(".bazaar__close, .inventory-v2__search-input")) {
        return;
      }
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
        let left = moveEvent.clientX - drag.sceneLeft - drag.offsetX;
        let top = moveEvent.clientY - drag.sceneTop - drag.offsetY;
        left = Math.max(0, Math.min(left, drag.sceneWidth - drag.width));
        top = Math.max(0, Math.min(top, drag.sceneHeight - drag.height));
        rootEl.style.left = `${left}px`;
        rootEl.style.top = `${top}px`;
      }

      function onUp() {
        userMoved = true;
        rootEl.classList.remove("inventory-v2--dragging");
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      }

      rootEl.classList.add("inventory-v2--dragging");
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
  }

  searchInput?.addEventListener("input", () => {
    searchQuery = String(searchInput.value || "").trim().toLowerCase();
    renderGrid();
  });

  tabsPrevBtn?.addEventListener("click", () => {
    scrollTabsBy(-64);
  });

  tabsNextBtn?.addEventListener("click", () => {
    scrollTabsBy(64);
  });

  tabsScrollEl()?.addEventListener("scroll", syncTabScrollButtons, { passive: true });

  tabsViewportEl?.addEventListener(
    "wheel",
    (event) => {
      const scrollEl = tabsScrollEl();
      if (!scrollEl) return;
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      if (delta === 0) return;
      event.preventDefault();
      scrollEl.scrollLeft += delta;
      syncTabScrollButtons();
    },
    { passive: false },
  );

  if (tabsViewportEl && typeof ResizeObserver !== "undefined") {
    const tabsResizeObserver = new ResizeObserver(() => syncTabScrollButtons());
    tabsResizeObserver.observe(tabsViewportEl);
  }
  closeBtn?.addEventListener("click", closeInventoryWindow);

  renderTabs();
  initTitlebarDrag();
  window.NosWindowFocus?.watch?.(rootEl);

  window.NosInventoryV2 = {
    open: openInventoryWindow,
    close: closeInventoryWindow,
    toggle: toggleInventoryWindow,
    reload: loadInventory,
    applyPayload: applyInventoryPayload,
    reposition: () => positionInventoryWindow(false),
  };

  window.NosReplaceableWindows?.register("inventory-v2", {
    group: "inventory",
    close: closeInventoryWindow,
  });

  window.addEventListener("resize", () => {
    if (layerEl && !layerEl.hidden) {
      positionInventoryWindow(false);
      syncTabScrollButtons();
    }
  });
})();
