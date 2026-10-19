# @faqir-ui/core

The Faqir UI **runtime** — a zero-dependency, Alpine-style reactive engine plus
prebuilt, per-theme CSS bundles. This is the *trial & embed* path: drop two tags into
any HTML file and you have a styled, interactive Faqir page. No build step, no install.

> The CLI (`faqir-ui-cli`) remains the *ownership* path — it copies component files into
> your project so you can audit, theme, and upgrade them. The CDN is for scratch pages,
> CodePen, Claude artifacts, and agents without a shell.

## The two-tag CDN story

```html
<!-- 1. A theme's full CSS bundle (tokens + theme + base + every component) -->
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@faqir-ui/core@1.2/dist/faqir.default.css">

<!-- 2. The reactive engine — sets window.Faqir and auto-boots on DOMContentLoaded -->
<script src="https://cdn.jsdelivr.net/npm/@faqir-ui/core@1.2/dist/faqir-core.min.js" defer></script>
```

That's it. Now write Faqir markup:

```html
<div l-data="{ count: 0 }" data-ui="surface">
  <button data-ui="button" data-variant="primary" l-on:click="count++">
    Clicked <span l-text="count">0</span> times
  </button>
</div>
```

Swap the stylesheet to change theme: `faqir.default.css`, `faqir.midnight.css`,
`faqir.paper.css`, `faqir.document.css`, `faqir.brutalist.css`.

## Subresource Integrity (SRI)

Every file in `dist/` has a SHA-384 hash in [`dist/sri.json`](./dist/sri.json). Pin them
for tamper-proof loads:

```html
<link rel="stylesheet"
      href="https://cdn.jsdelivr.net/npm/@faqir-ui/core@1.2/dist/faqir.default.css"
      integrity="sha384-…paste from sri.json…"
      crossorigin="anonymous">
<script src="https://cdn.jsdelivr.net/npm/@faqir-ui/core@1.2/dist/faqir-core.min.js"
        integrity="sha384-…paste from sri.json…"
        crossorigin="anonymous" defer></script>
```

## Artifacts (in `dist/`)

| File | What it is |
|------|------------|
| `faqir-core.mjs` | Real ESM — what `import "@faqir-ui/core"` resolves to. `export default` plus one named export per engine member. |
| `faqir-core.js` | Canonical UMD engine — what `<script src>` and the CDN load. Reachable explicitly at `@faqir-ui/core/faqir-core.js`. |
| `faqir-core.min.js` (+ `.map`) | Minified classic-script build; a plain `<script src>` sets `window.Faqir`. |
| `faqir-core.csp.mjs` · `faqir-core.csp.js` · `faqir-core.csp.min.js` (+ `.map`) | The same three shapes of the strict-CSP engine, for a page served without `'unsafe-eval'`: `l-*` expressions are interpreted, never compiled. `import "@faqir-ui/core/csp"` resolves to the ESM one. Its JavaScript subset and policy: [docs/security.md](https://github.com/Narcis13/faqir-ui/blob/main/docs/security.md#the-strict-csp-build). |
| `faqir.{theme}.css` | Full CSS bundle per theme: all tokens + theme + base + every component. Self-contained (no `@import`). |
| `themes.json` | Each theme's bundle file and the density it was designed at — see [Themes and density](#themes-and-density). |
| `plugins/` | Official self-registering drops — see [Plugins](#plugins) below. |
| `sri.json` | SHA-384 integrity hashes for every file above. |

## Themes and density

Density is the one theme axis a bundle cannot carry: each ramp is scoped to a
`[data-density]` subtree, so the page opts in on its root. Most themes are
drawn at the default, `comfortable`; the rest say so in their bundle's header
and in `dist/themes.json` (`@faqir-ui/core/themes.json`):

```json
{ "themes": { "slate": { "css": "faqir.slate.css", "density": "compact" }, … } }
```

```html
<html data-theme="light" data-density="compact">
  <link rel="stylesheet" href="…/dist/faqir.slate.css">
```

Without the attribute a compact or spacious theme still works, at the
comfortable ramp it was not designed for.

## A page's own CSS

Each `faqir.<theme>.css` holds every component. A page that draws a few of them
can ship only those: the bundle is a sequence of sections, each opened by a
marker on a line of its own, and the markers are a stable contract:

```css
/* === tokens/palette.css === */      /* tokens, in cascade order — always kept */
/* === themes/slate.css === */        /* the theme — always kept */
/* === base/prose.css === */          /* the base layer — always kept */
/* === primitives/button.css === */   /* one per component: primitives, */
/* === recipes/tabs.css === */        /* recipes and patterns, by name */
```

`@faqir-ui/core/subset` keeps the tokens, the theme, the base layer and the
components you name:

```js
import { readFileSync } from "node:fs";
import { subsetBundle } from "@faqir-ui/core/subset";

const bundle = readFileSync(new URL(import.meta.resolve("@faqir-ui/core/dist/faqir.slate.css")), "utf8");
const css = subsetBundle(bundle, ["card", "button", "tabs"]);
```

With [`@faqir-ui/template`](https://www.npmjs.com/package/@faqir-ui/template),
a compiled page lists the components it draws in `ast.uses`, so
`subsetBundle(bundle, ast.uses)` needs no render. Name every component the page
draws, nested ones included: a section is kept only when its own name is listed.

## Plugins

Each file in `dist/plugins/` is a self-registering classic script: load it
**after** the engine and it installs itself. Every one is dependency-free.

| Plugin | Provides | What it does |
|---|---|---|
| `faqir-collapse.js` | `l-collapse` | height auto-animation for a boolean expression |
| `faqir-intersect.js` | `l-intersect` | declarative IntersectionObserver hooks |
| `faqir-mask.js` | `l-mask` | caret-safe input masking |
| `faqir-persist.js` | `l-persist`, `$persist()` | localStorage-backed reactive state |
| `faqir-rules.js` | `l-rules`, `$rules` | a form's conditional logic, from one JSON definition |
| `faqir-tweak.js` | `l-tweak`, `Faqir.tweak` | a live theme studio that writes tokens onto `<html>` and exports them |
| `faqir-validate.js` | `l-validate` | declarative + programmatic form validation |

```html
<script src="https://cdn.jsdelivr.net/npm/@faqir-ui/core@1.2/dist/faqir-core.min.js" defer></script>
<script src="https://cdn.jsdelivr.net/npm/@faqir-ui/core@1.2/dist/plugins/faqir-validate.js" defer></script>
<script src="https://cdn.jsdelivr.net/npm/@faqir-ui/core@1.2/dist/plugins/faqir-rules.js" defer></script>
```

One pairing to know: `faqir-rules` registers its cross-field and remote checks
through `Faqir.validate.register`, so a definition carrying `validate` rules
needs `faqir-validate` on the page too. That is a presence requirement, not a
script order — every plugin installs before the engine boots — and a page
missing one is told so rather than quietly skipping the checks.

Pin the plugin drops the same way as the engine — their hashes are in
`dist/sri.json` beside the rest:

```html
<script src="https://cdn.jsdelivr.net/npm/@faqir-ui/core@1.2/dist/plugins/faqir-rules.js"
        integrity="sha384-…paste from sri.json…"
        crossorigin="anonymous" defer></script>
```

`faqir-rules` is the browser half of
[`@faqir-ui/rules`](https://www.npmjs.com/package/@faqir-ui/rules) — the same
evaluator, bundled in, so the verdict in the page is the verdict on your server
by construction. Install that package to re-check a submission server-side.

## Module usage

The package is **ESM-only**. The default export is the engine; every member is
also a named export, so a bundler can tree-shake the import site (the engine
itself is one blob and is not tree-shakeable).

```js
import Faqir from "@faqir-ui/core";              // dist/faqir-core.mjs
import "@faqir-ui/core/dist/faqir.default.css";  // or your project's own bundle

Faqir.start();
```

```js
import { start, reactive, store } from "@faqir-ui/core";
start();
```

There is no `require` condition. `require("@faqir-ui/core")` fails on Node 18
and 20 with a message pointing at `import()`, and resolves through `default` on
Node ≥ 22.12; use `await import("@faqir-ui/core")` from CommonJS. The UMD build
is still published for `<script>` and CDN use and can be reached directly:

```js
// UMD, for a bundler that must have CommonJS-shaped bytes
import "@faqir-ui/core/faqir-core.js";  // sets globalThis.Faqir
```

## Building

Artifacts are generated from the registry by the repo build (Bun required to build, not
to run):

```sh
bun run build:core-package   # → packages/core/dist/*
```

Zero runtime dependencies. MIT licensed.
