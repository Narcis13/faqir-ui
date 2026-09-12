// `rules.schema.json` and `validateDefinition()` are two readings of one
// document, and this file is the only thing stopping them from drifting apart.
//
// The schema is what a platform hands a model for structured output; the
// function is what `faqir rules lint` runs, in a package that will never take a
// JSON Schema dependency to read its own schema. So neither can be derived from
// the other, and "they agree" has to be *measured*: an accept/reject corpus,
// run through both, case by case. A case the schema accepts and the function
// refuses (or the reverse) fails here, naming itself.
//
// The corpus is written as JSON text rather than as object literals on purpose.
// `{ minLength: NaN }` is expressible in JavaScript and not in JSON, and a
// definition arrives as JSON in every path that matters — a file, a `<script
// type="application/json">`, a model's structured output.

import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { validateAgainstSchema } from "../../../src/utils/json-schema";
import { RULES_SCHEMA_ID_URL } from "../../../src/canonical";
import { DRAFT_07_META_SCHEMA } from "../../../src/utils/draft-07-meta";
import { FIELD_KEYWORDS, RULE_KEYS, compile, validateDefinition } from "../src/index.js";
import { loadCorpus } from "./corpus";

const SCHEMA_PATH = join(import.meta.dir, "..", "rules.schema.json");
const schema = JSON.parse(readFileSync(SCHEMA_PATH, "utf8")) as Record<string, any>;

/** Every definition that must validate. */
const ACCEPT: [string, string][] = [
  ["the empty definition", '{}'],
  ["a version and nothing else", '{"version":"1"}'],
  ["one string field", '{"fields":{"email":{"type":"string","format":"email","required":true}}}'],
  ["every string keyword", '{"fields":{"code":{"type":"string","pattern":"^[A-Z]+$","minLength":2,"maxLength":8,"title":"Code","description":"Uppercase","enum":["AB","CD"]}}}'],
  ["an integer with every bound", '{"fields":{"age":{"type":"integer","minimum":0,"maximum":120,"exclusiveMinimum":-1,"exclusiveMaximum":121,"multipleOf":1}}}'],
  ["a number field", '{"fields":{"rate":{"type":"number","minimum":0.5}}}'],
  ["a boolean with a const", '{"fields":{"terms":{"type":"boolean","const":true}}}'],
  ["an object with required children", '{"fields":{"address":{"type":"object","required":["city"],"properties":{"city":{"type":"string"},"zip":{"type":"string","format":"postal-code"}}}}}'],
  ["an object required as a whole", '{"fields":{"address":{"type":"object","required":true,"properties":{"city":{"type":"string"}}}}}'],
  ["an array of objects", '{"fields":{"lines":{"type":"array","minItems":1,"maxItems":9,"uniqueItems":false,"items":{"type":"object","properties":{"qty":{"type":"integer"}}}}}}'],
  ["a top-level required list", '{"fields":{"a":{"type":"string"}},"required":["a"]}'],
  ["messages and a default locale", '{"messages":{"en":{"required":"Needed."},"ro":{"required":"Necesar."}},"defaultLocale":"ro"}'],
  ["a show rule", '{"fields":{"seats":{"type":"integer"}},"rules":[{"id":"r","show":"seats","when":true}]}'],
  ["a require rule", '{"fields":{"seats":{"type":"integer"}},"rules":[{"id":"r","require":"seats","when":{"var":"x"}}]}'],
  ["a validate rule with a message", '{"fields":{"end":{"type":"string"}},"rules":[{"id":"r","validate":{"!!":[{"var":"end"}]},"path":"end","message":"Needed."}]}'],
  ["a remote rule", '{"fields":{"email":{"type":"string"}},"rules":[{"id":"r","validate":"remote","path":"email","remote":"/api/check"}]}'],
  ["a compute rule", '{"fields":{"total":{"type":"number"}},"rules":[{"id":"r","compute":"total","value":{"+":[1,2]}}]}'],
  ["an unconditional jump", '{"rules":[{"id":"r","jump":"done","from":"start"}]}'],
  ["a conditional jump", '{"rules":[{"id":"r","jump":"done","from":"start","when":{"var":"skip"}}]}'],
];

/** Every definition that must be refused, and the reason it is interesting. */
const REJECT: [string, string][] = [
  ["not an object at all", '[]'],
  ["a string", '"nope"'],
  ["an unsupported top-level key", '{"feilds":{}}'],
  ["a version this package does not implement", '{"version":"2"}'],
  ["fields as an array", '{"fields":[]}'],
  ["an empty field path", '{"fields":{"":{"type":"string"}}}'],
  ["a field with no type", '{"fields":{"a":{"minLength":2}}}'],
  ["a field type nobody implements", '{"fields":{"a":{"type":"money"}}}'],
  ["the misspelling that silently does nothing", '{"fields":{"a":{"type":"string","maxlength":3}}}'],
  ["a numeric keyword on a string field", '{"fields":{"a":{"type":"string","minimum":3}}}'],
  ["a string keyword on a number field", '{"fields":{"a":{"type":"number","maxLength":3}}}'],
  ["minLength as a string", '{"fields":{"a":{"type":"string","minLength":"3"}}}'],
  ["a pattern that is not a string", '{"fields":{"a":{"type":"string","pattern":7}}}'],
  ["an empty enum", '{"fields":{"a":{"type":"string","enum":[]}}}'],
  ["required listing names on a string field", '{"fields":{"a":{"type":"string","required":["b"]}}}'],
  ["required as false", '{"fields":{"a":{"type":"string","required":false}}}'],
  ["properties on an array field", '{"fields":{"a":{"type":"array","properties":{}}}}'],
  ["uniqueItems as a string", '{"fields":{"a":{"type":"array","uniqueItems":"yes"}}}'],
  ["a broken schema nested in items", '{"fields":{"a":{"type":"array","items":{"type":"string","maxlength":3}}}}'],
  ["a broken schema nested in properties", '{"fields":{"a":{"type":"object","properties":{"b":{"type":"nope"}}}}}'],
  ["required as an object", '{"required":{}}'],
  ["a required entry that is not a string", '{"required":[7]}'],
  ["a message table that is not an object", '{"messages":{"en":"Needed."}}'],
  ["a message that is not a string", '{"messages":{"en":{"required":7}}}'],
  ["an empty defaultLocale", '{"defaultLocale":""}'],
  ["rules as an object", '{"rules":{}}'],
  ["a rule that is not an object", '{"rules":[7]}'],
  ["a rule with no id", '{"rules":[{"show":"a","when":true}]}'],
  ["a rule with an empty id", '{"rules":[{"id":"","show":"a","when":true}]}'],
  ["a rule with no verb", '{"rules":[{"id":"r","when":true}]}'],
  ["a rule with two verbs", '{"rules":[{"id":"r","show":"a","require":"a","when":true}]}'],
  ["a show rule with no when", '{"rules":[{"id":"r","show":"a"}]}'],
  ["a show rule with a stray key", '{"rules":[{"id":"r","show":"a","when":true,"path":"a"}]}'],
  ["a show target that is not a string", '{"rules":[{"id":"r","show":7,"when":true}]}'],
  ["a compute with no value", '{"rules":[{"id":"r","compute":"a"}]}'],
  ["a validate with no path", '{"rules":[{"id":"r","validate":true}]}'],
  ["a validate whose message is not a string", '{"rules":[{"id":"r","validate":true,"path":"a","message":7}]}'],
  ["remote on a logic validate", '{"rules":[{"id":"r","validate":true,"path":"a","remote":"/api"}]}'],
  ["a remote rule with no remote", '{"rules":[{"id":"r","validate":"remote","path":"a"}]}'],
  ["a jump with no from", '{"rules":[{"id":"r","jump":"b"}]}'],
];

/** `[valid by the schema, valid by the function]` for one definition. */
function verdicts(text: string): [boolean, boolean] {
  const definition = JSON.parse(text);
  return [
    validateAgainstSchema(schema, definition).length === 0,
    validateDefinition(definition).valid,
  ];
}

describe("rules.schema.json is a schema", () => {
  it("validates against the Draft-07 meta-schema", () => {
    expect(validateAgainstSchema(DRAFT_07_META_SCHEMA, schema)).toEqual([]);
  });

  it("carries the identity a cached copy is recognised by", () => {
    expect(schema.$schema).toBe("http://json-schema.org/draft-07/schema#");
    // The one place the URL is written twice — the JSON a consumer reads, and
    // the constant the CLI and the README quote. They must be the same bytes.
    expect(schema.$id).toBe(RULES_SCHEMA_ID_URL);
    expect(RULES_SCHEMA_ID_URL).toBe(
      "https://raw.githubusercontent.com/Narcis13/faqir-ui/main/packages/rules/rules.schema.json",
    );
    expect(typeof schema.description).toBe("string");
  });

  it("states the same field vocabulary the validator enforces", () => {
    // The branch names the schema uses, mapped to the types they cover. A
    // keyword added to `FIELD_KEYS` in shape.js and not to the schema fails
    // here rather than in whatever a model generates six months later.
    const branches: Record<string, string[]> = {
      stringField: ["string"],
      numericField: ["number", "integer"],
      booleanField: ["boolean"],
      objectField: ["object"],
      arrayField: ["array"],
    };
    for (const [branch, types] of Object.entries(branches)) {
      const keys = Object.keys(schema.definitions[branch].properties).sort();
      for (const type of types) {
        expect(keys, `${branch} does not match FIELD_KEYWORDS.${type}`).toEqual([...FIELD_KEYWORDS[type]]);
      }
    }
    expect(Object.keys(branches).length).toBe(schema.definitions.field.oneOf.length);
  });

  it("states the same rule vocabulary the engine enforces", () => {
    const branches: Record<string, string> = {
      showRule: "show",
      requireRule: "require",
      validateRule: "validate",
      remoteRule: "validate",
      computeRule: "compute",
      jumpRule: "jump",
    };
    for (const [branch, verb] of Object.entries(branches)) {
      const keys = Object.keys(schema.definitions[branch].properties);
      // The two `validate` branches split one key set between them; every other
      // verb's branch carries the whole thing.
      const allowed = [...RULE_KEYS[verb]];
      for (const key of keys) expect(allowed, `${branch}.${key} is not a ${verb} key`).toContain(key);
      if (verb !== "validate") expect(keys.sort()).toEqual([...allowed].sort());
    }
    expect([...RULE_KEYS.validate].sort()).toEqual(
      [...new Set([
        ...Object.keys(schema.definitions.validateRule.properties),
        ...Object.keys(schema.definitions.remoteRule.properties),
      ])].sort(),
    );
    expect(Object.keys(branches).length).toBe(schema.definitions.rule.oneOf.length);
  });
});

describe("the schema and validateDefinition agree", () => {
  for (const [name, text] of ACCEPT) {
    it(`accepts ${name}`, () => {
      const [bySchema, byFunction] = verdicts(text);
      expect(bySchema, "the schema refused it").toBe(true);
      expect(byFunction, "validateDefinition refused it").toBe(true);
    });
  }

  for (const [name, text] of REJECT) {
    it(`refuses ${name}`, () => {
      const [bySchema, byFunction] = verdicts(text);
      expect(bySchema, "the schema accepted it").toBe(false);
      expect(byFunction, "validateDefinition accepted it").toBe(false);
    });
  }

  it("refuses every rejection with a sentence naming where", () => {
    for (const [name, text] of REJECT) {
      const findings = validateDefinition(JSON.parse(text)).findings;
      expect(findings.length, name).toBeGreaterThan(0);
      for (const finding of findings) {
        expect(finding.rule).toBe("schema");
        expect(finding.severity).toBe("error");
        expect(typeof finding.path).toBe("string");
        expect(finding.message.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("the golden corpus validates against both", () => {
  const corpus = loadCorpus();

  it("has definitions to check", () => {
    expect(corpus.length).toBeGreaterThan(100);
  });

  for (const testCase of corpus) {
    it(`${testCase.name} — schema, function and compile all accept it`, () => {
      expect(validateAgainstSchema(schema, testCase.definition), "the schema refused it").toEqual([]);
      expect(validateDefinition(testCase.definition).valid, "validateDefinition refused it").toBe(true);
      // …and the engine itself, which is the third reading and the only one
      // that actually runs: a definition the corpus pins a verdict for must be
      // one all three accept.
      expect(() => compile(testCase.definition)).not.toThrow();
    });
  }
});
