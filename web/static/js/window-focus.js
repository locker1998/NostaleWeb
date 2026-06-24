(() => {
  let topZ = 30;

  function bringToFront(target) {
    if (!target) return;

    const layer = target.closest(
      ".bazaar-layer, .inventory-layer, .game-config-layer, .skill-info-layer, .inventory-additional-layer",
    );
    const root =
      target.closest(
        ".bazaar--floating, .game-config, .inventory--floating, .inventory--additional, .skill-info",
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
      "#bazaar-root, #game-config-root, #inventory-root, .inventory--additional, .skill-info",
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
