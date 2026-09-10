# FAQIR-PLAN-1.1 — Session-Sized Implementation Plan for 1.1 "Personality"

> Executable companion to `FAQIR-VISION.md` (§5 Theme System 2.0, §8 Rules, §10 Night
> Shift, and the **1.1** row of §11). Every task below is scoped to **one Claude Code
> session** (one focused sitting, one commit series, tests included). Tasks carry explicit
> **Tests** (written in the same session, never deferred) and **Acceptance criteria**
> (checked off in this file before the session ends).

**Baseline:** faqir-ui-cli v1.0.0 (`676bb9f`) · 86 components · 12 themes · 5 plugins · ~3,600 Bun tests
**Source of truth for *why*:** `FAQIR-VISION.md` (section references like §5.2 point there)
**Source of truth for *what may not change*:** `SPEC-1.0.md` — the five attributes are frozen; everything here is additive under its §8
**Ratified (2026-09-10):** the four decisions in `FAQIR-VISION.md` §13 — definitions are the platform contract; rules are JSON Schema + JSONLogic subsets; fonts are self-hosted OFL families installed by the CLI; Night Shift is PR-only and starts with themes

---

## How to run a session (protocol for Claude Code)

1. **One task per session.** Start a fresh session, name the task ID (e.g. "do 1.1A-04").
2. **Load context**: read this header, your task's entry, and only the files listed under
   *Touches* (plus whatever they import). Do not read other tasks or unrelated workstreams.
   `AGENTS.md` applies in full — in particular the generated-artifact rules and the
   happy-dom guidance (mount into a disposable container, never `Faqir.start()` on the
   shared document).
3. **Verify baseline**: run `bun run test` (never a bare `bun test` — see `AGENTS.md`)
   before writing anything. If red, stop and report — do not build on a broken baseline.
4. **Stay in scope.** If the task is genuinely bigger than one session, do the smallest
   coherent slice, then add a follow-up task row to the index (next free ID in the lane)
   instead of overrunning.
5. **Finish** means: all tests green, the task's acceptance boxes checked in this file,
   the status cell in the index flipped to ✅, every affected committed artifact
   regenerated (see the regeneration map), and work committed as
   `feat(<task-id>): <summary>` (use `fix`/`test`/`chore`/`docs` types where truer).
6. **Respect the invariants** (`FAQIR-VISION.md` §3): five-attribute protocol frozen, zero
   runtime deps, no build step in *user* projects, manifests are the source of truth,
   CSS targets attributes + tokens only, native platform features are feature-detected
   and never polyfilled, no new runtime feature may fail silently.

### Global definition of done (applies to every task, in addition to its own criteria)

- [ ] `bun run test` fully green (no skipped tests added) and `bun run typecheck` green.
- [ ] New/changed behavior has tests authored **in this session**.
- [ ] Registry files touched → `faqir audit` clean on them; manifests (and each stylesheet's `@ui:tokens` header) updated in the same commit; `bun run audit:registry` green.
- [ ] No new runtime dependencies; no new npm dependencies without a note in the commit body.
- [ ] Every committed generated artifact affected by the change regenerated and its `check:*` gate green (regeneration map below).

### Lanes and traversal

Three lanes and a release. **Lane A** (Look) and **Lane B** (Platform) share no task
dependencies and touch different parts of the tree; a second worktree may run Lane B
while Lane A proceeds. **Document order is the single-runner traversal**: a lone
`/faqir-plan next` walks A, then B, then N, then R. Night Shift (N) depends on Lane A's
generator and gates and nothing else.

There is no CI (`docs/release-checklist.md`). The Bun suite, typecheck and every `check:*`
gate run locally and again in `release.mjs --preflight`; the visual, print and a11y
Playwright suites are a judgement call per release, not a gate — which is why Lane A adds
browser-free gates (token drift, distinctiveness, coverage) for everything it changes.

### Regeneration map

| When you change… | Run | Gate |
|---|---|---|
| any `registry/tokens/*.css`, theme CSS, or the editorial seed in `scripts/gen-theme-manifests.mjs` | `bun run gen:theme-manifests` | `tests/themes/manifest.test.ts` |
| a theme's preview spec in `src/theme-preview.ts` | `bun run gen:theme-previews` | `tests/themes/theme-previews.test.ts` |
| a theme's CSS (bundles `faqir.<theme>.css` into the CDN package) | `bun run build:core-package` | `bun run check:core-package` |
| a component manifest, `registry/tokens/*.css`, the engine's `@ui:` declarations, a plugin header, or a generator | `bun run gen:skill` | `bun run check:skill` |
| any manifest's presence/name | `bun run build:registry-index` | `bun run check:registry-index` |
| `manifest.schema.json` | `bun run gen:schema-refs` | `bun run check:schema-refs` |
| `src/core-src/engine.js` or a recipe controller | `bun run build:core` | committed `registry/core/faqir-core{,.dev}.js` |
| `packages/rules/src/*` (from 1.1B-04 on) | `bun run build:rules-plugin` | `bun run check:rules-plugin` |
| `site/**` or anything the docs site renders | `bun run build:docs` | `bun run check:docs` |

### Dependency legend

`Depends:` lists task IDs that must be ✅ first. Tasks with no shared dependencies can be
done in any order (or in parallel worktrees). Every ID referenced is a 1.1 ID; the 1.0
plan is complete and is not consulted.

---

## Task index

### Lane A — Theme System 2.0 (Look)

| ID | Task | Status |
|----|------|--------|
| 1.1A-01 | Role tokens for type (`--font-heading/body/ui`, heading voice) + re-point every consumer | ✅ |
| 1.1A-02 | Shape & focus families (`--border-width-*`, `--focus-ring-*`, `--corner-shape`) + primitives re-pointed | ⬜ |
| 1.1A-03 | Shape & focus re-pointing for recipes + patterns + the literal-border drift gate | ⬜ |
| 1.1A-04 | Depth & material families (`--shadow-color`, `--surface-backdrop`, `--texture-*`, `textures.css`) + consumers | ⬜ |
| 1.1A-05 | Motion personality, decoration and control-silhouette tokens + consumers | ⬜ |
| 1.1A-06 | `light-dark()` authoring: parsers, gates, `color-scheme` mapping, `default` migrated, browser proof | ⬜ |
| 1.1A-07 | Manifest schema 1.1: optional `seed`, `axes`, `fonts`, `distinctiveness`, `visual_matrix`; SPEC §9 row | ⬜ |
| 1.1A-08 | `axesFromCss()` — the fourteen axes derived from CSS, written into every theme manifest | ⬜ |
| 1.1A-09 | Protocol amendment: `data-skin` as the fourth sanctioned modifier; `data-density="spacious"` | ⬜ |
| 1.1A-10 | Generator v2, core: seed → declarations for every axis family (pure, deterministic) | ⬜ |
| 1.1A-11 | Generator v2, surface: `theme generate --seed`/axis flags, `<name>.seed.json`, scorecard, `--out`, MCP parity | ⬜ |
| 1.1A-12 | Distinctiveness: axis distance + token-space ΔE, generator refusal, shipped-pair gate | ⬜ |
| 1.1A-13 | Visual & a11y matrix policy: `visual_matrix` honoured by `discoverThemes()`; patterns-only sweep for the rest | ⬜ |
| 1.1A-14 | Authored themes adopt the new families, batch 1: `glass`, `brutalist`, `terminal`, `paper`, `soft`, `aurora` | ⬜ |
| 1.1A-15 | Authored themes batch 2: `default`, `slate`, `midnight`, `contrast`, `document`, `document-serif`; pair gate armed | ⬜ |
| 1.1A-16 | New seed themes, batch 1: `editorial`, `swiss`, `neo`, `luxe`, `candy`, `organic` | ⬜ |
| 1.1A-17 | New seed themes, batch 2: `clinical`, `fintech`, `nordic`, `sunset`, `ink`, `neumorph` | ⬜ |
| 1.1A-18 | `faqir fonts add`: OFL catalog, self-hosted install, `ui/fonts.css`, bundle + doctor integration | ⬜ |
| 1.1A-19 | Scoped themes: `faqir theme bundle <name> --scope` on `data-skin` | ⬜ |
| 1.1A-20 | Docs & agent surfaces for Theme System 2.0 | ⬜ |

### Lane B — Rules (Platform)

| ID | Task | Status |
|----|------|--------|
| 1.1B-01 | `@faqir-ui/rules`: package, shape validator (JSON Schema subset), verdict shape, messages, golden corpus | ⬜ |
| 1.1B-02 | Logic: JSONLogic subset evaluator + `show`/`require`/`validate`/`compute`/`jump` + parity harness | ⬜ |
| 1.1B-03 | `faqir-validate`: programmatic validator registry, async validators, `validating` state | ⬜ |
| 1.1B-04 | `faqir-rules` plugin (`l-rules`) built from the package: visibility, requiredness, cross-field, computed, remote | ⬜ |
| 1.1B-05 | `faqir rules lint` + published `rules.schema.json` | ⬜ |
| 1.1B-06 | `@faqir-ui/forms` emits rules (`if/then/else`, `dependentRequired`, wizard page `when`) | ⬜ |
| 1.1B-07 | Docs, types and packaging for rules (README, skill, context, CDN, `faqir-core.d.ts`) | ⬜ |

### Lane N — Night Shift v0

| ID | Task | Status |
|----|------|--------|
| 1.1N-01 | `faqir-dream` skill, queue, ledger, `scripts/dream/theme.mjs`, PR-only guard | ⬜ |
| 1.1N-02 | Cadence: nightly runner, weekly digest, taste rubric v0 | ⬜ |

### Release

| ID | Task | Status |
|----|------|--------|
| 1.1R-01 | Release 1.1 "Personality" | ⬜ |

---

## Follow-up tasks (added by sessions per protocol rule 4)

| ID | Task | Origin | Status |
|----|------|--------|--------|

---

## Task details — Lane A

### 1.1A-01 · Role tokens for type + heading voice

**Depends:** — · **Ref:** §5.1, §5.2 (`type.*`), §5.3 · **Touches:** `registry/tokens/typography.css`, `registry/tokens/aliases.css`, `registry/tokens/document.css`, `registry/base/prose.css`, `registry/base/rhythm.css`, `registry/base/reset.css`, every component stylesheet that references `--font-sans` / `--font-serif` / `--font-mono` directly (27 files, 29 uses at baseline — `grep -rl "var(--font-sans)" registry/{primitives,recipes,patterns,base}`), their manifests' `tokens_used`, `tests/tokens.test.ts`

The reason twelve themes read as one: components consume *family* tokens (`--font-sans`),
so a theme cannot say "serif headings on a sans body". Add **role tokens** to
`typography.css`, defaulting to today's values so nothing renders differently:

```css
--font-heading: var(--font-sans);   /* h1–h6, hero headline, card/dialog titles, stat values, doc headings */
--font-body:    var(--font-sans);   /* prose, text, document body, descriptions */
--font-ui:      var(--font-sans);   /* controls: button, input, select, badge, chip, tabs, menus */
--heading-weight:    var(--weight-bold);
--heading-tracking:  0;             /* letter-spacing */
--heading-transform: none;          /* text-transform */
--heading-leading:   var(--leading-tight);
```

Re-point every consumer: `--button-font`/`--input-font`/`--badge-font` aliases → `--font-ui`;
`--doc-font` → `--font-body`, `--doc-heading-font` → `--font-heading`; `prose`/`rhythm`
headings and every pattern headline read `--font-heading` + the four voice tokens;
`text` reads `--font-body`; `kbd`/`code-block`-style mono stays on `--font-mono` (the only
family token a component may still read directly). Update each touched stylesheet's
`@ui:tokens` header and manifest `tokens_used`.

**Tests**
- `tests/tokens/role-tokens.test.ts` (new): (a) the seven role/voice tokens exist in `typography.css` with the documented defaults; (b) **no** stylesheet under `registry/{primitives,recipes,patterns,base}` references `var(--font-sans)` or `var(--font-serif)` — `--font-mono` is allow-listed by name; (c) every `h1`–`h6` rule in `base/prose.css`, `base/rhythm.css` and every `[data-part="headline"|"title"]` rule in the patterns reads `--font-heading`; (d) rendered in happy-dom through a real property (`font-family` on a `<button data-ui="button">` and on `[data-ui="prose"] h2`), the default chain resolves to the same `system-ui` stack as before the change (byte-equal computed strings).
- `tests/themes/coverage.test.ts` and `tests/themes/manifest.test.ts` stay green with the surface grown by seven tokens (they are data-driven; assert the count moved by exactly seven in `manifest.test.ts`).
- The `--json` meta-test and `check:skill` still pass after `gen:skill`.

**Acceptance criteria**
- [x] Seven role/voice tokens exist and every heading, body and control surface in the registry consumes them; direct `--font-sans`/`--font-serif` use is zero and gated. (`registry/tokens/typography.css` publishes `--font-heading/-body/-ui` plus the four voice knobs. The plan's census counted the bare form — 29 uses in 27 files; the gate the Tests block asks for covers the fallback form too, so the real pass was **72 uses across 64 stylesheets**, each classified by role rather than renamed in bulk: controls and floating chrome → `--font-ui` (44), content surfaces → `--font-body` (17), headings → `--font-heading`, and the eleven `var(--doc-font, …)` chains keep the document face first with the body role as their floor. Ten heading surfaces that previously only *inherited* a family now name the role — `card`/`dialog`/`drawer`/`sheet`/`alert-dialog`/`callout`/`empty-state` titles, the `stat` value, and every pattern headline — so a theme's type pairing reaches the surfaces a reader looks at first. `tests/tokens/role-tokens.test.ts` (28 cases) is the gate: it sweeps all 102 component/base stylesheets for `var(--font-sans|serif)` and reports the offenders with file and line, asserts the sweep is not vacuous, and keeps `--font-mono` allow-listed by name — `kbd`, `code`, `pre` and the barcode caption still read it, because "this is code" is a semantic choice, not a stylistic one. One deviation from the snippet in this task: `--heading-tracking` is `0em`, not `0`, because `calc(-0.01em + 0)` is invalid CSS (length + number) and would have silently dropped the heading primitive's optical tightening; the unit is what lets a theme's tracking ADD to a heading's own, which `[data-ui="heading"]` now does at all three sizes.)
- [x] No visual change at defaults: computed `font-family` strings on a control and a heading are byte-equal before/after (asserted), and no theme's `tokens_overridden` changed (`gen:theme-manifests` produces a diff only in `tokens_inherited`). (Measured, not argued, and in a real engine rather than the shim: every component's canonical fragment was rendered in **Chromium** against the pre-task tree and against this one, and all six type properties — family, weight, line-height, size, transform, tracking — compared element by element. **4,160 elements × 6 readings: four differences**, all of them one deliberate fix. `[data-variant="report"]` used to set `font-family: var(--font-serif, …)` on the document root, which its own nested doc primitives then overrode with their `var(--doc-font, …)` chain — a callout and a page-break rendered *sans inside a serif report*. The variant now re-points `--doc-font` for its subtree, so the report is serif all the way down; the report root and its body copy are byte-identical to before. `letter-spacing: 0em` and `text-transform: none` compute to `normal`/`none` in Chromium, so the two voice properties added to every heading are true no-ops (happy-dom reports `0px`, which is a shim artifact, not a rendering one). On the theme side `gen:theme-manifests` produced **84 pure insertions across 12 manifests and zero deletions** — seven `tokens_inherited` entries each, no `tokens_overridden` line touched anywhere.)
- [x] `@ui:tokens` headers and `tokens_used` updated on every touched component; `audit:registry`, `check:skill`, `check:core-package` green. (67 manifests and their stylesheet headers rewritten from the CSS the component actually references, as a surgical text edit rather than a JSON round-trip — the first attempt reformatted every hand-authored manifest into 1,697 changed lines, which is churn a reviewer cannot read past, so the entries are substituted in place and the file's own layout survives. All six `audit:registry` gates green, including var() resolution, which is what proves the seven new names are real tokens and not typos. Generated artifacts regenerated and re-gated: `gen:skill` (the skill's token reference grew to 308 tokens, typography 20 → 27, with the two new groups rendered as their own sections), `build:registry-index`, `build:core-package` (`cdn.json` re-hashed; 44.74 KB ≤ 45.00 KB gzip budget), and `build:docs`. The docs site needed source work, not just a rebuild: `src/generator/docs.ts` derived a token's preview property from its NAME PREFIX, and the four `heading-*` tokens are the one family where that fails — each drives a different property — so `HEADING_VOICE_PROPERTY` now names them, the typography page splits "Font families" (the palette) from "Font roles" (what components read), and a "Heading voice" section renders the four; `tests/generator/docs-foundations.test.ts` gained the same mapping.)

---

### 1.1A-02 · Shape & focus families + primitives re-pointed

**Depends:** — · **Ref:** §5.2 (`shape`, `focus`), §5.3 · **Touches:** `registry/tokens/effects.css`, `registry/tokens/aliases.css`, `registry/base/reset.css`, every `registry/primitives/*/*.css` with a literal `border[-*]: <n>px` or a literal `outline:` (baseline census: 139 literal borders in 51 files and 42 literal outlines across the registry; this task takes the primitives' share), their manifests

Add the **shape** family to `effects.css`:

```css
--border-width-sm: 1px;  --border-width-md: 2px;  --border-width-lg: 3px;
--border-width:        var(--border-width-sm);   /* the default component border */
--border-width-strong: var(--border-width-md);   /* emphasis: focused input, active tab, featured tier */
--corner-shape: round;                            /* progressive: bevel | scoop | notch where supported */
```

and the **focus** family (consumed in exactly one place, `reset.css`, and by the 42
components that today draw their own ring):

```css
--focus-ring-width: 2px;  --focus-ring-offset: 2px;  --focus-ring-style: solid;
--focus-ring-color: var(--color-ring);  --focus-shadow: none;   /* glow themes set a box-shadow */
```

`reset.css` `:focus-visible` reads the five focus tokens. Every literal border width in the
**primitives** becomes `var(--border-width)` / `var(--border-width-strong)` (or a
component alias that resolves to one — `--card-border-width`, `--input-border-width` are
added to `aliases.css` here so 1.1A-05 can point control silhouettes at them); every
literal `outline:` in the primitives reads the focus tokens. Add `corner-shape: var(--corner-shape)`
to `button`, `card`, `surface`, `input`, `badge`, `dialog` — a browser that lacks the property
ignores it; a value the browser lacks resolves to `round`.

**Tests**
- `tests/tokens/shape-focus.test.ts` (new): the families exist with the documented defaults; `reset.css`'s `:focus-visible` rule contains no literal length or colour; a happy-dom render of `[data-ui="card"]` and `[data-ui="input"]` reports `border-width` unchanged at defaults (`1px`).
- Drift gate, scoped to primitives in this task (widened in 1.1A-03): no `registry/primitives/**/*.css` contains `border[-a-z]*:\s*[0-9.]+px` or `outline:\s*[0-9]` — with an explicit, commented allow-list for `0` and hairline `--space-px` uses.
- `tests/themes/focus-ring.test.ts` still passes (the ring colour token is unchanged); extend it to assert `--focus-ring-width` is a surface token every theme inherits or overrides.

**Acceptance criteria**
- [ ] Shape and focus families exist; `reset.css` is the single owner of the default focus ring and reads only tokens.
- [ ] Zero literal border widths and zero literal outlines remain in `registry/primitives/`, gated.
- [ ] No visual change at defaults (computed `border-width` and `outline-width` asserted); manifests and headers updated; `audit:registry` green.

---

### 1.1A-03 · Shape & focus re-pointing: recipes + patterns + the drift gate

**Depends:** 1.1A-02 · **Ref:** §5.3 · **Touches:** every `registry/recipes/*/*.css` and `registry/patterns/*/*.css` with a literal border width or outline, their manifests, `tests/tokens/shape-focus.test.ts`

Finish the sweep 1.1A-02 started: recipes and patterns read `--border-width*`,
`--focus-ring-*` and `--focus-shadow`; components that visibly rely on a thick rule
(`pricing` featured tier, `tabs` active indicator, `stepper` markers, `table` header rule)
read `--border-width-strong` so a `heavy` shape theme thickens them together. Widen the
drift gate to the whole registry and make it the permanent rule.

**Tests**
- `tests/tokens/shape-focus.test.ts`: the literal-border and literal-outline gates now cover `registry/{primitives,recipes,patterns,base}` with the allow-list unchanged; a case per recipe/pattern family that the re-pointed rule resolves to the same computed value at defaults.
- Controller suites in `tests/recipes/*` untouched and green (CSS-only change).

**Acceptance criteria**
- [ ] Zero literal border widths and outlines across the registry; the gate is registry-wide.
- [ ] `--border-width-strong` is consumed by every emphasis rule named above (asserted by selector presence).
- [ ] Manifests/headers updated; `audit:registry`, `check:core-package`, `check:skill` green.

---

### 1.1A-04 · Depth & material families

**Depends:** 1.1A-03 · **Ref:** §5.2 (`depth`, `material`) · **Touches:** `registry/tokens/effects.css`, new `registry/tokens/textures.css`, `registry/tokens/index.css`, `registry/tokens/aliases.css`, `registry/base/reset.css`, `registry/primitives/{surface,card}/`, `registry/recipes/{dialog,popover,drawer,sheet,dropdown,tooltip,toast}/*.css`, `registry/patterns/{hero,document}/*.css`, `src/theme-manifest.ts` (`NON_SURFACE_TOKEN_FILES` decision), `tests/themes/theme-coverage.ts`

**Depth.** Shadows gain a colour channel so a theme tints or removes them without
rewriting five values: `--shadow-color: 0 0 0;` (OKLCH channels) and every `--shadow-*`
in `effects.css` becomes `… oklch(var(--shadow-color) / <alpha>)`. Add
`--surface-backdrop: none;` consumed as `backdrop-filter: var(--surface-backdrop)` by
`surface[data-variant="overlay"]`, `card`, and the floating recipes, inside the same
`@supports` guard `glass.css` already uses — so `glass` can become tokens in 1.1A-14
instead of selecting components from the theme. The 8 literal `box-shadow` values in the
registry census move to the ramp or to a new alias (`--button-shadow: none`,
`--popover-shadow: var(--shadow-lg)`).

**Material.** `textures.css` ships named, `currentColor`-tinted SVG data-URI backgrounds:
`--texture-grain`, `--texture-paper`, `--texture-dots`, `--texture-grid`, `--texture-stripes`,
`--texture-mesh` (a soft gradient mesh). Consumers read two role tokens:
`--texture-page: none` (`body` and `document`) and `--texture-surface: none` (`surface`,
`card`, `hero`). A theme sets `--texture-page: var(--texture-grain)`. Textures are
excluded from the *themeable surface* (add `textures.css` to `NON_SURFACE_TOKEN_FILES`,
with the same reasoning as `density.css` documented beside it) so `tokens_inherited` does
not list six data URIs; the two role tokens live in `aliases.css` and are surface.

**Tests**
- `tests/tokens/depth-material.test.ts` (new): every `--shadow-*` reads `--shadow-color`; no literal `box-shadow` colour remains in component CSS (gate, allow-list `none`); `--surface-backdrop` defaults to `none` and is consumed only inside a `@supports` backdrop-filter guard; each named texture is a valid `data:image/svg+xml` URI whose SVG parses (happy-dom `DOMParser`) and uses `currentColor`; `NON_SURFACE_TOKEN_FILES` contains `textures.css` and the manifest generator's surface count moved by exactly the two role tokens.
- `tests/themes/contrast.test.ts` / `focus-ring.test.ts` unchanged and green — the `oklch(var(--shadow-color) / a)` form is never a contrast pair (assert the pair list does not include a shadow).
- Print: `tests/visual/print` unaffected (documents keep `--texture-page: none` under `document` theme — asserted by parsing `registry/themes/document.css` overrides).

**Acceptance criteria**
- [ ] Depth family (`--shadow-color`, `--surface-backdrop`, shadow aliases) and material family (`textures.css`, `--texture-page`, `--texture-surface`) exist and are consumed as specified.
- [ ] Zero literal box-shadow colours in the registry, gated.
- [ ] No visual change at defaults (all textures `none`, backdrop `none`, shadow channels `0 0 0`); manifests regenerated; `audit:registry`, `check:core-package` green.

---

### 1.1A-05 · Motion personality, decoration and control-silhouette tokens

**Depends:** 1.1A-04 · **Ref:** §5.2 (`motion`, `decoration`, `controls`), §7.3 · **Touches:** `registry/tokens/motion.css`, `registry/tokens/aliases.css`, `registry/base/reset.css`, `registry/base/motion-presets.css`, `registry/primitives/{link,separator,button,input,checkbox,switch,select,textarea,card}/*.css`, `registry/recipes/{table,tabs}/*.css`, `registry/base/prose.css`, `registry/tokens/density.css` (alias re-declaration list), `tests/tokens/density.test.ts`

**Motion.** `motion.css` gains the personality knobs a theme sets as a group:
`--ease-spring: linear(0, 0.3 6%, 0.7 13%, 0.95 20%, 1.03 27%, 1 40%, 1)` (documented as
a spring curve; replaced by a `cubic-bezier` fallback only where `linear()` is unsupported
via `@supports (animation-timing-function: linear(0, 1))`), `--motion-hover-lift: -1px`,
`--motion-stagger: 40ms`, `--motion-blur: 4px`. `button`/`card` hover translate reads
`--motion-hover-lift`; presets keep reading `--motion-*`.

**Decoration.** `--link-decoration: underline`, `--link-underline-offset: 0.15em`,
`--link-thickness: 1px`, `--divider-style: solid`, `--selection-bg: var(--color-primary-subtle)`,
`--selection-fg: var(--color-fg)`, `--marker-color: var(--color-primary)`; consumed by
`link`, `separator`, `::selection` in `reset.css`, and `prose` list markers.

**Controls.** `aliases.css` gains the silhouettes a theme flips:
`--input-border-width: var(--border-width)` (an underline theme sets `0 0 var(--border-width) 0`),
`--input-bg-filled: var(--color-bg-subtle)` + `--input-fill: none` (a filled theme sets
`--input-fill: var(--input-bg-filled)` and `input` reads `background: var(--input-fill, var(--input-bg))`),
`--checkbox-radius: var(--radius-sm)`, `--switch-radius: var(--radius-full)`,
`--button-text-transform: none`, `--table-stripe: transparent`. Consumers updated.
Every alias added here whose value references a spacing/control token is re-declared in
`density.css` — the existing drift test says exactly which.

**Tests**
- `tests/tokens/motion-decoration-controls.test.ts` (new): tokens exist with defaults; `link` resolves `text-decoration-line` from `--link-decoration`; `input` reads `--input-border-width` (happy-dom `border-bottom-width` under an underline override applied on a container); `checkbox` radius follows `--checkbox-radius`; the spring easing is wrapped in the `@supports` guard with a cubic-bezier fallback.
- `tests/tokens/density.test.ts` green after the alias list grows (it fails until `density.css` re-declares the new spacing-dependent aliases — that failure is the test doing its job; fix by re-declaring).
- `tests/base/*` motion tests unchanged.

**Acceptance criteria**
- [ ] Motion, decoration and controls token families exist and are consumed by the named components; no component hardcodes an easing, a link decoration or an input silhouette.
- [ ] `density.css` re-declares every new spacing-dependent alias (drift test green).
- [ ] No visual change at defaults; manifests regenerated; `audit:registry`, `check:skill` green.

---

### 1.1A-06 · `light-dark()` authoring

**Depends:** — · **Ref:** §5.4 · **Touches:** `src/utils/oklch.ts` (`parseThemeValues`), `tests/themes/theme-coverage.ts` (`parseThemeSchemes`), `src/audit/contrast-tokens.ts` (only if `buildSchemeLookups` needs it), `registry/base/reset.css` (or `registry/tokens/semantic.css`), `registry/themes/default.css`, `src/commands/theme-generate.ts` (`renderThemeCss`/`renderDarkBlocks`), `scripts/gen-theme-manifests.mjs` (no change expected — assert), `CONTRIBUTING.md` (§ Theme Manifests: what `dark_mode: native` means now), new `tests/browser/light-dark.pw.ts`

Every theme repeats its dark tokens twice. `light-dark()` collapses a theme to one block.
Three things make that safe:

1. **The cascade contract.** The base layer declares, once:
   `:root { color-scheme: light } [data-theme="dark"] { color-scheme: dark } [data-theme="auto"] { color-scheme: light dark }`.
   Nothing today declares `color-scheme` (verified), so this is additive and makes the
   existing `data-theme` values drive `light-dark()` exactly as they drive the old blocks.
2. **The parsers.** `parseThemeValues` and `parseThemeSchemes` learn that a `:root`
   declaration whose value is `light-dark(A, B)` contributes `A` to light and `B` to dark
   (and auto). Both forms may coexist in one file; explicit blocks win over the function for
   the same token, mirroring the cascade. Nested `var()` inside either argument resolves per
   scheme through the existing `flattenLayers`/`resolveColorString` chain.
3. **The proof.** `default.css` is migrated to the one-block form — its manifest
   regenerates byte-identical (`tokens_overridden` is the union of names, unchanged) and
   the coverage/contrast/focus-ring gates pass unchanged — and a real-browser spec asserts
   the migrated theme resolves the same computed colours as the tagged v1.0.0 file under
   `light`, `dark` and `auto` (emulated `prefers-color-scheme`).

The generator emits the one-block form for `scheme: both` (single-scheme themes are
unchanged); `renderDarkBlocks` stays for the `--legacy-blocks` flag so a project on an old
browser floor can still generate the triple form.

**Tests**
- `tests/utils/light-dark.test.ts` (new): parser cases — plain, with `var()` in one or both arguments, whitespace/comments, nested parentheses, a token declared both ways (block wins), a single-scheme theme (function forbidden → parsed as light only and reported).
- `tests/themes/coverage.test.ts`, `manifest.test.ts`, `contrast.test.ts`, `focus-ring.test.ts`: green with `default.css` migrated; add one case that computes coverage for the same theme in both authoring forms and asserts identical results.
- `tests/commands/theme-generate.test.ts`: generated `both` themes contain no `[data-theme="dark"]` block by default and do with `--legacy-blocks`; both pass the full gauntlet.
- `tests/browser/light-dark.pw.ts`: Chromium computes `background-color`/`color` on a page using the migrated `default.css` equal to the v1.0.0 file's values for light, dark and `auto`+dark emulation (values read from `git show v1.0.0:registry/themes/default.css` at test time, not pasted).

**Acceptance criteria**
- [ ] One-block `light-dark()` themes parse, gate and render identically to triple-block themes (unit, gate and browser evidence).
- [ ] `default.css` ships in the one-block form with a byte-identical manifest and no gate change.
- [ ] Generator emits the one-block form by default; `--legacy-blocks` documented; CONTRIBUTING updated.

---

### 1.1A-07 · Manifest schema 1.1 (theme fields)

**Depends:** — · **Ref:** §5.7, SPEC-1.0 §8.2 "Add an optional field" · **Touches:** `manifest.schema.json` (`schema_version` → `1.1`, `definitions.themeManifest`, new `definitions.themeSeed`, `definitions.themeAxes`), `SPEC-1.0.md` §9 row, `src/protocol.ts` (the changelog rows it mirrors), `src/theme-manifest.ts` (`ThemeManifest` type + `validateThemeManifest`), `src/canonical.ts` (if it pins the version string), `tests/schema/manifest-schema.test.ts`, `tests/spec/protocol-1.0.test.ts`, `tests/themes/manifest.test.ts`

Add five **optional** fields to the theme manifest, all validated when present:

| Field | Type | Meaning |
|---|---|---|
| `seed` | `themeSeed` | The generator input for a generated theme; absent for an authored one |
| `axes` | `themeAxes` | The fourteen axes **derived from the CSS** by `gen:theme-manifests` (1.1A-08) — never hand-written, like `tokens_overridden` |
| `fonts` | `[{ family, license, role, source }]` | Self-hosted families the theme's role tokens name (1.1A-18) |
| `distinctiveness` | `{ nearest, axis_distance, token_distance }` | Written by the gate (1.1A-12) |
| `visual_matrix` | `boolean` | Whether the theme enters the full screenshot/axe matrix (1.1A-13); absent = `true` |

`themeSeed` is the full shape 1.1A-10 consumes — every axis with an enum and a default, so
`{ "name", "accent" }` alone is a complete seed:

```
accent: string (oklch/hex) · neutral: gray|cool|warm|tinted · scheme: light|dark|both
type: { pairing: system|sans-humanist|sans-grotesque|sans-geometric|rounded|serif-editorial|serif-modern|slab|mono|custom,
        scale: 1.125|1.2|1.25|1.333, base: 15|16|17|18, voice: { weight: regular|medium|semibold|bold|black, tracking: tight|normal|wide, transform: none|uppercase|small-caps } }
shape: { radius: sharp|crisp|soft|round|pill, border: hairline|regular|heavy, corner: round|bevel|scoop|notch }
depth: flat|soft|layered|hard|glass|inset · material: none|grain|paper|dots|grid|stripes|mesh
motion: none|minimal|smooth|snappy|springy|playful · density: compact|comfortable|spacious
focus: ring|glow|inset|bold · decoration: { link: none|plain|offset|thick, divider: solid|dashed|dotted|double }
controls: { button: rect|pill|soft, input: box|filled|underline, checkbox: square|round, switch: pill|square }
contrast: standard|high · document: boolean
```

`themeAxes` is the same vocabulary minus `accent`/`document`, plus `accent_hue` (0–360)
and `accent_chroma`. Bump `schema_version` to `1.1` with a §9 row (task `1.1A-07`, not
breaking) — the `main` `$id` alias serves it; `v1.0.0` keeps serving the frozen file.

**Tests**
- `tests/schema/manifest-schema.test.ts`: every shipped manifest (component and theme) still validates; a theme manifest with each new field valid/invalid (enum violations, a `seed` missing `accent`, `visual_matrix` non-boolean); the schema's `schema_version` is `1.1` and the §9 table's last row names this task.
- `tests/spec/protocol-1.0.test.ts`: the changelog marker parses the new row and matches `src/protocol.ts`.
- `tests/themes/manifest.test.ts`: `validateThemeManifest` accepts manifests with and without the optional fields; hand-written `axes` on a theme without a matching derivation is rejected once 1.1A-08 lands (add the assertion there).

**Acceptance criteria**
- [ ] Schema 1.1 published additively; all existing manifests validate; §9 row present and drift-tested.
- [ ] `themeSeed` and `themeAxes` definitions are complete enough that 1.1A-10 needs no schema edit (every axis, every enum, every default, documented in the schema's `description` strings).
- [ ] `gen:schema-refs` / `check:schema-refs`, `check:skill` green.

---

### 1.1A-08 · `axesFromCss()` — axes derived, not declared

**Depends:** 1.1A-01, 1.1A-02, 1.1A-04, 1.1A-05, 1.1A-07 · **Ref:** §5.2, §5.7 · **Touches:** new `src/theme/axes.ts`, `scripts/gen-theme-manifests.mjs`, `src/theme-manifest.ts`, all 12 `registry/themes/*.theme.json` (regenerated), `tests/themes/manifest.test.ts`, new `tests/themes/axes.test.ts`, `registry/themes/*.css` headers (a `@ui:density` directive where a theme wants a non-default density)

A theme's axes are a fact about its stylesheet, so they are **derived** — the same rule
`tokens_overridden` already follows — and a manifest's `axes` must equal a fresh
derivation or the manifest gate fails. `axesFromCss(themeCss, baseSources)` resolves the
relevant tokens per scheme (through the existing `flattenLayers` + `resolveColorString`
and a small non-colour resolver) and classifies:

| Axis | Derived from |
|---|---|
| `accent_hue`, `accent_chroma`, `neutral` | `--color-primary` hue/chroma; `--color-bg` chroma and hue (gray < 0.005, cool 200–280, warm 40–100, else tinted) |
| `type.pairing` | `--font-heading`/`--font-body` resolved family names against a table in `axes.ts` (system-ui → `system`, `ui-monospace`/`Menlo` → `mono`, `ui-serif`/`Georgia` → `serif-*`, `ui-rounded` → `rounded`, known families from the 1.1A-18 catalog by class, anything else → `custom`) |
| `type.scale`, `type.voice` | median ratio of consecutive `--text-*` steps bucketed to the four ratios; `--heading-weight/tracking/transform` bucketed |
| `shape.radius`, `shape.border`, `shape.corner` | `--radius-md` (0 → sharp, ≤0.25rem crisp, ≤0.5rem soft, else round; `--button-radius` = full → pill); `--border-width`; `--corner-shape` |
| `depth` | all shadows `none` → flat; `--surface-backdrop` ≠ none → glass; `inset` in `--shadow-md` → inset; zero-blur offset shadow → hard; blur radius of `--shadow-md` bucketed → soft / layered |
| `material` | `--texture-page`/`--texture-surface` `var(--texture-<name>)` → name, else none |
| `motion` | `--duration-normal` and `--ease-default` (0ms → none; ≤120ms minimal; ≤160ms + ease-out snappy; spring easing → springy; spring + `--motion-hover-lift` ≤ −2px → playful; else smooth) |
| `density` | a `/* @ui:density compact|comfortable|spacious */` header directive (like `@ui:schemes`), default comfortable |
| `focus` | `--focus-shadow` ≠ none → glow; negative `--focus-ring-offset` → inset; `--focus-ring-width` ≥ 3px → bold; else ring |
| `decoration.link`, `decoration.divider` | `--link-decoration`/`--link-underline-offset`/`--link-thickness`; `--divider-style` |
| `controls.*` | `--button-radius` full → pill (≥ `--radius-lg` soft, else rect); `--input-border-width` `0 0 n 0` → underline, `--input-fill` ≠ none → filled, else box; `--checkbox-radius` full → round; `--switch-radius` |
| `contrast` | `--color-fg` on `--color-bg` ≥ 15:1 **and** `--color-border-strong` on `--color-bg` ≥ 3:1 in every shipped scheme → high, else standard |

`gen:theme-manifests` writes `axes` for every theme; the manifest gate re-derives and
compares. Every classification threshold is a named constant in `axes.ts` with the rule
in a comment beside it.

**Tests**
- `tests/themes/axes.test.ts` (new): one fixture stylesheet per axis value (≥ 40 fixtures, generated in-test from a template) asserting the classification; boundary cases at every threshold; both authoring forms (blocks and `light-dark()`); the 12 shipped themes produce the axes the session records in this task's commit body (a table), and the table is asserted so a later CSS edit that moves an axis is a deliberate act.
- `tests/themes/manifest.test.ts`: `axes` present on every theme and equal to a fresh derivation; a hand-edited axis fails.

**Acceptance criteria**
- [ ] `axesFromCss()` classifies all fourteen axes deterministically from CSS with documented thresholds; every shipped theme carries derived `axes`.
- [ ] The manifest gate rejects drift between `axes` and the stylesheet.
- [ ] The 12-theme axis table is in the commit body and pinned by a test.

---

### 1.1A-09 · Protocol amendment: `data-skin` and `data-density="spacious"`

**Depends:** 1.1A-07 · **Ref:** §5.4 (scoped themes), §5.2 (`density`), SPEC-1.0 §4, §8.2–8.3, §9 · **Touches:** `SPEC-1.0.md` (§4 table + prose, §8.2 table: one new row), `src/protocol.ts` (`TOKEN_MODIFIERS`, `TokenModifier` type, amendment rows), `tests/spec/protocol-1.0.test.ts`, `registry/tokens/density.css`, `tests/tokens/density.test.ts`, `docs/` cross-check exemptions (wherever the documentation cross-check lists modifiers), `src/generator/skill.ts` (the modifier table it renders)

Two additive amendments, one session, following §8.3 to the letter (issue text quoted in
the commit body; spec edit + `protocol.ts` edit + tests in the same commit):

1. **`data-skin`** joins §4 as the fourth sanctioned token modifier: *"Selects which theme's
   token declarations a subtree resolves — the scope selector `faqir theme bundle --scope`
   emits."* Values: **open** — any theme name — which the §4 table records as `<theme-name>`
   and the `TokenModifier` type expresses with `open: true` (the drift test compares the
   vocabulary only for closed modifiers). Written by: author. Legal on any element. §8.2
   gains the row it lacks: *"Add a sanctioned token modifier that re-declares tokens only and
   names no component — additive."*
2. **`spacious`** joins `data-density`'s vocabulary (the §8.2 row that already exists,
   "a third density, say"). `density.css` gains the `[data-density="spacious"]` block
   (`--density-scale: 1.25`, control ramp 36/44/52 px, every alias re-declared per the
   drift test's list).

**Tests**
- `tests/spec/protocol-1.0.test.ts`: the §4 table now has four rows matching `TOKEN_MODIFIERS`; the open-vocabulary modifier is handled; `SANCTIONED_ATTRIBUTES` grew by one; `isTokenModifier("data-skin")` true; the §8.2 table and `protocol.ts` amendment rows agree.
- `tests/tokens/density.test.ts`: `spacious` scales spacing up and controls to the new ramp in a subtree; nesting `compact` inside `spacious` resets; the alias re-declaration drift list is complete.
- Audit: a page using `data-skin`/`data-density="spacious"` audits clean (the modifiers need no manifest — assert with `auditHtmlSource`).

**Acceptance criteria**
- [ ] `data-skin` is a sanctioned modifier in spec and code, drift-tested, open-vocabulary.
- [ ] `data-density="spacious"` is a legal value in spec, code and CSS, with density tests.
- [ ] Commit body carries the §8.3 issue text (section, quoted text, level, rationale); `check:skill` green after the modifier table regenerates.

---

### 1.1A-10 · Generator v2, core: seed → declarations

**Depends:** 1.1A-01, 1.1A-02, 1.1A-04, 1.1A-05, 1.1A-06, 1.1A-07 · **Ref:** §5.2, §5.4 · **Touches:** `src/commands/theme-generate.ts` (split: keep the accent ramp + contrast selection, add axis renderers), new `src/theme/seed.ts` (defaults, normalization, legacy-flag mapping), new `src/theme/families.ts` (per-axis declaration maps: type pairings → role tokens + fallback stacks; scale → `--text-*` ramp; shapes → radius/border/corner; depth → shadow ramp/colour/backdrop; material → texture roles; motion → durations/easings/lift/stagger; focus; decoration; controls), `tests/commands/theme-generate.test.ts`, new `tests/themes/families.test.ts`

The generator becomes a function of the **full seed**. `generateThemeBundle(seedInput, base)`
normalizes the seed (defaults for every absent axis; legacy `--radius sm|md|lg` → `crisp|soft|round`),
derives the accent ramp and primary selection exactly as today, then appends one
declaration group per axis family from `families.ts`. Emission is the one-block
`light-dark()` form (1.1A-06). Every family is a pure function `(seed) → Declaration[]`
so each is unit-testable and Night Shift can reuse them.

Rules the families obey: only tokens that exist in the surface are emitted (assert
against `surfaceTokens`); no component is selected; the `type.scale` ramp keeps
`--text-base` at `seed.type.base / 16 rem` and derives the rest by the ratio, rounded to
4 decimals; `depth: glass` emits `--surface-backdrop: blur(12px) saturate(140%)` and
translucent surface fills that still pass the elevation gate; `contrast: high` raises
the neutral ramp until the 1.1A-08 `contrast` classification returns `high`
(closed loop: the generator calls `axesFromCss` on its own output and fails if any axis
does not round-trip to the seed).

**Tests**
- `tests/themes/families.test.ts` (new): for every axis value, the emitted declarations name only surface tokens and the documented ones; determinism (same seed → identical bytes); the round-trip property — `axesFromCss(generate(seed)) ⊇ seed`'s derivable axes — for a generated matrix of ≥ 60 seeds (Latin-hypercube over the enums, five accents across the hue wheel).
- `tests/commands/theme-generate.test.ts`: the existing gauntlet (coverage, manifest consistency, all contrast pairs, focus ring, elevation) runs over the seed matrix; `depth: glass` and `contrast: high` seeds pass the gates; legacy inputs (`accent/neutral/radius/scheme/document` only) produce output whose *colour* tokens are byte-identical to v1.0.0's generator for the same inputs (golden fixtures captured from the tagged generator via `git show v1.0.0:src/commands/theme-generate.ts` is not runnable — capture the golden CSS in this session and commit it under `tests/fixtures/theme-generate/v1/`).

**Acceptance criteria**
- [ ] Every axis in `themeSeed` has a family renderer; a seed round-trips through `axesFromCss` on a ≥ 60-seed matrix.
- [ ] The full theme gauntlet passes for the matrix; legacy inputs remain colour-identical to 1.0 output (golden).
- [ ] `generateThemeBundle` stays pure (no filesystem) so the MCP tool keeps working unchanged.

---

### 1.1A-11 · Generator v2, surface: CLI, seed files, scorecard, MCP parity

**Depends:** 1.1A-10 · **Ref:** §5.4, §9.6 · **Touches:** `src/commands/theme.ts` (generate subcommand parsing, `--seed <file>`, one flag per axis, `--out <dir>`, `--legacy-blocks`, `--json` scorecard v2), `src/commands/theme-generate.ts` (scorecard assembly), `src/theme-preview.ts` + `renderGeneratedPreview`, `packages/mcp/src/generate.ts` (the theme tool accepts a seed), `src/command-registry.ts` (usage string), `tests/commands/theme-generate.test.ts`, `packages/mcp/tests/*` (the theme tool), `README.md` (Theme System → generate)

```bash
faqir theme generate ember --seed ember.seed.json
faqir theme generate ember --accent "oklch(0.62 0.2 40)" --neutral warm --type serif-editorial \
  --scale 1.25 --shape soft --border hairline --depth hard --material grain --motion springy \
  --focus glow --input underline --button rect --density comfortable --contrast standard \
  --out registry/themes
```

Flags and `--seed` merge (flags win); the resolved seed is written beside the CSS as
`<name>.seed.json` (validated against `definitions.themeSeed`), the manifest carries it
in `seed`, and `--json` prints **scorecard v2**: normalized seed, every generated path,
contrast ratios (existing), elevation ΔE, focus-ring ratios, tap-target sizes under the
seed's density, the derived axes, and — once 1.1A-12 lands — distinctiveness. The
generated preview renders the seed's density on its root and links `fonts.css` when the
seed names fonts. The MCP `faqir_theme_generate` tool takes the same seed object and
returns the same scorecard in memory.

**Tests**
- `tests/commands/theme-generate.test.ts`: flag parsing for every axis (valid, invalid enum → helpful error naming the allowed values), `--seed` + flag precedence, `--out`, the seed file written and schema-valid, `--json` scorecard v2 shape (a schema-shaped assertion, versioned `scorecard_version: 2`), `--legacy-blocks`; the `--json` meta-test (`tests/commands/json-output.test.ts`) keeps covering the command.
- MCP: `packages/mcp/tests/` — the theme tool accepts a seed, rejects an invalid one with the same message the CLI prints, returns scorecard v2.
- Node dist: `bun run build:cli` then `node dist/faqir.mjs theme generate … --json` in the smoke test (`scripts/smoke-cli.sh` gains one line).

**Acceptance criteria**
- [ ] `faqir theme generate` accepts a seed file and/or one flag per axis, writes CSS + seed + manifest + preview, and reports scorecard v2 in `--json`.
- [ ] CLI and MCP share one code path and one error text (asserted).
- [ ] README "Theme System → generate" rewritten around the seed; `check:skill` green (the skill's CLI reference renders the new usage).

---

### 1.1A-12 · Distinctiveness

**Depends:** 1.1A-08, 1.1A-11 · **Ref:** §5.2 (the four-axis rule), §5.4 (scorecard), §10.5 · **Touches:** new `src/theme/distinctiveness.ts`, `src/commands/theme-generate.ts` / `theme.ts` (refusal + `--allow-similar`), `scripts/gen-theme-manifests.mjs` (writes `distinctiveness`), `src/theme-manifest.ts`, new `tests/themes/distinctiveness.test.ts`

Two numbers, both browser-free and deterministic:

- **Axis distance** — how many of the fourteen axes differ (`type.scale` compared as a
  bucket, `accent_hue` as a 30° bucket, `neutral`, and each remaining axis as an enum).
- **Token distance** — mean OKLab ΔE between the two themes' resolved colour surface
  (every `color-*` token, per shared scheme), computed with the existing
  `perceptualDelta` in `contrast-tokens.ts`.

`distinctiveness(themeA, themeB)` returns both; `nearest(theme, others)` the minimum. The
generator computes it against every theme in the target directory and **refuses** to write
when `axis_distance < AXIS_MIN` **or** `token_distance < TOKEN_MIN`, naming the collision
(`--allow-similar` overrides, and the scorecard records that it did). `gen:theme-manifests`
writes `distinctiveness: { nearest, axis_distance, token_distance }` into every manifest.

The thresholds are set **from measurement in this session**: compute the 66 shipped pairs,
put the table in the commit body, and choose `AXIS_MIN = 4` (the vision's rule) and a
`TOKEN_MIN` that the closest legitimate pair (expected: `default`/`slate`) sits above
*after* 1.1A-14/15's adoption work. Until 1.1A-15 arms it, the shipped-pair test is
written but marked with the pairs it is expected to fail, so the failure is a named
obligation rather than a red suite.

**Tests**
- `tests/themes/distinctiveness.test.ts` (new): axis distance on synthetic axes (0, partial, full); token distance symmetry and zero on identity; the generator refuses a seed that clones a shipped theme and accepts it with `--allow-similar`; the scorecard carries the numbers; the 66-pair table (armed in 1.1A-15: every pair ≥ both thresholds; here: asserts the table against the commit-body values so a later change is deliberate).
- `tests/themes/manifest.test.ts`: `distinctiveness` present and equal to a fresh computation.

**Acceptance criteria**
- [ ] `distinctiveness.ts` implements both measures with named thresholds and a documented rationale.
- [ ] The generator refuses look-alike themes by default and reports the nearest theme and both numbers.
- [ ] The 66-pair table is recorded and pinned; pairs below threshold are enumerated as obligations for 1.1A-14/15.

---

### 1.1A-13 · Visual & a11y matrix policy

**Depends:** 1.1A-07 · **Ref:** §12 (risk: matrix explosion) · **Touches:** `tests/visual/matrix.ts` (`discoverThemes`, `buildMatrix`), `tests/visual/matrix.test.ts`, `tests/a11y/a11y-matrix.ts` (`A11Y_THEMES`), `tests/a11y/a11y-matrix.test.ts`, `tests/visual/README.md`, `tests/a11y/README.md`, `docs/release-checklist.md`, the 12 theme manifests (`visual_matrix` stays absent = full matrix for the authored twelve)

At 12 themes the screenshot matrix is 4,128 captures and the axe matrix is of the same
order; 24 themes would double both. Policy, encoded in data:

- `discoverThemes({ matrix: true })` returns the themes whose manifest lacks
  `visual_matrix: false`; `discoverThemes()` (all) is unchanged for consumers that need
  every theme (`frameworkCss`, the density page, the docs switcher).
- `buildMatrix()` sweeps the full cross-product for matrix themes and, for every other
  theme, **patterns only × {light, dark} × ltr** — the 15 patterns compose most primitives
  and recipes, so a seed theme still gets a structural render at a fraction of the cost.
- `A11Y_THEMES` follows the same split; the meta-tests pin the counts.

Generated seed themes (1.1A-16/17) ship with `visual_matrix: false`. Promotion to the full
matrix is a one-line manifest edit made on purpose.

**Tests**
- `tests/visual/matrix.test.ts`: with a fixture manifest set (two matrix themes, one non-matrix), the case count equals the formula; ids stay stable for existing themes (no baseline renames); `discoverThemes()` still returns all.
- `tests/a11y/a11y-matrix.test.ts`: same split; the total at the current registry is recorded.
- `tests/meta/visual-baselines.test.ts` still passes (no baseline moved).

**Acceptance criteria**
- [ ] Matrix membership is a manifest fact; the suites read it; a non-matrix theme costs 30 captures, not 344.
- [ ] Existing snapshot ids unchanged; READMEs and the release checklist describe the policy.

---

### 1.1A-14 · Authored themes adopt the new families, batch 1

**Depends:** 1.1A-05, 1.1A-08, 1.1A-12 · **Ref:** §5.6 · **Touches:** `registry/themes/{glass,brutalist,terminal,paper,soft,aurora}.css` (+ their `.theme.json` regenerated), `src/theme-preview.ts` (signature lines), `tests/themes/{glass,terminal,soft}.test.ts`

The authored themes were written before the families existed; each now says what it
always meant, in tokens, and gets *more* distinct in the process:

| Theme | Adoption |
|---|---|
| `glass` | `--surface-backdrop` + translucent fills through tokens; the theme's own `@supports` block that selects components is deleted (the components carry it since 1.1A-04); `depth` derives as `glass` |
| `brutalist` | `--border-width: var(--border-width-lg)`, `--focus-ring-width: 3px` (focus `bold`), `--heading-transform: uppercase`, `--heading-tracking: wide`, `--link-decoration: underline` with `--link-thickness: 2px`, motion `minimal`, controls `input: box`, button `rect` |
| `terminal` | `--font-heading/body/ui: var(--font-mono)` (type `mono`), scanline texture as `--texture-page: var(--texture-stripes)`, motion `snappy`, focus `inset`, divider `dashed` |
| `paper` | `--texture-page: var(--texture-paper)`, type `serif-editorial` via role tokens, shape `soft`, depth `flat`, decoration link `offset` |
| `soft` | motion `springy` (`--ease-default: var(--ease-spring)`), shape `round`, controls `button: pill`, `checkbox: round`, focus `glow` |
| `aurora` | motion `smooth`, depth `layered` (tinted `--shadow-color`), `--selection-bg` on the accent, material `mesh` on hero/page |

Every change is a token re-declaration or a `.signature.css`-style decoration on the
allowed roots; no theme selects a component after this task. Previews are re-rendered;
each theme's dedicated test (`glass.test.ts`, `terminal.test.ts`, `soft.test.ts`) is
extended to assert the axes it now claims.

**Tests**
- Per-theme tests assert the derived `axes` for the six themes match the table above (via `axesFromCss`), that no `[data-ui=` selector remains in any of the six stylesheets, and that the full gauntlet (coverage, contrast, focus ring, elevation, manifest consistency) passes.
- `tests/themes/distinctiveness.test.ts`: the pair distances involving these six all rise or hold (recorded before/after in the commit body).

**Acceptance criteria**
- [ ] Six authored themes express their identity through the new families; zero component selectors remain in theme CSS for them.
- [ ] Their derived axes match the adoption table; previews and manifests regenerated; gauntlet green; `check:core-package` green.

---

### 1.1A-15 · Authored themes batch 2 + the pair gate armed

**Depends:** 1.1A-14 · **Ref:** §5.6 · **Touches:** `registry/themes/{default,slate,midnight,contrast,document,document-serif}.css` (+ manifests), `tests/themes/{contrast,document-serif}.test.ts`, `tests/themes/distinctiveness.test.ts`

| Theme | Adoption |
|---|---|
| `default` | stays the neutral reference: type `system`, shape `soft`, depth `soft`, motion `smooth` — but declares them (the one-block form from 1.1A-06 already) so the axes are explicit, not inherited by accident |
| `slate` | type `sans-grotesque` role stack, shape `crisp`, depth `flat`, motion `snappy`, controls `input: box`, density `compact` (`@ui:density`) — the enterprise theme stops being "default, but bluer" |
| `midnight` | depth `layered` with a navy `--shadow-color`, focus `glow`, `--selection-bg` cyan, motion `smooth` |
| `contrast` | `contrast: high` derives; focus `bold`; border `regular`; link `thick` |
| `document` | material `none`, depth `flat`, shape `sharp`, motion `none` (`--duration-*: 0ms`), type `system`, decoration link `plain` |
| `document-serif` | type `serif-editorial` via role tokens (already serif, now through `--font-heading/body`), divider `double`, drop-cap-ready `--heading-tracking: tight` |

Then **arm** the 66-pair distinctiveness gate: every pair ≥ `AXIS_MIN` and `TOKEN_MIN`.
If a pair cannot honestly reach the bar (the two `document` themes may share many axes by
design), the session raises the *specific* pair's exemption in `distinctiveness.ts` with a
reason string that the test prints — never by lowering the thresholds.

**Tests**
- Per-theme axes assertions as in 1.1A-14; `contrast.test.ts` asserts `axes.contrast === "high"` and that the AAA pairs still pass.
- `tests/themes/distinctiveness.test.ts`: the shipped-pair gate is unconditional from this commit on; exemptions (if any) are listed with reasons and there are at most two.
- Print suite unaffected (document themes keep `--texture-page: none`); `tests/visual/print` config untouched.

**Acceptance criteria**
- [ ] All twelve authored themes carry deliberate, derived axes; no theme CSS selects a component.
- [ ] The 66-pair gate is armed and green, with ≤ 2 reasoned exemptions.
- [ ] Manifests, previews, CDN bundles regenerated; every theme gate green.

---

### 1.1A-16 · New seed themes, batch 1

**Depends:** 1.1A-11, 1.1A-12, 1.1A-13, 1.1A-15 · **Ref:** §5.6 (the table) · **Touches:** `registry/themes/{editorial,swiss,neo,luxe,candy,organic}.{seed.json,css,theme.json,preview.html}`, `scripts/gen-theme-manifests.mjs` (SEED editorial entries: mood, pairs_with), `src/theme-preview.ts` (`GALLERY_PREVIEWS` specs), `packages/core/cdn.json` (regenerated), `README.md` theme table, `site/` (gallery grows automatically — verify)

Six seeds, generated with `faqir theme generate <name> --seed … --out registry/themes`,
each occupying an empty region of the axis space per the vision's table (`editorial`:
serif-editorial 1.333 · soft · hairline · flat · paper · minimal; `swiss`: grotesque
1.25 uppercase · sharp · regular · flat · grid · snappy · red accent; `neo`: grotesque
heavy · sharp · heavy · hard · none · playful; `luxe`: serif-modern tracked caps · soft ·
soft · mesh · smooth · gold on near-black; `candy`: rounded · pill · soft · none ·
springy · pastel; `organic`: humanist · round · soft · grain · smooth · warm). The session
tunes each seed by looking at its preview (Playwright screenshot through the local
Chromium — the browser harness config exists) until it reads as intended, then commits
the seed, not the tuning history. Every generated theme ships `visual_matrix: false`,
passes the gauntlet and the distinctiveness gate against all shipped themes, and gets a
mood list and `pairs_with` in the editorial SEED. `swiss` and `editorial` also ship a
`-document` companion (`document: true`).

**Tests**
- `tests/themes/generated-themes.test.ts` (new): for every theme whose manifest carries a `seed`, regenerating from the seed reproduces the committed CSS byte-for-byte (the theme cannot be hand-edited — the same rule as every other generated artifact); axes match the seed; `visual_matrix` is `false`; the six are present.
- The existing data-driven gates (coverage, manifest, contrast, focus ring, previews, distinctiveness) pass with 18 themes; `tests/visual/matrix.test.ts` and `a11y-matrix.test.ts` counts move by the patterns-only formula only.
- `check:core-package` after `build:core-package` (six new `faqir.<theme>.css` entries and hashes); `check:skill` after `gen:skill` (the skill's theme gallery lists them with axes).

**Acceptance criteria**
- [ ] Six generated themes ship as seed + CSS + manifest + preview, byte-reproducible from their seeds, distinct from every other theme by the gate.
- [ ] Two `-document` companions ship; README theme table and the docs-site gallery include all six.
- [ ] All gates green; CDN manifest and skill regenerated.

---

### 1.1A-17 · New seed themes, batch 2

**Depends:** 1.1A-16 · **Ref:** §5.6 · **Touches:** as 1.1A-16 for `clinical`, `fintech`, `nordic`, `sunset`, `ink`, `neumorph`

Same procedure: `clinical` (humanist · soft · flat · none · minimal · calm blue, high
legibility base 17), `fintech` (geometric · soft · layered · none · snappy · dark-first,
green accent, mono numerals via `--font-mono` on `stat`), `nordic` (geometric light · round
· flat · none · smooth · cool airy), `sunset` (humanist · soft · soft · mesh · smooth · warm
gradient accent), `ink` (mono/serif mix · sharp · flat · paper · minimal · monochrome,
underline inputs — the first `input: underline` theme, which is what proves 1.1A-05's
silhouette tokens), `neumorph` (rounded · round · inset · none · smooth — the first
`depth: inset` theme; its elevation must still clear the ΔE gate, which is the generator's
job, not a hand fix). `ink` ships a `-document` companion.

**Tests**
- As 1.1A-16 at 24 themes; additionally `tests/themes/generated-themes.test.ts` asserts at least one shipped theme per value of `depth`, `controls.input`, `material` and `motion` — the axis space is *populated*, not just defined.

**Acceptance criteria**
- [ ] Twelve generated themes ship (24 total), byte-reproducible, distinct, gated.
- [ ] Every axis value with a shipped example is pinned by test; README and site updated.

---

### 1.1A-18 · `faqir fonts add`

**Depends:** 1.1A-01, 1.1A-07 · **Ref:** §5.5, ratified decision 3 · **Touches:** new `src/commands/fonts.ts`, new `src/fonts/catalog.ts`, `src/command-registry.ts`, `src/commands/{bundle,init,doctor}.ts` (fonts.css in the bundle order; doctor checks), `src/utils/runtime-shim.ts` (fetch/write through the shim), `README.md`, `tests/commands/fonts.test.ts`, `tests/fixtures/fonts/` (a tiny valid WOFF2 for tests)

```bash
faqir fonts list                       # the curated OFL catalog with roles and pairings
faqir fonts add fraunces --role heading
faqir fonts add inter --role body --role ui
faqir fonts remove fraunces
```

`catalog.ts` pins 16 OFL families — Inter, Geist, Manrope, DM Sans, Space Grotesk,
Bricolage Grotesque, IBM Plex Sans, IBM Plex Serif, IBM Plex Mono, Source Serif 4,
Fraunces, Instrument Serif, Newsreader, Lora, Nunito, JetBrains Mono — each with license,
type class (for `axesFromCss`), roles it suits, the system fallback stack, and **pinned
download URLs with SHA-256 per file** (variable-weight WOFF2 where the family ships one).
`add` downloads with the runtime's `fetch` (Node ≥ 18, Bun), verifies the hash, writes
`ui/fonts/<family>/*.woff2`, appends `@font-face` (`font-display: swap`, `unicode-range`
for Latin/Latin-ext) to `ui/fonts.css`, and appends a `:root { --font-heading: "Fraunces", <fallback> }`
role block there — never editing the theme file. `faqir bundle`/`init` place `fonts.css`
after the theme; `doctor` reports a `fonts.css` that names a missing file or hash
mismatch. No `size-adjust` metrics in 1.1 (they need a metrics extractor; recorded as a
follow-up when it is planned).

**Tests**
- `tests/commands/fonts.test.ts`: catalog integrity (every entry has license `OFL`, ≥ 1 URL, a 64-hex hash, a fallback, a class); `add` with an injected fetch returning the fixture WOFF2 writes the file, `fonts.css`, and the role block idempotently; a hash mismatch refuses and writes nothing; `remove` reverses; `--json` for `list`/`add`; `doctor` flags a deleted font file; the bundle order places `fonts.css` after the theme (assert on the emitted bundle).
- No network in tests (fetch is injected through the shim); the `--json` meta-test covers the new command.

**Acceptance criteria**
- [ ] `faqir fonts list|add|remove` work on Bun and the Node dist with hash-verified, self-hosted OFL families and no runtime dependency.
- [ ] Role tokens are overridden through `ui/fonts.css`, bundled after the theme; `doctor` validates the install.
- [ ] README documents the workflow and the "no Google Fonts link" stance.

---

### 1.1A-19 · Scoped themes: `faqir theme bundle --scope`

**Depends:** 1.1A-06, 1.1A-09 · **Ref:** §5.4 (scoped themes), §9.3 (preview inside admin) · **Touches:** `src/commands/theme.ts` (new `bundle` subcommand), new `src/theme/scope.ts`, `src/command-registry.ts`, `tests/commands/theme-bundle.test.ts`, `tests/browser/theme-scope.pw.ts`, `README.md`

`faqir theme bundle aurora --scope` emits `aurora.scoped.css` in which every `:root` becomes
`[data-skin="aurora"]`, `[data-theme="dark"]` becomes `[data-skin="aurora"][data-theme="dark"], [data-skin="aurora"] [data-theme="dark"]`,
the `auto` media block is scoped the same way, and `light-dark()` declarations are left
as they are (they follow `color-scheme`, which the scoped root re-declares). `--scope <selector>`
overrides the attribute for consumers with their own convention. The transform is a
token-level rewrite over the parsed stylesheet (`extractTokenDefinitions` + block walker),
not a regex over text.

**Tests**
- `tests/commands/theme-bundle.test.ts`: both authoring forms scope correctly; nested skins resolve innermost-first (happy-dom render through a real property on a component inside `[data-skin="aurora"]` inside a default page); a theme with a `-document` companion scopes both; `--json`.
- `tests/browser/theme-scope.pw.ts`: a page with two skins side by side computes each side's `--color-primary`-driven `background-color` on a button from the right theme, in light and dark.

**Acceptance criteria**
- [ ] Any registry or generated theme can be bundled to a `data-skin` scope and coexist with another theme on one page.
- [ ] Documented in README (Theme System → scoped themes) with the forms-platform preview use case.

---

### 1.1A-20 · Docs & agent surfaces for Theme System 2.0

**Depends:** 1.1A-17, 1.1A-18, 1.1A-19 · **Ref:** §5.7, §9.6 · **Touches:** `README.md` (Theme System section rewritten: axes, seeds, `light-dark()`, fonts, scope, the 24-theme table with axis columns), `CONTRIBUTING.md` (§ Theme Manifests → the seed workflow: seed → generate → gates → editorial SEED entry), `src/generator/skill.ts` (theme gallery with axes; a "choose a theme by axes" paragraph), `src/generator/context.ts` (theme block already embeds the manifest — assert `axes`/`seed` reach `context.json`, `context.md`, `llms.txt`), `packages/mcp/src/*` (`faqir_theme_info` returns axes; a `faqir_theme_list` filter by axis), `site/content/home.html` + `site/lib/gallery.js` (axis chips and an axis filter in the gallery), `docs/` (new `docs/themes.md` if README grows past its budget), tests under `tests/generator/`, `tests/commands/context.test.ts`, `packages/mcp/tests/`

The framework's agent surfaces must describe themes by axes, or agents keep choosing by
adjective. Regenerate every surface from the manifests and assert the fields reach each
one.

**Tests**
- `tests/generator/skill.test.ts`: the theme table renders one row per theme with the axis columns; the "choose by axes" guidance names every axis once.
- `tests/commands/context.test.ts`: `context.json`'s `theme` carries `axes` (and `seed` when present) for a generated and an authored theme.
- MCP tests: `faqir_theme_info` includes `axes`/`distinctiveness`; the list filter returns the right subset for `depth=glass`.
- `check:docs` after `build:docs`; the gallery's axis filter is exercised by an a11y docs-site case (`tests/a11y/docs-site.pw.ts`) — manual on this machine, recorded in the release checklist.

**Acceptance criteria**
- [ ] README, CONTRIBUTING, skill, context, MCP and the docs-site gallery all describe themes by axes and document seeds, fonts and scoped bundles.
- [ ] Every surface is generated from the manifests and drift-tested; `check:skill`, `check:docs` green.

---

## Task details — Lane B

### 1.1B-01 · `@faqir-ui/rules`: package + shape validator

**Depends:** — · **Ref:** §8.2, ratified decision 2 · **Touches:** new `packages/rules/` (`package.json` mirroring `packages/forms`, `tsconfig.json`, `src/index.js`, `src/index.d.ts`, `src/shape.js`, `src/formats.js`, `src/messages.js`, `README.md`, `LICENSE`, `tests/`), root `package.json` (`typecheck` gains the package; `workspaces` already covers it), `scripts/test.mjs` (walks `packages/` already — assert)

An isomorphic, zero-dependency package whose `src/index.js` imports nothing and touches no
DOM or filesystem. This task ships the **shape** half and the shared vocabulary:

- **Definition** (`version: "1"`): `fields` — a map of dotted paths to field schemas using
  the JSON Schema 2020-12 subset `type` (`string|number|integer|boolean|object|array`),
  `required` (object-level array **and** the Faqir sugar `required: true` on a field),
  `enum`, `const`, `pattern`, `format`, `minLength/maxLength`, `minimum/maximum`
  (+ exclusive), `multipleOf`, `minItems/maxItems/uniqueItems`, nested `properties`,
  `items` (scalars and objects); `messages` — `{ <locale>: { <key>: text } }`;
  `rules` is accepted and ignored until 1.1B-02.
- **Formats** — a registry with `email`, `uri`, `date`, `time`, `date-time`, `phone`
  (E.164-lenient), `iban` (mod-97), `uuid`, `postal-code` (country-agnostic lenient);
  `registerFormat(name, fn)` for platform-specific ones.
- **Verdict** — `validate(def, data, { locale })` returns
  `{ valid, findings: [{ path, rule, message, params }], computed: {}, visible: {}, required: {} }`
  (the last three filled by 1.1B-02; present and empty now so the shape is stable).
- **Messages** — resolution chain: the finding's message key in `messages[locale]` →
  `messages[defaultLocale]` → the built-in English default per constraint (the same
  strings `faqir-validate` uses, exported so the plugin can share them) → the key itself.
- **Coercion** — an explicit `coerce(def, rawData)` that turns form-string values into the
  field's type (numbers, booleans, arrays from checkbox groups), so the browser plugin and
  a server reading `FormData` produce the same `data` before validation.

**Tests**
- `packages/rules/tests/shape.test.ts`: every constraint with pass/fail cases; nested paths; `required` in both spellings; unknown keyword → definition error (not silently ignored); formats each with valid/invalid vectors; coercion table.
- `packages/rules/tests/golden/*.json` corpus (≥ 40 cases: definition + data + expected verdict) with a runner that fails on any drift — the corpus is what 1.1B-02's parity harness and 1.1B-04's plugin tests reuse.
- `packages/rules/tests/isomorphic.test.ts`: the module has no reference to `window`, `document`, `process`, `fs` (source scan), and `validate` runs inside a happy-dom `Window` realm and in plain Bun with identical output for the corpus.
- Root `bun run typecheck` covers the package (`checkJs` on, like forms).

**Acceptance criteria**
- [ ] `@faqir-ui/rules` exists as a zero-dependency isomorphic package with the shape validator, formats registry, message chain and coercion.
- [ ] The golden corpus and the isomorphism test are in place and green; README documents the definition format.
- [ ] Root typecheck and `bun run test` include the package.

---

### 1.1B-02 · Logic: JSONLogic subset + rules evaluator

**Depends:** 1.1B-01 · **Ref:** §8.2 · **Touches:** `packages/rules/src/{logic,rules,index}.js`, `src/index.d.ts`, `tests/`, `README.md`

**Logic.** `evaluateLogic(expr, data)` implements the JSONLogic subset: `var` (dotted,
with default), `==`, `===`, `!=`, `!==`, `<`, `<=`, `>`, `>=` (incl. the 3-ary between
form), `!`, `!!`, `and`, `or`, `if`, `in`, `cat`, `substr`, `+ - * / %`, `min`, `max`,
`missing`, `missing_some`, `some`/`all`/`none` over arrays, and two Faqir ops: `date`
(`{ "date": ["2026-01-01", "<=", { "var": "start" }] }` comparing ISO dates) and `regex`
(`{ "regex": [pattern, { "var": "x" }] }` with a bounded-length guard). Anything else is
a definition error naming the op. Where the public JSONLogic test suite covers an
implemented op, its vectors are vendored as fixtures and run.

**Rules.** Each rule has an `id` and exactly one verb:
`{ show: <path>, when }`, `{ require: <path>, when }`, `{ validate: <logic>, path, message }`,
`{ validate: "remote", path, remote: <url|name>, message }`, `{ compute: <path>, value: <logic> }`,
`{ jump: <pageId>, from: <pageId>, when }`. `evaluate(def, data)` returns
`{ visible, required, computed, next }`: `show` false ⇒ the field is hidden **and** its
findings are suppressed; `require` true adds `required`; `compute` runs in dependency
order (cycle ⇒ definition error); `jump` returns the next page for `from`.
`validate(def, data, opts)` now runs shape → visibility filter → cross-field rules; remote
rules run only through `validateAsync(def, data, { remote: (rule, value, data) => Promise<boolean|string> })`,
which the server injects and the browser plugin implements with `fetch`.

**Tests**
- `packages/rules/tests/logic.test.ts`: every op with vendored vectors; the Faqir ops; unsupported op error; depth/size guards (a 10k-node expression is rejected, not evaluated).
- `packages/rules/tests/rules.test.ts`: each verb; suppression of hidden fields' findings; compute DAG order and cycle error; jump resolution; `validateAsync` with a stub resolver (pass, fail with message, resolver throws ⇒ finding with `rule: "remote-error"`).
- Golden corpus extended (≥ 30 logic cases); parity harness (happy-dom realm vs plain Bun) covers the whole corpus.

**Acceptance criteria**
- [ ] The documented JSONLogic subset and the six rule verbs evaluate deterministically with identical verdicts in both realms.
- [ ] Definition errors (unknown op, cycle, bad verb) are reported, never ignored.
- [ ] README documents ops, verbs, and the remote-resolver contract.

---

### 1.1B-03 · `faqir-validate`: programmatic registry + async validators

**Depends:** — · **Ref:** §8.3 · **Touches:** `registry/core/plugins/faqir-validate.js`, `packages/core/faqir-core.d.ts` (optional `validate` member as plugin-installed surface), `tests/core/faqir-validate.test.ts`, `tests/core/faqir-core-types.test.ts` (plugin-installed keys), `src/core-src/engine.js` (dev-build diagnostic hook only, if one is needed to report), `registry/core/faqir-core{,.dev}.js` (rebuilt if the engine changed)

Two capabilities the rules plugin needs and page authors will use directly:

1. **Registry.** `Faqir.validate.register(form, field, name, fn, message?)` adds a named
   validator for the control(s) named `field` in `form`; `unregister(form, field, name)`;
   `run(form) → Promise<boolean>` validates everything programmatically. `fn(value, ctx)`
   receives `{ el, form, data }` and returns `true`, `false`, a message string, or a
   promise of those. Registered validators run after native constraints and after the
   attribute validators (`l-validate:<name>`), in registration order, first failure wins —
   the same message chain as today.
2. **Async.** Attribute form `l-validate.async:<name>="expr"` (expression may return a
   promise) and any promise-returning registered `fn`: the field-group enters
   `data-state="validating"` (the state the contract already declares), the run is
   debounced (250 ms) and last-wins, submit waits for in-flight checks, and a rejected
   promise is a finding with a built-in message — never a silent pass.

No silence: in the dev build, a registration whose `field` matches no control reports
once; `run()` on a form without `l-validate` reports. `Faqir.validate` is declared in
`faqir-core.d.ts` as an optional, plugin-installed member and the reflective types test
learns that plugin-installed keys are permitted when declared optional.

**Tests**
- `tests/core/faqir-validate.test.ts`: register/unregister/run; ordering and first-failure; message precedence (registered message > `data-error-<name>` > default); async attribute and registered validators — `validating` state set and cleared, debounce/last-wins with two overlapping resolutions, submit blocked until settled, rejection ⇒ invalid with message; dev-build diagnostics (run under the dev engine file in its own partition per `scripts/test.mjs`). Mount into a disposable container with `Faqir.initTree`, per `AGENTS.md`.
- `tests/core/faqir-core-types.test.ts`: the optional plugin member is accepted; the fixture types compile with `Faqir.validate?.register(...)`.
- Browser: extend `tests/browser/directives.pw.ts` with one async-validator case (real timers).

**Acceptance criteria**
- [ ] `Faqir.validate.{register,unregister,run}` and `l-validate.async:<name>` work with the documented ordering, messages and `validating` state; a rejected check never passes.
- [ ] Plugin-installed API is typed and drift-tested; dev build reports mis-registrations.
- [ ] Plugin stays ≤ 3 KB gzip (assert in the size check) and self-registers as before.

---

### 1.1B-04 · `faqir-rules` plugin (`l-rules`)

**Depends:** 1.1B-02, 1.1B-03 · **Ref:** §8.3 · **Touches:** new `packages/rules/src/plugin.js` (browser glue), new `scripts/build-rules-plugin.mjs` (+ `build:rules-plugin` / `check:rules-plugin` in `package.json` and in `release.mjs`'s preflight list), generated `registry/core/plugins/faqir-rules.js` (committed), `src/core-src/engine.js` §3.0 declarations only if a new `@ui:` line is needed for the skill (`@ui:plugin` header on the generated file carries `@ui:provides l-rules`), `tests/core/faqir-rules.test.ts`, `packages/core/cdn.json` (regenerated), `tests/meta/spawn-timeouts.test.ts` (the new build script's `spawnSync` carries a budget)

One source of truth: the evaluator lives in `packages/rules/src`; the plugin is **built**
from it into a self-registering IIFE (`bun build --minify`, pinned like `check:core-package`),
so `registry/core/plugins/faqir-rules.js` is a generated artifact with a byte-compare gate.

`<form l-validate l-rules="#signup-rules">` (a selector to a `<script type="application/json">`)
or `l-rules="rulesDef"` (a scope key). On init and on every delegated `input`/`change`:
collect the form's data (`FormData` → `coerce`), run `evaluate`, and apply — `hidden` +
`disabled` on the field-group of a hidden field (so it neither validates nor submits),
`required`/`aria-required` toggled per `require`, computed values written to the scope
and to any control with that name, `jump` results exposed as `$rules.next` for wizard
scopes. `validate` rules are registered through 1.1B-03 (`Faqir.validate.register`),
so they run at faqir-validate's moments with its messages; `remote` rules register async
validators whose resolver is `fetch(url, { method: "POST", body: { path, value, data } })`
expecting `{ ok: boolean, message? }`. Locale from `<html lang>`.

No silence: a `l-rules` value that resolves to nothing, a rule path with no control, an
unsupported op, or a missing `faqir-validate` (load order) each report — dev build in
full, production build tersely.

**Tests**
- `tests/core/faqir-rules.test.ts`: each verb end-to-end against the field-group contract (hidden ⇒ `hidden`+`disabled`, findings suppressed; require toggles `required`; compute writes scope + control; cross-field via the registry; remote via a stubbed `fetch`); coercion of checkbox groups/numbers; both `l-rules` forms; load-order failure reported; the golden corpus replayed through a rendered form (build a form from a definition with the 1.1B-06 renderer once it exists — here, from a fixture) yields the same verdict `validate()` gives on the same data (the browser/server parity claim, made literal).
- `check:rules-plugin` byte-compare; the plugin's `@ui:plugin`/`@ui:provides` header is parsed by the skill generator (`check:skill`).

**Acceptance criteria**
- [ ] `l-rules` applies visibility, requiredness, computed values, cross-field and remote rules on top of the unchanged `faqir-validate` DOM contract; a page's audit output is unaffected.
- [ ] The plugin is generated from the package (one evaluator), gated by byte-compare, shipped in the CDN package, ≤ 6 KB gzip.
- [ ] Browser verdicts equal server verdicts on the golden corpus (asserted).

---

### 1.1B-05 · `faqir rules lint` + `rules.schema.json`

**Depends:** 1.1B-02 · **Ref:** §8.4 · **Touches:** new `src/commands/rules.ts`, `src/command-registry.ts` (category Quality), new `packages/rules/rules.schema.json` (+ `src/canonical.ts` if it owns published-schema URLs), `packages/rules/src/lint.js` (the lint lives in the package so MCP and the browser can run it too), `tests/commands/rules-lint.test.ts`, `packages/rules/tests/lint.test.ts`, `packages/rules/README.md`

`faqir rules lint <def.json> [--json] [--locales en,ro]` reads a definition (file or
`--stdin`) and reports, with rule ids and exit codes like `faqir audit`:
`rule-refs` (every `var` path and `path`/`show`/`require`/`compute` target names a field),
`rule-cycles` (compute DAG), `rule-messages` (every message key resolves in every declared
locale), `rule-unreachable` (a `when` that is constant-true/false after folding literals),
`rule-ops` (unsupported op / arity), `rule-verb` (a rule with zero or two verbs), and
`schema` (the definition validates against `rules.schema.json`). The schema is the
document platforms hand to a model for structured output; the package's own
`validateDefinition()` is the reference implementation, and a test proves the two agree on
an accept/reject corpus (no JSON Schema validator dependency is added).

**Tests**
- `packages/rules/tests/lint.test.ts`: each lint rule with a triggering and a clean definition; folding cases for unreachable; exit code semantics via the CLI test.
- `tests/commands/rules-lint.test.ts`: file and `--stdin`; `--json` envelope through `emitJSON`; the `--json` meta-test covers it; Node dist smoke line.
- `packages/rules/tests/schema.test.ts`: the golden corpus definitions all validate; a set of malformed definitions all fail in both the hand validator and the schema (agreement corpus).

**Acceptance criteria**
- [ ] `faqir rules lint` reports the seven lint rules with stable ids, JSON output and exit codes.
- [ ] `rules.schema.json` is published in the package, agrees with `validateDefinition()`, and is referenced from the README as the structured-output schema.

---

### 1.1B-06 · `@faqir-ui/forms` emits rules

**Depends:** 1.1B-04 · **Ref:** §8, §9.3 · **Touches:** `packages/forms/src/index.js`, `src/index.d.ts`, `README.md`, `tests/` (+ golden), `packages/forms/package.json` (no dependency added — the renderer emits JSON, it does not evaluate it)

`renderForm(schema, uiSchema, opts)` gains the minimum the forms platform needs now:

- `opts.rules` — a rules definition (or its `rules`/`messages` parts) emitted as
  `<script type="application/json" id="<idPrefix>-rules">` beside the form, with
  `l-rules="#<idPrefix>-rules"` on the `<form>`, and `@ui:requires faqir-rules` added
  to the requirements comment.
- **Derived rules** from JSON Schema the renderer already understands: `if/then/else`
  with `properties`/`required` consequents → `show`/`require` rules; `dependentRequired`
  → `require` rules; `ui:wizard` steps may carry `when` → `jump` rules. The derived
  definition's `fields` are generated from the schema so `faqir rules lint` passes on it.
- The emitted `fields` use the same coercion types the renderer used to choose widgets,
  so browser and server agree on `data`.

**Tests**
- `packages/forms/tests/rules.test.ts`: emission shape; derived rules for each construct; the emitted definition passes `lint` with zero findings; golden forms updated where they gain a rules block (`form-page-golden`), unchanged otherwise.
- Cross-package: render a form with `if/then`, mount it under happy-dom with core + validate + rules plugins, toggle the condition, and observe `hidden`/`required` flip (the platform's end-to-end story in one test).

**Acceptance criteria**
- [ ] `renderForm` emits a lint-clean rules definition for explicit rules and derives them from `if/then/else`, `dependentRequired` and wizard `when`.
- [ ] The rendered form is driven by `faqir-rules` end-to-end in a test; README documents the option and the requirement line.

---

### 1.1B-07 · Docs, types and packaging for rules

**Depends:** 1.1B-05, 1.1B-06 · **Ref:** §8, §9.6 · **Touches:** `README.md` (Faqir Core → plugins table gains `faqir-rules`; a "Validation" section: attribute validators, registry, async, rules), `packages/rules/README.md` (final), `packages/core/README.md` (plugin drop + CDN snippet with SRI), `src/generator/skill.ts` + `references/directives.md` (regenerated: `l-rules`, `l-validate.async`), `src/generator/context.ts` (`plugin_count`, the security block: `l-rules` evaluates data, never code), `docs/security.md` (rules are data; remote validators post form data — say so), `packages/core/faqir-core.d.ts` (`$rules` magic typing if 1.1B-04 added one), `tests/generator/*`, `tests/commands/context.test.ts`

**Tests**
- Skill and context tests assert the new directive, modifier and plugin appear with their one-line contracts; the security doc test (`tests/generator/security-docs.test.ts`) pins the new paragraph; `check:skill`, `check:core-package` (cdn.json carries `plugins/faqir-rules.js`), `check:docs` green.

**Acceptance criteria**
- [ ] Every agent surface (README, skill, context, llms, MCP resources, security doc) documents rules, the validator registry and async validation from generated data.
- [ ] `@faqir-ui/rules` is in the release script's package list and `check:package` passes for it.

---

## Task details — Lane N

### 1.1N-01 · Night Shift v0: skill, queue, ledger, theme dream

**Depends:** 1.1A-12, 1.1A-16 · **Ref:** §10.1–10.3, ratified decision 4 · **Touches:** new `.claude/commands/faqir-dream.md`, new `.faqir-dreams/queue.json` + `queue.schema.md`, new `dreams.tsv` (ledger, same shape as `autoresearch-results.tsv` plus `kind`, `branch`, `gates`, `taste`), new `scripts/dream/theme.mjs`, `scripts/dream/snapshot.mjs` (Playwright Chromium screenshot of a theme preview; dev-time only), `scripts/dream/ledger.mjs`, `tests/dream/*.test.ts`, `docs/night-shift.md`

The loop, as software:

1. **Queue.** `queue.json` holds dream briefs: `{ id, kind: "theme", brief: "...", axes_hint?: {…}, added, status }`.
   Seed it with twelve briefs written in this session (moods and regions of the axis space
   the 24 themes leave empty — the distinctiveness table says where).
2. **Dream.** `/faqir-dream` (one dream per run, like `/faqir-plan`): pick the first
   pending brief; on a branch `dream/theme-<id>` write a seed from the brief (the agent
   chooses axes; `scripts/dream/theme.mjs --brief <id>` validates the seed, runs
   `faqir theme generate --seed … --out registry/themes`, the theme gauntlet
   (`bun test tests/themes tests/commands/theme-generate.test.ts`), `audit:registry`,
   `gen:theme-manifests`, `gen:theme-previews`, `build:core-package`, `gen:skill`, and
   `snapshot.mjs` for a light/dark PNG pair); the agent self-scores the PNGs against the
   rubric (1.1N-02 formalizes it; v0 is a three-line checklist) and writes the scorecard.
3. **Output.** If every gate passed: commit on the branch, `gh pr create` with the
   scorecard and images when a remote and `gh` exist, else leave the branch and a
   `.faqir-dreams/out/<id>/` bundle; append a ledger row (`keep`). If a gate failed:
   discard the branch, append a ledger row (`discard`, reason). Mark the brief.
4. **Guards** — in the script, not the prose: refuses to run on `main` with a dirty tree,
   refuses to touch `SPEC-1.0.md`, `src/protocol.ts`, `manifest.schema.json`,
   `package.json` dependencies, or visual baselines (a path allow-list checked on the
   diff before commit); never merges, never pushes to `main`, never runs
   `--allow-similar`.

**Tests**
- `tests/dream/ledger.test.ts`: row format, append-only, parse round-trip; `tests/dream/queue.test.ts`: schema, pick order, status transitions; `tests/dream/guards.test.ts`: the allow-list rejects a diff touching a forbidden path; the script refuses on `main`/dirty; dry-run mode performs no writes.
- `tests/dream/theme-dream.test.ts`: with a fixture brief and the generator stubbed to a known seed, the pipeline produces the expected files, runs the gate list in order (asserted via a recording spawn), and writes a `keep` row; a failing gate writes `discard` and leaves no branch.
- `tests/meta/spawn-timeouts.test.ts` covers the new scripts.

**Acceptance criteria**
- [ ] One `/faqir-dream` run turns a brief into a gated, PR-ready theme branch (or a discard row), with guards enforced by code.
- [ ] Queue seeded with twelve briefs; ledger documented; `docs/night-shift.md` explains the loop, the guards and the morning review.
- [ ] Zero new dependencies (Playwright is already a devDependency; `gh` is optional).

---

### 1.1N-02 · Cadence: nightly runner, weekly digest, taste rubric v0

**Depends:** 1.1N-01 · **Ref:** §10.5–10.6 · **Touches:** new `scripts/dream/nightly.sh` (worktree per run, `claude -p "/faqir-dream"`-style invocation documented for both the local cron/launchd path and a `/schedule` cloud routine), new `scripts/dream/digest.mjs` → `DREAMS.md` (kept/discarded this week, images, nearest-theme numbers, open PRs), new `docs/dream-rubric.md` (hierarchy, rhythm, contrast, restraint, fit — each scored 1–5 with one sentence; the agent records the scores and reasons in the scorecard, the human decides), `.claude/commands/faqir-dream.md` (uses the rubric), `docs/night-shift.md`, `tests/dream/digest.test.ts`

**Tests**
- `tests/dream/digest.test.ts`: digest renders from a fixture ledger (counts, sections, image links, PR links optional); idempotent; a week boundary case.
- `nightly.sh` is shell-checked by a test that runs it in `--dry-run` inside a temp worktree and asserts it creates and removes the worktree and never touches `main`.

**Acceptance criteria**
- [ ] A nightly invocation path exists for local scheduling and for a cloud routine, documented and dry-run tested.
- [ ] `DREAMS.md` is generated from the ledger; the rubric is versioned and referenced from every scorecard.

---

## Task details — Release

### 1.1R-01 · Release 1.1 "Personality"

**Depends:** 1.1A-20, 1.1B-07, 1.1N-02 · **Ref:** §11 (the 1.1 row), `docs/release-checklist.md` · **Touches:** `scripts/release.mjs` (package list gains `@faqir-ui/rules`; preflight gains `check:rules-plugin`), `docs/release-checklist.md`, new `docs/release-1.1.md` (release notes: what shipped, the two amendments, schema 1.1, no breaking changes — asserted by the migration gate), `README.md` (numbers: 24 themes, 6 plugins, 7 packages), `FAQIR-VISION.md` §11 (mark the 1.1 row shipped with the date), `.faqir-plan/state.json`

Run the rehearsal — `node scripts/release.mjs minor --dry-run` — until it is green; run the
manual Playwright suites (visual matrix under the 1.1A-13 policy, print, a11y, browser) and
record their outcome in the release notes as the checklist asks; publish with the script;
deploy the docs site.

**Tests**
- `tests/build/release.test.ts`: the package list includes `rules`; preflight includes the new gate; dry-run propagates `1.1.0` to seven `package.json` files.
- `tests/migration/*`: the surface extractor reports **no** vocabulary loss against `v1.0.0` (additive release proven, not asserted).

**Acceptance criteria**
- [ ] `release.mjs minor --dry-run` green with all seven packages; release notes written; README and VISION updated.
- [ ] v1.1.0 tagged and published; docs deployed; `.faqir-plan/state.json` records the release.
