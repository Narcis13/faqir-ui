# Automated accessibility suite (task 0.4-24 · FAQIR-PLAN §12.3)

An [axe-core](https://github.com/dequelabs/axe-core) scan of **every registry
reference page**, generated from the registry at runtime — there is no
hand-maintained list to drift out of sync. It shares the visual suite's
discovery util (`../visual/matrix.ts`), so the two gates can never disagree about
which pages exist. The a11y matrix is:

```
every component  ×  every registry theme  ×  { light, dark }
```

At the current registry that is **86 components × 12 themes × 2 schemes = 2,064
scans** (plus a non-empty tripwire, the gate-bites fixture test and the density
reference page). Adding a component
(`registry/{primitives,recipes,patterns}/<name>/<name>.html` with an
`@ui:component` header) grows the suite automatically — **zero edits** here.

## The mobile sweep (task 0.8-11)

The matrix above scans at 1280px. A phone is a *different DOM rendering of the
same markup*, with failure classes the desktop scan structurally cannot see: an
off-canvas drawer that is `position: fixed` and translated out of view but still
in the tab order, a pane hidden by a media query, a table that becomes a
scrollable region only once it is narrower than its content, text that lands on a
different background once two columns stack.

`mobile.pw.ts` re-scans at **390px** — the same width the visual suite's viewport
axis captures at — over the **layout-bearing set**: manifest `category: "layout"`
or `kind: "pattern"`, discovered by the *same imported function*
(`discoverLayoutBearing`) the visual axis uses, so the two gates cannot disagree
about which pages have responsive behaviour worth re-checking. That is
**26 components × 12 themes × 2 schemes = 624 scans**. Components with no
responsive behaviour render identically at both widths and are deliberately not
re-scanned.

It shares the **one** exemption list. There is no viewport dimension in an
exemption entry, so a mobile-only waiver is unrepresentable rather than merely
absent — a mobile-only violation is a mobile-only accessibility bug, and gets
fixed. The first run found exactly one: `scrollable-region-focusable` on
stats-dashboard's five-column sales table, whose `[data-ui="table"]` root is a
scroll container at any width but only actually scrolls below ~700px. Fixed at
the source with `tabindex="0"` on both of that pattern's table roots (the second
passes today only because its content happens to fit).

**Zero-violation policy.** Any non-exempt WCAG 2.0/2.1 Level A or AA violation
fails the case, and the failure message names the **component** (via the case
id), the **rule**, and the **offending selector(s)** — no report artifact to
open.

## Scope: WCAG 2 A/AA

The scan runs axe's `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa` tags
(`axe-config.ts`) — the conformance target the registry commits to. axe's
`best-practice` tag is deliberately excluded: the reference pages are isolated
component *fragments*, not whole documents, so advisory rules like `region` or
`page-has-heading-one` would flag structure that is correct in context.

`color-contrast` is theme- and scheme-sensitive, so the gate discovers and sweeps
every registry theme in both schemes; `default` and the WCAG-AAA `contrast` theme
remain mandatory anchors. Nothing axe evaluates depends on text direction, so —
unlike the visual suite — there is no RTL axis.

## Files

| File | Role |
| --- | --- |
| `a11y-matrix.ts` | Builds the matrix from the **shared** `discoverComponents()` / `buildPageHtml()` in `../visual/matrix.ts`. |
| `axe-config.ts` | The WCAG tag scope (one authoritative list). |
| `exemptions.ts` | The documented per-rule / per-page exemption mechanism + `partitionViolations`. |
| `report.ts` | Formats violations as `component + rule + selector`. |
| `axe-types.ts` | Minimal structural types for axe results (keeps the pure logic browser-free). |
| `a11y.pw.ts` | Playwright spec: one axe scan per case + the gate-bites fixture test. |
| `mobile.pw.ts` | Playwright spec (task 0.8-11): the same pipeline at 390px over the layout-bearing set, discovered via `../visual/responsive-matrix.ts`. |
| `docs-site.pw.ts` | Playwright spec (task 0.7-13): the generated documentation site, served over plain HTTP, one scan per site page per scheme. Scans only the pages the generator authors — `examples/**` wrap registry reference markup that `a11y.pw.ts` already scans. See `docs/docs-site.md`. |
| `a11y-matrix.test.ts` | `bun test` meta-tests: discovery parity with the visual suite, matrix shape, exemption + report contracts. |
| `fixtures/known-violation.html` | Deliberately-broken page proving the gate actually fails. |
| `../../playwright.a11y.config.ts` | Separate config (pass/fail, no snapshot machinery). |
| `../../.github/workflows/a11y.yml` | CI gate — runs the scan in the pinned Playwright container. |

## Running locally

```bash
npm run test:a11y                                                      # scan everything
npx playwright test --config=playwright.a11y.config.ts -g "badge"      # one component
npx playwright test --config=playwright.a11y.config.ts -g "^mobile__"  # the 390px sweep
```

Each page is the identical self-contained, network-free document the visual suite
captures (all framework CSS inlined, no controller JS), so a scan is
deterministic and touches nothing external. axe evaluates the DOM/CSS, so results
are platform-independent — no baselines, no pinned container needed to reproduce.

## The exemption mechanism

The escape hatch for a genuine axe **false positive** lives in `exemptions.ts`.
Each entry is per-rule, per-page (or `"*"` for every page), and carries a
**justification** — the meta-test rejects an empty one, so an exemption can never
be added silently.

```ts
export const A11Y_EXEMPTIONS = [
  { rule: "color-contrast", component: "slider",
    justification: "disabled slider value output; WCAG 2 SC 1.4.3 exempts inactive components" },
];
```

A real violation is **fixed at the source**, never exempted. The only exemptions
currently active (`label`, `switch`, `slider`) all cover the WCAG 2 **SC 1.4.3**
"inactive user interface component" exception — a disabled control's muted text
is the intended affordance, but axe cannot tell an inactive control from an
active one, so it over-reports.

## Verifying the gate actually bites

`fixtures/known-violation.html` is a deliberately-inaccessible page (an image with
no `alt`, a button with no accessible name). The `gate bites:` test in `a11y.pw.ts`
runs it through the **same** scan + partition pipeline the registry pages use and
asserts the violations *are* caught and the report names the rule and a selector.
If detection or wiring ever regressed, that test would go red on a plainly-broken
page instead of the gate rubber-stamping it.

## Remediation done in this task

The first run found 57 failing cases. All were fixed at the source (no exemptions
beyond the SC 1.4.3 disabled-control false positives):

- **ARIA / naming / structure** (reference HTML): accessible names for unlabeled
  `select`/`input`/combobox-trigger controls and the icon-collapsed sidebar brand
  link; `role="combobox"` on the date-picker trigger; `role="status"` on the
  crud-table spinner; the combobox empty/loading state made a disabled `option`.
- **Colour contrast** (`registry/themes/default.css`): the default theme's
  `--color-fg-muted` / `--color-fg-subtle` and the `success` / `warning` /
  `destructive` semantic tokens were raised to meet AA. Dark-mode `destructive`
  adopts the theme's existing luminous-accent + dark-ink pattern (as `primary`
  already does) so it reads as text on subtle surfaces while keeping solid
  destructive buttons legible.
