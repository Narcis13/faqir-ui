# Loom — Agent-Native UI Framework

## Complete Specification & Implementation Plan

> A zero-dependency, HTML-first UI framework built for AI agents to generate, inspect, and repair — and for humans to fully own.

---

## 1. Project Overview

### What Loom Is

Loom is a CLI-distributed UI framework that generates and maintains plain HTML, CSS, and JavaScript components using machine-readable manifests. It is designed specifically for AI coding agents as the primary consumer and humans as the editor-reviewers.

### What Loom Is NOT

- Not a JavaScript framework (no virtual DOM, no reactivity system, no JSX)
- Not a build tool (no webpack, no Vite, no compile step)
- Not a utility-first CSS library (not Tailwind)
- Not a package you import at runtime (no node_modules dependency)
- Not a design system for humans to browse — it's a design system for agents to parse

### Core Thesis

The CSS is the component. The JSON manifest is the documentation. The AI is the compiler. The CLI is the conductor. Audit and repair is the superpower.

### Tech Stack (For Building Loom Itself)

- **Runtime**: Bun.js
- **Language**: TypeScript (strict mode)
- **Package Manager**: Bun
- **Distribution**: npm (npx loom)
- **Output Format**: Pure HTML + CSS + vanilla JS (zero dependencies)
- **Manifest Format**: JSON
- **Testing**: Bun test runner

### Repository Structure

```
loom/
├── package.json              # npm package config
├── tsconfig.json             # TypeScript config
├── bunfig.toml               # Bun config
├── README.md
├── LICENSE
│
├── src/                      # CLI source code (TypeScript)
│   ├── index.ts              # CLI entry point
│   ├── commands/
│   │   ├── init.ts
│   │   ├── add.ts
│   │   ├── list.ts
│   │   ├── inspect.ts
│   │   ├── explain.ts
│   │   ├── trace.ts
│   │   ├── audit.ts
│   │   ├── repair.ts
│   │   ├── theme.ts
│   │   ├── conform.ts
│   │   ├── context.ts
│   │   ├── variant.ts
│   │   ├── scaffold.ts
│   │   └── doctor.ts
│   ├── audit/
│   │   ├── rules.ts          # Audit rule definitions
│   │   ├── checker.ts        # DOM contract checker
│   │   ├── reporter.ts       # Formatted output
│   │   └── repairer.ts       # Auto-fix engine
│   ├── parser/
│   │   ├── html-parser.ts    # Lightweight HTML parser for audit
│   │   └── css-parser.ts     # Token extraction from CSS
│   ├── generator/
│   │   ├── context.ts        # .loom/context.json generator
│   │   ├── manifest.ts       # Manifest aggregator
│   │   └── skill.ts          # Claude Code skill generator
│   └── utils/
│       ├── fs.ts             # File system helpers
│       ├── logger.ts         # Colored terminal output
│       └── config.ts         # Config file reader/writer
│
├── registry/                 # Component registry (shipped with CLI)
│   ├── tokens/
│   │   ├── palette.css
│   │   ├── semantic.css
│   │   ├── aliases.css
│   │   ├── spacing.css
│   │   ├── typography.css
│   │   ├── effects.css
│   │   ├── motion.css
│   │   └── index.css
│   │
│   ├── base/
│   │   ├── reset.css
│   │   └── prose.css
│   │
│   ├── core/
│   │   ├── dom.js
│   │   ├── events.js
│   │   ├── focus.js
│   │   ├── motion.js
│   │   ├── store.js
│   │   └── utils.js
│   │
│   ├── primitives/
│   │   ├── button/
│   │   │   ├── button.html
│   │   │   ├── button.css
│   │   │   └── button.manifest.json
│   │   ├── input/
│   │   ├── card/
│   │   └── ... (all primitives)
│   │
│   ├── recipes/
│   │   ├── dialog/
│   │   │   ├── dialog.html
│   │   │   ├── dialog.css
│   │   │   ├── dialog.js
│   │   │   └── dialog.manifest.json
│   │   ├── tabs/
│   │   └── ... (all recipes)
│   │
│   ├── patterns/
│   │   ├── auth-form/
│   │   ├── dashboard-shell/
│   │   └── crud-table/
│   │
│   └── themes/
│       ├── default.css
│       ├── midnight.css
│       ├── paper.css
│       └── brutalist.css
│
└── tests/
    ├── commands/
    ├── audit/
    ├── parser/
    └── fixtures/
```

---

## 2. Attribute Protocol

All Loom components use a standardized set of data attributes. This is the DOM contract — the stable API between HTML and everything else.

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
3. `data-state` is the ONLY attribute that JS controllers should modify for state changes. CSS targets state via `[data-state="open"]`.
4. `data-variant` and `data-size` are set in markup and rarely change dynamically.
5. Components never use class names for state. State lives in `data-state`. Visual identity lives in `data-variant`.
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

### Example: Complete Dialog Markup

```html
<!-- @ui:component dialog -->
<!-- @ui:slots trigger overlay panel header title body footer close -->
<!-- @ui:variants size=sm|md|lg|full tone=default|danger -->
<!-- @ui:controller ui/recipes/dialog/dialog.js -->
<div data-ui="dialog" data-state="closed" id="confirm-dialog">

  <button data-part="trigger">Delete Account</button>

  <div data-part="overlay" hidden></div>

  <div
    data-part="panel"
    data-variant="danger"
    data-size="sm"
    role="dialog"
    aria-modal="true"
    aria-labelledby="confirm-dialog-title"
    hidden
  >
    <div data-part="header">
      <h2 id="confirm-dialog-title" data-part="title">Are you sure?</h2>
      <button data-part="close" aria-label="Close dialog">✕</button>
    </div>
    <div data-part="body">
      <p data-part="description">This action cannot be undone.</p>
    </div>
    <div data-part="footer">
      <button data-ui="button" data-part="close" data-variant="outline">Cancel</button>
      <button data-ui="button" data-variant="destructive">Delete</button>
    </div>
  </div>
</div>
```

### Machine Comments

Every component file should contain machine-readable HTML comments at the top:

```html
<!-- @ui:component {name} -->
<!-- @ui:kind {primitive|recipe|pattern} -->
<!-- @ui:slots {space-separated slot names} -->
<!-- @ui:variants {name}={val1}|{val2}|{val3} -->
<!-- @ui:controller {path to JS file, if recipe} -->
```

And in CSS files:

```css
/* @ui:component {name} */
/* @ui:tokens {space-separated token names used} */
```

These are optional but recommended. The audit system can use them for fast scanning without parsing the full manifest.

---

## 3. Manifest System

Every component has a `.manifest.json` file that serves as a machine-readable contract. This is the core innovation — manifests enable audit, repair, explain, trace, and context generation.

### Manifest JSON Schema

```json
{
  "$schema": "https://loom.dev/manifest.schema.json",

  "name": "string (required) — component name, lowercase, kebab-case",
  "version": "string (required) — semver",
  "kind": "string (required) — primitive | recipe | pattern | scaffold",
  "category": "string (required) — actions | forms | layout | navigation | data-display | feedback | overlay | typography | composite",
  "description": "string (required) — one-line description",

  "anatomy": {
    "tag": "string — root HTML element (div, button, nav, etc.)",
    "selector": "string — CSS selector for root: [data-ui='name']",
    "content_model": "string — inline | block | slots | text"
  },

  "slots": {
    "{slot_name}": {
      "selector": "string — [data-part='name']",
      "required": "boolean",
      "tag_hint": "string (optional) — suggested HTML element",
      "description": "string (optional)"
    }
  },

  "variants": {
    "{variant_group}": {
      "values": ["array of valid values"],
      "default": "string — default value",
      "attr": "string — data-variant | data-size | custom",
      "applied_to": "string — which slot (root if omitted)"
    }
  },

  "states": {
    "{state_name}": {
      "attr": "string — data-state value",
      "default": "boolean (optional) — true if this is the initial state",
      "transient": "boolean (optional) — true if auto-reverts (e.g., 'closing')"
    }
  },

  "a11y": {
    "role": "string (optional) — ARIA role",
    "aria-modal": "boolean (optional)",
    "required_attrs": ["array of required ARIA attributes with mapping"],
    "focus_trap": "boolean (optional)",
    "escape_closes": "boolean (optional)",
    "return_focus": "string (optional) — slot name to return focus to",
    "keyboard": {
      "{key}": "string — action description"
    }
  },

  "tokens_used": ["array of token names referenced in CSS"],

  "templates": {
    "html": "string — HTML template with {placeholders}",
    "html_with_icon": "string (optional) — variant with icon slot",
    "react": "string (optional) — React component signature",
    "web_component": "string (optional) — Web Component class hint"
  },

  "safe_transforms": ["array of operations that are safe for agents to perform"],
  "unsafe_transforms": ["array of operations that break contracts"],

  "composition": {
    "contains": ["array of component names that can be nested inside"],
    "used_in": ["array of pattern/scaffold names that use this"]
  },

  "files": {
    "html": "string — relative path to reference HTML",
    "css": "string — relative path to CSS file",
    "js": "string (optional) — relative path to JS controller",
    "manifest": "string — relative path to this manifest"
  },

  "tests": ["array of test description strings for contract verification"]
}
```

### Full Example: Button Manifest

```json
{
  "name": "button",
  "version": "1.0.0",
  "kind": "primitive",
  "category": "actions",
  "description": "Interactive button with multiple visual variants and sizes",

  "anatomy": {
    "tag": "button",
    "selector": "[data-ui='button']",
    "content_model": "inline"
  },

  "slots": {
    "icon": {
      "selector": "[data-part='icon']",
      "required": false,
      "tag_hint": "span",
      "description": "Optional leading icon container"
    }
  },

  "variants": {
    "visual": {
      "values": ["default", "primary", "secondary", "destructive", "ghost", "outline", "link"],
      "default": "default",
      "attr": "data-variant",
      "applied_to": "root"
    },
    "size": {
      "values": ["sm", "md", "lg"],
      "default": "md",
      "attr": "data-size",
      "applied_to": "root"
    }
  },

  "states": {
    "default": { "attr": "data-state=\"default\"", "default": true },
    "loading": { "attr": "data-state=\"loading\"" },
    "disabled": { "attr": "disabled" }
  },

  "a11y": {
    "required_attrs": ["aria-label required when icon-only (no text content)"],
    "keyboard": {
      "Enter": "activate",
      "Space": "activate"
    }
  },

  "tokens_used": [
    "color-primary", "color-primary-hover", "color-primary-fg",
    "color-secondary", "color-destructive",
    "color-bg", "color-fg", "color-border",
    "radius-md", "space-2", "space-3", "space-4",
    "font-sans", "text-sm", "text-base",
    "duration-fast", "ease-default",
    "shadow-xs"
  ],

  "templates": {
    "html": "<button data-ui=\"button\" data-variant=\"{variant}\" data-size=\"{size}\">{text}</button>",
    "html_with_icon": "<button data-ui=\"button\" data-variant=\"{variant}\" data-size=\"{size}\"><span data-part=\"icon\">{icon}</span>{text}</button>",
    "html_icon_only": "<button data-ui=\"button\" data-variant=\"{variant}\" data-size=\"{size}\" aria-label=\"{label}\">{icon}</button>"
  },

  "safe_transforms": [
    "change-variant",
    "change-size",
    "add-icon",
    "add-loading-state",
    "wrap-in-button-group",
    "change-text-content"
  ],

  "unsafe_transforms": [
    "remove-button-element",
    "change-to-div-without-role",
    "remove-disabled-state-handling"
  ],

  "composition": {
    "contains": [],
    "used_in": ["card", "dialog", "auth-form", "crud-table", "every-pattern"]
  },

  "files": {
    "html": "button.html",
    "css": "button.css",
    "manifest": "button.manifest.json"
  },

  "tests": [
    "renders-as-button-element",
    "default-variant-has-no-data-variant-attr",
    "primary-variant-sets-data-variant-primary",
    "sm-size-sets-data-size-sm",
    "disabled-state-has-disabled-attribute",
    "loading-state-sets-data-state-loading",
    "icon-only-requires-aria-label"
  ]
}
```

### Full Example: Dialog Manifest

```json
{
  "name": "dialog",
  "version": "1.0.0",
  "kind": "recipe",
  "category": "overlay",
  "description": "Modal dialog with focus trap, escape-to-close, and overlay backdrop",

  "anatomy": {
    "tag": "div",
    "selector": "[data-ui='dialog']",
    "content_model": "slots"
  },

  "slots": {
    "trigger": {
      "selector": "[data-part='trigger']",
      "required": true,
      "tag_hint": "button",
      "description": "Button that opens the dialog"
    },
    "overlay": {
      "selector": "[data-part='overlay']",
      "required": true,
      "tag_hint": "div",
      "description": "Backdrop overlay, click to close"
    },
    "panel": {
      "selector": "[data-part='panel']",
      "required": true,
      "tag_hint": "div",
      "description": "The dialog box container"
    },
    "header": {
      "selector": "[data-part='header']",
      "required": false,
      "tag_hint": "div"
    },
    "title": {
      "selector": "[data-part='title']",
      "required": true,
      "tag_hint": "h2",
      "description": "Linked via aria-labelledby to panel"
    },
    "description": {
      "selector": "[data-part='description']",
      "required": false,
      "tag_hint": "p",
      "description": "Optional, linked via aria-describedby if present"
    },
    "body": {
      "selector": "[data-part='body']",
      "required": true,
      "tag_hint": "div"
    },
    "footer": {
      "selector": "[data-part='footer']",
      "required": false,
      "tag_hint": "div",
      "description": "Action buttons area"
    },
    "close": {
      "selector": "[data-part='close']",
      "required": true,
      "tag_hint": "button",
      "description": "Close button, must have aria-label"
    }
  },

  "variants": {
    "size": {
      "values": ["sm", "md", "lg", "full"],
      "default": "md",
      "attr": "data-size",
      "applied_to": "panel"
    },
    "tone": {
      "values": ["default", "danger"],
      "default": "default",
      "attr": "data-variant",
      "applied_to": "panel"
    }
  },

  "states": {
    "closed": { "attr": "data-state=\"closed\"", "default": true },
    "open": { "attr": "data-state=\"open\"" },
    "closing": { "attr": "data-state=\"closing\"", "transient": true }
  },

  "a11y": {
    "role": "dialog",
    "aria-modal": true,
    "required_attrs": [
      "role=\"dialog\" on panel",
      "aria-modal=\"true\" on panel",
      "aria-labelledby pointing to title id",
      "aria-describedby pointing to description id (if description slot exists)",
      "aria-label on close button"
    ],
    "focus_trap": true,
    "escape_closes": true,
    "return_focus": "trigger",
    "keyboard": {
      "Escape": "close dialog",
      "Tab": "cycle focus within panel",
      "Shift+Tab": "reverse cycle focus within panel"
    }
  },

  "tokens_used": [
    "radius-xl", "shadow-xl", "space-4", "space-6", "space-8",
    "color-bg", "color-fg", "color-border", "color-fg-muted",
    "duration-normal", "duration-slow", "ease-default", "ease-out",
    "z-overlay", "z-modal"
  ],

  "templates": {
    "html": "<div data-ui=\"dialog\" data-state=\"closed\" id=\"{id}\">\n  <button data-part=\"trigger\">{trigger_text}</button>\n  <div data-part=\"overlay\" hidden></div>\n  <div data-part=\"panel\" role=\"dialog\" aria-modal=\"true\" aria-labelledby=\"{id}-title\" data-size=\"{size}\" hidden>\n    <div data-part=\"header\">\n      <h2 id=\"{id}-title\" data-part=\"title\">{title}</h2>\n      <button data-part=\"close\" aria-label=\"Close dialog\">✕</button>\n    </div>\n    <div data-part=\"body\">{body}</div>\n    <div data-part=\"footer\">{footer}</div>\n  </div>\n</div>"
  },

  "safe_transforms": [
    "change-variant-size",
    "change-variant-tone",
    "add-description-slot",
    "swap-close-animation",
    "restyle-panel-background",
    "add-form-to-body",
    "customize-overlay-opacity",
    "add-header-slot",
    "modify-footer-buttons"
  ],

  "unsafe_transforms": [
    "remove-focus-trap",
    "remove-escape-handler",
    "remove-aria-labelledby",
    "remove-overlay",
    "remove-close-button",
    "change-panel-role",
    "remove-aria-modal"
  ],

  "composition": {
    "contains": ["button", "input", "select", "textarea", "checkbox", "radio", "switch"],
    "used_in": ["settings-page", "crud-table", "auth-form"]
  },

  "files": {
    "html": "dialog.html",
    "css": "dialog.css",
    "js": "dialog.js",
    "manifest": "dialog.manifest.json"
  },

  "tests": [
    "opens-on-trigger-click",
    "closes-on-escape",
    "closes-on-overlay-click",
    "closes-on-close-button-click",
    "traps-focus-within-panel",
    "returns-focus-to-trigger-on-close",
    "sets-data-state-to-open-when-opened",
    "sets-data-state-to-closed-when-closed",
    "panel-has-role-dialog",
    "panel-has-aria-modal-true",
    "title-is-linked-via-aria-labelledby",
    "close-button-has-aria-label",
    "overlay-and-panel-are-hidden-when-closed"
  ]
}
```

---

## 4. Component Layers

Components are organized into four layers of increasing complexity.

### Layer 1: Primitives (CSS Only — No JavaScript)

Purely visual building blocks. Just HTML + CSS. No behavior.

| Component | Tag | Description |
|-----------|-----|-------------|
| button | `<button>` | Interactive button with 7 visual variants, 3 sizes |
| input | `<input>` | Text input with states (default, error, disabled) |
| textarea | `<textarea>` | Multi-line text input |
| select | `<select>` | Native HTML select element (styled) |
| checkbox | `<input type="checkbox">` | Styled checkbox |
| radio | `<input type="radio">` | Styled radio button |
| switch | `<button role="switch">` | Toggle switch |
| label | `<label>` | Form label |
| badge | `<span>` | Small status indicator |
| card | `<div>` | Container surface with header/body/footer slots |
| separator | `<hr>` | Horizontal or vertical divider |
| avatar | `<img>` / `<span>` | User avatar with fallback initials |
| spinner | `<div>` | Loading spinner animation |
| kbd | `<kbd>` | Keyboard shortcut indicator |
| stack | `<div>` | Vertical/horizontal flex container |
| grid | `<div>` | CSS grid container with column variants |
| surface | `<div>` | Generic elevated container |

**Total: 17 primitives**

Each primitive has:
- `{name}.html` — reference markup showing all variants
- `{name}.css` — all styles using token references
- `{name}.manifest.json` — machine-readable contract

### Layer 2: Recipes (CSS + JS Controller)

Interactive components that require JavaScript behavior.

| Component | Behavior | Key Features |
|-----------|----------|-------------|
| dialog | Open/close, focus trap, escape | Modal overlay with a11y |
| drawer | Slide open/close, focus trap | Side panel variant of dialog |
| dropdown-menu | Toggle, keyboard nav, click-outside | Menu items with keyboard support |
| tabs | Tab switching, panel show/hide | Accessible tabbed interface |
| accordion | Section expand/collapse | Multiple or single-expand mode |
| tooltip | Show on hover/focus, positioning | Informational popup |
| toast | Auto-dismiss, stack management | Notification messages |
| combobox | Input + filtered dropdown list | Autocomplete/typeahead |
| command-palette | Modal + search + keyboard nav | Cmd+K style command interface |
| table | Sort, select rows | Enhanced data table |
| select-custom | Custom styled select with search | Non-native select replacement |
| popover | Toggle, positioning, click-outside | Content popup anchored to trigger |
| pagination | Page navigation | Numbered page controls |
| sheet | Slide from edge | Mobile-friendly bottom/side sheet |
| date-picker | Calendar UI, date selection | Date input with calendar dropdown |

**Total: 15 recipes**

Each recipe has:
- `{name}.html` — reference markup showing all variants/states
- `{name}.css` — styles including state transitions
- `{name}.js` — controller module (see JS Strategy below)
- `{name}.manifest.json` — machine-readable contract

### Layer 3: Patterns (Compositions)

Pre-built compositions of primitives and recipes for common UI patterns.

| Pattern | Components Used |
|---------|----------------|
| auth-form | card, input, button, separator, label |
| dashboard-shell | nav, sidebar, card, grid, avatar, dropdown-menu |
| settings-page | tabs, card, input, select, switch, button, dialog |
| crud-table | table, button, dialog, pagination, input, badge |
| empty-state | card, button, surface |
| search-results | input, card, badge, pagination, spinner |

**Total: 6 patterns for MVP**

Each pattern has:
- `{name}.html` — full page/section markup
- `{name}.css` — pattern-specific layout styles (if any)
- `{name}.manifest.json` — composition manifest

### Layer 4: Scaffolds (Full Page Templates via CLI)

Generated via `loom scaffold {name}`. Not shipped as static files — generated dynamically by the CLI using patterns + primitives + recipes.

MVP scaffolds: `landing-page`, `admin-dashboard`, `internal-tool`

---

## 5. Design Token System

### Architecture: Three-Layer Tokens

Tokens use CSS Custom Properties with three layers of abstraction.

#### Layer 1: Raw Palette

Raw color values. Never referenced directly by components.

```css
:root {
  /* Indigo */
  --palette-indigo-50:  oklch(0.96 0.04 264);
  --palette-indigo-100: oklch(0.92 0.08 264);
  --palette-indigo-200: oklch(0.85 0.12 264);
  --palette-indigo-300: oklch(0.75 0.16 264);
  --palette-indigo-400: oklch(0.65 0.20 264);
  --palette-indigo-500: oklch(0.55 0.22 264);
  --palette-indigo-600: oklch(0.50 0.22 264);
  --palette-indigo-700: oklch(0.42 0.20 264);
  --palette-indigo-800: oklch(0.35 0.18 264);
  --palette-indigo-900: oklch(0.28 0.14 264);
  --palette-indigo-950: oklch(0.20 0.10 264);

  /* Red */
  --palette-red-50:  oklch(0.96 0.04 25);
  --palette-red-500: oklch(0.55 0.22 25);
  --palette-red-600: oklch(0.50 0.22 25);

  /* Green */
  --palette-green-50:  oklch(0.96 0.04 155);
  --palette-green-500: oklch(0.60 0.18 155);
  --palette-green-600: oklch(0.55 0.18 155);

  /* Amber */
  --palette-amber-50:  oklch(0.96 0.04 85);
  --palette-amber-500: oklch(0.75 0.15 75);

  /* Gray (cool) */
  --palette-gray-25:  oklch(0.995 0.001 260);
  --palette-gray-50:  oklch(0.98 0.003 260);
  --palette-gray-100: oklch(0.96 0.004 260);
  --palette-gray-200: oklch(0.92 0.006 260);
  --palette-gray-300: oklch(0.87 0.008 260);
  --palette-gray-400: oklch(0.70 0.01 260);
  --palette-gray-500: oklch(0.55 0.01 260);
  --palette-gray-600: oklch(0.44 0.01 260);
  --palette-gray-700: oklch(0.37 0.01 260);
  --palette-gray-800: oklch(0.27 0.01 260);
  --palette-gray-900: oklch(0.20 0.01 260);
  --palette-gray-950: oklch(0.14 0.01 260);
}
```

#### Layer 2: Semantic UI Tokens

Purpose-based tokens that reference palette values. Components reference THESE.

```css
:root {
  /* ── Surfaces ── */
  --color-bg:              var(--palette-gray-25);
  --color-bg-subtle:       var(--palette-gray-50);
  --color-bg-muted:        var(--palette-gray-100);
  --color-fg:              var(--palette-gray-950);
  --color-fg-muted:        var(--palette-gray-500);
  --color-fg-subtle:       var(--palette-gray-400);

  /* ── Interactive ── */
  --color-primary:         var(--palette-indigo-500);
  --color-primary-hover:   var(--palette-indigo-600);
  --color-primary-active:  var(--palette-indigo-700);
  --color-primary-fg:      white;
  --color-primary-subtle:  var(--palette-indigo-50);

  --color-secondary:       var(--palette-gray-100);
  --color-secondary-hover: var(--palette-gray-200);
  --color-secondary-fg:    var(--palette-gray-900);

  --color-destructive:     var(--palette-red-500);
  --color-destructive-hover: var(--palette-red-600);
  --color-destructive-fg:  white;
  --color-destructive-subtle: var(--palette-red-50);

  --color-success:         var(--palette-green-500);
  --color-success-subtle:  var(--palette-green-50);
  --color-warning:         var(--palette-amber-500);
  --color-warning-subtle:  var(--palette-amber-50);

  /* ── Borders ── */
  --color-border:          var(--palette-gray-200);
  --color-border-strong:   var(--palette-gray-300);
  --color-ring:            oklch(0.55 0.22 264 / 0.4);

  /* ── Spacing (4px base, harmonic scale) ── */
  --space-0:   0;
  --space-px:  1px;
  --space-0h:  0.125rem;   /* 2px */
  --space-1:   0.25rem;    /* 4px */
  --space-1h:  0.375rem;   /* 6px */
  --space-2:   0.5rem;     /* 8px */
  --space-2h:  0.625rem;   /* 10px */
  --space-3:   0.75rem;    /* 12px */
  --space-3h:  0.875rem;   /* 14px */
  --space-4:   1rem;       /* 16px */
  --space-5:   1.25rem;    /* 20px */
  --space-6:   1.5rem;     /* 24px */
  --space-7:   1.75rem;    /* 28px */
  --space-8:   2rem;       /* 32px */
  --space-10:  2.5rem;     /* 40px */
  --space-12:  3rem;       /* 48px */
  --space-16:  4rem;       /* 64px */
  --space-20:  5rem;       /* 80px */
  --space-24:  6rem;       /* 96px */

  /* ── Typography ── */
  --font-sans:   system-ui, -apple-system, 'Segoe UI', sans-serif;
  --font-mono:   ui-monospace, 'Cascadia Code', 'JetBrains Mono', monospace;
  --font-serif:  'Georgia', 'Times New Roman', serif;

  --text-xs:     0.75rem;    /* 12px */
  --text-sm:     0.875rem;   /* 14px */
  --text-base:   1rem;       /* 16px */
  --text-lg:     1.125rem;   /* 18px */
  --text-xl:     1.25rem;    /* 20px */
  --text-2xl:    1.5rem;     /* 24px */
  --text-3xl:    1.875rem;   /* 30px */
  --text-4xl:    2.25rem;    /* 36px */

  --leading-tight:  1.25;
  --leading-snug:   1.375;
  --leading-normal: 1.5;
  --leading-relaxed: 1.625;
  --leading-loose:   1.75;

  --weight-normal:   400;
  --weight-medium:   500;
  --weight-semibold: 600;
  --weight-bold:     700;

  /* ── Radii ── */
  --radius-none: 0;
  --radius-sm:   0.25rem;    /* 4px */
  --radius-md:   0.375rem;   /* 6px */
  --radius-lg:   0.5rem;     /* 8px */
  --radius-xl:   0.75rem;    /* 12px */
  --radius-2xl:  1rem;       /* 16px */
  --radius-full: 9999px;

  /* ── Shadows ── */
  --shadow-xs:  0 1px 2px oklch(0 0 0 / 0.04);
  --shadow-sm:  0 1px 3px oklch(0 0 0 / 0.06), 0 1px 2px oklch(0 0 0 / 0.04);
  --shadow-md:  0 4px 6px oklch(0 0 0 / 0.05), 0 2px 4px oklch(0 0 0 / 0.04);
  --shadow-lg:  0 10px 15px oklch(0 0 0 / 0.06), 0 4px 6px oklch(0 0 0 / 0.04);
  --shadow-xl:  0 20px 25px oklch(0 0 0 / 0.08), 0 8px 10px oklch(0 0 0 / 0.04);

  /* ── Motion ── */
  --ease-default:  cubic-bezier(0.4, 0, 0.2, 1);
  --ease-in:       cubic-bezier(0.4, 0, 1, 1);
  --ease-out:      cubic-bezier(0, 0, 0.2, 1);
  --ease-in-out:   cubic-bezier(0.4, 0, 0.2, 1);
  --ease-bounce:   cubic-bezier(0.34, 1.56, 0.64, 1);

  --duration-instant: 50ms;
  --duration-fast:    100ms;
  --duration-normal:  200ms;
  --duration-slow:    300ms;
  --duration-slower:  500ms;

  /* ── Z-Index ── */
  --z-base:     0;
  --z-raised:   1;
  --z-dropdown: 50;
  --z-sticky:   100;
  --z-overlay:  200;
  --z-modal:    300;
  --z-toast:    400;
  --z-max:      9999;
}
```

#### Layer 3: Component Aliases (Optional)

Components can optionally define their own aliases that map to semantic tokens. This allows per-component overrides without touching the global token system.

```css
:root {
  --button-radius:     var(--radius-md);
  --button-height-sm:  32px;
  --button-height-md:  40px;
  --button-height-lg:  48px;
  --button-font:       var(--font-sans);
  --button-weight:     var(--weight-medium);

  --card-radius:       var(--radius-lg);
  --card-shadow:       var(--shadow-sm);
  --card-border:       var(--color-border);
  --card-bg:           var(--color-bg);

  --dialog-radius:     var(--radius-xl);
  --dialog-shadow:     var(--shadow-xl);
  --dialog-overlay-bg: oklch(0 0 0 / 0.5);
}
```

### Dark Theme

Dark theme is activated by `data-theme="dark"` on the `<html>` element. Only semantic tokens need overriding — palette stays the same.

```css
[data-theme="dark"] {
  --color-bg:              var(--palette-gray-950);
  --color-bg-subtle:       var(--palette-gray-900);
  --color-bg-muted:        var(--palette-gray-800);
  --color-fg:              var(--palette-gray-50);
  --color-fg-muted:        var(--palette-gray-400);
  --color-fg-subtle:       var(--palette-gray-500);

  --color-primary:         var(--palette-indigo-400);
  --color-primary-hover:   var(--palette-indigo-300);
  --color-primary-subtle:  oklch(0.55 0.22 264 / 0.15);

  --color-secondary:       var(--palette-gray-800);
  --color-secondary-hover: var(--palette-gray-700);
  --color-secondary-fg:    var(--palette-gray-100);

  --color-border:          var(--palette-gray-800);
  --color-border-strong:   var(--palette-gray-700);

  --shadow-xs:  none;
  --shadow-sm:  0 1px 3px oklch(0 0 0 / 0.3);
  --shadow-md:  0 4px 6px oklch(0 0 0 / 0.3);
  --shadow-lg:  0 10px 15px oklch(0 0 0 / 0.4);
  --shadow-xl:  0 20px 25px oklch(0 0 0 / 0.5);
}
```

### Theme Files

Each theme is a single CSS file that overrides ONLY the semantic tokens and optionally palette tokens. Files are stored in `registry/themes/`.

Custom themes can be created via `loom theme create {name}` which scaffolds a theme CSS file with all overridable tokens commented out.

---

## 6. CSS Strategy

### Rules

1. **Semantic CSS, not utility-first.** Button styling belongs to `button.css`, not sprinkled across markup classes. This is a deliberate choice — agents reason better about centralized intent.

2. **Attribute selectors, not class names.** All component selectors use `[data-ui="name"]` and `[data-part="name"]`. No `.btn`, `.card`, `.modal` class names. The attribute protocol IS the API.

3. **Low specificity.** Use single attribute selectors where possible. Avoid deep nesting. Avoid `!important`.

4. **Token references only.** Component CSS must reference tokens via `var(--token-name)`. Hardcoded color, spacing, or shadow values in component CSS are forbidden and flagged by `loom audit`.

5. **State via data-state.** Never use classes for dynamic state. `[data-state="open"]` not `.is-open` or `.active`.

6. **No @import between component files.** Each component CSS file is self-contained. Dependencies are on tokens only.

7. **Reduced motion.** Every component with animation must include a `@media (prefers-reduced-motion: reduce)` block.

### Example: button.css

```css
/* @ui:component button */
/* @ui:tokens color-primary color-primary-hover color-primary-fg color-secondary color-destructive radius-md space-2 space-3 space-4 font-sans text-sm text-base duration-fast ease-default shadow-xs */

/* ── Base ── */
[data-ui="button"] {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  height: var(--button-height-md, 40px);
  padding-inline: var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--button-radius, var(--radius-md));
  background: var(--color-bg);
  color: var(--color-fg);
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  line-height: 1;
  cursor: pointer;
  transition: background var(--duration-fast) var(--ease-default),
              border-color var(--duration-fast) var(--ease-default),
              color var(--duration-fast) var(--ease-default),
              box-shadow var(--duration-fast) var(--ease-default);
  user-select: none;
  white-space: nowrap;
  text-decoration: none;
}

[data-ui="button"]:hover {
  background: var(--color-bg-muted);
}

[data-ui="button"]:focus-visible {
  outline: 2px solid var(--color-ring);
  outline-offset: 2px;
}

/* ── Variants ── */
[data-ui="button"][data-variant="primary"] {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: var(--color-primary-fg);
}
[data-ui="button"][data-variant="primary"]:hover {
  background: var(--color-primary-hover);
  border-color: var(--color-primary-hover);
}

[data-ui="button"][data-variant="secondary"] {
  background: var(--color-secondary);
  border-color: var(--color-secondary);
  color: var(--color-secondary-fg);
}
[data-ui="button"][data-variant="secondary"]:hover {
  background: var(--color-secondary-hover);
}

[data-ui="button"][data-variant="destructive"] {
  background: var(--color-destructive);
  border-color: var(--color-destructive);
  color: var(--color-destructive-fg);
}
[data-ui="button"][data-variant="destructive"]:hover {
  background: var(--color-destructive-hover);
  border-color: var(--color-destructive-hover);
}

[data-ui="button"][data-variant="ghost"] {
  background: transparent;
  border-color: transparent;
}
[data-ui="button"][data-variant="ghost"]:hover {
  background: var(--color-bg-muted);
}

[data-ui="button"][data-variant="outline"] {
  background: transparent;
}
[data-ui="button"][data-variant="outline"]:hover {
  background: var(--color-bg-subtle);
}

[data-ui="button"][data-variant="link"] {
  background: transparent;
  border-color: transparent;
  color: var(--color-primary);
  height: auto;
  padding: 0;
}
[data-ui="button"][data-variant="link"]:hover {
  text-decoration: underline;
}

/* ── Sizes ── */
[data-ui="button"][data-size="sm"] {
  height: var(--button-height-sm, 32px);
  padding-inline: var(--space-3);
  font-size: var(--text-xs);
}

[data-ui="button"][data-size="lg"] {
  height: var(--button-height-lg, 48px);
  padding-inline: var(--space-6);
  font-size: var(--text-base);
}

/* ── States ── */
[data-ui="button"]:disabled,
[data-ui="button"][data-state="disabled"] {
  opacity: 0.5;
  cursor: not-allowed;
  pointer-events: none;
}

[data-ui="button"][data-state="loading"] {
  cursor: wait;
  color: transparent;
  position: relative;
}
[data-ui="button"][data-state="loading"]::after {
  content: "";
  position: absolute;
  width: 1em;
  height: 1em;
  border: 2px solid currentColor;
  border-right-color: transparent;
  border-radius: var(--radius-full);
  animation: loom-spin 0.6s linear infinite;
  color: var(--color-fg);
}

/* ── Parts ── */
[data-ui="button"] [data-part="icon"] {
  display: inline-flex;
  width: 1em;
  height: 1em;
  flex-shrink: 0;
}

/* ── Button Group ── */
[data-ui="button-group"] {
  display: inline-flex;
}
[data-ui="button-group"] [data-ui="button"]:not(:first-child) {
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
  margin-left: -1px;
}
[data-ui="button-group"] [data-ui="button"]:not(:last-child) {
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
}

/* ── Motion ── */
@media (prefers-reduced-motion: reduce) {
  [data-ui="button"] {
    transition: none;
  }
}

@keyframes loom-spin {
  to { transform: rotate(360deg); }
}
```

---

## 7. JavaScript Strategy

### Controller Module Pattern

Every recipe has a JS controller — a pure function that takes a DOM root element and attaches behavior. No framework, no runtime, no build step.

### Rules

1. Controllers are ES modules exporting a named `create{Name}` function.
2. Controllers find parts using `[data-part="..."]` queries scoped to the root.
3. State changes are expressed by setting `data-state` on the root element.
4. Controllers return a cleanup/API object for programmatic use.
5. All event listeners are attached to the root or its children — never `document` or `window` (except escape key for modals).
6. Controllers must be idempotent — calling `create{Name}` on the same element twice should not double-bind events.

### Example: dialog.js

```js
// @ui:controller dialog
// @ui:provides open close toggle destroy

import { trapFocus, releaseFocus } from "../core/focus.js";

export function createDialog(root) {
  // Prevent double-init
  if (root._loomDialog) return root._loomDialog;

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
      previouslyFocused?.focus();
      panel.removeEventListener("animationend", onEnd);
      panel.removeEventListener("transitionend", onEnd);
    };

    // If no animation, close immediately
    const style = getComputedStyle(panel);
    const hasAnimation = style.animationName !== "none" ||
                         parseFloat(style.transitionDuration) > 0;

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
  function onTriggerClick() { open(); }
  function onOverlayClick() { close(); }
  function onCloseClick() { close(); }
  function onKeyDown(e) {
    if (e.key === "Escape" && root.dataset.state === "open") {
      e.stopPropagation();
      close();
    }
  }

  trigger?.addEventListener("click", onTriggerClick);
  overlay?.addEventListener("click", onOverlayClick);
  closeButtons.forEach(btn => btn.addEventListener("click", onCloseClick));
  root.addEventListener("keydown", onKeyDown);

  // Also support external triggers: any element with [data-open="{dialog-id}"]
  const externalTriggers = document.querySelectorAll(
    `[data-open="${root.id}"]`
  );
  externalTriggers.forEach(el => el.addEventListener("click", onTriggerClick));

  function destroy() {
    trigger?.removeEventListener("click", onTriggerClick);
    overlay?.removeEventListener("click", onOverlayClick);
    closeButtons.forEach(btn => btn.removeEventListener("click", onCloseClick));
    root.removeEventListener("keydown", onKeyDown);
    externalTriggers.forEach(el => el.removeEventListener("click", onTriggerClick));
    if (focusCleanup) focusCleanup();
    delete root._loomDialog;
  }

  const api = { open, close, toggle, destroy };
  root._loomDialog = api;
  return api;
}
```

### Auto-Initialization Script

An optional bundled `loom.js` script auto-initializes all recipes found in the DOM:

```js
// loom.js — auto-init all recipe controllers
import { createDialog } from "./recipes/dialog/dialog.js";
import { createTabs } from "./recipes/tabs/tabs.js";
import { createDropdown } from "./recipes/dropdown/dropdown.js";
// ... all recipes

const controllers = {
  dialog: createDialog,
  tabs: createTabs,
  dropdown: createDropdown,
  // ...
};

function init() {
  for (const [name, factory] of Object.entries(controllers)) {
    document.querySelectorAll(`[data-ui="${name}"]`).forEach(factory);
  }
}

// Auto-init on DOM ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

// Re-init on dynamic content (MutationObserver)
const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (node.nodeType !== 1) continue;
      const ui = node.getAttribute?.("data-ui");
      if (ui && controllers[ui]) controllers[ui](node);
      // Also check children
      if (node.querySelectorAll) {
        for (const [name, factory] of Object.entries(controllers)) {
          node.querySelectorAll(`[data-ui="${name}"]`).forEach(factory);
        }
      }
    }
  }
});
observer.observe(document.body, { childList: true, subtree: true });

export { init, controllers };
```

### Core Modules (registry/core/)

These are tiny utility modules. Target: under 3KB total gzipped.

| Module | Purpose | Approximate Size |
|--------|---------|-----------------|
| `dom.js` | `$`, `$$`, `closest`, `create` helpers | ~200 bytes |
| `events.js` | `delegate`, `once`, `onOutsideClick` | ~300 bytes |
| `focus.js` | `trapFocus`, `releaseFocus`, `focusFirst`, `getFocusableElements` | ~500 bytes |
| `motion.js` | `waitForTransition`, `animate`, `prefersReducedMotion` | ~300 bytes |
| `store.js` | `createStore` (tiny observable) | ~200 bytes |
| `utils.js` | `uid`, `clamp`, `debounce`, `throttle` | ~200 bytes |

---

## 8. CLI Specification

### Entry Point

```
npx loom <command> [options]
```

Or install globally:

```
npm install -g @loom-ui/cli
bun add -g @loom-ui/cli
```

### Command: `loom init`

Initialize a new Loom project in the current directory.

**Behavior:**
1. Create `ui/` directory structure
2. Copy `tokens/index.css` (all token files concatenated or separate based on flag)
3. Copy `base/reset.css` and `base/prose.css`
4. Copy `core/` modules
5. Create `loom.config.json`
6. Create `.loom/context.json`
7. Add `.loom/` to `.gitignore` (if git repo detected)

**Options:**
- `--theme {name}` — Apply a theme during init (default: "default")
- `--tokens-split` — Keep token files separate instead of single index.css
- `--no-core` — Skip core JS modules (for static-only projects)
- `--dir {path}` — Output to a custom directory (default: `./ui`)

**Config file: `loom.config.json`**

```json
{
  "version": "1.0.0",
  "theme": "default",
  "output_dir": "./ui",
  "tokens_split": false,
  "include_core": true,
  "installed": {
    "primitives": [],
    "recipes": [],
    "patterns": []
  }
}
```

### Command: `loom add <components...>`

Add one or more components to the project.

**Behavior:**
1. Read `loom.config.json` to find output directory.
2. For each component:
   a. Determine its layer (primitive/recipe/pattern).
   b. Copy `.html`, `.css`, `.js` (if recipe), and `.manifest.json` into the appropriate layer folder.
   c. Check for dependencies (e.g., dialog depends on button, focus.js).
   d. Auto-add dependencies if missing (with notice).
3. Update `loom.config.json` installed list.
4. Regenerate `.loom/context.json`.

**Options:**
- `--all` — Add all components
- `--layer {primitives|recipes|patterns}` — Add all from a layer
- `--dry-run` — Show what would be added without writing
- `--no-deps` — Don't auto-install dependencies

**Dependency Resolution:**
Every manifest has a `composition.contains` field. When adding a recipe or pattern, check if its contained components are installed. If not, prompt or auto-add.

### Command: `loom list`

Show installed and available components.

**Output format:**

```
Installed (14 components):

  PRIMITIVES (8)
  ✓ button    ✓ input     ✓ card      ✓ badge
  ✓ avatar    ✓ separator ✓ spinner   ✓ label

  RECIPES (4)
  ✓ dialog    ✓ tabs      ✓ dropdown  ✓ toast

  PATTERNS (2)
  ✓ auth-form ✓ dashboard-shell

Available (16 not installed):

  PRIMITIVES: textarea, select, checkbox, radio, switch, kbd, stack, grid, surface
  RECIPES: drawer, accordion, tooltip, combobox, command-palette, table, ...
  PATTERNS: settings-page, crud-table, empty-state, search-results
```

### Command: `loom inspect <component>`

Show detailed information about a component from its manifest.

**Output:** Pretty-printed manifest with syntax highlighting.

### Command: `loom explain <component>`

Human-and-agent-readable explanation of a component.

**Output format:**

```
DIALOG — Modal dialog with focus trap and overlay

PURPOSE:
  Overlay panel that demands user attention.
  Blocks interaction with the page behind it.

ANATOMY:
  [data-ui="dialog"]             Root container
    [data-part="trigger"]        Opens the dialog
    [data-part="overlay"]        Backdrop (click to close)
    [data-part="panel"]          The dialog box
      [data-part="header"]       Optional header area
        [data-part="title"]      Required (linked via aria-labelledby)
        [data-part="close"]      Required close button
      [data-part="body"]         Main content
      [data-part="footer"]       Action buttons

STATES:  closed (default) → open → closing → closed
VARIANTS:  size: sm | md | lg | full  •  tone: default | danger

KEYBOARD:
  Escape → close  •  Tab → cycle focus  •  Shift+Tab → reverse

ACCESSIBILITY:
  role=dialog, aria-modal=true, aria-labelledby, focus-trap

SAFE TO MODIFY:  size, tone, animation, panel styling, body content
DO NOT REMOVE:   focus trap, escape handler, aria-labelledby, overlay

FILES:
  HTML → ui/recipes/dialog/dialog.html
  CSS  → ui/recipes/dialog/dialog.css
  JS   → ui/recipes/dialog/dialog.js
  Spec → ui/recipes/dialog/dialog.manifest.json
```

### Command: `loom trace <component>`

Show complete dependency and file trace for a component.

**Output:** All files, selectors, tokens used, controllers, tests, and what patterns/scaffolds use this component.

### Command: `loom audit`

Validate all installed components against their manifests.

**Behavior:**
1. Find all HTML files in the project that contain `data-ui` attributes.
2. For each component instance found:
   a. Load its manifest.
   b. Check required slots exist.
   c. Check required ARIA attributes.
   d. Validate variant values against allowed values.
   e. Validate state values.
   f. Check controller script is loaded (for recipes).
   g. Check token references exist in token CSS.
3. Report results with severity levels: CRITICAL, ERROR, WARNING, INFO.

**Options:**
- `--fix` — Alias for `loom repair`
- `--json` — Output as JSON for programmatic consumption
- `--file {path}` — Audit a single HTML file

**Severity levels:**
- CRITICAL: Missing ARIA attributes, broken focus trap, missing required slots
- ERROR: Invalid variant values, orphaned panels/tabs, missing controller
- WARNING: Missing optional improvements (e.g., aria-describedby when description exists)
- INFO: Style suggestions, unused tokens

### Command: `loom repair`

Attempt deterministic fixes for audit issues.

**What it can fix:**
- Missing ARIA attributes → add them based on manifest
- Invalid variant names → rename to closest valid value
- Missing controller script tags → add script reference
- Orphaned panels → remove them
- Missing required attributes on slots → add with defaults

**What it cannot fix (requires human):**
- Missing text content for accessible names
- Wrong semantic HTML elements
- Logic errors in custom JS
- Missing content in slots

### Command: `loom theme set <name>`

Switch the active theme.

**Behavior:**
1. Copy theme CSS file to `ui/tokens/` (or update import).
2. Update `loom.config.json`.
3. Regenerate `.loom/context.json`.

### Command: `loom theme create <name>`

Scaffold a new custom theme.

**Behavior:**
Generate a CSS file with all overridable semantic tokens as comments, ready to customize.

### Command: `loom context`

Generate the `.loom/context.json` aggregated AI context file.

**Options:**
- `--format json` (default)
- `--format md` — Markdown for LLM prompts
- `--format mcp` — MCP tool schema
- `--format cursorrules` — Cursor IDE rules format

### Command: `loom conform`

Normalize all component instances to canonical structure.

**Behavior:**
- Reorder attributes to canonical order (data-ui, data-part, data-state, data-variant, data-size, role, aria-*, id, class)
- Normalize whitespace and indentation in component markup
- Ensure machine comments are present at top of component files

### Command: `loom doctor`

Check environment health.

**Checks:**
- loom.config.json exists and is valid
- All installed components have their files
- No manifest schema violations
- Token files are present
- Core modules are present (if configured)

### Command: `loom variant add <component> <variant>=<value>`

Add a new variant value to a component.

**Behavior:**
1. Update manifest `variants` field.
2. Add CSS rule stub for the new variant.
3. Regenerate context.

### Command: `loom scaffold <name>`

Generate a full page template.

**Behavior:**
1. Check which components are needed.
2. Auto-add missing components.
3. Generate HTML page with all components wired up.
4. Include script tags for recipe controllers.

---

## 9. Audit System Technical Design

The audit system is the core differentiator. It must be reliable, fast, and produce machine-readable output.

### HTML Parser Requirements

We need a lightweight HTML parser that can:
1. Find all elements with `data-ui` attributes.
2. For each, build a simple tree of its children with `data-part` attributes.
3. Read all attributes on each element.
4. NOT need full browser DOM — works on static HTML files.

**Implementation:** Use a regex-based or SAX-style parser. Do NOT use jsdom or similar heavy dependencies. Keep it minimal.

Recommended approach: Use Bun's built-in HTMLRewriter or a simple state-machine parser.

### Audit Rule Engine

Each audit rule is a function:

```typescript
interface AuditRule {
  id: string;
  severity: "critical" | "error" | "warning" | "info";
  check(component: ParsedComponent, manifest: Manifest): AuditResult[];
}

interface AuditResult {
  rule_id: string;
  severity: string;
  component_name: string;
  element_id?: string;
  message: string;
  fix?: RepairAction;
}

interface RepairAction {
  type: "add-attribute" | "rename-attribute" | "remove-element" | "add-element" | "add-script";
  target: string; // CSS selector
  details: Record<string, string>;
}
```

### Core Audit Rules

| Rule ID | Severity | Check |
|---------|----------|-------|
| `required-slot` | critical | All slots marked `required: true` in manifest exist in DOM |
| `required-aria` | critical | All ARIA attributes from `a11y.required_attrs` are present |
| `focus-trap` | critical | Recipe with `a11y.focus_trap: true` has its JS controller loaded |
| `valid-variant` | error | `data-variant` value exists in manifest `variants.values` |
| `valid-state` | error | `data-state` value exists in manifest `states` |
| `valid-size` | error | `data-size` value exists in manifest `variants.size.values` |
| `controller-loaded` | error | Recipe has its JS file referenced (script tag or import) |
| `orphan-panel` | error | Tab panels have matching tab triggers |
| `orphan-part` | warning | `data-part` values are valid slot names from manifest |
| `aria-describedby` | warning | If description slot exists, panel has `aria-describedby` |
| `close-label` | warning | Close buttons have `aria-label` |
| `token-exists` | warning | CSS token variables reference existing tokens |
| `reduced-motion` | info | Component CSS includes `prefers-reduced-motion` media query |

### Repair Engine

The repair engine takes `AuditResult` objects with `fix` fields and applies them to HTML files.

**Implementation:** Read file as string, apply fixes using string manipulation (not DOM parsing). Fixes are applied in reverse document order to preserve positions.

---

## 10. AI Context File Specification

### .loom/context.json

This is generated by `loom context` and aggregates all installed manifests into one file optimized for LLM consumption.

**Target size:** Under 3000 tokens for a full 30-component installation.

**Structure:**

```json
{
  "meta": {
    "framework": "loom",
    "version": "1.0.0",
    "theme": "default",
    "generated_at": "ISO date",
    "component_count": { "primitives": 17, "recipes": 10, "patterns": 3 }
  },

  "protocol": {
    "identity": "data-ui",
    "part": "data-part",
    "state": "data-state",
    "variant": "data-variant",
    "size": "data-size",
    "css_target": "[data-ui='name']",
    "state_css": "[data-state='value']",
    "theme_attr": "data-theme on <html>"
  },

  "tokens": {
    "prefix": "--",
    "colors": { "primary": "oklch(0.55 0.22 264)", "destructive": "oklch(0.55 0.22 25)" },
    "spacing": "4px base (--space-1 through --space-24)",
    "radius": { "sm": "4px", "md": "6px", "lg": "8px", "xl": "12px" },
    "shadows": "xs, sm, md, lg, xl",
    "z_index": "dropdown:50, sticky:100, overlay:200, modal:300, toast:400"
  },

  "components": {
    "button": {
      "kind": "primitive",
      "variants": ["default", "primary", "secondary", "destructive", "ghost", "outline", "link"],
      "sizes": ["sm", "md", "lg"],
      "template": "<button data-ui=\"button\" data-variant=\"{v}\" data-size=\"{s}\">{text}</button>",
      "safe_transforms": ["change-variant", "change-size", "add-icon"]
    },
    "dialog": {
      "kind": "recipe",
      "slots": ["trigger", "overlay", "panel", "title", "body", "footer", "close"],
      "states": ["closed", "open", "closing"],
      "variants": { "size": ["sm","md","lg","full"], "tone": ["default","danger"] },
      "a11y": "role=dialog, aria-modal=true, aria-labelledby→title, focus-trap, escape-closes",
      "safe_transforms": ["change-size", "change-tone", "restyle-panel"],
      "controller": "dialog.js"
    }
  },

  "patterns": {
    "auth-form": { "uses": ["card","input","button","separator","label"] },
    "dashboard-shell": { "uses": ["nav","sidebar","card","grid","avatar","dropdown"] }
  },

  "rules": {
    "use_data_state_not_classes": true,
    "always_aria_label_on_icon_buttons": true,
    "always_aria_labelledby_on_dialog_panel": true,
    "semantic_html_over_div_soup": true,
    "tokens_only_no_hardcoded_values": true
  }
}
```

### .loom/SKILL.md (Auto-generated Claude Code Skill)

```markdown
# Loom UI Framework Skill

When building UI with Loom, always read `.loom/context.json` first.

## Quick Rules
- Use `data-ui` for component identity
- Use `data-part` for slot roles
- Use `data-state` for runtime state (CSS targets this)
- Use `data-variant` for visual variants
- Use CSS tokens (`var(--color-primary)`) — never hardcode values
- Always include ARIA attributes per component manifest
- Import recipe controllers: `import { createDialog } from "./ui/recipes/dialog/dialog.js"`

## Available Commands
- `loom add <name>` — add components
- `loom audit` — check for contract violations
- `loom repair` — auto-fix issues
- `loom explain <name>` — get component details
```

---

## 11. Implementation Plan

### Phase 1: Foundation (Days 1–5)

**Goal:** Token system, CSS reset, and project scaffolding.

**Tasks:**
1. Initialize the repository with Bun + TypeScript
2. Create `package.json` with bin entry for `loom` CLI
3. Write `registry/tokens/palette.css` — full oklch color palette
4. Write `registry/tokens/semantic.css` — all semantic UI tokens
5. Write `registry/tokens/aliases.css` — component alias tokens
6. Write `registry/tokens/spacing.css`, `typography.css`, `effects.css`, `motion.css`
7. Write `registry/tokens/index.css` — aggregated import
8. Write `registry/base/reset.css` — modern CSS reset
9. Write `registry/base/prose.css` — typography defaults
10. Write dark theme: `registry/themes/default.css` (includes dark mode)
11. Create `loom.config.json` schema
12. Implement CLI entry point with command routing (`src/index.ts`)
13. Implement `loom init` command
14. Implement `loom doctor` command
15. Write tests for init and token generation

**Deliverable:** `loom init` creates a working project with tokens and base styles.

### Phase 2: First Components + Manifest System (Days 6–10)

**Goal:** 5 primitives with full manifests proving the system.

**Tasks:**
1. Write manifest JSON schema (TypeScript type + validation)
2. Build `button` — html, css, manifest (use as reference implementation)
3. Build `input` — html, css, manifest
4. Build `card` — html, css, manifest
5. Build `badge` — html, css, manifest
6. Build `avatar` — html, css, manifest
7. Build `separator` — html, css, manifest
8. Build `label` — html, css, manifest
9. Implement `loom add` command with dependency resolution
10. Implement `loom list` command
11. Implement `loom inspect` command
12. Implement manifest validation in `loom doctor`
13. Write tests for add, list, inspect

**Deliverable:** `loom add button card input` works. `loom list` shows installed. `loom inspect button` shows manifest.

### Phase 3: Core JS Modules (Days 11–12)

**Goal:** Tiny utility modules for recipe controllers.

**Tasks:**
1. Write `registry/core/dom.js` — $, $$, closest, create
2. Write `registry/core/events.js` — delegate, once, onOutsideClick
3. Write `registry/core/focus.js` — trapFocus, releaseFocus, getFocusableElements
4. Write `registry/core/motion.js` — waitForTransition, prefersReducedMotion
5. Write `registry/core/store.js` — createStore observable
6. Write `registry/core/utils.js` — uid, clamp, debounce
7. Write unit tests for all core modules

**Deliverable:** All 6 core modules, <3KB total, fully tested.

### Phase 4: First Recipes (Days 13–18)

**Goal:** 3 interactive recipes proving the controller model.

**Tasks:**
1. Build `dialog` — html, css, js, manifest (reference recipe implementation)
2. Build `tabs` — html, css, js, manifest
3. Build `dropdown` — html, css, js, manifest
4. Build auto-init `loom.js` script
5. Update `loom add` to handle recipes (copies JS + adds to auto-init)
6. Write integration tests (recipe behavior)

**Deliverable:** `loom add dialog tabs dropdown` installs fully working interactive components.

### Phase 5: Audit & Repair (Days 19–24) — THE CORE PRODUCT

**Goal:** Working audit and repair system.

**Tasks:**
1. Build lightweight HTML parser (`src/parser/html-parser.ts`)
2. Build CSS token extractor (`src/parser/css-parser.ts`)
3. Define audit rule interface
4. Implement core audit rules:
   - `required-slot`
   - `required-aria`
   - `focus-trap`
   - `valid-variant`
   - `valid-state`
   - `controller-loaded`
   - `orphan-panel`
   - `orphan-part`
   - `aria-describedby`
   - `close-label`
   - `token-exists`
   - `reduced-motion`
5. Build audit reporter (terminal output + JSON mode)
6. Build repair engine (string-based HTML patching)
7. Implement `loom audit` command
8. Implement `loom repair` command
9. Write extensive tests with fixture HTML files containing various violations
10. Test repair idempotency (repair → audit should pass)

**Deliverable:** `loom audit` finds contract violations. `loom repair` fixes them deterministically.

### Phase 6: AI Context + Agent Commands (Days 25–27)

**Goal:** Context file generation and agent-intelligence commands.

**Tasks:**
1. Build context.json generator (`src/generator/context.ts`)
2. Build markdown context formatter
3. Build Claude Code skill generator (`src/generator/skill.ts`)
4. Implement `loom context` command (json, md, cursorrules formats)
5. Implement `loom explain` command
6. Implement `loom trace` command
7. Implement `loom conform` command
8. Write tests

**Deliverable:** `loom context` generates the AI superpower file. `loom explain dialog` gives structured knowledge.

### Phase 7: Remaining Components (Days 28–35)

**Goal:** Fill out to full MVP component set.

**Tasks:**
1. Remaining primitives: textarea, select, checkbox, radio, switch, spinner, kbd, stack, grid, surface
2. Remaining recipes: drawer, accordion, tooltip, toast, combobox, command-palette, table, select-custom, popover, pagination, sheet
3. Each with full: html, css, js (if recipe), manifest
4. Update auto-init script
5. Regenerate context.json

**Deliverable:** All 17 primitives + 15 recipes installed and auditable.

### Phase 8: Patterns + Themes (Days 36–40)

**Goal:** Composition patterns, additional themes, and scaffolding.

**Tasks:**
1. Build `auth-form` pattern
2. Build `dashboard-shell` pattern
3. Build `crud-table` pattern
4. Build `settings-page` pattern
5. Build `empty-state` pattern
6. Build `search-results` pattern
7. Build `midnight` theme
8. Build `paper` theme
9. Build `brutalist` theme
10. Implement `loom theme set`, `loom theme create`, `loom theme list`
11. Implement `loom scaffold` command
12. Implement `loom variant add/remove` commands

**Deliverable:** Full MVP with patterns, themes, and scaffolding.

### Phase 9: Polish + Ship (Days 41–45)

**Goal:** Documentation, testing, and npm publish.

**Tasks:**
1. Write README.md with examples
2. Write CONTRIBUTING.md
3. Write component gallery HTML page (self-hosted using Loom components)
4. Run full audit /statuson all components
5. Performance benchmarks (CLI speed, audit speed)
6. Edge case testing
7. Publish to npm as `@loom-ui/cli`
8. Create GitHub repository with CI

---

## 12. Anti-Patterns to Enforce

These are things that must NEVER happen in Loom. Encode them as linting rules.

1. **Never use class names for component identity.** Use `data-ui` only.
2. **Never use class names for state.** Use `data-state` only.
3. **Never hardcode color/spacing/shadow values in component CSS.** Use tokens.
4. **Never create a JS runtime that manages component lifecycle.** Controllers attach to existing DOM.
5. **Never import external dependencies.** Zero dependencies means zero.
6. **Never require a build step.** Everything must work by opening HTML in a browser.
7. **Never use JSX, template literals for HTML generation, or any compile-to-HTML syntax.**
8. **Never add routing, data fetching, state management beyond the tiny store, or SSR.**
9. **Never use `!important` in component CSS.**
10. **Never use IDs as CSS selectors in component CSS.** IDs are for ARIA relationships only.

---

## 13. Testing Strategy

### Unit Tests

- All CLI commands tested with fixture projects
- All audit rules tested with fixture HTML files
- All core JS modules tested
- Manifest validation tested

### Integration Tests

- `loom init` → `loom add button dialog` → `loom audit` → clean pass
- `loom init` → `loom add dialog` → break the HTML → `loom audit` → find issues → `loom repair` → `loom audit` → clean pass
- `loom context` generates valid JSON matching schema
- Theme switching applies correctly

### Fixture Files

Create `tests/fixtures/` with:
- `valid-dialog.html` — correct dialog markup
- `broken-dialog-no-aria.html` — missing ARIA attributes
- `broken-dialog-bad-variant.html` — invalid variant value
- `broken-dialog-orphan-panel.html` — panel with no matching trigger
- `broken-button-no-label.html` — icon-only button without aria-label
- `valid-full-page.html` — page with multiple components all passing audit

### Run Tests

```bash
bun test
```

---

## 14. Success Metrics

The MVP is successful if:

1. **`loom init` + `loom add` creates a working project in under 2 seconds.**
2. **An AI agent reading `.loom/context.json` can generate correct component HTML on first attempt.**
3. **`loom audit` catches 100% of contract violations defined in manifests.**
4. **`loom repair` fixes 80%+ of audit issues automatically.**
5. **The entire framework output (all CSS + JS) is under 30KB gzipped.**
6. **Zero external runtime dependencies.**
7. **All components pass WCAG 2.1 AA accessibility requirements.**
8. **The CLI has under 3 dependencies (Bun built-ins + maybe a CLI arg parser).**
