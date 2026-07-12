import { describe, it, expect } from "bun:test";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import {
  parseHTML,
  parseDocument,
  extractComponents,
  findAllUIElements,
} from "../../../src/parser/html-parser";
import { checkInvariants } from "./fuzz-core";

// Corpus regression suite (task 0.5-09, §9.1). Every file in
// tests/fixtures/malformed/ — including every past crasher, pinned as a
// `*.crasher.html` fixture — must satisfy the parser invariants: no throw, no
// hang, and all node ranges within input bounds. When the fuzzer finds a new
// crasher it is saved here, so this suite grows to cover it permanently.

const CORPUS_DIR = join(import.meta.dir, "../../fixtures/malformed");

const corpusFiles = readdirSync(CORPUS_DIR).filter((f) => f.endsWith(".html"));

describe("malformed HTML corpus", () => {
  it("has a non-empty corpus (fixtures are actually present)", () => {
    expect(corpusFiles.length).toBeGreaterThan(0);
  });

  for (const file of corpusFiles) {
    it(`parses '${file}' with no crash, hang, or out-of-bounds node`, async () => {
      const source = await Bun.file(join(CORPUS_DIR, file)).text();
      // Deep-nesting crashers legitimately take longer than a tiny fragment;
      // give a generous budget that still catches a true hang (seconds, not ms).
      const { violations } = checkInvariants(source, { timeBudgetMs: 5000 });
      expect(violations).toEqual([]);
    });
  }
});

// Targeted regressions for the two crashers found and fixed in this session.
// These assert the specific failure modes directly (stack overflow / O(n²)
// hang) rather than only via the generic invariant checker.
describe("deep-nesting crasher regressions", () => {
  it("does not overflow the stack on deeply nested tags (was: recursive walk)", () => {
    const src = "<div>".repeat(60_000);
    // The recursive tree walkers overflowed here; the iterative versions must
    // not. We only require it to return — no assertion on shape beyond that.
    expect(() => {
      parseHTML(src);
      parseDocument(src, "deep.html");
      findAllUIElements(src);
    }).not.toThrow();
  });

  it("stays time-bounded on deeply nested components (was: O(n²) hang)", () => {
    const src = "<div data-ui='button' data-part='x'>".repeat(30_000);
    const t0 = performance.now();
    const components = extractComponents(src, "deep.html");
    const elapsed = performance.now() - t0;
    // Correct count (one component per level) and linear-ish time. The pre-fix
    // implementation took tens of seconds here; 2s is a wide safety margin.
    expect(components.length).toBe(30_000);
    expect(elapsed).toBeLessThan(2000);
  });

  it("attributes a nested data-part to its nearest data-ui ancestor only", () => {
    // Guards the rewritten extractComponents' nesting semantics.
    const html =
      `<div data-ui="dialog"><div data-part="panel">` +
      `<div data-part="footer"><button data-ui="button">` +
      `<span data-part="icon">x</span></button></div></div></div>`;
    const comps = extractComponents(html, "t.html");
    const dialog = comps.find((c) => c.name === "dialog")!;
    const button = comps.find((c) => c.name === "button")!;
    expect(Object.keys(dialog.parts).sort()).toEqual(["footer", "panel"]);
    expect(dialog.parts.icon).toBeUndefined(); // icon is under the nested button
    expect(button.parts.icon).toBeDefined();
  });
});
