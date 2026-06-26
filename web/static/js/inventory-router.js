(() => {
  function useNewInventory() {
    return window.NosFeatureFlags?.useNewBazaarInventory?.() ?? false;
  }

  function isTypingTarget(el) {
    if (!el) return false;
    const tag = el.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
  }

  function openInventory() {
    if (useNewInventory()) {
      window.NosInventoryV2?.open?.();
      return;
    }
    window.NosInventoryClassic?.open?.();
  }

  function closeInventory() {
    window.NosInventoryClassic?.close?.();
    window.NosInventoryV2?.close?.();
  }

  function toggleInventory() {
    if (useNewInventory()) {
      window.NosInventoryV2?.toggle?.();
      return;
    }
    window.NosInventoryClassic?.toggle?.();
  }

  function reloadInventory() {
    void window.NosInventoryClassic?.reload?.();
    void window.NosInventoryV2?.reload?.();
  }

  function applyInventoryPayload(payload) {
    window.NosInventoryClassic?.applyPayload?.(payload);
    window.NosInventoryV2?.applyPayload?.(payload);
  }

  document.addEventListener("keydown", (event) => {
    if (event.key !== "i" && event.key !== "I") return;
    if (event.ctrlKey || event.altKey || event.metaKey) return;
    if (isTypingTarget(document.activeElement)) return;
    event.preventDefault();
    toggleInventory();
  });

  window.NosInventory = {
    open: openInventory,
    close: closeInventory,
    toggle: toggleInventory,
    reload: reloadInventory,
    applyPayload: applyInventoryPayload,
    reposition: () => {
      window.NosInventoryClassic?.reposition?.();
      window.NosInventoryV2?.reposition?.();
    },
    repositionAttached: () => window.NosInventoryClassic?.repositionAttached?.(),
    onMainWindowDragEnd: () => window.NosInventoryClassic?.onMainWindowDragEnd?.(),
    openAdditional: () => window.NosInventoryClassic?.openAdditional?.(),
    closeAdditional: () => window.NosInventoryClassic?.closeAdditional?.(),
  };
})();
