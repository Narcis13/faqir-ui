/* Theme-studio wiring for the documentation site (studio/index.html).
 *
 * The `faqir-tweak` plugin reads the theme's computed tokens once, when its
 * panel mounts, and scales from those. On this site the theme is a swappable
 * stylesheet that gallery.js may still be loading when the engine boots (a
 * stored theme replaces the default one on load), so the studio's `<aside
 * l-tweak>` waits in a <template> until that stylesheet has settled, and is
 * then handed to `Faqir.initTree`. A later switch of theme reloads the page for
 * the same reason; the theme choice and the dials are both persisted, so the
 * reload loses nothing.
 */
(function () {
  "use strict";

  var THEME_LINK_ID = "faqir-theme";
  var mountedTheme = null;

  function whenThemeSettled(callback) {
    var link = document.getElementById(THEME_LINK_ID);
    if (!link || !link.hasAttribute("data-theme-loading")) {
      callback();
      return;
    }
    var done = false;
    var go = function () {
      if (done) return;
      done = true;
      callback();
    };
    link.addEventListener("load", go);
    link.addEventListener("error", go);
    // A stylesheet that never reports back must not leave the studio unmounted.
    window.setTimeout(go, 3000);
  }

  function mount() {
    var template = document.querySelector("template[data-docs-studio-mount]");
    if (!template || !window.Faqir || typeof window.Faqir.initTree !== "function") return;
    var panel = template.content.firstElementChild;
    if (!panel) return;
    panel = panel.cloneNode(true);
    template.parentNode.replaceChild(panel, template);
    window.Faqir.initTree(panel);
    var link = document.getElementById(THEME_LINK_ID);
    mountedTheme = link ? link.getAttribute("data-theme-name") : "";
  }

  window.addEventListener("faqir:appearance", function (event) {
    var theme = event && event.detail ? event.detail.theme : null;
    if (mountedTheme !== null && theme && theme !== mountedTheme) window.location.reload();
  });

  function start() {
    whenThemeSettled(mount);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
