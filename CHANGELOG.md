# Changelog

All eight packages (`faqir-ui-cli`, `@faqir-ui/core`, `@faqir-ui/react`,
`@faqir-ui/vue`, `@faqir-ui/forms`, `@faqir-ui/rules`, `@faqir-ui/template`,
`@faqir-ui/mcp`) are versioned in lockstep. The protocol is frozen at [`SPEC-1.0.md`](SPEC-1.0.md);
every release below is additive under its §8 unless it says otherwise.

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
