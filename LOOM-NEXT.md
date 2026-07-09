# LOOM-NEXT — The Loom UI 1.0 Overhaul Proposal

> A complete, staged plan to evolve Loom UI from a strong v0.1 prototype into the
> reference **agent-native UI framework**: broader component library, richer themes,
> a hardened reactive engine, first-class distribution (npm + CDN + MCP), framework
> bindings (Vue, React), a schema-driven forms layer, and a print/PDF story —
> without touching the pillars that make Loom what it is.

**Status:** Proposal — July 2026, rev. 2 (updated after syncing v0.1.2→v0.2.4 from GitHub)
**Baseline:** loom-ui-cli v0.2.4 — 53 components (30 primitives / 16 recipes / 7 patterns), 5 themes, 20 CLI commands, 470 tests, loom-core.js reactive engine **including `l-source`**
**Companion documents:** `LOOM-SPEC.md` (original spec), `docs/data-driven-rendering.md` (l-source design), `docs/for_craft.md` (craft/reportcraft document requirements), `flickering-napping-bumblebee.md` (loom-core plan)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Where Loom Stands Today — Honest Assessment](#2-where-loom-stands-today)
3. [The Pillars — What Does NOT Change](#3-the-pillars)
4. [Workstream A — Engine: loom-core 2.0](#4-workstream-a--engine-loom-core-20)
5. [Workstream B — Component Library Expansion](#5-workstream-b--component-library-expansion)
6. [Workstream C — Theme System 2.0](#6-workstream-c--theme-system-20)
7. [Workstream D — Forms, Data & Documents](#7-workstream-d--forms-data--documents)
8. [Workstream E — Agent-Native Surface 2.0 (MCP)](#8-workstream-e--agent-native-surface-20)
9. [Workstream F — CLI Hardening & Registry Protocol](#9-workstream-f--cli-hardening--registry-protocol)
10. [Workstream G — Distribution & Packaging](#10-workstream-g--distribution--packaging)
11. [Workstream H — Framework Bindings (Vue, React)](#11-workstream-h--framework-bindings)
12. [Workstream I — Quality Engineering](#12-workstream-i--quality-engineering)
13. [Workstream J — Docs Site & Showcase](#13-workstream-j--docs-site--showcase)
14. [Formery Alignment — Loom as Formery's Rendering Substrate](#14-formery-alignment)
15. [Phased Roadmap](#15-phased-roadmap)
16. [Risks & Mitigations](#16-risks--mitigations)
17. [Success Metrics](#17-success-metrics)
18. [Decision Summary](#18-decision-summary)

---

## 1. Executive Summary

Loom UI's core bet — **a five-attribute DOM protocol + machine-readable manifests + a
zero-dependency runtime, with AI agents as the primary consumer** — has been validated.
The v0.1 codebase is genuinely good: clean architecture, a working audit/repair loop,
a real reactive engine, 470 tests. What it needs now is not a rewrite; it needs
**depth, reach, and polish**:

- **Depth**: keyed list rendering, ~15 still-missing components, complete theme
  coverage, full controller test coverage, RTL correctness, a11y automation.
- **Reach**: a distribution story that doesn't require Bun (compiled CLI, CDN runtime,
  npm package family), an MCP server so *any* agent can drive Loom without a shell,
  and thin Vue/React bindings **generated from manifests**.
- **Polish**: docs site built with Loom itself, visual regression testing, size
  budgets, a stable 1.0 protocol and manifest schema.

Three strategic moves elevate this beyond incremental improvement:

1. **The MCP server** (`@loom-ui/mcp`). Loom claims to be agent-native; today that means
   "agents can run a CLI." An MCP server makes Loom the first UI framework an agent can
   operate as a *tool* — list components, fetch manifests, generate validated markup,
   audit, repair — with zero shell access. This is the same bet Formery makes, and the
   MCP directory is nearly empty of UI infrastructure.

2. **Manifest-driven codegen for bindings.** Vue and React bindings are not hand-written
   component libraries; they are *generated from the manifests*. The manifest stays the
   single source of truth; bindings can never drift. This also proves the manifest system
   is powerful enough to target any framework — the strongest possible validation of the
   architecture.

3. **The forms + documents layer** (`@loom-ui/forms` on top of the v0.2.x document
   foundation). v0.2.x already shipped the paged-media substrate — document
   pattern/theme/tokens, key-value, signature, page-break, callout, qr-code — driven by
   the craft/reportcraft use case (`docs/for_craft.md`). What remains is the
   JSON-Schema-to-Loom renderer, the validation contract, and running headers/footers,
   turning Loom into the exact substrate Formery *and* craft need: hosted forms rendered
   as tiny static HTML (white-label themeable via theme tokens) and PDF templates
   rendered from the same design system.

Everything below is organized as ten parallel workstreams and sequenced into six
releases (v0.2 → v1.0) in §15.

---

## 2. Where Loom Stands Today

### Strengths (verified in code)

| Area | Evidence |
|------|----------|
| Attribute protocol | Coherent, enforced end-to-end (CSS selectors, JS controllers, audit rules) |
| Manifest system | Rich schema: anatomy, slots, variants, states, a11y, tokens, safe/unsafe transforms |
| Reactive engine | Proxy reactivity, microtask-batched effects, expression cache, 154 tests; public API already has `Loom.data/store/directive/magic/plugin/controller` |
| Token system | 3-layer (palette → semantic → alias), oklch, consistent `@ui:tokens` headers |
| CLI | 20 commands, typo suggestions, dependency resolution, auto-bundling |
| Audit/repair | 12 rules, deterministic fixes, JSON output |
| Tests | ~470 across engine, CLI, audit, parsers |
| Agent surface | context.json, `--format md/cursorrules`, Claude Code skill + 6 reference docs |

### Shipped between rev. 1 of this proposal and now (v0.1.2 → v0.2.4)

Thirteen commits landed on GitHub that rev. 1 hadn't seen. They matter — several
proposed items already exist:

- **The document/print foundation** (driven by `docs/for_craft.md` — the
  craft/reportcraft-forma unification is a *second* internal consumer alongside
  Formery): `document` pattern with `@page` geometry, a PDF-optimized `document` theme,
  `tokens/document.css` + `doc-aliases.css` (page format/margins, document typography,
  doc-table tokens), and **8 new primitives** — `callout`, `description-list`,
  `field-group`, `image`, `key-value`, `page-break`, `signature`, `stat` — plus a
  `qr-code` recipe (e-factura payment codes) and a substantially enhanced `table`
  (tfoot, cell alignment, number/currency formats, compact print).
- **`l-source` shipped in loom-core.js** — Approach C from
  `docs/data-driven-rendering.md` is real (`l-source:name="/api/x"` with
  `.lazy/.optimistic/.poll/.key` modifiers), alongside `api-source.js` (Approach B) as
  the application-level escape hatch. Context and skill generators document both.
- **Engine hardening**: effect-flush loop guard (100-iteration cap) + new engine tests.

Inventory is now **53 components** (30 primitives, 16 recipes, 7 patterns) and
**5 themes**. This validates the proposal's direction — the document layer and
declarative data were its two boldest bets, and both were independently built before
rev. 2 was written.

### Gaps (July 2026 code audit, re-verified against v0.2.4)

**Engine**
- `l-for` is a naive full re-render: every list change destroys and rebuilds all nodes
  (loom-core.js `handleFor`). Loses focus, input state, scroll, animations. **Top engine defect.**
- No `l-else`/`l-else-if`; transitions are single-stage class toggles (no staged
  enter/leave, no collapse); no persist/intersect/mask-style plugins.
- The 15 original recipe controllers exist **twice** — inline in loom-core.js *and* as
  standalone `registry/recipes/*/*.js` files — and the drift is no longer theoretical:
  the new `qr-code` recipe exists **only** as a standalone file, so unlike every other
  recipe it is never auto-initialized by loom-core.
- `l-source` shipped with **zero tests** (`grep l-source tests/core/loom-core.test.ts`
  → 0 hits), no AbortController/teardown semantics review, and no audit-rule awareness.
- `l-for` child scopes use a hand-rolled delegating Proxy — a second, subtly different
  reactivity path.
- No TypeScript declarations for the `Loom` global.

**Components & CSS**
- ~15 commonly expected components still missing (alert-dialog, slider, skeleton,
  breadcrumb, context-menu, sidebar, input-otp, calendar, toggle-group, tree-view, …).
  `callout` and `stat` closed two of the gaps from rev. 1; the rest stand.
- **No icon system at all** — `[data-part="icon"]` slots exist but nothing fills them.
- RTL bugs: button-group uses physical `border-top-left-radius`/`margin-left`;
  table uses `text-align: left`. No logical-properties lint rule.
- `field-group` now exists, but the validation contract is incomplete: no enforced
  `aria-describedby`/`aria-invalid` wiring, no audit rule, no declarative validation
  runtime (§7.1).
- Literal value fallbacks leak into component CSS (e.g. `oklch(0 0 0 / 0.5)` in dialog.css)
  — violating the framework's own token rule.

**Themes**
- `default.css` overrides ~60 declarations vs ~96 in the other themes — its dark mode is
  the least complete. No machine-readable statement of what a theme covers.

**Quality**
- Only 3 of 15 recipe controllers have tests (dialog, dropdown, tabs). The 12 untested
  ones are the most complex (combobox, command-palette, date-picker, table…).
- No visual regression, no automated a11y checks, no CI pipeline in the repo.

**Distribution (most urgent)**
- The npm package ships **raw TypeScript** and `bin/loom` spawns `bun` against
  `src/index.ts`. Anyone without Bun on PATH gets an error message. This caps adoption
  at "people willing to install Bun first."
- No CDN story: you cannot try Loom on CodePen with two tags today.

**Tooling**
- HTML/CSS parsers are regex/state-machine based — fine for generated markup, fragile
  for arbitrary user HTML (comments, raw-text elements, `>` in attribute values).
- Skill generator emits a thin static template, not manifest-derived guidance.
- No `loom upgrade` — once a component is copied into a project, it is orphaned from
  registry improvements forever.

---

## 3. The Pillars

These are constitutional. Every workstream below is constrained by them.

1. **The five-attribute protocol is frozen.** `data-ui`, `data-part`, `data-state`,
   `data-variant`, `data-size`. No sixth attribute without a spec amendment. (One
   candidate amendment is proposed in §5.6 for density — as a *token modifier*, not a
   new protocol attribute.)
2. **Zero runtime dependencies.** Everything Loom ships to a user's page is plain HTML,
   CSS, and vanilla JS. The optional reactive engine stays a single `<script>` tag.
3. **You own the files.** Components are copied into the project, never imported from
   `node_modules` at runtime. Upgrades are explicit and diffable (§9.3).
4. **The manifest is the source of truth.** Anything derived (context, skill, bindings,
   docs) is *generated* from manifests, never hand-maintained in parallel.
5. **CSS targets attributes, references tokens, never uses classes.** The audit enforces
   the framework's own rules on the framework's own registry (§12.4 makes this literal).
6. **Agent-first, human-owned.** Every capability is machine-invokable (CLI/MCP/JSON)
   before it gets a pretty human surface.
7. **Simplicity survives.** Any feature that requires a build step in the *user's*
   project is rejected. Build steps in the *loom repo* (to produce single-file
   artifacts) are fine and encouraged.

---

## 4. Workstream A — Engine: loom-core 2.0

### A1. Keyed `l-for` (the flagship fix)

Replace destroy-all-rebuild with keyed reconciliation:

```html
<template l-for="task in tasks" l-key="task.id">
  <div data-ui="card">…</div>
</template>
```

- Key expression evaluated per item; fallback to index when `l-key` absent
  (with a dev-mode console hint for lists that reorder).
- Reconciler: build old-key → node map, walk new list, reuse nodes with matching keys
  (update the item binding in place — the per-item scope holds `item` as a reactive
  slot, so reuse means one property write, not re-processing), insert new, remove
  stale, and apply a longest-increasing-subsequence pass to minimize DOM moves.
- Preserves focus, selection, input state, and CSS transitions across re-renders.
- Budget: ≤ 150 lines added to core. Must ship with a stress test (1,000-row reorder,
  input-focus preservation, nested l-for).

### A2. Unify the controller source of truth

Today the recipe controllers are duplicated (inline in loom-core.js + standalone files),
and v0.2.x proved the failure mode: `qr-code` was added standalone-only, so it never
auto-initializes like the other 15 recipes. Invert the relationship:

- `registry/recipes/*/*.js` become the **only** source.
- A repo build script (`bun run build:core`) assembles `loom-core.js` from
  `src/core-src/engine.js` + all recipe controllers + plugins at release time.
- The shipped artifact stays a single dependency-free file — pillar intact — but drift
  becomes impossible and each controller is testable in isolation.
- Also emit `loom-core.min.js` + sourcemap, and per-file `dist/` copies for
  the CDN (§10).

### A3. Structural directive completeness

- `l-else` / `l-else-if` chains on sibling `<template>` elements.
- `l-for` over objects (`(value, key) in obj`) and integer ranges (already partially there).
- `l-if` scope caching so toggling doesn't re-compile expressions.

### A4. Transitions 2.0 — but Loom-flavored

Alpine solves transitions with per-stage classes; Loom's philosophy says **state lives
in attributes and CSS reacts**. So instead of copying `x-transition:enter-start`:

- `l-transition` gains named presets resolved to data attributes:
  `l-transition="fade"`, `l-transition="slide-up"`, `l-transition="scale"` — the engine
  sets `data-motion="enter|enter-active|leave|leave-active"` on the element during the
  lifecycle, and a new `registry/base/motion-presets.css` styles those states using
  motion tokens.
- Agents can now *audit* transitions (they're attribute-visible) — something no
  class-based transition system allows.
- `l-collapse` ships as a plugin (height auto-animation with `prefers-reduced-motion`
  fallback).

### A5. Official plugin set (`registry/core/plugins/`)

Each ≤ 2KB, self-registering via `Loom.plugin`, loadable as separate `<script>` tags or
bundled by `loom bundle --js`:

| Plugin | Directive(s) | Purpose |
|--------|--------------|---------|
| `loom-persist.js` | `l-persist` / `$persist()` | localStorage-backed reactive state |
| `loom-intersect.js` | `l-intersect` | IntersectionObserver enter/leave hooks (lazy sections, infinite scroll) |
| `loom-mask.js` | `l-mask` | Input masking (dates, phone, OTP — needed by input-otp recipe and Formery) |
| `loom-collapse.js` | `l-collapse` | Animated expand/collapse |
| `loom-validate.js` | `l-validate` | Declarative constraint validation for the `field-group` contract (§7.1) |

**`l-source` already landed in core in v0.2.x** — ahead of this proposal, which
validates the direction (it completes the story "an agent can build a full CRUD app
with zero imperative JS"). Remaining `l-source` work rather than net-new build: a test
suite (it currently has none), AbortController-based teardown on scope destruction,
a codified audit exemption (the `no-fetch` rule stays scoped to recipe controllers),
and error-state conventions aligned with `field-group`. Recommend it stays in core —
it is the flagship — with `api-source.js` kept as the documented escape hatch.

### A6. Developer experience & safety

- **`loom-core.d.ts`** — TypeScript declarations for the `Loom` global, published with
  the runtime package.
- **Dev diagnostics build** (`loom-core.dev.js`): expression error messages with the
  offending element outerHTML, warnings for unkeyed reordering lists, unknown
  directives, `l-html` usage notices. The production file stays lean.
- **`Loom.inspect(el)`** — returns `{ scope, directives, controller, state }` snapshot;
  `loom dev` injects a small overlay panel (toggled with a keyboard shortcut) that
  visualizes scopes and `data-state` live. Agents get the same data via
  `window.__LOOM_DEVTOOLS__`.
- **Size budgets enforced in CI**: engine ≤ 14KB gzip, engine+controllers ≤ 22KB gzip,
  each plugin ≤ 2KB gzip. A failing budget fails the build.
- Document the security posture explicitly: `new Function` evaluator ⇒ requires
  `'unsafe-eval'` CSP; `l-html` is unsanitized by design (like Alpine). Provide a
  written guidance doc; a CSP-safe evaluator is deliberately out of scope for 1.0
  (complexity vs the target audience of generated, trusted markup).

---

## 5. Workstream B — Component Library Expansion

Target: **53 → ~80 components**, closing the gap with the shadcn/Radix expectation set
while staying zero-dependency. (v0.2.x already contributed 8 primitives + qr-code from
the rev. 1 wishlist: stat, callout, field-group, image, key-value, page-break,
signature, description-list.)

### B1. New primitives (10)

| Component | Notes |
|-----------|-------|
| `alert` | Manifest alias/refinement of the shipped `callout` — agents searching for the universal name "alert" must find it; add optional `[data-part="dismiss"]` |
| `skeleton` | Loading placeholder; text/circle/rect variants; shimmer respects reduced-motion |
| `breadcrumb` | `<nav aria-label="Breadcrumb">` + `[data-part="item" separator current]` |
| `toggle` | Pressed-state button (`aria-pressed`); CSS-only |
| `toggle-group` | Single/multi select group (roving tabindex needs 20 lines JS → may land as recipe) |
| `icon` | The icon system — see B4 |
| `chip` | Tag/chip with optional dismiss part |
| `aspect-ratio` | `aspect-ratio` CSS wrapper |
| `collapsible` | `<details>/<summary>` based — zero JS, animated via `::details-content` |
| `link` | Styled anchor with external/muted variants (today text-links are unstyled) |

### B2. New recipes (11)

| Component | Key behavior |
|-----------|-------------|
| `alert-dialog` | Dialog variant with role="alertdialog", no dismiss-on-overlay, destructive confirm flow |
| `slider` | Single + range thumb, keyboard steps, `aria-valuenow`; the classic "hard one" |
| `context-menu` | Right-click menu reusing dropdown internals |
| `menubar` | Horizontal menu with submenus (desktop-app pattern) |
| `sidebar` | Collapsible app sidebar: rail/expanded/mobile-drawer states — highest-demand shadcn component |
| `input-otp` | Segmented one-time-code input (pairs with `loom-mask.js`) |
| `calendar` | Extracted from date-picker so it's usable standalone (availability grids, range pickers) |
| `tree-view` | Hierarchical list, `aria-expanded`, keyboard nav |
| `file-upload` | Drag-drop zone + file list; **no fetch** (emits events; upload is app code) |
| `tag-input` | Multi-value input combining chip + combobox behaviors |
| `carousel` | Scroll-snap based (CSS does the work), JS only for buttons/dots/a11y announcements |

Explicitly deferred past 1.0: `resizable`, `virtual-list`/data-grid virtualization,
`chart` (see B5), `hover-card` (popover variant covers it), `scroll-area`
(modern CSS `scrollbar-*` properties cover it — ship as a token recipe instead).

### B3. New patterns (6)

| Pattern | Composes | Why |
|---------|----------|-----|
| `wizard` | stepper, card, field-group, button | Multi-step forms — Formery's bread and butter |
| `pricing` | grid, card, badge, button, separator | Every SaaS landing page |
| `hero` + `feature-grid` + `site-footer` | text, stack, grid, button | Landing-page kit (today `loom scaffold landing-page` synthesizes ad-hoc) |
| `stats-dashboard` | stat, grid, card, table | Reporting pages |
| `inbox` | stack, avatar, badge, tabs, empty-state | List-detail split view |
| `form-page` | field-group, all inputs, wizard | Canonical schema-rendered form (the `@loom-ui/forms` reference output) |

### B4. The icon system

Zero-dependency constraint rules out icon fonts and runtime SVG fetching. Design:

- `data-ui="icon"` + `data-icon="{name}"`; rendering via **CSS mask-image with inline
  data-URI SVGs defined as tokens**:

```css
[data-ui="icon"] {
  width: 1em; height: 1em; display: inline-block;
  background: currentColor;
  mask: var(--icon) center / contain no-repeat;
}
[data-icon="check"]   { --icon: url("data:image/svg+xml,…"); }
[data-icon="chevron-down"] { --icon: url("data:image/svg+xml,…"); }
```

- Icons inherit `currentColor` automatically, size with font-size, and are pure CSS —
  auditable (`data-icon` values validated against the icon manifest) and themeable
  (a theme can restyle or even swap the icon set).
- Ship a curated ~120-icon set (MIT-licensed Lucide outlines, optimized, subsettable
  via `loom add icons --only check,x,chevron-down,…` which generates a trimmed
  `icons.css`).
- Manifest: `registry/primitives/icon/icon.manifest.json` lists every name — agents can
  enumerate and validate icon usage like any variant.

### B5. Charts — exploration track (post-1.0 package)

Dashboards need charts, but a charting engine violates the simplicity pillar if rushed.
Proposal: `@loom-ui/charts` as a **separate optional package** later; in core, ship only
CSS-only `sparkline` and `meter`/`progress` enhancements. Revisit after 1.0.

### B6. Density (the one protocol-adjacent addition)

Enterprise/internal tools need compact UIs. Rather than a sixth attribute, density is a
**token mode**: `[data-density="compact"]` on any container remaps the spacing/height
alias tokens (`--control-height-md`, `--space-*` multiplier) for its subtree. It's
implemented purely in `tokens/density.css`, documented in context.json, and never
touched by JS — so the five-attribute protocol stays intact while agents gain a
one-attribute way to build dense screens.

---

## 6. Workstream C — Theme System 2.0

### C1. Theme manifests

Every theme gains `{name}.theme.json`:

```json
{
  "name": "midnight",
  "version": "1.0.0",
  "mood": ["dark", "high-contrast", "technical"],
  "scheme": "dark",
  "dark_mode": "native",
  "tokens_overridden": ["color-bg", "color-primary", "…"],
  "tokens_inherited": ["space-*", "text-*"],
  "pairs_with": ["terminal"],
  "preview": "midnight.preview.html"
}
```

Agents can now *choose* a theme by mood, verify coverage, and the CI coverage matrix
(§C2) is generated from these files. `loom context` embeds the active theme manifest.

### C2. Coverage completeness — enforced

A generated test asserts every theme defines light+dark values (or declares
`"scheme": "dark"`-only) for **all 27 semantic color tokens** plus shadows. This
immediately flags today's `default.css` dark-mode gaps. New rule: a theme PR that
under-covers fails CI.

### C3. Six new themes (4 → 10)

| Theme | Character |
|-------|-----------|
| `aurora` | Vibrant gradient accents on deep neutral dark; modern SaaS look |
| `terminal` | Phosphor green/amber on near-black, mono type, sharp corners |
| `glass` | Translucent surfaces (`color-mix` + backdrop-filter), soft depth |
| `slate` | Conservative enterprise blue-gray; the "safe for banks" theme |
| `soft` | Pastel, large radii, friendly — consumer/health apps |
| `contrast` | WCAG AAA: 7:1 text contrast, visible focus everywhere, no low-contrast muted text — an accessibility statement theme |

Each ships light+dark (where meaningful), a manifest, and a preview page.

### C4. `loom theme generate` — parametric themes

Because the palette is oklch, generating a coherent ramp from one accent is pure math:

```bash
loom theme generate my-brand --accent "oklch(0.55 0.2 150)" --neutral cool --radius lg --scheme both
```

- Generates the 11-step accent ramp (fixed lightness/chroma curve, brand hue), maps
  semantic tokens, derives hover/active/subtle steps, computes dark-mode inversions,
  and **verifies contrast pairs** (primary vs primary-fg ≥ 4.5:1) before writing.
- Emits `themes/my-brand.css` + `my-brand.theme.json`.
- This is also the white-label mechanism for Formery: one brand color in → a complete
  customer theme out, deterministically (§14).

### C5. Scoped themes

Support `data-theme` on any subtree (already implied by CSS custom property cascade —
formalize and test it): a Loom page can render a "customer-themed" form inside a
"default-themed" dashboard. Required for Formery's form-preview-inside-admin case.

---

## 7. Workstream D — Forms, Data & Documents

The workstream that makes Loom the substrate for Formery — and for every CRUD app.

### 7.1 Harden `field-group` into a validation contract

v0.2.x shipped the `field-group` primitive (label + input slot + description + error,
`data-state="error|valid"`, `data-required`). What's missing is the *contract* — the
part agents and audits can rely on:

```html
<div data-ui="field-group" data-state="invalid">
  <label data-part="label" for="email">Email <span data-part="required">*</span></label>
  <input data-ui="input" id="email" aria-describedby="email-hint email-error" aria-invalid="true">
  <p data-part="description" id="email-hint">We never share it.</p>
  <p data-part="error" id="email-error">Enter a valid email address.</p>
</div>
```

Remaining work (enforced by new audit rules):
- Normalize the state vocabulary (`invalid|validating|disabled` — align the shipped
  `error` state with the rest of the framework's naming, with a manifest change note).
- `error` part visible only when invalid (CSS handles it — no JS toggling classes).
- `aria-describedby`/`aria-invalid` wiring is required and auto-repairable
  (`field-wiring` audit rule, §8.3).
- A small `loom-validate.js` plugin adds declarative constraint validation:
  `l-validate` on a form reflects native `ValidityState` into `data-state` + error parts,
  with custom validators via expression: `l-validate:email="isCompanyEmail(value)"`.

### 7.2 `@loom-ui/forms` — schema-driven rendering

A standalone, zero-dependency module (usable in Node, browser, or agent context):

```js
import { renderForm } from "@loom-ui/forms";
const html = renderForm(jsonSchema, uiSchema?, { theme, density, i18n });
```

- **Input**: standard JSON Schema (draft 2020-12 subset) + optional UI schema
  (widget choices, layout groups, wizard steps).
- **Output**: valid Loom markup — `field-group` wrappers, correct widgets per type/format
  (string+enum → select or radio-group by cardinality; string+format:date →
  date-picker; array of enum → checkbox group or tag-input; nested objects →
  fieldset cards; arrays of objects → repeatable groups), `wizard` pattern for
  multi-step, all audit-clean by construction.
- Client runtime: the rendered form works with `loom-core.js` + `loom-validate.js`
  alone — no `@loom-ui/forms` needed in the browser (it can run there for dynamic
  schemas, but the default is generate-then-serve static HTML).
- The generator is *itself tested with `loom audit`*: every rendered form must pass
  with zero findings. That's the quality contract.

This module is the direct bridge to Formery's Form Definition Language: FDL ⊃ JSON
Schema + UI schema, so Formery's hosted form renderer becomes a thin wrapper over
`@loom-ui/forms` (§14).

### 7.3 `l-source` — declarative data (status: shipped)

Landed in loom-core.js in v0.2.x, per the design in `docs/data-driven-rendering.md`.
Remaining hardening lives in §A5 (tests, teardown, audit codification). Together with
7.1/7.2, the full loop — *schema → form → validation → submission → refreshed list* —
needs zero imperative JS.

### 7.4 Documents & print — complete the shipped foundation

v0.2.x landed the core of this workstream: the `document` pattern with `@page`
geometry, the PDF-optimized `document` theme, document tokens (`--page-format`,
doc typography/table tokens), and the supporting primitives (page-break, signature,
key-value, description-list, callout, image, enhanced doc tables, qr-code). What
remains to make it a complete PDF-engine substrate:

- **Running headers/footers**: `doc-header`/`doc-footer` parts using
  `position: running()` with fixed-position fallbacks, so multi-page PDFs repeat brand
  headers and page numbers (CSS `@page` margin boxes where the renderer supports them).
- **Scaffolds**: `loom scaffold invoice` / `loom scaffold report` producing
  ready-to-print, audit-clean pages that exercise every document component.
- **More document themes**: the shipped `document` theme is the neutral base; add
  `document-serif` (contracts/legal) and teach `loom theme generate` (§C4) to emit a
  brand-matched document theme — one accent color drives both web and PDF.
- **`watermark` and `barcode`** (the remaining items from craft's wishlist in
  `docs/for_craft.md`): watermark as a CSS-only primitive; barcode (Code128) as a
  recipe following the qr-code pattern.
- **Print visual regression**: render reference documents to PDF in CI (headless
  Chromium) and image-diff them — the print layer needs the same regression safety as
  the screen layer (§12).

Rendered via any headless-Chromium PDF pipeline, a Loom document is deterministic,
brandable-by-token, and auditable — precisely Formery's PDF engine requirement (§14),
already proven by craft's document use case.

---

## 8. Workstream E — Agent-Native Surface 2.0

### 8.1 `@loom-ui/mcp` — the MCP server

The single highest-leverage addition for the "agent-native" claim. A stdio MCP server
(so it works in Claude Code, Cursor, and any MCP host) exposing:

| Tool | Behavior |
|------|----------|
| `loom_list_components` | Registry inventory with kind/category/description (filterable) |
| `loom_get_manifest` | Full manifest for a component |
| `loom_generate` | `{component, variant, size, slots, props}` → valid HTML (from templates, audit-verified before returning) |
| `loom_scaffold_page` | `{layout, sections}` → complete page HTML |
| `loom_render_form` | JSON Schema in → Loom form HTML out (wraps `@loom-ui/forms`) |
| `loom_audit_html` | HTML string in → findings JSON (no filesystem needed) |
| `loom_repair_html` | HTML in → repaired HTML + change log |
| `loom_theme_info` / `loom_generate_theme` | Theme manifests; parametric theme from accent color |
| `loom_project_context` | Reads the host project's `.loom/context.json` when run inside a project |

Resources: the protocol spec, token reference, and each manifest exposed as MCP
resources so hosts can pin them into context.

Design notes:
- The server wraps the same TypeScript internals as the CLI (one core, two frontends);
  it ships compiled JS, runs on plain Node (§10).
- `loom_audit_html`/`loom_repair_html` taking **strings** (not file paths) matters:
  cloud agents without filesystem access can still validate their output.
- Register in MCP directories at launch — the "forms/UI infrastructure" shelf is empty,
  same free-distribution wedge Formery is betting on.

### 8.2 Context & skill generation v2

- `loom context --format llms` → emit `llms.txt` + `llms-full.txt` for the project's
  installed set (the emerging convention agents actually look for).
- Skill generator becomes **manifest-derived**: per-component anatomy trees, variant
  tables, safe/unsafe transforms, and 2–3 canonical compositions — generated, not
  static boilerplate. The shipped `.claude/skills/loom-creator` skill is regenerated
  from the same pipeline (dogfooding rule §3.4).
- Publish `manifest.schema.json` at a stable URL (docs site, §13) and reference it via
  `$schema` in every manifest — third-party components get editor validation for free.

### 8.3 Audit v2

New rules (all deterministic, no network):

| Rule | Checks |
|------|--------|
| `duplicate-id` | IDs unique per document (breaks ARIA wiring otherwise) |
| `contrast-tokens` | Static contrast computation on oklch token pairs (fg/bg, primary/primary-fg) — feasible because tokens are parseable oklch |
| `logical-properties` | Flags physical `left/right` properties in component CSS (fixes the RTL class of bugs permanently) |
| `heading-order` | No skipped heading levels inside patterns |
| `landmark` | Pages have main/nav landmarks; dialogs aren't inside main flow |
| `field-wiring` | `aria-describedby`/`aria-invalid` consistency on `field-group` (§7.1) |
| `icon-name` | `data-icon` values exist in the icon manifest |

Plus: stable, versioned JSON output schema (`audit_schema_version`) so agent loops can
depend on it, and `loom audit --stdin` for pipe-based agent workflows.

---

## 9. Workstream F — CLI Hardening & Registry Protocol

### 9.1 Parser hardening (stay zero-dep)

Keep the no-dependency CLI, but replace the regex HTML scanner with a small
**spec-informed tokenizer** (~600 lines, vendored): handles comments, raw-text elements
(`<script>/<style>`), quoted attribute values containing `>`, and void elements
correctly, and records line/column for every node (better audit messages). Property-test
it against the existing fixture corpus + malformed-input fuzzing.

### 9.2 Remote registries — the shadcn-style protocol

Generalize the registry from "files inside the npm package" to a **protocol**:

```
registry-index.json        # { components: [{ name, kind, version, files, hash, deps }] }
{component}/…              # the files
```

- `loom add button` resolves from the bundled registry (default, offline-first).
- `loom add @acme/data-grid --registry https://ui.acme.dev/registry` fetches from any
  static host serving the index format; SHA-256 integrity hashes verified before write.
- `loom.config.json` gains a `registries` map so teams pin private component registries.
- This turns Loom into a platform: companies publish internal component sets, the
  community publishes packs, and Formery can publish a `@formery/loom` pack of
  form-specialized components.

### 9.3 `loom upgrade` — solving the copy-paste orphan problem

The known weakness of the copy-into-project model (shadcn included) is that upgrades
are manual. Loom can do better because it *knows what it wrote*:

- On `add`, store the pristine copy + version under `.loom/pristine/{component}@{ver}/`.
- `loom upgrade [component]` performs a **three-way merge**: pristine-old vs
  user-current vs registry-new. Clean hunks auto-apply; conflicts are written with
  conflict markers and reported (agents are excellent at resolving exactly these).
- `loom diff button` shows user drift vs pristine at any time.
- Registry components adopt semver discipline + a per-component CHANGELOG section in
  the manifest (`"changes": [{version, note, breaking}]`) so `upgrade` can print what
  changed and *why*.

### 9.4 Smaller DX wins

- `loom init --template {landing|dashboard|form-app|document}` — opinionated starting
  projects (playground pages promoted to maintained templates).
- `loom dev` gains live-reload on `.html`/`.css` change (it already serves; add SSE) and
  the devtools overlay injection (§A6).
- `loom bundle --js` — concatenate core + selected plugins into one `loom.bundle.js`
  mirroring the CSS bundle.
- Machine-readable `--json` on **every** command (some already have it; make it a
  guarantee tested in CI).

---

## 10. Workstream G — Distribution & Packaging

### 10.1 The problem, restated

Today: `npm i -g loom-ui-cli` → `bin/loom` → spawns **Bun** against **shipped
TypeScript source**. No Bun = hard failure. No CDN artifact exists. This is the single
biggest adoption blocker and the first thing to fix.

### 10.2 Package family

| Package | Contents | Consumers |
|---------|----------|-----------|
| `loom-ui-cli` (keep the name — it's published and short) | **Compiled** single-file CLI (`dist/loom.mjs`, built with `bun build --target=node`), registry files, launcher that prefers Bun if present but **runs fine on Node ≥ 18** | Developers, agents with shell |
| `@loom-ui/core` | `loom-core.js`, `.min.js`, `.dev.js`, plugins, `loom-core.d.ts`, prebuilt full CSS bundles per theme (`loom.{theme}.css`) | CDN users, bundler users, bindings |
| `@loom-ui/mcp` | Compiled MCP server (`npx @loom-ui/mcp`) | Any MCP host |
| `@loom-ui/forms` | Schema→Loom renderer (isomorphic) | Formery, form apps, MCP |
| `@loom-ui/vue` / `@loom-ui/react` | Generated bindings (§11) | Framework apps |
| `@loom-ui/registry` *(optional, later)* | Registry published standalone for the remote-registry protocol | Third-party tooling |

Action item: **reserve the `@loom-ui` npm org now** (and `loom-ui.dev` or similar
domain for the docs site + hosted registry/schema URLs).

### 10.3 The two-tag CDN story

The adoption funnel must start with zero installation:

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@loom-ui/core@0.2/dist/loom.default.css">
<script src="https://cdn.jsdelivr.net/npm/@loom-ui/core@0.2/dist/loom-core.min.js" defer></script>
```

Works on CodePen, in a Claude artifact, in any scratch HTML file. This is also how
agents *without* a shell can still produce runnable Loom pages — pin the CDN URLs in
the skill/context output. Publish SRI hashes alongside.

The CLI remains the *ownership* path (copy files, audit, theme, upgrade); the CDN is the
*trial and embed* path. Both are first-class.

### 10.4 Release engineering

- Extend `scripts/release.mjs` into a workspace-aware release (changesets or a simple
  fan-out): version-bump, build all dists, size-budget check, `npm publish` per package,
  git tag, GitHub release with generated notes.
- CI (GitHub Actions): test matrix (Bun latest + Node 18/20/22 for the compiled CLI),
  typecheck, audit-the-registry, size budgets, visual regression (§12).
- Provenance: `npm publish --provenance` once the repo is public CI-published.

---

## 11. Workstream H — Framework Bindings

### 11.1 Philosophy: bindings are glue, not forks

Loom's CSS already works in any framework — attributes are attributes. What frameworks
need is: (a) lifecycle management for recipe controllers, (b) idiomatic typed
components, (c) SSR safety. What they must **not** get is a parallel reimplementation
that drifts. Therefore:

> **All bindings are generated from manifests by `loom bindings <target>`.**

The manifest already knows the tag, slots, variants (with allowed values → union
types), states, and controller API. Codegen emits one component per manifest + a small
hand-written runtime (~150 lines per framework).

Inside Vue/React, **loom-core's directives are not used** — the host framework owns
reactivity; Loom contributes CSS, markup contracts, and controllers. Clean boundary,
no double-reactivity.

### 11.2 `@loom-ui/vue` (first — Formery's stack is Vue 3 + Inertia)

```vue
<script setup>
import { LButton, LDialog, LField, LInput } from "@loom-ui/vue";
const dialog = ref();
</script>

<template>
  <LButton variant="primary" size="lg" :loading="saving" @click="dialog.open()">Save</LButton>

  <LDialog ref="dialog" size="sm" tone="danger" @close="onClose">
    <template #title>Are you sure?</template>
    <template #body>This cannot be undone.</template>
    <template #footer>…</template>
  </LDialog>
</template>
```

- Generated component = render function emitting the exact manifest markup
  (`data-ui`/`data-part`/`data-variant` …), slots mapped to `data-part` slots, variant
  props typed as literal unions from the manifest, states exposed as props
  (`:loading` → `data-state="loading"`).
- Recipes: `onMounted(() => createDialog(el))`, `onBeforeUnmount(destroy)`; controller
  API surfaced via `defineExpose` (so `dialogRef.open()` works) and controller events
  re-emitted as Vue events.
- SSR/Inertia-safe: markup renders on the server as plain HTML (it *is* plain HTML);
  controllers attach on mount. `hidden` attributes in initial markup prevent FOUC.
- Styling stays 100% in the Loom CSS bundle — the package ships **no CSS of its own**;
  apps import `@loom-ui/core/dist/loom.{theme}.css` or their project bundle.

### 11.3 `@loom-ui/react`

Same codegen, React target: components with `forwardRef` + `useImperativeHandle`
exposing controller APIs, `useLoomController(ref, "dialog")` hook as the low-level
escape hatch, variant props as TS unions, RSC-compatible for primitives ("use client"
only on recipe wrappers).

### 11.4 What stays out of scope

No Svelte/Solid/Angular targets before 1.0 (the codegen architecture makes them cheap
to add later — that's the point). No attempt to expose `l-data` reactivity inside
frameworks.

---

## 12. Workstream I — Quality Engineering

1. **Controller test completion.** Author behavior tests for the 13 untested recipe
   controllers (combobox, command-palette, date-picker, popover, sheet, table,
   select-custom, toast, accordion, tooltip, drawer, pagination, qr-code) — happy-dom where
   sufficient, Playwright where real focus/keyboard semantics matter (focus trap,
   roving tabindex, typeahead).
2. **Visual regression.** Playwright screenshot suite: every component × every theme ×
   light/dark × LTR/RTL, generated from the reference `.html` files (no manual gallery
   maintenance). Run on PRs; diffs posted as artifacts.
3. **Automated a11y.** axe-core pass on every reference page and every pattern in CI;
   zero-violation policy for the registry.
4. **The registry audits itself.** `loom audit` runs against `registry/**` in CI with
   zero-finding policy — including the new `logical-properties` and token-literal rules
   (this catches the current dialog.css hardcoded oklch values and button-group RTL
   bugs, and prevents regressions forever).
5. **RTL remediation.** One-time sweep converting physical properties to logical
   (`padding-inline-start`, `inset-inline-end`, `text-align: start`, `border-start-start-radius`),
   plus `dir="rtl"` visual-regression coverage.
6. **Size budgets in CI** (per §A6) and bundle-report on every release.
7. **Fuzz the parsers** (§9.1) with malformed HTML corpus.

---

## 13. Workstream J — Docs Site & Showcase

- **Built with Loom itself, no build step** — the docs site is a Loom project generated
  by the CLI (`loom scaffold docs` eventually). It *is* the proof of the framework.
  Static hosting (Cloudflare Pages).
- Content generated from manifests: component pages (anatomy tree, variant matrix
  with live examples, state demos, a11y table, token list), token reference, theme
  gallery with instant switcher (one `data-theme` swap — the demo *is* the feature).
- **Interactive playground**: textarea + iframe + live `loom_audit_html` (compiled
  audit engine runs in the browser — it's zero-dep TS, it can) showing findings as you
  type. Nothing communicates "machine-checkable UI" better.
- `llms.txt` + `llms-full.txt` at the site root; `manifest.schema.json` and the
  registry index served at stable URLs (§8.2, §9.2).
- Copy-for-agents affordance on every example: one click copies markup + the CDN
  two-tag preamble.

---

## 14. Formery Alignment

How this overhaul maps onto the Formery PRD, point by point:

| Formery need | Loom deliverable |
|---|---|
| **Hosted/embeddable forms** — fast, white-label, no framework tax | Forms render as static Loom HTML + one CSS + one JS tag (~20KB total gzip). No React runtime on the public form. Embeds cleanly because attribute selectors can't collide with host-page classes — a genuinely better embed story than any class-based framework |
| **Schema-first (FDL → UI)** | `@loom-ui/forms` renders JSON Schema + UI schema → audit-clean Loom markup (§7.2). FDL compiles down to this; versioned FDL = versioned static HTML artifacts, diffable and immutable |
| **White-label theming per customer** | `loom theme generate --accent {brand-color}` produces a complete, contrast-verified customer theme from one input (§C4); scoped `data-theme` lets the Formery dashboard preview customer-themed forms inline (§C5) |
| **PDF engine** | The document layer **already shipped in v0.2.x** (document pattern/theme/tokens, key-value, signature, page-break, qr-code — built for the craft use case). §7.4 completes it: running headers/footers, invoice/report scaffolds, brand-matched document themes. One schema, one brand theme → web form *and* deterministic PDF via headless Chromium |
| **MCP-native operations** | `@loom-ui/mcp` (`loom_render_form`, `loom_audit_html`) gives Formery's own MCP server a rendering backend; the agent flow "create a patient intake form" terminates in Loom markup validated by Loom audit |
| **Vue 3 + Inertia dashboard** | `@loom-ui/vue` (§11.2) — the Formery admin uses the same design system as the forms it hosts; SSR-safe, Inertia-friendly |
| **Validation UX** | `field-group` contract + `loom-validate.js` (§7.1): errors, hints, aria wiring standardized and machine-auditable — GDPR-consent blocks become a pattern |
| **Wizard/multi-step intake** | `wizard` pattern (§B3) + stepper + `l-source` submission flow |
| **EU/self-hosted, zero supply-chain surface** | Zero runtime dependencies means the public form pages have *no third-party code at all* — an honest GDPR/security selling point Formery can put on the pricing page |

Formery is the *second* document-producing consumer: `docs/for_craft.md` documents the
craft (reportcraft/forma) unification that drove the v0.2.x document layer, including
Romanian specifics (e-factura QR codes, signature blocks, legal callouts). Two internal
consumers pulling on the same layer is the best possible pressure test before Formery
productizes it — and craft's "Recommendation: build l-source before unification" has
already been executed.

Sequencing note: the Formery-critical items are the `field-group` contract +
`@loom-ui/forms` + theme generator + `@loom-ui/vue` + document-layer completion — all
landing by the "Forms, Data & Documents" phase in the roadmap below, ahead of a Formery
build month. The document foundation shipping early (v0.2.x) de-risks that phase
substantially.

---

## 15. Phased Roadmap

Each phase is a shippable npm release. Estimates assume agent-assisted development at
the current pace of this repo. (Numbering starts at v0.3 — v0.2.x is already released
and, gratifyingly, delivered the document layer and `l-source` ahead of this plan.)

### v0.3 — "Foundation" (~2 weeks)
The unblockers. No new features until distribution and drift are fixed.
- Compiled CLI (`dist/loom.mjs`, Node ≥ 18, Bun optional) — kill the Bun requirement
- `@loom-ui/core` package + CDN artifacts + SRI; reserve `@loom-ui` org
- Controller de-duplication: recipes as single source, `build:core` assembly (§A2) —
  and register `qr-code` in the core bundle (currently standalone-only)
- Keyed `l-for` (§A1) + stress tests
- `l-source` hardening: test suite, AbortController teardown, audit exemption codified
- RTL sweep + `logical-properties` audit rule; fix button-group/table
- Default theme dark-mode completeness + theme coverage test (§C2)
- GitHub Actions CI: tests (Bun+Node matrix), typecheck, registry self-audit, size budgets

### v0.4 — "Surface" (~3 weeks)
- New primitives batch: alert (callout alias), skeleton, breadcrumb, toggle, icon (+set), chip, collapsible, link
- New recipes batch 1: alert-dialog, slider, sidebar, input-otp, calendar
- Controller tests for all 16 existing + new recipes (§12.1)
- Transitions 2.0 (`data-motion` presets) + `loom-collapse` plugin
- Themes: manifests for all 5; ship `aurora`, `slate`, `contrast`
- Audit v2 rules: duplicate-id, contrast-tokens, heading-order, field-wiring
- Visual regression + axe CI

### v0.5 — "Agents" (~2–3 weeks)
- `@loom-ui/mcp` server + directory listings
- Remote registry protocol + integrity hashes (§9.2)
- `loom upgrade` three-way merge + `loom diff` (§9.3)
- Context v2: `llms.txt`, manifest-derived skill generator, hosted `manifest.schema.json`
- Parser hardening + fuzz corpus (§9.1)
- `loom audit --stdin`, guaranteed `--json` everywhere

### v0.6 — "Forms, Data & Documents" (~2–3 weeks) ← *Formery enablement milestone*
Lighter than rev. 1 planned — the document foundation and `l-source` already shipped.
- `field-group` validation contract + `loom-validate.js` (§7.1)
- `@loom-ui/forms` (JSON Schema renderer, audit-clean guarantee)
- `loom-persist`, `loom-intersect`, `loom-mask` plugins
- Document completion: running headers/footers, invoice/report scaffolds,
  `document-serif` theme, watermark + barcode, print visual regression (§7.4)
- `loom theme generate` (parametric oklch themes, contrast-verified, incl. document variant)
- `@loom-ui/vue` bindings via manifest codegen
- `wizard` + `form-page` patterns

### v0.7 — "Ecosystem" (~3 weeks)
- `@loom-ui/react` bindings
- Recipes batch 2: context-menu, menubar, tree-view, file-upload, tag-input, carousel, toggle-group
- Patterns: pricing, hero/feature-grid/site-footer, stats-dashboard, inbox
- Docs site + in-browser audit playground (§13)
- Themes: `terminal`, `glass`, `soft`; density mode (§B6)
- Dev overlay / `Loom.inspect` devtools

### v1.0 — "The Standard" (~2 weeks stabilization)
- Protocol spec 1.0 + manifest schema 1.0 **frozen** (published, versioned)
- All budgets green, zero audit findings in registry, zero axe violations, visual suite stable
- `loom-core.d.ts` finalized; security guidance doc
- Migration notes v0.x → 1.0; `loom upgrade` handles the jump
- Announcement: docs site, MCP directories, Show HN, awesome-mcp lists

Total: roughly 14–15 focused weeks. Phases are independent enough that v0.6 can be
pulled earlier if a Formery month demands it (its only hard dependencies are v0.3 items
— and the document foundation it builds on is already released).

---

## 16. Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| **Scope creep breaks the simplicity pillar** | The pillar list (§3) is a written constitution; every PR description must state which pillar it touches. Deferred lists (§B2, §B5, §11.4) are explicit |
| **Keyed l-for introduces regressions in the engine** | Land behind the existing test suite + new 1,000-row stress/focus tests; the naive path remains as fallback for un-keyed lists |
| **Bindings drift from core** | Impossible by construction — they're generated from manifests in CI; a manifest change regenerates and re-tests bindings |
| **Registry grows faster than quality** | Registry self-audit + axe + visual regression are merge gates, not suggestions (§12.4) |
| **npm name/org squatting** | Reserve `@loom-ui` org and the docs domain in week 1 of v0.3 |
| **CSP-restricted environments reject `new Function`** | Documented limitation for 1.0; evaluator abstraction is isolated enough to add a CSP-safe interpreter post-1.0 if demand appears |
| **Solo-maintainer bandwidth** | Phases are shippable increments; each release is useful alone. The MCP server + docs generation are themselves agent-force-multipliers for maintaining the rest |

---

## 17. Success Metrics

- **Agent task success**: an agent given only the skill/MCP server produces an
  audit-clean, axe-clean page on the first attempt ≥ 90% of the time (measure with a
  scripted eval harness — build it in v0.4).
- **Time-to-first-render for a human**: < 60 seconds from reading the README (the CDN
  two-tag path).
- **Payload**: full-featured page ≤ 25KB gzip CSS+JS (vs ~45KB+ for React+component-lib
  equivalents).
- **Quality gates**: 0 registry audit findings, 0 axe violations, visual-diff stability,
  100% recipe controller test coverage.
- **Adoption**: npm weekly downloads across the family; MCP directory presence;
  ≥ 1 external registry published by someone else (the real platform signal).
- **Dogfood**: both craft (document generation) and Formery (hosted forms + PDF
  templates) run on Loom in production.

---

## 18. Decision Summary

The decisions this proposal asks you to ratify:

1. **Fix distribution first** (compiled Node-compatible CLI + `@loom-ui/core` CDN
   package) before any new features. *(v0.3)*
2. **Adopt the package family** under a reserved `@loom-ui` npm org, keeping
   `loom-ui-cli` as the CLI name. *(v0.3)*
3. **Recipes become the single controller source**; `loom-core.js` becomes a built
   artifact (fixes the qr-code drift already visible in v0.2.x). *(v0.3)*
4. **Keyed `l-for` via `l-key`** is the one engine-semantics change; harden the
   already-shipped `l-source` (tests, teardown, audit exemption) rather than rebuild it.
   *(v0.3)*
5. **Icons via CSS mask + data-URI tokens**, curated Lucide subset. *(v0.4)*
6. **Six new themes + theme manifests + parametric `theme generate`.** *(v0.4–0.7)*
7. **MCP server as a first-class product surface.** *(v0.5)*
8. **Remote-registry protocol + `loom upgrade` three-way merge** — Loom's answer to the
   copy-paste orphan problem. *(v0.5)*
9. **`field-group` validation contract, `@loom-ui/forms`, and document-layer
   completion** (running headers/footers, scaffolds, watermark/barcode) on top of the
   v0.2.x foundation — the Formery + craft substrate. *(v0.6)*
10. **Vue first, React second, both generated from manifests**; loom-core reactivity is
    never used inside framework bindings. *(v0.6–0.7)*
11. **Density as a token mode (`data-density`), not a protocol attribute** — the
    five-attribute protocol stays frozen. *(v0.7)*
12. **Docs site built with Loom, content generated from manifests, with an in-browser
    audit playground.** *(v0.7)*

The pillars stay. The protocol stays. The simplicity stays. What changes is that Loom
stops being a well-built prototype and becomes the thing its README already claims:
the framework AI agents reach for when they need to build a UI that a human is proud
to own.
