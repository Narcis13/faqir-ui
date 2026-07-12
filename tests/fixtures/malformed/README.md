# Malformed HTML corpus (task 0.5-09)

Regression corpus for the HTML parser fuzzer. Every file here is fed to
`checkInvariants` by `tests/parser/fuzz/corpus.test.ts`; the parser must handle
all of them without throwing, hanging, or emitting an out-of-bounds node range.

**Every past crasher becomes a fixture** — files ending in `.crasher.html` are
inputs that once broke the parser and are pinned so the bug can never silently
return. When the fuzzer (`bun run fuzz:parser`) finds a new crasher, save the
reproducing input here with a `.crasher.html` suffix in the same session you fix
the bug.

## Pinned crashers

| Fixture | Bug | Fix |
|---------|-----|-----|
| `deep-nesting-plain.crasher.html` | ~50k nested tags overflowed the call stack in the recursive tree walkers (`parseDocument`, `findByAttr`, `findDescendantsByAttr`). | Walkers made iterative (explicit stack). |
| `deep-nesting-components.crasher.html` | Deeply nested `data-ui` components made `extractComponents` O(n²) (per-component subtree rescans + per-component `countLines`) — a ~27s hang at 50k. | Single O(n) pass; component line reuses the tokenizer's precomputed `el.line`. |

## Other cases

Truncated tags, interleaved/mismatched quotes, NUL and C0 control bytes,
unterminated comments and raw-text (`<script>`/`<style>`) elements, bogus/abrupt
comments, nameless/stray `<`, mixed encodings (BOM, multibyte, combining marks),
and a 64 KiB single attribute. These exercise the tokenizer's edge states without
depending on any particular tree shape.
