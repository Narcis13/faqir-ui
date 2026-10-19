# Runtime accent — `data-accent`

`data-accent` gives a page, or any part of it, a brand hue without generating a
theme. It is the fifth sanctioned token modifier (SPEC-1.0 §4): an attribute that
re-declares tokens for a subtree, legal on any element, owned by no manifest. The
implementation is one stylesheet, `registry/tokens/accent.css`, which every token
bundle includes.

```html
<html data-theme="auto" data-accent="violet">
  …
  <section data-accent="pink">…this region in pink…</section>
  <aside data-accent="custom" style="--accent-hue: 200">…any other hue…</aside>
</html>
```

## What it changes

Five tokens — the five `faqir-tweak`'s accent dial writes:

| Token | Re-pointed to |
|-------|---------------|
| `--color-primary` | `oklch(from <theme's --color-primary> l c <hue>)` |
| `--color-primary-hover` | `oklch(from <theme's --color-primary-hover> l c <hue>)` |
| `--color-primary-active` | `oklch(from <theme's --color-primary-active> l c <hue>)` |
| `--color-primary-subtle` | `oklch(from <theme's --color-primary-subtle> l c <hue>)` |
| `--color-ring` | `oklch(from <theme's --color-ring> l c <hue>)` |

Each keeps the lightness and chroma its theme gave it; only the hue moves. A muted
theme stays muted, a pale dark-mode accent stays pale, and a monochrome theme
(`brutalist`, chroma 0) stays monochrome — a hue has nothing to rotate there.
`--color-primary-fg`, the label on a primary button, keeps the theme's ink.

Two aliases that the token layer resolves on `:root` are restated inside the
accent so they follow it: `--focus-ring-color` (from `--color-ring`) and
`--doc-accent`, the one ink a print theme draws in. `--doc-accent` is re-hued
from its own value, so a print theme's darker `@media print` ink keeps its
lightness and takes the accent's hue. `--selection-bg` is deliberately left
alone: two themes point it somewhere other than the subtle fill, and a restated
alias would overrule them.

## The vocabulary

| Value | Hue (OKLCH °) |
|-------|---------------|
| `violet` | 293 |
| `purple` | 304 |
| `fuchsia` | 322 |
| `pink` | 354 |
| `custom` | `--accent-hue` on the same element (degrees or an angle) |

The named hues were chosen by measurement, not taste. Seventeen candidates —
the conventional hue names at the Tailwind v4 palette's 500-step hue — were
re-hued into all 31 shipped themes in light and dark and run through every pair
the `contrast-tokens` audit rule checks: the accent as text on the muted and
subtle plates and on its own subtle fill (WCAG AA, 4.5:1), the primary label on
the primary fill (4.5:1), and the focus ring on every surface (3:1, SC 1.4.11).
Out-of-gamut results were measured twice — clipped per channel, as the gate
does, and chroma-reduced at constant lightness, as CSS Color 4 specifies — so
the result does not depend on how a browser maps a colour sRGB cannot show. A
finding is one theme × scheme × pair below its minimum.

| Candidate | Findings, clip / chroma-reduce | Worst accent on the muted plate, clip / chroma-reduce | Worst theme, light scheme |
|-----------|------------------|------------------|----------------|
| red 25 | 1 / 0 | 4.48 / 4.65 | aurora |
| orange 48 | 0 / 3 | 4.51 / 4.43 | neumorph, memphis |
| amber 70 | 3 / 3 | 4.34 / 4.29 | neumorph, memphis |
| yellow 86 | 5 / 5 | 4.21 / 4.22 | neumorph, memphis |
| lime 131 | 19 / 10 | 3.86 / 4.00 | memphis |
| green 150 | 31 / 17 | 3.56 / 3.92 | memphis |
| emerald 162 | 39 / 14 | 3.37 / 3.95 | memphis |
| teal 183 | 48 / 12 | 3.21 / 3.98 | memphis |
| cyan 215 | 41 / 10 | 3.36 / 4.04 | memphis |
| sky 237 | 24 / 7 | 3.72 / 4.11 | memphis |
| blue 260 | 3 / 3 | 4.34 / 4.34 | neumorph, memphis |
| indigo 277 | 1 / 1 | 4.49 / 4.49 | neumorph |
| **violet 293** | **0 / 0** | 4.59 / 4.59 | neumorph |
| **purple 304** | **0 / 0** | 4.64 / 4.64 | neumorph |
| **fuchsia 322** | **0 / 0** | 4.68 / 4.68 | neumorph |
| **pink 354** | **0 / 0** | 4.61 / 4.69 | aurora |
| rose 16 | 1 / 0 | 4.47 / 4.67 | aurora |

Why so few: OKLCH lightness is perceptual, WCAG luminance is not, and at equal
lightness almost every hue has a higher luminance than the violet-to-pink arc.
The themes that bind (neumorph, memphis, aurora, paper) draw their accent in
that arc and clear AA on the muted plate by a few hundredths in their own hue,
so moving them to a greener or bluer hue drops the accent text below 4.5:1 in the
light scheme. `tests/tokens/forecraft-accent.test.ts` holds every named hue
clean in every theme under both gamut models; adding one is additive under
SPEC-1.0 §8.2 and has to pass the same test.

`custom` is how any other hue is reached, and it is not measured: the theme
cannot know your hue, so the contrast is yours to check. It is a closed value —
the open-ended part is the `--accent-hue` token, and tokens are outside the
freeze (SPEC-1.0 §1.2) — so the attribute's vocabulary stays a closed list. A
`custom` without `--accent-hue`, or a value outside the vocabulary, keeps the hue
it would otherwise have had.

## Where it can go

Anywhere, and it nests — an inner value replaces the outer one for its subtree.
On `<html>` it accents the whole page. Inside a `data-theme` or `data-skin`
island it keeps working: the island's own theme values are re-hued, so a
`data-skin` island keeps its theme's lightness and chroma in the page's accent.

One thing to know: a token cannot read its own value, so `accent.css` first
captures the theme's values on `:root` and on every `data-theme`/`data-skin`
element, and re-points them on the elements below. Where `data-accent` shares an
element with a capture — `<html data-accent>`, or `<div data-theme="dark"
data-accent="pink">` — the accent starts at that element's children, and the
element's own border or fill keeps the theme's accent.

## Fallback

Everything that re-points is inside
`@supports (color: oklch(from light-dark(red, red) l c h))` — relative colour
syntax over a `light-dark()` origin, which is what every one-block theme's
tokens are. A browser without it renders the theme's own accent; the attribute
degrades to a no-op, never to a page without a primary colour.

## In the studio

`l-tweak` has a **Named accent** dial: it writes `data-accent` on `<html>`, puts
it in the comment above `Faqir.tweak.css()`'s export, and clears back to the
page's own value. The other accent dials write `<html>`'s inline tokens, which
are what the accent captures: the chroma dial still scales the result, while the
hue-shift dial is overruled below `<html>`, because a named accent sets the hue
outright rather than shifting it.
