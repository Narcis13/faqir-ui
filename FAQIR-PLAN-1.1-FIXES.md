# FAQIR-PLAN-1.1-FIXES — Downstream bug-fix plan (from `faqir_bugs.md`)

> Executable plan for the 33 entries in `faqir_bugs.md`, found by the downstream
> `indirect` dashboard while building on faqir-ui 1.1.1. Every entry was re-verified against
> this repository at `ea6320c` (v1.1.1) on 2026-10-01 — by reading the source and, for most,
> by a scratch happy-dom or Chromium reproduction. The verdicts, line numbers and fix
> designs below come from that verification, **not** from the downstream report, which
> cites downstream paths (`ui/core/…`) and in several places mis-diagnoses the cause.
> Line numbers are as of `ea6320c`; re-locate by function name if they have drifted.

**Baseline:** faqir-ui-cli v1.1.1 (`ea6320c`) · engine 10.40/14 KB gzip · engine+controllers 44.47/46 KB gzip
**Source of truth for *what may not change*:** `SPEC-1.0.md`. Nothing in this plan amends it. Component
`data-*` props, new states, new variants and new engine magics are all additive under SPEC §1.2/§8.2
(a manifest `props`/`states` entry + `version` bump + `changes` note — no amendment). `src/protocol.ts`
holds no directive or magic data and is not touched by any task.
**Bug source:** `faqir_bugs.md` (entry numbers below — "entry 16" — refer to it)

---

## How to run a session

Same protocol as `FAQIR-PLAN-1.1.md` ("How to run a session" and "Global definition of done"
apply verbatim): one task per session; read only this header, the task's entry and its
*Touches*; verify the baseline with `bun run test` first; tests written in the same session;
commit as `fix(<task-id>): …` (`feat` for tasks marked **additive**). To drive this file with
`/faqir-plan`, point `.faqir-plan/state.json` → `plan` at it (archive the 1.1 cursor first,
as was done with `state-1.0.json`).

### Environment facts every session needs

- **Bun pin.** *(2026-10-05: the pin is now **`1.4.2`**, the machine's own Bun, and the three pinned bundles were regenerated with it. No scratch install is needed any more, so read "1.3.8" below as history.)* `.bun-version` was `1.3.8`. `build:audit-browser`, `build:rules-plugin` and
  `build:core-package` byte-compare against a minified build, so regenerate them **with Bun
  1.3.8** or their `check:*` gate goes red for an unrelated reason. Since 1.1F-05 the only Bun
  on this machine was 1.3.8, at `~/.bun/bin/bun`; by 1.1F-16 that binary is 1.4.2 again, so
  check `bun --version` and use the `npm i bun@1.3.8` route below when it is not the pin. Sizes measured with it are about 0.3 KB higher
  than the 1.4.2 numbers recorded by 1.1F-01–04: after 1.1F-05, engine+controllers is
  45.50/46 KB gzip, leaving about 0.5 KB for the rest of the plan. (A machine whose own Bun
  is newer can get the pin without touching it: `npm i bun@1.3.8` in a scratch directory,
  then put that `node_modules/.bin` first on PATH. 1.1F-16 ran that way.) **But `bun run size` is
  not the tightest gate.** `tests/build/core-package.test.ts` gzips the *packaged*
  `packages/core/dist/faqir-core.min.js` (IIFE wrapper + sourcemap comment) against the same
  47,104 B. That figure runs about 0.27 KB above `size`'s. After 1.1F-14 it is 47,095 B,
  so **9 B** is left: the next E/C task has to free bytes before it can add any (1.1F-14's
  commit body lists the trims that paid for it). Check it after every E/C task.
- **Bun 1.3.8 `bun build` sometimes hangs** on this machine at 100% CPU (seen in
  `build:core-package`, `check:skill`, and the MCP build that `packages/mcp/tests/e2e.test.ts`
  runs). In a full `bun run test` it shows up as an unrelated 5 s or 30 s timeout, a different
  one each run, and it leaves an orphaned `bun build` running. Run `pkill -f 'bun build'`
  and rerun the suite.
- **happy-dom.** If `realm-guard`/`tree-view` flake, the lockfile has pinned happy-dom 20.10.6;
  run `bun add -d happy-dom@20.11.2 @happy-dom/global-registrator@20.11.2 --no-save`
  first. It leaves `bun.lock` and `package.json` untouched; refreshing the lockfile is a
  separate change that needs the owner's approval.
- **happy-dom traps found during verification:**
  - An attribute named `:style`/`l-bind:style` is read as the element's own `style`
    attribute. With a static `style="…"` beside it, `cssText` writes are silently ignored.
    Write `:style` tests **without** a static `style` attribute. (1.1F-04 narrowed this: it
    only bites when the static attribute comes **before** the binding, and `:class` +
    `class` behave the same way. With `<span :style="s" style="…">`, binding first,
    reads and writes are both correct.)
  - happy-dom focuses a `<div>` with no `tabindex`. A focus test must assert the
    attribute, not `document.activeElement`.
  - It drops border shorthands that resolve to `oklch()`, and mis-splits
    `var(--a, var(--b))`. Prefer stylesheet-parsing tests for CSS fixes, and Playwright
    (`tests/visual/*.pw.ts`) for geometry.
- **Never `Faqir.start()` / `initTree(document.body)`** in a test (AGENTS.md). Mount into a
  disposable container. `tests/recipes/toggle-group.test.ts:203-240` currently breaks this
  rule; task 1.1F-02 fixes it while it is there.
- **Size budget is tight.** Engine plus controllers is 44.47 of 46 KB gzip, so the whole plan
  has about 1.5 KB to spend. Controllers are inlined into the engine bundle, so every recipe
  fix counts too. Run `bun run size` after every E and C task. If a task breaks the budget,
  stop and raise it instead of raising the budget. Dev-only diagnostics go in
  `src/core-src/dev-diagnostics.js` (stripped from prod by `tests/build/dev-build.test.ts`).
- **What to regenerate after a controller edit** (`registry/recipes/*/*.js`):
  `bun run build:core` (rewrites `registry/core/faqir-core{,.dev}.js`), `bun run gen:bindings`
  (`packages/{react,vue}` vendor the controllers verbatim), `bun run build:registry-index`
  (sha256 per file), `bun run build:core-package` (SRI in `packages/core/cdn.json`;
  fail-closed), plus `bun run gen:skill` if a manifest changed.
- **What to regenerate after a CSS edit** (`registry/**/*.css`): `gen:component-tokens`
  first (since 1.1F-15 it owns `tokens_used` and the `@ui:tokens` header — never hand-edit
  either), then `build:registry-index`, `gen:skill` (it quotes button's manifest and header
  verbatim), `build:core-package` (27 theme bundles carry SRI), and **then** `build:docs`:
  every docs page embeds `cdn.json`'s SRI hashes, so docs built before the package go
  stale. The engine is unaffected.
- **After an `src/core-src/engine.js` edit:** `build:core`, `build:core-package`, plus
  `gen:skill` if a `@ui:directive`/`@ui:magic` line changed (`tests/generator/skill.test.ts:755-785`
  requires every `$token` written anywhere in engine.js, comments included, to have a
  `@ui:magic` line). `registry/core/faqir-core.mjs` is a hand-written wrapper and needs no
  change unless the public API grows.
- **Visual baselines:** canonical markup is unchanged by every task unless the task says
  otherwise, so the Linux-container visual run should be pixel-identical. Treat any diff as a
  regression.

### Release classes

Each task is tagged **patch** (a fix with no new surface) or **additive** (a new prop,
state, token, magic, config key, tool input or entry point). Task 1.1F-31 cuts **1.1.2**
from the patch set as soon as its dependencies are met. Run it by ID; it does not have to
wait for document order. Task 1.1F-32 releases the additive set; its version is decision D1.

### Decisions to settle (recommendations given; confirm before or in the named task)

| # | Decision | Recommendation | Task |
|---|---|---|---|
| D1 | Version for the additive set | Ship it as **1.1.3** if additive-in-patch is acceptable for this project, since 1.1.1 already shipped new behaviour. Otherwise hold it for 1.2.0, which `FAQIR-VISION.md` §11 reserves for "Surface". | 1.1F-32 |
| D2 | Engine-injected `l-cloak` style (entry 13) | **Remove the injection.** The rule already ships in `base/reset.css:164-166`. The injected copy is added at boot and every cloak is removed in the same task, so it never hides anything painted. Removing it removes the only inline style, so `style-src` no longer needs `'unsafe-inline'` or a hash. | 1.1F-07 |
| D3 | ⌘⇧K (entry 23) | Make Caps Lock and non-Latin layouts work, but **do not** accept Shift. ⌘⇧K is a common app and browser chord (Firefox opens the console). | 1.1F-10 |
| D4 | Navigable table takes links out of the Tab order (entry 21) | Do it, since it is the ARIA grid pattern. It is a behaviour change, so put it in the `changes` note and the release notes. Adding `role="grid"` is a separate later decision; leave it out. | 1.1F-14 |
| D5 | `tokens_used` policy (entry 17) | `tokens_used` means "tokens the CSS references directly", which is CONTRIBUTING's definition. The `@ui:tokens` header is **generated** from it. Alias-reachable extras such as `color-ring` (reached via `--focus-ring-color`) stay allowed. | 1.1F-15 |
| D6 | Description-list `sm` → `--text-xs` (entry 30) | **Won't fix in CSS.** It is the registry-wide convention: every component whose `md` is `--text-sm` maps `sm` to `--text-xs` (button, toggle, breadcrumb, key-value, input, chip, table…). `text` is the outlier because its sizes are type-scale steps. Add a note instead. | 1.1F-20 |
| D7 | Name of the new magic (entry 2) | `$this`. Do not also mention `$self` anywhere in engine.js, or the skill gate demands a `@ui:magic` line for it. | 1.1F-06 |

---

## Task index

### Lane E — Engine (`src/core-src/engine.js`)

| ID | Task | Entries | Class | Status |
|----|------|---------|-------|--------|
| 1.1F-01 | Refs register on the real scope root (`l-if`, `l-for`, `l-teleport`, stray) | 1 | patch | ✅ |
| 1.1F-02 | Property-aware bindings + `faqir:model` notification; toggle-group follows the store | 16, 4 | patch | ✅ |
| 1.1F-03 | Inserted content: controllers start before `l-init` / first `l-effect` | 3 | patch | ✅ |
| 1.1F-04 | `:style` / `:class` merge instead of replace | 31 | patch | ✅ |
| 1.1F-05 | Methods keep their component's `this` when called from a row (+ dev warning) | 29 | patch | ✅ |
| 1.1F-06 | `$this` magic — the element the directive is on | 2 | additive | ✅ |
| 1.1F-07 | Drop the injected `l-cloak` style; CSP docs | 13 | patch | ✅ |

### Lane C — Recipe controllers

| ID | Task | Entries | Class | Status |
|----|------|---------|-------|--------|
| 1.1F-08 | Overlay focus: focusable panel + no late focus theft (dialog, alert-dialog, drawer, sheet) | 18, 19 | patch | ✅ |
| 1.1F-09 | Table: the roving Tab stop never strands | 20 | patch | ✅ |
| 1.1F-10 | Command palette: case/layout-proof ⌘K, one owner, `data-no-shortcut` | 23, 32 | additive | ✅ |
| 1.1F-11 | Sidebar: rail chevron flips, trigger label stays stable | 7 | patch | ✅ |
| 1.1F-12 | Nesting, controllers I: tabs, accordion, dialog family, sidebar, context-menu + nesting matrix | 5, 6 | patch | ✅ |
| 1.1F-13 | Nesting, controllers II: carousel, popover, table delegation, `:scope` pass | 5 | patch | ✅ |
| 1.1F-14 | Table: ARIA grid handling of links/buttons inside navigable cells | 21 | additive (behaviour change) | ✅ |

### Lane S — Styles and tokens

| ID | Task | Entries | Class | Status |
|----|------|---------|-------|--------|
| 1.1F-15 | `gen:component-tokens` + registry gate: `tokens_used` and `@ui:tokens` derived from CSS | 17, 30 | patch | ✅ |
| 1.1F-16 | Overflow: stack `min-inline-size`, grid `minmax(0,1fr)`, `overflow-wrap` on ids | 25, 26, 27 | patch | ✅ |
| 1.1F-17 | Button: `aria-pressed` state; link variant keeps its box under a size | 14, 24 | additive | ✅ |
| 1.1F-18 | Text: an anchor carrying `data-ui="text"` reads as a link | 28 | patch | ✅ |
| 1.1F-19 | `--mono-ligatures` token; every mono surface turns ligatures off | 12 | additive | ✅ |
| 1.1F-20 | Nesting, CSS I: tabs, collapsible, accordion, description-list, progress, key-value, callout, empty-state | 5, 17, 30 | patch | ✅ |
| 1.1F-21 | Nesting, CSS II: dialog family, popover, tooltip, sidebar, carousel, menus | 5 | patch | ✅ |
| 1.1F-22 | Nesting, CSS III: table | 5 | patch | ✅ |
| 1.1F-23 | Nesting, CSS IV: long tail + `descendant-part-selector` registry gate | 5 | patch | ✅ |

### Lane T — Tooling (CLI, MCP, forms)

| ID | Task | Entries | Class | Status |
|----|------|---------|-------|--------|
| 1.1F-24 | `faqir audit` recognises every engine entry point (module, `.dev.js`, `@faqir-ui/core`) | 9 | patch | ✅ |
| 1.1F-25 | `faqir repair`: no duplicate controllers; correct, page-relative script path | 10 | patch | ✅ |
| 1.1F-26 | Manifest `$schema` correct at any `output_dir` depth; `init` writes the schema | 8 | patch | ✅ |
| 1.1F-27 | `audit.forbid_directives` in `faqir.config.json` | 11 | additive | ✅ |
| 1.1F-28 | MCP audit is project-aware (`root`, known names, `strict`); `orphan-part` with unknown owners | 22, 33 | additive | ✅ |
| 1.1F-29 | `@faqir-ui/forms`: accept `additionalProperties`, nullable unions, `examples`/`const` | 15 | additive | ✅ |
| 1.1F-30 | `@faqir-ui/forms/dom`: `buildForm(schema, document) → Element` (minimal) | 15 | additive | ✅ |

### Release

| ID | Task | Status |
|----|------|--------|
| 1.1F-31 | Release 1.1.2: the patch set | ⬜ |
| 1.1F-32 | Release the additive set (version per D1); downstream un-patch checklist | ⬜ |

## Follow-up tasks (added by sessions per protocol rule 4)

| ID | Task | Origin | Status |
|----|------|--------|--------|
| 1.1F-33 | `inspect()` / `devtools.scopes()` misreport `l-if`/`l-for` clone top nodes as scopes (`ownScopeRoot` ~2450, `scopes` ~2543). A `[data-ui]` at the top of an `l-if` is listed with `id:null`, and `l-for` row snapshots show only item and index. Resolve through the 1.1F-01 `scopeRoots` map. | verification of entry 1 | ⬜ |
| 1.1F-34 | Nested `l-data` scopes do not inherit parent data (`createScopeWithMagics(userData, root, root)` has no parent fallback; only the literal is evaluated against the parent). Decide whether this is intended, then document it or fix it. | verification of entry 29 | ⬜ |
| 1.1F-35 | `site/styles/docs.css:446-456,1046-1050` hand-roll pressed buttons. Delete what 1.1F-17 makes redundant, or confirm it went in that task. (Went in 1.1F-17: two of the three rules deleted, the theme pick kept solid at one more attribute; `tests/primitives/button.test.ts` pins it.) | verification of entry 14 | ✅ |
| 1.1F-36 | An `l-teleport` inside `l-if` / `l-for` content moves its element out before insertion, so `renderThenInit` never sees it: its held `l-init` runs before its controllers, which only the MutationObserver starts. Start controllers on teleported nodes in `handleTeleport` while `pendingInits` is open, or document the gap. Also: a scope root's own `l-init` in inserted content now runs after its children bind (static pages: before) — confirm that asymmetry is acceptable. | 1.1F-03 | ⬜ |
| 1.1F-37 | `tests/visual/docs-switcher.pw.ts` › "the scheme reaches every preview frame at once" fails on macOS Chromium at `3f7d5fb`, before 1.1F-17 touched anything: 12 of the 27 lazy theme frames take the scheme within the 10 s poll. Not part of `bun run test`. Find out whether the frames never load (lazy loading below the fold) or load and miss the message, and fix the page or the test. | 1.1F-17 | ⬜ |
| 1.1F-38 | The docs site's own stylesheets set `font-family: var(--font-mono)` in 13 rules (`site/styles/docs.css` 523, 668, 1093, 1104; `pages/{rules,tooling,night-shift,themes}.css`) and none reads `--mono-ligatures`, so code samples on the site still ligate on a machine with Cascadia Code or JetBrains Mono. Add the declaration beside each, and extend the sweep in `tests/tokens/role-tokens.test.ts` §5 (or a site test) to `site/styles/`. | 1.1F-19 | ⬜ |
| 1.1F-39 | Pattern stylesheets are in no nesting task. Thirteen of them hold about 280 descendant part selectors (auth-form 46, inbox 34, crud-table 31, search-results 25, settings-page 25, dashboard-shell 23, pricing 19, stats-dashboard 17, site-footer 15, feature-grid 14, hero 13, document 10, wizard 8), and 1.1F-23's Touches names only `inbox`, so its `descendant-part-selector` gate fails on the other twelve as written. Decide before or in 1.1F-23: convert them with the 1.1F-20 strategy (add each to `CONVERTED` in `tests/registry/nesting-css.test.ts`), or scope the gate to primitives and recipes and allowlist the deliberate deep selectors (a pattern restyling a component it composes, as `settings-page` does `[data-ui="tabs"] [data-part="trigger"]`). `patterns/empty-state` went in 1.1F-20. **Decided in 1.1F-23: convert them.** `inbox` went in 1.1F-23; the other twelve are `DESCENDANT_PART_PENDING` in `src/audit/part-selectors.ts`, which gate 9 skips. A sheet leaves the list in the change that converts it, since the gate fails a pending sheet with nothing left to convert. Allowlist a deliberate deep selector (`settings-page` restyling the tabs it composes) in `DESCENDANT_PART_ALLOWED` only if it cannot be written as a child chain through `:where([data-ui="tabs"])`, as inbox's panel rule is. | 1.1F-20 | ⬜ |
| 1.1F-40 | Radio and checkbox option text has no typography of its own: `[data-ui="radio-label"]` and `[data-ui="checkbox-label"]` set layout only, so an option inherits the page's body text. Until 1.1F-23 a field-group's descendant label rule gave options in its input slot the field label's size, weight and colour (the shape `@faqir-ui/forms` renders, and the `form-page` pattern); converted, they render at body size, 16px regular under a 14px medium field label. Decide whether option text should take a size (`--text-sm`, or the field's own text size) and where it is set: in the two primitives, which changes every page with a radio or checkbox, or in field-group as a deliberate child-chain rule. | 1.1F-23 | ⬜ |
| 1.1F-41 | `buildForm` full parity (optional): a wizard, a rules definition (a `<script type="application/json">` built as a node, `l-rules` pointing at it), and repeatable-row property names that are not expression-safe. `renderForm` still refuses those names because they go into its `l-for` bindings, and `buildForm` inherits the refusal by validating through it. The 1.1F-30 note suggests one shared node tree with two serialisers, which would also remove the duplicated widget choice in `dom.js` that the parity test in `tests/dom.test.ts` currently guards. | 1.1F-30 | ⬜ |

---

## Coverage matrix (every entry → verdict → task)

| # | Entry (short) | Verdict at `ea6320c` | Task |
|---|---|---|---|
| 1 | `l-ref` in `l-if` not in `$refs` | Confirmed (repro). Also `l-for` rows, `l-teleport`, stray elements. | 01 |
| 2 | Expression can't reach its own element | Confirmed (repro): the `$el` parameter is shadowed by the `$el` magic. | 06 |
| 3 | Controllers start after directives in inserted content | Confirmed on the observer, `l-if`/`l-for` and explicit `initTree` paths. | 03 |
| 4 | `l-model` radio/checkbox doesn't tell the controller | Confirmed (repro). Also a keyboard/a11y bug: the checked radio gets `tabindex=-1`. | 02 |
| 5 | Descendant selectors take nested parts | Confirmed. 135 unguarded controller lookups; 908 descendant part selectors in 48 CSS files. | 12, 13, 20–23 |
| 6 | sidebar trigger selector | Confirmed **and already harmful**: a footer dropdown's `aria-expanded` is forced and its click rails the sidebar. | 12 |
| 7 | sidebar chevron in rail | Confirmed. The trigger label also goes stale ("Collapse sidebar, collapsed"). | 11 |
| 8 | `create` stray schema + wrong `$schema` | Re-diagnosed. The root schema file is intentional (`create.ts:101-119`, since 1.1.1). The wrong path is in **`faqir add`**, which copies registry manifests byte-for-byte, so `$schema` is wrong whenever `output_dir` is not one segment deep. | 26 |
| 9 | audit misses module engine | Confirmed, and wider: `.dev.js` and `@faqir-ui/core` are missed too. | 24 |
| 10 | repair adds duplicate controllers | Confirmed, plus a hard-coded `ui/` path, a page-relative path bug, and an inert injected module. | 25 |
| 11 | `forbid_directives` | Missing feature, confirmed. | 27 |
| 12 | mono ligatures | Confirmed, and wider: system Cascadia Code ligates too; six surfaces are affected. | 19 |
| 13 | `l-cloak` CSP hash | Confirmed undocumented. The injection is redundant (D2). | 07 |
| 14 | button `aria-pressed` | Confirmed. The `toggle` primitive covers the case but has no variants. | 17 |
| 15 | forms: untrusted schema, `additionalProperties` | Confirmed. `type:[T,"null"]`, `examples` and `const` throw too. | 29, 30 |
| 16 | `:checked` sets the attribute only | Confirmed (repro). `open` is **not** affected (no dirty flag); `selected`, `muted`, `indeterminate` and `:value` are. | 02 |
| 17 | description-list/progress token drift + selectors | Confirmed. Registry-wide: header≠CSS in 70 components, `tokens_used`≠CSS in 65, with no gate. | 15, 20 |
| 18 | dialog late focus restore | Confirmed (repro). Drawer and sheet are identical; alert-dialog inherits it. | 08 |
| 19 | dialog panel not focusable | Confirmed in code. Drawer and sheet are identical. | 08 |
| 20 | table Tab stop strands | Confirmed (repro). Two more ways to strand it: a filtered-out row and a hidden column. | 09 |
| 21 | table links keep Tab stops | Confirmed. Arrow keys are also dead while focus is on a link in a cell. | 14 |
| 22 | MCP audit ignores unknown names / project | Confirmed. The cause: `auditHtml` never passes `knownUiValues`, and loads registry manifests only. | 28 |
| 23 | ⌘K with Caps Lock/Shift | Confirmed (repro). | 10 |
| 24 | link variant + size | Confirmed, measured: 32px tall with 12px padding. | 17 |
| 25 | stack `data-flex` can't shrink | Confirmed, measured: 1600px → 390px with the fix. | 16 |
| 26 | grid `1fr` grows | Confirmed (30 declarations); description-list horizontal too. | 16 |
| 27 | long tokens never break | Confirmed, with a case-by-case Chromium table. The table exception is needed. | 16 |
| 28 | `a[data-ui=text]` looks like text | Confirmed. | 18 |
| 29 | row method writes the loop variable | Confirmed (repro). Latent in `apiSource()` too (`this.items/error/loading`). | 05 |
| 30 | description-list `sm` = `--text-xs` | By design (D6): note only. The stale header is fixed by 15. | 15, 20 |
| 31 | `:style` replaces the whole inline style | Confirmed (repro). Also: wipes a static `style`, never removes dropped object keys, ignores the array form; `:class` strings clobber controller classes. | 04 |
| 32 | every palette takes ⌘K; search joins page undo | ⌘K half confirmed (the registry's own example page opens 3 palettes). Undo half not verifiable in happy-dom; docs note only. | 10 |
| 33 | audit gives a part to the nearest component | Only when the outer component has no manifest, which is exactly the MCP case of entry 22. CLI resolution is already manifest-aware. | 28 |

---

## Task details — Lane E (Engine)

### 1.1F-01 · Refs register on the real scope root

**Depends:** — · **Class:** patch · **Touches:** `src/core-src/engine.js` (`handleRef` ~1335-1346, `findScopeRoot` 746-753, `initScope` ~600-610, `getStrayScope` ~549-560, `createForItemScope` ~1760-1800, `$refs` magic 661, `getScopeRefs` 742), `tests/core/runtime-fixes.test.ts`

**Verified cause.** `__faqirScope` means two things: "this is a scope root" and "this node is
already initialised". `handleIf` stamps each clone top node (1699), and `handleFor.createEntry`
stamps each row (1896). The second meaning is load-bearing: `walkChildren` 496, the observer
guard 2771, `findParentScope` 2366 and `walkUnscoped` 538 all rely on it. `handleRef` reads it
as the first, and `findScopeRoot` stops at the clone, so the ref lands in the clone's
`__faqirRefs`, while `$refs` reads `getScopeRefs(root)`. It was reproduced for `l-if` and
`l-for`. Under `l-teleport` the ref lands on the element itself. Refs on stray elements never
resolve, because the stray root is `body` while `findScopeRoot` returns the element.

**Fix.**
- Do **not** touch the stamp. Add a module-level `var scopeRoots = new WeakMap()`.
- Populate it:
  - `initScope`: `scopeRoots.set(scope, root)`.
  - `getStrayScope`: `document.body`.
  - `createForItemScope`: `scopeRoots.set(proxy, scopeRoots.get(parentScope))`.
- `handleRef` resolves with `var root = scopeRoots.get(scope) || findScopeRoot(el);`.
- Use a WeakMap, not a scope property, because a reactive read inside `processElement` would
  subscribe the `l-if`/`l-for` effect.
- Optional, if it fits the budget: after registering, trigger the scope's `$refs` dependency
  (the pattern in `triggerStateDeps` ~2123), so an effect outside the `l-if` re-runs when the
  ref appears.
- The `l-for` rule is "last row wins": the existing `=== el` cleanup guard removes the ref when
  its own row goes. Document this in the `@ui:directive l-ref` line.

**Tests** (`tests/core/runtime-fixes.test.ts`, mounted in a disposable container):
- A ref inside `<template l-if>` is in `$refs` and an `l-effect` can read it.
- A ref inside an `l-for` row: last row wins, and removing that row clears it.
- A ref under `l-teleport`.
- A ref in a stray element.
- Hiding the `l-if` removes the ref.
- (Optional) an outside effect re-runs when the ref appears.

**Acceptance**
- [x] Every case above green; existing `l-ref` tests (`tests/core/faqir-core.test.ts:1726`, `:1833`) unchanged. (Six cases in `tests/core/runtime-fixes.test.ts` › "l-ref registers on the scope root that $refs reads", all six red against the pre-fix engine: `l-if` + `l-effect`, hide/show with an outside `l-text` following both ways, `l-for` last-row-wins and cleared on `pop()`, a row expression reading its own row's ref, `l-teleport` to a target outside the root (the teleported element and a ref inside it), and a stray ref, booted on a private happy-dom `Window` because only bootstrap's unscoped sweep reaches strays. `faqir-core.test.ts` untouched. The optional reactivity went in at no extra mechanism: `getScopeRefs` creates `__faqirRefs` on first read and `handleRef` writes through `reactive(refs)`, so the existing proxy dep for `$refs.name` re-runs readers. The cleanup reads `refs.__target`, not the proxy, so the structural effect tearing the row down never subscribes to it.)
- [x] `build:core`, `build:core-package` (pinned Bun), `bun run size` within budget; `gen:skill` if the `l-ref` line changed. (All under Bun 1.3.8. Size: engine 10.55 → 10.58 KB, engine+controllers 44.73 → 44.77 / 46 KB gzip. Note: `build:core-package` now prints an advisory "OVER — 45.02 KB > 45.00 KB" from its stale `ASSEMBLED_GZIP_BUDGET = 45 * 1024`. The baseline was already 44.99, and the enforced budget is 46 KB in `check-size.mjs` and `tests/build/core-package.test.ts`. The `@ui:directive l-ref` line now documents the `l-if`/`l-for`/`l-teleport` resolution, last row wins, and reactivity; `gen:skill` rewrote `references/directives.md`. `check:skill`, `check:core-package`, `check:docs` green.)

### 1.1F-02 · Property-aware bindings + `faqir:model`; toggle-group follows the store

**Depends:** — · **Class:** patch · **Touches:** `src/core-src/engine.js` (`BOOLEAN_ATTRS` 1168-1172, `handleBind` 1178-1204, `handleModel` 1517-1590: checkbox 1552/1554, radio 1573, switch ~1538, select 1584), `registry/recipes/toggle-group/toggle-group.js` (`syncState` 74-81, `onChange` 94-104, init 190), `registry/recipes/toggle-group/toggle-group.manifest.json`, `tests/core/faqir-core.test.ts` (bind section ~431), `tests/recipes/toggle-group.test.ts`

**Verified cause.**
- Entry 16: `handleBind` only `setAttribute`/`removeAttribute`s booleans. Once a control is
  dirty, `checked`/`selected` stop following the attribute, so both radios look on.
- `muted` and `indeterminate` (no attribute at all) are split the same way. So is `:value` on
  a dirty field: it goes through `setAttribute` at 1199.
- **`open` is not affected** (it is a reflected attribute with no dirty flag); leave it alone.
- Entry 4: `l-model` writes `.checked` silently; toggle-group syncs only on `change`.
  Reproduced: store → `b` leaves `data-state` `[on,off]`. The checked radio also keeps
  `tabindex=-1`, which breaks the manifest's "Tab → the checked control".

**Fix.**
1. Add one engine helper, `writeProp(el, name, value)`. It writes the property only when it
   differs, and for `checked`/`selected` it then dispatches
   `new CustomEvent('faqir:model', { bubbles: true })`, following the existing `faqir:*`
   naming.
   - Do **not** dispatch a native `change`. It re-enters `l-model`'s own listener and fires
     user `@change` handlers on store-driven writes, which can loop
     (`@change="save()"`).
2. `handleBind`: a `PROPS` set (`checked`, `selected`, `muted`, `indeterminate`, `value`). For
   these, set the property as well as the attribute (booleans as `!!value`). For `value`,
   write only when it differs, so the caret does not jump.
3. `handleModel`: route its checkbox, radio, switch and select writes through `writeProp`.
4. toggle-group:
   - Listen for `faqir:model` on the root and call `syncState()` **without** `emitChange()`.
   - Also listen for `reset` on `root.closest('form')`.
   - Remove both listeners in `destroy()`.
   - Plain script writes (`el.checked = x`) stay uncovered. Document that in the manifest
     note; the recipe review found a per-instance property wrap possible, but it is not worth
     the bytes.
5. Document "don't combine `:checked` with `l-model` on one element" (two writers at
   PRIORITY 10).

**Tests**
- Dirty-radio regression: user-check `b`, set the store to `a`, and `a.checked === true`.
- `:indeterminate` sets the property.
- `:value` on a dirty input follows the store.
- toggle-group with `l-model`: a store write moves `data-state` and the roving `tabindex` and
  emits no `faqir:change`. `form.reset()` re-syncs.
- Rewrite the `l-model` block at `toggle-group.test.ts:203-240` to mount into a container
  instead of `Faqir.start()`.

**Acceptance**
- [x] Downstream workarounds become unnecessary: the trace page's `checkView` and the per-item `:data-state` binds. (`checkView` and the per-item `:data-state` binds are now redundant: a store write moves `data-state` and the tab stop — the toggle-group store-write test in `tests/recipes/toggle-group.test.ts`; downstream removal is in 1.1F-32's checklist)
- [x] toggle-group manifest `states` wording: "whenever a control's checked state changes, including `l-model` writes"; `changes` entry; `gen:skill`. (manifest 1.1.1: `changes` entry, `states.off` wording, and a notes line against `:checked` + `l-model`; `gen:skill` run, `check:skill` green)
- [x] Standard controller regeneration set; `bun run size` within budget. (`build:core`, `gen:bindings`, `build:registry-index`, `build:core-package`, `build:audit-browser`, `build:docs` run; engine 10.68/14 KB, engine+controllers 44.90/46 KB gzip, +0.41 KB)

### 1.1F-03 · Inserted content: controllers start before `l-init` / first `l-effect`

**Depends:** 1.1F-02 · **Class:** patch · **Touches:** `src/core-src/engine.js` (observer 2754-2810: own controller 2763, `initTree` 2771-2778, descendant sweep 2781-2785; `handleIf` 1690-1713; `handleFor` insertion loop; `initTree`; bootstrap 2643-2733 for reference), `tests/core/runtime-fixes.test.ts`

**Verified cause.** On all three paths, directives (including `l-init` and the first
`l-effect` run) are bound before the subtree's controllers start:
- **Observer path:** the log reads `init ctrl=false`, `effect ctrl=false`.
- **`l-if`/`l-for`:** the clone is bound before insertion at 1713, and its controllers wait for
  a later mutation record. `$nextTick` doesn't help, because `l-init`'s microtask is queued
  first.
- **Router calling `Faqir.initTree(fragment)`:** same order.
- Bootstrap already runs controllers → `initTree` → a second sweep, so only static content is
  correct.

**Fix.** Do it in this order, which is why 02 must land first.
- **Observer:** move the controller sweep (2762-2764 and 2781-2785) above `initTree`. This is
  a pure reorder.
- **`l-if`/`l-for`:** do **not** start controllers on the detached clone. Ten controllers
  touch `document` or layout at init: carousel, dialog, context-menu, command-palette,
  input-otp, drawer, sheet, slider, sidebar, table.
  1. Keep eager value bindings (`text`/`bind`/`model`/`show`) before insertion. Toggle-group's
     initial `syncState` needs `checked` already set.
  2. While a structural render is in progress, queue `l-init` and the first `l-effect` run in
     a module-level deferral list.
  3. After `insertBefore`, start controllers for the inserted elements and their `[data-ui]`
     descendants synchronously, then flush the list.
  4. The resulting order is bindings → insert → controllers → `l-init`/`l-effect`.
- **Explicit `initTree`:** start the subtree's controllers before running its deferred inits.

**Tests**
- A toggle-group inside `<template l-if>` whose `l-init` reads `$ui('#…')` gets the API, and its
  `data-state` reflects the bound `checked`.
- An `l-effect` inside an `l-if` that reads only `$el.querySelector('#x')` finds it on its
  first run. This is downstream D8c.
- Observer path: content appended after boot. Rely on the auto-boot (it starts on `require`
  via `setTimeout`); wait with `settle()` from `tests/helpers/settle.ts`, and never call
  `start()`.
- The existing `tests/recipes/auto-init*.test.ts` and `tests/core/lifecycle.test.ts` stay
  green.

**Acceptance**
- [x] `$ui()` is non-null in `l-init` for controllers inside inserted content, on all three paths. (`renderThenInit` holds `l-init` / first `l-effect` in a module-level `pendingInits` list while `l-if` / `l-for` render, then starts the inserted nodes' controllers and flushes; nested renders join the outermost. `Faqir.initTree` starts a connected root's controllers first; the observer calls `startControllers(node)` before `initTree`. Six regressions in `tests/core/runtime-fixes.test.ts` "1.1F-03": l-if, l-if `$el.querySelector` effect (D8c), l-for rows, nested l-if, `initTree`, observer — all six fail on the `c2f0f2f` engine)
- [x] The `l-init` line in `docs/` / README states the order: bindings, then insertion, then controllers, then `l-init`/`l-effect`. (README § Directives paragraph after the table; the `@ui:directive l-init` line in engine.js, regenerated into the skill's `directives.md` by `gen:skill`)
- [x] `build:core`, `build:core-package`, size within budget. (also `gen:skill`, `build:docs`; engine 10.74/14 KB, engine+controllers 44.98/46 KB gzip, +80 B; bootstrap/observer sweeps now share `startControllers`)

### 1.1F-04 · `:style` / `:class` merge instead of replace

**Depends:** — · **Class:** patch · **Touches:** `src/core-src/engine.js` (`applyStyleBinding` 1220-1236; `:class` string branch ~1208; `handleShow` ~1621; `@ui:directive l-bind` ~312), `tests/core/faqir-core.test.ts` (431-449)

**Verified cause.**
- `el.style.cssText = value` (1222) wipes whatever `l-show` and controllers wrote. Reproduced:
  a hidden element re-appears and table's `--table-thead-h` is lost.
- Latent bugs in the same code:
  - The first run wipes a static `style="…"`.
  - The object form never removes keys dropped since the last run.
  - The documented array form iterates `'0'`, `'1'` as property names and is ignored.
  - `:class` as a string (`el.className = value`) clobbers controller-added classes the same
    way.

**Fix.**
- Keep `prevKeys` in the binding's closure. Normalise each value to a map of declarations:
  - **string:** parse via a detached scratch element (`scratch.style.cssText = v`, then iterate
    `scratch.style[i]` with `getPropertyValue`/`getPropertyPriority`). This handles custom
    properties, `!important` and `;` inside `url()`.
  - **object:** as today.
  - **array:** merge each entry.
- `setProperty(k, v, priority)` each declaration. `removeProperty` only the keys in `prevKeys`
  that are gone.
- `:class` string: the same diff, as tokens, against the previous run's classes.
- CSSOM writes are not CSP-gated (`docs/security.md` §2), so nothing changes there.
- Dev-build warning (in `dev-diagnostics.js`): a `:style` that declares `display` on an element
  that also has `l-show`.

**Tests** (no static `style` attribute; see the happy-dom trap):
- A string `:style` re-run keeps a controller-set custom property and `l-show`'s `display:none`.
- An object key removed on re-run is removed from the element.
- The array form applies.
- `:class` string keeps a controller-added class.
- A static `style` survives the first run. For this case, test via `setAttribute` after
  mount, not as markup.

**Acceptance**
- [x] Downstream `pages/namespace.html` workaround (`:style` moved to the section) becomes unnecessary. (Its failure is reproduced by `tests/core/faqir-core.test.ts` › "merge instead of replace" › "a string :style re-run keeps a controller's custom property and l-show's display": a re-run keeps `--table-thead-h` and `display:none`, and the test fails on the old engine. `handleBind` keeps `prev` per binding. `styleMap` normalises a string through a detached element's CSSOM, an object (custom properties are no longer lowercased), or an array of either. `applyStyleBinding` calls `setProperty` with priority and removes only the keys its previous run set. `:class` diffs tokens the same way, and a falsy object entry still removes a markup class. The six tests in that block all fail on the old engine. Dev build: new `style` class (`devHooks.styleShow`, once per element), tested in `tests/core/dev-build.test.ts`, with a production-silent check in `faqir-core.test.ts`. Declared in `packages/core/faqir-core.d.ts` and `docs/devtools.md`; that table also gained its missing `key` row. `handleShow` needed no change.)
- [x] `l-bind` directive line updated; `gen:skill`; `build:core`, `build:core-package`, size. (All under Bun 1.3.8. The line now says `class`/`style` merge, and `gen:skill` rewrote `references/directives.md`. Size: engine 10.74 → 10.92 KB, engine+controllers 44.98 → 45.15 / 46 KB gzip (+0.17 KB). `check:skill`, `check:core-package`, `check:docs` (after a local `build:docs`; `site/dist` is ignored), `check:registry-index`, `check:bindings`, `check:audit-browser` and `check:rules-plugin` are green. Testing found the happy-dom trap depends on attribute order; the header note now says so.)

### 1.1F-05 · Methods keep their component's `this` when called from a row

**Depends:** — · **Class:** patch · **Touches:** `src/core-src/engine.js` (`createScopeWithMagics` ~656, `createForItemScope` set trap 1770-1784 and `has` 1788, `snapshotValue` ~2390, `handleFor` setup), `src/core-src/dev-diagnostics.js` (beside `unkeyedReorder` 135 / `duplicateKey` 162), `tests/core/runtime-fixes.test.ts`, `tests/core/dev-build.test.ts`, `tests/core/inspect.test.ts`

**Verified cause.** Inside `with(rowProxy)`, a bare call `pause()` gets the `with` object as
`this`, so `this.problem = x` hits the row's set trap. That trap writes own keys (the loop
variable or index) to the row. Reproduced. The same trap is latent in `apiSource()` methods
(`registry/core/api-source.js:76-88`, `this.loading/error/items`) when the loop variable is named
`items`, `error` or `loading`.

**Fix.**
- In `createScopeWithMagics`, after `var scope = reactive(target)`, bind every own data
  property whose value is a function: `target[k] = d.value.bind(scope)`.
  - Getters are unaffected.
  - Functions assigned later stay unbound, which is acceptable; document it.
  - Do **not** bind in the row `get` trap: it would wrap `$ui` (a callable carrying methods,
    2092-2099) and lose `$ui.open`.
- `snapshotValue`: strip the `bound ` name prefix so `inspect()` output is unchanged.
- Dev warning: at `handleFor` setup, add the dev-marked line
  `if (devHooks && (itemName in scope || indexName in scope)) devHooks.loopShadow(el, itemName)`.
  The `in` check creates no dependency.

**Tests**
- A row calling a component method that writes `this.<loopVarName>` writes the component's
  field, and the row's variable is unchanged.
- `apiSource` `load()` from a row named `items`.
- `inspect()` still names the method.
- Dev build: `loopShadow` warns once. Prod build: no `devHooks` call sites
  (`tests/build/dev-build.test.ts:130-135`). Keep dev assertions in a dev-partition file:
  `scripts/test.mjs` routes any file that `require`s `faqir-core.dev.js` there.

**Acceptance**
- [x] Downstream's `finding` rename in `pages/editor.html` no longer needed. (`createScopeWithMagics` binds every own writable function-valued data property to the reactive scope, writing to the target so nothing triggers. Getters keep their receiver, and functions assigned later stay unbound; the `@ui:directive l-data` line says so. Four cases in `tests/core/runtime-fixes.test.ts` › "1.1F-05": `this.<loopVar>` and `this.<index>` written from a row reach the component while the rows keep their own values; the same from a nested row; `apiSource` `load()` from a row named `items` fills the component's `items`; and a guard that getters and late-assigned functions are untouched. The first three fail on the pre-fix engine. `snapshotValue` strips the `bound ` prefix, so `inspect()` still prints `[Function pause]` (`tests/core/inspect.test.ts`).)
- [x] `build:core`, `build:core-package`, size (warning text in dev build only). (All under Bun 1.3.8. New dev class `shadow` (`devHooks.loopShadow`, once per list and name), called from a `/* @faqir:dev */` line in `handleFor`. It warns only for loop names the author wrote, not the default `item`/`index`, because every nested list with an unnamed index would otherwise warn. Tested in `tests/core/dev-build.test.ts`; `tests/build/dev-build.test.ts` confirms production has no call site. Declared in `faqir-core.d.ts` and `docs/devtools.md`; `faqir-core-types.test.ts` now counts 8 classes. Size under the pinned Bun: engine 10.97 → 11.06 KB, engine+controllers 45.44 → 45.50 / 46 KB gzip. `gen:skill` and `build:docs` run. `check:skill`, `check:core-package`, `check:docs`, `check:registry-index`, `check:bindings`, `check:audit-browser` and `check:rules-plugin` are green. Before starting, the session fixed a red baseline in `3492d2c`: under Bun 1.3.8, `faqir-mask.js` measured 2049 B against its 2048 B budget.)

### 1.1F-06 · `$this` magic

**Depends:** — · **Class:** additive · **Touches:** `src/core-src/engine.js` (`compileExpression` 252-262, `compileStatement` 264-274, `evaluate` 213-222, `evaluateAssignment`, `Faqir.magic`, the §3.0 `@ui:magic` block ~344), `packages/core/faqir-core.d.ts` (`Magics`), `README.md:728`, `docs/security.md:29`, `docs/devtools.md:42`, `tests/core/faqir-core.test.ts` (beside `$el` at 1816), `tests/core/faqir-core-types.test.ts:272-287`

**Verified cause.** `new Function('$scope', '$el', 'with($scope){…}')` is called with the
directive element as `$el`, but the scope's `$el` magic (the root, 660) is found first by
`with`. Reproduced: `l-init` on an `<input>` reads `DIV`.

**Fix.**
- Add a third parameter, `$this`, called as `fn.call(scope, scope, el, el)` in both
  `evaluate` and `evaluateAssignment`.
- **Keep** the `$el` parameter. A top-level `l-data` is evaluated against `parentScope || {}`
  (600), where `$el` currently resolves to the parameter. Removing it breaks
  `l-data="{ x: $el.id }"`.
- `$this` falls through `with` correctly: `reactive()` has no `has` trap, and the row `has`
  trap delegates.
- Reject `this` in `Faqir.magic()`.
- What `$this` resolves to per call site:
  - the directive element, in handlers;
  - the root, for `l-data` and root `l-init`;
  - the `<template>`, for `l-for` list and key expressions.
- No protocol impact (SPEC-1.0 §1.2; `protocol.ts` has no magic data). This is a 1.x additive
  engine API.

**Tests**
- `$this` vs `$el` on an `<input>` inside a `<section l-data>`.
- `$this` in `@click` is the button.
- `l-data="{ x: $el.id }"` still works.
- `Faqir.magic('this')` throws.
- The types drift test passes with `readonly $this: Element`.

**Acceptance**
- [x] `@ui:magic $this | every expression | The element the directive is written on…`; `gen:skill` + `check:skill`. (The line also names what `$this` is in `l-data`, a root's `l-init` and `l-for`'s list/`l-key` expressions, and that it is not a scope key. `gen:skill` rewrote `references/directives.md`; `check:skill` green. `Magics` in `faqir-core.d.ts` gained `readonly $this: Element`; `faqir-core-types.test.ts` passes unchanged. `Faqir.magic('this')` throws `"this" is reserved`.)
- [x] README magics list, `security.md` (the `new Function` signature), `devtools.md` updated; `check:docs`. (README now contrasts `$el` (scope root) with `$this` (`<input l-init="$this.focus()">`); `security.md` shows the three-parameter `new Function`; `devtools.md` notes `$this` is a compiled-function parameter, not on the scope. `check:docs` green after a local `build:docs`.)
- [x] `build:core`, `build:core-package`, size. (All under Bun 1.3.8. Both evaluators call `fn.call(scope, scope, el, el)`; the `$el` parameter stays, so a top-level `l-data="{ x: $el.id }"` still works. Five tests in `faqir-core.test.ts` `$this [1.1F-06]`, mounted in a container: `<input>` vs `<section>` in `l-init`, the button in `@click`, the row element in an `l-for` handler and the `<template>` in its list expression, `l-data` with `$el`/`$this`, and `Faqir.magic('this')`. Size: engine 11.06 → 11.10 KB, engine+controllers 45.50 → 45.55 / 46 KB gzip. `check:core-package`, `check:docs`, `check:registry-index`, `check:bindings`, `check:audit-browser`, `check:rules-plugin` green.)

### 1.1F-07 · Drop the injected `l-cloak` style; CSP docs

**Depends:** — · **Class:** patch (D2) · **Touches:** `src/core-src/engine.js` (`injectCloakStyle` 1365-1373, its call in `bootstrap` 2644), `docs/security.md` §2 (83-106), `README.md:1101-1102`, `tests/generator/security-docs.test.ts:97-104`, `tests/core/lifecycle.test.ts:332-380`

**Verified.**
- The injected text `'[l-cloak] { display: none !important; }'` hashes to
  `sha256-TK7YunP/5zK/OzmXN4Sius1ld5L9fMfv6o9LFcB+vmk=`, and that hash is documented nowhere.
- `security.md` §2 tells users to allow `'unsafe-inline'` or lose `l-cloak`. That is wrong:
  the identical rule ships in `registry/base/reset.css:164-166`, so it is in every bundle and
  every `packages/core/dist/faqir.<theme>.css`.
- The injected copy is added at boot, and `removeCloaks()` runs in the same task. Later
  content is uncloaked before paint (`applyDirective` 1135, and the observer microtask). So the
  injected rule never hides anything that gets painted.

**Fix (D2).**
- Delete `injectCloakStyle` and its call.
- Rewrite §2: `l-cloak` needs the shipped CSS (or an equivalent rule in the page's own
  stylesheet). With no inline style, `style-src 'self'` works; no hash and no
  `'unsafe-inline'` are needed for faqir.
- Fix the README CSP example.
- Fallback if D2 is rejected: keep the injection, document the hash in `security.md`, and add a
  test that recomputes sha256 from `engine.js` and compares it with the docs.

**Tests**
- Invert `security-docs.test.ts:97`: the engine creates no `<style>`.
- `lifecycle.test.ts:375`: replace "injected exactly once" with "uncloaks without injecting".
- A docs test that `security.md` no longer demands `'unsafe-inline'` for `l-cloak`.

**Acceptance**
- [x] Engine creates no inline style; docs and README CSP examples consistent; `check:docs`. (`injectCloakStyle` and its `bootstrap` call are gone; `security-docs.test.ts` now asserts the engine has no `createElement('style')`/`insertRule`/`adoptedStyleSheets`, that `base/reset.css` carries the `[l-cloak]` rule, that `security.md` mentions `'unsafe-inline'` only to say Faqir does not need it, and that the README policy equals the doc's (and neither lists `'unsafe-inline'`). `security.md` §2 is rewritten (`style-src 'self'` is enough; engine-only pages add their own rule), its summary row and §1 policy drop `'unsafe-inline'`. The generated context (`context.ts` `security.csp`) said the same wrong thing and is fixed, with a test. The `@ui:directive l-cloak` line now names `base/reset.css`; `gen:skill` rewrote `references/directives.md`. `lifecycle.test.ts`'s "injected exactly once" is now "uncloaks without injecting a style". `auto-start.test.ts`'s stub detected boot through `document.querySelector`, the removed function's first call; it now watches `querySelectorAll`. `check:docs` green after a local `build:docs`; `site/`'s own `_headers` CSP keeps `'unsafe-inline'` for the docs site's inline styles, not for faqir.)
- [x] `build:core`, `build:core-package`, size (shrinks). (Bun 1.3.8. Engine 11.10 → 11.04 KB, engine+controllers 45.55 → 45.48 / 46 KB gzip (−75 B on the minified bundle). `check:core-package`, `check:skill`, `check:bindings`, `check:registry-index`, `check:audit-browser`, `check:rules-plugin` green.)
- [x] Downstream note: drop the hash from `kernel/static.mjs`'s CSP once on this version. (Row 13 of the un-patch checklist below; `security.md` §2 names the old hash, `sha256-TK7YunP/5zK/OzmXN4Sius1ld5L9fMfv6o9LFcB+vmk=` (recomputed), as droppable from 1.1.2.)

---

## Task details — Lane C (Recipe controllers)

### 1.1F-08 · Overlay focus: focusable panel + no late focus theft

**Depends:** — · **Class:** patch · **Touches:** `registry/recipes/dialog/{dialog.js,dialog.html,dialog.css,dialog.manifest.json}` (`focusInitial` 58-68, `close`/`onEnd` 95-103), `registry/recipes/drawer/drawer.js` (46, 64) + html/css/manifest, `registry/recipes/sheet/sheet.js` (46, 64) + html/css/manifest, `registry/recipes/alert-dialog/alert-dialog.manifest.json` (inherits), `registry/recipes/command-palette/command-palette.js` (close ~66, `previouslyFocused`), `tests/recipes/{dialog,drawer,sheet}.test.ts` (and `overlay-family.test.ts` if parameterised)

**Verified cause.**
- Entry 18: `onEnd` calls `previouslyFocused?.focus()` whatever holds focus by then.
  Reproduced with a 1s transition: focus jumps from a newly focused input back to the opener.
- Entry 19: `panel.focus()` on a panel with no `tabindex` does nothing, so focus stays on
  `body`. The trap holds nothing, and the root's Escape listener never hears a key.
- Drawer and sheet carry both bugs at the same lines; alert-dialog inherits them via
  `createDialog`.

**Fix.**
- **Restore only if nobody took focus.** In `close()`, capture `document.activeElement`
  *before* setting `panel.hidden = true` (once the panel is hidden, browsers move focus to
  `body`). Then:
  `nobodyTookIt = !active || active === document.body || root.contains(active)`.
  Restore only if that holds and `previouslyFocused?.isConnected`.
- **Make the panel focusable.** At init: `if (panel && !panel.hasAttribute('tabindex')) panel.setAttribute('tabindex','-1')`.
  Put `tabindex="-1"` in the canonical HTML too. `trapFocus` already excludes `-1`.
- **No ring on the panel itself.**
  `[data-ui="dialog"] > [data-part="panel"]:focus:not(:focus-visible) { outline: none }` and
  the drawer/sheet equivalents. Reset's global `:focus-visible` (`reset.css:142`) would
  otherwise ring the whole panel on keyboard open.
- **Command palette:** skip restoring to a `previouslyFocused` that is disconnected or hidden.
  It is opened from inside a closing dialog in the downstream repro.

**Tests**
- The race: close with a 1s transition, focus elsewhere, fire `transitionend`, and focus stays.
  Cover dialog, drawer and sheet.
- After open, the panel has `tabindex="-1"`. Assert the attribute, not `activeElement`.
- An opener removed during close is not focused.

**Acceptance**
- [x] Manifests: `a11y.required_attrs` gains `tabindex="-1" on panel (controller adds it if missing)`; a11y note "focus returns to the opener unless focus moved elsewhere while closing"; `changes` + version bumps; `gen:skill`. (dialog, drawer, sheet, alert-dialog 1.0.0 → 1.0.1, each with the `required_attrs` line, an `a11y.notes` sentence and a first `changes` entry; command-palette 1.1.0 → 1.1.1 with a `changes` entry for the hidden/disconnected-opener skip. `tabindex="-1"` added to every panel in the four canonical HTML files. The check is a shared `returnFocus(root, target, active)` in `registry/core/focus.js` (mirrored in engine.js's focus section, which the built core inlines instead of the module); `active` is read in `onEnd` before the panel hides. The no-ring rule is `> [data-part="panel"]:focus { outline: none }` on dialog, drawer and sheet, **not** the plan's `:focus:not(:focus-visible)`: that one never matches on a keyboard open, which is the case it was meant for. alert-dialog.css is unchanged because `tests/themes/contrast.test.ts` counts every `:focus` stylesheet as drawing a ring, and the alert panel is only a fallback target (Cancel takes focus). Seventeen tests in `overlay-family.test.ts` § 4: the 1s-transition race, focus still in the panel, a removed opener (asserts `focus()` is never called, since happy-dom ignores it on a detached node), the tabindex attribute and an author's own tabindex for dialog/drawer/sheet, alert-dialog still focusing Cancel, and the palette's hidden opener. Eleven of them fail on the old controllers.)
- [x] Standard controller regeneration set (HTML changed → `gen:bindings`); size. (Bun 1.3.8: `build:core`, `gen:bindings` (react/vue `_core-focus.ts` + four controllers), `build:registry-index`, `build:core-package`, `gen:skill` (recipes.md Required ARIA lines), `build:docs`. Engine 11.04 → 11.08 KB, engine+controllers 45.48 → 45.56 / 46 KB gzip. All twelve `check:*`/`audit:registry`/`size` gates green.)
- [x] Downstream: `index.html` legend panel's own `tabindex="-1"` becomes optional. (The controller writes it at init when it is missing and leaves an author's own value alone; both are asserted in `overlay-family.test.ts`. Already the "18, 19" row of the 1.1F-32 un-patch checklist.)

### 1.1F-09 · Table: the roving Tab stop never strands

**Depends:** — · **Class:** patch · **Touches:** `registry/recipes/table/table.js` (`setupNavigability` 1669-1683, `moveFocus` 1702-1703, `applyFilters` ~701, `onFocusIn` ~1735), `tests/recipes/table-advanced.test.ts` (889-930)

**Verified cause.** `activeCell` is kept once set, and `first` is chosen only while
`activeCell` is null. When the active row leaves the DOM, every cell gets `-1`, and
`moveFocus` returns early. Reproduced: zero cells have `tabindex="0"`. There are two more
ways to strand it that the downstream patch misses:
- A row hidden by a filter or a collapsed group stays connected but is not in `navMatrix`.
  `applyFilters` never calls `setupNavigability`.
- Cells of a hidden column (`data-col-hidden`) are skipped by `continue` at 1674, so a stale
  `tabindex="0"` on them is never cleared.

**Fix.** At the top of `setupNavigability`, drop `activeCell` when any of these holds:
`!root.contains(activeCell)`, `activeCell.hasAttribute('data-col-hidden')`, or its row is not in
`navMatrix()`. Also:
- Give hidden-column cells `-1`.
- Call `setupNavigability()` at the end of `applyFilters`.
- Optionally fall back to the nearest row and column instead of the first cell.
- Never move focus; only restore the Tab stop.

**Tests.** Remove the active row; filter it out; hide its column. In each case exactly one
cell has `tabindex="0"`, and ArrowDown from it works.

**Acceptance**
- [x] `changes` entry; standard controller regeneration set; size. (table.manifest.json 3.1.1 with a `changes` note; `build:core`, `gen:bindings`, `build:registry-index`, `build:core-package`, `gen:skill` rerun and their `check:*` gates green. `setupNavigability` drops a stale stop whose row is not in `navMatrix()` (which covers removed, filtered and collapsed rows) or whose column is hidden, sets it to `-1`, and gives hidden-column cells `-1`. It now also runs at the end of `applyFilters`, `toggleGroup`, `toggleRow` and `setColumnHidden`; removal was already covered by the observer's `refresh`. Falls back to the first visible cell, not the nearest. Never moves focus. Seven tests in `tests/recipes/table-advanced.test.ts` "the roving Tab stop never strands": a removed row, a filtered row, a hidden column, a hidden column at init, a collapsed group, a collapsed tree parent, and a check that focus is never moved. Six of them fail on the old controller. Engine+controllers 45.56 → 45.60/46 KB gzip.)
- [x] Downstream `indirect:` patch in `recipes/table/table.js` and the core copies can be dropped on upgrade. (The downstream patch only covered a row leaving the DOM. This fix covers that case plus filtered and collapsed rows and hidden columns, so the patch is redundant once the downstream project upgrades.)

### 1.1F-10 · Command palette: case/layout-proof ⌘K, one owner, `data-no-shortcut`

**Depends:** — · **Class:** additive (new prop) · **Touches:** `registry/recipes/command-palette/{command-palette.js,command-palette.html,command-palette.manifest.json}` (`onGlobalKeyDown` ~261, listener 275), `tests/recipes/command-palette.test.ts` (206-232)

**Verified cause.**
- Entry 23: `e.key === "k"` fails for `"K"` (reproduced).
- Entry 32: every instance adds a `document` keydown listener with no opt-out. The registry's
  own `command-palette.html` has three instances (8, 66, 108), so ⌘K opens three stacked focus
  traps.
- The undo-history half of entry 32 cannot be checked in happy-dom.

**Fix.**
- **Matching the key:**
  - `const k = (e.key || '').toLowerCase()` (Chrome autofill sends a keydown with no `key`).
  - `isK = k === 'k' || (!/^[a-z]$/.test(k) && e.code === 'KeyK')`, so non-Latin layouts
    fall back to the physical key.
  - Ignore the event if `e.altKey || e.isComposing || e.repeat || e.shiftKey` (D3).
- **One owner:** start the handler with `if (e.defaultPrevented) return;` and call
  `preventDefault()` when it acts. The first instance in listener order then owns ⌘K, and an
  app handler that pre-empts it wins.
- **Opt-out prop:** `noShortcut: { type: "boolean", default: false, attr: "data-no-shortcut" }`,
  following the `data-no-resize` precedent. Read it live in the handler. Mark two of the three
  example instances with it.
- **Manifest note:** "a search field kept in the page joins the page's undo history; render it
  with `l-if` if that matters".

**Tests**
- `key:"K"` opens; `key:"л"` with `code:"KeyK"` opens; no `key` → no throw.
- Alt+K and ⌘⇧K do nothing.
- Two instances: only the first opens. With `data-no-shortcut` on the first, the second opens.
- A pre-prevented event opens nothing.

**Acceptance**
- [x] `props.noShortcut`, version bump, `changes`, a11y keyboard text "Cmd/Ctrl+K (case-insensitive)"; `gen:skill`, `gen:bindings` (typed prop), `build:registry-index`; standard controller set; size. (command-palette.manifest.json 1.1.1 → 1.2.0: `props.noShortcut` (boolean, `data-no-shortcut`), a `changes` entry, the `Cmd+K / Ctrl+K` keyboard line now reads "toggle command palette (case-insensitive; not with Shift or Alt; off under data-no-shortcut)", and the undo-history note as `a11y.notes`. `onGlobalKeyDown` returns on `e.defaultPrevented`, `data-no-shortcut` (read on each press), Alt/Shift/repeat/`isComposing`, and matches `(e.key || "").toLowerCase() === "k"` or, for a non-Latin key, `e.code === "KeyK"`. Beyond the plan, it also returns when `!root.isConnected`: with one owner per press, a palette removed without `destroy()` would otherwise swallow ⌘K for the live one. The full suite caught exactly that, because earlier test files leave palettes undestroyed in the shared realm. The typed prop comes from a positional `{no_shortcut}` placeholder on the template root, which is how the bindings IR derives boolean props (alert-dialog's `{confirm_required}` is the precedent). React and Vue both gain `noShortcut?: boolean`, and the Vue codegen snapshot was updated for it. The Small and Large example palettes in `command-palette.html` carry `data-no-shortcut`. Twelve tests in `command-palette.test.ts` "the Cmd/Ctrl+K shortcut (1.1F-10)": `K`, `л`+`KeyK`, a Latin non-k on `KeyK`, no `key`, Alt/⌘⇧/Ctrl⇧/repeat/composing, first-of-two owns it, `data-no-shortcut` hands it on, live removal of the attribute, a detached palette, a pre-prevented event, an app handler pre-empting it, and the example page. Eight of them fail on the old controller. Bun 1.3.8: `build:core`, `gen:bindings`, `build:registry-index`, `build:core-package`, `gen:skill` (recipes.md template line) and `build:docs`, with every `check:*`, `audit:registry` and `size` gate green. Engine+controllers 45.60 → 45.69/46 KB gzip.)

### 1.1F-11 · Sidebar: rail chevron flips, trigger label stays stable

**Depends:** — · **Class:** patch · **Touches:** `registry/recipes/sidebar/{sidebar.css (trigger 106-129, rail 196-217), sidebar.html (27, 98-99), sidebar.manifest.json}`, `tests/recipes/sidebar.test.ts`, a Playwright computed-style case

**Verified.**
- No CSS ties the trigger icon to `data-state`.
- The HTML hard-codes both the icon and `aria-label` per instance, so after a toggle both are
  stale. A screen reader says "Collapse sidebar, collapsed", contradicting the
  `aria-expanded` set at `sidebar.js:117`.

**Fix.**
- CSS:
  `[data-ui="sidebar"][data-state="rail"] [data-part="trigger"] > :is(svg,[data-ui="icon"]) { scale: -1 1; }`
  with a transition and a reduced-motion fallback. (Use a descendant selector for now; 1.1F-21
  converts it with the rest.)
- Both examples use the left chevron. The right one is its exact mirror, so the rail-state
  pixels are unchanged.
- One stable label, "Toggle sidebar". Per APG, an `aria-expanded` button must not change its
  name.
- RTL flip: leave it out. It would change 24 RTL baselines. If wanted, add a follow-up row.

**Tests**
- `sidebar.test.ts`: the label is unchanged across `toggle()`.
- Playwright: in rail, `scale` computes to `-1 1`.

**Acceptance**
- [x] Manifest `slots.trigger.description` updated, `changes`; `gen:skill`, `gen:bindings` (HTML), `build:registry-index`, `build:core-package`. LTR baselines pixel-identical. *(sidebar manifest 1.1.0 → 1.1.1: the trigger slot now prescribes one stable name and an inline-start glyph, plus an a11y note and a `changes` entry. `sidebar.css` mirrors `[data-part="trigger"] > :is(svg, [data-ui="icon"])` with `scale: -1 1` in rail, with a `--duration-normal` transition and a reduced-motion `transition: none`. Both examples carry "Toggle sidebar" and the left chevron, and the rail example's right chevron is replaced by its exact mirror. `sidebar.test.ts` +4: the name is unchanged across `toggle()` on desktop (trigger and external button) and through the drawer, the canonical HTML has one label and one glyph, and the rule and its reduced-motion fallback are present. New `tests/browser/sidebar-rail.pw.ts`: the computed `scale` is `-1 1` in a declared rail and `none` when expanded, and it flips both ways under a real click while `toHaveAccessibleName` stays "Toggle sidebar". The spec goes red with the rule neutralised. All 48 `recipe__sidebar__*` visual cases, LTR **and** RTL, match baselines rendered from HEAD on this machine; the Linux container was not run. Regenerated: `references/recipes.md`, `registry-index.json`, `packages/core/cdn.json`. `gen:bindings` and `build:core` were no-ops because the controller is untouched. The size budget is unchanged. The playground pages `playground/{dashboard,index}-v2.html` still hard-code the old labels; they are out of scope.)*

### 1.1F-12 · Nesting, controllers I (high risk) + nesting matrix

**Depends:** — · **Class:** patch · **Touches:** `registry/recipes/tabs/tabs.js` (8-10, `activate` 19-23), `registry/recipes/accordion/accordion.js` (8, delegation 68-89), `registry/recipes/dialog/dialog.js` (27-32, 61-62), `registry/recipes/drawer/drawer.js` (11-14), `registry/recipes/sheet/sheet.js` (11-14), `registry/recipes/sidebar/sidebar.js` (34-39, 117), `registry/recipes/context-menu/context-menu.js` (10-11), their manifests (`changes`), new `tests/recipes/nesting.test.ts`

**Verified.** Each of these was reproduced in happy-dom:
- **tabs:** a nested collapsible's `<summary>` becomes a tab; End focuses it; nested tabs
  shift the trigger↔panel pairing.
- **accordion:** a nested dropdown's trigger collapses the section; a nested accordion
  double-toggles.
- **dialog:** a nested popover's close button closes the dialog.
- **sidebar:** a footer dropdown's `aria-expanded` is forced, and its click rails the sidebar
  (entry 6, already harmful).
- **context-menu:** a dropdown inside the target becomes "the" menu.

`registry/core/` has no ownership helper. tree-view (22-33) and menubar (9-10) guard
same-type nesting only.

**Fix.** Two idioms. Use local one-liners, not a new core module: a core module would need
injection in `scripts/build-core.mjs` plus vendored copies in the bindings.
- **Fixed-anatomy parts**, as `:scope >` chains:
  - tabs: `list = root.querySelector(":scope > [data-part='list']")`; triggers
    `list > [data-part='trigger']`; panels `:scope > [data-part='panel']`. Canonical markup
    is already direct-child everywhere, including settings-page and `l-for`-rendered
    triggers. Optional: pair panels via `aria-controls` instead of by index.
  - accordion: `:scope > item > trigger/content`.
  - dialog/drawer/sheet: `overlay`, `panel`.
- **Action parts** authors wrap (`close`, `confirm`, `cancel`, the sidebar `trigger`,
  context-menu `menu`): a layout-transparent owner guard.
  ```js
  const LAYOUT = new Set(["stack","cluster","grid","container","surface","switcher","aspect-ratio"]);
  const owner = (el) => { let p = el.parentElement?.closest("[data-ui]");
    while (p && p !== root && LAYOUT.has(p.dataset.ui)) p = p.parentElement?.closest("[data-ui]"); return p; };
  ```
  - Start from `parentElement`, because a part can itself carry `data-ui` (19
    `data-ui="button" data-part="trigger"` instances).
  - Delegated handlers must check `owner(e.target.closest(…)) === root`.

**Tests** (`tests/recipes/nesting.test.ts`, a matrix with one row per outer×inner pair):
- tabs ⊃ collapsible; tabs ⊃ tabs; accordion ⊃ dropdown; accordion ⊃ accordion;
  dialog ⊃ popover-with-close; sidebar ⊃ dropdown; context-menu target ⊃ dropdown.
- In each case the inner component keeps its own state, ARIA and tabindex, and the outer
  ignores the inner's parts.
- Also: a wrapped close button (inside a `stack`) still closes the dialog.

**Acceptance**
- [x] Every matrix row green; existing recipe tests unchanged. *(New `tests/recipes/nesting.test.ts`, 15 rows: tabs ⊃ collapsible (End stops at the last tab; the summary gets no `aria-selected`/`tabindex`), tabs ⊃ tabs (outer pairs its own panels, inner untouched both ways), accordion ⊃ dropdown (click and Enter stay with the dropdown), accordion ⊃ accordion (one toggle, outer unmoved, `expand(1)` hits the outer's second item), dialog/drawer/sheet ⊃ popover-with-close (closes the popover only) and ⊃ popover-trigger (not taken as the overlay's own trigger), a close wrapped in `stack > cluster` still closes, alert-dialog with wrapped confirm/cancel plus a nested close (initial focus on its own cancel, no stray `faqir:cancel`), sidebar ⊃ footer dropdown (no forced `aria-expanded`, no rail), context-menu target ⊃ dropdown (opens its own menu), and one row through the built `faqir-core.js` via `initTree` on a container. 14 of 15 fail against HEAD's controllers; the wrapped-close row is the regression guard and passes on both. `tests/core/dom.test.ts` +3 for `owns`/`ownParts`. No existing recipe test changed: tabs 17, accordion 21, dialog 18, alert-dialog 15, drawer 26, sheet 24, sidebar 24, context-menu 13 all pass.)*
- [x] Downstream `indirect:` patch in `tabs.js` (and core copies) can be dropped. *(tabs takes `:scope > list`, `:scope > list > trigger` and `:scope > panel`, in the module, in both engine builds and in the vendored React/Vue copies. The two tabs rows prove the downstream symptom (nested parts shifting the pairing) is gone.)*
- [x] Standard controller regeneration set; size checked. The guard is duplicated per controller, so watch the 46 KB budget; if it is tight, move `owner` into `registry/core/dom.js` and accept the packaging work. *(It was tight from the start, so the guard went into `registry/core/dom.js` as `owns(root, el)` / `ownParts(root, part)`: one `closest('[data-ui]:not([data-ui=stack],…,[data-ui=aspect-ratio])')` from the part's parent, with the same selector mirrored in engine.js §6. `gen:bindings` now vendors `_core-dom.ts` into react and vue; `packages/vue/tests/codegen.test.ts` asserts it. **Budget:** `bun run size` showed 0.31 KB free at HEAD, but the binding constraint is `tests/build/core-package.test.ts`, which gzips the packaged `faqir-core.min.js` (IIFE + sourcemap comment): about 47,054 of 47,104 B at HEAD, so 50 B free. The first cut cost about 180 B and failed that test. To fit, engine §6 dropped five private helpers that nothing in the bundle calls (`$`, `create`, `delegate`, `once`, `waitForTransition`); their ES-module originals in `registry/core/` are unchanged. Result: engine + controllers 45.69 → 45.58 KB, packaged min.js 46,961/47,104 B. Regenerated: `faqir-core{,.dev}.js`, react/vue controllers, `registry-index.json`, `packages/core/cdn.json`; `gen:skill` was a no-op. Eight manifests bumped with `changes`: tabs 1.0.1, accordion 1.0.1, dialog 1.0.2, alert-dialog 1.0.2 (shared controller), drawer 1.0.2, sheet 1.0.2, sidebar 1.1.2, context-menu 1.0.1. `audit:registry` zero findings; every `check:*` green; `bun run test` 7664 + 64 pass / 0 fail; typecheck green. Markup and CSS untouched, so visual baselines were not re-run.)*

### 1.1F-13 · Nesting, controllers II (medium/low risk)

**Depends:** 1.1F-12 · **Class:** patch · **Touches:** `registry/recipes/carousel/carousel.js` (38-43), `registry/recipes/popover/popover.js` (10-12), `registry/recipes/table/table.js` (delegation: focusin 1733, keydown 1891, click 1782 — `tbody.contains` is deep, 751, 1361), and a mechanical `:scope >` pass on command-palette 11-19, combobox 11-15, select-custom 11-17/64, tag-input 36-44, pagination 8-28/91, file-upload 16-52, input-otp 54-91, slider 23-24, calendar 23-26, date-picker 16-18, tooltip 10-11, toast 111/115/200, toggle-group 34, qr-code 420-459; `tests/recipes/nesting.test.ts`

**Verified.**
- carousel: a nested carousel in a slide supplies prev/next, and the outer counted 4 slides
  instead of 2.
- popover: binds a nested component's `close`.
- table: delegated handlers react to a nested table in a detail row. The structural helpers
  at 127-134 already use `.children`.

**Fix.** The 1.1F-12 idioms: `:scope > viewport > slide` for carousel, the owner guard for
popover `close` and table delegation. Elsewhere, add `:scope >` only where the HTML guarantees
direct children. Leave a lookup as-is when its part is legitimately deep, and say so in the
commit body.

**Tests.** Matrix rows: carousel ⊃ carousel, popover ⊃ dialog-with-close, table ⊃ table in a
detail row (keyboard, click and filter stay on the outer table).

**Acceptance**
- [x] Matrix green; the standard controller regeneration set; size. *(`tests/recipes/nesting.test.ts` gains a "nesting matrix II" block. Its rows are carousel ⊃ carousel (each counts 2 slides; inner prev/next/dots move only the inner; the outer's own controls still work; destroy re-hides only its own controls), popover ⊃ dialog-with-close (the dialog's close leaves the popover open; the popover's own close still works), tooltip ⊃ collapsible-as-trigger (the tooltip shows its own content and leaves the collapsible's alone), and two table ⊃ table-in-a-detail-row rows. The first: focus and ArrowDown in the inner grid leave the outer's roving stop on its header, and the outer still navigates. The second: an inner row-toggle toggles once; the inner quick filter filters only inner rows; `clearFilters()` on the outer leaves the inner's input alone; `hideColumn` does not reach the inner's tfoot. One more row runs through the built engine via `initTree`. All 5 module rows and the built-engine row fail against HEAD's controllers. Fixes: carousel takes `:scope > [data-part='slide']` from the viewport, gets prev/next/status/dot and the controls/dots containers through `ownParts`, and its click handler matches buttons by identity. Popover `close` and tooltip `content` go through `ownParts`; popover trigger and content stay first-in-document-order, which is always the popover's own. Table adds `mine(el)` (nearest `[data-ui='table']` is this root). It wraps the seven delegated root/tbody listeners and is used for the tfoot and quick-filter lookups; the pinned-row probe in `measureSticky` reads `bodyRows()`. Left as-is, with reasons in the commit body: command-palette, combobox, select-custom, tag-input, pagination, file-upload, input-otp, slider, toast, toggle-group, qr-code (no slot that holds a component, and `:scope >` would break authored wrappers), calendar (in legacy flat date-picker markup its root is the popup, so an owner check would find nothing), and date-picker (it reaches into its nested calendar on purpose). A scan of every repo page, example and binding template found no in-scope part owned by a non-layout wrapper. **Budget:** packaged `faqir-core.min.js` 46,961 → 47,015 / 47,104 B; `size` engine + controllers 45.58 → 45.64 KB. Carousel's standalone `js_budget` is 1535 / 1536 B after the `ownParts` import, which needed the click-handler trim. A carousel-local "outside the viewport" helper fitted with room to spare but cost the engine 26 B more. Regenerated: `faqir-core{,.dev}.js`, react/vue controllers, `registry-index.json`, `packages/core/cdn.json`; `gen:skill` and `gen:schema-refs` no-ops; `site/dist` rebuilt (ignored). Manifests bumped with `changes`: carousel 1.1.1, popover 1.0.1, tooltip 1.0.1, table 3.1.2. `audit:registry` zero findings; every `check:*` green; `bun run test` 7670 + 64 pass / 0 fail; typecheck green. Markup and CSS untouched, so visual baselines were not re-run.)*

### 1.1F-14 · Table: ARIA grid handling of interactive cell content

**Depends:** 1.1F-09, 1.1F-13 · **Class:** additive / behaviour change (D4) · **Touches:** `registry/recipes/table/{table.js,table.manifest.json}` (`setupNavigability`, keydown early return 1889, Enter/F2 branch ~1967, `onFocusIn` 1735, observer 2093), `tests/recipes/table-advanced.test.ts`

**Verified.** `setupNavigability` sets `tabindex` on cells only, so links and buttons stay in
the Tab order. Line 1889 (`if (target.closest?.("input,select,textarea,button,a")) return;`)
makes arrow keys dead while focus is on a link inside a cell.

**Fix (APG grid).**
1. When navigable, set interactive descendants of cells to `tabindex="-1"`, remembering
   originals in a `WeakMap`. Restore them in `destroy()` or when navigation is turned off.
   Re-scan in `refresh()`, because the observer is `childList` on `tbody` only.
2. Enter/F2 on a cell with controls (after the group, tree and editable branches) focuses the
   first control.
3. Escape in a cell control returns focus to the cell. Put this before the 1889 early return.
4. **Keep focusable:** the header filter inputs, the header checkbox, row checkboxes (Space
   already selects), drag handles and expanders. The inline editor's `stopPropagation`
   (~1046) stays.

**Tests**
- A link in a cell gets `tabindex=-1`.
- Enter focuses the link; Escape returns to the cell.
- `destroy()` restores the original `tabindex`.
- A row checkbox still toggles with Space.

**Acceptance**
- [x] Manifest `a11y.keyboard` gains the Enter/F2 and Escape rows; the `navigable` prop description is updated; `changes` flags the behaviour change; `gen:skill`. *(table.manifest.json 3.1.2 → 3.2.0. The "Enter / F2 on a cell" row now ends "otherwise focus the cell's first link, button or field (navigable)", and there is a new "Escape in a link, button or field inside a cell" row. The `navigable` prop description names the Enter/F2/Escape behaviour, the tabindex=-1 demotion and its restore, and the controls that stay focusable. The 3.2.0 `changes` note opens with "Behaviour change:". `gen:skill` rewrote `references/recipes.md`.)*
- [x] Standard controller regeneration set; size. *(`setupNavigability` gives every `input,select,textarea,button,a[href],[tabindex]` inside a navMatrix cell `tabindex="-1"`. It skips the table's own checkbox, drag-handle, expander and row-toggle parts, and anything owned by a nested table (`mine`). Originals go in a `WeakMap`, which `destroy()` reads to put each one back. It runs on every refresh, filter, collapse and column hide, so the observer's refresh covers rows added later. Header filter inputs live in the filter row, which is outside navMatrix, so they are never touched. Enter/F2, after the group, tree and editable branches, focuses the cell's first such control. Escape on a demoted control returns focus to its cell, and that check runs before the input/button/link early return. `onFocusIn` now moves the Tab stop to a cell when focus lands on one of its demoted controls, e.g. from a pointer click. The inline editor's `stopPropagation` is unchanged. Ten tests in `tests/recipes/table-advanced.test.ts` "links and buttons inside navigable cells": demotion; own controls kept; non-navigable untouched; Enter → link, Escape → cell, then ArrowDown works; F2 picks the first of two buttons; Enter on a cell with no controls; pointer focus moves the stop; destroy restores absent and authored `tabindex="2"`; a row added later is demoted; a row checkbox's Space is not prevented and its click selects. Five of them fail on the old controller. Regenerated: `faqir-core{,.dev}.js`, react/vue controllers, `registry-index.json`, `packages/core/cdn.json`, the skill. `gen:schema-refs` was a no-op, and `site/dist` was rebuilt (ignored). **Budget:** the feature cost 185 B on the packaged `faqir-core.min.js` (47,013 → 47,198 / 47,104). Behaviour-preserving trims in table.js brought it back to **47,095** (9 B left): shared `sortChanged()`/`selectionChanged()` epilogues, a two-line `updateHeaderCheckbox`, `setAllExpanded`, one `Intl.NumberFormat` call in `formatValue`, `cellFormatOf` reused in `writeAggregate`, a single `dropPos(e, el, horizontal)`, the editor's `stopPropagation` hoisted, and the dead guards dropped from `elementAt`/`focusCell`. `size`: engine + controllers 45.64 → 45.74 / 46 KB. `audit:registry` zero findings; every `check:*` green; `bun run test` 7680 + 64 pass / 0 fail; typecheck green. Markup and CSS untouched, so visual baselines were not re-run.)*
- [x] Downstream: `app/keys.mjs`'s Enter-opens-first-link becomes redundant for cells with a single link. *(Partly. The controller follows APG: Enter **focuses** the cell's first link, and a second Enter follows it natively. Downstream can drop its handler if two presses are acceptable. If one press must still open the link, keep the handler. It now only needs to call `.click()`, because focus, Escape and the Tab order are handled.)*

---

## Task details — Lane S (Styles and tokens)

### 1.1F-15 · `gen:component-tokens` + registry gate

**Depends:** — · **Class:** patch (tooling + metadata) · **Touches:** new `scripts/gen-component-tokens.mjs` (+ `package.json` `gen:component-tokens` / `check:component-tokens`), `scripts/registry-audit.mjs` (gate 7), `src/commands/conform.ts` (79-86, reuse its header writer), `CONTRIBUTING.md` (tokens_used definition), ~65 component manifests + ~70 stylesheet headers (generated), `scripts/release.mjs` (add the check to preflight), `AGENTS.md` (generated-artifacts list)

**Verified.** Across 86 components with CSS and 358 defined tokens, no gate compares the
three lists:

| Comparison | Components that differ |
|---|---|
| header vs CSS | 70 |
| `tokens_used` vs CSS | 65 |
| header vs `tokens_used` | 29 (the same 29 that `FAQIR-PLAN-1.1.md:263` names) |
| all three agree | 15 |

- 187 tokens the CSS reads are missing from `tokens_used`, across 40 components.
- 121 `tokens_used` entries are genuinely stale. Another 72 are alias-reachable, mostly
  `color-ring` via `--focus-ring-color` in 26 components.
- Worst offenders: auth-form, document, callout, dialog, wizard, dashboard-shell, key-value.
- What exists today: per-component tests for 5 layout primitives only, informational
  `faqir trace`, and `faqir conform`, which writes the header *from* `tokens_used`.

**Fix (D5).**
- **Generator:** `tokens_used` = the tokens the component's CSS references directly. Keep
  alias-reachable extras. Remove the rest. Write the `@ui:tokens` header from the result.
  - Edit in place with text substitution, **not** a JSON round-trip. A round-trip once
    reformatted 1,697 lines (`FAQIR-PLAN-1.1.md:201`).
  - Stable order.
- **Gate 7 in `registry-audit.mjs`:**
  - every `var(--x)` in the CSS is in `tokens_used`;
  - nothing in `tokens_used` is unreachable;
  - the header equals `tokens_used` exactly.
- Whether metadata-only manifest edits bump `version`: decide in-session. Recommended: no
  bump, and one `changes` line per component.

**Tests.** `tests/registry/component-tokens.test.ts`:
- The gate passes on the regenerated registry.
- A planted undeclared `var(--space-9)` fails it with the file and line.
- A planted stale entry fails it.
- `color-ring` reached through an alias is accepted.

**Acceptance**
- [x] `bun run check:component-tokens` and `audit:registry` green; `release.mjs` preflight runs it; CONTRIBUTING and AGENTS list the generator. (Rules in new `src/component-tokens.ts`, shared by `scripts/gen-component-tokens.mjs` and **gate 8** of `registry-audit.mjs` — the file already had a gate 7, so the new one is 8 and the header now lists all eight. The extractor reproduces this section's verified numbers exactly (86 / 358 / 70 / 65 / 187 across 40 / 121 / 72). On the old tree gate 8 reports 337 findings with file:line; after `gen:component-tokens` it reports zero: 55 manifests and 63 stylesheets rewritten, and form-page and wizard, which had no machine header, got one. Order: existing entries kept, new reads appended, then grouped by family, so a rerun is a fixed point. Manifests in `JSON.stringify(…, 2)` form, which are the 22 recipe manifests `build:manifest-api` byte-compares, keep one entry per line. The rest are wrapped before 100 columns. `conform` now writes its header through the shared `cssTokensHeader`. `check:component-tokens` is in `PREFLIGHT` and `docs/release-checklist.md`, the CONTRIBUTING `tokens_used` entry carries D5's definition, and AGENTS lists the generator under generated artifacts. Version decision: **no bump and no `changes` line.** `changes[].version` is the component's own version, so a line without a bump would file the note under a release that never had it.)
- [x] `gen:skill`, `build:registry-index`, `check:schema-refs` green. (`gen:skill` rewrote `references/manifest.md`, which quotes button's manifest and header verbatim. `build:core-package` (pinned 1.3.8) re-hashed 27 theme bundles in `cdn.json`. `build:docs` has to run **after** it, because every page embeds those hashes. All 13 `check:*`/`audit:registry`/`size` gates green.)
- [x] Later Lane S tasks use the generator instead of hand-editing headers. (The environment-facts note "What to regenerate after a CSS edit" now starts with `gen:component-tokens` and gives the order index → skill → core-package → docs. `check:component-tokens` and gate 8 fail any hand-edit that drifts.)

### 1.1F-16 · Overflow: stack, grid, and unbreakable tokens

**Depends:** — · **Class:** patch · **Touches:** `registry/primitives/stack/stack.css` (137-143), `registry/primitives/grid/grid.css` (46-66, 158-163, 194-199, 216-221, 238-243), `registry/primitives/description-list/description-list.css` (55), `registry/primitives/text/text.css` (heading 5-17, mono 89-92), `registry/primitives/breadcrumb/breadcrumb.css` (5-9), `registry/recipes/table/table.css`, their manifests, `tests/primitives/{stack,grid}.test.ts`, a Playwright wide-content spec

**Verified in Chromium.** These are synthetic copies of the downstream layouts at a 390px
viewport. No registry reference page moves with any of these fixes.

| Case | Before | After | What fixes it |
|---|---|---|---|
| Stack shell (sidebar + flex column + 1400px table) | 1600px | 390px | stack fix |
| Grid with a 900px table | 900px | 390px | grid fix |
| description-list horizontal | 891px | 390px | grid-template fix |
| Heading in a cluster row | 1117px | 390px | **only** `anywhere` (`break-word` stays at 1117px) |
| Mono span | 595px | 390px | stack fix + `anywhere` |
| Breadcrumb | 454px | 390px | `anywhere` on the root |

**Fix.**
- **Stack:** `min-inline-size: 0` in both the `data-flex="1"` and `"auto"` rules.
- **Grid:** change all 30 `repeat(n, 1fr)` to `repeat(n, minmax(0, 1fr))`. This is the registry
  precedent (`dashboard-shell.css:16-19`, `watermark.css:51`, `file-upload.css:75`). Do
  **not** use the item rule `> * { min-width:0 }`: it loses to the `data-scroll` restore at
  `grid.css:185-186`.
- **description-list horizontal:** `minmax(8rem, auto) minmax(0, 1fr)`.
- **`overflow-wrap: anywhere`** on `[data-ui="heading"]`, `[data-ui="text"][data-variant="mono"]`
  and the `[data-ui="breadcrumb"]` root, with the table exception:
  `[data-ui="table"] [data-part="td"] :is([data-ui="text"],[data-ui="heading"],[data-ui="breadcrumb"]) { overflow-wrap: inherit; }`.
  Without it, a table of ids is squeezed to the viewport and each id breaks one character per
  line. With it, the table keeps its width and scrolls in its box.

**Tests**
- Stylesheet assertions: stack `min-inline-size: 0` in both rules; no `repeat(N, 1fr)` left
  in `grid.css`. Update the ~12 grid expectations (`grid.test.ts:243-272`, `:361`).
- `overflow-wrap` on the three selectors and the table exception.
- Playwright (`tests/visual/narrow-fit.pw.ts` or a new spec): the six fixtures above stay
  within 390px; a long-id table scrolls inside its box.

**Acceptance**
- [x] Manifests: stack 2.0.1, grid 2.2.0, text/breadcrumb/table/description-list `changes`. (stack 2.0.1 and grid 2.2.0 as named. The other four each took a patch bump with their `changes` line, because `changes[].version` is the component's own version (the 1.1F-15 decision): text 1.1.2, breadcrumb 1.0.1, description-list 1.0.1, table 3.2.1. Breadcrumb and description-list had no `changes` array until now. Stylesheet assertions: `stack.test.ts` (`min-inline-size: 0` on `data-flex="1"` and `"auto"`, absent on `"none"`), `grid.test.ts` (no `repeat(N, 1fr)` left, exactly 30 `minmax(0, 1fr)` tracks; 13 expectations updated, plus 7 in `stats-dashboard.test.ts`, which resolves against `grid.css`), and new `tests/primitives/overflow-wrap.test.ts` (the three `anywhere` selectors, the table exception, the description-list template, the four manifests). The exception is `td` only, as written: header cells are `white-space: nowrap`, so nothing in a `th` can break, and a test pins that.)
- [x] `build:registry-index`, `build:core-package` (pinned Bun), `check:docs`; reference-page baselines unchanged. (Regenerated in the documented order; `gen:component-tokens`, `build:manifest-api` and `gen:skill` wrote nothing. `cdn.json` re-hashed the 27 theme bundles and no engine file. All 13 `check:*` / `audit:registry` / `size` gates and `typecheck` green on Bun 1.3.8; `bun run test` 7,707 pass / 0 fail. Baselines: 250 captures (every component in the default theme, light, LTR and RTL at 1280px, plus the whole responsive matrix at 390/768/1280) were taken on the unfixed tree and compared after the fix on macOS Chromium: 250 identical. The canonical Linux-container run was not done in this session. New `tests/visual/wide-content.pw.ts`: the six fixtures above, plus a `data-flex="auto"` one, stay within 390px; a table of ids scrolls in its root with no id broken; and each fix is reverted by an injected override to prove the assertion fails without it. All 7 fixtures failed on the unfixed tree; 16 of 16 pass now. `narrow-fit`, `layout-lint`, `rhythm` and the other geometry specs: 76 pass.)
- [x] Downstream `indirect:` patches in stack/grid/text/breadcrumb/table/`faqir.bundle.css` can be dropped. (Each patch `faqir_bugs.md` entries 25–27 describe is now upstream or superseded. Stack: `min-inline-size: 0` on both rules. Grid: the downstream item rule `> * { min-width: 0 }` is replaced by `minmax(0, 1fr)` tracks, which also survive `data-scroll`. Text and breadcrumb: the same `anywhere` on the same three selectors. Table: the downstream rule covered `th` and `td`; upstream covers `td`, and `th` cannot wrap. description-list's horizontal track is fixed as well, which the downstream had not patched.)

### 1.1F-17 · Button: `aria-pressed` state; link variant keeps its box under a size

**Depends:** 1.1F-15 · **Class:** additive (new state) · **Touches:** `registry/primitives/button/{button.css (link 92-98, sizes 104-114), button.manifest.json (states 47-51), button.html}`, `registry/primitives/toggle/toggle.css` (forced-colors), `site/styles/docs.css` (446-456, 1046-1050), `tests/primitives/` (pattern of `batch2.test.ts:75,158`), `tests/visual/variant-consistency.pw.ts`

**Verified.**
- Entry 14: no `aria-pressed` rule and no pressed state. SPEC §3.2 requires any attribute a
  stylesheet selects on to be declared, so the manifest state is mandatory once the CSS uses
  it. The `toggle` primitive has a pressed style but no variants. The docs site hand-rolls
  pressed buttons three times.
- Entry 24: a size rule overrides the link variant (same specificity, later in the file).
  Measured: 32px tall, 12px padding.

**Fix.**
- **Pressed:** add a rule for default, outline and ghost (and no-variant) with
  `[aria-pressed="true"]`: `background: var(--color-primary-subtle); border-color: var(--color-primary); color: var(--color-primary)`,
  plus a `:hover` twin.
  - Do **not** use the "secondary fill": `--color-secondary` equals `--color-bg-subtle`, so
    pressed would look like hover.
  - Filled variants get no pressed style; the manifest note points to `toggle`.
  - Forced-colors: `Highlight`/`HighlightText`, in button **and** toggle.
- **Link + size:** after the size rules,
  `[data-ui="button"][data-variant="link"][data-size] { height: auto; padding-inline: 0; }`.
  Measured: 14px, 0 padding, font-size still 12px. No audit refusal: it would need a schema
  field and a SPEC §9 row, and composing the two is the right meaning.
- **Docs site:** delete `docs.css:1046-1050`. Bump `:446` to
  `[data-ui="button"][data-theme-pick][aria-pressed="true"]` if the solid fill should stay
  (this covers follow-up 1.1F-35).

**Tests**
- Stylesheet: the pressed rules exist for the three variants; the link+size rule follows the
  sizes.
- Manifest: `states.pressed.attr === "aria-pressed"`.
- Playwright geometry: link+sm height equals line height.

**Acceptance**
- [x] Manifest: `states.pressed`, a11y note (`type="button"`, the label must not change with state), `html_pressed` template, version 1.2.0, `changes`; tokens via `gen:component-tokens`. (button 1.2.0: `states.pressed` (`attr: "aria-pressed"`, with a description), a `required_attrs` line and `a11y.notes` (`type="button"`; keep `aria-pressed="false"` when off instead of removing it; the label does not change), `html_pressed` on the outline variant, two safe and one unsafe transform, a `changes` entry covering both fixes. `gen:component-tokens` added `color-primary-subtle` to `tokens_used` and the header. CSS: one pressed rule and a `:hover` twin for `:where(:not([data-variant]), default, outline, ghost)`, placed after the variants and before `loading`, so both sit at a variant rule's specificity and win on order; the `link` + `[data-size]` rule after the sizes; a forced-colors block (`Highlight`/`HighlightText`, twin included) in button and toggle (toggle 1.1.1). button.html gained five examples, recorded in `reference-contract.test.ts`'s `INTENDED_ROOT_CHANGES`. Tests: new `tests/primitives/button.test.ts` (18 cases: rules, order, forced colors, manifest, docs.css; 9 fail on the old stylesheets) and four Chromium cases in `variant-consistency.pw.ts` (computed pressed paint per variant and under hover, no pressed paint on primary/secondary/destructive/link, forced colors for button and toggle, link + sm/lg height = one line of text with 0 padding and the size's font size; 3 fail on the old stylesheets, the fourth is a guard). Docs site: the preview-width and scheme-pick rules are deleted and the theme pick is `[data-ui="button"][data-theme-pick][aria-pressed="true"]`, checked in Chromium to stay solid under hover. That closes follow-up 1.1F-35.)
- [x] `gen:skill`, `gen:bindings`/`check:bindings` (new state), `build:registry-index`, `build:core-package`, `check:docs`. (All run on Bun 1.3.8 in the documented order; `cdn.json` re-hashed the 27 theme bundles only. All 13 `check:*` / `audit:registry` / `size` gates and `typecheck` green; `bun run test` 7,798 pass / 0 fail. **The bindings needed more than regeneration.** Their runtimes rendered every `aria-*` state as `"true"`/`"false"` always, so `LButton` would have put `aria-pressed="false"` on every button and announced each one as a toggle. An aria state is now *optional* (absent until the prop is given) unless the manifest also declares a prop of the same name with a default, which is how toggle keeps always rendering it: `IRState.optional` in `src/bindings/ir.ts`, `optional: true` in the emitted spec, and both hand-written runtimes (Vue needs an explicit `default: undefined` to stop Boolean casting). Tests: `tests/bindings/aria-state.test.ts`, one case each in the react and vue `components.test`, codegen snapshots (button only). CONTRIBUTING and both binding READMEs say so. No engine or controller change, so the packaged `min.js` budget is untouched.)
- [x] Downstream: the Tail button's variant swap and the editor pointers' missing `data-size` are no longer needed. (Tail is an outline button with `aria-pressed`, which is one of the three styled variants, so the swap to `secondary` can go; rows 14 and 24 of the un-patch checklist already name both. A link button now takes `data-size` and keeps a 0-padding, one-line box, measured in Chromium. Pause still needs its downstream change: its label flips to Resume, which the new a11y note says a toggle button must not do.)

### 1.1F-18 · Text: an anchor carrying `data-ui="text"` reads as a link

**Depends:** 1.1F-15 · **Class:** patch · **Touches:** `registry/primitives/text/{text.css,text.manifest.json,text.html}`, `tests/primitives/`

**Verified.** `reset.css:104-107` gives `a` an inherited colour and decoration, and `text.css`
gives an anchor nothing back. Also, `color-destructive` (`text.css:107`) is missing from the
header and the manifest; 1.1F-15 fixes that.

**Fix.** Place this before the done-state rule, so a done link keeps its strikethrough:
```css
[data-ui="text"]:any-link { text-decoration-line: var(--link-decoration); text-decoration-thickness: var(--link-thickness);
  text-underline-offset: var(--link-underline-offset); text-decoration-color: currentColor; cursor: pointer; }
[data-ui="text"]:any-link:focus-visible { outline: var(--focus-ring-width) var(--focus-ring-style) var(--focus-ring-color);
  outline-offset: var(--focus-ring-offset); box-shadow: var(--focus-shadow); }
```
- `:any-link` selects on no attribute, so nothing new needs declaring under SPEC §3.2.
- Use `currentColor`, not a faint colour. `--color-fg-subtle` is not contrast-gated, and the
  downstream found it too faint in dark mode.
- A `link` `quiet` variant is allowed (additive) but optional. Leave it out unless asked.

**Tests.** Stylesheet: the `:any-link` rule exists, before the done rule, with only link and
focus tokens. Manifest: an `html_link` template exists.

**Acceptance**
- [x] Manifest template + note + `changes`; tokens via `gen:component-tokens`; `gen:skill`, `gen:bindings` (template), `build:registry-index`, `build:core-package`. (text 1.1.3: `templates.html_link` (`<a data-ui="text" … href="{href}">`), `a11y.notes` (when an anchor root is right, that an anchor with no href is not styled, when `data-ui="link"` fits better) and `a11y.keyboard.Enter`, one safe transform, a `changes` entry. CSS: the two rules exactly as specified, placed before the done state. `gen:component-tokens` added the three link and five focus tokens to `tokens_used` and the header. text.html gained three anchors (plain, mono `sm`, muted done), recorded in `reference-contract.test.ts`'s `INTENDED_ROOT_CHANGES`; the Linux visual baselines for text's reference will therefore differ, intentionally. Tests: new `tests/primitives/text-link.test.ts` (13 cases, 11 red on the old tree: the rule and its declarations, no colour/face/size, no `--color-fg-subtle`, the focus rule equal to link.css's, link and focus tokens only, before the done rule, no `[href]` selector, headings untouched, template, tokens, notes, changes, reference) and two Chromium cases in `variant-consistency.pw.ts` (computed underline at 1px in the text's own colour for default, mono, muted and primary, same colour/face/size as the non-anchor twin, an anchor without href and a `<span>` not underlined, a done link `line-through`; the focus ring equal to the link primitive's. The first fails on the old stylesheet; the second is a guard, since the reset's `:focus-visible` already drew that ring). Regenerated on Bun 1.3.8 in the documented order: `build:registry-index`, `gen:skill` (primitives.md), `gen:bindings` (no diff: primitive bindings read `anatomy.tag`, not templates, so `LText` still renders a `<p>`), `build:core-package` (`cdn.json` re-hashed the 27 theme bundles), `build:docs`. All 13 `check:*` / `audit:registry` / `size` gates and `typecheck` green; `faqir audit --stdin` on text.html clean; `bun run test` 7,811 pass / 0 fail. `overflow-wrap.test.ts` pinned text's *current* version at 1.1.2; it now asserts the 1.1.2 `changes` entry only. No engine or controller change.)
- [x] Downstream `indirect:` text-link patch and the matching `diff-view`/`form-block` rules can be dropped. (The `a[data-ui="text"][href]` patch in `text.css` is superseded: same three `--link-*` tokens, on `:any-link`, with the underline in `currentColor` at rest instead of a faint colour that darkens on hover. Row 28 of the un-patch checklist already names it. Two parts stay downstream's own: `diff-view` and `form-block` are its components, so their copies go only where the link is an `<a data-ui="text">` (it then inherits this rule); and the patch's second selector, a `text` child of an `a[data-ui="cluster"][href]`, is not covered here, because the anchor there is the cluster, not the text.)

### 1.1F-19 · `--mono-ligatures` token

**Depends:** 1.1F-15 · **Class:** additive (new token; theme surface 284 → 285) · **Touches:** `registry/tokens/typography.css` (6), `registry/primitives/text/text.css` (90-92), `registry/primitives/kbd/kbd.css` (17), `registry/base/prose.css` (74, 82), `registry/recipes/command-palette/command-palette.css` (165), `registry/recipes/barcode/barcode.css` (29), `tests/tokens/role-tokens.test.ts` (~135), `tests/themes/manifest.test.ts` (223, 254), 27 `registry/themes/*.theme.json` (generated)

**Verified.** `--font-mono` names Cascadia Code and JetBrains Mono, and both ligate by
default. This happens on any machine with Cascadia installed, not only after
`faqir fonts add`. No stylesheet sets `font-variant-ligatures`. An `@font-face` descriptor is
ignored by Chrome and Safari, and would not reach system fonts anyway.

**Fix.**
- `typography.css`: `--mono-ligatures: none;`.
- Add `font-variant-ligatures: var(--mono-ligatures)` beside each of the six `--font-mono`
  `font-family` declarations. `none` also disables `calt`, which is how JetBrains Mono
  ligates.
- **Name it `--mono-ligatures`, not `--font-mono-ligatures`.** The docs generator treats any
  `font-*` typography token as a family (`src/generator/docs.ts:1396`, `2321-2323`) and would
  render a fake family card.
- Known gap, document it: the terminal theme uses mono for body text (`themes/terminal.css:70-72`),
  and that is unaffected.

**Tests.** Every rule whose `font-family` reads `var(--font-mono…)` also declares
`font-variant-ligatures: var(--mono-ligatures)`, and `typography.css` defines it as `none`.
Update the surface count to 285.

**Acceptance**
- [x] `gen:theme-manifests` (27 files, `tokens_inherited` only), `gen:component-tokens`, `gen:skill`, `build:core-package`, `check:docs`. (`typography.css` defines `--mono-ligatures: none` under a new "Code Face" block whose comment states the terminal gap. The six rules in five files (`text` mono, `kbd`, prose `code` and `pre`, command-palette's `kbd` part, barcode's caption) declare `font-variant-ligatures: var(--mono-ligatures)` beside the mono `font-family`; command-palette's carries a `none` fallback, as that file's other declarations do. Manifests, each with a `changes` note: text 1.2.0, kbd 1.1.0, command-palette 1.3.0, barcode 1.1.0 (minor, since each reads a new themable token; kbd and barcode had no `changes` array until now). `gen:theme-manifests` added one `tokens_inherited` line to each of the 27 theme manifests and nothing else; `gen:component-tokens` wrote the four manifests and four headers. Tests: a fifth block in `tests/tokens/role-tokens.test.ts` (7 cases: the default, not a `--font-*` name, the sweep finds exactly the six rules, each declares the token, no rule sets ligatures any other way, the four manifests, no theme re-declares it; 4 red on the old stylesheets), the surface count at 285 in `tests/themes/manifest.test.ts`, and one Chromium case in `variant-consistency.pw.ts` (all six surfaces compute `none`, a wrapper setting `--mono-ligatures: normal` gives `normal` back, non-mono text and a prose paragraph stay `normal`; red on the old stylesheets). **The docs generator needed the token too**, which the Touches list did not name: `docs-foundations.test.ts` requires every typography token on the Typography page with a live preview rule, so `src/generator/docs.ts` has a `CODE_FACE_PROPERTY` map and a "Code face" section with a mono specimen, checked in Chromium on the built page. Regenerated on Bun 1.3.8 in the documented order: `build:registry-index`, `gen:skill` (tokens.md: 359 tokens, typography 29), `gen:bindings` and `build:manifest-api` (no diff), `build:core-package` (`cdn.json` re-hashed the 27 theme bundles only), `build:docs`. All 13 `check:*` / `audit:registry` / `size` gates and `typecheck` green; `faqir audit --stdin` clean on the four reference pages; `bun run test` 7,818 pass / 0 fail. No canonical HTML, engine or controller change. macOS's `ui-monospace` has no ligatures, so nothing moves there; the Linux-container visual run was not done. The docs site's own 13 mono rules in `site/styles/` are not registry surfaces and still ligate: follow-up 1.1F-38.)
- [x] Downstream `form-block` and Kernel op-reference ligature workarounds can be dropped. (The Kernel op reference is `text` spans with `data-variant="mono"`, which now compute `font-variant-ligatures: none` themselves, so the `:style` on its container can go. `form-block`, `source-view` and `json-view` are the downstream's own components: a registry rule does not reach their stylesheets, so `form-block` keeps a ligature declaration and the other two gain one, written as `font-variant-ligatures: var(--mono-ligatures)` so all three follow the same switch. Row 12 of the un-patch checklist now says so.)

### 1.1F-20 · Nesting, CSS I: content containers

**Depends:** 1.1F-15, 1.1F-16 · **Class:** patch · **Touches:** CSS + manifest `changes` for `recipes/tabs` (24 selectors), `recipes/collapsible` (9), `recipes/accordion` (13), `primitives/description-list` (18; part rules 12, 21, 37-49, 61-77, 84-103), `primitives/progress` (14; 14, 24, 32-50, 54, 65, 76-83), `primitives/key-value` (12), `primitives/callout` (15), `primitives/empty-state` (7), `patterns/settings-page/settings-page.css` (152-214, verify only), Playwright nesting fixture

**Verified.**
- `[data-ui="collapsible"][open] [data-part="trigger"]::after` (`collapsible.css:54`) rotates
  closed inner chevrons.
- tabs styles every descendant trigger and panel.
- description-list and progress use descendant part rules, including the common name `label`.

**Fix (strategy for all four CSS nesting tasks).** Use child combinators, with `:where()` on
intermediate links so specificity stays flat:
`[data-ui="tabs"] > :where([data-part="list"]) > [data-part="trigger"]`. Pattern overrides
such as settings-page rely on today's ordering.
- **Don't** use `:not([data-ui] [data-ui] *)` guards: they break same-type nesting.
- **Don't** use `@scope`: an unsupporting browser drops the whole block.
- description-list must also allow `<div>` grouping:
  `> [data-part="term"], > div > [data-part="term"]`.
- `<summary>` is always the first child of `<details>`, so collapsible loses nothing.
- Entry 30 (D6): add a manifest note to description-list's size variant: "a nested `text`
  should omit `data-size` so it inherits the list's size."

**Tests**
- A selector-parse test: these files have no descendant combinator before `[data-part=`.
- Playwright, nested fixtures:
  - an open collapsible holding a closed one keeps the inner chevron unrotated;
  - a collapsible inside a tabs panel is not styled as a tab;
  - a progress inside a description-list `<dd>` keeps its own label.

**Acceptance**
- [x] Reference-page visual run pixel-identical (canonical markup is direct-child). (Before any stylesheet was touched, a survey of every tracked file (HTML, manifests, generators, docs, playground) found each part of these components in the direct-child shape, so nothing in the repository loses a rule. 149 rules in nine stylesheets were converted and compared with `HEAD` by script: same rule count, identical declaration blocks, identical specificity for every selector, and each new selector flattens back to exactly one old one. Shapes: `tabs` root > `:where(list)` > trigger, root > panel; `collapsible` root > trigger / content; `accordion` root > item > trigger > icon and root > item > content; `progress` root > track > fill, root > label; `callout` root > icon / content / dismiss, root > `:where(content)` > title (the `content p` spacing rule stays a descendant rule: its subject is prose, not a part); `empty-state` all four parts direct. Two shapes beyond direct children are kept, each at the same specificity as the direct one: `description-list` **and `key-value`** accept a pair grouped in a plain `<div>` (`> :where(div:not([data-ui])) >`; `:not([data-ui])` so a component that is a `<dl>`'s child cannot pose as the group), and `accordion` accepts a trigger inside a heading that is the item's child (`<h3><button data-part="trigger">`, the APG shape the controller already takes). **Touches grew by one file:** `registry/patterns/empty-state/empty-state.css` (13 selectors) styles the same `[data-ui="empty-state"]` as the primitive and was in no nesting task; with only the primitive converted the leak stays, so it was converted here (manifest 2.0.1). Visual run on macOS Chromium against captures taken at `HEAD` in the same session, compared at **zero** tolerance (a scratch config with `maxDiffPixels: 0`, `threshold: 0`): the eight components and every pattern, 12 matrix themes + the reduced sweeps, 1,554 captures. 1,398 are identical on the first comparison. The other 156 are `crud-table` and `search-results`, the two pattern pages that mount a `spinner`: they differ from their own baselines by 3–22 pixels on the *unmodified* tree too (17 and 23 of 156 in two `HEAD`-against-`HEAD` runs, a different set each time), so they prove nothing either way; `crud-table` uses none of these components, and all 78 `search-results` captures matched exactly in at least one of four runs. The Linux-container run was not done. `settings-page` (verify only): its overrides sit strictly above every tabs rule for the same part and state, pinned in the new test, and its 78 captures are identical.)
- [x] `build:registry-index`, `build:core-package`, `gen:skill` (notes), `check:docs`. (Regenerated on Bun 1.3.8 (`npm i bun@1.3.8` in a scratch dir; this machine's own Bun is 1.4.2) in the documented order: `gen:component-tokens` (0 files: no token moved), `build:registry-index`, `gen:skill`, `gen:bindings` (no diff), `build:core-package` (`cdn.json`: 27 theme bundles re-hashed), `build:docs`. Manifests, each with a `changes` entry beginning "Nested components keep their own parts": tabs 1.0.2, collapsible 1.0.1, accordion 1.0.2, description-list 1.0.2, progress 1.1.1, key-value 1.0.1, callout 1.2.1, empty-state 1.1.1 (primitive) and 2.0.1 (pattern); collapsible and key-value had no `changes` array until now. **D6 note:** the manifest schema gives a variant no prose field and nothing renders `composition.notes`, so "a nested `text` should omit `data-size` so it inherits the list's size" is on description-list's `details` slot description, which the skill's anatomy tree and the docs print; the accordion `trigger` slot says where a trigger may sit. Skill diff: those two anatomy lines. Tests: new `tests/helpers/part-selectors.ts` (a selector reader: compounds and combinators, `descendantPartSelectors`, `specificity`, and `partSkeletons`, which reduces each part rule to its structural path) and `tests/registry/nesting-css.test.ts` (39 cases, 23 red on the old tree): per converted file, no descendant combinator before `[data-part=`; no part rule reaches into a nested component, queried on a real DOM with an impostor that has the same parts placed in every part and under the root; every part of the reference markup is still reached; the `<div>`-grouped and heading-wrapped shapes are reached and a component `<div>` is not; settings-page stays above tabs; the manifests. **1.1F-21–23: add a row to `CONVERTED` in that test** and the three per-file checks run for the new file. `tests/visual/nesting.pw.ts` (22 Chromium cases): 12 fixtures that render the inner component nested and alone and require the same computed style on both — the three the task names (inner chevron of a closed collapsible in an open one; a collapsible in a tabs panel; a progress in a description-list `<dd>`, a guard that never failed) plus progress in a `sm` key-value `<dd>`, accordion in an expanded section, callout in a warning callout, underline tabs in a pill panel, a list in a `sm` list, a callout in an empty-state, and the three kept shapes; 2 cases that the outer component's own state rule still applies; 8 "wall must bite" cases that re-inject the old descendant rule. 8 of the 12 fixtures were red on the old stylesheets. Three existing tests quoted old selector text and were updated (`shape-focus`, `alert-alias`; `overflow-wrap` no longer pins description-list's current version). All 13 `check:*` / `audit:registry` / `size` gates and `typecheck` green; `faqir audit --stdin` clean on the nine reference pages; `narrow-fit`, `wide-content`, `variant-consistency` and the 54 `test:browser` cases pass; `bun run test` 7,857 pass / 0 fail. No canonical HTML, engine or controller change, no size change.)
- [x] Downstream `indirect:` patches in `tabs.css`/`collapsible.css` can be dropped. (Both downstream cases are fixtures now: a collapsible in a tabs panel computes the same nine properties as one standing alone, and the closed collapsible inside an open one keeps `rotate(45deg)` on its chevron. One difference from the downstream patch: it wrote `[data-ui="tabs"] > [data-part="list"] > [data-part="trigger"]`, which weighs one attribute more than the rule it replaced; the registry's hop is `:where([data-part="list"])`, so a downstream override written against the patched specificity still wins, by more. The other 13 pattern stylesheets are not converted and no nesting task lists them except `inbox`: follow-up 1.1F-39.)

### 1.1F-21 · Nesting, CSS II: overlays and menus

**Depends:** 1.1F-20, 1.1F-11 · **Class:** patch · **Touches:** CSS + `changes` for `recipes/{dialog (22), alert-dialog (16), drawer (24), sheet (37), popover (44), tooltip (20), sidebar (32), carousel (23), context-menu (13), dropdown (22), menubar (22)}`, nesting fixtures

**Fix.** The 1.1F-20 strategy. **menubar submenus are intentional same-type nesting**; check
its HTML before converting. Watch the 1.1F-08 panel-focus rule and the 1.1F-11 chevron rule,
and convert them too.

**Tests.** A selector-parse test for these files. Playwright: a dialog holding a popover keeps
the popover's header, body and close styles; a dropdown inside the sidebar footer keeps its
item styles.

**Acceptance**
- [x] Reference visual run pixel-identical; regeneration as 1.1F-20. (**Shapes first.** A survey of every tracked file (HTML, Markdown, manifests, tests, playground) for each part of the eleven components found nearly all of them direct children, and two shapes that are not, both in the playground: a dialog whose header, body and footer sit in a `<form>` (task-manager-v2), and a dialog title in a `stack` beside an eyebrow inside the header (kanban-v2). Both are kept, along with the shapes the manifests and controllers already sanction, each at the same weight as the direct one: in the dialog family (dialog, alert-dialog, drawer, sheet) the sections may be children of a `:where(form)` in the panel, and a title, description or close button may sit in one `:where(div:not([data-ui]), [data-ui="stack"], [data-ui="cluster"])` inside its section (the dialog controller already looks through those for its close button); dialog, drawer and sheet also take a close button that is the panel's own child; sidebar's trigger may be the root's child as well as the header's (a drawer that is off-canvas is opened from outside its panel, the shape `overlay-family.test.ts` mounts); menubar's `group` is optional in its manifest, so trigger and submenu are reached with or without it. **menubar** nests one level only — its controller pairs a top-level trigger with one submenu — so there is no deeper same-type nesting to keep; its non-part `[role="menuitem"][aria-disabled="true"]` rule was converted too (four positions, still 0,3,0). The 1.1F-08 `> [data-part="panel"]:focus` rules were already direct; the 1.1F-11 chevron rule now follows both trigger positions. **Conversion** by script from `HEAD`, then checked against it by a second script: 244 rules in eleven stylesheets, same rule count, identical declaration blocks and at-rule context, identical specificity for all 393 new selectors (298 before), each flattening back to exactly one old selector and every old one covered. Each sheet carries a comment naming its kept shapes. **Visual run** on macOS Chromium against captures taken from `HEAD`'s stylesheets in the same session, at **zero** tolerance (scratch config, `maxDiffPixels: 0`, `threshold: 0`): the eleven components (48 captures each), every pattern (78 each — `dashboard-shell`, `crud-table` and `settings-page` compose these), and the responsive and density sweeps, 1,794 captures. 1,763 identical on the first comparison. The other 31: 28 are `crud-table` and `search-results`, the spinner pages 1.1F-20 found noisy (5 of them failed to stabilise during the `HEAD` capture itself), plus 2 `inbox`; every one of the 30 matched exactly in a re-run (`crud-table` luxe, which kept differing under parallel load, matched 6 of 6 alone). The last, `responsive__primitive__stack__1280`, differs by the same 32 pixels when `HEAD`'s own stylesheets are put back: that baseline capture was the outlier, and `stack` composes none of these. The Linux-container run was not done. **Regeneration** on Bun 1.3.8 (the scratch `npm i bun@1.3.8` route; this machine's Bun is 1.4.2) in the documented order: `gen:component-tokens` (0 files), `build:registry-index`, `gen:skill`, `gen:bindings` (no diff), `build:core-package` (`cdn.json`: 27 theme bundles re-hashed), `build:docs`. Manifests, each with a `changes` entry beginning "Nested components keep their own parts": dialog, alert-dialog, drawer, sheet 1.0.3; popover, tooltip, context-menu 1.0.2; sidebar 1.1.3; carousel 1.1.2; dropdown, menubar 1.0.1 (first `changes` array for both). Slot descriptions now say where a part may sit (dialog-family panel, title, description, close; sidebar trigger; menubar group), so the skill's anatomy tree and the docs print it — that is the whole skill diff. **Tests.** `tests/registry/nesting-css.test.ts`: the eleven added to `CONVERTED`, plus 8 cases for the kept shapes (form-held sections; a title in a div, stack or cluster; not in a card, nor two wrappers deep; close in the panel, a header cluster, a form footer, but not a popover's in the body; sidebar's outside trigger; a dropdown in the sidebar footer is out of reach; menubar with and without a group; the disabled-menuitem rule) and weight checks for the dialog, sidebar and menubar variants — 80 cases, 27 red on the old stylesheets. The reach check now asks only for the parts a sheet styles (a dialog's trigger is a `button`'s; an alert-dialog's cancel and confirm too), and the skeleton reader keeps a `[data-ui="stack"]` hop instead of widening it to `*`. `tests/visual/nesting.pw.ts`, 39 Chromium cases (+17): the two the task names — a popover in a dialog keeps its close button (the dialog's rule was 0,3,0 and squashed it to 32px), a dropdown in the sidebar footer keeps its items — plus a card in a dialog keeps its header, a dropdown in the sidebar footer keeps its trigger, a collapsible used as a tooltip's trigger keeps its content (it was positioned and hidden as the tip), and a dropdown in a context-menu target keeps its menu (a guard: dropdown won the tie by bundle order); 5 kept-shape fixtures (form header, stack-wrapped title, cluster-wrapped close, outside sidebar trigger, groupless menubar item); 6 "wall must bite" cases. 5 of the 6 leak fixtures were red on the old stylesheets. "The popover's header, body" in the task: a popover has no such parts, so a card's header in a dialog stands in for them; a card's body was tried and dropped, since both bodies pad 24px and nothing leaks. Three existing tests quoted old selector text and were updated: `shape-focus` (four selectors), `sidebar` (the chevron rule in both positions), and `docs-site` "forced-open overlay previews", whose regex took `[data-part="panel"]` inside a `:where()` hop for the panel rule — it now requires the part to be the rule's subject. All 13 `check:*` / `audit:registry` / `size` gates and `typecheck` green; `faqir audit --stdin` clean on the eleven reference pages; `narrow-fit`, `wide-content`, `variant-consistency`, `nesting` (95), the 54 `test:browser` cases and the 31 `overlay-preview` a11y cases pass; `bun run test` 7,834 + 64 pass / 0 fail. No canonical HTML, engine or controller change, no size change. Not kept, because nothing in the repository or the manifests uses it: a sidebar nav that wraps its items in `<ul><li>`.)

### 1.1F-22 · Nesting, CSS III: table

**Depends:** 1.1F-20, 1.1F-16 · **Class:** patch · **Touches:** `registry/recipes/table/table.css` (147 descendant part selectors), table manifest `changes`, a nested-table fixture

**Fix.** Use `table > thead/tbody > tr > th/td` chains; the canonical markup is all parts.
Keep the 1.1F-16 `overflow-wrap: inherit` exception working. A nested table in a
`detail-row` must not be hit by the outer table's striping, hover, selection or pin rules.

**Tests.** A selector-parse test; a Playwright nested-table fixture (the inner rows are not
striped or pinned by the outer table).

**Acceptance**
- [x] Reference visual run pixel-identical; regeneration as 1.1F-20. (**Shapes first.** A survey of every tracked file for each table part found one structure everywhere: root > `table` > `thead`/`tbody`/`tfoot` > row (`tr`, `group-header`, `filter-row`, `detail-row`, `empty`) > cell > control (checkbox, expander, row-toggle, drag-handle, filter-input; the controller injects cell-input, resize-handle and expanders as a cell's direct child). Below the table part the HTML table model fixes that structure, so the hops are tags — `> :where([data-part="table"]) > :where(thead, tbody, tfoot) > :where(tr) > :where(th, td) >` — and a section, row or cell the old selector named keeps its part, weighted as before: `[data-ui="table"] > :where([data-part="table"]) > [data-part="tbody"] > [data-part="tr"]:hover > [data-part="td"]`. One kept shape beyond that: the quick filter ("anywhere inside the root" in the manifest) is styled as the root's child or inside one plain div, stack or cluster (a toolbar); the controller still binds it anywhere, and the slot description now says so. **The non-part rules leaked too** and were converted with them: `data-align`, `data-format`, `data-pin` (and `-edge`), `data-hide-below`, `data-col-hidden` and `data-negative` are read on the table's own cells only (`[data-ui="table"] [data-align="center"]` text-centred a `stack` carrying `data-align` in a cell, as `playground/dashboard-v2` has), the stacked `[data-pin]` rule takes its rows and cells, the hidden-rows rule its sections, and the drag guard became `:has(> … > [data-dragging], > … > :where(tr) > [data-dragging])`. The 1.1F-16 `overflow-wrap: inherit` exception keeps its descendant step after the cell (a text may sit in a stack in the cell). **Conversion** by script from `HEAD`, then checked against it by a second script: 100 rules, same count, identical declaration blocks and at-rule context, identical specificity for all 146 new selectors (142 before), each flattening back to exactly one old selector and every old one covered. **Visual run** on macOS Chromium against captures taken from `HEAD`'s stylesheet in the same session, at **zero** tolerance (scratch config, `maxDiffPixels: 0`, `threshold: 0`): the table (48), every pattern (78 each — `crud-table`, `document` and `stats-dashboard` compose a table), and the responsive and density sweeps, 1,302 captures. 1,275 identical on the first comparison; the other 27 are `crud-table` and `search-results`, the spinner pages 1.1F-20 found noisy (3 `crud-table` captures failed to stabilise during the `HEAD` capture itself). Re-run serially they fell to 15, then 8, and in those 8 every differing pixel (12–60 each) lies in x = 1277–1279, the page's scrollbar gutter, not in the table; one had no differing pixel at all. The Linux-container run was not done. **Regeneration** on Bun 1.3.8 (the scratch `npm i bun@1.3.8` route; this machine's Bun is 1.4.2) in the documented order: `gen:component-tokens` (0 files), `build:registry-index`, `gen:skill` (the filter slot's line), `gen:bindings` (no diff), `build:core-package` (`cdn.json`: 27 theme bundles re-hashed), `build:docs`. Manifest 3.2.2 with a `changes` entry beginning "Nested components keep their own parts". **Tests.** `tests/registry/nesting-css.test.ts`: table joins `CONVERTED` (its reach check now skips a skeleton that names no part — the hidden-rows rule ends in `tr[data-part]`), plus 4 cases: a table in a detail row and in a cell of a row with every state, inside a table with every root flag, matches exactly the rules it matches standing alone (and, not vacuous, differs on 30+ when given those flags itself); the cell attributes on a stack in a cell match nothing while the same attributes on the cell are read; the `:has()` drag guard (the one selector happy-dom cannot parse) is pinned by text and weight; the quick filter is reached bare and in a plain div, stack or cluster but not in a card or two wrappers deep; plus its weight in the same-weight check — 87 cases, 7 red on the old stylesheet. `tests/visual/nesting.pw.ts`, 53 Chromium cases (+14): the task's fixture — a table in the detail row of a striped table takes no stripes — plus a table in a selected row's cell, in a top-pinned row's cell, in the detail row of a stacked table (keeps its table-cell rows and sticky pinned column), in the detail row of a responsive table at 20rem (keeps its `data-hide-below="lg"` column), and a stack's `data-align` in a cell; the quick filter in a cluster toolbar as a kept shape; a striped table still stripes its own rows; 6 "wall must bite" cases. All 6 leak fixtures were red on the old stylesheet. Hover is not a fixture (it needs a pointer); its rule is in the happy-dom structural check. Existing tests that quoted old selector text were updated: `overflow-wrap`, `shape-focus` (the four `GLYPH_RULES`, the named emphasis and edge rules), `responsive-canon` (its cells now pass the table, section and row they sit in). `tests/helpers/css-cascade.ts` split selector lists and compounds at every comma and space, so it could not read a `:where(thead, tbody, tfoot)` hop; it now splits with `part-selectors`' paren-aware readers (all eight suites that use it pass unchanged). **Touches grew by one file:** `docs/data-driven-rendering.md` put `data-ui="table"` on the `<table>` itself, a shape the manifest does not allow (root tag `div`) that kept its cell styles only through the descendant rules; it now uses the canonical `<div data-ui="table"><table data-part="table">`. All 13 `check:*` / `audit:registry` / `size` gates and `typecheck` green; `faqir audit --stdin` clean on the table reference page; `narrow-fit`, `wide-content`, `variant-consistency`, `nesting` (109 together) and the 54 `test:browser` cases pass; `bun run test` 7,841 + 64 pass / 0 fail. No canonical HTML, engine or controller change, no size change.)

### 1.1F-23 · Nesting, CSS IV: long tail + `descendant-part-selector` gate

**Depends:** 1.1F-21, 1.1F-22 · **Class:** patch · **Touches:** the remaining files from the sweep (pagination 32, toast 32, select-custom 27, command-palette 26, stepper 21, file-upload 21, combobox 19, field-group 14, input-otp 14, tree-view 14, switch 13, nav 12, stat 12, slider 12, tag-input 12, date-picker 11, calendar 36, breadcrumb 8, image 8, toggle-group 8, chip 6, avatar 4, input 4, label 2, signature 2, qr-code 2, button 1, separator 1), `patterns/inbox` (items inside `<li>` need a `> :where(li) >` hop), `scripts/registry-audit.mjs`

**Fix.**
- Convert where the markup is direct-child; otherwise keep the selector, with a comment.
- Add registry-audit gate 8, `descendant-part-selector`: a descendant combinator before
  `[data-part=` in component CSS fails, with an explicit per-selector allowlist (the
  1.1A-03 `GLYPH_RULES` style).
- The audit rule is additive under SPEC §8.2.

**Tests.** The gate passes on the registry. A planted `[data-ui="x"] [data-part="y"]` fails
with file and line. An allowlisted selector passes.

**Acceptance**
- [x] Gate in `audit:registry` and in `release.mjs` preflight; reference visual run pixel-identical; regeneration as 1.1F-20. (**Shapes first.** A survey of every tracked file (HTML, Markdown, TS/JS, manifests, tests, playground), plus the live DOM of the fourteen recipes whose controllers render parts (each mounted in happy-dom and started; file-upload rows and the qr svg written out from their controllers' code), listed for every styled part each chain of elements between it and its own root. All but one component are direct children or a fixed chain of their own parts, and these shapes beyond the template are kept, each at the same weight as the direct one: calendar's month label and nav buttons as the root's children (the header is optional in the manifest); command-palette's search without its wrapper, items without a group, the empty state in the panel as well as the list; file-upload's input beside the dropzone, which the controller labels. Parts the controllers render are reached along the path they are rendered in: calendar `root > grid > tbody > tr > td > day`, file-upload `root > list > file > details > name`, toast `root > toast > icon`. inbox reaches its rows through their `<li>` (`> :where(li) >`, as the Touches said), and its panel-prose rule now names the composition it reaches into: `detail > :where([data-ui="tabs"]) > [data-part="panel"] p`. Not kept, because no manifest allows them and only a test fixture or a stale doc used them: a date-picker input as the root's child (two controller tests), toast message and close as the root's children (`.claude/commands/faqir-creator.md`, now canonical), a command-palette kbd as the root's child (`variant-consistency.pw.ts`, now canonical). **tree-view** recurses, so no chain of child combinators can reach an item at any depth. Each of its rules now takes exactly one descendant step, from the root into `:where([data-part="item"])` or `:where([data-part="group"])`, and everything below is a child hop (label and group an item's, toggle a label's). A chip's label inside a tree label is out of reach now. Its ten selectors are the gate's whole allowlist, and the sheet says why. **`:has()`.** Seven bare `:has([data-part=…])` queries (input-group prefix/suffix, switch thumb, file-upload's focus ring, toggle-group's three item states) asked about every part below, so a toggle-group item holding some other component's checked control read as on. They are now `:has(> …)`, and the reader counts a bare `:has()` over a part as a descendant step. **Conversion** by script from `HEAD` with a per-component path spec, then checked by a second script: 399 descendant selectors in 29 stylesheets (28 + inbox) became 435, plus the seven `:has()` rewrites. Only rule preludes were rewritten, so rule count and declaration blocks are identical, and so is the at-rule context. Every new selector has its origin's specificity and flattens back to it, and none crosses into a part except tree-view's ten. Calendar, command-palette and file-upload carry a comment naming their kept shapes. **The gate** is gate **9** of `audit:registry` (1.1F-15 had taken 8): `findDescendantPartSelectors` in `src/audit/part-selectors.ts`, where the reader moved from `tests/helpers/` so the script can import it. It scans all 129 registry stylesheets, themes and base included (none of which has a finding), and fails a descendant part selector with file and line. Exceptions: `DESCENDANT_PART_ALLOWED` names selectors one by one, in the `GLYPH_RULES` style (tree-view's ten). `DESCENDANT_PART_PENDING` names the twelve pattern sheets of 1.1F-39. An allowlist entry the sheet no longer has fails, and so does a pending sheet with nothing left to convert, so both lists only shrink. `release.mjs` runs `audit:registry` in its preflight, which the test pins through `PREFLIGHT`. **1.1F-39 decided here:** the patterns get converted (1.1F-20 strategy), not scoped out; the pending list is the bookkeeping. **Visual run** on macOS Chromium against captures taken from `HEAD`'s stylesheets in the same session, at **zero** tolerance (scratch config, `maxDiffPixels: 0`, `threshold: 0`): the 29 components (48 each), every pattern (78 each), the responsive and density sweeps, 2,598 captures. 6 `crud-table` captures failed to stabilise during the `HEAD` capture itself. 2,489 identical on the first comparison; the 109 others are 81 `form-page` (78 + 3 responsive), 27 `crud-table` and 1 `search-results`. The `search-results` capture matched on a serial re-run. Every differing pixel of the 27 `crud-table` captures lies in x = 1277–1279, the page's scrollbar gutter, the noise 1.1F-22 found, not the pagination or search field this task converted. **`form-page` is the fix, not noise.** It is the `@faqir-ui/forms` page shape, a radio-group in a field-group's input slot, and at `HEAD` every option's `<span data-part="label">` took the field label's size, weight and colour through the leak (red when the field was invalid). Converted, the options render as a radio-group does anywhere else: they inherit the page's body text, 16px regular under the 14px medium field label, and everything below moves down a few pixels. Accepted as the fix by the owner on 2026-10-05; the field-group `changes` note says so. **1.1F-31's Linux-container run must regenerate the `form-page` baselines rather than read them as a regression.** Option typography is follow-up 1.1F-40. The Linux-container run was not done. **Regeneration** on Bun 1.3.8 (`~/.bun/bin/bun` is the pin on this machine again) in the documented order: `gen:component-tokens` (0 files), `build:registry-index`, `gen:skill` (button's manifest, quoted verbatim, and the calendar, command-palette and file-upload slot lines), `gen:bindings` (no diff), `build:core-package` (`cdn.json`: 27 theme bundles re-hashed), `build:docs`. Manifests, each with a `changes` entry beginning "Nested components keep their own parts": avatar 1.1.1, breadcrumb 1.0.2, button 1.2.1, chip 1.0.1, field-group 2.1.1, image 1.0.1, input 1.2.1, label 1.1.1, nav 1.0.1, separator 1.1.1, signature 1.0.1, stat 1.0.1, stepper 1.1.1, switch 1.1.1, calendar 1.1.1, combobox 1.1.1, command-palette 1.3.1, date-picker 2.0.1, file-upload 1.0.1, input-otp 1.2.1, pagination 1.0.1, qr-code 1.0.1, select-custom 1.1.1, slider 1.0.1, tag-input 1.1.1, toast 1.0.1, toggle-group 1.1.2, tree-view 1.0.1, inbox 2.0.1. Eight had no `changes` array until now. Slot descriptions say where the kept shapes may sit (calendar header, command-palette search/item/empty, file-upload input). **Tests.** `tests/registry/nesting-css.test.ts`, 187 cases (+100): the 28 join `CONVERTED` (a `ROOT_OF` map points input at its `input-group` root, and the reach check now counts only a root's own parts, so the tabs inside an inbox keep their list). New cases: field-group leaves radio/checkbox option labels and a date-picker's input alone; calendar styles the days its controller renders and a header-less calendar's controls; command-palette's kept shapes; file-upload styles the rows its controller renders (a real `DataTransfer`) and an input beside the dropzone; toast styles what `add()` builds; inbox reaches rows through `<li>` but not a nested tabs' list or a combobox's empty state; the seven `:has()` are child-relative. tree-view: every part at every depth reached, a chip's label in a tree label not reached, one descendant step per rule and the allowlist names exactly those. The gate: passes on the registry; a planted `[data-ui="x"] [data-part="y"]` fails with file and line; a bare `:has()` over a part fails and `:has(> …)` passes; an allowlisted selector passes and a stale entry fails; a pending sheet is skipped until converted, then must leave the list; wired into `audit:registry` and the preflight. 59 of these are red on `HEAD`'s stylesheets. `tests/visual/nesting.pw.ts`, 65 Chromium cases (+12): a radio option in an invalid field-group, a progress in a stat, a button's icon in a toast, a chip in a tree label, and a toggle-group item holding a nested checked control (the relative `:has()` happy-dom cannot evaluate); two kept-shape fixtures (groupless palette item, headerless calendar nav); five "wall must bite" cases. All five leak fixtures were red on the old stylesheets. Existing tests that quoted old selector text or pinned a version were updated: `field-group` (three selectors; two `2.1.0` pins now read the manifest), `button` (finds its 1.2.0 entry instead of `changes[0]`), `shape-focus` (stepper, slider, toast, tree-view), `role-tokens` (the palette kbd), `responsive-canon` and `inbox` (the deep resolver needs the step and detail-pane hops), `token-resolution` (the header now says "Nine gates"), `variant-consistency` (canonical palette kbd). An `inbox` failure left `window.matchMedia` mocked at 390px and made `nesting.test.ts`'s sidebar read as a drawer; fixing the first fixed both. **Touches grew by two files:** `.claude/commands/faqir-creator.md` (toast snippet) and `tests/visual/variant-consistency.pw.ts`. All 13 `check:*` gates, `audit:registry` (nine gates; gate 7 runs the full rule set over every reference fragment), `size` (engine + controllers 45.74/46 KB, unchanged) and `typecheck` green. Bun 1.3.8 stalled twice, a `check:bindings` run spinning at 100% CPU for ten minutes and one suite run with two unrelated 30 s timeouts; killed and re-run, both pass. `narrow-fit`, `wide-content`, `variant-consistency` and `nesting` (121 together) and the 54 `test:browser` cases pass; `bun run test` 7,941 + 64 pass / 0 fail. No engine or controller change.)

---

## Task details — Lane T (Tooling)

All CLI tasks: `bun run build:cli` + `bun run smoke`. Every task touching `src/audit/` also
needs `build:audit-browser` with **Bun 1.3.8**, then `check:audit-browser`. JSON schema
versions stay unchanged: `audit_schema_version` 1 (`src/audit/reporter.ts:120`) and
`repair_schema_version` (`src/commands/repair.ts:10`). New `rule_id` values are additive.

### 1.1F-24 · `faqir audit` recognises every engine entry point

**Depends:** — · **Class:** patch · **Touches:** `src/audit/html-audit.ts` (`checkControllersInFile` 209-265, names 241-245, reconciliation 173-182, focus-trap drop 192-200), `src/audit/rules.ts` (`focus-trap` 348-364, `controller-loaded` 683-701), `src/audit/checker.ts` (`runAudit` 136-195), `src/utils/paths.ts` (`isInside`), `src/generator/docs-pages/audit.ts` (142-146), `src/generator/skill.ts` (the line behind `SKILL.md:50`), `README.md` (~898), `tests/commands/audit.test.ts` (~120-165), `tests/audit/rules.test.ts` (~519, ~536)

**Verified.** Detection is a substring search over the whole page source, against
`faqir-core.js`, `faqir-core.min.js`, `faqir.js`, `faqir.min.js` and the controller file. Each
of these fires `focus-trap` (critical) and `controller-loaded` (error), reproduced with
`audit --json`:
- an external `<script type="module">` whose module imports `faqir-core.mjs`;
- an inline module import;
- `faqir-core.dev.js` (the substring doesn't match);
- `import … from "@faqir-ui/core"`.

`faqir-core.*` only bundles the registry's 29 recipe controllers, yet any engine name clears
custom recipes too.

**Fix.**
1. Match against `<script>` elements from `parseDocument` (`src` plus inline text), not the
   whole source. Recognise:
   - `faqir-core.{js,min.js,dev.js,mjs}`;
   - `@faqir-ui/core` (bare or subpath, including import maps);
   - `faqir.js`, `faqir.min.js`.
2. Add `HtmlAuditInput.runtimeReferences?: string[]`. `runAudit` follows local `type="module"`
   sources and their relative imports up to 2 levels, contained with `isInside`.
3. Add `HtmlAuditInput.engineControllers?: Set<string>`: the registry recipe names, so an engine
   reference doesn't clear a project's custom recipe. `faqir.js` still covers everything.
4. Optional config `audit.entry_modules`. String-only paths (`--stdin`, MCP, playground) get
   inline detection only.

**Tests**
- External `.mjs` that imports the engine is clean.
- Inline import is clean; `.dev.js` is clean; `@faqir-ui/core` is clean.
- A custom recipe under the engine-only reference is still flagged.
- A module import outside the project root is not followed.

**Acceptance**
- [x] The downstream `index.html` audits clean without `--skip-rules focus-trap,controller-loaded`. (The `indirect` repo is not on this machine, so its shape from entry 9 was rebuilt with the Node bundle (`node dist/faqir.mjs`): `init`, `add dialog`, an `app/main.mjs` doing `import Faqir from '../ui/core/faqir-core.mjs'` and a store, and an `index.html` whose only script is `<script type="module" src="app/main.mjs">`. `audit --file index.html --json` on the stashed `HEAD` build reports `focus-trap` and `controller-loaded`; on this build neither. **How.** `checkControllersInFile` takes `references` instead of the page source: `pageScripts(doc)` (exported from `html-audit.ts`) reads each runnable `<script>` from `parseDocument` (no type, `module`, `importmap`, `text/javascript`, `application/javascript`), its `src` and its inline text up to `</script>`. A file named in a comment, body copy or a JSON block no longer counts, which replaces 0.9-04's comment stripping. `ENGINE_REFERENCE` matches `faqir-core{,.min,.dev}.{js,mjs}` and `@faqir-ui/core` bare or by subpath; `faqir{,.min}.js` (the project runtime, which imports every installed recipe) still clears everything. All three, and the controller's own file, are anchored on a path boundary, so `alert-dialog.js` no longer loads `dialog.js`. New `HtmlAuditInput.runtimeReferences`: `runAudit` reads every local `type="module"` script (a `src` with no scheme is page-relative; `/`-rooted is project-relative; an inline module's relative imports too), collects the import specifiers, and follows relative ones once more, two levels, each path checked with `isInside(cwd, …)`, missing files skipped. New `HtmlAuditInput.engineControllers`: `engineControllerNames(registryPath)` in `checker.ts` (registry recipes with a `<name>.js`, which is what `build:core` inlines), passed by `runAudit` and by `audit --stdin`, so an engine reference does not clear a project's own recipe. Omitted (MCP, playground, the registry gate), an engine reference covers every recipe, as before. **Not done:** fix item 4's optional `audit.entry_modules` config key. It is additive surface on a patch task, and the module following already covers the downstream shape. **Tests.** `tests/audit/controller-references.test.ts`, 22 cases: eleven entry points clean (classic, CDN min, `.dev.js`, `.mjs` src, inline import, inline dynamic import, `@faqir-ui/core` bare and subpath, an import map, `faqir.js`, the controller itself); `runtimeReferences` clears; six non-loads still flagged (comment, body copy, JSON block, a `<link>`, `alert-dialog.js`, `not-faqir-core.js`); a custom recipe under an engine-only reference is flagged and cleared by its own controller or `faqir.js`; no `engineControllers`, no change. `tests/commands/audit.test.ts` (+6, through `runAudit` on disk): an external `.mjs` importing the engine is clean; a second level and a `/app/main.mjs?v=2` src are followed; an inline module's import is followed; a third level is not; a module outside the project root is not followed; an installed custom recipe beside a registry dialog under an engine-only module is flagged and the dialog is not.)
- [x] Docs page, README rule table and skill text updated; `gen:skill`, `check:skill`, `check:docs`, `build:audit-browser` + `check:audit-browser` (pinned Bun), `build:cli`, `smoke`. (`RULE_NOTES["controller-loaded"]` in `docs-pages/audit.ts` now says the rule reads `<script>` elements, lists every engine name, says custom recipes need their own controller, and describes the module following and the string-only callers. The README row reads "Recipe controller is not loaded by a `<script>` (or a local module it imports)", and the `controller-loaded` sentence in `skill.ts` (`SKILL.md:50`) gains the same. The `rules.ts` comment points at the file-level check; the rule messages did not change. All on Bun 1.3.8 (`~/.bun/bin/bun`): `gen:skill`, `check:skill`, `build:audit-browser` (`site/lib/faqir-audit.js` 21.85 KB gzip; the first run hung at 100% CPU and was killed after 180 s, the second ran clean), `check:audit-browser`, `build:docs` + `check:docs` (`check:docs` hung once, killed and rerun clean), `build:cli`, `smoke`, `typecheck`. No engine, controller or registry change, so `size`, `build:core-package` and the manifests are untouched. **One existing test changed:** `tests/migration/upgrade-v024.test.ts` asserted that the v0.2.4 page, which loads `../ui/core/loom.js`, gets `controller-loaded`. Its `loom.js` imports `recipes/dialog/dialog.js` and `recipes/table/table.js`, so following the module now finds the controllers it really loads; the assertion is inverted with a comment, and the page still fails the audit on its old vocabulary. `bun run test` 7,969 + 64 pass / 0 fail.)

### 1.1F-25 · `faqir repair`: no duplicate controllers; correct path

**Depends:** 1.1F-24 · **Class:** patch · **Touches:** `src/audit/repairer.ts` (`addScript` 428-445), `src/commands/repair.ts`, `src/generator/docs-pages/audit.ts` (84-89), `tests/audit/repairer.test.ts` (105-135), `tests/commands/repair.test.ts`

**Verified.**
- `repair` inserted `<script type="module" src="ui/recipes/dialog/dialog.js">` next to the
  engine.
- The path is hard-coded `ui/…` (ignores `output_dir`), and is wrong from a page in a
  subdirectory.
- The idempotency check is `source.includes("faqir.js")`.
- The injected module only exports `createDialog`, so it does nothing at runtime.

**Fix.**
- With 1.1F-24, an engine page gets no fix.
- When a controller really is missing, insert `<output_dir>/core/faqir.js` (the auto-init
  build), relative to the HTML file. Pass `outputDir` and the file path into the fix details.
- Leave out `add-script` in the string-only `applyRepairsToSource` (MCP), which has no path
  context.

**Tests**
- An engine-module page gets no `add-script` fix.
- `pages/p.html` with `output_dir: "web/ui"` gets `../web/ui/core/faqir.js`.
- A second run is a no-op.
- MCP repair never emits `add-script`.

**Acceptance**
- [x] Docs note updated; `build:audit-browser` (pinned Bun) if `src/audit/` changed; `build:cli`, `smoke`, `check:docs`. (**How.** New `HtmlAuditInput.runtimeScript`: the page-relative path to `<output_dir>/core/faqir.js`, the assembled runtime that imports and starts every installed recipe. `runAudit` passes it only when that file exists, computed per page by `pageRelativeSrc` in `checker.ts` (`relative(dirname(page), runtime)`, `/` separators). `checkControllersInFile` attaches the `add-script` fix only with it, and only when the page does not already run the engine: on an engine page with a custom recipe missing, `faqir.js` would load the registry's controllers a second time, so that finding carries no fix. With 1.1F-24 an engine page that is otherwise complete gets no finding at all. `addScript` writes `src` as given (no hard-coded `ui/recipes/<name>/`) and is idempotent on the page's parsed `<script>` sources (`pageScripts`), not `includes("faqir.js")`, so a script named in a comment does not count and N missing recipes write one tag. `applyRepairsToSource` (MCP `faqir_repair_html`) drops `add-script` results; the string-only callers (`--stdin`, MCP, playground) pass no `runtimeScript`, so their `controller-loaded` findings now say `fixable: false`. **Tests.** `tests/commands/repair.test.ts` (+2, spawned CLI): an `app/main.mjs` engine-module page gets no `add-script` and no remaining `controller-loaded`; `init --dir web/ui` + `add dialog` + `pages/p.html` gets `../web/ui/core/faqir.js` before `</body>`, the path resolves, the re-audit clears `controller-loaded`/`focus-trap`, and a second `repair` applies 0 and modifies 0 files. `tests/audit/repairer.test.ts`: the old add-script case rewritten (two recipes, one tag, second run unchanged), plus a comment-only script still gets the tag and the string-only repair never writes one. `tests/audit/controller-references.test.ts` (+4): the fix carries the given path for each missing recipe, none without a path, none on an engine page, nothing to fix on an engine-module page. `packages/mcp/tests/write-tools.test.ts` (+1): `faqir_repair_html` on a full page with a dialog adds no script and reports `controller-loaded` as not fixable. Seven of the new cases fail on the previous `src/`. **Docs.** `AUTO_FIXES["controller-loaded"]` in `docs-pages/audit.ts` describes the runtime, the page-relative path, the once-only write and the two no-fix cases; the README repair paragraph names `core/faqir.js`. **Gates** (Bun 1.3.8): `build:audit-browser` (`site/lib/faqir-audit.js` 21.86 KB gzip), `check:audit-browser`, `build:cli`, `smoke`, `build:docs` + `check:docs`, `check:skill`, `typecheck`. No engine, controller, manifest or registry change, so `size` and `build:core-package` are untouched. `bun run test` 7,978 + 64 pass / 0 fail.)

### 1.1F-26 · Manifest `$schema` correct at any depth; `init` writes the schema

**Depends:** — · **Class:** patch · **Touches:** `src/commands/add.ts` (`copyDir` 432), `src/commands/init.ts`, `src/commands/create.ts` (`schemaRefFor` 86-89, `ensureProjectSchema` 101-119), `src/commands/doctor.ts`, the diff/upgrade pristine-snapshot code (normalise `$schema` before comparing), `tests/commands/{add,init,create,upgrade}.test.ts`, `README.md` (~961)

**Verified (re-diagnosed).**
- `create` is correct: with `ui/` it writes `../../../manifest.schema.json`.
- The root schema file is intentional (`create.ts:101-119`, commit `6816a57`).
- `faqir add` copies registry manifests byte-for-byte, so their `$schema` (relative to
  `registry/<layer>/<name>/`) dangles whenever `output_dir` is not one segment deep. With
  `--dir web/ui`, `create` writes `../../../../` and `add` writes `../../../`.
- No command but `create` writes the schema file, so installed manifests point at a missing
  file until the first `create`. That is why the downstream thought the file was stray.

**Fix.**
- `init` writes `manifest.schema.json` (with the same `$id` guard as `ensureProjectSchema`)
  and lists it in its output.
- `add` rewrites `$schema` to `relative(destDir, <root>/manifest.schema.json)`.
- `diff`/`upgrade` normalise `$schema` before comparing with the pristine snapshot, so the
  rewrite never shows as a local modification.
- `doctor` reports a missing schema file.

**Tests**
- `add` with a nested `output_dir`: `$schema` resolves to an existing file.
- `init` creates the schema.
- `faqir diff <component>` after `add` shows no `$schema` change.
- `doctor` flags a deleted schema.

**Acceptance**
- [x] `build:cli`, `smoke`; README `create`/`init` text updated. (**How.** New `src/utils/schema-ref.ts` owns the contract: `schemaRefFor` and `ensureProjectSchema` moved there from `create.ts` (`ensureProjectSchema` now returns whether it wrote), plus `readSchemaRef`/`withSchemaRef`/`normalizeSchemaRef`, which match the first `"$schema": "…"` pair in the text so every other byte stays the registry's, and `pointManifestsAtProjectSchema(dir, root)`. `init` writes the schema (same `$id` guard: a project's own file is left alone) and lists it. `add` repoints each installed manifest after `copyDir` and after the remote write loop, and `finalizeInstall` calls `ensureProjectSchema`, so a project initialized by an older CLI gets the file on its next `add`. Pristine snapshots stay byte-exact. `diff` compares a manifest with its `$schema` put back to the pristine's. `upgrade` merges with ours normalised to the base (or theirs) value and points written manifests back at the project schema; it also restores a missing or older-CLI schema file (not on `--dry-run`), which is what doctor's message names. `doctor` gains a "Manifest schema" check. One gap left open: a manifest an older CLI installed at a nested depth keeps its dangling path until it is re-added or its manifest changes in an upgrade. **Tests.** `tests/commands/schema-ref.test.ts` (11): the helpers; `init` writes the shipped schema and leaves a different-`$id` file alone; default `ui/` keeps the registry's bytes; `--dir web/ui` gives `../../../../manifest.schema.json`, which resolves, and only that value differs from the registry; `add` restores a deleted schema; `diff --json` is clean after `add`, and a real manifest edit shows with no `+`/`-` `$schema` line; `upgrade` is `up-to-date` against an identical registry, merges a newer manifest cleanly and keeps the nested path, after which `diff` is clean; `doctor` exits 1 on a deleted schema and 0 after `upgrade` restores it. `tests/commands/add-remote.test.ts` (+1): a remote install under `web/ui` gets the nested path. **Gates** (Bun 1.3.8): `build:cli`, `smoke`, and by hand with `node dist/faqir.mjs` `init --dir web/ui` + `add button` (nested `$schema`, `diff` no drift, `doctor` 12/12); `check:docs`; `typecheck`. README's "What `faqir init` creates" tree lists `manifest.schema.json` and a paragraph covers `add`/`create`/`doctor`/`upgrade`. No engine, registry or manifest change, so `size`, `build:core-package` and `gen:skill` are untouched. `bun run test` 7,990 + 64 pass / 0 fail.)

### 1.1F-27 · `audit.forbid_directives` in `faqir.config.json`

**Depends:** 1.1F-24 · **Class:** additive · **Touches:** `src/utils/config.ts` (`FaqirConfig` 6-38), `src/audit/vocabulary.ts` (`directive-name` 64-71, walk ~552, `buildVocabularyResults` 895-910, `VOCABULARY_RULES`), `src/audit/html-audit.ts` (`HtmlAuditInput`), `src/audit/checker.ts`, `src/commands/audit.ts` (`auditStdin`), `src/commands/doctor.ts`, `src/generator/docs-pages/audit.ts`, `docs/security.md` §3, `README.md`, `tests/audit/vocabulary.test.ts`, `tests/commands/audit.test.ts`, `tests/generator/docs-audit.test.ts`

**Fix.**
- Add `audit?: { forbid_directives?: string[] }`, passed through `HtmlAuditInput.forbidDirectives`.
- New rule `forbidden-directive` (error). Normalise names with `parseDirectiveName`, so
  shorthands and arguments match. Register it in `VOCABULARY_RULES` so `audit --rules` lists
  it.
- `doctor` rejects unknown directive names in the list.
- The docs say plainly that it catches markup only, not `innerHTML` in JS.
- There is no config schema today (`readConfig` just casts). Validating this one key in
  `doctor` is enough.

**Tests.** With `forbid_directives: ["l-html"]`, `l-html` and its shorthand variants fail.
Without the key, nothing changes. `doctor` flags `["l-nope"]`.

**Acceptance**
- [x] `security.md` §3 points at the knob; rule docs and the coverage test green; `build:audit-browser` (pinned Bun), `build:cli`, `smoke`, `check:docs`, `gen:skill` if the skill lists rules. (**How.** `FaqirConfig.audit?.forbid_directives` (`src/utils/config.ts`) reaches `auditHtmlSource` as `HtmlAuditInput.forbidDirectives`, from `runAudit` and from `audit --stdin` when it runs inside a project. New `FORBIDDEN_DIRECTIVE_RULE` (`forbidden-directive`, error) in `VOCABULARY_RULES`, so `--rules`, the JSON inventory, the docs page and the playground legend list it with no other edit (inventory 37 → 38). `forbiddenDirectiveName` reads an entry the way markup is read: `parseDirectiveName` for `l-html`, `l-bind:src`, `:src`, `@click`, else the bare name, and null unless `directiveByName` knows it. The rule matches each attribute's parsed base name, so a ban on `l-on` catches `@click.prevent` and `l-on:keydown.enter`, and an argument or modifier never escapes it. An entry that names no directive bans nothing in the audit; `doctor` gains an "Audit config" check (exported `checkForbidDirectives`) that fails on a non-string-array value or an unknown name, quoting each. MCP and the playground carry no project config, so they never report it; the rule's docs-page notes say so, and 1.1F-28 is where MCP becomes project-aware. Docs: `security.md` §3 gets a bullet naming the key, the rule and "markup only" (no `innerHTML` in JS, no runtime-built markup); README's rule count (37 → 38, twice), its rule table and a short config paragraph under "Audit, Repair and Conform". **Tests.** `tests/audit/vocabulary.test.ts` (+7): `["l-html"]` fails `l-html` and `l-html.camel` and not `l-text`; a bare `html` bans the same; a ban on `l-on` (or written `@click`) fails `@click`, `@click.prevent`, `l-on:keydown.enter` and leaves `:disabled`, which `:src` (→ `l-bind`) catches; no key or `[]` gives results identical to before; `--skip-rules` turns it off; `l-nope` bans nothing; the inventory lists it. `tests/commands/doctor.test.ts` (+5): `["l-nope"]` exits 1, real directives in every spelling exit 0, and `checkForbidDirectives` names only the unknown entries and rejects a non-list. `tests/commands/audit.test.ts` (+1): `runAudit` is clean, then fails with one `forbidden-directive` error once the config bans `l-html`. `tests/generator/security-docs.test.ts` (+1): §3 names the key, the rule and "markup only", and the rule is in the inventory. `docs-audit.test.ts` (the coverage test) green. **Gates** (Bun 1.3.8): `build:audit-browser` (rewrote `site/lib/faqir-audit.js`) + `check:audit-browser`; `build:cli`; `smoke`; by hand with `node dist/faqir.mjs`: `audit --stdin` in a project banning `l-html` exits 1 with two findings, `doctor` flags `"l-nope"`, `audit --rules` lists the rule; `build:docs` then `check:docs`; `check:skill` green (the skill lists no rules, so no `gen:skill`); `check:rules-plugin`, `check:core-package`; `typecheck`. No engine, registry or manifest change, so `size` is untouched. `bun run test` 8,004 + 64 pass / 0 fail, the two partitions taken from separate runs: on this machine every full run hit a different unrelated spawn timeout (`theme generate` CLI, `bundle --output`, `dev` server) or a hung dev-engine `bun test` start, and a control run on the untouched base `d1b9f66` hit the same (`theme generate` CLI, 7,989 pass / 1 fail). Each timed-out file passes alone.)

### 1.1F-28 · MCP audit is project-aware; `orphan-part` with unknown owners

**Depends:** 1.1F-24 · **Class:** additive (tool inputs) · **Touches:** `packages/mcp/src/server.ts` (`faqir_audit_html` 676-699, `faqir_repair_html` 724-728, `containedProjectRoot` 344, manifest cache 592-593), `packages/mcp/src/generate.ts` (`auditHtml` 65-71), `packages/mcp/src/registry.ts`, `packages/mcp/src/core.ts` (51-53), `src/commands/audit.ts` (factor the overlay out of `auditStdin` 136-176), `src/audit/checker.ts` (`loadInstalledAuditInputs` 104-131), `src/parser/html-parser.ts` (`extractComponents` 281-290), `src/audit/rules.ts` (`orphanPartRule` 705-729), `src/audit/vocabulary.ts`, `packages/mcp/README.md` (39), `packages/mcp/tests/write-tools.test.ts` (~55, ~137), `tests/parser/html-parser.test.ts`

**Verified.**
- `auditHtml` passes only `{source, manifests, skipRules}`. So `unknown-component`,
  `trigger-contract` and `single-fixed-region` never run, and the manifests are registry-only.
- The CLI's `--strict` is not a rule set (`src/commands/audit.ts:202`); the MCP has no
  counterpart.
- `data-bogus` is silent by design: `unknown-attribute` only flags near-misses.
- Entry 33 occurs only when the outer owner has no manifest. CLI resolution is already
  manifest-aware.
- `containedProjectRoot` uses `rel.startsWith("..")`, the bug `isInside` exists to fix.

**Fix.**
1. Factor `auditStdin`'s registry-plus-project overlay into a shared helper.
2. MCP: an optional `root`, contained via `isInside`, defaulting to `resolveProjectRoot()`. If
   it holds a `faqir.config.json`, overlay the project's manifests, styles and known names.
   Always pass `knownUiValues`. Apply the same to `faqir_repair_html` and `faqir_generate`.
3. An optional `strict: boolean` adds a new rule `undeclared-attribute` (warning): a `data-*`
   inside a known component that no enclosing manifest declares and that is not a convention
   attribute.
4. Entry 33: when no owner declares the slot but some owner in the chain has no manifest,
   attribute the part to the nearest such owner, whose rules are skipped. Use a `hasManifest`
   callback or a tri-state `declaresSlot`. `extractComponents` has one 3-argument caller.

`src/protocol.ts:110`'s "nearest enclosing component" prose is **not** edited; this is audit
behaviour only.

**Tests**
- MCP: `data-ui="nonsense-thing"` gives `unknown-component`.
- With `root` set to a fixture project, a project component's bad `data-variant` is reported.
- `strict` reports `data-bogus`; without it, it does not.
- An unknown outer owner gives no `orphan-part`.
- The property matrix at `write-tools.test.ts:55` stays clean.
- A `root` outside the containment is refused.

**Acceptance**
- [x] Tests under `packages/mcp/` green + root typecheck; `build:mcp`; MCP README and tool descriptions explain `root` and `strict`; `build:audit-browser` (pinned Bun) if `src/audit/` changed. (**How.** **Overlay:** `auditStdin`'s registry-plus-project code is now two helpers in `src/audit/checker.ts`: `loadRegistryAuditInputs(registryPath, manifests?)` (registry manifests, `knownUiValues`, `engineControllerNames`) and `withProjectAuditInputs(registry, root)`, which lays a `faqir.config.json` project's installed manifests, known names, stylesheets and `audit.forbid_directives` over a **copy** of the registry map, and returns the registry inputs untouched outside a project. `audit --stdin` calls the pair. **MCP:** the server caches the registry inputs beside the manifest map; `faqir_audit_html`, `faqir_repair_html`, `faqir_generate` and `faqir_scaffold_page` take an optional `root` (contained by `containedProjectRoot`, which now uses `isInside`, so `..foo` is inside and `..` is not), defaulting to the server's project root, and every call passes `knownUiValues`, so an invented `data-ui` is `unknown-component` even with no project. The project is read per call (an edit shows at once; outside a project the cost is one `stat`). Under a project `root`, `faqir_generate` can render the project's own components. `generate.ts` takes an `AuditContext` (the `HtmlAuditInput` fields minus the source) instead of a bare map. **strict:** `faqir_audit_html` and `faqir_repair_html` take `strict`, which `HtmlAuditInput.strict` hands to the vocabulary walk. The plan's name `undeclared-attribute` is already the CSS-vs-manifest rule (error, 0.8-10), so the new rule is **`undeclared-markup-attribute`** (warning, in `VOCABULARY_RULES`; inventory 38 → 39): a `data-*` inside a known component that no manifest on its chain declares and that is not protocol, a token modifier or a convention attribute. It reports only what `unknown-attribute` leaves alone (one finding per attribute), and skips an element under a component with no manifest. **Entry 33:** `extractComponents`' `declaresSlot` is tri-state (`undefined` = no manifest); a part no owner declares goes to the nearest unanswering owner, else the nearest owner as before. Its one 3-argument caller (`auditHtmlSource`) answers `undefined` for a name not in the map. `orphanPartRule` needed no edit. Docs: MCP README rows and `FAQIR_PROJECT_ROOT`, tool descriptions, README rule count (38 → 39, twice) and table row, the docs-page notes for `orphan-part`, `undeclared-markup-attribute` and `forbidden-directive` (MCP now reads the list), `security.md` §3. **Tests.** `packages/mcp/tests/write-tools.test.ts` (+7): `nonsense-thing` gives `unknown-component`; a fixture project's `widget` with `data-variant="zzz"` is `unknown-component` without `root` and `valid-variant` under `root` (relative and absolute); its `forbid_directives` applies only under `root`; `faqir_generate` renders `widget` only under `root`, and repair's `before` carries `valid-variant` and the strict finding; `strict` reports `data-bogus` (a warning, so the audit still passes), not without it, exempts `data-testid`/`data-skin`/`data-prop-*`, and honours `skip_rules`; an unknown outer owner gives no `orphan-part` while a bare card still does (fails with the old boolean callback, checked); `..`, `/etc` and the parent dir are refused by all four tools. The property matrix (~55) stays clean. `tools.test.ts`: `containedProjectRoot` accepts `..foo`. `tests/parser/html-parser.test.ts` (+5): the unanswering-owner claim, nearest wins, a declaring owner always wins, all-known stays nearest, `filledSlots` unchanged. `tests/audit/vocabulary.test.ts` (+6): off by default, both placements reported, near-miss and foreign attribute left to `unknown-attribute` unless it is skipped, the exemptions, inventory and `--skip-rules`. `tests/commands/audit.test.ts` (+1): the overlay copies, never mutates, and returns the registry map as-is outside a project. **Gates** (Bun 1.3.8): `build:audit-browser` (rewrote `site/lib/faqir-audit.js`) + `check:audit-browser`; `build:mcp`, then by hand the Node bundle with `FAQIR_PROJECT_ROOT` set: no `root` gives `unknown-component`, `root: "proj", strict: true` adds `undeclared-markup-attribute` and `forbidden-directive`, `/etc` is refused; `build:cli`, `smoke`; `build:docs` + `check:docs` (the first `check:docs` stalled at 100% CPU, the rerun took 0.4 s); `check:skill` (the skill lists no rules), `check:rules-plugin`; `typecheck`. No engine, registry or manifest change, so `size` is untouched. `bun run test`: 8,023 pass / 0 fail in the main partition; the dev-engine partition hung on start, as in 1.1F-27, and its four files run directly gave 64 pass / 0 fail. Baseline before the change: 8,004 + 63, plus one dev-server spawn timeout that passed alone.)

### 1.1F-29 · `@faqir-ui/forms`: accept `additionalProperties`, nullable unions, `examples`/`const`

**Depends:** — · **Class:** additive · **Touches:** `packages/forms/src/index.js` (`ROOT_KEYS`/`FIELD_KEYS` 19-29, `OBJECT_FIELD_KEYS`/`OBJECT_ARRAY_ITEM_KEYS` 30-34, `assertKnownKeys` 80-86, `classifyField` 228-243, `validateFieldSchema` 249-254, `rulesFieldSchema` 653-713), `packages/forms/src/index.d.ts`, `packages/forms/tests/{cases.ts,golden/*.html,forms.test.ts,rules.test.ts}`, `packages/forms/README.md`

**Verified.** These all throw:
- `additionalProperties`, at the root and on nested objects;
- `type: ["string","null"]`;
- `examples` and `const`.

The 1.1B-06 rules emission copies `schema.type` into the rules definition, and
`@faqir-ui/rules` refuses a non-string `type` (`packages/rules/src/shape.js:295-301`).

**Fix.**
- Accept `additionalProperties` at the root, on object fields and on row items. `false`
  becomes a closed-object note; anything else is ignored.
- Accept `type: [T, "null"]` for one scalar or object `T`: normalise to `T`, and emit `T` into
  rules. A field that is nullable *and* listed in `required` keeps `required` (a form cannot
  distinguish null from empty); document it. A non-null multi-type union still throws.
- Accept `examples` (first one as a placeholder if no `placeholder` is given) and `const` (a
  read-only field).

**Tests**
- Golden cases for each new keyword; the existing golden bytes are unchanged.
- `rules.test.ts`: `lintDefinition` passes on every emitted definition, including nullable
  fields.
- A non-null union still throws, with a clear message.

**Acceptance**
- [x] `bun test packages/forms`, forms typecheck, README updated. (`bun test packages/forms` 113 pass / 0 fail (+12); `tsc -p packages/forms` green, which checks the JS source and the tests against the new `index.d.ts` types (`Nullable<T>`, `AdditionalProperties`, `examples`, `const`, `default: null`). README has a new section, "`additionalProperties`, nullable fields, `examples` and `const`", and "Supported subset is strict" now names `[T, "null"]` as the one union. **How.** `additionalProperties` is accepted at the root, on object fields and on row items. `false` writes a fixed `<!-- additionalProperties: false - … -->` comment first in the form, the fieldset body or the row card (no schema text reaches it). Any other value (`true`, a schema) renders byte-identical to the keyword being absent. Nullable types are handled by one pre-pass, `denullProperties`, over the root property tree. It normalises `[T, "null"]`, in either order and for a scalar or object `T`, to `T` and drops `default: null`, so everything downstream, rules emission included, only sees a string `type`. A required nullable field stays required. Any other union throws `<path>.type [...] is a union; the only union supported is [T, "null"] …`, and so do `["array","null"]` and a root `["object","null"]`. `examples` must be a non-empty array of the field's type; the first is the placeholder of an input, textarea or date picker when the UI schema gives none, and enums and booleans ignore it. `const` (string or number) renders as a `readonly` input or textarea showing the value, a date const with no picker, and is emitted as `const` into the rules field, which `@faqir-ui/rules` accepts. It throws on a boolean (a checkbox cannot be read-only; a box that must be ticked is a required boolean), with `enum`, and with a different `default`. **Tests.** Three new goldens: `additional-properties`, `nullable` (carries a `dependentRequired`, so its definition is emitted and shows each `T`) and `examples-const`. All three are audit-clean under the §7.2 gate, and the 23 existing goldens are byte-identical. `forms.test.ts` adds 8 cases: the closed note and that other values are ignored; nullable is identical to `T` for all five types in both orders; required plus `default: null`; a non-null union throws the exact message at root, nested and row paths; examples as placeholder; const read-only; and the examples/const refusals. `rules.test.ts` adds 2: the emitted `fields` for a nullable/const/closed schema are exactly the string-typed map, pass `lintDefinition` and keep `required`; a server `validate()` accepts the const and refuses a tampered value. The existing "lints clean for every golden case that carries rules" loop now covers `nullable` too. `bun run test` 8,099 pass / 0 fail (274 files), `bun run typecheck` green, `check:skill` green, all on Bun 1.3.8. `check:docs` was red before the change, because the gitignored `site/dist` was stale; after `build:docs` it is green with no tracked change. No registry, engine or dependency change.)

### 1.1F-30 · `@faqir-ui/forms/dom`: `buildForm(schema, document) → Element` (minimal)

**Depends:** 1.1F-29 · **Class:** additive · **Touches:** new `packages/forms/src/dom.js` + `dom.d.ts`, `packages/forms/package.json` (`exports["./dom"]`), `packages/forms/tests/dom.test.ts`, `packages/forms/README.md`

**Verified constraint.** `tests/runtime.test.ts:35` asserts `index.js` mentions no
`document|window|HTMLElement|Node`. So the DOM builder must be a separate entry that takes
`document` as an argument.

**Scope (minimal, one session).**
- Scalars, nested objects and enum arrays. All text goes through `textContent`, and no
  expression is derived from the schema.
- Repeatable rows use imperative add and remove.
- Validation through the validate plugin's JS API where possible; otherwise a fixed `l-data`
  with no schema-derived content.

This removes schema-to-markup injection. It does not remove the engine's `new Function`;
say so in the README. Full parity (wizard, rules, repeatables through a shared node tree with
two serialisers) is out of scope; add a follow-up row if wanted.

**Tests**
- Uses happy-dom's `document`.
- A property name like `"><img onerror>` renders as text.
- Field types map to the same widgets as `renderForm`.
- Add and remove a row.
- No attribute value in the output contains a schema-derived string other than escaped
  labels.

**Acceptance**
- [x] Package tests + typecheck; README states when to use `buildForm` vs `renderForm`. (`packages/forms/src/dom.js` + `dom.d.ts`, exported as `@faqir-ui/forms/dom`. It checks the schema by running `renderForm`, so both accept the same subset and throw the same errors. It throws on `ui:wizard`, on `opts.rules`, and on any schema whose `renderForm` output carries a rules script (conditionals, a `pattern` no attribute can carry). The form has a bare `l-data` and `l-validate`; ids are a counter. `tests/dom.test.ts`, 31 tests: element-for-element parity with `renderForm` on the 18 golden cases it accepts plus a nullable case, ignoring ids, idrefs and directives; two mutations of `dom.js` were each caught. Also: audit-clean, built on a second happy-dom `Window`'s document, imports under plain Node, add/remove/renumber across min/max with focus on Add, per-row ids, and a hostile schema (`"><img src=x onerror=…>` as names, titles, enums, defaults, pattern, examples) that yields no `img`/`[onerror]` before or after reparsing, with schema strings only in `name`/`value`/`placeholder`/`pattern`/`aria-label`. Suite 8066 + 64 pass, typecheck green, `npm pack` ships both files. README: a new "`buildForm`" section, including that the engine's `new Function` remains. Full parity is follow-up 1.1F-41.)

---

## Task details — Release

### 1.1F-31 · Release 1.1.2: the patch set

**Depends:** 1.1F-01, 02, 03, 04, 05, 07, 08, 09, 11, 12, 13, 15, 16, 18, 20, 21, 22, 23, 24, 25, 26
(Run it by ID once these are ✅. It does not need the additive tasks.)

- Follow `docs/release-checklist.md` with `node scripts/release.mjs` under Bun 1.3.8.
  Preflight runs every `check:*`, including the new `check:component-tokens` and gate 8.
- Run the Linux-container visual run plus `test:a11y`. Expect zero visual diffs on reference
  pages.
- CHANGELOG: one line per `faqir_bugs.md` entry fixed, citing the entry number.
- In `faqir_bugs.md`, strike every fixed entry with the version.

**Acceptance**
- [ ] Tagged, published, `cdn.json` SRI verified; `faqir_bugs.md` entries struck.

**Progress (2026-10-05, session 1 — prepared, not yet published).** *Scope changed by the
owner:* every additive task was already on `main`, with its commits interleaved among the
patch commits, so 1.1.2 ships **both sets**. This is D1's additive-in-patch recommendation,
confirmed. 1.1F-32's release folds into this one, and its un-patch checklist is in the
notes. Done so far: `docs/release-1.1.2.md` (the repository has no CHANGELOG file, and the
1.1 notes live in `docs/release-1.1.md`), which has one line per entry, the behaviour
changes, the un-patch checklist and the verification record. All 33 `faqir_bugs.md` entries
are struck: 32 fixed, and 30 closed as by design (D6). `node scripts/release.mjs 1.1.2
--dry-run` on Bun 1.3.8 is green: 15 preflight gates, 8,066 + 64 / 0, seven packages at
1.1.2, 37 SRI hashes, tarball smoke under Node and Bun. `test:a11y` 4,060, `test:browser`
54 and `lint:layout` 8 all pass. The Linux-container visual run is **not done**: there is
no container runtime on this machine. When it runs, regenerate the `text` (1.1F-18) and
`form-page` (1.1F-23) baselines. **Remaining:** the owner runs `npm login`, then `node
scripts/release.mjs 1.1.2 --otp <code>`, then the checklist's "After" steps (npm versions,
jsDelivr SRI load). A follow-up session then ticks this box.

### 1.1F-32 · Release the additive set; downstream un-patch checklist

**Depends:** all of 1.1F-01 … 1.1F-30

*(2026-10-05: the release half ships inside 1.1.2 with 1.1F-31; D1 resolved as
additive-in-patch. The behaviour-change call-out and the un-patch checklist are in
`docs/release-1.1.2.md`, and entry 30 is marked closed by D6. What is left here is
confirming the publish and ticking the box.)*

- Release at the version chosen in D1. The release notes call out the behaviour change from
  1.1F-14 (links leave the Tab order of a navigable table).
- Publish the downstream un-patch checklist below in the release notes, so `indirect` can
  drop its local patches after `faqir upgrade`.

**Acceptance**
- [ ] Released; all remaining `faqir_bugs.md` entries struck or marked won't-fix (30, by D6).

---

## Downstream un-patch checklist (for `indirect` after upgrading)

`faqir upgrade` **overwrites** the downstream's `indirect:` patches. Once a fix ships the
downstream gains nothing from re-applying its patch. Until it ships, every upgrade loses the
patch. That is why 1.1F-12/16/20 (tabs, collapsible, stack, grid, text, table) and 1.1F-09
(table Tab stop) are the most valuable patch-release items.

| Entry | Downstream patch or workaround to remove | Fixed by |
|---|---|---|
| 1 | `$el.querySelector('#…')` hosts in `pages/artifact.html`, `artifact-try.mjs`, `artifact-runs.mjs`; the null-host early returns and the next-frame retry | 01, 03 |
| 2 | `l-ref`/`$refs` detours in `pages/requests.html`, `pages/settings.html` (optional: use `$this`) | 06 |
| 3 | rule "never reach a controller from `l-init`/first effect run" | 03 |
| 4, 16 | per-item `:data-state` on toggle-groups; `checkView` in `trace-conversation.mjs`; manual `.checked` in Try it | 02 |
| 5 | `indirect:` patches in `tabs.js` (+ core copies), `tabs.css`, `collapsible.css` | 12, 20 |
| 8 | manual stray-file deletion / `$schema` correction after `create`/`add` | 26 |
| 9, 10 | `--skip-rules focus-trap,controller-loaded`; "never run repair on index.html" | 24, 25 |
| 11 | grep for `l-html` at code gates (or keep it, plus the config key) | 27 |
| 12 | `:style` on the Kernel op reference. In `form-block.css` (and `source-view`, `json-view`, which still ligate) write `font-variant-ligatures: var(--mono-ligatures)`: they are downstream components, so the registry rule does not reach them | 19 |
| 13 | the `l-cloak` hash in `kernel/static.mjs`'s CSP | 07 |
| 14 | Tail button's `data-variant` swap | 17 |
| 17, 30 | nothing (the downstream's local `sm` → `--text-sm` patch is a project choice; D6) | 15, 20 |
| 18, 19 | `tabindex="-1"` on the legend panel in `index.html` (harmless to keep) | 08 |
| 20 | `indirect:` patch in `table.js` (+ core copies) | 09 |
| 21 | Enter-opens-first-link in `app/keys.mjs` (partly) | 14 |
| 22, 33 | not using the MCP audit as the code gate | 28 |
| 23, 32 | nothing yet (Search button), op picker built as a dialog (can stay) | 10 |
| 24 | pointer buttons without `data-size` in `pages/editor.html` | 17 |
| 25, 26, 27 | `indirect:` patches in `stack.css`, `grid.css`, `text.css`, `breadcrumb.css`, `table.css`, and the hand-edited `faqir.bundle.css` | 16 |
| 28 | `indirect:` text-link patch in `text.css`; matching rules in `diff-view`/`form-block` where the link is an `<a data-ui="text">`. Keep the rule for a `text` inside `a[data-ui="cluster"][href]`: the anchor there is the cluster | 18 |
| 29 | the `finding` loop-variable rename in `pages/editor.html` | 05 |
| 31 | `:style` moved to the enclosing section in `pages/namespace.html` | 04 |
| 15 | the custom Try-it DOM builder (may stay; `buildForm` is an option) | 29, 30 |
