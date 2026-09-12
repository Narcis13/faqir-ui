// The lint: seven rules, each with a definition that trips it and one that does
// not. The pairs matter more than the singles — a check that fires on a broken
// definition and also on a correct one is worse than no check, because it
// teaches its reader to stop reading.
//
// Severity is part of the contract and is asserted case by case. `error` means
// a rule cannot do what it was written to do, and `faqir rules lint` exits
// non-zero (tests/commands/rules-lint.test.ts owns the exit codes themselves).
// `warning` means it works and is worth a second look: a form-level `validate`
// with no field-group to paint into, a compute nothing validates, a half-done
// translation. All three are documented behaviour, and the golden corpus has a
// case pinning each — which is why the last block here requires the corpus to
// be error-free rather than finding-free.

import { describe, expect, it } from "bun:test";
import { LINT_RULES, lintDefinition } from "../src/index.js";
import { loadCorpus } from "./corpus";

/** The findings one definition earns under a given rule id. */
function findingsFor(definition: unknown, rule: string, options?: { locales?: string[] }) {
  return lintDefinition(definition, options).findings.filter((f) => f.rule === rule);
}

/** Every rule id a definition trips. */
function rulesTripped(definition: unknown, options?: { locales?: string[] }) {
  return [...new Set(lintDefinition(definition, options).findings.map((f) => f.rule))].sort();
}

describe("the lint's vocabulary", () => {
  it("is the seven rules, in the order they are reported", () => {
    expect([...LINT_RULES]).toEqual([
      "schema",
      "rule-verb",
      "rule-ops",
      "rule-refs",
      "rule-cycles",
      "rule-unreachable",
      "rule-messages",
    ]);
  });

  it("reports a clean definition as clean", () => {
    const report = lintDefinition({
      version: "1",
      fields: {
        plan: { type: "string", enum: ["solo", "team"], required: true },
        seats: { type: "integer", minimum: 1 },
      },
      rules: [
        { id: "seats-for-teams", show: "seats", when: { "==": [{ var: "plan" }, "team"] } },
        { id: "seats-required", require: "seats", when: { "==": [{ var: "plan" }, "team"] } },
      ],
    });
    expect(report.findings).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.counts).toEqual({ error: 0, warning: 0 });
  });

  it("gives every finding a stable id, a severity, a place and a sentence", () => {
    const report = lintDefinition({ fields: { a: { type: "string" } }, rules: [{ id: "r", show: "b", when: true }] });
    expect(report.findings.length).toBeGreaterThan(0);
    for (const finding of report.findings) {
      expect(LINT_RULES).toContain(finding.rule);
      expect(["error", "warning"]).toContain(finding.severity);
      expect(typeof finding.path).toBe("string");
      expect(finding.message.length).toBeGreaterThan(0);
    }
  });
});

describe("schema", () => {
  it("reports a definition the package would refuse", () => {
    const findings = findingsFor({ fields: { a: { type: "string", maxlength: 3 } } }, "schema");
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("error");
    expect(findings[0].path).toBe("fields.a.maxlength");
    expect(findings[0].message).toContain("maxlength");
  });

  it("says nothing about a well-formed one", () => {
    expect(findingsFor({ fields: { a: { type: "string", maxLength: 3 } } }, "schema")).toEqual([]);
  });

  it("catches what only the engine knows, so nothing it refuses lints clean", () => {
    // An unknown format, a `required` naming no field, an uncompilable pattern:
    // shape problems no JSON Schema can express, which `compile` throws on and
    // the lint must not therefore miss.
    for (const definition of [
      { fields: { a: { type: "string", format: "iban-ish" } } },
      { fields: { a: { type: "string" } }, required: ["b"] },
      { fields: { a: { type: "string", pattern: "[" } } },
      { fields: { a: { type: "object", required: ["b"], properties: { c: { type: "string" } } } } },
    ]) {
      const report = lintDefinition(definition);
      expect(report.ok, JSON.stringify(definition)).toBe(false);
      expect(report.findings.some((f) => f.rule === "schema")).toBe(true);
    }
  });

  it("steps aside where a specific rule already spoke", () => {
    // A two-verb rule matches no branch of the schema either, but "has 2 verbs"
    // is the sentence worth printing.
    const report = lintDefinition({ rules: [{ id: "r", show: "a", require: "a", when: true }] });
    expect(report.findings.some((f) => f.rule === "rule-verb")).toBe(true);
    expect(report.findings.filter((f) => f.rule === "schema" && f.path.startsWith("rules[0]"))).toEqual([]);
  });
});

describe("rule-verb", () => {
  it("reports a rule with no verb", () => {
    const findings = findingsFor({ rules: [{ id: "r", when: true }] }, "rule-verb");
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("error");
    expect(findings[0].id).toBe("r");
    expect(findings[0].message).toContain("no verb");
  });

  it("reports a rule with two", () => {
    const findings = findingsFor(
      { fields: { a: { type: "string" } }, rules: [{ id: "r", show: "a", require: "a", when: true }] },
      "rule-verb",
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toContain("2 verbs (show, require)");
  });

  it("says nothing about one verb", () => {
    expect(findingsFor({ fields: { a: { type: "string" } }, rules: [{ id: "r", show: "a", when: { var: "a" } }] }, "rule-verb"))
      .toEqual([]);
  });
});

describe("rule-ops", () => {
  it("reports an operator the evaluator does not implement", () => {
    const findings = findingsFor(
      { fields: { a: { type: "array" } }, rules: [{ id: "r", show: "a", when: { map: [{ var: "a" }, 1] } }] },
      "rule-ops",
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("error");
    expect(findings[0].path).toBe("rules[0].when");
    expect(findings[0].message).toContain('unsupported operator "map"');
  });

  it("reports a bad arity", () => {
    const findings = findingsFor(
      { fields: { a: { type: "string" } }, rules: [{ id: "r", show: "a", when: { "<": [1] } }] },
      "rule-ops",
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toContain("at least 2 arguments");
  });

  it("reports a node with two operators", () => {
    const findings = findingsFor(
      { fields: { a: { type: "string" } }, rules: [{ id: "r", show: "a", when: { "!": [1], "!!": [1] } }] },
      "rule-ops",
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toContain("single-operator object");
  });

  it("reports a `date` with a comparator that is not one", () => {
    const findings = findingsFor(
      { fields: { a: { type: "string" } }, rules: [{ id: "r", show: "a", when: { date: [{ var: "a" }, "~", "2026-01-01"] } }] },
      "rule-ops",
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toContain("date");
  });

  it("says nothing about the implemented subset", () => {
    expect(findingsFor({
      fields: { a: { type: "string" }, b: { type: "array" } },
      rules: [
        { id: "one", show: "a", when: { and: [{ "!!": [{ var: "a" }] }, { in: ["x", { var: "a" }] }] } },
        { id: "two", show: "b", when: { some: [{ var: "b" }, { ">": [{ var: "qty" }, 0] }] } },
      ],
    }, "rule-ops")).toEqual([]);
  });
});

describe("rule-refs", () => {
  it("reports a `show` target no field declares", () => {
    const findings = findingsFor({ fields: { a: { type: "string" } }, rules: [{ id: "r", show: "b", when: true }] }, "rule-refs");
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("error");
    expect(findings[0].path).toBe("rules[0].show");
    expect(findings[0].message).toContain('"b"');
  });

  it("reports a `var` no field declares and no rule computes", () => {
    const findings = findingsFor(
      { fields: { plan: { type: "string" }, seats: { type: "integer" } },
        rules: [{ id: "r", show: "seats", when: { "==": [{ var: "plna" }, "team"] } }] },
      "rule-refs",
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("error");
    expect(findings[0].message).toContain('"plna"');
  });

  it("reports each unknown path once, however often it is read", () => {
    const findings = findingsFor(
      { fields: { a: { type: "string" } },
        rules: [{ id: "r", show: "a", when: { or: [{ var: "ghost" }, { var: "ghost" }] } }] },
      "rule-refs",
    );
    expect(findings).toHaveLength(1);
  });

  it("accepts a container above a declared field, and a path inside one", () => {
    expect(findingsFor({
      fields: {
        "address.city": { type: "string" },
        contact: { type: "object", properties: { email: { type: "string" } } },
        lines: { type: "array", items: { type: "object", properties: { qty: { type: "integer" } } } },
      },
      rules: [
        { id: "hide-address", show: "address", when: { var: "contact.email" } },
        { id: "first-line", show: "lines.0.qty", when: { var: "lines[0].qty" } },
      ],
    }, "rule-refs")).toEqual([]);
  });

  it("accepts a value a compute writes", () => {
    expect(findingsFor({
      fields: { qty: { type: "integer" }, price: { type: "number" }, total: { type: "number" } },
      rules: [
        { id: "total", compute: "total", value: { "*": [{ var: "qty" }, { var: "price" }] } },
        { id: "big", show: "qty", when: { ">": [{ var: "total" }, 100] } },
      ],
    }, "rule-refs")).toEqual([]);
  });

  it("leaves an item-scoped `var` alone: `some` re-binds the data", () => {
    expect(findingsFor({
      fields: { lines: { type: "array", items: { type: "object", properties: { qty: { type: "integer" } } } } },
      rules: [{ id: "r", compute: "backordered", value: { some: [{ var: "lines" }, { "<": [{ var: "qty" }, 0] }] } }],
    }, "rule-refs").filter((f) => f.severity === "error")).toEqual([]);
  });

  it("leaves a `var` with a default alone: the author said what absent means", () => {
    expect(findingsFor({
      fields: { discount: { type: "number" } },
      rules: [{ id: "r", compute: "discount", value: { var: ["rate", 0] } }],
    }, "rule-refs").filter((f) => f.severity === "error")).toEqual([]);
  });

  it("warns — not errors — about a form-level validate", () => {
    const findings = findingsFor(
      { fields: { a: { type: "string" } }, rules: [{ id: "r", validate: { var: "a" }, path: "form" }] },
      "rule-refs",
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("warning");
    expect(findings[0].message).toContain("no field-group");
  });

  it("warns about a compute nothing declares", () => {
    const findings = findingsFor(
      { fields: { a: { type: "string" } }, rules: [{ id: "r", compute: "shadow", value: { var: "a" } }] },
      "rule-refs",
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("warning");
  });

  it("holds `require` to the same bar the engine does", () => {
    // `compile` refuses a `require` naming no field; the lint must report it
    // rather than leave it to a throw nobody saw.
    const report = lintDefinition({ fields: { a: { type: "string" } }, rules: [{ id: "r", require: "b", when: true }] });
    expect(report.ok).toBe(false);
    expect(report.findings.some((f) => f.rule === "rule-refs" && f.severity === "error")).toBe(true);
  });
});

describe("rule-cycles", () => {
  it("reports computes that depend on each other", () => {
    const findings = findingsFor({
      fields: { x: { type: "number" }, y: { type: "number" } },
      rules: [
        { id: "a", compute: "x", value: { "+": [{ var: "y" }, 1] } },
        { id: "b", compute: "y", value: { "+": [{ var: "x" }, 1] } },
      ],
    }, "rule-cycles");
    expect(findings).toHaveLength(2);
    expect(findings[0].severity).toBe("error");
    expect(findings[0].message).toContain('"a", "b"');
  });

  it("reports a three-rule cycle, naming all three", () => {
    const findings = findingsFor({
      fields: { x: { type: "number" }, y: { type: "number" }, z: { type: "number" } },
      rules: [
        { id: "a", compute: "x", value: { var: "y" } },
        { id: "b", compute: "y", value: { var: "z" } },
        { id: "c", compute: "z", value: { var: "x" } },
      ],
    }, "rule-cycles");
    expect(findings).toHaveLength(3);
    expect(findings[0].message).toContain('"a", "b", "c"');
  });

  it("says nothing about a chain that terminates", () => {
    expect(findingsFor({
      fields: { qty: { type: "integer" }, net: { type: "number" }, gross: { type: "number" } },
      rules: [
        { id: "gross", compute: "gross", value: { "*": [{ var: "net" }, 1.2] } },
        { id: "net", compute: "net", value: { "*": [{ var: "qty" }, 10] } },
      ],
    }, "rule-cycles")).toEqual([]);
  });
});

describe("rule-unreachable", () => {
  it("reports a `when` that is constant true", () => {
    const findings = findingsFor(
      { fields: { a: { type: "string" } }, rules: [{ id: "r", show: "a", when: { ">": [2, 1] } }] },
      "rule-unreachable",
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("warning");
    expect(findings[0].message).toContain("constant true");
  });

  it("reports a `when` that is constant false", () => {
    const findings = findingsFor(
      { fields: { a: { type: "string" } }, rules: [{ id: "r", require: "a", when: false }] },
      "rule-unreachable",
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toContain("constant false");
  });

  it("folds through a short circuit the data can never reach", () => {
    // `or` answers at the first truthy argument, so the `var` behind it is
    // never read — the condition is constant despite naming a field.
    const findings = findingsFor(
      { fields: { a: { type: "string" } }, rules: [{ id: "r", show: "a", when: { or: [true, { var: "a" }] } }] },
      "rule-unreachable",
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toContain("constant true");
  });

  it("folds an `if` down the branch its constant condition takes", () => {
    const findings = findingsFor(
      { fields: { a: { type: "string" } }, rules: [{ id: "r", show: "a", when: { if: [false, { var: "a" }, false] } }] },
      "rule-unreachable",
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toContain("constant false");
  });

  it("folds a literal comparison and a literal date", () => {
    const findings = findingsFor({
      fields: { a: { type: "string" } },
      rules: [
        { id: "cmp", show: "a", when: { "==": ["x", "x"] } },
        { id: "when", jump: "b", from: "a", when: { date: ["2026-01-01", "<", "2026-02-01"] } },
      ],
    }, "rule-unreachable");
    expect(findings).toHaveLength(2);
    expect(findings.map((f) => f.id)).toEqual(["cmp", "when"]);
  });

  it("reports a cross-field check the data cannot influence", () => {
    const findings = findingsFor(
      { fields: { a: { type: "string" } }, rules: [{ id: "r", validate: { "!": [true] }, path: "a" }] },
      "rule-unreachable",
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toContain("reports on every submission");
  });

  it("leaves a condition the data decides alone", () => {
    expect(findingsFor({
      fields: { a: { type: "string" }, b: { type: "string" } },
      rules: [
        { id: "one", show: "a", when: { and: [true, { var: "b" }] } },
        { id: "two", show: "b", when: { if: [{ var: "a" }, true, false] } },
      ],
    }, "rule-unreachable")).toEqual([]);
  });

  it("leaves a constant `compute` alone — that is a default, not a mistake", () => {
    expect(findingsFor({
      fields: { currency: { type: "string" } },
      rules: [{ id: "r", compute: "currency", value: "EUR" }],
    }, "rule-unreachable")).toEqual([]);
  });

  it("leaves an unconditional `jump` alone — it has no `when` to fold", () => {
    expect(findingsFor({ rules: [{ id: "r", jump: "b", from: "a" }] }, "rule-unreachable")).toEqual([]);
  });
});

describe("rule-messages", () => {
  const definition = {
    fields: { email: { type: "string", format: "email" } },
    rules: [{ id: "cross", validate: { var: "email" }, path: "email" }],
    messages: {
      en: { "email.format": "That is not an email address.", cross: "Check this." },
      ro: { "email.format": "Nu este o adresă de email." },
    },
  };

  it("reports a key no field and no rule can address", () => {
    const findings = findingsFor({
      fields: { email: { type: "string" } },
      messages: { en: { "emial.required": "Needed." } },
    }, "rule-messages");
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("error");
    expect(findings[0].message).toContain("addresses no field and no rule");
  });

  it("reports a key naming a rule name nobody implements", () => {
    const findings = findingsFor({
      fields: { email: { type: "string" } },
      messages: { en: { "email.maxlength": "Too long." } },
    }, "rule-messages");
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("error");
  });

  it("accepts a bare rule name, a path.rule and a cross-field rule's id", () => {
    expect(findingsFor(definition, "rule-messages").filter((f) => f.severity === "error")).toEqual([]);
  });

  it("warns about a locale gap the fallback chain covers", () => {
    const findings = findingsFor(definition, "rule-messages");
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("warning");
    expect(findings[0].path).toBe("messages.ro");
    expect(findings[0].message).toContain('"cross"');
  });

  it("makes the same gap an error in a locale that was asked for", () => {
    const findings = findingsFor(definition, "rule-messages", { locales: ["en", "ro"] });
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("error");
  });

  it("reports a requested locale with no table at all", () => {
    const findings = findingsFor(definition, "rule-messages", { locales: ["de"] });
    expect(findings.some((f) => f.severity === "error" && f.path === "messages.de")).toBe(true);
  });

  it("says nothing about a definition with no messages", () => {
    expect(findingsFor({ fields: { a: { type: "string" } } }, "rule-messages")).toEqual([]);
  });

  it("says nothing even when locales are asked for: there is nothing to translate", () => {
    // Every sentence is the built-in English here, which is complete in the
    // only sense this definition has an opinion about.
    expect(findingsFor({ fields: { a: { type: "string" } } }, "rule-messages", { locales: ["en", "ro"] }))
      .toEqual([]);
  });
});

describe("one definition can trip several rules, and the report is stable", () => {
  const broken = {
    fields: { plan: { type: "string" } },
    messages: { en: { "plan.required": "Pick a plan." }, ro: {} },
    rules: [
      { id: "typo", show: "seats", when: { "==": [{ var: "plna" }, "team"] } },
      { id: "two-verbs", show: "plan", require: "plan", when: true },
      { id: "bad-op", show: "plan", when: { map: [1, 2] } },
      { id: "flat", show: "plan", when: { or: [true, { var: "plan" }] } },
      { id: "a", compute: "x", value: { var: "y" } },
      { id: "b", compute: "y", value: { var: "x" } },
    ],
  };

  it("names every rule that applies", () => {
    expect(rulesTripped(broken)).toEqual([
      "rule-cycles", "rule-messages", "rule-ops", "rule-refs", "rule-unreachable", "rule-verb",
    ]);
  });

  it("counts what it found and refuses the definition", () => {
    const report = lintDefinition(broken);
    expect(report.ok).toBe(false);
    expect(report.counts.error).toBeGreaterThan(0);
    expect(report.counts.warning).toBeGreaterThan(0);
    expect(report.counts.error + report.counts.warning).toBe(report.findings.length);
  });

  it("gives the same answer twice — the lint is a pure function", () => {
    expect(lintDefinition(broken)).toEqual(lintDefinition(broken));
  });

  it("survives a definition that is barely a definition", () => {
    for (const junk of [null, 7, "text", [], { rules: 7 }, { fields: [] }, { rules: [null, 7] }]) {
      const report = lintDefinition(junk);
      expect(report.ok, JSON.stringify(junk)).toBe(false);
      expect(report.findings.length).toBeGreaterThan(0);
    }
  });
});

describe("the golden corpus lints clean", () => {
  // Not "finding-free": the corpus deliberately pins the documented behaviours
  // the warnings are about — a form-level `validate`, a compute with no field,
  // a half-translated table, a `show` whose condition is a literal. Every one
  // of those must stay a warning, and nothing in a corpus of definitions this
  // package answers verdicts for may be an error.
  const corpus = loadCorpus();

  for (const testCase of corpus) {
    it(`${testCase.name} — no errors`, () => {
      const report = lintDefinition(testCase.definition);
      const errors = report.findings.filter((f) => f.severity === "error");
      expect(errors, errors.map((f) => `${f.rule} ${f.path}: ${f.message}`).join("\n")).toEqual([]);
      expect(report.ok).toBe(true);
    });
  }
});
