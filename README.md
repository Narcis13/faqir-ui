# Loom UI

A zero-dependency, HTML-first UI framework built for AI agents to generate, inspect, and repair — and for humans to fully own.

## What is Loom?

Loom is a CLI-distributed UI framework that generates and maintains plain HTML, CSS, and JavaScript components using machine-readable manifests. AI coding agents are the primary consumer. Humans are the editor-reviewers.

- **No virtual DOM, no reactivity system, no JSX**
- **No webpack, no Vite, no compile step**
- **No node_modules dependency at runtime**
- **Zero external dependencies in output**

The CSS is the component. The JSON manifest is the documentation. The AI is the compiler. The CLI is the conductor.

## Quick Start

```bash
# Initialize a new project
npx @loom-ui/cli init

# Add components
npx @loom-ui/cli add button input card dialog tabs

# Check everything is wired correctly
npx @loom-ui/cli audit

# Generate AI context file
npx @loom-ui/cli context
```

## How It Works

Every component uses a standardized attribute protocol:

| Attribute | Purpose | Example |
|-----------|---------|---------|
| `data-ui` | Component identity | `data-ui="button"` |
| `data-part` | Slot role within parent | `data-part="trigger"` |
| `data-state` | Runtime state (JS changes this) | `data-state="open"` |
| `data-variant` | Visual variant | `data-variant="primary"` |
| `data-size` | Size variant | `data-size="lg"` |

### A Button

```html
<button data-ui="button" data-variant="primary" data-size="md">
  Save Changes
</button>
```

### A Dialog

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

### Tabs

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

## Components

### Primitives (CSS Only)

button, input, textarea, select, checkbox, radio, switch, label, badge, card, separator, avatar, spinner, kbd, stack, grid, surface

### Recipes (CSS + JS)

dialog, drawer, dropdown-menu, tabs, accordion, tooltip, toast, combobox, command-palette, table, select-custom, popover, pagination, sheet, date-picker

### Patterns (Compositions)

auth-form, dashboard-shell, settings-page, crud-table, empty-state, search-results

## Design Tokens

Three-layer token system using CSS Custom Properties:

```css
/* Layer 1: Raw palette (never used directly) */
--palette-indigo-500: oklch(0.55 0.22 264);

/* Layer 2: Semantic tokens (components use these) */
--color-primary: var(--palette-indigo-500);

/* Layer 3: Component aliases (optional overrides) */
--button-radius: var(--radius-md);
```

### Themes

Switch themes by swapping a CSS file. Four built-in themes:

- **default** — Clean, modern light/dark
- **midnight** — Deep navy with vibrant cyan accents
- **paper** — Warm cream tones, earthy accents
- **brutalist** — Black and white, no shadows, no rounding

```bash
npx @loom-ui/cli theme set midnight
npx @loom-ui/cli theme create my-theme
```

Dark mode activates via `data-theme="dark"` on `<html>`.

## CLI Commands

| Command | Description |
|---------|-------------|
| `loom init` | Initialize a new project |
| `loom add <components>` | Add components (auto-resolves dependencies) |
| `loom list` | Show installed and available components |
| `loom inspect <component>` | View component manifest details |
| `loom explain <component>` | Human-readable component explanation |
| `loom trace <component>` | Show dependency and file trace |
| `loom audit` | Validate all components against manifests |
| `loom repair` | Auto-fix audit issues |
| `loom context` | Generate `.loom/context.json` for AI agents |
| `loom theme set <name>` | Switch theme |
| `loom theme create <name>` | Scaffold a custom theme |
| `loom conform` | Normalize markup to canonical structure |
| `loom variant add <component> <variant>=<value>` | Add a variant value |
| `loom scaffold <name>` | Generate a full page template |
| `loom doctor` | Check project health |

## Audit System

The audit system validates your HTML against component manifests:

```bash
npx @loom-ui/cli audit
```

```
AUDIT RESULTS — 3 issues found

CRITICAL  dialog#confirm  Missing required slot: close
ERROR     dialog#confirm  Invalid variant value: data-size="xl" (valid: sm, md, lg, full)
WARNING   dialog#confirm  Panel has description slot but missing aria-describedby

Run `loom repair` to auto-fix 2 of 3 issues.
```

```bash
npx @loom-ui/cli repair
```

The audit catches missing ARIA attributes, invalid variants, orphaned parts, missing controllers, and more.

## AI Context

`loom context` generates `.loom/context.json` — a compact file under 3000 tokens that gives AI agents everything they need to generate correct Loom markup:

```bash
npx @loom-ui/cli context --format md    # Markdown for LLM prompts
npx @loom-ui/cli context --skill        # Generate Claude Code skill file
```

## JavaScript Controllers

Recipe components use plain ES module controllers. No framework, no build step:

```js
import { createDialog } from "./ui/recipes/dialog/dialog.js";

const dialog = createDialog(document.querySelector('[data-ui="dialog"]'));
dialog.open();
dialog.close();
dialog.destroy();
```

An auto-init script handles all recipes automatically:

```html
<script type="module" src="./ui/core/loom.js"></script>
```

## CSS Rules

1. Semantic CSS, not utility-first
2. Attribute selectors (`[data-ui="button"]`), not class names
3. Token references only — no hardcoded values
4. State via `data-state`, never classes
5. Every animated component includes `prefers-reduced-motion`

## Tech Stack

- **Runtime**: Bun.js
- **Language**: TypeScript (strict mode)
- **Output**: Pure HTML + CSS + vanilla JS
- **Testing**: Bun test runner

## License

MIT
