# Changelog

All seven packages (`faqir-ui-cli`, `@faqir-ui/core`, `@faqir-ui/react`,
`@faqir-ui/vue`, `@faqir-ui/forms`, `@faqir-ui/rules`, `@faqir-ui/mcp`) are
versioned in lockstep. The protocol is frozen at [`SPEC-1.0.md`](SPEC-1.0.md);
every release below is additive under its §8 unless it says otherwise.

## 1.2.0

Motion, content and the theme studio. Full notes: [`docs/release-1.2.md`](docs/release-1.2.md).

**Upgrading from 1.1.x:** no breaking changes, no markup migrations. Run
`faqir upgrade`, then `faqir audit`; CDN users move `@faqir-ui/core@1.1` to `@1.2`.
Read the two behaviour changes first: `Faqir.validate` now follows the last copy
of `faqir-validate.js` loaded, and a toast is never wider than its container.

- **Added** — primitives `stamp`, `spotlight`, `reveal`, `marquee`, `backdrop`,
  `glow`, `highlight`, `quote`, `rating`, `timeline`, `scroll-progress`;
  patterns `site-header`, `logo-cloud`, `testimonials`, `cta`, `faq`, `bento`,
  `article`, `post-list`; themes `deco`, `clay`, `memphis`, `monolith`; the
  `faqir-tweak` theme-studio plugin; the choreography token family; five
  `l-transition` presets; effect and hover properties on `card`, `button`,
  `image`, `link`, `badge`, `text`, `separator` and `toggle-group`.
- **Fixed** — `qr-code` multi-block symbols, version selection and version
  information; `toast` overflow on phones; `popover` close button over text;
  `faqir-validate` loaded twice; docs-site overlay previews.
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
