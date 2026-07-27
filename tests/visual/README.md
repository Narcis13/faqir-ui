# Visual regression suite (task 0.4-23 · FAQIR-PLAN §12.2)

A Playwright screenshot suite that is **generated from the registry at runtime** —
there is no hand-maintained gallery to drift out of sync. The matrix is the full
cross-product:

```
every component  ×  every theme  ×  { light, dark }  ×  { ltr, rtl }
```

At the current registry that is **86 components × 12 themes × 2 schemes × 2 dirs =
4 128 captures**. Adding a component (`registry/{primitives,recipes,patterns}/<name>/<name>.html`
with an `@ui:component` header) or a theme (`registry/themes/<name>.css`) grows the
matrix automatically — **zero edits** to the suite, the config, or the CI job.

## The viewport axis (task 0.8-11)

The matrix above captures one width, so it proves colour and direction but says
nothing about *structure*. A second, deliberately narrow matrix adds the missing
axis:

```
category `layout` components + every pattern  ×  { 390, 768, 1280 }
default theme · light · ltr
```

**26 layout-bearing components × 3 widths = 78 captures.** The set is discovered
from **manifests** (`category: "layout"` or `kind: "pattern"`), so a new layout
primitive or a new pattern enters with zero suite edits — the same property the
main matrix has via the `@ui:component` header.

Not ×12 themes ×2 schemes ×2 directions: that would be 3 744 captures (+90% on
the whole suite) for information the single-viewport matrix already carries. A
theme changes colours, a direction mirrors the axis, and neither changes which
`@media (min-width: …)` block matched.

The three widths each ask the canon a different question: **390** is an iPhone 14,
below every floor, so the mobile-first *base* rules are what render; **768** is
the `md` floor exactly — under `min-width` semantics a boundary width belongs to
the wide side, the off-by-one a `max-width` ladder gets wrong; **1280** is the
`xl` floor (and the main matrix's width, so a `1280` capture is that component's
`default__light__ltr` capture modulo page height).

**Every capture pre-asserts in the page first** (the 0.7-11 rule: a screenshot
cannot go green on an inert attribute). Before the shutter, `gatherLayoutFacts`
asks the browser what it computed — the track count of every `[data-ui="grid"]`,
the drawer's `position` and the shell's column count, the panes' visibility — and
`checkLayoutFacts` compares it against the ladder the *markup* authored, resolved
through the canon in `src/utils/breakpoints.ts`. Never against the stylesheet, so
a sheet that stopped implementing its own ladder fails instead of agreeing with
itself. `checkLayoutFacts` is pure over a plain facts object, so every failure
mode is reproducible in `bun test`; three cases in `responsive.pw.ts` break a real
rule with an injected override and prove the check bites in the browser too.

## Files

| File | Role |
| --- | --- |
| `matrix.ts` | Pure module (no Playwright). Discovers components + themes from disk, builds the matrix, and assembles a fully self-contained HTML page per case. Runs under both Bun and Node. |
| `visual.pw.ts` | Playwright spec. One `toHaveScreenshot` test per matrix case. |
| `matrix.test.ts` | `bun test` meta-test. Guards matrix *generation* (nothing silently skipped) — runs in the fast `test` job, no browser. |
| `responsive-matrix.ts` | The viewport axis: manifest-driven discovery of the layout-bearing set, the widths, the in-page fact gatherer and the pure pre-assertion. |
| `responsive.pw.ts` | Playwright spec: the 78 responsive captures (each pre-asserted), the "pre-assertion bites" negatives, and the archetype behaviour cases (drawer transition, pane swap, auth-form bleed). |
| `responsive-matrix.test.ts` | `bun test` meta-test. Guards the discovery property and every failure mode of the pre-assertion. |
| `../../playwright.config.ts` | One default viewport, chromium, single platform-agnostic baseline set, `testMatch: **/*.pw.ts`. The responsive spec sets its own viewport per case. |
| `../../.github/workflows/visual.yml` | CI: seed baselines on `main`, diff PRs (sharded ×4), upload a merged HTML diff report. |
| `__screenshots__/` | Baselines. Git-ignored — see the baseline strategy below. |

## How a page is captured

For each case, `buildPageHtml` produces a standalone document:

- **All framework CSS inlined** — tokens (in `registry/tokens/index.css` order),
  base reset/prose/motion, the theme under test, and *every* component
  stylesheet — so a recipe/pattern renders regardless of which primitives it
  composes. Every CSS `url()` in the registry is already an inline `data:` URI.
- **`data-theme` + `dir` on `<html>`** — the scheme and direction axes are driven
  purely by these attributes (each theme file is self-contained for both schemes).
- **No controller JS** — pages are captured in their authored, static default
  state, which is what makes each capture deterministic.
- **No network** — the reference pages point `<img>` at `example.com`; those are
  swapped for an inline grey `data:` placeholder, and the spec aborts any stray
  `http(s)` request as a backstop. A capture never touches the network.

Animations/transitions are frozen and the caret hidden (`playwright.config.ts →
expect.toHaveScreenshot`), so nothing time-dependent leaks into a screenshot.

## Running locally

```bash
npm run test:visual            # diff against your local baselines
npm run test:visual:update     # (re)generate your local baselines
npx playwright test --grep "button__default"    # one component/theme
npx playwright test --grep "^responsive__"      # the viewport axis only
```

> **Baselines are platform-specific.** Font rasterisation differs across OSes, so
> a macOS render never matches a Linux render pixel-for-pixel. Your local
> `__screenshots__/` are for local iteration only and are git-ignored — **do not
> commit them.** The authoritative baselines are produced in the Linux container
> (below).

To reproduce CI's exact renders locally, run inside the pinned container:

```bash
docker run --rm -v "$PWD":/work -w /work mcr.microsoft.com/playwright:v1.61.1-noble \
  sh -c "npm install && npx playwright test --update-snapshots"
```

## Baseline strategy (CI)

Everything runs in the pinned container `mcr.microsoft.com/playwright:v1.61.1-noble`
(the tag **must** match `@playwright/test` in `package.json`), so baselines and the
comparison are byte-stable. Rather than commit ~2 000 PNGs to git, baselines use
the **CI cache strategy** (§12.2 explicitly allows this):

- **`push` to `main` / manual dispatch →** the `baselines` job regenerates the set
  and seeds the Actions cache, keyed by a hash of the registry + the harness.
- **`pull_request` →** the `visual` job restores that set and diffs, sharded ×4.
  A regression fails the shard; the `merge-report` job always publishes a single
  **`visual-diff-report`** HTML artifact (with expected/actual/diff images).

Intended visual changes therefore show up as diffs to approve in the PR artifact,
then regenerate automatically when the PR merges to `main`.

> Switching to **committed baselines** instead is a two-line change: drop
> `tests/visual/__screenshots__/` from `.gitignore` and commit the set produced by
> the `docker run … --update-snapshots` command above. The CI container already
> matches, so the committed set will diff cleanly.

## Runtime budget

Measured on an 8-core Apple Silicon laptop (chromium, default workers):

| | 264 tests (one theme) | viewport axis (90) | full 2 112 |
| --- | --- | --- | --- |
| generate (`--update-snapshots`) | 20.7 s | 8.1 s | ~2.5 min |
| diff (CI path) | 14.5 s | 5.7 s | ~2 min |

Comfortably under the §12.2 ~10-min budget even unsharded. CI still shards **×4**
(≈1 min/shard on a 4-core runner) for headroom as the registry grows and to
parallelise the diff artifacts. The viewport axis adds 90 tests (≈+2%), so the
existing ×4 sharding stands; to reshard, change the `matrix.shard` list **and**
the `--shard=k/N` denominator in `.github/workflows/visual.yml`.

## Meta-test

`matrix.test.ts` (in `bun test`) is the guard that "adding a component requires
zero suite edits" actually holds: it scans the registry directly and asserts every
`@ui:component` reference page appears in the generated matrix, that the matrix is
the exact cross-product with unique ids, and that both RTL and dark cases are
present. If the generator ever silently skips a page, this fails — loudly.

`responsive-matrix.test.ts` does the same for the viewport axis: it re-derives the
layout-bearing set from the manifests on disk, hands `discoverLayoutBearing` a
*synthetic* component to prove a new layout primitive/pattern enters (and a
non-layout one does not) with zero edits here, and drives every branch of
`checkLayoutFacts` from literal facts — a grid that ignored its `md` override, a
collapse that fired too early, a `data-scroll` strip on the wrong side of `sm`, a
drawer stuck in flow, an inbox showing both panes on a phone.

## Verifying the diff actually bites

A deliberate 1px change (`button.css` border `1px → 2px`) was confirmed to fail all
four `button__default` captures with expected/actual/diff artifacts, then reverted
— proof the comparison catches a one-pixel shift rather than rubber-stamping.
