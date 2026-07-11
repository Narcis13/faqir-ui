import { describe, it, expect } from "bun:test";
import { merge3, mergeFile } from "../../src/utils/merge";

describe("merge3 — line-level three-way merge", () => {
  it("identical inputs are a byte-exact no-op", () => {
    const t = "a\nb\nc\n";
    const r = merge3(t, t, t);
    expect(r.clean).toBe(true);
    expect(r.text).toBe(t);
    expect(r.conflicts).toBe(0);
  });

  it("user-unchanged fast-forwards to theirs", () => {
    const base = "a\nb\nc\n";
    const ours = "a\nb\nc\n"; // untouched
    const theirs = "a\nB\nc\nd\n"; // registry changed line 2 + appended
    const r = merge3(base, ours, theirs);
    expect(r.clean).toBe(true);
    expect(r.text).toBe(theirs);
  });

  it("registry-unchanged keeps ours", () => {
    const base = "a\nb\nc\n";
    const ours = "a\nb\nc\nmine\n";
    const theirs = "a\nb\nc\n";
    const r = merge3(base, ours, theirs);
    expect(r.clean).toBe(true);
    expect(r.text).toBe(ours);
  });

  it("non-overlapping edits apply both sides", () => {
    // ours edits the top; theirs edits the bottom — no overlap.
    const base = "one\ntwo\nthree\nfour\nfive\n";
    const ours = "ONE\ntwo\nthree\nfour\nfive\n";
    const theirs = "one\ntwo\nthree\nfour\nFIVE\n";
    const r = merge3(base, ours, theirs);
    expect(r.clean).toBe(true);
    expect(r.text).toBe("ONE\ntwo\nthree\nfour\nFIVE\n");
    expect(r.conflicts).toBe(0);
  });

  it("both sides making the identical change do not conflict", () => {
    const base = "a\nb\nc\n";
    const same = "a\nB\nc\n";
    const r = merge3(base, same, same);
    expect(r.clean).toBe(true);
    expect(r.text).toBe(same);
  });

  it("overlapping edits produce git diff3 conflict markers with correct sides", () => {
    const base = "a\nb\nc\n";
    const ours = "a\nOURS\nc\n";
    const theirs = "a\nTHEIRS\nc\n";
    const r = merge3(base, ours, theirs, {
      oursLabel: "ours",
      baseLabel: "base",
      theirsLabel: "theirs",
    });
    expect(r.clean).toBe(false);
    expect(r.conflicts).toBe(1);
    // Standard git-style markers, in order.
    const ci = r.text.indexOf("<<<<<<< ours");
    const bi = r.text.indexOf("||||||| base");
    const si = r.text.indexOf("=======");
    const ti = r.text.indexOf(">>>>>>> theirs");
    expect(ci).toBeGreaterThanOrEqual(0);
    expect(bi).toBeGreaterThan(ci);
    expect(si).toBeGreaterThan(bi);
    expect(ti).toBeGreaterThan(si);
    // Correct ours / base / theirs content between the markers.
    expect(r.text).toContain("<<<<<<< ours\nOURS\n");
    expect(r.text).toContain("||||||| base\nb\n");
    expect(r.text).toContain("=======\nTHEIRS\n");
    // Unchanged context survives outside the conflict.
    expect(r.text.startsWith("a\n")).toBe(true);
    expect(r.text.endsWith("c\n")).toBe(true);
  });

  it("includeBase:false emits the terse two-way marker style", () => {
    const r = merge3("a\nb\nc\n", "a\nX\nc\n", "a\nY\nc\n", { includeBase: false });
    expect(r.clean).toBe(false);
    expect(r.text).not.toContain("|||||||");
    expect(r.text).toContain("<<<<<<<");
    expect(r.text).toContain(">>>>>>>");
  });

  it("preserves a missing final newline on a clean merge", () => {
    const base = "a\nb";
    const ours = "a\nb"; // untouched, no trailing newline
    const theirs = "a\nB"; // registry changed last line, still no newline
    const r = merge3(base, ours, theirs);
    expect(r.clean).toBe(true);
    expect(r.text).toBe("a\nB");
  });

  it("never drops content — every conflict side is recoverable", () => {
    const base = "x\n";
    const ours = "OURS-ONLY\n";
    const theirs = "THEIRS-ONLY\n";
    const r = merge3(base, ours, theirs);
    expect(r.text).toContain("OURS-ONLY");
    expect(r.text).toContain("THEIRS-ONLY");
  });
});

describe("mergeFile — file-level merge matrix", () => {
  const M = (base: string | null, ours: string | null, theirs: string | null) =>
    mergeFile({ path: "f.css", base, ours, theirs });

  it("user-unchanged file → updated to theirs (fast-forward)", () => {
    const o = M("a\n", "a\n", "a\nb\n");
    expect(o.status).toBe("updated");
    expect(o.action).toBe("write");
    expect(o.content).toBe("a\nb\n");
  });

  it("registry-unchanged, user-edited → unchanged (keep ours, no write)", () => {
    const o = M("a\n", "a\nmine\n", "a\n");
    expect(o.status).toBe("unchanged");
    expect(o.action).toBe("none");
  });

  it("non-overlapping edits → clean updated content", () => {
    const o = M("1\n2\n3\n", "X\n2\n3\n", "1\n2\nY\n");
    expect(o.status).toBe("updated");
    expect(o.action).toBe("write");
    expect(o.content).toBe("X\n2\nY\n");
    expect(o.conflicts).toBe(0);
  });

  it("overlapping edits → conflict with markers written", () => {
    const o = M("a\nb\nc\n", "a\nOURS\nc\n", "a\nTHEIRS\nc\n");
    expect(o.status).toBe("conflict");
    expect(o.action).toBe("write");
    expect(o.conflicts).toBe(1);
    expect(o.content).toContain("<<<<<<<");
    expect(o.content).toContain("OURS");
    expect(o.content).toContain("THEIRS");
  });

  it("brand-new registry file → added", () => {
    const o = M(null, null, "new\n");
    expect(o.status).toBe("added");
    expect(o.action).toBe("write");
    expect(o.content).toBe("new\n");
  });

  it("registry-deleted file, user untouched → deleted", () => {
    const o = M("gone\n", "gone\n", null);
    expect(o.status).toBe("deleted");
    expect(o.action).toBe("delete");
  });

  it("registry-deleted file, user edited → modify/delete conflict keeps ours", () => {
    const o = M("gone\n", "gone\nmine\n", null);
    expect(o.status).toBe("conflict");
    expect(o.action).toBe("none"); // ours is left verbatim on disk — no data loss
    expect(o.note).toContain("modify/delete");
  });

  it("user-deleted file, registry untouched → deletion respected", () => {
    const o = M("gone\n", null, "gone\n");
    expect(o.status).toBe("deleted");
    expect(o.action).toBe("none"); // already absent
  });

  it("user-deleted file, registry changed it → delete/modify conflict restores it", () => {
    const o = M("gone\n", null, "gone-but-changed\n");
    expect(o.status).toBe("conflict");
    expect(o.action).toBe("write");
    expect(o.content).toContain("gone-but-changed"); // registry content is recoverable
    expect(o.note).toContain("delete/modify");
  });

  it("add/add with identical content → unchanged", () => {
    const o = M(null, "same\n", "same\n");
    expect(o.status).toBe("unchanged");
    expect(o.action).toBe("none");
  });

  it("add/add with different content → conflict", () => {
    const o = M(null, "mine\n", "theirs\n");
    expect(o.status).toBe("conflict");
    expect(o.content).toContain("mine");
    expect(o.content).toContain("theirs");
  });

  it("a user-only file the registry never had → left untouched", () => {
    const o = M(null, "local\n", null);
    expect(o.status).toBe("unchanged");
    expect(o.action).toBe("none");
  });
});
