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

  var root = document.documentElement;
  root.classList.add("screen-transition--pending-in");
  root.style.backgroundColor = "#000";
})();
