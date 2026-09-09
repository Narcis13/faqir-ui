# FAQIR 1.0 — Readiness Assessment and Remediation Plan

**Date:** 2026-09-09 · **Assessed at:** `163dc96` · **Method:** ten parallel audit
lanes (engine, CLI, controllers, CSS/a11y, packages, release/CI, docs, tests,
security, end-to-end dogfood), every finding reproduced before it was recorded.

---

## Verdict

**Not shippable as 1.0 at `163dc96`.** Seven of ten lanes returned BLOCKED
independently, and the blockers are not concentrated in one immature corner —
they sit on the engine's primary write path, the CLI's primary agent contract,
the published package entry points, and the release path itself.

That is the accurate headline, and it undersells the project. The architecture
underneath is genuinely strong and most of what follows is shallow: closed-grammar
validation, string-splicing, a missing `try`, an unbuilt package, an ungated
generated file. The registry self-audits to **zero findings** across 87 fragments.
Nine of ten generated artifacts reproduce byte-identically. The fuzzer survived
100,000 fresh generations. The parsers are ReDoS-free by construction and linear
on 1.5 MB of adversarial input. `l-for` uses a real LIS reconciler. The a11y gate
runs 3,013 axe cases green. This is a codebase with excellent bones and a
pre-1.0 hardening debt, which is exactly what a pre-1.0 audit should find.

**Estimated distance to a defensible 1.0: two to three focused weeks**, most of
it in Wave 2 and Wave 3 below.

### The through-line

One theme connects the most damaging findings, and it is worth stating on its own
because it is the product thesis:

> **Faqir's failures are silent, and silence is the one failure mode an agent
> cannot recover from.**

An incorrect Tailwind class renders visibly wrong. A React error throws a red
overlay. Faqir's worst failures — `l-validate` doing nothing, `data-span-lg`
auditing clean and having no effect, a `<template l-if>` scope that never forms,
an engine that stops evaluating because one component threw — produce a page that
looks plausible, passes `faqir audit` 100% clean, and is broken. The dogfood lane
built a working admin screen and still concluded: *an agent without a browser
would have shipped three of these broken and reported success in good faith.*

A framework marketed as agent-native currently has a **worse error-surfacing
story than the incumbent it replaces**. Fixing that is more important than any
single bug in this document, and it is the criterion Wave 2 is organized around.

---

## What has already been fixed in this session

Eight blockers, each with a regression test verified to fail without its fix
(mutation-seeded and observed red).

| # | Blocker | Fix | Tests |
|---|---|---|---|
| 1 | `l-model` compiled the input's value as JavaScript — code execution from typing, from an `<option value>`, and silent corruption of any backslash | values route through a reserved `$modelValue` scope slot; no user data reaches the compiler. Also removes the unbounded per-keystroke `Function` cache (finding 8) | `tests/core/l-model-safety.test.ts` (11) |
| 2 | One component with incomplete markup aborted bootstrap and blanked the entire page | `initController()` wraps all four mount sites; failure is contained **and reported** | `tests/core/controller-isolation.test.ts` (6) |
| 3 | `--json` truncated at the 64 KiB pipe buffer on **all 22 commands** | `writeSync(1, …)` in `emitJSON` + `flushEnvelope` | `tests/build/dist-cli.test.ts` (2, on the Node path) |
| 4 | Hostile registry → arbitrary file write anywhere on disk | closed grammar for names and paths + containment assertion at the write site | `tests/utils/registry-index.test.ts` (17) |
| 5 | `faqir dev` served any file on disk, bound to every interface | resolved-path containment; loopback default with explicit `--host` | `tests/commands/dev.test.ts` (2) |
| 6 | `repair --dry-run` and `--help` mutated files | args actually read; `applyRepairs(…, { dryRun })` | `tests/audit/repairer.test.ts` (3) |
| 7 | `doctor` exited 0 on a broken project | `process.exitCode = 1` on failures | `tests/commands/doctor.test.ts` (2) |
| 8 | No `LICENSE` anywhere; six packages declared MIT | MIT at root + all five packages, verified present in `npm pack` | — |

Also: `audit --help` now prints help instead of running a full audit;
`packages/core/cdn.json` regenerated (see W1-1); README corrected (see the
Documentation section).

---

## Wave 1 — Must land before any 1.0 tag

Small, well-understood, high-consequence. Est. **2–3 days**.

### W1-1 · Gate `packages/core/cdn.json` — the CDN path is broken today
**Severity: critical.** All 15 SRI hashes in the committed file were stale (two
commits behind). `src/generator/docs.ts:1050,1069-1076` emits them verbatim as
`integrity="sha384-…"` into every copy-paste CDN snippet on the docs site. SRI is
fail-closed: a browser given a non-matching hash **refuses to execute the
resource entirely** — no CSS, no engine, a blank page, one console line. This is
the "two tags, no build step" path the product leads with.

It is the only generated artifact in the repo with no gate. The test that would
catch it, `tests/generator/docs-agents.test.ts:344-352`, is written vacuous in CI:
line 348 is `if (!existsSync(sriPath)) return;`, `packages/core/dist/` is
gitignored, and CI never runs `build:core-package`.

**Fix.** Regenerated already. Add `check:core-package` mirroring the `--check`
pattern of the other five generators, wire it into `ci.yml`'s `registry-audit`
job (~0.4s), and run `build:core-package` in CI before `bun test`. Determinism is
confirmed — two clean-tree runs are byte-identical. Document the caveat alongside
`check:audit-browser`: the bundle comes from `bun build --minify`, so the gate
binds `cdn.json` to the pinned `BUN_VERSION` and a Bun bump requires a
regenerate-and-commit.

### W1-2 · `faqir conform` corrupts valid HTML and valid JavaScript
**Severity: critical.** `conform.ts:109` rebuilds every attribute as
`` `${name}="${value ?? ""}"` `` — hardcoded double quotes, no escaping — and
`conform.ts:88`'s `TAG_WITH_ATTRS_RE` is a naked global regex applied to the whole
file, so it also rewrites inside `<script>`/`<style>`/`<textarea>`. Reproduced:

```
<div l-data='{ "msg": "hi" }'>       →  <div l-data="{ "msg": "hi" }">      ← broken
<p title='He said "no"'>             →  <p title="He said "no"">            ← broken
<script> "<span data-part='x'>" </script>  →  SyntaxError: Unexpected identifier
```

Exit 0, `✓ 2 file(s) updated`. `l-data` is the framework's own primary directive,
so this hits ordinary Faqir pages — the dogfood lane's finished page is saturated
with single-quoted strings inside double-quoted directive expressions and would
be destroyed by one `conform` run.

**Fix.** Use the tokenizer that already exists: `src/parser/html-tokenizer.ts:47`
exports `RAW_TEXT_ELEMENTS` and handles quoted `>` correctly. Preserve the
original quote character; escape when the value contains the delimiter. Two
related defects to fix together: `conform.ts:88`'s `[^>]*?` silently skips any tag
containing `>` inside an attribute value (e.g. `l-if="a > b"`), and
`conform.ts:257-259` walks `**/*.html` from cwd with only `node_modules`/`.faqir`
excluded, so it rewrites `dist/`, `vendor/` and users' `.orig` backups. Add
`--include`/`--exclude`. *Scope: conform only — `repair` does not share this code.*

### W1-3 · Build `@faqir-ui/react` and `@faqir-ui/vue`
**Severity: critical.** Both point `main`/`module`/`types`/`exports` at
`./src/index.ts`; the tarballs contain 108 and 110 `.ts` files and zero `.js` or
`.d.ts`. Reproduced four ways: Node 18 `ERR_UNKNOWN_FILE_EXTENSION`, Node 24
`ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`, `tsc --moduleResolution node16`
**175 / 146 errors** that `skipLibCheck` cannot suppress (it skips `.d.ts`, these
are `.ts`), and a stock `next build` failing with `Module parse failed`.

Vite works, and Next works *with* `transpilePackages` — which confirms the SSR
story underneath is sound and neither README mentions.

**Fix.** Add tsc/tsup emitting `dist/*.js` + `dist/*.d.ts`, preserve `"use client"`
directives, repoint `exports`, add `prepublishOnly` (neither package has one), and
gate with a packed-tarball consumer test under `node16`.

### W1-4 · `@faqir-ui/core`'s documented import is broken
**Severity: critical.** `packages/core/README.md:64` and `faqir-core.d.ts:21` both
document `import Faqir from "@faqir-ui/core"`. At runtime: `SyntaxError: … does
not provide an export named 'default'` (the UMD wrapper takes the global branch
and exports nothing under `"type": "module"`). At type level: `TS1192` under both
`node16` and `bundler`, because `faqir-core.d.ts:31` uses `export =` in an
ESM-classified file — the classic FalseCJS shape.

The type fixture missed it because `tests/fixtures/types/tsconfig.json:29` maps
the package through `paths`, which bypasses real package resolution. The same file
passes via `paths` and fails through `node_modules` — the one shape every consumer
uses is the one shape untested.

**Fix.** Emit a real ESM wrapper (`export default` + named exports) as the
`import` target; keep UMD for `<script>`/CDN; replace `export =` with
`export default` in a per-condition `.d.ts`; repoint the fixture at a packed,
installed tarball. Also either ship a real `.cjs` for the `"require"` condition
(`package.json:15`) or delete the key — it currently throws `ERR_REQUIRE_ESM` on
Node 18 and 20, most of the range `engines` promises.

### W1-5 · `import "faqir-ui-cli"` kills the importing process
**Severity: high.** `package.json:9-11` exports `./dist/faqir.mjs`, whose top level
calls `main()` (`src/index.ts:83`) — which parses the **host's** `process.argv` and
exits it. **Fix:** delete the `exports` map (a bin-only package needs none) or
point `.` at a programmatic API with no top-level call.

### W1-6 · Registry `toast.add()` is an unescaped `innerHTML` sink
**Severity: critical.** `toast.js:43-57` concatenates `message`, `icon` and
`actionLabel` into a string assigned to `innerHTML`. `toast.add({ message:
err.message })` — or any echoed username — is an XSS. `docs/security.md` §4 names
`l-html` as the only unsafe surface.

**Fix.** Build nodes with `createElement` + `textContent`, the pattern already used
at `file-upload.js:124-149` and `tag-input.js:51-68`. If markup in `icon` is
deliberate, split it into an explicit opt-in `iconHtml`.

### W1-7 · Correct `docs/security.md`
**Severity: high (accuracy).** §7 states remote installs are "verified against the
per-file SHA-256 … so an integrity failure leaves no partial write." That sentence
reassures the reader about precisely the surface that was exploitable: the hashes
are authored by the same host that authors the bytes, so they establish integrity,
never authenticity. State the trust model honestly. Add the two surfaces the
document is silent on — the CLI's remote-registry write path and `faqir dev` — and
the prompt-injection position (W3-6).

*(The §4 `l-model` row is now correct as written, following this session's fix.)*

---

## Wave 2 — Required for the agent-native claim to be true

This is the wave that matters most. Est. **1 week**.

### W2-1 · Fix the three silent runtime failures
All three found by building a real page; none visible to any tool.

- **`l-validate` is completely inert.** Seven configurations tested — manifest
  markup, docs markup, with/without `novalidate`, with/without `l-data`, plugin
  before/after core, and the official `faqir bundle --js` path. Every one: no
  `data-state="invalid"`, no error text, no `aria-invalid`, **no console output**.
  Premise verified sound (`form.checkValidity() === false`, the directive is
  present, `inspect()` sees it); a hand-registered directive under the same name
  *does* run. It simply does nothing.
- **`l-effect` on a scope root never runs.** Works on a child. `l-init` on a scope
  root works. The docs steer you into the broken placement by grouping
  "`l-init`, `l-effect`" and documenting `l-init` as belonging "on a scope root,
  beside `l-data`".
- **`drawer` never finalises `closing` → `closed`.** Verbatim canonical markup, no
  reactive directives. Escape ✓, overlay click ✓, programmatic `close()` ✓,
  **the close button ✗** — the one control the manifest marks `required` and lists
  under DO-NOT-REMOVE. Trace: a `transitioncancel` on `background-color` breaks
  the controller's bookkeeping, leaving the overlay covering and blocking the page.
  *Fix: filter `transitionend` to the panel's `transform`, plus a duration
  fallback.*

**Gate:** a browser smoke test for every plugin directive, and for every recipe's
full open/close cycle through **each** documented path. The drawer bug survives to
1.0 precisely because only the non-button paths are covered.

### W2-2 · Close the audit's silent-failure gaps
The audit is strong on static attribute vocabulary and blind to everything else.
Confirmed silent (no error, no warning, nothing):

| Mistake | Status |
|---|---|
| `data-span-lg="6"` — invented responsive suffix on a non-responsive prop | **silent** |
| `data-gap="7"` — not in the enum `0,1,2,3,4,6,8,10,12,16` | **silent** |
| `data-variant-md="ghost"` — SKILL.md says protocol attributes "never take a suffix" | **silent** |
| `l-tex="v"` — misspelled directive name | **silent** |
| `<span data-part="title">` where the manifest requires `<h3>` | **silent** |
| `@click.debounce.500ms` — the docs' own documented footgun | **silent** |

Each is a case where an agent's natural guess fails with nothing to trigger a
retry. Add: layout-attribute enum validation, unknown-`data-*`-on-known-component,
unknown `l-*` directive names, part element types, and tier suffixes on the five
protocol attributes. Overlaps tracked rows 0.8-15 and 0.8-17.

### W2-3 · Make `faqir audit` reach green on a pristine project
`faqir init` + `faqir add switch dashboard-shell`, nothing authored: **2 errors and
6 warnings, exit 1** — all in the framework's own vendor CSS (`switch.css`
hardcodes `rgba(`; `dashboard-shell.css` references five undefined `--shell-*`
tokens). An agent gating on exit code can never reach green and learns to ignore
the tool. Either fix the vendor CSS or separate vendor findings from authored ones
in the exit-code decision. **Both, ideally** — the undefined tokens are a real bug.

### W2-4 · Surface the controller API that already exists
For 29 JS-backed recipes, **no surface documents a single method**. `faqir explain
toast --json` returns ten keys and no `api`. `$ui.` appears once in 228 KB of skill
docs. The data already exists as `// @ui:provides sort sortBy … destroy`
annotations in every recipe source and is inlined into the shipped `faqir-core.js`
— no doc surface exposes it. **One build-script change removes this entire class
of friction.**

### W2-5 · Add a "Your first page" block to `SKILL.md`
Grep for `DOCTYPE|rel="stylesheet"` across `SKILL.md` + all six references
(228 KB): **0 hits**. Across `llms.txt` + `llms-full.txt` (2,368 lines): **0 hits**.
An agent cannot learn the page `<head>` from any agent-facing surface. Six lines
fixes it, and it gates everything else. Related: `faqir scaffold` emits a page
whose header comment says the components "need `ui/core/faqir-core.js` to open" and
never gives the tag — emit it.

### W2-6 · Give the framework a cross-component command
`$ui` resolves from the scope root only; nothing can say "open that drawer".
Opening a detail drawer from a table row — the most common admin pattern there is —
required an invented global-store + `l-effect` handshake, ~15 lines of ceremony,
and is where the dogfood lane hit W2-1's `l-effect` bug. Add `$ui('#id').open()` or
controller-addressed `$dispatch`.

---

## Wave 3 — Correctness and accessibility debt

Est. **1 week.** **Landed** — what follows is the diagnosis as written; the notes
below record what each item became.

> **W3-1** Cleanup ownership now follows the `__faqirCleanups` array rather than
> the scope object, and `l-if`/`l-for` register their disposer on the anchor
> COMMENT they leave behind (`destroyScope` walks child nodes, so it can see
> one). `l-data` on a cloned top node goes through `initTree`, so `l-source`
> inside an `l-if` fetches. `l-model` unbinds its listener, `l-if` removes every
> node it inserted, `$watch` disposers are registered, teleported subtrees own
> their teardown, `l-cloak` comes off at bind time and off anything the observer
> is handed, and a second `Faqir.start()` re-binds nothing. `apiSource()` gained
> `destroy()` (abort + latch + stop polling), wired through a `__faqirTeardown`
> hook the engine runs on scope teardown — and 37 tests, from zero.
> `tests/core/lifecycle.test.ts` is the per-leak suite.
>
> **W3-2** Escape stops propagating in all eight places (`menu-navigation`
> covers dropdown/context-menu/menubar; the menubar opts out when it has nothing
> to dismiss, so it does not swallow a keystroke that is not its own). Twelve
> controllers dismiss on `destroy()`. Four name the missing part and return an
> inert API instead of throwing. `tests/recipes/overlay-family.test.ts` asserts
> all three across the family.
>
> **W3-3** Every `--color-ring` is opaque (4.03:1 minimum, from 1.37); the
> `contrast-tokens` rule gained a non-text half at SC 1.4.11's 3:1 that treats a
> translucent ring as a finding, and the two forgotten pairs. The checkbox tick
> is a mask painted in `--color-primary-fg`; the stepper's `white` is gone.
> `switch`, `checkbox`, `radio`, `progress`, `tabs` and `slider` have
> forced-colors blocks. The switch thumb and the select chevron are
> direction-aware. `settings-page`, `sidebar` and `dashboard-shell` fit 320px,
> and `narrow-fit` holds them there. Menu items get their focus ring back.
>
> **W3-4** `select-custom`, `combobox`, `command-palette` and `tag-input`
> maintain `aria-activedescendant`; `select-custom` submits through a hidden
> input when the root is named. The four "GAP" tests now assert the fix.
>
> **W3-5** The layout ratchet ratchets per page. `json-output.test.ts` runs the
> compiled bundle on Node in a real project and asserts key sets. `NodeGlob` is
> tested against `Bun.Glob` (which found a divergence). `trace --json` sorts.
> `faqir dev` has a Node smoke, and the four vacuous tests assert something.
> `field-wiring` has one invalid-state grammar. The print filter and the
> visual-baseline workflow are both held by meta-tests.
>
> **W3-6** Third-party manifest text is labelled where it is emitted — a
> provenance block in every context surface, a marker on each third-party
> section, and `provenance`/`trust` keys in `context.json`. `docs/security.md` §9
> says what that does and does not buy.

### W3-1 · Engine lifecycle (four confirmed leaks)
- **`l-if`/`l-for` disposers are silently dropped** (`engine.js:1516`, `:1756`;
  cause `:1463`/`:1632`): `addCleanup` runs *after* `el.remove()`, so
  `findScopeRoot` resolves to the detached template and the guard drops the
  disposer. `Faqir.destroy()` does not stop them — a list kept growing in the live
  document after teardown. Contradicts `faqir-core.d.ts:706`. *Fix: capture the
  owner before detaching.*
- **`l-data` on a `<template l-if>`/`l-for` top node creates no scope**
  (`:1482`, `:1660`): `processElement`/`applyDirective` have no `case 'data'`, so
  the node is stamped with the parent scope and its literal never evaluates.
  `l-source` inside an `l-if` issues **zero fetches**. *Fix: call `initTree` when
  the cloned node carries `l-data`.*
- **`l-model` listeners survive `destroy()`** (`:1351,1374,1385,1394,1423`): the
  effect is cleaned up, the `addEventListener` never is.
- **`l-if` leaks every non-element node per toggle** (`:1490`): 34 child nodes
  where 2 were expected after 10 cycles.

Plus: `$watch` disposers never registered (`:592`/`:623`); teleported descendants
leak on teardown (`:1761`); `l-cloak` on dynamically inserted content stays hidden
forever (`:2202`+`:2268`); `apiSource()` has no teardown at all
(`api-source.js:145`); double `Faqir.start()` double-fires every handler (no
re-entry guard at `:2201`).

**`registry/core/api-source.js` has zero test coverage** — 165 lines shipped into
every project by `faqir init`, documented in the generated skill and three times
in `faqir context`, health-checked by `faqir doctor`, and imported by no test at
all. It does real `fetch`, optimistic create/update/remove with rollback, and
`setInterval` polling; every path and every error path is untested. It is the
highest-risk untested surface in the repository.

### W3-2 · Controller family fixes
Three defects, each fixable as a family rather than one at a time.

- **Escape does not layer** (7 controllers + `command-palette`). Each calls
  `preventDefault()` without `stopPropagation()`, so Escape bubbles to every
  ancestor overlay: dismissing a `select-custom` inside a modal **closes the entire
  form with the user's input**. One edit at `menu-navigation.js:105-108` fixes
  `dropdown`/`context-menu`/`menubar` together; then `popover.js:54`,
  `select-custom.js:179,206`, `combobox.js:159`, `tag-input.js:276`,
  `command-palette.js:184`. `tooltip.js:60` is the correct model.
- **`destroy()` while open leaves a dead, undismissable overlay** (12
  controllers). After `open(); destroy();` the backdrop is still visible and the
  close button, Escape and overlay-click all do nothing — a full-page block with no
  exit, which is exactly what an SPA route change does.
  `context-menu.js:95-97` is the only correct one and is the model.
- **Four controllers throw on incomplete markup** (`calendar`, `context-menu`,
  `date-picker`, `dropdown`). Now *contained* by this session's fix, but the null
  dereferences remain and should be fixed at source.

### W3-3 · Accessibility (measured from rendered pixels)
- **Focus ring fails WCAG 2.2 SC 1.4.11 in 19 of 24 theme×mode combinations** —
  `--color-ring` is authored translucent (α 0.35–0.6) everywhere except
  `contrast`, so the composited ring lands at 1.68–2.72:1 against a 3:1 minimum.
  The framework's own `contrast-tokens` rule *cannot* catch it: it skips
  translucent pairs by design (`contrast-tokens.ts:206-230`). Make the ring
  opaque and widen the rule.
- **Checkbox tick hardcodes `white`** (`checkbox.css:55`) — 1.00:1 (literally
  invisible) in brutalist dark, under 3:1 in 8 of 12 dark themes. Twenty lines
  below, the indeterminate bar does it correctly with `var(--color-primary-fg)`.
- **Stepper label hardcodes `white`** (`stepper.css:42`) — the only bare colour
  literal in the registry; fails in 9 of 12 dark themes.
- **Zero `forced-colors` support** — `switch` renders as an empty white pill with
  on and off *pixel-identical*; `progress` shows no progress; `tabs` selection is
  invisible. Six components need a `@media (forced-colors: active)` block.
- **RTL:** the `switch` thumb slides 17px outside its own track (physical
  `translateX`); the `select` chevron paints over the option text.
- **Mobile overflow at 320/375/390px:** `settings-page` (403px, no media query at
  all), `recipes/sidebar` (403px), `dashboard-shell` (369px at 320).
- **`dropdown`/`context-menu` delete the focus ring** and replace it with a ~1.1:1
  tint identical to their own `:hover`.

### W3-4 · The five `aria-activedescendant` gaps
`select-custom`, `combobox` and `command-palette` all publish `role="combobox"`
and `aria-autocomplete="list"` — declaring the APG contract — while tracking the
active option only in `data-highlighted`, with options carrying no `id`. A
screen-reader user gets no active-option announcement on any of them. The axe gate
structurally cannot see this: it evaluates static DOM and the defect exists only
mid-keyboard-navigation.

**Freezing a 1.0 protocol while three shipped widgets claim an ARIA pattern they
do not implement is the single worst item in the codified-defect inventory.**
Tracked as 0.4-27/-30/-34. Also 0.4-28: `select-custom` has no hidden input, so a
`<select>` replacement silently drops its value on form submit.

### W3-5 · Test-suite integrity
- **23 of 25 synchronous subprocess spawns carry no timeout.** Bun's per-test
  timeout cannot interrupt `spawnSync`, so the suite **hangs instead of failing** —
  observed five times, once for 12.3 minutes on a test declaring a 60s budget. A
  green run cannot reliably *happen* on macOS. Fix before anything else in this
  wave; I hit it twice during this session.
- **The suite tests Bun; the artifact runs on Node.** `bin/faqir` is
  `#!/usr/bin/env node`, yet only **7 of 22 commands** are ever executed on Node
  and roughly **12-15 of 3,636 tests (~0.4%)** drive the compiled bundle there.
  `tests/commands/json-output.test.ts:13` spawns `process.execPath` — under
  `bun test` that is **Bun**, whose `console.log` is synchronous — which is why
  the file guarding the `--json` contract across all 22 commands could not see the
  Node-only truncation. Same substitution at `theme-generate.test.ts:205` and
  `dev.test.ts:256` (which spawns literal `"bun"`).

  The exposure is wider than stdout buffering. Thirty `src/` modules call
  `Bun.file`/`Bun.write`/`Bun.Glob`/`Bun.serve`, which exist on Node only because
  `src/utils/runtime-shim.ts` fakes them — and that 261-line file has **zero
  references in any test, not even by name**. Its hand-rolled `NodeGlob` is only
  ever exercised on Node with `**/*` and `*/`; `**/*.html`, `*/*.manifest.json`
  and `theme-*.css` never are. `faqir dev` is the sole consumer of the `Bun.serve`
  polyfill (`runtime-shim.ts:201-245`) and **no test ever executes it** — on a
  Node-only machine `faqir dev` runs entirely untested code.

  It already leaks: `trace --json`'s `dependents` array comes back in a
  **different order** on Node than on Bun (`Bun.Glob` vs `NodeGlob` traversal),
  and `trace.test.ts:81-88` asserts 8 of 11 keys with `dependents` among the three
  it skips. An agent parsing `--json` gets order-dependent output depending on
  whether the user happens to have Bun installed.

  *Fix, in order:* run `json-output.test.ts`'s universal loop against
  `dist/faqir.mjs` under `node`, **in a real project rather than an empty dir**,
  asserting key sets — one change fixes the runtime, the empty-dir problem and the
  missing shape assertions together; unit-test `NodeGlob` against real `Bun.Glob`
  for the four unexercised patterns; sort glob-ordered `--json` arrays; add one
  Node-path smoke for `faqir dev`.
- Four genuinely vacuous tests: `faqir-core.test.ts:1866` (zero assertions, and
  it is `$dispatch`'s only behavioural test), `events.test.ts:114`
  (`expect(typeof called).toBe("boolean")` — cannot fail), `motion.test.ts:6`,
  `:13`. Plus `controller-coverage.test.ts:43` asserts only that a test *file*
  exists.
- `field-wiring.test.ts:63-84` accepts **both** `data-state="error"` and
  `"invalid"` for one state. SPEC-1.0 freezes value grammars — pick one before the
  freeze.
- **Exemption by omission.** `CONTRAST_PAIRS` (`contrast-tokens.ts:69-88`) is a
  hand-written list of 14 pairs, so the gate exempts everything it forgot:
  `primary`×`bg-muted` (follow-up 0.7-18's 4.41:1 pair) and `fg-muted`×`bg-muted`
  are both absent. The a11y exemption list itself is exemplary by contrast — three
  entries, each citing the WCAG clause, count asserted by a meta-test.
- **Visual baselines are not committed** (Actions cache only). On a push to `main`
  the baseline job runs `--update-snapshots` and **nothing is diffed** — a
  regression merged by a non-PR push is absorbed as the new truth. On PRs,
  `restore-keys` falls back to an older set, so a PR touching registry CSS can
  diff against a stale baseline.
- **Print-visual is path-filtered** to a hand-maintained list of 12 components
  while its cache key hashes all of `registry/**`. Complete today and gated by
  nothing: add a component to a document scaffold and the print job stops running
  on the PR that breaks it, then re-baselines on merge. A five-line test.
- **The layout ratchet ratchets totals**, so one page gaining a bleed while
  another loses one nets zero and is invisible. Its phone budget currently carries
  29 bleeds + 3 overlaps across `dashboard-shell`, `settings-page` and `toast` —
  content painted outside the viewport that is reachable by tab order but not by
  eye.

### W3-6 · State a prompt-injection position
Manifest text flows verbatim into `faqir context`, `llms.txt`, `llms-full.txt` and
the generated `SKILL.md` (`src/generator/context.ts:224,1028,1052`) with no
sanitization, no provenance marking, and no trust boundary between first-party
text and a third-party component installed via `faqir add --registry`. A hostile
manifest description is agent-directed instruction presented as framework
documentation.

The framework has a rigorous position on runtime code-injection and **none at all
on the agent-injection surface that is its differentiator.** A 1.0 should: state
the boundary in `docs/security.md`, label third-party manifest text as untrusted
data where it is emitted, and treat `--registry` installs as a review boundary.

---

## Wave 4 — Release engineering

`scripts/release.mjs` is a 107-line single-package script scoring **1 of 8
mechanics and 0 of 3 acceptance criteria** against plan task 1.0-04. Est. **3–4 days**.

| 1.0-04 requirement | Status |
|---|---|
| Workspace-aware version bump | unmet — bumps root only; the other five are never touched |
| Ordered builds of all dists | unmet — no `build:core`, `build:core-package`, `build:mcp`, `gen:bindings` |
| Size budget as precondition | unmet — never invoked by the release path |
| Per-package `npm publish` | unmet — one bare publish of the root |
| `--provenance` | unmet — no publish workflow, no `id-token: write` |
| Git tag | **met** |
| GitHub release with notes | unmet |
| **Dry-run (mandatory)** | unmet — and `--dry-run` prints "Unsupported version bump" then **exits 0**, so a mistyped release looks like success |

Also in this wave:

- **No committed lockfile.** `.gitignore:4` ignores `bun.lock`; 7 of 8 devDeps
  float, including `axe-core ^4.12.1` (the zero-violation gate — an axe minor
  turns CI red with no repo change) and `@types/bun`/`bun-types` at `latest`.
  `ci.yml:20-24` already documents this exact failure mode for the Bun runtime and
  pins it; the lesson was not applied to dependencies.
- **`check:package` is inert** — proven: `dist/` deleted entirely, `npm pack
  --dry-run` still exits 0 packing 365 files whose `bin` cannot resolve.
- **Two independent size-budget implementations** that disagree today (43.12 vs
  43.39 KB for the same target) with no test asserting they agree.
- **Release ordering can diverge npm from git**: `git tag` → `npm publish` →
  `git push`; a rejected push leaves a version live on npm that exists in no
  pushed commit. It also pushes to the current branch with no branch check.
- **No rollback story and no launch checklist** anywhere.
- **`https://faqir.dev` does not resolve**, yet `manifest.schema.json:3` sets it as
  `$id` and `SPEC-1.0.md:468-472` publishes four canonical URLs on it. The schema
  ships inside the tarball, so the frozen protocol's canonical URL is a dead name.
- **`Faqir.version` reports `0.1.0`** from a package versioned `0.2.4`
  (`engine.js:2`), and the "one version, everywhere" suite never reads any
  workspace `package.json` or the engine's own literal.
- **`@faqir-ui/mcp` ships ~11 MB of unused runtime deps** — the bundle imports only
  `node:*` builtins; move both to `devDependencies`.

### The version story
Nothing is published yet (`npm view` → `E404` for all six names), so every
packaging defect is fixable without a deprecation. Recommend: **publish all six at
`1.0.0` in lockstep**, with `PROTOCOL_VERSION`/`SCHEMA_VERSION` staying `1.0` and
independent. Lockstep is simpler to reason about at 1.0 and the current 0.2.4/0.1.0
skew has no upside.

---

## Documentation

Corrected in this session: the audit-rules table (**6 of 13 rule IDs were
fictional** and 20 real rules undocumented — now generated-accurate at 31 rules
across 9 scopes, which matters because these IDs are what `--skip-rules` accepts);
prerequisites (**Node ≥18, not Bun**); the engine size claim (**7× understated** —
it quoted the bare engine's 9.5 KB for a file that is 88 KB gzipped as installed);
the entirely undocumented **CDN channel**; ToC order; and stale structure counts.

Still open:

- **`README.md` is 69 KB and `src/commands/init.ts:231-235` copies it into every
  project.** It is not just the front door — it is a runtime artifact in every
  user's project and every agent's context window. Recommend cutting to ~12 KB by
  generating the CLI reference and the rules table from
  `src/command-registry.ts`/`src/audit/rules.ts` (which also permanently prevents
  the drift just fixed), and moving Layout, Data-Driven Rendering, Tokens and
  Themes to the `docs/` and site pages that already hold fuller versions.
- **`docs/` is undiscoverable**: 5 of 8 files are linked from nowhere in the README
  and 7 of 8 have no site page. `docs/security.md` — the file that tells you your
  CSP will silently break the engine — is reachable only by browsing GitHub.
- **Executable-doc coverage stops at `SPEC-1.0.md`.** Running the same audit over
  README and `docs/*.md` finds real errors, e.g. `data-variant="destructive"` on
  `[data-ui="text"]` repeated three times across README and
  `docs/data-driven-rendering.md` (the `text` enum is
  `default|muted|subtle|primary|mono`). Extend the gate.
- **`SKILL.md` under-documents ~30 real flags** across 14 of 22 commands,
  including `audit --stdin` and `--fix` — the agent self-validation loop the MCP
  README advertises as the point of the product. Root cause is thin `args` strings
  in `src/command-registry.ts`, so one fix corrects the skill and `--help` together.
- **`SKILL.md`'s own examples fail the shipped audit**: `dashboard-shell` (3
  criticals, missing landmark roles the manifest requires) and `crud-table` (uses
  `...` elision, producing 13 criticals if copied — while `SKILL.md:35` rule 8
  instructs "emit the full inner structure").
- **1.0R-14 and 1.0R-15 both still reproduce**: the generated CSP omits
  `'unsafe-eval'`, so every live demo on the docs site is dead, `/engine/`
  foremost; and `site/content/engine.html:4` closes its comment early, so that page
  renders **none** of its 50 KB and `querySelectorAll('[l-data]')` returns 0.
- One stale follow-up row: **0.7-16 is fixed** (tag-input now uses `role="group"`;
  3,013 axe cases green) but never ticked.

---

## Suggested sequence

1. **W3-5's spawn timeouts first.** A suite that hangs instead of failing makes
   every subsequent wave slower and less trustworthy.
2. **Wave 1** — 2–3 days. After this the published artifacts are installable and
   the CDN path works.
3. **Wave 2** — 1 week. After this the agent-native claim is defensible, which is
   the claim the product is sold on.
4. **Wave 3** — 1 week, parallelizable across engine / controllers / CSS.
5. **Wave 4** — 3–4 days, last, because it is the thing that makes the rest public.

Tag 1.0 only when Waves 1–4 are closed and the §17 gates are green **at the
release point** — which requires wiring them into the release path, since today
none of them are.
