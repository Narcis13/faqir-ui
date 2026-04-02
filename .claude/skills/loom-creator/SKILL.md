---
name: loom-creator
description: Expert agent for the Loom UI framework — generates, audits, repairs, and explains zero-class, manifest-driven UI components and pages. Use when building HTML pages or components with Loom UI, when the user asks to create/modify/audit Loom UI markup, when working with data-ui/data-part/data-variant/data-state attributes, when generating page layouts using Loom tokens and primitives, or when creating new registry components (primitives, recipes, patterns). Triggers on any Loom UI task including component creation, page scaffolding, code auditing, token usage, reactive directive usage (l-data, l-model, l-for), and CLI operations.
---

# Loom Creator

Expert agent for the Loom UI framework. Generate class-free HTML using data attributes, design tokens, and manifest contracts.

## The Attribute Protocol

Every Loom component uses exactly five data attributes — this is the DOM contract.

| Attribute | Purpose | Example |
|-----------|---------|---------|
| `data-ui` | Component identity (root) | `data-ui="button"` |
| `data-part` | Named slot within parent | `data-part="trigger"` |
| `data-state` | Runtime state (JS-only) | `data-state="open"` |
| `data-variant` | Visual variant (set once) | `data-variant="primary"` |
| `data-size` | Size variant | `data-size="lg"` |

## Workflow

### When building pages or components

1. Read the relevant manifest(s) from `registry/` to confirm anatomy, slots, variants, states, ARIA requirements
2. Generate HTML using only data attributes — never CSS classes
3. Reference design tokens via `var(--token-name)` — never hardcode values
4. Include only the CSS files actually used
5. For recipes, ensure the full inner HTML structure exists (JS controllers query parts at init)
6. Add all required ARIA attributes per manifest

### When auditing code

1. Check for `class=` attributes (violation)
2. Check for missing required slots (`[data-part]`)
3. Check for missing ARIA attributes
4. Check for invalid variant values
5. Check for hardcoded colors/sizes in inline styles
6. Fix with `loom repair` or manually per manifest

### When creating new registry components

1. Start with the manifest — define anatomy, slots, variants, states, a11y
2. Create the file set: `.html`, `.css`, `.manifest.json` (+ `.js` for recipes)
3. Follow CSS conventions: attribute selectors only, token references only
4. Follow JS controller pattern for recipes (see [references/recipes.md](references/recipes.md))
5. Register controller in `loom-core.js` if recipe

## Component Inventory

**21 Primitives** (CSS-only): avatar, badge, button, card, checkbox, empty-state, grid, input, kbd, label, nav, progress, radio, select, separator, spinner, stack, stepper, surface, switch, text, textarea

**15 Recipes** (CSS + JS): accordion, combobox, command-palette, date-picker, dialog, drawer, dropdown, pagination, popover, select-custom, sheet, table, tabs, toast, tooltip

**6 Patterns** (composition, no JS): auth-form, crud-table, dashboard-shell, empty-state, search-results, settings-page

For exact HTML anatomy of each component, see:
- [references/primitives.md](references/primitives.md) — all primitives with markup
- [references/recipes.md](references/recipes.md) — all recipes with markup + JS patterns
- [references/patterns.md](references/patterns.md) — all composition patterns

## Page Template

Always follow this structure for full pages:

```html
<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Page Title</title>

  <!-- Tokens -->
  <link rel="stylesheet" href="ui/tokens/palette.css">
  <link rel="stylesheet" href="ui/tokens/spacing.css">
  <link rel="stylesheet" href="ui/tokens/typography.css">
  <link rel="stylesheet" href="ui/tokens/effects.css">
  <link rel="stylesheet" href="ui/tokens/motion.css">
  <link rel="stylesheet" href="ui/tokens/semantic.css">
  <link rel="stylesheet" href="ui/tokens/aliases.css">

  <!-- Base -->
  <link rel="stylesheet" href="ui/base/reset.css">

  <!-- Theme -->
  <link rel="stylesheet" href="ui/themes/default.css">

  <!-- Components (only what you use) -->
  <link rel="stylesheet" href="ui/primitives/button/button.css">

  <!-- Loom Core (for reactive directives + recipe auto-init) -->
  <script src="ui/core/loom-core.js" defer></script>
</head>
<body>
  <div l-cloak l-data="{ /* reactive state */ }">
    <div data-ui="surface" data-variant="flat" data-max="xl" data-size="lg">
      <div data-ui="stack" data-gap="6">
        <!-- Page content -->
      </div>
    </div>
  </div>
</body>
</html>
```

## Layout Patterns

```html
<!-- Page wrapper -->
<div data-ui="surface" data-variant="flat" data-max="xl" data-size="lg">

<!-- Header with actions -->
<div data-ui="stack" data-variant="horizontal" data-align="center" data-justify="between" data-wrap>
  <div data-ui="stack" data-gap="1">
    <h1 data-ui="heading" data-size="3">Title</h1>
    <p data-ui="text" data-size="sm" data-variant="muted">Subtitle</p>
  </div>
  <div data-ui="stack" data-variant="horizontal" data-gap="2">
    <button data-ui="button" data-variant="outline">Action</button>
    <button data-ui="button" data-variant="primary">Primary</button>
  </div>
</div>

<!-- Stats row -->
<div data-ui="grid" data-cols="4" data-gap="4" data-cols-sm="2">
  <div data-ui="card" data-size="sm">
    <div data-part="body">
      <p data-ui="text" data-size="sm" data-variant="muted">Metric</p>
      <p data-ui="text" data-size="xl" data-weight="bold">$1,234</p>
    </div>
  </div>
</div>

<!-- Form section -->
<div data-ui="card">
  <div data-part="header"><h2 data-part="title">Section</h2></div>
  <div data-part="body">
    <div data-ui="grid" data-cols="2" data-gap="4">
      <div data-ui="stack" data-gap="2">
        <label data-ui="label">Field</label>
        <input data-ui="input" placeholder="...">
      </div>
    </div>
  </div>
</div>

<!-- Settings toggle row -->
<div data-ui="stack" data-variant="horizontal" data-align="center" data-justify="between">
  <div data-ui="stack" data-gap="0">
    <span data-ui="text" data-weight="medium">Feature</span>
    <span data-ui="text" data-size="sm" data-variant="muted">Description</span>
  </div>
  <label data-ui="switch-label">
    <input data-ui="switch" type="checkbox" role="switch">
  </label>
</div>
```

## CLI Reference

```bash
loom init [--theme <name>] [--tokens-split] [--no-core] [--dir <path>]
loom add <component...>        # auto-resolves dependencies
loom list [--installed] [--available]
loom inspect <component>       # show manifest details
loom audit [--json]            # validate against manifests
loom repair                    # auto-fix audit issues
loom context                   # generate .loom/context.json for AI
loom explain <component>       # human-readable description
loom trace <component>         # show dependency graph
loom conform                   # normalize markup
loom theme set|list|create <name>
loom variant add|remove <component> <variant>
loom scaffold <pattern>        # generate page template
loom doctor                    # health check
```

Themes: `default`, `midnight`, `paper`, `brutalist`.

## Strict Rules

1. **NEVER** use `class=` attributes. Use `data-ui`, `data-variant`, `data-size`, `data-state`, `data-part`.
2. **NEVER** hardcode colors, spacing, or sizes. Use `var(--token-name)`.
3. **NEVER** use `!important`.
4. **NEVER** use IDs as CSS selectors. IDs are for ARIA relationships only.
5. CSS selectors **MUST** use attribute selectors: `[data-ui="button"]`, not `.btn`.
6. For inline styles, use tokens: `style="color: var(--color-primary)"`.
7. Include only the CSS files you actually use.
8. Recipes auto-initialize — include `loom-core.js` and write correct HTML with all required inner structure.
9. `data-state` is the **ONLY** attribute JS should modify dynamically.
10. Always add ARIA attributes as required by manifests.

## References

- [references/primitives.md](references/primitives.md) — All 21 primitives with HTML anatomy
- [references/recipes.md](references/recipes.md) — All 15 recipes with HTML anatomy, JS patterns
- [references/patterns.md](references/patterns.md) — All 6 composition patterns
- [references/tokens.md](references/tokens.md) — Design token reference
- [references/manifest.md](references/manifest.md) — Manifest JSON schema and examples
- [references/directives.md](references/directives.md) — loom-core reactive directives and API
