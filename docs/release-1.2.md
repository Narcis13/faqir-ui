# Faqir UI 1.2.0 — release notes

1.2 is the motion-and-content release: eleven CSS-only primitives, eight page
compositions, four seed themes, a choreography token family and a live theme
studio, plus the defects a component-by-component, theme-by-theme sweep in
headless Chrome turned up on the way to the release. The protocol did not change.
Every addition falls under [`SPEC-1.0.md`](../SPEC-1.0.md) §1.2/§8.2, and every
1.1.x page still audits clean.

Seven packages ship at 1.2.0, in lockstep: `faqir-ui-cli`, `@faqir-ui/core`,
`@faqir-ui/react`, `@faqir-ui/vue`, `@faqir-ui/forms`, `@faqir-ui/rules` and
`@faqir-ui/mcp`.

---

## Upgrading from 1.1.x

There are no breaking changes and no markup migrations.

```bash
npm install -g faqir-ui-cli@1.2.0
faqir upgrade          # refresh tokens, base styles, the engine and installed components
faqir audit            # every 1.1.x page still audits clean
```

CDN users move the pin from `@faqir-ui/core@1.1` to `@faqir-ui/core@1.2`; the
docs site's copy-for-agents snippets carry the new SRI hashes.

Three behaviour changes are worth reading before you upgrade:

- **`faqir-validate` sets `novalidate` on its form.** The plugin shows its own
  messages; the browser's bubbles no longer appear for a form with
  `l-validate`, and an invalid submit now reaches the plugin in every browser.
- **`Faqir.validate` follows the last `faqir-validate.js` that loaded.** A page
  that loads the plugin twice (two script tags, or a bundle beside the CDN copy)
  used to keep `Faqir.validate` on the first copy while the `l-validate`
  directive moved to the second, so validators registered through
  `Faqir.validate.register()` were never consulted. Both now belong to the same
  copy. A page that loads it once sees no difference.
- **A toast is never wider than its container.** `max-width` is now
  `min(380px, 100%)`, so on a phone a toast wraps instead of running off the
  screen. Desktop layouts are unchanged.

## New

**Primitives (CSS only).**
`stamp`, `spotlight`, `reveal`, `marquee`, `backdrop`, `glow`, `highlight`,
`quote`, `rating`, `timeline` and `scroll-progress`. Scroll-linked behaviour is
guarded by `@supports` and degrades to content that is simply there; every
entrance and loop stands still under reduced motion and in print.

**Patterns.** `site-header`, `logo-cloud`, `testimonials`, `cta`, `faq`, `bento`,
`article` and `post-list` — compositions of the primitives, no custom JavaScript.

**Properties on existing components (additive).** `card` gains a `media` slot and
`data-hover`; `button` gains `data-effect` (`shine`, `pulse`, `press`, `arrow`,
`sink`); `image` gains `data-hover`; `link` gains `data-effect`; `badge` gains
`data-live`; `text` gains display, eyebrow and drop-cap treatments; `separator`
gains an ornament; `toggle-group` gains a segmented variant; `hero` gains
`--hero-bg`.

**Tokens.** The choreography family: `--motion-reveal-duration/-ease/-distance/
-scale/-blur`, `--motion-stagger`, `--motion-ambient-duration` and
`--motion-ambient-play`, plus `--ease-linear`, `--ease-emphasized`,
`--duration-slowest`, `--card-hover-shadow` and `--card-media-ratio`.

**Engine.** Five more `l-transition` presets: `slide-down`, `slide-start`,
`slide-end`, `blur` and `flip`.

**Themes.** `deco`, `clay`, `memphis` and `monolith`, generated from seeds and
held to the same distinctiveness and contrast gates — 31 themes in all.

**Plugin.** `faqir-tweak`: `<aside l-tweak></aside>` mounts the theme studio's
dials, writes tokens onto `<html>` live, persists them and exports a `:root`
block.

**Docs site.** Every directive, modifier and magic of the engine and of every
official plugin now runs in a live example on the engine page (the plugins ship
under `scripts/plugins/`); every theme card links its specimen sheet; and
`tests/generator/docs-coverage.test.ts` fails the build if a component, theme,
token, directive, modifier, magic, plugin, CLI command or MCP tool is ever left
without a live page or section.

## Fixed

- **`qr-code`** encoded only single-block symbols: the error-correction count was
  divided by the block count (the table is already per block), so any version
  and level with more than one block threw `Invalid array length` and rendered
  nothing — the registry's own high-ECL example among them. Version selection
  also ignored the mode and length header, versions 7–10 carried no version
  information, and the 9-H and 10-H data counts were wrong. The suite now
  decodes every version 1–10 at every level with a reader written from the
  spec, including Reed–Solomon syndromes and the version word.
- **`toast`** overflowed a 375 px screen (bottom-left past the right edge,
  bottom-right off the left).
- **`popover`**'s close button sat on top of the content's text, and every
  popover was squeezed into a 200 px column (it was sized by its trigger-wide
  root); it is now sized by its content, up to 20 rem.
- **`card`**: a title and description written straight into the card — the
  shape the `wizard` pattern and `@faqir-ui/forms` emit for each step — sat
  flush against the border; they now take the header's inset.
- **`separator`**: a labelled dashed or dotted separator drew a 3 px rule over
  its label.
- **Engine — `l-teleport`** bound its subtree twice when the target came later
  in the same scope (one click, two increments).
- **Engine — `l-model` on the `switch` primitive** never wrote back: a
  `<button role="switch">` fires no `change` event. It now toggles on click.
- **`faqir-validate`** did nothing in a real browser unless the form carried
  `novalidate`: native validation cancelled an invalid submit before any submit
  event fired. The directive now sets `novalidate` itself. Also the double-load
  split described above.
- **`faqir-rules`** judged stale data in two cases: a compute reading a field
  that the same edit brought back into view (it came out `NaN` until the next
  keystroke), and the first pass, which ran before the `l-model` bindings inside
  the form had written their values.
- **Docs site**: forced-open overlay previews (`popover`, `tooltip`, menus,
  dialogs) put the panel back in flow without keeping it positioned, so arrows
  and close buttons anchored to the wrong box.

## Development

- `bun.lock` is not committed, and a fresh install gave the MCP SDK its own zod 4
  beside `@faqir-ui/mcp`'s zod 3; `tsc` comparing the two exhausted a 4 GB heap.
  A root `overrides` entry pins one zod for development installs, and
  `bun run typecheck` is back to about ten seconds.
- `tests/core/faqir-validate.test.ts` no longer depends on test-file order.
