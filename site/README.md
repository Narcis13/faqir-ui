# `site/` — the Faqir documentation showroom

A polished Faqir project with no runtime build step. The marketing narrative and
responsive layout lab are hand-written; component facts, counts, examples,
themes, tokens, icon and typography specimens, agent files, publishing metadata,
and navigation are generated from registry manifests and token sources.

```bash
bun run build:docs          # → site/dist  (git-ignored)
bunx serve site/dist        # any static server will do
bun run deploy:site         # build, then `wrangler pages deploy` (needs a login)
```

| File | What it is |
|---|---|
| `site.config.json` | Title, tagline, description, canonical public URL, initial theme, footer. |
| `content/home.html` | Hand-written homepage narrative and showroom sections. Registry stats, featured patterns, and theme controls are injected by the generator. |
| `content/layouts.html` | Hand-written responsive layout lab for cluster, switcher, grid, and the canonical breakpoint ladder. |
| `content/spacing.html` | Spacing/rhythm doctrine and audited example templates; the generator injects the complete token ladders. |
| `content/density.html` | Density, nesting/reset guidance, and audited example templates; the generator injects the scoped remap table. |
| `content/messages.json` | Static same-origin data for the source-bound inbox demo. |
| `styles/docs.css` | The docs presentation layer: attribute selectors and design tokens only, with responsive and reduced-motion rules. |
| `lib/gallery.js` | Shared progressive enhancement: persistent theme/mode controls, frame synchronization, mobile navigation, component/icon filters, icon copying, and preview widths. |
| `lib/playground.js` | Browser audit playground wiring and live preview synchronization. |
| `lib/copy-snippet.js` | Copy-for-agents wiring. |
| `lib/faqir-audit.js` | Generated browser audit engine; regenerate with `bun run build:audit-browser`. |

Adding a component to `registry/` adds its documentation page, its navigation
entry, searchable catalogue card, live example, agent snippet, and CSS **without
touching this directory**. If you are editing `site/` to describe one component,
the manifest is the source of truth instead.

The generated output also includes a manifest-derived 120-icon browser, a
typography reference driven by `registry/tokens/typography.css`, `404.html`,
canonical metadata, `robots.txt`, `sitemap.xml`, a static `/api/messages` demo
response, and a static-host security baseline in `_headers`.

Full reference: [`docs/docs-site.md`](../docs/docs-site.md).
