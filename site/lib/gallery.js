/* Theme-gallery wiring — task 0.7-14 (FAQIR-PLAN §13).
 *
 * One file, two roles, decided by whether it is running inside a frame:
 *
 *   host  (themes/index.html)        the switcher: swaps the theme <link> and the
 *                                    `data-theme` scheme attribute, and forwards
 *                                    the scheme to every preview frame
 *   frame (frames/theme-preview-*)   applies a scheme it is told about
 *
 * Both axes are a one-attribute change with no reload, which is the point of the
 * demo: `href` on `#faqir-theme` selects the theme, `data-theme` on <html>
 * selects the colour scheme. Nothing else on the page moves, and the framework
 * has to already work for the page to survive it.
 */
(function () {
  "use strict";

  var THEME_LINK_ID = "faqir-theme";
  var SCHEMES = ["light", "dark", "auto"];

  function themeLink() {
    return document.getElementById(THEME_LINK_ID);
  }

  /** Point the theme link at a sibling stylesheet — depth- and host-independent. */
  function applyTheme(name) {
    var link = themeLink();
    if (!link || !name) return;
    link.setAttribute("href", link.getAttribute("href").replace(/[^/]+\.css$/, name + ".css"));
    link.setAttribute("data-theme-name", name);
  }

  function applyScheme(scheme) {
    if (SCHEMES.indexOf(scheme) === -1) return;
    document.documentElement.setAttribute("data-theme", scheme);
  }

  function pressed(buttons, value, attr) {
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].setAttribute("aria-pressed", buttons[i].getAttribute(attr) === value ? "true" : "false");
    }
  }

  // ── frame role ────────────────────────────────────────────────────────────
  function startFrame() {
    window.addEventListener("message", function (event) {
      var data = event.data;
      if (!data || typeof data !== "object" || data.faqir !== "theme-preview") return;
      if (data.scheme) applyScheme(data.scheme);
      if (data.theme) applyTheme(data.theme);
    });
  }

  // ── host role ─────────────────────────────────────────────────────────────
  function startHost() {
    var themeButtons = document.querySelectorAll("[data-theme-pick]");
    var schemeButtons = document.querySelectorAll("[data-scheme-pick]");
    var frames = document.querySelectorAll("[data-theme-frame]");
    var link = themeLink();
    var scheme = document.documentElement.getAttribute("data-theme") || "auto";
    var current = link ? link.getAttribute("data-theme-name") : "";

    function broadcast() {
      for (var i = 0; i < frames.length; i++) {
        var frame = frames[i];
        if (!frame.contentWindow) continue;
        frame.contentWindow.postMessage({ faqir: "theme-preview", scheme: scheme }, "*");
      }
    }

    for (var i = 0; i < themeButtons.length; i++) {
      themeButtons[i].addEventListener("click", function (event) {
        current = event.currentTarget.getAttribute("data-theme-pick");
        applyTheme(current);
        pressed(themeButtons, current, "data-theme-pick");
      });
    }

    for (var j = 0; j < schemeButtons.length; j++) {
      schemeButtons[j].addEventListener("click", function (event) {
        scheme = event.currentTarget.getAttribute("data-scheme-pick");
        applyScheme(scheme);
        pressed(schemeButtons, scheme, "data-scheme-pick");
        broadcast();
      });
    }

    // A frame that is already loaded gets the scheme now; the rest on load.
    for (var k = 0; k < frames.length; k++) {
      frames[k].addEventListener("load", broadcast);
    }
    broadcast();

    pressed(themeButtons, current, "data-theme-pick");
    pressed(schemeButtons, scheme, "data-scheme-pick");

    window.FaqirGallery = {
      theme: function () {
        return current;
      },
      scheme: function () {
        return scheme;
      },
    };
  }

  function start() {
    if (window.self !== window.top) startFrame();
    else startHost();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
