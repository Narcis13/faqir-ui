// ESM entry for `@faqir-ui/core` — the target of the `import` condition.
//
// WHY THIS FILE EXISTS. `registry/core/faqir-core.js` is a UMD wrapper, and the
// package is `"type": "module"`. Under ESM neither `exports` nor `module` nor
// `define` is defined, so the wrapper takes its *global* branch: it assigns
// `globalThis.Faqir` and exports nothing at all. Pointing the `import`
// condition at it made the shape both the README and `faqir-core.d.ts`
// document —
//
//     import Faqir from "@faqir-ui/core";
//
// — fail at runtime with `SyntaxError: … does not provide an export named
// 'default'`. Bundling the same factory to real ESM here fixes it at the
// source: the engine gets `module`/`exports` from the bundler, takes the CJS
// branch, and its return value becomes an honest module export. No global is
// touched, so two copies of the package no longer race for `globalThis.Faqir`.
//
// The UMD file is still shipped and is still what `<script src>` and the CDN
// load — see `cdn-entry.js`, which is the same idea for the `iife` format.
//
// The named exports below are NOT decorative: they are the whole reason this is
// a wrapper rather than a re-export, since a UMD default cannot be destructured
// by a bundler. `tests/build/core-package.test.ts` holds this list against
// `Object.keys()` of the live engine in both directions, so an engine member
// added without a line here fails the build.
import Faqir from "../../../registry/core/faqir-core.js";

export default Faqir;

export const version = Faqir.version;

// ── Reactivity ──
export const reactive = Faqir.reactive;
export const effect = Faqir.effect;
export const batch = Faqir.batch;
export const untrack = Faqir.untrack;
export const nextTick = Faqir.nextTick;

// ── Expressions ──
export const evaluate = Faqir.evaluate;
export const evaluateAssignment = Faqir.evaluateAssignment;

// ── Registration ──
export const data = Faqir.data;
export const store = Faqir.store;
export const directive = Faqir.directive;
export const magic = Faqir.magic;
export const plugin = Faqir.plugin;
export const controller = Faqir.controller;

// ── Lifecycle ──
export const start = Faqir.start;
export const initTree = Faqir.initTree;
export const destroy = Faqir.destroy;

// ── Inspection ──
export const inspect = Faqir.inspect;
export const devtools = Faqir.devtools;
