(() => {
  const SLOT_SIZE = 36;

  const POCKET_LAYOUTS = {
    equip: { columns: 6, rows: 20, unlockedRows: 8 },
    main: { columns: 6, rows: 20, unlockedRows: 8 },
    etc: { columns: 6, rows: 20, unlockedRows: 14 },
    mount: { columns: 5, rows: 12, unlockedRows: 12 },
    card: { columns: 5, rows: 12, unlockedRows: 12 },
    costume: { columns: 5, rows: 12, unlockedRows: 12 },
  };

  const layerEl = document.getElementById("inventory-layer");
  const rootEl = document.getElementById("inventory-root");
  const closeBtn = document.getElementById("inventory-close");
  const gridEl = document.getElementById("inventory-grid");
  const goldEl = document.getElementById("inventory-gold");
  const discardBtn = document.getElementById("inventory-discard-btn");
  const tabButtons = document.querySelectorAll("#inventory-root .inventory__tab");
  const sceneEl = document.querySelector(".scene--main");

  const ADDITIONAL_WINDOWS = [
    {
      pocket: "mount",
      layerEl: document.getElementById("inventory-mount-layer"),
      rootEl: document.getElementById("inventory-mount-root"),
      gridEl: document.getElementById("inventory-mount-grid"),
      title: "Mount",
    },
    {
      pocket: "card",
      layerEl: document.getElementById("inventory-card-layer"),
      rootEl: document.getElementById("inventory-card-root"),
      gridEl: document.getElementById("inventory-card-grid"),
      title: "Card",
    },
    {
      pocket: "costume",
      layerEl: document.getElementById("inventory-costume-layer"),
      rootEl: document.getElementById("inventory-costume-root"),
      gridEl: document.getElementById("inventory-costume-grid"),
      title: "Costume",
    },
  ];

  const ADDITIONAL_STACK_ORDER = ["costume", "card", "mount"];

  const POCKETS_WITH_QTY_LABEL = new Set(["main", "etc", "mount"]);

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

  function showsQuantityLabel(pocketKey) {
    return POCKETS_WITH_QTY_LABEL.has(pocketKey);
  }

  let inventoryData = null;
  let activeTab = "equip";
  let userMoved = false;
  let itemDragState = null;
  let dragGhostEl = null;
  let dropHighlightEl = null;

  function defaultPocketForItem(item) {
    const inventoryType = Number(item?.inventoryType ?? 0);
    return INVENTORY_TYPE_TO_POCKET[inventoryType] || "main";
  }

  function canAcceptItemInPocket(entry, destPocketKey) {
    const pocket = destPocketKey === "mount" ? "equip" : destPocketKey;
    return defaultPocketForItem(entry?.item) === pocket;
  }

  function resolveDropPocket(viewPocketKey) {
    return viewPocketKey === "mount" ? "equip" : viewPocketKey;
  }

  function pocketKeyForGrid(gridEl) {
    if (gridEl?.id === "inventory-grid") {
      return activeTab;
    }
    for (const win of ADDITIONAL_WINDOWS) {
      if (win.gridEl === gridEl) {
        return win.pocket;
      }
    }
    return activeTab;
  }

  function applyInventoryPayload(payload) {
    if (!payload?.inventory) return;
    inventoryData = payload.inventory;
    if (goldEl && payload.gold != null) {
      goldEl.value = `${formatGold(payload.gold)} Gold`;
    }
    renderAllGrids();
    repositionAdditionalWindows();
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

  function clearDropHighlight() {
    dropHighlightEl?.classList.remove("inventory__slot--drop-target");
    dropHighlightEl = null;
    discardBtn?.classList.remove("inventory__discard-btn--drop-target");
  }

  function removeDragGhost() {
    dragGhostEl?.remove();
    dragGhostEl = null;
  }

  function cleanupItemDrag() {
    itemDragState?.sourceEl?.classList.remove("inventory__slot--drag-source");
    clearDropHighlight();
    removeDragGhost();
    itemDragState = null;
    document.removeEventListener("mousemove", onItemDragMove);
    document.removeEventListener("mouseup", onItemDragEnd);
  }

  function elementUnderDragPoint(x, y) {
    removeDragGhost();
    const target = document.elementFromPoint(x, y);
    if (dragGhostEl) {
      document.body.appendChild(dragGhostEl);
    }
    return target;
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

    const target = elementUnderDragPoint(clientX, clientY);
    const slotEl = target?.closest?.(".inventory__slot:not(.inventory__slot--locked)");
    if (!slotEl) {
      return null;
    }

    const gridEl = slotEl.closest(".inventory__grid");
    if (!gridEl) {
      return null;
    }

    const viewPocket = slotEl.dataset.pocket || pocketKeyForGrid(gridEl);
    const slotIndex = Number.parseInt(slotEl.dataset.slotIndex, 10);
    if (!Number.isFinite(slotIndex)) {
      return null;
    }

    return {
      type: "slot",
      slotEl,
      viewPocket,
      pocket: resolveDropPocket(viewPocket),
      slot: slotIndex,
    };
  }

  function onItemDragMove(event) {
    if (!itemDragState) return;

    if (dragGhostEl) {
      dragGhostEl.style.left = `${event.clientX - 16}px`;
      dragGhostEl.style.top = `${event.clientY - 16}px`;
    }

    clearDropHighlight();
    const dropTarget = findDropTarget(event.clientX, event.clientY);
    if (dropTarget?.type === "discard") {
      discardBtn?.classList.add("inventory__discard-btn--drop-target");
      return;
    }
    if (dropTarget?.type === "slot") {
      dropHighlightEl = dropTarget.slotEl;
      dropHighlightEl.classList.add("inventory__slot--drop-target");
    }
  }

  function confirmDiscardItem(instanceId) {
    return new Promise((resolve) => {
      window.showMainInfoDialog?.("Do you want to delete this item?", {
        hideTitle: true,
        onConfirm: async () => {
          try {
            await discardInventoryItem(instanceId);
          } catch {
            // Ignore discard failures for now.
          }
          window.hideMainInfoDialog?.();
          resolve(true);
        },
        onCancel: () => {
          window.hideMainInfoDialog?.();
          resolve(false);
        },
      });
    });
  }

  async function onItemDragEnd(event) {
    if (!itemDragState) return;

    const drag = itemDragState;
    cleanupItemDrag();

    const dropTarget = findDropTarget(event.clientX, event.clientY);
    if (!dropTarget) {
      return;
    }

    if (dropTarget.type === "discard") {
      await confirmDiscardItem(drag.instanceId);
      return;
    }

    if (dropTarget.type !== "slot") {
      return;
    }

    if (
      drag.sourcePocket === dropTarget.pocket &&
      drag.sourceSlot === dropTarget.slot
    ) {
      return;
    }

    if (!canAcceptItemInPocket(drag.entry, dropTarget.viewPocket)) {
      return;
    }

    if (isSlotLocked(dropTarget.viewPocket, dropTarget.slot)) {
      return;
    }

    try {
      await moveInventoryItem(drag.instanceId, dropTarget.pocket, dropTarget.slot);
    } catch {
      // Invalid moves keep the item where it was (reload from server state).
      await loadInventory().catch(() => {});
    }
  }

  function beginItemDrag(event, entry, viewPocket, slotIndex, slotEl) {
    if (!entry?.instanceId || event.button !== 0) return;

    event.preventDefault();
    event.stopPropagation();

    const iconUrl =
      entry.item?.iconUrl ||
      window.ItemIcons?.itemIconUrl?.({ item: entry.item, itemVNum: entry.item?.itemVNum });

    itemDragState = {
      instanceId: entry.instanceId,
      sourcePocket: entry.pocket || resolveDropPocket(viewPocket),
      sourceSlot: entry.slot,
      entry,
      sourceEl: slotEl,
    };
    slotEl.classList.add("inventory__slot--drag-source");

    if (iconUrl) {
      dragGhostEl = document.createElement("img");
      dragGhostEl.className = "inventory__item-drag-ghost";
      dragGhostEl.src = iconUrl;
      dragGhostEl.alt = "";
      dragGhostEl.style.left = `${event.clientX - 16}px`;
      dragGhostEl.style.top = `${event.clientY - 16}px`;
      document.body.appendChild(dragGhostEl);
    }

    document.addEventListener("mousemove", onItemDragMove);
    document.addEventListener("mouseup", onItemDragEnd);
  }

  function layoutFor(pocketKey) {
    return POCKET_LAYOUTS[pocketKey] || POCKET_LAYOUTS.main;
  }

  function formatGold(value) {
    return Number(value || 0).toLocaleString("en-US");
  }

  function isTypingTarget() {
    const el = document.activeElement;
    if (!el) return false;
    const tag = el.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
  }

  function pocketItems(pocketKey) {
    if (!inventoryData?.pockets) return [];
    if (pocketKey === "mount") {
      return inventoryData.pockets.mount?.items || [];
    }
    return inventoryData.pockets[pocketKey]?.items || [];
  }

  function totalSlotsFor(pocketKey) {
    const layout = layoutFor(pocketKey);
    return layout.columns * layout.rows;
  }

  function unlockedSlotsFor(pocketKey) {
    const layout = layoutFor(pocketKey);
    return layout.columns * layout.unlockedRows;
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

  function applyGridLayout(targetGrid, pocketKey) {
    if (!targetGrid) return;
    const layout = layoutFor(pocketKey);
    targetGrid.style.gridTemplateColumns = `repeat(${layout.columns}, ${SLOT_SIZE}px)`;
    targetGrid.style.gridAutoRows = `${SLOT_SIZE}px`;
    targetGrid.dataset.columns = String(layout.columns);
    targetGrid.dataset.rows = String(layout.rows);
  }

  function createSlotElement(entry, pocketKey, slotIndex) {
    const slot = document.createElement("div");
    slot.className = "inventory__slot";
    slot.dataset.slotIndex = String(slotIndex);
    slot.dataset.pocket = pocketKey;

    if (isSlotLocked(pocketKey, slotIndex)) {
      slot.classList.add("inventory__slot--locked");
      return slot;
    }

    if (!entry) return slot;

    slot.classList.add("inventory__slot--filled");
    slot.dataset.instanceId = String(entry.instanceId);

    const iconUrl =
      entry.item?.iconUrl || window.ItemIcons?.itemIconUrl?.({ item: entry.item, itemVNum: entry.item?.itemVNum });

    if (iconUrl) {
      const img = document.createElement("img");
      img.className = "inventory__slot-icon";
      img.src = iconUrl;
      img.alt = "";
      img.draggable = false;
      slot.appendChild(img);
    }

    if (showsQuantityLabel(pocketKey)) {
      const qty = document.createElement("span");
      qty.className = "inventory__slot-qty";
      qty.textContent = String(entry.quantity || 1);
      slot.appendChild(qty);
    }

    slot.addEventListener("mousedown", (event) => {
      beginItemDrag(event, entry, pocketKey, slotIndex, slot);
    });

    slot.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      window.MainUI?.openItemInfo?.({
        name: entry.item?.name,
        icon: iconUrl,
        item: entry.item,
      });
    });

    return slot;
  }

  function renderGridFor(targetGrid, pocketKey) {
    if (!targetGrid) return;

    const items = pocketItems(pocketKey);
    const slotMap = buildSlotMap(items, pocketKey);
    const totalSlots = totalSlotsFor(pocketKey);
    applyGridLayout(targetGrid, pocketKey);
    targetGrid.replaceChildren();

    for (let index = 0; index < totalSlots; index += 1) {
      targetGrid.appendChild(createSlotElement(slotMap.get(index), pocketKey, index));
    }
  }

  function renderMainGrid() {
    renderGridFor(gridEl, activeTab);
  }

  function renderAdditionalGrids() {
    for (const win of ADDITIONAL_WINDOWS) {
      renderGridFor(win.gridEl, win.pocket);
    }
  }

  function renderAllGrids() {
    renderMainGrid();
    renderAdditionalGrids();
  }

  function positionInventoryWindow(resetPosition = false) {
    if (!rootEl || !sceneEl) return;

    if (!resetPosition && userMoved) {
      repositionAdditionalWindows();
      return;
    }

    const sceneWidth = sceneEl.clientWidth;
    const sceneHeight = sceneEl.clientHeight;
    const width = rootEl.offsetWidth || 300;
    const height = rootEl.offsetHeight || 400;
    const pad = 12;

    let left = Math.max(pad, (sceneWidth - width) / 2 + 40);
    let top = Math.max(pad, (sceneHeight - height) / 2 - 20);

    left = Math.min(left, sceneWidth - width - pad);
    top = Math.min(top, sceneHeight - height - pad);

    rootEl.style.left = `${left}px`;
    rootEl.style.top = `${top}px`;
    repositionAdditionalWindows();
  }

  function repositionAdditionalWindows() {
    if (!rootEl || !sceneEl || layerEl?.hidden) return;

    const invLeft = Number.parseFloat(rootEl.style.left) || 0;
    const invTop = Number.parseFloat(rootEl.style.top) || 0;
    const invHeight = rootEl.offsetHeight || 400;
    const gap = 4;
    const pad = 8;

    const stack = ADDITIONAL_STACK_ORDER.map((pocket) =>
      ADDITIONAL_WINDOWS.find((win) => win.pocket === pocket),
    ).filter((win) => win?.layerEl && !win.layerEl.hidden);

    if (!stack.length) return;

    const winWidth = stack[0].rootEl?.offsetWidth || 220;
    const left = Math.max(pad, invLeft - winWidth - pad);
    let bottom = invTop + invHeight;

    for (const win of stack) {
      const height = win.rootEl?.offsetHeight || 200;
      bottom -= height;
      win.rootEl.style.left = `${left}px`;
      win.rootEl.style.top = `${Math.max(pad, bottom)}px`;
      bottom -= gap;
    }
  }

  function isAdditionalWindowOpen() {
    return ADDITIONAL_WINDOWS.some((win) => win.layerEl && !win.layerEl.hidden);
  }

  function updateTabStates() {
    tabButtons.forEach((btn) => {
      if (btn.dataset.tab === "additional") {
        btn.classList.remove("inventory__tab--active");
        return;
      }
      if (btn.classList.contains("inventory__tab--pocket")) {
        btn.classList.toggle("inventory__tab--active", btn.dataset.tab === activeTab);
        return;
      }
      btn.classList.remove("inventory__tab--active");
    });
  }

  function openAdditionalWindow(win) {
    if (!win.layerEl || !win.rootEl) return;

    win.rootEl.classList.remove("inventory--dragging");
    win.layerEl.hidden = false;
    renderGridFor(win.gridEl, win.pocket);
    repositionAdditionalWindows();
    window.NosWindowFocus?.bringToFront?.(win.rootEl);
  }

  function closeAdditionalWindow(win) {
    if (win.layerEl) {
      win.layerEl.hidden = true;
    }
    updateTabStates();
  }

  function openAdditionalWindows() {
    for (const win of ADDITIONAL_WINDOWS) {
      openAdditionalWindow(win);
    }
    updateTabStates();
  }

  function closeAdditionalWindows() {
    for (const win of ADDITIONAL_WINDOWS) {
      if (win.layerEl) {
        win.layerEl.hidden = true;
      }
    }
    updateTabStates();
  }

  function toggleAdditionalWindows() {
    if (isAdditionalWindowOpen()) {
      closeAdditionalWindows();
      return;
    }
    openAdditionalWindows();
  }

  function setActiveTab(tab) {
    if (tab === "fish") {
      return;
    }

    if (tab === "additional") {
      toggleAdditionalWindows();
      return;
    }

    activeTab = tab;
    updateTabStates();
    renderMainGrid();
  }

  async function loadInventory() {
    const response = await fetch("/api/inventory", { credentials: "same-origin" });
    if (!response.ok) {
      throw new Error("Could not load inventory.");
    }
    const payload = await response.json();
    inventoryData = payload.inventory;
    if (goldEl) {
      goldEl.value = `${formatGold(payload.gold)} Gold`;
    }
    renderAllGrids();
    repositionAdditionalWindows();
  }

  function openInventoryWindow() {
    if (!layerEl || !rootEl) return;

    rootEl.classList.remove("inventory--dragging");
    layerEl.hidden = false;
    positionInventoryWindow(false);
    window.NosWindowFocus?.bringToFront?.(rootEl);
    loadInventory().catch(() => {
      if (goldEl) goldEl.value = "0 Gold";
      renderAllGrids();
      repositionAdditionalWindows();
    });
  }

  function closeInventoryWindow() {
    closeAdditionalWindows();
    if (layerEl) layerEl.hidden = true;
  }

  function toggleInventoryWindow() {
    if (!layerEl) return;
    if (layerEl.hidden) {
      openInventoryWindow();
    } else {
      closeInventoryWindow();
    }
  }

  function onMainWindowDragEnd() {
    userMoved = true;
    repositionAdditionalWindows();
  }

  function initInventoryTabs() {
    tabButtons.forEach((btn) => {
      btn.addEventListener("click", () => setActiveTab(btn.dataset.tab));
    });
  }

  function initAdditionalWindows() {
    for (const win of ADDITIONAL_WINDOWS) {
      const closeButton = win.rootEl?.querySelector("[data-close-additional]");
      closeButton?.addEventListener("click", () => {
        closeAdditionalWindow(win);
      });
      window.NosWindowFocus?.watch?.(win.rootEl);
    }
  }

  function initInventoryHotkey() {
    document.addEventListener("keydown", (event) => {
      if (event.key !== "i" && event.key !== "I") return;
      if (event.ctrlKey || event.altKey || event.metaKey) return;
      if (isTypingTarget()) return;
      event.preventDefault();
      toggleInventoryWindow();
    });
  }

  closeBtn?.addEventListener("click", closeInventoryWindow);

  initInventoryTabs();
  initAdditionalWindows();
  initInventoryHotkey();
  window.NosWindowFocus?.watch?.(rootEl);

  window.NosInventory = {
    open: openInventoryWindow,
    close: closeInventoryWindow,
    toggle: toggleInventoryWindow,
    reload: loadInventory,
    reposition: () => positionInventoryWindow(false),
    repositionAttached: repositionAdditionalWindows,
    onMainWindowDragEnd,
    openAdditional: openAdditionalWindows,
    closeAdditional: closeAdditionalWindows,
  };

  window.addEventListener("resize", () => {
    if (layerEl && !layerEl.hidden) {
      positionInventoryWindow(false);
    }
  });
})();
