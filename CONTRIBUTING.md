# Contributing to Loom UI

## Prerequisites

- [Bun](https://bun.sh) v1.0+
- Git

## Setup

```bash
git clone <repo-url>
cd loom-ui
bun install
```

## Running Tests

```bash
bun test
```

Run a specific test file:

```bash
bun test tests/commands/audit.test.ts
```

## Project Structure

```
src/                    CLI source code (TypeScript)
  commands/             One file per CLI command
  audit/                Audit rules, checker, reporter, repairer
  parser/               HTML and CSS parsers
  generator/            Context and skill file generators
  utils/                File system, config, logger helpers

registry/               Component registry (shipped with CLI)
  tokens/               Design token CSS files
  base/                 Reset and prose styles
  core/                 JS utility modules
  primitives/           CSS-only components
  recipes/              CSS + JS interactive components
  patterns/             Composition templates
  themes/               Theme CSS overrides

tests/                  Test files mirroring src/ structure
  fixtures/             HTML fixtures for audit testing
```

## Adding a New Primitive

1. Create `registry/primitives/{name}/` with three files:
   - `{name}.html` — Reference markup showing all variants and states
   - `{name}.css` — Styles using token references only
   - `{name}.manifest.json` — Machine-readable contract

2. Follow these rules in the CSS:
   - Use `[data-ui="{name}"]` as the root selector
   - Use `[data-part="{slot}"]` for child slots
   - Reference tokens via `var(--token-name)` — never hardcode values
   - Include `@media (prefers-reduced-motion: reduce)` if animated
   - Add machine comments at the top: `/* @ui:component {name} */`

3. Follow the manifest schema — see `button.manifest.json` as a reference.

4. Add test fixtures in `tests/fixtures/` if needed.

5. Run `bun test` to verify nothing breaks.

## Adding a New Recipe

Same as primitives, plus:

1. Add `{name}.js` — A controller module exporting `create{Name}(root)`.
2. Controllers must:
   - Prevent double-init with `root._loom{Name}` check
   - Find parts with `[data-part="..."]` queries scoped to root
   - Express state changes by setting `root.dataset.state`
   - Return an API object with `destroy()` for cleanup
   - Be idempotent — calling twice on the same element is safe

3. Import only from `../../core/` modules. No external dependencies.

## CSS Conventions

- **Attribute selectors only.** `[data-ui="button"]`, not `.btn`.
- **No class names for state.** Use `[data-state="open"]`, not `.is-open`.
- **Token references only.** `var(--color-primary)`, never `#4f46e5`.
- **No `!important`.** Keep specificity low.
- **No IDs as CSS selectors.** IDs are for ARIA relationships only.
- **No `@import` between component CSS files.** Components depend on tokens only.

## Manifest Schema

Every manifest must include:

- `name` — lowercase kebab-case
- `version` — semver
- `kind` — primitive, recipe, pattern, or scaffold
- `category` — actions, forms, layout, navigation, data-display, feedback, overlay, typography, or composite
- `description` — one-line description
- `anatomy` — tag, selector, content_model
- `slots` — named insertion points with selector and required flag
- `variants` — grouped variant definitions with valid values
- `states` — component states with data-state mappings
- `a11y` — ARIA requirements, keyboard shortcuts, focus trap info
- `tokens_used` — token names referenced in CSS
- `templates` — HTML templates with placeholders
- `safe_transforms` / `unsafe_transforms` — what agents can and cannot modify
- `files` — relative paths to component files

## Commit Messages

Use imperative mood. Be concise. Focus on why, not what.

```
Add accordion recipe with single-expand mode
Fix dialog focus trap not releasing on close
Update button loading state spinner color
```

## Anti-Patterns

Do not:

1. Use class names for component identity or state
2. Hardcode color, spacing, or shadow values in component CSS
3. Create a JS runtime that manages component lifecycle
4. Import external dependencies
5. Require a build step
6. Use JSX or compile-to-HTML syntax
7. Add routing, data fetching, or SSR
8. Use `!important` in component CSS
9. Use IDs as CSS selectors in component CSS

## Running the CLI Locally

```bash
bun run src/index.ts init
bun run src/index.ts add button dialog
bun run src/index.ts audit
```

## Type Checking

```bash
bun run typecheck
```
