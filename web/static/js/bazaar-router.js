(() => {
  function useNewBazaar() {
    return window.NosFeatureFlags?.useNewBazaarInventory?.() ?? false;
  }

  function openBazaar() {
    if (useNewBazaar()) {
      window.NosBazaarV2?.open?.();
      return;
    }
    window.NosBazaarClassic?.open?.();
  }

  function closeBazaar() {
    window.NosBazaarClassic?.close?.();
    window.NosBazaarV2?.close?.();
  }

  function repositionBazaar() {
    window.NosBazaarClassic?.reposition?.();
    window.NosBazaarV2?.reposition?.();
  }

  function setGold(gold) {
    window.NosBazaarClassic?.setGold?.(gold);
    window.NosBazaarV2?.setGold?.(gold);
  }

  function setMerchantMedal(medal) {
    window.NosBazaarClassic?.setMerchantMedal?.(medal);
    window.NosBazaarV2?.setMerchantMedal?.(medal);
  }

  function onInventoryDropForSell(drag, event) {
    if (useNewBazaar()) {
      window.NosBazaarV2?.onInventoryDropForSell?.(drag, event);
      return;
    }
    window.NosBazaarClassic?.onInventoryDropForSell?.(drag, event);
  }

  function isSellDropActive() {
    if (useNewBazaar()) {
      return Boolean(window.NosBazaarV2?.isSellDropActive?.());
    }
    return Boolean(window.NosBazaarClassic?.isSellDropActive?.());
  }

  function searchByItemName(name) {
    if (useNewBazaar()) {
      window.NosBazaarV2?.searchByItemName?.(name);
      return;
    }
    openBazaar();
    const input = document.getElementById("filter-name");
    if (input) input.value = String(name || "");
    document.getElementById("btn-search")?.click?.();
  }

  function quickSellFromInventory(entry, event) {
    if (useNewBazaar()) {
      void window.NosBazaarV2?.quickSellFromInventory?.(entry, event);
      return;
    }
    window.NosBazaarClassic?.onInventoryDropForSell?.({ entry, instanceId: entry?.instanceId }, event);
  }

  window.NosBazaar = {
    open: openBazaar,
    close: closeBazaar,
    reposition: repositionBazaar,
    setGold,
    setMerchantMedal,
    onInventoryDropForSell,
    isSellDropActive,
    searchByItemName,
    quickSellFromInventory,
  };
})();
