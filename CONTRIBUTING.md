# Contributing to Faqir UI

## Prerequisites

- [Bun](https://bun.sh) v1.3+ — for development, tests, and building the CLI bundle
- [Node.js](https://nodejs.org) ≥ 18 — the compiled CLI runs on plain Node (no Bun required at runtime)
- Git

## Setup

```bash
git clone <repo-url>
cd faqir-ui
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
  core-src/             Engine source (engine.js) — see "Assembling the engine"

registry/               Component registry (shipped with CLI)
  tokens/               Design token CSS files
  base/                 Reset and prose styles
  core/                 faqir-core.js (GENERATED) + JS utility modules
  primitives/           CSS-only components
  recipes/              CSS + JS interactive components
  patterns/             Composition templates
  themes/               Theme CSS overrides

scripts/                Build + release scripts (build-core.mjs, build-cli.mjs, …)

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

1. Add `{name}.js` — A controller module tagged `// @ui:controller {name}` and
   exporting `create{Name}(root)`.
2. Controllers must:
   - Prevent double-init with `root._faqir{Name}` check
   - Find parts with `[data-part="..."]` queries scoped to root
   - Express state changes by setting `root.dataset.state`
   - Return an API object with `destroy()` for cleanup
   - Be idempotent — calling twice on the same element is safe

3. Import only from `../../core/` modules. No external dependencies.

4. Run `bun run build:core` — the controller is auto-discovered and assembled
   into `registry/core/faqir-core.js`. You never register it or edit the engine
   bundle by hand (see "Assembling the engine" below).

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

## Theme Manifests

Every theme in `registry/themes/{name}.css` ships a sibling
`registry/themes/{name}.theme.json` — a machine-readable card that lets agents
choose a theme by mood/scheme, drives the CI coverage matrix, and is embedded
into `faqir context` as the active-theme block. Schema (validated by
`validateThemeManifest` in `src/theme-manifest.ts`, published as part of
`manifest.schema.json` in 0.5-07):

| Field | Type | Notes |
|-------|------|-------|
| `name` | string | Matches the stylesheet filename. |
| `version` | string | Semver. |
| `mood` | string[] | ≥ 1 agent-selectable descriptor (`dark`, `warm`, `high-contrast`, …). |
| `scheme` | `"light"` \| `"dark"` \| `"both"` | Which color schemes ship. Source of truth for the coverage matrix. |
| `dark_mode` | `"native"` \| `"none"` | `native` = explicit `[data-theme="dark"]` block; `none` requires `scheme: "light"`. |
| `tokens_overridden` | string[] | **Generated** — every custom property the CSS defines. |
| `tokens_inherited` | string[] | **Generated** — base surface tokens the theme leaves untouched. |
| `pairs_with` | string[] | Themes that compose/read well together (may be empty). |
| `preview` | string | A `{name}.preview.html` reference. |

`tokens_overridden` and `tokens_inherited` are **derived from the CSS — never
hand-write them.** Edit the editorial metadata seed in
`scripts/gen-theme-manifests.mjs`, then regenerate:

```
bun run gen:theme-manifests
```

The registry self-audit (`bun run audit:registry`) and the manifest consistency
test fail if a theme is missing a manifest, has a schema-invalid one, or if its
token fields drift from the stylesheet. To add a new theme: drop the `.css` in
`registry/themes/`, add a seed entry to the generator, and run it.

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

## Building the Node-Compatible CLI

The published package does **not** require Bun at runtime. `bun run build:cli`
compiles the TypeScript CLI into a single-file ESM bundle at `dist/faqir.mjs`
that runs on plain Node ≥ 18:

```bash
bun run build:cli          # → dist/faqir.mjs (bun build src/index.ts --target=node)
node dist/faqir.mjs list   # runs with no Bun on PATH
```

The build is reproducible: same source in → identical bundle out. Bun runtime
globals the CLI relies on (`Bun.file`, `Bun.write`, `Bun.Glob`, `Bun.serve`) are
polyfilled at runtime by `src/utils/runtime-shim.ts`, which is a no-op under the
Bun runtime.

### How the launcher picks a runtime

`bin/faqir` → `bin/launcher.mjs` chooses how to run:

| Situation                                  | Runtime + entry            |
| ------------------------------------------ | -------------------------- |
| `dist/faqir.mjs` present, Bun on PATH      | `bun dist/faqir.mjs`       |
| `dist/faqir.mjs` present, no Bun           | `node dist/faqir.mjs`      |
| Source checkout, no build yet, Bun on PATH | `bun src/index.ts` (dev)   |

Env overrides: `FAQIR_FORCE_NODE=1` forces the Node path; `FAQIR_BUN=/path/to/bun`
selects a specific Bun binary.

The published npm package ships `dist/` + `registry/` (not the raw `src/**`
TypeScript). Verify the packed contents with:

```bash
bun run build:cli && npm pack --dry-run
```

### Smoke test

`scripts/smoke-cli.sh` builds the bundle and drives it end-to-end with `node`
(the no-Bun runtime path). Run it via:

```bash
bun run smoke
```

## Assembling the engine (`build:core`)

`registry/core/faqir-core.js` is the shipped single-file engine. **It is a
generated artifact — do not edit it by hand.** It is assembled from two sources:

| Source | What it holds |
| ------ | ------------- |
| `src/core-src/engine.js` | The engine: reactivity, directives, expression evaluator, bridge, bootstrap, and the public plugin API. No recipe controllers. |
| `registry/recipes/{name}/{name}.js` | One ES-module controller factory per recipe, tagged `// @ui:controller {name}` and exporting `create{Name}(root)`. |

`bun run build:core` concatenates them:

```bash
bun run build:core          # → registry/core/faqir-core.js
```

Each controller is inlined into the engine's UMD closure as a self-contained
IIFE that returns its factory and registers it on `controllerRegistry`. The
`import { … } from "../../core/…"` lines are stripped during assembly — those
helpers (`trapFocus`, `onOutsideClick`, `debounce`, `uid`) already live in the
engine's scope. Wrapping each controller in its own IIFE keeps its local helpers
private, so controllers can never collide with each other or with the engine.

**To change engine behavior:** edit `src/core-src/engine.js`, then run
`bun run build:core`. **To change a controller:** edit its recipe `.js`, then run
`bun run build:core`. Adding a new recipe controller requires no wiring — it is
auto-discovered from `registry/recipes/*/*.js` and registered automatically.

The build is deterministic (controllers sorted by name, no timestamp in the
generated header), so the same sources always produce byte-identical output. The
generated file carries a provenance header listing the engine source, every
controller, and the package version. CI treats the committed `faqir-core.js` as
fresh — regenerate and commit it whenever you touch the engine or a controller.

## Building the icon set (`build:icons`)

The `icon` primitive is generated, not hand-written. `bun run build:icons`
(`scripts/build-icons.mjs`) reads the checked-in curation list and the vendored
Lucide (ISC) SVGs, optimizes each glyph, and emits the primitive's three files:

```bash
bun run build:icons          # → registry/primitives/icon/{icons.css, icon.manifest.json, icon.html}
```

| Input | What it is |
| ----- | ---------- |
| `scripts/icons/curated-icons.txt` | The curated name list (one per line; `#` comments ignored). **The source of truth for which icons ship.** |
| `scripts/icons/lucide/*.svg` | Vendored raw Lucide SVGs (pinned `lucide-static@1.24.0`), one per curated name. |
| `registry/primitives/icon/LICENSE.lucide` | Upstream attribution (full ISC text; some glyphs also carry Feather's MIT). |

Each glyph becomes a `[data-icon="{name}"] { --icon: url("data:image/svg+xml,…") }`
rule; the base `[data-ui="icon"]` rule paints `currentColor` through that data-URI
as a `mask`, so icons inherit color and size with `font-size` (`1em`) — no fonts,
no fetch, zero JS. The build is deterministic (names sorted, SVGs normalized, no
timestamp), so identical inputs produce byte-identical `icons.css`; CI treats the
committed artifacts as fresh (`tests/build/build-icons.test.ts` fails if they drift).

**To change the set:** edit `curated-icons.txt`, vendor any new SVG into
`scripts/icons/lucide/` (`curl -sSL https://unpkg.com/lucide-static@1.24.0/icons/<name>.svg -o scripts/icons/lucide/<name>.svg`),
then `bun run build:icons` and commit. Subsetting per-project (`faqir add icons --only …`) is task 0.4-05.

## Building the `@faqir-ui/core` runtime package (CDN artifacts)

`@faqir-ui/core` (in `packages/core/`) is the CDN/runtime package — the two-tag
adoption path (`<link>` + `<script>`). `bun run build:core-package` regenerates its
`dist/` from the registry:

```bash
bun run build:core-package   # → packages/core/dist/*
```

It emits:

| Artifact | What it is |
| -------- | ---------- |
| `faqir-core.js` | Canonical UMD engine (copied from `registry/core/faqir-core.js`). |
| `faqir-core.min.js` (+ `.map`) | Minified classic-script build. Bundled from `packages/core/src/cdn-entry.js` with `bun build --format=iife` so a plain `<script src>` sets `window.Faqir`. |
| `faqir.{theme}.css` | One full CSS bundle per `registry/themes/*.css`: all tokens + theme + base + every component, fully inlined (no `@import`). |
| `plugins/` | Official plugin drops (empty placeholder until the §A5 plugins land). |
| `sri.json` | SHA-384 subresource-integrity hashes for every file above. |

`packages/core/dist/` is a build output (gitignored, like the root `dist/`); tests and
`prepublishOnly` rebuild it. A live demo lives at `packages/core/examples/cdn-two-tag.html`.

**Size budget:** the build prints `faqir-core.min.js`'s gzip size. The §A6 engine budget
is ≤ 14KB gzip; today it runs slightly over because recipe controllers are still inlined
in the engine. The engine/controller split (0.3-03) and de-duplication (0.3-04) bring it
under budget — the build prints an explicit NOTE meanwhile.

Requires Bun to *build* the minified bundle (not to run the artifacts).

## Type Checking

```bash
bun run typecheck
```
