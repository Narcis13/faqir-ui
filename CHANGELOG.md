# Changelog

All eight packages (`faqir-ui-cli`, `@faqir-ui/core`, `@faqir-ui/react`,
`@faqir-ui/vue`, `@faqir-ui/forms`, `@faqir-ui/rules`, `@faqir-ui/template`,
`@faqir-ui/mcp`) are versioned in lockstep. The protocol is frozen at [`SPEC-1.0.md`](SPEC-1.0.md);
every release below is additive under its §8 unless it says otherwise.

## 1.3.5

The component expansion: conversations, media, controls, ranges and nine more
chart kinds. Full notes: [`docs/release-1.3.5.md`](docs/release-1.3.5.md).

All eight packages ship at 1.3.5. 1.3.1–1.3.4 were skipped on purpose, as
1.2.1–1.2.4 were: they were never tagged or published. The protocol did not
change — no new attribute, modifier or token; every addition is a new
component, a new variant value or a new part, additive under SPEC-1.0 §8.

**Upgrading:** no markup migrations; run `faqir upgrade`, and CDN users move
`@faqir-ui/core@1.3.0` to `@1.3.5`. Three things change under existing markup:
calendar day buttons carry `role="gridcell"` (live axe is clean on the grid),
the `stepper` restyles (a halo on the active step, a tick or `!` drawn over a
completed or failed step's indicator text, and vertical connectors that used to
collapse to nothing), and a `chart` nested inside another table reads only its
own rows. `faqir-core.js` grows from about 47 to
64 KB gzip (strict CSP 69 KB), because every recipe controller is inlined;
`faqir-chart.js` from 4 to 9 KB.

- **Added** — nine components. Recipes: `list` (leading media,
  title/subtitle/meta and trailing actions, sticky section headers,
  none/single/multi selection with listbox keys and type-ahead, reordering by
  handle or keyboard, announced); `composer` (grows with its text, sends on
  Enter, IME-safe, takes attachments); `knob` (a rotary `role="slider"` over a
  native range input — drag, wheel, Arrow/Page/Home/End, bipolar and angular
  modes, form reset and `l-model`); `lightbox` (zoom, pan, gallery navigation,
  focus returned, opens from `[data-open]` links outside its root);
  `image-compare` (a keyboard slider divider); `video-player` (custom controls
  over native `<video>` — scrubber with buffered range and hover time, volume,
  rate, captions, picture-in-picture, fullscreen and shortcuts — keeping native
  controls when scripting is off). Primitives: `chat-message` and
  `chat-thread`, CSS-only bubbles with tails, grouping, ticks, quotes,
  reactions, attachments, voice notes, date pills, system lines and a typing
  indicator, in a `role="log"` pinned to the newest message. Pattern: `chat`,
  a conversation list wired to its thread with one `l-data` scope.
- **Added** — `faqir-chart.js` draws `area`, `stacked-column`, `stacked-bar`,
  `pie`, `donut`, `scatter`, `sparkline`, `radar` and `gauge`, all SVG from the
  data table in the page locale, each with an aria-label that reads every
  value. Column, bar and line draw byte for byte as before.
- **Added** — `calendar`: a hover/focus range preview, a 1–3 month view, preset
  ranges and min/max range length. `date-picker`: a range mode with presets,
  typed input parsed in the page locale, a clear button and an inline variant.
- **Added** — `tree-view`: tri-state checkboxes, lazy children with loading,
  failure and retry, type-ahead, a filter that keeps ancestors open, guide lines
  and icons, multi-select, and drag-and-drop with a keyboard path (Alt+Enter,
  arrows, Enter/Escape). `stepper`: an error state, optional and status parts
  and clickable steps; the `wizard`'s steps are buttons bound to its step.
- **Added** — `image`: ratio, fit, focal point, overlay captions and blur or
  skeleton placeholders.
- **Fixed** — `date-picker` reads back its own display text in locales whose
  full date spells the month differently (ru, pl, cs, uk, fi); `knob` snaps onto
  `min + k·step`, exponent steps included; no `calendar` range or preset spans a
  disabled date, and an authored range that runs backwards keeps only its
  start; a `lightbox` picture that fails to load ends the loading ring and says
  so; the `tree-view` filter neither matches nor reveals an item the page hid.
- **Docs** — a showcase page (`showcase/`) with every new and upgraded
  component live and copyable, linked from the Foundations nav and from a new
  release story on the home page; a live example per new component.

## 1.3.0

What two applications built on 1.2.5 asked for: a server-rendered manual and
forecraft, a form and report platform whose first user is an agent. Full notes:
[`docs/release-1.3.md`](docs/release-1.3.md).

All eight packages ship at 1.3.0. The protocol gains one sanctioned token
modifier, `data-accent`, additively under SPEC-1.0 §8.2; everything else is a
new component, plugin, build, option or fix. Each group below opens with its
**Upgrading** note: read them, because a few outputs change under existing
markup and a few template mistakes that used to render now fail to compile.

What building a 20-page manual with `@faqir-ui/template` 1.2.5 asked for.

**Upgrading:** templates that compiled before keep compiling, with four
exceptions, each now a compile error that names its fix: an element name that is
no HTML, SVG or MathML element and has no hyphen (`unknown-tag`, usually a line
of prose missing its `|`); an entity such as `&lt;` in literal text, which
rendered as typed (`literal-entity`); a call to `+tabs`, `+accordion`,
`+dropdown` and the other components with repeating parts that leaves those
parts unfilled (`missing-slot` — they used to render empty sample items); and a
slot filled twice whose part has no fixed id, which used to be `duplicate-slot`
and now repeats the part. Server output changes in two ways: unfilled optional
parts that rendered empty (card `description` and `footer`, callout `icon`) are
left out, and text starting with closing punctuation joins the line before it.

- **Added** — `@faqir-ui/template`: inline elements in text,
  `p Run #[code npm ci], then continue.`; repeating fills — a slot filled more
  than once or inside `each`/`if` repeats its part (tabs, accordion items,
  timeline items, stepper steps, breadcrumb links with their separators,
  description-list terms), with ids numbered per copy so tab N and panel N stay
  paired; fills of fills (`@item` over `@title`); fill arguments, which set the
  part's manifest states and attributes (`@step(completed)`,
  `@item(href=page.url)`); `params` in a partial, with defaults and
  `unknown-param`/`missing-param` at compile time; a `heading="h2"` argument on
  components whose reference tree has headings; `ast.uses`, every component a
  page draws. New diagnostics `unknown-tag`, `literal-entity`, `nested-slot`,
  `fill-count`, `unknown-param` and `missing-param`.
- **Added** — every registry component is callable: `+table` (its kebab-case
  boolean props are camelCase arguments, `noResize`), and `+checkbox`, `+radio`,
  `+switch` and `+toggle`, whose `templates.html` is a group of samples, through
  one sample of the group. `name` and `value` pass through onto the root.
- **Added** — `@faqir-ui/core/subset` (`subsetBundle(css, components)`) cuts a
  theme bundle down to the components a page draws; the bundle's
  `/* === path === */` section markers are documented as a stable contract and
  the build refuses a stylesheet that would forge one. `dist/themes.json`
  (`@faqir-ui/core/themes.json`) gives each theme's density, and a bundle drawn
  at `compact` or `spacious` says so in its header.
- **Added** — `faqir audit` rule `unknown-element` (warning): an element name
  that is no HTML, SVG or MathML element and has no hyphen.
- **Added** — the `prose` base styles definition lists, figures and captions,
  and `details`/`summary`.
- **Fixed** — `@faqir-ui/template` ships its specification as `template.md`
  (copied from `docs/template.md` at pack time); its README and the CLI
  README's package table link to absolute URLs; the CLI README counts
  twenty-five commands and lists `faqir template`.

What building forecraft — a form and report platform whose first user is an
agent — asked for of 1.2.5.

**Upgrading:** six outputs change under existing markup. A single-page
`renderForm` form now ends in a submit button (`submit: false` keeps the old
output) and carries `data-gap="4"`; a date field's `name` moves from the visible
input to a hidden `[data-part="value"]` input that holds the ISO date, so code
that read the date by the visible input's name should read `FormData`; a
`qr-code` draws its modules flush with a 4-module `--qr-quiet` padding (was 2,
drawn inside), so the code is slightly smaller in the same box; the `document`
pattern's `@page` rules are named pages, so a page printed with the bundle but
no document no longer gets its margins or counter; `document-serif` document
headings set in Georgia instead of Times New Roman; and a classic
`<script defer>` engine boots on `DOMContentLoaded`, after the deferred scripts
that follow it. `+file-upload` no longer takes `multiple` (it wrote a broken root
attribute). The packaged `faqir-core.min.js` gzip budget is 47 KB (was 46);
`faqir-validate` 4 KB and `faqir-rules` 14 KB (were 3 and 13).

- **Added** — `Faqir.ui(selectorOrElement)`, a component's controller API from
  plain JavaScript (the same lookup as `$ui`), also the typed ESM export `ui`.
  A directive registered after boot is applied once to the bound elements that
  carry it, in their scopes.
- **Added** — `@faqir-ui/forms`: `rulesFor(schema, ui, opts)` returns the rules
  definition `renderForm` embeds; `heading: false` and `labelledBy` options; a
  `scale` widget (`minLabel`/`maxLabel`) and integer enums; `orientation` on
  radio and checkbox groups; `width` (`full | half | third`) as `data-span`, on a
  six-track grid from the md tier; `gap` (default `4`).
- **Added** — `faqir-validate` fires `faqir:valid-submit` (bubbling, cancelable)
  once per finished submit of a single-page form or a wizard's last step, with
  the form's data as `detail`; `faqir-rules` adds `Faqir.rules.data(form)`, its
  reader (wizard-disabled controls in, rule-hidden fields out, coerced).
- **Added** — `@faqir-ui/template`: `include "x.faqir" depth=N` lets a partial
  recurse, stopped by `include-depth` at render; an unbudgeted cycle is still
  `include-cycle`.
- **Added** — `@faqir-ui/mcp/audit`: `auditHtml(html, opts)` returns the
  `faqir audit --stdin --json` report in process, on Node 18+.
- **Added** — `faqir fonts add --role none` (faces without a role) and
  `--italic` (pinned true italics where the catalog has them; see below); a
  single-weight heading family gets `font-synthesis-weight: none` and a
  warning when the theme asks for a heavier heading weight.
- **Added** — `skip-link` primitive (site-header opens with one; give `main`
  `id="main"`) and base-layer `data-ui="visually-hidden"` (`.sr-only` stays).
- **Added** — `checkbox-group` is a declared component of `checkbox`.
- **Added** — `alert-dialog`'s trigger is optional; `command-palette` items take
  `data-value` and may be `<a href>` links, and `command-select` is cancelable
  with `detail.value`/`detail.href`; `qr-code` encodes versions 1–40, and both
  `qr-code` and `barcode` set `data-state="error"` and fire `faqir:error` on a
  value they cannot encode, with `--qr-quiet` / `--barcode-quiet` padding;
  `table` takes `data-print-footer="last"`; `progress` takes `data-value` with
  no `style`.
- **Added** — `document`: named pages per `data-format` + `data-orientation`,
  `--doc-accent`, `--doc-serif`, a page counter in the document's language
  (de, es, fr, it, nl, pt, ro, or `--doc-page-label`/`-separator`/`-suffix`),
  `data-header="from-page-2"` and `data-running="margin"` running strings, and a
  DIN 5008 `letter` variant; `quote` takes `data-mark="above|hang|none"` and
  sizes itself from the document inside one.
- **Added** — `audit:registry` gate 10 audits every manifest template with the
  real auditor; the forms tests audit `renderForm` output against the registry.
- **Fixed** — the `alert-dialog`, `dialog`, `drawer`, `sheet` and `tooltip`
  templates give their trigger `data-ui="button"` (`trigger-contract`), so the
  React, Vue and template bindings render a styled trigger; `sidebar`'s
  `app_shell` template spells out the sidebar instead of eliding it.
- **Fixed** — `landmark` no longer warns for an inline control's non-modal popup
  (the date-picker calendar) inside `<main>`; `field-wiring` ignores hidden
  inputs.
- **Fixed** — `toggle-group` follows a reactive `:checked` binding; a fieldset
  card's legend no longer notches its border; fields in a group card or a
  wizard step get the same gap as a flat form; no rhythm gap after a
  `site-header`; `nav` rows wrap; prose tables in a `div`/`figure` scroll;
  `key-value` grouped pairs keep the grid; `hero` is transparent in a
  `backdrop` and honours `--hero-display-size` in every layout; `feature-grid`,
  `stats-dashboard` and `wizard` headings use the heading voice;
  `dashboard-shell` no longer opens its sidebar over a phone, and its toggle is
  hidden from md up; print themes set documents in the project's role fonts.
- **Fixed** — manifest templates of auth-form, wizard, crud-table,
  settings-page, search-results, inbox and dashboard-shell audit clean.

The five forecraft notes deferred from that round: a runtime accent, a chart,
print-theme identities, true italics and a strict-CSP engine.

**Upgrading:** `editorial-document`, `ink-document` and `swiss-document` print
differently — editorial in a serif heading voice on 11mm side margins, swiss
tight and flush with black rules and 1.2× numerals, ink with 2px/3px rules and
a deeper bold table head; `document` and `document-serif` print as before.
Projects that copy token files one by one should copy `tokens/accent.css` and
import it before `density.css` (bundled and `faqir init` projects get it). Under
a CSP without `'unsafe-eval'`, swap `faqir-core.js` for `faqir-core.csp.js`;
expressions that use classes, `async`/`await`, destructuring, default
parameters, `switch`, `try` or `while` must be rewritten for it. The default
engine is byte-identical.

- **Added** — `data-accent`, the fifth sanctioned token modifier (SPEC-1.0 §4,
  additive under §8.2): `rose | red | orange | blue | indigo | violet |
  purple | fuchsia | pink` re-hue
  `--color-primary`, `-hover`, `-active`, `-subtle` and `--color-ring` for a
  subtree, keeping the active theme's own lightness and chroma; `custom` reads
  `--accent-hue`. Each named hue clears every `contrast-tokens` pair in all 31
  themes, light and dark. `--doc-accent` follows it; without relative colour
  syntax it is a no-op. New `registry/tokens/accent.css`, `docs/accent.md`, an
  `l-tweak` "Named accent" dial, and `checkAccentContrast` / `accentLookups` /
  `rehueColor` in `contrast-tokens`.
- **Changed** — the light-scheme primary of `neumorph`, `memphis`, `aurora`
  and `paper` is a shade darker (0.005–0.013 OKLCH lightness), so the accent
  clears AA on their muted plate in every named `data-accent` hue, not only
  their own. `neumorph` and `memphis` move by seed (accent lightness 0.6 →
  0.585), so their whole accent ramp moves with it, `neumorph`'s dark-scheme
  primary included (0.7 → 0.689 lightness).
- **Added** — `chart` primitive (`data-variant="column|bar|line"`): its
  `<table data-part="data">` is the chart without JavaScript and prints under
  the drawn one; `faqir-chart.js`, an opt-in plugin (4 KB budget), draws an
  inline SVG from it — zero baseline for bars and columns, direct labels where
  they fit, series apart by lightness and (lines) dash pattern, `role="img"`
  with an `aria-label` that reads the numbers, colours from custom properties
  only (`--chart-accent`). `data-table="auto|visible|hidden"`, `data-value` on a
  cell, `$ui.redraw()`. A plugin header can now carry a component's controller
  (`// @ui:controller <name>`): `build:manifest-api` writes its `api` and the
  template table puts the plugin in `@ui:requires` (`+chart`).
- **Added** — `faqir-core.csp.js` (dev twin `faqir-core.csp.dev.js`, CDN
  `dist/faqir-core.csp.min.js`, `import "@faqir-ui/core/csp"`): directive
  expressions are interpreted by a tokenizer, Pratt parser and evaluator, never
  compiled, so pages need no `'unsafe-eval'`. It refuses `constructor`,
  `__proto__` and `prototype` and names any unsupported construct. Own 52 KB
  gzip budget.
- **Added** — true italics for 13 catalog families (Inter, Geist, DM Sans, IBM
  Plex Sans/Serif/Mono, Source Serif 4, Fraunces, Instrument Serif, Newsreader,
  Lora, Nunito, JetBrains Mono): 30 WOFF2 files pinned by SHA-256 at the
  upright rows' Fontsource 5.3.0 versions, subsets and weights, installed with
  `faqir fonts add <family> --italic`.
- **Added** — document tokens `--doc-rule-scale`, `--doc-rule-strong-scale`,
  `--doc-table-num-scale` and `--doc-table-flush` (defaults draw as before);
  `faqir theme generate … document: true` gives the companion a print voice
  from the seed's `type.pairing` (serif, `sans-grotesque`, `slab`).
- **Fixed** — the three generated print companions no longer differ only in hue.
- **Fixed** — `fonts add --italic` no longer refuses every family; for Manrope,
  Space Grotesk and Bricolage Grotesque it says their package ships upright only.

The documentation site, brought up to all of the above.

- **Added** — three pages: `accent/` shows every named `data-accent` hue live,
  a custom-hue dial and nesting, with the vocabulary read out of
  `src/theme/accent.ts`; `print/` covers named pages, running strings, the
  letter, printable data components and a voice table read out of the print
  themes' stylesheets, beside the invoice and report scaffolds; `engine/csp/`
  runs live directives on `faqir-core.csp.js` under a page-stated policy without
  `'unsafe-eval'`, and reports the refused `new Function`.
- **Added** — the home page tells the 1.3 story, with a badge in every named hue
  and a live chart; the engine page covers `Faqir.ui()`, late directive
  registration and the `defer` boot; the rules page covers the forms options,
  layout keys, `faqir:valid-submit` and `rulesFor`; the integrations page
  carries the strict-CSP CDN tag, `themes.json`, `@faqir-ui/core/csp` and
  `/subset`, and `@faqir-ui/mcp/audit`; theme authoring and the studio point to
  the runtime accent.
- **Fixed** — the site's stylesheet now concatenates the same token files as
  `faqir bundle`, in the same order: `textures.css` and `accent.css` were
  missing, so theme textures (aurora's page mesh, for one) never drew on the
  site and `data-accent` did nothing there. A test holds the two lists equal.
- **Fixed** — the integrations page lists `@faqir-ui/template` among the
  packages (eight, not seven), the rules page's widget table matches
  `@faqir-ui/forms` (`step=any` numbers, integer enums, `scale`), and the home
  page names every engine plugin, `chart` included.

## 1.2.5

The server template language. Full notes: [`docs/release-1.2.5.md`](docs/release-1.2.5.md).

All eight packages ship at 1.2.5; `@faqir-ui/template` is published to npm for
the first time. 1.2.1–1.2.4 were skipped on purpose: the template engine merged
after 1.2.0, and the version says the eight packages move together from here.

**Upgrading from 1.2.0:** no breaking changes, no markup migrations. Run
`faqir upgrade`; CDN users move `@faqir-ui/core@1.2.0` to `@1.2.5`.

- **Added** — `@faqir-ui/template`: an indentation-based, zero-dependency
  template language that renders Faqir primitives and recipes on a server, with
  component calls checked against their manifests, escaping per context, the
  `l-data` island, limits for untrusted templates, and audit-clean output that
  faqir-core takes over in the browser. Entries `.` (render), `/compile`,
  `/node` and `/registry`. `faqir template` installs it into a project with
  the project's own component table; `check:template-table` joins the release
  preflight.
- **Fixed** — an `output-limit` render error now carries the file, line and
  column of the node being written, as every other render error does.
- **Docs** — a Server templates section (`template/`): six pages, 44 live
  examples and 35 captured errors, every page rendered by the engine it
  documents from `site/templates/` and byte-compared by a test; linked from the
  navigation, the home page, the sitemap and the hosted llms files.

## 1.2.0

Motion, content and the theme studio. Full notes: [`docs/release-1.2.md`](docs/release-1.2.md).

**Upgrading from 1.1.x:** no breaking changes, no markup migrations. Run
`faqir upgrade`, then `faqir audit`; CDN users move `@faqir-ui/core@1.1` to `@1.2`.
Read the three behaviour changes first: `faqir-validate` sets `novalidate` on its
form, `Faqir.validate` follows the last copy of `faqir-validate.js` loaded, and a
toast is never wider than its container.

- **Added** — primitives `stamp`, `spotlight`, `reveal`, `marquee`, `backdrop`,
  `glow`, `highlight`, `quote`, `rating`, `timeline`, `scroll-progress`;
  patterns `site-header`, `logo-cloud`, `testimonials`, `cta`, `faq`, `bento`,
  `article`, `post-list`; themes `deco`, `clay`, `memphis`, `monolith`; the
  `faqir-tweak` theme-studio plugin; the choreography token family; five
  `l-transition` presets; effect and hover properties on `card`, `button`,
  `image`, `link`, `badge`, `text`, `separator` and `toggle-group`.
- **Fixed** — `qr-code` multi-block symbols, version selection and version
  information; `toast` overflow on phones; `popover` width and close button;
  `card` title/description without a header; labelled dashed `separator`;
  `l-teleport` double binding; `l-model` on `switch`; `faqir-validate` inert
  without `novalidate`, and loaded twice; `faqir-rules` stale reads; docs-site
  overlay previews.
- **Docs** — every engine and plugin directive, modifier and magic runs live on
  the engine page; a coverage test keeps every component, theme, token, command
  and MCP tool on the site.

## 1.1.2

The 33 downstream bug reports from `faqir_bugs.md`, with the small additive
pieces they needed. Notes: [`docs/release-1.1.2.md`](docs/release-1.1.2.md).

## 1.1.1 and 1.1.0

"Personality": Theme System 2.0, the rules platform and Night Shift. Notes:
[`docs/release-1.1.md`](docs/release-1.1.md).

## 1.0.0

The frozen protocol. Upgrading from 0.2.4: [`docs/migration-1.0.md`](docs/migration-1.0.md).
