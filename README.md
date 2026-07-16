# Faqir UI

> Agent-native UI framework. Manifest-driven, zero-class, zero-dependency.
> Built for AI agents to generate, inspect, and repair — and for developers to fully own.

**No classes. No build step. No runtime dependencies.**
**Just data attributes, design tokens, and machine-readable manifests.**

```
The CSS is the component.
The JSON manifest is the documentation.
The AI is the compiler.
The CLI is the conductor.
```

---

## Table of Contents

- [Why Faqir?](#why-faqir)
- [Quick Start](#quick-start)
- [The Attribute Protocol](#the-attribute-protocol)
- [Component Library](#component-library)
- [Layout System](#layout-system)
- [Design Token System](#design-token-system)
- [Theme System](#theme-system)
- [Faqir Core — Reactive Engine](#faqir-core--reactive-engine)
- [The Manifest System](#the-manifest-system)
- [JavaScript Controllers](#javascript-controllers)
- [CLI Reference](#cli-reference)
- [CSS Bundle](#css-bundle)
- [Audit and Repair](#audit-and-repair)
- [Scaffolding and Code Generation](#scaffolding-and-code-generation)
- [Data-Driven Rendering](#data-driven-rendering)
- [AI Agent Integration](#ai-agent-integration)
- [CSS Conventions](#css-conventions)
- [Project Structure](#project-structure)
- [Development](#development)
- [License](#license)

---

## Why Faqir?

Traditional UI frameworks use class names: `.btn`, `.btn-primary`, `.card-header`. This creates naming collisions, specificity wars, and markup that no machine can reliably parse. A class name is ambiguous — is `.active` a state, a variant, or a layout helper?

Faqir replaces all of it with a five-attribute protocol where every attribute has a single, unambiguous purpose:

```html
<!-- Traditional -->
<button class="btn btn-primary btn-lg is-loading">Save</button>

<!-- Faqir -->
<button data-ui="button" data-variant="primary" data-size="lg" data-state="loading">Save</button>
```

Every component is machine-readable. Every variant is auditable. Every state change is traceable. The CSS targets data attributes — never classes.

This makes Faqir **agent-native**: AI coding agents can read manifests, generate valid markup, audit it against contracts, and auto-repair violations. But it's equally good for developers — you get a complete component library, a dev server, CSS bundling, and full ownership of every file.

### What Faqir Is NOT

- Not a JavaScript framework (no virtual DOM, no JSX, no compile step)
- Not a utility-first CSS library (not Tailwind)
- Not a package you import at runtime (no `node_modules` dependency)
- Not a design system only for humans to browse — it's a design system for agents to parse and developers to own

---

## Quick Start

### Prerequisites

- [Bun](https://bun.sh) runtime

### Install and Initialize

```bash
# Install globally (or use npx)
npm install -g faqir-ui-cli

# Initialize a new project
faqir init

# Add components
faqir add button input card dialog tabs stack grid surface

# Start dev server
faqir dev
```

### What `faqir init` Creates

```
your-project/
├── ui/
│   ├── tokens/          Design tokens (CSS custom properties)
│   ├── base/            CSS reset and prose styles
│   ├── core/            Reactive engine + recipe controllers
│   ├── primitives/      (empty — add components with `faqir add`)
│   ├── recipes/         (empty — add components with `faqir add`)
│   ├── patterns/        (empty — add components with `faqir add`)
│   └── faqir.bundle.css  Single CSS bundle (auto-generated)
├── faqir.config.json     Project configuration
└── .faqir/
    └── context.json     AI agent context (auto-generated)
```

### Use in HTML

After adding components, include one CSS file and the reactive engine:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <link rel="stylesheet" href="ui/faqir.bundle.css">
  <script src="ui/core/faqir-core.js" defer></script>
</head>
<body>
  <div data-ui="surface" data-variant="flat" data-size="lg">
    <div data-ui="stack" data-gap="6">
      <h1>Hello Faqir</h1>
      <button data-ui="button" data-variant="primary">Get Started</button>
    </div>
  </div>
</body>
</html>
```

One `<link>` tag. One `<script>` tag. That's the entire framework inclusion.

---

## The Attribute Protocol

Five data attributes form the stable DOM contract between HTML, CSS, JavaScript, and AI agents.

| Attribute | Purpose | Set By | Example |
|-----------|---------|--------|---------|
| `data-ui` | Component identity | Markup | `data-ui="button"` |
| `data-part` | Named slot within parent | Markup | `data-part="trigger"` |
| `data-state` | Runtime state | JavaScript only | `data-state="open"` |
| `data-variant` | Visual variant | Markup (set once) | `data-variant="primary"` |
| `data-size` | Size variant | Markup (set once) | `data-size="lg"` |

### Rules

1. `data-ui` goes on the **root element** of every component instance.
2. `data-part` identifies **child slots** within a parent component.
3. `data-state` is the **only** attribute JavaScript controllers modify. CSS reacts to it.
4. `data-variant` and `data-size` are set in markup and rarely change at runtime.
5. Components **never** use CSS class names. State lives in `data-state`. Identity lives in `data-ui`.
6. Standard HTML attributes (`role`, `aria-*`, `hidden`, `disabled`) work alongside data attributes.

### How CSS Targets the Protocol

```css
[data-ui="button"] { }                                         /* base styles */
[data-ui="button"][data-variant="primary"] { }                  /* variant */
[data-ui="button"][data-size="lg"] { }                          /* size */
[data-ui="dialog"][data-state="open"] [data-part="panel"] { }   /* state + part */
[data-ui="card"] [data-part="header"] { }                       /* scoped part */
```

No specificity wars. No naming conventions to memorize. The selector **is** the documentation.

---

## Component Library

Faqir ships 68 components across three layers, from simple CSS-only primitives to full interactive recipes and page-level patterns.

### Primitives (39 components) — CSS Only

Pure CSS components. No JavaScript required. Drop in the HTML and it works.

| Component | Description | Variants |
|-----------|-------------|----------|
| `button` | Action trigger | primary, secondary, destructive, ghost, outline, link + sm/md/lg |
| `input` | Text input field | error, disabled states |
| `textarea` | Multi-line text | error, disabled states |
| `select` | Native select dropdown | error, disabled states |
| `checkbox` | Form checkbox | checked, indeterminate |
| `radio` | Radio button | checked state |
| `switch` | Toggle switch | checked state |
| `label` | Form label | required indicator |
| `card` | Container with slots | header, body, footer parts |
| `badge` | Status indicator | primary, secondary, success, warning, destructive |
| `avatar` | Profile image/initials | sm, md, lg sizes |
| `separator` | Horizontal/vertical divider | horizontal, vertical + solid, dashed, dotted, thick styles |
| `spinner` | Loading animation | sm, md, lg sizes |
| `kbd` | Keyboard key display | — |
| `progress` | Progress bar | determinate, indeterminate |
| `stepper` | Multi-step indicator | active, completed states |
| `empty-state` | Placeholder for empty content | — |
| `nav` | Navigation container | — |
| `text` | Text with semantic styles | muted, sm/lg/xl sizes |
| `stack` | Flexbox layout | vertical (default), horizontal |
| `grid` | CSS Grid layout | 1–12 columns, responsive |
| `surface` | Container with elevation | flat, raised, overlay |
| `callout` | Notice/warning box | info, warning, destructive, success, muted |
| `description-list` | Styled dl/dt/dd pairs | vertical, horizontal + sm/md/lg |
| `field-group` | Form field wrapper (label + input + error) | vertical, horizontal + error/valid states |
| `image` | Responsive image with caption | responsive, thumbnail, cover, contain + xs–full sizes |
| `key-value` | Labeled data pair | horizontal, vertical, inline + grid columns |
| `page-break` | Print page break | after (default), before |
| `signature` | Signing line for documents | sm/md/lg + left/center/right alignment |
| `stat` | Metric display with trend | default, card + up/down/neutral trend |
| `icon` | CSS-mask icon (120 Lucide glyphs) | any of 120 `data-icon` names; inherits `currentColor`, sizes with `font-size` |
| `skeleton` | Loading placeholder | text, circle, rect |
| `chip` | Compact label with optional dismissal | default, primary, success, warning, destructive |
| `link` | Styled anchor | default, external, muted |
| `breadcrumb` | Hierarchical navigation trail | sm/md/lg sizes |
| `toggle` | Native two-state button | pressed state + sm/md/lg sizes |
| `collapsible` | Native disclosure container | default, bordered |
| `aspect-ratio` | Media ratio wrapper | square, 16:9, 4:3, 3:2, 21:9, portrait |
| `watermark` | Non-interactive document overlay | fixed/absolute + single/repeated + diagonal/horizontal |

> **Icons** render from CSS alone — each glyph is a data-URI SVG applied as a `mask-image` on a `background-color: currentColor` box, so they inherit text color and size with `font-size` (`1em`). No icon fonts, no runtime SVG fetch, zero JavaScript. The full 120-glyph `icons.css` is **44.76 KB raw / 6.26 KB gzip**; `faqir add icons --only check,x,chevron-down` trims it to just the icons a project uses (e.g. 5 common glyphs → **≈1.84 KB**). Re-running `--only` with more names merges rather than clobbers, and the `icon-name` audit rule flags any unknown `data-icon` value with a nearest-match "did you mean …" hint. Glyphs are the MIT/ISC-licensed [Lucide](https://lucide.dev) set — attribution ships in `icon/LICENSE.lucide`. Usage: `<span data-ui="icon" data-icon="check" aria-hidden="true"></span>` (decorative) or add `role="img"` + `aria-label` when meaningful.

### Recipes (22 components) — CSS + JavaScript

Interactive components with JavaScript controllers. Auto-initialize when `faqir-core.js` is loaded.

| Component | Description | Key Features |
|-----------|-------------|-------------|
| `dialog` | Modal dialog | Focus trap, escape-to-close, ARIA modal |
| `drawer` | Side panel | Slides from left/right, overlay |
| `sheet` | Full/partial overlay panel | Bottom sheet pattern |
| `dropdown` | Action menu | Keyboard navigation, click-outside-close |
| `popover` | Floating content | Positioned relative to trigger |
| `tooltip` | Hover information | Delay, positioning |
| `tabs` | Tab panel switcher | Arrow key navigation, ARIA tabs |
| `accordion` | Expandable sections | Single/multi open modes |
| `combobox` | Searchable select | Filtering, keyboard selection |
| `select-custom` | Custom-styled select | Full keyboard support |
| `command-palette` | Command menu (Cmd+K) | Fuzzy search, sections |
| `table` | Data table | Sortable, row selection, footer, alignment, grouped rows, print compact |
| `pagination` | Page navigation | Previous/next, page numbers |
| `toast` | Notification messages | Auto-dismiss, stacking |
| `date-picker` | Calendar date selection | Month navigation, range selection |
| `qr-code` | SVG QR code generator | sm/md/lg sizes, error correction levels (L/M/Q/H) |
| `alert-dialog` | Destructive action confirmation | Focus trap, escape-to-close, return focus |
| `slider` | Range input with custom track/thumb | Keyboard control, orientation, value updates |
| `sidebar` | Responsive application navigation | Collapsible groups, mobile state |
| `input-otp` | One-time-code input group | Focus movement, paste distribution, masking |
| `calendar` | Standalone date grid | Month navigation, single/range selection |
| `barcode` | SVG Code 128-B generator | Printable ASCII, modulo-103 checksum, print-safe quiet zones |

### Patterns (7 compositions) — No Custom JS

Pre-built page-level compositions that combine primitives and recipes.

| Pattern | Composes |
|---------|----------|
| `auth-form` | card, input, button, separator, label |
| `dashboard-shell` | card, grid, avatar, dropdown, button, nav |
| `settings-page` | tabs, card, input, switch, button |
| `crud-table` | table, button, dropdown, dialog, pagination |
| `empty-state` | button, card |
| `search-results` | grid, input, button, badge, pagination |
| `document` | Full-page print/PDF container (invoice, form, report) with A4/letter formats |

---

## Layout System

Three layout primitives replace CSS utility classes for page structure. No `.container`, `.row`, `.col-6` — just components.

### Stack — Flex Container

```html
<!-- Vertical stack with gap -->
<div data-ui="stack" data-gap="4">
  <p>First</p>
  <p>Second</p>
</div>

<!-- Horizontal stack, centered -->
<div data-ui="stack" data-variant="horizontal" data-gap="3" data-align="center">
  <button data-ui="button">Cancel</button>
  <button data-ui="button" data-variant="primary">Save</button>
</div>
```

| Attribute | Values |
|-----------|--------|
| `data-gap` | `0`, `1`, `2`, `3`, `4`, `6`, `8` |
| `data-align` | `start`, `center`, `end`, `stretch` |
| `data-justify` | `start`, `center`, `end`, `between` |
| `data-variant` | `horizontal` |
| `data-wrap` | (boolean attribute) |

### Grid — Column Layout

```html
<!-- Three-column grid, responsive -->
<div data-ui="grid" data-cols="3" data-gap="4">
  <div data-ui="card">...</div>
  <div data-ui="card">...</div>
  <div data-ui="card">...</div>
</div>
```

| Attribute | Values |
|-----------|--------|
| `data-cols` | `1`, `2`, `3`, `4`, `6`, `12` |
| `data-cols-sm` | Override columns below 640px |
| `data-gap` | `2`, `4`, `6`, `8` |

Auto-stacks to 1 column on screens under 640px by default.

### Surface — Container

```html
<div data-ui="surface" data-variant="raised" data-size="lg">
  Content with padding and shadow
</div>
```

| Attribute | Values |
|-----------|--------|
| `data-variant` | `flat`, `raised`, `overlay` |
| `data-size` | `sm`, `md`, `lg` |
| `data-max` | `sm`, `md`, `lg`, `xl` (max-width) |

### Composing Layouts

```html
<div data-ui="surface" data-size="lg" data-max="xl" style="margin: 0 auto">
  <div data-ui="stack" data-gap="8">

    <!-- Header -->
    <div data-ui="stack" data-variant="horizontal" data-align="center" data-justify="between">
      <h1>Dashboard</h1>
      <button data-ui="button" data-variant="primary">New Item</button>
    </div>

    <!-- Card grid -->
    <div data-ui="grid" data-cols="3" data-gap="4" data-cols-sm="1">
      <div data-ui="card">
        <div data-part="body">Card one</div>
      </div>
      <div data-ui="card">
        <div data-part="body">Card two</div>
      </div>
      <div data-ui="card">
        <div data-part="body">Card three</div>
      </div>
    </div>

    <!-- Actions -->
    <div data-ui="stack" data-variant="horizontal" data-gap="3" data-align="center">
      <button data-ui="button" data-variant="outline">Cancel</button>
      <button data-ui="button" data-variant="primary">Save</button>
    </div>

  </div>
</div>
```

---

## Design Token System

All styling uses CSS custom properties organized in three layers. Components reference **only** semantic tokens — never raw palette values.

### Layer 1: Palette (raw values)

Never referenced by components directly. These define the color space:

```css
--palette-indigo-500: oklch(0.55 0.22 264);
--palette-red-500:    oklch(0.55 0.22 27);
--palette-gray-200:   oklch(0.91 0.004 264);
```

### Layer 2: Semantic (what components use)

Purpose-based tokens that map to palette values. Themes override these.

```css
/* Surfaces */
--color-bg              --color-bg-subtle        --color-bg-muted
--color-fg              --color-fg-muted         --color-fg-subtle

/* Interactive */
--color-primary         --color-primary-hover     --color-primary-fg
--color-secondary       --color-destructive       --color-success
--color-warning         --color-info

/* Borders */
--color-border          --color-border-strong     --color-ring
```

### Layer 3: Aliases (component-specific)

Optional overrides for fine-tuning individual components:

```css
--button-radius         --button-height-md
--card-shadow           --card-padding
--input-radius          --input-height
--dialog-radius         --dialog-shadow
```

### Other Token Categories

| File | Key Tokens |
|------|------------|
| `spacing.css` | `--space-0` through `--space-24` (4px base scale) |
| `typography.css` | `--font-sans`, `--font-mono`, `--text-xs` through `--text-4xl`, `--weight-*`, `--leading-*` |
| `effects.css` | `--radius-sm` through `--radius-2xl`, `--shadow-xs` through `--shadow-xl`, `--z-*` |
| `motion.css` | `--ease-default`, `--ease-in-out`, `--duration-fast` (150ms), `--duration-normal` (250ms), `--duration-slow` (350ms) |
| `document.css` | `--page-format`, `--page-margin`, `--doc-font`, `--doc-heading-size`, `--doc-table-*`, `--doc-signature-*`, `--doc-max-width` |
| `doc-aliases.css` | `--kv-*`, `--callout-*`, `--image-*`, `--field-*`, `--page-break-*`, `--stat-*` (component-level document aliases) |

---

## Theme System

Themes override Layer 2 semantic tokens. Nine built-in themes ship with Faqir:

| Theme | Description |
|-------|-------------|
| `default` | Clean modern. Light mode + dark mode via `[data-theme="dark"]` |
| `midnight` | Deep navy with cyan accents. High-contrast dark theme |
| `paper` | Warm cream backgrounds, earthy brown accents. Overrides document tokens for warmth |
| `brutalist` | Black and white. No shadows. No border radius |
| `document` | Clean, professional, PDF-optimized. No shadows, no radius, pt-based sizes |
| `document-serif` | Formal contracts/legal theme with serif typography and print-safe oxblood accents |
| `aurora` | Vibrant modern gradients for SaaS interfaces |
| `slate` | Conservative cool-gray enterprise surfaces |
| `contrast` | WCAG AAA-oriented high-contrast neutral theme |

### Using Themes

```html
<!-- Light mode (default) -->
<html data-theme="light">

<!-- Dark mode -->
<html data-theme="dark">

<!-- Auto (follows system preference) -->
<html data-theme="auto">
```

### Managing Themes via CLI

```bash
# Switch active theme
faqir theme set midnight

# Create a custom theme (generates a CSS file with all tokens commented out)
faqir theme create my-brand

# Generate a complete theme from one brand color
faqir theme generate my-brand --accent "oklch(0.55 0.2 150)" --neutral cool --radius lg --scheme both

# Also generate a matching, print-optimized document theme
faqir theme generate my-brand --accent "#168c5b" --document

# List available themes
faqir theme list
```

`theme create` emits a scaffold with commented semantic-token overrides. `theme
generate` instead writes a complete `themes/<name>.css` and adjacent
`<name>.theme.json`. Its deterministic 11-step OKLCH ramp accepts opaque
`oklch()`, `#rgb`, or `#rrggbb` accents; `--neutral` chooses `cool`, `warm`, or
`gray`, `--radius` chooses `sm`, `md`, or `lg`, and `--scheme` chooses `light`,
`dark`, or `both`.

Before either file is written, the generator derives the manifest, checks every
theme coverage token, and verifies the same foreground/background pairs used by
the `contrast-tokens` audit. Light-mode primary actions use white text and move
to a darker ramp step when needed; dark mode uses dark text on an inverted,
lighter accent step. `--document` additionally writes
`themes/<name>-document.css` and its light-only print manifest. Add `--json` to
receive the generated paths, normalized accent, and every computed contrast
ratio for automation.

---

## Faqir Core — Reactive Engine

`faqir-core.js` is a zero-dependency reactive engine (~47KB min, ~12KB gzip). Drop it in with a single script tag — no build step required.

```html
<script src="ui/core/faqir-core.js" defer></script>
```

It provides Alpine.js-style reactive directives, automatic recipe controller initialization, and a global store.

### Directives

| Directive | Shorthand | Purpose |
|-----------|-----------|---------|
| `l-data` | — | Create reactive scope with initial state |
| `l-text` | — | Set text content reactively |
| `l-html` | — | Set inner HTML reactively |
| `l-bind:attr` | `:attr` | Bind element attributes |
| `l-on:event` | `@event` | Event listeners |
| `l-model` | — | Two-way form binding |
| `l-show` | — | Toggle visibility (with transitions) |
| `l-if` | — | Conditional rendering (on `<template>`) |
| `l-for` | — | List rendering (on `<template>`) |
| `l-ref` | — | Named element reference |
| `l-init` | — | Run code once on initialization |
| `l-effect` | — | Tracked reactive side effect |
| `l-cloak` | — | Hide element until Faqir initializes |
| `l-source:name` | — | Declarative REST data binding (injects array + CRUD controller) |

### Event Modifiers

`@click.prevent`, `@submit.stop`, `@keydown.enter`, `@click.once`, `@input.debounce.300ms`, `@resize.throttle.100ms`, `@click.self`

### Model Modifiers

`l-model.number`, `l-model.trim`, `l-model.lazy`, `l-model.debounce.300ms`

### Magic Properties

| Property | Description |
|----------|-------------|
| `$el` | Current element |
| `$refs` | Named element references |
| `$store` | Global reactive store |
| `$state` | Sync reactive state with `data-state` |
| `$variant` | Sync with `data-variant` |
| `$ui` | Access recipe controller API |
| `$dispatch` | Dispatch custom events |
| `$nextTick` | Run after DOM update |
| `$watch` | Watch reactive value changes |
| `$id` | Generate unique IDs |

### Examples

```html
<!-- Counter -->
<div l-data="{ count: 0 }">
  <span l-text="count"></span>
  <button data-ui="button" @click="count++">+1</button>
</div>

<!-- Two-way binding -->
<div l-data="{ name: '' }">
  <input data-ui="input" l-model="name" placeholder="Your name">
  <p>Hello, <span l-text="name || 'stranger'"></span>!</p>
</div>

<!-- Conditional list -->
<div l-data="{ items: ['Apple', 'Banana', 'Cherry'], show: true }">
  <button data-ui="button" @click="show = !show">Toggle</button>
  <template l-if="show">
    <div data-ui="stack" data-gap="2">
      <template l-for="item in items">
        <span data-ui="badge" l-text="item"></span>
      </template>
    </div>
  </template>
</div>

<!-- Global store -->
<script>
  Faqir.store('app', { theme: 'light', user: 'Agent' });
</script>
<div l-data="{}">
  <span l-text="$store.app.user"></span>
  <button data-ui="button" @click="$store.app.theme = $store.app.theme === 'light' ? 'dark' : 'light'">
    Toggle Theme
  </button>
</div>
```

---

## The Manifest System

Every component ships with a `.manifest.json` — a machine-readable contract that drives audit, repair, AI context generation, and code generation.

### Manifest Structure

```json
{
  "name": "dialog",
  "version": "1.0.0",
  "kind": "recipe",
  "category": "overlay",
  "description": "Modal dialog with focus trap and escape-to-close",

  "anatomy": {
    "tag": "div",
    "selector": "[data-ui='dialog']",
    "content_model": "slots"
  },

  "slots": {
    "trigger": { "selector": "[data-part='trigger']", "required": true },
    "overlay": { "selector": "[data-part='overlay']", "required": true },
    "panel":   { "selector": "[data-part='panel']",   "required": true },
    "title":   { "selector": "[data-part='title']",   "required": true },
    "close":   { "selector": "[data-part='close']",   "required": true },
    "body":    { "selector": "[data-part='body']",     "required": false }
  },

  "variants": {},
  "states": {
    "open": { "attr": "data-state=\"open\"" }
  },

  "a11y": {
    "role": "dialog",
    "aria-modal": true,
    "focus_trap": true,
    "escape_closes": true,
    "keyboard": { "Escape": "Close dialog", "Tab": "Cycle focus within dialog" }
  },

  "tokens_used": ["color-bg", "shadow-xl", "radius-xl", "duration-normal"],
  "templates": { "html": "<div data-ui=\"dialog\">..." },
  "safe_transforms": ["Change title text", "Add body content", "Change trigger text"],
  "unsafe_transforms": ["Remove data-ui attribute", "Remove overlay", "Remove focus trap"],
  "composition": { "contains": ["button"], "used_in": ["crud-table"] },
  "files": { "html": "dialog.html", "css": "dialog.css", "js": "dialog.js", "manifest": "dialog.manifest.json" },
  "tests": ["opens on trigger click", "traps focus", "closes on Escape"]
}
```

### What Manifests Enable

| Capability | How It Works |
|-----------|-------------|
| **Audit** | Validate HTML against slot requirements, variant values, ARIA attributes |
| **Repair** | Auto-fix missing slots, add required ARIA, remove class attributes |
| **Context** | Generate structured JSON/Markdown for AI agents to read |
| **Explain** | Produce human-readable component descriptions with anatomy trees |
| **Trace** | Show dependency graphs, file trees, token usage |
| **Create** | Generate valid component skeletons from the schema |

---

## JavaScript Controllers

Every recipe has a JavaScript controller following the `create{Name}` factory pattern:

```js
import { createDialog } from "./ui/recipes/dialog/dialog.js";

const el = document.querySelector('[data-ui="dialog"]');
const dialog = createDialog(el);

dialog.open();
dialog.close();
dialog.destroy();
```

### Controller Conventions

1. **Prevent double-init** via `root._faqir{Name}` guard
2. **Find parts** via `root.querySelector('[data-part="..."]')` selectors
3. **Express state** through `data-state` only — never class names
4. **Return API object** with at minimum a `destroy()` method
5. **Import only** from `core/` modules (dom, events, focus, motion, store)
6. **No data fetching** — controllers manage UI state, not data

### Auto-Initialization

Include `faqir-core.js` and all recipes auto-initialize:

```html
<script src="ui/core/faqir-core.js" defer></script>
```

The engine scans for `[data-ui]` elements matching known recipes, calls their factories, and watches for dynamically added elements via MutationObserver. You never need to call `createDialog()` manually unless you want the return API.

---

## Data-Driven Rendering

Faqir provides two approaches for connecting UI to REST APIs:

1. **`l-source` directive** (built into faqir-core.js) — declarative, attribute-based
2. **`apiSource()` factory** (separate script) — imperative, spread into `l-data`

### `l-source` Directive (Recommended)

Declare a data source directly on any `l-data` element. Faqir injects a reactive array and a CRUD controller into the scope.

```html
<div l-data="{ newTitle: '' }"
     l-source:tasks="/api/tasks">

  <!-- tasks (array), tasksLoading (bool), tasksError (string|null) are auto-injected -->
  <!-- $tasks (controller) provides: load, create, update, remove, refresh, startPolling, stopPolling -->

  <template l-if="tasksLoading">
    <div data-ui="spinner" data-size="sm"></div>
  </template>

  <template l-for="task in tasks">
    <div data-ui="card" data-size="sm">
      <div data-part="body">
        <span l-text="task.title"></span>
        <button data-ui="button" data-variant="ghost" data-size="sm"
                @click="$tasks.remove(task.id)">Delete</button>
      </div>
    </div>
  </template>

  <form @submit.prevent="$tasks.create({ title: newTitle }).then(() => newTitle = '')">
    <input data-ui="input" l-model="newTitle" placeholder="New task...">
    <button data-ui="button" data-variant="primary">Add</button>
  </form>
</div>
```

#### Modifiers

| Modifier | Effect |
|----------|--------|
| `.lazy` | Don't auto-load on init (call `$name.load()` manually) |
| `.optimistic` | Update UI before server confirms (rollback on error) |
| `.poll.5000` | Auto-refresh every 5000ms (default 30000ms) |
| `.key.uuid` | Use `uuid` as the ID key instead of `id` |

Example with modifiers: `l-source:tasks.optimistic.poll.10000="/api/tasks"`

#### Injected Into Scope

| Name | Type | Description |
|------|------|-------------|
| `{name}` | `Array` | The data array |
| `{name}Loading` | `boolean` | True during fetch |
| `{name}Error` | `string\|null` | Error message |
| `${name}` | `object` | CRUD controller |

Controller methods: `load()`, `create(payload)`, `update(id, payload)`, `remove(id)`, `refresh()`, `startPolling(ms?)`, `stopPolling()`

### `apiSource()` Factory (Legacy)

Faqir also ships with `apiSource()` — a thin data service layer that connects `l-data` scopes to REST endpoints. It's application-level code (not a Faqir controller), so it lives outside the `no-fetch` audit boundary.

### Include

```html
<script src="ui/core/api-source.js"></script>
<script src="ui/core/faqir-core.js" defer></script>
```

### The `apiSource()` Factory

```js
apiSource(endpoint, options?)
```

| Option | Default | Description |
|--------|---------|-------------|
| `idKey` | `"id"` | Primary key field name |
| `pollInterval` | `0` | Auto-refresh interval in ms (0 = off) |
| `optimistic` | `true` | Update UI before server confirms |

Returns an object meant to be spread into `l-data`:

| Property | Type | Description |
|----------|------|-------------|
| `items` | `Array` | Fetched data |
| `loading` | `boolean` | True during initial fetch |
| `submitting` | `boolean` | True during a mutation |
| `error` | `string\|null` | Error message or null |
| `load()` | `async` | GET — fetch all items |
| `create(payload)` | `async` | POST — create new item |
| `update(id, payload)` | `async` | PATCH — update item by id |
| `remove(id)` | `async` | DELETE — remove item by id |
| `startPolling(ms?)` | — | Start auto-refresh |
| `stopPolling()` | — | Stop auto-refresh |
| `refresh()` | `async` | Alias for `load()` |

### Usage

Spread `apiSource()` into any `l-data` scope and call `load()` on init:

```html
<div l-data="{
       ...apiSource('/api/tasks', { idKey: 'id', optimistic: true }),
       newTitle: ''
     }"
     l-init="load()">

  <!-- Loading state -->
  <template l-if="loading">
    <div data-ui="spinner" data-size="sm"></div>
  </template>

  <!-- Error state -->
  <template l-if="error">
    <span data-ui="text" data-variant="destructive" l-text="error"></span>
    <button data-ui="button" data-size="sm" @click="load()">Retry</button>
  </template>

  <!-- Data-driven list -->
  <template l-if="!loading && !error">
    <template l-for="task in items">
      <div data-ui="card" data-size="sm">
        <div data-part="body">
          <span l-text="task.title"></span>
          <button data-ui="button" data-variant="ghost" data-size="sm"
                  @click="remove(task.id)">Delete</button>
        </div>
      </div>
    </template>
  </template>

  <!-- Create -->
  <form @submit.prevent="create({ title: newTitle }).then(() => newTitle = '')">
    <input data-ui="input" l-model="newTitle" placeholder="New task...">
    <button data-ui="button" data-variant="primary">Add</button>
  </form>
</div>
```

### Optimistic Updates

When `optimistic: true` (default), the UI updates immediately before the server responds. If the server request fails, the change is rolled back automatically. This makes CRUD operations feel instant.

### Polling

```html
<div l-data="{ ...apiSource('/api/notifications', { pollInterval: 15000 }) }"
     l-init="load(); startPolling()">
  <template l-for="notif in items">
    <span l-text="notif.message"></span>
  </template>
</div>
```

### Multiple Sources

Each `apiSource()` call is independent — different endpoints, different state:

```html
<script>
  const menuSource  = apiSource('/api/menus');
  const userSource  = apiSource('/api/users', { optimistic: false });
</script>

<div l-data="{ ...menuSource }" l-init="load()">
  <template l-for="menu in items">
    <span l-text="menu.name"></span>
  </template>
</div>

<div l-data="{ ...userSource }" l-init="load()">
  <template l-for="user in items">
    <span l-text="user.email"></span>
  </template>
</div>
```

### Boundary Rules

- `apiSource()` is **application code** — lives in a `<script>` tag or a shared `.js` file
- Faqir **recipe controllers** never call `fetch` — the `no-fetch` audit rule still applies to them
- The `l-data` / `l-init` / `l-for` directives bridge data to DOM
- Error and loading states use standard Faqir components (spinner, card, empty-state)

### Dev Server

A Bun-based dev server is included for testing data-driven pages:

```bash
bun playground/server.js
# Serves on http://localhost:5555
# API: GET/POST /api/tasks, GET/PATCH/DELETE /api/tasks/:id
# Static: serves playground/ and registry/ files
```

See `playground/task-manager.html` for a full CRUD example using `apiSource()`.

---

## CLI Reference

The CLI is organized into five categories. Run `faqir help` for the full list or `faqir <command> --help` for options.

### Project Setup

```bash
faqir init                        # Initialize new project (creates ui/, config, bundle)
faqir init --theme midnight       # Initialize with a specific theme
faqir init --tokens-split         # Keep token files separate (not merged)
faqir init --no-core              # Skip JS modules (static CSS-only projects)
faqir init --dir ./styles         # Custom output directory

faqir doctor                      # Health check (config, files, manifests)
```

### Component Management

```bash
faqir add button card dialog      # Add components (auto-resolves dependencies)
faqir add --all                   # Add every component
faqir add --layer primitives      # Add all primitives
faqir add --dry-run               # Preview without writing

faqir remove dialog toast         # Remove components (checks dependencies)
faqir remove button --force       # Remove even if others depend on it
faqir remove card --dry-run       # Preview removal

faqir list                        # Show installed and available components (incl. aliases)

faqir search alert                # Find components by name, alias, or description
faqir add alert                   # Aliases resolve to their canonical component (callout)

faqir create my-widget --kind primitive    # Scaffold a new custom component
faqir create data-grid --kind recipe       # Scaffold with JS controller
faqir create status --kind primitive --category layout

faqir inspect button              # Show manifest details
faqir inspect dialog --json       # Raw JSON output
```

### Development

```bash
faqir dev                         # Start dev server (default: port 3000)
faqir dev --port 8080             # Custom port
faqir dev --open                  # Open browser automatically
faqir dev --bundle                # Auto-rebuild CSS bundle on changes

faqir bundle                      # Generate/regenerate CSS bundle
faqir bundle --minify             # Strip comments and whitespace
faqir bundle --watch              # Watch and rebuild on changes
faqir bundle --output dist/s.css  # Custom output path
faqir bundle --dry-run            # Show what would be bundled

faqir theme set midnight          # Switch active theme
faqir theme create my-brand       # Scaffold custom theme
faqir theme generate my-brand --accent "#168c5b" --document
faqir theme list                  # Show available themes

faqir variant add button visual=accent     # Add variant value
faqir variant remove button visual=accent  # Remove variant value

faqir scaffold landing-page       # Generate landing page HTML
faqir scaffold admin-dashboard    # Generate dashboard layout
faqir scaffold internal-tool      # Generate settings/forms page
faqir scaffold invoice            # Generate a print-ready invoice
faqir scaffold report             # Generate a print-ready business report
```

### Quality and Validation

```bash
faqir audit                       # Validate all HTML against manifests
faqir audit --file index.html     # Audit specific file
faqir audit --stdin               # Audit HTML piped on stdin (no project)
faqir audit --json                # JSON output for tooling (any command accepts --json)
faqir audit --fix                 # Alias for repair

faqir repair                      # Auto-fix audit issues

faqir conform                     # Normalize attribute order, add machine comments
faqir conform --dry-run           # Preview changes

faqir trace dialog                # Show dependency graph, file tree, token usage
faqir trace dialog --json         # Machine-readable output
```

### AI / Agent

```bash
faqir context                     # Generate .faqir/context.json
faqir context --format md         # Markdown format for LLM prompts
faqir context --format cursorrules # Cursor IDE format
faqir context --skill             # Also generate .faqir/SKILL.md
faqir context --stdout            # Print to stdout

faqir explain dialog              # Human/agent-readable component explanation
faqir explain dialog --json       # Structured output
```

---

## CSS Bundle

The CSS bundle solves the multi-file problem. Without it, a page using all components would need 40-50+ `<link>` tags. The bundle concatenates everything into one file with correct cascade order.

### How It Works

`faqir bundle` reads your `faqir.config.json`, finds all installed components, and concatenates their CSS in this order:

1. **Tokens** — design token custom properties
2. **Theme** — active theme overrides
3. **Base** — reset.css, prose.css
4. **Primitives** — installed primitive CSS (alphabetical)
5. **Recipes** — installed recipe CSS (alphabetical)
6. **Patterns** — installed pattern CSS (alphabetical)

Each section is separated by a `/* === primitives/button.css === */` comment for debuggability.

### Auto-Bundling

The bundle regenerates automatically when you:
- `faqir add` — new components are included
- `faqir remove` — removed components are excluded
- `faqir theme set` — new theme CSS is swapped in
- `faqir create` — custom component CSS is included
- `faqir init` — initial bundle created on project setup

### Configuration

After first bundle generation, `faqir.config.json` gains a `bundle` section:

```json
{
  "bundle": {
    "output": "./ui/faqir.bundle.css",
    "auto": true,
    "minify": false
  }
}
```

Set `auto: false` to disable auto-regeneration on add/remove/theme changes.

### JavaScript Bundle and Official Plugins

`faqir bundle --js` writes `ui/faqir.bundle.js` with the assembled core first,
followed by every official plugin in deterministic filename order. Use it when
you prefer one classic script:

```html
<script src="ui/faqir.bundle.js"></script>
```

Plugins can also be loaded individually after the core script from
`ui/core/plugins/`. `faqir-persist` provides `l-persist` and `$persist()` for
namespaced, JSON-serialized reactive state; `faqir-intersect` provides enter,
leave, and once-only IntersectionObserver hooks:

```html
<script src="ui/core/faqir-core.js"></script>
<script src="ui/core/plugins/faqir-persist.js"></script>
<script src="ui/core/plugins/faqir-intersect.js"></script>

<div l-data="{ count: 0 }" l-persist="count">…</div>
<section l-intersect="visible = true" l-intersect.leave="visible = false">…</section>
<div l-intersect.once="loadMore()">…</div>
```

---

## Audit and Repair

The audit system validates your HTML against component manifests. It catches structural errors, missing accessibility attributes, invalid variants, and anti-patterns.

```bash
faqir audit              # Run all checks
faqir repair             # Auto-fix what can be fixed

# Audit HTML piped on stdin against the registry — no project required:
echo '<button data-ui="button" data-variant="neon">x</button>' \
  | faqir audit --stdin --json
```

### JSON Output

Every CLI command accepts `--json` and, in that mode, stdout is guaranteed to be
a single machine-readable JSON document — including on error (a failing command
still emits parseable JSON and a non-zero exit code). Commands with a stable,
documented schema (`audit`, `diff`, `upgrade`, `inspect`, `explain`, `trace`,
`context`) emit that schema directly; every other command emits a generic
envelope carrying its captured messages, the resolved exit code, and any error.

The `faqir audit --json` (and `--stdin --json`) payload is versioned via
`audit_schema_version` — the stable contract the MCP audit tools and the 1.0
freeze depend on:

```jsonc
{
  "audit_schema_version": 1,       // bumped only on a breaking shape change
  "passed": false,                 // no critical/error findings
  "files_scanned": 1,
  "components_found": 1,
  "counts": { "critical": 0, "error": 1, "warning": 0, "info": 0 },
  "results": [
    {
      "rule_id": "valid-variant",
      "severity": "error",         // critical | error | warning | info
      "component_name": "button",
      "file": "<stdin>",           // "<stdin>" for --stdin, else the scanned path
      "line": 1,
      "column": 9,                 // present only when a rule pins an exact column
      "message": "Invalid variant \"neon\" on [data-ui=\"button\"]. …",
      "fixable": false             // true when `faqir repair` can auto-fix it
    }
  ]
}
```

### Audit Rules

| Rule | What It Checks |
|------|---------------|
| `slot-satisfied` | All required `[data-part]` slots present |
| `valid-attributes` | Only manifest-allowed attributes used |
| `variant-values` | Variant values match manifest's allowed list |
| `state-valid` | State values match manifest |
| `controller-loaded` | Recipe controllers are referenced |
| `token-exists` | CSS tokens used are defined |
| `no-fetch` | JS controllers don't fetch data |
| `no-important` | No `!important` in CSS |
| `no-id-selector` | No ID selectors in CSS |
| `no-class-selector` | No class selectors (use `data-*`) |
| `no-external-import` | Only relative/core imports in JS |
| `reduced-motion` | Animations include `prefers-reduced-motion` query |

### Repair

`faqir repair` runs the audit, identifies auto-fixable issues, applies deterministic fixes, then re-audits to verify. Fixable issues include missing ARIA attributes, incorrect attribute order, and missing required slots with obvious defaults.

### Conform

`faqir conform` normalizes markup without fixing semantic issues:
- Reorders attributes to canonical order: `data-ui`, `data-part`, `data-state`, `data-variant`, `data-size`, ARIA, then others
- Adds machine comments at the top of component CSS files
- Ensures consistent formatting across all HTML files

---

## Scaffolding and Code Generation

### Page Scaffolds

Generate complete, working HTML pages with all required CSS and components:

```bash
faqir scaffold landing-page       # Hero + features + CTA sections
faqir scaffold admin-dashboard    # Sidebar + header + stats + data table
faqir scaffold internal-tool      # Tab-based settings with forms
faqir scaffold invoice            # Invoice, totals, payment QR, signatures
faqir scaffold report             # Summary, metrics, details, and imagery
```

Scaffolds auto-install any missing components and use the bundle when one exists (single `<link>` tag instead of per-component links).

The `invoice` and `report` scaffolds default to the print-optimized `document`
theme. Pass `--theme <name>` while scaffolding, or run `faqir theme set <name>`
later, to apply another installed or registry theme. Their sample content is
marked with `<!-- FAQIR_REPLACE: path.to.value -->` comments: replace the value
immediately following each marker while preserving the `data-ui` and `data-part`
attributes. Both templates include canonical `doc-header` and `doc-footer` parts
for repeating print furniture and use only theme/component tokens, so switching
themes does not require changing their markup.

### Custom Components

Create your own components that integrate with the full Faqir workflow:

```bash
faqir create sidebar --kind primitive
```

This generates a complete component directory:

```
ui/primitives/sidebar/
├── sidebar.manifest.json    Valid manifest skeleton
├── sidebar.css              CSS with [data-ui="sidebar"] selector
└── sidebar.html             Reference markup
```

For recipes (`--kind recipe`), a JavaScript controller stub is also generated with the `create{Name}` pattern.

Custom components are immediately registered in `faqir.config.json`, included in the CSS bundle, and visible to `faqir audit`, `faqir context`, and all other CLI tools.

---

## AI Agent Integration

Faqir is designed as an **agent-native** framework. Every design decision optimizes for AI agents being able to reliably generate, inspect, and repair UI code.

### How Agents Use Faqir

1. **Read manifests** — JSON contracts describe every component's anatomy, slots, variants, states, and ARIA requirements
2. **Generate markup** — Use `templates.html` from manifests as starting points
3. **Audit results** — Run `faqir audit` to validate generated HTML
4. **Auto-repair** — Run `faqir repair` to fix common mistakes
5. **Understand constraints** — `safe_transforms` and `unsafe_transforms` tell agents what they can and cannot modify

### Context Generation

```bash
faqir context                    # Generate .faqir/context.json
faqir context --format md        # Markdown for LLM system prompts
faqir context --skill            # Generate Claude Code SKILL.md
```

The context file aggregates all installed component manifests into a single JSON file that agents can read at the start of a session. It includes:

- Framework version and theme
- The five-attribute protocol
- All component kinds, variants, slots, states, templates
- Safe/unsafe transform rules
- Linting constraints

### Claude Code Integration

Faqir ships with a [faqir-creator skill](.claude/skills/faqir-creator/) for Claude Code. When active, Claude can:

- Generate pages using the correct attribute protocol
- Read manifests to understand component contracts
- Apply the CSS bundle pattern (single `<link>` tag)
- Follow the strict rules (no classes, tokens only, ARIA compliance)
- Use reactive directives (`l-data`, `l-model`, `l-for`, etc.)

The skill references are in `.claude/skills/faqir-creator/references/`:
- `primitives.md` — All 22 primitives with full HTML anatomy
- `recipes.md` — All 15 recipes with HTML, JS controller patterns
- `patterns.md` — All 6 composition patterns
- `tokens.md` — Complete design token reference
- `manifest.md` — Manifest JSON schema and examples
- `directives.md` — Reactive directives and global API

---

## CSS Conventions

Seven rules govern all component CSS in Faqir:

1. **Semantic CSS, not utility-first.** Button styling belongs in `button.css`, not scattered across utility classes.
2. **Attribute selectors only.** `[data-ui="button"]`, never `.btn`.
3. **Token references only.** `var(--color-primary)`, never `#4f46e5`.
4. **State via `data-state`, never classes.** `[data-state="open"]`, never `.is-open`.
5. **No `!important`.** Low specificity via single attribute selectors makes it unnecessary.
6. **No IDs as CSS selectors.** IDs exist for ARIA relationships only (`aria-labelledby`, `aria-controls`).
7. **Respect `prefers-reduced-motion`.** Every animation has a reduced-motion fallback.

### Component CSS Header Convention

```css
/* @ui:component button */
/* @ui:tokens color-primary, color-primary-hover, radius-md, space-4, duration-fast */

[data-ui="button"] {
  /* base styles */
}

[data-ui="button"][data-variant="primary"] {
  /* variant override */
}

[data-ui="button"][data-state="loading"] {
  /* state style */
}
```

---

## Project Structure

```
faqir-ui/
├── src/                      CLI source (TypeScript)
│   ├── index.ts              Entry point — command router
│   ├── manifest.ts           Manifest types and validation
│   ├── commands/             18 CLI commands
│   │   ├── init.ts           Project initialization
│   │   ├── add.ts            Component installation
│   │   ├── remove.ts         Component uninstallation
│   │   ├── create.ts         Custom component scaffolding
│   │   ├── bundle.ts         CSS bundle composition
│   │   ├── dev.ts            Development server
│   │   ├── list.ts           Component listing
│   │   ├── inspect.ts        Manifest viewer
│   │   ├── audit.ts          HTML validation
│   │   ├── repair.ts         Auto-fix engine
│   │   ├── doctor.ts         Health checker
│   │   ├── context.ts        AI context generator
│   │   ├── explain.ts        Component explainer
│   │   ├── trace.ts          Dependency tracer
│   │   ├── conform.ts        Markup normalizer
│   │   ├── theme.ts          Theme manager
│   │   ├── variant.ts        Variant editor
│   │   └── scaffold.ts       Page generator
│   ├── audit/                Audit subsystem
│   │   ├── rules.ts          12 audit rules
│   │   ├── checker.ts        DOM contract checker
│   │   ├── reporter.ts       Formatted output
│   │   └── repairer.ts       Auto-fix logic
│   ├── parser/               Code parsers
│   │   ├── html-parser.ts    Component instance extraction
│   │   ├── css-parser.ts     Token and selector extraction
│   │   └── js-parser.ts      Import and pattern detection
│   ├── generator/            Code generators
│   │   ├── context.ts        .faqir/context.json generator
│   │   ├── manifest.ts       Manifest aggregator
│   │   └── skill.ts          Claude Code skill generator
│   └── utils/                Shared utilities
│       ├── config.ts         faqir.config.json reader/writer
│       ├── fs.ts             File system helpers
│       ├── logger.ts         Colored terminal output
│       ├── components.ts     Component lookup and registry helpers
│       ├── codegen.ts        Shared code generators (faqir.js, context.json)
│       └── bundler.ts        CSS bundle generator
│
├── registry/                 Component library (shipped with CLI)
│   ├── tokens/               10 CSS token files (incl. document.css, doc-aliases.css)
│   ├── base/                 reset.css, prose.css
│   ├── core/                 faqir-core.js, api-source.js + utility modules
│   ├── themes/               5 built-in themes (incl. document.css)
│   ├── primitives/           30 CSS-only components
│   ├── recipes/              16 CSS+JS interactive components
│   └── patterns/             7 page-level compositions
│
├── tests/                    Bun test suite (462 tests)
├── playground/               6 example pages + dev server (server.js, db.json)
├── package.json
├── tsconfig.json
└── faqir.config.json          (generated per-project)
```

---

## Development

### Prerequisites

- [Bun](https://bun.sh) (runtime, package manager, test runner)

### Setup

```bash
git clone <repo-url>
cd faqir-ui
bun install
```

### Commands

```bash
bun test                         # Run all 462 tests
bun run src/index.ts help        # CLI help
bun run src/index.ts dev         # Start dev server for playground
tsc --noEmit                     # Type check
```

### Adding a New Primitive

1. Create `registry/primitives/{name}/` with `.html`, `.css`, `.manifest.json`
2. Follow the manifest schema in `src/manifest.ts`
3. Use attribute selectors and token references in CSS
4. Add tests in `tests/`

### Adding a New Recipe

Same as primitive, plus:
1. Add a `.js` controller with `export function create{Name}(root) { ... }`
2. Follow the controller conventions (double-init guard, data-state only, destroy API)
3. The controller is auto-registered in `faqir-core.js`

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Bun (TypeScript-first, ESM) |
| Testing | Bun test + Happy-DOM |
| Styling | Pure CSS with custom properties (oklch colors) |
| Reactivity | Custom proxy-based engine (faqir-core.js, ~3000 lines) |
| Dependencies | Zero at runtime. TypeScript + Happy-DOM for development |

---

## License

MIT
