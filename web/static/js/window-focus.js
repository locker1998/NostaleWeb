(() => {
  let topZ = 30;

  function bringToFront(target) {
    if (!target) return;

    const layer = target.closest(
      ".bazaar-layer, .bazaar-v2-layer, .inventory-layer, .inventory-v2-layer, .game-config-layer, .skill-info-layer, .inventory-additional-layer",
    );
    const root =
      target.closest(
        ".bazaar--floating, .bazaar-v2, .game-config, .inventory--floating, .inventory--additional, .inventory-v2, .skill-info",
      ) || target;

    topZ += 1;
    if (layer) {
      layer.style.zIndex = String(topZ);
    }
    if (root && root !== layer) {
      root.style.zIndex = String(topZ);
    }
  }

  function initFloatingWindowFocus() {
    const roots = document.querySelectorAll(
      "#bazaar-root, #bazaar-v2-root, #game-config-root, #inventory-root, #inventory-v2-root, .inventory--additional, .skill-info",
    );

    roots.forEach((root) => {
      root.addEventListener("mousedown", (event) => {
        if (event.button !== 0) return;
        bringToFront(root);
      });
    });

    document.getElementById("skill-info-layer")?.addEventListener("mousedown", (event) => {
      const info = event.target.closest(".skill-info");
      if (info) {
        bringToFront(info);
      }
    });
  }

  window.NosWindowFocus = {
    bringToFront,
    init: initFloatingWindowFocus,
    watch(root) {
      if (!root) return;
      root.addEventListener("mousedown", (event) => {
        if (event.button !== 0) return;
        bringToFront(root);
      });
    },
  };
})();
