# Loom UI

> A zero-dependency, HTML-first UI framework built for AI agents to generate, inspect, and repair — and for humans to fully own.

**The CSS is the component. The JSON manifest is the documentation. The AI is the compiler. The CLI is the conductor. Audit and repair is the superpower.**

---

## Table of Contents

- [What is Loom?](#what-is-loom)
- [What Loom Is NOT](#what-loom-is-not)
- [Quick Start](#quick-start)
- [The Attribute Protocol](#the-attribute-protocol)
- [Components](#components)
  - [Primitives (CSS Only)](#primitives-css-only)
  - [Recipes (CSS + JS)](#recipes-css--js)
  - [Patterns (Compositions)](#patterns-compositions)
  - [Scaffolds (Generated Templates)](#scaffolds-generated-templates)
- [The Manifest System](#the-manifest-system)
- [Design Token System](#design-token-system)
- [Theme System](#theme-system)
- [CSS Conventions](#css-conventions)
- [JavaScript Controllers](#javascript-controllers)
  - [Controller Pattern](#controller-pattern)
  - [Core Modules](#core-modules)
  - [Auto-Initialization](#auto-initialization)
- [CLI Reference](#cli-reference)
- [Audit System](#audit-system)
  - [Audit Rules](#audit-rules)
  - [Anti-Pattern Detection](#anti-pattern-detection)
  - [Repair Engine](#repair-engine)
- [AI Context Generation](#ai-context-generation)
- [Project Structure](#project-structure)
- [Development](#development)
  - [Prerequisites](#prerequisites)
  - [Setup](#setup)
  - [Running Tests](#running-tests)
  - [Running the CLI Locally](#running-the-cli-locally)
  - [Type Checking](#type-checking)
- [Adding Components](#adding-components)
  - [Adding a Primitive](#adding-a-primitive)
  - [Adding a Recipe](#adding-a-recipe)
  - [Adding a Pattern](#adding-a-pattern)
- [Anti-Patterns](#anti-patterns)
- [Tech Stack](#tech-stack)
- [License](#license)

---

## What is Loom?

Loom is a CLI-distributed UI framework that generates and maintains plain HTML, CSS, and JavaScript components using machine-readable manifests. AI coding agents are the primary consumer. Humans are the editor-reviewers.

Every component ships with a JSON manifest that describes its structure, slots, variants, states, accessibility requirements, and safe transformations. The CLI uses these manifests to audit your markup, auto-repair issues, generate AI context files, and explain components in human-readable form.

- **No virtual DOM, no reactivity system, no JSX**
- **No webpack, no Vite, no compile step**
- **No node_modules dependency at runtime**
- **Zero external dependencies in output**

## What Loom Is NOT

- Not a JavaScript framework (no virtual DOM, no reactivity system, no JSX)
- Not a build tool (no webpack, no Vite, no compile step)
- Not a utility-first CSS library (not Tailwind)
- Not a package you import at runtime (no node_modules dependency)
- Not a design system for humans to browse — it is a design system for agents to parse

---

## Quick Start

> **Note:** This package is not yet published to npm. All commands are run locally via Bun from the project root.

```bash
# Clone and install
git clone <repo-url>
cd loom-ui
bun install

# Initialize a new project
bun run src/index.ts init

# Add components (auto-resolves dependencies)
bun run src/index.ts add button input card dialog tabs

# Check everything is wired correctly
bun run src/index.ts audit

# Auto-fix audit issues
bun run src/index.ts repair

# Generate AI context file
bun run src/index.ts context
```

> Once published, these commands will be available as `npx @loom-ui/cli <command>` or simply `loom <command>` if installed globally.

After running `init`, your project directory will contain:

```
ui/
├── tokens/          Design tokens (CSS custom properties)
├── base/            Reset and prose styles
├── core/            JS utility modules + auto-init script
├── primitives/      CSS-only components
├── recipes/         CSS + JS interactive components
└── patterns/        Composition templates

loom.config.json     Project configuration
.loom/
├── context.json     AI context file
└── SKILL.md         Claude Code skill file (optional)
```

---

## The Attribute Protocol

All Loom components use a standardized set of five data attributes. This is the DOM contract — the stable API between HTML and everything else.

### The Five Attributes

| Attribute | Purpose | Example |
|-----------|---------|---------|
| `data-ui` | Component identity — what this element IS | `data-ui="dialog"` |
| `data-part` | Slot role within a parent component | `data-part="trigger"` |
| `data-state` | Runtime state (dynamic, changed by JS) | `data-state="open"` |
| `data-variant` | Visual variant (set once, rarely changes) | `data-variant="destructive"` |
| `data-size` | Size variant (separated from visual) | `data-size="lg"` |

### Rules

1. `data-ui` is always on the root element of a component.
2. `data-part` is on child elements that fill named slots.
3. `data-state` is the **ONLY** attribute that JS controllers should modify for state changes. CSS targets state via `[data-state="open"]`.
4. `data-variant` and `data-size` are set in markup and rarely change dynamically.
5. Components **never** use class names for state. State lives in `data-state`. Visual identity lives in `data-variant`.
6. Standard HTML attributes (`role`, `aria-*`, `hidden`, `disabled`) are used alongside data attributes, never replaced by them.

### CSS Targeting Convention

```css
/* Base component */
[data-ui="button"] { }

/* Variant */
[data-ui="button"][data-variant="primary"] { }

/* Size */
[data-ui="button"][data-size="lg"] { }

/* State */
[data-ui="dialog"][data-state="open"] [data-part="panel"] { }

/* Part styling scoped to parent */
[data-ui="dialog"] [data-part="overlay"] { }
```

### Machine Comments

Component files can include machine-readable comments for fast scanning without parsing full manifests:

```html
<!-- @ui:component dialog -->
<!-- @ui:kind recipe -->
<!-- @ui:slots trigger overlay panel header title body footer close -->
<!-- @ui:variants size=sm|md|lg|full tone=default|danger -->
<!-- @ui:controller ui/recipes/dialog/dialog.js -->
```

```css
/* @ui:component button */
/* @ui:tokens color-primary color-primary-hover radius-md */
```

### Example: Button

```html
<button data-ui="button" data-variant="primary" data-size="md">
  Save Changes
</button>
```

### Example: Dialog

```html
<div data-ui="dialog" data-state="closed" id="confirm-dialog">
  <button data-part="trigger">Delete Account</button>
  <div data-part="overlay" hidden></div>
  <div data-part="panel" role="dialog" aria-modal="true"
       aria-labelledby="confirm-dialog-title" data-size="sm" hidden>
    <div data-part="header">
      <h2 id="confirm-dialog-title" data-part="title">Are you sure?</h2>
      <button data-part="close" aria-label="Close dialog">&#x2715;</button>
    </div>
    <div data-part="body">
      <p>This action cannot be undone.</p>
    </div>
    <div data-part="footer">
      <button data-ui="button" data-variant="outline">Cancel</button>
      <button data-ui="button" data-variant="destructive">Delete</button>
    </div>
  </div>
</div>
```

### Example: Tabs

```html
<div data-ui="tabs" data-variant="underline">
  <div data-part="list" role="tablist">
    <button data-part="trigger" role="tab" aria-selected="true">General</button>
    <button data-part="trigger" role="tab" aria-selected="false" tabindex="-1">Security</button>
  </div>
  <div data-part="panel" role="tabpanel">General settings content</div>
  <div data-part="panel" role="tabpanel" hidden>Security settings content</div>
</div>
```

---

## Components

Components are organized into four layers, from simple to complex.

### Primitives (CSS Only)

CSS-only components with no JavaScript. Each has three files: `{name}.html`, `{name}.css`, `{name}.manifest.json`.

| Component | Category | Description |
|-----------|----------|-------------|
| `button` | actions | Interactive button with 6 variants (primary, secondary, destructive, ghost, outline, link) and 3 sizes |
| `input` | forms | Text input with error/disabled states and 3 sizes |
| `textarea` | forms | Multi-line text input |
| `select` | forms | Native HTML select element |
| `checkbox` | forms | Form checkbox input |
| `radio` | forms | Radio button input |
| `switch` | forms | Toggle switch input |
| `label` | forms | Form label element |
| `card` | layout | Container with header/body/footer slots, 3 variants (default, outlined, filled) |
| `badge` | data-display | Small label with color variants |
| `avatar` | data-display | User profile image with circular frame |
| `separator` | layout | Horizontal divider |
| `spinner` | feedback | Loading indicator animation |
| `kbd` | typography | Keyboard key representation |
| `stack` | layout | Flexbox container (vertical/horizontal, configurable gap and alignment) |
| `grid` | layout | CSS Grid layout (1-12 columns, configurable gap) |
| `surface` | layout | Basic surface/background container |

### Recipes (CSS + JS)

Interactive components with JavaScript controllers. Each has four files: `{name}.html`, `{name}.css`, `{name}.js`, `{name}.manifest.json`.

| Component | Category | Description |
|-----------|----------|-------------|
| `dialog` | overlay | Modal with focus trap, escape-to-close, overlay click dismiss |
| `drawer` | overlay | Side panel overlay |
| `dropdown` | overlay | Menu with keyboard navigation (`role="menu"`) |
| `popover` | overlay | Floating content panel |
| `tooltip` | overlay | Hover information popover |
| `tabs` | navigation | Tab panel switcher with keyboard arrow navigation |
| `accordion` | navigation | Expandable section panels (single/multiple expand modes) |
| `combobox` | forms | Searchable select dropdown |
| `select-custom` | forms | Custom-styled select (non-native) |
| `command-palette` | navigation | Keyboard-accessible command menu |
| `table` | data-display | Data table with sorting and filtering |
| `pagination` | navigation | Page navigation controls |
| `toast` | feedback | Notification messages |
| `sheet` | overlay | Full-screen or partial overlay panel |
| `date-picker` | forms | Calendar date selection |

### Patterns (Compositions)

Pre-built page-level compositions that combine primitives and recipes. Each has: `{name}.html`, optional `{name}.css`, `{name}.manifest.json`.

| Pattern | Description | Composes |
|---------|-------------|----------|
| `auth-form` | Login/register/forgot-password form with social auth | card, input, button, separator, label |
| `dashboard-shell` | App layout with sidebar, header, content, footer | card, grid, avatar, dropdown, button, separator, badge |
| `settings-page` | Settings/configuration with sections and controls | accordion, form primitives, cards |
| `crud-table` | Data table with row actions, selection, pagination | table, button, dropdown |
| `empty-state` | Placeholder for empty content sections | button |
| `search-results` | Search results page with filters and grid | grid, input, button |

### Scaffolds (Generated Templates)

Scaffolds are not static files — they are dynamically generated by the `scaffold` command. Missing components are auto-installed.

| Scaffold | Description |
|----------|-------------|
| `landing-page` | Hero, features, and CTA sections |
| `admin-dashboard` | Sidebar, tables, and stats |
| `internal-tool` | Settings with tabs and forms |

---

## The Manifest System

Every component ships with a `.manifest.json` file — a machine-readable contract that drives the entire framework. The manifest is the source of truth for audit rules, repair actions, AI context generation, component explanation, and dependency resolution.

### Manifest Schema

```json
{
  "name": "component-name",
  "version": "1.0.0",
  "kind": "primitive | recipe | pattern | scaffold",
  "category": "actions | forms | layout | navigation | data-display | feedback | overlay | typography | composite",
  "description": "One-line description",

  "anatomy": {
    "tag": "div",
    "selector": "[data-ui='component-name']",
    "content_model": "inline | block | slots | text"
  },

  "slots": {
    "trigger": {
      "selector": "[data-part='trigger']",
      "required": true,
      "tag_hint": "button",
      "description": "Element that opens the component"
    }
  },

  "variants": {
    "variant": {
      "values": ["default", "primary", "destructive"],
      "default": "default",
      "attr": "data-variant",
      "applied_to": "root"
    },
    "size": {
      "values": ["sm", "md", "lg"],
      "default": "md",
      "attr": "data-size"
    }
  },

  "states": {
    "open": {
      "attr": "data-state",
      "default": false,
      "transient": false
    },
    "closing": {
      "attr": "data-state",
      "default": false,
      "transient": true
    }
  },

  "a11y": {
    "role": "dialog",
    "aria-modal": true,
    "required_attrs": ["aria-labelledby"],
    "focus_trap": true,
    "escape_closes": true,
    "return_focus": "trigger",
    "keyboard": {
      "Escape": "Close dialog",
      "Tab": "Move focus within trap"
    }
  },

  "tokens_used": ["color-primary", "radius-md", "shadow-lg"],

  "templates": {
    "html": "<button data-ui=\"button\" data-variant=\"{variant}\" data-size=\"{size}\">{label}</button>"
  },

  "safe_transforms": [
    "Change data-variant value to any listed variant",
    "Change data-size value to any listed size",
    "Add or remove text content"
  ],
  "unsafe_transforms": [
    "Remove data-ui attribute",
    "Remove required slots",
    "Remove ARIA attributes"
  ],

  "composition": {
    "contains": ["button"],
    "used_in": ["auth-form", "dashboard-shell"]
  },

  "files": {
    "html": "dialog.html",
    "css": "dialog.css",
    "js": "dialog.js",
    "manifest": "dialog.manifest.json"
  },

  "tests": [
    "Opens on trigger click",
    "Closes on Escape key",
    "Traps focus within panel"
  ]
}
```

### Key Manifest Fields

| Field | Purpose |
|-------|---------|
| `anatomy` | Root element tag, CSS selector, content model |
| `slots` | Named insertion points with required flags and tag hints |
| `variants` | Valid variant values per attribute, with defaults |
| `states` | Component states with data-state mappings (transient flag for animations) |
| `a11y` | ARIA requirements, keyboard shortcuts, focus management |
| `tokens_used` | CSS custom properties referenced by the component |
| `templates` | HTML templates with `{placeholder}` syntax for agent generation |
| `safe_transforms` | Operations AI agents can safely perform |
| `unsafe_transforms` | Operations that would break the component contract |
| `composition` | Dependency graph — what this component contains/is used in |

---

## Design Token System

Loom uses a three-layer CSS Custom Property system. Components reference only Layer 2 (semantic) and Layer 3 (aliases) — never Layer 1 (palette) directly.

### Layer 1: Raw Palette (`palette.css`)

Base color values in OKLCH color space. Never referenced directly by components.

```css
--palette-indigo-50:  oklch(0.96 0.03 264);
--palette-indigo-500: oklch(0.55 0.22 264);
--palette-indigo-950: oklch(0.20 0.08 264);
```

Six color families with 11 shades each: indigo, red, green, amber, gray, blue.

### Layer 2: Semantic Tokens (`semantic.css`)

Purpose-driven tokens that components use. These are what themes override.

```css
/* Surfaces */
--color-bg:          var(--palette-gray-50);
--color-bg-subtle:   var(--palette-gray-100);
--color-bg-muted:    var(--palette-gray-200);
--color-fg:          var(--palette-gray-900);
--color-fg-muted:    var(--palette-gray-600);
--color-fg-subtle:   var(--palette-gray-500);

/* Interactive */
--color-primary:        var(--palette-indigo-500);
--color-primary-hover:  var(--palette-indigo-600);
--color-primary-active: var(--palette-indigo-700);
--color-primary-fg:     white;

/* Feedback */
--color-success:     var(--palette-green-500);
--color-warning:     var(--palette-amber-500);
--color-destructive: var(--palette-red-500);
--color-info:        var(--palette-blue-500);

/* Borders */
--color-border:        var(--palette-gray-200);
--color-border-strong: var(--palette-gray-300);
--color-ring:          var(--palette-indigo-500);
```

### Layer 3: Component Aliases (`aliases.css`)

Optional per-component overrides that map to semantic tokens.

```css
--button-radius:    var(--radius-md);
--button-height-sm: 2rem;
--button-height-md: 2.5rem;
--card-shadow:      var(--shadow-sm);
--card-padding:     var(--space-6);
--input-height:     var(--space-10);
--dialog-overlay-bg: oklch(0 0 0 / 0.5);
```

### Additional Token Files

| File | Contents |
|------|----------|
| `spacing.css` | 4px base scale with 23 values (`--space-0` through `--space-24`), includes half-steps |
| `typography.css` | Font families (sans, mono, serif), sizes (`--text-xs` through `--text-4xl`), line heights, weights |
| `effects.css` | Border radii (`--radius-none` through `--radius-full`), shadows (`--shadow-xs` through `--shadow-xl`), z-index layers |
| `motion.css` | Easing functions (default, in, out, in-out, bounce), durations (50ms–500ms) |
| `index.css` | Aggregator that imports all token files in the correct order |

---

## Theme System

Themes work by overriding Layer 2 semantic tokens. Layer 1 palette values stay constant across all themes, making themes truly composable.

### Built-In Themes

| Theme | Description |
|-------|-------------|
| `default` | Clean, modern light/dark with neutral gray tones |
| `midnight` | Deep navy with vibrant cyan/blue-violet accents |
| `paper` | Warm cream tones, earthy brown accents, print-inspired |
| `brutalist` | Pure black and white, no shadows, no rounding, maximum contrast |

### Switching Themes

```bash
# Set active theme
bun run src/index.ts theme set midnight

# List available themes
bun run src/index.ts theme list

# Create a custom theme (scaffolds a template with all tokens as comments)
bun run src/index.ts theme create my-theme
```

### Dark Mode

Dark mode activates via `data-theme="dark"` on `<html>`. Only semantic tokens are overridden — the palette stays the same.

```html
<html data-theme="dark">
```

The `default` theme also supports `data-theme="auto"` which respects the user's system preference via `@media (prefers-color-scheme: dark)`.

### Creating Custom Themes

Custom themes are CSS files that override semantic tokens:

```css
:root,
[data-theme="my-theme"] {
  --color-bg: oklch(0.98 0.01 80);
  --color-primary: oklch(0.55 0.20 150);
  /* Override any semantic token... */
}

[data-theme="dark"] {
  --color-bg: oklch(0.15 0.01 80);
  /* Dark mode overrides... */
}
```

---

## CSS Conventions

Seven rules govern all component CSS:

1. **Semantic CSS, not utility-first.** Button styling belongs in `button.css`, not scattered across utility classes.

2. **Attribute selectors only.** Use `[data-ui="button"]`, never `.btn`. Use `[data-part="trigger"]`, never `.trigger`.

3. **Token references only.** Use `var(--color-primary)`, never `#4f46e5`. No hardcoded colors, spacing, or shadow values.

4. **State via `data-state`, never classes.** Use `[data-state="open"]`, never `.is-open` or `.active`.

5. **No `!important`.** Keep specificity low with single attribute selectors.

6. **No IDs as CSS selectors.** IDs exist only for ARIA relationships (`aria-labelledby`, `aria-describedby`).

7. **Every animated component includes `prefers-reduced-motion`.** All transitions and animations must have a `@media (prefers-reduced-motion: reduce)` block.

```css
/* Correct */
[data-ui="button"] {
  padding: var(--space-2) var(--space-4);
  border-radius: var(--button-radius);
  background: var(--color-primary);
  transition: background var(--duration-fast) var(--ease-default);
}

[data-ui="button"][data-variant="destructive"] {
  background: var(--color-destructive);
}

@media (prefers-reduced-motion: reduce) {
  [data-ui="button"] {
    transition: none;
  }
}
```

---

## JavaScript Controllers

### Controller Pattern

Every recipe component has a JS controller module that exports a single `create{Name}` factory function:

```js
import { createDialog } from "./ui/recipes/dialog/dialog.js";

const dialog = createDialog(document.querySelector('[data-ui="dialog"]'));
dialog.open();
dialog.close();
dialog.toggle();
dialog.destroy();
```

#### Controller Rules

1. **Prevent double-init.** Every controller checks `root._loom{Name}` and returns the existing instance if already initialized.

2. **Find parts via attribute selectors.** Use `root.querySelector('[data-part="trigger"]')`, scoped to the root element.

3. **Express state through `data-state`.** Controllers set `root.dataset.state = "open"` — CSS handles the visual changes.

4. **Return an API object with `destroy()`.** Every controller returns public methods for programmatic control and a `destroy()` function that removes all event listeners.

5. **Be idempotent.** Calling the factory twice on the same element is safe and returns the same instance.

6. **Import only from core modules.** Controllers may import from `../../core/` modules. No external dependencies.

### Core Modules

Six utility modules ship in `registry/core/` (under 3KB total):

| Module | Exports | Description |
|--------|---------|-------------|
| `dom.js` | `$`, `$$`, `closest`, `create` | DOM query helpers and element factory |
| `events.js` | `delegate`, `once`, `onOutsideClick` | Event delegation with cleanup functions |
| `focus.js` | `getFocusableElements`, `focusFirst`, `trapFocus`, `releaseFocus` | Focus management and trapping |
| `motion.js` | `prefersReducedMotion`, `waitForTransition`, `animate` | Animation-aware utilities that respect reduced motion |
| `store.js` | `createStore` | Tiny observable store with `get`, `set`, `subscribe` |
| `utils.js` | `uid`, `clamp`, `debounce`, `throttle` | General utility functions |

### Auto-Initialization

The `loom.js` script auto-initializes all recipe components:

```html
<script type="module" src="./ui/core/loom.js"></script>
```

**Behavior:**

1. On `DOMContentLoaded`, scans the page for all `[data-ui="..."]` elements matching installed recipes.
2. Calls the appropriate `create{Name}(element)` factory for each.
3. Sets up a `MutationObserver` that watches for dynamically added components and initializes them automatically.

This means recipe components work out of the box — just include the script and write the HTML.

---

## CLI Reference

> All commands below use `bun run src/index.ts` since the package is not yet published. After publishing, substitute with `npx @loom-ui/cli` or `loom` (if installed globally).

### `init`

Initialize a new Loom project.

```bash
bun run src/index.ts init [--theme <name>] [--tokens-split] [--no-core] [--dir <path>]
```

| Option | Description |
|--------|-------------|
| `--theme <name>` | Apply a theme from registry (default, midnight, paper, brutalist) |
| `--tokens-split` | Keep token files separate instead of combining into one index.css |
| `--no-core` | Skip copying core JS modules |
| `--dir <path>` | Output directory (default: `./ui`) |

**Actions:**
- Creates directory structure: `tokens/`, `base/`, `primitives/`, `recipes/`, `patterns/`, `core/`
- Copies design tokens (split or combined)
- Copies base styles (`reset.css`, `prose.css`)
- Copies core JS modules (unless `--no-core`)
- Applies theme if specified
- Creates `loom.config.json`
- Creates `.loom/context.json` placeholder
- Adds `.loom/` to `.gitignore`

### `add`

Add components to your project. Dependencies are resolved automatically.

```bash
bun run src/index.ts add <components...> [--all] [--layer <name>] [--dry-run] [--no-deps]
```

| Option | Description |
|--------|-------------|
| `--all` | Add all available components |
| `--layer <name>` | Filter by layer: `primitives`, `recipes`, or `patterns` |
| `--dry-run` | Show what would be added without writing files |
| `--no-deps` | Skip automatic dependency resolution |

**Actions:**
- Copies component files to the appropriate layer directory
- Resolves and installs dependencies (via `composition.contains` in manifests)
- Regenerates `core/loom.js` auto-init script for recipes
- Updates `.loom/context.json`
- Updates `loom.config.json` installed lists

### `list`

Show available and installed components grouped by layer.

```bash
bun run src/index.ts list
```

Displays components with visual markers: `✓` (installed), `·` (available).

### `inspect`

View the full manifest for a component.

```bash
bun run src/index.ts inspect <component> [--json]
```

| Option | Description |
|--------|-------------|
| `--json` | Output raw JSON manifest |

Shows anatomy, slots, variants, states, accessibility requirements, templates, files, and tokens.

### `explain`

Human-and-agent-readable component explanation.

```bash
bun run src/index.ts explain <component> [--json]
```

Shows:
- Purpose and description
- Anatomy tree with slots
- States and variants with valid values
- Keyboard shortcuts
- Accessibility requirements
- Safe transforms (what agents can modify) vs unsafe transforms (what breaks contracts)
- File paths

### `trace`

Show full dependency and file trace for a component.

```bash
bun run src/index.ts trace <component> [--json]
```

Reports:
- Component files (HTML, CSS, JS, manifest)
- CSS selectors used
- Token references (declared vs. actual in CSS)
- Dependencies (what this component uses)
- Dependents (what uses this component)
- Controller and auto-init references
- Associated test files

### `audit`

Validate all components against their manifests.

```bash
bun run src/index.ts audit [--json] [--file <path>] [--fix]
```

| Option | Description |
|--------|-------------|
| `--json` | Output results as JSON |
| `--file <path>` | Audit a specific file only |
| `--fix` | Auto-fix issues (redirects to `repair`) |

Exit code 1 if any CRITICAL or ERROR issues are found.

### `repair`

Auto-fix audit issues.

```bash
bun run src/index.ts repair
```

Runs audit, applies fixable repairs, re-runs audit to verify, and reports results. See [Repair Engine](#repair-engine) for details on what can and cannot be fixed.

### `context`

Generate AI context files for agents.

```bash
bun run src/index.ts context [--format json|md|cursorrules] [--skill] [--stdout]
```

| Option | Description |
|--------|-------------|
| `--format json` | Output `.loom/context.json` (default) |
| `--format md` | Output `.loom/context.md` (Markdown for LLM prompts) |
| `--format cursorrules` | Output `.cursorrules` (Cursor IDE format) |
| `--skill` | Generate `.loom/SKILL.md` (Claude Code skill file) |
| `--stdout` | Print to terminal instead of writing files |

### `conform`

Normalize all component markup to canonical structure.

```bash
bun run src/index.ts conform [--dry-run]
```

**Transformations:**
- Reorders attributes to canonical order: `data-ui`, `data-part`, `data-state`, `data-variant`, `data-size`, `role`, `aria-*`, `id`, `class`, `tabindex`, `hidden`, ...
- Ensures machine comments are present at the top of component files
- Normalizes whitespace and indentation
- Idempotent — running twice produces the same output

### `theme`

Manage themes.

```bash
bun run src/index.ts theme set <name>       # Switch active theme
bun run src/index.ts theme create <name>    # Scaffold a custom theme with all tokens as comments
bun run src/index.ts theme list             # List available and active themes
```

### `variant`

Add or remove variant values for a component.

```bash
bun run src/index.ts variant add <component> <variant>=<value>
bun run src/index.ts variant remove <component> <variant>=<value>
```

Updates the manifest, adds a CSS stub for the new variant, and regenerates context.

### `scaffold`

Generate full page templates.

```bash
bun run src/index.ts scaffold <name> [--output <path>] [--no-add]
```

| Option | Description |
|--------|-------------|
| `--output <path>` | Output file path |
| `--no-add` | Do not auto-install missing components |

Available scaffolds: `landing-page`, `admin-dashboard`, `internal-tool`.

### `doctor`

Check project health.

```bash
bun run src/index.ts doctor
```

Checks:
- `loom.config.json` exists and is valid
- Output directory exists
- Token files present
- Base styles (`reset.css`, `prose.css`) present
- Theme file present
- Core modules present (if configured)
- All installed components have their files on disk
- All manifest files pass schema validation
- `.loom/context.json` exists

---

## Audit System

The audit system validates your HTML against component manifests, checks CSS for anti-patterns, and validates token usage.

### Running an Audit

```bash
bun run src/index.ts audit
```

```
AUDIT RESULTS — 3 issues found

CRITICAL  dialog#confirm  Missing required slot: close
ERROR     dialog#confirm  Invalid variant value: data-size="xl" (valid: sm, md, lg, full)
WARNING   dialog#confirm  Panel has description slot but missing aria-describedby

Run `bun run src/index.ts repair` to auto-fix 2 of 3 issues.
```

### Audit Rules

| Rule ID | Severity | Check |
|---------|----------|-------|
| `required-slot` | CRITICAL | All slots marked `required: true` in the manifest exist in the DOM |
| `required-aria` | CRITICAL | All ARIA attributes from the manifest are present |
| `focus-trap` | CRITICAL | Recipe with `focus_trap: true` has a JS controller loaded |
| `valid-variant` | ERROR | `data-variant` value exists in the manifest's valid values |
| `valid-state` | ERROR | `data-state` value exists in the manifest's valid states |
| `valid-size` | ERROR | `data-size` value exists in the manifest's valid sizes |
| `controller-loaded` | ERROR | Recipe component has its JS controller script referenced |
| `orphan-part` | WARNING | `data-part` value is a recognized slot name in the manifest |
| `aria-describedby` | WARNING | If a description slot exists, the panel has `aria-describedby` |
| `close-label` | WARNING | Close buttons have `aria-label` |

### Anti-Pattern Detection

The audit also checks CSS and JS files for violations:

| Rule ID | Target | Detects |
|---------|--------|---------|
| `token-exists` | CSS | References to undefined CSS custom properties |
| `reduced-motion` | CSS | Animations/transitions without `@media (prefers-reduced-motion: reduce)` |
| `no-important` | CSS | Use of `!important` |
| `no-class-selector` | CSS | Class selectors (`.btn`) instead of attribute selectors |
| `no-id-selector` | CSS | ID selectors (`#modal`) in component CSS |
| `no-hardcoded-values` | CSS | Hardcoded colors (hex, rgb, hsl, oklch) instead of token references |
| `no-external-import` | JS | Imports from outside the project (external dependencies) |
| `no-fetch` | JS | Data fetching (`fetch()`, `XMLHttpRequest`, `axios`) in recipe controllers |

### Repair Engine

The repair engine auto-fixes issues by applying string-based patches (not DOM manipulation) in reverse document order to preserve byte offsets.

**Can fix:**
- Missing ARIA attributes (adds them)
- Missing controller script tags (adds `<script>` elements)
- Some missing attributes on elements

**Cannot fix:**
- Missing text content
- Wrong HTML elements (e.g., `<div>` where `<button>` is needed)
- Logic errors in JS controllers
- Missing entire required slots
- Structural problems in component nesting

```bash
bun run src/index.ts repair
```

The repairer is idempotent — running it multiple times produces the same result.

---

## AI Context Generation

The `context` command generates compact files that give AI agents everything they need to generate correct Loom markup.

### Context File Structure (`.loom/context.json`)

Target size: Under 3000 tokens for a 30-component installation.

```json
{
  "meta": {
    "framework": "loom",
    "version": "0.1.0",
    "theme": "default",
    "generated_at": "2026-03-13T...",
    "component_count": 30
  },
  "protocol": {
    "identity": "data-ui",
    "part": "data-part",
    "state": "data-state",
    "variant": "data-variant",
    "size": "data-size",
    "css_target": "[data-ui=\"name\"]",
    "theme_attr": "data-theme"
  },
  "tokens": { "..." },
  "components": {
    "dialog": {
      "kind": "recipe",
      "variants": { "..." },
      "sizes": ["sm", "md", "lg", "full"],
      "slots": { "..." },
      "states": { "..." },
      "template": "<div data-ui=\"dialog\" ...>",
      "safe_transforms": ["..."],
      "controller": "recipes/dialog/dialog.js",
      "a11y": { "..." }
    }
  },
  "patterns": { "..." },
  "rules": { "..." }
}
```

### Output Formats

| Format | File | Usage |
|--------|------|-------|
| JSON | `.loom/context.json` | Structured data for programmatic agent consumption |
| Markdown | `.loom/context.md` | Paste into LLM prompts for Claude, GPT, etc. |
| CursorRules | `.cursorrules` | Cursor IDE auto-context |
| Skill | `.loom/SKILL.md` | Claude Code skill file with quick rules and commands |

---

## Project Structure

```
loom-ui/
├── src/                          CLI source code (TypeScript)
│   ├── index.ts                  CLI entry point and command dispatcher
│   ├── manifest.ts               Manifest types and validation
│   ├── commands/
│   │   ├── init.ts               Project initialization
│   │   ├── add.ts                Component installation with dependency resolution
│   │   ├── list.ts               Component listing
│   │   ├── inspect.ts            Manifest viewer
│   │   ├── explain.ts            Human-readable component explanation
│   │   ├── trace.ts              Dependency and file tracing
│   │   ├── audit.ts              Component validation
│   │   ├── repair.ts             Auto-fix engine
│   │   ├── context.ts            AI context file generation
│   │   ├── theme.ts              Theme management
│   │   ├── conform.ts            Markup normalization
│   │   ├── variant.ts            Variant management
│   │   ├── scaffold.ts           Page template generation
│   │   └── doctor.ts             Project health checks
│   ├── audit/
│   │   ├── rules.ts              Audit rule definitions (10 rules + anti-patterns)
│   │   ├── checker.ts            Audit orchestrator
│   │   ├── reporter.ts           Terminal and JSON output formatting
│   │   └── repairer.ts           String-based auto-fix engine
│   ├── parser/
│   │   ├── html-parser.ts        Lightweight HTML parser for component extraction
│   │   ├── css-parser.ts         Token extraction and CSS anti-pattern detection
│   │   └── js-parser.ts          JS anti-pattern detection (external imports, data fetching)
│   ├── generator/
│   │   ├── context.ts            Context JSON/MD/CursorRules generator
│   │   ├── manifest.ts           Manifest aggregator
│   │   └── skill.ts              Claude Code skill file generator
│   └── utils/
│       ├── fs.ts                 File system helpers (ensureDir, copyFile, copyDir)
│       ├── logger.ts             Colored terminal output (info, success, warn, error, table)
│       └── config.ts             loom.config.json reader/writer
│
├── registry/                     Component registry (shipped with CLI)
│   ├── tokens/                   Design token CSS files (8 files)
│   ├── base/                     Reset and prose styles
│   ├── core/                     JS utility modules (7 files including loom.js)
│   ├── primitives/               CSS-only components (17 components)
│   ├── recipes/                  CSS + JS interactive components (15 components)
│   ├── patterns/                 Composition templates (6 patterns)
│   └── themes/                   Theme CSS overrides (4 themes)
│
├── tests/                        Test files (27 files, ~250+ test cases)
│   ├── setup.ts                  Test environment setup (happy-dom registration)
│   ├── core/                     Core module unit tests
│   ├── commands/                 CLI command integration tests
│   ├── audit/                    Audit rule and repairer tests
│   ├── parser/                   Parser unit tests
│   ├── recipes/                  Recipe controller tests (dialog, tabs, dropdown)
│   ├── manifest.test.ts          Manifest schema validation tests
│   ├── tokens.test.ts            Token file integrity tests
│   └── fixtures/                 HTML test fixtures (8 files)
│
├── playground/
│   └── index.html                Full component gallery with theme switcher
│
├── package.json                  npm package config
├── tsconfig.json                 TypeScript strict mode config
├── bunfig.toml                   Bun test preload config
├── loom.config.json              Project configuration (generated by init)
├── LOOM-SPEC.md                  Complete specification document
├── CONTRIBUTING.md               Contributor guide
└── README.md                     This file
```

---

## Development

### Prerequisites

- [Bun](https://bun.sh) v1.0+
- Git

### Setup

```bash
git clone <repo-url>
cd loom-ui
bun install
```

### Running Tests

```bash
# Run all tests
bun test

# Run a specific test file
bun test tests/commands/audit.test.ts

# Run tests matching a pattern
bun test --filter "dialog"
```

The test suite uses Bun's built-in test runner with [happy-dom](https://github.com/nicedaycode/happy-dom) for DOM testing. Tests are organized to mirror the `src/` structure:

| Test Category | Files | Type |
|---------------|-------|------|
| Core modules | 6 | Unit tests with happy-dom DOM API |
| CLI commands | 11 | Integration tests with real filesystem |
| Parsers | 2 | Unit tests with input/output validation |
| Audit rules | 3 | Rule-by-rule testing with manifest fixtures |
| Recipes | 3 | DOM interaction tests with event simulation |
| Static assets | 2 | File content and schema validation |

### Running the CLI Locally

```bash
bun run src/index.ts init
bun run src/index.ts add button dialog
bun run src/index.ts audit
bun run src/index.ts explain dialog
bun run src/index.ts context --format md
```

### Type Checking

```bash
bun run typecheck
```

---

## Adding Components

### Adding a Primitive

1. Create `registry/primitives/{name}/` with three files:
   - `{name}.html` — Reference markup showing all variants and states
   - `{name}.css` — Styles using token references only
   - `{name}.manifest.json` — Machine-readable contract

2. CSS rules:
   - Root selector: `[data-ui="{name}"]`
   - Slot selectors: `[data-part="{slot}"]`
   - Token references only: `var(--token-name)` — never hardcode values
   - Include `@media (prefers-reduced-motion: reduce)` if animated
   - Add machine comment at top: `/* @ui:component {name} */`

3. Follow the manifest schema — see `registry/primitives/button/button.manifest.json` as a reference.

4. Add test fixtures in `tests/fixtures/` if needed.

5. Run `bun test` to verify nothing breaks.

### Adding a Recipe

Same as primitives, plus:

1. Add `{name}.js` — A controller module exporting `create{Name}(root)`.

2. Controller requirements:
   - Prevent double-init: `if (root._loom{Name}) return root._loom{Name};`
   - Find parts with `[data-part="..."]` queries scoped to root
   - Express state changes by setting `root.dataset.state`
   - Return an API object including `destroy()` for cleanup
   - Be idempotent — calling twice on the same element returns the same instance

3. Import only from `../../core/` modules. No external dependencies.

4. Add recipe controller tests in `tests/recipes/{name}.test.ts`.

### Adding a Pattern

1. Create `registry/patterns/{name}/` with:
   - `{name}.html` — Full markup composition using existing primitives and recipes
   - `{name}.css` — Optional pattern-specific styles (composition layout, etc.)
   - `{name}.manifest.json` — Manifest with `kind: "pattern"` and `composition.contains` listing all used components

2. Patterns compose existing components — they should not introduce new `data-ui` elements.

---

## Anti-Patterns

These are enforced by the audit system and must never appear in Loom components:

1. **Never use class names for component identity.** Use `[data-ui="button"]`, not `.btn`.
2. **Never use class names for state.** Use `[data-state="open"]`, not `.is-open`.
3. **Never hardcode color, spacing, or shadow values.** Use token references (`var(--color-primary)`).
4. **Never create a JS runtime that manages component lifecycle.** Controllers attach behavior to existing DOM — they don't create or own it.
5. **Never import external dependencies.** Zero dependencies in all output.
6. **Never require a build step.** Components work by opening the HTML file in a browser.
7. **Never use JSX, template literals, or compile-to-HTML syntax.**
8. **Never add routing, data fetching, or SSR.** Loom is a component library, not an application framework.
9. **Never use `!important` in component CSS.** Keep specificity low.
10. **Never use IDs as CSS selectors.** IDs exist for ARIA relationships only.
11. **Never use `@import` between component CSS files.** Components depend on tokens only.
12. **Never add `fetch()` or `XMLHttpRequest` in recipe controllers.**
13. **Never import from paths outside the project** (no npm packages, no CDN URLs).

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | [Bun](https://bun.sh) |
| Language | TypeScript (strict mode) |
| Package Manager | Bun |
| Output | Pure HTML + CSS + vanilla JS (zero dependencies) |
| Manifest Format | JSON |
| Testing | Bun test runner + [happy-dom](https://github.com/nicedaycode/happy-dom) |
| Color Space | OKLCH (perceptually uniform) |

---

## License

MIT
