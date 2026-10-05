# Faqir upstream notes

Bugs and rough edges found in faqir-ui 1.1.1 (faqir-ui-cli 1.1.1) while building the
`indirect` dashboard, to fix in faqir's own repository once the UI layer is finished.
Each entry says what we saw, where it lives, why it happens, what this repository does
about it today, and a suggested fix. Sources: `LOG-UI.md` (the session that found it)
and `VISION-UI.md` §14.

When an entry is fixed upstream and `faqir upgrade` brings it in, remove the local patch
or workaround named under **Here**, and strike the entry.

---

## Engine (`ui/core/faqir-core.js`, `faqir-core.dev.js`, `faqir-core.mjs`)

### ~~1. `l-ref` inside `l-if` content is never visible in `$refs`~~

> **Fixed in 1.1.2** (1.1F-01). After `faqir upgrade`, drop what **Here** names; the un-patch checklist is in `docs/release-1.1.2.md`.

- **Seen:** D3a, session 6. `l-ref="render"` on an element inside `<template l-if>`;
  `$refs.render` is `undefined` in the same scope's expressions, so
  `l-effect="drawRender($refs.render)"` threw on every run.
  D7a, session 26 (tested in Chrome): the Try it panel is the top node of an
  `<template l-if="kind === 'flow'">`, and its three hosts (`tryInput`, `trySchema`,
  `tryAnswer`) were reached through `$refs`. The refs sat in the panel's
  `__faqirRefs`, `$refs` had none of them, and the input editor, the schema and the
  answer were never drawn. Nothing reached the console.
  D8c, session 32 (tested in Chrome): the agent Runs tab's range select and errors
  checkbox, each with `l-effect="$el.querySelector('#…').value = …"`, threw
  "Cannot set properties of null" on the first run and showed *Last hour* while the
  tab had loaded 24 hours: the clone is bound before it is inserted, and unlike a drawn
  host, nothing else changes afterwards to run the effect again.
- **Where:** `handleIf` stamps each cloned top node with `__faqirScope = scope` (the
  enclosing scope) before `processElement`; `handleRef` then calls `findScopeRoot(el)`,
  which walks up to the first node carrying `__faqirScope`: the clone's own top node,
  not the `l-data` root. The ref is written to the clone's `__faqirRefs`, while `$refs`
  reads the scope root's (`getScopeRefs(root)`). The same probably holds for `l-for`
  rows (`handleFor` stamps them the same way); not checked.
- **Here:** `pages/artifact.html` gives the host an `id` and passes
  `$el.querySelector('#artifact-render')`; `drawRender` reads its reactive inputs before
  checking for the host, because on the first run the clone is not yet in the document.
  D7a, session 26: the same for the Try it panel's three hosts (`#artifact-try-input`,
  `#artifact-try-schema`, `#artifact-try-values`); `mountTry`, `drawTrySchema` and
  `drawTry` in `app/pages/artifact-try.mjs` read their reactive inputs, then return on a
  null host.
  D8c, session 32: `runsShowFilters` in `app/pages/artifact-runs.mjs` reads the filters,
  then sets the two controls, and when they are not in the document yet, sets them again
  on the next animation frame.
- **Suggested fix:** register refs on the scope's real root (keep a reference to the
  root element on the scope object, or mark clone top nodes differently from `l-data`
  roots so `findScopeRoot` skips them).

### ~~2. No way for an expression to reach the element it is written on~~

> **Fixed in 1.1.2** (1.1F-06). After `faqir upgrade`, drop what **Here** names; the un-patch checklist is in `docs/release-1.1.2.md`.

- **Seen:** D3a, while working around entry 1. Expressions compile to
  `new Function('$scope', '$el', 'with($scope) { … }')` and are called with the
  directive's element as `$el`, but the scope object defines its own `$el` (the scope
  root), which `with` finds first. The parameter is unreachable.
  D6a, session 19: `l-effect="fillFlows($el)"` on a `<select>` replaced the whole page
  section with `<option>`s, and `$el.checked = …` on two checkboxes set a property on
  the section; the manifest line (`@ui:magic $el`) says so, but the parameter invites
  the mistake.
- **Here:** nothing beyond entry 1's workaround; `pages/requests.html` and
  `pages/settings.html` reach their controls through `l-ref` and `$refs`.
- **Suggested fix:** name the parameter differently and expose it as a documented magic
  (`$this` or `$self`: the element the directive is on). It would also have made entry 1
  a non-issue for `l-effect` hosts.

### ~~3. Controllers inside inserted content start after its directives are bound~~

> **Fixed in 1.1.2** (1.1F-03). After `faqir upgrade`, drop what **Here** names; the un-patch checklist is in `docs/release-1.1.2.md`.

- **Seen:** D1, session 2. For a fragment inserted into the document (the router's
  pages), the engine binds `l-*` directives first and initialises the recipe controllers
  inside it afterwards. `$ui('#x')` in `l-init`, or in an `l-effect`'s first run, returns
  `null`, and an effect that read nothing reactive before that never runs again.
- **Here:** pages never reach a controller from `l-init` or an effect's first run; the
  toggle-group binds `:data-state` itself (entry 6).
- **Suggested fix:** initialise controllers of an inserted subtree before binding its
  directives, or document the order and offer a hook that runs after both.

### ~~4. `l-model` on a radio/checkbox does not tell the controller~~

> **Fixed in 1.1.2** (1.1F-02). After `faqir upgrade`, drop what **Here** names; the un-patch checklist is in `docs/release-1.1.2.md`.

- **Seen:** D1, session 2, with `toggle-group`. `l-model` sets `.checked` directly and
  fires no `change` event, so a controller that moves `data-state` only on `change`
  falls out of step when the store changes elsewhere (the header theme toggle and the
  Settings page share one store value).
- **Here:** each toggle-group item binds `:data-state` from the store.
- **Suggested fix:** either dispatch `change` (or a faqir event) when `l-model` writes a
  control, or have the toggle-group controller derive `data-state` from `checked`
  (observe the property, or re-read it on `input`/`change` and on a store-driven update).

### ~~16. `:checked` (and every boolean binding) sets the attribute, not the property~~

> **Fixed in 1.1.2** (1.1F-02). After `faqir upgrade`, drop what **Here** names; the un-patch checklist is in `docs/release-1.1.2.md`.

- **Seen:** D8b, session 31 (tested in Chrome). The trace page's Conversation |
  Waterfall toggle-group bound each radio with `:checked="view === '…'"`. After a click
  on Conversation, following a link to `?view=waterfall` moved `data-state` (bound
  separately) but left the Conversation radio `checked`, so both items looked on: the
  toggle-group's CSS reads `:checked`.
- **Where:** `handleBind` (`faqir-core.dev.js` §3.8) treats `checked`, `selected`,
  `open`, `disabled` and the other `BOOLEAN_ATTRS` by `setAttribute` /
  `removeAttribute` only. A form control's `checked` attribute is its *default*: once
  the control is dirty (clicked, or set by script), the property no longer follows the
  attribute, so the binding stops showing on screen while the DOM attribute says
  otherwise. `open` on `<details>` and `selected` on `<option>` have the same split.
- **Here:** the trace page keeps `:checked` on its view radios for their first state
  (without it the toggle-group controller, which starts after the bindings (entry 3),
  finds no radio checked and turns every item off), and `checkView` in
  `app/pages/trace-conversation.mjs` sets the property whenever the view changes. The
  Try it view toggle (D7b) already set `.checked` by hand when it refused a switch.
- **Suggested fix:** for `checked`, `selected`, `open`, `indeterminate` (and `value`),
  set the property as well as the attribute (`el[attrName] = !!value`), as `l-model`
  already does for its own writes.

### ~~29. A method called from an `l-for` row writes the row's loop variable, not its own field~~

> **Fixed in 1.1.2** (1.1F-05). After `faqir upgrade`, drop what **Here** names; the un-patch checklist is in `docs/release-1.1.2.md`.

- **Seen:** D14f, session 55 (tested in Chrome). The editor's Errors and Warnings lists
  were `l-for="(problem, i) in …"`, and the page has a field `problem` of its own. A row's
  *line n* button calls `goToPointer(problem.at)`, which, while a pause is pending, calls
  `this.pause()`, which sets `this.problem = …`. Called from the row, `this` is the row's
  scope, so the write went to the row's `problem` (null) instead of the page's: the row
  went blank, every expression in it warned "Cannot read properties of null", and the
  page's own `problem` kept its old value. Nothing pointed at the cause.
- **Where:** `createForItemScope`'s `set` trap (`faqir-core.js` line 1780) writes to
  the row when the key is one of its own (`key in target`), and expressions call methods
  with that proxy as `this`. Expected for a direct `problem = x` in a row expression,
  surprising for a method defined on the `l-data` object, whose `this` reads as the
  component.
- **Here:** the lists' loop variable is `finding`, a name the page does not use
  (`pages/editor.html`, with a comment). Any other page whose row calls a method that
  writes a field named like the loop variable has the same trap; none was found.
  Session 56 searched every page: a row scope owns only its loop variable and its
  index (`index` when unnamed), and no page method reads or writes `this.<either>`.
  The one loop variable named like a page field is `role` on Artifacts, whose row only
  shows it (`l-text="role"`); nothing changed.
- **Suggested fix:** call methods of an `l-data` object with that object's scope as
  `this`, not the row's (bind them when the scope is created), or at least warn in the
  dev build when a row's set trap writes its loop variable from inside a method.

### ~~31. A `:style` binding replaces the whole inline style~~

> **Fixed in 1.1.2** (1.1F-04). After `faqir upgrade`, drop what **Here** names; the un-patch checklist is in `docs/release-1.1.2.md`.

- **Seen:** D15e, session 57, building the windowed entries table of a namespace page.
  `:style` on the table's root set `--table-max-height`; the table controller writes
  `--table-thead-h` on the same element's `style`, and the section's `l-show` writes
  `display: none` there too. Each re-run of the binding wiped both: the sticky header
  lost its offset, and a hidden element showed.
- **Where:** `handleBind` assigns `el.style.cssText` for `style` (`faqir-core.js` around
  line 1232), so whatever else wrote the inline style (the engine's own `l-show`, a
  recipe controller) is lost at the binding's next run.
- **Here:** worked around: the `:style` moved to the enclosing section, the custom
  property reaching the table by inheritance (`pages/namespace.html`, with a comment).
  The Kernel page's Ops tables bind `:style` only on elements nothing else styles.
- **Suggested fix:** bind `:style` per declaration (`style.setProperty` for each entry
  of an object or a parsed string, removing only the declarations the binding set the
  last time), so `l-show` and controllers keep theirs.

---

## Recipes and primitives

### ~~5. Descendant selectors take nested components' parts for their own~~

> **Fixed in 1.1.2** (1.1F-12, 1.1F-13, 1.1F-20–23). After `faqir upgrade`, drop what **Here** names; the un-patch checklist is in `docs/release-1.1.2.md`.

The same bug in three places, found in D2c (session 5) when a `collapsible` was put
inside a `tabs` panel and inside another `collapsible`. Each is patched here with an
`indirect:` comment; `faqir diff tabs` and `faqir diff collapsible` show the patches.
They must be re-applied after any `faqir upgrade` until fixed upstream.

- **tabs controller** (`recipes/tabs/tabs.js`, and its inlined copies in
  `core/faqir-core.js` and `core/faqir-core.dev.js`): triggers and panels were found
  with `root.querySelectorAll("[data-part='trigger']")`, so a collapsible's `<summary>`
  inside a panel became a tab (it lost its tab stop on any tab click, and arrow keys
  moved to it). Patched to `:scope > [data-part='list'] > [data-part='trigger']` and
  `:scope > [data-part='panel']`; the list itself `:scope > [data-part='list']`.
- **tabs.css:** trigger and panel rules styled every descendant `[data-part=trigger]`
  as a tab. Patched to `[data-ui="tabs"] > [data-part="list"] > [data-part="trigger"]`
  (and the same for panels and variants).
- **collapsible.css:** an open collapsible turned the chevrons, and styled the triggers
  and content, of every collapsible inside it. Patched to child selectors.
- **Suggested fix:** scope every part selector in recipes and primitives to the
  component's own parts (`:scope >` in controllers, `>` chains or `:not([data-ui] [data-ui] *)`
  style guards in CSS), and add a nesting case to faqir's own tests.

### ~~6. sidebar controller: the same unscoped selector, not yet harmful~~

> **Fixed in 1.1.2** (1.1F-12). After `faqir upgrade`, drop what **Here** names; the un-patch checklist is in `docs/release-1.1.2.md`.

- **Seen:** D2c review. `recipes/sidebar/sidebar.js:39` collects
  `root.querySelectorAll("[data-part='trigger']")`, so any component with a `trigger`
  part inside the sidebar would toggle it. Nothing in the dashboard's sidebar has one
  today.
- **Here:** not patched.
- **Suggested fix:** as entry 5.

### ~~7. sidebar: the trigger's chevron does not flip in rail mode~~

> **Fixed in 1.1.2** (1.1F-11). After `faqir upgrade`, drop what **Here** names; the un-patch checklist is in `docs/release-1.1.2.md`.

- **Seen:** D1, session 2. Collapsing the sidebar to its rail leaves the trigger's
  chevron pointing the same way.
- **Here:** not patched.

### ~~14. button: `aria-pressed` is not styled~~

> **Fixed in 1.1.2** (1.1F-17). After `faqir upgrade`, drop what **Here** names; the un-patch checklist is in `docs/release-1.1.2.md`.

- **Seen:** D6d, session 22. The Requests page's *Tail* toggle is a `button` with
  `aria-pressed`; pressed and not pressed look the same (`data-variant="outline"`
  either way). *Pause* (D6a) has the same markup and is readable only because its label
  changes to *Resume*. The manifest names no pressed state, and `toggle-group` styles
  its own items only.
- **Where:** `primitives/button/button.css` has no `[aria-pressed="true"]` rule; the
  manifest lists no `aria-pressed` under states or a11y.
- **Here:** the Tail button switches `data-variant` to `secondary` while on
  (`pages/requests.html`). Pause is unchanged.
- **Suggested fix:** a `[data-ui="button"][aria-pressed="true"]` rule per variant (for
  `outline` and `ghost`, the `secondary` fill), and `aria-pressed` in the manifest as a
  state, so a toggle button needs no variant swapping.

### ~~17. description-list: tokens the manifest does not declare, and descendant part selectors~~

> **Fixed in 1.1.2** (1.1F-15, 1.1F-20). After `faqir upgrade`, drop what **Here** names; the un-patch checklist is in `docs/release-1.1.2.md`.

- **Seen:** D11a, session 38, reading the files `faqir add description-list` installed.
  `description-list.css` reads `--doc-font`, `--doc-line-height` and `--space-1`
  (each with a fallback); its header comment lists them, the manifest's `tokens_used`
  does not. The audit passes either way.
  Its term and details rules are descendant selectors
  (`[data-ui="description-list"] [data-part="term"]`), entry 5's pattern: a component
  with a `term` or `details` part inside a `<dd>` would take the list's styles. None
  of the dashboard's has one.
  D12a, session 40, `faqir add progress`: the other way round. `progress.css`'s
  `@ui:tokens` header lists `radius-md`, which the CSS never reads, and leaves out
  `color-fg-muted`, `space-2` and `text-sm`, which it does; the manifest's `tokens_used`
  matches the CSS. Its part rules are descendant selectors too, among them the common
  name `label` (`[data-ui="progress"] [data-part="label"]`). The Overview nests nothing
  inside its progress bar.
- **Where:** `primitives/description-list/description-list.manifest.json`
  (`tokens_used`), `primitives/description-list/description-list.css`;
  `primitives/progress/progress.css` (its header).
- **Here:** nothing. `pages/kernel.html` puts only `text`, `badge` and `cluster` inside
  its `<dd>`s.
- **Suggested fix:** generate `tokens_used` from the CSS (or have the audit compare the
  two), and scope the part rules with `>` as in entry 5.

### ~~18. dialog: the focus restored after the exit motion takes focus from what opened meanwhile~~

> **Fixed in 1.1.2** (1.1F-08). After `faqir upgrade`, drop what **Here** names; the un-patch checklist is in `docs/release-1.1.2.md`.

- **Seen:** D13a, session 42. With an alert-dialog closing (Cancel clicked, state
  `closing`), ⌘K opened the command palette and focused its search field; when the
  dialog's exit motion ended, focus moved to the dialog's trigger (the row's Activate
  button), leaving the palette open, its focus trap holding nothing, and the typed
  search going to the page. Reproduced by script: cancel, `open()` of the palette at
  once, one second later focus is on Activate. By hand it needs Escape and ⌘K within
  the exit motion.
- **Where:** `recipes/dialog/dialog.js` `close()`: `onEnd` (run by `whenExitDone`)
  calls `previouslyFocused?.focus()` whatever holds focus by then. alert-dialog wraps
  the dialog controller, so it inherits this. The command palette restores focus in
  `close()` at once and has no such window.
- **Here:** nothing.
- **Suggested fix:** in `onEnd`, restore focus only when it is still inside the panel
  or on `document.body` (nothing else took it during the exit), as a menu or popover
  closing late should do too.

### ~~19. dialog: a plain dialog focuses a panel that cannot take focus~~

> **Fixed in 1.1.2** (1.1F-08). After `faqir upgrade`, drop what **Here** names; the un-patch checklist is in `docs/release-1.1.2.md`.

- **Seen:** D13b, session 43. The shortcuts' legend (a plain `dialog`, opened by `?`
  through `$ui('#shortcuts').open()`) opened with focus left on `<body>`: Escape did not
  close it, the focus trap held nothing, and single-key shortcuts typed "inside" it
  reached the page (`2` switched the tab under the dialog). The editor's save dialog never
  showed this because the page focuses its note field itself.
- **Where:** `recipes/dialog/dialog.js` `focusInitial()`: for a non-alert dialog it calls
  `panel.focus()`, but the recipe's markup (`dialog.html`) and manifest give the panel no
  `tabindex`, so the call does nothing. Escape is listened for on the root, so it is heard
  only while focus is inside.
- **Here:** `index.html` gives the legend's panel `tabindex="-1"`; the audit accepts it.
- **Suggested fix:** have the controller set `tabindex="-1"` on the panel when it has
  none (or focus the first focusable element, then the panel), and put the attribute in
  the example markup.

### ~~20. table: a navigable grid loses its Tab stop when the focused row is removed~~

> **Fixed in 1.1.2** (1.1F-09). After `faqir upgrade`, drop what **Here** names; the un-patch checklist is in `docs/release-1.1.2.md`.

- **Seen:** D13c, session 44, first by reading the controller while making every table
  `data-navigable`, then in Chrome: on Requests, focus on a `/hello` row's cell, then
  *Errors only* ticked, which removes that row (`l-for`); no cell of the table had
  `tabindex="0"` any more, Tab from the last filter went past the cells to the first
  row's link, and ArrowDown there did nothing. Any reload, filter or poll that drops the
  row holding the roving stop does the same.
- **Where:** `recipes/table/table.js` (and its inlined copies in `core/faqir-core.js` and
  `faqir-core.dev.js`), `setupNavigability()`: `activeCell` is kept once set, and the
  loop gives `tabindex="0"` only to `activeCell || first`, `first` being chosen only while
  `activeCell` is null. When `activeCell`'s row has left the document, every cell still in
  the table gets `-1`, so Tab no longer enters the grid, and `moveFocus()` returns early
  (`rows.indexOf(row) < 0`), so the arrow keys do nothing either until a cell is clicked.
- **Here:** patched (developer, after the test gate): the fix below, with an `indirect:`
  comment, in `recipes/table/table.js` and its inlined copies in `core/faqir-core.js` and
  `core/faqir-core.dev.js`; `faqir diff table` shows it. Re-apply after `faqir upgrade`
  until faqir has it.
- **Suggested fix:** at the start of `setupNavigability()`, drop an `activeCell` that is
  no longer inside `root` (`if (activeCell && !root.contains(activeCell)) activeCell =
  null;`), so the first cell takes the Tab stop again; `refresh()` already runs after
  every row change through the MutationObserver.

### ~~21. table: links and buttons in a navigable grid keep their own Tab stops~~

> **Fixed in 1.1.2** (1.1F-14). **Behaviour change:** links and buttons in a navigable table's cells leave the Tab order (the ARIA grid pattern); Enter or F2 reaches them. After `faqir upgrade`, drop what **Here** names; the un-patch checklist is in `docs/release-1.1.2.md`.

- **Seen:** D13c, session 44, reading the controller. With `data-navigable` the grid has
  one roving Tab stop among its cells, but a link or button inside a cell stays in the
  Tab order, so Tab walks through every link of every row as it did before; the grid
  saves no keystrokes for keyboard users of tables whose cells hold links.
- **Where:** `recipes/table/table.js` `setupNavigability()` sets `tabindex` on cells only.
- **Here:** nothing; Enter on a focused cell opens the row's first link
  (`app/keys.mjs`), which is ours.
- **Suggested fix:** follow the ARIA grid pattern: give interactive descendants of
  navigable cells `tabindex="-1"`, move focus into a cell's single control on Enter (or
  F2 for several), and back to the cell on Escape.

### ~~23. command-palette: ⌘K / Ctrl+K does nothing with Caps Lock or Shift~~

> **Fixed in 1.1.2** (1.1F-10). After `faqir upgrade`, drop what **Here** names; the un-patch checklist is in `docs/release-1.1.2.md`.

- **Seen:** D13a, session 42, reading the controller while wiring the palette; written
  down in D13e, session 46. With Caps Lock on, or Shift held, ⌘K neither opens nor closes
  the palette: the key arrives as `"K"`.
- **Where:** `recipes/command-palette/command-palette.js` (and its inlined copies in
  `core/faqir-core.js` and `faqir-core.dev.js`), `onGlobalKeyDown()`: `e.key === "k"`
  compares the produced character, which is upper case under Caps Lock or Shift, and
  would differ again on a keyboard layout without a Latin `k`.
- **Here:** nothing; the header's Search button opens it. Our own shortcuts
  (`app/keys.mjs`) read letters in lower case for the same reason.
- **Suggested fix:** compare `e.key.toLowerCase() === "k"`, or `e.code === "KeyK"` to
  follow the key's place rather than its character, as editors do for ⌘ shortcuts.

### ~~24. button: a size undoes the link variant's padding and height~~

> **Fixed in 1.1.2** (1.1F-17). After `faqir upgrade`, drop what **Here** names; the un-patch checklist is in `docs/release-1.1.2.md`.

- **Seen:** D14a, session 50 (tested in Chrome). The editor's pointers are
  `data-variant="link" data-size="sm"` buttons; each stood 9 px right of the badge before
  it and was 28 px tall, while the same pointer as plain text beside them was not.
- **Where:** `primitives/button/button.css`: `[data-variant="link"]` sets `padding: 0`
  and `height: auto`, and `[data-size="sm"]` (and `lg`) set `padding-inline` and
  `height` with the same specificity, later in the file, so the size wins. The manifest
  offers both attributes together without saying they conflict.
- **Here:** the pointer buttons carry no `data-size` (`pages/editor.html`).
- **Suggested fix:** let the link variant keep its box under any size
  (`[data-variant="link"][data-size] { padding: 0; height: auto; }`) and have sizes set
  only the font size for it, or have the manifest and the audit refuse the pair.

### ~~25. stack: a `data-flex="1"` child cannot shrink below its content~~

> **Fixed in 1.1.2** (1.1F-16). After `faqir upgrade`, drop what **Here** names; the un-patch checklist is in `docs/release-1.1.2.md`.

- **Seen:** D14c, session 52 (measured in Chrome, a popup window at 390, 768 and 1280
  px). The shell is a horizontal stack of the sidebar and a `data-flex="1"` column holding
  the page; the page's widest content set the column's width, so the whole page scrolled
  sideways: the Overview 1498 px wide at 390, and at 1280 the Overview 1754, Tail 1824,
  Costs → Rows 1672, Requests 1515, Artifacts 1309. Tables that should scroll in their
  own box never got the chance.
- **Where:** `primitives/stack/stack.css`, `[data-ui="stack"] > [data-flex="1"] { flex: 1;
  }`: a flex item's `min-width` is `auto`, which is its content's minimum width, so
  `flex: 1` grows the child but never shrinks it below a wide table, `<pre>` or unbroken
  string.
- **Here:** patched (developer, option a at the spec gate): `min-width: 0` in that rule,
  with an `indirect:` comment, and the same lines in `faqir.bundle.css` by hand, the CLI
  not being run. Re-apply after `faqir upgrade` until faqir has it.
- **Suggested fix:** `min-width: 0` (or `min-inline-size: 0`) on `data-flex="1"` and
  `"auto"` children, which is what a child that is meant to take the remaining space
  needs; a vertical stack is unaffected.

### ~~26. grid: a `1fr` column grows past the grid for a wide child~~

> **Fixed in 1.1.2** (1.1F-16). After `faqir upgrade`, drop what **Here** names; the un-patch checklist is in `docs/release-1.1.2.md`.

- **Seen:** D14c, session 52, as entry 25. The four `data-cols="1" data-cols-lg="2"`
  grids (the Overview's spend tables, the editor, the trace page, a namespace and its
  entry) were wider than the page below `lg`: a namespace page 639 px at 390, its table
  354 px wide but laid out at 621.
- **Where:** `primitives/grid/grid.css`: every column count is `repeat(n, 1fr)`, and `1fr`
  is `minmax(auto, 1fr)`, so a track is never narrower than its widest item's minimum
  content; grid items also keep `min-width: auto`.
- **Here:** patched (developer, option a): `[data-ui="grid"] > * { min-width: 0; }` after
  the base rules, with an `indirect:` comment, and in `faqir.bundle.css` by hand.
  Re-apply after `faqir upgrade`.
- **Suggested fix:** `repeat(n, minmax(0, 1fr))` in every tier, or the item rule above;
  the intrinsic mode already uses `minmax(min(100%, …), 1fr)` for the same reason.
  `description-list`'s horizontal variant (`minmax(8rem, auto) 1fr`) has the same `1fr`.

### ~~27. text, heading, breadcrumb: a long token never breaks~~

> **Fixed in 1.1.2** (1.1F-16). After `faqir upgrade`, drop what **Here** names; the un-patch checklist is in `docs/release-1.1.2.md`.

- **Seen:** D14c, session 52, as entry 25. Once 25 and 26 were patched, what still
  widened pages at 390 and 768 px were unbroken strings: an artifact id in the page's
  `h1` and in the breadcrumb (`demo.customers.search_by_email_and_region`, 537 px), mono
  call lines (`POST /_admin/propose {…}`, 619 px), absolute paths in Kernel → Status (575
  px). Ids, refs, paths, hashes and URLs hold no spaces, so a line cannot wrap.
- **Where:** `primitives/text/text.css` (heading and the mono variant) and
  `primitives/breadcrumb/breadcrumb.css` set no `overflow-wrap`; the default `normal`
  breaks only at spaces, and a flex item's minimum width is then its longest token.
- **Here:** patched (developer, option a): `overflow-wrap: anywhere` on `[data-ui="heading"]`,
  on the mono variant and on the breadcrumb root; `recipes/table/table.css` sets text in a
  `th` or `td` back to its cell's wrapping (`inherit`), since `anywhere` lowers the minimum
  width a table is laid out from and a wide table would break every id to fit instead of
  scrolling in its box. Each with an `indirect:` comment, and in `faqir.bundle.css` by
  hand. Our `form-block` sets the same on its root. Re-apply after `faqir upgrade`.
- **Suggested fix:** `overflow-wrap: anywhere` on the mono variant (code-like text is
  where unbroken tokens live) and `break-word` or `anywhere` on headings and the
  breadcrumb, with the table exception above; or a `data-break` prop on text.

### ~~28. text: an anchor carrying `data-ui="text"` looks like plain text~~

> **Fixed in 1.1.2** (1.1F-18). After `faqir upgrade`, drop what **Here** names; the un-patch checklist is in `docs/release-1.1.2.md`.

- **Seen:** D14e, session 54; open in `LOG-UI.md` since D2a (session 3). Most of the
  dashboard's links are `<a data-ui="text" data-variant="mono" data-size="sm">`: ids, refs,
  times, trace and run ids in tables, version links. `base/reset.css` sets every `a` to
  `color: inherit; text-decoration: inherit`, and `text.css` gives an anchor nothing back,
  so none of them could be told from the text beside them. faqir's answer is the `link`
  primitive, which has no mono or size variant (an id link would be an `<a data-ui="link">`
  wrapping a mono `text` span) and is primary-coloured by default, which a table of ids
  turns blue throughout.
- **Where:** `primitives/text/text.css` has no rule for an anchor; `primitives/link/` has
  `default`, `external` and `muted` variants only.
- **Here:** patched: `a[data-ui="text"][href]`, and a `text` child of an `a[data-ui="cluster"]
  [href]` (a ref beside its kind badge), get an underline in `--color-border-strong`
  (`--link-thickness`, `--link-underline-offset`) that turns `currentColor` on hover, the
  text keeping its colour and variant; the three tokens declared in the CSS header and the
  manifest. With an `indirect:` comment, and in `faqir.bundle.css` by hand. Our
  `diff-view`'s `render` link and `form-block`'s refs draw the same. Re-apply after `faqir
  upgrade`.
- **Suggested fix:** either `text.css` styles `a[data-ui="text"][href]` with the `link-*`
  tokens (an anchor is a fair tag for text), or `link` gains a `quiet` variant (inherited
  colour, faint underline) and composes with `text`'s mono and size, so a code-like link
  is one element.
- **D15a, session 57:** the underline moved from `--color-border-strong` to
  `--color-fg-subtle` in `text.css`, `diff-view.css` and `form-block.css`: in the dark
  theme the first was too faint to read as a link.

### ~~30. description-list: `data-size="sm"` sets text a step below `text`'s `sm`~~

> **Closed in 1.1.2** (1.1F-15, 1.1F-20). Won't fix in CSS (by design, plan decision D6): every component whose `md` is `--text-sm` maps `sm` to `--text-xs`; the details slot now says so. The stale `@ui:tokens` header is fixed (generated from the CSS since 1.1F-15). The local `sm` → `--text-sm` patch is a project choice: keep it or drop it.

- **Seen:** D15e, session 57. On the Kernel page's Status tab the terms of a
  `data-size="sm"` description list were smaller than the `data-ui="text"
  data-size="sm"` values beside them, and a plain-text `<dd>` smaller than a `<dd>`
  holding a text span.
- **Where:** `primitives/description-list/description-list.css`, the *Size: Small*
  rules, map term and details to `--text-xs`; `text`'s `sm` is `--text-sm`.
- **Here:** patched: `sm` reads `--text-sm`, with an `indirect:` comment, and in
  `faqir.bundle.css` by hand. The palette's key legend (`index.html`), also `sm`, grew
  with it. The `@ui:tokens` header still lists `text-xs`, now unused. Re-apply after
  `faqir upgrade`.
- **Suggested fix:** map every size to the same step `text` uses for it, and generate
  the header from the CSS (entry 17).

### ~~32. command-palette: every instance takes ⌘K, and its search keeps the page's undo~~

> **Fixed in 1.1.2** (1.1F-10). The ⌘K half is fixed (`data-no-shortcut`, one owner per press); the undo half is a docs note on the manifest, since browsers keep one undo history per page. After `faqir upgrade`, drop what **Here** names; the un-patch checklist is in `docs/release-1.1.2.md`.

- **Seen:** D15d, session 57, building the block editor's op picker. A second
  `command-palette` on the page would open and close with the shell's on ⌘K / Ctrl+K.
  And, tested in Chrome: typing in a filter field that stays in the page while hidden
  (the picker's, first built inside a closed dialog) cut the source editor's ⌘Z off at
  that typing, since Chrome keeps one undo history per page. The shell's palette search
  (`index.html`) stays in the page for good, so typing in ⌘K probably does the same to
  the editor.
- **Where:** the command-palette controller binds `keydown` on `document`
  (`onGlobalKeyDown`) for each instance; its markup is meant to stay in the page.
- **Here:** the op picker is a `dialog` with its own filter and listbox, the filter
  inside an `l-if` so it exists only while the picker is open; the save dialog's note
  field the same. The shell's palette is unchanged.
- **Suggested fix:** an attribute to opt an instance out of the global shortcut (or bind
  it only for one marked global), and render the search only while the palette is open,
  or say in the docs that a kept field joins the page's undo history.

---

## CLI (`faqir-ui-cli`)

### ~~8. `faqir create` writes a stray `manifest.schema.json` and a wrong `$schema` path~~

> **Fixed in 1.1.2** (1.1F-26). After `faqir upgrade`, drop what **Here** names; the un-patch checklist is in `docs/release-1.1.2.md`.

- **Seen:** every `create` (source-view, json-view, form-block). It writes
  `manifest.schema.json` into the working directory (the repository root here), and the
  new manifest's `$schema` is `../../../../manifest.schema.json`, one level too many for
  `ui/primitives/<name>/` (installed manifests use `../../../manifest.schema.json`).
  D6b, session 20: the same with `faqir create waterfall --kind primitive`.
  D9a, session 33: the same with `faqir create chart --kind primitive`.
- **Here:** the stray file is deleted and `$schema` corrected by hand after each create.
- **Suggested fix:** resolve both from `faqir.config.json`'s `output_dir`.

### ~~9. `faqir audit` only recognises the classic engine tag~~

> **Fixed in 1.1.2** (1.1F-24). After `faqir upgrade`, drop what **Here** names; the un-patch checklist is in `docs/release-1.1.2.md`.

- **Seen:** D1. The dashboard loads the engine as an ES module
  (`import Faqir from '../ui/core/faqir-core.mjs'` in `app/main.mjs`, which is the safe
  way to register stores and `l-data` factories before the engine binds). The audit does
  not see that the controllers are loaded and reports `focus-trap` and
  `controller-loaded` on `index.html`.
- **Here:** `index.html` is audited with `--skip-rules focus-trap,controller-loaded`.
- **Suggested fix:** recognise a module script that imports `faqir-core.mjs` (directly,
  or let the config declare the entry module).

### ~~10. `faqir repair` would add controller scripts the bundle already contains~~

> **Fixed in 1.1.2** (1.1F-25). After `faqir upgrade`, drop what **Here** names; the un-patch checklist is in `docs/release-1.1.2.md`.

- **Seen:** D1. Because of entry 9, `faqir repair` on `index.html` adds the recipes' own
  controller `<script>` tags next to the bundled engine, loading every controller twice.
- **Here:** `faqir repair` is never run on `index.html` (recorded in `LOG-UI.md`).
- **Suggested fix:** fixed with entry 9; repair should also check whether the engine
  bundle already provides a controller.

### ~~11. `faqir audit` does not know `l-html` is forbidden here~~

> **Fixed in 1.1.2** (1.1F-27). After `faqir upgrade`, drop what **Here** names; the un-patch checklist is in `docs/release-1.1.2.md`.

- **Seen:** D1. Not a faqir bug: `l-html` is a valid directive, and the audit's
  `directive-name` rule accepts it. The dashboard forbids it (VISION-UI §10) and checks
  by grep at every code gate.
- **Suggested feature:** a project-level rule list in `faqir.config.json`
  (`"forbid_directives": ["l-html"]`).

### ~~22. `@faqir-ui/mcp`'s `faqir_audit_html` passes names and attributes it does not know~~

> **Fixed in 1.1.2** (1.1F-28). After `faqir upgrade`, drop what **Here** names; the un-patch checklist is in `docs/release-1.1.2.md`.

- **Seen:** D13c, session 44. The CLI was not to be run, so the MCP server's
  `faqir_audit_html` was tried as the audit. On a table missing `thead` and with
  `data-size="huge"` it reported the missing slots and the size, so it reads the
  shipped manifests. The same markup also held an undeclared `data-bogus` on the table,
  a `data-ui="nonsense-thing"` and this project's `form-block` with `data-variant="zzz"`,
  and none of the three was reported. It takes a string, not a path, so it cannot know
  the project's own components under `ui/primitives/`.
- **Where:** the MCP server's audit tool; whether it runs the CLI's `--strict` rules is not
  stated in its description.
- **Here:** not used as the code gate's audit; D13c's markup change (`data-navigable`, a
  declared boolean prop of `table`) was checked against the manifest by reading it.
- **Suggested fix:** take an optional project root (or read `faqir.config.json` from the
  server's working directory) so project components are known; report an unknown
  `data-ui` name and an attribute no manifest declares, at least under a `strict` flag.

### ~~33. The audit gives a part to its nearest component, not to the one that declares it~~

> **Fixed in 1.1.2** (1.1F-28). After `faqir upgrade`, drop what **Here** names; the un-patch checklist is in `docs/release-1.1.2.md`.

- **Seen:** D15d, session 57: `faqir_audit_html` (MCP) on the block editor's markup warned
  `orphan-part` for `[data-part="patches"]`, a part of `block-edit` placed inside a
  `collapsible`'s content: the audit attributes a part to its nearest `data-ui` ancestor.
- **Where:** the audit's part resolution; the audit-side twin of entry 5.
- **Here:** the warning is accepted; the markup is as the manifest says.
- **Suggested fix:** resolve a part against the nearest ancestor whose manifest declares
  that slot.

---

## Themes and fonts

### ~~12. The mono font draws ligatures by default~~

> **Fixed in 1.1.2** (1.1F-19). After `faqir upgrade`, drop what **Here** names; the un-patch checklist is in `docs/release-1.1.2.md`.

- **Seen:** D3a, session 6. JetBrains Mono (installed with `faqir fonts add
  jetbrains-mono --role mono`) joins `>=`, `!=`, `=>` into single glyphs. In a code or
  data view that misstates the text: the op `>=` was drawn as `≥`.
- **Seen:** D11b, session 39: the Kernel page's op reference, in `text` spans with
  `data-variant="mono"`, drew `!=`, `<=`, `>=` as `≠`, `≤`, `≥`.
- **Here:** `form-block.css` sets `font-variant-ligatures: none`. `source-view` and
  `json-view` still show ligatures (open in `LOG-UI.md`). The op reference binds
  `:style="'font-variant-ligatures: none'"` on its container (`pages/kernel.html`).
- **Suggested fix:** the mono role's `@font-face`/token setup, or the `text` primitive's
  `mono` variant, sets `font-variant-ligatures: none` (or exposes a
  `--font-mono-ligatures` token defaulting to none).

### ~~13. The CSP hash of the injected `l-cloak` style is tied to its exact text~~

> **Fixed in 1.1.2** (1.1F-07). The engine no longer injects the style, so `style-src 'self'` needs no hash. After `faqir upgrade`, drop what **Here** names; the un-patch checklist is in `docs/release-1.1.2.md`.

- **Seen:** K1. The engine injects `<style>[l-cloak] { display: none !important; }</style>`;
  a strict CSP must allow it by its sha256 hash (VISION-UI §10). Any change to that text
  in an upgrade shows up only as a CSP violation in the console.
- **Here:** the hash is in `kernel/static.mjs`'s CSP header.
- **Suggested fix:** document the hash in faqir's README with each release, or let the
  engine skip the injection when the page's stylesheet already has the rule (the bundle
  could ship it), so no inline style is needed at all.

## Forms (`@faqir-ui/forms` 1.1.0)

### ~~15. `renderForm` cannot take an untrusted schema, and refuses `additionalProperties`~~

> **Fixed in 1.1.2** (1.1F-29, 1.1F-30). After `faqir upgrade`, drop what **Here** names; the un-patch checklist is in `docs/release-1.1.2.md`.

- **Seen:** D7a spec, session 25, reading `packages/forms/src/index.js` to plan the Try it
  form (VISION-UI §5.5). Two things stop it from drawing a flow's `input` schema:
  1. It returns HTML as a string, to be inserted as markup, carrying `l-data`,
     `l-validate` and `l-for` expressions built in part from the schema (property names of
     repeatable groups, which it checks against `[A-Za-z_][A-Za-z0-9_-]*`, and the step
     and row state). Text is escaped, but a page that draws a schema it did not write
     still puts data into markup and into attributes the engine compiles with
     `new Function`, which VISION-UI §6.5 and §10 forbid.
  2. Its strict key check throws on any root key outside `ROOT_KEYS`, which has no
     `additionalProperties`; `indirect` recommends `additionalProperties: false` on every
     routed flow's input (VISION §4.3), so nearly every flow would fall back to a JSON
     field. `type: ["string", "null"]` throws too.
- **Where:** `packages/forms/src/index.js`: `ROOT_KEYS` and `FIELD_KEYS` (lines 19–29),
  the string output of `renderForm`, the generated `l-data`/`l-validate` attributes
  (around line 1896).
- **Here:** nothing; `@faqir-ui/forms` is not used. D7b builds the Try it form with a DOM
  builder of ours (VISION-UI §3.1, §14).
- **Suggested fix:** accept `additionalProperties` (it has no widget; `false` could become
  a validation note, anything else be ignored with a warning), and offer a DOM-building
  entry point (`buildForm(schema) → Element`, text through `textContent`, no expression
  derived from the schema) for schemas that come from data rather than from the page's
  author.
