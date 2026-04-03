# Loom-Core Reactive Directives Reference

Include `<script src="loom-core.js" defer></script>` for Alpine-style reactivity.

---

## Directives

| Directive | Shorthand | Example |
|-----------|-----------|---------|
| `l-data` | — | `l-data="{ count: 0 }"` — reactive scope |
| `l-text` | — | `l-text="count"` — set textContent |
| `l-html` | — | `l-html="htmlStr"` — set innerHTML |
| `l-bind:attr` | `:attr` | `:disabled="loading"` — bind attribute |
| `l-on:event` | `@event` | `@click="count++"` — event handler |
| `l-model` | — | `l-model="name"` — two-way binding |
| `l-show` | — | `l-show="visible"` — toggle display |
| `l-if` | — | `l-if="show"` — conditional (on `<template>`) |
| `l-for` | — | `l-for="item in items"` — list (on `<template>`) |
| `l-ref` | — | `l-ref="myEl"` — store in `$refs` |
| `l-init` | — | `l-init="setup()"` — run on init |
| `l-effect` | — | `l-effect="document.title = name"` — side effect |
| `l-cloak` | — | Hide element until initialized |
| `l-source:name` | — | `l-source:tasks="/api/tasks"` — declarative REST data binding |

## l-model Modifiers

- `.number` — cast to number
- `.trim` — trim whitespace
- `.lazy` — update on change instead of input

## Event Modifiers

- `.prevent` — preventDefault
- `.stop` — stopPropagation
- `.once` — listen once
- `.self` — only if target is the element itself
- `.debounce` — debounce handler (default 250ms, custom: `.debounce.500ms`)
- `.throttle` — throttle handler

**Key modifiers:** `.enter`, `.escape`, `.space`, `.tab`, `.arrow-up`, `.arrow-down`, `.arrow-left`, `.arrow-right`, `.delete`, `.backspace`

**Combo:** `.ctrl`, `.shift`, `.alt`, `.meta`

## Magic Properties

| Property | Description |
|----------|-------------|
| `$el` | Current element |
| `$refs` | Object of `l-ref` elements |
| `$store` | Global store (via `Loom.store()`) |
| `$state` | Current `data-state` of closest `[data-ui]` |
| `$variant` | Current `data-variant` of closest `[data-ui]` |
| `$ui` | Controller API of closest `[data-ui]` (e.g., `$ui.open()`) |
| `$dispatch` | Dispatch custom event: `$dispatch('my-event', detail)` |
| `$nextTick` | Run after DOM update: `$nextTick(() => ...)` |
| `$watch` | Watch expression: `$watch('count', (val, old) => ...)` |
| `$id` | Generate unique ID: `$id('prefix')` |

## l-source Directive

Declarative REST data binding. Place on any `l-data` element:

```html
<div l-data="{ newTitle: '' }" l-source:tasks="/api/tasks">
```

**Auto-injected into scope:**
- `tasks` — reactive array of fetched items
- `tasksLoading` — boolean, true during fetch
- `tasksError` — string|null error message
- `$tasks` — CRUD controller object

**Controller methods:** `$tasks.load()`, `$tasks.create(payload)`, `$tasks.update(id, payload)`, `$tasks.remove(id)`, `$tasks.refresh()`, `$tasks.startPolling(ms?)`, `$tasks.stopPolling()`

**Modifiers:**
- `.lazy` — don't auto-load on init
- `.optimistic` — update UI before server confirms (rollback on error)
- `.poll.5000` — auto-refresh every N ms (default 30000)
- `.key.uuid` — use custom ID key instead of `id`

Example: `l-source:items.optimistic.poll.10000.key.uuid="/api/items"`

## Global API

```js
Loom.store('name', { count: 0 })       // Register global store
Loom.data('name', () => ({ ... }))      // Register reusable data factory
Loom.directive('name', handler)          // Register custom directive
Loom.magic('name', callback)             // Register magic property
Loom.plugin(fn)                          // Register plugin
Loom.controller('name', factory)         // Register recipe controller
Loom.initTree(el)                        // Manual init for dynamic content
```

## Common Patterns

### Counter
```html
<div l-data="{ count: 0 }">
  <button @click="count--">-</button>
  <span l-text="count"></span>
  <button @click="count++">+</button>
</div>
```

### Two-way binding
```html
<div l-data="{ name: '' }">
  <input l-model="name" placeholder="Name...">
  <p>Hello, <strong l-text="name || '...'"></strong></p>
</div>
```

### Conditional rendering
```html
<div l-data="{ show: true }">
  <button @click="show = !show" l-text="show ? 'Hide' : 'Show'"></button>
  <div l-show="show">Visible content</div>
</div>
```

### List rendering
```html
<div l-data="{ items: ['A', 'B', 'C'] }">
  <template l-for="(item, i) in items">
    <span l-text="item"></span>
    <button @click="items.splice(i, 1)">Remove</button>
  </template>
</div>
```

### Using $ui to call controller API
```html
<div data-ui="dialog" data-state="closed" l-data="{}">
  <button @click="$ui.open()">Open via directive</button>
  <!-- ... dialog structure ... -->
</div>
```

### Global store
```html
<script>
  Loom.store('user', { name: 'Alice', role: 'admin' });
</script>
<div l-data>
  <p l-text="$store.user.name"></p>
</div>
```
