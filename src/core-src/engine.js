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

  // --- 3.14 l-transition helpers (Transitions 2.0 — attribute-visible) [0.4-11 · §A4] ---
  //
  // The whole lifecycle is driven through ONE attribute, `data-motion`:
  //   show:  data-motion="enter"  → "enter-active" → (cleared)
  //   hide:  data-motion="leave"  → "leave-active" → (cleared, then removed)
  // registry/base/motion-presets.css styles each stage from motion tokens, so
  // transitions are auditable straight from the DOM. There are NO per-stage CSS
  // classes anywhere — state lives in an attribute and CSS reacts.

  // Named presets shipped by motion-presets.css. Unknown names still animate
  // (the attribute is stamped) but have no styling, so we warn to catch typos.
  var MOTION_PRESETS = { fade: 1, 'slide-up': 1, scale: 1 };

  function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  // Largest value in a computed CSS time list ("0.2s, 150ms" | "0s" | ""), in ms.
  function maxCssTimeMs(list) {
    var max = 0;
    (list || '').split(',').forEach(function(s) {
      var n = parseFloat(s);
      if (!isNaN(n)) max = Math.max(max, s.indexOf('ms') >= 0 ? n : n * 1000);
    });
    return max;
  }

  // How long to wait before force-completing a stage: the element's real
  // transition/animation duration + delay plus a small buffer. transitionend
  // wins when a transition actually runs; the timeout still settles us when the
  // property does not change, no preset CSS is loaded, or the event is missed.
  function motionTimeoutMs(el) {
    var s = getComputedStyle(el);
    return Math.max(
      maxCssTimeMs(s.transitionDuration) + maxCssTimeMs(s.transitionDelay),
      maxCssTimeMs(s.animationDuration) + maxCssTimeMs(s.animationDelay)
    ) + 50;
  }

  // Drive one enter/leave cycle purely through `data-motion` — no per-stage
  // classes. `phase` is 'enter' | 'leave'; `done` fires once the active stage
  // ends (transitionend/animationend) or the timeout fallback fires. The
  // attribute is always cleared on completion — no residue.
  function runMotion(el, phase, done) {
    done = done || function() {};

    if (prefersReducedMotion()) {
      el.removeAttribute('data-motion');
      done();
      return;
    }

    var preset = el.getAttribute('l-transition') || 'fade';
    if (!MOTION_PRESETS[preset]) {
      console.warn('[Faqir] l-transition: unknown preset "' + preset +
        '" — expected one of: fade, slide-up, scale');
    }

    el.setAttribute('data-motion', phase); // from-state (no transition yet)
    el.offsetHeight;                        // force reflow so the from-state commits

    var raf = typeof requestAnimationFrame === 'function'
      ? requestAnimationFrame
      : function(cb) { return setTimeout(cb, 16); };

    raf(function() {
      el.setAttribute('data-motion', phase + '-active'); // to-state + transition

      var finished = false;
      var timer = null;
      function finish() {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        el.removeEventListener('transitionend', onEnd);
        el.removeEventListener('animationend', onEnd);
        el.removeAttribute('data-motion');
        done();
      }
      function onEnd(e) {
        if (e.target === el) finish(); // ignore transitions bubbling from children
      }

      el.addEventListener('transitionend', onEnd);
      el.addEventListener('animationend', onEnd);
      timer = setTimeout(finish, motionTimeoutMs(el));
    });
  }

  function runEnterTransition(el) {
    runMotion(el, 'enter');
  }

  function runLeaveTransition(el, done) {
    runMotion(el, 'leave', done);
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
          runEnterTransition(el);
        }
      } else {
        if (el.hasAttribute('l-transition')) {
          runLeaveTransition(el, function() {
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
              runEnterTransition(insertedNodes[i]);
            }
          }
        }
      } else {
        for (var i = 0; i < insertedNodes.length; i++) {
          var node = insertedNodes[i];
          if (node.hasAttribute && node.hasAttribute('l-transition')) {
            (function(n) {
              runLeaveTransition(n, function() {
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
  // @faqir:controllers

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
