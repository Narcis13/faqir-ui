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
| `content/home.html` | Hand-written homepage: hero and live specimen, the 1.1 release story, the agent loop, the site map and quick start. The theme runway and its spec plate, the numbers row and the scaffold frames are injected at markers. |
| `content/responsive.html` | Hand-written responsive layout lab for cluster, switcher, grid, and the canonical breakpoint ladder. |
| `content/engine.html` | Hand-written reactive-engine guide; the vocabulary tables are inserted at markers, read out of the engine itself. |
| `styles/pages/*.css` | One presentation sheet per 1.1 section (audit, rules, tooling, night-shift, themes), concatenated after `docs.css`. |
| `content/spacing.html` | Spacing/rhythm doctrine and audited example templates; the generator injects the complete token ladders. |
| `content/density.html` | Density, nesting/reset guidance, and audited example templates; the generator injects the scoped remap table. |
| `content/messages.json` | Static same-origin data for the source-bound inbox demo. |
| `styles/docs.css` | The docs presentation layer: attribute selectors and design tokens only, with responsive and reduced-motion rules. |
| `lib/gallery.js` | Shared progressive enhancement: persistent theme/mode controls, the home page's spec plate, frame synchronization, mobile navigation, component/icon filters, icon copying, and preview widths. |
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

The 1.1 sections (audit rules, rules & validation, CLI reference, integrations,
Night Shift, the fourteen axes, theme authoring and one specimen sheet per
theme) are rendered by the modules under `src/generator/docs-pages/`, each from
its own source of truth: the audit engine's rule lists, the rules package and
its schema, the command registry and the live MCP server, the Night Shift docs
and ledger, and the theme manifests and seeds.

Full reference: [`docs/docs-site.md`](../docs/docs-site.md).
