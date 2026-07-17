import { beforeAll, describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { auditHtmlSource } from "../../../src/audit/checker";
import { loadRegistryManifestMap } from "../../../src/utils/components";
import { getRegistryPath } from "../../../src/utils/fs";
import { DEFAULT_RADIO_THRESHOLD, renderForm } from "../src/index.js";
import type { ObjectSchema, RenderFormOptions, UISchema } from "../src/index.js";
import { GOLDEN_CASES } from "./cases";

const GOLDEN_DIR = join(import.meta.dir, "golden");
let manifests: Awaited<ReturnType<typeof loadRegistryManifestMap>>;

beforeAll(async () => {
  manifests = await loadRegistryManifestMap(getRegistryPath());
});

describe("renderForm scalar golden files", () => {
  for (const fixture of GOLDEN_CASES) {
    it(`renders ${fixture.name}`, () => {
      const actual = renderForm(fixture.schema, fixture.uiSchema, fixture.opts);
      const expected = readFileSync(join(GOLDEN_DIR, `${fixture.name}.html`), "utf8");
      expect(actual).toBe(expected);
    });
  }
});

describe("renderForm scalar contracts", () => {
  it("uses a documented four-option radio threshold", () => {
    expect(DEFAULT_RADIO_THRESHOLD).toBe(4);

    const schema = (count: number): ObjectSchema => ({
      type: "object",
      properties: { choice: { type: "string", enum: Array.from({ length: count }, (_, index) => `v${index}`) } },
    });

    expect(renderForm(schema(4))).toContain('data-ui="radio-group"');
    expect(renderForm(schema(5))).toContain('data-ui="select"');
    expect(renderForm(schema(2), {}, { radioThreshold: 1 })).toContain('data-ui="select"');
  });

  it("allows explicit enum widgets to override cardinality", () => {
    const small: ObjectSchema = { type: "object", properties: { choice: { type: "string", enum: ["a", "b"] } } };
    const large: ObjectSchema = { type: "object", properties: { choice: { type: "string", enum: ["a", "b", "c", "d", "e"] } } };
    expect(renderForm(small, { choice: { widget: "select" } })).toContain('data-ui="select"');
    expect(renderForm(large, { choice: { "ui:widget": "radio" } })).toContain('data-ui="radio-group"');
  });

  it("propagates required and maps title/description", () => {
    const html = renderForm({
      type: "object",
      properties: {
        account_owner: { type: "string", title: "Account owner", description: "Legal name." },
        fallback_name: { type: "string" },
      },
      required: ["account_owner"],
    });

    expect(html).toContain('Account owner <span data-part="required">*</span>');
    expect(html).toContain('name="account_owner" required aria-required="true"');
    expect(html).toContain('data-part="description" id="faqir-field-account_owner-hint">Legal name.</p>');
    expect(html).toContain('aria-describedby="faqir-field-account_owner-hint faqir-field-account_owner-error"');
    expect(html).toContain('for="faqir-field-fallback_name">Fallback name</label>');
  });

  it("is deterministic, collision-safe, and escapes schema-controlled HTML", () => {
    const schema: ObjectSchema = {
      type: "object",
      properties: {
        "a b": { type: "string", title: "<b>Unsafe</b>" },
        "a-b": { type: "string", description: '"quoted" & text' },
      },
    };
    const first = renderForm(schema);
    expect(renderForm(schema)).toBe(first);
    expect(first).toContain('id="faqir-field-a-b"');
    expect(first).toContain('id="faqir-field-a-b-2"');
    expect(first).toContain("&lt;b&gt;Unsafe&lt;/b&gt;");
    expect(first).toContain("&quot;quoted&quot; &amp; text");
  });
});

describe("renderForm strict failures", () => {
  const base = (): ObjectSchema => ({ type: "object", properties: { value: { type: "string" } } });
  const renderUnchecked = (schema: unknown, uiSchema: unknown = {}, opts: unknown = {}) =>
    renderForm(schema as ObjectSchema, uiSchema as UISchema, opts as RenderFormOptions);

  it("rejects unsupported schema features instead of skipping them", () => {
    expect(() => renderUnchecked({ ...base(), oneOf: [] })).toThrow('unsupported keyword "oneOf" at jsonSchema');
    expect(() => renderUnchecked({ type: "object", properties: { nested: { type: "object", properties: {} } } })).toThrow("jsonSchema.properties.nested.properties must declare at least one property");
    expect(() => renderUnchecked({ type: "object", properties: { values: { type: "array", items: {} } } })).toThrow("jsonSchema.properties.values.items.type must be a string");
    expect(() => renderUnchecked({ type: "object", properties: { values: { type: "array", items: { type: "number" } } } })).toThrow('unsupported array item type "number"');
    expect(() => renderUnchecked({ type: "object", properties: { value: { type: "string", format: "password" } } })).toThrow('unsupported format "password"');
  });

  it("rejects malformed composite schemas instead of skipping them", () => {
    const enumArray = (extra: object = {}, items: object = { type: "string", enum: ["a", "b"] }) =>
      ({ type: "object", properties: { tags: { type: "array", items, ...extra } } });
    expect(() => renderUnchecked(enumArray({ uniqueItems: false }))).toThrow("uniqueItems must be true");
    expect(() => renderUnchecked(enumArray({ default: ["zzz"] }))).toThrow('contains "zzz", which is not one of its enum values');
    expect(() => renderUnchecked(enumArray({ minItems: 1 }))).toThrow('unsupported keyword "minItems"');

    const rows = (items: object) => ({ type: "object", properties: { rows: { type: "array", items } } });
    expect(() => renderUnchecked(rows({ type: "object", properties: { child: { type: "object", properties: { x: { type: "string" } } } } })))
      .toThrow("repeatable group rows support scalar fields only");
    expect(() => renderUnchecked(rows({ type: "object", properties: { "bad'name": { type: "string" } } })))
      .toThrow("property names must match");
    expect(() => renderUnchecked({
      type: "object",
      properties: { rows: { type: "array", minItems: 3, maxItems: 2, items: { type: "object", properties: { x: { type: "string" } } } } },
    })).toThrow("minItems cannot exceed maxItems");
  });

  it("rejects malformed composite UI schemas", () => {
    const nested: ObjectSchema = {
      type: "object",
      properties: { address: { type: "object", properties: { street: { type: "string" } } } },
    };
    expect(() => renderUnchecked(nested, { address: { widget: "input" } }))
      .toThrow("nested object UI schemas mirror the schema structure");

    const rows: ObjectSchema = {
      type: "object",
      properties: {
        rows: {
          type: "array",
          items: { type: "object", properties: { kind: { type: "string", enum: ["a", "b"] } } },
        },
      },
    };
    expect(() => renderUnchecked(rows, { rows: { items: { missing: {} } } })).toThrow('unknown row property "missing"');
    expect(() => renderUnchecked(rows, { rows: { items: { kind: { widget: "radio" } } } })).toThrow("incompatible");

    const flat: ObjectSchema = { type: "object", properties: { a: { type: "string" }, b: { type: "string" } } };
    expect(() => renderUnchecked(flat, { "ui:groups": [{ fields: ["a"] }] })).toThrow('does not place property "b"');
    expect(() => renderUnchecked(flat, { "ui:groups": [{ fields: ["a", "a", "b"] }] })).toThrow("values must be unique");
    expect(() => renderUnchecked(flat, { "ui:groups": [{ fields: ["a", "b", "zzz"] }] })).toThrow('references unknown property "zzz"');
    expect(() => renderUnchecked(flat, { "ui:wizard": { steps: [{ title: "One", fields: ["a", "b"] }] } }))
      .toThrow("at least two steps");
    expect(() => renderUnchecked(flat, {
      "ui:groups": [{ fields: ["a", "b"] }],
      "ui:wizard": { steps: [{ title: "One", fields: ["a"] }, { title: "Two", fields: ["b"] }] },
    })).toThrow('cannot combine "ui:groups" with "ui:wizard"');
  });

  it("rejects unknown or incompatible UI schema", () => {
    expect(() => renderUnchecked(base(), { missing: { widget: "input" } })).toThrow('uiSchema references unknown property "missing"');
    expect(() => renderUnchecked(base(), { value: { widget: "slider" } })).toThrow('unsupported widget "slider"');
    expect(() => renderUnchecked(base(), { value: { widget: "switch" } })).toThrow('widget "switch" is incompatible');
    expect(() => renderUnchecked(base(), { value: { widget: "textarea", "ui:widget": "input" } })).toThrow("conflicts");
    expect(() => renderUnchecked(base(), { value: { rows: 3 } })).toThrow("rows is supported only with the textarea widget");
  });

  it("rejects malformed constraints and dangling required names", () => {
    expect(() => renderUnchecked({ ...base(), required: ["missing"] })).toThrow('required references unknown property "missing"');
    expect(() => renderUnchecked({ type: "object", properties: { count: { type: "integer", default: 1.5 } } })).toThrow('default must match type "integer"');
    expect(() => renderUnchecked({ type: "object", properties: { count: { type: "number", multipleOf: 0 } } })).toThrow("multipleOf must be greater than zero");
    expect(() => renderUnchecked({ type: "object", properties: { value: { type: "string", minLength: 5, maxLength: 2 } } })).toThrow("minLength cannot exceed maxLength");
  });
});

describe("renderForm composite contracts", () => {
  it("uses the shared cardinality threshold for enum arrays", () => {
    const schema = (count: number): ObjectSchema => ({
      type: "object",
      properties: {
        tags: { type: "array", items: { type: "string", enum: Array.from({ length: count }, (_, i) => `v${i}`) } },
      },
    });
    expect(renderForm(schema(4))).toContain('data-ui="checkbox-group"');
    expect(renderForm(schema(5))).toContain("<select data-ui=\"select\" multiple");
    expect(renderForm(schema(5), { tags: { widget: "checkbox-group" } })).toContain('data-ui="checkbox-group"');
    expect(renderForm(schema(2), { tags: { "ui:widget": "multi-select" } })).toContain("multiple");
  });

  it("gives nested object children dotted names and path-derived ids", () => {
    const html = renderForm({
      type: "object",
      properties: {
        address: {
          type: "object",
          title: "Address",
          properties: { street: { type: "string", title: "Street" } },
          required: ["street"],
        },
      },
    });
    expect(html).toContain("<fieldset data-ui=\"card\" data-variant=\"outlined\">");
    expect(html).toContain('<legend data-part="title">Address</legend>');
    expect(html).toContain('id="faqir-field-address-street"');
    expect(html).toContain('name="address.street"');
    expect(html).toContain('name="address.street" required aria-required="true"');
  });

  it("drives repeatable groups from l-data with keyed l-for and row-unique bindings", () => {
    const html = renderForm({
      type: "object",
      properties: {
        meds: {
          type: "array",
          title: "Medications",
          minItems: 2,
          maxItems: 4,
          items: { type: "object", properties: { name: { type: "string" } }, required: ["name"] },
        },
      },
    });
    expect(html).toContain('l-data="{ rowsMeds: [{ __key: 1 }, { __key: 2 }], seqMeds: 2 }"');
    expect(html).toContain('<template l-for="(row, rowIndex) in rowsMeds" l-key="row.__key">');
    expect(html).toContain('id="faqir-field-meds-item-name"');
    expect(html).toContain(':id="&#39;faqir-field-meds-&#39; + row.__key + &#39;-name&#39;"');
    expect(html).toContain('name="meds[].name"');
    expect(html).toContain(':name="&#39;meds[&#39; + rowIndex + &#39;].name&#39;"');
    expect(html).toContain('@click="rowsMeds.splice(rowIndex, 1)" :disabled="rowsMeds.length &lt;= 2"');
    expect(html).toContain('@click="rowsMeds.push({ __key: (seqMeds = seqMeds + 1) })" :disabled="rowsMeds.length &gt;= 4"');
  });

  it("renders layout groups as fieldset cards without renaming fields", () => {
    const html = renderForm(
      { type: "object", properties: { a: { type: "string" }, b: { type: "string" } } },
      { "ui:groups": [{ title: "First", description: "One field.", fields: ["a"] }, { fields: ["b"] }] },
    );
    expect(html).toContain('<legend data-part="title">First</legend>');
    expect(html).toContain('<p data-part="description">One field.</p>');
    expect(html).toContain('name="a"');
    expect(html).toContain('id="faqir-field-b"');
    expect((html.match(/<fieldset data-ui="card"/g) ?? []).length).toBe(2);
  });

  it("renders wizards with a stepper, gated panels, and step-scoped controls", () => {
    const html = renderForm(
      { type: "object", properties: { a: { type: "string" }, b: { type: "string" } }, required: ["a"] },
      { "ui:wizard": { steps: [{ title: "One", fields: ["a"] }, { title: "Two", fields: ["b"] }] } },
    );
    expect(html).toContain('l-data="{ step: 0 }"');
    expect(html).toContain('l-validate="step &lt; 1 ? (step = step + 1) : ($el.dataset.state = &#39;submitted&#39;)"');
    expect(html).toContain('<div data-ui="stepper" role="navigation" aria-label="Form steps">');
    expect(html).toContain('<div data-part="step" data-state="active" :data-state="step &gt; 0 ?');
    expect(html).toContain('<section data-ui="card" data-variant="outlined" :hidden="step !== 0"');
    expect(html).toContain('<section data-ui="card" data-variant="outlined" :hidden="step !== 1"');
    expect(html).toContain('name="a" required aria-required="true" aria-describedby="faqir-field-a-error" :disabled="step !== 0"');
    expect(html).toContain('name="b" aria-describedby="faqir-field-b-error" :disabled="step !== 1"');
    expect(html).toContain(">Back</button>");
    expect(html).toContain(':hidden="step === 1">Next</button>');
    expect(html).toContain(':hidden="step !== 1">Submit</button>');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §7.2 widget-mapping table — this checklist mirrors FAQIR-NEXT.md §7.2 and the
// README mapping table row for row. Every supported schema shape must produce
// its documented widget.
// ─────────────────────────────────────────────────────────────────────────────
describe("§7.2 widget-mapping table", () => {
  const field = (schema: object, ui?: object, rootExtra?: object): [ObjectSchema, UISchema] => [
    { type: "object", properties: { f: schema as never }, ...(rootExtra ?? {}) } as ObjectSchema,
    (ui ? { f: ui } : {}) as UISchema,
  ];

  const MAPPING: Array<{ row: string; schema: [ObjectSchema, UISchema]; expects: string[] }> = [
    { row: "string → input[type=text]", schema: field({ type: "string" }), expects: ['<input data-ui="input"', 'type="text"'] },
    { row: "string + widget textarea → textarea", schema: field({ type: "string" }, { widget: "textarea" }), expects: ['<textarea data-ui="textarea"'] },
    { row: "string + enum (≤4) → radio group", schema: field({ type: "string", enum: ["a", "b"] }), expects: ['data-ui="radio-group"', 'role="radiogroup"'] },
    { row: "string + enum (>4) → select", schema: field({ type: "string", enum: ["a", "b", "c", "d", "e"] }), expects: ['<select data-ui="select"'] },
    { row: "string + format date → date-picker", schema: field({ type: "string", format: "date" }), expects: ['data-ui="date-picker"', 'data-ui="calendar"'] },
    { row: "string + format email → input[type=email]", schema: field({ type: "string", format: "email" }), expects: ['type="email"'] },
    { row: "string + format uri → input[type=url]", schema: field({ type: "string", format: "uri" }), expects: ['type="url"'] },
    { row: "number → input[type=number]", schema: field({ type: "number" }), expects: ['type="number"'] },
    { row: "integer → input[type=number][step=1]", schema: field({ type: "integer" }), expects: ['type="number" step="1"'] },
    { row: "boolean → checkbox", schema: field({ type: "boolean" }), expects: ['data-ui="checkbox" type="checkbox"'] },
    { row: "boolean + widget switch → switch", schema: field({ type: "boolean" }, { widget: "switch" }), expects: ['data-ui="switch" type="checkbox" role="switch"'] },
    { row: "nested object → fieldset card", schema: field({ type: "object", properties: { x: { type: "string" } } }), expects: ['<fieldset data-ui="card"', '<div data-part="body">'] },
    { row: "array of enum (≤4) → checkbox group", schema: field({ type: "array", items: { type: "string", enum: ["a", "b"] } }), expects: ['data-ui="checkbox-group"', 'role="group"'] },
    { row: "array of enum (>4) → multi-select", schema: field({ type: "array", items: { type: "string", enum: ["a", "b", "c", "d", "e"] } }), expects: ['<select data-ui="select" multiple'] },
    { row: "array of objects → repeatable group (l-data + keyed l-for)", schema: field({ type: "array", items: { type: "object", properties: { x: { type: "string" } } } }), expects: ["l-data=", "<template l-for=", 'l-key="row.__key"'] },
    {
      row: "uiSchema ui:groups → layout groups",
      schema: [
        { type: "object", properties: { f: { type: "string" } } },
        { "ui:groups": [{ title: "G", fields: ["f"] }] },
      ],
      expects: ['<fieldset data-ui="card"', '<legend data-part="title">G</legend>'],
    },
    {
      row: "uiSchema ui:wizard → multi-step wizard pattern",
      schema: [
        { type: "object", properties: { f: { type: "string" }, g: { type: "string" } } },
        { "ui:wizard": { steps: [{ title: "One", fields: ["f"] }, { title: "Two", fields: ["g"] }] } },
      ],
      expects: ['data-ui="stepper"', '<section data-ui="card"', 'l-data="{ step: 0 }"'],
    },
  ];

  for (const entry of MAPPING) {
    it(entry.row, () => {
      const html = renderForm(entry.schema[0], entry.schema[1]);
      for (const expected of entry.expects) expect(html).toContain(expected);
    });
  }
});

describe("§7.2 audit quality gate", () => {
  it("keeps every golden schema — scalar and composite — at exactly zero faqir audit findings", () => {
    for (const fixture of GOLDEN_CASES) {
      const source = renderForm(fixture.schema, fixture.uiSchema, fixture.opts);
      const findings = auditHtmlSource({ source, file: `${fixture.name}.html`, manifests });
      expect(findings, `${fixture.name}: ${findings.map((finding) => `${finding.rule_id}: ${finding.message}`).join("\n")}`).toEqual([]);
    }
  });
});
