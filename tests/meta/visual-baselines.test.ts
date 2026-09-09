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

import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const WORKFLOW = readFileSync(join(ROOT, ".github", "workflows", "visual.yml"), "utf8");
const GITIGNORE = readFileSync(join(ROOT, ".gitignore"), "utf8");

/** The step names, in file order — enough to assert what happens before what. */
const STEPS = [...WORKFLOW.matchAll(/^\s*- name: (.+)$/gm)].map((m) => m[1].trim());

const indexOfStep = (fragment: string) =>
  STEPS.findIndex((name) => name.toLowerCase().includes(fragment.toLowerCase()));

describe("visual baselines", () => {
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
