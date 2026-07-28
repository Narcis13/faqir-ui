/* Faqir documentation-site wiring.
 *
 * The file began as the theme gallery's two-axis switcher and now owns the
 * small progressive enhancements shared by the generated shell:
 *
 *   • persistent theme + colour-scheme controls on every page;
 *   • theme-gallery buttons and preview-frame broadcasts;
 *   • responsive component-preview widths;
 *   • the mobile documentation drawer;
 *   • component and sidebar filtering.
 *
 * It still owns no framework logic. Components are styled by their CSS and
 * recipes by faqir-core.js; this file only connects authored controls to native
 * attributes. Everything degrades to visible links, selects, details, and
 * iframes when JavaScript is unavailable.
 */
(function () {
  "use strict";

  var THEME_LINK_ID = "faqir-theme";
  var THEME_KEY = "faqir-docs-theme";
  var SCHEME_KEY = "faqir-docs-scheme";
  var SCHEMES = ["light", "dark", "auto"];
  var state = { theme: "", scheme: "auto" };

  function all(selector, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(selector));
  }

  function themeLink() {
    return document.getElementById(THEME_LINK_ID);
  }

  function validTheme(name) {
    return typeof name === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name);
  }

  function validScheme(scheme) {
    return SCHEMES.indexOf(scheme) !== -1;
  }

  function readStored(key) {
    try {
      return window.localStorage ? window.localStorage.getItem(key) : null;
    } catch (_) {
      return null;
    }
  }

  function writeStored(key, value) {
    try {
      if (window.localStorage) window.localStorage.setItem(key, value);
    } catch (_) {
      // Storage is optional (file://, strict privacy settings, sandboxed frames).
    }
  }

  /** Point the swappable link at a sibling stylesheet, at any page depth. */
  function setThemeLink(name) {
    var link = themeLink();
    if (!link || !validTheme(name)) return false;
    var href = link.getAttribute("href") || "";
    if (!/[^/]+\.css(?:[?#].*)?$/.test(href)) return false;
    link.setAttribute("href", href.replace(/[^/]+\.css(?=[?#]|$)/, name + ".css"));
    link.setAttribute("data-theme-name", name);
    return true;
  }

  function setSchemeAttribute(scheme) {
    if (!validScheme(scheme)) return false;
    document.documentElement.setAttribute("data-theme", scheme);
    return true;
  }

  function optionHasValue(select, value) {
    for (var i = 0; i < select.options.length; i++) {
      if (select.options[i].value === value) return true;
    }
    return false;
  }

  function syncControls() {
    all("[data-theme-select]").forEach(function (select) {
      if (optionHasValue(select, state.theme)) select.value = state.theme;
    });
    all("[data-scheme-select]").forEach(function (select) {
      if (optionHasValue(select, state.scheme)) select.value = state.scheme;
    });
    all("[data-theme-pick]").forEach(function (button) {
      button.setAttribute(
        "aria-pressed",
        button.getAttribute("data-theme-pick") === state.theme ? "true" : "false",
      );
    });
    all("[data-scheme-pick]").forEach(function (button) {
      button.setAttribute(
        "aria-pressed",
        button.getAttribute("data-scheme-pick") === state.scheme ? "true" : "false",
      );
    });

    var status = document.getElementById("appearance-status");
    if (status) status.textContent = state.theme + " theme · " + state.scheme + " scheme";
  }

  function appearanceEvent() {
    var event;
    try {
      event = new CustomEvent("faqir:appearance", {
        detail: { theme: state.theme, scheme: state.scheme },
      });
    } catch (_) {
      event = document.createEvent("Event");
      event.initEvent("faqir:appearance", false, false);
      event.detail = { theme: state.theme, scheme: state.scheme };
    }
    window.dispatchEvent(event);
  }

  function broadcastAppearance() {
    all("iframe[data-component-frame]").forEach(function (frame) {
      if (!frame.contentWindow) return;
      frame.contentWindow.postMessage(
        { faqir: "appearance", theme: state.theme, scheme: state.scheme },
        "*",
      );
    });
    all("iframe[data-theme-frame]").forEach(function (frame) {
      if (!frame.contentWindow) return;
      // Each gallery frame keeps its own theme; only the scheme is shared.
      frame.contentWindow.postMessage(
        { faqir: "theme-preview", scheme: state.scheme },
        "*",
      );
    });
  }

  function applyTheme(name, persist) {
    if (!setThemeLink(name)) return false;
    state.theme = name;
    if (persist) writeStored(THEME_KEY, name);
    syncControls();
    broadcastAppearance();
    appearanceEvent();
    return true;
  }

  function applyScheme(scheme, persist) {
    if (!setSchemeAttribute(scheme)) return false;
    state.scheme = scheme;
    if (persist) writeStored(SCHEME_KEY, scheme);
    syncControls();
    broadcastAppearance();
    appearanceEvent();
    return true;
  }

  function themeScheme(name) {
    var controls = all("[data-theme-select] option, [data-theme-pick]");
    for (var i = 0; i < controls.length; i++) {
      var controlName =
        controls[i].value || controls[i].getAttribute("data-theme-pick") || "";
      if (controlName === name) {
        return controls[i].getAttribute("data-theme-scheme") || "both";
      }
    }
    return "both";
  }

  function chooseTheme(name) {
    if (!applyTheme(name, true)) return;
    if (themeScheme(name) === "light" && state.scheme === "dark") {
      applyScheme("light", true);
    }
  }

  // ── frame role ────────────────────────────────────────────────────────────

  function startFrame() {
    window.addEventListener("message", function (event) {
      var data = event.data;
      if (!data || typeof data !== "object") return;

      if (data.faqir === "theme-preview") {
        if (data.scheme) setSchemeAttribute(data.scheme);
        return;
      }

      if (data.faqir === "appearance") {
        if (data.theme) setThemeLink(data.theme);
        if (data.scheme) setSchemeAttribute(data.scheme);
      }
    });
  }

  // ── mobile navigation ─────────────────────────────────────────────────────

  function startMobileNavigation() {
    var toggle = document.querySelector("[data-docs-sidebar-toggle]");
    var sidebar = document.getElementById("docs-sidebar");
    if (!toggle || !sidebar) return;

    function isSmall() {
      return !window.matchMedia || window.matchMedia("(max-width: 48rem)").matches;
    }

    function setOpen(open) {
      if (open) sidebar.setAttribute("data-state", "expanded");
      else sidebar.removeAttribute("data-state");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    }

    toggle.addEventListener("click", function (event) {
      event.stopPropagation();
      setOpen(sidebar.getAttribute("data-state") !== "expanded");
    });

    sidebar.addEventListener("click", function (event) {
      var target = event.target;
      if (isSmall() && target && target.closest && target.closest("a[href]")) setOpen(false);
    });

    document.addEventListener("click", function (event) {
      if (!isSmall() || sidebar.getAttribute("data-state") !== "expanded") return;
      if (sidebar.contains(event.target) || toggle.contains(event.target)) return;
      setOpen(false);
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && sidebar.getAttribute("data-state") === "expanded") {
        setOpen(false);
        toggle.focus();
      }
    });

    window.addEventListener("resize", function () {
      if (!isSmall()) setOpen(false);
    });
  }

  // ── filters ───────────────────────────────────────────────────────────────

  function startSidebarFilter() {
    var input = document.querySelector("[data-docs-nav-filter]");
    if (!input) return;
    var groups = all("[data-docs-nav-group]");
    var initial = groups.map(function (group) {
      return group.open;
    });

    input.addEventListener("input", function () {
      var query = input.value.trim().toLowerCase();
      groups.forEach(function (group, index) {
        var matches = 0;
        all("[data-part='nav-item']", group).forEach(function (link) {
          var visible = !query || (link.textContent || "").toLowerCase().indexOf(query) !== -1;
          link.hidden = !visible;
          if (visible) matches++;
        });
        group.hidden = matches === 0;
        group.open = query ? matches > 0 : initial[index];
      });
    });
  }

  function startComponentFilter() {
    var search = document.querySelector("[data-component-search]");
    var layer = document.querySelector("[data-component-layer-filter]");
    var category = document.querySelector("[data-component-category-filter]");
    var cards = all("[data-component-card]");
    var groups = all("[data-component-group]");
    var count = document.getElementById("component-result-count");
    var empty = document.querySelector("[data-component-empty]");
    if (!search || cards.length === 0) return;

    function run() {
      var query = search.value.trim().toLowerCase();
      var layerValue = layer ? layer.value : "";
      var categoryValue = category ? category.value : "";
      var visible = 0;

      cards.forEach(function (card) {
        var matchesText =
          !query ||
          (card.getAttribute("data-component-text") || "").toLowerCase().indexOf(query) !== -1;
        var matchesLayer =
          !layerValue || card.getAttribute("data-component-layer") === layerValue;
        var matchesCategory =
          !categoryValue || card.getAttribute("data-component-category") === categoryValue;
        var show = matchesText && matchesLayer && matchesCategory;
        card.hidden = !show;
        if (show) visible++;
      });

      groups.forEach(function (group) {
        group.hidden = all("[data-component-card]", group).every(function (card) {
          return card.hidden;
        });
      });

      if (count) count.textContent = visible + " of " + cards.length + " components";
      if (empty) empty.hidden = visible !== 0;
    }

    search.addEventListener("input", run);
    if (layer) layer.addEventListener("change", run);
    if (category) category.addEventListener("change", run);
    run();
  }

  // ── component preview widths ──────────────────────────────────────────────

  function startPreviewControls() {
    all("[data-preview-size]").forEach(function (button) {
      button.addEventListener("click", function () {
        var id = button.getAttribute("data-preview-target");
        var frame = id ? document.getElementById(id) : null;
        if (!frame) return;
        var width = button.getAttribute("data-preview-width") || "100%";
        frame.style.inlineSize = width;
        frame.setAttribute("data-preview-size", button.getAttribute("data-preview-size") || "");

        all('[data-preview-target="' + id + '"]').forEach(function (peer) {
          peer.setAttribute("aria-pressed", peer === button ? "true" : "false");
        });
      });
    });
  }

  // ── host role ─────────────────────────────────────────────────────────────

  function startHost() {
    var link = themeLink();
    state.theme = link ? link.getAttribute("data-theme-name") || "" : "";
    state.scheme = document.documentElement.getAttribute("data-theme") || "auto";

    var storedTheme = readStored(THEME_KEY);
    var storedScheme = readStored(SCHEME_KEY);
    if (validTheme(storedTheme)) applyTheme(storedTheme, false);
    if (validScheme(storedScheme)) applyScheme(storedScheme, false);
    syncControls();

    all("[data-theme-select]").forEach(function (select) {
      select.addEventListener("change", function () {
        chooseTheme(select.value);
      });
    });
    all("[data-scheme-select]").forEach(function (select) {
      select.addEventListener("change", function () {
        applyScheme(select.value, true);
      });
    });
    all("[data-theme-pick]").forEach(function (button) {
      button.addEventListener("click", function () {
        chooseTheme(button.getAttribute("data-theme-pick") || "");
      });
    });
    all("[data-scheme-pick]").forEach(function (button) {
      button.addEventListener("click", function () {
        applyScheme(button.getAttribute("data-scheme-pick") || "", true);
      });
    });

    all("iframe[data-component-frame], iframe[data-theme-frame]").forEach(function (frame) {
      frame.addEventListener("load", broadcastAppearance);
    });

    startMobileNavigation();
    startSidebarFilter();
    startComponentFilter();
    startPreviewControls();
    broadcastAppearance();

    window.FaqirGallery = {
      theme: function () {
        return state.theme;
      },
      scheme: function () {
        return state.scheme;
      },
      applyTheme: chooseTheme,
      applyScheme: function (scheme) {
        applyScheme(scheme, true);
      },
      broadcast: broadcastAppearance,
    };
  }

  function start() {
    var role = document.documentElement.getAttribute("data-preview-role");
    if (window.self !== window.top || role === "theme") startFrame();
    else startHost();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
