// ============================================================================
// registry/core/faqir-core.js
//
// GENERATED FILE — DO NOT EDIT BY HAND.
// Assembled by scripts/build-core.mjs (task 0.3-03) from:
//   engine:      src/core-src/engine.js
//   controllers: 21 recipe factories → accordion, alert-dialog, calendar, combobox, command-palette, date-picker, dialog, drawer, dropdown, input-otp, pagination, popover, qr-code, select-custom, sheet, sidebar, slider, table, tabs, toast, tooltip
// Regenerate with: bun run build:core
// Package version: 0.2.4
// ============================================================================

/**
 * Faqir Core v0.1.0
 * Alpine-style reactivity for the Faqir UI component system.
 * Zero dependencies. CDN-ready. Agent-native.
 *
 * Usage:
 *   <script src="faqir-core.js"></script>
 *   — or —
 *   <script src="faqir-core.js" type="module"></script>
 *   — or —
 *   import Faqir from './faqir-core.js'
 */
(function(global, factory) {
  if (typeof exports === 'object' && typeof module !== 'undefined') {
    module.exports = factory();
  } else if (typeof define === 'function' && define.amd) {
    define(factory);
  } else {
    var Faqir = factory();
    global.Faqir = Faqir;
    if (typeof globalThis !== 'undefined') globalThis.Faqir = Faqir;
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this, function() {
  'use strict';

  // ═══════════════════════════════════════════════════════
  // Section 1: Reactive Engine
  // ═══════════════════════════════════════════════════════

  let currentEffect = null;
  const effectStack = [];
  let batchDepth = 0;
  const pendingEffects = new Set();
  let flushScheduled = false;

  const reactiveMap = new WeakMap();
  const ARRAY_MUTATORS = new Set(['push', 'pop', 'splice', 'shift', 'unshift', 'sort', 'reverse']);

  function reactive(obj) {
    if (obj.__isReactive) return obj;
    if (reactiveMap.has(obj)) return reactiveMap.get(obj);

    const deps = Object.create(null);

    const proxy = new Proxy(obj, {
      get(target, key, receiver) {
        if (key === '__isReactive') return true;
        if (key === '__deps') return deps;
        if (key === '__target') return target;

        if (currentEffect && typeof key === 'string') {
          if (!deps[key]) deps[key] = new Set();
          deps[key].add(currentEffect);
          currentEffect._deps.add(deps[key]);
        }

        const value = Reflect.get(target, key, receiver);

        // Intercept array mutation methods to trigger 'length' deps,
        // since internal length updates bypass the setter's change check.
        if (Array.isArray(target) && typeof value === 'function' && ARRAY_MUTATORS.has(key)) {
          return function() {
            const result = value.apply(target, arguments);
            if (deps['length']) {
              for (const eff of deps['length']) {
                pendingEffects.add(eff);
              }
              scheduleFlush();
            }
            return result;
          };
        }

        // Deep reactivity: wrap nested arrays and plain objects so that
        // mutations like array.push() / array.splice() trigger effects.
        if (value !== null && typeof value === 'object'
            && !value.__isReactive
            && (Array.isArray(value) || Object.getPrototypeOf(value) === Object.prototype)) {
          return reactive(value);
        }

        return value;
      },

      set(target, key, value, receiver) {
        const oldValue = target[key];
        const result = Reflect.set(target, key, value, receiver);

        if (oldValue !== value && deps[key]) {
          for (const eff of deps[key]) {
            pendingEffects.add(eff);
          }
          scheduleFlush();
        }

        return result;
      }
    });

    reactiveMap.set(obj, proxy);
    return proxy;
  }

  function effect(fn) {
    const execute = () => {
      cleanup(execute);

      currentEffect = execute;
      effectStack.push(execute);

      try {
        fn();
      } finally {
        effectStack.pop();
        currentEffect = effectStack[effectStack.length - 1] || null;
      }
    };

    execute._deps = new Set();
    execute();

    return () => cleanup(execute);
  }

  function cleanup(execute) {
    for (const depSet of execute._deps) {
      depSet.delete(execute);
    }
    execute._deps.clear();
  }

  function scheduleFlush() {
    if (batchDepth > 0) return;
    if (flushScheduled) return;
    flushScheduled = true;
    queueMicrotask(flushEffects);
  }

  function flushEffects() {
    flushScheduled = false;
    var iterations = 0;
    while (pendingEffects.size > 0) {
      if (++iterations > 100) {
        pendingEffects.clear();
        break;
      }
      var effects = [...pendingEffects];
      pendingEffects.clear();
      for (var i = 0; i < effects.length; i++) {
        try {
          effects[i]();
        } catch (e) {
          console.warn('[Faqir] Effect error:', e);
        }
      }
    }
  }

  function batch(fn) {
    batchDepth++;
    try {
      fn();
    } finally {
      batchDepth--;
      if (batchDepth === 0) {
        flushEffects();
      }
    }
  }

  function untrack(fn) {
    const prev = currentEffect;
    currentEffect = null;
    try {
      return fn();
    } finally {
      currentEffect = prev;
    }
  }

  // ═══════════════════════════════════════════════════════
  // Section 2: Expression Evaluator
  // ═══════════════════════════════════════════════════════

  const expressionCache = new Map();

  function evaluate(expression, scope, el) {
    try {
      const fn = compileExpression(expression);
      return fn.call(scope, scope, el);
    } catch (e) {
      console.warn('[Faqir] Expression error: "' + expression + '"', e);
      return undefined;
    }
  }

  function evaluateAssignment(expression, scope, el) {
    try {
      const fn = compileStatement(expression);
      fn.call(scope, scope, el);
    } catch (e) {
      console.warn('[Faqir] Statement error: "' + expression + '"', e);
    }
  }

  function compileExpression(expr) {
    var key = 'expr:' + expr;
    if (expressionCache.has(key)) return expressionCache.get(key);

    var fn = new Function(
      '$scope', '$el',
      'with($scope) { return (' + expr + ') }'
    );
    expressionCache.set(key, fn);
    return fn;
  }

  function compileStatement(expr) {
    var key = 'stmt:' + expr;
    if (expressionCache.has(key)) return expressionCache.get(key);

    var fn = new Function(
      '$scope', '$el',
      'with($scope) { ' + expr + ' }'
    );
    expressionCache.set(key, fn);
    return fn;
  }

  // ═══════════════════════════════════════════════════════
  // Section 3: Directive System
  // ═══════════════════════════════════════════════════════

  // --- Shared state ---
  var scopeCounter = 0;
  var dataRegistry = new Map();
  var customDirectives = new Map();
  var globalStores = {};

  // --- 3.1 Attribute Parsing ---

  function parseDirectives(el) {
    var directives = [];

    for (var i = 0; i < el.attributes.length; i++) {
      var attr = el.attributes[i];
      var name = attr.name;
      var directive = null;

      if (name.startsWith('l-')) {
        if (name.startsWith('l-bind:')) {
          var rest = name.slice(7);
          var parts = rest.split('.');
          directive = {
            type: 'bind',
            arg: parts[0],
            expression: attr.value,
            modifiers: parts.slice(1),
            raw: name
          };
        } else if (name.startsWith('l-on:')) {
          var rest = name.slice(5);
          var parts = rest.split('.');
          directive = {
            type: 'on',
            arg: parts[0],
            expression: attr.value,
            modifiers: parts.slice(1),
            raw: name
          };
        } else if (name.startsWith('l-source:')) {
          var rest = name.slice(9);
          var parts = rest.split('.');
          directive = {
            type: 'source',
            arg: parts[0],
            expression: attr.value,
            modifiers: parts.slice(1),
            raw: name
          };
        } else {
          var rest = name.slice(2);
          var parts = rest.split('.');
          directive = {
            type: parts[0],
            expression: attr.value,
            modifiers: parts.slice(1),
            raw: name
          };
        }
      } else if (name.startsWith(':')) {
        var rest = name.slice(1);
        var parts = rest.split('.');
        directive = {
          type: 'bind',
          arg: parts[0],
          expression: attr.value,
          modifiers: parts.slice(1),
          raw: name
        };
      } else if (name.startsWith('@')) {
        var rest = name.slice(1);
        var parts = rest.split('.');
        directive = {
          type: 'on',
          arg: parts[0],
          expression: attr.value,
          modifiers: parts.slice(1),
          raw: name
        };
      }

      if (directive) directives.push(directive);
    }

    return directives;
  }

  // --- 3.2 Directive Priority ---

  var PRIORITY = {
    'data': 1,
    'source': 1,
    'for': 2,
    'if': 3,
    'bind': 10,
    'on': 10,
    'text': 10,
    'html': 10,
    'model': 10,
    'show': 10,
    'transition': 10,
    'ref': 10,
    'init': 20,
    'effect': 20,
    'cloak': 100,
    'teleport': 100
  };

  // --- 3.3 DOM Tree Walker ---

  function initTree(root, parentScope) {
    var scope = initScope(root, parentScope);
    walkChildren(root, scope);
  }

  function walkChildren(el, scope) {
    var children = [].slice.call(el.children);
    for (var i = 0; i < children.length; i++) {
      var child = children[i];

      // Skip elements already initialized by l-for or l-if
      if (child.__faqirScope && !child.hasAttribute('l-data')) {
        continue;
      }

      // Only l-data creates a new scope boundary.
      // data-ui elements inherit the parent scope so directives
      // inside Faqir components can access the enclosing reactive data.
      if (child.hasAttribute('l-data')) {
        initTree(child, scope);
        continue;
      }

      processElement(child, scope);
      // Skip walkChildren if structural directive (l-if/l-for) removed the element
      if (child.parentNode) {
        walkChildren(child, scope);
      }
    }
  }

  function processElement(el, scope) {
    var directives = parseDirectives(el);
    if (directives.length === 0) return;

    directives.sort(function(a, b) {
      return (PRIORITY[a.type] || 10) - (PRIORITY[b.type] || 10);
    });

    // Structural directives take over the element
    for (var i = 0; i < directives.length; i++) {
      if (directives[i].type === 'if') {
        handleIf(el, directives[i], scope);
        return;
      }
      if (directives[i].type === 'for') {
        handleFor(el, directives[i], scope);
        return;
      }
    }

    for (var i = 0; i < directives.length; i++) {
      applyDirective(el, directives[i], scope);
    }
  }

  // --- 3.4 l-data / Scope Initialization ---

  function initScope(root, parentScope) {
    var expr = root.getAttribute('l-data');
    var userData = {};

    if (expr) {
      if (dataRegistry.has(expr)) {
        userData = dataRegistry.get(expr)();
      } else if (expr.trim()) {
        userData = evaluate(expr, parentScope || {}, root) || {};
      }
    }

    var propData = readProps(root);
    Object.assign(userData, propData);

    var scopeId = ++scopeCounter;
    var scope = createScopeWithMagics(userData, root, root);
    root.__faqirScope = scope;
    root.__scopeId = scopeId;
    root.__faqirCleanups = [];

    // Set up bidirectional bridge for $state/$variant
    setupStateBridge(root, scope);

    // Process l-source directives (inject data + controller into scope)
    processSourceDirectives(root, scope);

    var initExpr = root.getAttribute('l-init');
    if (initExpr) {
      evaluateAssignment(initExpr, scope, root);
    }

    return scope;
  }

  function readProps(el) {
    var props = {};
    for (var i = 0; i < el.attributes.length; i++) {
      var attr = el.attributes[i];
      if (attr.name.startsWith('data-prop-')) {
        var key = attr.name.slice(10).replace(/-([a-z])/g, function(_, c) { return c.toUpperCase(); });
        try {
          props[key] = JSON.parse(attr.value);
        } catch (e) {
          props[key] = attr.value;
        }
      }
    }
    return props;
  }

  function createScopeWithMagics(data, el, root) {
    var magics = Object.create(null);

    Object.defineProperties(magics, {
      $el: { get: function() { return el; }, enumerable: false },
      $refs: { get: function() { return getScopeRefs(root); }, enumerable: false },
      $store: { get: function() { return globalStores; }, enumerable: false },
      $state: {
        get: function() { return closestUI(el) ? closestUI(el).dataset.state : undefined; },
        set: function(v) { var ui = closestUI(el); if (ui) ui.dataset.state = v; },
        enumerable: false
      },
      $variant: {
        get: function() { return closestUI(el) ? closestUI(el).dataset.variant : undefined; },
        set: function(v) { var ui = closestUI(el); if (ui) ui.dataset.variant = v; },
        enumerable: false
      },
      $ui: { get: function() { return getControllerApi(closestUI(el)); }, enumerable: false },
      $dispatch: {
        value: function(event, detail) {
          return el.dispatchEvent(
            new CustomEvent(event, { detail: detail, bubbles: true, composed: true })
          );
        },
        enumerable: false
      },
      $nextTick: {
        value: function(fn) { return queueMicrotask(fn || function() {}); },
        enumerable: false
      },
      $watch: {
        value: function(key, cb) { return watchProperty(scope, key, cb); },
        enumerable: false
      },
      $id: {
        value: function(name) { return 'faqir-' + root.__scopeId + '-' + name; },
        enumerable: false
      }
    });

    // Use defineProperties instead of Object.assign to preserve getters/setters
    // (Object.assign invokes getters and copies the result as a static value).
    var target = Object.create(magics);
    var descriptors = Object.getOwnPropertyDescriptors(data);
    Object.defineProperties(target, descriptors);

    var scope = reactive(target);
    return scope;
  }

  function watchProperty(scope, key, cb) {
    var oldValue = scope[key];
    var dispose = effect(function() {
      var newValue = scope[key];
      if (newValue !== oldValue) {
        var prev = oldValue;
        oldValue = newValue;
        cb(newValue, prev);
      }
    });
    return dispose;
  }

  // --- Scope utilities ---

  function getScopeRefs(root) {
    return root.__faqirRefs || {};
  }

  function findScopeRoot(el) {
    var node = el;
    while (node) {
      if (node.__faqirScope) return node;
      node = node.parentElement;
    }
    return el;
  }

  function addCleanup(el, cleanupFn) {
    var root = findScopeRoot(el);
    if (root && root.__faqirCleanups) {
      root.__faqirCleanups.push(cleanupFn);
    }
  }

  function destroyScope(el) {
    if (el.__faqirCleanups) {
      for (var i = 0; i < el.__faqirCleanups.length; i++) {
        el.__faqirCleanups[i]();
      }
      el.__faqirCleanups = [];
    }
    var children = el.querySelectorAll ? el.querySelectorAll('*') : [];
    for (var i = 0; i < children.length; i++) {
      if (children[i].__faqirCleanups) {
        for (var j = 0; j < children[i].__faqirCleanups.length; j++) {
          children[i].__faqirCleanups[j]();
        }
        children[i].__faqirCleanups = [];
      }
    }
  }

  // --- 3.5 l-source Directive ---

  function processSourceDirectives(root, scope) {
    for (var i = 0; i < root.attributes.length; i++) {
      var attr = root.attributes[i];
      if (!attr.name.startsWith('l-source:')) continue;

      var rest = attr.name.slice(9);
      var parts = rest.split('.');
      var sourceName = parts[0];
      var modifiers = parts.slice(1);
      var endpoint = attr.value;

      var opts = parseSourceModifiers(modifiers);
      setupSource(scope, root, sourceName, endpoint, opts);
    }
  }

  function parseSourceModifiers(modifiers) {
    var opts = { lazy: false, optimistic: false, idKey: 'id', pollInterval: 0 };

    for (var i = 0; i < modifiers.length; i++) {
      var mod = modifiers[i];
      if (mod === 'lazy') {
        opts.lazy = true;
      } else if (mod === 'optimistic') {
        opts.optimistic = true;
      } else if (mod === 'poll') {
        // Next modifier may be the interval in ms
        var next = modifiers[i + 1];
        if (next && /^\d+$/.test(next)) {
          opts.pollInterval = parseInt(next, 10);
          i++; // skip the number
        } else {
          opts.pollInterval = 30000; // default 30s
        }
      } else if (mod === 'key') {
        // Next modifier is the key name
        var next = modifiers[i + 1];
        if (next && !/^\d+$/.test(next)) {
          opts.idKey = next;
          i++; // skip the key name
        }
      }
    }

    return opts;
  }

  function setupSource(scope, root, name, endpoint, opts) {
    var pollTimer = null;
    var idKey = opts.idKey;
    var isOptimistic = opts.optimistic;

    // ── 0.3-08 request lifecycle ────────────────────────────────────────────
    // `destroyed` is latched true when the owning scope is torn down (an l-if
    // toggle or keyed l-for removal runs the cleanup registered below). Once
    // latched it (a) blocks new requests from starting and (b) gates every
    // async write-back so a fetch that resolves into a dead scope is a no-op.
    // `inflight` holds the AbortController of every live request so teardown
    // can cancel the actual network work, not just ignore its result.
    // `loadSeq`/`currentLoadAc` sequence read requests: a newer load() aborts
    // the previous one and only the LATEST call is allowed to land — so a slow
    // stale response can no longer clobber a fresh one (D2).
    var destroyed = false;
    var inflight = new Set();
    var loadSeq = 0;
    var currentLoadAc = null;
    var HAS_ABORT = typeof AbortController !== 'undefined';

    function beginRequest() {
      var ac = HAS_ABORT ? new AbortController() : null;
      if (ac) inflight.add(ac);
      return ac;
    }
    function endRequest(ac) {
      if (ac) inflight.delete(ac);
    }
    function signalOf(ac) {
      return ac ? ac.signal : undefined;
    }

    // Inject reactive data properties into scope
    scope[name] = [];
    scope[name + 'Loading'] = false;
    scope[name + 'Error'] = null;

    // CRUD controller
    var ctrl = {
      load: function() {
        if (destroyed) return Promise.resolve();
        var mySeq = ++loadSeq;
        // Supersede the previous in-flight read: abort it so its network
        // request is cancelled; the seq guard below discards any late result.
        if (currentLoadAc) { try { currentLoadAc.abort(); } catch (e) {} }
        var ac = beginRequest();
        currentLoadAc = ac;
        scope[name + 'Loading'] = true;
        scope[name + 'Error'] = null;
        return fetch(endpoint, { signal: signalOf(ac) })
          .then(function(res) {
            if (!res.ok) throw new Error(res.status + ' ' + res.statusText);
            return res.json();
          })
          .then(function(data) {
            if (destroyed || mySeq !== loadSeq) return;
            scope[name] = Array.isArray(data) ? data : [data];
          })
          .catch(function(e) {
            if (destroyed || mySeq !== loadSeq) return;
            scope[name + 'Error'] = e.message;
          })
          .then(function() {
            endRequest(ac);
            if (currentLoadAc === ac) currentLoadAc = null;
            if (destroyed || mySeq !== loadSeq) return;
            scope[name + 'Loading'] = false;
          });
      },

      create: function(payload) {
        if (destroyed) return Promise.resolve(null);
        scope[name + 'Error'] = null;
        var tempIndex = -1;

        if (isOptimistic) {
          var temp = Object.assign({}, payload, { _pending: true });
          scope[name].push(temp);
          tempIndex = scope[name].length - 1;
        }

        var ac = beginRequest();
        return fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: signalOf(ac)
        })
        .then(function(res) {
          if (!res.ok) throw new Error(res.status + ' ' + res.statusText);
          return res.json();
        })
        .then(function(created) {
          endRequest(ac);
          if (destroyed) return null;
          if (isOptimistic && tempIndex >= 0) {
            scope[name][tempIndex] = created;
          } else {
            scope[name].push(created);
          }
          return created;
        })
        .catch(function(e) {
          endRequest(ac);
          if (destroyed) return null;
          scope[name + 'Error'] = e.message;
          if (isOptimistic && tempIndex >= 0) {
            scope[name].splice(tempIndex, 1);
          }
          return null;
        });
      },

      update: function(id, payload) {
        if (destroyed) return Promise.resolve(null);
        scope[name + 'Error'] = null;
        var items = scope[name];
        var idx = -1;
        for (var i = 0; i < items.length; i++) {
          if (items[i][idKey] === id) { idx = i; break; }
        }
        var snapshot = null;

        if (isOptimistic && idx >= 0) {
          snapshot = Object.assign({}, items[idx]);
          Object.assign(items[idx], payload);
        }

        var ac = beginRequest();
        return fetch(endpoint + '/' + id, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: signalOf(ac)
        })
        .then(function(res) {
          if (!res.ok) throw new Error(res.status + ' ' + res.statusText);
          return res.json();
        })
        .then(function(updated) {
          endRequest(ac);
          if (destroyed) return null;
          if (idx >= 0) scope[name][idx] = updated;
          return updated;
        })
        .catch(function(e) {
          endRequest(ac);
          if (destroyed) return null;
          scope[name + 'Error'] = e.message;
          if (isOptimistic && snapshot && idx >= 0) {
            scope[name][idx] = snapshot;
          }
          return null;
        });
      },

      remove: function(id) {
        if (destroyed) return Promise.resolve();
        scope[name + 'Error'] = null;
        var items = scope[name];
        var idx = -1;
        for (var i = 0; i < items.length; i++) {
          if (items[i][idKey] === id) { idx = i; break; }
        }
        var snapshot = null;

        if (isOptimistic && idx >= 0) {
          snapshot = items[idx];
          items.splice(idx, 1);
        }

        var ac = beginRequest();
        return fetch(endpoint + '/' + id, { method: 'DELETE', signal: signalOf(ac) })
        .then(function(res) {
          if (!res.ok) throw new Error(res.status + ' ' + res.statusText);
          endRequest(ac);
          if (destroyed) return;
          if (!isOptimistic && idx >= 0) {
            scope[name].splice(idx, 1);
          }
        })
        .catch(function(e) {
          endRequest(ac);
          if (destroyed) return;
          scope[name + 'Error'] = e.message;
          if (isOptimistic && snapshot) {
            scope[name].splice(idx, 0, snapshot);
          }
        });
      },

      refresh: function() { return ctrl.load(); },

      startPolling: function(interval) {
        ctrl.stopPolling();
        if (destroyed) return;
        var ms = interval || opts.pollInterval || 30000;
        pollTimer = setInterval(function() { ctrl.load(); }, ms);
      },

      stopPolling: function() {
        if (pollTimer) {
          clearInterval(pollTimer);
          pollTimer = null;
        }
      }
    };

    // Inject controller as $name
    scope['$' + name] = ctrl;

    // Auto-load unless .lazy
    if (!opts.lazy) {
      ctrl.load();
    }

    // Auto-poll if .poll modifier present
    if (opts.pollInterval > 0) {
      ctrl.startPolling();
    }

    // Teardown on scope destruction: stop polling, latch `destroyed` so no new
    // work starts or writes back, and abort every in-flight request — no fetch
    // or timer outlives the scope that owns it (D3).
    addCleanup(root, function() {
      destroyed = true;
      ctrl.stopPolling();
      inflight.forEach(function(ac) { try { ac.abort(); } catch (e) {} });
      inflight.clear();
    });
  }

  // --- 3.6 Directive Dispatch ---

  function applyDirective(el, dir, scope) {
    switch (dir.type) {
      case 'bind':       return handleBind(el, dir, scope);
      case 'on':         return handleOn(el, dir, scope);
      case 'text':       return handleText(el, dir, scope);
      case 'html':       return handleHtml(el, dir, scope);
      case 'model':      return handleModel(el, dir, scope);
      case 'show':       return handleShow(el, dir, scope);
      case 'ref':        return handleRef(el, dir, scope);
      case 'init':       return handleInit(el, dir, scope);
      case 'effect':     return handleEffect(el, dir, scope);
      case 'source':     return; // Handled by initScope → processSourceDirectives
      case 'cloak':      return; // Handled by removeCloaks()
      case 'teleport':   return handleTeleport(el, dir, scope);
      case 'transition': return; // Handled by l-show and l-if
      default:
        if (customDirectives.has(dir.type)) {
          customDirectives.get(dir.type)(el, dir, scope);
        }
    }
  }

  // --- 3.6 l-text ---

  function handleText(el, dir, scope) {
    var cl = effect(function() {
      var value = evaluate(dir.expression, scope, el);
      el.textContent = value == null ? '' : String(value);
    });
    addCleanup(el, cl);
  }

  // --- 3.7 l-html ---

  function handleHtml(el, dir, scope) {
    var cl = effect(function() {
      var value = evaluate(dir.expression, scope, el);
      el.innerHTML = value == null ? '' : String(value);
    });
    addCleanup(el, cl);
  }

  // --- 3.8 l-bind / :attr ---

  var BOOLEAN_ATTRS = new Set([
    'disabled', 'hidden', 'checked', 'readonly', 'required', 'selected',
    'autofocus', 'autoplay', 'controls', 'loop', 'muted', 'multiple',
    'open', 'novalidate', 'formnovalidate', 'inert'
  ]);

  function handleBind(el, dir, scope) {
    var attrName = dir.arg;

    var cl = effect(function() {
      var value = evaluate(dir.expression, scope, el);

      if (attrName === 'class') {
        applyClassBinding(el, value);
      } else if (attrName === 'style') {
        applyStyleBinding(el, value);
      } else if (BOOLEAN_ATTRS.has(attrName)) {
        if (value) {
          el.setAttribute(attrName, '');
        } else {
          el.removeAttribute(attrName);
        }
      } else {
        if (value === null || value === undefined || value === false) {
          el.removeAttribute(attrName);
        } else {
          el.setAttribute(attrName, String(value));
        }
      }
    });

    addCleanup(el, cl);
  }

  function applyClassBinding(el, value) {
    if (typeof value === 'string') {
      el.className = value;
    } else if (Array.isArray(value)) {
      el.className = value.filter(Boolean).join(' ');
    } else if (typeof value === 'object' && value !== null) {
      for (var cls in value) {
        if (value.hasOwnProperty(cls)) {
          el.classList.toggle(cls, !!value[cls]);
        }
      }
    }
  }

  function applyStyleBinding(el, value) {
    if (typeof value === 'string') {
      el.style.cssText = value;
    } else if (typeof value === 'object' && value !== null) {
      for (var prop in value) {
        if (value.hasOwnProperty(prop)) {
          var cssProp = prop.replace(/[A-Z]/g, function(m) { return '-' + m.toLowerCase(); });
          var val = value[prop];
          if (val === null || val === undefined || val === false) {
            el.style.removeProperty(cssProp);
          } else {
            el.style.setProperty(cssProp, String(val));
          }
        }
      }
    }
  }

  // --- 3.9 l-on / @event ---

  var KEY_MAP = {
    'enter': 'Enter', 'escape': 'Escape', 'esc': 'Escape',
    'tab': 'Tab', 'space': ' ', 'delete': 'Delete', 'backspace': 'Backspace',
    'up': 'ArrowUp', 'down': 'ArrowDown', 'left': 'ArrowLeft', 'right': 'ArrowRight',
    'arrow-up': 'ArrowUp', 'arrow-down': 'ArrowDown',
    'arrow-left': 'ArrowLeft', 'arrow-right': 'ArrowRight',
    'home': 'Home', 'end': 'End', 'page-up': 'PageUp', 'page-down': 'PageDown'
  };

  function debounce(fn, ms) {
    var timer;
    return function() {
      var self = this, args = arguments;
      clearTimeout(timer);
      timer = setTimeout(function() { fn.apply(self, args); }, ms);
    };
  }

  function throttle(fn, ms) {
    var last = 0;
    return function() {
      var now = Date.now();
      if (now - last >= ms) {
        last = now;
        fn.apply(this, arguments);
      }
    };
  }

  function parseTimeMod(mod) {
    var match = mod.match(/(\d+)(ms|s)?/);
    if (!match) return null;
    var value = parseInt(match[1], 10);
    return match[2] === 's' ? value * 1000 : value;
  }

  function handleOn(el, dir, scope) {
    var eventName = dir.arg;
    var modifiers = new Set(dir.modifiers);

    var target = el;
    if (modifiers.has('window')) target = window;
    else if (modifiers.has('document')) target = document;

    var wrapFn = null;
    for (var m = 0; m < dir.modifiers.length; m++) {
      var mod = dir.modifiers[m];
      if (mod.startsWith('debounce')) {
        var ms = parseTimeMod(mod) || 250;
        wrapFn = function(fn) { return debounce(fn, ms); };
      } else if (mod.startsWith('throttle')) {
        var ms = parseTimeMod(mod) || 250;
        wrapFn = function(fn) { return throttle(fn, ms); };
      }
    }

    var isKey = eventName === 'keydown' || eventName === 'keyup' || eventName === 'keypress';
    var keyTarget = null;
    if (isKey) {
      for (var m = 0; m < dir.modifiers.length; m++) {
        if (KEY_MAP[dir.modifiers[m]]) {
          keyTarget = KEY_MAP[dir.modifiers[m]];
          break;
        }
      }
    }

    var handler = function(e) {
      if (modifiers.has('prevent')) e.preventDefault();
      if (modifiers.has('stop')) e.stopPropagation();
      if (modifiers.has('self') && e.target !== el) return;

      if (keyTarget && e.key !== keyTarget) return;

      scope.$event = e;
      try {
        evaluateAssignment(dir.expression, scope, el);
      } finally {
        delete scope.$event;
      }
    };

    if (wrapFn) handler = wrapFn(handler);

    var options = {};
    if (modifiers.has('once')) options.once = true;
    if (modifiers.has('capture')) options.capture = true;
    if (modifiers.has('passive')) options.passive = true;

    target.addEventListener(eventName, handler, options);
    addCleanup(el, function() { target.removeEventListener(eventName, handler, options); });
  }

  // --- 3.10 l-ref ---

  function handleRef(el, dir, scope) {
    var name = dir.expression;
    var root = findScopeRoot(el);
    if (!root.__faqirRefs) root.__faqirRefs = {};
    root.__faqirRefs[name] = el;

    addCleanup(el, function() {
      if (root.__faqirRefs && root.__faqirRefs[name] === el) {
        delete root.__faqirRefs[name];
      }
    });
  }

  // --- 3.11 l-init ---

  function handleInit(el, dir, scope) {
    evaluateAssignment(dir.expression, scope, el);
  }

  // --- 3.12 l-effect ---

  function handleEffect(el, dir, scope) {
    var cl = effect(function() {
      evaluateAssignment(dir.expression, scope, el);
    });
    addCleanup(el, cl);
  }

  // --- 3.13 l-cloak ---

  function injectCloakStyle() {
    var style = document.createElement('style');
    style.textContent = '[l-cloak] { display: none !important; }';
    document.head.appendChild(style);
  }

  function removeCloaks() {
    var els = document.querySelectorAll('[l-cloak]');
    for (var i = 0; i < els.length; i++) {
      els[i].removeAttribute('l-cloak');
    }
  }

  // --- 3.14 l-transition helpers ---

  function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function runEnterTransition(el, name) {
    if (prefersReducedMotion()) return;
    var prefix = name || 'l';

    el.classList.add(prefix + '-enter-from', prefix + '-enter-active');
    el.offsetHeight; // force reflow

    requestAnimationFrame(function() {
      el.classList.remove(prefix + '-enter-from');
      el.classList.add(prefix + '-enter-to');

      var onEnd = function() {
        el.classList.remove(prefix + '-enter-active', prefix + '-enter-to');
        el.removeEventListener('transitionend', onEnd);
        el.removeEventListener('animationend', onEnd);
      };
      el.addEventListener('transitionend', onEnd, { once: true });
      el.addEventListener('animationend', onEnd, { once: true });
    });
  }

  function runLeaveTransition(el, name, done) {
    if (prefersReducedMotion()) { done(); return; }
    var prefix = name || 'l';

    el.classList.add(prefix + '-leave-from', prefix + '-leave-active');
    el.offsetHeight; // force reflow

    requestAnimationFrame(function() {
      el.classList.remove(prefix + '-leave-from');
      el.classList.add(prefix + '-leave-to');

      var onEnd = function() {
        el.classList.remove(prefix + '-leave-active', prefix + '-leave-to');
        el.removeEventListener('transitionend', onEnd);
        el.removeEventListener('animationend', onEnd);
        done();
      };
      el.addEventListener('transitionend', onEnd, { once: true });
      el.addEventListener('animationend', onEnd, { once: true });
    });
  }

  // --- 3.15 l-model ---

  function handleModel(el, dir, scope) {
    var prop = dir.expression;
    var modifiers = new Set(dir.modifiers);

    var tag = el.tagName.toLowerCase();
    var type = el.getAttribute('type');
    var isFaqirSwitch = el.hasAttribute('data-ui') && el.dataset.ui === 'switch';

    if (isFaqirSwitch) {
      var cl = effect(function() {
        var value = evaluate(prop, scope, el);
        el.checked = !!value;
        el.dataset.state = value ? 'on' : 'off';
        el.setAttribute('aria-checked', value ? 'true' : 'false');
      });
      el.addEventListener('change', function() {
        evaluateAssignment(prop + ' = ' + el.checked, scope, el);
      });
      addCleanup(el, cl);

    } else if (tag === 'input' && type === 'checkbox') {
      var cl = effect(function() {
        var current = evaluate(prop, scope, el);
        if (Array.isArray(current)) {
          el.checked = current.indexOf(el.value) >= 0;
        } else {
          el.checked = !!current;
        }
      });
      el.addEventListener('change', function() {
        var current = evaluate(prop, scope, el);
        if (Array.isArray(current)) {
          var arr = current.slice();
          var idx = arr.indexOf(el.value);
          if (el.checked && idx < 0) arr.push(el.value);
          else if (!el.checked && idx >= 0) arr.splice(idx, 1);
          evaluateAssignment(prop + ' = ' + JSON.stringify(arr), scope, el);
        } else {
          evaluateAssignment(prop + ' = ' + el.checked, scope, el);
        }
      });
      addCleanup(el, cl);

    } else if (tag === 'input' && type === 'radio') {
      var cl = effect(function() {
        el.checked = evaluate(prop, scope, el) === el.value;
      });
      el.addEventListener('change', function() {
        if (el.checked) {
          evaluateAssignment(prop + " = '" + el.value + "'", scope, el);
        }
      });
      addCleanup(el, cl);

    } else if (tag === 'select') {
      var cl = effect(function() {
        el.value = evaluate(prop, scope, el) || '';
      });
      el.addEventListener('change', function() {
        evaluateAssignment(prop + " = '" + el.value + "'", scope, el);
      });
      addCleanup(el, cl);

    } else {
      // text input, textarea, number input, etc.
      var eventName = modifiers.has('lazy') ? 'change' : 'input';

      var cl = effect(function() {
        var value = evaluate(prop, scope, el);
        if (el.value !== String(value != null ? value : '')) {
          el.value = value != null ? value : '';
        }
      });

      var inputHandler = function() {
        var value = el.value;
        if (modifiers.has('number')) value = parseFloat(value) || 0;
        if (modifiers.has('trim')) value = value.trim();
        if (typeof value === 'number') {
          evaluateAssignment(prop + ' = ' + value, scope, el);
        } else {
          evaluateAssignment(prop + " = '" + value.replace(/'/g, "\\'") + "'", scope, el);
        }
      };

      if (modifiers.has('debounce')) {
        inputHandler = debounce(inputHandler, 300);
      }

      el.addEventListener(eventName, inputHandler);
      addCleanup(el, cl);
    }
  }

  // --- 3.16 l-show ---

  function handleShow(el, dir, scope) {
    var originalDisplay = el.style.display === 'none' ? '' : el.style.display;

    var cl = effect(function() {
      var value = evaluate(dir.expression, scope, el);

      if (value) {
        el.style.display = originalDisplay;
        if (el.hasAttribute('l-transition')) {
          runEnterTransition(el, el.getAttribute('l-transition'));
        }
      } else {
        if (el.hasAttribute('l-transition')) {
          runLeaveTransition(el, el.getAttribute('l-transition'), function() {
            el.style.display = 'none';
          });
        } else {
          el.style.display = 'none';
        }
      }
    });

    addCleanup(el, cl);
  }

  // --- 3.17 l-if ---

  function handleIf(el, dir, scope) {
    if (el.tagName !== 'TEMPLATE') {
      console.warn('[Faqir] l-if must be used on a <template> element');
      return;
    }

    var anchor = document.createComment('l-if');
    el.parentNode.insertBefore(anchor, el);
    el.remove();

    var insertedNodes = [];

    var cl = effect(function() {
      var value = evaluate(dir.expression, scope, el);

      if (value) {
        if (insertedNodes.length === 0) {
          var fragment = el.content.cloneNode(true);
          var nodes = [].slice.call(fragment.childNodes);

          for (var i = 0; i < nodes.length; i++) {
            if (nodes[i].nodeType === 1) {
              processElement(nodes[i], scope);
              walkChildren(nodes[i], scope);
            }
          }

          anchor.parentNode.insertBefore(fragment, anchor.nextSibling);
          insertedNodes = nodes.filter(function(n) { return n.nodeType === 1; });

          for (var i = 0; i < insertedNodes.length; i++) {
            if (insertedNodes[i].hasAttribute && insertedNodes[i].hasAttribute('l-transition')) {
              runEnterTransition(insertedNodes[i], insertedNodes[i].getAttribute('l-transition'));
            }
          }
        }
      } else {
        for (var i = 0; i < insertedNodes.length; i++) {
          var node = insertedNodes[i];
          if (node.hasAttribute && node.hasAttribute('l-transition')) {
            (function(n) {
              runLeaveTransition(n, n.getAttribute('l-transition'), function() {
                n.remove();
              });
            })(node);
          } else {
            node.remove();
          }
          destroyScope(node);
        }
        insertedNodes = [];
      }
    });

    addCleanup(el, cl);
  }

  // --- 3.18 l-for ---

  // Reactive, parent-delegating scope for a single l-for item. The item/index
  // slots are reactive so keyed reuse updates them with one property write
  // (no re-processing); every other read/write passes through to the parent
  // scope so mutations there still trigger reactivity.
  function createForItemScope(own, parentScope) {
    var deps = Object.create(null);
    return new Proxy(own, {
      get: function(target, key) {
        if (key === '__isReactive') return true;
        if (key === '__target') return target;
        if (key === '__deps') return parentScope.__deps;
        if (key in target) {
          if (currentEffect && typeof key === 'string') {
            if (!deps[key]) deps[key] = new Set();
            deps[key].add(currentEffect);
            currentEffect._deps.add(deps[key]);
          }
          var value = target[key];
          if (value !== null && typeof value === 'object' && !value.__isReactive
              && (Array.isArray(value) || Object.getPrototypeOf(value) === Object.prototype)) {
            return reactive(value);
          }
          return value;
        }
        return parentScope[key];
      },
      set: function(target, key, value) {
        if (key in target) {
          var old = target[key];
          if (old !== value) {
            target[key] = value;
            if (deps[key]) {
              for (var eff of deps[key]) pendingEffects.add(eff);
              scheduleFlush();
            }
          }
          return true;
        }
        parentScope[key] = value;
        return true;
      },
      has: function(target, key) {
        return (key in target) || (key in parentScope);
      }
    });
  }

  // Longest increasing subsequence of old positions (0 = freshly created entry,
  // skipped). Returns the indices of `arr` already in order — the nodes that
  // stay put across a reorder, so only the rest move. O(n log n). [0.3-06 · §A1]
  function getSequence(arr) {
    var p = arr.slice();
    var result = [0];
    var i, j, u, v, c;
    for (i = 0; i < arr.length; i++) {
      var n = arr[i];
      if (n !== 0) {
        j = result[result.length - 1];
        if (arr[j] < n) { p[i] = j; result.push(i); continue; }
        u = 0; v = result.length - 1;
        while (u < v) { c = (u + v) >> 1; if (arr[result[c]] < n) u = c + 1; else v = c; }
        if (n < arr[result[u]]) { if (u > 0) p[i] = result[u - 1]; result[u] = i; }
      }
    }
    u = result.length; v = result[u - 1];
    while (u-- > 0) { result[u] = v; v = p[v]; }
    return result;
  }

  // True when `b` is a non-identity permutation of `a` (same items, new order).
  // Drives the dev hint for unkeyed lists that reorder. [task 0.3-06 · §A1]
  function isReorder(a, b) {
    var len = a.length;
    if (len === 0 || len !== b.length) return false;
    var moved = false;
    for (var i = 0; i < len; i++) if (a[i] !== b[i]) { moved = true; break; }
    if (!moved) return false;
    var counts = new Map();
    for (var i = 0; i < len; i++) counts.set(a[i], (counts.get(a[i]) || 0) + 1);
    for (var i = 0; i < len; i++) {
      var c = counts.get(b[i]);
      if (!c) return false;
      counts.set(b[i], c - 1);
    }
    return true;
  }

  function handleFor(el, dir, scope) {
    if (el.tagName !== 'TEMPLATE') {
      console.warn('[Faqir] l-for must be used on a <template> element');
      return;
    }

    var match = dir.expression.match(
      /^\s*(?:\(?\s*(\w+)\s*(?:,\s*(\w+))?\s*\)?\s+in\s+)?(.+)\s*$/
    );

    if (!match) {
      console.warn('[Faqir] Invalid l-for expression: "' + dir.expression + '"');
      return;
    }

    var itemName = match[1] || 'item';
    var indexName = match[2] || 'index';
    var listExpr = match[3];
    var keyExpr = el.getAttribute('l-key');

    var anchor = document.createComment('l-for');
    el.parentNode.insertBefore(anchor, el);
    el.remove();

    // Reconciliation key for an item. Falls back to its position when there is
    // no l-key. Untracked so key reads never subscribe the list effect to
    // individual item properties.
    function keyFor(item, i) {
      if (!keyExpr) return i;
      var ctx = Object.create(null);
      ctx[itemName] = item;
      ctx[indexName] = i;
      var proxy = new Proxy(ctx, {
        has: function(t, k) { return (k in t) || (k in scope); },
        get: function(t, k) { return (k in t) ? t[k] : scope[k]; }
      });
      return untrack(function() { return evaluate(keyExpr, proxy, el); });
    }

    // Build one item's nodes + reactive scope from the template.
    function createEntry(item, i, key) {
      var clone = el.content.cloneNode(true);
      var nodes = [].slice.call(clone.childNodes);
      var own = Object.create(null);
      own[itemName] = item;
      own[indexName] = i;
      var childScope = createForItemScope(own, scope);
      for (var j = 0; j < nodes.length; j++) {
        if (nodes[j].nodeType !== 1) continue;
        nodes[j].__faqirScope = childScope;
        nodes[j].__faqirCleanups = [];
        processElement(nodes[j], childScope);
        walkChildren(nodes[j], childScope);
      }
      return { key: key, scope: childScope, nodes: nodes };
    }

    var currentEntries = [];
    var prevItems = null;   // last list snapshot, for the unkeyed-reorder hint
    var warnedReorder = false;

    var cl = effect(function() {
      var list = evaluate(listExpr, scope, el);
      var items = Array.isArray(list) ? list :
                  typeof list === 'number' ? Array.from({ length: list }, function(_, i) { return i + 1; }) :
                  [];

      // Dev hint: an unkeyed list reconciles by position, so reordering it
      // rebinds per-row DOM state to the wrong items. Once per list; keyed
      // lists never reach here.
      if (!keyExpr && !warnedReorder) {
        if (prevItems && isReorder(prevItems, items)) {
          console.warn('[Faqir] l-for reordered without l-key — DOM state ' +
            '(focus, selection, input) is bound to position, not identity. ' +
            'Add l-key="…" so nodes follow their items across reorders.');
          warnedReorder = true;
        }
        prevItems = items.slice();
      }

      // old key -> entry, consumed as matched so duplicate keys fall through to
      // fresh nodes and leftovers are stale. source[i] = reused entry's old
      // position + 1, or 0 for a fresh entry (the getSequence sentinel).
      var oldMap = new Map();
      for (var i = 0; i < currentEntries.length; i++) {
        oldMap.set(currentEntries[i].key, currentEntries[i]);
      }

      var n = items.length;
      var newEntries = new Array(n);
      var source = new Array(n);
      for (var i = 0; i < n; i++) {
        var key = keyFor(items[i], i);
        var entry = oldMap.get(key);
        if (entry !== undefined) {
          oldMap.delete(key);
          // Reuse in place: one write per slot, re-renders only on change.
          entry.scope[itemName] = items[i];
          entry.scope[indexName] = i;
          source[i] = entry.__i + 1;
        } else {
          entry = createEntry(items[i], i, key);
          source[i] = 0;
        }
        newEntries[i] = entry;
      }

      // Remove stale entries first so the DOM holds only reused nodes.
      oldMap.forEach(function(stale) {
        for (var j = 0; j < stale.nodes.length; j++) {
          destroyScope(stale.nodes[j]);
          stale.nodes[j].remove();
        }
      });

      // Place back-to-front, inserting before `anchor` (the trailing marker).
      // Entries in the longest increasing subsequence of old positions are
      // already ordered and never move; the rest insert before their placed
      // successor — the minimum number of DOM moves.
      var seq = getSequence(source);
      var sj = seq.length - 1;
      var nextNode = anchor;
      for (var i = n - 1; i >= 0; i--) {
        var entry = newEntries[i];
        if (source[i] === 0 || sj < 0 || i !== seq[sj]) {
          for (var j = 0; j < entry.nodes.length; j++) {
            anchor.parentNode.insertBefore(entry.nodes[j], nextNode);
          }
        } else {
          sj--;
        }
        entry.__i = i;
        nextNode = entry.nodes[0];
      }

      currentEntries = newEntries;
    });

    addCleanup(el, cl);
  }

  // --- 3.19 l-teleport ---

  function handleTeleport(el, dir, scope) {
    var cl = effect(function() {
      var target = document.querySelector(dir.expression);
      if (target && el.parentNode !== target) {
        target.appendChild(el);
      }
    });
    addCleanup(el, cl);
  }

  // ═══════════════════════════════════════════════════════
  // Section 4-5: Faqir Bridge ($state, $variant, $ui)
  // ═══════════════════════════════════════════════════════

  function closestUI(el) {
    if (!el) return null;
    if (el.hasAttribute && el.hasAttribute('data-ui')) return el;
    return el.closest ? el.closest('[data-ui]') : null;
  }

  function getControllerApi(uiEl) {
    if (!uiEl) return null;
    var keys = Object.keys(uiEl);
    for (var i = 0; i < keys.length; i++) {
      if (keys[i].startsWith('_faqir')) {
        return uiEl[keys[i]];
      }
    }
    return null;
  }

  function setupStateBridge(root, scope) {
    var uiEl = root.hasAttribute('data-ui') ? root : (root.closest ? root.closest('[data-ui]') : null);
    if (!uiEl) return;

    var observer = new MutationObserver(function(mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var attr = mutations[i].attributeName;
        if (attr === 'data-state' || attr === 'data-variant') {
          triggerStateDeps(scope);
        }
      }
    });

    observer.observe(uiEl, {
      attributes: true,
      attributeFilter: ['data-state', 'data-variant']
    });

    addCleanup(root, function() { observer.disconnect(); });
  }

  function triggerStateDeps(scope) {
    var deps = scope.__deps;
    if (!deps) return;
    if (deps['$state']) {
      for (var eff of deps['$state']) {
        pendingEffects.add(eff);
      }
      scheduleFlush();
    }
    if (deps['$variant']) {
      for (var eff of deps['$variant']) {
        pendingEffects.add(eff);
      }
      scheduleFlush();
    }
  }

  // ═══════════════════════════════════════════════════════
  // Section 6: Core Utilities
  // ═══════════════════════════════════════════════════════

  // --- From dom.js ---
  var $ = function(selector, scope) { return (scope || document).querySelector(selector); };
  var $$ = function(selector, scope) { return [].slice.call((scope || document).querySelectorAll(selector)); };

  function create(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) {
      var keys = Object.keys(attrs);
      for (var i = 0; i < keys.length; i++) {
        el.setAttribute(keys[i], attrs[keys[i]]);
      }
    }
    for (var j = 2; j < arguments.length; j++) {
      var child = arguments[j];
      el.append(typeof child === 'string' ? document.createTextNode(child) : child);
    }
    return el;
  }

  // --- From events.js ---
  function delegate(root, event, selector, handler) {
    function listener(e) {
      var target = e.target.closest(selector);
      if (target && root.contains(target)) handler(e, target);
    }
    root.addEventListener(event, listener);
    return function() { root.removeEventListener(event, listener); };
  }

  function once(el, event, handler) {
    function listener(e) { cleanupOnce(); handler(e); }
    function cleanupOnce() { el.removeEventListener(event, listener); }
    el.addEventListener(event, listener);
    return cleanupOnce;
  }

  function onOutsideClick(el, handler) {
    function listener(e) { if (!el.contains(e.target)) handler(e); }
    document.addEventListener('pointerdown', listener);
    return function() { document.removeEventListener('pointerdown', listener); };
  }

  // --- From focus.js ---
  var FOCUSABLE = [
    'a[href]:not([tabindex="-1"])',
    'button:not([disabled]):not([tabindex="-1"])',
    'input:not([disabled]):not([tabindex="-1"])',
    'select:not([disabled]):not([tabindex="-1"])',
    'textarea:not([disabled]):not([tabindex="-1"])',
    '[tabindex]:not([tabindex="-1"])'
  ].join(',');

  function getFocusableElements(container) {
    return [].slice.call(container.querySelectorAll(FOCUSABLE)).filter(function(el) {
      return !el.closest('[hidden]') && el.offsetParent !== null;
    });
  }

  function focusFirst(container) {
    var els = getFocusableElements(container);
    if (els.length > 0) { els[0].focus(); return true; }
    return false;
  }

  function trapFocus(container) {
    function onKeyDown(e) {
      if (e.key !== 'Tab') return;
      var focusable = getFocusableElements(container);
      if (focusable.length === 0) return;
      var first = focusable[0], last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    container.addEventListener('keydown', onKeyDown);
    return function() { container.removeEventListener('keydown', onKeyDown); };
  }

  // --- From motion.js (prefersReducedMotion already defined in Section 3.14) ---
  function waitForTransition(el) {
    if (prefersReducedMotion()) return Promise.resolve();
    var style = getComputedStyle(el);
    var hasDuration = parseFloat(style.transitionDuration) > 0 ||
      (style.animationName !== 'none' && parseFloat(style.animationDuration) > 0);
    if (!hasDuration) return Promise.resolve();
    return new Promise(function(resolve) {
      function done(e) {
        if (e.target !== el) return;
        el.removeEventListener('transitionend', done);
        el.removeEventListener('animationend', done);
        resolve();
      }
      el.addEventListener('transitionend', done);
      el.addEventListener('animationend', done);
    });
  }

  // --- From utils.js (debounce/throttle already defined in Section 3.9) ---
  var uidCounter = 0;
  function uid(prefix) { return (prefix || 'faqir') + '-' + (++uidCounter); }
  function clamp(value, min, max) { return Math.min(Math.max(value, min), max); }

  // ═══════════════════════════════════════════════════════
  // Section 7: Recipe Controllers
  // ═══════════════════════════════════════════════════════

  var controllerRegistry = {};

  // Recipe controller factories are assembled here by scripts/build-core.mjs
  // from registry/recipes/<name>/<name>.js. Do NOT hand-edit the generated
  // registry/core/faqir-core.js — edit the recipe files (or this engine
  // source) and run `bun run build:core`. See CONTRIBUTING.md.
  // ── accordion ── (registry/recipes/accordion/accordion.js)
  var createAccordion = controllerRegistry["accordion"] = (function() {
// @ui:controller accordion
// @ui:provides toggle expand collapse expandAll collapseAll destroy

function createAccordion(root) {
  // Prevent double-init
  if (root._faqirAccordion) return root._faqirAccordion;

  const getItems = () => [...root.querySelectorAll("[data-part='item']")];
  const isSingle = () => root.dataset.variant === "single";

  function expand(index) {
    const items = getItems();
    if (index < 0 || index >= items.length) return;

    // In single mode, collapse all others first
    if (isSingle()) {
      items.forEach((item, i) => {
        if (i !== index) collapseItem(item);
      });
    }

    expandItem(items[index]);
  }

  function collapse(index) {
    const items = getItems();
    if (index < 0 || index >= items.length) return;
    collapseItem(items[index]);
  }

  function toggle(index) {
    const items = getItems();
    if (index < 0 || index >= items.length) return;

    if (items[index].dataset.state === "expanded") {
      collapse(index);
    } else {
      expand(index);
    }
  }

  function expandAll() {
    const items = getItems();
    items.forEach((item) => expandItem(item));
  }

  function collapseAll() {
    const items = getItems();
    items.forEach((item) => collapseItem(item));
  }

  function expandItem(item) {
    item.dataset.state = "expanded";
    const trigger = item.querySelector("[data-part='trigger']");
    const content = item.querySelector("[data-part='content']");
    if (trigger) trigger.setAttribute("aria-expanded", "true");
    if (content) content.hidden = false;
  }

  function collapseItem(item) {
    item.dataset.state = "collapsed";
    const trigger = item.querySelector("[data-part='trigger']");
    const content = item.querySelector("[data-part='content']");
    if (trigger) trigger.setAttribute("aria-expanded", "false");
    if (content) content.hidden = true;
  }

  function onTriggerClick(e) {
    const trigger = e.target.closest("[data-part='trigger']");
    if (!trigger) return;
    const item = trigger.closest("[data-part='item']");
    if (!item) return;
    const items = getItems();
    const index = items.indexOf(item);
    if (index >= 0) toggle(index);
  }

  function onKeyDown(e) {
    if (e.key === "Enter" || e.key === " ") {
      const trigger = e.target.closest("[data-part='trigger']");
      if (trigger) {
        e.preventDefault();
        const item = trigger.closest("[data-part='item']");
        if (!item) return;
        const items = getItems();
        const index = items.indexOf(item);
        if (index >= 0) toggle(index);
      }
    }
  }

  root.addEventListener("click", onTriggerClick);
  root.addEventListener("keydown", onKeyDown);

  function destroy() {
    root.removeEventListener("click", onTriggerClick);
    root.removeEventListener("keydown", onKeyDown);
    delete root._faqirAccordion;
  }

  const api = { toggle, expand, collapse, expandAll, collapseAll, destroy };
  root._faqirAccordion = api;
  return api;
}
    return createAccordion;
  })();

  // ── alert-dialog ── (registry/recipes/alert-dialog/alert-dialog.js)
  var createAlertDialog = controllerRegistry["alert-dialog"] = (function() {
// @ui:controller alert-dialog
// @ui:provides open close toggle destroy

/**
 * alert-dialog reuses the `dialog` controller wholesale — there is no forked or
 * duplicated controller here. An alert dialog IS a dialog whose panel carries
 * `role="alertdialog"`; the shared controller in ../dialog/dialog.js reads that
 * role and switches on the WAI-ARIA alertdialog behaviours (no overlay-dismiss,
 * focus the least-destructive action, guarded Escape, confirm/cancel events).
 * This factory only exists so the recipe is discoverable under its own
 * `data-ui="alert-dialog"` name and auto-registers from the built core.
 */
function createAlertDialog(root) {
  // Resolve the shared dialog factory in both worlds this controller runs in:
  //   • as an ES module (behaviour tests, `faqir add`): the `import` above binds
  //     `createDialog` directly.
  //   • inlined into the built registry/core/faqir-core.js: scripts/build-core.mjs
  //     strips the import, but every recipe factory is registered on the engine's
  //     private `controllerRegistry`, so pick `dialog` up from there.
  // `typeof` is used because a bare reference to a stripped/undeclared binding
  // would throw — `typeof` on an unknown identifier is the one safe probe.
  const dialogFactory =
    (typeof createDialog === "function" && createDialog) ||
    (typeof controllerRegistry !== "undefined" && controllerRegistry["dialog"]);

  if (typeof dialogFactory !== "function") {
    throw new Error("alert-dialog requires the dialog controller to be available");
  }
  return dialogFactory(root);
}
    return createAlertDialog;
  })();

  // ── calendar ── (registry/recipes/calendar/calendar.js)
  var createCalendar = controllerRegistry["calendar"] = (function() {
// @ui:controller calendar
// @ui:provides getValue setValue clear navigate selectDate focusDate setMin setMax setDisabledDates destroy

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const DAY_NAMES = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
];

function parseISO(str) {
  if (!str) return null;
  const d = new Date(str + "T00:00:00");
  return isNaN(d.getTime()) ? null : d;
}

function createCalendar(root) {
  // Prevent double-init
  if (root._faqirCalendar) return root._faqirCalendar;

  const navPrev = root.querySelector("[data-part='nav-prev']");
  const navNext = root.querySelector("[data-part='nav-next']");
  const monthLabel = root.querySelector("[data-part='month-label']");
  const gridBody = root.querySelector("[data-part='grid-body']");

  const today = new Date();
  const mode = root.dataset.mode === "range" ? "range" : "single";

  let minDate = parseISO(root.dataset.min);
  let maxDate = parseISO(root.dataset.max);
  let disabledDates = parseDateList(root.dataset.disabledDates);

  let selectedDate = null;
  let rangeStart = null;
  let rangeEnd = null;
  if (root.dataset.value) {
    if (mode === "range") {
      const parts = root.dataset.value.split(",");
      rangeStart = parseISO(parts[0] && parts[0].trim());
      rangeEnd = parseISO(parts[1] && parts[1].trim());
    } else {
      selectedDate = parseISO(root.dataset.value);
    }
  }

  const initialView = selectedDate || rangeStart || today;
  let viewMonth = initialView.getMonth();
  let viewYear = initialView.getFullYear();
  let focusedDate = null;

  function parseDateList(str) {
    const set = new Set();
    if (str) {
      for (const token of str.split(/[\s,]+/)) {
        if (parseISO(token)) set.add(token);
      }
    }
    return set;
  }

  function formatDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function formatAriaLabel(date) {
    return `${DAY_NAMES[date.getDay()]}, ${MONTH_NAMES[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
  }

  function isSameDay(a, b) {
    if (!a || !b) return false;
    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    );
  }

  function isToday(date) {
    return isSameDay(date, today);
  }

  function isDisabled(date) {
    if (minDate && date.getTime() < minDate.getTime()) return true;
    if (maxDate && date.getTime() > maxDate.getTime()) return true;
    return disabledDates.has(formatDate(date));
  }

  function clampToRange(date) {
    if (minDate && date.getTime() < minDate.getTime()) return new Date(minDate);
    if (maxDate && date.getTime() > maxDate.getTime()) return new Date(maxDate);
    return date;
  }

  function buildGrid() {
    // First day of the displayed month
    const firstDay = new Date(viewYear, viewMonth, 1);
    const startDow = firstDay.getDay(); // 0=Sun

    // Last day of the displayed month
    const lastDay = new Date(viewYear, viewMonth + 1, 0);
    const totalDays = lastDay.getDate();

    // Previous month trailing days
    const prevMonthLast = new Date(viewYear, viewMonth, 0);
    const prevMonthDays = prevMonthLast.getDate();

    // Update label
    if (monthLabel) monthLabel.textContent = `${MONTH_NAMES[viewMonth]} ${viewYear}`;

    // A whole adjacent month out of bounds means its nav button is a dead end
    if (navPrev) navPrev.disabled = !!(minDate && prevMonthLast.getTime() < minDate.getTime());
    if (navNext) navNext.disabled = !!(maxDate && new Date(viewYear, viewMonth + 1, 1).getTime() > maxDate.getTime());

    // Clear existing
    gridBody.innerHTML = "";

    let dayCount = 1;
    let nextMonthDay = 1;
    const totalCells = Math.ceil((startDow + totalDays) / 7) * 7;
    let row = null;

    for (let i = 0; i < totalCells; i++) {
      // Start a new row every 7 cells
      if (i % 7 === 0) {
        row = document.createElement("tr");
        gridBody.appendChild(row);
      }

      const td = document.createElement("td");
      const btn = document.createElement("button");
      btn.setAttribute("data-part", "day");
      btn.type = "button";

      let date;
      let isOutside = false;

      if (i < startDow) {
        // Previous month
        const day = prevMonthDays - startDow + 1 + i;
        date = new Date(viewYear, viewMonth - 1, day);
        btn.textContent = day;
        isOutside = true;
      } else if (dayCount <= totalDays) {
        // Current month
        date = new Date(viewYear, viewMonth, dayCount);
        btn.textContent = dayCount;
        dayCount++;
      } else {
        // Next month
        date = new Date(viewYear, viewMonth + 1, nextMonthDay);
        btn.textContent = nextMonthDay;
        nextMonthDay++;
        isOutside = true;
      }

      btn.dataset.date = formatDate(date);
      btn.setAttribute("aria-label", formatAriaLabel(date));

      if (isOutside) {
        btn.dataset.outside = "true";
      }

      if (isToday(date)) {
        btn.dataset.today = "true";
      }

      if (isDisabled(date)) {
        // aria-disabled (not the native attribute) keeps the cell reachable by
        // the roving tabindex while blocking selection
        btn.setAttribute("aria-disabled", "true");
        btn.dataset.disabled = "true";
      }

      if (mode === "range") {
        if (isSameDay(date, rangeStart)) {
          btn.dataset.state = "range-start";
          btn.setAttribute("aria-selected", "true");
        } else if (isSameDay(date, rangeEnd)) {
          btn.dataset.state = "range-end";
          btn.setAttribute("aria-selected", "true");
        } else if (
          rangeStart && rangeEnd &&
          date.getTime() > rangeStart.getTime() &&
          date.getTime() < rangeEnd.getTime()
        ) {
          btn.dataset.state = "in-range";
        }
      } else if (isSameDay(date, selectedDate)) {
        btn.setAttribute("aria-selected", "true");
      }

      if (isSameDay(date, focusedDate)) {
        btn.tabIndex = 0;
      } else {
        btn.tabIndex = -1;
      }

      td.appendChild(btn);
      row.appendChild(td);
    }

    // If no focused date set, make the selected or first-of-month focusable
    if (!focusedDate) {
      const anchor = mode === "range" ? rangeStart : selectedDate;
      const defaultFocusDate = anchor &&
        anchor.getMonth() === viewMonth && anchor.getFullYear() === viewYear
        ? anchor
        : new Date(viewYear, viewMonth, 1);
      const defaultBtn = gridBody.querySelector(
        `[data-date="${formatDate(defaultFocusDate)}"]`
      );
      if (defaultBtn) defaultBtn.tabIndex = 0;
    }
  }

  function dayButton(date) {
    return gridBody.querySelector(`[data-date="${formatDate(date)}"]`);
  }

  function focusDate(date) {
    const target = clampToRange(new Date(date));
    focusedDate = target;

    if (target.getMonth() !== viewMonth || target.getFullYear() !== viewYear) {
      viewMonth = target.getMonth();
      viewYear = target.getFullYear();
      buildGrid();
    } else {
      // Update roving tabindex in the current grid
      gridBody.querySelectorAll("[data-part='day']").forEach((btn) => {
        btn.tabIndex = -1;
      });
      const btn = dayButton(target);
      if (btn) btn.tabIndex = 0;
    }

    const btn = dayButton(target);
    if (btn) btn.focus();
  }

  function moveFocus(days) {
    if (!focusedDate) return;
    const next = new Date(focusedDate);
    next.setDate(next.getDate() + days);
    focusDate(next);
  }

  /** Move focus ±N months (PageUp/Down), clamping the day to the target month's length. */
  function moveFocusMonths(months) {
    if (!focusedDate) return;
    const target = new Date(focusedDate.getFullYear(), focusedDate.getMonth() + months, 1);
    const daysInTarget = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
    target.setDate(Math.min(focusedDate.getDate(), daysInTarget));
    focusDate(target);
  }

  function selectDate(date) {
    const chosen = new Date(date);
    if (isDisabled(chosen)) return;

    // buildGrid() replaces the focused button — restore focus before emitting,
    // so change listeners (e.g. date-picker closing the popup) keep the final
    // word on where focus lands.
    const hadFocus = root.contains(document.activeElement);
    focusedDate = chosen;

    let detail = null;

    if (mode === "range") {
      if (!rangeStart || rangeEnd || chosen.getTime() < rangeStart.getTime()) {
        // First click, restart after a complete range, or backwards pick
        rangeStart = chosen;
        rangeEnd = null;
      } else {
        rangeEnd = chosen;
        detail = {
          start: formatDate(rangeStart),
          end: formatDate(rangeEnd),
          startObj: new Date(rangeStart),
          endObj: new Date(rangeEnd),
        };
      }
    } else {
      selectedDate = chosen;
      detail = { date: formatDate(selectedDate), dateObj: new Date(selectedDate) };
    }

    buildGrid();

    if (hadFocus) {
      const btn = dayButton(chosen);
      if (btn) btn.focus();
    }

    if (detail) {
      root.dispatchEvent(
        new CustomEvent("faqir:calendar-change", { detail, bubbles: true })
      );
    }
  }

  function getValue() {
    if (mode === "range") {
      return {
        start: rangeStart ? formatDate(rangeStart) : null,
        end: rangeEnd ? formatDate(rangeEnd) : null,
      };
    }
    return selectedDate ? formatDate(selectedDate) : null;
  }

  /** Silent set — updates selection and view without emitting a change event. */
  function setValue(value) {
    if (mode === "range") {
      const parts = String(value).split(",");
      const start = parseISO(parts[0] && parts[0].trim());
      const end = parseISO(parts[1] && parts[1].trim());
      if (!start) return;
      rangeStart = start;
      rangeEnd = end && end.getTime() >= start.getTime() ? end : null;
      viewMonth = start.getMonth();
      viewYear = start.getFullYear();
      buildGrid();
      return;
    }

    const parsed = parseISO(value);
    if (!parsed) return;
    selectedDate = parsed;
    viewMonth = parsed.getMonth();
    viewYear = parsed.getFullYear();
    buildGrid();
  }

  function clear() {
    selectedDate = null;
    rangeStart = null;
    rangeEnd = null;
    buildGrid();
  }

  function navigate(month, year) {
    viewMonth = month;
    viewYear = year;
    focusedDate = new Date(viewYear, viewMonth, 1);
    buildGrid();

    const btn = dayButton(focusedDate);
    if (btn) btn.focus();
  }

  function setMin(value) {
    minDate = parseISO(value);
    buildGrid();
  }

  function setMax(value) {
    maxDate = parseISO(value);
    buildGrid();
  }

  function setDisabledDates(list) {
    disabledDates = parseDateList(Array.isArray(list) ? list.join(",") : list);
    buildGrid();
  }

  /** Show an adjacent month without moving DOM focus (nav-button clicks). */
  function shiftView(delta) {
    viewMonth += delta;
    if (viewMonth < 0) {
      viewMonth = 11;
      viewYear--;
    } else if (viewMonth > 11) {
      viewMonth = 0;
      viewYear++;
    }
    focusedDate = clampToRange(new Date(viewYear, viewMonth, 1));
    buildGrid();
  }

  function onPrevClick() {
    shiftView(-1);
  }

  function onNextClick() {
    shiftView(1);
  }

  function onGridClick(e) {
    const dayBtn = e.target.closest("[data-part='day']");
    if (dayBtn && dayBtn.dataset.date && dayBtn.getAttribute("aria-disabled") !== "true") {
      selectDate(parseISO(dayBtn.dataset.date));
    }
  }

  function onKeyDown(e) {
    // Grid navigation only applies while a day cell has focus
    const dayBtn = e.target.closest ? e.target.closest("[data-part='day']") : null;
    if (!dayBtn) return;

    if (dayBtn.dataset.date && !isSameDay(focusedDate, parseISO(dayBtn.dataset.date))) {
      focusedDate = parseISO(dayBtn.dataset.date);
    }

    switch (e.key) {
      case "ArrowLeft":
        e.preventDefault();
        moveFocus(-1);
        break;
      case "ArrowRight":
        e.preventDefault();
        moveFocus(1);
        break;
      case "ArrowUp":
        e.preventDefault();
        moveFocus(-7);
        break;
      case "ArrowDown":
        e.preventDefault();
        moveFocus(7);
        break;
      case "Home":
        e.preventDefault();
        if (focusedDate) moveFocus(-focusedDate.getDay());
        break;
      case "End":
        e.preventDefault();
        if (focusedDate) moveFocus(6 - focusedDate.getDay());
        break;
      case "PageUp":
        e.preventDefault();
        if (e.shiftKey) {
          moveFocusMonths(-12);
        } else {
          moveFocusMonths(-1);
        }
        break;
      case "PageDown":
        e.preventDefault();
        if (e.shiftKey) {
          moveFocusMonths(12);
        } else {
          moveFocusMonths(1);
        }
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        if (focusedDate) selectDate(focusedDate);
        break;
    }
  }

  navPrev?.addEventListener("click", onPrevClick);
  navNext?.addEventListener("click", onNextClick);
  gridBody?.addEventListener("click", onGridClick);
  root.addEventListener("keydown", onKeyDown);

  buildGrid();

  function destroy() {
    navPrev?.removeEventListener("click", onPrevClick);
    navNext?.removeEventListener("click", onNextClick);
    gridBody?.removeEventListener("click", onGridClick);
    root.removeEventListener("keydown", onKeyDown);
    delete root._faqirCalendar;
  }

  const api = {
    getValue,
    setValue,
    clear,
    navigate,
    selectDate,
    focusDate,
    setMin,
    setMax,
    setDisabledDates,
    destroy,
  };
  root._faqirCalendar = api;
  return api;
}
    return createCalendar;
  })();

  // ── combobox ── (registry/recipes/combobox/combobox.js)
  var createCombobox = controllerRegistry["combobox"] = (function() {
// @ui:controller combobox
// @ui:provides open close filter selectOption getValue setValue destroy

function createCombobox(root) {
  // Prevent double-init
  if (root._faqirCombobox) return root._faqirCombobox;

  const input = root.querySelector("[data-part='input']");
  const listbox = root.querySelector("[data-part='listbox']");
  const emptyEl = root.querySelector("[data-part='empty']");
  const options = () =>
    [...root.querySelectorAll("[data-part='option']")];

  let highlightedIndex = -1;
  let outsideClickCleanup = null;
  let selectedValue = "";

  function open() {
    root.dataset.state = "open";
    listbox.hidden = false;
    input.setAttribute("aria-expanded", "true");

    outsideClickCleanup = onOutsideClick(root, close);
  }

  function close() {
    root.dataset.state = "closed";
    listbox.hidden = true;
    input.setAttribute("aria-expanded", "false");
    clearHighlight();

    if (outsideClickCleanup) {
      outsideClickCleanup();
      outsideClickCleanup = null;
    }
  }

  function clearHighlight() {
    const allOptions = options();
    allOptions.forEach((opt) => {
      opt.removeAttribute("data-highlighted");
      opt.setAttribute("aria-selected", "false");
    });
    highlightedIndex = -1;
  }

  function highlightOption(index) {
    const allOptions = visibleOptions();
    if (allOptions.length === 0) return;

    // Clamp index
    if (index < 0) index = allOptions.length - 1;
    if (index >= allOptions.length) index = 0;

    // Clear previous
    options().forEach((opt) => {
      opt.removeAttribute("data-highlighted");
      opt.setAttribute("aria-selected", "false");
    });

    allOptions[index].setAttribute("data-highlighted", "");
    allOptions[index].setAttribute("aria-selected", "true");
    allOptions[index].scrollIntoView({ block: "nearest" });
    highlightedIndex = index;
  }

  function visibleOptions() {
    return options().filter((opt) => !opt.hasAttribute("data-hidden"));
  }

  function filter(query) {
    const allOptions = options();
    const lowerQuery = query.toLowerCase();
    let visibleCount = 0;

    allOptions.forEach((opt) => {
      const text = opt.textContent.toLowerCase();
      if (text.includes(lowerQuery)) {
        opt.removeAttribute("data-hidden");
        visibleCount++;
      } else {
        opt.setAttribute("data-hidden", "");
      }
    });

    // Show/hide empty state
    if (emptyEl) {
      emptyEl.hidden = visibleCount > 0;
    }

    clearHighlight();

    return visibleCount;
  }

  function selectOption(index) {
    const visible = visibleOptions();
    if (index < 0 || index >= visible.length) return;

    const opt = visible[index];
    selectedValue = opt.textContent.trim();
    input.value = selectedValue;

    // Mark as selected
    options().forEach((o) => o.setAttribute("aria-selected", "false"));
    opt.setAttribute("aria-selected", "true");

    close();
  }

  function getValue() {
    return selectedValue;
  }

  function setValue(val) {
    selectedValue = val;
    input.value = val;
  }

  // ── Event Handlers ──

  function onInput() {
    const query = input.value;
    if (root.dataset.state !== "open") {
      open();
    }
    filter(query);
  }

  function onInputFocus() {
    if (root.dataset.state !== "open") {
      open();
    }
  }

  function onInputKeyDown(e) {
    const visible = visibleOptions();

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        if (root.dataset.state !== "open") open();
        highlightOption(highlightedIndex + 1);
        break;
      case "ArrowUp":
        e.preventDefault();
        if (root.dataset.state !== "open") open();
        highlightOption(highlightedIndex - 1);
        break;
      case "Enter":
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < visible.length) {
          selectOption(highlightedIndex);
        }
        break;
      case "Escape":
        e.preventDefault();
        close();
        break;
      case "Home":
        if (root.dataset.state === "open" && visible.length > 0) {
          e.preventDefault();
          highlightOption(0);
        }
        break;
      case "End":
        if (root.dataset.state === "open" && visible.length > 0) {
          e.preventDefault();
          highlightOption(visible.length - 1);
        }
        break;
    }
  }

  function onListboxClick(e) {
    const opt = e.target.closest("[data-part='option']");
    if (!opt) return;

    const visible = visibleOptions();
    const index = visible.indexOf(opt);
    if (index >= 0) {
      selectOption(index);
    }
  }

  input?.addEventListener("input", onInput);
  input?.addEventListener("focus", onInputFocus);
  input?.addEventListener("keydown", onInputKeyDown);
  listbox?.addEventListener("click", onListboxClick);

  function destroy() {
    input?.removeEventListener("input", onInput);
    input?.removeEventListener("focus", onInputFocus);
    input?.removeEventListener("keydown", onInputKeyDown);
    listbox?.removeEventListener("click", onListboxClick);
    if (outsideClickCleanup) outsideClickCleanup();
    delete root._faqirCombobox;
  }

  const api = { open, close, filter, selectOption, getValue, setValue, destroy };
  root._faqirCombobox = api;
  return api;
}
    return createCombobox;
  })();

  // ── command-palette ── (registry/recipes/command-palette/command-palette.js)
  var createCommandPalette = controllerRegistry["command-palette"] = (function() {
// @ui:controller command-palette
// @ui:provides open close filter selectItem registerCommand destroy

function createCommandPalette(root) {
  // Prevent double-init
  if (root._faqirCommandPalette) return root._faqirCommandPalette;

  const overlay = root.querySelector("[data-part='overlay']");
  const panel = root.querySelector("[data-part='panel']");
  const searchInput = root.querySelector("[data-part='search']");
  const list = root.querySelector("[data-part='list']");
  const emptyEl = root.querySelector("[data-part='empty']");
  const items = () =>
    [...root.querySelectorAll("[data-part='item']")];
  const groups = () =>
    [...root.querySelectorAll("[data-part='group']")];

  let highlightedIndex = -1;
  let focusCleanup = null;
  let previouslyFocused = null;
  const registeredCommands = [];

  function open() {
    previouslyFocused = document.activeElement;
    root.dataset.state = "open";
    overlay.hidden = false;
    panel.hidden = false;

    // Reset search and highlights
    searchInput.value = "";
    filter("");
    clearHighlight();

    focusCleanup = trapFocus(panel);
    searchInput.focus();
  }

  function close() {
    root.dataset.state = "closed";
    overlay.hidden = true;
    panel.hidden = true;

    if (focusCleanup) {
      focusCleanup();
      focusCleanup = null;
    }

    previouslyFocused?.focus();
  }

  function clearHighlight() {
    items().forEach((item) => {
      item.removeAttribute("data-highlighted");
      item.setAttribute("aria-selected", "false");
    });
    highlightedIndex = -1;
  }

  function visibleItems() {
    return items().filter((item) => !item.hasAttribute("data-hidden"));
  }

  function highlightItem(index) {
    const visible = visibleItems();
    if (visible.length === 0) return;

    // Clamp index
    if (index < 0) index = visible.length - 1;
    if (index >= visible.length) index = 0;

    // Clear previous
    items().forEach((item) => {
      item.removeAttribute("data-highlighted");
      item.setAttribute("aria-selected", "false");
    });

    visible[index].setAttribute("data-highlighted", "");
    visible[index].setAttribute("aria-selected", "true");
    visible[index].scrollIntoView({ block: "nearest" });
    highlightedIndex = index;
  }

  function filter(query) {
    const allItems = items();
    const allGroups = groups();
    const lowerQuery = query.toLowerCase();
    let totalVisible = 0;

    // Track visible items per group
    const groupVisibility = new Map();
    allGroups.forEach((g) => groupVisibility.set(g, 0));

    allItems.forEach((item) => {
      const label = item.querySelector("[data-part='item-label']");
      const text = (label || item).textContent.toLowerCase();

      if (text.includes(lowerQuery)) {
        item.removeAttribute("data-hidden");
        totalVisible++;
        // Find parent group
        const parentGroup = item.closest("[data-part='group']");
        if (parentGroup && groupVisibility.has(parentGroup)) {
          groupVisibility.set(parentGroup, groupVisibility.get(parentGroup) + 1);
        }
      } else {
        item.setAttribute("data-hidden", "");
      }
    });

    // Hide groups with no visible items
    allGroups.forEach((group) => {
      if (groupVisibility.get(group) === 0) {
        group.setAttribute("data-hidden", "");
      } else {
        group.removeAttribute("data-hidden");
      }
    });

    // Show/hide empty state
    if (emptyEl) {
      emptyEl.hidden = totalVisible > 0;
    }

    clearHighlight();

    return totalVisible;
  }

  function selectItem(index) {
    const visible = visibleItems();
    if (index < 0 || index >= visible.length) return;

    const item = visible[index];

    // Fire a custom event for the application to handle
    const event = new CustomEvent("command-select", {
      bubbles: true,
      detail: {
        item,
        label: item.querySelector("[data-part='item-label']")?.textContent || item.textContent
      }
    });
    root.dispatchEvent(event);

    // Check registered commands
    const label = (item.querySelector("[data-part='item-label']") || item).textContent.trim();
    const cmd = registeredCommands.find((c) => c.label === label);
    if (cmd?.action) cmd.action();

    close();
  }

  function registerCommand(cmd) {
    registeredCommands.push(cmd);
  }

  // ── Event Handlers ──

  function onSearchInput() {
    filter(searchInput.value);
  }

  function onSearchKeyDown(e) {
    const visible = visibleItems();

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        highlightItem(highlightedIndex + 1);
        break;
      case "ArrowUp":
        e.preventDefault();
        highlightItem(highlightedIndex - 1);
        break;
      case "Enter":
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < visible.length) {
          selectItem(highlightedIndex);
        }
        break;
      case "Escape":
        e.preventDefault();
        close();
        break;
      case "Home":
        if (visible.length > 0) {
          e.preventDefault();
          highlightItem(0);
        }
        break;
      case "End":
        if (visible.length > 0) {
          e.preventDefault();
          highlightItem(visible.length - 1);
        }
        break;
    }
  }

  function onOverlayClick() {
    close();
  }

  function onItemClick(e) {
    const item = e.target.closest("[data-part='item']");
    if (!item) return;

    const visible = visibleItems();
    const index = visible.indexOf(item);
    if (index >= 0) {
      selectItem(index);
    }
  }

  function onGlobalKeyDown(e) {
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault();
      if (root.dataset.state === "open") {
        close();
      } else {
        open();
      }
    }
  }

  searchInput?.addEventListener("input", onSearchInput);
  searchInput?.addEventListener("keydown", onSearchKeyDown);
  overlay?.addEventListener("click", onOverlayClick);
  list?.addEventListener("click", onItemClick);
  document.addEventListener("keydown", onGlobalKeyDown);

  function destroy() {
    searchInput?.removeEventListener("input", onSearchInput);
    searchInput?.removeEventListener("keydown", onSearchKeyDown);
    overlay?.removeEventListener("click", onOverlayClick);
    list?.removeEventListener("click", onItemClick);
    document.removeEventListener("keydown", onGlobalKeyDown);
    if (focusCleanup) focusCleanup();
    delete root._faqirCommandPalette;
  }

  const api = { open, close, filter, selectItem, registerCommand, destroy };
  root._faqirCommandPalette = api;
  return api;
}
    return createCommandPalette;
  })();

  // ── date-picker ── (registry/recipes/date-picker/date-picker.js)
  var createDatePicker = controllerRegistry["date-picker"] = (function() {
// @ui:controller date-picker
// @ui:provides open close getValue setValue navigate selectDate destroy

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function createDatePicker(root) {
  // Prevent double-init
  if (root._faqirDatePicker) return root._faqirDatePicker;

  const trigger = root.querySelector("[data-part='trigger']");
  const input = root.querySelector("[data-part='input']");
  const popup = root.querySelector("[data-part='calendar']");

  // The month grid is the standalone `calendar` recipe. Canonical markup nests
  // [data-ui="calendar"] inside the popup; legacy flat markup (grid parts
  // directly inside the popup) still works — the popup itself then acts as the
  // calendar root.
  const calendarRoot = root.querySelector("[data-ui='calendar']") || popup;
  const calendar = createCalendar(calendarRoot);

  const today = new Date();
  let outsideClickCleanup = null;

  function formatDisplay(date) {
    return `${MONTH_NAMES[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
  }

  function syncInput(dateStr, dateObj) {
    input.value = formatDisplay(dateObj);
    input.dataset.value = dateStr;
  }

  function open() {
    root.dataset.state = "open";
    popup.hidden = false;
    input.setAttribute("aria-expanded", "true");

    // Focus the selected day, or the first of the current month
    const value = calendar.getValue();
    const target = value
      ? new Date(value + "T00:00:00")
      : new Date(today.getFullYear(), today.getMonth(), 1);
    calendar.focusDate(target);

    outsideClickCleanup = onOutsideClick(root, close);
  }

  function close() {
    root.dataset.state = "closed";
    popup.hidden = true;
    input.setAttribute("aria-expanded", "false");

    if (outsideClickCleanup) {
      outsideClickCleanup();
      outsideClickCleanup = null;
    }
  }

  function selectDate(date) {
    // Delegates to the calendar; input update, close and the faqir:date-change
    // re-emit all happen in onCalendarChange.
    calendar.selectDate(date);
  }

  function getValue() {
    return calendar.getValue();
  }

  function setValue(dateStr) {
    const parsed = new Date(dateStr + "T00:00:00");
    if (!isNaN(parsed.getTime())) {
      calendar.setValue(dateStr);
      syncInput(dateStr, parsed);
    }
  }

  function navigate(month, year) {
    calendar.navigate(month, year);
  }

  // Event: calendar selection committed
  function onCalendarChange(e) {
    if (!e.detail || !e.detail.date) return;
    syncInput(e.detail.date, e.detail.dateObj);
    close();
    input.focus();

    root.dispatchEvent(
      new CustomEvent("faqir:date-change", {
        detail: { date: e.detail.date, dateObj: e.detail.dateObj },
        bubbles: true,
      })
    );
  }

  // Event: trigger/input click
  function onTriggerClick() {
    if (root.dataset.state === "open") {
      close();
    } else {
      open();
    }
  }

  // Event: escape on root (bubbles up from the calendar grid too)
  function onRootKeyDown(e) {
    if (e.key === "Escape" && root.dataset.state === "open") {
      e.preventDefault();
      close();
      input.focus();
    }
  }

  trigger?.addEventListener("click", onTriggerClick);
  root.addEventListener("faqir:calendar-change", onCalendarChange);
  root.addEventListener("keydown", onRootKeyDown);

  function destroy() {
    trigger?.removeEventListener("click", onTriggerClick);
    root.removeEventListener("faqir:calendar-change", onCalendarChange);
    root.removeEventListener("keydown", onRootKeyDown);
    if (outsideClickCleanup) outsideClickCleanup();
    calendar.destroy();
    delete root._faqirDatePicker;
  }

  const api = { open, close, getValue, setValue, navigate, selectDate, destroy };
  root._faqirDatePicker = api;
  return api;
}
    return createDatePicker;
  })();

  // ── dialog ── (registry/recipes/dialog/dialog.js)
  var createDialog = controllerRegistry["dialog"] = (function() {
// @ui:controller dialog
// @ui:provides open close toggle destroy

/**
 * Shared modal-dialog controller.
 *
 * It drives both the `dialog` recipe and the `alert-dialog` recipe — the two are
 * one controller, distinguished only by the panel's ARIA role. When the panel
 * declares `role="alertdialog"` the controller switches to the WAI-ARIA
 * alertdialog contract:
 *   - the overlay backdrop does NOT dismiss (only an explicit choice closes it);
 *   - focus lands on the least-destructive action (cancel/close), not the panel;
 *   - Escape still closes by default, but a `data-confirm-required` root traps it
 *     so the user must pick confirm or cancel;
 *   - the footer's `[data-part="confirm"]` / `[data-part="cancel"]` actions emit
 *     cancelable `faqir:confirm` / `faqir:cancel` events (a prevented confirm
 *     keeps the dialog open for async work).
 * A plain `role="dialog"` panel behaves exactly as before.
 */
function createDialog(root) {
  // Prevent double-init
  if (root._faqirDialog) return root._faqirDialog;

  const trigger = root.querySelector("[data-part='trigger']");
  const overlay = root.querySelector("[data-part='overlay']");
  const panel = root.querySelector("[data-part='panel']");
  const closeButtons = root.querySelectorAll("[data-part='close']");
  const confirmButtons = root.querySelectorAll("[data-part='confirm']");
  const cancelButtons = root.querySelectorAll("[data-part='cancel']");

  // The role is the seam between `dialog` and `alert-dialog` — read it from the
  // markup so a single controller serves both recipes.
  const isAlert = !!panel && panel.getAttribute("role") === "alertdialog";

  let focusCleanup = null;
  let previouslyFocused = null;

  /** A confirm-required alertdialog traps Escape/overlay until an action is taken. */
  function confirmRequired() {
    return isAlert && root.hasAttribute("data-confirm-required");
  }

  /** Emit a cancelable, bubbling `faqir:<type>` event; returns the event. */
  function emit(type, detail) {
    const event = new CustomEvent("faqir:" + type, {
      bubbles: true,
      cancelable: true,
      detail: detail || {},
    });
    root.dispatchEvent(event);
    return event;
  }

  /** On open, focus the least-destructive action for an alert, else the panel. */
  function focusInitial() {
    if (isAlert) {
      const target =
        root.querySelector("[data-part='cancel']") ||
        root.querySelector("[data-part='close']") ||
        panel;
      target?.focus?.();
    } else {
      panel?.focus?.();
    }
  }

  function open() {
    previouslyFocused = document.activeElement;
    root.dataset.state = "open";
    overlay.hidden = false;
    panel.hidden = false;
    focusCleanup = trapFocus(panel);
    focusInitial();
  }

  function close() {
    root.dataset.state = "closing";

    const onEnd = () => {
      root.dataset.state = "closed";
      overlay.hidden = true;
      panel.hidden = true;
      if (focusCleanup) focusCleanup();
      focusCleanup = null;
      previouslyFocused?.focus();
      panel.removeEventListener("animationend", onEnd);
      panel.removeEventListener("transitionend", onEnd);
    };

    // If no animation, close immediately
    let hasAnimation = false;
    try {
      const style = getComputedStyle(panel);
      const animName = style.animationName || "none";
      const animDur = parseFloat(style.animationDuration) || 0;
      const transDur = parseFloat(style.transitionDuration) || 0;
      hasAnimation = (animName !== "none" && animDur > 0) || transDur > 0;
    } catch {
      // getComputedStyle may not be available in test environments
    }

    if (hasAnimation) {
      panel.addEventListener("animationend", onEnd, { once: true });
      panel.addEventListener("transitionend", onEnd, { once: true });
    } else {
      onEnd();
    }
  }

  function toggle() {
    root.dataset.state === "open" ? close() : open();
  }

  // Event listeners
  function onTriggerClick() {
    open();
  }
  function onOverlayClick() {
    close();
  }
  // In alert mode, dismissing without confirming is a cancel; the plain dialog
  // just closes.
  function onCloseClick() {
    if (isAlert) emit("cancel", { reason: "close" });
    close();
  }
  function onCancelClick() {
    emit("cancel", { reason: "cancel" });
    close();
  }
  function onConfirmClick() {
    const variant =
      panel?.getAttribute("data-variant") ||
      root.getAttribute("data-variant") ||
      "default";
    const event = emit("confirm", { variant });
    // A handler may keep the dialog open (e.g. to await a destructive request)
    // by calling preventDefault() on the confirm event.
    if (!event.defaultPrevented) close();
  }
  function onKeyDown(e) {
    if (e.key === "Escape" && root.dataset.state === "open") {
      // WAI-ARIA allows Escape to close an alertdialog, but a confirm-required
      // variant traps it so the user must make an explicit choice.
      if (confirmRequired()) {
        e.stopPropagation();
        return;
      }
      e.stopPropagation();
      if (isAlert) emit("cancel", { reason: "escape" });
      close();
    }
  }

  trigger?.addEventListener("click", onTriggerClick);
  // An alertdialog must not dismiss on overlay click — only an explicit choice
  // closes it — so the overlay handler is bound for plain dialogs only.
  if (!isAlert) overlay?.addEventListener("click", onOverlayClick);
  closeButtons.forEach((btn) => btn.addEventListener("click", onCloseClick));
  confirmButtons.forEach((btn) => btn.addEventListener("click", onConfirmClick));
  cancelButtons.forEach((btn) => btn.addEventListener("click", onCancelClick));
  root.addEventListener("keydown", onKeyDown);

  // Support external triggers: any element with [data-open="{dialog-id}"]
  const externalTriggers = root.id
    ? document.querySelectorAll(`[data-open="${root.id}"]`)
    : [];
  if (externalTriggers.length) {
    externalTriggers.forEach((el) =>
      el.addEventListener("click", onTriggerClick)
    );
  }

  function destroy() {
    trigger?.removeEventListener("click", onTriggerClick);
    if (!isAlert) overlay?.removeEventListener("click", onOverlayClick);
    closeButtons.forEach((btn) =>
      btn.removeEventListener("click", onCloseClick)
    );
    confirmButtons.forEach((btn) =>
      btn.removeEventListener("click", onConfirmClick)
    );
    cancelButtons.forEach((btn) =>
      btn.removeEventListener("click", onCancelClick)
    );
    root.removeEventListener("keydown", onKeyDown);
    if (externalTriggers.length) {
      externalTriggers.forEach((el) =>
        el.removeEventListener("click", onTriggerClick)
      );
    }
    if (focusCleanup) focusCleanup();
    delete root._faqirDialog;
  }

  const api = { open, close, toggle, destroy };
  root._faqirDialog = api;
  return api;
}
    return createDialog;
  })();

  // ── drawer ── (registry/recipes/drawer/drawer.js)
  var createDrawer = controllerRegistry["drawer"] = (function() {
// @ui:controller drawer
// @ui:provides open close toggle destroy

function createDrawer(root) {
  // Prevent double-init
  if (root._faqirDrawer) return root._faqirDrawer;

  const trigger = root.querySelector("[data-part='trigger']");
  const overlay = root.querySelector("[data-part='overlay']");
  const panel = root.querySelector("[data-part='panel']");
  const closeButtons = root.querySelectorAll("[data-part='close']");

  let focusCleanup = null;
  let previouslyFocused = null;

  function open() {
    previouslyFocused = document.activeElement;
    root.dataset.state = "open";
    overlay.hidden = false;
    panel.hidden = false;
    focusCleanup = trapFocus(panel);
    panel.focus?.();
  }

  function close() {
    root.dataset.state = "closing";

    const onEnd = () => {
      root.dataset.state = "closed";
      overlay.hidden = true;
      panel.hidden = true;
      if (focusCleanup) focusCleanup();
      focusCleanup = null;
      previouslyFocused?.focus();
      panel.removeEventListener("transitionend", onTransEnd);
    };

    // Listen for transition end on the panel slide
    let hasTransition = false;
    try {
      const style = getComputedStyle(panel);
      const transDur = parseFloat(style.transitionDuration) || 0;
      hasTransition = transDur > 0;
    } catch {
      // getComputedStyle may not be available in test environments
    }

    const onTransEnd = (e) => {
      if (e.propertyName === "transform") onEnd();
    };

    if (hasTransition) {
      panel.addEventListener("transitionend", onTransEnd, { once: true });
    } else {
      onEnd();
    }
  }

  function toggle() {
    root.dataset.state === "open" ? close() : open();
  }

  // Event listeners
  function onTriggerClick() {
    open();
  }

  function onOverlayClick() {
    close();
  }

  function onCloseClick() {
    close();
  }

  function onKeyDown(e) {
    if (e.key === "Escape" && root.dataset.state === "open") {
      e.stopPropagation();
      close();
    }
  }

  trigger?.addEventListener("click", onTriggerClick);
  overlay?.addEventListener("click", onOverlayClick);
  closeButtons.forEach((btn) => btn.addEventListener("click", onCloseClick));
  root.addEventListener("keydown", onKeyDown);

  // Support external triggers: any element with [data-open="{drawer-id}"]
  const externalTriggers = root.id
    ? document.querySelectorAll(`[data-open="${root.id}"]`)
    : [];
  if (externalTriggers.length) {
    externalTriggers.forEach((el) =>
      el.addEventListener("click", onTriggerClick)
    );
  }

  function destroy() {
    trigger?.removeEventListener("click", onTriggerClick);
    overlay?.removeEventListener("click", onOverlayClick);
    closeButtons.forEach((btn) =>
      btn.removeEventListener("click", onCloseClick)
    );
    root.removeEventListener("keydown", onKeyDown);
    if (externalTriggers.length) {
      externalTriggers.forEach((el) =>
        el.removeEventListener("click", onTriggerClick)
      );
    }
    if (focusCleanup) focusCleanup();
    delete root._faqirDrawer;
  }

  const api = { open, close, toggle, destroy };
  root._faqirDrawer = api;
  return api;
}
    return createDrawer;
  })();

  // ── dropdown ── (registry/recipes/dropdown/dropdown.js)
  var createDropdown = controllerRegistry["dropdown"] = (function() {
// @ui:controller dropdown
// @ui:provides open close toggle destroy

function createDropdown(root) {
  // Prevent double-init
  if (root._faqirDropdown) return root._faqirDropdown;

  const trigger = root.querySelector("[data-part='trigger']");
  const menu = root.querySelector("[data-part='menu']");
  const items = () =>
    [...root.querySelectorAll("[data-part='item']:not(:disabled)")];

  let outsideClickCleanup = null;

  function open() {
    root.dataset.state = "open";
    menu.hidden = false;
    trigger.setAttribute("aria-expanded", "true");

    // Focus first item
    const allItems = items();
    if (allItems.length > 0) allItems[0].focus();

    // Close on outside click
    outsideClickCleanup = onOutsideClick(root, close);
  }

  function close() {
    root.dataset.state = "closed";
    menu.hidden = true;
    trigger.setAttribute("aria-expanded", "false");

    if (outsideClickCleanup) {
      outsideClickCleanup();
      outsideClickCleanup = null;
    }

    trigger.focus();
  }

  function toggle() {
    root.dataset.state === "open" ? close() : open();
  }

  function focusItem(index) {
    const allItems = items();
    if (index < 0 || index >= allItems.length) return;
    allItems[index].focus();
  }

  function getFocusedIndex() {
    const allItems = items();
    return allItems.indexOf(document.activeElement);
  }

  function onTriggerClick() {
    toggle();
  }

  function onTriggerKeyDown(e) {
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      if (root.dataset.state !== "open") {
        e.preventDefault();
        open();
      }
    }
  }

  function onMenuKeyDown(e) {
    const allItems = items();
    const current = getFocusedIndex();

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        focusItem((current + 1) % allItems.length);
        break;
      case "ArrowUp":
        e.preventDefault();
        focusItem((current - 1 + allItems.length) % allItems.length);
        break;
      case "Home":
        e.preventDefault();
        focusItem(0);
        break;
      case "End":
        e.preventDefault();
        focusItem(allItems.length - 1);
        break;
      case "Escape":
        e.preventDefault();
        close();
        break;
      case "Tab":
        close();
        break;
    }
  }

  function onItemClick() {
    close();
  }

  trigger?.addEventListener("click", onTriggerClick);
  trigger?.addEventListener("keydown", onTriggerKeyDown);
  menu?.addEventListener("keydown", onMenuKeyDown);

  // Delegate item clicks
  menu?.addEventListener("click", (e) => {
    const item = e.target.closest("[data-part='item']");
    if (item && !item.disabled) onItemClick();
  });

  function destroy() {
    trigger?.removeEventListener("click", onTriggerClick);
    trigger?.removeEventListener("keydown", onTriggerKeyDown);
    menu?.removeEventListener("keydown", onMenuKeyDown);
    if (outsideClickCleanup) outsideClickCleanup();
    delete root._faqirDropdown;
  }

  const api = { open, close, toggle, destroy };
  root._faqirDropdown = api;
  return api;
}
    return createDropdown;
  })();

  // ── input-otp ── (registry/recipes/input-otp/input-otp.js)
  var createInputOTP = controllerRegistry["input-otp"] = (function() {
// @ui:controller input-otp
// @ui:provides getValue setValue clear focus destroy

/**
 * input-otp — segmented one-time-code entry.
 *
 * ── Approach: ONE real input, N presentational segments ─────────────────────
 * The widget is a single, real `<input data-part="input">` stretched over a row
 * of decorative `[data-part="segment"]` boxes. The input is transparent (text,
 * caret and background) and sits on top, so every keystroke, paste, selection,
 * IME composition and — crucially — mobile SMS autofill goes through native form
 * machinery. The segments are `aria-hidden` and merely mirror the input's value.
 *
 * Why not one `<input>` per segment? Because the single-input design wins on the
 * exact axes this recipe is judged on:
 *
 *   • Paste — the browser inserts pasted text at the caret for free; we only have
 *     to strip characters that don't fit the mode. N separate inputs would each
 *     have to re-split and redistribute a paste by hand, and browsers deliver a
 *     multi-character paste inconsistently across split fields.
 *   • Screen readers — one labelled field announces as "One-time code, edit text"
 *     instead of N adjacent "1 of 6 … 2 of 6" edit boxes, which is far less
 *     confusing. WAI has no dedicated OTP pattern; an OTP field IS a text input,
 *     so we keep it a text input and give it a name + autocomplete.
 *   • Mobile autofill — iOS/Android surface the SMS code for `inputmode` +
 *     `autocomplete="one-time-code"` on a SINGLE field; across N fields only the
 *     first is offered the value and the rest are never populated.
 *
 * ── What the controller owns ────────────────────────────────────────────────
 * Runtime state only. It never fetches, never routes, never touches classes. It
 * reflects the input's value onto the segments (`data-filled`), marks the caret
 * segment (`data-active` / `data-caret`), and sets `data-state="complete"` on the
 * root when full. Typing/backspace/paste are handled explicitly so behaviour is
 * identical across browsers (and unit-testable without native text editing), while
 * a catch-all `input` listener still absorbs autofill / IME that arrives whole.
 *
 * Events (bubbling): `faqir:change` on every value change (`detail.value`), and
 * `faqir:complete` exactly once per completion — fired on the not-full → full
 * transition, re-armed only after the value drops below full again.
 */
function createInputOTP(root) {
  // Idempotent: a second init returns the existing API.
  if (root._faqirInputOTP) return root._faqirInputOTP;

  const N = clampInt(root.getAttribute("data-length"), 6, 1, 12);
  const mode = root.getAttribute("data-mode") === "alphanumeric" ? "alphanumeric" : "numeric";

  // ── Resolve / normalize the real input ─────────────────────────────────────
  let input = root.querySelector("[data-part='input']");
  if (!input) {
    input = document.createElement("input");
    input.setAttribute("data-part", "input");
    input.setAttribute("type", "text");
    root.insertBefore(input, root.firstChild);
  }
  input.setAttribute("maxlength", String(N));
  try {
    input.maxLength = N;
  } catch {
    /* some environments make maxLength read-only on detached nodes — attribute suffices */
  }
  // Mobile-friendly defaults — authors may override in markup.
  if (!input.getAttribute("inputmode")) {
    input.setAttribute("inputmode", mode === "numeric" ? "numeric" : "text");
  }
  if (!input.getAttribute("autocomplete")) input.setAttribute("autocomplete", "one-time-code");
  if (!input.hasAttribute("aria-label") && !input.hasAttribute("aria-labelledby")) {
    input.setAttribute("aria-label", "One-time code");
  }
  input.setAttribute("autocapitalize", "off");
  input.setAttribute("autocorrect", "off");
  input.setAttribute("spellcheck", "false");
  if (mode === "numeric" && !input.hasAttribute("pattern")) input.setAttribute("pattern", "[0-9]*");
  if (isDisabled()) input.disabled = true;

  // ── Resolve / normalize the segment row ────────────────────────────────────
  let container = root.querySelector("[data-part='segments']");
  if (!container) {
    container = document.createElement("div");
    container.setAttribute("data-part", "segments");
    root.appendChild(container);
  }
  // Segments are decorative — the real input is the accessible control.
  container.setAttribute("aria-hidden", "true");

  let segments = [...container.querySelectorAll("[data-part='segment']")];
  if (segments.length !== N) {
    // data-length is authoritative: rebuild the row to match it exactly.
    container.textContent = "";
    segments = [];
    for (let i = 0; i < N; i++) {
      const seg = document.createElement("div");
      seg.setAttribute("data-part", "segment");
      container.appendChild(seg);
      segments.push(seg);
    }
  }

  // ── Value plumbing ──────────────────────────────────────────────────────────
  let focused = false;
  let wasComplete = false;
  let lastValue = "";

  function isDisabled() {
    return root.hasAttribute("data-disabled");
  }

  function charOk(ch) {
    return mode === "alphanumeric" ? /[a-z0-9]/i.test(ch) : /[0-9]/.test(ch);
  }

  /** Keep only mode-legal characters (no length cap — callers cap to N). */
  function filter(str) {
    let out = "";
    for (const ch of String(str == null ? "" : str)) if (charOk(ch)) out += ch;
    return out;
  }

  /** Paint segments + caret from the input's current value. No events. */
  function refresh() {
    const val = input.value;
    for (let i = 0; i < N; i++) {
      const ch = val[i];
      const seg = segments[i];
      if (ch != null) {
        seg.textContent = ch;
        seg.setAttribute("data-filled", "");
      } else {
        seg.textContent = "";
        seg.removeAttribute("data-filled");
      }
    }
    if (val.length === N) root.setAttribute("data-state", "complete");
    else root.removeAttribute("data-state");
    updateActive();
  }

  /** Mark the caret segment (collapsed) or the selected span (range). */
  function updateActive() {
    for (const seg of segments) {
      seg.removeAttribute("data-active");
      seg.removeAttribute("data-caret");
    }
    if (!focused || isDisabled()) return;

    const len = input.value.length;
    let start = input.selectionStart;
    let end = input.selectionEnd;
    if (start == null) start = len;
    if (end == null) end = start;

    if (start !== end) {
      for (let i = start; i < end && i < N; i++) segments[i]?.setAttribute("data-active", "");
      return;
    }
    const idx = Math.min(start, N - 1);
    const seg = segments[idx];
    if (!seg) return;
    seg.setAttribute("data-active", "");
    // Blink a caret only in the next-to-fill empty slot — the crisp OTP look.
    if (start === len && len < N) seg.setAttribute("data-caret", "");
  }

  function emit(type, detail) {
    root.dispatchEvent(new CustomEvent("faqir:" + type, { bubbles: true, detail }));
  }

  /** Repaint, then fire change / complete based on the transition. */
  function syncAndEmit() {
    refresh();
    const val = input.value;
    if (val !== lastValue) {
      lastValue = val;
      emit("change", { value: val });
    }
    const complete = val.length === N;
    if (complete && !wasComplete) {
      wasComplete = true;
      emit("complete", { value: val });
    } else if (!complete) {
      wasComplete = false;
    }
  }

  /** The single write seam: set value + caret, then sync/emit. */
  function commit(next, caret) {
    input.value = next;
    const c = caret == null ? next.length : Math.max(0, Math.min(caret, next.length));
    try {
      input.setSelectionRange(c, c);
    } catch {
      /* selection API unavailable on this input type/env — value is still correct */
    }
    syncAndEmit();
  }

  /** Insert mode-legal text at the caret, replacing any selection, capped at N. */
  function insertText(text) {
    const clean = filter(text);
    if (!clean) return;
    const val = input.value;
    let start = input.selectionStart;
    let end = input.selectionEnd;
    if (start == null) start = val.length;
    if (end == null) end = start;
    const next = (val.slice(0, start) + clean + val.slice(end)).slice(0, N);
    commit(next, start + clean.length);
  }

  function setCaret(pos) {
    const c = Math.max(0, Math.min(pos, input.value.length));
    try {
      input.setSelectionRange(c, c);
    } catch {
      /* ignore */
    }
    updateActive();
  }

  // ── Keyboard: explicit, deterministic editing ──────────────────────────────
  function onKeyDown(e) {
    if (isDisabled()) return;
    // Copy / paste / select-all / undo — let the browser + paste handler run.
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    focused = true;
    const val = input.value;
    let start = input.selectionStart;
    let end = input.selectionEnd;
    if (start == null) start = val.length;
    if (end == null) end = start;

    switch (e.key) {
      case "Backspace":
        e.preventDefault();
        if (start !== end) commit(val.slice(0, start) + val.slice(end), start);
        else if (start > 0) commit(val.slice(0, start - 1) + val.slice(start), start - 1);
        else updateActive();
        return;
      case "Delete":
        e.preventDefault();
        if (start !== end) commit(val.slice(0, start) + val.slice(end), start);
        else commit(val.slice(0, start) + val.slice(start + 1), start);
        return;
      case "ArrowLeft":
        e.preventDefault();
        // Collapsed caret steps left; a selection collapses to its start.
        setCaret(start === end ? start - 1 : start);
        return;
      case "ArrowRight":
        e.preventDefault();
        // Collapsed caret steps right; a selection collapses to its end.
        setCaret(start === end ? end + 1 : end);
        return;
      case "Home":
        e.preventDefault();
        setCaret(0);
        return;
      case "End":
        e.preventDefault();
        setCaret(val.length);
        return;
      default:
        // A single printable character — insert it (invalid chars are dropped).
        if (e.key.length === 1) {
          e.preventDefault();
          insertText(e.key);
        }
        // Everything else (Tab, Shift, arrows with modifiers, F-keys) passes through.
    }
  }

  // ── Paste: native cursor semantics, we only sanitize ───────────────────────
  function onPaste(e) {
    if (isDisabled()) return;
    e.preventDefault();
    focused = true;
    const data = e.clipboardData || (typeof window !== "undefined" && window.clipboardData);
    const text = data && typeof data.getData === "function" ? data.getData("text") : "";
    insertText(text);
  }

  // ── Catch-all: autofill / IME / anything not intercepted above ─────────────
  function onInput() {
    if (isDisabled()) return;
    focused = true;
    const clean = filter(input.value).slice(0, N);
    if (clean !== input.value) {
      const pos = Math.min(input.selectionStart == null ? clean.length : input.selectionStart, clean.length);
      commit(clean, pos);
    } else {
      syncAndEmit();
    }
  }

  function onFocus() {
    focused = true;
    // Predictable caret: land on the next-to-fill slot unless mid-editing.
    if (input.selectionStart === input.selectionEnd) setCaret(input.value.length);
    else updateActive();
  }
  function onBlur() {
    focused = false;
    updateActive();
  }
  function onClick() {
    focused = true;
    // Segments are pointer-events:none, so the click already hit the input;
    // snap the caret to the end for a consistent active segment.
    setCaret(input.value.length);
  }
  function onSelectionChange() {
    if (typeof document !== "undefined" && document.activeElement === input) updateActive();
  }

  input.addEventListener("keydown", onKeyDown);
  input.addEventListener("paste", onPaste);
  input.addEventListener("input", onInput);
  input.addEventListener("focus", onFocus);
  input.addEventListener("blur", onBlur);
  input.addEventListener("click", onClick);
  if (typeof document !== "undefined") document.addEventListener("selectionchange", onSelectionChange);

  // ── Seed from data-value / existing input value, silently (no events) ───────
  {
    const seed = filter(input.value || root.getAttribute("data-value") || "").slice(0, N);
    input.value = seed;
    lastValue = seed;
    wasComplete = seed.length === N;
    refresh();
  }

  // ── Public API ──────────────────────────────────────────────────────────────
  function getValue() {
    return input.value;
  }
  /** Programmatic set — silent (does not fire change/complete). */
  function setValue(str) {
    const clean = filter(str).slice(0, N);
    input.value = clean;
    lastValue = clean;
    wasComplete = clean.length === N;
    refresh();
  }
  function clear() {
    setValue("");
  }
  function focus() {
    try {
      input.focus();
    } catch {
      /* ignore */
    }
  }

  function destroy() {
    input.removeEventListener("keydown", onKeyDown);
    input.removeEventListener("paste", onPaste);
    input.removeEventListener("input", onInput);
    input.removeEventListener("focus", onFocus);
    input.removeEventListener("blur", onBlur);
    input.removeEventListener("click", onClick);
    if (typeof document !== "undefined") document.removeEventListener("selectionchange", onSelectionChange);
    delete root._faqirInputOTP;
  }

  const api = { getValue, setValue, clear, focus, destroy };
  root._faqirInputOTP = api;
  return api;
}

// Parse an integer attribute, clamped to [lo, hi], with a fallback.
function clampInt(raw, fallback, lo, hi) {
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(lo, Math.min(hi, n));
}
    return createInputOTP;
  })();

  // ── pagination ── (registry/recipes/pagination/pagination.js)
  var createPagination = controllerRegistry["pagination"] = (function() {
// @ui:controller pagination
// @ui:provides setPage getPage setTotal destroy

function createPagination(root) {
  // Prevent double-init
  if (root._faqirPagination) return root._faqirPagination;

  const nav = root.querySelector("[data-part='nav']");
  const prevBtn = root.querySelector("[data-part='prev']");
  const nextBtn = root.querySelector("[data-part='next']");

  let currentPage = 1;
  let totalPages = 1;

  // Initialize from existing DOM
  const activeBtn = root.querySelector("[data-part='page'][data-state='active']");
  if (activeBtn) {
    currentPage = parseInt(activeBtn.dataset.page, 10) || 1;
  }

  const allPageBtns = root.querySelectorAll("[data-part='page']");
  if (allPageBtns.length > 0) {
    const lastBtn = allPageBtns[allPageBtns.length - 1];
    totalPages = parseInt(lastBtn.dataset.page, 10) || 1;
  }

  function getPageButtons() {
    return [...root.querySelectorAll("[data-part='page']")];
  }

  function updateActiveState() {
    getPageButtons().forEach((btn) => {
      const page = parseInt(btn.dataset.page, 10);
      if (page === currentPage) {
        btn.dataset.state = "active";
        btn.setAttribute("aria-current", "page");
      } else {
        delete btn.dataset.state;
        btn.removeAttribute("aria-current");
      }
    });

    // Update prev/next disabled state
    if (prevBtn) {
      prevBtn.disabled = currentPage <= 1;
    }
    if (nextBtn) {
      nextBtn.disabled = currentPage >= totalPages;
    }
  }

  function emitPageChange() {
    root.dispatchEvent(
      new CustomEvent("faqir:page-change", {
        detail: { page: currentPage },
        bubbles: true,
      })
    );
  }

  function setPage(n) {
    const page = Math.max(1, Math.min(n, totalPages));
    if (page === currentPage) return;
    currentPage = page;
    updateActiveState();
    emitPageChange();
  }

  function getPage() {
    return currentPage;
  }

  function setTotal(n) {
    totalPages = Math.max(1, n);
    if (currentPage > totalPages) {
      currentPage = totalPages;
    }
    updateActiveState();
  }

  // Event: click on page button
  function onNavClick(e) {
    const pageBtn = e.target.closest("[data-part='page']");
    if (pageBtn) {
      const page = parseInt(pageBtn.dataset.page, 10);
      if (!isNaN(page)) {
        setPage(page);
      }
      return;
    }
  }

  function onPrevClick() {
    if (currentPage > 1) {
      setPage(currentPage - 1);
    }
  }

  function onNextClick() {
    if (currentPage < totalPages) {
      setPage(currentPage + 1);
    }
  }

  nav?.addEventListener("click", onNavClick);
  prevBtn?.addEventListener("click", onPrevClick);
  nextBtn?.addEventListener("click", onNextClick);

  // Initialize disabled states
  updateActiveState();

  function destroy() {
    nav?.removeEventListener("click", onNavClick);
    prevBtn?.removeEventListener("click", onPrevClick);
    nextBtn?.removeEventListener("click", onNextClick);
    delete root._faqirPagination;
  }

  const api = { setPage, getPage, setTotal, destroy };
  root._faqirPagination = api;
  return api;
}
    return createPagination;
  })();

  // ── popover ── (registry/recipes/popover/popover.js)
  var createPopover = controllerRegistry["popover"] = (function() {
// @ui:controller popover
// @ui:provides open close toggle destroy

function createPopover(root) {
  // Prevent double-init
  if (root._faqirPopover) return root._faqirPopover;

  const trigger = root.querySelector("[data-part='trigger']");
  const content = root.querySelector("[data-part='content']");
  const closeBtn = root.querySelector("[data-part='close']");

  let outsideClickCleanup = null;

  function open() {
    root.dataset.state = "open";
    content.hidden = false;
    trigger.setAttribute("aria-expanded", "true");

    // Close on outside click
    outsideClickCleanup = onOutsideClick(root, close);
  }

  function close() {
    root.dataset.state = "closed";
    content.hidden = true;
    trigger.setAttribute("aria-expanded", "false");

    if (outsideClickCleanup) {
      outsideClickCleanup();
      outsideClickCleanup = null;
    }
  }

  function toggle() {
    root.dataset.state === "open" ? close() : open();
  }

  // Event: trigger click toggles
  function onTriggerClick() {
    toggle();
  }

  // Event: close button
  function onCloseClick(e) {
    e.stopPropagation();
    close();
  }

  // Event: escape closes
  function onKeyDown(e) {
    if (e.key === "Escape" && root.dataset.state === "open") {
      e.preventDefault();
      close();
      trigger.focus();
    }
  }

  trigger?.addEventListener("click", onTriggerClick);
  closeBtn?.addEventListener("click", onCloseClick);
  root.addEventListener("keydown", onKeyDown);

  function destroy() {
    trigger?.removeEventListener("click", onTriggerClick);
    closeBtn?.removeEventListener("click", onCloseClick);
    root.removeEventListener("keydown", onKeyDown);
    if (outsideClickCleanup) outsideClickCleanup();
    delete root._faqirPopover;
  }

  const api = { open, close, toggle, destroy };
  root._faqirPopover = api;
  return api;
}
    return createPopover;
  })();

  // ── qr-code ── (registry/recipes/qr-code/qr-code.js)
  var createQRCode = controllerRegistry["qr-code"] = (function() {
// @ui:controller qr-code
// @ui:provides render update destroy

/**
 * Minimal QR Code encoder (byte mode, versions 1–10).
 * Produces a boolean matrix suitable for SVG rendering.
 * Covers most practical use-cases (URLs, short text up to ~170 chars at ECL-M).
 */

// ── GF(256) arithmetic for Reed-Solomon ──

const EXP = new Uint8Array(256);
const LOG = new Uint8Array(256);
(() => {
  let v = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = v;
    LOG[v] = i;
    v = (v << 1) ^ (v & 128 ? 0x11d : 0);
  }
  EXP[255] = EXP[0];
})();

function gfMul(a, b) {
  return a === 0 || b === 0 ? 0 : EXP[(LOG[a] + LOG[b]) % 255];
}

function rsGenPoly(n) {
  let poly = [1];
  for (let i = 0; i < n; i++) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], EXP[i]);
    }
    poly = next;
  }
  return poly;
}

function rsEncode(data, ecLen) {
  const gen = rsGenPoly(ecLen);
  const msg = new Array(data.length + ecLen).fill(0);
  data.forEach((v, i) => (msg[i] = v));
  for (let i = 0; i < data.length; i++) {
    const coef = msg[i];
    if (coef !== 0) {
      for (let j = 0; j < gen.length; j++) {
        msg[i + j] ^= gfMul(gen[j], coef);
      }
    }
  }
  return msg.slice(data.length);
}

// ── QR constants ──

const ECL_MAP = { L: 0, M: 1, Q: 2, H: 3 };

// [version][ecl] → { totalBytes, ecPerBlock, blocks }
const VERSION_TABLE = [
  null, // index 0 unused
  // v1
  [{ dc: 19, ec: 7, b: 1 }, { dc: 16, ec: 10, b: 1 }, { dc: 13, ec: 13, b: 1 }, { dc: 9, ec: 17, b: 1 }],
  // v2
  [{ dc: 34, ec: 10, b: 1 }, { dc: 28, ec: 16, b: 1 }, { dc: 22, ec: 22, b: 1 }, { dc: 16, ec: 28, b: 1 }],
  // v3
  [{ dc: 55, ec: 15, b: 1 }, { dc: 44, ec: 26, b: 1 }, { dc: 34, ec: 18, b: 2 }, { dc: 26, ec: 22, b: 2 }],
  // v4
  [{ dc: 80, ec: 20, b: 1 }, { dc: 64, ec: 18, b: 2 }, { dc: 48, ec: 26, b: 2 }, { dc: 36, ec: 16, b: 4 }],
  // v5
  [{ dc: 108, ec: 26, b: 1 }, { dc: 86, ec: 24, b: 2 }, { dc: 62, ec: 18, b: 4 }, { dc: 46, ec: 22, b: 4 }],
  // v6
  [{ dc: 136, ec: 18, b: 2 }, { dc: 108, ec: 16, b: 4 }, { dc: 76, ec: 24, b: 4 }, { dc: 60, ec: 28, b: 4 }],
  // v7
  [{ dc: 156, ec: 20, b: 2 }, { dc: 124, ec: 18, b: 4 }, { dc: 88, ec: 18, b: 6 }, { dc: 66, ec: 26, b: 5 }],
  // v8
  [{ dc: 194, ec: 24, b: 2 }, { dc: 154, ec: 22, b: 4 }, { dc: 110, ec: 22, b: 6 }, { dc: 86, ec: 26, b: 6 }],
  // v9
  [{ dc: 232, ec: 30, b: 2 }, { dc: 182, ec: 22, b: 5 }, { dc: 132, ec: 20, b: 8 }, { dc: 98, ec: 24, b: 8 }],
  // v10
  [{ dc: 274, ec: 18, b: 4 }, { dc: 216, ec: 26, b: 5 }, { dc: 154, ec: 24, b: 8 }, { dc: 119, ec: 28, b: 8 }],
];

const ALIGNMENT_POSITIONS = [
  null, [], [6, 18], [6, 22], [6, 26], [6, 30],
  [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50],
];

function selectVersion(dataLen, ecl) {
  const eclIdx = ECL_MAP[ecl] ?? 1;
  for (let v = 1; v <= 10; v++) {
    const info = VERSION_TABLE[v][eclIdx];
    if (dataLen <= info.dc) return v;
  }
  return -1;
}

// ── Matrix operations ──

function createMatrix(size) {
  return Array.from({ length: size }, () => new Uint8Array(size));
}

function setModule(matrix, row, col, val, reserved) {
  const s = matrix.length;
  if (row >= 0 && row < s && col >= 0 && col < s) {
    matrix[row][col] = val;
    if (reserved) reserved[row][col] = 1;
  }
}

function placeFinderPattern(matrix, reserved, row, col) {
  for (let r = -1; r <= 7; r++) {
    for (let c = -1; c <= 7; c++) {
      const val =
        (r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
        (c >= 0 && c <= 6 && (r === 0 || r === 6)) ||
        (r >= 2 && r <= 4 && c >= 2 && c <= 4)
          ? 1
          : 0;
      setModule(matrix, row + r, col + c, val, reserved);
    }
  }
}

function placeAlignmentPattern(matrix, reserved, row, col) {
  for (let r = -2; r <= 2; r++) {
    for (let c = -2; c <= 2; c++) {
      const val =
        Math.abs(r) === 2 || Math.abs(c) === 2 || (r === 0 && c === 0) ? 1 : 0;
      setModule(matrix, row + r, col + c, val, reserved);
    }
  }
}

function placeTimingPatterns(matrix, reserved) {
  const s = matrix.length;
  for (let i = 8; i < s - 8; i++) {
    const val = i % 2 === 0 ? 1 : 0;
    setModule(matrix, 6, i, val, reserved);
    setModule(matrix, i, 6, val, reserved);
  }
}

function reserveFormatArea(matrix, reserved) {
  const s = matrix.length;
  for (let i = 0; i < 8; i++) {
    setModule(reserved, 8, i, 1);
    setModule(reserved, 8, s - 1 - i, 1);
    setModule(reserved, i, 8, 1);
    setModule(reserved, s - 1 - i, 8, 1);
  }
  setModule(reserved, 8, 8, 1);
  setModule(matrix, s - 8, 8, 1, reserved); // dark module
}

function placeData(matrix, reserved, bits) {
  const s = matrix.length;
  let bitIdx = 0;
  let upward = true;
  for (let col = s - 1; col >= 1; col -= 2) {
    if (col === 6) col = 5; // skip timing column
    const rows = upward
      ? Array.from({ length: s }, (_, i) => s - 1 - i)
      : Array.from({ length: s }, (_, i) => i);
    for (const row of rows) {
      for (let c = 0; c < 2; c++) {
        const cc = col - c;
        if (reserved[row][cc]) continue;
        matrix[row][cc] = bitIdx < bits.length ? bits[bitIdx++] : 0;
      }
    }
    upward = !upward;
  }
}

function applyMask(matrix, reserved, maskId) {
  const s = matrix.length;
  const fns = [
    (r, c) => (r + c) % 2 === 0,
    (r) => r % 2 === 0,
    (_, c) => c % 3 === 0,
    (r, c) => (r + c) % 3 === 0,
    (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
    (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
    (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
    (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
  ];
  const fn = fns[maskId];
  for (let r = 0; r < s; r++) {
    for (let c = 0; c < s; c++) {
      if (!reserved[r][c] && fn(r, c)) {
        matrix[r][c] ^= 1;
      }
    }
  }
}

function placeFormatInfo(matrix, ecl, maskId) {
  const s = matrix.length;
  const eclBits = [1, 0, 3, 2][ECL_MAP[ecl] ?? 1];
  let data = (eclBits << 3) | maskId;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >> 9) * 0x537);
  const bits = ((data << 10) | rem) ^ 0x5412;

  for (let i = 0; i < 15; i++) {
    const bit = (bits >> (14 - i)) & 1;
    // Around top-left finder
    if (i < 6) matrix[8][i] = bit;
    else if (i === 6) matrix[8][7] = bit;
    else if (i === 7) matrix[8][8] = bit;
    else if (i === 8) matrix[7][8] = bit;
    else matrix[14 - i][8] = bit;
    // Around other finders
    if (i < 8) matrix[s - 1 - i][8] = bit;
    else matrix[8][s - 15 + i] = bit;
  }
}

// ── Penalty scoring (simplified) ──

function penalty(matrix) {
  const s = matrix.length;
  let score = 0;
  // Rule 1: runs of same color
  for (let r = 0; r < s; r++) {
    let count = 1;
    for (let c = 1; c < s; c++) {
      if (matrix[r][c] === matrix[r][c - 1]) {
        count++;
        if (count === 5) score += 3;
        else if (count > 5) score++;
      } else count = 1;
    }
  }
  for (let c = 0; c < s; c++) {
    let count = 1;
    for (let r = 1; r < s; r++) {
      if (matrix[r][c] === matrix[r - 1][c]) {
        count++;
        if (count === 5) score += 3;
        else if (count > 5) score++;
      } else count = 1;
    }
  }
  return score;
}

// ── Encode ──

function encodeQR(text, ecl = "M") {
  const data = new TextEncoder().encode(text);
  const version = selectVersion(data.length, ecl);
  if (version < 0) throw new Error("Data too long for QR versions 1–10");

  const eclIdx = ECL_MAP[ecl] ?? 1;
  const info = VERSION_TABLE[version][eclIdx];
  const size = version * 4 + 17;

  // Build data codewords
  const codewords = [];
  // Mode indicator: byte mode = 0100
  // Character count (8 bits for v1-9, 16 bits for v10+)
  const ccBits = version <= 9 ? 8 : 16;
  let bitBuf = 0;
  let bitCount = 0;

  function pushBits(val, len) {
    for (let i = len - 1; i >= 0; i--) {
      bitBuf = (bitBuf << 1) | ((val >> i) & 1);
      bitCount++;
      if (bitCount === 8) {
        codewords.push(bitBuf);
        bitBuf = 0;
        bitCount = 0;
      }
    }
  }

  pushBits(0b0100, 4); // byte mode
  pushBits(data.length, ccBits);
  data.forEach((b) => pushBits(b, 8));
  pushBits(0, 4); // terminator (up to 4 bits)

  // Pad to byte boundary
  if (bitCount > 0) pushBits(0, 8 - bitCount);

  // Pad to capacity
  while (codewords.length < info.dc) {
    codewords.push(0xec);
    if (codewords.length < info.dc) codewords.push(0x11);
  }

  // Split into blocks and compute EC
  const blocks = [];
  const ecBlocks = [];
  const ecPerBlock = info.ec / info.b;
  const dcPerBlock = Math.floor(info.dc / info.b);
  const remainder = info.dc % info.b;
  let offset = 0;

  for (let i = 0; i < info.b; i++) {
    const blockDc = dcPerBlock + (i >= info.b - remainder ? 1 : 0);
    const blockData = codewords.slice(offset, offset + blockDc);
    offset += blockDc;
    blocks.push(blockData);
    ecBlocks.push(rsEncode(blockData, ecPerBlock));
  }

  // Interleave
  const interleaved = [];
  const maxDc = Math.max(...blocks.map((b) => b.length));
  for (let i = 0; i < maxDc; i++) {
    for (const block of blocks) {
      if (i < block.length) interleaved.push(block[i]);
    }
  }
  for (let i = 0; i < ecPerBlock; i++) {
    for (const ec of ecBlocks) {
      if (i < ec.length) interleaved.push(ec[i]);
    }
  }

  // Convert to bit array
  const bits = [];
  interleaved.forEach((byte) => {
    for (let i = 7; i >= 0; i--) bits.push((byte >> i) & 1);
  });

  // Build matrix
  const matrix = createMatrix(size);
  const reserved = createMatrix(size);

  placeFinderPattern(matrix, reserved, 0, 0);
  placeFinderPattern(matrix, reserved, 0, size - 7);
  placeFinderPattern(matrix, reserved, size - 7, 0);

  const alignPos = ALIGNMENT_POSITIONS[version] || [];
  for (const r of alignPos) {
    for (const c of alignPos) {
      if (reserved[r]?.[c]) continue;
      placeAlignmentPattern(matrix, reserved, r, c);
    }
  }

  placeTimingPatterns(matrix, reserved);
  reserveFormatArea(matrix, reserved);

  // Try all masks, pick lowest penalty
  let bestMask = 0;
  let bestScore = Infinity;
  for (let m = 0; m < 8; m++) {
    const test = matrix.map((row) => new Uint8Array(row));
    placeData(test, reserved, bits);
    applyMask(test, reserved, m);
    placeFormatInfo(test, ecl, m);
    const s = penalty(test);
    if (s < bestScore) {
      bestScore = s;
      bestMask = m;
    }
  }

  placeData(matrix, reserved, bits);
  applyMask(matrix, reserved, bestMask);
  placeFormatInfo(matrix, ecl, bestMask);

  return matrix;
}

// ── SVG renderer ──

function matrixToSVG(matrix) {
  const size = matrix.length;
  const quiet = 2; // quiet zone modules
  const total = size + quiet * 2;

  let paths = "";
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (matrix[r][c]) {
        paths += `M${c + quiet},${r + quiet}h1v1h-1z`;
      }
    }
  }

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${total} ${total}`);
  svg.setAttribute("shape-rendering", "crispEdges");
  svg.setAttribute("data-part", "svg");

  // Background
  const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  bg.setAttribute("width", total);
  bg.setAttribute("height", total);
  bg.setAttribute("fill", "var(--color-bg, #fff)");
  svg.appendChild(bg);

  // QR modules
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", paths);
  path.setAttribute("fill", "var(--color-fg, #000)");
  svg.appendChild(path);

  return svg;
}

// ── Controller ──

function createQRCode(root) {
  if (root._faqirQR) return root._faqirQR;

  function render() {
    const value = root.getAttribute("data-value") || "";
    const ecl = root.getAttribute("data-ecl") || "M";

    // Remove old SVG
    const old = root.querySelector("[data-part='svg']");
    if (old) old.remove();

    if (!value) return;

    try {
      const matrix = encodeQR(value, ecl);
      const svg = matrixToSVG(matrix);
      // Insert before caption if present
      const caption = root.querySelector("[data-part='caption']");
      if (caption) {
        root.insertBefore(svg, caption);
      } else {
        root.appendChild(svg);
      }
    } catch (e) {
      console.warn(`[qr-code] Failed to encode: ${e.message}`);
    }
  }

  function update(newValue, newEcl) {
    if (newValue !== undefined) root.setAttribute("data-value", newValue);
    if (newEcl !== undefined) root.setAttribute("data-ecl", newEcl);
    render();
  }

  // Observe attribute changes
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.attributeName === "data-value" || m.attributeName === "data-ecl") {
        render();
        break;
      }
    }
  });
  observer.observe(root, { attributes: true });

  function destroy() {
    observer.disconnect();
    const svg = root.querySelector("[data-part='svg']");
    if (svg) svg.remove();
    delete root._faqirQR;
  }

  // Initial render
  render();

  const api = { render, update, destroy };
  root._faqirQR = api;
  return api;
}
    return createQRCode;
  })();

  // ── select-custom ── (registry/recipes/select-custom/select-custom.js)
  var createSelectCustom = controllerRegistry["select-custom"] = (function() {
// @ui:controller select-custom
// @ui:provides open close toggle select getValue destroy

function createSelectCustom(root) {
  // Prevent double-init
  if (root._faqirSelectCustom) return root._faqirSelectCustom;

  const trigger = root.querySelector("[data-part='trigger']");
  const valueEl = root.querySelector("[data-part='value']");
  const listbox = root.querySelector("[data-part='listbox']");
  const searchInput = root.querySelector("[data-part='search']");
  const emptyEl = root.querySelector("[data-part='empty']");
  const options = () =>
    [...root.querySelectorAll("[data-part='option']")];

  let highlightedIndex = -1;
  let outsideClickCleanup = null;
  let selectedValue = "";
  const placeholderText = valueEl?.textContent || "";

  function open() {
    root.dataset.state = "open";
    listbox.hidden = false;
    trigger.setAttribute("aria-expanded", "true");

    // Reset search if present
    if (searchInput) {
      searchInput.value = "";
      filterOptions("");
      searchInput.focus();
    }

    clearHighlight();
    outsideClickCleanup = onOutsideClick(root, close);
  }

  function close() {
    root.dataset.state = "closed";
    listbox.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    clearHighlight();

    if (outsideClickCleanup) {
      outsideClickCleanup();
      outsideClickCleanup = null;
    }

    trigger.focus();
  }

  function toggle() {
    root.dataset.state === "open" ? close() : open();
  }

  function clearHighlight() {
    options().forEach((opt) => {
      opt.removeAttribute("data-highlighted");
    });
    highlightedIndex = -1;
  }

  function visibleOptions() {
    return options().filter((opt) => !opt.hasAttribute("data-hidden"));
  }

  function highlightOption(index) {
    const visible = visibleOptions();
    if (visible.length === 0) return;

    // Clamp index
    if (index < 0) index = visible.length - 1;
    if (index >= visible.length) index = 0;

    // Clear previous
    options().forEach((opt) => opt.removeAttribute("data-highlighted"));

    visible[index].setAttribute("data-highlighted", "");
    visible[index].scrollIntoView({ block: "nearest" });
    highlightedIndex = index;
  }

  function filterOptions(query) {
    const allOptions = options();
    const lowerQuery = query.toLowerCase();
    let visibleCount = 0;

    allOptions.forEach((opt) => {
      const text = opt.textContent.toLowerCase();
      if (text.includes(lowerQuery)) {
        opt.removeAttribute("data-hidden");
        visibleCount++;
      } else {
        opt.setAttribute("data-hidden", "");
      }
    });

    // Show/hide empty state
    if (emptyEl) {
      emptyEl.hidden = visibleCount > 0;
    }

    clearHighlight();
    return visibleCount;
  }

  function select(value) {
    const allOptions = options();
    let targetOption = null;

    // Find option by data-value attribute
    allOptions.forEach((opt) => {
      if (opt.dataset.value === value) {
        targetOption = opt;
      }
    });

    if (!targetOption) {
      // Fallback: find by text content
      allOptions.forEach((opt) => {
        if (opt.textContent.trim() === value) {
          targetOption = opt;
        }
      });
    }

    if (!targetOption) return;

    // Deselect all
    allOptions.forEach((opt) => opt.setAttribute("aria-selected", "false"));

    // Select target
    targetOption.setAttribute("aria-selected", "true");
    selectedValue = targetOption.dataset.value || targetOption.textContent.trim();

    // Update displayed value
    if (valueEl) {
      valueEl.textContent = targetOption.textContent.trim();
      valueEl.removeAttribute("data-placeholder");
    }

    // Dispatch change event
    const event = new CustomEvent("select-change", {
      bubbles: true,
      detail: {
        value: selectedValue,
        label: targetOption.textContent.trim()
      }
    });
    root.dispatchEvent(event);

    close();
  }

  function getValue() {
    return selectedValue;
  }

  // ── Event Handlers ──

  function onTriggerClick() {
    toggle();
  }

  function onTriggerKeyDown(e) {
    switch (e.key) {
      case "ArrowDown":
      case "Enter":
      case " ":
        e.preventDefault();
        if (root.dataset.state !== "open") {
          open();
        }
        break;
      case "Escape":
        if (root.dataset.state === "open") {
          e.preventDefault();
          close();
        }
        break;
    }
  }

  function onListboxKeyDown(e) {
    const visible = visibleOptions();

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        highlightOption(highlightedIndex + 1);
        break;
      case "ArrowUp":
        e.preventDefault();
        highlightOption(highlightedIndex - 1);
        break;
      case "Enter":
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < visible.length) {
          const opt = visible[highlightedIndex];
          select(opt.dataset.value || opt.textContent.trim());
        }
        break;
      case "Escape":
        e.preventDefault();
        close();
        break;
      case "Home":
        if (visible.length > 0) {
          e.preventDefault();
          highlightOption(0);
        }
        break;
      case "End":
        if (visible.length > 0) {
          e.preventDefault();
          highlightOption(visible.length - 1);
        }
        break;
    }
  }

  function onOptionClick(e) {
    const opt = e.target.closest("[data-part='option']");
    if (!opt) return;
    select(opt.dataset.value || opt.textContent.trim());
  }

  function onSearchInput() {
    if (searchInput) {
      filterOptions(searchInput.value);
    }
  }

  trigger?.addEventListener("click", onTriggerClick);
  trigger?.addEventListener("keydown", onTriggerKeyDown);
  listbox?.addEventListener("keydown", onListboxKeyDown);
  listbox?.addEventListener("click", onOptionClick);
  searchInput?.addEventListener("input", onSearchInput);

  function destroy() {
    trigger?.removeEventListener("click", onTriggerClick);
    trigger?.removeEventListener("keydown", onTriggerKeyDown);
    listbox?.removeEventListener("keydown", onListboxKeyDown);
    listbox?.removeEventListener("click", onOptionClick);
    searchInput?.removeEventListener("input", onSearchInput);
    if (outsideClickCleanup) outsideClickCleanup();
    delete root._faqirSelectCustom;
  }

  const api = { open, close, toggle, select, getValue, destroy };
  root._faqirSelectCustom = api;
  return api;
}
    return createSelectCustom;
  })();

  // ── sheet ── (registry/recipes/sheet/sheet.js)
  var createSheet = controllerRegistry["sheet"] = (function() {
// @ui:controller sheet
// @ui:provides open close toggle destroy

function createSheet(root) {
  // Prevent double-init
  if (root._faqirSheet) return root._faqirSheet;

  const trigger = root.querySelector("[data-part='trigger']");
  const overlay = root.querySelector("[data-part='overlay']");
  const panel = root.querySelector("[data-part='panel']");
  const closeButtons = root.querySelectorAll("[data-part='close']");

  let focusCleanup = null;
  let previouslyFocused = null;

  function open() {
    previouslyFocused = document.activeElement;
    root.dataset.state = "open";
    overlay.hidden = false;
    panel.hidden = false;
    focusCleanup = trapFocus(panel);
    panel.focus?.();
  }

  function close() {
    root.dataset.state = "closing";

    const onEnd = () => {
      root.dataset.state = "closed";
      overlay.hidden = true;
      panel.hidden = true;
      if (focusCleanup) focusCleanup();
      focusCleanup = null;
      previouslyFocused?.focus();
      panel.removeEventListener("transitionend", onTransEnd);
    };

    // Listen for transition end on the panel slide
    let hasTransition = false;
    try {
      const style = getComputedStyle(panel);
      const transDur = parseFloat(style.transitionDuration) || 0;
      hasTransition = transDur > 0;
    } catch {
      // getComputedStyle may not be available in test environments
    }

    const onTransEnd = (e) => {
      if (e.propertyName === "transform") onEnd();
    };

    if (hasTransition) {
      panel.addEventListener("transitionend", onTransEnd, { once: true });
    } else {
      onEnd();
    }
  }

  function toggle() {
    root.dataset.state === "open" ? close() : open();
  }

  // Event listeners
  function onTriggerClick() {
    open();
  }

  function onOverlayClick() {
    close();
  }

  function onCloseClick() {
    close();
  }

  function onKeyDown(e) {
    if (e.key === "Escape" && root.dataset.state === "open") {
      e.stopPropagation();
      close();
    }
  }

  trigger?.addEventListener("click", onTriggerClick);
  overlay?.addEventListener("click", onOverlayClick);
  closeButtons.forEach((btn) => btn.addEventListener("click", onCloseClick));
  root.addEventListener("keydown", onKeyDown);

  function destroy() {
    trigger?.removeEventListener("click", onTriggerClick);
    overlay?.removeEventListener("click", onOverlayClick);
    closeButtons.forEach((btn) =>
      btn.removeEventListener("click", onCloseClick)
    );
    root.removeEventListener("keydown", onKeyDown);
    if (focusCleanup) focusCleanup();
    delete root._faqirSheet;
  }

  const api = { open, close, toggle, destroy };
  root._faqirSheet = api;
  return api;
}
    return createSheet;
  })();

  // ── sidebar ── (registry/recipes/sidebar/sidebar.js)
  var createSidebar = controllerRegistry["sidebar"] = (function() {
// @ui:controller sidebar
// @ui:provides toggle expand collapse open close isMobile getState destroy

/**
 * sidebar — a collapsible application sidebar with three modes:
 *
 *   • expanded — desktop, full-width with labels (default)
 *   • rail     — desktop, icons-only
 *   • drawer   — mobile, an off-canvas overlay panel (closed ↔ open)
 *
 * The single source of truth is `data-state` on the root; its value is one of
 * `expanded`, `rail`, `drawer` (mobile, closed) or `drawer-open` (mobile, open).
 * Agents can set the initial state declaratively — the controller reconciles it
 * with the current breakpoint on init.
 *
 * A `matchMedia` query (default `(max-width: 768px)`, overridable with
 * `data-breakpoint`) decides desktop vs mobile. `toggle()` is breakpoint-aware:
 * expanded ↔ rail on desktop, open ↔ close on mobile. The desktop preference
 * (expanded/rail) persists across a trip through the mobile breakpoint, so
 * resizing back to desktop restores what the user last chose.
 *
 * The mobile drawer is a proper modal surface: focus is trapped in the panel,
 * Escape and an overlay click close it, body scroll is locked while open, and
 * focus returns to whatever opened it. When the drawer is closed on mobile the
 * panel is `inert` + `aria-hidden`, so its links never sit in the tab order
 * off-screen. Every toggle button's `aria-expanded` tracks the live state.
 */
function createSidebar(root) {
  // Prevent double-init.
  if (root._faqirSidebar) return root._faqirSidebar;

  const overlay = root.querySelector("[data-part='overlay']");
  const panel = root.querySelector("[data-part='panel']") || root;

  // Toggle buttons: any `[data-part='trigger']` inside the sidebar, plus external
  // triggers in the app shell that point at this sidebar by id. Both call toggle().
  const internalTriggers = [...root.querySelectorAll("[data-part='trigger']")];
  const externalTriggers = root.id
    ? [...document.querySelectorAll(`[data-sidebar-toggle="${root.id}"]`)]
    : [];
  const triggers = [...internalTriggers, ...externalTriggers];

  // Persistent desktop preference (expanded ↔ rail) and mobile open flag, both
  // seeded from the declared data-state so the initial render is intent-preserving.
  const declared = root.dataset.state || "expanded";
  let desktopState = declared === "rail" ? "rail" : "expanded";
  let drawerOpen = declared === "drawer-open";

  // Responsive breakpoint. `data-breakpoint` is a max-width in px (default 768).
  const bp = (() => {
    const n = parseInt(root.dataset.breakpoint || "", 10);
    return Number.isFinite(n) && n > 0 ? n : 768;
  })();
  const query = `(max-width: ${bp}px)`;
  const mql =
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia(query)
      : null;

  function isMobile() {
    return mql ? !!mql.matches : false;
  }

  // Modal bookkeeping for the mobile drawer.
  let focusCleanup = null;
  let previouslyFocused = null;
  let prevBodyOverflow = null;

  function lockScroll() {
    if (prevBodyOverflow !== null) return;
    prevBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  function unlockScroll() {
    if (prevBodyOverflow === null) return;
    document.body.style.overflow = prevBodyOverflow;
    prevBodyOverflow = null;
  }
  function releaseFocusTrap() {
    if (focusCleanup) focusCleanup();
    focusCleanup = null;
  }

  function getState() {
    return root.dataset.state || "";
  }

  /**
   * Reconcile every reflected attribute with the current model + breakpoint.
   * Pure DOM writes — never dispatches an event, so it is safe to call on init.
   */
  function render() {
    const mobile = isMobile();
    const state = mobile ? (drawerOpen ? "drawer-open" : "drawer") : desktopState;
    root.dataset.state = state;

    // Overlay only exists as a hit-target when the drawer is open.
    if (overlay) overlay.hidden = state !== "drawer-open";

    // Closed mobile drawer: keep the off-screen panel out of the tab order and
    // the a11y tree. Any other state is a live, interactive surface.
    if (panel && panel !== root) {
      if (state === "drawer") {
        panel.setAttribute("inert", "");
        panel.setAttribute("aria-hidden", "true");
      } else {
        panel.removeAttribute("inert");
        panel.removeAttribute("aria-hidden");
      }
    }

    // aria-expanded reflects "is the sidebar showing its content?": labels on
    // desktop, an open drawer on mobile.
    const expanded = mobile ? drawerOpen : desktopState === "expanded";
    for (const t of triggers) t.setAttribute("aria-expanded", String(expanded));
  }

  // ── Mobile drawer open/close ───────────────────────────────────────────────
  function open() {
    if (drawerOpen) return;
    previouslyFocused = document.activeElement;
    drawerOpen = true;
    render();
    lockScroll();
    focusCleanup = trapFocus(panel);
    if (!focusFirst(panel)) panel.focus?.();
  }

  function close() {
    if (!drawerOpen) return;
    drawerOpen = false;
    render();
    unlockScroll();
    releaseFocusTrap();
    previouslyFocused?.focus?.();
    previouslyFocused = null;
  }

  // ── Desktop expand/collapse ────────────────────────────────────────────────
  function expand() {
    desktopState = "expanded";
    render();
  }
  function collapse() {
    desktopState = "rail";
    render();
  }

  // ── Breakpoint-aware toggle ────────────────────────────────────────────────
  function toggle() {
    if (isMobile()) {
      drawerOpen ? close() : open();
    } else {
      desktopState === "expanded" ? collapse() : expand();
    }
  }

  // When the viewport crosses the breakpoint, tear down any live drawer modality
  // (a drawer left open as the window widens must not keep the scroll lock or the
  // focus trap) and re-render into the mode the new breakpoint calls for.
  function onMediaChange() {
    if (!isMobile() && drawerOpen) {
      drawerOpen = false;
      unlockScroll();
      releaseFocusTrap();
      previouslyFocused = null;
    }
    render();
  }

  function onKeyDown(e) {
    if (e.key === "Escape" && isMobile() && drawerOpen) {
      e.stopPropagation();
      close();
    }
  }

  function onTriggerClick(e) {
    e.preventDefault();
    toggle();
  }

  function onOverlayClick() {
    close();
  }

  for (const t of triggers) t.addEventListener("click", onTriggerClick);
  overlay?.addEventListener("click", onOverlayClick);
  root.addEventListener("keydown", onKeyDown);
  if (mql) {
    if (typeof mql.addEventListener === "function") mql.addEventListener("change", onMediaChange);
    else if (typeof mql.addListener === "function") mql.addListener(onMediaChange);
  }

  // Paint the reconciled initial state (no event).
  render();

  function destroy() {
    for (const t of triggers) t.removeEventListener("click", onTriggerClick);
    overlay?.removeEventListener("click", onOverlayClick);
    root.removeEventListener("keydown", onKeyDown);
    if (mql) {
      if (typeof mql.removeEventListener === "function") mql.removeEventListener("change", onMediaChange);
      else if (typeof mql.removeListener === "function") mql.removeListener(onMediaChange);
    }
    unlockScroll();
    releaseFocusTrap();
    delete root._faqirSidebar;
  }

  const api = { toggle, expand, collapse, open, close, isMobile, getState, destroy };
  root._faqirSidebar = api;
  return api;
}
    return createSidebar;
  })();

  // ── slider ── (registry/recipes/slider/slider.js)
  var createSlider = controllerRegistry["slider"] = (function() {
// @ui:controller slider
// @ui:provides setValue getValue getValues setFormatter destroy

/**
 * slider — single-thumb and range (two-thumb) slider.
 *
 * Modes are inferred from the DOM, never from a flag: two-or-more
 * `[data-part="thumb"]` elements ⇒ range mode. Each thumb is an independent
 * `role="slider"` widget with its own keyboard handling and ARIA value state.
 *
 * The controller owns only runtime state: it writes `aria-valuemin/max/now`
 * (and `aria-valuetext`, via a formatter hook), positions thumbs through the
 * `--pos` custom property, reflects the filled span through `--slider-start` /
 * `--slider-end` on the root, and toggles `data-state="dragging"` on the active
 * thumb. All value arithmetic lives in the pure, exported helpers below
 * (`valueFromPointer`, `snapToStep`, `percentOf`) so it is unit-testable without
 * a DOM.
 */
function createSlider(root) {
  // Prevent double-init.
  if (root._faqirSlider) return root._faqirSlider;

  const track = root.querySelector("[data-part='track']");
  const thumbs = [...root.querySelectorAll("[data-part='thumb']")];
  const isRange = thumbs.length >= 2;
  const last = thumbs.length - 1;

  const min = numAttr(root, "min", 0);
  const max = numAttr(root, "max", 100);
  const step = (() => {
    const s = numAttr(root, "step", 1);
    return s > 0 ? s : 1;
  })();
  // PageUp/PageDown jump: an explicit data-page-step, else ten normal steps.
  const bigStep = (() => {
    const p = numAttr(root, "pageStep", NaN);
    return Number.isFinite(p) && p > 0 ? p : step * 10;
  })();

  // aria-valuetext hook: a formatter set via setFormatter() wins; otherwise a
  // declarative `data-value-suffix` (e.g. "%") produces "<value><suffix>".
  let formatter = null;
  const suffix = root.dataset.valueSuffix || "";

  // Ensure every thumb is a proper, focusable slider even if the author omitted
  // the role/tabindex — screen-reader-correct ARIA must not depend on hand markup.
  thumbs.forEach((thumb) => {
    if (!thumb.hasAttribute("role")) thumb.setAttribute("role", "slider");
    if (!thumb.hasAttribute("tabindex")) {
      thumb.setAttribute("tabindex", isDisabled() ? "-1" : "0");
    }
  });

  // Seed values: prefer an existing aria-valuenow, then the i-th data-value
  // token, then a sensible default (first thumb → min, last → max).
  const dataVals = (root.dataset.value || "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "")
    .map(Number);

  let values = thumbs.map((thumb, i) => {
    const now = thumb.getAttribute("aria-valuenow");
    if (now !== null && now !== "" && Number.isFinite(Number(now))) return Number(now);
    if (i < dataVals.length && Number.isFinite(dataVals[i])) return dataVals[i];
    return i === 0 ? min : max;
  });
  // Normalize in order so range clamping sees already-normalized lower neighbours.
  thumbs.forEach((_, i) => {
    values[i] = clampForThumb(i, snapToStep(values[i], min, max, step));
  });

  function isDisabled() {
    return root.hasAttribute("data-disabled");
  }

  // Clamp a candidate value to the global bounds and, in range mode, to the
  // adjacent thumbs — this is what stops the two thumbs from crossing.
  function clampForThumb(index, value) {
    let lo = min;
    let hi = max;
    if (isRange) {
      if (index > 0) lo = values[index - 1];
      if (index < last) hi = values[index + 1];
    }
    return Math.min(Math.max(value, lo), hi);
  }

  function boundsFor(index) {
    const lo = isRange && index > 0 ? values[index - 1] : min;
    const hi = isRange && index < last ? values[index + 1] : max;
    return { lo, hi };
  }

  function textFor(value, index) {
    if (typeof formatter === "function") return formatter(value, index);
    if (suffix) return `${value}${suffix}`;
    return null;
  }

  function renderThumb(index) {
    const thumb = thumbs[index];
    const value = values[index];
    const { lo, hi } = boundsFor(index);
    thumb.setAttribute("aria-valuemin", String(lo));
    thumb.setAttribute("aria-valuemax", String(hi));
    thumb.setAttribute("aria-valuenow", String(value));
    const text = textFor(value, index);
    if (text != null) thumb.setAttribute("aria-valuetext", text);
    else thumb.removeAttribute("aria-valuetext");
    thumb.style.setProperty("--pos", `${percentOf(value, min, max)}%`);
  }

  function renderRange() {
    const startPct = isRange ? percentOf(values[0], min, max) : 0;
    const endPct = percentOf(values[isRange ? last : 0], min, max);
    root.style.setProperty("--slider-start", `${startPct}%`);
    root.style.setProperty("--slider-end", `${endPct}%`);
  }

  function render() {
    thumbs.forEach((_, i) => renderThumb(i));
    renderRange();
  }

  function emitChange(index) {
    root.dispatchEvent(
      new CustomEvent("faqir:change", {
        bubbles: true,
        detail: { index, value: values[index], values: values.slice() },
      }),
    );
  }

  // The single mutation seam: snap → clamp (non-crossing) → render → notify.
  function applyValue(index, rawValue, opts) {
    if (index < 0 || index >= thumbs.length) return;
    const next = clampForThumb(index, snapToStep(rawValue, min, max, step));
    const changed = next !== values[index];
    values[index] = next;
    render();
    if (changed && !(opts && opts.silent)) emitChange(index);
  }

  function nearestThumb(value) {
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < values.length; i++) {
      const d = Math.abs(values[i] - value);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    return best;
  }

  // ── RTL ──────────────────────────────────────────────────────────────────
  // getComputedStyle is authoritative in a browser; fall back to the dir
  // attribute for detached nodes / happy-dom where computed direction is unset.
  function isRTL() {
    if (root.closest('[dir="rtl"]')) return true;
    if (typeof getComputedStyle === "function") {
      try {
        return getComputedStyle(root).direction === "rtl";
      } catch {
        /* jsdom/happy-dom on a detached node — ignore */
      }
    }
    return false;
  }

  // ── Keyboard ─────────────────────────────────────────────────────────────
  function onKeyDown(e) {
    if (isDisabled()) return;
    const thumb = e.target.closest("[data-part='thumb']");
    if (!thumb || !root.contains(thumb)) return;
    const index = thumbs.indexOf(thumb);
    if (index < 0) return;

    const rtl = isRTL();
    const cur = values[index];
    let next;
    switch (e.key) {
      case "ArrowUp":
        next = cur + step;
        break;
      case "ArrowDown":
        next = cur - step;
        break;
      case "ArrowRight":
        next = cur + (rtl ? -step : step);
        break;
      case "ArrowLeft":
        next = cur + (rtl ? step : -step);
        break;
      case "PageUp":
        next = cur + bigStep;
        break;
      case "PageDown":
        next = cur - bigStep;
        break;
      case "Home":
        next = min; // clampForThumb pins it to the lower neighbour in range mode
        break;
      case "End":
        next = max;
        break;
      default:
        return;
    }
    e.preventDefault();
    applyValue(index, next);
  }

  // ── Pointer dragging ─────────────────────────────────────────────────────
  let drag = null; // { index }
  const docHandlers = [];

  function beginDrag(index) {
    drag = { index };
    thumbs[index].dataset.state = "dragging";
    const move = (ev) => onDragMove(ev);
    const end = () => endDrag();
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", end);
    document.addEventListener("pointercancel", end);
    docHandlers.push(["pointermove", move], ["pointerup", end], ["pointercancel", end]);
  }

  function onDragMove(ev) {
    if (!drag || !track) return;
    const value = valueFromPointer(ev.clientX, track.getBoundingClientRect(), {
      min,
      max,
      step,
      rtl: isRTL(),
    });
    applyValue(drag.index, value);
  }

  function endDrag() {
    if (!drag) return;
    thumbs[drag.index].removeAttribute("data-state");
    for (const [type, fn] of docHandlers) document.removeEventListener(type, fn);
    docHandlers.length = 0;
    drag = null;
  }

  function onPointerDown(e) {
    if (isDisabled()) return;
    if (typeof e.button === "number" && e.button !== 0) return; // primary button only

    const thumb = e.target.closest("[data-part='thumb']");
    if (thumb && root.contains(thumb)) {
      e.preventDefault();
      const index = thumbs.indexOf(thumb);
      thumb.focus();
      beginDrag(index);
      return;
    }

    // A press anywhere on the track jumps the nearest thumb to that point and
    // starts dragging it — the standard "click-to-set" affordance.
    if (track && (e.target === track || track.contains(e.target))) {
      e.preventDefault();
      const value = valueFromPointer(e.clientX, track.getBoundingClientRect(), {
        min,
        max,
        step,
        rtl: isRTL(),
      });
      const index = nearestThumb(value);
      applyValue(index, value);
      if (thumbs[index]) thumbs[index].focus();
      beginDrag(index);
    }
  }

  root.addEventListener("keydown", onKeyDown);
  root.addEventListener("pointerdown", onPointerDown);

  // Paint initial positions/ARIA without firing a spurious change event.
  render();

  // ── Public API ───────────────────────────────────────────────────────────
  function setValue(index, value) {
    applyValue(index, value);
  }
  function getValue() {
    return isRange ? values.slice() : values[0];
  }
  function getValues() {
    return values.slice();
  }
  function setFormatter(fn) {
    formatter = typeof fn === "function" ? fn : null;
    render();
  }

  function destroy() {
    root.removeEventListener("keydown", onKeyDown);
    root.removeEventListener("pointerdown", onPointerDown);
    endDrag();
    delete root._faqirSlider;
  }

  const api = { setValue, getValue, getValues, setFormatter, destroy };
  root._faqirSlider = api;
  return api;
}

// ── Pure value math (no DOM) — unit-tested in isolation ──────────────────────

/** Decimal places implied by a step (so 0.1 + 0.2 doesn't leak float dust). */
function stepDecimals(step) {
  const str = String(step);
  const dot = str.indexOf(".");
  return dot === -1 ? 0 : str.length - dot - 1;
}

/**
 * Snap a raw value onto the nearest step from `min`, clamped to `[min, max]`.
 * @returns {number}
 */
function snapToStep(value, min, max, step) {
  const s = step > 0 ? step : 1;
  const steps = Math.round((value - min) / s);
  const snapped = Math.min(Math.max(min + steps * s, min), max);
  return Number(snapped.toFixed(stepDecimals(s)));
}

/** Value → percent along the track (0–100), clamped. */
function percentOf(value, min, max) {
  if (max === min) return 0;
  const p = ((value - min) / (max - min)) * 100;
  return Math.min(Math.max(p, 0), 100);
}

/**
 * Map a pointer x-coordinate to a slider value. Pure: no DOM access — the caller
 * supplies the track rect. Handles RTL by inverting the fraction, so the same
 * arithmetic serves both writing directions.
 *
 * @param {number} clientX pointer x in client coordinates
 * @param {{left:number, width:number}} rect track bounding rect
 * @param {{min:number, max:number, step:number, rtl?:boolean}} opts
 * @returns {number} snapped, clamped value
 */
function valueFromPointer(clientX, rect, opts) {
  const { min, max, step } = opts;
  const width = rect.width;
  if (!(width > 0)) return min;
  let fraction = (clientX - rect.left) / width;
  fraction = Math.min(Math.max(fraction, 0), 1);
  if (opts.rtl) fraction = 1 - fraction;
  return snapToStep(min + fraction * (max - min), min, max, step);
}

// Read a numeric data-* attribute (dataset key), falling back when absent/NaN.
function numAttr(el, key, fallback) {
  const raw = el.dataset[key];
  if (raw == null || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}
    return createSlider;
  })();

  // ── table ── (registry/recipes/table/table.js)
  var createTable = controllerRegistry["table"] = (function() {
// @ui:controller table
// @ui:provides sort selectRow selectAll deselectAll getSelected destroy

function createTable(root) {
  // Prevent double-init
  if (root._faqirTable) return root._faqirTable;

  const table = root.querySelector("[data-part='table']");
  const thead = root.querySelector("[data-part='thead']");
  const tbody = root.querySelector("[data-part='tbody']");
  const headerCheckbox = thead?.querySelector("[data-part='checkbox']");
  const sortableHeaders = () =>
    [...root.querySelectorAll("[data-part='th'][data-sortable]")];
  const bodyRows = () =>
    [...(tbody?.querySelectorAll("[data-part='tr']") || [])];

  let lastSelectedIndex = -1;

  function sort(columnIndex, direction) {
    const rows = bodyRows();
    if (rows.length === 0) return;

    const allHeaders = [...(thead?.querySelectorAll("[data-part='th']") || [])];

    // Reset all sort indicators
    sortableHeaders().forEach((th) => {
      th.setAttribute("aria-sort", "none");
    });

    // Set current sort indicator
    if (allHeaders[columnIndex]?.hasAttribute("data-sortable")) {
      allHeaders[columnIndex].setAttribute("aria-sort", direction);
    }

    // Sort the rows
    const sortedRows = rows.sort((a, b) => {
      const aCells = [...a.querySelectorAll("[data-part='td']")];
      const bCells = [...b.querySelectorAll("[data-part='td']")];
      const aVal = aCells[columnIndex]?.textContent.trim() || "";
      const bVal = bCells[columnIndex]?.textContent.trim() || "";

      // Try numeric comparison first
      const aNum = parseFloat(aVal.replace(/[^0-9.-]/g, ""));
      const bNum = parseFloat(bVal.replace(/[^0-9.-]/g, ""));

      let result;
      if (!isNaN(aNum) && !isNaN(bNum)) {
        result = aNum - bNum;
      } else {
        result = aVal.localeCompare(bVal);
      }

      return direction === "ascending" ? result : -result;
    });

    // Re-append sorted rows
    sortedRows.forEach((row) => tbody.appendChild(row));
  }

  function selectRow(index) {
    const rows = bodyRows();
    if (index < 0 || index >= rows.length) return;

    const row = rows[index];
    const isSelected = row.hasAttribute("data-selected");

    if (isSelected) {
      row.removeAttribute("data-selected");
      const checkbox = row.querySelector("[data-part='checkbox']");
      if (checkbox) checkbox.checked = false;
    } else {
      row.setAttribute("data-selected", "");
      const checkbox = row.querySelector("[data-part='checkbox']");
      if (checkbox) checkbox.checked = true;
    }

    lastSelectedIndex = index;
    updateHeaderCheckbox();
  }

  function selectAll() {
    bodyRows().forEach((row) => {
      row.setAttribute("data-selected", "");
      const checkbox = row.querySelector("[data-part='checkbox']");
      if (checkbox) checkbox.checked = true;
    });
    updateHeaderCheckbox();
  }

  function deselectAll() {
    bodyRows().forEach((row) => {
      row.removeAttribute("data-selected");
      const checkbox = row.querySelector("[data-part='checkbox']");
      if (checkbox) checkbox.checked = false;
    });
    lastSelectedIndex = -1;
    updateHeaderCheckbox();
  }

  function getSelected() {
    return bodyRows()
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => row.hasAttribute("data-selected"))
      .map(({ index }) => index);
  }

  function updateHeaderCheckbox() {
    if (!headerCheckbox) return;
    const rows = bodyRows();
    const selected = rows.filter((r) => r.hasAttribute("data-selected"));

    if (selected.length === 0) {
      headerCheckbox.checked = false;
      headerCheckbox.indeterminate = false;
    } else if (selected.length === rows.length) {
      headerCheckbox.checked = true;
      headerCheckbox.indeterminate = false;
    } else {
      headerCheckbox.checked = false;
      headerCheckbox.indeterminate = true;
    }
  }

  function selectRange(fromIndex, toIndex) {
    const start = Math.min(fromIndex, toIndex);
    const end = Math.max(fromIndex, toIndex);
    const rows = bodyRows();

    for (let i = start; i <= end; i++) {
      if (i >= 0 && i < rows.length) {
        rows[i].setAttribute("data-selected", "");
        const checkbox = rows[i].querySelector("[data-part='checkbox']");
        if (checkbox) checkbox.checked = true;
      }
    }

    updateHeaderCheckbox();
  }

  // ── Event Handlers ──

  function onHeaderClick(e) {
    const th = e.target.closest("[data-part='th'][data-sortable]");
    if (!th) return;

    const allHeaders = [...(thead?.querySelectorAll("[data-part='th']") || [])];
    const columnIndex = allHeaders.indexOf(th);
    if (columnIndex < 0) return;

    const currentSort = th.getAttribute("aria-sort");
    let nextDirection;

    if (currentSort === "ascending") {
      nextDirection = "descending";
    } else {
      nextDirection = "ascending";
    }

    sort(columnIndex, nextDirection);
  }

  function onHeaderCheckboxChange() {
    if (headerCheckbox.checked) {
      selectAll();
    } else {
      deselectAll();
    }
  }

  function onRowCheckboxChange(e) {
    const checkbox = e.target.closest("[data-part='checkbox']");
    if (!checkbox || checkbox === headerCheckbox) return;

    const row = checkbox.closest("[data-part='tr']");
    if (!row || !tbody?.contains(row)) return;

    const rows = bodyRows();
    const index = rows.indexOf(row);
    if (index < 0) return;

    // Shift+click for range selection
    if (e.shiftKey && lastSelectedIndex >= 0) {
      e.preventDefault();
      selectRange(lastSelectedIndex, index);
      return;
    }

    if (checkbox.checked) {
      row.setAttribute("data-selected", "");
    } else {
      row.removeAttribute("data-selected");
    }

    lastSelectedIndex = index;
    updateHeaderCheckbox();
  }

  function onRowClick(e) {
    // Don't handle if clicking on a checkbox (handled separately)
    if (e.target.closest("[data-part='checkbox']")) return;

    const row = e.target.closest("[data-part='tr']");
    if (!row || !tbody?.contains(row)) return;

    const rows = bodyRows();
    const index = rows.indexOf(row);
    if (index < 0) return;

    // Shift+click for range selection
    if (e.shiftKey && lastSelectedIndex >= 0) {
      selectRange(lastSelectedIndex, index);
      return;
    }
  }

  thead?.addEventListener("click", onHeaderClick);
  headerCheckbox?.addEventListener("change", onHeaderCheckboxChange);
  tbody?.addEventListener("change", onRowCheckboxChange);
  tbody?.addEventListener("click", onRowClick);

  function destroy() {
    thead?.removeEventListener("click", onHeaderClick);
    headerCheckbox?.removeEventListener("change", onHeaderCheckboxChange);
    tbody?.removeEventListener("change", onRowCheckboxChange);
    tbody?.removeEventListener("click", onRowClick);
    delete root._faqirTable;
  }

  const api = { sort, selectRow, selectAll, deselectAll, getSelected, destroy };
  root._faqirTable = api;
  return api;
}
    return createTable;
  })();

  // ── tabs ── (registry/recipes/tabs/tabs.js)
  var createTabs = controllerRegistry["tabs"] = (function() {
// @ui:controller tabs
// @ui:provides activate destroy

function createTabs(root) {
  // Prevent double-init
  if (root._faqirTabs) return root._faqirTabs;

  const list = root.querySelector("[data-part='list']");
  const triggers = () => [...root.querySelectorAll("[data-part='trigger']")];
  const panels = () => [...root.querySelectorAll("[data-part='panel']")];

  function activate(index) {
    const allTriggers = triggers();
    const allPanels = panels();

    if (index < 0 || index >= allTriggers.length) return;

    // Deactivate all
    allTriggers.forEach((trigger, i) => {
      trigger.setAttribute("aria-selected", "false");
      trigger.setAttribute("tabindex", "-1");
      if (allPanels[i]) allPanels[i].hidden = true;
    });

    // Activate target
    allTriggers[index].setAttribute("aria-selected", "true");
    allTriggers[index].removeAttribute("tabindex");
    if (allPanels[index]) allPanels[index].hidden = false;
  }

  function getActiveIndex() {
    return triggers().findIndex(
      (t) => t.getAttribute("aria-selected") === "true"
    );
  }

  function onTriggerClick(e) {
    const trigger = e.target.closest("[data-part='trigger']");
    if (!trigger) return;
    const index = triggers().indexOf(trigger);
    if (index >= 0) {
      activate(index);
      trigger.focus();
    }
  }

  function onKeyDown(e) {
    const allTriggers = triggers();
    const current = getActiveIndex();
    let next = -1;

    switch (e.key) {
      case "ArrowRight":
        next = (current + 1) % allTriggers.length;
        break;
      case "ArrowLeft":
        next = (current - 1 + allTriggers.length) % allTriggers.length;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = allTriggers.length - 1;
        break;
      default:
        return;
    }

    e.preventDefault();
    activate(next);
    allTriggers[next].focus();
  }

  list?.addEventListener("click", onTriggerClick);
  list?.addEventListener("keydown", onKeyDown);

  function destroy() {
    list?.removeEventListener("click", onTriggerClick);
    list?.removeEventListener("keydown", onKeyDown);
    delete root._faqirTabs;
  }

  const api = { activate, getActiveIndex, destroy };
  root._faqirTabs = api;
  return api;
}
    return createTabs;
  })();

  // ── toast ── (registry/recipes/toast/toast.js)
  var createToastContainer = controllerRegistry["toast"] = (function() {
// @ui:controller toast
// @ui:provides add dismiss dismissAll destroy

function createToastContainer(root) {
  // Prevent double-init
  if (root._faqirToast) return root._faqirToast;

  const toasts = new Map();

  /**
   * Add a new toast to the container.
   * @param {Object} options
   * @param {string} options.message - Toast message text
   * @param {string} [options.tone="default"] - default|success|error|warning
   * @param {string} [options.icon] - Icon HTML content
   * @param {string} [options.actionLabel] - Action button label
   * @param {Function} [options.onAction] - Action button callback
   * @param {number} [options.duration=5000] - Auto-dismiss delay in ms (0 to disable)
   * @returns {string} toast id
   */
  function add(options = {}) {
    const {
      message = "",
      tone = "default",
      icon = "",
      actionLabel = "",
      onAction = null,
      duration = 5000,
    } = options;

    const id = uid("toast");
    const el = document.createElement("div");
    el.dataset.part = "toast";
    el.dataset.variant = tone;
    el.dataset.state = "entering";
    el.dataset.toastId = id;
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");

    // Build inner content
    let html = "";

    if (icon) {
      html += `<span data-part="icon" aria-hidden="true">${icon}</span>`;
    }

    html += `<span data-part="message">${message}</span>`;

    if (actionLabel) {
      html += `<button data-part="action">${actionLabel}</button>`;
    }

    html += `<button data-part="close" aria-label="Dismiss notification">&#x2715;</button>`;

    el.innerHTML = html;
    root.appendChild(el);

    // Transition from entering to visible on next frame
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (el.dataset.state === "entering") {
          el.dataset.state = "visible";
        }
      });
    });

    // Wire up close button
    const closeBtn = el.querySelector("[data-part='close']");
    const onCloseClick = () => dismiss(id);
    closeBtn?.addEventListener("click", onCloseClick);

    // Wire up action button
    const actionBtn = el.querySelector("[data-part='action']");
    const onActionClick = () => {
      if (onAction) onAction();
      dismiss(id);
    };
    if (actionBtn) {
      actionBtn.addEventListener("click", onActionClick);
    }

    // Auto-dismiss timer
    let timer = null;
    if (duration > 0) {
      timer = setTimeout(() => dismiss(id), duration);
    }

    toasts.set(id, {
      el,
      timer,
      closeBtn,
      onCloseClick,
      actionBtn,
      onActionClick,
    });

    return id;
  }

  /**
   * Dismiss a toast by id with exit animation.
   * @param {string} id
   */
  function dismiss(id) {
    const entry = toasts.get(id);
    if (!entry) return;

    const { el, timer, closeBtn, onCloseClick, actionBtn, onActionClick } = entry;

    if (timer) clearTimeout(timer);

    // Start exit animation
    el.dataset.state = "exiting";

    const onEnd = () => {
      closeBtn?.removeEventListener("click", onCloseClick);
      if (actionBtn) actionBtn.removeEventListener("click", onActionClick);
      el.removeEventListener("transitionend", onEnd);
      el.remove();
      toasts.delete(id);
    };

    // Check if transitions are running
    let hasTransition = false;
    try {
      const style = getComputedStyle(el);
      const transDur = parseFloat(style.transitionDuration) || 0;
      hasTransition = transDur > 0;
    } catch {
      // getComputedStyle may not be available in test environments
    }

    if (hasTransition) {
      el.addEventListener("transitionend", onEnd, { once: true });
    } else {
      onEnd();
    }
  }

  /**
   * Dismiss all toasts.
   */
  function dismissAll() {
    const ids = [...toasts.keys()];
    ids.forEach((id) => dismiss(id));
  }

  function destroy() {
    // Clear all toasts immediately without animation
    for (const [id, entry] of toasts) {
      if (entry.timer) clearTimeout(entry.timer);
      entry.closeBtn?.removeEventListener("click", entry.onCloseClick);
      if (entry.actionBtn) entry.actionBtn.removeEventListener("click", entry.onActionClick);
      entry.el.remove();
    }
    toasts.clear();
    delete root._faqirToast;
  }

  const api = { add, dismiss, dismissAll, destroy };
  root._faqirToast = api;
  return api;
}
    return createToastContainer;
  })();

  // ── tooltip ── (registry/recipes/tooltip/tooltip.js)
  var createTooltip = controllerRegistry["tooltip"] = (function() {
// @ui:controller tooltip
// @ui:provides show hide destroy

function createTooltip(root) {
  // Prevent double-init
  if (root._faqirTooltip) return root._faqirTooltip;

  const trigger = root.querySelector("[data-part='trigger']");
  const content = root.querySelector("[data-part='content']");

  let showTimer = null;
  let hideTimer = null;

  function show() {
    clearTimeout(hideTimer);
    hideTimer = null;
    root.dataset.state = "visible";
    content.hidden = false;
  }

  function hide() {
    clearTimeout(showTimer);
    showTimer = null;
    root.dataset.state = "hidden";
    content.hidden = true;
  }

  function scheduleShow() {
    clearTimeout(hideTimer);
    hideTimer = null;
    showTimer = setTimeout(show, 200);
  }

  function scheduleHide() {
    clearTimeout(showTimer);
    showTimer = null;
    hideTimer = setTimeout(hide, 100);
  }

  function onMouseEnter() {
    scheduleShow();
  }

  function onMouseLeave() {
    scheduleHide();
  }

  function onFocusIn() {
    scheduleShow();
  }

  function onFocusOut() {
    scheduleHide();
  }

  function onKeyDown(e) {
    if (e.key === "Escape" && root.dataset.state === "visible") {
      e.stopPropagation();
      hide();
    }
  }

  trigger?.addEventListener("mouseenter", onMouseEnter);
  trigger?.addEventListener("mouseleave", onMouseLeave);
  trigger?.addEventListener("focusin", onFocusIn);
  trigger?.addEventListener("focusout", onFocusOut);
  root.addEventListener("keydown", onKeyDown);

  function destroy() {
    clearTimeout(showTimer);
    clearTimeout(hideTimer);
    trigger?.removeEventListener("mouseenter", onMouseEnter);
    trigger?.removeEventListener("mouseleave", onMouseLeave);
    trigger?.removeEventListener("focusin", onFocusIn);
    trigger?.removeEventListener("focusout", onFocusOut);
    root.removeEventListener("keydown", onKeyDown);
    delete root._faqirTooltip;
  }

  const api = { show, hide, destroy };
  root._faqirTooltip = api;
  return api;
}
    return createTooltip;
  })();

  // ═══════════════════════════════════════════════════════
  // Section 8: Global API
  // ═══════════════════════════════════════════════════════

  var customMagics = new Map();

  function findParentScope(el) {
    var parent = el.parentElement;
    while (parent) {
      if (parent.__faqirScope) return parent.__faqirScope;
      parent = parent.parentElement;
    }
    return null;
  }

  // ═══════════════════════════════════════════════════════
  // Section 9: Bootstrap & Auto-init
  // ═══════════════════════════════════════════════════════

  function bootstrap() {
    injectCloakStyle();

    // Auto-init controllers for all [data-ui] elements
    var names = Object.keys(controllerRegistry);
    for (var n = 0; n < names.length; n++) {
      var els = document.querySelectorAll('[data-ui="' + names[n] + '"]');
      for (var e = 0; e < els.length; e++) {
        controllerRegistry[names[n]](els[e]);
      }
    }

    // Find all scope roots.
    // l-data elements always create a scope.
    // data-ui elements only create a scope when standalone (no l-data ancestor).
    var roots = document.querySelectorAll('[l-data], [data-ui]');
    var processed = new Set();

    for (var r = 0; r < roots.length; r++) {
      var rootEl = roots[r];
      if (processed.has(rootEl)) continue;

      // Skip if nested inside an unprocessed ancestor l-data scope
      var ancestor = rootEl.parentElement;
      var skipThis = false;
      while (ancestor) {
        if (ancestor.hasAttribute('l-data') && !processed.has(ancestor)) {
          skipThis = true;
          break;
        }
        ancestor = ancestor.parentElement;
      }

      // data-ui elements without l-data only need a scope if they are standalone
      // (not inside any l-data). If inside an l-data, they inherit that scope via walkChildren.
      if (!skipThis && !rootEl.hasAttribute('l-data') && rootEl.hasAttribute('data-ui')) {
        // Check if this data-ui is inside a processed l-data scope — if so, skip
        var lDataAncestor = rootEl.parentElement;
        while (lDataAncestor) {
          if (lDataAncestor.hasAttribute('l-data') && processed.has(lDataAncestor)) {
            skipThis = true;
            break;
          }
          lDataAncestor = lDataAncestor.parentElement;
        }
      }

      if (!skipThis) {
        initTree(rootEl, null);
        var descendants = rootEl.querySelectorAll('[l-data]');
        for (var d = 0; d < descendants.length; d++) processed.add(descendants[d]);
        processed.add(rootEl);
      }
    }

    removeCloaks();

    // MutationObserver for dynamically added elements
    var observer = new MutationObserver(function(mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var addedNodes = mutations[i].addedNodes;
        for (var j = 0; j < addedNodes.length; j++) {
          var node = addedNodes[j];
          if (node.nodeType !== 1) continue;

          var uiName = node.getAttribute ? node.getAttribute('data-ui') : null;
          if (uiName && controllerRegistry[uiName]) {
            controllerRegistry[uiName](node);
          }

          if (node.hasAttribute && node.hasAttribute('l-data')) {
            initTree(node, findParentScope(node));
          } else if (node.hasAttribute && node.hasAttribute('data-ui') && !findParentScope(node)) {
            // Standalone data-ui (no parent scope) — create its own scope
            initTree(node, null);
          }

          if (node.querySelectorAll) {
            var cNames = Object.keys(controllerRegistry);
            for (var cn = 0; cn < cNames.length; cn++) {
              var cEls = node.querySelectorAll('[data-ui="' + cNames[cn] + '"]');
              for (var ce = 0; ce < cEls.length; ce++) controllerRegistry[cNames[cn]](cEls[ce]);
            }
            var scopeEls = node.querySelectorAll('[l-data]');
            for (var se = 0; se < scopeEls.length; se++) {
              if (!scopeEls[se].__faqirScope) {
                initTree(scopeEls[se], findParentScope(scopeEls[se]));
              }
            }
          }
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  // Auto-start logic
  var currentScript = typeof document !== 'undefined' ? document.currentScript : null;
  var isManual = currentScript && currentScript.hasAttribute('data-manual');

  if (!isManual && typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', bootstrap);
    } else {
      bootstrap();
    }
  }

  // ═══════════════════════════════════════════════════════
  // Public API
  // ═══════════════════════════════════════════════════════

  var Faqir = {
    version: '0.1.0',
    reactive: reactive,
    effect: effect,
    batch: batch,
    untrack: untrack,
    evaluate: evaluate,
    evaluateAssignment: evaluateAssignment,
    nextTick: function(fn) { return queueMicrotask(fn || function() {}); },
    data: function(name, factory) { dataRegistry.set(name, factory); },
    store: function(name, obj) { globalStores[name] = reactive(obj); },
    directive: function(name, handler) { customDirectives.set(name, handler); },
    magic: function(name, callback) { customMagics.set(name, callback); },
    plugin: function(fn) { fn(Faqir); },
    controller: function(name, factory) { controllerRegistry[name] = factory; },
    start: bootstrap,
    initTree: initTree,
    // Run the cleanups registered on `el` and its descendants (l-source abort +
    // poll teardown, effect disposers, …). Structural directives call this
    // automatically on l-if hide / keyed l-for removal; exposed for imperative
    // teardown of a subtree. [0.3-08]
    destroy: destroyScope
  };

  return Faqir;
});
