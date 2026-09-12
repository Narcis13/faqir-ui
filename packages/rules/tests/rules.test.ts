// The rules engine — the five verbs, the order they run in, and the two things
// that must never happen: a rule that quietly does nothing, and a remote check
// that quietly passes.
//
// The golden corpus (`tests/golden/rules.json`) pins whole verdicts for the
// happy paths; this file pins the decisions around them — what is a definition
// error, what order computes take, what a resolver that throws produces.

import { describe, expect, it } from "bun:test";
import {
  DefinitionError,
  RULE_MESSAGES,
  RULE_VERBS,
  compile,
  evaluate,
  validate,
  validateAsync,
} from "../src/index.js";
import type { RulesDefinition } from "../src/index.js";

const def = (rules: unknown[], fields?: Record<string, unknown>): RulesDefinition =>
  ({ version: "1", fields: fields ?? { a: { type: "string" }, b: { type: "string" } }, rules } as RulesDefinition);

describe("the verbs", () => {
  it("are the five the README documents", () => {
    expect([...RULE_VERBS]).toEqual(["show", "require", "validate", "compute", "jump"]);
  });

  it("`show` answers per path, and a path no rule mentions is simply absent", () => {
    const state = evaluate(def([{ id: "r", show: "b", when: { var: "a" } }]), { a: "" });
    expect(state.visible).toEqual({ b: false });
    expect(state.visible.a).toBeUndefined();
  });

  it("`require` makes the shape validator ask for a value it would not have asked for", () => {
    const definition = def([{ id: "r", require: "b", when: { "==": [{ var: "a" }, "yes"] } }]);
    expect(validate(definition, { a: "no" }).findings).toEqual([]);
    expect(validate(definition, { a: "yes" }).findings).toEqual([
      { path: "b", rule: "required", message: "This field is required.", params: {} },
    ]);
  });

  it("`validate` reports under the rule's own id, so a message can address it", () => {
    const definition = def(
      [{ id: "b-longer-than-a", validate: { ">": [{ var: "b" }, { var: "a" }] }, path: "b" }],
    );
    const verdict = validate(definition, { a: "zzz", b: "aaa" });
    expect(verdict.findings).toEqual([
      { path: "b", rule: "b-longer-than-a", message: RULE_MESSAGES.rule, params: {} },
    ]);
  });

  it("`compute` writes into the data the rest of the pass reads, without touching the caller's", () => {
    const definition = def(
      [{ id: "total", compute: "total", value: { "*": [{ var: "qty" }, 2] } }],
      { qty: { type: "integer" }, total: { type: "integer" } },
    );
    const data = { qty: 4 };
    const verdict = validate(definition, data);
    expect(verdict.computed).toEqual({ total: 8 });
    expect(data).toEqual({ qty: 4 });
  });

  it("`jump` answers `{ from: to }`, first matching rule per page", () => {
    const definition = def([
      { id: "big", jump: "review", from: "cart", when: { ">": [{ var: "n" }, 10] } },
      { id: "small", jump: "pay", from: "cart" },
      { id: "always", jump: "thanks", from: "pay" },
    ], { n: { type: "integer" } });
    expect(evaluate(definition, { n: 50 }).next).toEqual({ cart: "review", pay: "thanks" });
    expect(evaluate(definition, { n: 1 }).next).toEqual({ cart: "pay", pay: "thanks" });
  });
});

describe("visibility suppresses findings", () => {
  it("drops a hidden field's findings, and everything nested inside it", () => {
    const definition = def([{ id: "hide", show: "address", when: false }], {
      address: {
        type: "object",
        properties: { city: { type: "string", required: true }, zip: { type: "string", minLength: 4 } },
      },
    });
    const shown = validate(def([{ id: "hide", show: "address", when: true }], {
      address: {
        type: "object",
        properties: { city: { type: "string", required: true }, zip: { type: "string", minLength: 4 } },
      },
    }), { address: { zip: "1" } });
    expect(shown.findings.map((f) => f.path)).toEqual(["address.city", "address.zip"]);
    expect(validate(definition, { address: { zip: "1" } }).findings).toEqual([]);
  });

  it("skips a cross-field rule whose own field is hidden", () => {
    const definition = def([
      { id: "hide", show: "b", when: false },
      { id: "never", validate: false, path: "b" },
    ]);
    expect(validate(definition, { b: "x" }).findings).toEqual([]);
  });

  it("skips a cross-field rule while its declared field is blank, but not one on an undeclared path", () => {
    const declared = def([{ id: "never", validate: false, path: "b" }]);
    expect(validate(declared, {}).findings).toEqual([]);
    expect(validate(declared, { b: "x" }).findings).toHaveLength(1);

    const formLevel = def([{ id: "never", validate: false, path: "form" }]);
    expect(validate(formLevel, {}).findings).toHaveLength(1);
  });
});

describe("compute ordering", () => {
  it("runs a chain in dependency order however it is written down", () => {
    const fields = {
      qty: { type: "integer" }, net: { type: "number" },
      tax: { type: "number" }, gross: { type: "number" },
    };
    const rules = [
      { id: "gross", compute: "gross", value: { "+": [{ var: "net" }, { var: "tax" }] } },
      { id: "tax", compute: "tax", value: { "*": [{ var: "net" }, 0.5] } },
      { id: "net", compute: "net", value: { "*": [{ var: "qty" }, 10] } },
    ];
    expect(evaluate(def(rules, fields), { qty: 2 }).computed).toEqual({ net: 20, tax: 10, gross: 30 });
    // Reversed in the document, identical in the verdict.
    expect(evaluate(def([...rules].reverse(), fields), { qty: 2 }).computed)
      .toEqual({ net: 20, tax: 10, gross: 30 });
  });

  it("orders a compute that reads the parent of another compute's target", () => {
    // `has_geo` reads `geo`; `lat` writes `geo.lat`. The dependency runs
    // through the path, not through an exact match — so `lat` goes first and
    // `has_geo` sees the object it created. In document order it would be false.
    const state = evaluate(def([
      { id: "has-geo", compute: "has_geo", value: { "!!": [{ var: "geo" }] } },
      { id: "lat", compute: "geo.lat", value: { "+": [{ var: "base" }, 1] } },
    ], { base: { type: "integer" }, has_geo: { type: "boolean" } }), { base: 40 });
    expect(state.computed).toEqual({ "geo.lat": 41, has_geo: true });
  });

  it("reports a cycle instead of looping or giving up quietly", () => {
    const cyclic = def([
      { id: "a", compute: "x", value: { var: "y" } },
      { id: "b", compute: "y", value: { var: "x" } },
    ], { x: { type: "integer" }, y: { type: "integer" } });
    expect(() => compile(cyclic)).toThrow(DefinitionError);
    expect(() => compile(cyclic)).toThrow(/"a", "b" depend on each other in a cycle/);
  });
});

describe("definition errors", () => {
  const bad = (rule: unknown, fields?: Record<string, unknown>) =>
    () => compile(def([rule], fields));

  it("refuses a rule with no id, a duplicate id, or no verb", () => {
    expect(bad({ show: "a", when: true })).toThrow(/"id" at rules\[0\] must be a non-empty string/);
    expect(bad({ id: "x" })).toThrow(/has no verb/);
    expect(() => compile(def([
      { id: "x", show: "a", when: true },
      { id: "x", show: "b", when: true },
    ]))).toThrow(/two rules share the id "x"/);
  });

  it("refuses a rule that tries to do two things", () => {
    expect(bad({ id: "x", show: "a", require: "b", when: true }))
      .toThrow(/has 2 verbs \(show, require\); a rule does one thing/);
  });

  it("refuses a key the verb does not accept — a typo must not be a no-op", () => {
    expect(bad({ id: "x", show: "a", when: true, message: "hi" }))
      .toThrow(/unsupported key "message" at rules\[0\] \("x"\) \(a "show" rule accepts id, show, when\)/);
    expect(bad({ id: "x", compute: "a", value: 1, when: true })).toThrow(/unsupported key "when"/);
  });

  it("refuses a `show` or `require` with no condition", () => {
    expect(bad({ id: "x", show: "a" })).toThrow(/needs a "when" condition/);
    expect(bad({ id: "x", require: "a" })).toThrow(/needs a "when" condition/);
  });

  it("refuses a `require` on a path that is not a declared field", () => {
    expect(bad({ id: "x", require: "nope", when: true }))
      .toThrow(/names "nope", which is not a key of "fields"/);
  });

  it("checks a rule's logic when the definition is read, not when a keystroke reaches it", () => {
    expect(bad({ id: "x", show: "a", when: { merge: [1, 2] } }))
      .toThrow(/unsupported operator "merge" at rules\[0\] \("x"\)/);
    expect(bad({ id: "x", validate: { nope: [] }, path: "a" })).toThrow(/unsupported operator "nope"/);
  });

  it("refuses `remote` on a rule that is not remote, and a remote rule with no resolver name", () => {
    expect(bad({ id: "x", validate: true, path: "a", remote: "/api" }))
      .toThrow(/only belongs to a rule whose "validate" is "remote"/);
    expect(bad({ id: "x", validate: "remote", path: "a" }))
      .toThrow(/"remote" at rules\[0\] \("x"\) must be a non-empty string/);
  });

  it("refuses a `rules` value that is not an array of objects", () => {
    expect(() => compile({ version: "1", rules: "nope" } as unknown as RulesDefinition))
      .toThrow(/"rules" must be an array/);
    expect(() => compile(def(["nope"]))).toThrow(/the rule at rules\[0\] must be an object/);
  });
});

describe("remote rules", () => {
  const remoteDef = def(
    [{ id: "email-free", validate: "remote", path: "email", remote: "/api/email-free",
       message: "That address is already registered." }],
    { email: { type: "string", format: "email" } },
  );
  const data = { email: "ada@example.com" };

  it("cannot run in a sync verdict, and does not pretend otherwise", () => {
    const verdict = validate(remoteDef, data);
    expect(verdict.findings).toEqual([]);
    expect(verdict.pending).toEqual(["email-free"]);
    // Nothing is wrong with the data yet — but nothing has said it is right.
    expect(verdict.valid).toBe(false);
  });

  it("passes when the resolver says true", async () => {
    const verdict = await validateAsync(remoteDef, data, { remote: async () => true });
    expect(verdict.valid).toBe(true);
    expect(verdict.pending).toEqual([]);
  });

  it("fails with the rule's message when the resolver says false", async () => {
    const verdict = await validateAsync(remoteDef, data, { remote: () => false });
    expect(verdict.findings).toEqual([{
      path: "email",
      rule: "email-free",
      message: "That address is already registered.",
      params: { remote: "/api/email-free" },
    }]);
  });

  it("fails with the resolver's own sentence when it hands one back", async () => {
    const verdict = await validateAsync(remoteDef, data, { remote: () => "Try ada2@example.com." });
    expect(verdict.findings[0].message).toBe("Try ada2@example.com.");
  });

  it("hands the resolver the rule, the value and the whole data", async () => {
    const seen: unknown[] = [];
    await validateAsync(remoteDef, data, {
      remote: (rule, value, all) => {
        seen.push(rule, value, all);
        return true;
      },
    });
    expect(seen[0]).toEqual({
      id: "email-free",
      path: "email",
      remote: "/api/email-free",
      message: "That address is already registered.",
    });
    expect(seen[1]).toBe("ada@example.com");
    expect(seen[2]).toEqual(data);
  });

  it("turns a rejection into a `remote-error` finding — a check that could not run is not a pass", async () => {
    const rejected = await validateAsync(remoteDef, data, {
      remote: () => Promise.reject(new Error("502")),
    });
    expect(rejected.findings).toEqual([{
      path: "email",
      rule: "remote-error",
      message: RULE_MESSAGES["remote-error"],
      params: { remote: "/api/email-free" },
    }]);

    // A resolver that throws synchronously lands in the same branch.
    const threw = await validateAsync(remoteDef, data, {
      remote: () => { throw new Error("boom"); },
    });
    expect(threw.findings[0].rule).toBe("remote-error");

    // So does one that answers with something that is neither a verdict nor a
    // message: breaking the contract must not read as approval.
    const nonsense = await validateAsync(remoteDef, data, {
      remote: () => 42 as unknown as boolean,
    });
    expect(nonsense.findings[0].rule).toBe("remote-error");
  });

  it("throws rather than skipping when a remote rule has no resolver", async () => {
    await expect(validateAsync(remoteDef, data)).rejects.toThrow(
      /has remote rules \("email-free"\) but validateAsync was given no `remote` resolver/,
    );
  });

  it("reports findings in rule order however the resolvers resolve", async () => {
    const two = def([
      { id: "first", validate: "remote", path: "a", remote: "slow" },
      { id: "second", validate: "remote", path: "b", remote: "fast" },
    ]);
    const verdict = await validateAsync(two, { a: "x", b: "y" }, {
      remote: async (rule) => {
        if (rule.remote === "slow") await new Promise((resolve) => setTimeout(resolve, 20));
        return false;
      },
    });
    expect(verdict.findings.map((f) => f.rule)).toEqual(["first", "second"]);
  });

  it("puts shape findings before rule findings, and rule findings in document order", async () => {
    const definition = def([
      { id: "b-set", validate: { "!!": [{ var: "b" }] }, path: "form" },
      { id: "checked", validate: "remote", path: "a", remote: "/api" },
    ], { a: { type: "string", minLength: 4 }, b: { type: "string" } });
    const verdict = await validateAsync(definition, { a: "xy" }, { remote: () => false });
    expect(verdict.findings.map((f) => `${f.path}:${f.rule}`))
      .toEqual(["a:minLength", "form:b-set", "a:checked"]);
  });

  it("leaves a resolved verdict valid when everything else is clean", async () => {
    const verdict = await validateAsync(remoteDef, {}, { remote: () => false });
    // The field is blank, so there was nothing to ask about in the first place.
    expect(verdict).toEqual({
      valid: true, findings: [], computed: {}, visible: {}, required: {}, next: {}, pending: [],
    });
  });
});

describe("compile", () => {
  it("is idempotent, and compiling the verbs happens once per compiled definition", () => {
    const definition = def([{ id: "r", show: "b", when: { var: "a" } }]);
    const compiled = compile(definition);
    expect(compile(compiled)).toBe(compiled);
    expect(validate(compiled, { a: "yes" }).visible).toEqual({ b: true });
  });

  it("accepts a definition with no rules at all and answers the empty maps", () => {
    expect(validate({ version: "1", fields: { a: { type: "string" } } }, { a: "x" })).toEqual({
      valid: true, findings: [], computed: {}, visible: {}, required: {}, next: {}, pending: [],
    });
  });
});
