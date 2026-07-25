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
| `site/content/home.html` | you | The only hand-written page content on the site. |
| `scripts/build-docs.mjs` | — | The writer: builds in memory, clears `site/dist`, writes. |
| `src/generator/docs.ts` | — | The generator. Pure, `node:fs` only, zero dependencies. |
| `site/dist/**` | generated | The static site. Git-ignored — rebuild, never commit. |

Output shape:

```text
index.html                        home (authored fragment + registry stats)
components/index.html             every component, grouped by layer
components/<layer>/<name>.html    one page per component
tokens/index.html                 token reference, grouped by token file
examples/<layer>/<name>.html      one standalone live example per component
styles/faqir.css                  tokens + base + theme + every component CSS
scripts/faqir-core.js             the registry engine (example pages only)
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

**Site pages** (home, component index, component pages, token reference) are
authored by the generator out of registry components and design tokens only. They
carry **no `class` attribute, no hardcoded colour, and no CSS of their own**, and
they are held to:

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

---

## Determinism

The generator has no timestamps and sorts every traversal, so two builds are
byte-identical (asserted). `bun scripts/build-docs.mjs --check` compares an
existing output directory against a fresh generation and exits non-zero when it
is stale — the drift gate a deployment pipeline wants.

---

## Notes for the next session

- The site bundles one theme (`site.config.json` → `theme`). The theme gallery
  and the in-browser audit playground are task 0.7-14.
- `llms.txt`, hosted schema/registry artifacts and copy-for-agents are task
  0.7-15.
- Two findings the site surfaced are recorded as follow-ups in `FAQIR-PLAN.md`,
  neither a site defect: **0.7-17** (the registry's own reference pages are not
  clean under the per-component audit rules — 365 findings, which also hits
  `faqir audit` in user projects) and **0.7-18** (`--color-primary` on
  `--color-bg-muted` is 4.41:1 in the default dark scheme, just under AA).
