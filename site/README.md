# `site/` — the Faqir documentation site

A Faqir project with no build step at runtime. Two files here are hand-written;
everything else is generated from the registry manifests.

```bash
bun run build:docs          # → site/dist  (git-ignored)
bunx serve site/dist        # any static server will do
```

| File | What it is |
|---|---|
| `site.config.json` | Title, tagline, description, theme, footer. |
| `content/home.html` | The only hand-written page content on the site. Audited like every generated page: registry components and design tokens only, no `class` attributes, no hardcoded values. |

Adding a component to `registry/` adds its documentation page, its navigation
entry, its live example and its CSS **without touching anything in this
directory**. If you find yourself editing `site/` to describe a component, the
manifest is the place to put it instead.

Full reference: [`docs/docs-site.md`](../docs/docs-site.md).
