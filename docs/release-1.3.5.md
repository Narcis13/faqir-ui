# Faqir UI 1.3.5 — release notes

1.3.5 is the component expansion. Nine components are new — chat, lists, a
composer, a knob, a video player, a lightbox and a compare slider — and seven
grew up: date ranges in the calendar and date-picker, trees, steps and the
wizard, images, and nine more chart kinds. The protocol did not change: no new
attribute, modifier or token. Every addition is a new component, variant value
or part, additive under [`SPEC-1.0.md`](../SPEC-1.0.md) §8, and every 1.3.0 page
still audits clean.

Eight packages ship at 1.3.5, in lockstep: `faqir-ui-cli`, `@faqir-ui/core`,
`@faqir-ui/react`, `@faqir-ui/vue`, `@faqir-ui/forms`, `@faqir-ui/rules`,
`@faqir-ui/template` and `@faqir-ui/mcp`. No package is new on npm.

**Why 1.3.5.** Versions 1.3.1 to 1.3.4 were skipped on purpose, as 1.2.1 to
1.2.4 were. They were never tagged or published.

The item-by-item list is in [`CHANGELOG.md`](../CHANGELOG.md#135).

---

## Upgrading from 1.3.0

There are no markup migrations.

```bash
npm install -g faqir-ui-cli@1.3.5
faqir upgrade          # refresh tokens, base styles, the engine and installed components
```

CDN users move the pin from `@faqir-ui/core@1.3.0` to `@faqir-ui/core@1.3.5`;
the docs site's copy-for-agents snippets carry the new SRI hashes.

Three outputs change under existing markup:

- **Calendar days are grid cells.** Each day button carries `role="gridcell"`,
  so the month grid is clean under live axe. Selectors on `button` still match.
- **The stepper restyles.** The active step gains a halo; a completed or
  failed step draws a tick or an exclamation mark over whatever its indicator
  says (the text stays for screen readers); and a vertical stepper's
  connectors, which collapsed to zero height, now show.
- **A nested chart reads only its own table.** A `chart` inside another table
  used to pick up the outer table's rows too.

**The engine is bigger.** Every recipe controller is inlined into
`faqir-core.js`, so the eight new and upgraded controllers move it from about
47 KB to 64 KB gzip (the strict-CSP build from 52 to 69 KB). `faqir-chart.js`
is opt-in and moves from 4 to 9 KB.

## New

**Conversations.** `chat-message` and `chat-thread` are CSS-only bubbles:
tails on the first of a run, grouping, time and sent/delivered/read ticks,
quotes, reactions, attachments, voice notes, date pills, system lines and a
typing indicator, in a `role="log"` that stays pinned to the newest message.
`composer` grows with its text, sends on Enter (IME-safe) and takes
attachments. The `chat` pattern wires a conversation list to its thread with
one `l-data` scope: two panes on a desktop, one at a time on a phone.

**Lists.** The `list` recipe is rich rows — leading media, title, subtitle and
meta, trailing actions — with sticky section headers, none, single or multi
selection with listbox keys and type-ahead, and reordering by handle or from
the keyboard, announced.

**Controls and media.**

- `knob` is a rotary `role="slider"` over a native range input: pointer drag,
  wheel when focused, Arrow/Page/Home/End, bipolar and angular modes, sizes,
  form reset and `l-model` in both directions.
- `image` gains ratio, fit, focal point, overlay captions and blur or skeleton
  placeholders.
- `lightbox` zooms, pans, steps through a gallery and returns focus; it opens
  from `[data-open]` links outside its root, so thumbnails stay in the flow.
- `image-compare` is a before/after divider driven as a keyboard slider.
- `video-player` puts custom controls over native `<video>` — a scrubber with
  buffered range and hover time, elapsed and duration, volume and mute, rate,
  captions, picture-in-picture, fullscreen and keyboard shortcuts — and keeps
  the native controls when scripting is off.

**Ranges.** `calendar` previews the range under hover or focus, shows one to
three months, takes preset ranges and enforces a minimum and maximum length,
and no range or preset spans a disabled date. `date-picker` gains a range mode
with presets, typed input parsed in the page locale, a clear button and an
inline variant.

**Trees and steps.** `tree-view` gains tri-state checkboxes, lazy children with
loading, failure and retry, type-ahead, a filter that keeps ancestors open and
restores expansion, guide lines and icons, multi-select, and drag-and-drop with
a keyboard path (Alt+Enter to pick up, arrows, Enter or Escape) that announces
every step, keeping full APG tree semantics. `stepper` gains an error state,
optional and status parts and clickable steps; in the `wizard` they are buttons
bound to its step, going back but never past Next.

**Charts.** `faqir-chart.js` draws `area`, `stacked-column`, `stacked-bar`,
`pie`, `donut`, `scatter`, `sparkline`, `radar` and `gauge` — twelve kinds with
column, bar and line, which draw byte for byte as before. All are SVG from the
chart's own data table, in the page locale and the theme's series colours, and
each aria-label reads every value, totals, shares and the gauge range included.

**The showcase.** The docs site's `showcase/` page puts every new and upgraded
component live on one page, each demo copyable, linked from the Foundations
navigation and from a release story on the home page.

## Known limits

Each is also recorded in its component's manifest.

- Status words such as "range start" and "Total" are English.
- `tree-view` drags one item at a time; its pick-up key is Alt+Enter.
- The showcase's demo clip is a 121 KB VP8 file embedded as a data URI, which
  is why the docs site's CSP allows `media-src data:`.
- Calendar arrows are not mirrored in right-to-left pages, and a chart throws on
  `lang=""`. Both predate 1.3.5.
