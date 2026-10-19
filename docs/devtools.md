# Devtools — `Faqir.inspect`, `window.__FAQIR_DEVTOOLS__`, and the dev build

Faqir ships two engine builds and one inspector. This page is the stable
reference for all three.

| Artifact | What it is | Ships to users |
|---|---|---|
| `core/faqir-core.js` | Production engine. Terse warnings only. | yes |
| `core/faqir-core.dev.js` | Development engine. Same behaviour + four diagnostic classes. | yes, but never referenced by default |
| `core/faqir-core.csp.js` · `core/faqir-core.csp.dev.js` | The same two builds for a page without `'unsafe-eval'`: expressions interpreted instead of compiled ([below](#the-strict-csp-builds)). | yes, but never referenced by default |
| the inspector overlay | A panel injected by `faqir dev`. | **no** — it lives in the CLI |

Every engine build installs `window.__FAQIR_DEVTOOLS__`, so anything below works
on a page regardless of which one it loaded.

---

## `Faqir.inspect(elementOrSelector)`

One plain object answering "what is Faqir doing to this element?". Returns
`null` for a selector that matches nothing, for `null`, and for a non-element
node.

```js
Faqir.inspect('#checkout-total')
```

| Key | Value |
|---|---|
| `el` | the element inspected |
| `scopeRoot` | `Element \| null` — nearest ancestor-or-self owning a scope |
| `scopeId` | `number \| null` — that scope's id (the number `$id()` uses) |
| `scope` | `object \| null` — plain deep copy of the scope's data |
| `directives` | `{ type, arg, expression, modifiers[], raw }[]` for every `l-*` / `:x` / `@x` attribute |
| `controller` | `{ ui, el, api, methods[] } \| null` for the owning `[data-ui]` |
| `state` | `{ ui, part, variant, size, state }` — the five protocol attributes |

Notes that matter in practice:

- **`scope` is a copy.** Mutating it does not touch the page. Functions become
  `"[Function name]"`, elements `"[Element <tag>]"`, cycles `"[Circular]"`, and
  the walk stops at four levels deep with `"[Depth]"`.
- **Magics are excluded.** `$el`, `$refs`, `$store`, `$state`, `$variant`, `$ui`,
  `$dispatch`, `$watch`, `$id` are non-enumerable and never appear — a snapshot
  is the author's data, nothing else. `$this` is not on the scope at all: it is
  a parameter of each compiled expression.
- **Inspecting registers no reactive dependency.** Calling it inside or outside
  an effect never causes a re-run.
- `controller.api` is the *same object* the component's controller returned, so
  `Faqir.inspect(el).controller.api.open()` drives the real component. To
  reach a controller without the rest of the snapshot, `Faqir.ui(el)` returns
  that same object (or `null`).
- `variant` / `size` / `state` are read from the owning `[data-ui]` (the same
  rule the `$state` and `$variant` magics follow); `part` is read from the
  element itself.

## `window.__FAQIR_DEVTOOLS__`

The handle agents and tooling read. `version` is bumped only on a breaking shape
change; the keys below are stable within a version.

```js
const tools = window.__FAQIR_DEVTOOLS__;
```

| Key | Returns |
|---|---|
| `version` | `1` — handle schema version |
| `dev` | `boolean` — `true` when the page loaded `faqir-core.dev.js` |
| `faqir` | the `Faqir` global itself |
| `inspect(el\|selector)` | the snapshot above |
| `scopes(within?)` | `{ el, id, label, scope }[]` — declared scope roots in document order |
| `components(within?)` | `{ el, label, ui, variant, size, state, parts[], controller }[]` |
| `stores()` | snapshot of every `Faqir.store()` on the page |
| `warnings()` | recorded diagnostics, oldest first — **always `[]` in production** |

`scopes()` lists *declared* roots: elements carrying `l-data`, plus standalone
`[data-ui]` components. Per-item scopes created by `l-for` and `l-if` are not
listed individually — reach them with `inspect()` on any node inside a row.

`components().parts` lists only the parts belonging to that component: a
`[data-part]` belongs to its nearest `[data-ui]` ancestor.

## The development build

`core/faqir-core.dev.js` is assembled from the same engine source as
`core/faqir-core.js` (`scripts/build-core.mjs`), with dev-marked lines kept and
`src/core-src/dev-diagnostics.js` injected. Point your script tag at it while
developing:

```html
<script src="ui/core/faqir-core.dev.js"></script>
```

It adds these diagnostic classes. Each is printed once (`[Faqir dev] …`, with the
offending element's `outerHTML`) and retained for `warnings()`:

| `kind` | Fires when |
|---|---|
| `expression` | an `l-*` expression or statement threw |
| `directive` | an `l-…` attribute matched no built-in and no registered plugin directive |
| `reorder` | an unkeyed `l-for` list was reordered — DOM state is bound to position, not identity |
| `key` | a keyed `l-for` produced the same `l-key` twice (once per list) |
| `html` | `l-html` wrote unsanitized markup (once per element) |
| `style` | a `:style` declares `display` on an element that also has `l-show` — both write `display` (once per element) |
| `shadow` | an `l-for` loop variable or index the author named shadows a name its scope already has (once per list and name) |

Every entry carries `{ kind, message, element, html }` plus class-specific extras
(`expression`, `directive`, `error`, `key`, `name`).

The production engine is byte-free of all of this: the messages exist only in
`dev-diagnostics.js`, which is never injected into `faqir-core.js`. Production
still warns tersely on a failed expression (a real runtime fault), but records
nothing and emits no advisories. The dev build has no size budget; `bun run
size` reports its gzip number without enforcing one.

## The strict-CSP builds

`core/faqir-core.csp.js` and `core/faqir-core.csp.dev.js` are the same pair
assembled once more by `bun run build:core`, with the engine's expression
compilers (the region between `// @faqir:evaluator-start` and
`// @faqir:evaluator-end` in `src/core-src/engine.js`) replaced by the
interpreter in `src/core-src/csp-evaluator.js`. They are for pages served
without `'unsafe-eval'`; [docs/security.md §1](security.md#the-strict-csp-build)
has the policy and the language the interpreter accepts. Develop against the
dev twin exactly as above:

```html
<script src="ui/core/faqir-core.csp.dev.js"></script>
```

Everything on this page holds for both, with one addition to the `expression`
class. An expression outside the interpreter's subset — `async`, `class`,
destructuring, `switch` — is a `SyntaxError` raised when the expression is
first evaluated, and a `constructor` / `__proto__` / `prototype` member is
refused. Both are recorded as `expression` entries whose `message` names the
expression and the construct and, in the dev build only, adds that the
strict-CSP build interprets a subset of JavaScript:

```
[Faqir dev] Expression error in "async () => n": Unexpected "=>" at 9 (the strict-CSP build interprets a subset of JavaScript; see docs/security.md)
```

The production CSP build warns tersely, as the production engine does, still
naming the expression. `bun run size` enforces the CSP build's own budget and
reports its dev twin without one.

## The `faqir dev` overlay

`faqir dev` rewrites every HTML response on the way out to include
`<script src="/__faqir/devtools.js" data-faqir-dev-overlay defer>`, and serves
that route itself. Files on disk are never modified, and the overlay is not a
registry file — `faqir init` cannot copy it into a project and `faqir bundle
--js` cannot bundle it.

- **Toggle:** `Ctrl/Cmd + Shift + F`. `Escape` closes it.
- **Shows:** scopes with their live data, components with their protocol
  attributes and parts, and recorded diagnostics.
- **Isolated:** rendered in a shadow root, so the host page's CSS and the
  overlay's cannot reach each other.
- **Opt out:** `faqir dev --no-overlay`.

Its API is on `window.__FAQIR_OVERLAY__` (`toggle`, `show`, `hide`, `render`,
`isOpen`, `host`) for scripted use.

## Security note

`l-html` is unsanitized by design — the dev build says so once per element.
Bind only markup you generated; use `l-text` for anything that came from a user
or an API.
