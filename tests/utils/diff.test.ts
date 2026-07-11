import { describe, it, expect } from "bun:test";
import { unifiedDiff, diffSummary, diffLines, buildHunks } from "../../src/utils/diff";

describe("unifiedDiff", () => {
  it("returns empty string for identical text", () => {
    const text = "line 1\nline 2\nline 3\n";
    expect(unifiedDiff(text, text)).toBe("");
    expect(diffSummary(text, text)).toEqual({ added: 0, removed: 0, hunks: 0 });
  });

  it("returns empty for two empty strings", () => {
    expect(unifiedDiff("", "")).toBe("");
  });

  it("produces a correct hunk for a single-line modification", () => {
    const before = "a\nb\nc\nd\ne\n";
    const after = "a\nb\nCHANGED\nd\ne\n";
    const out = unifiedDiff(before, after, { oldLabel: "a/x", newLabel: "b/x" });

    expect(out).toContain("--- a/x");
    expect(out).toContain("+++ b/x");
    expect(out).toContain("@@");
    expect(out).toContain("-c");
    expect(out).toContain("+CHANGED");
    // context lines are prefixed with a space
    expect(out).toContain(" b");
    expect(out).toContain(" d");

    const stats = diffSummary(before, after);
    expect(stats).toEqual({ added: 1, removed: 1, hunks: 1 });
  });

  it("counts pure additions and pure removals", () => {
    const before = "one\ntwo\n";
    const after = "one\ntwo\nthree\nfour\n";
    expect(diffSummary(before, after)).toEqual({ added: 2, removed: 0, hunks: 1 });
    expect(diffSummary(after, before)).toEqual({ added: 0, removed: 2, hunks: 1 });
  });

  it("labels a whole-file add against /dev/null", () => {
    const out = unifiedDiff("", "new content\n", { oldLabel: "a/f", newLabel: "b/f" });
    expect(out).toContain("--- /dev/null");
    expect(out).toContain("+++ b/f");
    expect(out).toContain("+new content");
  });

  it("labels a whole-file removal against /dev/null", () => {
    const out = unifiedDiff("gone\n", "", { oldLabel: "a/f", newLabel: "b/f" });
    expect(out).toContain("--- a/f");
    expect(out).toContain("+++ /dev/null");
    expect(out).toContain("-gone");
  });

  it("splits distant changes into separate hunks and merges close ones", () => {
    const before = Array.from({ length: 20 }, (_, i) => `l${i}`).join("\n") + "\n";
    // change line 1 and line 18 — far apart → two hunks
    const linesArr = before.split("\n");
    linesArr[1] = "CHANGED-A";
    linesArr[18] = "CHANGED-B";
    const after = linesArr.join("\n");
    expect(diffSummary(before, after).hunks).toBe(2);

    // change two adjacent lines → one hunk
    const linesArr2 = before.split("\n");
    linesArr2[5] = "X";
    linesArr2[6] = "Y";
    const after2 = linesArr2.join("\n");
    expect(diffSummary(before, after2).hunks).toBe(1);
  });

  it("hunk header line numbers are 1-based and correct", () => {
    const before = "a\nb\nc\n";
    const after = "a\nB\nc\n";
    const hunks = buildHunks(diffLines(["a", "b", "c"], ["a", "B", "c"]), 3);
    expect(hunks.length).toBe(1);
    expect(hunks[0].oldStart).toBe(1);
    expect(hunks[0].newStart).toBe(1);
    // sanity: the rendered header reflects the full 3-line window
    expect(unifiedDiff(before, after)).toContain("@@ -1,3 +1,3 @@");
  });
});
