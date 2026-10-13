# Faqir UI 1.2.5 — release notes

1.2.5 is the server template release. `@faqir-ui/template`, the template
language that merged after 1.2.0, is published to npm for the first time, the
docs site gains a section that teaches it, and that section is itself rendered
by the engine. The protocol did not change: every addition falls under
[`SPEC-1.0.md`](../SPEC-1.0.md) §8, and every 1.2.0 page still audits clean.

Eight packages ship at 1.2.5, in lockstep: `faqir-ui-cli`, `@faqir-ui/core`,
`@faqir-ui/react`, `@faqir-ui/vue`, `@faqir-ui/forms`, `@faqir-ui/rules`,
`@faqir-ui/template` and `@faqir-ui/mcp`.

**Why 1.2.5.** Versions 1.2.1 to 1.2.4 were skipped on purpose. They were never
tagged or published; the jump marks the first release in which the template
engine ships, and keeps all eight packages on one number from here on.

---

## Upgrading from 1.2.0

There are no breaking changes and no markup migrations.

```bash
npm install -g faqir-ui-cli@1.2.5
faqir upgrade          # refresh tokens, base styles, the engine and installed components
```

CDN users move the pin from `@faqir-ui/core@1.2.0` to `@faqir-ui/core@1.2.5`;
the docs site's copy-for-agents snippets carry the new SRI hashes.

## New

**`@faqir-ui/template`, on npm.** An indentation-based template language with
Pug's shape and Faqir's vocabulary ([`docs/template.md`](template.md)):

- **Manifests are the grammar.** `+card(variant="outlined" title=post.title)`
  calls a registry component; its arguments are that manifest's variants,
  states and props, `@slot` lines fill its slots, and a value the manifest does
  not allow is a compile error that names the allowed ones.
- **No code runs from data.** Expressions are paths, literals, operators and
  helpers the host registers; there is no eval and no access to globals.
- **Data is drawn, never executed.** Every value is escaped for the context it
  lands in, URL attributes refuse `javascript:` and friends, `on*` attributes
  are refused, and server data reaches faqir-core through one construct, the
  `l-data=json(…)` island. `raw` is the one unescaped construct, and
  `compile(…, { raw: false })` refuses it.
- **Safe for templates you do not trust.** Compiling and rendering a hostile
  template cannot run code, read outside its loader, recurse without bound or
  produce unbounded output (`maxSteps`, `maxOutput`).
- **Isomorphic and zero-dependency.** `@faqir-ui/template` (render, about
  4.4 KB gzip), `/compile`, `/node` (`createFileLoader`) and `/registry` (the
  component table of every callable registry primitive and recipe), on Node 18
  or newer, Bun and the browser.

The output is canonical registry markup, so it passes `faqir audit` and
faqir-core's controllers take it over in the browser.

**`faqir template`.** Installs the engine into `<output_dir>/template/` with
`table.js`, the project's own component table built from its installed
manifests. `--check` reports drift without writing and exits 1 when there is
any; `--json` prints `{ ok, dir, files, drifted }`.

**A docs section rendered by the engine it documents.** `template/` on the docs
site: an overview, syntax, composition and components, escaping and limits,
the API and CLI, and four worked use cases (server-rendered app pages,
documentation and CMS content, email-style static output, untrusted
templates). Every page is a `.faqir` file under `site/templates/`, compiled
with the registry component table and a file loader and rendered with
`render()` during `bun run build:docs`; the generator only wraps the output in
the site's shell. Each of the 44 examples shows its template, the data it was
given and the HTML it rendered, live; 35 failing templates show the diagnostic
or render error the engine gave when the site was built. Server-rendered tabs,
an accordion, a dialog and `l-data` islands on the pages are taken over by
faqir-core. `tests/generator/docs-template.test.ts` re-renders every page and
example and byte-compares them with the built site.

**Release wiring.** `@faqir-ui/template` joins `PACKAGES` in
`scripts/release.mjs` (published before `@faqir-ui/mcp`), and
`check:template-table` — the drift gate for `packages/template/src/registry.js`
— joins the preflight.

## Fixed

- **`output-limit` names its node.** Every render error is documented to carry
  the file, line and column of the template node (`docs/template.md` §14.2); the
  output limit was thrown with none. It now reports the node being written.

## Known limitations

- **A component call cannot also be a part.** A call never takes `data-part`
  (`protocol-attr`), so a button that is a dialog's trigger is written as a plain
  element with `data-ui="button"`. The docs say so where it matters.
- **Repeated parts are not slots.** `+tabs` and `+accordion` render their
  reference markup as it ships, because their triggers and panels repeat. Draw
  them from data with plain elements, as the docs' examples do.
- **Five overlay recipes' reference triggers fail `trigger-contract`.**
  `dialog`, `alert-dialog`, `drawer`, `sheet` and `tooltip` render through a
  call, but their `templates.html` trigger carries no `data-ui="button"`. It is
  a manifest gap listed in `packages/template/tests/registry.test.ts`.
- **Punctuation after an inline element.** Every node renders on its own line,
  so a comma or full stop that follows an inline element renders with a space
  before it. Write a word after the element, or restructure the sentence.
- The [1.2 limitations](release-1.2.md#known-limitations) carry over
  unchanged: the plugin `defer` boot race, `faqir-rules` re-judging only on
  `input` and `change`, no viewport collision handling for `popover` and
  `tooltip`, and theme contrast. There is still no npm provenance (see
  [`release-checklist.md`](release-checklist.md)).

## Development

- The docs site's `renderShell` gains an `overlays` region beside `<main>`, where
  dialog-class markup a page draws is mounted (the audit's `landmark` rule).
- `tests/a11y/docs-site.pw.ts` gains `docs__template_hydration__{light,dark}`.
- The layout budget (`tests/visual/layout-budget.json`) was re-recorded for the
  six new pages, all with zero seams and bleeds.
