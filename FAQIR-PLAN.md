# FAQIR-PLAN — Session-Sized Implementation Plan for FAQIR-NEXT

> Executable companion to `FAQIR-NEXT.md`. Every task below is scoped to **one Claude Code
> session** (one focused sitting, one commit series, tests included). Tasks carry explicit
> **Tests** (written in the same session, never deferred) and **Acceptance criteria**
> (checked off in this file before the session ends).

**Baseline:** faqir-ui-cli v0.2.4 · 53 components · 5 themes · ~470 tests
**Source of truth for *why*:** `FAQIR-NEXT.md` (section references like §A1 point there)

---

## How to run a session (protocol for Claude Code)

1. **One task per session.** Start a fresh session, name the task ID (e.g. "do 0.3-04").
2. **Load context**: read this header, your task's entry, and only the files listed under
   *Touches* (plus whatever they import). Do not read other tasks or unrelated workstreams.
3. **Verify baseline**: run `bun test` before writing anything. If red, stop and report —
   do not build on a broken baseline.
4. **Stay in scope.** If the task is genuinely bigger than one session, do the smallest
   coherent slice, then add a follow-up task row to the index (next free ID in the phase)
   instead of overrunning.
5. **Finish** means: all tests green, the task's acceptance boxes checked in this file,
   the status cell in the index flipped to ✅, and work committed as
   `feat(<task-id>): <summary>` (use `fix`/`test`/`chore` types where truer).
6. **Respect the pillars** (`FAQIR-NEXT.md` §3): five-attribute protocol frozen, zero
   runtime deps, no build step in *user* projects, manifests are the source of truth,
   CSS targets attributes + tokens only.

### Global definition of done (applies to every task, in addition to its own criteria)

- [ ] `bun test` fully green (no skipped tests added).
- [ ] New/changed behavior has tests authored **in this session**.
- [ ] Registry files touched → `faqir audit` clean on them; manifests updated in the same commit.
- [ ] No new runtime dependencies; no new npm dependencies without a note in the commit body.
- [ ] Anything generated from manifests (context, skill) regenerated if a manifest changed.

### Dependency legend

`Depends:` lists task IDs that must be ✅ first. Tasks with no shared dependencies can be
done in any order (or in parallel worktrees).

---

## Task index

### Phase v0.3 — Foundation

| ID | Task | Status |
|----|------|--------|
| 0.3-01 | Compile CLI to Node-compatible `dist/faqir.mjs` | ✅ |
| 0.3-02 | `@faqir-ui/core` package + CDN artifacts + SRI | ✅ |
| 0.3-03 | `build:core` assembly script (engine + recipes → faqir-core.js) | ⬜ |
| 0.3-04 | De-duplicate controllers; recipes become single source; register qr-code | ⬜ |
| 0.3-05 | Keyed `l-for` — reconciler core | ⬜ |
| 0.3-06 | Keyed `l-for` — state preservation, LIS moves, stress tests | ⬜ |
| 0.3-07 | `l-source` test suite | ⬜ |
| 0.3-08 | `l-source` AbortController teardown + audit exemption | ⬜ |
| 0.3-09 | `logical-properties` audit rule | ✅ |
| 0.3-10 | RTL remediation sweep across registry CSS | ⬜ |
| 0.3-11 | Theme coverage test + default theme dark-mode completion | ⬜ |
| 0.3-12 | GitHub Actions CI pipeline | ✅ |

### Phase v0.4 — Surface

| ID | Task | Status |
|----|------|--------|
| 0.4-01 | Primitives batch 1: `skeleton`, `chip`, `link` | ✅ |
| 0.4-02 | Primitives batch 2: `breadcrumb`, `toggle`, `collapsible`, `aspect-ratio` | ⬜ |
| 0.4-03 | `alert` as manifest alias/refinement of `callout` | ✅ |
| 0.4-04 | Icon system: primitive, mask/data-URI runtime, ~120-icon set | ✅ |
| 0.4-05 | `faqir add icons --only …` subsetting + `icon-name` audit rule | ✅ |
| 0.4-06 | Recipe: `alert-dialog` | ⬜ |
| 0.4-07 | Recipe: `slider` | ✅ |
| 0.4-08 | Recipe: `sidebar` | ✅ |
| 0.4-09 | Recipe: `input-otp` | ✅ |
| 0.4-10 | Recipe: `calendar` (extracted from date-picker) | ✅ |
| 0.4-11 | Transitions 2.0: `data-motion` presets + `motion-presets.css` + `faqir-collapse` | ⬜ |
| 0.4-12 | Theme manifests (`*.theme.json`) for all existing themes | ✅ |
| 0.4-13 | New themes: `aurora`, `slate` | ✅ |
| 0.4-14 | New theme: `contrast` (WCAG AAA) | ✅ |
| 0.4-15 | Audit v2 rules: `duplicate-id`, `heading-order`, `landmark` | ✅ |
| 0.4-16 | Audit v2 rule: `contrast-tokens` (static oklch contrast) | ⬜ |
| 0.4-17 | Audit v2 rule: `field-wiring` | ✅ |
| 0.4-18 | Controller tests A: toast, tooltip, accordion | ⬜ |
| 0.4-19 | Controller tests B: popover, sheet, drawer | ⬜ |
| 0.4-20 | Controller tests C: pagination, select-custom, qr-code | ⬜ |
| 0.4-21 | Controller tests D: combobox, command-palette | ⬜ |
| 0.4-22 | Controller tests E: date-picker, table | ⬜ |
| 0.4-23 | Visual regression suite (Playwright screenshots) | ⬜ |
| 0.4-24 | Automated a11y (axe-core) in CI | ⬜ |

### Phase v0.5 — Agents

| ID | Task | Status |
|----|------|--------|
| 0.5-01 | `@faqir-ui/mcp` server skeleton + read tools | ⬜ |
| 0.5-02 | MCP write/verify tools + resources + packaging | ⬜ |
| 0.5-03 | Remote registry protocol: index generation + `--registry` fetch + hashes | ⬜ |
| 0.5-04 | `faqir upgrade` groundwork: pristine store + `faqir diff` | ⬜ |
| 0.5-05 | `faqir upgrade` three-way merge | ⬜ |
| 0.5-06 | Context v2: `--format llms` (`llms.txt` / `llms-full.txt`) | ⬜ |
| 0.5-07 | Manifest-derived skill generator + hosted `manifest.schema.json` | ⬜ |
| 0.5-08 | Spec-informed HTML tokenizer replacing regex scanner | ⬜ |
| 0.5-09 | Parser fuzz corpus + property tests | ⬜ |
| 0.5-10 | `faqir audit --stdin` + guaranteed `--json` on every command | ⬜ |

### Phase v0.6 — Forms, Data & Documents (Formery enablement)

| ID | Task | Status |
|----|------|--------|
| 0.6-01 | `field-group` validation contract normalization | ⬜ |
| 0.6-02 | `faqir-validate.js` plugin | ⬜ |
| 0.6-03 | `@faqir-ui/forms` core: package + scalar widget mapping | ⬜ |
| 0.6-04 | `@faqir-ui/forms` composite: nested objects, arrays, wizard, audit-clean gate | ⬜ |
| 0.6-05 | Plugins: `faqir-persist` + `faqir-intersect` | ⬜ |
| 0.6-06 | Plugin: `faqir-mask` (wire into input-otp) | ⬜ |
| 0.6-07 | Documents: running headers/footers (`doc-header`/`doc-footer`) | ⬜ |
| 0.6-08 | `faqir scaffold invoice` + `faqir scaffold report` | ⬜ |
| 0.6-09 | Documents: `watermark` primitive + `barcode` recipe + `document-serif` theme | ⬜ |
| 0.6-10 | Print visual regression (PDF render + image diff) | ⬜ |
| 0.6-11 | `faqir theme generate` — parametric oklch themes | ⬜ |
| 0.6-12 | `@faqir-ui/vue`: codegen + runtime for primitives | ⬜ |
| 0.6-13 | `@faqir-ui/vue`: recipe controllers, SSR safety, events | ⬜ |
| 0.6-14 | Patterns: `wizard` + `form-page` | ⬜ |

### Phase v0.7 — Ecosystem

| ID | Task | Status |
|----|------|--------|
| 0.7-01 | `@faqir-ui/react`: codegen + runtime for primitives | ⬜ |
| 0.7-02 | `@faqir-ui/react`: recipe wrappers, hooks, RSC boundaries | ⬜ |
| 0.7-03 | Recipes: `context-menu` + `menubar` | ⬜ |
| 0.7-04 | Recipe: `tree-view` | ⬜ |
| 0.7-05 | Recipe: `file-upload` | ⬜ |
| 0.7-06 | Recipes: `tag-input` + `toggle-group` | ⬜ |
| 0.7-07 | Recipe: `carousel` | ⬜ |
| 0.7-08 | Patterns: `pricing` + landing kit (`hero`, `feature-grid`, `site-footer`) | ⬜ |
| 0.7-09 | Patterns: `stats-dashboard` + `inbox` | ⬜ |
| 0.7-10 | Themes: `terminal`, `glass`, `soft` | ⬜ |
| 0.7-11 | Density mode (`data-density` token modifier) | ⬜ |
| 0.7-12 | Dev overlay + `Faqir.inspect` + `faqir-core.dev.js` diagnostics | ⬜ |
| 0.7-13 | Docs site scaffold (built with Faqir, manifest-generated content) | ⬜ |
| 0.7-14 | Docs site: in-browser audit playground + theme switcher gallery | ⬜ |
| 0.7-15 | Docs site: `llms.txt`, schema/registry hosting, copy-for-agents | ⬜ |

### Phase v1.0 — The Standard

| ID | Task | Status |
|----|------|--------|
| 1.0-01 | Protocol spec 1.0 + manifest schema 1.0 frozen and published | ⬜ |
| 1.0-02 | `faqir-core.d.ts` finalized + security guidance doc | ⬜ |
| 1.0-03 | Migration notes v0.x→1.0 + `faqir upgrade` path verified | ⬜ |
| 1.0-04 | Release engineering: workspace publish, provenance, launch checklist | ⬜ |

---

# Phase v0.3 — Foundation

No new user-facing features until distribution and drift are fixed.

---

### 0.3-01 · Compile CLI to Node-compatible `dist/faqir.mjs`

**Depends:** — · **Ref:** §10.2 · **Touches:** `package.json`, `bin/faqir`, `scripts/`, new `scripts/build-cli.mjs`

Kill the hard Bun requirement. Add a build step (in the repo, not user projects) that
produces a single-file compiled CLI via `bun build src/index.ts --target=node`, and
rewrite `bin/faqir` as a launcher that prefers Bun when present but runs `dist/faqir.mjs`
on plain Node ≥ 18 otherwise. `npm pack` must ship `dist/` + `registry/`, not raw `src/`.

**Tests**
- Integration test that executes `node dist/faqir.mjs --version`, `list`, `add button --dry-run`
  (or equivalent) in a temp dir and asserts exit code 0 + expected output.
- Launcher unit test: Bun absent from PATH → Node path taken (simulate via env).
- CI-runnable smoke script `scripts/smoke-cli.sh` used later by 0.3-12.

**Acceptance criteria**
- [x] `node dist/faqir.mjs <cmd>` works for every command on a machine with no Bun.
- [x] `bun run build:cli` is reproducible and documented in `CONTRIBUTING.md`.
- [x] `npm pack --dry-run` file list contains `dist/faqir.mjs` + registry, excludes `src/**` TS from the runtime path.
- [x] Existing `bun`-based dev flow unchanged for contributors.

---

### 0.3-02 · `@faqir-ui/core` package + CDN artifacts + SRI

**Depends:** 0.3-01 · **Ref:** §10.2–10.3 · **Touches:** new `packages/core/` (or `dist/core/`), `scripts/`

Create the runtime package: `faqir-core.js`, `faqir-core.min.js` (+ sourcemap), plugins
folder, and prebuilt per-theme CSS bundles `faqir.{theme}.css` generated from the
registry. Emit an `sri.json` with SHA-384 hashes for every dist file. Add a README with
the two-tag CDN snippet. (Manual side quest for the human: reserve the `@faqir-ui` npm
org — note it in the commit message; do not publish yet.)

**Tests**
- Build test: every theme in `registry/themes/` yields a `faqir.{theme}.css`; bundles are
  non-empty, contain no `@import`, and pass the CSS parser.
- Minified engine loads and boots in happy-dom (`Faqir` global exists, a smoke `l-data`
  binding works from the `.min.js` artifact).
- SRI file matches recomputed hashes.

**Acceptance criteria**
- [x] A scratch HTML file with the two `<link>`/`<script>` tags (local dist paths) renders a styled, interactive Faqir page. (`packages/core/examples/cdn-two-tag.html` — verified in a browser: styled card/button/badge/callout, reactive counter, `l-show`, dark-mode toggle.)
- [x] `packages/core/package.json` valid for npm publish (exports map, files whitelist). (`npm pack --dry-run` ships `dist/` + `src/` + `examples/` + README; 13 files.)
- [x] Size budget recorded: `faqir-core.min.js` gzip size printed by build; ≤ 14KB gzip or an explicit budget note. (14.58 KB gzip → explicit NOTE printed; under-budget after 0.3-03/0.3-04 dedup.)

---

### 0.3-03 · `build:core` assembly script

**Depends:** — · **Ref:** §A2 · **Touches:** new `src/core-src/`, new `scripts/build-core.mjs`, `package.json`

Split the current monolithic `faqir-core.js` into `src/core-src/engine.js` (directives,
reactivity, plugin API — no controllers) plus the existing per-recipe controller files,
and write the assembly script that concatenates engine + all `registry/recipes/*/*.js`
controllers into the shipped single-file `faqir-core.js`. Output must be byte-stable
(deterministic ordering) and remain dependency-free. This session builds the machinery;
0.3-04 flips the switch.

**Tests**
- Assembly determinism: two consecutive builds produce identical bytes.
- Assembled file passes the full existing engine test suite (point tests at the built artifact).
- A controller present only as a standalone file ends up auto-initialized in the built artifact (fixture recipe).

**Acceptance criteria**
- [ ] `bun run build:core` produces `faqir-core.js` functionally identical to the hand-maintained current file (engine tests green against it).
- [ ] Engine source no longer requires editing `faqir-core.js` directly (documented in `CONTRIBUTING.md`).
- [ ] Built artifact has a generated header comment (version, build inputs) for provenance.

---

### 0.3-04 · Controllers: single source of truth + qr-code registration

**Depends:** 0.3-03 · **Ref:** §A2 · **Touches:** `registry/recipes/*/*.js`, `src/core-src/engine.js`, delete inline duplicates

Delete the inline controller copies from the engine source; `registry/recipes/*/*.js`
becomes the only place controllers live. Reconcile any drift found while deleting
(diff each inline controller against its standalone file first — standalone wins unless
the inline copy has a fix, in which case port it). `qr-code` must now auto-initialize
like every other recipe.

**Tests**
- Drift guard test: build fails / test fails if the engine source contains any `data-ui` controller registration for a recipe that also exists in `registry/recipes/`.
- Auto-init test for `qr-code`: element with `data-ui="qr-code"` initializes from the built core.
- All 16 recipe auto-init smoke tests (element present → controller attached).

**Acceptance criteria**
- [x] Zero controller code duplicated between engine source and `registry/recipes/`. (0.3-03 extracted the engine controller-free; `build:core` now hard-fails on any re-introduced inline copy, and `tests/build/controller-source-of-truth.test.ts` guards the source statically.)
- [x] Diff report of reconciled drift included in the commit message. (15 inline copies audited against their standalone files — all ES5 transpilations of the ES6 originals; no fixes to port. Report in commit body.)
- [x] `qr-code` behaves identically to other recipes (bundled, auto-initialized). (`tests/recipes/auto-init.test.ts` — attaches + renders its SVG + live re-render from the built core.)
- [x] Full test suite green against the built `faqir-core.js`. (527 pass / 0 fail; 16 recipe auto-init smoke tests load the shipped artifact.)

---

### 0.3-05 · Keyed `l-for` — reconciler core

**Depends:** — · **Ref:** §A1 · **Touches:** `faqir-core.js` engine source (`handleFor`), `tests/core/`

Replace destroy-all-rebuild with keyed reconciliation. Support `l-key="expr"` evaluated
per item; fall back to index when absent. Algorithm: old-key→node map, walk new list,
reuse matching nodes by writing the item into the per-item reactive scope slot (one
property write, no re-processing), insert new nodes, remove stale ones. Simple ordered
insertion this session — move-minimization (LIS) is 0.3-06. Budget: the whole A1 change
stays ≤ 150 lines added to core across both sessions.

**Tests**
- Append/prepend/remove-middle/replace-all each reuse the expected DOM nodes (assert via node identity, e.g. tagging nodes before mutation).
- `l-key` expression forms: `item.id`, nested path, fallback-to-index without `l-key`.
- Updating an item's data in place updates its existing node's bindings without re-creating it.
- Empty→filled and filled→empty transitions.

**Acceptance criteria**
- [x] Node identity preserved for unchanged keys across any list mutation. (old-key→entry map reuses nodes; append/prepend/remove-middle/reorder/nested-key tests assert via node identity.)
- [x] No behavior change for existing un-keyed `l-for` tests (all previously green tests stay green). (162 prior core tests + full 538-test suite green; index fallback preserves un-keyed semantics.)
- [x] Works for arrays of objects and arrays of primitives. (keyed-by-`item.id`, nested `item.meta.k`, primitive keyed-by-value, and index-fallback all covered. +68 net lines to engine, within the ≤150 A1 budget.)

---

### 0.3-06 · Keyed `l-for` — state preservation, LIS, stress

**Depends:** 0.3-05 · **Ref:** §A1 · **Touches:** same as 0.3-05

Add the longest-increasing-subsequence pass so reorders move the minimum number of DOM
nodes. Add a dev-mode console hint when a list reorders without `l-key`. Then prove the
flagship claims: focus, selection, input state, and CSS transitions survive re-render.

**Tests**
- Focus preservation: focused `<input>` inside a reordered keyed item stays focused with its value and cursor/selection intact.
- Reorder of 1,000 rows: assert node-move count is minimal (spy on `insertBefore` calls) and total time under a generous budget.
- Nested `l-for` (list of lists) with keys on both levels.
- Unkeyed reorder logs the dev hint exactly once per list.

**Acceptance criteria**
- [x] 1,000-row reorder stress test green and fast (document measured ms in the test). (Rotate-by-one over 1,000 rows = **1** DOM move in ~3–13ms; full reverse = **999** moves (n−1, the proven minimum for a decreasing sequence) in ~10–52ms. Both spy on the list container's `insertBefore` and assert the exact minimal move count, with generous 2s/3s time budgets and the measured ms logged.)
- [x] Input state + focus survive reorder/insert/remove around the focused row. (Focused row kept stationary by the LIS → `document.activeElement`, `value`, and `selectionStart/End` all intact across reorder and across insert+remove of surrounding rows. A moved focused row keeps its `value`, selection, and node identity — Faqir performs an atomic single `insertBefore`, so real browsers keep focus too; happy-dom clears `activeElement` on any node move, documented in the test.)
- [x] Total added lines to core for A1 ≤ 150 (report the number). (**net +139 lines** to `src/core-src/engine.js` across 0.3-05 + 0.3-06 — 188 added / 49 removed vs the pre-A1 baseline; 0.3-06 alone is net +71. LIS `getSequence` + `isReorder` + backward-placement pass.)
- [x] Dev hint present, silent in normal keyed usage. (`console.warn` fires exactly once per list when an unkeyed `l-for` reorders — `isReorder` detects a non-identity permutation, so plain updates/appends stay silent; keyed lists never reach the check. Covered by three tests: unkeyed-reorder-warns-once, keyed-reorder-silent, unkeyed-update-silent.)

---

### 0.3-07 · `l-source` test suite

**Depends:** — · **Ref:** §A5, §7.3 · **Touches:** `tests/core/l-source.test.ts` (new), engine source only if bugs surface

`l-source` shipped with zero tests. Author the suite against the shipped behavior
(mock `fetch` in happy-dom): basic `l-source:name="/api/x"` populates scope with
`{ data, loading, error }` (or whatever the actual contract is — read the implementation
first and codify what it *does*, filing follow-ups for what it *should* do). Cover all
shipped modifiers: `.lazy`, `.optimistic`, `.poll`, `.key`.

**Tests** (the task *is* tests)
- Success path: loading flag lifecycle, data population, re-render of dependent bindings.
- Error path: non-2xx and network rejection → error state, no unhandled rejection.
- `.lazy` doesn't fetch until triggered; `.poll` re-fetches on interval (fake timers); `.optimistic` applies local value before settle; `.key` behavior.
- Interaction with `l-for` over fetched arrays.
- Rapid re-trigger: last-write-wins documented behavior (even if teardown lands in 0.3-08, assert current semantics and mark the race test `todo` if unfixable without it).

**Acceptance criteria**
- [x] ≥ 15 assertions-worth of coverage across all modifiers; `grep -r "l-source" tests/` is no longer empty. (`tests/core/l-source.test.ts` — 29 tests + 1 `todo`, **91 `expect()` calls**, covering the scope contract, success/loading lifecycle, error paths, and every shipped modifier: `.lazy`, `.poll`/`.poll.<n>`/default 30 s, `.optimistic` create/update/remove + rollback, `.key.<field>`, plus `l-for` integration.)
- [x] Every discovered defect either fixed in-session (if small) or filed as a note in 0.3-08's entry. (Three defects — D1 docs/impl API mismatch, D2 no request sequencing, D3 no post-destroy write guard — filed under 0.3-08 above; the suite asserts current behavior for each so the fixes flip the guard tests. One in-session fix: the test's fake `setInterval` returns a truthy 1-based id because the engine's `stopPolling` guards with `if (pollTimer)` — no engine change needed.)
- [x] Documented contract (states + modifier semantics) written into the test file header as the reference. (Full CONTRACT + DEFECTS block at the top of `tests/core/l-source.test.ts`: injected `items`/`itemsLoading`/`itemsError`/`$items`, controller API, state transitions, single-object wrap, and every modifier's semantics.)

**Note:** the real contract diverges from the task's `{ data, loading, error }` guess —
shipped state is flat scope vars `items` / `itemsLoading` / `itemsError` plus the `$items`
controller (no `$items.loading`/`.error`/`.submitting`, no `.method`). The suite codifies
what ships; reconciliation is D1 under 0.3-08.

---

### 0.3-08 · `l-source` teardown + audit exemption

**Depends:** 0.3-07 · **Ref:** §A5 · **Touches:** engine source, `src/audit/`, `tests/core/`, `tests/audit/`

Add AbortController-based lifecycle: in-flight requests abort when the owning scope/
element is destroyed (`l-if` toggle, keyed `l-for` removal) and when a newer request for
the same source supersedes an older one. Stop `.poll` timers on teardown. Codify the
audit stance: the `no-fetch` rule stays scoped to recipe controllers; `l-source` in page
markup is exempt — encode that in the rule, not in prose.

**Tests**
- Abort on element removal: pending fetch's signal fires, late resolution does not write into a dead scope.
- Superseding request aborts the stale one; only the newest response lands.
- `.poll` timer cleared on teardown (fake timers, assert no post-destroy fetch).
- Audit: fixture page using `l-source` produces zero `no-fetch` findings; a recipe controller calling `fetch` still flags.

**Acceptance criteria**
- [x] No fetch or timer survives scope destruction (asserted, not assumed). (`setupSource`
  latches a `destroyed` flag on teardown, stops the poll timer, and aborts every in-flight
  `AbortController`; async write-backs are gated. Asserted in `tests/core/l-source.test.ts`
  → "teardown & abort [D3]": l-if hide, keyed l-for removal, poll-timer-cleared + no
  post-destroy fetch, and `Faqir.destroy(el)`.)
- [x] Race test from 0.3-07 un-`todo`ed and green. (The `it.todo` is now a real test —
  "the latest CALL wins even when an older request resolves later [D2]" — plus a sibling
  asserting the superseded request's signal is aborted and its late resolution ignored.)
- [x] Audit exemption is code + test, and mentioned in the rule's description output.
  (`NO_FETCH_RULE` in `src/audit/rules.ts` encodes `applies_to` + `exempt: [l-source, …]`;
  `faqir audit --rules` prints it (`printRuleInventory`); `tests/audit/no-fetch-exemption.test.ts`
  proves a page using `l-source` yields zero findings while a recipe controller calling
  `fetch` still flags.)

**Defects surfaced by 0.3-07** — all RESOLVED in this task:

- **D1 · Docs/impl API mismatch — RESOLVED (docs corrected).**
  `docs/data-driven-rendering.md` promised `$items.loading`/`.error`/`.submitting` and a
  `.method` modifier that never shipped (and `.method="…"` is incompatible with the
  directive anyway — the value slot is the endpoint). The playground already used the
  shipped flat-var contract. Reconciled by correcting the docs to that contract (flat
  `itemsLoading`/`itemsError` + a methods-only `$items`, `.poll.<ms>`/`.key.<field>`
  syntax, `.method` removed). The suite's block is reframed as "reconciled contract [D1]",
  pinning the flat-var reality. (`apiSource()` — a separate service-layer helper — keeps
  its own `loading`/`submitting`/`error` state; unaffected.)
- **D2 · No request sequencing — RESOLVED (AbortController supersede).** A newer `load()`
  aborts the previous in-flight read; a monotonic `loadSeq` guard discards any stale
  response, so the latest CALL wins regardless of resolution order.
- **D3 · No post-destroy write guard — RESOLVED.** Scope teardown (l-if hide, keyed l-for
  removal, or the new public `Faqir.destroy(el)` hook) latches `destroyed`, stops `.poll`
  timers, and aborts in-flight `AbortController`s; every async write-back is gated so a
  late resolution cannot touch a dead scope.

---

### 0.3-09 · `logical-properties` audit rule

**Depends:** — · **Ref:** §8.3, §12.5 · **Touches:** `src/audit/`, `tests/audit/`

New deterministic CSS audit rule flagging physical direction properties in component
CSS: `margin-left/right`, `padding-left/right`, `left/right` offsets, `border-*-left/right*`,
corner radii like `border-top-left-radius`, and `text-align: left|right`. Report the
logical replacement in the finding message (e.g. `margin-left → margin-inline-start`).
Auto-fix via `faqir repair` where the mapping is 1:1.

**Tests**
- Each flagged property pattern → finding with correct suggested replacement.
- Legit uses don't flag: `text-align: start`, logical properties, physical properties inside an explicit `[dir="ltr"]`-scoped block (escape hatch).
- Repair round-trip: fixture CSS → repaired output → zero findings.

**Acceptance criteria**
- [ ] Rule ships enabled, listed in audit rule inventory / JSON output.
- [ ] Running it on `registry/**` reproduces the known button-group and table findings (don't fix them here — that's 0.3-10).
- [ ] Deterministic fixes applied by `repair` for all 1:1 mappings.

---

### 0.3-10 · RTL remediation sweep

**Depends:** 0.3-09 · **Ref:** §12.5 · **Touches:** `registry/**/*.css`

Run the `logical-properties` rule across the registry and convert every finding:
`padding-inline-*`, `margin-inline-*`, `inset-inline-*`, `border-start-start-radius`
family, `text-align: start`. Known offenders: button-group (radius/margins), table
(`text-align: left`). Verify visually in RTL for the trickiest components (button-group,
dropdown, sheet, drawer, pagination).

**Tests**
- Registry self-audit assertion: `logical-properties` findings on `registry/**` == 0 (this becomes a permanent CI gate).
- Happy-dom or reference-page checks that `dir="rtl"` on the demo pages doesn't error; full visual RTL coverage arrives with 0.4-23.

**Acceptance criteria**
- [ ] Zero `logical-properties` findings across the registry.
- [ ] button-group renders correctly in `dir="rtl"` (manually verified via `faqir dev` or reference page; note the check in the commit).
- [ ] No visual change in LTR (spot-check reference pages; visual-diff safety net lands in 0.4-23).

---

### 0.3-11 · Theme coverage test + default theme dark mode

**Depends:** — · **Ref:** §C2, §2-Gaps · **Touches:** `registry/themes/default.css`, `tests/tokens.test.ts` or new `tests/themes/`

Write the generated coverage test first: every theme must define light+dark values for
all 27 semantic color tokens plus shadows (or explicitly declare single-scheme). Let it
fail on `default.css`, then complete default's dark mode until the matrix is green.

**Tests**
- Coverage matrix test enumerating themes × semantic tokens × schemes, driven by parsing the theme CSS (no hand-maintained lists).
- Failing-theme fixture proves the test actually catches under-coverage.

**Acceptance criteria**
- [ ] Coverage test green for all 5 shipped themes; fails loudly for an under-covering fixture.
- [ ] `default.css` dark mode covers all 27 semantic color tokens + shadows.
- [ ] Test is data-driven — adding a 6th theme requires no test edits.

---

### 0.3-12 · GitHub Actions CI

**Depends:** 0.3-01, 0.3-03 · **Ref:** §10.4 · **Touches:** new `.github/workflows/ci.yml`, `scripts/`

Stand up CI: (1) test job on Bun latest; (2) compiled-CLI smoke job on Node 18/20/22
using `scripts/smoke-cli.sh` from 0.3-01; (3) typecheck; (4) registry self-audit
(`faqir audit` over `registry/**`, zero findings); (5) size budgets — engine ≤ 14KB gzip,
engine+controllers ≤ 22KB gzip, each plugin ≤ 2KB gzip — failing budget fails the build.

**Tests**
- The pipeline itself is the test. Additionally: `scripts/check-size.mjs` unit-tested for budget parsing/enforcement (over-budget fixture → non-zero exit).

**Acceptance criteria**
- [x] CI green on a real push to a branch (link the run in the commit/PR). (Branch `ci/0.3-12-github-actions` → all 7 jobs green: https://github.com/Narcis13/faqir-ui/actions/runs/29073024843)
- [x] All five jobs present; matrix covers Node 18/20/22 for the compiled CLI. (test · smoke [Node 18/20/22] · typecheck · registry-audit · size)
- [x] A deliberately oversized fixture or budget tweak demonstrably fails the size job (verified once, then reverted). (Engine 8.21 KB gzip vs a tightened 4 KB budget → exit 1; `check-size.test.ts` also asserts over-budget fixture → non-zero exit.)

---

# Phase v0.4 — Surface

---

### 0.4-01 · Primitives batch 1: `skeleton`, `chip`, `link`

**Depends:** — · **Ref:** §B1 · **Touches:** `registry/primitives/{skeleton,chip,link}/`

Three CSS-only primitives, each with CSS + manifest + reference HTML. `skeleton`:
text/circle/rect variants, shimmer animation gated on `prefers-reduced-motion`.
`chip`: label + optional `[data-part="dismiss"]`. `link`: styled anchor, external/muted
variants (external gets an indicator via CSS).

**Tests**
- Manifest validation for all three (schema-valid, variants/states enumerated).
- Audit: reference pages zero findings.
- CSS assertions: skeleton has a `@media (prefers-reduced-motion: reduce)` block; all colors/spacing reference tokens (no literal values — reuse/extend the token-literal check).

**Acceptance criteria**
- [x] `faqir add skeleton|chip|link` works end-to-end (files copied, listed in inventory). (`tests/primitives/batch1.test.ts`)
- [x] Reference pages render correctly in all themes, light+dark. (Verified in-browser: default light+dark, midnight; components use only semantic tokens, which the 0.3-11 theme-coverage gate guarantees for every theme.)
- [x] Zero audit findings; zero literal color values in the new CSS. (Audit of a fresh project with all three installed returns zero results; token-literal check extended to spacing properties.)

---

### 0.4-02 · Primitives batch 2: `breadcrumb`, `toggle`, `collapsible`, `aspect-ratio`

**Depends:** — · **Ref:** §B1 · **Touches:** `registry/primitives/{breadcrumb,toggle,collapsible,aspect-ratio}/`

`breadcrumb`: `<nav aria-label="Breadcrumb">` with `item`/`separator`/`current` parts
(`aria-current="page"`). `toggle`: pressed-state button styled off `aria-pressed`,
CSS-only. `collapsible`: `<details>/<summary>` based, zero JS, animated via
`::details-content` where supported. `aspect-ratio`: CSS wrapper with ratio variants.

**Tests**
- Manifest validation ×4; audit-clean reference pages.
- Breadcrumb a11y structure asserted (nav label, `aria-current` on current item) via parser-based test.
- Toggle styles react to `aria-pressed="true"` (selector present in CSS).

**Acceptance criteria**
- [x] All four installable via `faqir add`, present in `faqir list`. (`tests/primitives/batch2.test.ts`; real CLI: `faqir add breadcrumb toggle collapsible aspect-ratio` → all copied, marked ✓ in `faqir list`.)
- [x] `collapsible` opens/closes with **zero** JavaScript. (Native `<details>`/`<summary>` — no `.js` file, `files.js` undefined, no `<script>` in the reference page; animated as progressive enhancement via `::details-content` under `@supports (interpolate-size: allow-keywords)`.)
- [x] Zero audit findings across the four reference pages. (`faqir audit` over a fresh project with all four installed: 4 files, 21 components, "no issues found"; batch2 test asserts `runAudit().results === []`. Registry self-audit + logical-properties gate both green.)

---

### 0.4-03 · `alert` alias of `callout`

**Depends:** — · **Ref:** §B1 · **Touches:** `registry/primitives/`, alias mechanism in `src/commands/` if none exists

Agents searching "alert" must find it. Implement manifest-level aliasing (either a real
`alert` manifest that refines `callout`, or first-class alias support in the registry
index — choose the smaller change and document it). Add optional `[data-part="dismiss"]`
to the callout/alert contract.

**Tests**
- `faqir add alert` and `faqir search alert` (or `list`) both resolve.
- Dismiss part styled and audit-valid; manifest documents it.
- Context/skill output includes `alert` so agents can discover it.

**Acceptance criteria**
- [x] `alert` discoverable via every discovery surface (list, search, context.json). (First-class alias support: `aliases: ["alert"]` on the callout manifest, resolved by `getRegistryAliases`/`resolveAlias`/`findComponentInRegistry`. New `faqir search <query>` command matches name/alias/description/category/slot; `faqir list` gained an ALIASES section; `.faqir/context.json`, context markdown/cursorrules, and the SKILL.md all surface the alias. `faqir add alert` installs the canonical `callout`. `tests/primitives/alert-alias.test.ts`.)
- [x] No duplicated CSS payload — alias references or thinly extends callout. (An alias ships no files: `add alert` → `callout`, no `ui/primitives/alert/` dir. Added optional `[data-part="dismiss"]` to the callout/alert contract — token-only, logical properties, hidden in print, audit-valid.)
- [x] Alias mechanism documented in the manifest schema notes for future aliases. (JSDoc "Alias mechanism (schema note)" on `Manifest.aliases` in `src/manifest.ts`, with validation that `aliases` is an array of non-empty strings; a real component directory always wins over a colliding alias.)

---

### 0.4-04 · Icon system core

**Depends:** — · **Ref:** §B4 · **Touches:** new `registry/primitives/icon/`, new `scripts/build-icons.mjs`, vendored Lucide SVGs

`data-ui="icon"` + `data-icon="{name}"` rendered via CSS `mask` with data-URI SVG custom
properties; icons inherit `currentColor`, size with font-size. Build script ingests a
curated ~120-icon Lucide (MIT) subset, optimizes each SVG, emits `icons.css` and
`icon.manifest.json` listing every name. Store the curation list in a checked-in file.

**Tests**
- Build determinism: same inputs → identical `icons.css`.
- Every name in the manifest has a corresponding `[data-icon="…"]` rule and vice versa (bijection test).
- Data-URIs are valid/escaped (parse a sample back out); base rule uses `mask`, `currentColor`, `1em` sizing.
- License attribution file present and referenced.

**Acceptance criteria**
- [x] ~120 icons render from CSS alone — a reference page shows the full grid, colored by `currentColor`. (Exactly **120** curated Lucide glyphs. `registry/primitives/icon/icon.html` renders every icon as `<span data-ui="icon" data-icon="…" role="img" aria-label="…">`; browser-verified — icons render sharp and take their color from `currentColor` (black/red/blue/green demo row). Base rule: `[data-ui="icon"]` is a `1em` box with `background-color: currentColor` cut by `mask: var(--icon) center / contain no-repeat` (+ `-webkit-mask`). No fonts, no fetch, zero JS.)
- [x] `icon.manifest.json` machine-enumerable (name list) and schema-valid. (`validateManifest` → `[]`; every name enumerated as `variants.icon.values` (attr `data-icon`, sorted, unique, 120 entries) — agents enumerate/validate icon usage "like any variant" per §B4. Provenance in `icon_set` (`lucide`, `ISC`, `lucide-static@1.24.0`, `count: 120`, `attribution_file`).)
- [x] Full `icons.css` size recorded; a note states the expected subsetted size (subsetting is 0.4-05). (**Full `icons.css` = 45,833 bytes (44.76 KB) raw · 6.26 KB gzip** for all 120 glyphs — recorded here, in `README.md`, and guarded by `tests/build/build-icons.test.ts`. **Expected subsetted size:** roughly linear in icon count — the base rule is ~330 B and each glyph rule averages ~380 B, so a typical project using ~15 icons trims to **≈6 KB raw / ≈1.5 KB gzip**; `faqir add icons --only …` (0.4-05) emits that trimmed sheet.)

**Delivered** — build script `scripts/build-icons.mjs` (pure, deterministic; exports unit-tested) ingests the checked-in curation list `scripts/icons/curated-icons.txt` + vendored SVGs `scripts/icons/lucide/*.svg` (pinned `lucide-static@1.24.0`), optimizes each SVG (strips bloat, keeps the Lucide stroke presentation + all drawing elements) and emits `registry/primitives/icon/{icons.css, icon.manifest.json, icon.html}`. Attribution: `registry/primitives/icon/LICENSE.lucide` (full upstream ISC text — Lucide is **ISC**, not MIT as the ref implies; some glyphs additionally carry Feather's MIT, also reproduced), referenced from `icons.css` and `manifest.icon_set`. Tests: `tests/build/build-icons.test.ts` (determinism, optimizer/encoder, committed-artifacts-in-sync, missing-SVG error, recorded size) + `tests/primitives/icon.test.ts` (schema, bijection, data-URI validity, base rule, license, reference grid, `faqir add icon` + audit-clean). Registry self-audit stays green. **Deferred to 0.4-05 (audit scope):** the `icon-name` audit rule and bundler/audit wiring for the non-`{name}.css` filename `icons.css` — 0.4-04 keeps to its stated Touches (`registry/primitives/icon/`, `scripts/`, vendored SVGs) and does not modify `src/`.

---

### 0.4-05 · Icon subsetting + `icon-name` audit rule

**Depends:** 0.4-04 · **Ref:** §B4, §8.3 · **Touches:** `src/commands/`, `src/audit/`, `tests/`

`faqir add icons --only check,x,chevron-down` generates a trimmed `icons.css` containing
only the requested names (plus the base rule). New audit rule `icon-name`: every
`data-icon` value in audited HTML must exist in the icon manifest; suggest
nearest-match on typo (reuse the CLI's existing typo-suggestion util).

**Tests**
- Subset output contains exactly base rule + requested icons; unknown name → helpful error listing close matches.
- Audit rule: valid names pass, `data-icon="chekc"` flags with "did you mean check".
- Subsetting an already-subsetted project (re-run with more icons) merges rather than clobbers, or fails loudly — pick one, test it.

**Acceptance criteria**
- [x] Trimmed `icons.css` for 5 icons is ≤ ~2KB (record actual). (**5 common icons `check,x,chevron-down,plus,minus` = 1,883 B raw · 588 B gzip** — ≈1.84 KB, well under the 2 KB bar and <1/24 of the full 45,833 B sheet; pinned in `tests/utils/icons.test.ts`. Subsets swap the verbose generated banner for a lean 3-line header that keeps the `@ui:*` markers + Lucide/ISC attribution, and re-emit the verbatim base rule + only the requested glyph lines.)
- [x] `icon-name` rule in the audit inventory with JSON output support. (Added to `ALL_RULES` → surfaces in `getRuleInventory()`, `faqir audit --rules`, and `faqir audit --rules --json` as `{id:"icon-name", severity:"error", applies_to:"component markup vs manifest"}`. Manifest-driven: fires for any component whose manifest declares a variant with attr `data-icon`; flags unknown values with a nearest-match "did you mean …" hint.)
- [x] Re-running `--only` with a different set has defined, tested behavior. (**Merges** — a second `--only` unions its glyphs with those already installed and regenerates `icons.css` + the subset manifest + reference page from the authoritative full registry sheet. Re-adding an already-present glyph is an idempotent no-op. Tested in `tests/commands/add-icons.test.ts`.)

**Delivered** — `faqir add icons --only check,x,chevron-down` (routed from `faqir add` when the target is the plural `icons`; the singular `icon` still installs the full set, as does `faqir add icons` with no `--only`) trims the shipped 120-glyph sheet to just the requested names, working purely from the registry artifacts the CLI ships (no SVG sources / build script needed at runtime). Writes `ui/primitives/icon/{icons.css, icon.manifest.json (subset, so `icon-name` validates against exactly what's installed), icon.html (subset grid), LICENSE.lucide}`, registers the primitive, regenerates `.faqir/context.json`. Unknown names abort with per-name "did you mean …" hints (or an "inspect icon" pointer when nothing is close). The reusable typo-suggestion util was extracted to `src/utils/suggest.ts` (`levenshtein` + `suggestClosest`) and now backs the CLI dispatcher, subsetting, and the audit rule. New `icon-name` audit rule + subsetting live in `src/utils/icons.ts` (pure, unit-tested), `src/commands/icons.ts`, `src/audit/rules.ts`. Tests: `tests/utils/{suggest,icons}.test.ts`, `tests/audit/icon-name.test.ts`, `tests/commands/add-icons.test.ts` (37 assertions); full suite 804 green, typecheck clean, registry self-audit green.

---

### 0.4-06 · Recipe: `alert-dialog`

**Depends:** 0.3-04 · **Ref:** §B2 · **Touches:** `registry/recipes/alert-dialog/`, `build:core` inputs

Dialog variant: `role="alertdialog"`, focus moves to the least-destructive action on
open, **no** dismiss-on-overlay-click, Escape behavior per WAI-ARIA (allowed, but
confirm-required variant may trap), destructive confirm flow with `data-variant`.
Reuse dialog controller internals where possible rather than forking.

**Tests** (controller behavior tests, happy-dom)
- Opens with focus on cancel/least-destructive button; `role="alertdialog"` + `aria-modal` present.
- Overlay click does **not** close; Escape behavior matches the documented contract.
- Focus trap cycles; focus returns to invoker on close; confirm/cancel events fire.

**Acceptance criteria**
- [ ] Auto-initializes from built core (drift guard from 0.3-04 still green).
- [ ] Shares code with `dialog` where practical — no wholesale duplicate controller.
- [ ] Reference page audit-clean; manifest documents the differences from `dialog`.

---

### 0.4-07 · Recipe: `slider`

**Depends:** 0.3-04 · **Ref:** §B2 · **Touches:** `registry/recipes/slider/`

The classic hard one. Single-thumb and range (two-thumb) modes. Keyboard: arrows step,
PageUp/Down big-step, Home/End min/max. ARIA: `role="slider"`, `aria-valuemin/max/now`,
`aria-valuetext` hook. Pointer dragging with correct value math in both LTR and RTL.
Emits change events; value reflected in `data-state`/CSS custom property for styling.

**Tests**
- Keyboard: every key maps to the right value change, clamped at bounds; step respected.
- ARIA attributes track value continuously.
- Range mode: thumbs cannot cross; each thumb independently keyboard-operable.
- Pointer-drag math unit-tested (pure function: pointer x + track rect → value), including RTL inversion.

**Acceptance criteria**
- [x] Fully keyboard operable, screen-reader-correct ARIA.
- [x] Range + single variants in manifest with anatomy; reference page audit-clean.
- [x] Value math isolated in a pure, unit-tested function.

---

### 0.4-08 · Recipe: `sidebar`

**Depends:** 0.3-04 · **Ref:** §B2 · **Touches:** `registry/recipes/sidebar/`

Collapsible app sidebar with three states: `expanded`, `rail` (icons only), and mobile
`drawer` (off-canvas overlay). State in `data-state`, toggled by controller; responsive
breakpoint switches desktop rail/expanded ↔ mobile drawer. Keyboard: toggle button,
Escape closes mobile drawer, focus management on drawer open/close.

**Tests**
- State machine: toggle transitions expanded↔rail on desktop; drawer open/close on mobile (simulate via matchMedia mock).
- Mobile drawer: focus trap + Escape + overlay click close; body scroll handling.
- State persists across toggle (aria-expanded on the toggle button tracks).

**Acceptance criteria**
- [x] All three states styled in every theme; layout uses logical properties (0.3-09 rule clean).
- [x] `data-state` values documented in manifest; agents can set initial state declaratively.
- [x] Reference page shows a full app-shell composition, audit-clean.

---

### 0.4-09 · Recipe: `input-otp`

**Depends:** 0.3-04 · **Ref:** §B2 · **Touches:** `registry/recipes/input-otp/`

Segmented one-time-code input: N visual segments over a single hidden real input (or
per-segment inputs — pick the approach with better paste/SR behavior and document why).
Paste distributes characters; Backspace moves back; auto-advance on entry; complete
event when filled. `l-mask` integration lands later (0.6-06) — build self-contained now.

**Tests**
- Typing auto-advances; Backspace on empty segment focuses previous.
- Paste of full code fills all segments; paste of partial fills from cursor.
- Complete event fires exactly once with the full value; `aria` per WAI patterns (label, autocomplete="one-time-code").

**Acceptance criteria**
- [x] Works with numeric and alphanumeric codes (variant or attribute).
- [x] Mobile-friendly: `inputmode`/`autocomplete` attributes correct in reference markup.
- [x] Manifest documents the events + parts; audit-clean.

---

### 0.4-10 · Recipe: `calendar` (extract from date-picker)

**Depends:** 0.3-04 · **Ref:** §B2 · **Touches:** `registry/recipes/calendar/`, `registry/recipes/date-picker/`

Extract the month-grid from date-picker into a standalone `calendar` recipe (roving
tabindex over day cells, PageUp/Down month nav, Home/End week bounds, `aria-selected`,
min/max/disabled dates), then make date-picker consume it. Must not regress date-picker.

**Tests**
- Calendar standalone: full keyboard grid nav; selection events; disabled-date handling; month boundary navigation.
- Date-picker still passes its behavior contract (write the shared regression checks now if 0.4-22 hasn't run yet — they'll be extended there).
- Range-selection groundwork: selecting start then end sets `data-state` on in-between cells (even if date-picker only uses single).

**Acceptance criteria**
- [x] `faqir add calendar` installs standalone; `faqir add date-picker` resolves the dependency automatically.
- [x] No duplicated grid logic between the two recipes.
- [x] Both reference pages audit-clean; date-picker behavior unchanged.

---

### 0.4-11 · Transitions 2.0 + `faqir-collapse`

**Depends:** 0.3-03 · **Ref:** §A4 · **Touches:** engine source, new `registry/base/motion-presets.css`, new `registry/core/plugins/faqir-collapse.js`

`l-transition` gains named presets (`fade`, `slide-up`, `scale`): the engine stamps
`data-motion="enter|enter-active|leave|leave-active"` through the lifecycle and
`motion-presets.css` styles those states from motion tokens. Leave waits for
transition end (with timeout fallback) before removal. `faqir-collapse.js` plugin:
`l-collapse` animates height with a `prefers-reduced-motion` opt-out, ≤ 2KB.

**Tests**
- Lifecycle: `data-motion` sequence on show and hide is exactly enter→enter-active (clear) / leave→leave-active→removed; timeout fallback fires if no transitionend.
- Presets resolve without console errors; unknown preset warns in dev.
- Collapse: height animates open/closed; reduced-motion skips animation; final state has no inline height residue.

**Acceptance criteria**
- [ ] Transitions are attribute-visible (auditable) — no per-stage classes anywhere.
- [ ] `faqir-collapse.js` ≤ 2KB gzip (size test) and self-registers via `Faqir.plugin`.
- [ ] Motion tokens added to the token layer, not hardcoded durations in preset CSS.

---

### 0.4-12 · Theme manifests for existing themes

**Depends:** 0.3-11 · **Ref:** §C1 · **Touches:** `registry/themes/*.theme.json` (new), `src/commands/` (context embed), theme coverage test

Author `{name}.theme.json` for all shipped themes: name, version, mood tags, scheme,
dark-mode strategy, `tokens_overridden`/`tokens_inherited` (generate these two fields
from the CSS — don't hand-write), `pairs_with`, preview reference. `faqir context`
embeds the active theme manifest. Coverage test (0.3-11) now reads declared scheme from
the manifest instead of heuristics.

**Tests**
- Manifest ↔ CSS consistency: `tokens_overridden` exactly matches parsed CSS (generated, then asserted).
- Schema validation for the theme manifest format; every theme has one.
- `faqir context` output includes the active theme block.

**Acceptance criteria**
- [ ] All shipped themes have valid, CSS-consistent manifests.
- [ ] A theme without a manifest fails the registry self-audit/CI.
- [ ] Manifest format documented (it becomes part of the schema published in 0.5-07).

---

### 0.4-13 · Themes: `aurora` + `slate`

**Depends:** 0.4-12 · **Ref:** §C3 · **Touches:** `registry/themes/{aurora,slate}.css` + manifests + previews

`aurora`: vibrant gradient accents on deep neutral dark, modern SaaS. `slate`:
conservative enterprise blue-gray, "safe for banks." Both light+dark, full 27-token
coverage, manifest + preview page each.

**Tests**
- Coverage matrix green for both (from 0.3-11 — should be automatic).
- Manifest consistency tests (from 0.4-12).
- Contrast spot-checks: primary/primary-fg and fg/bg pairs ≥ 4.5:1 in both schemes (manual oklch computation util — becomes the seed for 0.4-16).

**Acceptance criteria**
- [ ] `faqir theme aurora|slate` (or equivalent command) applies cleanly to an existing project.
- [ ] Preview pages render every major component group in both schemes.
- [ ] Zero coverage or consistency failures.

---

### 0.4-14 · Theme: `contrast` (WCAG AAA)

**Depends:** 0.4-12 · **Ref:** §C3 · **Touches:** `registry/themes/contrast.css` + manifest + preview

The accessibility-statement theme: 7:1 text contrast throughout, visible focus
indicators everywhere, no low-contrast muted text, honest disabled states.

**Tests**
- Programmatic contrast assertions: every fg/bg semantic pair ≥ 7:1, interactive states ≥ 4.5:1 (using the oklch contrast util from 0.4-13).
- Coverage + manifest tests green.
- Focus visibility: `:focus-visible` rules present for all interactive `data-ui` values (CSS-level assertion).

**Acceptance criteria**
- [x] Every semantic text pair computes ≥ 7:1 (test-enforced, not eyeballed). (`tests/themes/contrast.test.ts` computes every fg×surface pair, on-color pair, and subtle-bg pair from `contrast.css` with the 0.4-13 oklch util in both schemes; interactive hover/active pairs gated at ≥ 4.5:1. All green.)
- [x] Preview page demonstrates focus indicators on all interactive components. (`contrast.preview.html` — a "Focus & keyboard access" section paints the theme's opaque 3px ring persistently on button/link/input/textarea/select/checkbox/radio/switch/toggle/slider/tabs/select-custom/date-picker; browser-verified in light + dark.)
- [x] Manifest `mood` includes an accessibility tag agents can select on. (`mood: ["accessible", "wcag-aaa", "high-contrast", "neutral"]`.)

---

### 0.4-15 · Audit rules: `duplicate-id`, `heading-order`, `landmark`

**Depends:** — · **Ref:** §8.3 · **Touches:** `src/audit/`, `tests/audit/`

Three deterministic HTML rules. `duplicate-id`: IDs unique per document (broken ARIA
otherwise). `heading-order`: no skipped levels within a pattern/page. `landmark`: pages
have `main`, dialogs not nested in main flow, nav landmarks labeled when multiple.

**Tests**
- Per rule: violating fixture flags with correct line/column; clean fixture passes.
- Edge cases: duplicate IDs across shadow boundaries out of scope (documented), heading-order resets are not allowed but h1→h2→h2 is fine, multiple navs without labels flag.
- JSON output includes the three rules with stable codes.

**Acceptance criteria**
- [x] Rules enabled by default; registry self-audit still zero findings (fix registry if any surface). (All three run per HTML file in `runAudit` via `DOCUMENT_RULES`. Added a 3rd gate to `scripts/registry-audit.mjs` over `registry/{primitives,recipes,patterns}/**/*.html` — 66 pages, zero findings. The only pre-existing surface was the three `themes/*.preview.html` full-doc harnesses flagging "no main"; they inject `<main>` at runtime from a `<template>`, so a static scan false-positives — deliberately scoped out with a documented reason rather than adding dead markup.)
- [x] Each finding message actionable (says what to change). (e.g. `Rename this one to id="note-2" … or remove the id`, `Use <h2> here …`, `wrap the primary content in a <main> …`, `add aria-label …`. Findings also carry precise `line:column`, surfaced as `L{line}:{col}` in the terminal and `line`/`column` in `--json`.)
- [x] `duplicate-id` findings marked auto-repairable only if a safe rename exists — otherwise report-only (decide + test). (**Decision:** safe = the duplicated id is *unreferenced* by any IDREF attr — `for`/`aria-*`/`headers`/… — or `#fragment` URL; then a `rename-id` fix suffixes later occurrences uniquely (`dup` → `dup-2`/`dup-3`, first kept canonical). A *referenced* duplicate is report-only — the intended target is ambiguous, so a human must resolve it. Tested both ways plus a repair round-trip. Also documented: ids inside a `<template>` are a separate scope, so cross-shadow-boundary duplicates are out of scope by design.)

---

### 0.4-16 · Audit rule: `contrast-tokens`

**Depends:** 0.4-13 (oklch contrast util) · **Ref:** §8.3 · **Touches:** `src/audit/`, shared `src/utils/oklch.ts`, `tests/`

Static contrast computation on token pairs: parse oklch values from theme/token CSS,
compute WCAG relative-luminance contrast for declared pairs (fg/bg, primary/primary-fg,
muted-fg/bg, etc. — encode the pair list once), flag pairs below 4.5:1. Pure math, no
browser.

**Tests**
- oklch→sRGB→luminance conversion validated against known reference values (±ε).
- Failing pair fixture flags with the computed ratio in the message; passing themes stay clean.
- Non-oklch or var-indirection values resolve through the token graph (alias → semantic → palette) before computing.

**Acceptance criteria**
- [x] All shipped themes pass (or get fixed in-session with a note).
- [x] Ratio math unit-tested against published WCAG examples.
- [x] Token-graph resolution handles the 3-layer alias chain.

> Fixed in-session (3 dark-mode pairs the new gate caught below 4.5:1): `default`
> dark primary label flipped to dark ink on the luminous accent (was white, 3.4:1);
> `default`/`paper`/`midnight` dark `--color-destructive` darkened one step so white
> stays legible (was 3.6/4.0/3.6:1). Interactive hover/active pairs are intentionally
> out of scope for this general gate — they're covered by the AAA `contrast` theme (0.4-14).

---

### 0.4-17 · Audit rule: `field-wiring`

**Depends:** 0.4-15 · **Ref:** §8.3, §7.1 · **Touches:** `src/audit/`, `src/audit/repair`, `tests/audit/`

Enforce the `field-group` ARIA contract: control's `aria-describedby` must reference the
existing description/error part IDs; `aria-invalid` present iff the group is in the
invalid state; label `for` matches control `id`. Auto-repair: generate missing IDs and
wire them (deterministic ID derivation from the field name/label).

**Tests**
- Each violation class flags: missing describedby, dangling describedby ref, invalid-state without aria-invalid, label/for mismatch.
- Repair round-trip: broken fixture → repaired → zero findings; generated IDs deterministic across runs.
- Valid field-group (per §7.1 example) passes untouched.

**Acceptance criteria**
- [x] Repair produces the exact §7.1 canonical wiring.
- [x] Rule tolerates the current shipped `error` state naming AND the normalized naming (forward-compatible with 0.6-01).
- [x] Registry field-group reference page passes.

---

### 0.4-18 · Controller tests A: toast, tooltip, accordion

**Depends:** 0.3-04 · **Ref:** §12.1 · **Touches:** `tests/recipes/`

Behavior tests for three simpler untested controllers, happy-dom. Codify each
controller's contract; fix small bugs found in-session, file bigger ones as new task
rows.

**Tests** (the task is tests)
- toast: enqueue/stack, auto-dismiss timers (fake timers), pause-on-hover if implemented, `role="status"`/`aria-live` region, dismiss action.
- tooltip: show on hover/focus with delay, hide on blur/Escape, `aria-describedby` wiring, no tooltip stuck after pointer leaves.
- accordion: single/multiple expand modes, `aria-expanded`/`aria-controls`, keyboard (Up/Down/Home/End per WAI), collapse animation hooks don't break state.

**Acceptance criteria**
- [ ] Each controller has a documented contract at the top of its test file.
- [ ] Timer-based behavior tested with fake timers (no real waits).
- [ ] Any discovered defect fixed or filed as an indexed follow-up task.

---

### 0.4-19 · Controller tests B: popover, sheet, drawer

**Depends:** 0.3-04 · **Ref:** §12.1 · **Touches:** `tests/recipes/`

**Tests**
- popover: open/close on trigger, outside-click close, Escape, focus return, positioning attributes set, nested-popover sanity.
- sheet: slide-in state machine, focus trap, Escape + overlay close, scroll lock on open/unlock on close.
- drawer: same contract as sheet where shared + side variants; assert `data-state` transitions exactly.

**Acceptance criteria**
- [ ] Focus-trap behavior asserted for both overlay components (tab cycles, shift-tab reverses).
- [ ] Scroll-lock verified to always unlock (including double-open/close sequences).
- [ ] Contracts documented in test headers.

---

### 0.4-20 · Controller tests C: pagination, select-custom, qr-code

**Depends:** 0.3-04 · **Ref:** §12.1 · **Touches:** `tests/recipes/`

**Tests**
- pagination: page-change events, ellipsis window math (unit-test the windowing function across sizes), current-page `aria-current`, boundary buttons disable.
- select-custom: open/close, keyboard nav + typeahead, selection updates hidden input/value + `aria-selected`/`aria-activedescendant`, close on select.
- qr-code: renders a scannable matrix for known inputs (assert module matrix against a known-good vector), error-correction level option, empty/oversize input handling.

**Acceptance criteria**
- [ ] Pagination window math covered across ≥ 5 shapes (few pages, many, edges).
- [ ] qr-code output verified against at least 2 known test vectors.
- [ ] select-custom keyboard contract fully asserted.

---

### 0.4-21 · Controller tests D: combobox, command-palette

**Depends:** 0.3-04 · **Ref:** §12.1 · **Touches:** `tests/recipes/`

The two most complex controllers. Happy-dom where possible; if real focus semantics are
untestable there, add a minimal Playwright spec file (shared browser-test harness — keep
it tiny, it grows in 0.4-23).

**Tests**
- combobox: filter-as-you-type, `aria-expanded`/`aria-activedescendant` tracking, keyboard nav through filtered results, selection + clear, no-results state, blur commits/reverts per contract.
- command-palette: open shortcut, fuzzy filter, grouped results nav, Enter executes + closes, Escape layers (clear filter → close), recent/empty states.

**Acceptance criteria**
- [ ] ARIA combobox pattern attributes asserted at every interaction step.
- [ ] Both controllers' contracts documented; defects fixed or filed.
- [ ] If Playwright was needed, the harness is reusable and CI-wired.

---

### 0.4-22 · Controller tests E: date-picker, table

**Depends:** 0.4-10 · **Ref:** §12.1 · **Touches:** `tests/recipes/`

**Tests**
- date-picker: open/close, calendar integration (post-0.4-10 extraction), input parsing/formatting round-trip, min/max enforcement, keyboard entry vs grid selection agreement.
- table: sort toggling (asc/desc/none) with `aria-sort`, number/currency format rendering, tfoot behavior, row-selection events if implemented, empty state.

**Acceptance criteria**
- [ ] 100% of recipe controllers now have behavior tests (the §12.1 goal) — assert by listing recipes vs test files in a meta-test.
- [ ] Date parsing/formatting covered including invalid input.
- [ ] Sorting covered for string/number/date columns.

---

### 0.4-23 · Visual regression suite

**Depends:** 0.4-13 (more themes = the matrix this exists for) · **Ref:** §12.2 · **Touches:** new `tests/visual/`, `.github/workflows/`, `playwright.config.ts`

Playwright screenshot suite generated from the registry's reference `.html` files — no
hand-maintained gallery. Matrix: every component × every theme × light/dark × LTR/RTL.
Baselines committed (or stored per CI artifact strategy); diffs posted as PR artifacts.
Keep runtime sane: shard in CI, one viewport.

**Tests**
- The suite itself + a meta-test: every component with a reference page appears in the generated matrix (nothing silently skipped).
- Deliberate 1px CSS change produces a diff failure (verified once, reverted).

**Acceptance criteria**
- [ ] Matrix generated from the registry at runtime — adding a component requires zero suite edits.
- [ ] CI job runs on PRs, uploads diff artifacts on failure.
- [ ] RTL captures included (this locks in 0.3-10).
- [ ] Full-suite runtime documented; sharded if > ~10 min.

---

### 0.4-24 · Automated a11y (axe-core) in CI

**Depends:** 0.4-23 (shares the Playwright harness) · **Ref:** §12.3 · **Touches:** `tests/a11y/`, CI workflow

axe-core pass over every reference page and every pattern, zero-violation policy for the
registry. Run against at least default + contrast themes, light+dark. Violations report
component, rule, and offending selector.

**Tests**
- The axe suite + a fixture with a known violation proving the gate actually fails.
- Meta-test: page discovery matches the visual suite's (shared discovery util).

**Acceptance criteria**
- [ ] Zero axe violations across the registry (fix any found in-session; large fixes → indexed follow-ups).
- [ ] CI gate wired; failure output names component + rule + selector.
- [ ] Documented exemption mechanism (per-rule, per-page, with justification string) for false positives — used zero times initially.

---

# Phase v0.5 — Agents

---

### 0.5-01 · `@faqir-ui/mcp` skeleton + read tools

**Depends:** 0.3-01 · **Ref:** §8.1 · **Touches:** new `packages/mcp/`

Stdio MCP server wrapping the same TypeScript internals as the CLI (refactor shared
logic into importable functions if any is CLI-entangled — smallest viable extraction).
This session: server boot, tool registration, and the read tools —
`faqir_list_components` (filterable), `faqir_get_manifest`, `faqir_theme_info`,
`faqir_project_context` (reads host project's `.faqir/context.json` when present).

**Tests**
- In-process MCP client (SDK test transport): each tool callable, returns schema-valid JSON.
- `faqir_list_components` filters by kind/category; `faqir_get_manifest` errors cleanly on unknown component.
- `faqir_project_context` inside vs outside a Faqir project (fixture dirs).

**Acceptance criteria**
- [ ] Server runs via `bun run` and via compiled `node packages/mcp/dist/index.mjs`.
- [ ] Tool input/output schemas declared (MCP tool schema), not free-form.
- [ ] Shared internals imported from the CLI core — no logic copy-pasted.

---

### 0.5-02 · MCP write/verify tools + resources + packaging

**Depends:** 0.5-01 · **Ref:** §8.1 · **Touches:** `packages/mcp/`

Add `faqir_generate` ({component, variant, size, slots, props} → HTML, audit-verified
before returning), `faqir_scaffold_page`, `faqir_audit_html` and `faqir_repair_html`
(**string in/out, no filesystem**), `faqir_generate_theme` (stub until 0.6-11 — return
not-implemented cleanly, or wire if 0.6-11 landed). Expose protocol spec, token
reference, and manifests as MCP resources. Compile + package for `npx @faqir-ui/mcp`.

**Tests**
- `faqir_generate` output passes `faqir_audit_html` for a matrix of components/variants (property-style loop).
- `faqir_audit_html` on known-bad HTML returns the expected findings JSON; `faqir_repair_html` round-trips to clean.
- Resources listable and fetchable via the test client.
- End-to-end: real stdio spawn of the compiled server, one full tool call.

**Acceptance criteria**
- [ ] An agent with only this MCP server can produce and self-validate a page (scripted end-to-end test proves it).
- [ ] Audit/repair tools require zero filesystem access.
- [ ] `npx`-ready package.json (bin entry, compiled dist); README with Claude Code/Cursor config snippets.

---

### 0.5-03 · Remote registry protocol

**Depends:** — · **Ref:** §9.2 · **Touches:** `src/commands/add`, new `scripts/build-registry-index.mjs`, `faqir.config.json` schema

Define `registry-index.json` ({name, kind, version, files, hash, deps} per component)
and generate it from the local registry. `faqir add <name> --registry <url>` fetches
index + files from any static host; SHA-256 verified before any write; partial-failure
leaves no half-installed component. `faqir.config.json` gains a `registries` map;
`@scope/name` resolves through it. Bundled registry stays the offline-first default.

**Tests**
- Index generation: complete, hashes correct, deterministic.
- Fetch path against a local static server fixture: happy path, hash mismatch → abort with nothing written, missing file → clean error, dep resolution across the remote index.
- Config resolution: scoped name → registry URL; unknown scope → helpful error.

**Acceptance criteria**
- [ ] Third parties can host a registry with **only static files** (documented format, no server logic).
- [ ] Integrity failure can never write files (test-proven).
- [ ] Offline `faqir add button` behavior byte-identical to before.

---

### 0.5-04 · `faqir upgrade` groundwork: pristine store + `faqir diff`

**Depends:** 0.5-03 (versioned index) · **Ref:** §9.3 · **Touches:** `src/commands/`, `.faqir/pristine/` layout

On `add`, store the pristine copy under `.faqir/pristine/{component}@{version}/`.
`faqir diff <component>` shows user drift vs pristine (unified diff, `--json` summary).
Backfill story: components added before this feature get pristine snapshots on their
next `add`/`upgrade` with a warning. Manifests gain the `changes` changelog array
(schema only; populate going forward).

**Tests**
- `add` writes pristine copies; content byte-equal to registry source.
- `diff` on unmodified component → empty; after an edit → correct hunks; `--json` shape stable.
- Missing-pristine path warns and degrades gracefully.

**Acceptance criteria**
- [ ] `.faqir/pristine/` layout documented and versioned (survives future format changes).
- [ ] `diff` output usable by an agent (`--json`) and a human (unified).
- [ ] Manifest schema extended with `changes: [{version, note, breaking}]`.

---

### 0.5-05 · `faqir upgrade` three-way merge

**Depends:** 0.5-04 · **Ref:** §9.3 · **Touches:** `src/commands/upgrade` (new), merge util in `src/utils/`

`faqir upgrade [component]`: three-way merge of pristine-old vs user-current vs
registry-new. Clean hunks auto-apply; conflicts written with standard conflict markers
and reported (exit code + JSON listing conflicted files/hunks). Prints the manifest
`changes` entries between versions, flagging `breaking`. Updates the pristine store to
the new version on success.

**Tests**
- Merge matrix: user-unchanged (fast-forward), non-overlapping edits (both applied), overlapping edits (conflict markers, correct ours/theirs content), user-deleted file, registry-deleted file.
- Post-upgrade pristine store reflects the new version.
- `--dry-run` reports without writing; `--json` output schema.

**Acceptance criteria**
- [ ] Conflict markers are standard git-style (agents resolve these well — that's the design bet).
- [ ] No data loss in any merge-matrix case (user content always recoverable).
- [ ] Changelog entries printed with breaking-change flag surfaced prominently.

---

### 0.5-06 · Context v2: `llms.txt`

**Depends:** — · **Ref:** §8.2 · **Touches:** `src/commands/context`, `src/generator/`

`faqir context --format llms` emits `llms.txt` (concise index per the convention:
project blurb + linked sections) and `llms-full.txt` (full expanded reference) for the
project's *installed* component set — generated from manifests, scoped to what the
project actually uses.

**Tests**
- Output derived from installed set: fixture project with 3 components → only those documented.
- `llms.txt` structure conforms to the convention (H1, blockquote summary, link lists — assert structurally).
- Regenerating after `faqir add` includes the new component.

**Acceptance criteria**
- [ ] Both files generated, deterministic, and current with manifests.
- [ ] Format listed in `faqir context --help` and the command's `--json` metadata.
- [ ] No hand-maintained prose — 100% manifest/token-derived.

---

### 0.5-07 · Manifest-derived skill generator + published schema

**Depends:** 0.5-06 · **Ref:** §8.2 · **Touches:** `src/generator/skill`, `manifest.schema.json` (new, versioned), `.claude/skills/faqir-creator` regeneration

Replace the static skill template: generate per-component anatomy trees, variant tables,
safe/unsafe transforms, and 2–3 canonical compositions from manifests. Write
`manifest.schema.json` (JSON Schema for the manifest format, including theme manifests
and the `changes` array), add `$schema` references to every manifest. Regenerate the
shipped `faqir-creator` skill from this pipeline (dogfood).

**Tests**
- Generated skill contains a section per installed component with anatomy + variants matching the manifest (assert on fixtures).
- Every registry manifest validates against `manifest.schema.json` (CI-gating test).
- Schema itself is valid JSON Schema (meta-validation).

**Acceptance criteria**
- [ ] `grep`-able proof the skill is generated (generation header), and regeneration is idempotent.
- [ ] All manifests carry `$schema` and validate.
- [ ] Schema versioned (`schema_version` field) — the freeze in 1.0-01 builds on this.

---

### 0.5-08 · Spec-informed HTML tokenizer

**Depends:** — · **Ref:** §9.1 · **Touches:** `src/parser/`, `tests/parser/`

Replace the regex HTML scanner with a small spec-informed tokenizer (~600 lines,
vendored, zero-dep): correct handling of comments, raw-text elements
(`<script>`/`<style>`), quoted attribute values containing `>`, void elements, and
line/column tracking for every node. Keep the public parser API stable so audit/
generator callers don't change.

**Tests**
- Entire existing fixture corpus passes unchanged (the compatibility bar).
- New cases: `<script>` containing `<div>` text, comment containing `-->` edge, attribute `data-x="a>b"`, unclosed tags, void elements with/without `/`, CRLF input.
- Line/column correctness asserted for nested structures.

**Acceptance criteria**
- [ ] All existing parser + audit tests green with zero call-site changes.
- [ ] Audit findings now report accurate line/column (spot-assert in audit tests).
- [ ] Parser remains dependency-free; size/complexity noted in module header.

---

### 0.5-09 · Parser fuzz corpus + property tests

**Depends:** 0.5-08 · **Ref:** §9.1, §12.7 · **Touches:** `tests/parser/fuzz/`, `tests/fixtures/malformed/`

Build a malformed-HTML corpus (truncated tags, interleaved quotes, null bytes, deep
nesting, giant attributes, mixed encodings) and a seeded generative fuzzer. Properties:
never throws, never hangs (time-bounded), output node ranges are within input bounds,
parse(serialize(parse(x))) is stable where serialization exists.

**Tests**
- Corpus regression suite (every past crasher becomes a fixture).
- Seeded property runs (fixed seeds in CI for determinism; document how to run extended fuzzing locally).

**Acceptance criteria**
- [ ] Zero crashes/hangs across corpus + N seeded generations (N documented).
- [ ] Any crasher found is fixed and pinned as a fixture in the same session.
- [ ] Fuzzer runnable standalone (`bun run fuzz:parser`) with a seed argument.

---

### 0.5-10 · `faqir audit --stdin` + universal `--json`

**Depends:** — · **Ref:** §8.3, §9.4 · **Touches:** `src/commands/*`, `src/index.ts`, `tests/commands/`

`faqir audit --stdin` reads HTML from stdin, reports findings with a stable, versioned
JSON schema (`audit_schema_version` field). Then make `--json` a guarantee: every CLI
command accepts it and emits machine-readable output — enforced by a meta-test that
enumerates registered commands and runs each with `--json`.

**Tests**
- stdin piping end-to-end (spawn the CLI, pipe bytes, parse JSON out).
- Schema versioning: output includes `audit_schema_version`; snapshot the schema shape.
- Meta-test: every command × `--json` → parseable JSON, non-zero exit codes still emit JSON errors.

**Acceptance criteria**
- [ ] `echo '<div>…</div>' | faqir audit --stdin --json` works on compiled Node CLI.
- [ ] JSON guarantee CI-tested for all 20+ commands, including error paths.
- [ ] Audit JSON schema documented (feeds the MCP tools and 1.0 freeze).

---

# Phase v0.6 — Forms, Data & Documents

The Formery/craft enablement milestone.

---

### 0.6-01 · `field-group` validation contract normalization

**Depends:** 0.4-17 · **Ref:** §7.1 · **Touches:** `registry/primitives/field-group/`, dependent recipes/patterns, manifest

Normalize the state vocabulary to `invalid | validating | disabled` (migrating the
shipped `error` state — manifest change note + `changes` entry marking it breaking).
CSS shows the `error` part only when invalid (no JS class toggling). Required-marker
part standardized. Update every registry consumer of the old state name.

**Tests**
- CSS: `[data-part="error"]` hidden by default, visible under `[data-state="invalid"]` (assert selectors).
- Audit `field-wiring` green on the updated reference page with new vocabulary.
- Registry-wide grep-test: zero remaining `data-state="error"` on field-groups.

**Acceptance criteria**
- [ ] Manifest documents the full contract (§7.1 markup is the canonical example) + a breaking `changes` entry.
- [ ] `faqir upgrade` path from old vocabulary works (merge test with a fixture project).
- [ ] All registry consumers migrated; audit + visual suites green.

---

### 0.6-02 · `faqir-validate.js` plugin

**Depends:** 0.6-01 · **Ref:** §7.1, §A5 · **Touches:** new `registry/core/plugins/faqir-validate.js`, `tests/core/`

`l-validate` on a form reflects native `ValidityState` into the field-group contract:
sets `data-state="invalid"`, populates the error part (from validation message or
attribute-provided messages), wires `aria-invalid`, validates on submit + on blur-after-
first-attempt (document the exact UX policy in the plugin header). Custom validators via
expression: `l-validate:email="isCompanyEmail(value)"`. ≤ 2KB gzip.

**Tests**
- Native constraints: required/pattern/type=email each flip the right field-group to invalid with a message on submit.
- Valid input clears state + error text + `aria-invalid`.
- Custom expression validator called with value; falsy result → invalid with provided message.
- Submit blocked while invalid; fires when clean. Revalidation policy asserted.

**Acceptance criteria**
- [ ] Zero imperative JS needed by the page author for full validation UX.
- [ ] Plugin ≤ 2KB gzip (size test), self-registers via `Faqir.plugin`.
- [ ] Works against the exact markup `@faqir-ui/forms` will emit (shared fixture with 0.6-03).

---

### 0.6-03 · `@faqir-ui/forms` core: scalars

**Depends:** 0.6-01 · **Ref:** §7.2 · **Touches:** new `packages/forms/`

Isomorphic zero-dependency `renderForm(jsonSchema, uiSchema?, opts)` → Faqir HTML string.
This session: package scaffold + scalar mapping — string (input/textarea via uiSchema),
string+enum → select or radio-group by cardinality (document the threshold), number/
integer (min/max/step), boolean → checkbox/switch, string+format date/email/uri →
date-picker/email input/url input. Every field wrapped in the 0.6-01 field-group
contract with required markers and description from schema `description`.

**Tests**
- Golden-file tests per scalar type (snapshot the emitted HTML).
- **The audit gate**: every rendered output passes `faqir audit` with zero findings (programmatic loop over all test schemas — this is the §7.2 quality contract).
- Enum cardinality threshold behavior; required propagation; title/description mapping.

**Acceptance criteria**
- [ ] Runs in Bun, Node, and browser (no fs/DOM dependency in render path — string building only).
- [ ] 100% of emitted forms audit-clean by construction (test-enforced).
- [ ] Unsupported schema features fail loudly with a clear message (no silent skips).

---

### 0.6-04 · `@faqir-ui/forms` composite: objects, arrays, wizard

**Depends:** 0.6-03, 0.6-14 (wizard pattern — or stub against its contract if not landed; note which) · **Ref:** §7.2 · **Touches:** `packages/forms/`

Nested objects → fieldset cards; arrays of enum → checkbox group or tag-input by
cardinality; arrays of objects → repeatable groups (add/remove powered by `l-data` +
keyed `l-for` — dogfooding 0.3-05); uiSchema layout groups; multi-step via the `wizard`
pattern. Client runtime remains faqir-core + faqir-validate only.

**Tests**
- Golden files for each composite shape, including 2-level nesting.
- Repeatable groups: rendered markup drives add/remove correctly under faqir-core (happy-dom integration test).
- Wizard: steps from uiSchema, per-step validation gate before advance.
- Audit gate extended over all composite outputs — still zero findings.

**Acceptance criteria**
- [ ] The §7.2 widget-mapping table fully implemented (checklist in test file mirrors it).
- [ ] A realistic end-to-end schema (patient intake-style) renders, validates, and submits in a happy-dom integration test with zero custom JS.
- [ ] Package publishable: exports map, `.d.ts`, README with the 3-line usage example.

---

### 0.6-05 · Plugins: `faqir-persist` + `faqir-intersect`

**Depends:** 0.3-03 · **Ref:** §A5 · **Touches:** `registry/core/plugins/{faqir-persist,faqir-intersect}.js`, `tests/core/`

`faqir-persist`: `l-persist`/`$persist()` — localStorage-backed reactive state, JSON
serialization, per-key namespacing, graceful behavior when storage is unavailable
(private mode). `faqir-intersect`: `l-intersect` enter/leave expression hooks with
`.once` modifier (lazy sections, infinite scroll). Each ≤ 2KB gzip, self-registering.

**Tests**
- persist: state survives simulated reload (re-init against same storage), storage quota/absence degrades to in-memory without throwing, key collisions namespaced.
- intersect: mocked IntersectionObserver → enter/leave expressions fire; `.once` disconnects after first enter; observer disconnected on scope teardown.

**Acceptance criteria**
- [ ] Both ≤ 2KB gzip (size tests) and loadable as separate script tags or via `faqir bundle --js`.
- [ ] Teardown-clean: no observers/listeners survive scope destruction.
- [ ] Documented in generated context/skill output (plugin discovery).

---

### 0.6-06 · Plugin: `faqir-mask`

**Depends:** 0.4-09 · **Ref:** §A5 · **Touches:** `registry/core/plugins/faqir-mask.js`, `registry/recipes/input-otp/`, `tests/`

`l-mask` input masking: pattern tokens (9=digit, a=letter, *=any) for dates, phones,
OTP. Correct caret behavior on insert/delete mid-string; paste normalization; masked vs
raw value both accessible (raw via scope/model binding). Wire input-otp to optionally
use it. ≤ 2KB gzip.

**Tests**
- Mask engine as a pure function: (mask, prior value, input event) → (value, caret) — table-driven across insert/delete/paste cases.
- `l-model` integration: model receives raw value while display shows masked.
- input-otp with mask: numeric enforcement via mask path.

**Acceptance criteria**
- [ ] Caret never jumps to end on mid-string edits (explicitly tested).
- [ ] Pure mask engine 100% unit-covered; DOM layer thin.
- [ ] ≤ 2KB gzip; self-registers.

---

### 0.6-07 · Documents: running headers/footers

**Depends:** — · **Ref:** §7.4 · **Touches:** `registry/patterns/document/`, `registry/tokens/document.css`

`doc-header`/`doc-footer` parts using `position: running()` + `@page` margin boxes where
the renderer supports them, with fixed-position fallbacks. Page numbers via CSS
counters (`counter(page)`). Both mechanisms coexist; document which PDF renderers get
which path.

**Tests**
- CSS-level assertions: running()/@page rules present, fallback rules present and correctly scoped.
- Reference multi-page document added to the registry, audit-clean.
- Actual PDF verification deferred to 0.6-10 (note the dependency), but a headless-Chromium manual check performed and recorded in the commit.

**Acceptance criteria**
- [ ] A 3+ page reference document repeats header/footer with correct page numbers when printed from Chromium (manually verified this session; automated in 0.6-10).
- [ ] Manifest documents the parts + renderer-support matrix.
- [ ] No regression to single-page document rendering (visual suite).

---

### 0.6-08 · `faqir scaffold invoice` + `faqir scaffold report`

**Depends:** 0.6-07 · **Ref:** §7.4 · **Touches:** `src/commands/scaffold`, scaffold templates

Two ready-to-print, audit-clean scaffolds exercising the whole document layer: invoice
(key-value blocks, doc-table with currency formats + tfoot totals, qr-code payment
block, signature, page-break) and report (headers/footers, callouts, stats, description
lists, image). Placeholder data clearly marked for agent replacement.

**Tests**
- Scaffold output: zero audit findings, zero axe violations (run both gates programmatically).
- Every document-layer component appears across the two scaffolds (coverage assertion against a component list).
- Generated pages parse + render in the visual suite (add them as reference pages).

**Acceptance criteria**
- [ ] `faqir scaffold invoice` → a file that prints correctly from headless Chromium with repeating header/footer.
- [ ] Both scaffolds theme-switchable (`document` theme default, others apply cleanly).
- [ ] Placeholder convention documented so agents know what to replace.

---

### 0.6-09 · `watermark` + `barcode` + `document-serif`

**Depends:** 0.6-07 · **Ref:** §7.4 · **Touches:** `registry/primitives/watermark/`, `registry/recipes/barcode/`, `registry/themes/document-serif.css`

`watermark`: CSS-only (fixed/absolutely positioned repeated text/diagonal, print-safe,
non-interactive). `barcode`: Code128 recipe following the qr-code pattern (pure JS
encoder → SVG/CSS bars). `document-serif`: contracts/legal document theme, full
coverage + manifest + preview.

**Tests**
- barcode: Code128 encoding verified against known test vectors (checksum + bar pattern for ≥ 3 inputs); invalid charset input errors cleanly.
- watermark: print media rules present; doesn't intercept pointer events (CSS assertion).
- document-serif: theme coverage matrix + manifest consistency green.

**Acceptance criteria**
- [ ] Barcode scannable in practice (verified once with a phone/scanner app; noted in commit).
- [ ] Watermark works under both screen and print media.
- [ ] The `docs/for_craft.md` wishlist is now fully closed — state it in the commit.

---

### 0.6-10 · Print visual regression

**Depends:** 0.6-08 · **Ref:** §7.4, §12 · **Touches:** `tests/visual/print/`, CI workflow

Render reference documents (invoice + report scaffolds + document pattern page) to PDF
via headless Chromium in CI, rasterize pages, image-diff against baselines. This is the
print layer's equivalent of 0.4-23.

**Tests**
- The pipeline + a meta-test that all document-kind reference pages are included.
- Deliberate margin change produces a diff failure (verified once, reverted).
- Page-count assertions (invoice = N pages) to catch pagination regressions cheaply.

**Acceptance criteria**
- [ ] PDF diffs run in CI on PRs touching document-layer files (path-filtered for speed).
- [ ] Header/footer repetition and page numbers locked in by baseline images.
- [ ] Baseline update workflow documented (how to bless intentional changes).

---

### 0.6-11 · `faqir theme generate`

**Depends:** 0.4-16 (oklch + contrast utils) · **Ref:** §C4 · **Touches:** `src/commands/theme`, `src/utils/oklch.ts`

`faqir theme generate my-brand --accent "oklch(…)" --neutral cool|warm|gray --radius sm|md|lg --scheme light|dark|both`:
generate the 11-step accent ramp (fixed lightness/chroma curve, brand hue), map semantic
tokens, derive hover/active/subtle steps, compute dark-mode inversions, **verify
contrast pairs before writing** (primary/primary-fg ≥ 4.5:1 — auto-adjust lightness or
fail with guidance). Emits `themes/{name}.css` + `{name}.theme.json`. Also emit a
brand-matched document theme variant (`--document` flag) per §7.4.

**Tests**
- Determinism: same inputs → identical output.
- Generated themes pass the coverage matrix (0.3-11), manifest consistency (0.4-12), and `contrast-tokens` audit (0.4-16) — the full existing gauntlet, programmatically, for ≥ 5 sample accent colors across the hue wheel.
- Contrast auto-adjustment: a low-contrast accent input still yields passing pairs (or clean failure with message — per documented policy).
- CSS + hex accent inputs accepted; garbage input errors helpfully.

**Acceptance criteria**
- [ ] One brand color in → complete valid theme out, passing every theme gate the shipped themes pass.
- [ ] `--document` emits a print-appropriate variant.
- [ ] `--json` reports what was generated + computed contrast ratios (Formery automation hook).

---

### 0.6-12 · `@faqir-ui/vue` codegen + primitives

**Depends:** 0.5-07 (schema maturity) · **Ref:** §11.1–11.2 · **Touches:** new `packages/vue/`, new `src/commands/bindings` (or `scripts/build-bindings.mjs`)

`faqir bindings vue`: for every primitive manifest, generate a Vue 3 component (render
function emitting exact manifest markup; slots ↔ `data-part` slots; variant/size props
typed as literal unions from the manifest; boolean state props → `data-state`). Small
hand-written runtime (~150 lines). No faqir-core directives inside Vue — host framework
owns reactivity. Package ships no CSS.

**Tests**
- Codegen snapshot per primitive kind; generated TS compiles (`vue-tsc` in the package test).
- @vue/test-utils: rendered DOM carries correct `data-ui/part/variant/size/state` for prop matrices; slots project into the right parts.
- Manifest-drift guard: regenerating in CI produces zero diff (bindings can't drift — the §11.1 promise, made literal).

**Acceptance criteria**
- [ ] All primitives generated with typed props (unions from manifests).
- [ ] Zero hand-written per-component code; runtime ≤ ~150 lines (report count).
- [ ] CI regeneration-drift check wired.

---

### 0.6-13 · `@faqir-ui/vue` recipes + SSR

**Depends:** 0.6-12 · **Ref:** §11.2 · **Touches:** `packages/vue/`

Recipe components: `onMounted(() => createX(el))` / `onBeforeUnmount(destroy)`,
controller API via `defineExpose` (`dialogRef.open()`), controller events re-emitted as
Vue events. SSR-safe: server renders plain HTML, controllers attach on mount, `hidden`
attributes prevent FOUC. Validate with an SSR render test (no window access during
render).

**Tests**
- Mount/unmount lifecycle: controller created once, destroyed on unmount (no leaked listeners — assert via controller registry or spies).
- Exposed API works (`wrapper.vm.open()` opens the dialog); events re-emitted with payloads.
- SSR: `renderToString` succeeds for every recipe component (no DOM access at render time); hydration-safe markup (client mount over SSR output doesn't warn).

**Acceptance criteria**
- [ ] Every recipe wrapped, typed, SSR-tested.
- [ ] A demo Vue SFC page (in package examples) uses ≥ 5 components against the real CSS bundle — manually verified, committed.
- [ ] README covers Inertia/SSR usage (Formery's stack).

---

### 0.6-14 · Patterns: `wizard` + `form-page`

**Depends:** 0.6-01; pairs with 0.6-02/0.6-04 · **Ref:** §B3 · **Touches:** `registry/patterns/{wizard,form-page}/`

`wizard`: multi-step form pattern composing stepper + card + field-group + button —
step visibility via `data-state`, driven by `l-data` (progress, back/next, per-step
validation hook that `faqir-validate` plugs into). `form-page`: the canonical
schema-rendered form page — the reference output shape for `@faqir-ui/forms`.

**Tests**
- Wizard behavior (happy-dom + faqir-core): next/back transitions, step indicator states, invalid step blocks advance (with faqir-validate), completion event.
- Both reference pages: audit-clean, axe-clean, in the visual suite.
- `form-page` markup exactly matches what `@faqir-ui/forms` emits for its reference schema (shared golden fixture — drift between pattern and generator fails).

**Acceptance criteria**
- [ ] Wizard fully declarative: zero custom JS in the reference page.
- [ ] `form-page` is the pinned golden target for `@faqir-ui/forms` output.
- [ ] Manifests document composition (which components each pattern uses).

---

# Phase v0.7 — Ecosystem

---

### 0.7-01 · `@faqir-ui/react` codegen + primitives

**Depends:** 0.6-12 (codegen architecture) · **Ref:** §11.3 · **Touches:** new `packages/react/`, bindings codegen React target

Add the React target to the bindings codegen: primitives as function components with
`forwardRef`, variant props as TS unions, state props → `data-state`, children/named
slot props → `data-part` structure. RSC-compatible (no client directive on primitives).
Same drift guard as Vue.

**Tests**
- Codegen snapshots; generated TS compiles (`tsc` in package).
- @testing-library/react: DOM attribute correctness across prop matrices; refs forward to the root element.
- RSC smoke: primitives importable in a server-component context (no hooks/client-only APIs) — assert no `"use client"` in primitive output.
- CI regeneration-drift check.

**Acceptance criteria**
- [ ] All primitives generated, typed, RSC-safe.
- [ ] Shared codegen core between Vue/React targets (no forked manifest-walking logic).
- [ ] Drift check wired in CI.

---

### 0.7-02 · `@faqir-ui/react` recipes + hooks

**Depends:** 0.7-01 · **Ref:** §11.3 · **Touches:** `packages/react/`

Recipe wrappers: `"use client"`, `useEffect` mount/destroy of controllers,
`useImperativeHandle` exposing controller APIs, controller events → React callback
props. `useFaqirController(ref, "dialog")` as the low-level escape hatch.

**Tests**
- Lifecycle: controller created/destroyed with component; StrictMode double-effect safe (create/destroy/create doesn't leak or break).
- Imperative handles work (`ref.current.open()`); event callbacks receive payloads.
- `useFaqirController` attaches to an arbitrary element ref.
- SSR: `renderToString` clean for all recipe wrappers.

**Acceptance criteria**
- [ ] StrictMode-safe (explicitly tested — the classic pitfall).
- [ ] `"use client"` only on recipe wrappers, never primitives.
- [ ] Example page with ≥ 5 components verified against the real CSS bundle.

---

### 0.7-03 · Recipes: `context-menu` + `menubar`

**Depends:** 0.3-04 · **Ref:** §B2 · **Touches:** `registry/recipes/{context-menu,menubar}/`

`context-menu`: right-click menu reusing dropdown internals (positioning at pointer,
Escape/outside-click close, keyboard nav, prevented native menu). `menubar`: horizontal
menu with submenus per WAI menubar pattern (arrow-key orientation switching, submenu
open on ArrowDown/Enter, roving tabindex). Shared menu-navigation core factored from
dropdown — no third copy of arrow-key logic.

**Tests**
- context-menu: opens at pointer coordinates on contextmenu event, native menu suppressed, full keyboard nav, closes correctly.
- menubar: horizontal arrows move top-level, vertical arrows enter/navigate submenus, Escape closes submenu then menubar focus, roving tabindex correct.
- Shared-core unit tests; dropdown regression suite still green.

**Acceptance criteria**
- [ ] One shared menu-nav implementation across dropdown/context-menu/menubar (assert by module structure, not vibes).
- [ ] WAI-ARIA menubar pattern keyboard contract fully asserted.
- [ ] Both audit-clean with manifests.

---

### 0.7-04 · Recipe: `tree-view`

**Depends:** 0.3-04 · **Ref:** §B2 · **Touches:** `registry/recipes/tree-view/`

Hierarchical list per WAI tree pattern: `role="tree/treeitem/group"`, `aria-expanded`,
`aria-level/setsize/posinset`, keyboard (arrows expand/collapse/traverse, Home/End,
typeahead optional), selection events, lazy-children hook (emit expand event; app or
`l-source` provides children).

**Tests**
- Full keyboard traversal matrix over a 3-level fixture tree.
- ARIA attributes correct at every level; expanded state round-trips.
- Selection (single) events; disabled items skipped in nav.

**Acceptance criteria**
- [ ] WAI tree keyboard contract complete and asserted.
- [ ] Works with keyed `l-for`-rendered nodes (integration test — trees are the stress case for 0.3-05/06).
- [ ] Audit-clean reference page with nested fixture.

---

### 0.7-05 · Recipe: `file-upload`

**Depends:** 0.3-04 · **Ref:** §B2 · **Touches:** `registry/recipes/file-upload/`

Drag-drop zone + file list. **No fetch** — emits events with the FileList; upload is app
code (this keeps the `no-fetch` audit rule honest). Keyboard/SR path via the real
`<input type="file">`; drag states in `data-state`; accept/size validation with
rejection reasons; remove-from-list.

**Tests**
- Drop simulation → files event with correct payload; dragover/leave state transitions.
- Accept filter + max-size rejection produce per-file rejection events with reasons.
- Hidden input path: change event equivalent to drop; label/click activation.
- Audit: recipe passes `no-fetch` (it must — assert explicitly).

**Acceptance criteria**
- [ ] Zero network code (audit-asserted).
- [ ] Fully operable without drag-and-drop (input fallback tested).
- [ ] Events documented in manifest for agent consumption.

---

### 0.7-06 · Recipes: `tag-input` + `toggle-group`

**Depends:** 0.3-04, 0.4-01 (chip) · **Ref:** §B1–B2 · **Touches:** `registry/recipes/{tag-input,toggle-group}/`

`tag-input`: multi-value input composing chip + combobox behaviors — type + Enter adds,
Backspace on empty removes last, chip dismiss buttons, optional suggestions list,
duplicates policy. `toggle-group`: single/multi select with roving tabindex,
`aria-pressed`/radio semantics per mode.

**Tests**
- tag-input: add/remove via keyboard and pointer, duplicate handling, value array exposed to `l-model`, suggestion selection.
- toggle-group: roving tabindex arrows, single mode enforces exclusivity, multi mode toggles independently, correct ARIA per mode.

**Acceptance criteria**
- [ ] tag-input reuses chip CSS (no duplicated styles) and combobox listbox behavior where sane.
- [ ] Both keyboard-complete and audit-clean.
- [ ] `l-model` binding works for both (array value / selection value).

---

### 0.7-07 · Recipe: `carousel`

**Depends:** 0.3-04 · **Ref:** §B2 · **Touches:** `registry/recipes/carousel/`

Scroll-snap based — CSS does the sliding; JS only for prev/next buttons, dot
indicators, current-slide tracking (IntersectionObserver or scroll math), and a11y
announcements (`aria-live` slide position, `aria-roledescription="carousel"`). Respects
reduced motion for smooth-scroll behavior.

**Tests**
- Button nav scrolls to correct slide (mock scrollTo, assert targets); dots reflect and set current slide.
- Boundary behavior (first/last) per loop-or-stop contract.
- Announcement region updates on slide change; reduced-motion uses instant scroll.

**Acceptance criteria**
- [ ] Works with JS disabled as a plain scroll-snap strip (progressive enhancement — reference page proves it).
- [ ] JS stays under a stated small budget (it's buttons + dots only).
- [ ] Audit-clean; manifest documents parts (viewport, slide, controls, dots).

---

### 0.7-08 · Patterns: `pricing` + landing kit

**Depends:** phase v0.4 primitives · **Ref:** §B3 · **Touches:** `registry/patterns/{pricing,hero,feature-grid,site-footer}/`

Composition-only patterns (no new JS): `pricing` (grid/card/badge/button/separator,
highlighted-tier variant), `hero`, `feature-grid` (icon integration), `site-footer`.
Promote `faqir scaffold landing-page` to compose these maintained patterns instead of
synthesizing ad-hoc markup.

**Tests**
- All four reference pages: audit-clean, axe-clean, visual suite, both schemes, ≥ 2 themes.
- Scaffold test: `landing-page` output now built from the patterns (assert structure) and passes audit.
- Responsive assertions: grid column behavior at breakpoints (CSS-level).

**Acceptance criteria**
- [ ] Zero new JavaScript across all four.
- [ ] `faqir scaffold landing-page` uses the patterns (no more ad-hoc synthesis).
- [ ] Manifests document composition + slot expectations for agents.

---

### 0.7-09 · Patterns: `stats-dashboard` + `inbox`

**Depends:** phase v0.4 · **Ref:** §B3 · **Touches:** `registry/patterns/{stats-dashboard,inbox}/`

`stats-dashboard`: stat + grid + card + table reporting page. `inbox`: list-detail
split view (stack/avatar/badge/tabs/empty-state) with responsive collapse to
single-pane + back navigation; selection state via `l-data`, detail content
`l-source`-ready.

**Tests**
- Reference pages through the full gate stack (audit/axe/visual, themes, schemes).
- inbox: selection swaps detail pane (faqir-core integration test); mobile collapse behavior (matchMedia mock); empty state renders when no selection.
- stats-dashboard: composes the enhanced table (formats, tfoot) correctly.

**Acceptance criteria**
- [ ] inbox works declaratively with `l-data`/`l-for`/`l-source` — zero custom JS in reference.
- [ ] Both responsive with logical properties throughout.
- [ ] Manifests document data-shape expectations (what an agent binds where).

---

### 0.7-10 · Themes: `terminal`, `glass`, `soft`

**Depends:** 0.4-12 · **Ref:** §C3 · **Touches:** `registry/themes/`

`terminal`: phosphor green/amber on near-black, mono type, sharp corners (dark-primary;
declare scheme honestly in manifest). `glass`: translucent surfaces via `color-mix` +
`backdrop-filter` with solid fallbacks (`@supports`). `soft`: pastel, large radii,
consumer/health. Full coverage + manifests + previews; theme count reaches 10.

**Tests**
- Coverage matrix, manifest consistency, `contrast-tokens` audit — all three themes (glass translucency must still pass contrast on the *resolved* backgrounds; document the computation approach).
- `@supports` fallback rules present for glass (CSS assertion).
- Visual suite extended (automatic via 0.4-23 matrix).

**Acceptance criteria**
- [ ] All three pass every theme gate; visual baselines added.
- [ ] Glass degrades gracefully without backdrop-filter (fallback tested).
- [ ] Mood tags meaningful for agent selection (`terminal` ≠ `soft` in manifest moods).

---

### 0.7-11 · Density mode

**Depends:** — · **Ref:** §B6 · **Touches:** new `registry/tokens/density.css`, context generator, docs

`[data-density="compact"]` on any container remaps spacing/height alias tokens
(`--control-height-*`, `--space-*` multiplier) for its subtree. Pure CSS, zero JS, no
new protocol attribute. Documented in context.json so agents discover it.

**Tests**
- Applying `data-density="compact"` changes resolved control-height/spacing custom properties for descendants but not siblings (happy-dom computed-style checks).
- Nesting: inner `data-density="comfortable"` (or default) resets — subtree scoping honest.
- Visual suite: one dense reference page added; context.json includes the density documentation block.

**Acceptance criteria**
- [ ] Implemented 100% in `tokens/density.css` — grep-proof no JS touches it.
- [ ] The five-attribute protocol untouched (no audit rule changes for a sixth attribute).
- [ ] Dense forms/tables visually verified in ≥ 2 themes.

---

### 0.7-12 · Dev overlay + `Faqir.inspect` + dev build

**Depends:** 0.3-03 · **Ref:** §A6 · **Touches:** engine source, `faqir-core.dev.js` build target, `src/commands/dev`

`Faqir.inspect(el)` → `{ scope, directives, controller, state }` snapshot, exposed also
at `window.__FAQIR_DEVTOOLS__`. `faqir dev` injects a keyboard-toggled overlay panel
visualizing scopes + `data-state` live. `faqir-core.dev.js` build: expression errors
with offending element outerHTML, unkeyed-reorder warnings, unknown-directive warnings,
`l-html` notices — production file stays lean.

**Tests**
- `inspect` snapshot correctness on a fixture page (scope values, controller identity, directive list).
- Dev build emits each warning class on trigger fixtures; production build emits none of them (parallel assertions).
- Overlay: injected only by `faqir dev` (never in user bundles), toggles, renders scope data.

**Acceptance criteria**
- [ ] Production `faqir-core.min.js` byte-free of dev-only strings (size + grep test).
- [ ] Agents can read `window.__FAQIR_DEVTOOLS__` (documented shape, stable keys).
- [ ] Dev-build size unconstrained but reported.

---

### 0.7-13 · Docs site scaffold

**Depends:** 0.5-07, 0.7-08 · **Ref:** §13 · **Touches:** new `site/` (a Faqir project), `scripts/build-docs.mjs`

The docs site is a Faqir project with no build step at runtime — pages generated at
authoring time from manifests: per-component pages (anatomy tree, variant matrix with
live examples, state demos, a11y table, token list), token reference, navigation. This
session: generator + component pages + navigation shell. Static-hostable directory
output.

**Tests**
- Generator: every registry component gets a page; page content matches its manifest (spot-assert anatomy/variants for fixtures).
- Every generated page passes `faqir audit` + axe (the site dogfoods the gates).
- Regeneration idempotent; broken-link check across generated nav.

**Acceptance criteria**
- [ ] `bun run build:docs` → static dir; served with any static server, all pages functional.
- [ ] Site uses only registry components + tokens (it *is* the proof — audit-enforced).
- [ ] Adding a component to the registry adds its page with zero site edits.

---

### 0.7-14 · Docs site: audit playground + theme gallery

**Depends:** 0.7-13 · **Ref:** §13 · **Touches:** `site/`, compiled browser audit bundle

Interactive playground: textarea + preview iframe + **live in-browser audit** (compile
the zero-dep audit engine to a browser bundle) showing findings as you type. Theme
gallery with instant switcher — one `data-theme` swap across the demo (the demo is the
feature). 

**Tests**
- Browser audit bundle: same findings as the CLI for a shared fixture set (parity test, node-side against the bundle).
- Playground wiring: input → findings list updates (happy-dom or Playwright); malformed input doesn't crash the page (fuzz corpus sample).
- Theme switcher: `data-theme` swap restyles without reload (Playwright).

**Acceptance criteria**
- [ ] Audit engine runs fully client-side (no server), bundle size reported.
- [ ] Finding parity CLI ↔ browser proven by shared fixtures.
- [ ] Gallery shows all 10 themes, light+dark, instant switching.

---

### 0.7-15 · Docs site: agent surfaces + hosting artifacts

**Depends:** 0.7-13, 0.5-06 · **Ref:** §13, §8.2, §9.2 · **Touches:** `site/`

Serve `llms.txt` + `llms-full.txt` at the site root (full-registry variants);
`manifest.schema.json` and `registry-index.json` at stable URLs; copy-for-agents button
on every example (copies markup + the CDN two-tag preamble + SRI). Deploy config for
static hosting (Cloudflare Pages or equivalent — config in repo, deployment itself is a
human step).

**Tests**
- Build outputs include all four machine files at documented paths; schema/index validate.
- Copy-for-agents payload: valid standalone HTML (paste-and-run — assert it parses and references correct pinned CDN URLs).
- Stable-URL paths asserted in a site-contract test (breaking a path fails CI).

**Acceptance criteria**
- [ ] All agent-facing URLs stable and CI-guarded.
- [ ] Copied snippets are runnable standalone (audit-clean, correct preamble).
- [ ] Deploy documentation complete; site deployable by running one documented command.

---

# Phase v1.0 — The Standard

---

### 1.0-01 · Protocol spec 1.0 + manifest schema 1.0 freeze

**Depends:** all prior phases substantially complete · **Ref:** §15 · **Touches:** `FAQIR-SPEC.md` (or new `SPEC-1.0.md`), `manifest.schema.json`, `site/`

Publish the frozen protocol spec (five attributes, their value grammars, `data-motion`,
`data-theme`, `data-density` as sanctioned token modifiers) and manifest schema 1.0
(explicit `schema_version: "1.0"`, changelog from 0.x). Freeze means: additive changes
only until 2.0, documented amendment process.

**Tests**
- Every registry manifest validates against schema 1.0.
- Spec examples extracted and audit-verified (every code block in the spec passes `faqir audit` — executable documentation).
- Version constants consistent across CLI (`src/version.ts`), schema, spec, and site.

**Acceptance criteria**
- [ ] Spec + schema published at stable site URLs with version in the path.
- [ ] Amendment process written (what requires a major version).
- [ ] Zero validation or spec-example failures.

---

### 1.0-02 · `faqir-core.d.ts` + security guidance

**Depends:** 0.7-12 · **Ref:** §A6 · **Touches:** `packages/core/faqir-core.d.ts`, `docs/security.md`

Finalize TypeScript declarations for the `Faqir` global: `data/store/directive/magic/
plugin/controller`, `inspect`, plugin-added magics, controller API shapes. Write the
security posture doc: `new Function` ⇒ `'unsafe-eval'` CSP requirement, `l-html`
unsanitized by design, guidance for CSP-restricted environments, threat model for
generated-trusted vs user-supplied markup.

**Tests**
- Type tests (`tsd` or `tsc` fixtures): correct usage compiles, misuse fails (assert both directions on ≥ 10 API surface points).
- `.d.ts` matches runtime: reflective test enumerating actual `Faqir` keys vs declared.
- Docs lint: security doc linked from README + generated context output.

**Acceptance criteria**
- [ ] `Faqir` fully typed including plugin extension points.
- [ ] Runtime/declaration drift test in CI.
- [ ] Security doc reviewed against §A6's list — every stated risk covered.

---

### 1.0-03 · Migration notes + upgrade path

**Depends:** 0.5-05, 1.0-01 · **Ref:** §15 · **Touches:** `docs/migration-1.0.md`, registry `changes` entries

Write v0.x → 1.0 migration notes covering every breaking change shipped since v0.2.4
(collect from manifest `changes` arrays — they were maintained for exactly this).
Verify `faqir upgrade` carries a real v0.2.4-era project to 1.0: build the fixture,
run the upgrade, resolve expected conflicts, audit clean.

**Tests**
- End-to-end upgrade test: pinned v0.2.4-style fixture project → `faqir upgrade` → audits clean, controllers function (smoke through faqir-core).
- Migration doc completeness: every `breaking: true` changelog entry across the registry appears in the doc (generated cross-check).
- Field-group vocabulary migration (0.6-01) specifically exercised.

**Acceptance criteria**
- [ ] A real old project upgrades successfully with documented, bounded manual steps.
- [ ] No undocumented breaking change exists (test-enforced via changelog cross-check).
- [ ] Doc published on the site.

---

### 1.0-04 · Release engineering + launch

**Depends:** 1.0-01…03, 0.3-12 · **Ref:** §10.4, §15 · **Touches:** `scripts/release.mjs`, `.github/workflows/`, launch checklist doc

Extend `scripts/release.mjs` to a workspace-aware release: version bump across the
package family, build all dists, size-budget check, per-package `npm publish` (with
`--provenance` once CI-published), git tag, GitHub release with generated notes.
Dry-run mode mandatory. Write the launch checklist (docs deploy, MCP directory
submissions, Show HN, awesome lists) as a doc — execution is human.

**Tests**
- Release script dry-run: correct version propagation to every package.json, build order respected, publish commands assembled correctly (asserted, not executed).
- Size budgets + full gate suite (tests, audit, axe, visual, print-visual) wired as release preconditions — a failing gate aborts the dry-run.
- Rollback documented and its steps sanity-tested where automatable.

**Acceptance criteria**
- [ ] One command dry-runs the entire multi-package release with a full report.
- [ ] All §17 quality gates green at release point: 0 registry audit findings, 0 axe violations, visual suites stable, 100% recipe controller coverage, budgets green.
- [ ] Launch checklist complete; 1.0 tagged only after every box above.

---

## Follow-up tasks (added by sessions per protocol rule 4)

| ID | Task | Origin | Status |
|----|------|--------|--------|
| — | *(none yet)* | | |
