/**
 * The `faqir dev` inspector overlay.  [task 0.7-12 · §A6]
 *
 * The overlay is a classic script that `faqir dev` injects into every HTML
 * response it serves. It deliberately lives HERE, as a string bundled into the
 * CLI, and not in `registry/` — the registry is what `faqir init` copies into a
 * user's project, and the overlay must never end up in a user's bundle. The
 * only way to get it is to be served by `faqir dev`.
 *
 * It reads `window.__FAQIR_DEVTOOLS__` (installed by both engine builds) and
 * renders scopes, components and dev-build diagnostics into a shadow root, so
 * the host page's CSS can neither style it nor be styled by it.
 *
 * The source below is plain ES5-ish JavaScript with no template literals, so it
 * survives being embedded in a TypeScript template string unescaped.
 */

/** Where `faqir dev` serves the overlay script from. */
export const OVERLAY_ROUTE = "/__faqir/devtools.js";

/** The keyboard shortcut that toggles the panel (documented in `faqir dev --help`). */
export const OVERLAY_SHORTCUT = "Ctrl/Cmd + Shift + F";

/** The tag `faqir dev` injects. The data attribute is the marker tests assert on. */
export const OVERLAY_SCRIPT_TAG =
  '<script src="' + OVERLAY_ROUTE + '" data-faqir-dev-overlay defer></script>';

/**
 * Insert the overlay script tag into one HTML document.
 *
 * Injected before `</body>` when there is one, else before `</html>`, else
 * appended — a fragment served by a dev server is still valid input. Idempotent:
 * a document that already carries the marker is returned untouched.
 */
export function injectOverlay(html: string): string {
  if (html.includes("data-faqir-dev-overlay")) return html;

  const tag = "\n" + OVERLAY_SCRIPT_TAG + "\n";
  for (const close of ["</body>", "</html>"]) {
    const at = html.toLowerCase().lastIndexOf(close);
    if (at !== -1) return html.slice(0, at) + tag + html.slice(at);
  }
  return html + tag;
}

export const OVERLAY_SOURCE = String.raw`/* Faqir dev overlay — served by "faqir dev", never bundled into a project. */
(function () {
  'use strict';
  if (typeof window === 'undefined' || window.__FAQIR_OVERLAY__) return;

  var REFRESH_MS = 600;
  var open = false;
  var timer = null;
  var observer = null;
  var host = null;
  var shadow = null;

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function json(value) {
    try {
      var text = JSON.stringify(value, null, 2);
      return text === undefined ? String(value) : text;
    } catch (e) {
      return '(unserializable)';
    }
  }

  function devtools() {
    return window.__FAQIR_DEVTOOLS__ || null;
  }

  var STYLE = [
    ':host { all: initial; }',
    '.panel { position: fixed; right: 12px; bottom: 12px; z-index: 2147483647;',
    '  width: 380px; max-width: calc(100vw - 24px); max-height: 70vh; overflow: auto;',
    '  background: #101215; color: #e6e8eb; border: 1px solid #2c3138; border-radius: 8px;',
    '  box-shadow: 0 12px 32px rgba(0,0,0,.45); font: 12px/1.5 ui-monospace, SFMono-Regular,',
    '  Menlo, Consolas, monospace; }',
    '.head { display: flex; align-items: baseline; gap: 8px; padding: 8px 10px;',
    '  border-bottom: 1px solid #2c3138; position: sticky; top: 0; background: #161a1f; }',
    '.title { font-weight: 700; letter-spacing: .04em; }',
    '.badge { border: 1px solid #2c3138; border-radius: 999px; padding: 0 6px; color: #9aa4b2; }',
    '.hint { margin-left: auto; color: #6f7885; }',
    'section { padding: 8px 10px; border-bottom: 1px solid #1d2126; }',
    'h2 { margin: 0 0 6px; font-size: 11px; text-transform: uppercase; letter-spacing: .08em;',
    '  color: #8b95a3; font-weight: 700; }',
    '.row { padding: 4px 0; border-top: 1px dotted #23282f; }',
    '.row:first-of-type { border-top: 0; }',
    '.label { color: #79c0ff; }',
    '.attr { color: #a5d6a7; }',
    '.muted { color: #6f7885; }',
    '.warn { color: #ffb86b; }',
    'pre { margin: 2px 0 0; white-space: pre-wrap; word-break: break-word; color: #c9d1d9; }',
  ].join('\n');

  function renderScopes(tools) {
    var scopes = tools.scopes();
    if (!scopes.length) return '<p class="muted">No scopes on this page.</p>';
    return scopes.map(function (s) {
      return '<div class="row"><span class="label">' + esc(s.label) + '</span> ' +
        '<span class="muted">#' + esc(s.id) + '</span>' +
        '<pre>' + esc(json(s.scope)) + '</pre></div>';
    }).join('');
  }

  function renderComponents(tools) {
    var list = tools.components();
    if (!list.length) return '<p class="muted">No [data-ui] components on this page.</p>';
    return list.map(function (c) {
      var attrs = '';
      if (c.variant) attrs += ' <span class="attr">variant=' + esc(c.variant) + '</span>';
      if (c.size) attrs += ' <span class="attr">size=' + esc(c.size) + '</span>';
      if (c.state) attrs += ' <span class="attr">state=' + esc(c.state) + '</span>';
      if (c.controller) attrs += ' <span class="muted">[controller]</span>';
      return '<div class="row"><span class="label">' + esc(c.ui) + '</span>' + attrs +
        (c.parts.length ? '<div class="muted">parts: ' + esc(c.parts.join(', ')) + '</div>' : '') +
        '</div>';
    }).join('');
  }

  function renderWarnings(tools) {
    var warnings = tools.warnings();
    if (!warnings.length) {
      return tools.dev
        ? '<p class="muted">No diagnostics recorded.</p>'
        : '<p class="muted">Production engine — load core/faqir-core.dev.js for diagnostics.</p>';
    }
    return warnings.map(function (w) {
      return '<div class="row"><span class="warn">' + esc(w.kind) + '</span> ' +
        esc(w.message) + '<div class="muted">' + esc(w.element) + '</div></div>';
    }).join('');
  }

  function render() {
    if (!shadow) return;
    var tools = devtools();
    if (!tools) {
      shadow.innerHTML = '<style>' + STYLE + '</style><div class="panel"><div class="head">' +
        '<span class="title">FAQIR</span><span class="muted">not detected on this page</span>' +
        '</div></div>';
      return;
    }
    var scopeCount = tools.scopes().length;
    var componentCount = tools.components().length;
    shadow.innerHTML = '<style>' + STYLE + '</style>' +
      '<div class="panel" role="region" aria-label="Faqir inspector">' +
      '<div class="head"><span class="title">FAQIR</span>' +
      '<span class="badge">' + (tools.dev ? 'dev build' : 'production build') + '</span>' +
      '<span class="hint">Ctrl/Cmd+Shift+F</span></div>' +
      '<section><h2>Scopes (' + scopeCount + ')</h2>' + renderScopes(tools) + '</section>' +
      '<section><h2>Components (' + componentCount + ')</h2>' + renderComponents(tools) + '</section>' +
      '<section><h2>Diagnostics</h2>' + renderWarnings(tools) + '</section>' +
      '</div>';
  }

  function mount() {
    if (host) return;
    host = document.createElement('div');
    host.id = 'faqir-devtools-overlay';
    host.setAttribute('data-faqir-dev-overlay', '');
    shadow = host.attachShadow ? host.attachShadow({ mode: 'open' }) : null;
    if (!shadow) return;
    document.body.appendChild(host);
  }

  function startLive() {
    stopLive();
    timer = setInterval(render, REFRESH_MS);
    if (typeof MutationObserver === 'function') {
      observer = new MutationObserver(render);
      observer.observe(document.documentElement, {
        subtree: true, childList: true,
        attributes: true, attributeFilter: ['data-state', 'data-variant', 'data-size'],
      });
    }
  }

  function stopLive() {
    if (timer) { clearInterval(timer); timer = null; }
    if (observer) { observer.disconnect(); observer = null; }
  }

  function show() {
    mount();
    if (!host) return;
    open = true;
    host.style.display = '';
    render();
    startLive();
  }

  function hide() {
    open = false;
    stopLive();
    if (host) host.style.display = 'none';
  }

  function toggle() {
    if (open) hide(); else show();
  }

  function isToggleKey(e) {
    return e.shiftKey && (e.ctrlKey || e.metaKey) && (e.key === 'F' || e.key === 'f');
  }

  document.addEventListener('keydown', function (e) {
    if (isToggleKey(e)) {
      e.preventDefault();
      toggle();
      return;
    }
    if (open && e.key === 'Escape') hide();
  });

  window.__FAQIR_OVERLAY__ = {
    version: 1,
    toggle: toggle,
    show: show,
    hide: hide,
    render: render,
    isOpen: function () { return open; },
    host: function () { return host; },
  };
})();
`;
