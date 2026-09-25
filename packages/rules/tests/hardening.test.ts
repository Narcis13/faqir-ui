// The 1.1 release review, pinned. Every case here was reproduced against the
// package before it shipped for the first time: data that reached
// Object.prototype, a key that cost seconds of CPU, a pattern that cost more, a
// compute that fed on itself, a verdict read off an inherited property, and a
// recipe that dropped a checkbox group's values. Each one is a case a server
// runs over bytes someone else chose, so each is pinned by the behaviour, not
// by the line that fixed it.

import { afterEach, describe, expect, it } from "bun:test";
import {
  DefinitionError,
  MAX_ARRAY_INDEX,
  MAX_REGEX_SUBJECT_LENGTH,
  coerce,
  compile,
  evaluate,
  evaluateLogic,
  fromFormData,
  lintDefinition,
  validate,
  validateAsync,
} from "../src/index.js";
import type { RulesDefinition } from "../src/index.js";

const asDefinition = (value: unknown) => value as RulesDefinition;

afterEach(() => {
  // A failed assertion below must not leave the pollution in place for the
  // rest of the run — that is the whole hazard being tested.
  for (const key of ["polluted", "p", "x"]) delete (Object.prototype as Record<string, unknown>)[key];
});

describe("coerce cannot reach an object's machinery", () => {
  const profile = asDefinition({
    fields: { profile: { type: "object", properties: { name: { type: "string" } } } },
  });

  it("drops a key that walks through __proto__, constructor or prototype", () => {
    const out = coerce(profile, {
      "profile.__proto__.polluted": "yes",
      "profile.constructor.prototype.p": "yes",
      "profile.name": "Ada",
    });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(({} as Record<string, unknown>).p).toBeUndefined();
    expect(out).toEqual({ profile: { name: "Ada" } });
  });

  it("drops a top-level __proto__ key rather than rewiring the result's prototype", () => {
    const raw = JSON.parse('{"__proto__": {"x": 1}, "profile.name": "Ada"}');
    const out = coerce(profile, raw);
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
    expect((out as Record<string, unknown>).x).toBeUndefined();
    expect(out).toEqual({ profile: { name: "Ada" } });
  });

  it("refuses a definition that names one in a field path, a property or a rule target", () => {
    expect(() => compile(asDefinition({ fields: { "a.__proto__": { type: "string" } } })))
      .toThrow(DefinitionError);
    expect(() => compile(asDefinition({
      fields: { a: { type: "object", properties: { constructor: { type: "string" } } } },
    }))).toThrow("__proto__, constructor or prototype");
    expect(() => compile(asDefinition({
      fields: {},
      rules: [{ id: "c", compute: "__proto__.polluted", value: 1 }],
    }))).toThrow(DefinitionError);
    expect(() => compile(asDefinition({
      fields: { a: { type: "string" } },
      rules: [{ id: "j", jump: "__proto__", from: "0" }],
    }))).toThrow(DefinitionError);
  });
});

describe("coerce bounds the arrays a flat key can build", () => {
  const contacts = asDefinition({
    fields: {
      contacts: { type: "array", items: { type: "object", properties: { name: { type: "string" } } } },
    },
  });

  it("does not un-flatten an index past MAX_ARRAY_INDEX, and answers at once", () => {
    const started = performance.now();
    const out = coerce(contacts, { "contacts[100000000].name": "x" });
    const took = performance.now() - started;
    // Before the bound this took ~4.6 s (and far longer for a bigger index);
    // the bound here is loose only so a loaded CI box cannot trip it.
    expect(took).toBeLessThan(1000);
    expect(out).toEqual({ "contacts[100000000].name": "x" });
    expect(validate(contacts, out).valid).toBe(true);
  });

  it("still un-flattens every index up to the bound", () => {
    expect(MAX_ARRAY_INDEX).toBe(9999);
    const out = coerce(contacts, {
      "contacts[0].name": "a",
      [`contacts[${MAX_ARRAY_INDEX}].name`]: "z",
    });
    expect(out.contacts).toEqual([{ name: "a" }, { name: "z" }]);
  });
});

describe("a pattern that backtracks catastrophically is refused", () => {
  it("as a field pattern, at compile time", () => {
    for (const pattern of ["^(a+)+$", "(a*)*", "(\\w+\\s?)+", "((\\d+)-?)*", "(a+|b)+"]) {
      expect(() => compile(asDefinition({ fields: { a: { type: "string", pattern } } })), pattern)
        .toThrow("backtrack catastrophically");
    }
  });

  it("as a regex operand, at compile time and at evaluateLogic", () => {
    expect(() => compile(asDefinition({
      fields: { a: { type: "string" } },
      rules: [{ id: "r", validate: { regex: ["^(a+)+$", { var: "a" }] }, path: "a" }],
    }))).toThrow("backtrack catastrophically");
    expect(() => evaluateLogic({ regex: ["(x*)*y", { var: "a" }] }, {})).toThrow(DefinitionError);
  });

  it("while ordinary patterns — a separator between the repeats, one quantifier — still compile", () => {
    for (const pattern of [
      "^[A-Z]{2}\\d{3}$",
      "^([a-z0-9]+\\.)+[a-z]{2,}$",
      "(\\d{1,3}\\.){3}\\d{1,3}",
      "^([A-Z][a-z]+ ?)+$",
      "[(a+)+]",
      "\\(a+\\)+",
    ]) {
      expect(() => compile(asDefinition({ fields: { a: { type: "string", pattern } } })), pattern).not.toThrow();
    }
  });

  it("the lint says the same — an error for the refused shape, a warning for the milder one", () => {
    const refused = lintDefinition({ fields: { a: { type: "string", pattern: "^(a+)+$" } } });
    expect(refused.ok).toBe(false);
    expect(refused.findings).toEqual([expect.objectContaining({
      rule: "schema", severity: "error", path: "fields.a.pattern",
    })]);

    const nested = lintDefinition({ fields: { a: { type: "string", pattern: "^([a-z]+\\.)+$" } } });
    expect(nested.ok).toBe(true);
    expect(nested.findings).toEqual([expect.objectContaining({
      rule: "schema", severity: "warning", path: "fields.a.pattern",
    })]);

    const regex = lintDefinition({
      fields: { a: { type: "string" } },
      rules: [{ id: "r", validate: { regex: ["([a-z]+,)+", { var: "a" }] }, path: "a" }],
    });
    expect(regex.findings).toEqual([expect.objectContaining({
      rule: "rule-ops", severity: "warning", path: "rules[0].validate", id: "r",
    })]);
  });
});

// The review's second finding: shapes the first detector let through, each
// reproduced as slow — `^(a+){20}$` took 1.9 s on 41 characters, `^(a|a)+$`
// and `^(\w|\d)+$` over 400 ms on 26 — and a field `pattern` that ran against a
// subject of any length, where the `regex` operator stopped at the cap.
describe("the shapes the first detector missed are refused too", () => {
  const BYPASSES = [
    "^(a+){20}$", "^(a+){11,}$", "^(a{1,5})+$",
    "^(a|a)+$", "^(\\w|\\d)+$", "(a|ab)*", "^(.|\\s)*$", "^((a|a)b?)+$", "^(a|a){11,20}$",
  ];
  const SAFE = [
    "^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$",
    "^\\d{5}(-\\d{4})?$",
    "^[A-Z]{2}\\d{2}[A-Z0-9]{11,30}$",
    "^(\\+\\d{1,3})?\\d{6,14}$",
    "^[a-z0-9-]+$",
    "^(https?):\\/\\/[^\\s]+$",
    "^(red|green|blue)$",
    "^(mr|mrs|ms)\\.?$",
    "^(\\d|[a-f])+$",
    "^(\\w|-)+$",
    "^(?:\\\\.|[^\"\\\\])*$",
    "^(\\d{2})+$",
    "^(a+){5}$",
  ];
  const fieldWith = (pattern: string) => asDefinition({ fields: { a: { type: "string", pattern } } });

  it("each bypass is refused at compile, as a field pattern and as a regex operand", () => {
    for (const pattern of BYPASSES) {
      expect(() => compile(fieldWith(pattern)), pattern).toThrow("backtrack catastrophically");
      expect(() => evaluateLogic({ regex: [pattern, { var: "a" }] }, {}), pattern).toThrow(DefinitionError);
    }
  });

  it("while the everyday patterns still compile", () => {
    for (const pattern of SAFE) expect(() => compile(fieldWith(pattern)), pattern).not.toThrow();
  });

  it("no refused pattern can be reached: every entry point refuses before matching", () => {
    const evil = `${"a".repeat(40)}!`;
    const started = performance.now();
    for (const pattern of BYPASSES) {
      expect(() => validate(fieldWith(pattern), { a: evil }), pattern).toThrow(DefinitionError);
      expect(() => evaluate(fieldWith(pattern), { a: evil }), pattern).toThrow(DefinitionError);
      expect(() => evaluateLogic({ regex: [pattern, evil] }, {}), pattern).toThrow(DefinitionError);
    }
    expect(performance.now() - started).toBeLessThan(50);
  });

  it("a subject longer than MAX_REGEX_SUBJECT_LENGTH fails the pattern unread, like the regex operator", () => {
    // Quadratic on a near-miss, so not refused — the cap is what bounds it.
    const compiled = compile(asDefinition({ fields: { a: { type: "string", pattern: "^(\\s*a)*$" } } }));
    const long = `${"a".repeat(MAX_REGEX_SUBJECT_LENGTH)}a`;
    const started = performance.now();
    const verdict = validate(compiled, { a: long });
    expect(performance.now() - started).toBeLessThan(50);
    expect(verdict.valid).toBe(false);
    expect(verdict.findings).toEqual([expect.objectContaining({ path: "a", rule: "pattern" })]);
    expect(evaluateLogic({ regex: ["^(\\s*a)*$", long] }, {})).toBe(false);
    // One character shorter is matched as before.
    expect(validate(compiled, { a: long.slice(1) }).valid).toBe(true);
  });

  it("the lint reports each bypass as the same error compile throws", () => {
    for (const pattern of BYPASSES) {
      const report = lintDefinition({ fields: { a: { type: "string", pattern } } });
      expect(report.ok, pattern).toBe(false);
      expect(report.findings, pattern).toContainEqual(expect.objectContaining({
        rule: "schema", severity: "error", path: "fields.a.pattern",
        message: expect.stringContaining("backtrack catastrophically"),
      }));
      const regex = lintDefinition({
        fields: { a: { type: "string" } },
        rules: [{ id: "r", validate: { regex: [pattern, { var: "a" }] }, path: "a" }],
      });
      expect(regex.ok, pattern).toBe(false);
      expect(regex.findings, pattern).toContainEqual(expect.objectContaining({ rule: "rule-ops", severity: "error" }));
    }
    for (const pattern of SAFE) {
      const report = lintDefinition({ fields: { a: { type: "string", pattern } } });
      expect(report.findings.filter((f) => f.severity === "error"), pattern).toEqual([]);
    }
  });
});

describe("a compute that reads its own target is a cycle", () => {
  const selfCompute = asDefinition({
    fields: { total: { type: "number" } },
    rules: [{ id: "inc", compute: "total", value: { "+": [{ var: "total" }, 1] } }],
  });

  it("at compile time", () => {
    expect(() => compile(selfCompute)).toThrow('the "compute" rule "inc" reads "total", the value it writes');
  });

  it("and in the lint", () => {
    const report = lintDefinition(selfCompute);
    expect(report.ok).toBe(false);
    expect(report.findings).toEqual([expect.objectContaining({ rule: "rule-cycles", path: "rules[0]", id: "inc" })]);
  });

  it("while two computes in a chain are still fine", () => {
    expect(() => compile(asDefinition({
      fields: { a: { type: "number" }, b: { type: "number" }, c: { type: "number" } },
      rules: [
        { id: "c", compute: "c", value: { "+": [{ var: "b" }, 1] } },
        { id: "b", compute: "b", value: { "+": [{ var: "a" }, 1] } },
      ],
    }))).not.toThrow();
  });
});

describe("nothing is read off Object.prototype", () => {
  it("a var naming an inherited property is absent", () => {
    expect(evaluateLogic({ var: "constructor" }, {})).toBeNull();
    expect(evaluateLogic({ var: "toString" }, { a: 1 })).toBeNull();
    expect(evaluateLogic({ missing: ["constructor"] }, {})).toEqual(["constructor"]);
    const state = evaluate(asDefinition({
      fields: { x: { type: "string" } },
      rules: [{ id: "s", show: "x", when: { var: "constructor" } }],
    }), {});
    expect(state.visible).toEqual({ x: false });
  });

  it("a message table is read by own keys only", () => {
    const verdict = validate(asDefinition({
      fields: { a: { type: "string", required: true } },
    }), {}, { locale: "constructor" });
    expect(verdict.findings[0].message).toBe("This field is required.");
  });
});

describe("a remote answer means one thing on both sides", () => {
  const remote = asDefinition({
    fields: { email: { type: "string" } },
    rules: [{ id: "unique", validate: "remote", path: "email", remote: "/check", message: "Taken." }],
  });

  it('"" is a failure with the rule\'s message, exactly like false', async () => {
    const empty = await validateAsync(remote, { email: "a" }, { remote: () => "" });
    const no = await validateAsync(remote, { email: "a" }, { remote: () => false });
    expect(empty.findings).toEqual(no.findings);
    expect(empty.findings).toEqual([{ path: "email", rule: "unique", message: "Taken.", params: { remote: "/check" } }]);
  });

  it("a non-empty string is the sentence; anything else is remote-error", async () => {
    const said = await validateAsync(remote, { email: "a" }, { remote: () => "Already registered." });
    expect(said.findings[0].message).toBe("Already registered.");
    const broken = await validateAsync(remote, { email: "a" }, { remote: () => 1 as unknown as boolean });
    expect(broken.findings[0].rule).toBe("remote-error");
  });
});

describe("fromFormData", () => {
  const def = asDefinition({
    fields: {
      tags: { type: "array", items: { type: "string", enum: ["a", "b", "c"] }, minItems: 2 },
      contacts: { type: "array", items: { type: "object", properties: { name: { type: "string" } } } },
      age: { type: "integer" },
    },
  });

  it("keeps every value of a repeated name, which Object.fromEntries does not", () => {
    const form = new FormData();
    form.append("tags", "a");
    form.append("tags", "c");
    form.append("contacts[0].name", "Ada");
    form.append("contacts[1].name", "Grace");
    form.append("age", "37");

    expect(Object.fromEntries(form).tags).toBe("c"); // the bug this exists for
    const data = coerce(def, fromFormData(form));
    expect(data).toEqual({ tags: ["a", "c"], contacts: [{ name: "Ada" }, { name: "Grace" }], age: 37 });
    expect(validate(def, data).valid).toBe(true);
  });

  it("reads URLSearchParams, a Map, pairs and anything with forEach", () => {
    const expected = { tags: ["a", "b"], age: "1" };
    expect(fromFormData(new URLSearchParams("tags=a&tags=b&age=1"))).toEqual(expected);
    expect(fromFormData([["tags", "a"], ["tags", "b"], ["age", "1"]])).toEqual(expected);
    expect(fromFormData(new Map([["age", "1"]]))).toEqual({ age: "1" });
    expect(fromFormData({ forEach: (cb: (v: unknown, k: string) => void) => cb("1", "age") })).toEqual({ age: "1" });
  });

  it("collects three or more values in order, and drops a name that reaches __proto__", () => {
    expect(fromFormData([["t", "1"], ["t", "2"], ["t", "3"]])).toEqual({ t: ["1", "2", "3"] });
    const out = fromFormData([["__proto__", "x"], ["a.constructor", "y"], ["ok", "z"]]);
    expect(out).toEqual({ ok: "z" });
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
  });
});

describe("embedding a definition in a script element", () => {
  it("warns at the first string that would end or derail the element", () => {
    const report = lintDefinition({
      fields: { a: { type: "string", title: "Close </script> here" } },
    });
    expect(report.ok).toBe(true);
    expect(report.findings).toEqual([expect.objectContaining({
      rule: "schema", severity: "warning", path: "fields.a.title",
    })]);
    expect(report.findings[0].message).toContain("\\u003c");

    expect(lintDefinition({ fields: { a: { type: "string" } }, messages: { en: { required: "<!-- no" } } })
      .findings.map((finding) => finding.path)).toContain("messages.en.required");
  });

  it("stays quiet about the ordinary < of an operator", () => {
    expect(lintDefinition({
      fields: { n: { type: "number" } },
      rules: [{ id: "v", validate: { "<=": [{ var: "n" }, 3] }, path: "n" }],
    }).findings).toEqual([]);
  });
});
