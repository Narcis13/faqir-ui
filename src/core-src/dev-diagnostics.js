// @ui:core dev-diagnostics
// @faqir:dev-only

/**
 * Development-build diagnostics for the Faqir engine.  [task 0.7-12 · §A6]
 *
 * This file is injected into `registry/core/faqir-core.dev.js` at the engine's
 * `// @faqir:dev-diagnostics` marker and is NEVER part of the production
 * `registry/core/faqir-core.js` — the marker line is simply dropped there. That
 * is what keeps the shipped engine byte-free of every message below.
 *
 * It is not a standalone module: it runs inside the engine's UMD closure, where
 * `devHooks`, `devtools` and `describeElement` already exist. Assigning
 * `devHooks` is what arms the guarded call sites in the engine — until then
 * every one of them is a dead `if (devHooks)`.
 *
 * Four warning classes, all routed through `devReport` so each is both printed
 * once and retained for `window.__FAQIR_DEVTOOLS__.warnings()`:
 *
 *   expression   — an l-* expression threw; prints the offending element's
 *                  outerHTML so the failure is locatable in a big page.
 *   directive    — `l-something` nobody registered (typo, or a plugin that was
 *                  never loaded).
 *   reorder      — an unkeyed l-for list was reordered.
 *   html         — `l-html` writes unsanitized markup, once per element.
 *
 * Repeats are collapsed by a dedupe token so a diagnostic inside an effect that
 * re-runs 500 times still prints once.
 */

// Retained diagnostics, oldest first. Capped so a pathological page cannot grow
// the log without bound; the counter keeps the true total honest.
var DEV_LOG_LIMIT = 200;
var devLog = [];
var devLogDropped = 0;
var devSeen = new Set();

// outerHTML is the whole point of the dev build ("which element?"), but a
// container's outerHTML can be the entire page. Head + tail keeps the opening
// tag (the identifying part) and stays readable in a console.
var DEV_HTML_LIMIT = 400;

function devSnippet(el) {
  if (!el || !el.outerHTML) return '(no element)';
  var html = el.outerHTML;
  if (html.length <= DEV_HTML_LIMIT) return html;
  return html.slice(0, DEV_HTML_LIMIT - 40) + ' … ' + html.slice(-30);
}

/** Record + print one diagnostic. `token` collapses repeats; null never dedupes. */
function devReport(kind, token, message, el, extra) {
  if (token !== null) {
    if (devSeen.has(token)) return false;
    devSeen.add(token);
  }

  var entry = {
    kind: kind,
    message: message,
    element: describeElement(el),
    html: devSnippet(el)
  };
  if (extra) {
    var keys = Object.keys(extra);
    for (var i = 0; i < keys.length; i++) entry[keys[i]] = extra[keys[i]];
  }

  if (devLog.length >= DEV_LOG_LIMIT) {
    devLog.shift();
    devLogDropped++;
  }
  devLog.push(entry);

  console.warn('[Faqir dev] ' + message + '\n  at ' + entry.element + '\n  ' + entry.html);
  return true;
}

devtools.dev = true;

devHooks = {
  /** Every diagnostic recorded so far, oldest first (copy — safe to mutate). */
  warnings: function() { return devLog.slice(); },

  /** How many entries fell off the front of the capped log. */
  dropped: function() { return devLogDropped; },

  /** Forget everything, including the dedupe memory. Used by the overlay + tests. */
  clear: function() {
    devLog.length = 0;
    devLogDropped = 0;
    devSeen.clear();
  },

  /**
   * An `l-*` expression threw. `kind` is 'expression' (a read) or 'statement'
   * (an assignment/handler body). Not deduped: the same expression can fail for
   * different reasons, and the error is the payload.
   */
  expressionError: function(kind, expression, el, error) {
    devReport(
      'expression',
      null,
      (kind === 'statement' ? 'Statement' : 'Expression') +
        ' error in "' + expression + '": ' + (error && error.message ? error.message : String(error)),
      el,
      { expression: expression, error: String(error && error.stack ? error.stack : error) }
    );
  },

  /**
   * An `l-`/`:`/`@` attribute whose type matches no built-in and no registered
   * custom directive — silently inert in production. Once per element+attribute.
   */
  unknownDirective: function(el, dir) {
    devReport(
      'directive',
      'directive:' + dir.raw + ':' + describeElement(el),
      'Unknown directive "' + dir.raw + '" — no built-in handler and no plugin ' +
        'registered Faqir.directive("' + dir.type + '", …). It does nothing.',
      el,
      { directive: dir.raw, expression: dir.expression }
    );
  },

  /** An unkeyed `l-for` list was reordered. Once per list. */
  unkeyedReorder: function(el, expression) {
    devReport(
      'reorder',
      null,
      'l-for reordered without l-key — DOM state (focus, selection, input) is ' +
        'bound to position, not identity. Add l-key="…" so nodes follow their ' +
        'items across reorders.',
      el,
      { expression: expression }
    );
  },

  /** `l-html` assigns unsanitized markup. Once per element. */
  htmlNotice: function(el, expression) {
    devReport(
      'html',
      'html:' + expression + ':' + describeElement(el),
      'l-html="' + expression + '" writes unsanitized HTML. Faqir never ' +
        'sanitizes it — bind only markup you generated. Use l-text for values ' +
        'that came from a user or an API.',
      el,
      { expression: expression }
    );
  }
};
