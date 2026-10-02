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

- **Bun pin.** `.bun-version` is `1.3.8`. `build:audit-browser`, `build:rules-plugin` and
  `build:core-package` byte-compare against a minified build, so regenerate them **with Bun
  1.3.8** or their `check:*` gate goes red for an unrelated reason. Since 1.1F-05 the only Bun
  on this machine is 1.3.8, at `~/.bun/bin/bun`, which is not on the default PATH, so run
  `export PATH=$HOME/.bun/bin:$PATH` first. Sizes measured with it are about 0.3 KB higher
  than the 1.4.2 numbers recorded by 1.1F-01–04: after 1.1F-05, engine+controllers is
  45.50/46 KB gzip, leaving about 0.5 KB for the rest of the plan.
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
- **What to regenerate after a CSS edit** (`registry/**/*.css`): `build:registry-index`,
  `build:core-package` (27 theme bundles carry SRI), and `check:docs`. The engine is
  unaffected.
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
| 1.1F-10 | Command palette: case/layout-proof ⌘K, one owner, `data-no-shortcut` | 23, 32 | additive | ⬜ |
| 1.1F-11 | Sidebar: rail chevron flips, trigger label stays stable | 7 | patch | ⬜ |
| 1.1F-12 | Nesting, controllers I: tabs, accordion, dialog family, sidebar, context-menu + nesting matrix | 5, 6 | patch | ⬜ |
| 1.1F-13 | Nesting, controllers II: carousel, popover, table delegation, `:scope` pass | 5 | patch | ⬜ |
| 1.1F-14 | Table: ARIA grid handling of links/buttons inside navigable cells | 21 | additive (behaviour change) | ⬜ |

### Lane S — Styles and tokens

| ID | Task | Entries | Class | Status |
|----|------|---------|-------|--------|
| 1.1F-15 | `gen:component-tokens` + registry gate: `tokens_used` and `@ui:tokens` derived from CSS | 17, 30 | patch | ⬜ |
| 1.1F-16 | Overflow: stack `min-inline-size`, grid `minmax(0,1fr)`, `overflow-wrap` on ids | 25, 26, 27 | patch | ⬜ |
| 1.1F-17 | Button: `aria-pressed` state; link variant keeps its box under a size | 14, 24 | additive | ⬜ |
| 1.1F-18 | Text: an anchor carrying `data-ui="text"` reads as a link | 28 | patch | ⬜ |
| 1.1F-19 | `--mono-ligatures` token; every mono surface turns ligatures off | 12 | additive | ⬜ |
| 1.1F-20 | Nesting, CSS I: tabs, collapsible, accordion, description-list, progress, key-value, callout, empty-state | 5, 17, 30 | patch | ⬜ |
| 1.1F-21 | Nesting, CSS II: dialog family, popover, tooltip, sidebar, carousel, menus | 5 | patch | ⬜ |
| 1.1F-22 | Nesting, CSS III: table | 5 | patch | ⬜ |
| 1.1F-23 | Nesting, CSS IV: long tail + `descendant-part-selector` registry gate | 5 | patch | ⬜ |

### Lane T — Tooling (CLI, MCP, forms)

| ID | Task | Entries | Class | Status |
|----|------|---------|-------|--------|
| 1.1F-24 | `faqir audit` recognises every engine entry point (module, `.dev.js`, `@faqir-ui/core`) | 9 | patch | ⬜ |
| 1.1F-25 | `faqir repair`: no duplicate controllers; correct, page-relative script path | 10 | patch | ⬜ |
| 1.1F-26 | Manifest `$schema` correct at any `output_dir` depth; `init` writes the schema | 8 | patch | ⬜ |
| 1.1F-27 | `audit.forbid_directives` in `faqir.config.json` | 11 | additive | ⬜ |
| 1.1F-28 | MCP audit is project-aware (`root`, known names, `strict`); `orphan-part` with unknown owners | 22, 33 | additive | ⬜ |
| 1.1F-29 | `@faqir-ui/forms`: accept `additionalProperties`, nullable unions, `examples`/`const` | 15 | additive | ⬜ |
| 1.1F-30 | `@faqir-ui/forms/dom`: `buildForm(schema, document) → Element` (minimal) | 15 | additive | ⬜ |

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
| 1.1F-35 | `site/styles/docs.css:446-456,1046-1050` hand-roll pressed buttons. Delete what 1.1F-17 makes redundant, or confirm it went in that task. | verification of entry 14 | ⬜ |
| 1.1F-36 | An `l-teleport` inside `l-if` / `l-for` content moves its element out before insertion, so `renderThenInit` never sees it: its held `l-init` runs before its controllers, which only the MutationObserver starts. Start controllers on teleported nodes in `handleTeleport` while `pendingInits` is open, or document the gap. Also: a scope root's own `l-init` in inserted content now runs after its children bind (static pages: before) — confirm that asymmetry is acceptable. | 1.1F-03 | ⬜ |

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
- [ ] `props.noShortcut`, version bump, `changes`, a11y keyboard text "Cmd/Ctrl+K (case-insensitive)"; `gen:skill`, `gen:bindings` (typed prop), `build:registry-index`; standard controller set; size.

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
- [ ] Manifest `slots.trigger.description` updated, `changes`; `gen:skill`, `gen:bindings` (HTML), `build:registry-index`, `build:core-package`. LTR baselines pixel-identical.

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
- [ ] Every matrix row green; existing recipe tests unchanged.
- [ ] Downstream `indirect:` patch in `tabs.js` (and core copies) can be dropped.
- [ ] Standard controller regeneration set; size checked. The guard is duplicated per controller, so watch the 46 KB budget; if it is tight, move `owner` into `registry/core/dom.js` and accept the packaging work.

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
- [ ] Matrix green; the standard controller regeneration set; size.

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
- [ ] Manifest `a11y.keyboard` gains the Enter/F2 and Escape rows; the `navigable` prop description is updated; `changes` flags the behaviour change; `gen:skill`.
- [ ] Standard controller regeneration set; size.
- [ ] Downstream: `app/keys.mjs`'s Enter-opens-first-link becomes redundant for cells with a single link.

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
- [ ] `bun run check:component-tokens` and `audit:registry` green; `release.mjs` preflight runs it; CONTRIBUTING and AGENTS list the generator.
- [ ] `gen:skill`, `build:registry-index`, `check:schema-refs` green.
- [ ] Later Lane S tasks use the generator instead of hand-editing headers.

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
- [ ] Manifests: stack 2.0.1, grid 2.2.0, text/breadcrumb/table/description-list `changes`.
- [ ] `build:registry-index`, `build:core-package` (pinned Bun), `check:docs`; reference-page baselines unchanged.
- [ ] Downstream `indirect:` patches in stack/grid/text/breadcrumb/table/`faqir.bundle.css` can be dropped.

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
- [ ] Manifest: `states.pressed`, a11y note (`type="button"`, the label must not change with state), `html_pressed` template, version 1.2.0, `changes`; tokens via `gen:component-tokens`.
- [ ] `gen:skill`, `gen:bindings`/`check:bindings` (new state), `build:registry-index`, `build:core-package`, `check:docs`.
- [ ] Downstream: the Tail button's variant swap and the editor pointers' missing `data-size` are no longer needed.

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
- [ ] Manifest template + note + `changes`; tokens via `gen:component-tokens`; `gen:skill`, `gen:bindings` (template), `build:registry-index`, `build:core-package`.
- [ ] Downstream `indirect:` text-link patch and the matching `diff-view`/`form-block` rules can be dropped.

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
- [ ] `gen:theme-manifests` (27 files, `tokens_inherited` only), `gen:component-tokens`, `gen:skill`, `build:core-package`, `check:docs`.
- [ ] Downstream `form-block` and Kernel op-reference ligature workarounds can be dropped.

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
- [ ] Reference-page visual run pixel-identical (canonical markup is direct-child).
- [ ] `build:registry-index`, `build:core-package`, `gen:skill` (notes), `check:docs`.
- [ ] Downstream `indirect:` patches in `tabs.css`/`collapsible.css` can be dropped.

### 1.1F-21 · Nesting, CSS II: overlays and menus

**Depends:** 1.1F-20, 1.1F-11 · **Class:** patch · **Touches:** CSS + `changes` for `recipes/{dialog (22), alert-dialog (16), drawer (24), sheet (37), popover (44), tooltip (20), sidebar (32), carousel (23), context-menu (13), dropdown (22), menubar (22)}`, nesting fixtures

**Fix.** The 1.1F-20 strategy. **menubar submenus are intentional same-type nesting**; check
its HTML before converting. Watch the 1.1F-08 panel-focus rule and the 1.1F-11 chevron rule,
and convert them too.

**Tests.** A selector-parse test for these files. Playwright: a dialog holding a popover keeps
the popover's header, body and close styles; a dropdown inside the sidebar footer keeps its
item styles.

**Acceptance**
- [ ] Reference visual run pixel-identical; regeneration as 1.1F-20.

### 1.1F-22 · Nesting, CSS III: table

**Depends:** 1.1F-20, 1.1F-16 · **Class:** patch · **Touches:** `registry/recipes/table/table.css` (147 descendant part selectors), table manifest `changes`, a nested-table fixture

**Fix.** Use `table > thead/tbody > tr > th/td` chains; the canonical markup is all parts.
Keep the 1.1F-16 `overflow-wrap: inherit` exception working. A nested table in a
`detail-row` must not be hit by the outer table's striping, hover, selection or pin rules.

**Tests.** A selector-parse test; a Playwright nested-table fixture (the inner rows are not
striped or pinned by the outer table).

**Acceptance**
- [ ] Reference visual run pixel-identical; regeneration as 1.1F-20.

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
- [ ] Gate in `audit:registry` and in `release.mjs` preflight; reference visual run pixel-identical; regeneration as 1.1F-20.

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
- [ ] The downstream `index.html` audits clean without `--skip-rules focus-trap,controller-loaded`.
- [ ] Docs page, README rule table and skill text updated; `gen:skill`, `check:skill`, `check:docs`, `build:audit-browser` + `check:audit-browser` (pinned Bun), `build:cli`, `smoke`.

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
- [ ] Docs note updated; `build:audit-browser` (pinned Bun) if `src/audit/` changed; `build:cli`, `smoke`, `check:docs`.

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
- [ ] `build:cli`, `smoke`; README `create`/`init` text updated.

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
- [ ] `security.md` §3 points at the knob; rule docs and the coverage test green; `build:audit-browser` (pinned Bun), `build:cli`, `smoke`, `check:docs`, `gen:skill` if the skill lists rules.

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
- [ ] Tests under `packages/mcp/` green + root typecheck; `build:mcp`; MCP README and tool descriptions explain `root` and `strict`; `build:audit-browser` (pinned Bun) if `src/audit/` changed.

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
- [ ] `bun test packages/forms`, forms typecheck, README updated.

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
- [ ] Package tests + typecheck; README states when to use `buildForm` vs `renderForm`.

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

### 1.1F-32 · Release the additive set; downstream un-patch checklist

**Depends:** all of 1.1F-01 … 1.1F-30

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
| 12 | `font-variant-ligatures: none` in `form-block.css`; `:style` on the Kernel op reference | 19 |
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
| 28 | `indirect:` text-link patch in `text.css`; matching rules in `diff-view`/`form-block` | 18 |
| 29 | the `finding` loop-variable rename in `pages/editor.html` | 05 |
| 31 | `:style` moved to the enclosing section in `pages/namespace.html` | 04 |
| 15 | the custom Try-it DOM builder (may stay; `buildForm` is an option) | 29, 30 |
