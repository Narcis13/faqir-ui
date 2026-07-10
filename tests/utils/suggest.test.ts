// Shared typo-suggestion util (src/utils/suggest.ts) — the single "did you
// mean …" implementation behind the CLI dispatcher, icon subsetting, and the
// icon-name audit rule.

import { describe, it, expect } from "bun:test";
import { levenshtein, suggestClosest } from "../../src/utils/suggest";

describe("levenshtein", () => {
  it("is 0 for identical strings and symmetric", () => {
    expect(levenshtein("check", "check")).toBe(0);
    expect(levenshtein("check", "chekc")).toBe(levenshtein("chekc", "check"));
  });

  it("counts single edits", () => {
    expect(levenshtein("check", "chekc")).toBe(2); // transposition = 2 edits
    expect(levenshtein("chevron", "chevrom")).toBe(1); // one substitution
    expect(levenshtein("plus", "plu")).toBe(1); // one deletion
    expect(levenshtein("", "abc")).toBe(3);
  });
});

describe("suggestClosest", () => {
  const commands = ["init", "add", "remove", "audit", "list"];

  it("returns the nearest candidate within the distance bound", () => {
    expect(suggestClosest("addd", commands, 3)).toBe("add");
    expect(suggestClosest("audi", commands, 3)).toBe("audit");
  });

  it("returns null when nothing is close enough", () => {
    expect(suggestClosest("zzzzzzzz", commands, 3)).toBeNull();
    expect(suggestClosest("add", commands, 0)).toBe("add"); // exact still matches at 0
    expect(suggestClosest("addd", commands, 0)).toBeNull();
  });

  it("is deterministic on ties — first candidate in input order wins", () => {
    // "aa" is edit distance 1 from both "ab" and "ba"; the earlier one wins.
    expect(suggestClosest("aa", ["ab", "ba"], 3)).toBe("ab");
    expect(suggestClosest("aa", ["ba", "ab"], 3)).toBe("ba");
  });
});
