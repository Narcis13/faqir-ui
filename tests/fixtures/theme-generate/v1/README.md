# `theme generate` golden output, captured from v1.0.0

Every `*.css` here was produced by the **v1.0.0 generator**, not by today's one.
They were captured by extracting the tagged tree (`git archive v1.0.0`) into a
scratch directory and running `generateThemeBundle` from it against that tree's
own `registry/tokens/*.css` — the tag is `c2fc2d7`.

`cases.json` is the input list, shared by the capture and by
`tests/commands/theme-generate.test.ts`. Each entry's `input` is a **1.0-era**
input — `{ name, accent, neutral, radius, scheme, document }` and nothing else —
because that is exactly what the golden is protecting: a project that has been
running `faqir theme generate` since 1.0 must keep getting the same colours out
of 1.1's seed-driven generator.

The comparison is on **colour declarations only** (`--palette-*`, `--color-*`),
per scheme block. Everything else moved on purpose in 1.1A-10: the type ramp,
the shadow ramp's spelling, the silhouette tokens and the axis families are all
new, and a 1.0 theme simply did not state them.

Colour identity holds byte-for-byte with **one enumerated exception**, listed
declaration by declaration in the test: 1.1A-10 floors a tinted neutral's chroma
at `NEUTRAL_TINT_MIN_CHROMA`, because at 1.0's per-step scale factors a
`cool`/`warm` page landed at 0.0015 chroma — below `axesFromCss`'s own line for
"achromatic", so `--neutral cool` produced a page the classifier called gray and
was right to. Six declarations per cool/warm theme move; a `gray` theme is
untouched. The test names each one with its 1.0 value and its 1.1 value, so the
gate fails in both directions.

To re-capture (only if a case is added — never to paper over a diff):

    git archive v1.0.0 | tar -x -C <scratch>
    cp tests/fixtures/theme-generate/v1/cases.json <scratch>/cases.json
    # a six-line script that reads cases.json, calls generateThemeBundle from
    # <scratch>/src/commands/theme-generate.ts, and writes <id>.<kind>.css
