# FAQIR-VISION — The 1.x Direction

**Status:** proposal for ratification · **Written:** 2026-09-10 · **Baseline:** v1.0.0 (`676bb9f`)
**Companion documents:** `FAQIR-NEXT.md` (the 0.x → 1.0 overhaul, executed), `SPEC-1.0.md`
(frozen protocol), `FAQIR-PROTO-INTEGRATION.md` (proto adoption), `FAQIR-1.0-READINESS.md`
(the audit that shaped 1.0's last mile).

This document takes the post-1.0 brainstorm — deeper themes, a wider component surface,
motion and effects, a validation layer, three agent-first platforms (forms, reports,
QR micro-sites) and a self-improving nightly loop — and does three things with it:
**validates** what holds, **enhances** what needs a mechanism, and **dismisses** what would
cost the project its simplicity. It ends with a sequencing proposal and the handful of
decisions that need a human signature before a plan is written.

It is a vision, not a plan. Once ratified, each workstream becomes a `FAQIR-PLAN.md`-style
task list executed one task per session, exactly as 1.0 was.

---

## Table of Contents

1. [Where 1.0 actually stands](#1-where-10-actually-stands)
2. [The 1.x thesis](#2-the-1x-thesis)
3. [Simplicity invariants](#3-simplicity-invariants)
4. [Verdicts on the brainstorm](#4-verdicts-on-the-brainstorm)
5. [Workstream 1 — Personality: Theme System 2.0](#5-workstream-1--personality-theme-system-20)
6. [Workstream 2 — Surface: components for the whole web](#6-workstream-2--surface-components-for-the-whole-web)
7. [Workstream 3 — Motion & Effects](#7-workstream-3--motion--effects)
8. [Workstream 4 — Rules: validation as data](#8-workstream-4--rules-validation-as-data)
9. [Workstream 5 — Definitions: the JSON layer for forms, documents and pages](#9-workstream-5--definitions-the-json-layer-for-forms-documents-and-pages)
10. [Workstream 6 — Night Shift: the self-improving loop](#10-workstream-6--night-shift-the-self-improving-loop)
11. [Sequencing](#11-sequencing)
12. [Risks](#12-risks)
13. [Decisions to ratify](#13-decisions-to-ratify)

---

## 1. Where 1.0 actually stands

Verified against the tree at `676bb9f`, not against memory.

| Surface | Shipped at 1.0 |
|---|---|
| Protocol | Five attributes, frozen (`SPEC-1.0.md`), drift-tested against `src/protocol.ts` |
| Registry | 86 components — 42 primitives, 29 recipes, 15 patterns — zero self-audit findings |
| Themes | 12, each with a generated `.theme.json` and preview; `faqir theme generate` builds a theme from one accent + neutral + radius |
| Tokens | palette · spacing · typography · effects · motion · semantic · aliases · document · density |
| Engine | 17 `l-*` directives, 11 magics, keyed `l-for` with an LIS reconciler, `l-source` REST binding, transitions via `data-motion` |
| Plugins | `collapse`, `intersect`, `mask`, `persist`, `validate` |
| Packages | `@faqir-ui/core`, `/forms` (JSON Schema → Faqir HTML), `/mcp`, `/react`, `/vue` |
| Agent surface | `faqir audit` (31 rules, same code in CLI / MCP / browser), `repair`, `context`, a generated `faqir-creator` skill, `faqir dev` inspector |
| Documents | `document` pattern (invoice / form / report, A4 / Letter), page tokens, running header/footer, `page-break`, `signature`, `watermark`, `barcode`, `qr-code`, print visual gate |
| Quality gates | 3,013 axe cases, visual snapshots, layout-lint budget, parser fuzzing, contrast + elevation gates on every theme, byte-identical generated artifacts |
| Loops | `faqir-plan` skill (one task per session, `.faqir-plan/state.json`), an `autoresearch-results.tsv` metric ledger from the layout-lint campaign |

Two facts from that table drive most of what follows.

**The theme surface is ~40 tokens wide and all of them are colour.** `aurora` overrides
37 tokens; every one is a `--color-*`, a `--shadow-*` or the `--gradient-accent`.
`brutalist` adds radii and eight component aliases. No shipped theme touches typography,
spacing, motion, borders, texture or focus — because there is nothing there for a theme to
touch: components read `--font-sans` directly, not a `--font-heading` role token; there is no
`--border-width-*` ramp, no `--texture-*`, no motion personality. Twelve themes look like
twelve colourways of one theme because that is literally what they are. This is a token
vocabulary problem, not a taste problem, and it has a mechanical fix (§5).

**The forms stack already exists and is deeper than the brainstorm assumes.**
`@faqir-ui/forms` renders JSON Schema + a UI schema to a Faqir form with wizard steps, layout
groups, repeatable rows and `l-validate` wiring; `faqir-validate` reflects native
`ValidityState` plus `l-validate:<name>="expr"` custom validators into `field-group`. What is
missing is not a validation layer — it is a *portable* one: rules as data that run
identically in the browser and on the server, cross-field logic, conditional visibility,
computed values and async checks (§8).

---

## 2. The 1.x thesis

1.0 proved the closed loop: **a model writes intent in a frozen protocol; the library owns
mechanism; a deterministic auditor says yes or no.** 1.x extends that loop in three
directions without opening it.

| Move | One sentence | Serves |
|---|---|---|
| **Personality** | Themes become points in a multi-axis space (type, shape, depth, material, motion, focus, decoration), generated from a seed and gated for distinctiveness, so two themes can no longer be colourways of each other. | QR micro-sites, white-label forms, proto marketing |
| **Surface** | The registry grows from "admin dashboard" to "the whole web" — lists, testimonials, galleries, marketing sections, form question types, report blocks — plus a motion-and-effects layer that rides native CSS instead of a runtime. | Every use case |
| **Definitions** | A JSON layer above HTML — form, document and page definitions whose grammar *is* the registry's manifests — so platform agents write data, a deterministic renderer writes markup, the same rule set validates on both sides, and `faqir audit` still has the last word. | Forms platform, reports/PDF, QR pages |

And one meta-move: **Night Shift** — the repo grows itself overnight through gated,
PR-only "dreams" (themes, components, motion, dogfood), using the generators and gates 1.0
already has, with a ledger so the loop learns what to keep.

The protocol does not change. Nothing below adds a sixth attribute, a runtime dependency or a
build step for consumers. Manifest schema moves to **1.1 additively** (new optional fields)
under the process SPEC-1.0 §8 already anticipates — the `main` `$id` alias serves the newest
1.x schema, `v1.0.0` keeps serving the frozen one.

---

## 3. Simplicity invariants

Every proposal in this document was checked against these. Anything that fails one was cut
or moved to an optional package.

1. **Same recipe for everything.** A new capability is HTML + CSS + manifest, plus a
   controller only when CSS cannot do it. It gets a preview, tests, an audit rule where a
   mistake is possible, and it appears in the regenerated skill and MCP context automatically.
2. **Five attributes, forever.** New knobs are component props (`data-depth`, `data-effect`,
   as `data-cols` and `data-full` already are), CSS-only subtree modifiers like `data-density`,
   or directives. Never a sixth protocol attribute.
3. **Native platform first, feature-detected, never polyfilled.** Scroll-driven animations,
   view transitions, `@starting-style`, `@property`, `linear()` easing, `light-dark()`,
   anchor positioning, `corner-shape`. Where a browser lacks a feature the page degrades to
   static, correct, accessible — it never breaks.
4. **Zero runtime dependencies in the registry and the engine.** Chromium for PDF and
   screenshots is a CLI dev-dependency, never a framework one. WebGL, canvas charting
   libraries and rich-text editors do not enter core.
5. **Themes are data.** A theme is a seed (accent + axis choices) and, optionally, a short
   signature stylesheet. The generator is tested once; hand-written theme CSS is the
   exception, not the rule.
6. **Rules are data.** Validation and logic are JSON, evaluated by one zero-dependency engine
   that runs in the browser and on the server with identical verdicts. No arbitrary JavaScript
   from a definition ever reaches `new Function`.
7. **Manifests are the grammar.** The definition language does not invent a second
   vocabulary: a block *is* a component, its props *are* the manifest's props, variants and
   slots. The definition JSON Schema is generated from the registry index.
8. **Every motion has a reduced-motion path and a budget.** The audit enforces both.
9. **Nothing generated is hand-edited.** Skill, manifests, previews, indexes, theme
   manifests — same discipline as today, extended to definition schemas and dream ledgers.
10. **No silent failures.** Every new runtime feature reports when it does nothing
    (the 1.0 readiness through-line). A capability that can fail quietly ships with a dev-build
    diagnostic and an audit rule before it ships with a preview.

### Explicitly not doing

| Idea | Why not |
|---|---|
| Drag-and-drop form/page builder | The agent is the builder; a click-to-edit preview that writes back to the *definition* may come later, but never a canvas of widgets |
| Rich-text editor | Mature libraries exist; ours would be a runtime dependency with a huge surface |
| WebGL / Three.js in core | Runtime dependency, bundle weight, accessibility void. CSS 3D covers flip, tilt, perspective and stacking; anything else goes through an explicit `embed` escape hatch |
| Sound in core | No `prefers-reduced-sound` exists, so there is no accessibility floor to inherit. Ships only as an opt-in synthesized plugin, off by default (§7.6) |
| Hand-written themes at scale | The 12 we have took a release each. Generated themes with signature overrides is the only way to reach 30 without a quality cliff |
| A custom expression DSL | Agents already know JSON Schema and JSONLogic; a home-grown language costs correctness on every generation |
| Runtime CSS-in-JS, utility classes, Tailwind bridges | Protocol rule 5 |
| Polyfills | Feature-detect and degrade |

---

## 4. Verdicts on the brainstorm

| Brainstorm item | Verdict | What changes |
|---|---|---|
| Themes deeper vertically (more variables) | **Validate — root cause found** | Role tokens (`--font-heading` etc.), new token families (type scale, shape, depth, material, motion personality, focus, decoration, control silhouettes), components re-pointed at them |
| Themes wider horizontally (more themes) | **Enhance** | 12 → 24 in 1.1 via seeds, with a distinctiveness gate so "more" also means "different"; further themes come from Night Shift |
| Components common to all websites (lists, testimonials…) | **Validate** | ~45 new components in six collections, prioritized by frequency on the open web × pull from the three platforms (§6) |
| Animations & transitions | **Validate, with a doctrine** | Motion tokens per theme personality, preset expansion, `l-transition.view`, view transitions for micro-sites; every motion reduced-motion-safe and budgeted |
| Scroll animations, parallax | **Enhance** | CSS scroll-driven animations (`animation-timeline: view()/scroll()`), zero JS on the primary path, `l-intersect` fallback — `reveal`, `parallax`, `scroll-progress`, `scrolly` |
| SVG & icons | **Enhance** | Icon *packs* on demand (full Lucide + a CC0 brand set) instead of a bigger sheet; section dividers, patterns, blobs as CSS masks/backgrounds; an `svg-a11y` audit rule |
| Images | **Validate** | `gallery`, `lightbox`, `compare`, blur-up, art-directed `picture`, `video` with poster fallback |
| Sounds | **Defer to opt-in plugin** | `faqir-sound`: synthesized cues, no assets, off until a user gesture enables it, never for essential feedback |
| 3D animations | **Split** | CSS 3D in core (`flip-card`, `tilt`, `data-effect="perspective"`); WebGL out of core, via `embed` |
| "All the shiny things" | **Validate, with a budget** | Gradient text, glow, shimmer, animated borders, spotlight, magnetic, marquee, counters, typewriter, bento — as props and primitives; `motion-budget` audit rule keeps a page from becoming a fireworks show |
| Validation layer (declarative / rules / regex / expressions) | **Enhance** | `@faqir-ui/rules`: JSON Schema subset for shape + JSONLogic subset for logic; isomorphic; wired into `faqir-validate` and `l-show` by a plugin; async validators; i18n messages |
| Forms platform, 100% agentic, JSON definition | **Validate — and generalize** | A form *definition* whose block grammar is the manifests; rendered by a string builder (as `/forms` already is); audited; validated by the same rules on the server; "conversational" variant with view transitions |
| Report generation & PDF, same JSON | **Validate** | Document definition profile on the `document` pattern; `@faqir-ui/charts` as isomorphic SVG strings; `faqir print` via Chromium (CLI dev-dep) |
| QR platform with agent-generated pages | **Validate** | Page definition profile + micro-site scaffolds (menu, vCard, event, product, review funnel, link-in-bio, coupon, ticket); QR design variants with a scannability gate; per-customer theme seed from one brand colour |
| Faqir "dreaming" themes/components/animations overnight | **Validate — precedent exists** | Night Shift: queue → one dream per run → gates → PR + scorecard → ledger. Never auto-merge. Starts with themes because their gates already exist |

---

## 5. Workstream 1 — Personality: Theme System 2.0

### 5.1 Diagnosis, precisely

A theme today can only re-declare what components read, and components read colour,
shadow, radius and a handful of aliases. Three structural gaps:

1. **No role tokens for type.** `button-font` → `--font-sans`; prose headings → `--font-sans`.
   A theme wanting serif headings on sans body has no token to set. Same for heading weight,
   tracking, case, and the type scale ratio (sizes are eight fixed rems).
2. **No families for shape, depth, material, motion personality, focus, decoration.**
   Border widths are literals in component CSS. Shadows are a ramp but the *model* (flat,
   layered, hard-offset, glass, inset) is not expressible. Motion is one set of durations.
3. **Component aliases are shallow.** `--input-radius`, `--input-border`, `--input-bg`
   exist; `--input-border-width` (0 0 1px 0 gives an underline input), `--checkbox-radius`,
   `--button-shadow`, `--card-border-width` do not.

### 5.2 The axis model

A theme is a **seed**: an accent plus one value per axis. Every axis maps to a token family
that components consume. The generator turns a seed into CSS; the gates verify it.

| Axis | Values | Token family it drives |
|---|---|---|
| `accent` | any OKLCH hue/chroma | primary ramp, ring, gradient accent, chart palette |
| `neutral` | `gray` `cool` `warm` `tinted` (accent-tinted) | bg / fg / border ramps |
| `scheme` | `light` `dark` `both` | scheme blocks (see 5.4) |
| `type.pairing` | `system` `humanist` `grotesque` `geometric` `rounded` `editorial-serif` `modern-serif` `slab` `mono` — or an explicit heading/body pair | `--font-heading` `--font-body` `--font-ui` `--font-mono` *(new role tokens)* |
| `type.scale` | ratio `1.125`…`1.333`, base `15`…`18` | `--text-*` ramp, recomputed |
| `type.voice` | heading weight, tracking, case, leading | `--heading-weight` `--heading-tracking` `--heading-transform` `--heading-leading` *(new)* |
| `shape` | `sharp` `soft` `round` `pill`; border `hairline` `regular` `heavy`; corner `round` `bevel` `scoop` `notch` | `--radius-*` ramp, `--border-width-*` *(new)*, `--corner-shape` *(new, progressive)* |
| `depth` | `flat` `soft` `layered` `hard` `glass` `inset` | `--shadow-*` ramp, `--shadow-color`, `--surface-blur`, `--surface-alpha` *(new)* |
| `material` | `none` `grain` `paper` `mesh` `dots` `grid` `stripes` | `--texture-page` `--texture-surface` *(new; inline SVG data URIs, `currentColor`)* |
| `motion` | `none` `minimal` `smooth` `snappy` `springy` `playful` | `--duration-*` `--ease-*` (incl. `linear()` springs), `--motion-hover-lift` `--motion-stagger` `--motion-reveal-distance` *(new)* |
| `density` | `compact` `comfortable` `spacious` | root default for the existing modifier; `spacious` is new |
| `focus` | `ring` `glow` `underline` `inset`; width; offset | `--focus-style` `--focus-width` `--focus-offset` *(new)* |
| `decoration` | link underline (`none` `plain` `offset` `gradient`), divider (`solid` `dashed` `ornament`), selection, scrollbar, list marker | `--link-decoration` `--divider-style` `--selection-bg` `--marker` *(new)* |
| `controls` | button (`rect` `pill` `soft`), input (`box` `filled` `underline`), checkbox (`square` `round`), switch (`pill` `square`) | expanded component aliases (5.3) |
| `contrast` | `standard` `high` | multiplies ramps; replaces the hand-written `contrast` theme's mechanism |

Fourteen axes. Two shipped themes **must differ on at least four** of them — a rule the
theme gate enforces, so the sameness problem cannot return.

### 5.3 What components must do

The axis model is only as real as the tokens components read. 1.1 therefore includes a
**re-pointing pass** across all 86 components:

- headings, `text`, `prose`, `stat`, `hero`, `document` read `--font-heading` / `--font-body`
  instead of `--font-sans`;
- every literal border width becomes `var(--border-width-*)`;
- every `box-shadow` reads the ramp *and* `--shadow-color`;
- every hover/enter/leave reads motion tokens (already true for presets; not yet for all
  recipes);
- `surface`, `card`, `hero`, `document` accept `--texture-*`;
- focus styles read `--focus-*` (one place — `base/reset.css`);
- component aliases grow where a real theme would want to differ: `--input-border-width`,
  `--input-bg-filled`, `--checkbox-radius`, `--button-shadow`, `--button-text-transform`,
  `--card-border-width`, `--table-stripe`, `--link-decoration`.

`tokens_used` in every manifest is regenerated; a drift test (`token-coverage`) fails if a
theme axis has no consumer or a component hardcodes a value an axis owns.

### 5.4 Theme authoring 2.0

**One block, not three.** Today every theme repeats its dark tokens twice (`[data-theme="dark"]`
and `@media … [data-theme="auto"]`). `light-dark()` — shipped in all three engines in 2024 —
collapses the file:

```css
:root                 { color-scheme: light; }
[data-theme="dark"]   { color-scheme: dark; }
[data-theme="auto"]   { color-scheme: light dark; }

:root {
  --color-bg: light-dark(oklch(0.98 0.004 300), oklch(0.13 0.008 290));
  …
}
```

Theme files halve. The generator emits this form; `gen-theme-manifests` parses both forms
during the transition; the old form stays valid.

**Seed → CSS → gates.** `faqir theme generate` grows from four inputs to the full seed:

```bash
faqir theme generate ember \
  --accent "oklch(0.62 0.2 40)" --neutral warm \
  --type editorial-serif --scale 1.25 --shape soft --depth hard \
  --material grain --motion springy --focus glow --controls underline
```

It writes `ember.css`, `ember.seed.json`, `ember.theme.json`, the preview, and a **scorecard**:
contrast pairs (existing), elevation ΔE (existing), tap-target size under the seed's density,
type-scale sanity, motion budget, and **distinctiveness** — the axis distance to every shipped
theme plus a perceptual histogram distance between preview renders. Below threshold, the
command refuses to write and says which theme it collides with.

**Signature CSS.** A theme may carry a `<name>.signature.css` for the few things a seed cannot
express (aurora's gradient, terminal's scanlines). It is limited to token re-declarations and
`::before/::after` decoration on `surface`/`hero`/`document`; the registry audit rejects
anything that selects a component through it.

**Scoped themes.** `faqir theme bundle <name> --scope` rewrites `:root` to `[data-skin="<name>"]`
so a customer-themed form can preview inside a default-themed admin. `data-skin` is proposed
as a sanctioned subtree modifier through SPEC-1.0 §8; it re-declares tokens and nothing else,
exactly like `data-density`.

### 5.5 Fonts — the honest lever

Type is the single largest contributor to a theme reading as *different*, and system font
stacks cap how far that can go. The stance:

- **Default stays system stacks.** Zero requests, zero privacy surface, correct in print.
- **`faqir fonts add <family>`** downloads OFL-licensed families into the project
  (`ui/fonts/`), writes `@font-face` with `font-display: swap` and `size-adjust` fallbacks,
  and points the theme's `--font-*` role tokens at them. Self-hosted only; never a Google
  Fonts link (CSP, privacy, offline previews).
- A curated pairing list ships with the CLI: Inter · Geist · Manrope · DM Sans · Space Grotesk
  · Bricolage Grotesque · IBM Plex (Sans/Serif/Mono) · Source Serif 4 · Fraunces · Instrument
  Serif · Newsreader · Lora · Nunito · JetBrains Mono. Each `type.pairing` value names a
  primary pairing and its system fallback, so a seed renders acceptably before fonts are added
  and distinctly after.

### 5.6 The horizontal list: 12 → 24

New themes are seeds, each chosen to occupy an empty region of the axis space. Working names
and the axes that make each one different:

| Theme | Type | Shape | Depth | Material | Motion | Signature |
|---|---|---|---|---|---|---|
| `editorial` | editorial-serif, 1.333 | soft, hairline | flat | paper | minimal | drop caps, ornament dividers |
| `swiss` | grotesque, 1.25, uppercase headings | sharp, regular | flat | grid | snappy | red accent, rules |
| `neo` (neo-brutalist) | grotesque, heavy | sharp, heavy | hard (offset) | none | playful | loud accent, black borders |
| `luxe` | modern-serif, tracked caps | soft | soft | mesh | smooth | gold on near-black |
| `candy` | rounded | pill | soft | none | springy | pastel ramps |
| `organic` | humanist | round | soft | grain | smooth | warm neutrals |
| `clinical` | humanist | soft | flat | none | minimal | calm blues, high legibility |
| `fintech` | geometric | soft | layered | none | snappy | dark, green accent, mono numerals |
| `nordic` | geometric, light | round | flat | none | smooth | airy, cool |
| `sunset` | humanist | soft | soft | mesh | smooth | warm gradient accent |
| `ink` | mono/serif mix | sharp | flat | paper | minimal | monochrome, underline inputs |
| `neumorph` | rounded | round | inset | none | smooth | soft extruded surfaces |

The existing 12 are re-expressed as seeds too (with signature CSS where they need it), which
is how the distinctiveness gate learns the space. `contrast` becomes the `contrast: high`
axis applied to `default`, freeing a slot.

Beyond 24, themes are Night Shift's job (§10): the generator plus the gates make a new theme
cheap, and the ledger makes it accountable.

### 5.7 Manifest 1.1 (theme side, additive)

```json
{
  "seed": { "accent": "oklch(0.62 0.2 40)", "neutral": "warm", "type": {…}, "shape": {…}, … },
  "axes": { "type": "editorial-serif", "shape": "soft", "depth": "hard", … },
  "fonts": [{ "family": "Fraunces", "license": "OFL", "role": "heading" }],
  "distinctiveness": { "nearest": "paper", "axis_distance": 6, "visual_distance": 0.41 },
  "pairs_with": ["editorial-serif-document"]
}
```

`mood`, `scheme`, `dark_mode`, `tokens_overridden`, `tokens_inherited`, `preview` stay as
they are. Agents pick a theme by axes, not by adjectives — the skill's theme reference is
regenerated from these fields.

---

## 6. Workstream 2 — Surface: components for the whole web

### 6.1 Selection principle

A component earns a slot when two scores are high: **frequency** — how often it appears on
the open web (marketing sites, content sites, commerce, community, tools) — and **pull** — how
many of the three platforms need it. Everything below scored high on both; the long tail
goes to the Night Shift queue (§10) ranked by the same two numbers.

Collections are a **registry-index field**, not a folder change: `collection: marketing |
content | forms | commerce | community | documents | effects`. The manifest schema already
has `category`; 1.1 populates it and the index exposes it so agents and the docs site can
browse by intent.

### 6.2 Content & marketing (highest frequency)

| Component | Kind | JS | Notes |
|---|---|---|---|
| `list` | primitive | no | The generic list the brainstorm asked for: `data-variant="plain\|bulleted\|numbered\|checked\|icon\|divided\|interactive\|media"`; parts `item` `leading` `content` `title` `meta` `trailing`. Covers feature lists, settings rows, notification rows, changelogs. Highest-leverage primitive in the list |
| `testimonial` | primitive | no | `quote` `author` `avatar` `name` `role` `rating` `logo`; variants `card\|quote\|minimal\|featured` |
| `testimonials` | pattern | no | grid · carousel (existing recipe) · marquee · masonry of `testimonial` |
| `logo-cloud` | pattern | no | static grid or `marquee`; monochrome via `currentColor` masks |
| `feature-list` | pattern | no | alternating media/text rows ("zigzag"); complements `feature-grid` |
| `cta` | pattern | no | call-to-action band; `data-variant="band\|card\|split"` |
| `faq` | pattern | no | `accordion` composition with `itemscope` FAQPage microdata |
| `team` | pattern | no | avatar cards with socials |
| `timeline` | primitive | no | vertical/horizontal; roadmap, changelog, history |
| `steps` | pattern | no | "how it works"; `stepper` composition |
| `comparison` | pattern | no | check/cross feature matrix on `table` |
| `stats-band` | pattern | no | `stat` row with `counter` effect |
| `site-header` | pattern | menubar | the missing pair of `site-footer`; sticky, collapsing, mobile `drawer` |
| `mega-menu` | recipe | yes | panels under `menubar`, anchor-positioned where supported |
| `announcement-bar` | primitive | persist | dismissible top bar |
| `cookie-consent` | recipe | persist | categories, accessible, no dark patterns by default |
| `newsletter` | pattern | validate | input + button + inline validation |
| `contact` | pattern | validate | `form-page` composition with details and a `map` slot |
| `article` | pattern | no | `prose` + byline + reading time + `toc` + share |
| `post-card` / `post-list` | pattern | no | blog index |
| `author` | primitive | no | byline |
| `toc` | recipe | intersect | table of contents with scroll-spy |
| `code-block` | primitive + recipe | copy | tokens as `data-token="kw\|str\|…"` spans written by the generator, never highlighted at runtime |
| `gallery` | recipe | yes | grid + `lightbox` |
| `lightbox` | recipe | yes | on `dialog`, keyboard and swipe |
| `video` | primitive | no | aspect + poster + play overlay; autoplay only muted; reduced-motion → poster |
| `map` | primitive | no | embed slot with aspect and fallback address |
| `bento` | pattern | no | tiled grid with span props |
| `error-page` | pattern | no | 404 / 500 / maintenance |
| `waitlist` | pattern | validate | coming-soon with email capture |

### 6.3 Forms platform question types

These extend `@faqir-ui/forms`' widget map; each is a registry component first.

| Component | Kind | JS | Maps from |
|---|---|---|---|
| `rating` | primitive | no | stars / hearts; read-only and input modes; `number` + `maximum` + `ui:widget: rating` |
| `scale` | primitive | no | opinion scale 1–10, NPS, Likert with labelled ends |
| `matrix` | recipe | roving | grid of radios/checkboxes per row |
| `ranking` | recipe | yes | keyboard-sortable list; `array` + `ui:widget: ranking` |
| `image-choice` | primitive | no | picture cards as radio/checkbox |
| `signature-pad` | recipe | yes | draws to a hidden input (PNG data URI); the print `signature` primitive stays separate |
| `phone` | recipe | mask | country selector + mask |
| `currency` | primitive | mask | locale-formatted number |
| `address` | composite | no | country-aware field set |
| `time-picker`, `date-range` | recipe | yes | siblings of `date-picker` |
| `consent` | primitive | no | checkbox + legal text + required semantics |
| `payment` | pattern | no | a `data-part="payment"` mount slot for a provider element; explicit escape hatch with a fallback part |
| `thank-you` | pattern | no | submission end state |
| conversational form | `form-page` variant | engine | one question per view, progress, view transitions (§7) |

### 6.4 Documents, commerce, community

| Component | Kind | Notes |
|---|---|---|
| `chart` | recipe on `@faqir-ui/charts` | bar, line/area, pie/donut, sparkline, gauge, heatmap — SVG strings (§9.4) |
| `report` document variant | pattern | cover, numbered figures/tables via CSS counters, appendix, footnotes |
| `receipt`, `certificate`, `label`, `ticket`, `letterhead` | document variants | the QR platform's paper side: tickets and labels carry `qr-code` / `barcode` |
| `product-card`, `price`, `cart` (line items) | commerce | `price` handles strike-through, currency, per-period |
| `chat` | pattern | message thread with roles; proto's agent screen needs it |
| `activity-feed`, `notification-center` | patterns | on `list` |
| `kanban` | recipe | keyboard-first moves; pointer drag optional |
| `share`, `social-links` | recipe / pattern | Web Share API with fallbacks; brand icon pack |

### 6.5 Icons and SVG

- **Packs, not a bigger sheet.** `faqir add icons --only` already subsets; 1.2 adds
  `faqir add icons --pack lucide-full | brands | files | arrows` and `faqir icons add <name>`
  to pull any single glyph from the vendored full Lucide set into the project's `icons.css`.
  The registry sheet stays at ~120 so the default bundle does not grow.
- **Brand icons** as a separate CC0 pack (Simple Icons) for footers, share buttons, logo clouds.
- **Decorative SVG as CSS.** `section-divider` (wave, tilt, curve, zigzag as masks),
  `data-texture` patterns (dots, grid, grain via `feTurbulence`), `blob` (animated gradient
  shapes via `@property`). All `currentColor`, all themeable, none a file request.
- **Inline SVG stays the agent's.** Illustrations and custom marks are inline SVG the agent
  writes; a new `svg-a11y` audit rule requires `role="img"` + a title or `aria-hidden`.
- **Icon motion** as props on `icon`: `data-animate="spin|pulse|draw"` (draw uses
  `stroke-dashoffset` on the mask source and needs the inline variant).

### 6.6 Images and video

`image` gains `data-variant="blur-up"` (LQIP via a tiny inline placeholder and
`@starting-style`), art direction through `<picture>` in its canonical HTML, and `compare`
(before/after slider) as a recipe. `video` above. The audit's alt-text rule extends to `video`
(captions track or `aria-label`) and `gallery` items.

---

## 7. Workstream 3 — Motion & Effects

### 7.1 Doctrine

1. **CSS animates; JavaScript only stamps.** The engine already does this for enter/leave
   (`data-motion`). Every new effect keeps it: JS sets an attribute or a CSS variable; CSS does
   the motion.
2. **Scroll and pointer effects ride native CSS.** Scroll-driven animations
   (`animation-timeline: view()` / `scroll()`) are the primary path — zero JS, off the main
   thread. `l-intersect` and a ~1 KB pointer plugin are the fallbacks and the inputs.
3. **Motion is a theme axis.** A `springy` theme and a `minimal` theme animate the same
   `reveal` differently because the tokens differ; components never hardcode a duration.
4. **Reduced motion is not optional.** The engine already withholds `data-motion` under
   `prefers-reduced-motion`; effect CSS ships inside `@media (prefers-reduced-motion: no-preference)`
   with the static state as the default. The registry audit rejects an effect without it.
5. **A page has a motion budget.** New page-audit rule `motion-budget`: at most N effect
   components per page and M per viewport (defaults 8 / 3, configurable). Agents love
   fireworks; the auditor does not.
6. **Nothing autoplays with sound, nothing loops without a pause control** — audit rules
   `no-autoplay-audio` and `marquee-pausable`.

### 7.2 Platform features we ride

| Feature | Used for | Where unsupported |
|---|---|---|
| Scroll-driven animations | `reveal`, `parallax`, `scroll-progress`, `scrolly` | static, or `l-intersect` stamps `data-motion` |
| View Transitions (same-document) | `l-transition.view` wraps a state flip in `startViewTransition()`; conversational forms; tab/route swaps | plain transition |
| View Transitions (cross-document) | micro-sites: `@view-transition { navigation: auto }` behind a `data-vt` root opt-in | instant navigation |
| `@starting-style` | entry animations for `dialog`, `popover`, `toast`, blur-up | element appears |
| `@property` | animated gradients, animated borders, `counter` count-up with zero JS | final value |
| `linear()` easing | spring curves as tokens (`--ease-spring`) | `--ease-out` |
| `light-dark()` | theme authoring (§5.4) | already universal |
| Anchor positioning | `tooltip`, `popover`, `dropdown`, `mega-menu` positioning without JS math | existing controller positioning |
| `corner-shape` | `shape.corner` axis (bevel/scoop/notch) | rounded corners |
| `popover` attribute, `<dialog>` | already used; extend to `mega-menu`, `lightbox` | already universal |

Feature detection is `@supports` in CSS and one `Faqir.supports` map in the engine; the dev
build reports when a page relies on a feature the current browser lacks — no silent no-ops.

### 7.3 The layer, bottom to top

**Tokens** (theme axis `motion`): durations, easings including springs, hover lift, stagger
step, reveal distance, blur amount.

**Presets** (`base/motion-presets.css`): `fade`, `slide-up` and `scale` grow to
`slide-{up,down,left,right}`, `blur`, `flip`, `clip` (reveal by `clip-path`), `pop`, and a
`stagger` modifier that reads `--motion-stagger` × child index (`sibling-index()` where it
exists, `--i` custom property set by the engine otherwise).

**Effect primitives and props** — every one a manifest entry:

| Name | Form | Mechanism |
|---|---|---|
| `reveal` | primitive; `data-variant="up\|fade\|scale\|blur\|clip"`, `data-part="item"` for stagger, `data-delay` prop | `animation-timeline: view()`; fallback stamps |
| `parallax` | primitive; `data-part="layer"` with `data-depth="1..5"` | `animation-timeline: scroll()` on translate |
| `scroll-progress` | primitive | `scroll(root)` timeline on `scaleX` |
| `scrolly` | pattern | sticky graphic + `reveal` steps that set `$state` via `l-intersect` |
| `marquee` | recipe | CSS keyframe track; controller clones for seamless loop, pauses on hover/focus, exposes a pause button |
| `counter` | primitive | `@property --n` + `counter()` for integers, zero JS; JS fallback for decimals |
| `countdown` | recipe | timer + `counter` |
| `typewriter` | recipe | `steps()` animation; live region politeness handled |
| `flip-card` | recipe | CSS 3D; keyboard toggle; `data-state="flipped"` |
| `tilt` | recipe | pointer variables → `rotateX/Y` |
| `bento` | pattern | grid spans; pairs with `reveal` stagger |
| `data-effect` prop on `surface`, `card`, `button`, `text`, `image` | `glow` `shimmer` `gradient` `spotlight` `magnetic` `lift` `border-glow` `aurora` | CSS; `spotlight`/`magnetic` read pointer variables |
| `section-divider`, `blob`, `data-texture` | see §6.5 | CSS masks / `@property` |

**Plugins** (two, tiny, optional):

- `faqir-pointer` (`l-pointer`): sets `--pointer-x/--pointer-y` (0–1) and `--pointer-px/py`
  on its element from `pointermove`, rAF-throttled. Every pointer effect is CSS reading those.
- `faqir-reveal` fallback: for browsers without scroll timelines, uses the existing
  `l-intersect` machinery to stamp `data-motion="enter"` → `enter-active`, so `reveal` shares
  the same CSS lifecycle `l-transition` already defines.

**Engine**: `l-transition.view` modifier; `Faqir.supports`; the `--i` index for stagger
inside `l-for`.

### 7.4 SVG and image motion

Icon `draw`, logo-cloud `marquee`, `gallery` transitions through view transitions
(`view-transition-name` derived from `$id`), `image` `compare` slider. Lottie and animated
SVG files are out: an animated SVG the agent writes inline is fine and audited like any SVG.

### 7.5 3D

CSS 3D only: `flip-card`, `tilt`, `data-effect="perspective"` on `carousel` (cover-flow
variant), stacked-card decks. WebGL lives behind the `embed` primitive: a `data-part="scene"`
that Faqir never audits inside, and a required `data-part="fallback"` it does. A platform that
wants `<model-viewer>` or a Spline scene mounts it there. This keeps 3D possible without
letting a 600 KB runtime into a page an agent is supposed to reason about.

### 7.6 Sound (deferred, optional)

`faqir-sound` plugin, if it ships: `l-sound="tap|toggle|success|error|pop"` on elements or
`$sound()` in expressions; cues synthesized with the Web Audio API (no asset files); global
mute is the default and can only be lifted by a user gesture (`Faqir.sound.enable()` called
from a handler); never the only channel for feedback. Suitable for kiosks, games, children's
sites. Not scheduled for a release; kept here so the door is designed, not bolted.

### 7.7 Audit rules added by this workstream

`reduced-motion` (registry), `motion-budget`, `marquee-pausable`, `no-autoplay-audio`,
`parallax-depth`, `effect-on-empty` (an effect wrapping nothing), `svg-a11y`.

---

## 8. Workstream 4 — Rules: validation as data

### 8.1 What 1.0 has and what the platforms need

Have: native constraints reflected into `field-group`; `l-validate:<name>="expr"` custom
validators evaluated by the engine; `data-error-*` messages; masks; JSON Schema constraints
emitted by `/forms` as native attributes; wizard per-step validation.

Need: rules that are **portable** (the same JSON validates the submission on the server —
non-negotiable for a forms platform), **cross-field** (end after start), **conditional**
(required when, visible when), **computed** (totals, scores), **async** (username taken),
**explainable** (messages, i18n), and **auditable** (a rule that references a field that does
not exist is a finding, not a silent no-op — the readiness through-line again).

### 8.2 `@faqir-ui/rules`

A zero-dependency, isomorphic package with two halves:

- **Shape**: a JSON Schema 2020-12 *subset* — `type`, `required`, `enum`, `const`, `pattern`,
  `format` (email, uri, date, time, phone, iban, uuid, plus a registrable format map),
  `minLength/maxLength`, `minimum/maximum`, `multipleOf`, `minItems/maxItems`,
  `dependentRequired`, `if/then/else`.
- **Logic**: a JSONLogic *subset* — `var`, comparison, boolean, arithmetic, `in`, `cat`,
  `substr`, `if`, `some/all/none`, `missing`, plus Faqir-specific `date` and `regex` ops.

Both are formats frontier and small models already produce reliably, which matters more than
elegance for an agent-native system.

```json
{
  "fields": {
    "type":  { "type": "string", "enum": ["personal", "business"] },
    "company": { "type": "string", "minLength": 2 },
    "start": { "type": "string", "format": "date" },
    "end":   { "type": "string", "format": "date" },
    "qty":   { "type": "integer", "minimum": 1 },
    "price": { "type": "number" },
    "handle": { "type": "string", "pattern": "^[a-z0-9_]{3,20}$" }
  },
  "rules": [
    { "show": "company", "when": { "==": [{ "var": "type" }, "business"] } },
    { "require": "company", "when": { "==": [{ "var": "type" }, "business"] } },
    { "validate": { "<=": [{ "var": "start" }, { "var": "end" }] }, "path": "end", "message": "end.after_start" },
    { "compute": "total", "value": { "*": [{ "var": "qty" }, { "var": "price" }] } },
    { "validate": "unique", "path": "handle", "remote": "/api/handles/check" }
  ],
  "messages": { "en": { "end.after_start": "End must be after start." }, "ro": { "end.after_start": "Sfârșitul trebuie să fie după început." } }
}
```

One API in both runtimes:

```js
import { validate, evaluate } from "@faqir-ui/rules";
const verdict = validate(def, data, { locale: "ro" });
// { valid: false, findings: [{ path: "end", rule: "end.after_start", message: "…" }], computed: { total: 42 } }
```

Golden parity tests run the same corpus in happy-dom and in Node and assert byte-identical
verdicts. `remote` validators run as `fetch` in the browser and as an injected resolver on
the server, so the platform decides how "unique" is answered.

### 8.3 Browser wiring — no new DOM contract

The `faqir-rules` plugin (`l-rules="ref"` on the form, or an inline
`<script type="application/json" data-part="rules">`) does not invent attributes. It:

- registers each `validate` rule as a named validator with `faqir-validate`, which gains a
  small programmatic API (`Faqir.validate.register(form, name, fn)`) — the same path
  `l-validate:<name>` already takes, so messages, `data-state="invalid"`, `aria-invalid` and
  focus-on-first-error are unchanged;
- toggles `hidden` and `disabled` on the field-group for `show` rules and the `required`
  attribute for `require` rules, so the *native* constraints stay the source of truth;
- writes `compute` results into the scope, where `l-text`/`l-model` already reach them;
- runs `remote` validators debounced, last-wins, with the field-group in
  `data-state="validating"` meanwhile (the state already exists in the contract).

`faqir-validate` also gains async custom validators independent of rules:
`l-validate.async:handle="checkHandle(value)"` returning a promise.

Because the plugin writes the same attributes an author would, `faqir audit` sees a normal
form. The dev build reports a rule whose path matched no control — silence is a bug.

### 8.4 Audit and agent ergonomics

- New CLI/MCP command `faqir rules lint <def.json>`: `rule-refs` (every `var`/`path` names a
  field), `rule-cycles` (compute graph is a DAG), `rule-messages` (every message key resolves
  in every declared locale), `rule-unreachable` (a `show` whose condition is constant).
- The rules JSON Schema is published beside the manifest schema so platforms hand it to the
  model as a structured-output schema. Invalid rules become nearly impossible to generate;
  the lint catches the rest.

---

## 9. Workstream 5 — Definitions: the JSON layer for forms, documents and pages

### 9.1 The insight

`@faqir-ui/forms` already proved the shape: a **string-building renderer** with no DOM, fed
JSON, emitting audited Faqir markup. The three platforms all want the same thing at different
scales — a form, a document, a page. The mistake would be three vocabularies. The move is one:

> **A block is a component.** Its `type` is a manifest `name`; its `variant`, `size`, props
> and slots are the manifest's `variants`, `props` and `slots`. The definition JSON Schema is
> generated from the registry index. Manifests are the grammar.

The renderer (`@faqir-ui/render`, isomorphic, zero-dep) walks the block tree and emits
markup from each manifest's `templates` — a field that already exists and that 1.0's
code generation (`src/utils/codegen.ts`) and the MCP `generate` tool already use. What it needs is **template completeness**: every
component's manifest carries a full render template with slot placeholders. A registry gate
(`template-complete`) enforces it, and Night Shift's component dreams must satisfy it.

### 9.2 Three profiles, one envelope

```json
{
  "$schema": "https://faqir-ui.pages.dev/schema/definition/1.0.json",
  "kind": "page",
  "theme": "sunset",
  "lang": "ro",
  "meta": { "title": "…", "description": "…" },
  "blocks": [
    { "type": "hero", "variant": "center",
      "slots": { "eyebrow": "Deschis acum", "headline": "Cafeneaua Lumina",
                 "actions": [{ "type": "button", "variant": "primary", "text": "Meniu", "href": "#menu" }] } },
    { "type": "list", "variant": "media", "id": "menu",
      "items": [{ "title": "Espresso", "meta": "9 lei" }] }
  ]
}
```

| Profile | Adds to the envelope | Renders through |
|---|---|---|
| `form` | `fields` + `rules` (§8), `pages`/`steps`, `submit` target, `conversational: true`, scoring | `/forms` (becomes a profile of `/render`) |
| `document` | `page` (format, orientation, margins, running header/footer), `data` bindings, `mode: static \| live`, charts, numbering, watermark, signatures | `document` pattern + `/charts` |
| `page` | `nav`, `sections`, SEO meta, view-transition opt-in, per-section theme scope | scaffolds |

`theme` accepts a name **or a seed** (§5.2): a QR customer's page can carry its own theme
without a theme file ever existing on disk.

**Data binding in one place.** `{ "type": "table", "source": "$.invoice.lines", "columns": […] }`
renders either as resolved rows (`mode: static` — server-side, for PDF) or as an `l-for`
over `l-source` (`mode: live` — for a dashboard). One definition, two outputs, identical
markup shape.

**Raw HTML is still allowed.** `{ "type": "html", "html": "…" }` exists for the 5% a block
cannot express; the audit runs over the whole output regardless. Platforms can forbid it.

### 9.3 The forms platform

The agent never writes HTML. The loop is:

```
brief ──▶ agent writes form definition (structured output against the generated schema)
      ──▶ faqir rules lint  ──▶ faqir render ──▶ faqir audit ──▶ faqir snapshot (§9.6)
      ──▶ agent repairs the *definition* from findings ──▶ publish
runtime: faqir-core + faqir-validate + faqir-rules (+ mask, persist) ──▶ submit
server:  @faqir-ui/rules validate(def, submission) — same verdicts, same messages
```

What Typeform/Jotform have that this needs, mapped:

| Their feature | Here |
|---|---|
| Question types | §6.3 components, all in the widget map |
| Logic jumps | `rules` with `show`/`require`/`jump` (page-level `when`) |
| Calculations, scoring | `compute` |
| Conditional thank-you pages | `pages` with `when` |
| Themes / branding | theme seed per form; `data-skin` scoped preview inside the admin |
| Conversational mode | `form-page` variant with one question per view and `l-transition.view` |
| Partial saves | `faqir-persist` (exists) |
| Embeds | the rendered form is a self-contained page or a fragment with `@ui:requires` (exists) |
| Analytics hooks | `$dispatch` events per page/field (exists); the platform listens |
| Server validation | the same rules JSON |

### 9.4 Reports and PDF

- **Document definitions** target the `document` pattern's variants and add `report`,
  `receipt`, `certificate`, `label`, `ticket`, `letterhead` (§6.4).
- **`@faqir-ui/charts`**: pure functions from data to **SVG strings**, themed through
  `currentColor` and a new `--chart-1…8` token family the theme generator derives from the
  accent (categorical, sequential and diverging ramps validated for distinguishability).
  Deterministic (golden SVG tests), print-safe, accessible (`role="img"`, title/desc, an
  optional data-table slot). Bar (grouped/stacked), line/area, pie/donut, sparkline, gauge,
  heatmap. The same function renders on the server into a PDF and in the browser inside the
  `chart` recipe, whose controller re-renders on `l-source` changes. No canvas library, ever.
- **`faqir print <page.html> --out file.pdf`**: Chromium through Playwright, which the repo
  already uses for print snapshots; an optional CLI dependency, never a registry one. Emits
  page count and the print audit (`print-overflow`, `orphaned-heading`, `table-header-repeat`).
- Numbering, table-of-contents and cross-references use CSS counters and
  `target-counter()` where Chromium supports them; the print gate snapshots them.

### 9.5 QR micro-sites

A QR destination is a page definition plus a theme seed. The platform gets:

- **Scaffolds as definitions**: `menu`, `vcard`, `event`, `product`, `review-funnel`,
  `link-in-bio`, `coupon`, `ticket`, `wifi`, `landing` — each a starter definition an agent
  edits, not a template it rewrites.
- **Brand → seed**: `faqir theme seed --from-color "#c8102e"` (or from a logo's dominant
  colours) returns a seed with a neutral, contrast-safe accent ramp and a suggested pairing;
  the agent adjusts axes from the brief ("warm, playful, rounded").
- **QR design variants** on the existing recipe: module shapes (square, rounded, dots),
  corner styles, embedded logo with automatic error-correction level H, theme colours — and a
  **scannability gate** (quiet zone, module contrast ≥ 3:1, decode round-trip in tests) so an
  agent cannot ship a pretty code that does not scan.
- **Multi-page sites** with cross-document view transitions and speculation-rule prefetch,
  both zero-JS opt-ins on the root.

### 9.6 Agent surface for definitions

| Surface | Addition |
|---|---|
| CLI | `faqir render`, `faqir lint` (definitions), `faqir rules lint`, `faqir snapshot`, `faqir print`, `faqir theme seed`, `faqir schema definition` |
| MCP | the same as tools; `faqir_wish` (§10.4) |
| Skill | regenerated with the definition grammar and the theme axes |
| Structured output | published JSON Schemas for definitions and rules, versioned like the manifest schema |

**`faqir snapshot`** deserves its own line. It renders a page (or definition) with Chromium
to PNG at named viewports and themes. It is the eye the readiness audit said agents lack: a
page that audits clean and looks broken is caught by the agent looking at it. It also feeds
Night Shift's taste gate (§10.5).

---

## 10. Workstream 6 — Night Shift: the self-improving loop

### 10.1 What already exists

- `faqir-plan`: one task per session, state in `.faqir-plan/state.json`, commit recorded.
- `autoresearch-results.tsv`: a keep/discard ledger with a metric per iteration — the
  layout-lint campaign ran exactly the loop proposed here, by hand.
- Generators: `theme generate`, `gen-theme-manifests`, `gen-theme-previews`, `gen-skill`,
  `build-registry-index`, scaffolds.
- Gates: the full test suite, `audit:registry`, contrast/elevation, axe, visual, size,
  byte-identical artifact checks.

Night Shift is a **skill plus a scheduler plus a ledger**. No new infrastructure.

### 10.2 The loop

```
queue (.faqir-dreams/queue.json)
  └─▶ one dream per run (skill: faqir-dreamer)
        ├─ generate on a branch  (theme seed | component | preset | definitions)
        ├─ run the dream's gates (existing suites + the dream-specific metric)
        ├─ score: pass/fail + metric + taste rubric + previews
        └─ PR with scorecard and images   — or —   discard with reason
ledger (dreams.tsv): date · kind · id · branch · metric · delta · gates · keep/discard · summary
morning: a human (or a review agent) merges, edits, or closes; the ledger records the outcome
```

Rules of the shift: **PR only, never merge**; one dream per run; never touch `SPEC-1.0.md`,
`src/protocol.ts` or the manifest schema; never add a dependency (`check:package` enforces);
never update visual baselines; budgets (CSS bytes per component, registry sheet size) are
gates, not warnings.

### 10.3 Dream kinds and their metrics

| Dream | Input | Output | Keep if |
|---|---|---|---|
| **theme** | a mood brief from the queue or a random walk over empty axis regions | seed + CSS + manifest + preview + scorecard | all gates pass and distinctiveness ≥ threshold against every shipped theme |
| **component** | the highest-ranked gap (frequency × pull) | HTML + CSS + manifest + tests + preview per `CONTRIBUTING.md`; template-complete | `audit:registry` zero, axe green, visual budget, size budget, taste ≥ threshold |
| **motion** | a preset or `data-effect` proposal | CSS + tokens + reduced-motion path | reduced-motion test, motion budget, taste |
| **dogfood** | N random definitions across the three profiles | rendered pages + audit + snapshots + a vision pass ("does anything look broken?") | it *finds* silent failures; each becomes an issue with a repro — the metric is failures found, then failures fixed |
| **wish** | entries from `faqir_wish` (10.4) | whichever of the above the wish implies | as that kind |
| **docs** | a component without a docs-site page or a stale reference | docs pages | `check:docs` and links |

The theme dream ships first, in 1.1, because its gates already exist. Component dreams start
when `template-complete` and collections exist (1.2). Dogfood dreams start with definitions
(1.5) and are the most valuable of all: they attack the readiness audit's through-line
continuously instead of once.

### 10.4 The wish channel

Consuming agents are the best source of gaps. The MCP server gains one tool:

```
faqir_wish { kind: "component" | "theme" | "effect" | "rule", need: "…", workaround: "…", context: "…" }
```

A platform's agent that had to hand-roll a rating widget records the wish; the queue ranks
wishes by count; the next component dream picks the top one. The forms, reports and QR
platforms feed the framework the moment they run — no telemetry, no analytics, just agents
telling the registry what they were missing.

### 10.5 The taste gate

Deterministic gates catch correctness. They do not catch "this is ugly" or "this is the same
thing again." Two additions:

- **Distinctiveness** (themes): axis distance plus perceptual distance between `faqir snapshot`
  renders of the reference page. Numeric, reproducible, and exactly the property the
  brainstorm found missing.
- **Rubric scoring** (components, motion, themes): a vision-capable model scores the snapshot
  against a written rubric — hierarchy, rhythm, contrast, restraint, fit with the theme — and
  returns JSON with a score and reasons. Threshold to open a PR; reasons go into the
  scorecard. The rubric lives in the repo and is versioned; the judge model is named in the
  ledger row so scores stay comparable.

Neither replaces the morning human. They decide what is *worth* a human's minute.

### 10.6 Where it runs

Either a Claude Code scheduled routine (cloud, `/schedule`) or a local cron invoking the
skill in a worktree — the skill does not care. The first version is a nightly theme dream and
a weekly digest; kinds are added as their gates arrive.

---

## 11. Sequencing

Two lanes, because they touch different parts of the tree and can run in parallel
worktrees; Night Shift grows alongside as each gate it needs appears. Versions are semver
minors — the protocol is frozen and nothing here amends it except the proposed `data-skin`
modifier, which goes through §8.

| Release | Lane A — Look | Lane B — Platform | Night Shift |
|---|---|---|---|
| **1.1 Personality** | role tokens, 14 axes, component re-pointing, `light-dark()` authoring, seed generator + scorecard + distinctiveness, `faqir fonts`, 12 seeds re-expressed, 12 new themes, manifest 1.1 (theme), `data-skin` amendment | `@faqir-ui/rules` (shape + logic, isomorphic, golden parity), `faqir-rules` plugin, async validators, `faqir rules lint` | theme dreams nightly; `dreams.tsv` |
| **1.2 Surface** | collections, `list`, `testimonial(s)`, marketing/content set, icon packs, decorative SVG, `gallery`/`lightbox`/`video`, `site-header`; `template-complete` gate | forms question types in the widget map; `/forms` gains `rules`, `pages`, conversational variant | component dreams from the gap ranking |
| **1.3 Motion** | motion axis tokens, preset expansion, `reveal`/`parallax`/`scroll-progress`/`scrolly`/`marquee`/`counter`/`flip-card`/`tilt`, `data-effect`, `faqir-pointer`, `l-transition.view`, `Faqir.supports`, motion audit rules | `@faqir-ui/render` + generated definition schema; `faqir render` / `faqir lint`; `page` profile; micro-site scaffolds; `faqir theme seed --from-color` | motion dreams |
| **1.4 Definitions** | `chat`, `activity-feed`, commerce set, `bento`, `error-page` | `form` profile complete on `/render`; `faqir snapshot`; MCP tools; `faqir_wish`; structured-output schemas published | wish dreams; dogfood dreams begin |
| **1.5 Documents** | document variants (`report`, `receipt`, `certificate`, `label`, `ticket`, `letterhead`) | `@faqir-ui/charts`, `chart` recipe, `document` profile, `faqir print`, print audit rules, QR design variants + scannability gate | dogfood at full scale |
| **1.6 Ecosystem** | second wave of themes from the ledger; `neumorph`/`ink`-class signatures | proto adoption on definitions for Edge/PDF; `/vue` + `/react` bindings for new recipes; sound plugin if still wanted | docs dreams; weekly digest |

What each release unlocks for the platforms: after 1.1 the forms platform has portable rules
and white-label themes; after 1.2 it has every question type; after 1.3 QR micro-sites have
the components and motion they need; after 1.4 both platforms stop writing HTML; after 1.5
reports render to PDF with charts from the same definitions.

---

## 12. Risks

| Risk | Mitigation |
|---|---|
| Theme × component × viewport test matrix explodes | Snapshot only signature themes; seed themes are covered by the generator's gates and one reference-page render each |
| Effects tempt agents into noise | `motion-budget` audit rule, effects excluded from scaffolds by default, the skill's guidance says "one effect per section" |
| Browser support gaps for scroll-driven animations, anchor positioning, `corner-shape` | Feature-detect, degrade to static/JS positioning/rounded; the dev build reports reliance; nothing is polyfilled |
| Definition renderer needs complete templates for 130+ components | `template-complete` gate; component dreams cannot land without one; existing components back-filled in 1.2 |
| JSONLogic subset drifts from the public spec | The subset is documented, tested against the public test suite for the ops it implements, and ops outside it are lint errors |
| Night Shift produces plausible junk | PR-only, gates first, taste second, human last; the ledger records discards so the queue learns; budgets are hard |
| Fonts introduce licensing and weight | OFL-only list, self-hosted, subsetted by unicode-range, `size-adjust` fallbacks so layout does not shift |
| Scope creep in Lane A delays the platforms | Lane B is independent and starts in 1.1; the platforms can consume rules and themes before the surface is complete |

---

## 13. Decisions to ratify

Four decisions change what gets planned; everything else follows from them.

1. **Definitions are the platform contract.** The forms, reports and QR platforms build on
   JSON definitions rendered by Faqir, not on agent-written HTML. Agent-written HTML remains
   fully supported for everything else.
2. **Rules are JSON Schema + JSONLogic subsets**, isomorphic, in `@faqir-ui/rules` — not a
   Faqir-specific expression language and not the engine's JavaScript evaluator.
3. **Fonts are self-hosted OFL families installed by the CLI**, with system stacks as the
   default and the fallback. This is the single biggest lever on visual distinctiveness and it
   needs a yes before 1.1 is planned.
4. **Night Shift is PR-only and starts with themes in 1.1.** Where it runs (cloud routine or
   local cron) can be decided later; that it never merges cannot.

With those four signed, the next document is `FAQIR-PLAN-1.1.md`: Lane A and Lane B as
one-session tasks, in the format the `faqir-plan` skill already executes.
