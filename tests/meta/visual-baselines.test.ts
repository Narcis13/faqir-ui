// ═══════════════════════════════════════════════════════════════════════════
// The visual gate must diff before it re-baselines  [W3-5]
// ═══════════════════════════════════════════════════════════════════════════
//
// Visual baselines are not committed, and deliberately so: they are produced in
// a pinned Linux container because font rasterisation differs between machines,
// and §12.2 rejects thousands of PNGs in git. The consequence is that the ONLY
// thing standing between a regression and the baseline set is what the workflow
// does on a push to `main` — and what it did was `--update-snapshots`, with no
// comparison of any kind. A change that reached `main` outside a PR became the
// new truth silently, and every later PR diffed against it.
//
// The PR path has its own version of the same hole: `restore-keys` falls back to
// an older baseline set precisely when this PR changed the render inputs, so a
// green shard can mean "identical to an older render" rather than "identical".
//
// Neither is a code path a test can execute, so this pins the workflow itself.
// A YAML gate is a blunt instrument; it is also the only instrument, and the
// invariant it holds is one sentence long: nothing writes a baseline without
// first comparing to one, and a stale comparison says so.

// ── Dormant while there is no CI ────────────────────────────────────────────
//
// `671941e` removed every workflow (no Actions minutes on the free plan), which
// removed the gate this file holds along with it. Deleting the file was the
// alternative and it is worse: the invariant below is the reason the workflow
// was written the way it was, and it would have to be rediscovered the day CI
// returns. So the suite goes dormant instead — it wakes up by itself the moment
// `.github/workflows/visual.yml` exists again.
//
// What replaces it in the meantime is not another gate. It is a line in
// `docs/release-checklist.md` saying a human runs the visual suite before a
// release, and the case below holds that line in place — because a manual step
// nobody wrote down is not a manual step, it is a gap.

import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const WORKFLOW_PATH = join(ROOT, ".github", "workflows", "visual.yml");
const HAS_CI = existsSync(WORKFLOW_PATH);
const WORKFLOW = HAS_CI ? readFileSync(WORKFLOW_PATH, "utf8") : "";
const GITIGNORE = readFileSync(join(ROOT, ".gitignore"), "utf8");
const CHECKLIST = readFileSync(join(ROOT, "docs", "release-checklist.md"), "utf8");

describe.skipIf(HAS_CI)("visual regression, with no CI to run it", () => {
  it("is carried as a manual pre-release step in the checklist", () => {
    expect(CHECKLIST).toContain("bun run test:visual");
    expect(CHECKLIST).toContain("There is no CI");
  });

  it("the checklist warns against blessing baselines to go green", () => {
    // The failure mode the deleted workflow existed to prevent, restated for a
    // human: `--update-snapshots` makes any regression the new truth, and it is
    // now one keystroke away with nothing between it and the release.
    // Whitespace-normalised: the sentence wraps in the source, and a gate that
    // breaks on reflowing a paragraph teaches people to stop editing the prose.
    const flat = CHECKLIST.toLowerCase().replace(/\s+/g, " ");
    expect(flat).toContain("never run an `:update` variant");
  });
});

/** The step names, in file order — enough to assert what happens before what. */
const STEPS = [...WORKFLOW.matchAll(/^\s*- name: (.+)$/gm)].map((m) => m[1].trim());

const indexOfStep = (fragment: string) =>
  STEPS.findIndex((name) => name.toLowerCase().includes(fragment.toLowerCase()));

describe.skipIf(!HAS_CI)("visual baselines", () => {
  it("are still cache-borne, not committed", () => {
    // If this ever changes, the rest of this file is describing a gate that no
    // longer exists — the invariant would be "the committed PNGs are current".
    expect(GITIGNORE).toContain("tests/visual/__screenshots__/");
  });

  it("the baseline job diffs before it writes", () => {
    const diff = indexOfStep("Diff against the previous baselines");
    const write = indexOfStep("Generate baselines");
    expect(diff, "the baseline job has no diff step").toBeGreaterThanOrEqual(0);
    expect(write).toBeGreaterThanOrEqual(0);
    expect(diff, "the diff must run BEFORE the re-baseline, or it proves nothing").toBeLessThan(write);
  });

  it("the diff runs the suite in comparison mode, not update mode", () => {
    const diffStep = WORKFLOW.slice(
      WORKFLOW.indexOf("- name: Diff against the previous baselines"),
      WORKFLOW.indexOf("- name: Upload the diff report"),
    );
    expect(diffStep).toContain("npx playwright test");
    expect(diffStep, "a diff that passes --update-snapshots is not a diff").not.toContain(
      "--update-snapshots",
    );
  });

  it("re-baselining without a diff is explicit, not the default", () => {
    // The escape hatch exists — an intended visual change has to land somehow —
    // but it is a thing somebody types, not a thing that happens.
    expect(WORKFLOW).toContain("[visual-baseline]");
    expect(WORKFLOW).toContain("blessed=");
  });

  it("the PR job reports when it is diffing against a stale set", () => {
    expect(indexOfStep("Report a stale baseline set")).toBeGreaterThanOrEqual(0);
    expect(WORKFLOW).toContain("cache-matched-key");
    expect(WORKFLOW).toContain("GITHUB_STEP_SUMMARY");
  });

  it("passes untrusted text through env, never into a shell line", () => {
    // A commit message is attacker-controlled. Interpolating one into `run:`
    // executes it.
    const runLines = WORKFLOW.split("\n").filter((l) => /^\s*run: .*\$\{\{/.test(l));
    for (const line of runLines) {
      expect(line, `untrusted interpolation in a run: line — ${line.trim()}`).toMatch(
        /\$\{\{\s*matrix\./,
      );
    }
    expect(WORKFLOW).not.toContain('"${{ github.event.head_commit.message }}"');
  });
});
