// CDN classic-script entry for `@faqir-ui/core`.
//
// `scripts/build-core-package.mjs` bundles this file with `--format=iife`, so a
// plain `<script src="faqir-core.min.js">` (no `type="module"`) executes the
// engine and assigns it to `window.Faqir` — the two-tag CDN story (§10.3).
//
// The unminified `dist/faqir-core.js` is the canonical UMD build and remains the
// entry for `import`/`require`; this wrapper exists only to give the minified
// classic-script artifact a global.
import Faqir from "../../../registry/core/faqir-core.js";

(typeof globalThis !== "undefined" ? globalThis : typeof self !== "undefined" ? self : this).Faqir = Faqir;
