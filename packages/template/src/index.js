// @faqir-ui/template — the core entry, the runtime (docs/template.md §15.1).
// `render` draws a compiled template (a plain-JSON AST, from `/compile`) with
// data. It is all a host needs at request time — compile once when a template
// is saved, store the AST, render it many times — and all a browser needs to
// draw a stored AST. It imports nothing outside this directory, uses no host
// global and no `node:` module, so it runs in Node, Bun and a browser.

export { render } from "./render.js";
