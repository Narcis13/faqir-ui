# Loom UI

> A manifest-guided, zero-class UI framework. Built for AI agents to generate, inspect, and repair — and for humans to fully own.

**No classes. No build step. No runtime dependencies. Just data attributes, design tokens, and machine-readable manifests.**

---

## Why No Classes?

Traditional UI frameworks rely on class names for styling: `.btn`, `.btn-primary`, `.card-header`. This creates naming collisions, specificity wars, and markup that no machine can reliably parse.

Loom replaces all of it with a five-attribute protocol:

```html
<!-- Traditional -->
<button class="btn btn-primary btn-lg is-loading">Save</button>

<!-- Loom -->
<button data-ui="button" data-variant="primary" data-size="lg" data-state="loading">Save</button>
```

Every attribute has a single purpose. Every component is machine-readable. Every variant is auditable. The CSS targets data attributes — never classes.

---

## Table of Contents

- [Quick Start](#quick-start)
- [The Attribute Protocol](#the-attribute-protocol)
- [Layout Without Classes](#layout-without-classes)
- [Components](#components)
- [Design Token System](#design-token-system)
- [Theme System](#theme-system)
- [Loom Core — Reactive Directives](#loom-core--reactive-directives)
- [The Manifest System](#the-manifest-system)
- [JavaScript Controllers](#javascript-controllers)
- [CLI Reference](#cli-reference)
- [Audit and Repair](#audit-and-repair)
- [CSS Conventions](#css-conventions)
- [Project Structure](#project-structure)
- [Development](#development)
- [Tech Stack](#tech-stack)
- [License](#license)

---

## Quick Start

```bash
# Clone and install
git clone <repo-url>
cd loom-ui
bun install

# Initialize a new project
bun run src/index.ts init

# Add components
bun run src/index.ts add button input card dialog tabs stack grid surface

# Audit your markup
bun run src/index.ts audit

# Auto-fix issues
bun run src/index.ts repair
```

After `init`, your project contains:

```
ui/
├── tokens/       Design tokens (CSS custom properties)
├── base/         Reset and prose styles
├── core/         Reactive engine + recipe controllers
├── primitives/   CSS-only components
├── recipes/      CSS + JS interactive components
└── patterns/     Page-level compositions

loom.config.json  Project configuration
```

---

## The Attribute Protocol

Five data attributes form the stable DOM contract between HTML, CSS, JavaScript, and AI agents.

| Attribute | Purpose | Example |
|-----------|---------|---------|
| `data-ui` | Component identity | `data-ui="button"` |
| `data-part` | Slot role within parent | `data-part="trigger"` |
| `data-state` | Runtime state (JS-modified) | `data-state="open"` |
| `data-variant` | Visual variant (set once) | `data-variant="destructive"` |
| `data-size` | Size variant | `data-size="lg"` |

### Rules

1. `data-ui` goes on the root element of every component.
2. `data-part` identifies child slots within a parent component.
3. `data-state` is the **only** attribute JS controllers modify. CSS reacts to it.
4. `data-variant` and `data-size` are set in markup and rarely change.
5. Components **never** use class names. State lives in `data-state`. Identity lives in `data-ui`.
6. Standard HTML attributes (`role`, `aria-*`, `hidden`, `disabled`) work alongside data attributes.

### CSS Targeting

```css
[data-ui="button"] { }                                    /* base */
[data-ui="button"][data-variant="primary"] { }             /* variant */
[data-ui="button"][data-size="lg"] { }                     /* size */
[data-ui="dialog"][data-state="open"] [data-part="panel"] { }  /* state */
[data-ui="dialog"] [data-part="overlay"] { }               /* scoped part */
```

---

## Layout Without Classes

Three layout primitives replace CSS classes for page structure:

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

Options: `data-gap="0|1|2|3|4|6|8"`, `data-align="start|center|end|stretch"`, `data-variant="horizontal"`

### Grid — Column Layout

```html
<!-- Three-column grid -->
<div data-ui="grid" data-cols="3" data-gap="4">
  <div data-ui="card">...</div>
  <div data-ui="card">...</div>
  <div data-ui="card">...</div>
</div>
```

Options: `data-cols="1|2|3|4|6|12"`, `data-gap="2|4|6|8"`. Auto-stacks to 1 column on screens under 640px.

### Surface — Container

```html
<!-- Padded container with elevation -->
<div data-ui="surface" data-variant="raised" data-size="lg">
  Content with padding and shadow
</div>
```

Options: `data-variant="flat|raised|overlay"`, `data-size="sm|md|lg"`

### Composing Layouts

```html
<div data-ui="surface" data-size="lg" style="max-width: 1200px; margin: 0 auto">
  <div data-ui="stack" data-gap="8">

    <div data-ui="grid" data-cols="3" data-gap="4">
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

    <div data-ui="stack" data-variant="horizontal" data-gap="3" data-align="center">
      <button data-ui="button" data-variant="outline">Cancel</button>
      <button data-ui="button" data-variant="primary">Save</button>
    </div>

  </div>
</div>
```

No classes. Layout is expressed through component composition and data attributes.

---

## Components

### Primitives (CSS Only)

| Component | Description |
|-----------|-------------|
| `button` | 6 variants (primary, secondary, destructive, ghost, outline, link), 3 sizes |
| `input` | Text input with error/disabled states |
| `textarea` | Multi-line text input |
| `select` | Native select element |
| `checkbox` | Form checkbox |
| `radio` | Radio button |
| `switch` | Toggle switch |
| `label` | Form label |
| `card` | Container with header/body/footer slots |
| `badge` | Status label with color variants |
| `avatar` | Circular profile image with fallback |
| `separator` | Horizontal/vertical divider |
| `spinner` | Loading animation |
| `kbd` | Keyboard key display |
| `stack` | Flexbox layout (vertical/horizontal) |
| `grid` | CSS Grid layout (1–12 columns) |
| `surface` | Container with elevation and padding |

### Recipes (CSS + JS)

| Component | Description |
|-----------|-------------|
| `dialog` | Modal with focus trap, escape-to-close |
| `drawer` | Side panel overlay |
| `dropdown` | Menu with keyboard navigation |
| `popover` | Floating content panel |
| `tooltip` | Hover information |
| `tabs` | Tab panel switcher with keyboard arrows |
| `accordion` | Expandable sections |
| `combobox` | Searchable select |
| `select-custom` | Custom-styled select |
| `command-palette` | Keyboard command menu |
| `table` | Data table with sorting |
| `pagination` | Page navigation |
| `toast` | Notification messages |
| `sheet` | Full/partial overlay panel |
| `date-picker` | Calendar date selection |

### Patterns (Compositions)

| Pattern | Composes |
|---------|----------|
| `auth-form` | card, input, button, separator, label |
| `dashboard-shell` | card, grid, avatar, dropdown, button |
| `settings-page` | accordion, form primitives, cards |
| `crud-table` | table, button, dropdown |
| `empty-state` | button |
| `search-results` | grid, input, button |

---

## Design Token System

Loom uses CSS custom properties organized in three layers. Components reference only semantic tokens — never raw palette values.

### Layer 1: Palette (raw values, never used by components)

```css
--palette-indigo-500: oklch(0.55 0.22 264);
--palette-red-500:    oklch(0.55 0.22 27);
--palette-gray-200:   oklch(0.91 0.004 264);
```

### Layer 2: Semantic (what components reference)

```css
/* Surfaces */
--color-bg, --color-bg-subtle, --color-bg-muted
--color-fg, --color-fg-muted, --color-fg-subtle

/* Interactive */
--color-primary, --color-primary-hover, --color-primary-fg
--color-secondary, --color-destructive, --color-success, --color-warning

/* Borders */
--color-border, --color-border-strong, --color-ring
```

### Layer 3: Aliases (per-component overrides)

```css
--button-radius, --button-height-md
--card-shadow, --card-padding
--input-radius, --input-height
```

### Other Token Files

| File | Tokens |
|------|--------|
| `spacing.css` | `--space-0` through `--space-24` (4px base) |
| `typography.css` | `--font-sans`, `--font-mono`, `--text-xs` through `--text-4xl`, `--weight-*`, `--leading-*` |
| `effects.css` | `--radius-*`, `--shadow-*`, `--z-*` |
| `motion.css` | `--ease-*`, `--duration-*` |

---

## Theme System

Themes override Layer 2 semantic tokens. Four built-in themes:

| Theme | Description |
|-------|-------------|
| `default` | Clean modern with light/dark mode |
| `midnight` | Deep navy with cyan accents |
| `paper` | Warm cream, earthy browns |
| `brutalist` | Black and white, no shadows, no rounding |

```html
<!-- Dark mode -->
<html data-theme="dark">

<!-- Auto (follows system preference) -->
<html data-theme="auto">
```

```bash
bun run src/index.ts theme set midnight
bun run src/index.ts theme create my-theme
```

---

## Loom Core — Reactive Directives

`loom-core.js` is a zero-dependency reactive engine (~47KB min, ~12KB gzip). Drop it in with a single script tag — no build step needed.

```html
<script src="loom-core.js"></script>
```

### Directives

| Directive | Shorthand | Purpose |
|-----------|-----------|---------|
| `l-data` | — | Create reactive scope |
| `l-text` | — | Set text content reactively |
| `l-html` | — | Set inner HTML reactively |
| `l-bind:attr` | `:attr` | Bind attributes |
| `l-on:event` | `@event` | Event listeners (with modifiers: prevent, stop, once, debounce) |
| `l-model` | — | Two-way form binding (.number, .trim, .lazy, .debounce) |
| `l-show` | — | Toggle visibility with transitions |
| `l-if` | — | Conditional rendering (on `<template>`) |
| `l-for` | — | List rendering (on `<template>`) |
| `l-ref` | — | Element reference |
| `l-init` | — | Run code once on init |
| `l-effect` | — | Tracked side effect |
| `l-cloak` | — | Hide until initialized |

### Magic Properties

`$el`, `$refs`, `$store`, `$state`, `$variant`, `$ui`, `$dispatch`, `$nextTick`, `$watch`, `$id`

### Examples

```html
<!-- Counter -->
<div l-data="{ count: 0 }">
  <span l-text="count"></span>
  <button data-ui="button" @click="count++">+1</button>
</div>

<!-- Conditional list -->
<div l-data="{ items: ['Apple', 'Banana'], show: true }">
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
  Loom.store('app', { theme: 'light', user: 'Agent' });
</script>
<div l-data="{}">
  <span l-text="$store.app.user"></span>
</div>
```

---

## The Manifest System

Every component ships with a `.manifest.json` — a machine-readable contract driving audit, repair, AI context, and code generation.

```json
{
  "name": "button",
  "kind": "primitive",
  "anatomy": { "tag": "button", "selector": "[data-ui='button']" },
  "slots": {},
  "variants": {
    "variant": { "values": ["default","primary","destructive","ghost","outline","link"] },
    "size": { "values": ["sm","md","lg"] }
  },
  "a11y": { "keyboard": { "Enter": "Activate", "Space": "Activate" } },
  "tokens_used": ["color-primary","radius-md","space-4"],
  "safe_transforms": ["Change data-variant","Change data-size","Change text content"],
  "unsafe_transforms": ["Remove data-ui attribute"]
}
```

Manifests enable:
- **Audit** — validate HTML against the contract
- **Repair** — auto-fix missing slots, ARIA, and structure
- **Context** — generate AI-readable documentation
- **Explain** — produce human-readable descriptions
- **Trace** — show dependency graphs

---

## JavaScript Controllers

Every recipe has a JS controller with a `create{Name}` factory:

```js
import { createDialog } from "./ui/recipes/dialog/dialog.js";

const dialog = createDialog(document.querySelector('[data-ui="dialog"]'));
dialog.open();
dialog.close();
dialog.destroy();
```

Controller rules:
1. Prevent double-init via `root._loom{Name}`
2. Find parts via `[data-part="..."]` selectors
3. Express state through `data-state` only
4. Return an API object with `destroy()`
5. Import only from `core/` modules

### Auto-Initialization

Include `loom.js` and all recipe components work automatically:

```html
<script type="module" src="./ui/core/loom.js"></script>
```

Scans for `[data-ui]` elements, calls factories, and watches for dynamic additions via MutationObserver.

---

## CLI Reference

| Command | Description |
|---------|-------------|
| `init` | Initialize a new Loom project |
| `add <components>` | Add components (auto-resolves dependencies) |
| `list` | Show installed/available components |
| `inspect <name>` | Display component manifest |
| `audit` | Validate components against manifests |
| `repair` | Auto-fix audit issues |
| `context` | Generate AI context file |
| `explain <name>` | Human-readable component description |
| `trace <name>` | Show dependency graph |
| `conform` | Normalize component markup |
| `theme set\|list\|create` | Manage themes |
| `variant add\|remove` | Manage component variants |
| `scaffold <name>` | Generate page templates |
| `doctor` | Check project health |

---

## Audit and Repair

The audit system validates markup against manifests:

```bash
# Run audit
bun run src/index.ts audit

# Auto-repair
bun run src/index.ts repair
```

### Audit Rules

- `required-slot` — all required `[data-part]` slots exist
- `required-aria` — all required ARIA attributes present
- `variant-valid` — only manifest-approved variants used
- `state-valid` — state attributes match manifest
- `accessibility` — WCAG compliance checks
- Anti-pattern detection (class usage, inline color values, etc.)

---

## CSS Conventions

Seven rules for all component CSS:

1. **Semantic CSS, not utility-first.** Button styling belongs in `button.css`.
2. **Attribute selectors only.** `[data-ui="button"]`, never `.btn`.
3. **Token references only.** `var(--color-primary)`, never `#4f46e5`.
4. **State via `data-state`, never classes.** `[data-state="open"]`, never `.is-open`.
5. **No `!important`.** Low specificity via single attribute selectors.
6. **No IDs as CSS selectors.** IDs exist for ARIA relationships only.
7. **Respect `prefers-reduced-motion`.** Every animation has a reduced-motion fallback.

---

## Project Structure

```
loom-ui/
├── src/                  CLI source (TypeScript)
│   ├── index.ts          Entry point and command router
│   ├── commands/         One file per CLI command
│   ├── audit/            Checker, rules, reporter, repairer
│   ├── parser/           HTML, CSS, JS parsers
│   ├── generator/        Context and skill generation
│   ├── utils/            Config, filesystem, logger
│   └── manifest.ts       Schema and validation
├── registry/             Component library
│   ├── tokens/           Design token CSS files
│   ├── base/             Reset and prose styles
│   ├── core/             JS runtime modules
│   ├── themes/           Theme override files
│   ├── primitives/       CSS-only components
│   ├── recipes/          CSS + JS components
│   └── patterns/         Page compositions
├── tests/                Bun test suite
└── playground/           Example pages
```

---

## Development

### Prerequisites

- [Bun](https://bun.sh) (runtime and test runner)

### Setup

```bash
git clone <repo-url>
cd loom-ui
bun install
```

### Commands

```bash
bun test                    # Run all tests
bun run src/index.ts help   # CLI help
bun run --watch src/index.ts audit  # Watch mode
tsc --noEmit                # Type check
```

---

## Tech Stack

- **Runtime:** Bun (TypeScript-first, ESM)
- **Testing:** Bun test + Happy-DOM
- **Styling:** Pure CSS with custom properties
- **Reactivity:** Custom proxy-based engine (loom-core.js)
- **Dependencies:** Zero at runtime, TypeScript + Happy-DOM for dev

---

## License

MIT
