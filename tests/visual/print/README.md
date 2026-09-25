# Print visual regression (task 0.6-10 · FAQIR-PLAN §7.4 / §12)

This suite exercises the real print pipeline for every document reference:

1. Build the production invoice/report scaffold or manifest-declared document
   reference as a self-contained page.
2. Render it to PDF with headless Chromium and authored `@page` rules.
3. Rasterize every physical page to a 96-DPI PNG with `pdftoppm`.
4. Assert the page count, then image-diff every PNG against its baseline.

The current contract is invoice = 2 pages, report = 2 pages, and the document
pattern print reference = 3 pages. The images cover the whole physical sheet,
so repeated headers, footers, margins, and `Page N / M` counters are all part of
the diff.

## Files

| File | Role |
| --- | --- |
| `matrix.ts` | Discovers all `DOCUMENT_SCAFFOLDS` and every registry manifest with `files.print_reference`; assigns explicit expected page counts. |
| `matrix.test.ts` | Fast Bun meta-test proving the generated matrix includes every independent source-of-truth page. |
| `print.pw.ts` | Chromium PDF render, Poppler rasterization, page-count assertions, and PNG image diffs. |
| `../../../playwright.print.config.ts` | Dedicated Chromium runner and strict image threshold. |

## Run locally

Install Poppler (`brew install poppler` on macOS or `apt-get install
poppler-utils` on Ubuntu), then:

```bash
bun test tests/visual/print/matrix.test.ts
npm run test:visual:print:update  # create machine-local baselines
npm run test:visual:print         # compare without changing baselines
```

Local output is useful for iteration only. Font and PDF rasterization differ by
platform, so `tests/visual/print/__screenshots__/` is git-ignored; the
authoritative baselines are the ones produced in the pinned Linux container
(below).

## Bless an intentional print change

There is no CI for this suite: the path-filtered GitHub Actions workflow that
diffed PRs and seeded a baseline cache was removed with the rest of
`.github/workflows/` in `671941e`. It is a manual pre-release step, run locally
(`docs/release-checklist.md`), and `tests/meta/print-visual-paths.test.ts` keeps
the path list that workflow would need.

1. Generate baselines from the commit before the change, in the pinned image
   (below), so every PNG comes from the same rasteriser.
2. Apply the change and run `npm run test:visual:print` in the same image —
   without `--update-snapshots`. Review the expected, actual and diff PNGs plus
   the attached PDFs. Confirm every changed margin, page break, repeated
   header/footer and page number is intentional.
3. Only then regenerate with `npm run test:visual:print:update`. Never update
   snapshots to make a comparison pass.

To reproduce the authoritative generation, use the pinned image:

```bash
docker run --rm -v "$PWD":/work -w /work \
  mcr.microsoft.com/playwright:v1.61.1-noble \
  sh -lc 'apt-get update && apt-get install -y --no-install-recommends poppler-utils && npm install --no-audit --no-fund && npm run test:visual:print:update'
```

## Proving the gate catches geometry changes

The task was verified by changing `--page-margin` in
`registry/tokens/document.css`, running the comparison without snapshot-update
mode, observing PNG diff failures, and reverting the token. This is the print
equivalent of the screen suite's deliberate one-pixel failure check.
