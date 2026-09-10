# Migrating a v0.x project to 1.0

The last 0.x release was **v0.2.4**. Everything below is the difference between a
project that release wrote and a project 1.0 expects — the framework's rename,
the four files it touched, and every breaking component change shipped since.

Two things make the migration bounded. The **protocol did not move**: the five
attributes, their value grammars, the `l-*` directives, the token names and the
CSS-targets-attributes rule are the same in 1.0 as in 0.2.4, and
[SPEC-1.0](../SPEC-1.0.md) freezes them. And every component that changed its
vocabulary said so in its own manifest `changes` array, which is what this
document is assembled from — a test fails if a `breaking: true` entry in the
registry has no section here, and another fails if a component quietly stopped
honouring vocabulary v0.2.4 shipped.

Budget an hour for a project with a few dozen pages. Most of it is reading the
changelog `faqir upgrade` prints.

---

## The rename

The framework was called Loom through v0.2.4. Four files and one global carry the
old name; nothing else does.

| v0.2.4 wrote | 1.0 expects | Why it has to move |
|---|---|---|
| `loom.config.json` | `faqir.config.json` | Every command resolves the project through this file; under the old name there is no project. |
| `.loom/` | `.faqir/` | Generated agent context and the pristine store live here. It is a cache — deleting it instead of renaming it is equally correct. |
| `ui/loom.bundle.css` | `ui/faqir.bundle.css` | The path is recorded in the config's `bundle.output`, which has to be updated with the file. |
| `ui/core/loom-core.js` | `ui/core/faqir-core.js` | The reactive engine, and the global it publishes: `window.Loom` is now `window.Faqir`. Every page that loads the engine names it in a `<script src>`. |
| `ui/core/loom.js` | `ui/core/faqir.js` | The generated auto-init module. `faqir init --force` writes the new one; delete the old file. |

Until the config is renamed, every command exits with

```
No faqir.config.json found — but loom.config.json is. This project predates the
rename to Faqir: rename the config (and '.loom/' to '.faqir/') and follow
docs/migration-1.0.md.
```

**Do not run `faqir init` to get past that.** On a directory with no config it
writes a *new* project with an empty `installed` list, beside a `ui/` full of
components it now knows nothing about.

---

## The procedure

Seven steps, in this order. The order matters twice: nothing runs before the
config exists, and `faqir init --force` refreshes the tokens, base styles and
engine that `faqir upgrade` never touches — `upgrade` merges components and
nothing else.

### 1. Commit, or otherwise back up, the working tree

`faqir upgrade` writes into your component directories and can leave conflict
markers. Nothing it does is destructive to content — every side of a conflict is
preserved between the markers — but reviewing it is far easier against a clean
diff.

### 2. Rename the four project files the framework rename left behind

The table above. Rename `loom.config.json`, `.loom/` and the bundle, update
`bundle.output` inside the config, point every page's `<script src>` and
`<link href>` at the new names, and delete `ui/core/loom-core.js` and
`ui/core/loom.js` — step 3 writes their replacements.

```bash
mv loom.config.json faqir.config.json
mv .loom .faqir
mv ui/loom.bundle.css ui/faqir.bundle.css
sed -i '' 's|ui/loom.bundle.css|ui/faqir.bundle.css|' faqir.config.json
rm ui/core/loom-core.js ui/core/loom.js
```

### 3. Refresh tokens, base styles and the engine

```bash
faqir init --force
```

`--force` on an existing project **keeps your `installed` lists, theme, remote
registries and bundle settings** and rewrites only what the registry owns:
`ui/tokens/`, `ui/base/`, `ui/core/` and the auto-init module. It prints how many
installed components it kept. If you had hand-edited `ui/tokens/theme.css`, save
it first — a theme is generated output.

### 4. Give every installed component an upgrade baseline

```bash
faqir add $(faqir list --json | grep -o '"name": "[^"]*"' | cut -d'"' -f4 | tr '\n' ' ')
```

…or simply name them: `faqir add button card field-group table …`.

The pristine store — the clean, as-installed copy `faqir upgrade` merges *from* —
did not exist in v0.2.4, so there is nothing to merge against. `faqir add` on an
already-installed component backfills one from **your own copy**, at the version
your copy's manifest records, and warns once per component:

```
⚠ No pristine snapshot for 'field-group' — captured one from your installed copy
  at 1.0.0 as the upgrade baseline (edits made before the pristine store existed
  are part of it; run 'faqir diff field-group' after upgrading to review).
```

Read that warning literally. If you edited a component's CSS before the store
existed, the backfill cannot tell your edit from the original, so the merge in
step 5 treats it as part of the baseline and the registry's version wins. That is
what step 1 is for: `git diff` after the upgrade shows exactly what was replaced.

This step also installs any component the 1.0 versions depend on and you do not
have yet — `date-picker` now composes `calendar`, so `calendar` arrives here.

### 5. Merge every component up to its 1.0 version

```bash
faqir upgrade            # add --dry-run first to read the report without writing
```

Per component it prints the changelog between your version and the registry's,
**breaking entries first and in red**, then three-way merges the files. Exit code
`0` means clean, `2` means conflict markers were written into files it names.
Resolve those before continuing — a file with markers is not valid CSS or JSON.

A component whose version did not change can still be upgraded: the registry has
shipped changed files under an unchanged version number, so `upgrade` decides
what is up to date by merging, not by comparing version strings. When it reports
`1.0.0 → 1.0.0` it says so explicitly.

### 6. Apply the markup migrations the changelog named

A merge can move a stylesheet; it cannot rewrite your pages. Every breaking
change below states the edit its vocabulary needs. `faqir audit` finds the call
sites: a renamed value is reported as `Invalid state`/`Invalid variant`, and a
part that moved to another component as `Unknown slot`.

### 7. Verify

```bash
faqir doctor && faqir audit
```

`doctor` checks the project's shape — config fields, output directory, core
modules, bundle. `audit` reads your pages *and* your installed components against
the 1.0 manifests. A clean audit is the end of the migration.

---

## Breaking changes since v0.2.4

Nine components changed vocabulary or behaviour in a way that can affect a page
you already wrote. Each section is the migration; the full reasoning is in the
component's own `changes` entry, which `faqir upgrade` prints.

### `field-group` 2.0.0 — the validation vocabulary

<!-- @faqir:breaking field-group@2.0.0 -->

`data-state="error"` is now `data-state="invalid"`, and the state set gained
`validating` and `disabled`. The required marker is a `[data-part="required"]`
element inside the label; the legacy `[data-required]` attribute still renders a
marker, so that half is optional.

```html
<!-- v0.2.4 -->
<div data-ui="field-group" data-state="error" data-required>
  <label data-part="label" for="cui">Registration number</label>
  …
</div>

<!-- 1.0 -->
<div data-ui="field-group" data-state="invalid">
  <label data-part="label" for="cui">Registration number <span data-part="required" aria-hidden="true">*</span></label>
  …
</div>
```

Find them with `faqir audit`: `Invalid state "error" on [data-ui="field-group"]`.

### `stack` 2.0.0 — direction moves off `data-variant`

<!-- @faqir:breaking stack@2.0.0 -->

`data-variant="horizontal"` becomes `data-direction="horizontal"`, and the
deprecated `data-responsive` becomes a mobile-first pair. The move is what makes
direction responsive at all: the frozen protocol forbids a tier suffix on the
five protocol attributes, so `data-variant-md` could never exist.

```html
<!-- v0.2.4 -->                              <!-- 1.0 -->
<div data-ui="stack" data-variant="horizontal">   <div data-ui="stack" data-direction="horizontal">
<div data-ui="stack" data-responsive>             <div data-ui="stack" data-direction="vertical" data-direction-sm="horizontal">
```

The collapsed column no longer forces `align-items: stretch`, so a stack that
sets `data-align` keeps its alignment when it stacks.

### `surface` 2.0.0 — `data-max` speaks the measure ladder

<!-- @faqir:breaking surface@2.0.0 -->

The five pixel widths named after breakpoints are gone; `data-max` now names the
same measures the `container` primitive uses.

| v0.2.4 | 1.0 | Was | Is |
|---|---|---|---|
| `data-max="sm"` | `data-max="narrow"` | 640px | 32rem |
| `data-max="md"` | `data-max="content"` | 768px | 48rem (identical) |
| `data-max="lg"` | `data-max="wide"` | 1024px | 72rem |
| `data-max="xl"` | `data-max="wide"` | 1280px | 72rem |
| `data-max="2xl"` | `data-max="wide"` | 1400px | 72rem |
| `data-max="full"` | `data-max="full"` | — | unchanged |

Where the old pixel width was load-bearing, wrap the surface in a `container`
instead. The cap is also logical now (`max-inline-size`), so it flips under RTL.

### `grid` 2.0.0 — mobile-first inversion

<!-- @faqir:breaking grid@2.0.0 -->

`data-cols` used to apply at desktop only, and every grid was force-collapsed to
one column at ≤640px. Now `data-cols` is the base at every width and collapsing
is something you ask for.

```html
<!-- v0.2.4: three columns above 640px, one below -->
<div data-ui="grid" data-cols="3" data-gap="4">

<!-- 1.0: the same layout, stated -->
<div data-ui="grid" data-cols="1" data-cols-md="3" data-gap="4">
```

If a grid was always meant to be three columns, leave it as it is — it now is
one at every width. The tier attributes changed meaning too:
`data-cols-md` was a 641–1024px *range* and is now a min-width *floor* that holds
from `md` up. New: `data-cols="auto"` with `data-min` fits as many columns as fit.

### `table` 3.0.0 — the responsive ladder joins the canon

<!-- @faqir:breaking table@3.0.0 -->

`data-hide-below` and `data-stack-below` now name the framework's own tiers.
Only `sm` moves — from a private 480px to the canon's 640px; `md` and `lg` are
unchanged.

```html
<!-- keep the old behaviour with an explicit pixel value -->
<div data-ui="table" data-stack-below="480">
```

`data-hide-below` has no pixel form by design, so a column marked
`data-hide-below="sm"` now hides up to 640px. The boundary belongs to the wide
side: at exactly 48rem an `md` column shows.

### `date-picker` 2.0.0 — the month grid is the `calendar` recipe

<!-- @faqir:breaking date-picker@2.0.0 -->

Seven parts moved out of `date-picker` into the standalone `calendar` recipe:
`header`, `nav-prev`, `nav-next`, `month-label`, `grid`, `grid-body` and `day`,
with the day cell's `data-date`, `data-today` and `data-outside` markers. Two
steps: install `calendar` (step 4 does this for you — `date-picker` composes it),
and give the grid a `calendar` root.

```html
<div data-part="calendar" role="dialog" aria-label="Date picker" hidden>
+ <div data-ui="calendar" data-size="md">
    <div data-part="header">…</div>
    <table data-part="grid" role="grid">…</table>
+ </div>
</div>
```

Behaviour survives an unmigrated page — the controller falls back to treating the
popup itself as the calendar root — but the styling does not, because
`date-picker.css` no longer carries the grid's rules. `faqir audit` reports the
stranded parts as `Unknown slot [data-part="grid"] in [data-ui="date-picker"]`.

### `empty-state` (pattern) 2.0.0 — one action cluster

<!-- @faqir:breaking empty-state@2.0.0 -->

`data-part="action"` and `data-part="secondary-action"` are replaced by one
`data-part="actions"` cluster, which wraps and centres — the fix for a two-button
row that bled past both edges of a phone.

```html
<!-- v0.2.4 -->                          <!-- 1.0 -->
<div data-part="action">…</div>          <div data-part="actions">
<div data-part="secondary-action">…</div>  <button …>Primary</button>
                                           <button …>Secondary</button>
                                         </div>
```

`data-size="md"` and `data-size="lg"` are declared again in the same release:
both are styled by the pattern's stylesheet and both were legal in 1.x, but the
manifest had been trimmed to `sm`, so `faqir audit` rejected markup that renders.

### `inbox` 2.0.0 — the second pane arrives at `md`

<!-- @faqir:breaking inbox@2.0.0 -->

No markup change, and no concern at all for a project that came from v0.2.4 —
`inbox` shipped after it. For anyone who picked the pattern up mid-0.x: the
single-pane layout is now the unconditional base and the second pane appears at
48rem (768px), where it used to appear at an ad-hoc 640px. A small tablet in
portrait therefore gets one pane and a visible `[data-part="back"]` where it used
to get two — deliberately, since 22rem of list plus a message body does not fit
in 700px and there is no tier between `sm` and `md` to land on. Below `md` the
pattern is also intrinsically tall (`block-size: auto` with a 24rem floor)
instead of a fixed 32rem box, so a phone scrolls the page rather than the pane.

### `auth-form` 2.0.0 — full bleed to the `sm` tier

<!-- @faqir:breaking auth-form@2.0.0 -->

No markup change. The card is edge-to-edge, square and shadowless by default and
becomes a card at 40rem (640px), where 1.x switched at an ad-hoc 480px. Viewports
between 480px and 639px therefore render the form full-bleed where they used to
show a 400px card. If that width matters to you, the card treatment is restored
by the pattern's own custom properties (`--card-radius`, `--card-shadow`,
`--card-border`) in a media query of your own.

---

## After the upgrade

**What `faqir audit` will tell you.** Renamed values (`Invalid state`,
`Invalid variant`), parts that moved (`Unknown slot`), a recipe whose controller
is not loaded, and the accessibility and structure rules added since v0.2.4 —
`duplicate-id`, `heading-order`, `landmark`, `field-wiring`, `contrast-tokens`,
`logical-properties`, `undeclared-attribute` and `breakpoint-canon`. Several of
these will fire on markup that was clean in 0.2.4 and is merely stricter now; all
are documented in the [audit rules table](../README.md#audit-rules).

**What it will not tell you.** Behavioural changes with no vocabulary change —
`grid`'s collapse, `table`'s thresholds, `auth-form`'s breakpoint. Those are
visual, and the changelog above is the only list of them.

**Findings that are not yours.** `faqir audit` also reads the component files in
your output directory. Three components the registry ships — `switch`, `stat` and
`document` — carry an `rgba()` shadow that the `no-hardcoded-values` rule reports
as an error. Nothing in your project causes it and nothing in your project fixes
it; it is tracked as follow-up **1.0R-16**.

## If it goes wrong

- **Conflict markers.** `faqir upgrade` writes standard `<<<<<<<`/`|||||||`/
  `>>>>>>>` blocks with your version, the baseline, and the registry's. Nothing
  is dropped. Resolve them, then re-run `faqir audit`.
- **Rolling back.** The upgrade touches only `ui/`, the config and `.faqir/`.
  `git checkout -- ui faqir.config.json` and `rm -rf .faqir` returns the project
  to step 1; `.faqir/` is a cache and is rebuilt by the next `add`.
- **A component you no longer recognise.** `faqir diff <name>` shows your copy
  against its baseline, and `faqir explain <name>` prints the 1.0 contract:
  slots, variants, states and the accessibility requirements.
