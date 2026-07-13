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
    expect(() => renderUnchecked({ type: "object", properties: { nested: { type: "object", properties: {} } } })).toThrow('unsupported keyword "properties" at jsonSchema.properties.nested');
    expect(() => renderUnchecked({ type: "object", properties: { values: { type: "array", items: {} } } })).toThrow('unsupported keyword "items" at jsonSchema.properties.values');
    expect(() => renderUnchecked({ type: "object", properties: { value: { type: "string", format: "password" } } })).toThrow('unsupported format "password"');
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

describe("§7.2 audit quality gate", () => {
  it("keeps every scalar golden schema at exactly zero faqir audit findings", () => {
    for (const fixture of GOLDEN_CASES) {
      const source = renderForm(fixture.schema, fixture.uiSchema, fixture.opts);
      const findings = auditHtmlSource({ source, file: `${fixture.name}.html`, manifests });
      expect(findings, `${fixture.name}: ${findings.map((finding) => `${finding.rule_id}: ${finding.message}`).join("\n")}`).toEqual([]);
    }
  });
});
