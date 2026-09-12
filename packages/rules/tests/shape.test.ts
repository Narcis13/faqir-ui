// The unit half of the package's gate. The golden corpus pins whole verdicts;
// this file pins the pieces the corpus would need a hundred more cases to reach
// — every format's vectors, every coercion, and above all every *definition*
// error, because a validator that silently ignores a keyword is worse than one
// that does not exist.

import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  BUILT_IN_FORMATS,
  DEFAULT_MESSAGES,
  DEFINITION_VERSION,
  DefinitionError,
  MAX_PATTERN_LENGTH,
  SHAPE_RULES,
  checkFormat,
  coerce,
  compile,
  formatNames,
  hasFormat,
  interpolate,
  registerFormat,
  resolveMessage,
  validate,
} from "../src/index.js";
import type { RulesDefinition } from "../src/index.js";

const ROOT = join(import.meta.dir, "../../..");

/**
 * Most cases below are deliberately *invalid* — a misspelled keyword, a bound
 * that is a string — which the published types correctly refuse. A cast at the
 * boundary is how a case says "yes, this is the bad one", and keeps the
 * published surface strict for everybody who is not writing this file.
 */
const asDefinition = (value: unknown) => value as RulesDefinition;

/** The rules that fired, in order — the shorthand most of these cases want. */
function rules(definition: unknown, data: unknown): string[] {
  return validate(asDefinition(definition), data).findings.map((f) => `${f.path}:${f.rule}`);
}

/** A one-field definition, so a case reads as the constraint it is about. */
function oneField(schema: Record<string, unknown>): RulesDefinition {
  return asDefinition({ version: "1", fields: { value: schema } });
}

describe("every constraint, passing and failing", () => {
  const table: {
    constraint: string;
    schema: Record<string, unknown>;
    pass: unknown[];
    fail: unknown[];
  }[] = [
    { constraint: "type string", schema: { type: "string" }, pass: ["", "a", "0"], fail: [0, true, [1], {}] },
    { constraint: "type number", schema: { type: "number" }, pass: [0, -1.5, 1e3], fail: ["1", true, NaN, Infinity] },
    { constraint: "type integer", schema: { type: "integer" }, pass: [0, -3, 1e3], fail: [1.5, "1", NaN] },
    { constraint: "type boolean", schema: { type: "boolean" }, pass: [true, false], fail: ["true", 1, {}] },
    { constraint: "type object", schema: { type: "object" }, pass: [{}, { a: 1 }], fail: [[1], "x", 1] },
    { constraint: "type array", schema: { type: "array" }, pass: [[1], ["a"]], fail: [{}, "x", 1] },
    { constraint: "enum", schema: { type: "string", enum: ["a", "b"] }, pass: ["a", "b"], fail: ["c", "A"] },
    { constraint: "const", schema: { type: "integer", const: 7 }, pass: [7], fail: [8, 7.5] },
    { constraint: "pattern", schema: { type: "string", pattern: "^a+$" }, pass: ["a", "aaa"], fail: ["b", "ab"] },
    { constraint: "format", schema: { type: "string", format: "email" }, pass: ["a@b.co"], fail: ["a@b", "@b.co"] },
    { constraint: "minLength", schema: { type: "string", minLength: 2 }, pass: ["ab", "abc"], fail: ["a"] },
    { constraint: "maxLength", schema: { type: "string", maxLength: 2 }, pass: ["ab", "a"], fail: ["abc"] },
    { constraint: "minimum", schema: { type: "number", minimum: 0 }, pass: [0, 1], fail: [-0.5] },
    { constraint: "maximum", schema: { type: "number", maximum: 10 }, pass: [10, 9], fail: [10.5] },
    { constraint: "exclusiveMinimum", schema: { type: "number", exclusiveMinimum: 0 }, pass: [0.1], fail: [0, -1] },
    { constraint: "exclusiveMaximum", schema: { type: "number", exclusiveMaximum: 10 }, pass: [9.9], fail: [10, 11] },
    { constraint: "multipleOf", schema: { type: "number", multipleOf: 0.25 }, pass: [0.5, 1, 2.75], fail: [0.3] },
    { constraint: "minItems", schema: { type: "array", minItems: 2 }, pass: [[1, 2]], fail: [[1]] },
    { constraint: "maxItems", schema: { type: "array", maxItems: 2 }, pass: [[1, 2]], fail: [[1, 2, 3]] },
    { constraint: "uniqueItems", schema: { type: "array", uniqueItems: true }, pass: [[1, 2]], fail: [[1, 1]] },
  ];

  for (const row of table) {
    it(row.constraint, () => {
      for (const value of row.pass) {
        expect(rules(oneField(row.schema), { value }), `${row.constraint} accepts ${String(value)}`)
          .toEqual([]);
      }
      for (const value of row.fail) {
        expect(
          rules(oneField(row.schema), { value }).length,
          `${row.constraint} rejects ${String(value)}`,
        ).toBeGreaterThan(0);
      }
    });
  }

  it("covers every rule the validator can emit", () => {
    const covered = new Set(table.map((row) => row.constraint.replace(/^type .*/, "type")));
    for (const rule of SHAPE_RULES) {
      if (rule === "required") continue; // its own describe block below
      expect(covered.has(rule), `no pass/fail row for "${rule}"`).toBe(true);
    }
  });
});

describe("required, in both spellings", () => {
  it("the field-level sugar", () => {
    expect(rules(oneField({ type: "string", required: true }), {})).toEqual(["value:required"]);
  });

  it("the top-level array", () => {
    const def = { version: "1", fields: { value: { type: "string" } }, required: ["value"] };
    expect(rules(def, {})).toEqual(["value:required"]);
  });

  it("an object's property array", () => {
    const def = {
      version: "1",
      fields: {
        person: { type: "object", properties: { name: { type: "string" } }, required: ["name"] },
      },
    };
    expect(rules(def, { person: {} })).toEqual(["person.name:required"]);
  });

  it("treats blank, null and an empty list as absent, but not false or zero", () => {
    const def = oneField({ type: "string", required: true });
    for (const blank of [undefined, null, ""]) {
      expect(rules(def, { value: blank }), String(blank)).toEqual(["value:required"]);
    }
    expect(rules(oneField({ type: "array", required: true }), { value: [] })).toEqual(["value:required"]);
    expect(rules(oneField({ type: "boolean", required: true }), { value: false })).toEqual([]);
    expect(rules(oneField({ type: "integer", required: true }), { value: 0 })).toEqual([]);
  });

  it("names the top-level path that does not exist", () => {
    expect(() => compile(asDefinition({ version: "1", fields: {}, required: ["ghost"] })))
      .toThrow(/"required" names "ghost"/);
  });

  it("names the property that is not one of the object's own", () => {
    expect(() =>
      compile(asDefinition({
        version: "1",
        fields: { person: { type: "object", properties: {}, required: ["name"] } },
      }))
    ).toThrow(/names "name", which is not one of its properties/);
  });
});

describe("nested paths", () => {
  const def = {
    version: "1",
    fields: {
      address: {
        type: "object",
        properties: {
          geo: { type: "object", properties: { lat: { type: "number", maximum: 90 } } },
        },
      },
      "billing.zip": { type: "string", format: "postal-code" },
      rows: {
        type: "array",
        items: { type: "object", properties: { qty: { type: "integer", minimum: 1 } } },
      },
    },
  };

  it("reports a deep object path", () => {
    expect(rules(def, { address: { geo: { lat: 91 } } })).toEqual(["address.geo.lat:maximum"]);
  });

  it("reports an array row path by index", () => {
    expect(rules(def, { rows: [{ qty: 1 }, { qty: 0 }] })).toEqual(["rows.1.qty:minimum"]);
  });

  it("resolves a dotted field key through nested data", () => {
    expect(rules(def, { billing: { zip: "no way this is a zip" } })).toEqual(["billing.zip:format"]);
  });

  it("resolves a dotted field key from a literal flat key too", () => {
    expect(rules(def, { "billing.zip": "no way this is a zip" })).toEqual(["billing.zip:format"]);
  });

  it("stops at a type finding rather than walking into a value of the wrong shape", () => {
    expect(rules(def, { address: "12 Main" })).toEqual(["address:type"]);
  });
});

describe("definition errors — nothing unsupported is silently ignored", () => {
  const bad: [string, unknown, RegExp][] = [
    ["an unknown field keyword", oneField({ type: "string", maxlength: 3 }), /unsupported keyword "maxlength"/],
    ["a keyword that belongs to another type", oneField({ type: "string", minimum: 3 }), /unsupported keyword "minimum"/],
    ["minItems on a string", oneField({ type: "string", minItems: 1 }), /unsupported keyword "minItems"/],
    ["an unknown definition key", { version: "1", feilds: {} }, /unsupported definition key "feilds"/],
    ["a version this package does not implement", { version: "2", fields: {} }, /unsupported definition version "2"/],
    ["a missing type", oneField({ minLength: 1 }), /needs a "type"/],
    ["an unknown type", oneField({ type: "date" }), /needs a "type"/],
    ["a non-object field schema", { version: "1", fields: { value: "string" } }, /must be an object/],
    ["a non-object definition", "nope", /a definition must be an object/],
    ["fields that is not a map", { version: "1", fields: [] }, /"fields" must be a map/],
    ["an unknown format", oneField({ type: "string", format: "ssn" }), /unknown format "ssn"/],
    ["an empty enum", oneField({ type: "string", enum: [] }), /"enum" .* must be a non-empty array/],
    ["an uncompilable pattern", oneField({ type: "string", pattern: "([" }), /not a valid regular expression/],
    ["a non-numeric bound", oneField({ type: "number", minimum: "3" }), /"minimum" .* must be a finite number/],
    ["a zero multipleOf", oneField({ type: "number", multipleOf: 0 }), /"multipleOf" .* greater than zero/],
    ["required: true on an array's items", oneField({ type: "array", items: { type: "string", required: true } }), /has no meaning/],
    ["a required array on a non-object field", oneField({ type: "string", required: ["a"] }), /"required" .* must be true/],
    ["a non-array rules", { version: "1", fields: {}, rules: {} }, /"rules" must be an array/],
    ["an empty path key", { version: "1", fields: { "": { type: "string" } } }, /empty path key/],
  ];

  for (const [label, definition, message] of bad) {
    it(`rejects ${label}`, () => {
      expect(() => compile(asDefinition(definition))).toThrow(message);
      expect(() => validate(asDefinition(definition), {})).toThrow(DefinitionError);
    });
  }

  it("names where in the definition the problem is", () => {
    try {
      compile(asDefinition({ version: "1", fields: { "a.b": { type: "string", nope: 1 } } }));
      throw new Error("expected a DefinitionError");
    } catch (error) {
      expect(error).toBeInstanceOf(DefinitionError);
      expect((error as DefinitionError).path).toBe("a.b");
      expect((error as Error).message).toStartWith("@faqir-ui/rules:");
    }
  });

  it("refuses a pattern long enough to be a denial of service", () => {
    const pattern = `^${"a?".repeat(MAX_PATTERN_LENGTH)}$`;
    expect(() => compile(asDefinition(oneField({ type: "string", pattern })))).toThrow(/the limit is 1000/);
  });

  it("accepts and ignores `rules` — 1.1B-02 gives them meaning", () => {
    const def = {
      version: "1",
      fields: { value: { type: "string" } },
      rules: [{ id: "r1", show: "value", when: { var: "other" } }],
    };
    expect(validate(asDefinition(def), { value: "x" }).valid).toBe(true);
    expect(compile(asDefinition(def)).rules).toHaveLength(1);
  });

  it("makes `version` optional but pins what it means when given", () => {
    expect(DEFINITION_VERSION).toBe("1");
    expect(compile(asDefinition({ fields: {} })).version).toBe("1");
  });

  it("is idempotent: compiling a compiled definition returns it unchanged", () => {
    const compiled = compile(asDefinition(oneField({ type: "string" })));
    expect(compile(asDefinition(compiled))).toBe(compiled);
    expect(validate(compiled, { value: 1 }).findings).toHaveLength(1);
  });
});

describe("formats", () => {
  const vectors: Record<string, { valid: string[]; invalid: string[] }> = {
    email: {
      valid: ["ada@example.com", "a.b+tag@sub.example.co.uk", "UPPER@EXAMPLE.COM"],
      invalid: ["ada", "ada@", "@example.com", "ada@localhost", "ada @example.com", "a@b.c om"],
    },
    uri: {
      valid: ["https://example.com", "http://a.b/c?d=1#e", "mailto:ada@example.com", "urn:isbn:0451450523"],
      invalid: ["example.com", "/relative/path", "://example.com", "https://exa mple.com"],
    },
    date: {
      valid: ["2026-09-12", "2024-02-29", "2000-02-29", "1999-12-31"],
      invalid: ["2025-02-29", "1900-02-29", "2026-13-01", "2026-00-10", "2026-04-31", "26-09-12", "2026-9-12"],
    },
    time: {
      valid: ["00:00", "23:59", "09:30:00", "09:30:00.123", "09:30:00Z", "09:30:00+02:00", "23:59:60"],
      invalid: ["24:00:00", "09:60", "9:30", "09:30:61", "half past nine"],
    },
    "date-time": {
      valid: ["2026-09-12T09:30:00Z", "2026-09-12t09:30:00", "2026-09-12 09:30", "2026-09-12T09:30:00+03:00"],
      invalid: ["2026-09-12", "09:30:00", "2026-13-12T09:30:00Z", "2026-09-12T24:00:00Z"],
    },
    phone: {
      valid: ["+40721123456", "+40 (721) 123-456", "0721.123.456", "+1 555 010 9999"],
      invalid: ["12-34", "+40721123456789012", "0721-abc-456", ""],
    },
    iban: {
      // Published ISO 13616 examples; the last two are the same numbers with a
      // digit moved, which the shape accepts and only mod-97 catches.
      valid: ["GB82WEST12345698765432", "GB82 WEST 1234 5698 7654 32", "DE89370400440532013000", "FR1420041010050500013M02606"],
      invalid: ["GB82WEST12345698765433", "DE89370400440532013001", "GB82", "1234WEST12345698765432"],
    },
    uuid: {
      valid: ["8f14e45f-ceea-467a-9575-1a0dbf2a2f6e", "00000000-0000-0000-0000-000000000000", "8F14E45F-CEEA-467A-9575-1A0DBF2A2F6E"],
      invalid: ["8f14e45f-ceea-467a-9575-1a0dbf2a2f6", "8f14e45fceea467a95751a0dbf2a2f6e", "zzzzzzzz-ceea-467a-9575-1a0dbf2a2f6e"],
    },
    "postal-code": {
      valid: ["10115", "SW1A 1AA", "K1A 0B1", "1234 AB", "400-123"],
      invalid: ["", "1", "12 Main Street", "12  34", "N1!"],
    },
  };

  it("ships exactly the nine documented checkers", () => {
    expect([...BUILT_IN_FORMATS].sort() as string[]).toEqual(Object.keys(vectors).sort());
    for (const name of BUILT_IN_FORMATS) expect(hasFormat(name)).toBe(true);
  });

  for (const [name, { valid, invalid }] of Object.entries(vectors)) {
    it(`${name}: accepts what a person would type, rejects what they would not`, () => {
      for (const value of valid) {
        expect(checkFormat(name, value), `${name} should accept ${JSON.stringify(value)}`).toBe(true);
      }
      for (const value of invalid) {
        expect(checkFormat(name, value), `${name} should reject ${JSON.stringify(value)}`).toBe(false);
      }
    });
  }

  it("reaches a format through a definition, not only through checkFormat", () => {
    expect(rules(oneField({ type: "string", format: "iban" }), { value: "DE89370400440532013000" })).toEqual([]);
    expect(rules(oneField({ type: "string", format: "iban" }), { value: "DE89370400440532013001" }))
      .toEqual(["value:format"]);
  });

  it("takes a platform-specific checker through registerFormat", () => {
    expect(hasFormat("faqir-test-ticket")).toBe(false);
    registerFormat("faqir-test-ticket", (value) => /^FQ-\d{4}$/.test(value));
    expect(hasFormat("faqir-test-ticket")).toBe(true);
    expect(formatNames()).toContain("faqir-test-ticket");
    expect(rules(oneField({ type: "string", format: "faqir-test-ticket" }), { value: "FQ-0001" })).toEqual([]);
    expect(rules(oneField({ type: "string", format: "faqir-test-ticket" }), { value: "FQ-1" }))
      .toEqual(["value:format"]);
  });

  it("refuses a name or a checker that is not one", () => {
    expect(() => registerFormat("", () => true)).toThrow(/non-empty name/);
    // @ts-expect-error — the runtime guard is the point of the case
    expect(() => registerFormat("bad", "nope")).toThrow(/needs a function/);
  });
});

describe("coercion", () => {
  const def = {
    version: "1",
    fields: {
      age: { type: "integer" },
      price: { type: "number" },
      terms: { type: "boolean" },
      name: { type: "string" },
      channels: { type: "array", items: { type: "string" } },
      scores: { type: "array", items: { type: "integer" } },
    },
  };

  const table: [string, Record<string, unknown>, Record<string, unknown>][] = [
    ["an integer string", { age: "42" }, { age: 42 }],
    ["a negative number string", { price: "-19.99" }, { price: -19.99 }],
    ["an exponent string", { price: "1e3" }, { price: 1000 }],
    ["a leading-dot number", { price: ".5" }, { price: 0.5 }],
    ["surrounding whitespace on a number", { age: "  42  " }, { age: 42 }],
    ["a non-numeric string, left alone", { age: "forty" }, { age: "forty" }],
    ["a blank number, dropped", { age: "" }, {}],
    ["a whitespace-only number, dropped", { age: "  " }, {}],
    ["a checkbox's \"on\"", { terms: "on" }, { terms: true }],
    ["\"true\" and \"YES\"", { terms: "TRUE" }, { terms: true }],
    ["\"off\" and \"0\"", { terms: "0" }, { terms: false }],
    ["a boolean that is neither, left alone", { terms: "maybe" }, { terms: "maybe" }],
    ["a string, verbatim including its spaces", { name: " Ada " }, { name: " Ada " }],
    ["a blank string, dropped", { name: "" }, {}],
    ["a lone checkbox value, wrapped", { channels: "email" }, { channels: ["email"] }],
    ["an empty checkbox group", { channels: "" }, { channels: [] }],
    ["a list, typed item by item", { scores: ["1", "2"] }, { scores: [1, 2] }],
    ["a list with a blank entry, which is dropped", { scores: ["1", "", "3"] }, { scores: [1, 3] }],
    ["already-typed data, unchanged", { age: 42, terms: false }, { age: 42, terms: false }],
    ["an unknown key, carried through", { csrf: "t0ken" }, { csrf: "t0ken" }],
  ];

  for (const [label, raw, expected] of table) {
    it(`coerces ${label}`, () => {
      expect(coerce(asDefinition(def), raw)).toEqual(expected);
    });
  }

  it("un-flattens the dotted names @faqir-ui/forms puts in `name` attributes", () => {
    const nested = {
      version: "1",
      fields: {
        address: {
          type: "object",
          properties: {
            street: { type: "string" },
            geo: { type: "object", properties: { lat: { type: "number" } } },
          },
        },
      },
    };
    expect(coerce(asDefinition(nested), { "address.street": "12 Main", "address.geo.lat": "45.75" }))
      .toEqual({ address: { street: "12 Main", geo: { lat: 45.75 } } });
  });

  it("un-flattens bracketed row names into a real array", () => {
    const rows = {
      version: "1",
      fields: { rows: { type: "array", items: { type: "object", properties: { qty: { type: "integer" } } } } },
    };
    expect(coerce(asDefinition(rows), { "rows[0].qty": "2", "rows[1].qty": "3" }))
      .toEqual({ rows: [{ qty: 2 }, { qty: 3 }] });
  });

  it("leaves a dotted key alone when its root is not a declared field", () => {
    expect(coerce(asDefinition(def), { "utm.source": "newsletter" })).toEqual({ "utm.source": "newsletter" });
  });

  it("returns an empty object for input that is not a record", () => {
    expect(coerce(asDefinition(def), null)).toEqual({});
    expect(coerce(asDefinition(def), "nope")).toEqual({});
  });

  it("does not mutate the input it was given", () => {
    const raw = { age: "42", nested: { keep: 1 } };
    const snapshot = structuredClone(raw);
    coerce(asDefinition(def), raw);
    expect(raw).toEqual(snapshot);
  });
});

describe("messages", () => {
  it("walks locale → default locale → built-in → the key", () => {
    const messages = { ro: { required: "Obligatoriu." }, en: { required: "Required." } };
    const at = (options: Parameters<typeof resolveMessage>[0]) => resolveMessage(options);

    expect(at({ messages, locale: "ro", path: "a", rule: "required" })).toBe("Obligatoriu.");
    expect(at({ messages, locale: "fr", path: "a", rule: "required" })).toBe("Required.");
    expect(at({ messages: {}, locale: "fr", path: "a", rule: "required" }))
      .toBe(DEFAULT_MESSAGES.required);
    expect(at({ messages: {}, path: "a", rule: "no-such-rule" })).toBe("no-such-rule");
  });

  it("prefers the path-specific key over the rule key, in every layer", () => {
    const messages = { en: { required: "Required.", "a.required": "We need this one." } };
    expect(resolveMessage({ messages, path: "a", rule: "required" })).toBe("We need this one.");
    expect(resolveMessage({ messages, path: "b", rule: "required" })).toBe("Required.");
  });

  it("interpolates by name and leaves an unmatched placeholder standing", () => {
    expect(interpolate("At least {limit}.", { limit: 3 })).toBe("At least 3.");
    expect(interpolate("At least {limit}.", {})).toBe("At least {limit}.");
    expect(interpolate("One of {allowed}.", { allowed: ["a", "b"] })).toBe("One of a, b.");
    expect(interpolate("No placeholders here.", { limit: 3 })).toBe("No placeholders here.");
  });

  it("keeps {path} and {title} out of the finding's params", () => {
    const def = {
      version: "1",
      fields: { value: { type: "string", title: "Your name", required: true } },
      messages: { en: { required: "{title} is required." } },
    };
    const [finding] = validate(asDefinition(def), {}).findings;
    expect(finding.message).toBe("Your name is required.");
    expect(finding.params).toEqual({});
  });

  it("has a built-in sentence for every rule the validator emits", () => {
    for (const rule of SHAPE_RULES) {
      expect(DEFAULT_MESSAGES[rule], `no default message for "${rule}"`).toBeTypeOf("string");
    }
    expect(Object.keys(DEFAULT_MESSAGES).sort()).toEqual([...SHAPE_RULES].sort());
  });

  it("uses the same sentences faqir-validate shows for the equivalent ValidityState flag", () => {
    // The two must not drift: a field checked natively in the browser and the
    // same field re-checked on a server would otherwise disagree about its own
    // wording. The plugin's table is `[flag, attributeSuffix, fallback]`.
    const plugin = readFileSync(join(ROOT, "registry/core/plugins/faqir-validate.js"), "utf8");
    const table = new Map<string, string>();
    for (const [, flag, message] of plugin.matchAll(/\["(\w+)",\s*"\w+",\s*"([^"]+)"\]/g)) {
      table.set(flag, message);
    }
    expect(table.size).toBeGreaterThanOrEqual(9);

    const shared: [string, string][] = [
      ["required", "valueMissing"],
      ["type", "typeMismatch"],
      ["format", "typeMismatch"],
      ["pattern", "patternMismatch"],
      ["minLength", "tooShort"],
      ["maxLength", "tooLong"],
      ["minimum", "rangeUnderflow"],
      ["maximum", "rangeOverflow"],
      ["exclusiveMinimum", "rangeUnderflow"],
      ["exclusiveMaximum", "rangeOverflow"],
      ["multipleOf", "stepMismatch"],
    ];
    for (const [rule, flag] of shared) {
      expect(DEFAULT_MESSAGES[rule], `${rule} vs ${flag}`).toBe(table.get(flag)!);
    }
  });
});

describe("the verdict's shape", () => {
  it("carries both halves, and a definition with no rules leaves the rules half empty", () => {
    const verdict = validate(oneField({ type: "string" }), { value: "ok" });
    expect(Object.keys(verdict).sort())
      .toEqual(["computed", "findings", "next", "pending", "required", "valid", "visible"]);
    expect(verdict.computed).toEqual({});
    expect(verdict.visible).toEqual({});
    expect(verdict.required).toEqual({});
    expect(verdict.next).toEqual({});
    expect(verdict.pending).toEqual([]);
  });

  it("gives every finding a path, a rule, a message and params", () => {
    const verdict = validate(oneField({ type: "string", minLength: 3 }), { value: "a" });
    expect(verdict.findings).toEqual([
      { path: "value", rule: "minLength", message: "Please lengthen this value.", params: { limit: 3, actual: 1 } },
    ]);
  });

  it("is deterministic — the same inputs give an identical verdict every time", () => {
    const def = {
      version: "1",
      fields: {
        b: { type: "string", required: true },
        a: { type: "integer", minimum: 1 },
      },
    };
    const once = JSON.stringify(validate(asDefinition(def), { a: 0 }));
    for (let i = 0; i < 5; i++) {
      expect(JSON.stringify(validate(asDefinition(def), { a: 0 }))).toBe(once);
    }
  });
});
