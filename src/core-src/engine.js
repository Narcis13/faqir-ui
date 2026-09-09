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
  // Section 0: Dev-build seam  [task 0.7-12]
  // ═══════════════════════════════════════════════════════
  //
  // `faqir-core.js` (production) and `faqir-core.dev.js` are assembled from THIS
  // one source by scripts/build-core.mjs. Three markers decide what each build
  // keeps:
  //
  //   /* @faqir:dev */ <code>    — the marker is stripped for the dev build and
  //                                the WHOLE LINE is dropped for production.
  //   // @faqir:dev-start … end  — the same, for a multi-line region.
  //   // @faqir:dev-diagnostics  — replaced by src/core-src/dev-diagnostics.js
  //                                in the dev build, dropped in production.
  //
  // Every dev-only message string therefore lives in dev-diagnostics.js and
  // never reaches the production file (proved by tests/build/dev-build.test.ts).
  //
  // `devHooks` is the only seam: null in production, an object of reporters in
  // the dev build. Call sites read `if (devHooks)` on a dev-marked line, so
  // production carries neither the guard nor the message.
  var devHooks = null;

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
      /* @faqir:dev */ if (devHooks) { devHooks.expressionError('expression', expression, el, e); return undefined; }
      console.warn('[Faqir] Expression error: "' + expression + '"', e);
      return undefined;
    }
  }

  function evaluateAssignment(expression, scope, el) {
    try {
      const fn = compileStatement(expression);
      fn.call(scope, scope, el);
    } catch (e) {
      /* @faqir:dev */ if (devHooks) { devHooks.expressionError('statement', expression, el, e); return; }
      console.warn('[Faqir] Statement error: "' + expression + '"', e);
    }
  }

  // Write a value into a scope property WITHOUT putting the value into source.
  //
  // l-model used to build "prop = '" + value + "'" and compile it, which meant
  // (a) anything typed into an input was executed as JavaScript, (b) a backslash
  // or newline silently corrupted or broke the write, and (c) every distinct
  // value compiled and permanently cached its own Function. Passing the value
  // through a reserved scope slot — the same trick handleOn uses for $event —
  // fixes all three: one compiled statement per binding, and user data is never
  // parsed as code.
  function writeModel(prop, value, scope, el) {
    scope.$modelValue = value;
    try {
      evaluateAssignment(prop + ' = $modelValue', scope, el);
    } finally {
      delete scope.$modelValue;
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

  // --- 3.0 Declared vocabulary  [task 1.0R-03] ---
  //
  // The engine's public surface, declared once, in comments only — the minifier
  // drops them, so this costs zero shipped bytes. `src/generator/skill.ts` reads
  // these lines into `.claude/skills/faqir-creator/references/directives.md`, so
  // the reference an agent is sent to is not a transcription: add a line here
  // and the row appears. `tests/generator/skill.test.ts` greps this file for
  // every `l-…` and `$…` name it mentions and fails on any the engine
  // implements without a line below — which is why something that is NOT public
  // vocabulary (the evaluator's own `$scope` binding) is declared `internal`
  // with its reason rather than left out.
  //
  // Fields are ` | `-separated; never use `|` inside one.
  //   @ui:directive <attribute> | <shorthand> | <placement> | <example> | <what it does>
  //   @ui:modifier  <attribute> <.modifier> | <what it does>
  //   @ui:magic     $<name> | <where it resolves> | <what it is>
  //
  // The three lists that already exist as code — PRIORITY (§3.2), KEY_MAP
  // (§3.9) and MOTION_PRESETS (§3.14) — are read from the code itself, not
  // repeated here.
  //
  // @ui:directive l-data | — | any element, which becomes the scope root | l-data="{ count: 0 }" | Declares a reactive scope from an object literal, or from a name registered with `Faqir.data()`. `data-prop-*` attributes are JSON-parsed and merged over it. Descendants share the scope until the next `l-data`.
  // @ui:directive l-init | — | a scope root, beside `l-data` | l-init="load()" | Runs once, after the scope exists and its `l-source` bindings are injected.
  // @ui:directive l-source:<name> | — | a scope root, beside `l-data` | l-source:tasks="/api/tasks" | Binds a REST collection into the scope as `<name>`, `<name>Loading`, `<name>Error` and the `$<name>` CRUD controller. See below.
  // @ui:directive l-text | — | any element | l-text="count" | Writes the value to `textContent`; `null` and `undefined` write an empty string.
  // @ui:directive l-html | — | any element | l-html="body" | Writes the value to `innerHTML`, unsanitized — never pass user input. The dev engine reports every use.
  // @ui:directive l-bind:<attr> | :<attr> | any element | :disabled="loading" | Binds one attribute. `class` and `style` take a string, an array or an object; boolean attributes are added or removed; `null`, `undefined` and `false` remove the attribute.
  // @ui:directive l-on:<event> | @<event> | any element | @click="count++" | Adds a listener for `<event>`. Inside the expression `$event` is the DOM event.
  // @ui:directive l-model | — | an input, textarea or select, or `[data-ui="switch"]` | l-model="name" | Two-way binding. A checkbox bound to an array is a checkbox group; radios bind by value; `<select multiple>` is not handled. The modifiers below apply to the text-like branch (input, textarea, number) only.
  // @ui:directive l-show | — | any element | l-show="open" | Toggles `display: none`, leaving the element in the DOM. Runs `l-transition` on each flip.
  // @ui:directive l-if | — | a `<template>` element | <template l-if="open"> | Inserts and removes the template's content. Removal tears the subtree down: cleanups run and in-flight `l-source` requests abort.
  // @ui:directive l-for | — | a `<template>` element | <template l-for="(task, i) in tasks"> | Repeats the template's content once per item, with the item and index names bound in a child scope.
  // @ui:directive l-key | — | the same `<template>` as `l-for` | l-key="task.id" | The reconciliation key. Without it items are matched by position, so a reorder re-renders rather than moves; the dev engine reports that case.
  // @ui:directive l-ref | — | any element | l-ref="field" | Registers the element on the scope's `$refs` under that name.
  // @ui:directive l-effect | — | any element | l-effect="document.title = title" | Runs the expression immediately, then again whenever a value it read changes.
  // @ui:directive l-cloak | — | any element | l-cloak | Removed from every element once the tree is initialized. Pair with `[l-cloak] { display: none }` to hide markup before it binds.
  // @ui:directive l-transition | — | an `l-show` element, or a top-level element inside a `<template l-if>` | l-transition="slide-up" | Names the motion preset for that element's enter/leave cycle. The engine only stamps `data-motion`; the CSS animates.
  // @ui:directive l-teleport | — | any element | l-teleport="body" | Moves the element into the first element matching the value, which is a plain CSS selector rather than an expression.
  //
  // @ui:modifier l-model .number | Casts the input value with `parseFloat` (`0` when it does not parse).
  // @ui:modifier l-model .trim | Trims the input value before assigning.
  // @ui:modifier l-model .lazy | Binds on `change` instead of `input`.
  // @ui:modifier l-model .debounce | Debounces the write by 300ms. Fixed — unlike `l-on`, this one reads no time.
  // @ui:modifier l-on .prevent | `preventDefault()` before the expression runs.
  // @ui:modifier l-on .stop | `stopPropagation()` before the expression runs.
  // @ui:modifier l-on .self | Ignores the event unless `event.target` is the element itself.
  // @ui:modifier l-on .once | Listener option `once` — removed after it fires.
  // @ui:modifier l-on .capture | Listener option `capture`.
  // @ui:modifier l-on .passive | Listener option `passive`.
  // @ui:modifier l-on .window | Listens on `window` instead of the element.
  // @ui:modifier l-on .document | Listens on `document` instead of the element.
  // @ui:modifier l-on .debounce | Debounces the handler, 250ms by default. A custom time is part of the same modifier — `.debounce500ms`, `.debounce2s`. A dotted `.debounce.500ms` is TWO modifiers and the time is ignored.
  // @ui:modifier l-on .throttle | Throttles the handler, 250ms by default. Takes a time the same way — `.throttle1s`.
  // @ui:modifier l-source .lazy | Skips the load on init — the collection stays empty until `$<name>.load()`.
  // @ui:modifier l-source .optimistic | Applies create/update/remove to the local array first and rolls back if the request fails.
  // @ui:modifier l-source .poll | Re-loads on an interval, 30000ms by default. Takes the interval: `.poll.5000`.
  // @ui:modifier l-source .key | Names the identity property, `id` by default: `.key.uuid`.
  //
  // @ui:magic $el | every expression | The scope ROOT — the element carrying `l-data`, not the element the expression is written on. Every magic that walks the DOM starts from here.
  // @ui:magic $refs | every expression | The scope's `l-ref` elements, keyed by name. Cleared entry by entry as elements are destroyed.
  // @ui:magic $store | every expression | Every store registered with `Faqir.store()`.
  // @ui:magic $state | every expression | `data-state` of the `[data-ui]` closest to the scope root. Writable — assigning sets the attribute — and reads re-run when a controller changes it.
  // @ui:magic $variant | every expression | `data-variant` of the same `[data-ui]`, writable and observed the same way.
  // @ui:magic $ui | every expression | The controller API of that same `[data-ui]` — `$ui.open()`. Also callable, to reach ANOTHER component's controller by CSS selector: `$ui('#detail-drawer').open()`, which returns `null` when nothing matches or the match has no controller.
  // @ui:magic $dispatch | every expression | `$dispatch('name', detail)` fires a bubbling, composed `CustomEvent` from the scope root.
  // @ui:magic $nextTick | every expression | `$nextTick(fn)` queues `fn` as a microtask, so it runs after the effects a mutation queued have flushed and the DOM is updated.
  // @ui:magic $watch | every expression | `$watch('key', function (value, old) { … })` — returns a disposer.
  // @ui:magic $id | every expression | `$id('label')` returns `faqir-<scope>-label`, stable for the scope and unique across scopes.
  // @ui:magic $event | `l-on` expressions only | The DOM event being handled. Set for the duration of the handler and deleted again after it, so it reads as `undefined` anywhere else.
  // @ui:magic $scope | internal | the evaluator compiles every expression to `with($scope) { … }`, so the name runs through the engine source as that compiled function's own parameter. Page code never writes it.
  // @ui:magic $modelValue | internal | `l-model`'s transport slot. The value a control produces is placed here and the assignment compiles to `prop = $modelValue`, so what the user typed is never spliced into source and never reaches the compiler. Set for the duration of one write and deleted after it; page code never sees it.
  //
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

  // Directives `initScope` has already consumed by the time `initTree` gets to
  // apply the rest. Everything else written on a scope root has to be applied
  // HERE: `walkChildren` visits descendants only, so a directive on the root
  // element itself is seen by nobody else. Until 1.0 only plugin directives were
  // run here, which made `l-effect`, `l-on`, `l-text`, `l-show`, `l-bind`,
  // `l-model` and `l-ref` inert — with no error — on the one element the docs
  // point authors at ("a scope root, beside `l-data`"). [W2-1]
  var ROOT_CONSUMED = { data: 1, source: 1, init: 1 };

  function initTree(root, parentScope) {
    var scope = initScope(root, parentScope);

    var rootDirectives = parseDirectives(root);
    rootDirectives.sort(function(a, b) {
      return (PRIORITY[a.type] || 10) - (PRIORITY[b.type] || 10);
    });
    for (var i = 0; i < rootDirectives.length; i++) {
      var rootDir = rootDirectives[i];
      if (ROOT_CONSUMED[rootDir.type]) continue;
      // `l-if` / `l-for` claim the element they sit on and re-render it from a
      // template. A scope root is not a template slot — it is the thing the
      // structural directive would have to destroy — so they stay the parent
      // walk's business and are skipped rather than applied to `root` itself.
      if (rootDir.type === 'if' || rootDir.type === 'for') continue;
      applyDirective(root, rootDir, scope);
    }

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

  // Directives that live OUTSIDE every scope root.
  //
  // Bootstrap only ever walked out from `[l-data]` / `[data-ui]` elements, so an
  // attribute on anything else was parsed by nobody. The canonical `l-validate`
  // markup — `<form l-validate>` wrapping a `[data-ui="field-group"]`, straight
  // out of the plugin's own documentation — has no `l-data` anywhere, which is
  // why the plugin looked "completely inert": it was registered, the attribute
  // was on the form, and no code path ever reached the form to apply it. Same
  // for a bare `@click` or `l-text` on a page that never declared a scope.
  //
  // This sweep binds them against the implicit document scope. It stops at any
  // element that already owns a scope — that subtree was walked from its own
  // root — so it visits only the parts of the page nothing else claimed. [W2-1]
  function walkUnscoped(el, scope) {
    var children = [].slice.call(el.children);
    for (var i = 0; i < children.length; i++) {
      var child = children[i];
      // `__faqirStray` is this sweep's equivalent of `__faqirScope`: stray
      // elements never get a scope of their own, so without a mark a second
      // `Faqir.start()` re-bound every one of them and each `@click` fired
      // twice. The subtree was walked with it the first time, so skipping the
      // element skips the subtree too. [W3-1]
      if (child.__faqirScope || child.__faqirStray) continue;
      child.__faqirStray = true;
      processElement(child, scope);
      if (child.parentNode) walkUnscoped(child, scope);
    }
  }

  // The scope those stray directives evaluate against: empty data, magics rooted
  // at `<body>`. Created once, on first use, so a page with no stray directive
  // pays nothing for it.
  var strayScope = null;
  function getStrayScope() {
    if (!strayScope) {
      if (!document.body.__scopeId) document.body.__scopeId = ++scopeCounter;
      if (!document.body.__faqirCleanups) document.body.__faqirCleanups = [];
      // Deliberately NOT stored as `document.body.__faqirScope`: `findParentScope`
      // would then answer "yes, scoped" for every element on the page and the
      // MutationObserver would stop giving standalone `[data-ui]` islands their
      // own scope.
      strayScope = createScopeWithMagics({}, document.body, document.body);
    }
    return strayScope;
  }

  function processElement(el, scope) {
    var directives = parseDirectives(el);
    if (directives.length === 0) return;

    directives.sort(function(a, b) {
      return (PRIORITY[a.type] || 10) - (PRIORITY[b.type] || 10);
    });

    // Structural directives take over the element — and both anchor a comment
    // where the element stands, so an element that no longer stands anywhere has
    // nothing to do. A `<template l-for>` is replaced by its own anchor the first
    // time it renders, and the MutationObserver is handed that detached template
    // one microtask later. [W2-1]
    for (var i = 0; i < directives.length; i++) {
      if (directives[i].type === 'if') {
        if (el.parentNode) handleIf(el, directives[i], scope);
        return;
      }
      if (directives[i].type === 'for') {
        if (el.parentNode) handleFor(el, directives[i], scope);
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

    // A data source spread into `l-data` can own timers, sockets or in-flight
    // requests, and until 1.0 nothing gave it a way to be told the scope had
    // gone: `apiSource()`'s `setInterval` poll and its `fetch` calls simply
    // outlived the element, which on an SPA route change means one live poller
    // per page the user ever visited. Any own `__faqirTeardown` function on the
    // scope data is run on teardown — namespaced so no ordinary data key can be
    // mistaken for one. [W3-1]
    if (typeof userData.__faqirTeardown === 'function') {
      var sourceTeardown = userData.__faqirTeardown;
      addCleanup(root, function() { sourceTeardown(); });
    }

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
      $ui: { get: function() { return uiHandle(el); }, enumerable: false },
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
        value: function(key, cb) {
          var dispose = watchProperty(scope, key, cb);
          // `$watch` handed its disposer back and nothing ever held one, so a
          // watcher created in `l-init` — the documented place to create one —
          // outlived every teardown and kept firing against a dead scope.
          // Registering it here makes `Faqir.destroy()` stop it; the return
          // value still works for callers that dispose by hand. [W3-1]
          addCleanup(root, dispose);
          return dispose;
        },
        enumerable: false
      },
      $id: {
        value: function(name) { return 'faqir-' + root.__scopeId + '-' + name; },
        enumerable: false
      }
    });

    // Plugins register a magic without reaching into scope internals. Resolve
    // it lazily so the callback receives the final reactive scope, not the
    // pre-proxy target that exists while this object is being assembled.
    customMagics.forEach(function(callback, name) {
      var key = '$' + name;
      if (Object.prototype.hasOwnProperty.call(magics, key)) return;
      Object.defineProperty(magics, key, {
        get: function() { return callback(el, scope); },
        enumerable: false
      });
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

  // The nearest ancestor (inclusive) that OWNS a cleanup list.
  //
  // A different question from `findScopeRoot`, and the reason four disposers
  // went missing. Cleanup ownership follows the `__faqirCleanups` array —
  // stamped by `initScope`, `handleIf`, `handleFor` and `handleTeleport` —
  // rather than the scope object, because the two do not always sit on the same
  // element: `l-teleport` moves a subtree out of its scope root, so every
  // directive bound underneath it resolved to no owner at all and its disposer
  // was dropped on the floor. [W3-1]
  function findCleanupRoot(el) {
    var node = el;
    while (node) {
      if (node.__faqirCleanups) return node;
      node = node.parentNode;
    }
    return null;
  }

  /**
   * Register `cleanupFn` against the element that owns `el`'s teardown.
   *
   * `owner` is the escape hatch for the detached case. `l-if` and `l-for` insert
   * an anchor comment and then `el.remove()` their own `<template>`, so by the
   * time the list effect is registered `el` has no parent, resolves to no owner,
   * and the disposer is discarded — `Faqir.destroy()` could not stop a list that
   * went on re-rendering into the live document after teardown, contradicting
   * what `faqir-core.d.ts` promises. Callers that detach capture the owner
   * BEFORE they do and pass it here. [W3-1]
   */
  function addCleanup(el, cleanupFn, owner) {
    var root = owner || findCleanupRoot(el);
    if (root && root.__faqirCleanups) {
      root.__faqirCleanups.push(cleanupFn);
    }
  }

  // Run one node's cleanups exactly once. The list is emptied BEFORE it runs, so
  // a cleanup that tears down its own subtree re-entrantly finds nothing left to
  // do rather than disposing everything twice. One failing disposer must not
  // strand the ones behind it — teardown is the path where a half-finished job
  // is the leak.
  function runCleanups(node) {
    var list = node.__faqirCleanups;
    if (!list || list.length === 0) return;
    node.__faqirCleanups = [];
    for (var i = 0; i < list.length; i++) {
      try {
        list[i]();
      } catch (e) {
        console.error('[Faqir] a cleanup threw during teardown', node, e);
      }
    }
  }

  /**
   * Tear down `el` and everything under it.
   *
   * Walks CHILD NODES, not `querySelectorAll('*')`. `l-if` and `l-for` own their
   * subtree through an anchor COMMENT — that is the node their list effect's
   * disposer is registered on — and an element-only walk cannot see a comment,
   * so `Faqir.destroy()` left both structural directives running: the effect
   * stayed subscribed and went on re-rendering into a document nothing was
   * supposed to be driving any more. [W3-1]
   */
  function destroyScope(el) {
    if (!el) return;
    runCleanups(el);
    var child = el.firstChild;
    while (child) {
      // Read the sibling first: a cleanup is allowed to remove its own node.
      var next = child.nextSibling;
      destroyScope(child);
      child = next;
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

    // Inject controller as $<name>
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
      // Uncloak as soon as the element is bound. Bootstrap's sweep still runs
      // (it catches elements no directive walk reaches), and so does the
      // MutationObserver's — but content rendered by `l-if`/`l-for` is bound
      // here, before it is ever inserted, so it never needs either. [W3-1]
      case 'cloak':      el.removeAttribute('l-cloak'); return;
      case 'teleport':   return handleTeleport(el, dir, scope);
      case 'transition': return; // Handled by l-show and l-if
      default:
        if (customDirectives.has(dir.type)) {
          var cleanupFn = customDirectives.get(dir.type)(el, dir, scope);
          if (typeof cleanupFn === 'function') addCleanup(el, cleanupFn);
        }
        /* @faqir:dev */ else if (devHooks) devHooks.unknownDirective(el, dir);
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
    /* @faqir:dev */ if (devHooks) devHooks.htmlNotice(el, dir.expression);
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
    // Once per document. A second `Faqir.start()` used to append another
    // identical <style> to <head>, and nothing ever removed either. [W3-1]
    if (document.querySelector('style[data-faqir-cloak]')) return;
    var style = document.createElement('style');
    style.setAttribute('data-faqir-cloak', '');
    style.textContent = '[l-cloak] { display: none !important; }';
    document.head.appendChild(style);
  }

  /**
   * Strip `l-cloak` from `within` and everything under it (the whole document
   * when called with nothing).
   *
   * The sweep used to run exactly once, at the end of bootstrap, against a
   * document-wide selector. Anything inserted afterwards — an `l-if` branch, an
   * `l-for` row, a fragment an application appended — kept the attribute, and
   * the injected `[l-cloak] { display: none !important }` rule then hid it
   * permanently: content that had bound correctly and could never be seen. The
   * MutationObserver runs this over every node it is handed. [W3-1]
   */
  function removeCloaks(within) {
    var host = within || document;
    if (host.nodeType === 1 && host.hasAttribute('l-cloak')) {
      host.removeAttribute('l-cloak');
    }
    var els = host.querySelectorAll ? host.querySelectorAll('[l-cloak]') : [];
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

    // Call off a cycle still in flight on this element before starting a new
    // one. A toggle that arrives before the previous cycle completed used to
    // leave the old cycle's finisher armed, and it would then fire *into* the
    // new one: clearing the new `data-motion` mid-flight (so the element jumps
    // instead of animating), and — when the stale cycle was a leave — running
    // its `done`, which sets `display: none` on an element the new enter had
    // just made visible. One cancel handle per element, cleared on completion.
    if (el.__faqirMotion) el.__faqirMotion();
    el.__faqirMotion = null;

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

    // Cancelled between the from-state and the rAF: the next cycle has already
    // stamped its own from-state, so this one must not stamp its active stage.
    var cancelled = false;
    el.__faqirMotion = function() { cancelled = true; };

    raf(function() {
      if (cancelled) return;
      el.setAttribute('data-motion', phase + '-active'); // to-state + transition

      var finished = false;
      var timer = null;
      function teardown() {
        clearTimeout(timer);
        el.removeEventListener('transitionend', onEnd);
        el.removeEventListener('animationend', onEnd);
      }
      function finish() {
        if (finished || cancelled) return;
        finished = true;
        teardown();
        el.__faqirMotion = null;
        el.removeAttribute('data-motion');
        done();
      }
      function onEnd(e) {
        if (e.target === el) finish(); // ignore transitions bubbling from children
      }

      el.addEventListener('transitionend', onEnd);
      el.addEventListener('animationend', onEnd);
      timer = setTimeout(finish, motionTimeoutMs(el));
      el.__faqirMotion = function() { cancelled = true; teardown(); };
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

    // Every branch below binds a DOM listener, and not one of them ever removed
    // it: the effect disposer was registered, the `addEventListener` was not.
    // So `Faqir.destroy()` left five live listeners writing user input back into
    // a scope nothing was supposed to be driving any more — for the life of the
    // page, on every `l-model` the page had ever mounted. One helper, so a sixth
    // branch cannot forget. [W3-1]
    function bind(eventName, handler) {
      el.addEventListener(eventName, handler);
      addCleanup(el, function() { el.removeEventListener(eventName, handler); });
    }

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
      bind('change', function() {
        writeModel(prop, el.checked, scope, el);
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
      bind('change', function() {
        var current = evaluate(prop, scope, el);
        if (Array.isArray(current)) {
          var arr = current.slice();
          var idx = arr.indexOf(el.value);
          if (el.checked && idx < 0) arr.push(el.value);
          else if (!el.checked && idx >= 0) arr.splice(idx, 1);
          writeModel(prop, arr, scope, el);
        } else {
          writeModel(prop, el.checked, scope, el);
        }
      });
      addCleanup(el, cl);

    } else if (tag === 'input' && type === 'radio') {
      var cl = effect(function() {
        el.checked = evaluate(prop, scope, el) === el.value;
      });
      bind('change', function() {
        if (el.checked) {
          writeModel(prop, el.value, scope, el);
        }
      });
      addCleanup(el, cl);

    } else if (tag === 'select') {
      var cl = effect(function() {
        el.value = evaluate(prop, scope, el) || '';
      });
      bind('change', function() {
        writeModel(prop, el.value, scope, el);
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
          writeModel(prop, value, scope, el);
        } else {
          writeModel(prop, value, scope, el);
        }
      };

      if (modifiers.has('debounce')) {
        inputHandler = debounce(inputHandler, 300);
      }

      bind(eventName, inputHandler);
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

    // The anchor owns this directive's teardown.
    //
    // `el` is detached one line above, so `addCleanup(el, …)` resolved to no
    // owner and the disposer was discarded — `Faqir.destroy()` could not stop
    // an `l-if` at all. The anchor stands exactly where the template stood, so
    // it is inside the subtree `destroyScope` walks, and it survives every
    // toggle. [W3-1]
    anchor.__faqirCleanups = [];

    // EVERY node the template renders, not only the elements. Filtering to
    // `nodeType === 1` left text and comment nodes in the document on each
    // hide, so ten toggles of a two-element template left 34 child nodes where
    // 2 were expected — and each cycle added more. [W3-1]
    var insertedNodes = [];

    var cl = effect(function() {
      var value = evaluate(dir.expression, scope, el);

      if (value) {
        if (insertedNodes.length === 0) {
          var fragment = el.content.cloneNode(true);
          var nodes = [].slice.call(fragment.childNodes);

          for (var i = 0; i < nodes.length; i++) {
            if (nodes[i].nodeType !== 1) continue;

            // A cloned top node carrying `l-data` is a scope root in its own
            // right. `processElement` has no `case 'data'` — nothing there
            // creates a scope — so the node was stamped with the ENCLOSING
            // scope, its literal never evaluated, and `processSourceDirectives`
            // never ran: `l-source` inside an `l-if` issued zero fetches.
            // `initTree` is the one path that builds a scope. [W3-1]
            if (nodes[i].hasAttribute('l-data')) {
              initTree(nodes[i], scope);
              continue;
            }

            // Mark as initialized (mirrors handleFor) so a later
            // walkChildren pass over an ancestor doesn't re-process these
            // nodes — re-processing would re-bind handlers and evaluate
            // expressions outside the scope they were rendered with.
            nodes[i].__faqirScope = scope;
            nodes[i].__faqirCleanups = nodes[i].__faqirCleanups || [];
            processElement(nodes[i], scope);
            // A top-level structural directive replaces the node with its own
            // anchor; there is then nothing left to walk into.
            if (nodes[i].parentNode) walkChildren(nodes[i], scope);
          }

          // Re-read the fragment rather than trusting the pre-processing
          // snapshot: a top-level `l-if`/`l-for` inside this template has by now
          // swapped its own <template> for an anchor plus rendered content, so
          // `nodes` describes something that no longer exists. (Same reason
          // `handleFor.createEntry` re-captures.)
          insertedNodes = [].slice.call(fragment.childNodes);
          anchor.parentNode.insertBefore(fragment, anchor.nextSibling);

          for (var i = 0; i < insertedNodes.length; i++) {
            if (insertedNodes[i].nodeType === 1 && insertedNodes[i].hasAttribute('l-transition')) {
              runEnterTransition(insertedNodes[i]);
            }
          }
        }
      } else {
        for (var i = 0; i < insertedNodes.length; i++) {
          var node = insertedNodes[i];
          if (node.nodeType === 1 && node.hasAttribute('l-transition')) {
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

    addCleanup(el, cl, anchor);
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
  // Dev-build only — production never detects the reorder. [task 0.7-12]
  // @faqir:dev-start
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
  // @faqir:dev-end

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

    // Same as `l-if`: the template is detached above, so the anchor — which
    // stands where it stood and is reachable from `destroyScope` — is what owns
    // the list effect's disposer. Registering it against the detached template
    // dropped it, and a destroyed scope went on rendering rows. [W3-1]
    anchor.__faqirCleanups = [];

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
        // A row whose top node declares `l-data` is a scope root: build it with
        // `initTree` (which evaluates the literal and reads `l-source`) instead
        // of stamping it with the row scope and leaving both inert. [W3-1]
        if (nodes[j].hasAttribute('l-data')) {
          initTree(nodes[j], childScope);
          continue;
        }
        nodes[j].__faqirScope = childScope;
        nodes[j].__faqirCleanups = [];
        processElement(nodes[j], childScope);
        if (nodes[j].parentNode) walkChildren(nodes[j], childScope);
      }
      // Re-capture the fragment's children: a top-level structural directive
      // (l-if / nested l-for) replaces its <template> with an anchor comment
      // plus rendered content INSIDE the fragment. The pre-processing `nodes`
      // snapshot would re-insert the detached template and orphan the anchor,
      // so the entry must own what the fragment actually holds now.
      return { key: key, scope: childScope, nodes: [].slice.call(clone.childNodes) };
    }

    var currentEntries = [];
    // @faqir:dev-start
    var prevItems = null;   // last list snapshot, for the unkeyed-reorder hint
    var warnedReorder = false;
    // @faqir:dev-end

    var cl = effect(function() {
      var list = evaluate(listExpr, scope, el);
      var items = Array.isArray(list) ? list :
                  typeof list === 'number' ? Array.from({ length: list }, function(_, i) { return i + 1; }) :
                  [];

      // Dev-build hint: an unkeyed list reconciles by position, so reordering it
      // rebinds per-row DOM state to the wrong items. Once per list; keyed lists
      // never reach here. Production neither warns nor snapshots the list.
      // @faqir:dev-start
      if (!keyExpr && !warnedReorder && devHooks) {
        if (prevItems && isReorder(prevItems, items)) {
          devHooks.unkeyedReorder(el, dir.expression);
          warnedReorder = true;
        }
        prevItems = items.slice();
      }
      // @faqir:dev-end

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

    addCleanup(el, cl, anchor);
  }

  // --- 3.19 l-teleport ---

  function handleTeleport(el, dir, scope) {
    // Teleporting moves the element OUT of its scope root's subtree, so from
    // here on `findCleanupRoot` walking up from anything inside it lands
    // somewhere else entirely — every disposer bound below a teleport was
    // dropped, and `destroyScope` on the scope root could never have reached
    // the nodes anyway. Two moves fix both halves: the subtree owns its own
    // cleanup list from now on, and the scope that WROTE the teleport keeps a
    // handle that tears that list down. [W3-1]
    var owner = el.parentNode ? findCleanupRoot(el.parentNode) : null;
    if (!el.__faqirCleanups) el.__faqirCleanups = [];

    // The teleported subtree belongs to the scope that wrote the directive, but
    // it now sits somewhere the scope-root sweep will never look — so the
    // unscoped sweep would find it "unclaimed" and bind every directive under it
    // a SECOND time, against the document scope, where the expressions do not
    // resolve. Claiming it here is what tells that sweep to walk past. [W3-1]
    el.__faqirStray = true;

    var cl = effect(function() {
      var target = document.querySelector(dir.expression);
      if (target && el.parentNode !== target) {
        target.appendChild(el);
      }
    });
    addCleanup(el, cl);

    if (owner && owner !== el) {
      addCleanup(el, function() {
        destroyScope(el);
        el.remove();
      }, owner);
    }
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

  /**
   * `$ui`, in both of its forms. [W2-6]
   *
   * `$ui.open()` — unchanged: the controller of the `[data-ui]` this expression
   * sits inside. That is the only thing `$ui` could ever reach, and it is why
   * opening a detail drawer from a table row — the most common admin pattern
   * there is — had no expression that could say it. The page had to invent a
   * global store and an `l-effect` handshake to carry "the user clicked row 7"
   * across two components that were both right there in the DOM.
   *
   * `$ui('#detail-drawer').open()` — the same controller API, for a component
   * named by a CSS selector. Any selector: an id is the useful case, but
   * `$ui('[data-ui="drawer"]')` resolves the first drawer on the page just as
   * well. The selector may match the `[data-ui]` element itself or anything
   * inside it; either way the nearest enclosing component's controller answers.
   *
   * Returns `null` when nothing matches or the match has no controller, so
   * `$ui('#gone')?.open()` is the safe form and a typo cannot throw.
   */
  function resolveUi(target) {
    var node = typeof target === 'string' ? document.querySelector(target) : target;
    return node ? getControllerApi(closestUI(node)) : null;
  }

  function uiHandle(el) {
    var local = getControllerApi(closestUI(el));
    // A callable, with the local controller's own methods hung off it so both
    // forms read from one name. The methods are closures over their controller's
    // state, never `this`-bound, so carrying the reference is enough.
    var handle = function(target) { return resolveUi(target); };
    if (local) for (var key in local) handle[key] = local[key];
    return handle;
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

  // The four events an exit can end with, in one list: bound and unbound
  // together, so neither half can drift from the other.
  var EXIT_EVENTS = ['transitionend', 'transitioncancel', 'animationend', 'animationcancel'];

  // Largest number in a comma-separated CSS time list, in ms ("0.3s, 150ms" → 300).
  function longestTimeMs(value) {
    var parts = String(value == null ? '' : value).split(',');
    var max = 0;
    for (var i = 0; i < parts.length; i++) {
      var raw = parts[i].trim();
      var n = parseFloat(raw);
      if (isNaN(n)) continue;
      if (raw.indexOf('ms') === -1) n *= 1000;
      if (n > max) max = n;
    }
    return max;
  }

  // An upper bound on how long `el`'s motion can run: the longest transition or
  // animation plus the longest delay. Deliberately an over-estimate — it sizes a
  // fallback timer, and a fallback that fires early is worse than one that fires
  // late.
  function longestMotionMs(style) {
    var transition = longestTimeMs(style.transitionDuration) + longestTimeMs(style.transitionDelay);
    var animation = longestTimeMs(style.animationDuration) + longestTimeMs(style.animationDelay);
    return transition > animation ? transition : animation;
  }

  /**
   * Run `done` once `el` has finished its exit motion — the single place every
   * "closing → closed" controller waits.
   *
   * `transitionend` BUBBLES. A panel that contains a button — every dialog,
   * drawer and sheet in the registry ships one, and the drawer manifest marks
   * the close button `required` — receives that button's own `background`
   * transitionend the instant a pointer lands on it. A one-shot listener spends
   * itself on that event and the panel's own `transform` transitionend, when it
   * arrives, finds nobody listening. The drawer therefore never finalised
   * `closing → closed` through the one control it tells you not to remove: the
   * overlay stayed up, `body` stayed at `overflow: hidden`, the page was dead.
   *
   * So four rules, all of them load-bearing:
   *   • only `el`'s OWN motion counts (`e.target === el`) — descendants bubble;
   *   • only `property`, when one is named — sibling properties on the same
   *     element finish at their own times;
   *   • `transitioncancel` / `animationcancel` count as over — an interrupted
   *     transition never sends `transitionend` at all;
   *   • a timer sized from the computed duration runs `done` even if no event
   *     ever arrives (backgrounded tab, `display` change mid-flight).
   *
   * `done` runs at most once — synchronously and immediately when there is no
   * motion to wait for. Returns a canceller for a re-entrant open. [W2-1]
   */
  function whenExitDone(el, property, done) {
    var settled = false;
    var timer = null;

    function unbind() {
      if (timer !== null) { clearTimeout(timer); timer = null; }
      for (var i = 0; i < EXIT_EVENTS.length; i++) el.removeEventListener(EXIT_EVENTS[i], onMotionEvent);
    }

    function settle() {
      if (settled) return;
      settled = true;
      unbind();
      done();
    }

    function onMotionEvent(e) {
      if (e.target !== el) return;
      if (property && e.propertyName && e.propertyName !== property) return;
      settle();
    }

    var ms = 0;
    try {
      ms = longestMotionMs(getComputedStyle(el));
    } catch (err) {
      // No computed style (a bare test DOM) — treat it as "no motion".
    }

    if (!(ms > 0)) { settle(); return function() {}; }

    for (var i = 0; i < EXIT_EVENTS.length; i++) el.addEventListener(EXIT_EVENTS[i], onMotionEvent);
    // A couple of frames of slack before the fallback takes over from the event.
    timer = setTimeout(settle, ms + 50);

    return function cancelExitWait() {
      if (settled) return;
      settled = true;
      unbind();
    };
  }

  // --- From utils.js (debounce/throttle already defined in Section 3.9) ---
  var uidCounter = 0;
  function uid(prefix) { return (prefix || 'faqir') + '-' + (++uidCounter); }
  function clamp(value, min, max) { return Math.min(Math.max(value, min), max); }

  // Shared menu navigation is injected from registry/core/menu-navigation.js.
  // Keeping the module as the authored source lets standalone recipe imports
  // and the assembled browser runtime execute the exact same implementation.
  // @faqir:menu-navigation

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
  // Section 8.5: Inspection & Devtools  [task 0.7-12]
  // ═══════════════════════════════════════════════════════
  //
  // `Faqir.inspect(el)` answers "what is Faqir doing to this element?" in one
  // plain object. It ships in BOTH builds — it is the documented surface an
  // agent (or the `faqir dev` overlay) reads, not a debug-only extra. The same
  // functions hang off `window.__FAQIR_DEVTOOLS__`; see docs/devtools.md for the
  // stable shape.

  // Depth cap for scope snapshots — deeper values collapse to a marker rather
  // than walking an unbounded object graph.
  var SNAPSHOT_MAX_DEPTH = 4;

  /** One value, deep-copied into something plain, finite and printable. */
  function snapshotValue(value, stack, depth) {
    if (typeof value === 'function') {
      return '[Function' + (value.name ? ' ' + value.name : '') + ']';
    }
    if (value === null || typeof value !== 'object') return value;
    if (value.nodeType === 1 && value.tagName) {
      return '[Element <' + value.tagName.toLowerCase() + '>]';
    }
    if (value instanceof Date) return value.toISOString();
    if (stack.indexOf(value) !== -1) return '[Circular]';
    if (depth >= SNAPSHOT_MAX_DEPTH) return '[Depth]';

    stack.push(value);
    var out;
    if (Array.isArray(value)) {
      out = [];
      for (var i = 0; i < value.length; i++) out.push(snapshotValue(value[i], stack, depth + 1));
    } else {
      out = {};
      var keys = Object.keys(value);
      for (var k = 0; k < keys.length; k++) {
        out[keys[k]] = snapshotValue(value[keys[k]], stack, depth + 1);
      }
    }
    stack.pop();
    return out;
  }

  /**
   * Plain snapshot of a scope's DATA. Magics ($el, $refs, $store, …) are
   * non-enumerable by construction, so they never appear — a snapshot is what
   * the author put in `l-data` plus `data-prop-*`, as it stands right now.
   * Reading happens outside any effect, so it registers no dependencies.
   */
  function snapshotScope(scope) {
    if (!scope) return null;
    var out = {};
    var keys = Object.keys(scope);
    for (var i = 0; i < keys.length; i++) {
      // `__`-prefixed keys are engine plumbing (`__faqirTeardown`), not data an
      // agent inspecting the page should have to reason about.
      if (keys[i].slice(0, 2) === '__') continue;
      out[keys[i]] = snapshotValue(scope[keys[i]], [], 0);
    }
    return out;
  }

  /** Short human label for an element: `div#cart[data-ui="card"]`. */
  function describeElement(el) {
    if (!el) return null;
    var label = el.tagName ? el.tagName.toLowerCase() : String(el);
    if (el.id) label += '#' + el.id;
    var ui = el.getAttribute ? el.getAttribute('data-ui') : null;
    if (ui) label += '[data-ui="' + ui + '"]';
    var part = el.getAttribute ? el.getAttribute('data-part') : null;
    if (part) label += '[data-part="' + part + '"]';
    return label;
  }

  /** The nearest ancestor-or-self carrying a live scope, or null. */
  function ownScopeRoot(el) {
    for (var node = el; node; node = node.parentElement) {
      if (node.__faqirScope) return node;
    }
    return null;
  }

  /** The five protocol attributes as they read from `el` / its `[data-ui]`. */
  function protocolState(el, uiEl) {
    var attr = function(node, name) {
      return node && node.getAttribute ? node.getAttribute(name) : null;
    };
    return {
      ui: attr(uiEl, 'data-ui'),
      part: attr(el, 'data-part'),
      variant: attr(uiEl, 'data-variant'),
      size: attr(uiEl, 'data-size'),
      state: attr(uiEl, 'data-state')
    };
  }

  /**
   * Everything Faqir knows about one element.  [task 0.7-12 · §A6]
   *
   * @param {Element|string} target element, or a selector resolved against document
   * @returns {null|{
   *   el: Element,
   *   scopeRoot: Element|null,
   *   scopeId: number|null,
   *   scope: object|null,
   *   directives: {type,arg,expression,modifiers,raw}[],
   *   controller: {ui,el,api,methods}|null,
   *   state: {ui,part,variant,size,state}
   * }}
   */
  function inspect(target) {
    var el = target;
    if (typeof target === 'string') {
      el = typeof document !== 'undefined' ? document.querySelector(target) : null;
    }
    if (!el || el.nodeType !== 1) return null;

    var root = ownScopeRoot(el);
    var uiEl = closestUI(el);
    var api = uiEl ? getControllerApi(uiEl) : null;

    var directives = parseDirectives(el).map(function(d) {
      return {
        type: d.type,
        arg: d.arg == null ? null : d.arg,
        expression: d.expression,
        modifiers: d.modifiers ? d.modifiers.slice() : [],
        raw: d.raw
      };
    });

    return {
      el: el,
      scopeRoot: root,
      scopeId: root && root.__scopeId != null ? root.__scopeId : null,
      scope: root ? snapshotScope(root.__faqirScope) : null,
      directives: directives,
      controller: uiEl && api
        ? {
            ui: uiEl.getAttribute('data-ui'),
            el: uiEl,
            api: api,
            methods: Object.keys(api).filter(function(k) {
              return typeof api[k] === 'function';
            }).sort()
          }
        : null,
      state: protocolState(el, uiEl)
    };
  }

  /**
   * `window.__FAQIR_DEVTOOLS__` — the stable handle agents and the `faqir dev`
   * overlay read. Keys never change shape between builds; only `dev` flips.
   */
  var devtools = {
    /** Handle schema version. Bumped only on a breaking shape change. */
    version: 1,
    /** true in `faqir-core.dev.js`, false in the production engine. */
    dev: false,
    /** The Faqir global itself (assigned once the public API is built). */
    faqir: null,
    inspect: inspect,
    /**
     * Declared scope roots in document order: elements with `l-data` (or a
     * standalone `[data-ui]`) that carry a live scope. Per-item scopes made by
     * `l-for`/`l-if` are reachable with `inspect()` on any node inside them.
     */
    scopes: function(within) {
      var host = within || (typeof document !== 'undefined' ? document : null);
      if (!host) return [];
      var els = [].slice.call(host.querySelectorAll('[l-data], [data-ui]'));
      var out = [];
      for (var i = 0; i < els.length; i++) {
        if (!els[i].__faqirScope) continue;
        out.push({
          el: els[i],
          id: els[i].__scopeId != null ? els[i].__scopeId : null,
          label: describeElement(els[i]),
          scope: snapshotScope(els[i].__faqirScope)
        });
      }
      return out;
    },
    /** Every mounted component, with its protocol attributes and its parts. */
    components: function(within) {
      var host = within || (typeof document !== 'undefined' ? document : null);
      if (!host) return [];
      var els = [].slice.call(host.querySelectorAll('[data-ui]'));
      var out = [];
      for (var i = 0; i < els.length; i++) {
        var el = els[i];
        var partEls = [].slice.call(el.querySelectorAll('[data-part]'));
        var parts = [];
        for (var p = 0; p < partEls.length; p++) {
          if (partEls[p].closest('[data-ui]') !== el) continue;
          var name = partEls[p].getAttribute('data-part');
          if (parts.indexOf(name) === -1) parts.push(name);
        }
        out.push({
          el: el,
          label: describeElement(el),
          ui: el.getAttribute('data-ui'),
          variant: el.getAttribute('data-variant'),
          size: el.getAttribute('data-size'),
          state: el.getAttribute('data-state'),
          parts: parts.sort(),
          controller: !!getControllerApi(el)
        });
      }
      return out;
    },
    /** Snapshot of every `Faqir.store()` registered on the page. */
    stores: function() {
      var out = {};
      var names = Object.keys(globalStores);
      for (var i = 0; i < names.length; i++) {
        out[names[i]] = snapshotValue(globalStores[names[i]], [], 0);
      }
      return out;
    },
    /**
     * Diagnostics recorded so far, oldest first. Always an array: the
     * production engine records nothing, so it is always empty there.
     */
    warnings: function() { return devHooks ? devHooks.warnings() : []; }
  };

  // @faqir:dev-diagnostics

  // ═══════════════════════════════════════════════════════
  // Section 9: Bootstrap & Auto-init
  // ═══════════════════════════════════════════════════════

  // Mount one controller, containing any failure to that component.
  //
  // Controllers are invoked in a bare loop during bootstrap. A controller that
  // throws — the usual cause is markup missing a part it queries for, which an
  // agent generating HTML produces routinely — used to abort bootstrap entirely:
  // no scopes, no directives, no Faqir global, every unrelated island on the page
  // left blank. One incomplete component must break that component and nothing
  // else, and the failure has to be visible rather than silent.
  function initController(name, el) {
    try {
      controllerRegistry[name](el);
    } catch (err) {
      /* @faqir:dev */ if (devHooks && devHooks.controllerError) { devHooks.controllerError(name, el, err); }
      console.error('[Faqir] Controller "' + name + '" failed to initialize', el, err);
    }
  }

  // The document's one MutationObserver, or null before the first bootstrap,
  // and the <body> it is currently watching.
  var mutationObserver = null;
  var observedBody = null;

  function bootstrap() {
    injectCloakStyle();

    // Auto-init controllers for all [data-ui] elements
    var names = Object.keys(controllerRegistry);
    for (var n = 0; n < names.length; n++) {
      var els = document.querySelectorAll('[data-ui="' + names[n] + '"]');
      for (var e = 0; e < els.length; e++) {
        initController(names[n], els[e]);
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

      // Already initialized — by an earlier `Faqir.start()`, or by the
      // MutationObserver. Re-running `initTree` over it would build a second
      // scope and apply every directive on top of the first: `start()` twice
      // meant every `@click` handler fired twice, every `l-effect` ran twice
      // and every `l-source` fetched twice. Markup added since the last call
      // still has no scope, so it is still picked up — which is the only reason
      // to call `start()` again. [W3-1]
      if (rootEl.__faqirScope) {
        processed.add(rootEl);
        var seen = rootEl.querySelectorAll('[l-data]');
        for (var sd = 0; sd < seen.length; sd++) processed.add(seen[sd]);
        continue;
      }

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

    // Everything the scope-root pass did not claim. [W2-1]
    walkUnscoped(document.body, getStrayScope());

    // Second controller sweep: structural directives (l-for / l-if) may have
    // rendered recipe markup synchronously during the initTree pass above —
    // after the first sweep ran and before the MutationObserver below starts.
    // Controllers are double-init guarded, so re-invoking is a no-op for
    // elements initialized by the first sweep.
    for (var n2 = 0; n2 < names.length; n2++) {
      var els2 = document.querySelectorAll('[data-ui="' + names[n2] + '"]');
      for (var e2 = 0; e2 < els2.length; e2++) {
        initController(names[n2], els2[e2]);
      }
    }

    removeCloaks();

    // MutationObserver for dynamically added elements. ONE per document: a
    // second `Faqir.start()` used to install another, and every observer then
    // initialized every added node again — the same handler running twice per
    // insertion, which is how one `Faqir.start()` too many double-fired
    // everything on the page. Re-observed only if `document.body` itself was
    // replaced, which is what a test harness swapping bodies does. [W3-1]
    if (mutationObserver && observedBody === document.body) return;
    if (mutationObserver) {
      observedBody = document.body;
      mutationObserver.observe(document.body, { childList: true, subtree: true });
      return;
    }
    observedBody = document.body;

    mutationObserver = new MutationObserver(function(mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var addedNodes = mutations[i].addedNodes;
        for (var j = 0; j < addedNodes.length; j++) {
          var node = addedNodes[j];
          if (node.nodeType !== 1) continue;

          // Content that arrives after bootstrap has already bound by the time
          // it is here; leaving `l-cloak` on it means the injected rule hides
          // it forever. [W3-1]
          removeCloaks(node);

          var uiName = node.getAttribute ? node.getAttribute('data-ui') : null;
          if (uiName && controllerRegistry[uiName]) {
            initController(uiName, node);
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
              for (var ce = 0; ce < cEls.length; ce++) initController(cNames[cn], cEls[ce]);
            }
            var scopeEls = node.querySelectorAll('[l-data]');
            for (var se = 0; se < scopeEls.length; se++) {
              if (!scopeEls[se].__faqirScope) {
                initTree(scopeEls[se], findParentScope(scopeEls[se]));
              }
            }
          }

          // Directives on a node dropped in outside every scope root — the same
          // blind spot bootstrap's sweep closes, for nodes that arrive later.
          //
          // `isConnected` matters: a mutation record is delivered as a microtask,
          // by which time the node it reports may already have been consumed —
          // `l-for` and `l-if` replace their own `<template>` with an anchor, and
          // that template arrives here detached.
          if (node.isConnected !== false && !node.__faqirScope && !findParentScope(node)) {
            var strayHost = getStrayScope();
            processElement(node, strayHost);
            if (node.parentNode) walkUnscoped(node, strayHost);
          }
        }
      }
    });

    mutationObserver.observe(document.body, { childList: true, subtree: true });
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
    // Snapshot of Faqir's view of one element — scope, directives, controller,
    // protocol attributes. [0.7-12]
    inspect: inspect,
    // The same object installed at window.__FAQIR_DEVTOOLS__. Exposed here too
    // so code holding a specific engine instance (a bundler import, a test
    // loading one build) reaches ITS handle rather than whichever engine
    // touched the global last. [0.7-12]
    devtools: devtools,
    // Run the cleanups registered on `el` and its descendants (l-source abort +
    // poll teardown, effect disposers, …). Structural directives call this
    // automatically on l-if hide / keyed l-for removal; exposed for imperative
    // teardown of a subtree. [0.3-08]
    destroy: destroyScope
  };

  // The devtools handle is installed on every page that loads either build —
  // agents read it without knowing how Faqir was bundled. [0.7-12]
  devtools.faqir = Faqir;
  if (typeof window !== 'undefined') {
    window.__FAQIR_DEVTOOLS__ = devtools;
  }

  return Faqir;
});
