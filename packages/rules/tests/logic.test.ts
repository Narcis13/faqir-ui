// The logic evaluator — every operator, and the bounds that keep a definition
// from spending the process.
//
// Two kinds of case live here. The hand-written ones pin the *decisions* this
// package made: which operators exist, what an unknown one does, how the two
// Faqir operators read a date and a pattern. The vendored ones pin conformance:
// the public JSONLogic suite, run verbatim, because "a JSONLogic subset" is a
// claim about somebody else's semantics and the only honest way to make it is
// to run their vectors.

import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DATE_COMPARATORS,
  DefinitionError,
  LOGIC_OPS,
  MAX_LOGIC_DEPTH,
  MAX_LOGIC_NODES,
  MAX_PATTERN_LENGTH,
  MAX_REGEX_SUBJECT_LENGTH,
  evaluateLogic,
  parseInstant,
  truthy,
} from "../src/index.js";

const run = (expr: unknown, data?: unknown) => evaluateLogic(expr as never, data);

describe("truthiness", () => {
  it("is JavaScript's, except that an empty array is falsy", () => {
    for (const value of [true, 1, -1, "0", "zucchini", [0], [1, 2], {}]) {
      expect(truthy(value), JSON.stringify(value)).toBe(true);
    }
    for (const value of [false, 0, "", null, undefined, []]) {
      expect(truthy(value), JSON.stringify(value ?? null)).toBe(false);
    }
  });
});

describe("data operators", () => {
  it("reads a dotted path, an array index and the data itself", () => {
    expect(run({ var: "a.b" }, { a: { b: "c" } })).toBe("c");
    expect(run({ var: "rows.1.qty" }, { rows: [{ qty: 1 }, { qty: 7 }] })).toBe(7);
    expect(run({ var: "" }, { a: 1 })).toEqual({ a: 1 });
  });

  it("answers null for a path that is not there, or the default if one is given", () => {
    expect(run({ var: "nope" }, { a: 1 })).toBeNull();
    expect(run({ var: "a.b.c" }, { a: null })).toBeNull();
    expect(run({ var: ["nope", "fallback"] }, {})).toBe("fallback");
  });

  it("`missing` lists the blank paths, counting empty strings as blank", () => {
    expect(run({ missing: ["a", "b", "c"] }, { a: 1, b: "" })).toEqual(["b", "c"]);
    expect(run({ missing: ["a.b"] }, { a: { b: "x" } })).toEqual([]);
  });

  it("`missing_some` asks for a quorum", () => {
    expect(run({ missing_some: [2, ["a", "b", "c"]] }, { a: 1, b: 2 })).toEqual([]);
    expect(run({ missing_some: [2, ["a", "b", "c"]] }, { a: 1 })).toEqual(["b", "c"]);
  });
});

describe("logic and comparison operators", () => {
  it("`if` walks condition/consequent pairs and falls through to the last odd argument", () => {
    expect(run({ if: [false, "a", false, "b", "c"] })).toBe("c");
    expect(run({ if: [false, "a", true, "b", "c"] })).toBe("b");
    expect(run({ if: [false, "a"] })).toBeNull();
  });

  it("`and` and `or` answer with the deciding value, not with a boolean", () => {
    expect(run({ and: [1, 3] })).toBe(3);
    expect(run({ and: [0, true] })).toBe(0);
    expect(run({ or: ["", "fallback"] })).toBe("fallback");
    expect(run({ or: ["0", true] })).toBe("0");
  });

  it("compares loosely with `==` and strictly with `===`", () => {
    expect(run({ "==": [1, "1"] })).toBe(true);
    expect(run({ "===": [1, "1"] })).toBe(false);
    expect(run({ "!=": [1, "1"] })).toBe(false);
    expect(run({ "!==": [1, "1"] })).toBe(true);
  });

  it("reads a 3-ary comparison as `between`", () => {
    expect(run({ "<": [1, 2, 3] })).toBe(true);
    expect(run({ "<": [1, 4, 3] })).toBe(false);
    expect(run({ "<=": [1, 1, 3] })).toBe(true);
    expect(run({ ">": [3, 2, 1] })).toBe(true);
  });
});

describe("arithmetic and string operators", () => {
  it("coerces its operands, which is what form data needs", () => {
    expect(run({ "+": ["1", 1] })).toBe(2);
    expect(run({ "+": "3.5" })).toBe(3.5);
    expect(run({ "-": [3] })).toBe(-3);
    expect(run({ "*": [2, 2, 2] })).toBe(8);
    expect(run({ "/": [2, 4] })).toBe(0.5);
    expect(run({ "%": [7, 2] })).toBe(1);
    expect(run({ min: [3, 1, 2] })).toBe(1);
    expect(run({ max: [3, 1, 2] })).toBe(3);
  });

  it("`cat` joins, treating a null as nothing rather than as the word null", () => {
    expect(run({ cat: ["Robocop", 2] })).toBe("Robocop2");
    expect(run({ cat: ["a", { var: "nope" }, "b"] }, {})).toBe("ab");
  });

  it("`substr` counts code points, so an emoji is one character", () => {
    expect(run({ substr: ["jsonlogic", -5, 3] })).toBe("log");
    expect(run({ substr: ["🙂🙃🙂", 1, 1] })).toBe("🙃");
  });

  it("`in` is membership for a list and a substring test for a string", () => {
    expect(run({ in: ["b", ["a", "b"]] })).toBe(true);
    expect(run({ in: ["Spring", "Springfield"] })).toBe(true);
    expect(run({ in: ["x", 7] })).toBe(false);
  });

  it("`some`, `all` and `none` scope their test to each item", () => {
    const data = { items: [{ qty: 1 }, { qty: 2 }] };
    expect(run({ some: [{ var: "items" }, { ">": [{ var: "qty" }, 1] }] }, data)).toBe(true);
    expect(run({ all: [{ var: "items" }, { ">": [{ var: "qty" }, 1] }] }, data)).toBe(false);
    expect(run({ none: [{ var: "items" }, { "<": [{ var: "qty" }, 0] }] }, data)).toBe(true);
    // "All of nothing" is not a pass, and a non-array is not a list.
    expect(run({ all: [{ var: "items" }, { ">": [{ var: "qty" }, 0] }] }, { items: [] })).toBe(false);
    expect(run({ some: [{ var: "items" }, true] }, { items: "nope" })).toBe(false);
    expect(run({ none: [{ var: "items" }, true] }, { items: "nope" })).toBe(true);
  });
});

describe("the `date` operator", () => {
  it("compares ISO dates and date-times", () => {
    expect(run({ date: ["2026-01-01", "<", "2026-01-02"] })).toBe(true);
    expect(run({ date: ["2026-01-01T10:00:00", ">", "2026-01-01T09:00:00"] })).toBe(true);
    expect(run({ date: ["2026-01-01", "==", "2026-01-01"] })).toBe(true);
    expect(run({ date: [{ var: "start" }, "<=", "2026-06-01"] }, { start: "2026-05-31" })).toBe(true);
  });

  it("is false — never a throw — when either side is not a date", () => {
    for (const value of ["yesterday", "", null, 
      // A calendar date that does not exist is not a date, even though
      // `Date.UTC` would happily roll it into March.
      "2026-02-31"]) {
      expect(run({ date: [value, "<", "2026-01-01"] }), JSON.stringify(value)).toBe(false);
      expect(run({ date: [value, "!=", "2026-01-01"] }), JSON.stringify(value)).toBe(false);
    }
  });

  it("reads a zoneless date-time as UTC, so the answer does not depend on where it runs", () => {
    // 2026-01-01T00:30 in Berlin is 2025-12-31T23:30 UTC; reading it as local
    // time would flip this comparison for half the planet.
    expect(parseInstant("2026-01-01T00:30:00")).toBe(Date.UTC(2026, 0, 1, 0, 30));
    expect(parseInstant("2026-01-01T00:30:00Z")).toBe(parseInstant("2026-01-01T00:30:00"));
    expect(parseInstant("2026-01-01T02:30:00+02:00")).toBe(parseInstant("2026-01-01T00:30:00"));
    expect(parseInstant("2026-01-01T00:30:00-01:30")).toBe(Date.UTC(2026, 0, 1, 2, 0));
    expect(parseInstant("2026-13-01")).toBeNull();
    expect(parseInstant(17)).toBe(17);
  });

  it("refuses a comparator that is not one", () => {
    expect(() => run({ date: ["2026-01-01", "before", "2026-02-01"] }))
      .toThrow(/needs one of ==, !=, <, <=, >, >=/);
    expect(DATE_COMPARATORS).toContain("<=");
  });
});

describe("the `regex` operator", () => {
  it("tests a literal pattern against a string", () => {
    expect(run({ regex: ["^[A-Z]{2}\\d{3}$", { var: "code" }] }, { code: "AB123" })).toBe(true);
    expect(run({ regex: ["^[A-Z]{2}\\d{3}$", { var: "code" }] }, { code: "AB12" })).toBe(false);
  });

  it("answers false for a subject that is not a string, or is too long to be worth matching", () => {
    expect(run({ regex: ["^a+$", { var: "x" }] }, { x: 7 })).toBe(false);
    expect(run({ regex: ["^a+$", { var: "x" }] }, { x: null })).toBe(false);
    const huge = "a".repeat(MAX_REGEX_SUBJECT_LENGTH + 1);
    expect(run({ regex: ["^a+$", { var: "x" }] }, { x: huge })).toBe(false);
    expect(run({ regex: ["^a+$", { var: "x" }] }, { x: huge.slice(1) })).toBe(true);
  });

  it("refuses a computed pattern, an uncompilable one and an oversized one", () => {
    expect(() => run({ regex: [{ var: "pattern" }, "x"] }, { pattern: "^a$" }))
      .toThrow(/needs a literal pattern string/);
    expect(() => run({ regex: ["([", "x"] })).toThrow(/not a valid regular expression/);
    expect(() => run({ regex: ["a".repeat(MAX_PATTERN_LENGTH + 1), "x"] }))
      .toThrow(new RegExp(`the limit is ${MAX_PATTERN_LENGTH}`));
  });
});

describe("definition errors", () => {
  it("names an operator it does not implement", () => {
    let error: unknown;
    try {
      run({ map: [{ var: "x" }, { var: "" }] }, { x: [1] });
    } catch (thrown) {
      error = thrown;
    }
    expect(error).toBeInstanceOf(DefinitionError);
    expect((error as Error).message).toContain('unsupported operator "map"');
    // The message lists the alternatives, because "which ones are there, then"
    // is the next question every time.
    expect((error as Error).message).toContain("missing_some");
  });

  it("refuses an object that is not a single operator", () => {
    expect(() => run({ "==": [1, 1], "!=": [1, 2] })).toThrow(/single-operator object/);
    expect(() => run({})).toThrow(/single-operator object/);
  });

  it("refuses an operator given too few arguments", () => {
    expect(() => run({ "==": [1] })).toThrow(/needs at least 2 arguments, got 1/);
    expect(() => run({ substr: ["abc"] })).toThrow(/needs at least 2 arguments/);
  });

  it("rejects an oversized expression rather than evaluating it", () => {
    // Wide: a 10,000-node `and`. The bound is checked while the walk reads it,
    // so the refusal costs the bound, not the expression.
    const wide = { and: Array.from({ length: 10000 }, (_, i) => i % 2 === 0) };
    expect(() => run(wide)).toThrow(new RegExp(`more than ${MAX_LOGIC_NODES} nodes`));

    // Deep: 10,000 nested additions.
    let deep: unknown = 1;
    for (let i = 0; i < 10000; i++) deep = { "+": [1, deep] };
    expect(() => run(deep)).toThrow(new RegExp(`deeper than ${MAX_LOGIC_DEPTH} levels`));

    // And the sizes just inside the bounds still evaluate.
    expect(run({ and: Array.from({ length: MAX_LOGIC_NODES - 2 }, () => true) })).toBe(true);
  });

  it("exposes the operator list it enforces", () => {
    expect(LOGIC_OPS).toContain("missing_some");
    expect(LOGIC_OPS).toContain("date");
    expect(LOGIC_OPS).not.toContain("map");
    expect(new Set(LOGIC_OPS).size).toBe(LOGIC_OPS.length);
  });
});

// ── Conformance: the public JSONLogic suite, verbatim ───────────────────────

type Vector = [unknown, unknown, unknown];

const VENDOR = join(import.meta.dir, "vendor", "jsonlogic-tests.json");
const ENTRIES = JSON.parse(readFileSync(VENDOR, "utf8")) as (string | Vector)[];
const VECTORS = ENTRIES.filter((entry): entry is Vector => Array.isArray(entry));

/** Every operator named anywhere in an expression. */
function operatorsIn(node: unknown, found = new Set<string>()): Set<string> {
  if (Array.isArray(node)) {
    for (const item of node) operatorsIn(item, found);
  } else if (typeof node === "object" && node !== null) {
    for (const [op, args] of Object.entries(node)) {
      found.add(op);
      operatorsIn(args, found);
    }
  }
  return found;
}

const IMPLEMENTED = new Set<string>(LOGIC_OPS);
const supported = VECTORS.filter((v) => [...operatorsIn(v[0])].every((op) => IMPLEMENTED.has(op)));
const unsupported = VECTORS.filter((v) => ![...operatorsIn(v[0])].every((op) => IMPLEMENTED.has(op)));

describe("the vendored JSONLogic suite", () => {
  it("is the file it says it is", () => {
    expect(VECTORS.length).toBeGreaterThanOrEqual(250);
    // Both halves have to be populated, or the partition below could quietly
    // become "we run nothing" or "we implement nothing".
    expect(supported.length).toBeGreaterThanOrEqual(200);
    expect(unsupported.length).toBeGreaterThan(0);
  });

  for (const [index, vector] of supported.entries()) {
    const [logic, data, expected] = vector;
    it(`#${index} ${JSON.stringify(logic)} over ${JSON.stringify(data)}`, () => {
      expect(run(logic, data)).toEqual(expected as never);
    });
  }

  it("refuses every vector built on an operator outside the subset, naming it", () => {
    for (const [logic] of unsupported) {
      const missing = [...operatorsIn(logic)].filter((op) => !IMPLEMENTED.has(op));
      let error: unknown;
      try {
        run(logic, {});
      } catch (thrown) {
        error = thrown;
      }
      expect(error, JSON.stringify(logic)).toBeInstanceOf(DefinitionError);
      const message = (error as Error).message;
      expect(missing.some((op) => message.includes(`"${op}"`)), message).toBe(true);
    }
  });
});
