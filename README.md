# Faqir UI

> Agent-native UI framework. Manifest-driven, zero-class, zero-dependency.
> Built for AI agents to generate, inspect, and repair — and for developers to fully own.

**No classes. No build step. No runtime dependencies.**
**Just data attributes, design tokens, and machine-readable manifests.**

```
The CSS is the component.
The JSON manifest is the documentation.
The AI is the compiler.
The CLI is the conductor.
```

Docs site: **[faqir-ui.pages.dev](https://faqir-ui.pages.dev)** · npm: `faqir-ui-cli` · Spec: [`SPEC-1.0.md`](SPEC-1.0.md) · License: MIT

---

## Table of Contents

- [What's new in 1.1 "Personality"](#whats-new-in-11-personality)
- [Quick Start](#quick-start)
- [Why Faqir](#why-faqir)
- [The Attribute Protocol](#the-attribute-protocol)
- [Component Library](#component-library)
- [Layout System](#layout-system)
- [Design Tokens](#design-tokens)
- [Theme System](#theme-system)
- [Faqir Core — Reactive Engine](#faqir-core--reactive-engine)
- [Forms, Validation and Rules](#forms-validation-and-rules)
- [Data-Driven Rendering](#data-driven-rendering)
- [The Manifest System](#the-manifest-system)
- [Audit, Repair and Conform](#audit-repair-and-conform)
- [CLI Reference](#cli-reference)
- [Packages](#packages)
- [AI Agent Integration](#ai-agent-integration)
- [Night Shift](#night-shift)
- [Security](#security)
- [Documentation](#documentation)
- [Contributing and Development](#contributing-and-development)
- [License](#license)

---

## What's new in 1.1 "Personality"

1.0 froze the contract. 1.1 gives it a voice. The protocol did not move: every
1.0 page still audits clean, and every change below is additive under
[`SPEC-1.0.md` §8](SPEC-1.0.md).

- **Theme System 2.0.** A theme is a seed: one accent colour plus fourteen
  character axes. `faqir theme generate` turns it into a contrast-verified
  stylesheet, manifest, preview and scorecard, and refuses a recolour of a theme
  already shipped. Twelve generated themes and three print companions join the
  twelve authored ones. Dual-scheme themes are one `light-dark()` block.
- **New token families.** Typography roles (`--font-heading/-body/-ui`,
  `--heading-*`), shape (`--border-width-*`, `--corner-shape`), focus
  (`--focus-ring-*`), depth (`--shadow-color`, `--surface-backdrop`), motion
  personality (`--ease-spring`, `--motion-*`) and six SVG surface textures.
- **Self-hosted fonts.** `faqir fonts add fraunces --role heading` downloads a
  hash-pinned WOFF2 from a 16-family OFL catalog and serves it from your own
  directory. No Google Fonts link, ever.
- **Scoped themes.** `faqir theme bundle aurora --scope` rewrites a theme onto
  `data-skin="aurora"`, so two themes live on one page. `data-skin` and
  `data-density="spacious"` are the 1.1 amendments to the sanctioned modifiers.
- **Rules platform.** [`@faqir-ui/rules`](packages/rules/README.md) evaluates a
  form's cross-field logic from one JSON definition, in the browser through
  `l-rules` and on the server through the same evaluator. `faqir rules lint`
  checks a definition; [`@faqir-ui/forms`](packages/forms/README.md) emits rules
  beside the markup they govern.
- **Vocabulary audit.** Four new rules (`attribute-vocabulary`,
  `unknown-attribute`, `directive-name`, `part-element`) catch a near-miss
  attribute, an unknown directive or a slot on the wrong element.
- **Night Shift.** The framework generates themes while nobody is watching and a
  human decides in the morning. See [Night Shift](#night-shift),
  [`docs/night-shift.md`](docs/night-shift.md), [`docs/dream-rubric.md`](docs/dream-rubric.md)
  and the weekly digest in [`DREAMS.md`](DREAMS.md).

---

## Quick Start

### Prerequisites

Node.js 18 or newer. That is the whole requirement: `faqir` ships as a
Node-compatible bundle. [Bun](https://bun.sh) is optional; the launcher prefers
it when it is on your PATH, and it is required only to develop this repository.

### Install and initialize

```bash
# Install globally (or use npx)
npm install -g faqir-ui-cli

# Initialize a new project
faqir init

# Add components
faqir add button input card dialog tabs stack grid surface

# Start dev server
faqir dev
```

### What `faqir init` creates

```
your-project/
├── ui/
│   ├── tokens/  base/  core/        tokens, reset and prose, engine + controllers + plugins
│   ├── primitives/  recipes/  patterns/   empty until `faqir add`
│   ├── fonts/  fonts.css            appear after `faqir fonts add`
│   └── faqir.bundle.css             single CSS bundle (auto-generated)
├── faqir.config.json                project configuration
└── .faqir/context.json, README.md   agent context, and this document for offline reference
```

### Use in HTML

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <link rel="stylesheet" href="ui/faqir.bundle.css">
  <script src="ui/core/faqir-core.js" defer></script>
</head>
<body>
  <div data-ui="surface" data-variant="flat" data-size="lg">
    <div data-ui="stack" data-gap="6">
      <h1>Hello Faqir</h1>
      <button data-ui="button" data-variant="primary">Get Started</button>
    </div>
  </div>
</body>
</html>
```

One `<link>` tag. One `<script>` tag. That is the entire framework inclusion.

### CDN: two tags, no install

The CLI is the *ownership* path: it copies files into your project so you can
read, audit, theme and upgrade them. For a scratch page, a CodePen, or an agent
with no shell, [`@faqir-ui/core`](packages/core/README.md) publishes a prebuilt runtime:

```html
<!-- A theme's full CSS bundle: tokens + theme + base + every component -->
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@faqir-ui/core@1.1/dist/faqir.default.css">

<!-- The engine, minified — sets window.Faqir and boots on DOMContentLoaded -->
<script src="https://cdn.jsdelivr.net/npm/@faqir-ui/core@1.1/dist/faqir-core.min.js" defer></script>
```

Swap the stylesheet to change theme; every theme ships a bundle. Every `dist/`
file has a SHA-384 hash in `dist/sri.json` for `integrity=` pinning.

---

## Why Faqir

Frontier models write excellent HTML. So why put a framework between a model
that good and the page? Because writing the page was never the hard part.
Knowing it is right is, and knowing that the fiftieth page still matches the
first is harder still. A model is a brilliant, memoryless author: every call
re-derives the design system from the prompt, with a small, independent chance
of getting each part subtly wrong. Faqir turns that open loop into a closed one:
the harness a capable model needs, built as software instead of as a prompt.

**Verification is the bottleneck, not generation.** A model produces text; it
has no oracle. Faqir gives it one. Every component ships a manifest, and
`faqir audit` checks markup against those manifests with 37 rules, from
`required-slot` and `focus-trap` to `duplicate-id`, `heading-order` and
`contrast-tokens`. It reads from stdin, emits versioned JSON, and is the same
code in the CLI, the MCP server and the browser. A failure that would otherwise
be silent becomes a finding with a rule id and a line number.

**Consistency is a property of the system, not the author.** The design system
lives in files, not in a prompt: a three-layer token ladder, 27 theme
stylesheets, 86 components and one breakpoint canon. A page inherits them
instead of re-deriving them, so a theme change moves every page at once, and a
new agent in a new session lands on the same rhythm as the last one.

**The contract outlives the model.** The five-attribute protocol is frozen at
1.0, with a published spec, an amendment process, and drift tests that fail the
moment the spec and the implementation disagree. The files live in your
repository with zero runtime dependencies and no build step. When the model that
wrote your pages is retired, the pages, the audit and the contract still work.

**The trade, stated plainly.** You give up the freedom to write any CSS you like
(no classes, no hardcoded values, one grammar per attribute) and in exchange you
get a DOM a machine can read, a contract a machine can check, and a design
system that is the same on the fiftieth page as on the first.

```html
<!-- Traditional -->
<button class="btn btn-primary btn-lg is-loading">Save</button>

<!-- Faqir -->
<button data-ui="button" data-variant="primary" data-size="lg" data-state="loading">Save</button>
```

---

## The Attribute Protocol

Five data attributes form the stable DOM contract between HTML, CSS, JavaScript
and AI agents. **Frozen at 1.0.** The normative text is [`SPEC-1.0.md`](SPEC-1.0.md),
published at [the `v1.0.0` tag](https://github.com/Narcis13/faqir-ui/blob/v1.0.0/SPEC-1.0.md).

| Attribute | Purpose | Set by | Example |
|-----------|---------|--------|---------|
| `data-ui` | Component identity | Markup | `data-ui="button"` |
| `data-part` | Named slot within parent | Markup | `data-part="trigger"` |
| `data-state` | Runtime state | JavaScript only | `data-state="open"` |
| `data-variant` | Visual variant | Markup (set once) | `data-variant="primary"` |
| `data-size` | Size variant | Markup (set once) | `data-size="lg"` |

Rules: `data-ui` goes on the root element of every instance. `data-part` names a
child slot. `data-state` is the only attribute controllers modify, and CSS reacts
to it. Components never use class names. Standard HTML attributes (`role`,
`aria-*`, `hidden`, `disabled`) work alongside. A responsive value is a suffixed
attribute, `data-<attr>-<tier>`, on groups a manifest marks responsive; the five
protocol attributes never take a suffix.

### Sanctioned token modifiers

Four attributes re-declare tokens for a subtree without naming a component.
They need no manifest and are not a sixth attribute (SPEC §4).

| Attribute | Purpose | Values | Written by |
|-----------|---------|--------|------------|
| `data-theme` | Selects the colour scheme a theme resolves to | `light` · `dark` · `auto` | author |
| `data-density` | Re-declares the spacing and control-height ramps | `compact` · `comfortable` · `spacious` | author |
| `data-motion` | Transition phase of one enter/leave cycle | `enter` · `enter-active` · `leave` · `leave-active` | engine |
| `data-skin` | Which theme's tokens a subtree resolves (scoped themes) | any installed theme name | author |

CSS targets the protocol directly: `[data-ui="dialog"][data-state="open"] [data-part="panel"]`.
No specificity wars. No naming conventions to memorize. The selector is the documentation.

---

## Component Library

Faqir ships 86 components across three layers. Every one has a page on the
[docs site](https://faqir-ui.pages.dev), generated from its manifest.

**Primitives (42, CSS only).** `aspect-ratio` `avatar` `badge` `breadcrumb`
`button` `callout` `card` `checkbox` `chip` `cluster` `collapsible` `container`
`description-list` `empty-state` `field-group` `grid` `icon` `image` `input`
`kbd` `key-value` `label` `link` `nav` `page-break` `progress` `radio` `select`
`separator` `signature` `skeleton` `spinner` `stack` `stat` `stepper` `surface`
`switch` `switcher` `text` `textarea` `toggle` `watermark`

**Recipes (29, CSS + JavaScript controller).** `accordion` `alert-dialog`
`barcode` `calendar` `carousel` `combobox` `command-palette` `context-menu`
`date-picker` `dialog` `drawer` `dropdown` `file-upload` `input-otp` `menubar`
`pagination` `popover` `qr-code` `select-custom` `sheet` `sidebar` `slider`
`table` `tabs` `tag-input` `toast` `toggle-group` `tooltip` `tree-view`

**Patterns (15, compositions with no custom JS).** `auth-form` `crud-table`
`dashboard-shell` `document` `empty-state` `feature-grid` `form-page` `hero`
`inbox` `pricing` `search-results` `settings-page` `site-footer`
`stats-dashboard` `wizard`

Recipes auto-initialize when `faqir-core.js` is loaded; the engine scans for
`[data-ui]` roots, calls each `create{Name}` factory and watches for elements
added later. A controller expresses state through `data-state` only, never
fetches data, and returns an API with at least `destroy()`.

Icons are 120 Lucide glyphs rendered from CSS alone (a data-URI SVG mask that
inherits `currentColor`). `faqir add icons --only check,x,chevron-down` trims
the sheet to the glyphs a project uses.

---

## Layout System

Five primitives replace CSS utility classes for page structure. No `.container`, no
`.row`, no `col-md-6` — just components, one token ladder, and one breakpoint canon.
The full guide, with five copy-ready page archetypes, is [`docs/layout.md`](docs/layout.md);
the normative rules are FAQIR-SPEC §15.

| Primitive | Mechanism | Reach for it when |
|-----------|-----------|-------------------|
| `stack` | intrinsic | One direction, one gap — page rhythm, toolbars, form columns. |
| `cluster` | intrinsic | A row that wraps by itself — tags, meta rows, button rows. |
| `grid` | intrinsic | Columns, intrinsic (`data-cols="auto"`) or an editorial ladder. |
| `container` | intrinsic | A centred measure column — the only way to cap a page width. |
| `switcher` | container query | Equal peers that fold to one column by *their own* width. |

Reach for the first mechanism that solves the problem: intrinsic layout first, the
component's own inline size second, a viewport tier last.

### Responsive attributes

A responsive value is a suffixed attribute — `data-<attr>-<tier>`, read as *"this
value, from that tier up"*:

| Tier | Min-width | Equivalent px |
|------|-----------|---------------|
| `sm` | `40rem` | 640px |
| `md` | `48rem` | 768px |
| `lg` | `64rem` | 1024px |
| `xl` | `80rem` | 1280px |

```html
<!-- One column on a phone, two from 48rem, four from 64rem. -->
<div data-ui="grid" data-cols="1" data-cols-md="2" data-cols-lg="4" data-gap="4">
  <div data-ui="card"><div data-part="body">One</div></div>
  <div data-ui="card"><div data-part="body">Two</div></div>
  <div data-ui="card"><div data-part="body">Three</div></div>
  <div data-ui="card"><div data-part="body">Four</div></div>
</div>
```

Mobile-first and `min-width` only: the unsuffixed value is the phone layout, tiers
are floors, and there is no `xs` or `2xl`. Only groups a manifest marks
`"responsive": true` take a suffix (marked **Responsive** below), and the five
protocol attributes never do — `data-variant-md` would be a sixth attribute in all
but name, which is why `stack` moved its direction onto `data-direction` in v2.0.

### Default rhythm

Every gap a primitive gives you is one you asked for. One is not — FAQIR-SPEC §20:

> **Inside a flow root, consecutive block-level Faqir components and nested flow roots are separated by `--flow-space` of vertical space.**

`--flow-space` defaults to `--section-gap-sm`. A **flow root** is the page's own
structure (`body`, `main`, `article`, `section`, `aside`, `header`, `footer`, `form`,
`fieldset`, `dialog`, `blockquote`, `figure`, `[data-ui="container"]`,
`[data-ui="surface"]`) — never a component that lays out its own children. So a bare
sequence is already spaced, with no wrapper and no attribute:

```html
<section>
  <div data-ui="card"><div data-part="body">First — no margin, it is the first child.</div></div>
  <div data-ui="card"><div data-part="body">Second — spaced without a stack.</div></div>
</section>
```

It nests, it skips inline-level components (a row of badges stays a row), and
`data-gap` on the flow root re-tunes it — `data-gap="0"` turns it off. *Consecutive*
is load-bearing: the margin goes on the second of two participants, so an `<h2>`
stays welded to the table it labels. Reach for a `stack` when you want a *different*
rhythm, a direction or alignment, not merely to separate a sequence.

### Spacing and density

Use `--space-*` for relationships inside a component or an intentional group;
use the named `--section-gap-*` aliases for page-level air. The complete ladder is
`--space-0`, `--space-px`, the half steps `--space-0h|1h|2h|3h`, the 4px rungs
`--space-1|2|3|4|5|6|7|8|10|12|16|20|24`, and the page-rhythm rungs
`--space-32|40|48|64`. Prefer the smallest rung that still makes the relationship
clear. For a normal block sequence, prefer no authored gap at all: the default
rhythm already owns it.

The intra-/inter-group split is explicit: `field-group` owns its tight
`--space-*` step from label → control → help/error; its surrounding `form` or
`fieldset` owns the looser `--flow-space` step between fields, defaulting to
`--section-gap-sm`.

`data-density="compact"` on any container tightens spacing, control heights, and
the `--section-gap-*` / `--content-gutter` rhythm aliases for that subtree.
`data-density="comfortable"` resets a nested subtree to the base scale. It is a
pure-CSS sanctioned modifier, not a sixth component protocol attribute. The full
spacing, rhythm, density, and nesting rules live in
[`docs/layout.md`](docs/layout.md#spacing-rhythm--density).

### Stack — one direction, one gap

```html
<!-- A column on a phone, a row from 48rem up -->
<div data-ui="stack" data-direction="vertical" data-direction-md="horizontal" data-gap="4" data-justify="between">
  <p data-ui="text">Left</p>
  <p data-ui="text">Right</p>
</div>
```

| Attribute | Values | Default | Responsive |
|-----------|--------|---------|------------|
| `data-direction` | `vertical`, `horizontal` | `vertical` | ✓ |
| `data-gap` | `0`–`16` on the spacing scale (`0 1 2 3 4 6 8 10 12 16`) | `0` | ✓ |
| `data-align` | `start`, `center`, `end`, `stretch`, `baseline` | `stretch` | ✓ |
| `data-justify` | `start`, `center`, `end`, `between`, `around` | `start` | ✓ |
| `data-wrap` | boolean — children reflow onto new lines | off | — |
| `data-align-text` | `start`, `center`, `right` (logical — flips in RTL) | `start` | — |
| `data-flex` | `1`, `auto`, `none` — **on a child**, not the root | `none` | — |

Deprecated in 0.x, removed in 1.0: `data-variant` carrying the direction (use
`data-direction`) and `data-responsive`, the old below-`sm` collapse (use
`data-direction="vertical" data-direction-sm="horizontal"`, which reads mobile-first).

### Cluster — a row that wraps

```html
<div data-ui="cluster" data-gap="2">
  <span data-ui="badge">design</span>
  <span data-ui="badge" data-variant="secondary">layout</span>
  <div data-push><button data-ui="button" data-variant="outline">Edit</button></div>
</div>
```

| Attribute | Values | Default | Responsive |
|-----------|--------|---------|------------|
| `data-gap` | `0`–`16` on the spacing scale | `2` | ✓ |
| `data-align` | `start`, `center`, `end`, `stretch`, `baseline` | `center` | ✓ |
| `data-justify` | `start`, `center`, `end`, `between`, `around` | `start` | ✓ |
| `data-push` | boolean — **on a child**: it and everything after go to the far end | off | — |

No breakpoint is involved: a cluster reflows when it runs out of room, at any width.

### Grid — columns

```html
<!-- Intrinsic: as many columns as fit, no query anywhere -->
<div data-ui="grid" data-cols="auto" data-min="16" data-gap="4">
  <div data-ui="card"><div data-part="body">Fits itself</div></div>
  <div data-ui="card"><div data-part="body">And itself</div></div>
</div>
```

| Attribute | Values | Default | Responsive |
|-----------|--------|---------|------------|
| `data-cols` | `1`, `2`, `3`, `4`, `6`, `12`, `auto` | `1` | ✓ |
| `data-gap` | `0`–`16` on the spacing scale | `0` | ✓ |
| `data-min` | `8`, `12`, `16`, `20`, `24` — item floor in **rem** for `auto` mode | `16` | — |
| `data-span` | `2`, `3`, `4`, `6`, `full` — **on a child** | — | — |
| `data-scroll` | boolean — a snap-scroll strip below `sm`, a grid from `sm` up | off | — |
| `data-align-rows` | boolean — align direct cards' `header` / `divider` / `body` / `footer` rows with subgrid | off | — |

`data-span` holds at every width, so pair a span with a base column count that can
hold it; under a `data-cols="1"` base the only safe span is `full`.

Equal heights are not internal alignment: `switcher` and ordinary grid stretching
can equalize peer boxes while their dividers and actions still land at different
positions. `data-align-rows` is the explicit card-in-grid mechanism. Every direct
card supplies exactly four rows in order (`header`, `divider`, `body`, `footer`);
subgrid shares those tracks per wrapped line. Without subgrid, participating cards
span the full width and stack — a correct intrinsic fallback, not guessed padding.

### Container — the measure column

```html
<div data-ui="container" data-measure="content" data-measure-lg="wide" data-gutter="4">
  <p data-ui="text">Centred, capped, and never a hand-written max-width.</p>
</div>
```

| Attribute | Values | Default | Responsive |
|-----------|--------|---------|------------|
| `data-measure` | `narrow`, `content`, `wide`, `prose`, `full` | `content` | ✓ |
| `data-gutter` | `0`–`16` on the spacing scale — inline padding | `0` | — |

The measure values resolve to the `--measure-*` tokens (`32rem`, `48rem`, `72rem`,
`65ch`), the one ladder every centred column in the framework shares — `surface`'s
max-width included. Measure names are deliberately not `sm|md|lg|xl`: those names
belong to the breakpoint ladder and describe a viewport, not a column.

### Switcher — peers that fold on their own width

```html
<div data-ui="switcher" data-threshold="md" data-gap="4">
  <div data-ui="surface" data-variant="raised">Pane one</div>
  <div data-ui="surface" data-variant="raised">Pane two</div>
</div>
```

| Attribute | Values | Default | Responsive |
|-----------|--------|---------|------------|
| `data-threshold` | `sm`, `md`, `lg`, `xl` — the width the switcher folds below | `sm` | — |
| `data-gap` | `0`–`16` on the spacing scale | `4` | — |

A switcher measures **itself**, not the viewport (a container query), so the same
markup is right full-bleed, inside a sidebar, and inside a dialog. Its attributes take
no tier suffix on purpose — a viewport tier would undo exactly that property.

### Composing a page

```html
<div data-ui="container" data-measure="wide" data-gutter="6">
  <div data-ui="stack" data-gap="8">

    <!-- Title row: actions pushed to the far end -->
    <div data-ui="cluster" data-gap="3">
      <h1 data-ui="text" data-size="1" data-weight="bold">Dashboard</h1>
      <div data-push>
        <button data-ui="button" data-variant="primary">New item</button>
      </div>
    </div>

    <!-- Card grid: 1 → 2 → 3 up the ladder -->
    <div data-ui="grid" data-cols="1" data-cols-sm="2" data-cols-lg="3" data-gap="4">
      <div data-ui="card"><div data-part="body">Card one</div></div>
      <div data-ui="card"><div data-part="body">Card two</div></div>
      <div data-ui="card"><div data-part="body">Card three</div></div>
    </div>

    <!-- Two panes that fold on their own width -->
    <div data-ui="switcher" data-threshold="md" data-gap="4">
      <div data-ui="surface" data-variant="raised">List</div>
      <div data-ui="surface" data-variant="raised">Detail</div>
    </div>

  </div>
</div>
```

---

## Design Tokens

All styling uses CSS custom properties in three layers. Components reference
only semantic tokens, never raw palette values.

| Layer | Example | Who touches it |
|-------|---------|----------------|
| 1. Palette | `--palette-indigo-500: oklch(0.51 0.22 264)` | nobody, directly |
| 2. Semantic | `--color-primary`, `--color-surface-1`, `--font-heading` | themes override these |
| 3. Aliases | `--button-radius`, `--card-shadow`, `--control-height-md` | per-component fine-tuning |

The elevation ramp is `--color-bg` → `--color-surface-1` → `--color-surface-2`,
and a gate holds adjacent steps 0.03 OKLab ΔE apart in every theme. Controls
size from one ramp, `--control-height-sm|md|lg`, so they line up in a row.

### Token families (`registry/tokens/`)

| File | Key tokens |
|------|-----------|
| `palette.css` | `--palette-<hue>-<step>` raw oklch values |
| `semantic.css` | `--color-bg/-fg/-surface-*/-primary/-secondary/-destructive/-success/-warning/-info/-border/-ring` |
| `spacing.css` | `--space-0` through `--space-64`, 4px base with half steps and page-rhythm rungs |
| `typography.css` | `--font-sans/-mono/-serif`; roles `--font-heading/-body/-ui`; `--heading-weight/-tracking/-transform/-leading`; `--text-*`, `--weight-*`, `--leading-*` |
| `effects.css` | `--radius-*`, `--border-width-sm/md/lg` and `--border-width/-strong`, `--corner-shape`, `--shadow-*`, `--shadow-color`, `--surface-backdrop`, `--focus-ring-width/-offset/-color/-style`, `--focus-shadow`, `--z-*` |
| `motion.css` | `--ease-default/-in/-out/-in-out/-bounce/-spring`, `--duration-instant` through `--duration-slower`, `--motion-enter-*`, `--motion-leave-*`, `--motion-hover-lift`, `--motion-scale-from`, `--motion-slide-distance` |
| `textures.css` | Six SVG surface materials (grain, paper, dots, grid, stripes, mesh), applied through `--texture-page` and `--texture-surface` |
| `aliases.css` | Component aliases, `--control-height-*`, `--measure-narrow/-content/-wide/-prose` |
| `density.css` | `[data-density]` subtree remap of `--space-*` and `--control-height-*` |
| `document.css` | `--page-format`, `--page-margin`, `--doc-*` paged-media tokens |
| `doc-aliases.css` | `--kv-*`, `--callout-*`, `--image-*`, `--field-*`, `--stat-*` document aliases |

---

## Theme System

Themes override Layer 2 tokens. Twenty-seven stylesheets ship in
`registry/themes/`: twelve **authored** themes, twelve **generated** ones, and
the three print companions those bring with them. Every theme is described by
an accent colour and fourteen character axes *derived from its stylesheet* and
written into its manifest, so a theme is chosen for what it measurably is. The
two tables below are generated from the manifests (`bun run gen:theme-docs`,
gated by `check:theme-docs`); the skill, `faqir context`, the MCP theme tools
and the docs-site gallery render the same derivation.

### The fourteen axes

Every axis has a default, and the defaults together describe the shipped
`default` theme, which is what makes `{ name, accent }` a complete seed. In a
manifest, `accent_hue` and `accent_chroma` are the accent's two numbers.

<!-- @faqir:theme-axes start -->
| Axis | Flag | Values | Default |
|------|------|--------|---------|
| `accent` | `--accent` | any CSS colour — the one required input | — |
| `neutral` | `--neutral` | `gray` · `cool` · `warm` · `tinted` | `gray` |
| `scheme` | `--scheme` | `light` · `dark` · `both` | `both` |
| `type.pairing` | `--type` | `system` · `sans-humanist` · `sans-grotesque` · `sans-geometric` · `rounded` · `serif-editorial` · `serif-modern` · `slab` · `mono` · `custom` | `system` |
| `type.scale` | `--scale` | `1.125` · `1.2` · `1.25` · `1.333` | `1.2` |
| `type.base` | `--base` | `15` · `16` · `17` · `18` | `16` |
| `type.voice.weight` | `--weight` | `regular` · `medium` · `semibold` · `bold` · `black` | `bold` |
| `type.voice.tracking` | `--tracking` | `tight` · `normal` · `wide` | `normal` |
| `type.voice.transform` | `--transform` | `none` · `uppercase` · `small-caps` | `none` |
| `shape.radius` | `--shape` | `sharp` · `crisp` · `soft` · `round` · `pill` | `soft` |
| `shape.border` | `--border` | `hairline` · `regular` · `heavy` | `hairline` |
| `shape.corner` | `--corner` | `round` · `bevel` · `scoop` · `notch` | `round` |
| `depth` | `--depth` | `flat` · `soft` · `layered` · `hard` · `glass` · `inset` | `soft` |
| `material` | `--material` | `none` · `grain` · `paper` · `dots` · `grid` · `stripes` · `mesh` | `none` |
| `motion` | `--motion` | `none` · `minimal` · `smooth` · `snappy` · `springy` · `playful` | `smooth` |
| `density` | `--density` | `compact` · `comfortable` · `spacious` | `comfortable` |
| `focus` | `--focus` | `ring` · `glow` · `inset` · `bold` | `ring` |
| `decoration.link` | `--link` | `none` · `plain` · `offset` · `thick` | `offset` |
| `decoration.divider` | `--divider` | `solid` · `dashed` · `dotted` · `double` | `solid` |
| `controls.button` | `--button` | `rect` · `pill` · `soft` | `soft` |
| `controls.input` | `--input` | `box` · `filled` · `underline` | `box` |
| `controls.checkbox` | `--checkbox` | `square` · `round` | `square` |
| `controls.switch` | `--switch` | `pill` · `square` | `pill` |
| `contrast` | `--contrast` | `standard` · `high` | `standard` |
<!-- @faqir:theme-axes end -->

### Every theme, by axis

A `generated` theme is reproduced byte for byte from the `<name>.seed.json`
beside it and is never hand-edited. To choose, read the request as axis values
("calm and readable" is minimal motion, spacious density and a serif pairing)
and find the row that lands there, or generate one.

<!-- @faqir:theme-table start -->
| Theme | Kind | Scheme | Accent | Neutral | Type | Shape | Depth | Material | Motion | Density | Focus | Decoration | Controls | Contrast |
|-------|------|--------|--------|---------|------|-------|-------|----------|--------|---------|-------|------------|----------|----------|
| `aurora` | authored | both | 300° · 0.24 | gray | system · 1.2/16px · bold tight | soft · hairline · round | layered | mesh | smooth | comfortable | ring | offset · solid | soft · box · square · pill | standard |
| `brutalist` | authored | both | 0° · 0.00 | gray | system · 1.2/16px · bold wide uppercase | sharp · heavy · round | flat | none | minimal | comfortable | bold | thick · solid | rect · box · square · square | high |
| `candy` | generated | both | 352° · 0.18 | tinted | rounded · 1.125/16px · bold | pill · hairline · round | soft | none | springy | comfortable | ring | offset · solid | pill · box · round · pill | standard |
| `clinical` | generated | both | 210° · 0.09 | cool | sans-humanist · 1.2/17px · medium | soft · hairline · round | flat | dots | minimal | comfortable | ring | offset · solid | soft · box · square · pill | high |
| `contrast` | authored | both | 250° · 0.16 | gray | system · 1.2/16px · bold | soft · regular · round | soft | none | smooth | comfortable | bold | thick · solid | soft · box · square · pill | high |
| `default` | authored | both | 264° · 0.22 | gray | system · 1.2/16px · bold | soft · hairline · round | soft | none | smooth | comfortable | ring | offset · solid | soft · box · square · pill | standard |
| `document-serif` | authored | light | 25° · 0.07 | gray | serif-editorial · 1.2/16px · bold tight | sharp · hairline · round | flat | none | smooth | comfortable | ring | offset · dotted | rect · underline · square · square | high |
| `document` | authored | light | 250° · 0.06 | gray | sans-grotesque · 1.2/16px · bold | sharp · hairline · round | flat | none | none | comfortable | ring | plain · solid | rect · box · square · square | high |
| `editorial` | generated | both | 256° · 0.07 | gray | serif-editorial · 1.333/17px · semibold tight | soft · hairline · round | flat | paper | minimal | spacious | ring | offset · solid | soft · box · square · pill | standard |
| `fintech` | generated | both | 172° · 0.11 | tinted | sans-geometric · 1.2/16px · semibold | soft · hairline · round | layered | none | snappy | compact | ring | offset · solid | soft · filled · square · pill | standard |
| `glass` | authored | both | 275° · 0.20 | cool | system · 1.2/16px · bold | round · hairline · round | glass | none | smooth | comfortable | ring | offset · solid | soft · filled · square · pill | standard |
| `ink` | generated | light | 60° · 0.06 | warm | slab · 1.2/16px · semibold | sharp · hairline · round | flat | paper | minimal | comfortable | bold | plain · solid | rect · underline · square · square | high |
| `luxe` | generated | dark | 84° · 0.10 | warm | serif-modern · 1.333/16px · regular wide uppercase | soft · hairline · round | soft | mesh | smooth | spacious | ring | offset · solid | soft · box · square · pill | high |
| `midnight` | authored | both | 280° · 0.24 | cool | system · 1.2/16px · semibold | soft · hairline · round | layered | grid | smooth | comfortable | glow | offset · solid | soft · box · square · pill | standard |
| `neo` | generated | both | 121° · 0.17 | gray | sans-grotesque · 1.25/18px · black | sharp · heavy · round | hard | none | playful | comfortable | bold | offset · solid | rect · box · square · square | standard |
| `neumorph` | generated | both | 300° · 0.20 | tinted | rounded · 1.2/16px · medium | round · hairline · round | inset | none | smooth | comfortable | inset | offset · solid | soft · filled · round · pill | standard |
| `nordic` | generated | both | 220° · 0.18 | cool | sans-geometric · 1.2/16px · regular | round · hairline · round | flat | none | smooth | spacious | ring | offset · solid | soft · box · square · pill | standard |
| `organic` | generated | both | 90° · 0.08 | warm | sans-humanist · 1.2/17px · bold | round · hairline · round | soft | grain | smooth | spacious | ring | offset · solid | soft · box · square · pill | standard |
| `paper` | authored | both | 45° · 0.14 | warm | serif-editorial · 1.2/16px · semibold | soft · hairline · round | flat | paper | smooth | comfortable | ring | offset · solid | soft · box · square · pill | standard |
| `slate` | authored | both | 245° · 0.09 | cool | sans-grotesque · 1.2/16px · bold | crisp · hairline · round | flat | none | snappy | compact | ring | offset · solid | soft · box · square · pill | standard |
| `soft` | authored | both | 185° · 0.10 | warm | system · 1.2/16px · bold | pill · hairline · round | layered | none | springy | comfortable | glow | offset · solid | pill · box · round · pill | standard |
| `sunset` | generated | both | 45° · 0.18 | warm | sans-humanist · 1.2/16px · semibold | soft · hairline · round | soft | mesh | smooth | comfortable | glow | offset · solid | soft · box · round · pill | standard |
| `swiss` | generated | both | 30° · 0.21 | gray | sans-grotesque · 1.25/16px · bold tight uppercase | sharp · regular · round | flat | grid | snappy | comfortable | ring | plain · solid | rect · box · square · pill | high |
| `terminal` | authored | both | 145° · 0.12 | tinted | mono · 1.2/16px · bold | sharp · hairline · round | soft | stripes | snappy | comfortable | inset | offset · dashed | rect · box · square · square | standard |

3 print companions — `editorial-document`, `ink-document`, `swiss-document` — carry no axes of their own: each is its parent theme on white paper, light only.
<!-- @faqir:theme-table end -->

### Using and generating themes

```html
<html data-theme="light">   <!-- or "dark", or "auto" to follow the OS -->
```

```bash
faqir theme list                                   # every registry and project theme
faqir theme set midnight                           # switch the active theme
faqir theme set resources/themes/my-brand.css      # …or to a theme generated with --out
faqir theme create my-brand                        # scaffold with commented overrides
faqir theme generate my-brand --accent "#168c5b"   # a complete theme from one colour
faqir theme generate ember --accent "oklch(0.62 0.2 40)" --neutral warm \
  --type serif-editorial --depth hard --material grain --motion springy
faqir theme generate ember --seed themes/ember.seed.json --document --json
faqir theme bundle aurora --scope                  # → aurora.scoped.css on data-skin="aurora"
faqir fonts add fraunces --role heading            # self-host a catalog family
```

`theme generate` writes `<name>.css`, `<name>.theme.json`, `<name>.seed.json`
and `<name>.preview.html`. Before any file is written it verifies every
foreground/background pair the `contrast-tokens` audit checks, reads its own CSS
back to confirm the axes it was asked for, and measures the result against the
themes already in the output directory: fewer than four axes apart, or too close
in colour, and it refuses by name (`--allow-similar` overrides). `--json` prints
the scorecard, `--document` adds a print companion, and `--legacy-blocks` writes
three colour blocks instead of one `light-dark()` block for browsers older than
Chrome 123 / Safari 17.5 / Firefox 120. `light-dark()` reads `color-scheme`,
which `base/reset.css` maps from `data-theme`, so a one-block theme follows the
OS with no media query of its own.

**Fonts.** `faqir fonts list` prints the 16-family OFL catalog. `fonts add`
downloads WOFF2 files once, verifies each against a SHA-256 pinned in the CLI,
and writes `ui/fonts/<family>/` plus a managed `ui/fonts.css` that points the
role tokens (`--font-heading/-body/-ui/-mono`) at it. The theme file is never edited.

**From an agent.** The MCP server exposes the same surface: `faqir_theme_list`
returns every theme with its axes, `faqir_theme_info` one theme's manifest, and
`faqir_generate_theme` runs the generator with the same scorecard and gates.

**Scoped themes.** `faqir theme bundle <name> --scope` rewrites every `:root`
onto `[data-skin="<name>"]` and scopes every `[data-theme]` block beneath it, so
a `data-theme` inside the island switches the island, not the page.

Authoring rules, the deliberate-override list, the seed workflow and the drift
gate are in [`CONTRIBUTING.md` § Theme Manifests](CONTRIBUTING.md#theme-manifests).

---

## Faqir Core — Reactive Engine

`faqir-core.js` is a zero-dependency reactive engine with Alpine-style
directives, automatic recipe initialization and a global store. Sizes are
checked by `bun run size` (`scripts/check-size.mjs`):

| File | What it is | Minified + gzip | Budget |
|------|-----------|-----------------|--------|
| the engine alone | directives, reactivity, store | 10.26 KB | 14 KB |
| `faqir-core.js` | engine + all 29 recipe controllers | 44.49 KB | 46 KB |

`faqir add` installs the *unminified* file so it stays readable in your project;
for production serve the CDN build or minify it yourself.

In a module or a bundler (Vite, Rollup, esbuild, webpack), import
`ui/core/faqir-core.mjs` rather than the UMD file. It works the same served raw
and bundled, and it also sets `window.Faqir` for the plugins. The engine boots
one task after it is imported, so registrations on the following lines are
seen:

```js
import Faqir from "./ui/core/faqir-core.mjs";
Faqir.data("counter", () => ({ n: 0 }));
```

Add `data-manual` to that `<script type="module">` to boot it yourself with
`Faqir.start()`.

### Directives

| Directive | Shorthand | Purpose |
|-----------|-----------|---------|
| `l-data` | | Create reactive scope with initial state |
| `l-init` | | Run code once on initialization |
| `l-text` / `l-html` | | Set text content / inner HTML reactively |
| `l-bind:attr` | `:attr` | Bind element attributes |
| `l-on:event` | `@event` | Event listeners |
| `l-model` | | Two-way form binding (`.number` `.trim` `.lazy` `.debounce`) |
| `l-show` / `l-if` | | Toggle visibility / conditional render (on `<template>`) |
| `l-for` / `l-key` | | List rendering with a reconciliation key |
| `l-ref` | | Named element reference |
| `l-effect` | | Tracked reactive side effect |
| `l-cloak` | | Hide element until Faqir initializes |
| `l-transition` | | Motion preset (`fade`, `slide-up`, `scale`) for `l-show` / `l-if` |
| `l-teleport` | | Move the element elsewhere in the document |
| `l-source:name` | | Declarative REST binding (see [Data-Driven Rendering](#data-driven-rendering)) |

Event modifiers: `.prevent` `.stop` `.self` `.once` `.capture` `.passive`
`.window` `.document` `.debounce300ms` `.throttle100ms`, plus key aliases such
as `@keydown.enter` and `@keydown.escape.window`.

Magics: `$el` `$refs` `$store` `$state` `$variant` `$ui` `$dispatch`
`$nextTick` `$watch` `$id`, and `$event` inside `l-on`. `$ui` is the enclosing
component's controller (`$ui.open()`) and is callable to reach another's
(`$ui('#detail-drawer').open()`).

```html
<div l-data="{ count: 0 }">
  <span l-text="count"></span>
  <button data-ui="button" @click="count++">+1</button>
</div>
```

Every directive, modifier and magic, plus the plugin vocabulary, is generated
into [`references/directives.md`](.claude/skills/faqir-creator/references/directives.md)
from the engine's own declarations.

### Official plugins

`faqir bundle --js` writes `ui/faqir.bundle.js` with the core followed by every
plugin; or load them individually from `ui/core/plugins/` after the core script.

| Plugin | Provides | What it does |
|---|---|---|
| `faqir-collapse` | `l-collapse` | Height auto-animation for a boolean; honours `prefers-reduced-motion` |
| `faqir-intersect` | `l-intersect` | Enter, `.leave` and `.once` IntersectionObserver hooks |
| `faqir-mask` | `l-mask` | Caret-safe input masking; `l-model` still receives the raw characters |
| `faqir-persist` | `l-persist`, `$persist()` | Namespaced, JSON-serialized reactive state in `localStorage` |
| `faqir-rules` | `l-rules`, `$rules` | A form's conditional logic from one JSON definition |
| `faqir-validate` | `l-validate`, `Faqir.validate` | Declarative and programmatic form validation |

**Inspecting a live page.** `Faqir.inspect(elementOrSelector)` returns one
plain object describing an element's scope, directives, controller and protocol
attributes; `window.__FAQIR_DEVTOOLS__` adds `scopes()`, `components()`,
`stores()` and `warnings()`. `core/faqir-core.dev.js` warns on failed
expressions and unkeyed reorders, and the `faqir dev` overlay (`Ctrl/Cmd +
Shift + F`) is a live panel of both. Full reference: [`docs/devtools.md`](docs/devtools.md).

---

## Forms, Validation and Rules

Validation is three layers, each usable without the ones above it, and all three
paint the same UI: the enclosing `field-group` takes `data-state="invalid"`, its
`error` part takes the message, and the control takes `aria-invalid`.

1. **Native constraints, reflected.** `<form l-validate>` mirrors each control's
   own `ValidityState`. No JavaScript.
2. **Attribute validators, including async.** `l-validate:company="isCompanyEmail(value)"`
   and `l-validate:taken.async="isFree(value)"`, with `data-error-<name>` for the message.
3. **The programmatic registry.** `Faqir.validate.register(form, field, name, fn)` and
   `Faqir.validate.run(form)`.

A **rules definition** is the cross-field half: what is on screen, what is
required today, what is derived, and which wizard page comes next, as one JSON
document evaluated by [`@faqir-ui/rules`](packages/rules/README.md).

```html
<script type="application/json" id="signup-rules">
  { "version": "1",
    "fields": { "plan": { "type": "string" }, "seats": { "type": "integer" } },
    "rules": [{ "id": "seats-for-teams", "show": "seats",
                "when": { "==": [{ "var": "plan" }, "team"] } }] }
</script>

<form l-validate l-rules="#signup-rules"> … </form>
```

Five verbs: `show`, `require`, `validate`, `compute`, `jump`. `$rules` exposes
the live verdict (`{ visible, required, computed, next }`). The same evaluator
runs on your server (`import { coerce, validate } from "@faqir-ui/rules"`), so
the page's verdict and the handler's agree by construction. `faqir rules lint`
makes seven checks a JSON Schema cannot, and
[`@faqir-ui/forms`](packages/forms/README.md) renders a JSON Schema into
audit-clean markup with its rules beside it. A `remote` rule sends the whole
form to the URL inside it; read [`docs/security.md` §4](docs/security.md) first.

---

## Data-Driven Rendering

`l-source` declares a REST data source on any `l-data` element. Faqir injects a
reactive array, loading and error flags, and a CRUD controller into the scope.

```html
<div l-data="{ newTitle: '' }" l-source:tasks="/api/tasks">
  <template l-if="tasksLoading"><div data-ui="spinner" data-size="sm"></div></template>
  <template l-for="task in tasks">
    <div data-ui="card"><div data-part="body">
      <span l-text="task.title"></span>
      <button data-ui="button" data-variant="ghost" @click="$tasks.remove(task.id)">Delete</button>
    </div></div>
  </template>
  <form @submit.prevent="$tasks.create({ title: newTitle }).then(() => newTitle = '')">
    <input data-ui="input" l-model="newTitle"> <button data-ui="button" data-variant="primary">Add</button>
  </form>
</div>
```

Injected: `tasks`, `tasksLoading`, `tasksError` and `$tasks` with `load`,
`create`, `update`, `remove`, `refresh`, `startPolling`, `stopPolling`.
Modifiers: `.lazy` (no auto-load), `.optimistic` (rollback on error),
`.poll.5000`, `.key.uuid`.

The boundary rule: data fetching is application code. Recipe controllers never
call `fetch`, and the `no-fetch` audit rule holds them to it. The imperative
`apiSource()` factory (`ui/core/api-source.js`), the playground server on port
5555 and the full comparison are in
[`docs/data-driven-rendering.md`](docs/data-driven-rendering.md).

---

## The Manifest System

Every component ships a `.manifest.json`: its anatomy, slots, variants, states,
ARIA requirements, tokens used, a template, safe and unsafe transforms, and
test names. Every theme ships a `.theme.json`. The schema is
[`manifest.schema.json`](manifest.schema.json) (schema 1.1, additive over 1.0).

```json
{ "name": "dialog", "kind": "recipe",
  "slots": { "panel": { "selector": "[data-part='panel']", "required": true } },
  "states": { "open": { "attr": "data-state=\"open\"" } },
  "a11y": { "role": "dialog", "focus_trap": true, "escape_closes": true },
  "safe_transforms": ["Change title text"], "unsafe_transforms": ["Remove focus trap"] }
```

Schema 1.1 adds five optional theme-manifest fields: `seed` (the generator
input), `axes` (derived from the CSS, never hand-written), `fonts`,
`distinctiveness` and `visual_matrix`. Manifests drive **audit**, **repair**,
**context**, **explain**, **trace**, **create**, the docs site, the skill and
the framework bindings.

---

## Audit, Repair and Conform

The audit validates HTML against manifests: structure, accessibility, vocabulary
and anti-patterns. It needs no project, no browser and no filesystem.

```bash
faqir audit                       # every HTML file in the project
faqir audit --file index.html     # one file
faqir audit --skip-rules unknown-component,no-class-attribute
faqir repair                      # apply deterministic fixes, then re-audit
faqir conform                     # canonical attribute order, machine comments

echo '<button data-ui="button" data-variant="neon">x</button>' | faqir audit --stdin --json
```

Every command accepts `--json`; stdout is then a single JSON document even on
error. The audit payload is versioned by `audit_schema_version` and each finding
carries `rule_id`, `severity` (`critical` · `error` · `warning` · `info`),
`file`, `line`, `message` and `fixable`. Findings in framework-installed files
are reported separately from authored ones, and only authored errors gate the
exit code.

### Audit rules

`faqir audit --rules` prints the live registry, which is the source of truth
(37 rules today). The ids below are the ones `--skip-rules` accepts.

| Rule | Severity | Scope | What it checks |
|------|----------|-------|----------------|
| `required-slot` | critical | markup vs manifest | Required slot is missing from component |
| `required-aria` | critical | markup vs manifest | Required ARIA attribute is missing |
| `focus-trap` | critical | markup vs manifest | Component with `focus_trap` requires its controller |
| `valid-variant` | error | markup vs manifest | `data-variant` value not defined in manifest |
| `valid-state` | error | markup vs manifest | `data-state` value not defined in manifest |
| `valid-size` | error | markup vs manifest | `data-size` value not defined in manifest |
| `icon-name` | error | markup vs manifest | `data-icon` must be a known icon name |
| `controller-loaded` | error | markup vs manifest | Recipe controller is not referenced |
| `orphan-part` | warning | markup vs manifest | `data-part` value is not a slot in the manifest |
| `aria-describedby` | warning | markup vs manifest | Description slot exists but panel lacks `aria-describedby` |
| `close-label` | warning | markup vs manifest | Close button has no accessible name |
| `no-class-attribute` | warning | markup vs manifest | Element uses a `class` attribute |
| `token-aware-style` | info | markup vs manifest | Inline style uses hardcoded values instead of tokens |
| `duplicate-id` | error | HTML document | Every id must be unique within a document |
| `heading-order` | warning | HTML document | Heading levels must not skip when going deeper |
| `landmark` | warning | HTML document | A page needs `main`; dialogs not inside it; named navs |
| `field-wiring` | error | HTML document | `field-group` ARIA contract: `for`, `aria-describedby`, `aria-invalid` |
| `unknown-component` | warning | data-ui vs registry | A `data-ui` value must name something Faqir defines |
| `attribute-vocabulary` | error | vocabulary | A declared attribute carries a value from its set; tier suffix only where responsive |
| `unknown-attribute` | warning | vocabulary | A `data-*` near-miss of a declared attribute, or one owned by another component |
| `directive-name` | error | vocabulary | An `l-*` attribute names a real directive with legal argument and modifiers |
| `part-element` | warning | vocabulary | A slot with a `tag_hint` expects that element |
| `no-important` | error | component CSS | No `!important` |
| `no-class-selector` | error | component CSS | No class selectors |
| `no-id-selector` | error | component CSS | No ID selectors |
| `no-hardcoded-values` | error | component CSS | Colours via `var(--token)`, never literals |
| `logical-properties` | warning | component CSS | Prefer logical properties (`margin-inline-start`) |
| `no-external-import` | error | recipe controller JS | Import only from `../../core/` or relative paths |
| `no-fetch` | error | recipe controller JS | No fetch/XHR/router in controllers |
| `undeclared-attribute` | error | CSS vs manifest | Every `data-*` the CSS selects on is declared in the manifest |
| `breakpoint-canon` | warning | CSS preludes | A width prelude is exactly one canon `min-width` floor |
| `token-exists` | warning | component CSS | Every `var(--x)` resolves to a declared token, a property the sheet declares, or a knob read with a fallback |
| `reduced-motion` | info | component CSS | A sheet that animates or transitions carries a `prefers-reduced-motion: reduce` block |
| `trigger-contract` | error | markup vs stylesheet | Every `[data-part="trigger"]` is styled by something |
| `single-fixed-region` | error | markup vs stylesheet | One visible fixed region of a kind per viewport anchor |
| `contrast-tokens` | error | theme tokens | Every declared foreground/background pair clears WCAG AA |
| `surface-elevation` | error | theme tokens | The bg → surface-1 → surface-2 ramp keeps 0.03 OKLab ΔE |

**Repair** runs the audit, applies deterministic fixes (missing ARIA, controller
scripts, close labels, duplicate ids, field wiring, logical properties) and
re-audits. **Conform** reorders attributes to `data-ui`, `data-part`,
`data-state`, `data-variant`, `data-size`, ARIA, then others, touching only
elements that already carry a protocol attribute and preserving their quoting.

---

## CLI Reference

Twenty-four commands in five categories, one table in
[`src/command-registry.ts`](src/command-registry.ts) that renders both
`faqir help` and the skill's CLI reference. Run `faqir <command> --help` for
options. Every command accepts `--json`.

### Project Setup

```bash
faqir init [--theme <name>] [--dir <path>] [--tokens-split] [--no-core]
faqir doctor [--json]                  # config, files, manifests, font hashes
```

### Components

```bash
faqir add <component...> [--all] [--layer primitives] [--dry-run]
faqir add icons --only check,x,chevron-down    # trim the icon sheet; re-runs merge
faqir add @scope/name --registry <url>          # remote registry, SHA-256 verified
faqir remove <component...> [--force] [--dry-run]
faqir upgrade [component...] [--dry-run]        # three-way merge to the registry's latest
faqir list                                      # installed and available, with aliases
faqir search <query>
faqir create <name> --kind primitive|recipe|pattern [--category <name>]
faqir inspect <component> [--json]
```

### Development

```bash
faqir theme set|list|create|generate|bundle <name>
faqir theme generate <name> --accent <color> [--<axis> <value>...] [--seed <file>] [--out <dir>] [--document] [--legacy-blocks] [--allow-similar] [--json]
faqir theme bundle <name> --scope[=<selector>] [--out <dir>] [--json]
faqir fonts list|add|remove <family> [--role heading|body|ui|mono]
faqir variant add|remove <component> <group>=<value>
faqir scaffold landing-page|admin-dashboard|internal-tool|invoice|report [--output <path>] [--theme <name>] [--no-add]
faqir bundle [--minify] [--watch] [--js] [--output <path>] [--dry-run]
faqir dev [--port <n>] [--dir <path>] [--host <addr>] [--open] [--bundle] [--no-overlay]   # default port 3000
faqir bindings vue|react [--out <dir>] [--check]  # generate framework packages from manifests
```

### Quality

```bash
faqir audit [--file <path>] [--stdin] [--json] [--rules] [--skip-rules <ids>] [--strict] [--fix]
faqir repair
faqir conform [--dry-run] [--include <glob>] [--exclude <glob>]
faqir diff [component...]                       # your copy against its pristine baseline
faqir trace <component> [--json]                # dependency graph, file tree, token usage
faqir rules lint <def.json> [--stdin] [--locales <a,b>] [--json]
```

### AI / Agent

```bash
faqir context [--format json|md|cursorrules|llms] [--skill] [--stdout]
faqir explain <component> [--json]
```

Coming from a v0.x project? [`docs/migration-1.0.md`](docs/migration-1.0.md) is
the whole path.

### The CSS bundle

`faqir bundle` concatenates tokens, theme, fonts, base, primitives, recipes and
patterns in that cascade order into `ui/faqir.bundle.css`, with a comment
marking each file. It regenerates on `add`, `remove`, `theme set`, `fonts add`
and `create`; set `bundle.auto` to `false` in `faqir.config.json` to stop that.

---

## Packages

Seven publishables live in this repository. The CLI is the root package; the
rest are workspaces under `packages/`.

| Package | What it is | README |
|---------|-----------|--------|
| `faqir-ui-cli` | The `faqir` CLI and the registry it installs from | this file |
| `@faqir-ui/core` | Prebuilt runtime: minified engine, per-theme CSS bundles, SRI hashes, ESM entry with 19 named exports | [packages/core](packages/core/README.md) |
| `@faqir-ui/rules` | Isomorphic, zero-dependency form rules: shape validation, formats, logic, the `faqir-rules` plugin | [packages/rules](packages/rules/README.md) |
| `@faqir-ui/forms` | JSON Schema to audit-clean Faqir form markup, rules included | [packages/forms](packages/forms/README.md) |
| `@faqir-ui/mcp` | Stdio MCP server exposing the registry, manifests, themes, audit and generation to any MCP host | [packages/mcp](packages/mcp/README.md) |
| `@faqir-ui/react` | React bindings generated from manifests by `faqir bindings react` | [packages/react](packages/react/README.md) |
| `@faqir-ui/vue` | Vue 3 bindings generated from manifests by `faqir bindings vue` | [packages/vue](packages/vue/README.md) |

---

## AI Agent Integration

Every design decision optimizes for an agent being able to generate, inspect
and repair UI reliably. The loop: read manifests, generate from their
templates, `faqir audit`, `faqir repair`, re-audit, and respect
`safe_transforms` and `unsafe_transforms`.

**Context.** `faqir context` aggregates every installed manifest, the protocol,
the active theme's axes and seed, the nearest shipped themes and the audit
constraints into `.faqir/context.json`; `--format md`, `cursorrules` or `llms`
write the other shapes, and `--skill` writes `.faqir/SKILL.md`.

**Claude Code skill.** [`.claude/skills/faqir-creator/`](.claude/skills/faqir-creator/)
is generated by `bun run gen:skill` and gated by `check:skill`. Its references:

- `primitives.md`: all 42 primitives with full HTML anatomy
- `recipes.md`: all 29 recipes with HTML and controller patterns
- `patterns.md`: all 15 compositions
- `tokens.md`, `manifest.md`, `directives.md`: tokens, schema, and every directive, modifier, magic and plugin

**MCP server.** [`@faqir-ui/mcp`](packages/mcp/README.md) serves ten tools
(`faqir_list_components`, `faqir_get_manifest`, `faqir_theme_info`, `faqir_theme_list`,
`faqir_project_context`, `faqir_generate`, `faqir_scaffold_page`, `faqir_audit_html`,
`faqir_repair_html`, `faqir_generate_theme`) and four resources (`faqir://protocol`,
`faqir://tokens`, `faqir://manifests`, `faqir://manifest/{name}`), through the
same audit, repair and generation functions the CLI uses.

**Scaffolds.** `faqir scaffold` composes five complete pages from registry
patterns, auto-installing what they need; the print scaffolds mark sample
content with `<!-- FAQIR_REPLACE: path -->` comments.

---

## Night Shift

Night Shift is the framework generating while nobody is watching, with a human
deciding in the morning. A queue of briefs (`.faqir-dreams/queue.json`) is
worked one dream at a time: the agent reads a brief, writes a seed, and
`scripts/dream/theme.mjs` turns it into a theme branch that has to pass nine
gates in order. A kept dream is a branch plus a scorecard and a light/dark
screenshot pair, waiting for a merge; a discarded one leaves a ledger row saying
why. Every dream is scored 1 to 5 on five criteria (`hierarchy`, `rhythm`,
`contrast`, `restraint`, `fit`) against a versioned rubric.

```
.faqir-dreams/queue.json  →  /faqir-dream  →  scripts/dream/theme.mjs --brief <id>
        branch dream/theme-<id>  →  nine gates  →  keep (branch + bundle) | discard (row)
                    →  dreams.tsv (ledger)  →  DREAMS.md (weekly digest)  →  a human, in the morning
```

```bash
/faqir-dream                            # the next pending brief, from Claude Code
node scripts/dream/theme.mjs --dry-run  # what would happen, without doing any of it
bun run dream:nightly                   # the scheduled runner
bun run dream:digest                    # regenerate DREAMS.md from the ledger
```

How to run it, what stops it and what to do with what it leaves behind:
[`docs/night-shift.md`](docs/night-shift.md). The rubric:
[`docs/dream-rubric.md`](docs/dream-rubric.md). This week:
[`DREAMS.md`](DREAMS.md).

---

## Security

Two engine behaviours are deliberate and worth knowing before you deploy:

- **`l-*` expressions are compiled with `new Function`**, so a page that uses
  them needs `script-src 'unsafe-eval'`. Without it the engine still mounts
  controllers; expressions silently yield `undefined`.
- **`l-html` writes `innerHTML` unsanitized**, exactly like Alpine's `x-html`.
  Use `l-text` for anything you did not author.

```
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-eval';
  style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none';
  base-uri 'self'; frame-ancestors 'self'
```

The threat model is *generated, trusted markup*: an `l-*` attribute value is
JavaScript, so interpolating user input into one is remote code execution. Put
untrusted values in the scope and render them with `l-text`. A page with no
`l-*` attributes needs no `'unsafe-eval'` at all. Full reference, including how
to report a vulnerability: [docs/security.md](docs/security.md).

---

## Documentation

The docs site at **[faqir-ui.pages.dev](https://faqir-ui.pages.dev)** is a
Faqir project and a live proof of the framework: plain HTML built once by
`bun run build:docs` into `site/dist`, one page per component generated from
its manifest, a theme gallery with axis filters, and no runtime build step.
How it is built and deployed: [`docs/docs-site.md`](docs/docs-site.md).

| Document | What it covers |
|----------|----------------|
| [`SPEC-1.0.md`](SPEC-1.0.md) | The frozen protocol, sanctioned modifiers, manifest schema and amendment process |
| [`FAQIR-VISION.md`](FAQIR-VISION.md) | Where 1.x is going and why |
| [`docs/layout.md`](docs/layout.md) | Layout primitives, rhythm, density and five page archetypes |
| [`docs/data-driven-rendering.md`](docs/data-driven-rendering.md) | `l-source`, `apiSource()`, the playground server |
| [`docs/devtools.md`](docs/devtools.md) | `Faqir.inspect`, the dev engine and the overlay |
| [`docs/security.md`](docs/security.md) | CSP, threat model, supply chain, reporting |
| [`docs/migration-1.0.md`](docs/migration-1.0.md) | Moving a v0.x project to 1.0 |
| [`docs/remote-registry.md`](docs/remote-registry.md) | Installing components from a remote, hash-verified registry |
| [`docs/pristine-store.md`](docs/pristine-store.md) | The baseline `diff` and `upgrade` merge against |
| [`docs/docs-site.md`](docs/docs-site.md) | Building and deploying the documentation site |
| [`docs/night-shift.md`](docs/night-shift.md) | Running the nightly theme generator |
| [`docs/dream-rubric.md`](docs/dream-rubric.md) | The five-criteria taste rubric |
| [`docs/release-checklist.md`](docs/release-checklist.md) | Cutting a release |
| [`packages/*/README.md`](packages/) | Each publishable package |

---

## Contributing and Development

Developing this repository needs Bun 1.3+ and Node 18+. The four commands that
matter:

```bash
bun install
bun run test          # the partitioned suite (scripts/test.mjs)
bun run typecheck     # eight tsconfig projects plus the type fixture
bun run smoke         # the packed CLI under plain node
```

Generated artifacts are gated: `check:theme-docs`, `check:skill`,
`check:manifest-api`, `check:bindings`, `check:docs` and the rest fail when a
committed output is stale, and each has a matching `gen:` or `build:` script.
Project structure, adding a primitive or recipe, CSS conventions (attribute
selectors only, tokens only, no `!important`, no ID selectors, a
`prefers-reduced-motion` fallback for every animation, `/* @ui:component <name> */`
headers), manifest and theme authoring, and the build pipeline are in
[`CONTRIBUTING.md`](CONTRIBUTING.md). Conventions for agents working in this
repository are in [`AGENTS.md`](AGENTS.md). The stack is Bun, TypeScript and
happy-dom for development; pure CSS with oklch custom properties and a
proxy-based engine of about 3,000 lines at runtime; zero runtime dependencies.

---

## License

MIT
