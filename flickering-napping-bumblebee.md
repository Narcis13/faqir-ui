# faqir-core.js — Complete Implementation Plan

## 1. Context & Vision

Faqir UI has 17 CSS-only primitives, 15 interactive recipes, and a stable 5-attribute DOM protocol (`data-ui`, `data-part`, `data-state`, `data-variant`, `data-size`). But the JavaScript story is fragmented: 7 separate core modules, 15 separate controller files, and the playground wires everything up with inline `onclick` handlers and manual `<script type="module">` imports.

**`faqir-core.js` unifies all of this into a single CDN-ready file** that adds AlpineJS-style declarative reactivity on top of the existing Faqir protocol. It replaces all the separate `core/*.js` files and recipe imports at runtime — one `<script>` tag gives you everything.

### What makes this more than "Alpine with `l-` prefix"

1. **`$state` / `$variant` magics** — bidirectional bridge between reactive scope and `data-state`/`data-variant` attributes, so CSS transitions and JS reactive updates stay in sync
2. **`$ui` magic** — access the controller API (`$ui.open()`, `$ui.close()`) from directives
3. **Auto-init recipe controllers** — any `[data-ui]` element gets its controller initialized automatically
4. **Full props in manifests** — typed prop declarations that agents read and runtime resolves via `data-prop-*` attributes
5. **Agent-native** — all reactive state resolves to standard DOM attributes, so agents can inspect the DOM without understanding the reactive system

### Confirmed Decisions

- **Bundle:** All-in-one (~15KB minified, ~6KB gzip) — reactive engine + 15 controllers + utilities
- **Prefix:** `l-` directives (`l-data`, `l-text`, `l-show`, `@click`, `:class`)
- **Props:** Full typed props in every manifest + runtime `data-prop-*` resolution
- **Replaces:** `faqir-core.js` replaces all separate `core/*.js` files at runtime

---

## 2. File Structure & UMD Wrapper

### Output: `registry/core/faqir-core.js`

```javascript
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
  // UMD: CommonJS / AMD / Browser global / ESM
  if (typeof exports === 'object' && typeof module !== 'undefined') {
    module.exports = factory();
  } else if (typeof define === 'function' && define.amd) {
    define(factory);
  } else {
    var Faqir = factory();
    global.Faqir = Faqir;
    // Auto-export for ESM <script type="module"> usage
    if (typeof globalThis !== 'undefined') globalThis.Faqir = Faqir;
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this, function() {
  'use strict';

  // ═══════════════════════════════════════════════════════
  // Section 1: Reactive Engine
  // Section 2: Expression Evaluator
  // Section 3: Directive System
  // Section 4: Magic Properties
  // Section 5: Faqir Bridge ($state, $variant, $ui)
  // Section 6: Core Utilities (dom, events, focus, motion, store, utils)
  // Section 7: Recipe Controllers (all 15)
  // Section 8: Global API
  // Section 9: Bootstrap & Auto-init
  // ═══════════════════════════════════════════════════════

  // ... all sections ...

  return Faqir;
});
```

---

## 3. Section 1 — Reactive Engine (~200 lines)

### Design: Shallow Proxy with effect tracking

Faqir components have flat reactive state (`{ open: false, count: 0, title: 'Hello' }`). No deep reactivity needed — this saves ~100 lines and complexity vs Vue 3's approach.

### Data structures

```javascript
// Global effect tracking
let currentEffect = null;          // The currently-executing effect function
const effectStack = [];            // Stack for nested effects
let batchDepth = 0;                // Track nested batch() calls
const pendingEffects = new Set();  // Effects queued for batch execution
let flushScheduled = false;        // Whether a microtask flush is queued

// Per-scope dependency tracking
// Map<string, Set<Effect>> stored as scope.__deps
```

### Core functions

#### `reactive(obj)` → Proxy

Creates a shallow Proxy over `obj`:

```javascript
function reactive(obj) {
  if (obj.__isReactive) return obj;
  
  const deps = {};  // property name → Set<Effect>
  
  const proxy = new Proxy(obj, {
    get(target, key, receiver) {
      if (key === '__isReactive') return true;
      if (key === '__deps') return deps;
      if (key === '__target') return target;
      
      // Track dependency
      if (currentEffect && typeof key === 'string') {
        if (!deps[key]) deps[key] = new Set();
        deps[key].add(currentEffect);
      }
      
      return Reflect.get(target, key, receiver);
    },
    
    set(target, key, value, receiver) {
      const oldValue = target[key];
      const result = Reflect.set(target, key, value, receiver);
      
      // Only trigger if value actually changed
      if (oldValue !== value && deps[key]) {
        // Queue effects for batch execution
        for (const effect of deps[key]) {
          pendingEffects.add(effect);
        }
        scheduleFlush();
      }
      
      return result;
    }
  });
  
  return proxy;
}
```

#### `effect(fn)` → cleanup function

Registers a side-effect that auto-tracks dependencies:

```javascript
function effect(fn) {
  const execute = () => {
    // Remove this effect from all dependency sets (cleanup stale deps)
    cleanup(execute);
    
    // Push onto effect stack
    currentEffect = execute;
    effectStack.push(execute);
    
    try {
      fn();
    } finally {
      effectStack.pop();
      currentEffect = effectStack[effectStack.length - 1] || null;
    }
  };
  
  execute._deps = new Set();  // Track which dep sets this effect is in
  execute();  // Run immediately to collect initial dependencies
  
  return () => cleanup(execute);  // Return cleanup function
}

function cleanup(execute) {
  for (const depSet of execute._deps) {
    depSet.delete(execute);
  }
  execute._deps.clear();
}
```

Note: The `get` trap also needs to register `execute._deps`:

```javascript
// Inside get trap, after deps[key].add(currentEffect):
currentEffect._deps.add(deps[key]);
```

#### `scheduleFlush()` and `flushEffects()`

Batches multiple property changes into one update cycle:

```javascript
function scheduleFlush() {
  if (batchDepth > 0) return;  // Inside explicit batch(), defer
  if (flushScheduled) return;
  flushScheduled = true;
  queueMicrotask(flushEffects);
}

function flushEffects() {
  flushScheduled = false;
  const effects = [...pendingEffects];
  pendingEffects.clear();
  for (const effect of effects) {
    effect();
  }
}
```

#### `batch(fn)`

Groups multiple writes into one update:

```javascript
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
```

#### `untrack(fn)` → result

Read without tracking dependencies:

```javascript
function untrack(fn) {
  const prev = currentEffect;
  currentEffect = null;
  try {
    return fn();
  } finally {
    currentEffect = prev;
  }
}
```

---

## 4. Section 2 — Expression Evaluator (~80 lines)

### Design: `new Function()` with `with(scope)` (same approach as Alpine)

```javascript
const expressionCache = new Map();

function evaluate(expression, scope, el) {
  try {
    const fn = compileExpression(expression);
    return fn.call(scope, scope, el);
  } catch (e) {
    console.warn(`[Faqir] Expression error: "${expression}"`, e);
    return undefined;
  }
}

function evaluateAssignment(expression, scope, el) {
  // For @click="count++" or @click="open = !open"
  try {
    const fn = compileStatement(expression);
    fn.call(scope, scope, el);
  } catch (e) {
    console.warn(`[Faqir] Statement error: "${expression}"`, e);
  }
}

function compileExpression(expr) {
  const key = 'expr:' + expr;
  if (expressionCache.has(key)) return expressionCache.get(key);
  
  // Return-style: evaluates to a value
  const fn = new Function(
    '$scope', '$el',
    `with($scope) { return (${expr}) }`
  );
  expressionCache.set(key, fn);
  return fn;
}

function compileStatement(expr) {
  const key = 'stmt:' + expr;
  if (expressionCache.has(key)) return expressionCache.get(key);
  
  // Statement-style: executes side effects (count++, open = true, etc.)
  const fn = new Function(
    '$scope', '$el',
    `with($scope) { ${expr} }`
  );
  expressionCache.set(key, fn);
  return fn;
}
```

### Expression context

The `scope` object passed to `with()` contains:
- User-defined reactive data from `l-data`
- Magic properties (`$el`, `$refs`, `$store`, `$state`, `$variant`, `$ui`, `$dispatch`, `$nextTick`, `$watch`, `$id`)
- Props from `data-prop-*` attributes

Since `with()` resolves names through the scope's prototype chain, magic properties can be defined as getters on a prototype:

```javascript
function createScopeWithMagics(data, el, root) {
  const magics = Object.create(null);
  
  // Define magics as getters (lazy, per-access)
  Object.defineProperties(magics, {
    $el: { get: () => el, enumerable: false },
    $refs: { get: () => getScopeRefs(root), enumerable: false },
    $store: { get: () => globalStores, enumerable: false },
    $state: {
      get: () => closestUI(el)?.dataset.state,
      set: (v) => { const ui = closestUI(el); if (ui) ui.dataset.state = v; },
      enumerable: false
    },
    $variant: {
      get: () => closestUI(el)?.dataset.variant,
      set: (v) => { const ui = closestUI(el); if (ui) ui.dataset.variant = v; },
      enumerable: false
    },
    $ui: { get: () => getControllerApi(closestUI(el)), enumerable: false },
    $dispatch: { value: (event, detail) => el.dispatchEvent(
      new CustomEvent(event, { detail, bubbles: true, composed: true })
    ), enumerable: false },
    $nextTick: { value: (fn) => queueMicrotask(fn || (() => {})), enumerable: false },
    $watch: { value: (key, cb) => watchProperty(data, key, cb), enumerable: false },
    $id: { value: (name) => `faqir-${root.__scopeId}-${name}`, enumerable: false }
  });
  
  // Spread user data ON TOP of magics (user can override if they want)
  const scope = reactive(Object.assign(Object.create(magics), data));
  return scope;
}
```

### CSP Note

`new Function()` requires `unsafe-eval` in CSP. This is the same constraint as AlpineJS. Documented as a known limitation.

---

## 5. Section 3 — Directive System (~400 lines)

### 5.1 Attribute Parsing

Parse all `l-*`, `:*`, and `@*` attributes from an element:

```javascript
function parseDirectives(el) {
  const directives = [];
  
  for (const attr of el.attributes) {
    const name = attr.name;
    let directive = null;
    
    if (name.startsWith('l-')) {
      // l-text, l-html, l-show, l-if, l-for, l-model, etc.
      const rest = name.slice(2);
      const [type, ...modParts] = rest.split('.');
      directive = {
        type,
        expression: attr.value,
        modifiers: modParts,
        raw: name
      };
    } else if (name.startsWith(':')) {
      // :class, :style, :disabled, :id, etc. — shorthand for l-bind
      const rest = name.slice(1);
      const [attrName, ...modParts] = rest.split('.');
      directive = {
        type: 'bind',
        arg: attrName,
        expression: attr.value,
        modifiers: modParts,
        raw: name
      };
    } else if (name.startsWith('@')) {
      // @click, @input, @keydown.enter, etc. — shorthand for l-on
      const rest = name.slice(1);
      const [eventName, ...modParts] = rest.split('.');
      directive = {
        type: 'on',
        arg: eventName,
        expression: attr.value,
        modifiers: modParts,
        raw: name
      };
    } else if (name.startsWith('l-bind:')) {
      const rest = name.slice(7);
      const [attrName, ...modParts] = rest.split('.');
      directive = {
        type: 'bind',
        arg: attrName,
        expression: attr.value,
        modifiers: modParts,
        raw: name
      };
    } else if (name.startsWith('l-on:')) {
      const rest = name.slice(5);
      const [eventName, ...modParts] = rest.split('.');
      directive = {
        type: 'on',
        arg: eventName,
        expression: attr.value,
        modifiers: modParts,
        raw: name
      };
    }
    
    if (directive) directives.push(directive);
  }
  
  return directives;
}
```

### 5.2 Directive Priority

Directives are processed in this order (critical for correctness):

```javascript
const PRIORITY = {
  'data': 1,      // Must create scope before anything else
  'for': 2,       // Creates child scopes for each iteration
  'if': 3,        // May remove element from DOM entirely
  'bind': 10,
  'on': 10,
  'text': 10,
  'html': 10,
  'model': 10,
  'show': 10,
  'transition': 10,
  'ref': 10,
  'init': 20,     // Runs after all bindings are set up
  'effect': 20,
  'cloak': 100,   // Removed last
  'teleport': 100
};
```

### 5.3 DOM Tree Walker

Walk from scope roots (`[l-data]` and `[data-ui]`) down, processing directives:

```javascript
function initTree(root, parentScope) {
  // Create scope for this root
  const scope = initScope(root, parentScope);
  
  // Walk children, but skip nested scope boundaries
  walkChildren(root, scope);
}

function walkChildren(el, scope) {
  for (const child of [...el.children]) {
    // Skip if this child is a new scope boundary
    if (child.hasAttribute('l-data') || 
        (child.hasAttribute('data-ui') && !el.hasAttribute('data-ui'))) {
      // Nested scope — init it with current scope as parent
      initTree(child, scope);
      continue;
    }
    
    // Process directives on this child
    processElement(child, scope);
    
    // Recurse into children
    walkChildren(child, scope);
  }
}

function processElement(el, scope) {
  const directives = parseDirectives(el);
  if (directives.length === 0) return;
  
  // Sort by priority
  directives.sort((a, b) => (PRIORITY[a.type] || 10) - (PRIORITY[b.type] || 10));
  
  // Check for structural directives first
  for (const dir of directives) {
    if (dir.type === 'if') {
      handleIf(el, dir, scope);
      return;  // l-if controls whether element exists; skip other directives
    }
    if (dir.type === 'for') {
      handleFor(el, dir, scope);
      return;  // l-for clones the element; skip other directives
    }
  }
  
  // Process remaining directives
  for (const dir of directives) {
    applyDirective(el, dir, scope);
  }
}
```

### 5.4 Individual Directive Implementations

#### `l-data` — Create reactive scope

```javascript
function initScope(root, parentScope) {
  const expr = root.getAttribute('l-data');
  const uiName = root.getAttribute('data-ui');
  
  // Start with parent scope data (for nested scopes)
  let userData = {};
  
  if (expr) {
    if (dataRegistry.has(expr)) {
      // Named data: l-data="counter" → look up Faqir.data('counter')
      userData = dataRegistry.get(expr)();
    } else if (expr.trim()) {
      // Inline object: l-data="{ count: 0 }"
      userData = evaluate(expr, parentScope || {}, root) || {};
    }
  }
  
  // Read data-prop-* attributes and merge
  const propData = readProps(root);
  Object.assign(userData, propData);
  
  // Create scope with magics
  const scopeId = ++scopeCounter;
  const scope = createScopeWithMagics(userData, root, root);
  root.__faqirScope = scope;
  root.__scopeId = scopeId;
  
  // Store cleanup functions for this scope
  root.__faqirCleanups = [];
  
  // Process l-init if present
  const initExpr = root.getAttribute('l-init');
  if (initExpr) {
    evaluateAssignment(initExpr, scope, root);
  }
  
  return scope;
}

function readProps(el) {
  const props = {};
  for (const attr of el.attributes) {
    if (attr.name.startsWith('data-prop-')) {
      const key = attr.name.slice(10).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      // Try to parse as JSON (for booleans, numbers), fall back to string
      try {
        props[key] = JSON.parse(attr.value);
      } catch {
        props[key] = attr.value;
      }
    }
  }
  return props;
}
```

#### `l-bind` / `:attr` — Reactive attribute binding

```javascript
function handleBind(el, dir, scope) {
  const attrName = dir.arg;
  
  const cleanup = effect(() => {
    const value = evaluate(dir.expression, scope, el);
    
    if (attrName === 'class') {
      applyClassBinding(el, value);
    } else if (attrName === 'style') {
      applyStyleBinding(el, value);
    } else if (isBooleanAttr(attrName)) {
      // disabled, hidden, checked, readonly, required, etc.
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
  
  addCleanup(el, cleanup);
}

function applyClassBinding(el, value) {
  if (typeof value === 'string') {
    // :class="'active bold'"
    el.className = value;
  } else if (Array.isArray(value)) {
    // :class="['active', isOpen && 'open']"
    el.className = value.filter(Boolean).join(' ');
  } else if (typeof value === 'object' && value !== null) {
    // :class="{ active: isActive, open: isOpen }"
    for (const [cls, active] of Object.entries(value)) {
      el.classList.toggle(cls, !!active);
    }
  }
}

function applyStyleBinding(el, value) {
  if (typeof value === 'string') {
    el.style.cssText = value;
  } else if (typeof value === 'object' && value !== null) {
    // :style="{ color: textColor, fontSize: size + 'px' }"
    for (const [prop, val] of Object.entries(value)) {
      const cssProp = prop.replace(/[A-Z]/g, m => '-' + m.toLowerCase());
      if (val === null || val === undefined || val === false) {
        el.style.removeProperty(cssProp);
      } else {
        el.style.setProperty(cssProp, String(val));
      }
    }
  }
}

const BOOLEAN_ATTRS = new Set([
  'disabled', 'hidden', 'checked', 'readonly', 'required', 'selected',
  'autofocus', 'autoplay', 'controls', 'loop', 'muted', 'multiple',
  'open', 'novalidate', 'formnovalidate', 'inert'
]);

function isBooleanAttr(name) {
  return BOOLEAN_ATTRS.has(name);
}
```

#### `l-on` / `@event` — Event binding with modifiers

```javascript
function handleOn(el, dir, scope) {
  const eventName = dir.arg;
  const modifiers = new Set(dir.modifiers);
  
  // Determine target element
  let target = el;
  if (modifiers.has('window')) target = window;
  else if (modifiers.has('document')) target = document;
  
  // Parse debounce/throttle
  let wrapFn = null;
  for (const mod of dir.modifiers) {
    if (mod.startsWith('debounce')) {
      const ms = parseTimeMod(mod) || 250;
      wrapFn = (fn) => debounce(fn, ms);
    } else if (mod.startsWith('throttle')) {
      const ms = parseTimeMod(mod) || 250;
      wrapFn = (fn) => throttle(fn, ms);
    }
  }
  
  let handler = (e) => {
    // Modifier guards
    if (modifiers.has('prevent')) e.preventDefault();
    if (modifiers.has('stop')) e.stopPropagation();
    if (modifiers.has('self') && e.target !== el) return;
    
    // Key modifiers (for keydown/keyup)
    if (isKeyEvent(eventName)) {
      const keyMod = getKeyModifier(dir.modifiers);
      if (keyMod && !matchesKey(e, keyMod)) return;
    }
    
    // Execute the expression with $event available
    const extendedScope = Object.create(scope);
    extendedScope.$event = e;
    evaluateAssignment(dir.expression, extendedScope, el);
  };
  
  if (wrapFn) handler = wrapFn(handler);
  
  const options = {};
  if (modifiers.has('once')) options.once = true;
  if (modifiers.has('capture')) options.capture = true;
  if (modifiers.has('passive')) options.passive = true;
  
  target.addEventListener(eventName, handler, options);
  
  addCleanup(el, () => target.removeEventListener(eventName, handler, options));
}

function parseTimeMod(mod) {
  // "debounce" → 250, "debounce.500ms" or "500ms" → 500
  const match = mod.match(/(\d+)(ms|s)?/);
  if (!match) return null;
  const value = parseInt(match[1], 10);
  return match[2] === 's' ? value * 1000 : value;
}

function isKeyEvent(name) {
  return name === 'keydown' || name === 'keyup' || name === 'keypress';
}

const KEY_MAP = {
  'enter': 'Enter', 'escape': 'Escape', 'esc': 'Escape',
  'tab': 'Tab', 'space': ' ', 'delete': 'Delete', 'backspace': 'Backspace',
  'up': 'ArrowUp', 'down': 'ArrowDown', 'left': 'ArrowLeft', 'right': 'ArrowRight',
  'arrow-up': 'ArrowUp', 'arrow-down': 'ArrowDown',
  'arrow-left': 'ArrowLeft', 'arrow-right': 'ArrowRight',
  'home': 'Home', 'end': 'End', 'page-up': 'PageUp', 'page-down': 'PageDown',
};

function getKeyModifier(modifiers) {
  for (const mod of modifiers) {
    if (KEY_MAP[mod]) return KEY_MAP[mod];
  }
  return null;
}

function matchesKey(e, targetKey) {
  return e.key === targetKey;
}
```

#### `l-text` — Reactive text content

```javascript
function handleText(el, dir, scope) {
  const cleanup = effect(() => {
    const value = evaluate(dir.expression, scope, el);
    el.textContent = value == null ? '' : String(value);
  });
  addCleanup(el, cleanup);
}
```

#### `l-html` — Reactive HTML content

```javascript
function handleHtml(el, dir, scope) {
  const cleanup = effect(() => {
    const value = evaluate(dir.expression, scope, el);
    el.innerHTML = value == null ? '' : String(value);
  });
  addCleanup(el, cleanup);
}
```

#### `l-model` — Two-way binding

```javascript
function handleModel(el, dir, scope) {
  const prop = dir.expression;  // The reactive property name to bind to
  const modifiers = new Set(dir.modifiers);
  
  const tag = el.tagName.toLowerCase();
  const type = el.getAttribute('type');
  const isFaqirSwitch = el.hasAttribute('data-ui') && el.dataset.ui === 'switch';
  
  if (isFaqirSwitch) {
    // Faqir switch: bind to data-state="on"|"off" and aria-checked
    const cleanup = effect(() => {
      const value = evaluate(prop, scope, el);
      el.dataset.state = value ? 'on' : 'off';
      el.setAttribute('aria-checked', value ? 'true' : 'false');
    });
    el.addEventListener('click', () => {
      evaluateAssignment(`${prop} = !${prop}`, scope, el);
    });
    addCleanup(el, cleanup);
    
  } else if (tag === 'input' && type === 'checkbox') {
    const cleanup = effect(() => {
      el.checked = !!evaluate(prop, scope, el);
    });
    el.addEventListener('change', () => {
      evaluateAssignment(`${prop} = ${el.checked}`, scope, el);
    });
    addCleanup(el, cleanup);
    
  } else if (tag === 'input' && type === 'radio') {
    const cleanup = effect(() => {
      el.checked = evaluate(prop, scope, el) === el.value;
    });
    el.addEventListener('change', () => {
      if (el.checked) {
        evaluateAssignment(`${prop} = '${el.value}'`, scope, el);
      }
    });
    addCleanup(el, cleanup);
    
  } else if (tag === 'select') {
    const cleanup = effect(() => {
      el.value = evaluate(prop, scope, el) || '';
    });
    el.addEventListener('change', () => {
      evaluateAssignment(`${prop} = '${el.value}'`, scope, el);
    });
    addCleanup(el, cleanup);
    
  } else {
    // text input, textarea, number input, etc.
    const eventName = modifiers.has('lazy') ? 'change' : 'input';
    
    const cleanup = effect(() => {
      const value = evaluate(prop, scope, el);
      if (el.value !== String(value ?? '')) {
        el.value = value ?? '';
      }
    });
    
    let inputHandler = () => {
      let value = el.value;
      if (modifiers.has('number')) value = parseFloat(value) || 0;
      if (modifiers.has('trim')) value = value.trim();
      evaluateAssignment(`${prop} = ${typeof value === 'number' ? value : `'${value.replace(/'/g, "\\'")}'`}`, scope, el);
    };
    
    if (modifiers.has('debounce')) {
      inputHandler = debounce(inputHandler, 300);
    }
    
    el.addEventListener(eventName, inputHandler);
    addCleanup(el, cleanup);
  }
}
```

#### `l-show` — Toggle visibility

```javascript
function handleShow(el, dir, scope) {
  // Save original display value
  const originalDisplay = el.style.display === 'none' ? '' : el.style.display;
  
  const cleanup = effect(() => {
    const value = evaluate(dir.expression, scope, el);
    
    if (value) {
      el.style.display = originalDisplay;
      // If has l-transition, run enter transition
      if (el.hasAttribute('l-transition')) {
        runEnterTransition(el, el.getAttribute('l-transition'));
      }
    } else {
      // If has l-transition, run leave then hide
      if (el.hasAttribute('l-transition')) {
        runLeaveTransition(el, el.getAttribute('l-transition'), () => {
          el.style.display = 'none';
        });
      } else {
        el.style.display = 'none';
      }
    }
  });
  
  addCleanup(el, cleanup);
}
```

#### `l-if` — Conditional rendering (on `<template>` elements)

```javascript
function handleIf(el, dir, scope) {
  // l-if MUST be on a <template> element
  if (el.tagName !== 'TEMPLATE') {
    console.warn('[Faqir] l-if must be used on a <template> element');
    return;
  }
  
  const anchor = document.createComment('l-if');
  el.parentNode.insertBefore(anchor, el);
  el.remove();  // Remove template from DOM (keep reference)
  
  let insertedNodes = [];
  let childCleanups = [];
  
  const cleanup = effect(() => {
    const value = evaluate(dir.expression, scope, el);
    
    if (value) {
      if (insertedNodes.length === 0) {
        // Clone template content and insert
        const fragment = el.content.cloneNode(true);
        const nodes = [...fragment.childNodes];
        
        // Process directives on cloned content
        for (const node of nodes) {
          if (node.nodeType === 1) {  // Element node
            processElement(node, scope);
            walkChildren(node, scope);
          }
        }
        
        anchor.parentNode.insertBefore(fragment, anchor.nextSibling);
        insertedNodes = nodes.filter(n => n.nodeType === 1);
        
        // Run enter transitions
        for (const node of insertedNodes) {
          if (node.hasAttribute?.('l-transition')) {
            runEnterTransition(node, node.getAttribute('l-transition'));
          }
        }
      }
    } else {
      // Remove inserted nodes
      for (const node of insertedNodes) {
        if (node.hasAttribute?.('l-transition')) {
          runLeaveTransition(node, node.getAttribute('l-transition'), () => {
            node.remove();
          });
        } else {
          node.remove();
        }
        // Clean up effects for this node
        destroyScope(node);
      }
      insertedNodes = [];
    }
  });
  
  addCleanup(el, cleanup);
}
```

#### `l-for` — List rendering (on `<template>` elements)

```javascript
function handleFor(el, dir, scope) {
  if (el.tagName !== 'TEMPLATE') {
    console.warn('[Faqir] l-for must be used on a <template> element');
    return;
  }
  
  // Parse expression: "item in items" or "(item, index) in items"
  const match = dir.expression.match(
    /^\s*(?:\(?\s*(\w+)\s*(?:,\s*(\w+))?\s*\)?\s+in\s+)?(.+)\s*$/
  );
  
  if (!match) {
    console.warn(`[Faqir] Invalid l-for expression: "${dir.expression}"`);
    return;
  }
  
  const itemName = match[1] || 'item';
  const indexName = match[2] || 'index';
  const listExpr = match[3];
  
  const anchor = document.createComment('l-for');
  el.parentNode.insertBefore(anchor, el);
  el.remove();
  
  let currentNodes = [];  // Track rendered items for cleanup
  
  const cleanup = effect(() => {
    const list = evaluate(listExpr, scope, el);
    const items = Array.isArray(list) ? list : 
                  typeof list === 'number' ? Array.from({ length: list }, (_, i) => i + 1) :
                  [];
    
    // Clean up previous render
    for (const node of currentNodes) {
      destroyScope(node);
      node.remove();
    }
    currentNodes = [];
    
    // Render new items
    const fragment = document.createDocumentFragment();
    
    for (let i = 0; i < items.length; i++) {
      const clone = el.content.cloneNode(true);
      const nodes = [...clone.childNodes].filter(n => n.nodeType === 1);
      
      // Create child scope with item + index
      for (const node of nodes) {
        const childData = {};
        childData[itemName] = items[i];
        childData[indexName] = i;
        
        // Create a child scope that inherits from parent
        const childScope = reactive(Object.create(scope));
        Object.assign(childScope, childData);
        node.__faqirScope = childScope;
        node.__faqirCleanups = [];
        
        processElement(node, childScope);
        walkChildren(node, childScope);
        currentNodes.push(node);
      }
      
      fragment.appendChild(clone);
    }
    
    anchor.parentNode.insertBefore(fragment, anchor.nextSibling);
  });
  
  addCleanup(el, cleanup);
}
```

#### `l-transition` — CSS transition helpers

```javascript
// Transition class naming convention:
// Default: l-enter-from, l-enter-active, l-enter-to, l-leave-from, l-leave-active, l-leave-to
// Named:   fade-enter-from, fade-enter-active, etc.

function runEnterTransition(el, name) {
  if (prefersReducedMotion()) return;
  
  const prefix = name || 'l';
  
  el.classList.add(`${prefix}-enter-from`, `${prefix}-enter-active`);
  
  // Force reflow
  el.offsetHeight;
  
  requestAnimationFrame(() => {
    el.classList.remove(`${prefix}-enter-from`);
    el.classList.add(`${prefix}-enter-to`);
    
    const onEnd = () => {
      el.classList.remove(`${prefix}-enter-active`, `${prefix}-enter-to`);
      el.removeEventListener('transitionend', onEnd);
      el.removeEventListener('animationend', onEnd);
    };
    
    el.addEventListener('transitionend', onEnd, { once: true });
    el.addEventListener('animationend', onEnd, { once: true });
  });
}

function runLeaveTransition(el, name, done) {
  if (prefersReducedMotion()) { done(); return; }
  
  const prefix = name || 'l';
  
  el.classList.add(`${prefix}-leave-from`, `${prefix}-leave-active`);
  
  el.offsetHeight;
  
  requestAnimationFrame(() => {
    el.classList.remove(`${prefix}-leave-from`);
    el.classList.add(`${prefix}-leave-to`);
    
    const onEnd = () => {
      el.classList.remove(`${prefix}-leave-active`, `${prefix}-leave-to`);
      el.removeEventListener('transitionend', onEnd);
      el.removeEventListener('animationend', onEnd);
      done();
    };
    
    el.addEventListener('transitionend', onEnd, { once: true });
    el.addEventListener('animationend', onEnd, { once: true });
  });
}
```

#### `l-ref` — Element references

```javascript
function handleRef(el, dir, scope) {
  const name = dir.expression;
  const root = findScopeRoot(el);
  if (!root.__faqirRefs) root.__faqirRefs = {};
  root.__faqirRefs[name] = el;
  
  addCleanup(el, () => {
    if (root.__faqirRefs?.[name] === el) {
      delete root.__faqirRefs[name];
    }
  });
}

function getScopeRefs(root) {
  return root.__faqirRefs || {};
}
```

#### `l-init` — Run code on init

Already handled inside `initScope()`. For non-scope elements:

```javascript
function handleInit(el, dir, scope) {
  evaluateAssignment(dir.expression, scope, el);
}
```

#### `l-effect` — Reactive side effects

```javascript
function handleEffect(el, dir, scope) {
  const cleanup = effect(() => {
    evaluateAssignment(dir.expression, scope, el);
  });
  addCleanup(el, cleanup);
}
```

#### `l-cloak` — Hide until initialized

```javascript
// Inject CSS rule on load
function injectCloakStyle() {
  const style = document.createElement('style');
  style.textContent = '[l-cloak] { display: none !important; }';
  document.head.appendChild(style);
}

// After processing all directives on an element:
function removeCloaks() {
  document.querySelectorAll('[l-cloak]').forEach(el => el.removeAttribute('l-cloak'));
}
```

#### `l-teleport` — Move element to another location

```javascript
function handleTeleport(el, dir, scope) {
  const targetSelector = dir.expression;
  
  const cleanup = effect(() => {
    const target = document.querySelector(targetSelector);
    if (target && el.parentNode !== target) {
      target.appendChild(el);
    }
  });
  
  addCleanup(el, cleanup);
}
```

### 5.5 Directive dispatch

```javascript
function applyDirective(el, dir, scope) {
  switch (dir.type) {
    case 'bind':     return handleBind(el, dir, scope);
    case 'on':       return handleOn(el, dir, scope);
    case 'text':     return handleText(el, dir, scope);
    case 'html':     return handleHtml(el, dir, scope);
    case 'model':    return handleModel(el, dir, scope);
    case 'show':     return handleShow(el, dir, scope);
    case 'ref':      return handleRef(el, dir, scope);
    case 'init':     return handleInit(el, dir, scope);
    case 'effect':   return handleEffect(el, dir, scope);
    case 'cloak':    return;  // Handled by removeCloaks()
    case 'teleport': return handleTeleport(el, dir, scope);
    case 'transition': return;  // Handled by l-show and l-if
    default:
      // Check custom directives
      if (customDirectives.has(dir.type)) {
        const handler = customDirectives.get(dir.type);
        handler(el, dir, scope);
      }
  }
}
```

---

## 6. Section 4 — Magic Properties (~100 lines)

Already detailed in Section 4 above (`createScopeWithMagics`). Key implementation notes:

### `$watch(property, callback)` 

```javascript
function watchProperty(scope, key, callback) {
  let oldValue = scope[key];
  
  const cleanup = effect(() => {
    const newValue = scope[key];
    if (newValue !== oldValue) {
      const prev = oldValue;
      oldValue = newValue;
      callback(newValue, prev);
    }
  });
  
  return cleanup;
}
```

### `$id(name)` — Scoped unique IDs

```javascript
// Inside createScopeWithMagics:
$id: { value: (name) => `faqir-${root.__scopeId}-${name}`, enumerable: false }
```

Used for accessible IDs: `<input :id="$id('email')" />` produces `faqir-3-email`.

---

## 7. Section 5 — Faqir Bridge (~80 lines)

### `$state` and `$variant` — Bidirectional sync

The `$state` magic getter/setter is defined in `createScopeWithMagics`. The bidirectional part requires a MutationObserver:

```javascript
function setupStateBridge(root, scope) {
  const uiEl = root.hasAttribute('data-ui') ? root : root.closest('[data-ui]');
  if (!uiEl) return;
  
  // Watch data-state and data-variant changes from controllers
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.attributeName === 'data-state' || 
          mutation.attributeName === 'data-variant') {
        // Trigger reactive update by accessing the scope
        // Any effect reading $state or $variant will re-run
        triggerStateDeps(scope);
      }
    }
  });
  
  observer.observe(uiEl, { 
    attributes: true, 
    attributeFilter: ['data-state', 'data-variant'] 
  });
  
  addCleanup(root, () => observer.disconnect());
}

// $state triggers need special handling since they're getter-based
// We use a synthetic dependency key '__$state' in the scope's dep map
function triggerStateDeps(scope) {
  const deps = scope.__deps;
  if (deps['$state']) {
    for (const eff of deps['$state']) {
      pendingEffects.add(eff);
    }
    scheduleFlush();
  }
  if (deps['$variant']) {
    for (const eff of deps['$variant']) {
      pendingEffects.add(eff);
    }
    scheduleFlush();
  }
}
```

### `$ui` — Controller API access

```javascript
function getControllerApi(uiEl) {
  if (!uiEl) return null;
  
  // Find the _faqir* property on the element
  for (const key of Object.keys(uiEl)) {
    if (key.startsWith('_faqir')) {
      return uiEl[key];
    }
  }
  
  return null;
}
```

This works because every controller sets `root._faqirDialog = api` (etc.), and the naming is consistent.

### `closestUI(el)` helper

```javascript
function closestUI(el) {
  return el.closest('[data-ui]') || (el.hasAttribute('data-ui') ? el : null);
}
```

---

## 8. Section 6 — Core Utilities (embedded, ~380 lines)

These are the existing core modules, inlined without import/export:

### From `dom.js`

```javascript
const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
const closest = (el, selector) => el.closest(selector);

function create(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    el.setAttribute(key, value);
  }
  for (const child of children) {
    el.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return el;
}
```

### From `events.js`

```javascript
function delegate(root, event, selector, handler) {
  function listener(e) {
    const target = e.target.closest(selector);
    if (target && root.contains(target)) handler(e, target);
  }
  root.addEventListener(event, listener);
  return () => root.removeEventListener(event, listener);
}

function once(el, event, handler) {
  function listener(e) { cleanup(); handler(e); }
  function cleanup() { el.removeEventListener(event, listener); }
  el.addEventListener(event, listener);
  return cleanup;
}

function onOutsideClick(el, handler) {
  function listener(e) { if (!el.contains(e.target)) handler(e); }
  document.addEventListener('pointerdown', listener);
  return () => document.removeEventListener('pointerdown', listener);
}
```

### From `focus.js`

```javascript
const FOCUSABLE = [
  'a[href]:not([tabindex="-1"])',
  'button:not([disabled]):not([tabindex="-1"])',
  'input:not([disabled]):not([tabindex="-1"])',
  'select:not([disabled]):not([tabindex="-1"])',
  'textarea:not([disabled]):not([tabindex="-1"])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function getFocusableElements(container) {
  return [...container.querySelectorAll(FOCUSABLE)].filter(
    el => !el.closest('[hidden]') && el.offsetParent !== null
  );
}

function focusFirst(container) {
  const els = getFocusableElements(container);
  if (els.length > 0) { els[0].focus(); return true; }
  return false;
}

function trapFocus(container) {
  function onKeyDown(e) {
    if (e.key !== 'Tab') return;
    const focusable = getFocusableElements(container);
    if (focusable.length === 0) return;
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last.focus(); }
    } else {
      if (document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }
  container.addEventListener('keydown', onKeyDown);
  return () => container.removeEventListener('keydown', onKeyDown);
}
```

### From `motion.js`

```javascript
function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function waitForTransition(el) {
  if (prefersReducedMotion()) return Promise.resolve();
  const style = getComputedStyle(el);
  const hasDuration = parseFloat(style.transitionDuration) > 0 ||
    (style.animationName !== 'none' && parseFloat(style.animationDuration) > 0);
  if (!hasDuration) return Promise.resolve();
  return new Promise(resolve => {
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
```

### From `utils.js`

```javascript
let counter = 0;
function uid(prefix = 'faqir') { return `${prefix}-${++counter}`; }
function clamp(value, min, max) { return Math.min(Math.max(value, min), max); }

function debounce(fn, ms) {
  let timer;
  return function(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), ms);
  };
}

function throttle(fn, ms) {
  let last = 0;
  return function(...args) {
    const now = Date.now();
    if (now - last >= ms) { last = now; fn.apply(this, args); }
  };
}
```

### From `store.js`

Replaced by the reactive engine — `Faqir.store()` creates a `reactive()` object directly. The old pub/sub pattern is subsumed by effects.

---

## 9. Section 7 — Recipe Controllers (all 15, ~2400 lines)

All 15 controllers are embedded directly, with their `import` statements removed (utilities are already inline). Each controller is wrapped in a registration call.

### Controller Registry

```javascript
const controllerRegistry = {};

// Map data-ui name → _faqir* property name
const CONTROLLER_PROP = {
  'dialog': '_faqirDialog',
  'drawer': '_faqirDrawer',
  'tabs': '_faqirTabs',
  'dropdown': '_faqirDropdown',
  'accordion': '_faqirAccordion',
  'tooltip': '_faqirTooltip',
  'toast-container': '_faqirToast',
  'combobox': '_faqirCombobox',
  'command-palette': '_faqirCommandPalette',
  'table': '_faqirTable',
  'select-custom': '_faqirSelectCustom',
  'popover': '_faqirPopover',
  'pagination': '_faqirPagination',
  'sheet': '_faqirSheet',
  'date-picker': '_faqirDatePicker',
};
```

### Embedded Controllers (exact code from existing files, with imports removed)

Each controller function is included verbatim from the existing source files:

- `createDialog(root)` — from `registry/recipes/dialog/dialog.js` (116 lines)
- `createDrawer(root)` — from `registry/recipes/drawer/drawer.js` (119 lines)
- `createTabs(root)` — from `registry/recipes/tabs/tabs.js` (86 lines)
- `createDropdown(root)` — from `registry/recipes/dropdown/dropdown.js` (127 lines)
- `createAccordion(root)` — from `registry/recipes/accordion/accordion.js` (104 lines)
- `createTooltip(root)` — from `registry/recipes/tooltip/tooltip.js` (85 lines)
- `createToastContainer(root)` — from `registry/recipes/toast/toast.js` (165 lines)
- `createCombobox(root)` — from `registry/recipes/combobox/combobox.js` (205 lines)
- `createCommandPalette(root)` — from `registry/recipes/command-palette/command-palette.js` (247 lines)
- `createTable(root)` — from `registry/recipes/table/table.js` (232 lines)
- `createSelectCustom(root)` — from `registry/recipes/select-custom/select-custom.js` (254 lines)
- `createPopover(root)` — from `registry/recipes/popover/popover.js` (75 lines)
- `createPagination(root)` — from `registry/recipes/pagination/pagination.js` (122 lines)
- `createSheet(root)` — from `registry/recipes/sheet/sheet.js` (104 lines)
- `createDatePicker(root)` — from `registry/recipes/date-picker/date-picker.js` (375 lines)

Total: ~2,416 lines of controller code.

### Registration

```javascript
// Register all built-in controllers
controllerRegistry['dialog'] = createDialog;
controllerRegistry['drawer'] = createDrawer;
controllerRegistry['tabs'] = createTabs;
controllerRegistry['dropdown'] = createDropdown;
controllerRegistry['accordion'] = createAccordion;
controllerRegistry['tooltip'] = createTooltip;
controllerRegistry['toast-container'] = createToastContainer;
controllerRegistry['combobox'] = createCombobox;
controllerRegistry['command-palette'] = createCommandPalette;
controllerRegistry['table'] = createTable;
controllerRegistry['select-custom'] = createSelectCustom;
controllerRegistry['popover'] = createPopover;
controllerRegistry['pagination'] = createPagination;
controllerRegistry['sheet'] = createSheet;
controllerRegistry['date-picker'] = createDatePicker;
```

---

## 10. Section 8 — Global API (~60 lines)

```javascript
const dataRegistry = new Map();
const globalStores = {};
const customDirectives = new Map();
const customMagics = new Map();
let scopeCounter = 0;

const Faqir = {
  version: '0.1.0',
  
  // Register reusable data component
  // Usage: Faqir.data('counter', () => ({ count: 0, inc() { this.count++ } }))
  // In HTML: <div l-data="counter">
  data(name, fn) {
    dataRegistry.set(name, fn);
  },
  
  // Create global reactive store
  // Usage: Faqir.store('theme', { mode: 'light', name: 'default' })
  // In HTML: l-text="$store.theme.mode"
  store(name, data) {
    globalStores[name] = reactive(data);
  },
  
  // Register custom directive
  // Usage: Faqir.directive('tooltip', (el, { expression, modifiers }, scope) => { ... })
  // In HTML: <span l-tooltip="'Hello'">Hover me</span>
  directive(name, callback) {
    customDirectives.set(name, callback);
  },
  
  // Register custom magic property
  // Usage: Faqir.magic('now', (el) => new Date())
  // In HTML: <span l-text="$now">
  magic(name, callback) {
    customMagics.set(name, callback);
  },
  
  // Register plugin
  // Usage: Faqir.plugin(myPlugin) where myPlugin = (Faqir) => { ... }
  plugin(fn) {
    fn(Faqir);
  },
  
  // Register a recipe controller (for custom or external controllers)
  // Usage: Faqir.controller('my-widget', createMyWidget)
  controller(name, factory) {
    controllerRegistry[name] = factory;
  },
  
  // Manual initialization (by default, auto-start on DOMContentLoaded)
  // To prevent auto-start: <script src="faqir-core.js" data-manual></script>
  start() {
    bootstrap();
  },
  
  // Expose utilities for external use
  reactive,
  effect,
  batch,
  nextTick: (fn) => queueMicrotask(fn || (() => {})),
};
```

---

## 11. Section 9 — Bootstrap & Auto-init (~60 lines)

```javascript
function bootstrap() {
  // 1. Inject [l-cloak] CSS
  injectCloakStyle();
  
  // 2. Auto-init controllers for all [data-ui] elements
  for (const [name, factory] of Object.entries(controllerRegistry)) {
    document.querySelectorAll(`[data-ui="${name}"]`).forEach(factory);
  }
  
  // 3. Find all scope roots: elements with l-data OR data-ui
  const roots = document.querySelectorAll('[l-data], [data-ui]');
  
  // 4. Process in DOM order, skip nested scopes
  const processed = new Set();
  
  for (const root of roots) {
    // Skip if this root is inside an already-processed scope
    if (processed.has(root)) continue;
    
    // Skip if ancestor is a scope root that hasn't been processed yet
    // (it will be handled when we get to the ancestor)
    let ancestor = root.parentElement;
    let skipThis = false;
    while (ancestor) {
      if ((ancestor.hasAttribute('l-data') || ancestor.hasAttribute('data-ui')) && !processed.has(ancestor)) {
        // This root is nested inside an unprocessed scope — it will be reached via walkChildren
        skipThis = true;
        break;
      }
      ancestor = ancestor.parentElement;
    }
    
    if (!skipThis) {
      initTree(root, null);
      
      // Mark all descendant scope roots as processed
      root.querySelectorAll('[l-data], [data-ui]').forEach(el => processed.add(el));
      processed.add(root);
    }
  }
  
  // 5. Remove l-cloak from all elements
  removeCloaks();
  
  // 6. Set up MutationObserver for dynamically added elements
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== 1) continue;
        
        // Check if this node or its descendants have data-ui or l-data
        const uiName = node.getAttribute?.('data-ui');
        if (uiName && controllerRegistry[uiName]) {
          controllerRegistry[uiName](node);
        }
        
        if (node.hasAttribute?.('l-data') || node.hasAttribute?.('data-ui')) {
          initTree(node, findParentScope(node));
        }
        
        // Check children too
        if (node.querySelectorAll) {
          for (const [name, factory] of Object.entries(controllerRegistry)) {
            node.querySelectorAll(`[data-ui="${name}"]`).forEach(factory);
          }
          node.querySelectorAll('[l-data], [data-ui]').forEach(el => {
            if (!el.__faqirScope) {
              initTree(el, findParentScope(el));
            }
          });
        }
      }
    }
  });
  
  observer.observe(document.body, { childList: true, subtree: true });
}

function findParentScope(el) {
  let parent = el.parentElement;
  while (parent) {
    if (parent.__faqirScope) return parent.__faqirScope;
    parent = parent.parentElement;
  }
  return null;
}

function findScopeRoot(el) {
  let current = el;
  while (current) {
    if (current.__faqirScope) return current;
    current = current.parentElement;
  }
  return null;
}

// Cleanup helper
function addCleanup(el, fn) {
  const root = findScopeRoot(el) || el;
  if (!root.__faqirCleanups) root.__faqirCleanups = [];
  root.__faqirCleanups.push(fn);
}

function destroyScope(el) {
  if (el.__faqirCleanups) {
    for (const fn of el.__faqirCleanups) fn();
    el.__faqirCleanups = [];
  }
  // Also destroy child scopes
  if (el.querySelectorAll) {
    el.querySelectorAll('[l-data], [data-ui]').forEach(destroyScope);
  }
}

// Auto-start
const currentScript = document.currentScript;
const isManual = currentScript?.hasAttribute('data-manual');

if (!isManual) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
}
```

---

## 12. Manifest Props Extension

### Schema addition to every `.manifest.json`

Add a `props` field after `states`:

```json
{
  "name": "button",
  "props": {
    "caption": {
      "type": "string",
      "default": "Click me",
      "description": "Button label text"
    },
    "icon": {
      "type": "string",
      "default": "",
      "description": "Icon content for the icon slot"
    },
    "disabled": {
      "type": "boolean",
      "default": false,
      "description": "Whether the button is disabled"
    }
  }
}
```

### Props by component

| Component | Props to add |
|-----------|-------------|
| **button** | `caption: string`, `icon: string`, `disabled: boolean` |
| **input** | `placeholder: string`, `value: string`, `disabled: boolean`, `type: string` |
| **textarea** | `placeholder: string`, `value: string`, `disabled: boolean`, `rows: number` |
| **select** | `placeholder: string`, `value: string`, `disabled: boolean` |
| **checkbox** | `checked: boolean`, `disabled: boolean`, `label: string` |
| **radio** | `checked: boolean`, `disabled: boolean`, `value: string`, `label: string` |
| **switch** | `checked: boolean`, `disabled: boolean`, `label: string` |
| **label** | `text: string`, `required: boolean` |
| **badge** | `text: string` |
| **card** | `title: string`, `description: string` |
| **avatar** | `src: string`, `alt: string`, `fallback: string` |
| **spinner** | (no props — size/variant only) |
| **kbd** | `key: string` |
| **dialog** | `title: string`, `description: string`, `triggerText: string` |
| **tabs** | `activeTab: number` |
| **accordion** | `mode: string` ("single" or "multiple") |
| **dropdown** | `triggerText: string` |
| **tooltip** | `content: string`, `delay: number` |
| **toast** | `message: string`, `tone: string`, `duration: number` |
| **combobox** | `placeholder: string`, `value: string` |
| **command-palette** | `placeholder: string` |
| **table** | `selectable: boolean` |
| **popover** | `triggerText: string` |
| **pagination** | `currentPage: number`, `totalPages: number` |
| **date-picker** | `value: string`, `placeholder: string` |
| **drawer** | `title: string`, `triggerText: string` |
| **sheet** | `title: string`, `triggerText: string` |
| **select-custom** | `placeholder: string`, `value: string` |

### Runtime: `data-prop-*` → reactive scope

In `readProps()` (already shown in Section 5.4), `data-prop-caption="Save"` becomes `{ caption: 'Save' }` in the reactive scope.

An agent generating HTML would write:

```html
<button data-ui="button" data-variant="primary" data-prop-caption="Save Changes">
  Save Changes
</button>
```

And with directives:

```html
<div l-data="{ saving: false }">
  <button data-ui="button" data-variant="primary" 
          :data-state="saving ? 'loading' : 'default'"
          @click="saving = true; save()">
    <span l-text="saving ? 'Saving...' : 'Save Changes'">Save Changes</span>
  </button>
</div>
```

---

## 13. Usage Examples — Before/After

### Example 1: Theme switcher (currently in playground)

**Before (inline onclick):**
```html
<button data-ui="button" onclick="setTheme('default')">Default</button>
<button data-ui="button" onclick="setTheme('midnight')">Midnight</button>

<script>
  window.setTheme = function(name) {
    Object.values(themeSheets).forEach(sheet => sheet.disabled = true);
    if (themeSheets[name]) themeSheets[name].disabled = false;
    activeTheme = name;
  };
</script>
```

**After (faqir-core.js):**
```html
<div l-data="{ theme: 'default', mode: 'light' }">
  <button data-ui="button" 
          :data-variant="theme === 'default' ? 'primary' : undefined"
          @click="theme = 'default'">Default</button>
  <button data-ui="button"
          :data-variant="theme === 'midnight' ? 'primary' : undefined"
          @click="theme = 'midnight'">Midnight</button>
          
  <!-- Mode buttons -->
  <button data-ui="button"
          :data-variant="mode === 'light' ? 'primary' : undefined"
          @click="mode = 'light'; document.documentElement.dataset.theme = 'light'">Light</button>
  <button data-ui="button"
          :data-variant="mode === 'dark' ? 'primary' : undefined"
          @click="mode = 'dark'; document.documentElement.dataset.theme = 'dark'">Dark</button>
</div>
```

### Example 2: Dialog with reactive title

**Before (manual controller):**
```html
<script type="module">
  import { createDialog } from '../registry/recipes/dialog/dialog.js';
  document.querySelectorAll('[data-ui="dialog"]').forEach(createDialog);
</script>
```

**After (automatic + reactive):**
```html
<script src="faqir-core.js"></script>

<div data-ui="dialog" data-state="closed" l-data="{ title: 'Edit Profile' }">
  <button data-part="trigger" data-ui="button" data-variant="primary">Open Dialog</button>
  <div data-part="overlay" hidden></div>
  <div data-part="panel" role="dialog" aria-modal="true" hidden tabindex="-1">
    <div data-part="header">
      <h2 data-part="title" l-text="title">Edit Profile</h2>
      <button data-part="close" aria-label="Close">✕</button>
    </div>
    <div data-part="body">
      <label data-ui="label">Title</label>
      <input data-ui="input" l-model="title" placeholder="Dialog title">
      <p>Current state: <span l-text="$state"></span></p>
    </div>
    <div data-part="footer">
      <button data-ui="button" data-variant="outline" @click="$ui.close()">Cancel</button>
      <button data-ui="button" data-variant="primary" @click="save(); $ui.close()">Save</button>
    </div>
  </div>
</div>
```

### Example 3: Todo list with l-for

```html
<div l-data="{ 
  todos: [], 
  newTodo: '',
  addTodo() {
    if (this.newTodo.trim()) {
      this.todos = [...this.todos, { text: this.newTodo, done: false }];
      this.newTodo = '';
    }
  },
  removeTodo(index) {
    this.todos = this.todos.filter((_, i) => i !== index);
  }
}">
  <div style="display: flex; gap: var(--space-2);">
    <input data-ui="input" l-model="newTodo" placeholder="Add a todo..." 
           @keydown.enter="addTodo()">
    <button data-ui="button" data-variant="primary" @click="addTodo()">Add</button>
  </div>
  
  <div data-ui="stack" data-gap="2" style="margin-top: var(--space-4);">
    <template l-for="(todo, i) in todos">
      <div data-ui="surface" style="display: flex; align-items: center; gap: var(--space-3); padding: var(--space-3);">
        <input type="checkbox" data-ui="checkbox" l-model="todo.done">
        <span l-text="todo.text" :style="{ textDecoration: todo.done ? 'line-through' : 'none' }"></span>
        <button data-ui="button" data-variant="ghost" data-size="sm" @click="removeTodo(i)">✕</button>
      </div>
    </template>
  </div>
  
  <p style="margin-top: var(--space-3); font-size: var(--text-sm); color: var(--color-fg-muted);">
    <span l-text="todos.filter(t => !t.done).length">0</span> remaining
  </p>
</div>
```

### Example 4: Toast with $ui and global store

```html
<script>
  Faqir.store('notifications', { count: 0 });
</script>

<div l-data>
  <button data-ui="button" @click="
    document.getElementById('toast-container')._faqirToast.add({
      message: 'Hello!', tone: 'success', duration: 3000
    });
    $store.notifications.count++
  ">
    Show Toast (<span l-text="$store.notifications.count">0</span>)
  </button>
</div>

<div data-ui="toast" data-part="container" data-variant="top-right" id="toast-container"></div>
```

---

## 14. Size Budget

| Section | Raw Lines | Est. Minified | Est. Gzipped |
|---------|-----------|---------------|--------------|
| Reactive Engine | ~200 | 1.5KB | 0.7KB |
| Expression Evaluator | ~80 | 0.6KB | 0.3KB |
| Directive System | ~400 | 2.8KB | 1.2KB |
| Magic Properties | ~100 | 0.7KB | 0.3KB |
| Faqir Bridge | ~80 | 0.6KB | 0.3KB |
| Core Utilities | ~380 | 1.5KB | 0.6KB |
| Recipe Controllers | ~2,416 | 8.0KB | 3.0KB |
| Global API | ~60 | 0.4KB | 0.2KB |
| Bootstrap | ~60 | 0.4KB | 0.2KB |
| **Total** | **~3,776** | **~16.5KB** | **~6.8KB** |

For comparison: AlpineJS is 15KB minified / 4.3KB gzipped.

---

## 15. Implementation Phases

### Phase 1: Reactive Engine + Expression Evaluator
Create `registry/core/faqir-core.js` with Sections 1-2. No DOM yet — pure reactive primitives.

### Phase 2: Directive Infrastructure + l-data
Add Section 3 scaffolding (parser, tree walker, priority sorting) + `l-data` directive.

### Phase 3: Core Directives
`l-text`, `l-html`, `l-bind`/`:`, `l-on`/`@` (with all modifiers), `l-ref`, `l-init`, `l-effect`, `l-cloak`.

### Phase 4: Complex Directives
`l-model` (all input types + faqir switch), `l-show` (with transitions), `l-if`, `l-for`, `l-transition`, `l-teleport`.

### Phase 5: Magic + Faqir Bridge
`$el`, `$refs`, `$store`, `$watch`, `$dispatch`, `$nextTick`, `$id`. Then `$state`, `$variant`, `$ui` with MutationObserver bridge.

### Phase 6: Embed Controllers + Global API + Bootstrap
Inline all 15 controllers + core utilities. Add `Faqir.*` API. UMD wrapper. Auto-start logic.

### Phase 7: Playground Migration + Manifest Props
Update `playground/index.html` to use `<script src="faqir-core.js">`. Add `props` to all 38 manifests.

### Phase 8: Testing + Polish
Write tests in `tests/core/faqir-core.test.ts`. Size audit. Documentation.

---

## 16. Verification Plan

1. **Unit tests** (in `tests/core/faqir-core.test.ts` using Bun + happy-dom):
   - Reactive: proxy tracking, effect re-runs, batching, cleanup
   - Expressions: evaluation, caching, error handling
   - Each directive: l-text, l-bind, l-on, l-model, l-show, l-if, l-for, etc.
   - Magics: $el, $refs, $store, $state, $variant, $ui, $watch, $dispatch
   - Bridge: data-state sync, controller auto-init, $ui access

2. **Integration test**: Load playground in browser with only `<script src="faqir-core.js">`:
   - All 15 recipes auto-initialize
   - Dialog opens/closes, tabs switch, accordion expands, dropdown works
   - Theme/mode switcher works via directives
   - Toast notifications work

3. **Backwards compatibility**: Existing HTML without `l-*` directives still works (controllers auto-init from `data-ui`)

4. **Size check**: `wc -c faqir-core.js` should be < 50KB raw. After `terser`: < 17KB. After gzip: < 7KB.

5. **CDN test**: Serve from simple HTTP server (`python -m http.server`), load via `<script src>` (not module), verify everything works.

---

## 17. Files to Modify

| Action | File | What |
|--------|------|------|
| **CREATE** | `registry/core/faqir-core.js` | The single deliverable |
| **UPDATE** | `playground/index.html` | Replace `<script type="module">` with `<script src="faqir-core.js">`, convert inline onclick to directives |
| **UPDATE** | `registry/primitives/button/button.manifest.json` | Add `props` |
| **UPDATE** | `registry/primitives/input/input.manifest.json` | Add `props` |
| **UPDATE** | `registry/primitives/textarea/textarea.manifest.json` | Add `props` |
| **UPDATE** | `registry/primitives/select/select.manifest.json` | Add `props` |
| **UPDATE** | `registry/primitives/checkbox/checkbox.manifest.json` | Add `props` |
| **UPDATE** | `registry/primitives/radio/radio.manifest.json` | Add `props` |
| **UPDATE** | `registry/primitives/switch/switch.manifest.json` | Add `props` |
| **UPDATE** | `registry/primitives/label/label.manifest.json` | Add `props` |
| **UPDATE** | `registry/primitives/badge/badge.manifest.json` | Add `props` |
| **UPDATE** | `registry/primitives/card/card.manifest.json` | Add `props` |
| **UPDATE** | `registry/primitives/avatar/avatar.manifest.json` | Add `props` |
| **UPDATE** | `registry/primitives/kbd/kbd.manifest.json` | Add `props` |
| **UPDATE** | `registry/recipes/dialog/dialog.manifest.json` | Add `props` |
| **UPDATE** | `registry/recipes/tabs/tabs.manifest.json` | Add `props` |
| **UPDATE** | `registry/recipes/accordion/accordion.manifest.json` | Add `props` |
| **UPDATE** | `registry/recipes/dropdown/dropdown.manifest.json` | Add `props` |
| **UPDATE** | `registry/recipes/tooltip/tooltip.manifest.json` | Add `props` |
| **UPDATE** | `registry/recipes/toast/toast.manifest.json` | Add `props` |
| **UPDATE** | `registry/recipes/combobox/combobox.manifest.json` | Add `props` |
| **UPDATE** | `registry/recipes/command-palette/command-palette.manifest.json` | Add `props` |
| **UPDATE** | `registry/recipes/table/table.manifest.json` | Add `props` |
| **UPDATE** | `registry/recipes/select-custom/select-custom.manifest.json` | Add `props` |
| **UPDATE** | `registry/recipes/popover/popover.manifest.json` | Add `props` |
| **UPDATE** | `registry/recipes/pagination/pagination.manifest.json` | Add `props` |
| **UPDATE** | `registry/recipes/date-picker/date-picker.manifest.json` | Add `props` |
| **UPDATE** | `registry/recipes/drawer/drawer.manifest.json` | Add `props` |
| **UPDATE** | `registry/recipes/sheet/sheet.manifest.json` | Add `props` |
| **CREATE** | `tests/core/faqir-core.test.ts` | Test suite |
