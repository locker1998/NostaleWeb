(function () {
  function shouldFadeIn() {
    try {
      if (sessionStorage.getItem("nosbazaar.fadeIn") === "1") {
        return true;
      }
    } catch (error) {
      // Ignore storage errors.
    }

    try {
      return new URLSearchParams(window.location.search).get("fadeIn") === "1";
    } catch (error) {
      return false;
    }
  }

  if (!shouldFadeIn()) {
    return;
  }

  if (!document.getElementById("screen-transition-critical-css")) {
    const style = document.createElement("style");
    style.id = "screen-transition-critical-css";
    style.textContent =
      "html.screen-transition--pending-in,html.screen-transition--pending-in body{background-color:#000}" +
      "html.screen-transition--pending-in body>:not(.screen-transition__overlay){visibility:hidden}";
    document.head.appendChild(style);
  }

  document.documentElement.classList.add("screen-transition--pending-in");
})();

(function () {
  function stylesheetRuleCount(sheet) {
    try {
      return sheet.cssRules.length;
    } catch {
      return -1;
    }
  }

  function retryStylesheet(link) {
    if (!link || link.dataset.retrying === "1") {
      return;
    }

    link.dataset.retrying = "1";
    const fresh = document.createElement("link");
    fresh.rel = "stylesheet";
    fresh.href = `${link.href.split("?")[0]}?retry=${Date.now()}`;
    fresh.addEventListener("load", () => {
      link.remove();
    });
    fresh.addEventListener("error", () => {
      delete link.dataset.retrying;
    });
    link.parentNode?.insertBefore(fresh, link.nextSibling);
  }

  function repairStylesheets() {
    document.querySelectorAll('link[rel="stylesheet"]').forEach((link) => {
      const sheet = link.sheet;
      if (!sheet || !link.href.includes("/static/css/")) {
        return;
      }
      if (stylesheetRuleCount(sheet) === 0) {
        retryStylesheet(link);
      }
    });
  }

  window.addEventListener("load", () => {
    window.setTimeout(repairStylesheets, 0);
  });
})();
