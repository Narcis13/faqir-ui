// ═══════════════════════════════════════════════════════════════════════════
// The print job's path filter must cover what the print job renders  [W3-5]
// ═══════════════════════════════════════════════════════════════════════════
//
// `.github/workflows/print-visual.yml` runs only when a PR touches one of a
// HAND-MAINTAINED list of registry paths, while its baseline cache key hashes
// all of `registry/**`. The two disagree by construction, and the disagreement
// is silent in the worst direction: add a component to a document scaffold and
// the print job stops running on the PR that breaks it — then, on merge to
// `main`, the changed hash re-blesses the baseline, absorbing the regression as
// the new truth. The list is complete today; nothing was holding it there.
//
// This is that hold. The required set is DERIVED from `DOCUMENT_SCAFFOLDS` —
// the same declaration the print pages are built from — so a component added to
// a scaffold fails here with the exact line to add.

import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DOCUMENT_SCAFFOLDS } from "../../src/scaffolds/documents";
import { discoverRegistryPrintReferences } from "../visual/print/matrix";

// Dormant while there is no CI: `671941e` removed every workflow, and this file
// holds one of them to its own contract. It wakes up by itself if the workflow
// returns. See the same note in `visual-baselines.test.ts`.

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const WORKFLOW = join(ROOT, ".github", "workflows", "print-visual.yml");
const REGISTRY = join(ROOT, "registry");
const HAS_CI = existsSync(WORKFLOW);

const source = HAS_CI ? readFileSync(WORKFLOW, "utf8") : "";

/**
 * Every `paths:` block in the workflow, as a list of globs.
 *
 * Deliberately a small scanner rather than a YAML dependency: the file's shape
 * is two `paths:` keys whose members are `      - "…"` lines, and a parser that
 * understands only that cannot drift into understanding something else.
 */
function pathBlocks(yaml: string): string[][] {
  const blocks: string[][] = [];
  const lines = yaml.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*paths:\s*$/.test(lines[i])) continue;
    const globs: string[] = [];
    for (let j = i + 1; j < lines.length; j++) {
      const m = /^\s*-\s*"?([^"\s]+)"?\s*$/.exec(lines[j]);
      if (!m) break;
      globs.push(m[1]);
    }
    blocks.push(globs);
  }
  return blocks;
}

/** Which registry layer a component's directory lives in. */
function layerOf(name: string): string {
  for (const layer of ["primitives", "recipes", "patterns"]) {
    if (existsSync(join(REGISTRY, layer, name))) return layer;
  }
  throw new Error(`no registry directory for scaffold component "${name}"`);
}

/**
 * Everything the print job renders: the components and patterns a document
 * scaffold composes, plus every manifest that opts in with `files.print_reference`
 * — the two sources `tests/visual/print/matrix.ts` builds its cases from.
 */
const RENDERED = [
  ...new Set([
    ...Object.values(DOCUMENT_SCAFFOLDS).flatMap((d) => [...d.components, ...d.patterns]),
    ...discoverRegistryPrintReferences().map((r) => r.name),
  ]),
].sort();

const REQUIRED = RENDERED.map((name) => `registry/${layerOf(name)}/${name}/**`);

/**
 * Watched by the workflow, rendered by no print case — deliberately, and each
 * with a reason.
 *
 * Both are print-first components that simply have no print reference of their
 * own yet: nothing drives them through the PDF path, so a change to either
 * cannot move a baseline today. They stay in the filter because the moment one
 * gains a reference (or joins a scaffold) the job must already be running for
 * it — and because a PR-triggered run for a component nobody renders costs one
 * job, while the reverse mistake costs a regression absorbed as the new truth.
 */
const WATCHED_WITHOUT_A_PAGE = [
  "registry/primitives/watermark/**",
  "registry/recipes/barcode/**",
];

describe.skipIf(HAS_CI)("print regression, with no CI to run it", () => {
  it("is carried as a manual pre-release step in the checklist", () => {
    const checklist = readFileSync(join(ROOT, "docs", "release-checklist.md"), "utf8");
    expect(checklist).toContain("bun run test:visual:print");
  });

  it("still knows what the print job would have had to cover", () => {
    // The derivation survives the workflow's deletion, so whoever restores CI
    // gets the required path list rather than the hand-maintained one that was
    // wrong by construction.
    expect(REQUIRED.length).toBeGreaterThan(10);
  });
});

describe.skipIf(!HAS_CI)("print-visual workflow path filter", () => {
  const blocks = pathBlocks(source);

  it("has both a pull_request and a push filter", () => {
    expect(blocks.length).toBe(2);
    for (const block of blocks) expect(block.length).toBeGreaterThan(10);
  });

  it("the two filters are identical", () => {
    // A PR gate and a merge gate that disagree is the same defect in slow
    // motion: one of them stops running and the other re-baselines.
    expect(blocks[0]).toEqual(blocks[1]);
  });

  it("covers every component a document scaffold renders", () => {
    for (const block of blocks) {
      const missing = REQUIRED.filter((glob) => !block.includes(glob));
      expect(
        missing,
        `print-visual.yml would not run for these — add them to BOTH paths: blocks:\n` +
          missing.map((m) => `      - "${m}"`).join("\n"),
      ).toEqual([]);
    }
  });

  it("names no component beyond what it renders, except by declaration", () => {
    // The other direction. A filter that has grown stale runs the job for
    // changes that cannot affect it, which trains everyone to ignore the job —
    // so every watched component is either rendered by a print case or named
    // below with a reason. An exemption that has to be written down is a
    // decision; one that is simply tolerated is an accident.
    const componentGlobs = blocks[0].filter((g) =>
      /^registry\/(primitives|recipes|patterns)\/[^/]+\/\*\*$/.test(g),
    );
    expect(componentGlobs.sort()).toEqual([...REQUIRED, ...WATCHED_WITHOUT_A_PAGE].sort());
  });

  it("watches the document themes and the shared layers the pages also load", () => {
    // These are not components, so they are not derivable from the scaffolds —
    // but a page that renders through them regresses just as easily.
    for (const block of blocks) {
      for (const glob of [
        "registry/base/**",
        "registry/tokens/**",
        "registry/themes/document.css",
        "registry/themes/document-serif.css",
        "registry/core/**",
        "src/scaffolds/documents.ts",
      ]) {
        expect(block, `print-visual.yml stopped watching ${glob}`).toContain(glob);
      }
    }
  });
});
