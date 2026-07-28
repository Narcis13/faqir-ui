# Faqir 1.0 — spacing, alignment, and polish backlog

Findings from a visual + instrumented sweep of the built docs site (`site/dist`,
302 files, 86 components) on 2026-07-28, against `faqir-ui-cli@0.2.4`.

**Method.** ~22 example pages inspected visually in Chrome across light and dark;
then all **86** example pages measured programmatically in a headless browser at
1280×900 for page gutter, inter-demo gaps, viewport bleed, and overlapping fixed
boxes. The numbers below are measurements, not impressions.

---

## The headline

| Measurement, all 86 example pages | Count |
|---|---|
| Pages with **zero page gutter** (no padding/margin on `body`/`main`) | **84 / 86** |
| Pages with ≥1 seam where two stacked demos touch (<1px apart) | **44 / 86** |
| Total zero-gap seams across the library | **187** |
| Pages with content clipped outside the viewport | 1 (`carousel`, 8 elements) |
| Pages with overlapping fixed-position boxes | 1 (`toast`, 3 pairs) |
| **Pages with no defect at all** | **2 / 86** |

The two clean pages are `sidebar` and `dashboard-shell` — and they are clean only
because those components bring their own 24px padding.

## The root cause, stated precisely

Faqir has a complete spacing *vocabulary* — 297 tokens, a `space-0…16` scale, and
`data-gap` on every layout primitive — but **no spacing doctrine that applies by
default.** Every gap is opt-in. A bare sequence of siblings gets zero rhythm,
because zero is what the cascade says when nobody asked.

This is why the quality splits so cleanly by layer:

- **Patterns look excellent** (`dashboard-shell`, `pricing`, `document`,
  `inbox`) — their authors wrapped everything in `stack`/`grid` with explicit
  gaps.
- **Primitives and recipes look broken** — their reference pages are flat lists
  of sibling demos with no wrapper, so they render the raw default: no space.

**This is not a docs bug.** Three things make it ship to users:

1. `registry/<layer>/<name>/<name>.html` is the canonical template an agent reads.
2. The **Copy for agents** button emits that same markup verbatim — I confirmed
   the `cluster` payload contains all 9 clusters with no wrapper and no spacing.
   What a user pastes into an empty file is the crammed version.
3. The manifests' `templates` come from the same source.

So the docs site is not misrepresenting the framework. It is representing it
accurately, and that is the problem.

## Why no gate caught it

`tests/visual/matrix.ts:245` sets `body { padding: 24px; }` on the
visual-regression harness page. The shipped docs site sets none
(`site/styles/docs.css:24` declares only `background`).

The screenshot matrix is genuinely comprehensive — every component × every theme
× light/dark × ltr/rtl — but it renders each fragment **in a padded container the
real site does not have**, and it locks in the current cramped composition as the
accepted baseline. It gates *change*, never *quality*. The a11y suite explicitly
scopes `examples/**` out. The `faqir audit` rules check contract conformance, not
visual composition. Every gate is green and the showcase still looks unfinished.

---

# The 1.0 backlog

## P0 — blocks a credible 1.0

### 1. Give the spacing scale a default, not just an opt-in
Decide and enforce what a bare sequence of block-level Faqir elements does.
Options, in the order I'd try them:
- A `flow` primitive (owl selector `> * + *`) as the default content wrapper, or
- a `data-flow` prop on `stack`/`surface`/`container`, or
- a base rule giving block-level `[data-ui]` a default `margin-block-end`, opt-out
  via `data-gap="0"`.

Whatever you pick, it must be one rule an agent can be told once. This single
change removes most of the 187 seams.

### 2. Recompose all 86 reference fragments
Each fragment becomes a sequence of labelled, separated demo blocks. Today the
labels are HTML comments — invisible in the browser, so a reader cannot tell
where one demo ends and the next begins (`accordion`'s 3 accordions read as one
7-item accordion; `table`'s 5 tables read as one table; `pagination`'s 3 controls
run together on a single line).

Give the generator a demo-block convention (heading + wrapper + separator) and
have it render the existing `<!-- comment -->` labels as visible captions. That
converts an 86-file manual edit into one generator change plus mechanical
fragment updates.

### 3. Add a page gutter and a measure to example pages
84 pages render flush to x=0. `avatar` and `skeleton` have circles clipped by the
left edge; `progress` labels are cut off at the right. Full-bleed inputs stretched
to 1568px are not a realistic demonstration of a form control.

### 4. Fix the gate that hid this
- Remove the harness-only `padding: 24px` from `tests/visual/matrix.ts` (or move
  it into the artifact under test) so baselines reflect shipped bytes.
- Add a **layout-lint gate**: fail CI on zero-gutter pages, zero-gap seams
  between stacked demos, viewport bleed, and overlapping fixed boxes. The script
  I used is ~90 lines and already produces the table above; it belongs in
  `tests/visual/`.
- Extend `faqir audit` with the rules that catch the two structural bugs below.

### 5. `dialog` — the trigger has no styling at all
`registry/recipes/dialog/dialog.css` has **no rule for `[data-part="trigger"]`**.
All four triggers render as unstyled plain text flattened by the reset, so the
dialog example demonstrates nothing. Same file uses `data-ui="button"` correctly
in the footer, so it is internally inconsistent. Audit rule: a `trigger` part must
either carry `data-ui="button"` or be styled by its recipe.

### 6. `toast` — four fixed containers, two at the same position
`toast.html` declares four `data-part="container"` elements, **two of them
`top-right`**. Both are `position: fixed; top: 0; inset-inline-end: 0`, so they
occupy identical coordinates and overlap — one toast renders on top of another.
The container CSS is correct (`flex-direction: column; gap: var(--space-3)`); the
markup contract is not. Audit rule: at most one toast container per position.

## P1 — required for "polished"

### 7. Cross-component vertical alignment
On `pricing`, the three plan cards do not align: the "Most popular" badge pushes
the Team card's price, divider, feature list, and CTA down relative to its
siblings (dividers land at y=289 / 330 / 289). Card-to-card row alignment needs a
real mechanism — `grid-template-rows: subgrid` on a `card`-in-`grid` composition —
not per-instance padding fixes. This is the "lack of vertical alignment" you saw.

### 8. Label/field proximity is inverted in form primitives
On `field-group`, `input`, and `select`, a field's help text sits closer to the
*next* field's label than to its own control (`input`: help text at y=65,
next label at y=80). Proximity currently communicates the opposite of the
grouping. Needs an intra-group vs inter-group spacing pair, applied by the
component rather than by the author.

### 9. Dark-mode surface elevation
In dark mode the `card` `filled` variant is nearly indistinguishable from the
page background, and card borders are barely visible — with cards flush against
each other, the boundary between "Outlined" and "Filled" disappears entirely.
Define an elevation ramp (bg → surface-1 → surface-2) with a guaranteed minimum
ΔL between adjacent steps, and assert it per theme.

### 10. Layout primitives need a demo affordance
The `grid` example is nine grids of bare floating text — no cell background, no
border, no gap made visible. You cannot see the grid. Layout primitives should
demo with a visible cell surface, or the docs need a "show layout bounds" toggle.
Same applies to `stack`, `switcher`, `container`.

### 11. Inline form controls need an owning wrapper
`checkbox` renders all eight demos on one line, so each label butts against the
next checkbox's box ("Accept terms and conditions ☑ Subscribe to newsletter").
The visual grouping contradicts the `for`/`id` association. Ship a
`checkbox`/`radio` row wrapper with an enforced gap.

### 12. Consistency sweep across variants
- `callout`: the "Legal Disclaimer" variant has no left accent bar; the other six
  do.
- `avatar`: sizes don't share a baseline.
- `progress`: one of four bars has no percentage label; the "100%" label is
  clipped at the right edge.
- `badge`: `sm`/`md`/`lg` don't sit on a common baseline.

## P2 — worth doing before 1.0 if there is room

13. **Density is under-exposed.** `data-density` exists and is screenshot-tested
    (`tests/visual/density.pw.ts`) but has no page in the docs site and no entry
    in the layout guide. Ship it as a documented, first-class axis.
14. **A spacing/rhythm page in the docs** — the token reference lists 297 values
    but never states which to reach for. That page is what stops agents guessing.
15. **Overlay recipes can't be demoed statically.** `dialog`, `drawer`, `sheet`,
    `command-palette`, `context-menu`, `menubar`, `tree-view`, `file-upload` all
    render as a single trigger with nothing to see. Ship a docs-only "force open"
    preview state so the panel is visible on the contract page.
16. **`carousel` bleeds 8 elements outside the viewport** — the only page in the
    library that does. Worth a look independent of the spacing work.
17. **Publish `@faqir-ui/core@0.2.4` to npm.** Every Copy-for-agents payload
    points at jsDelivr URLs that cannot resolve until it exists, so the
    headline "paste it into an empty file, open the file, done" claim currently
    fails for every one of the 86 components.

---

## Suggested order

1. Decide the default-spacing rule (#1) — everything else depends on that answer.
2. Land the layout-lint gate (#4) **first, failing**, so the 187 seams are a
   countdown rather than an opinion.
3. Generator-side demo-block convention (#2, #3) — one change, 86 pages fixed.
4. The two structural bugs (#5, #6) with their audit rules.
5. P1 alignment and consistency work against the now-green gate.

The good news: `dashboard-shell`, `pricing`, `document`, `sidebar`, and `inbox`
show the design system already produces genuinely polished output when composed
deliberately. This is a defaults-and-composition problem, not a design problem.
