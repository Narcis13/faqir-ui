# Faqir UI 1.3.0 — release notes

1.3 is what two applications built on 1.2.5 sent back. One is a twenty-page
manual rendered on a server with `@faqir-ui/template`; the other is forecraft, a
form and report platform whose first user is an agent. Between them they filed
sixty-five notes, and this release is the answer to them; the few declined on
purpose are listed below. The protocol gains one sanctioned token modifier, `data-accent`,
additively under [`SPEC-1.0.md`](../SPEC-1.0.md) §8.2. Everything else is a new
component, plugin, build, option or fix.

Eight packages ship at 1.3.0, in lockstep: `faqir-ui-cli`, `@faqir-ui/core`,
`@faqir-ui/react`, `@faqir-ui/vue`, `@faqir-ui/forms`, `@faqir-ui/rules`,
`@faqir-ui/template` and `@faqir-ui/mcp`. No package is new on npm.

The item-by-item list is in [`CHANGELOG.md`](../CHANGELOG.md#130).

---

## Upgrading from 1.2.5

```bash
npm install -g faqir-ui-cli@1.3.0
faqir upgrade          # refresh tokens, base styles, the engine and installed components
```

CDN users move the pin from `@faqir-ui/core@1.2.5` to `@faqir-ui/core@1.3.0`
(or the `@1.3` range); the docs site's copy-for-agents snippets carry the new
SRI hashes. A project that copies token files one by one adds
`tokens/accent.css` before `density.css`.

**Templates that compiled before keep compiling, with four exceptions.** Each is
now a compile error that names its fix:

- an element name that is no HTML, SVG or MathML element and has no hyphen
  (`unknown-tag`), usually a line of prose missing its `|`;
- an entity such as `&lt;` in literal text, which rendered as typed
  (`literal-entity`);
- a call to `+tabs`, `+accordion`, `+dropdown` or another component with
  repeating parts that leaves those parts unfilled (`missing-slot`): they used
  to render empty sample items;
- a slot filled twice whose part has no fixed id now repeats the part, where it
  used to be `duplicate-slot`.

**Outputs that change under existing markup:**

- Server templates leave out unfilled optional parts that rendered empty (card
  `description` and `footer`, callout `icon`), and text that starts with
  closing punctuation joins the line before it.
- A single-page `renderForm` form ends in a submit button (`submit: false`
  keeps the old output) and carries `data-gap="4"`. A date field's `name` moves
  from the visible input to a hidden `[data-part="value"]` input holding the ISO
  date: read the date through `FormData`.
- `qr-code` draws its modules flush, with a 4-module `--qr-quiet` padding (it
  was 2, drawn inside), so the code is slightly smaller in the same box.
- The `document` pattern's `@page` rules are named pages, so a page printed
  with the bundle but no document no longer takes a document's margins and
  counter. `document-serif` headings set in Georgia rather than Times New Roman.
- `editorial-document`, `ink-document` and `swiss-document` print with their own
  voices (serif headings on 11 mm margins; heavier rules; tight and flush with
  larger numerals). `document` and `document-serif` print as before.
- The light-scheme primary of `neumorph`, `memphis`, `aurora` and `paper` is a
  shade darker (0.005–0.013 OKLCH lightness), so every named accent clears AA on
  their muted plate.
- A classic `<script defer>` engine boots on `DOMContentLoaded`, after the
  deferred scripts that follow it.
- `+file-upload` no longer takes `multiple`; it wrote a broken root attribute.

**Under a CSP without `'unsafe-eval'`,** swap `faqir-core.js` for
`faqir-core.csp.js`. Expressions that use classes, `async`/`await`,
destructuring, default parameters, `switch`, `try` or `while` must be rewritten
for it. The default engine is byte-identical to what it would have been.

**Size budgets moved:** the packaged `faqir-core.min.js` to 47 KB gzip (was 46),
`faqir-validate` to 4 KB (was 3), `faqir-rules` to 14 KB (was 13). The new
`faqir-chart` plugin has 4 KB and the strict-CSP engine 52 KB.

## New

**A runtime accent.** `data-accent` on any element re-hues `--color-primary`,
its hover, active and subtle steps, and `--color-ring` for that subtree, keeping
the active theme's own lightness and chroma. Nine hues are named — rose, red,
orange, blue, indigo, violet, purple, fuchsia and pink — and each one clears
every `contrast-tokens` pair in all 31 themes, light and dark, under both gamut
models. `custom` takes any other hue from `--accent-hue`, and its contrast is
the author's to check. The studio gains a **Named accent** dial. How each hue
was measured, and why amber, yellow and the greens are not named:
[`docs/accent.md`](accent.md).

**Charts.** The `chart` primitive is a `<figure>` whose
`<table data-part="data">` is the chart without JavaScript and prints under the
drawing. The opt-in `faqir-chart.js` plugin draws a column, bar or line chart
from it as inline SVG: a zero baseline, direct labels where they fit, series
told apart by lightness and dash, `role="img"` with an `aria-label` that reads
the numbers, and colours from custom properties only.

**A strict-CSP engine.** `faqir-core.csp.js` is the same engine, controllers
and API with directive expressions interpreted by a tokenizer, a Pratt parser
and an evaluator, so a page needs no `'unsafe-eval'`. It refuses
`constructor`, `__proto__` and `prototype`, and names any construct outside its
subset. It ships as `core/faqir-core.csp.js` after `faqir init`, as
`dist/faqir-core.csp.min.js` on the CDN and as `@faqir-ui/core/csp`. Details:
[`docs/security.md`](security.md#the-strict-csp-build).

**Documents and print.** Named pages per `data-format` and `data-orientation`,
running headers and footers in the page-margin boxes (`data-running="margin"`),
`data-header="from-page-2"`, a page counter in the document's language (de, es,
fr, it, nl, pt, ro, or three custom properties), a DIN 5008 `letter` variant
with fold marks and an envelope window, and four document tokens that give each
print theme a table voice. `faqir theme generate … document: true` gives a
seed's print companion the voice of its type pairing. `faqir fonts add <family>
--italic` installs true italics for thirteen catalog families, pinned by
SHA-256. `table` takes `data-print-footer="last"`, `quote` takes `data-mark`,
and `qr-code` (now versions 1–40) and `barcode` report a value they cannot
encode.

**Forms.** `faqir-validate` fires `faqir:valid-submit`, bubbling and
cancelable, with the form's data as `detail`; `Faqir.rules.data(form)` is the
coerced reader behind it. `rulesFor(schema, ui, opts)` returns the exact
definition `renderForm` embeds, for the server. The UI schema gains a `scale`
widget, integer enums, `orientation` and `width`; `renderForm` gains `submit`,
`heading`, `labelledBy` and `gap`.

**Server templates.** Inline elements in text (`p Run #[code npm ci].`),
repeating fills with ids numbered per copy, fills of fills, fill arguments,
`params` on partials with compile-time checks, a `heading` argument, recursive
includes with a `depth` budget, `ast.uses`, and every registry component
callable, `+table` and the input groups included. `@faqir-ui/core/subset` cuts
a theme bundle down to the components a page draws, and
`@faqir-ui/core/themes.json` lists every bundle's theme and density.

**For agents and scripts.** `Faqir.ui(selectorOrElement)` reaches a
component's controller from plain JavaScript; a directive registered after boot
applies to the elements already carrying it; `@faqir-ui/mcp/audit` exports
`auditHtml`, the `faqir audit --stdin --json` report in process; the
`skip-link` primitive and `data-ui="visually-hidden"`; the `unknown-element`
audit rule; and `audit:registry` gate 10 audits every manifest template with
the real auditor.

## The documentation site

The site documents and demonstrates every item above.

- **`accent/`** shows each named hue live in whatever theme the reader picks, a
  custom-hue dial that reaches the hues the gate left out, and nesting. The hue
  gallery and the vocabulary table are read out of `src/theme/accent.ts`.
- **`print/`** shows the invoice and report scaffolds in frames, the named-page
  table, running strings, the letter and a live chart that prints its table,
  with a voice table read out of the five print themes' stylesheets.
- **`engine/csp/`** runs live directives on the strict-CSP engine under a
  policy the page states itself, `script-src 'self'`, and reports that
  `new Function` was refused.
- The home page tells the 1.3 story with a badge in every hue and a live chart.
  The engine, rules, integrations, theme-authoring and studio pages gain their
  1.3 sections.

Building those pages turned up two defects in the site itself, both fixed. Its
stylesheet had fallen behind the bundler's token list, so theme textures never
drew on the site and `data-accent` did nothing there; a test now holds the two
lists equal. The integrations page had also left `@faqir-ui/template` out of
the package table.

## Declined

- The `cluster` primitive keeps wrapping. One note asked for a `nowrap`
  option, but cluster's contract is that the wrap is the row: a horizontal
  `stack` is the row that does not wrap.
- A rating *input* is a new form component, not a fix, and is left for a later
  release; the `rating` primitive still displays a score.

## Verification

The release preflight (`node scripts/release.mjs`) runs every `check:*` gate,
`audit:registry`, `size` and the full test suite. The docs site was also checked
in headless Chromium at 1280 and 375 px, light and dark, on the new and changed
pages. Every hue re-hued, the custom dial and the charts drew, the CSP page
refused `new Function` while its directives ran, no page scrolled sideways, and
the console stayed empty. The visual and print pixel suites still baseline in
the pinned Linux container and stay manual
([`release-checklist.md`](release-checklist.md)).
