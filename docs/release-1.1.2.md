# Faqir UI 1.1.2 — release notes

1.1.2 fixes the 33 bugs that the downstream `indirect` dashboard found while
building on 1.1.1 (`faqir_bugs.md`). It ships the patch fixes and the small
additive pieces they needed: one magic, one prop, one token, one config key, MCP
inputs and a forms entry point. The protocol did not change. Every addition
falls under [`SPEC-1.0.md`](../SPEC-1.0.md) §1.2/§8.2, and every 1.1.1 page still
audits clean.

The plan split this work into a patch release and an additive release
(`FAQIR-PLAN-1.1-FIXES.md`, 1.1F-31/32). Both sets were already on `main`, with
their commits interleaved, so they ship together. This follows decision D1:
additive changes in a patch release are acceptable here, as they were in 1.1.1.

Seven packages ship at 1.1.2, in lockstep: `faqir-ui-cli`, `@faqir-ui/core`,
`@faqir-ui/react`, `@faqir-ui/vue`, `@faqir-ui/forms`, `@faqir-ui/rules` and
`@faqir-ui/mcp`.

---

## Behaviour changes to read first

- **Links and buttons inside a navigable table leave the Tab order** (entry 21,
  1.1F-14). This is the ARIA grid pattern. A focusable control in a
  `data-navigable` table's cell gets `tabindex="-1"`, so Tab moves into the grid
  once and the arrow keys move inside it. Enter or F2 moves focus into the cell's
  control, and Escape returns to the cell. `destroy()` restores the original
  `tabindex` values. The table's own checkbox, drag-handle, expander and
  row-toggle parts, and nested tables, are left alone.
- **Engine-injected `l-cloak` style removed** (entry 13, 1.1F-07). The `[l-cloak]`
  rule already ships in `base/reset.css`, so `style-src 'self'` needs no hash
  and no `'unsafe-inline'`. A page that runs the engine **without** the Faqir
  stylesheet has to add the rule itself (`security.md` §2).
- **Part selectors match their own component only** (entry 5, 1.1F-12/13/20–23).
  Component CSS and controllers now reach their parts through child chains, so
  a component nested inside another keeps its own styling and behaviour. This
  covers a tabs inside a tabs, a dropdown in a sidebar footer, a popover in a
  dialog and similar. Specificity is unchanged. Shapes the manifests allow
  beyond direct children are listed on each slot. One visible effect: options in
  a radio or checkbox group inside a `field-group` no longer take the field
  label's typography (follow-up 1.1F-40).
- **The sidebar trigger's label no longer changes** (entry 7, 1.1F-11). The label
  is "Toggle sidebar", and `aria-expanded` carries the state.

## Fixed, by `faqir_bugs.md` entry

**Engine**
- **1** — An `l-ref` inside `l-if` content, an `l-for` row, an `l-teleport` or a
  stray element now registers on its scope's real root, so `$refs` sees it, and
  `$refs` is reactive. (1.1F-01)
- **2** — New `$this` magic: the element the directive is on. (1.1F-06, additive)
- **3** — Controllers in content that `l-if` or `l-for` inserts start before that
  content's `l-init` and first `l-effect` run. (1.1F-03)
- **4** — `l-model` on a radio or checkbox dispatches a bubbling `faqir:model`,
  and a toggle-group follows the store. The checked radio keeps its Tab stop.
  (1.1F-02)
- **16** — `:checked`, `:selected`, `:muted`, `:indeterminate` and `:value` set the
  DOM property, not only the attribute. (1.1F-02)
- **29** — A method called from an `l-for` row writes its own component's field
  instead of the row's loop variable. The dev build warns when a loop variable
  shadows a method's field. (1.1F-05)
- **31** — `:style` and `:class` merge with what is already on the element: they
  keep a static `style`, remove only keys they set themselves, accept the array
  form, and leave controller classes alone. (1.1F-04)
- **13** — No injected `<style>`; see the behaviour changes above. (1.1F-07)

**Recipes and primitives**
- **5** — Nested components keep their own parts, in controllers (tabs,
  accordion, the dialog family, sidebar, context-menu, carousel, popover,
  tooltip, table) and in 50 stylesheets. Registry gate 9
  (`descendant-part-selector`) keeps it that way. (1.1F-12, 13, 20–23)
- **6** — The sidebar controller no longer takes a footer dropdown's trigger for
  its own. (1.1F-12)
- **7** — The sidebar chevron flips in rail mode, and the trigger label stays the
  same. (1.1F-11)
- **14** — `button` styles `aria-pressed="true"`. (1.1F-17, additive state)
- **17** — `description-list` and `progress` declare exactly the tokens their CSS
  reads. Registry-wide, `tokens_used` and the `@ui:tokens` header are now
  generated from the CSS (`gen:component-tokens`, gate 8). (1.1F-15, 20)
- **18** — Dialog, alert-dialog, drawer and sheet return focus to the opener
  only if focus is still inside the overlay (or on `body`) when the exit
  animation ends, so focus that moved elsewhere in the meantime stays there.
  (1.1F-08)
- **19** — The same four overlays give their panel `tabindex="-1"`, so a dialog
  with no focusable content still takes focus and traps it. (1.1F-08)
- **20** — A navigable table's roving Tab stop moves to another cell when its row
  is removed, filtered out or collapsed, or when its column is hidden. (1.1F-09)
- **21** — Interactive content in navigable cells follows the ARIA grid pattern;
  see the behaviour changes above. (1.1F-14)
- **23** — ⌘K / Ctrl+K works with Caps Lock on and on non-Latin keyboard layouts.
  ⌘⇧K still does not open the palette, by design (D3). (1.1F-10)
- **24** — `data-variant="link"` keeps its inline box under a `data-size`.
  (1.1F-17)
- **25** — A `stack` child with `data-flex="1"` or `"auto"` can shrink below its
  content. (1.1F-16)
- **26** — `grid` tracks are `minmax(0, 1fr)`, so a wide child no longer widens
  the grid. The horizontal description-list gets the same fix. (1.1F-16)
- **27** — Headings, mono text and breadcrumbs break long tokens
  (`overflow-wrap: anywhere`). Table cells are exempt. (1.1F-16)
- **28** — An anchor with `data-ui="text"` is underlined and has the link focus
  ring. (1.1F-18)
- **30** — Closed, not changed (D6). `sm` → `--text-xs` is the registry-wide
  convention, and the details slot now documents it. The stale token header is
  fixed by entry 17. (1.1F-15, 20)
- **32** — `data-no-shortcut` opts a palette out of ⌘K, and only one palette
  handles each key press. The manifest notes that a search field kept in the
  page shares the page's undo history. (1.1F-10, additive prop)

**CLI and MCP**
- **8** — A manifest's `$schema` resolves at any `output_dir` depth. `init` writes
  `manifest.schema.json`, and `add` repoints the manifests it installs.
  (1.1F-26)
- **9** — `faqir audit` recognises every engine entry point: the classic script,
  `.min.js`, `.dev.js`, the ES module and `@faqir-ui/core`. It also reads import
  maps and follows local module scripts. (1.1F-24)
- **10** — `faqir repair` loads `<output_dir>/core/faqir.js` by a page-relative
  path. It no longer adds controller scripts the bundle already contains.
  (1.1F-25)
- **11** — `audit.forbid_directives` in `faqir.config.json` bans directives by
  name. `faqir doctor` validates the key. (1.1F-27, additive config key)
- **22** — The MCP audit is project-aware. `faqir_audit_html` and its siblings
  take `root` and `strict` and read the project's manifests, known names, styles
  and `forbid_directives`. Unknown components are reported. (1.1F-28, additive
  inputs)
- **33** — A part that no enclosing component's manifest declares goes to the
  nearest enclosing component that has no manifest, not to the nearest
  component. A card's part inside a project component that the audit cannot see
  is therefore no longer an `orphan-part`. (1.1F-28)

**Themes and tokens**
- **12** — New `--mono-ligatures` token (default `none`). Every mono surface reads
  it, so Cascadia Code and JetBrains Mono no longer join `!=`, `=>` or `->`.
  (1.1F-19, additive token)

**Forms**
- **15** — `@faqir-ui/forms` accepts `additionalProperties`, nullable unions
  (`type: [T, "null"]`), `examples` and `const`. New `@faqir-ui/forms/dom`
  `buildForm(schema, document)` builds the form as DOM nodes, so an untrusted
  schema never goes through `innerHTML`. (1.1F-29, 30, additive entry point)

---

## Downstream un-patch checklist (for `indirect`, after `faqir upgrade`)

`faqir upgrade` **overwrites** the `indirect:` patches, so after upgrading to
1.1.2 remove each workaround below rather than re-applying it.

| Entry | Downstream patch or workaround to remove | Fixed by |
|---|---|---|
| 1 | `$el.querySelector('#…')` hosts in `pages/artifact.html`, `artifact-try.mjs`, `artifact-runs.mjs`; the null-host early returns and the next-frame retry | 1.1F-01, 03 |
| 2 | `l-ref`/`$refs` detours in `pages/requests.html`, `pages/settings.html` (optional: use `$this`) | 1.1F-06 |
| 3 | rule "never reach a controller from `l-init`/first effect run" | 1.1F-03 |
| 4, 16 | per-item `:data-state` on toggle-groups; `checkView` in `trace-conversation.mjs`; manual `.checked` in Try it | 1.1F-02 |
| 5 | `indirect:` patches in `tabs.js` (+ core copies), `tabs.css`, `collapsible.css` | 1.1F-12, 20 |
| 8 | manual stray-file deletion / `$schema` correction after `create`/`add` | 1.1F-26 |
| 9, 10 | `--skip-rules focus-trap,controller-loaded`; "never run repair on index.html" | 1.1F-24, 25 |
| 11 | grep for `l-html` at code gates (or keep it, plus the config key) | 1.1F-27 |
| 12 | `:style` on the Kernel op reference. In `form-block.css` (and `source-view`, `json-view`, which still ligate) write `font-variant-ligatures: var(--mono-ligatures)`: they are downstream components, so the registry rule does not reach them | 1.1F-19 |
| 13 | the `l-cloak` hash in `kernel/static.mjs`'s CSP (`sha256-TK7YunP/5zK/OzmXN4Sius1ld5L9fMfv6o9LFcB+vmk=`) | 1.1F-07 |
| 14 | Tail button's `data-variant` swap | 1.1F-17 |
| 17, 30 | nothing (the local `sm` → `--text-sm` patch is a project choice; D6) | 1.1F-15, 20 |
| 18, 19 | `tabindex="-1"` on the legend panel in `index.html` (harmless to keep) | 1.1F-08 |
| 20 | `indirect:` patch in `table.js` (+ core copies) | 1.1F-09 |
| 21 | Enter-opens-first-link in `app/keys.mjs` (partly) | 1.1F-14 |
| 22, 33 | not using the MCP audit as the code gate | 1.1F-28 |
| 23, 32 | nothing yet (Search button); op picker built as a dialog (can stay) | 1.1F-10 |
| 24 | pointer buttons without `data-size` in `pages/editor.html` | 1.1F-17 |
| 25, 26, 27 | `indirect:` patches in `stack.css`, `grid.css`, `text.css`, `breadcrumb.css`, `table.css`, and the hand-edited `faqir.bundle.css` | 1.1F-16 |
| 28 | `indirect:` text-link patch in `text.css`; matching rules in `diff-view`/`form-block` where the link is an `<a data-ui="text">`. Keep the rule for a `text` inside `a[data-ui="cluster"][href]`: the anchor there is the cluster | 1.1F-18 |
| 29 | the `finding` loop-variable rename in `pages/editor.html` | 1.1F-05 |
| 31 | `:style` moved to the enclosing section in `pages/namespace.html` | 1.1F-04 |
| 15 | the custom Try-it DOM builder (may stay; `buildForm` is an option) | 1.1F-29, 30 |

---

## Known gaps

- **No npm provenance.** It needs an OIDC token from a CI provider, and this
  repository runs no CI. Verify the artifacts against the `v1.1.2` tag.
- Open follow-ups from the fix plan, none of them a regression: 1.1F-33
  (`inspect()` lists clone top nodes as scopes), 34 (nested `l-data` does not
  inherit parent data), 36 (an `l-teleport` in inserted content starts its
  controllers late), 37 (a docs visual test that is flaky on macOS), 38 (the
  docs site's own mono rules ignore `--mono-ligatures`), 39 (twelve pattern
  sheets still pending conversion to child chains), 40 (radio and checkbox
  option typography), 41 (`buildForm` parity with `renderForm`).

---

## Release verification
