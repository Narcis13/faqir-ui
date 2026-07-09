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
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@faqir-ui/core@0.2/dist/faqir.default.css">

<!-- 2. The reactive engine — sets window.Faqir and auto-boots on DOMContentLoaded -->
<script src="https://cdn.jsdelivr.net/npm/@faqir-ui/core@0.2/dist/faqir-core.min.js" defer></script>
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
      href="https://cdn.jsdelivr.net/npm/@faqir-ui/core@0.2/dist/faqir.default.css"
      integrity="sha384-…paste from sri.json…"
      crossorigin="anonymous">
<script src="https://cdn.jsdelivr.net/npm/@faqir-ui/core@0.2/dist/faqir-core.min.js"
        integrity="sha384-…paste from sri.json…"
        crossorigin="anonymous" defer></script>
```

## Artifacts (in `dist/`)

| File | What it is |
|------|------------|
| `faqir-core.js` | Canonical UMD engine — use for `import` / `require` / bundlers. |
| `faqir-core.min.js` (+ `.map`) | Minified classic-script build; a plain `<script src>` sets `window.Faqir`. |
| `faqir.{theme}.css` | Full CSS bundle per theme: all tokens + theme + base + every component. Self-contained (no `@import`). |
| `plugins/` | Official plugin drops (`faqir-persist`, `faqir-intersect`, … — landing per milestone). |
| `sri.json` | SHA-384 integrity hashes for every file above. |

## Module usage

For bundlers, the default export is the `Faqir` global:

```js
import Faqir from "@faqir-ui/core";              // dist/faqir-core.js (UMD)
import "@faqir-ui/core/dist/faqir.default.css";  // or your project's own bundle

Faqir.start();
```

## Building

Artifacts are generated from the registry by the repo build (Bun required to build, not
to run):

```sh
bun run build:core-package   # → packages/core/dist/*
```

Zero runtime dependencies. MIT licensed.
