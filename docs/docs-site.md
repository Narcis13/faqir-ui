# The documentation site

The Faqir docs site is a Faqir project. It has **no build step at runtime**: the
whole site is plain HTML written at authoring time, styled by one stylesheet
assembled from the registry, servable by any static file server (or straight off
`file://`).

```bash
bun run build:docs                 # → site/dist
bunx serve site/dist               # …or python3 -m http.server, or a CDN
```

Everything a component page says comes from that component's manifest, so the
site cannot drift from the registry and there is nothing to hand-maintain:
**adding a component to `registry/` adds its page, its nav entry, its live
example and its CSS with zero edits to `site/`.** That claim is a test
(`tests/generator/docs-site.test.ts`), not a promise — it builds against a real
registry copy with one extra component in it.

---

## Layout

| Path | Written by | What it is |
|---|---|---|
| `site/site.config.json` | you | Title, tagline, description, theme, footer. |
| `site/content/home.html` | you | Hand-written page content: the home page. |
| `site/content/playground.html` | you | Hand-written: the playground's sample markup. |
| `site/lib/playground.js` | you | The playground's wiring (the only site JS, with…) |
| `site/lib/gallery.js` | you | …the theme switcher's wiring, and… |
| `site/lib/copy-snippet.js` | you | …the copy-for-agents button. |
| `site/lib/faqir-audit.js` | generated | The audit engine, compiled for the browser. **Committed** — `bun run build:audit-browser`. |
| `scripts/build-docs.mjs` | — | The writer: builds in memory, clears `site/dist`, writes. |
| `scripts/build-audit-browser.mjs` | — | The bundler for `site/lib/faqir-audit.js`. |
| `src/generator/docs.ts` | — | The generator. Pure, `node:fs` only, zero dependencies. |
| `site/dist/**` | generated | The static site. Git-ignored — rebuild, never commit. |

Output shape:

```text
index.html                        home (authored fragment + registry stats)
components/index.html             every component, grouped by layer
components/<layer>/<name>.html    one page per component
tokens/index.html                 token reference, grouped by token file
playground/index.html             in-browser audit playground
themes/index.html                 theme gallery + instant switcher
agents/index.html                 the machine surfaces, documented
examples/<layer>/<name>.html      one standalone live example per component
frames/theme-preview-<name>.html  the demo document each gallery frame renders
llms.txt · llms-full.txt          full-registry agent context (llmstxt.org)
manifest.schema.json              the manifest contract, at its own `$id` path
registry-index.json               the remote-registry index
snippets/<layer>/<name>.html.txt  copy-for-agents payload: markup + CDN preamble
_headers                          content types + CORS for the files above
styles/faqir.css                  tokens + base + every component CSS
styles/themes/<name>.css          one per registry theme — the swappable link
scripts/faqir-core.js             the registry engine
scripts/faqir-audit.js            the audit engine, compiled for the browser
scripts/faqir-manifests.js        every manifest as one global
scripts/playground.js             playground wiring
scripts/gallery.js                theme-switcher wiring
scripts/copy-snippet.js           the copy-for-agents button
```

Every URL in the site is relative, so the output works at a domain root, in a
sub-directory, or opened as a local file.

---

## What a component page contains

All of it derived from `<name>.manifest.json`:

- **Live example** — an `<iframe>` onto that component's registry reference page.
- **Anatomy** — the root selector and content model, then a slot table
  (selector, tag hint, required-ness, description).
- **Variant matrix** — every variant, its attribute, every declared value written
  as the attribute an author types, its default, and the part it applies to.
- **States** — attribute, default, applied-to part, description.
- **Accessibility** — role, modality, focus trap, escape behaviour, return
  focus, required ARIA, and the full keyboard map.
- **Design tokens** — every token the component consumes, linked into the token
  reference by anchor.
- **Templates**, **safe/unsafe transforms**, **composition** (linked both ways).

---

## The two page classes, and why they are gated differently

The site ships two kinds of page, and the distinction is load-bearing:

**Site pages** (home, component index, component pages, token reference,
playground, theme gallery, gallery frames) are authored by the generator out of
registry components and design tokens only. They carry **no `class` attribute, no
hardcoded colour, and no CSS of their own**, and they are held to:

- `faqir audit` — **zero findings at every severity**, using the real registry
  manifests. Not "no errors": zero.
- axe-core WCAG 2.0/2.1 A/AA — **zero violations**, on every page, in both colour
  schemes, served over real HTTP (`tests/a11y/docs-site.pw.ts`).

That is the point of the site: if the framework cannot document itself without
tripping its own gates, the gates or the framework are wrong.

**Example pages** wrap a registry reference fragment *verbatim* — the markup is
the registry's, not the site's. It is gated where it lives: the registry
self-audit runs the document rules over it, and the a11y matrix (task 0.4-24)
scans it component by component. Re-running the per-component audit rules here
would not test the site, it would duplicate that gate — and the reference pages
are deliberately partial demos (a card showing only its header, a dialog demoed
without a controller), which those rules flag by design.

So the split is **content-derived, not a per-component escape hatch**, and two
tests hold it that way:

- every example page's body **is** its registry fragment, byte for byte;
- every example page's component **is** in the registry a11y matrix.

Example pages still must not break the document rules — that is what the
generator's landmark placement is for: a fragment that declares its own `<main>`
is mounted as-is, a fragment carrying dialog-class markup is mounted *beside*
`<main>` (overlays belong outside the content flow), everything else is wrapped
in `<main>`. No component names appear in that decision.

### Two layouts inside the site-page class

`frames/**` are site pages in every sense — generator-authored, audit-clean,
axe-clean — but they are rendered inside an `<iframe>`, so they carry no
navigation shell, for the same reason `examples/**` carry none: there is nowhere
to navigate from inside a frame. `isShellPage()` and `isFramePage()` name the two
layouts; `isSitePage()` still names the one gate. The split is about layout, not
about rigour.

---

## JavaScript on the site

The site ships JavaScript on **three pages** — the playground, the theme gallery
and the gallery frame. Every other page (the home page, the component index, all
83 component pages, the token reference) is still static HTML plus one stylesheet,
and a test holds them that way.

| File | What it is |
|---|---|
| `scripts/faqir-audit.js` | `src/audit/browser.ts` compiled to an IIFE that installs one global, `FaqirAudit`. Zero dependencies, no DOM required. |
| `scripts/faqir-manifests.js` | Every registry manifest, verbatim, as `window.__FAQIR_MANIFESTS__`. A script, not JSON + `fetch`, so it works from `file://`. |
| `scripts/playground.js` | Textarea → findings list → preview frame. |
| `scripts/gallery.js` | The switcher. One file, two roles (host / frame). |

Nothing on the site fetches. **The audit runs in the page**, which is why the
playground needs no server, no API and nothing deployed but files.

### Why the browser engine is committed

`src/generator/docs.ts` is pure and `node:fs`-only — it copies files, it does not
invoke a bundler — so `site/lib/faqir-audit.js` is built by
`scripts/build-audit-browser.mjs` and **committed**, exactly like
`registry/core/faqir-core.js`. `bun run check:audit-browser` is its drift gate (in
CI, and spawned from `bun test`).

The bundle is not a re-implementation. `src/audit/browser.ts` re-exports the same
`auditHtmlSource` the CLI and the MCP server call — that function lives in
`src/audit/html-audit.ts` precisely so that nothing in its import graph touches
`node:*`. CLI ↔ browser parity is therefore **structural**, and the parity suite
(`tests/generator/audit-browser.test.ts`) proves it on 500-odd shared fixtures:
every page of this site, every registry reference fragment, hand-written dirty
snippets and the parser fuzz corpus, compared finding-for-finding.

One thing the browser side must get right on its own is manifest keying. The CLI
loads primitives → recipes → patterns and lets the last one win; the payload is
written in that order and `manifestMap` does not re-sort it, because `empty-state`
ships as both a primitive and a pattern and a sorted map would silently audit it
against the other contract.

---

## Themes: one link, one attribute

A theme is a stylesheet of design-token declarations, and a colour scheme is one
attribute. The site is built so that both are exactly that:

- `styles/faqir.css` carries tokens, base and every component stylesheet;
- `styles/themes/<name>.css` is the theme, on a **second `<link>`** that every
  page of the site carries under the id `faqir-theme`;
- `data-theme` on `<html>` selects the scheme (`light` / `dark` / `auto`).

So the gallery's switcher is not a special mechanism: picking a theme rewrites
that link's `href`, picking a scheme rewrites `data-theme`, and the page you are
reading restyles with no reload and no flash. The frames are told about a scheme
change by `postMessage` rather than reached into, because a site opened from
`file://` has no same-origin access to its own frames.

The theme therefore loads **after** the component CSS, one step later than
`faqir init` concatenates it. That is safe in both directions and asserted: no
component stylesheet declares `:root`, so nothing competes with a theme's token
declarations; and the one theme that also targets components (`contrast.css`, via
`:root [data-ui]…`) already outranks them on specificity. Loading later can only
raise a theme's authority, never lower it.

Each theme gets its own frame document (`frames/theme-preview-<name>.html`) rather
than one document with a `?theme=` query: a static host would serve the same bytes
for every query anyway, the theme is then correct before first paint, and every URL
on the site stays a plain relative path the link checker can resolve.

---

## Agent surfaces (the machine half of the site)

Four files describe the framework to a machine. Their **paths are a contract** —
an llms.txt URL that has been pasted into a prompt is an API — so they are
asserted as literal strings in `tests/generator/docs-agents.test.ts`, and moving
one fails CI rather than 404-ing in production.

| URL | What it is | Served as |
|---|---|---|
| `/llms.txt` | llmstxt.org index: every component in one line, linked into the full reference. | `text/plain` |
| `/llms-full.txt` | The expanded reference: template, variants, slots, states, a11y contract per component, plus the protocol and token scales. | `text/plain` |
| `/manifest.schema.json` | The manifest contract. At the root because that *is* its `$id`. | `application/schema+json` |
| `/registry-index.json` | The remote-registry index (SHA-256 per file) that `faqir add --registry <url>` fetches. | `application/json` |

The llms.txt pair is **the CLI's own generator pointed at the registry** — the
same `formatContextLlms` / `formatContextLlmsFull` that `faqir context --format
llms` calls, over a `ContextData` built from every registry manifest instead of
from one project's `ui/` directory (`src/generator/registry-context.ts`). The
only thing that differs is `meta.scope`, which switches the summary sentence: a
hosted file must not claim "this project installs…".

The schema and the index are copied **byte-identical** from the repository, and
the schema is re-validated against every registry manifest through the hosted
copy — the served bytes are the contract, not a rendering of it.

`_headers` (Cloudflare Pages / Netlify format) is generated from the same list
that emits those files, so a machine file cannot be served without a content type
and a permissive `Access-Control-Allow-Origin` — a browser-based agent that
cannot read the file cross-origin cannot use it at all.

### Copy for agents

Every component page carries a **Copy for agents** button. What it copies is a
complete, standalone document — the component's registry reference markup under
the two-tag CDN preamble, version-pinned with subresource integrity:

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@faqir-ui/core@0.2.4/dist/faqir.default.css"
      integrity="sha384-…" crossorigin="anonymous">
<script src="https://cdn.jsdelivr.net/npm/@faqir-ui/core@0.2.4/dist/faqir-core.min.js"
        integrity="sha384-…" crossorigin="anonymous" defer></script>
```

Paste it into an empty file, open the file, done — no install, no build step.
The same bytes are three things at once, from one source: the escaped
`<pre><code>` block visible on the page (so it works with JavaScript off, and on
`file://` where there is no clipboard API), the file at
`snippets/<layer>/<name>.html.txt`, and what the button writes to the clipboard.
The tests assert that identity, then assert the payload as a document — it parses
into a real DOM, it depends on nothing relative, and it is clean under the same
document rules the live-example pages are.

`.html.txt`, not `.html`, is deliberate: this is a payload, not a page of the
site. It is the one artifact here that points at a CDN, and keeping it out of the
page classes keeps the site's own claim absolute — **no page the site serves
reaches the network.**

One caveat, stated plainly: `@faqir-ui/core` is **not published to npm yet**
(0.3-02 deliberately built the artifacts without publishing; the publish is
1.0-04). Until it is, those URLs resolve to nothing — the preamble is correct in
form and pinned to the version this repository declares, and it goes live the
moment the package is. The tests assert what can be asserted offline: the URLs,
the exact version pin, and integrity hashes that match the artifacts this
repository builds.

The version and the hashes come from `packages/core/cdn.json`, written by
`bun run build:core-package` beside the `dist/sri.json` it already produced.
It is committed because `packages/core/dist/` is not: the docs build has to emit
`integrity="…"` from a bare checkout, and a hash only means something next to the
exact version it was computed for. **Bump `packages/core/package.json` and you
must rerun that build** — the contract test fails while the two disagree, because
pinning the URL to one release and the integrity to another ships a page the
browser refuses to load.

---

## Hosting

The output is a directory of static files with relative URLs throughout, so any
host works. The repository is configured for Cloudflare Pages:

```bash
bun run deploy:site      # build:docs, then `wrangler pages deploy`
```

`wrangler.toml` supplies the project name and `pages_build_output_dir`, so the
deploy command takes no arguments. Deployment itself is a **human step**: it
needs a Cloudflare account and an interactive `wrangler login` (or a
`CLOUDFLARE_API_TOKEN` in the environment). Wrangler is invoked through `bunx` —
it is not a dependency of this repository.

For any other host, publish `site/dist` and honour `_headers` (Netlify reads the
same file; on other hosts, translate the four content types and the CORS header).

---

## Determinism

The generator has no timestamps and sorts every traversal, so two builds are
byte-identical (asserted). `bun scripts/build-docs.mjs --check` compares an
existing output directory against a fresh generation and exits non-zero when it
is stale — the drift gate a deployment pipeline wants.

---

## Notes for the next session

- Four findings the site surfaced are recorded as follow-ups in `FAQIR-PLAN.md`,
  none a site defect: **0.7-17** (the registry's own reference pages are not clean
  under the per-component audit rules — 365 findings, which also hits `faqir
  audit` in user projects), **0.7-18** (`--color-primary` on `--color-bg-muted` is
  4.41:1 in the default dark scheme, just under AA) and **0.7-19** (`--color-<sem>`
  text on `--color-<sem>-subtle` — what every soft `badge`/`callout` variant
  renders — is below AA in 10 of the 12 themes; found by the gallery frame, the
  first thing in the project to render a component in *every* theme), and
  **0.7-21** (`empty-state` ships in two layers, so `llms-full.txt` has two
  `### empty-state` blocks and the index's `#empty-state` anchor only ever
  reaches the first — a property of the llms format from 0.5-06, which the
  hosted, registry-wide variant made visible).
- The gallery frame shows solid component colour and bare token swatches, not text
  on a tinted `-subtle` surface. That is 0.7-19's doing, not a design preference:
  the badge-variant row belongs in the frame the moment those pairs clear AA.
