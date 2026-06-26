(() => {
  const registry = new Map();

  function closeAll() {
    for (const entry of registry.values()) {
      try {
        entry.close?.();
      } catch {
        // Ignore close failures so one bad handler does not block others.
      }
    }
  }

  function closeGroup(group) {
    for (const entry of registry.values()) {
      if (entry.group !== group) continue;
      try {
        entry.close?.();
      } catch {
        // Ignore close failures.
      }
    }
  }

  window.NosReplaceableWindows = {
    register(id, { group = "default", close } = {}) {
      if (!id || typeof close !== "function") return;
      registry.set(id, { group, close });
    },
    unregister(id) {
      registry.delete(id);
    },
    closeAll,
    closeGroup,
  };
})();
