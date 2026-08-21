# Security posture

*Task 1.0-02 · FAQIR-NEXT §A6. The declarations this document is the prose half
of live in [`packages/core/faqir-core.d.ts`](../packages/core/faqir-core.d.ts).*

Faqir's engine makes two deliberate choices that a security review will find
immediately. Both are stated here rather than discovered: `l-*` expressions are
compiled with `new Function`, and `l-html` writes markup without sanitizing it.
Neither is an oversight, and neither is going to change in 1.0.

The short version:

| | Requirement |
|---|---|
| Content-Security-Policy | `script-src` must include **`'unsafe-eval'`**; `style-src` must include **`'unsafe-inline'`** (or you lose `l-cloak` only) |
| Untrusted markup | Never let it reach the page Faqir initializes — `l-*` attribute values are code |
| Untrusted **data** | Safe in `l-text`, `l-model`, `data-prop-*` and `l-source` responses; **never** in `l-html` |
| CSP-restricted environments | Load Faqir's CSS and components, skip the engine — see [Running without the engine](#running-without-the-engine) |

---

## 1. The evaluator needs `'unsafe-eval'`

Every `l-*` expression is compiled once and cached:

```js
new Function('$scope', '$el', 'with($scope) { return (' + expr + ') }')
```

That is a string compiled to a function, which is exactly what CSP's
`'unsafe-eval'` governs. A page served with `script-src 'self'` and no
`'unsafe-eval'` loads the engine, bootstraps it, mounts every recipe controller
— and then fails at the first expression, throwing

```
EvalError: Evaluating a string as JavaScript violates the following Content Security Policy directive…
```

**The failure is quiet.** `evaluate()` catches, warns to the console and returns
`undefined`, so the visible result is not an exception — it is a page where
`l-text` writes empty strings, `:disabled` never binds, `@click` does nothing
and `l-for` renders no rows. Measured on a real page under
`script-src 'self'` (Chrome): the engine loaded, `l-cloak` was stripped,
controllers mounted, and `<span l-text="count">` rendered `""` instead of `1`.
Nothing on the page said why.

So the requirement is not "add `'unsafe-eval'` or see errors". It is: **without
`'unsafe-eval'` the reactive layer is silently absent.**

A working policy for a page that uses the engine:

```
Content-Security-Policy:
  default-src 'self';
  script-src 'self' 'unsafe-eval';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data:;
  object-src 'none';
  base-uri 'self';
  frame-ancestors 'self'
```

`'unsafe-eval'` is not a nonce or a hash — there is no per-expression opt-in.
Granting it re-enables `eval()` and `new Function` for **every** script on the
origin, not just Faqir's. That is the price, and §5 is about deciding whether to
pay it.

### Why not a CSP-safe evaluator

Alpine, Vue's runtime compiler and Faqir all make the same trade. Avoiding
`new Function` means shipping an expression parser and interpreter — a
tokenizer, a Pratt parser, member/call/index/assignment evaluation, and the
whole of JavaScript's operator surface, in a runtime held to a 14 KB gzip
budget. It also changes the language: an interpreter that supports "some
JavaScript" makes every gap a bug report.

Faqir's target is generated, trusted markup (§5), where `'unsafe-eval'` costs
little. **A CSP-safe evaluator is deliberately out of scope for 1.0.** If the
constraint is hard, the engine is the optional part — see §6.

## 2. `style-src` and `l-cloak`

The engine injects one stylesheet at bootstrap:

```js
var style = document.createElement('style');
style.textContent = '[l-cloak] { display: none !important; }';
document.head.appendChild(style);
```

A `<style>` element is an *inline* style to CSP no matter who created it, so
under `style-src 'self'` the element lands in the DOM and its rules are never
parsed. Verified in Chrome: the element is present, `style.sheet.cssRules` is
empty, `l-cloak` hides nothing, and un-bound markup flashes before the engine
runs.

That is the whole cost. Everything else the engine writes goes through the
CSSOM — `l-show` setting `el.style.display`, `l-bind:style` assigning
properties, `data-motion` transitions — and **CSSOM writes are not subject to
CSP**. Confirmed on the same page: with `style-src 'self'`, `l-show` and
`:style` both applied normally while only the cloak rule was dropped.

So: add `'unsafe-inline'` to `style-src` if you want `l-cloak`; leave it off and
accept a flash of unbound content. Faqir supports no CSP nonce for this element.

## 3. `l-html` is unsanitized, by design

```html
<div l-html="post.body"></div>   <!-- innerHTML, verbatim -->
```

`l-html` assigns to `innerHTML` and does nothing else. `<script>` tags inserted
this way do not execute, but that is a property of `innerHTML`, not a defence —
`<img src=x onerror=…>`, `<svg onload=…>`, `<iframe src=javascript:…>` and
event-handler attributes all run. **Any value reaching `l-html` is executable.**

This mirrors Alpine's `x-html` and Vue's `v-html` and is not going to change:
sanitizing would mean vendoring a sanitizer into a zero-dependency runtime and
picking an allow-list on every user's behalf, and a sanitizer that is wrong is
worse than one that is absent.

- Use `l-text` for anything you did not author. It sets `textContent`; markup in
  the value is inert.
- Sanitize before the value reaches the scope, not after — on the server, or
  with an explicit sanitizer in your own code.
- The development engine (`core/faqir-core.dev.js`) reports every `l-html` use
  once per element; the report is visible in the `faqir dev` overlay and in
  `window.__FAQIR_DEVTOOLS__.warnings()`.

## 4. What the rest of the surface does with untrusted values

Not everything is `l-html`. These carry **data**, and data is safe:

| Surface | Handling | Safe for untrusted values |
|---|---|---|
| `l-text` | `textContent` | Yes |
| `l-model` | reads/writes `.value`, `.checked` | Yes |
| `l-bind:<attr>` | `setAttribute` / property write | Yes for content attributes; **no** for `href`/`src` (a `javascript:` URL runs) and **no** for `on*` |
| `data-prop-*` | `JSON.parse`, falling back to the raw string | Yes — parsed as data, never evaluated |
| `l-source:<name>` | `fetch` + `res.json()` | Yes — the response is parsed as JSON and never evaluated |
| `l-teleport` | value is a **CSS selector**, not an expression | Moves an element; crosses no security boundary |
| `l-html` | `innerHTML` | **No** |

Two attribute cases deserve the underline: `:href="url"` and `:src="url"` with
an attacker-supplied `url` are `javascript:`-URL injection, and `l-bind` will
not stop you — check the scheme yourself. Binding an `on*` attribute is
equivalent to writing the handler inline.

`l-source` sends whatever the browser's default `fetch` credentials mode sends
(`same-origin`), so a same-origin endpoint receives the user's cookies. The URL
comes from the attribute in your own markup, not from the scope.

## 5. Threat model: generated-trusted vs user-supplied markup

Faqir's assumption, stated plainly: **the markup is yours.** It is written by
you, by your generator, or by an agent working inside your repository, and it is
reviewed and committed the way source is. Under that assumption `'unsafe-eval'`
grants an attacker nothing they did not already have — anyone who can add an
`l-on:click` attribute to your committed HTML can equally add a `<script>` tag.

The assumption breaks the moment markup is **assembled at runtime from input you
did not author**. Then this is true and it is the whole risk:

> A `l-*` attribute value is JavaScript. An attacker who can influence *any*
> attribute on an element Faqir initializes has arbitrary code execution in your
> origin — no `l-html` required, and `'unsafe-eval'` is what makes it work.

Concretely, all three of these are remote code execution if `comment` is
user-supplied:

```html
<div l-data="{ note: '{{ comment }}' }">          <!-- breaks out of the literal -->
<div l-text="'{{ comment }}'">                    <!-- l-text's VALUE is code -->
<div {{ commentAttributes }}>                     <!-- injects a whole l-on: -->
```

Escaping for HTML is not enough: `&#39;` is decoded back to `'` before the
attribute value ever reaches the evaluator.

**The rules that follow from that:**

1. Interpolate untrusted values into **text and data**, never into markup that
   Faqir will initialize. Put them in the scope (`Faqir.data()`, `l-source`,
   `data-prop-*` as JSON) and read them with `l-text` / `l-model`.
2. Never build an `l-*` attribute value by string concatenation with input.
3. If you must render user-authored HTML, render it **outside** any Faqir scope
   and outside `l-html`, or sanitize it server-side first.
4. Multi-tenant pages where one tenant's content becomes another's markup are
   the case where `'unsafe-eval'` genuinely raises the stakes. See §6.

## 6. Running without the engine

The engine is optional. Faqir is a CSS + attribute-protocol framework first: no
primitive and no pattern ships a single `.js` file, and a page that loads only
`faqir.<theme>.css` needs neither `'unsafe-eval'` nor `'unsafe-inline'`.

That is the answer for a CSP-restricted environment:

- **Primitives** — pure markup and CSS. They work as-is under a strict policy.
- **Patterns** — likewise, with two exceptions that are markup-level reactive
  demos rather than styling: `inbox` and `wizard` carry `l-*` attributes with
  expressions in them and need the evaluator. Every other pattern does not —
  including `form-page`, whose `<form l-data l-validate>` is value-less: a bare
  `l-data` initializes an empty scope and compiles nothing.
- **Recipes** — behaviour comes from an ordinary function in an external file
  (`registry/recipes/<name>/<name>.js`). Those files compile no strings, so
  `script-src 'self'` is enough for them: `Faqir.controller()` registration and
  the MutationObserver that mounts them never reach the evaluator. Loading the
  assembled engine works too — it *contains* `new Function`, but nothing calls
  it until an `l-*` attribute exists on the page. (`faqir bundle --js` bundles
  the whole engine plus the official plugins, so reach for the per-recipe files
  when you want the smaller surface.)
- **Reactivity** (`l-data`, `l-text`, `l-for`, `l-model`, …) — this is the part
  that needs `'unsafe-eval'`. There is no subset of it that does not.

If the policy is fixed and the page needs reactivity, the honest answer is that
Faqir's engine is not the right runtime for that page. Nothing else in the
framework is affected by the decision.

## 7. Supply chain

- **Subresource integrity.** `packages/core/cdn.json` carries the SHA-384 of
  every published file next to the version they belong to, and the docs site
  emits `integrity="…"` on every generated CDN snippet. Pin both, always — a
  version without its hash is an unpinned dependency.
- **`faqir add --registry`.** Remote registry downloads are verified against the
  per-file SHA-256 in the registry index and buffered entirely before anything
  touches disk, so an integrity failure leaves no partial write.
- **Zero runtime dependencies.** The engine, the controllers and the plugins
  have no npm dependencies at all — there is no transitive tree to audit.
- **No build step in your project.** What ships is what you read.

## 8. Reporting a vulnerability

Open a security advisory on the repository rather than a public issue:
<https://github.com/Narcis13/faqir-ui/security/advisories>.

The two behaviours documented above — `new Function` requiring `'unsafe-eval'`,
and `l-html` writing unsanitized markup — are known and intentional, and reports
of them will be closed with a pointer here.

---

**See also:** [`docs/devtools.md`](devtools.md) for the development engine's
`l-html` notices · [`packages/core/faqir-core.d.ts`](../packages/core/faqir-core.d.ts)
for the typed surface · `SPEC-1.0.md` for the frozen attribute protocol.
