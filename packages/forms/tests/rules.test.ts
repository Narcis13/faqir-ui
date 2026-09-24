import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { coerce, fromFormData, lintDefinition, validate } from "../../rules/src/index.js";
import { renderForm } from "../src/index.js";
import type { ObjectSchema, RenderFormOptions, UISchema } from "../src/index.js";
import {
  BILLING_RULES_OPTS,
  BILLING_RULES_SCHEMA,
  GOLDEN_CASES,
  PLAN_WIZARD_SCHEMA,
  PLAN_WIZARD_UI,
} from "./cases";

// @faqir-ui/forms emits rules. [1.1B-06 · §8.3]
//
// The renderer writes a `@faqir-ui/rules` definition beside the form; the
// definition is the contract the page and the server share, so these tests ask
// two questions of every emission: are the bytes what we meant (shape, escaping,
// derivation), and does `@faqir-ui/rules` itself accept them — `lintDefinition`
// is the same function behind `faqir rules lint`, so "lint-clean" here means
// lint-clean at the CLI.
//
// The last describe answers the third question, which neither of those can: does
// the emitted markup actually DO the thing, under faqir-core + faqir-validate +
// faqir-rules and nothing else.

/** The definition a rendered form carries, parsed back out of its JSON script. */
function definitionOf(html: string, prefix = "faqir"): Record<string, unknown> {
  const open = `<script type="application/json" id="${prefix}-rules">\n`;
  const start = html.indexOf(open);
  expect(start, `no rules script with id "${prefix}-rules"`).toBeGreaterThan(-1);
  const end = html.indexOf("\n</script>", start);
  return JSON.parse(html.slice(start + open.length, end));
}

function rulesOf(html: string, prefix?: string): Array<Record<string, unknown>> {
  return (definitionOf(html, prefix).rules ?? []) as Array<Record<string, unknown>>;
}

/** Every definition this file emits has to survive the package's own lint. */
function expectLintClean(definition: Record<string, unknown>): void {
  const report = lintDefinition(definition);
  expect(
    report.findings.map((finding) => `${finding.rule} ${finding.path}: ${finding.message}`),
  ).toEqual([]);
  expect(report.ok).toBe(true);
}

const CONDITIONAL: ObjectSchema = {
  type: "object",
  properties: {
    accountType: { type: "string", enum: ["personal", "business"] },
    company: { type: "string", minLength: 2 },
  },
  if: { properties: { accountType: { const: "business" } } },
  then: { properties: { company: {} }, required: ["company"] },
};

describe("renderForm rules emission", () => {
  it("emits nothing at all when there are no rules", () => {
    const html = renderForm({ type: "object", properties: { name: { type: "string" } } });
    expect(html).not.toContain("<script");
    expect(html).not.toContain("l-rules");
    expect(html).toContain("<!-- @ui:requires faqir-core.js faqir-validate.js -->");
  });

  it("writes the definition into a JSON script the form points at", () => {
    const html = renderForm(CONDITIONAL, {}, { idPrefix: "billing" });
    expect(html).toContain('<!-- @ui:requires faqir-core.js faqir-validate.js faqir-rules.js -->');
    expect(html).toContain('<script type="application/json" id="billing-rules">');
    expect(html).toContain('l-data l-validate l-rules="#billing-rules"');
    // The script sits beside the form, not inside it: `l-rules` is a selector.
    expect(html.indexOf("<script")).toBeLessThan(html.indexOf("<form"));
    expectLintClean(definitionOf(html, "billing"));
  });

  it("keeps the date-picker requirements when a rules form also has a date field", () => {
    const html = renderForm({
      type: "object",
      properties: { when: { type: "string", format: "date" }, note: { type: "string" } },
      dependentRequired: { when: ["note"] },
    });
    expect(html).toContain(
      "<!-- @ui:requires faqir-core.js faqir-validate.js faqir-rules.js date-picker.js calendar.js -->",
    );
  });

  it("escapes `<` so a script element cannot swallow the page", () => {
    const html = renderForm(
      { type: "object", properties: { qty: { type: "integer" }, cap: { type: "integer" } } },
      {},
      {
        rules: {
          rules: [{ id: "under-cap", validate: { "<=": [{ var: "qty" }, { var: "cap" }] }, path: "qty" }],
        },
      },
    );
    const script = html.slice(html.indexOf("<script"), html.indexOf("</script>"));
    // Nothing but the tag itself may carry a literal `<`: `</script` inside the
    // raw text would end the element at parse time, before the plugin sees it.
    expect(script.slice(script.indexOf(">") + 1)).not.toContain("<");
    expect(script).toContain("\\u003c=");
    expect(rulesOf(html)[0].validate).toEqual({ "<=": [{ var: "qty" }, { var: "cap" }] });
  });

  it("derives fields with the coercion types the widgets were chosen from", () => {
    const html = renderForm(
      {
        type: "object",
        properties: {
          name: { type: "string", title: "Name", minLength: 2, maxLength: 40, pattern: "[A-Za-z ]+", default: "Ada" },
          email: { type: "string", format: "email" },
          age: { type: "integer", minimum: 18, maximum: 120 },
          rate: { type: "number", step: 0.5 },
          agreed: { type: "boolean" },
          address: { type: "object", properties: { city: { type: "string" } }, required: ["city"] },
          tags: { type: "array", items: { type: "string", enum: ["a", "b"] }, uniqueItems: true },
          rows: {
            type: "array",
            minItems: 1,
            maxItems: 3,
            items: { type: "object", properties: { label: { type: "string" } }, required: ["label"] },
          },
        },
        required: ["name"],
        dependentRequired: { email: ["agreed"] },
      },
    );
    const definition = definitionOf(html);
    expect(definition.version).toBe("1");
    expect(definition.required).toEqual(["name"]);
    expect(definition.fields).toEqual({
      // `default` is a rendering concern; the rules package has no reading for
      // it, so it is left out rather than handed over as a constraint.
      name: { type: "string", title: "Name", pattern: "[A-Za-z ]+", minLength: 2, maxLength: 40 },
      email: { type: "string", format: "email" },
      age: { type: "integer", minimum: 18, maximum: 120 },
      // The HTML-oriented `step` alias arrives as what it aliases.
      rate: { type: "number", multipleOf: 0.5 },
      agreed: { type: "boolean" },
      address: { type: "object", properties: { city: { type: "string" } }, required: ["city"] },
      tags: { type: "array", items: { type: "string", enum: ["a", "b"] }, uniqueItems: true },
      rows: {
        type: "array",
        items: { type: "object", properties: { label: { type: "string" } }, required: ["label"] },
        minItems: 1,
        maxItems: 3,
      },
    });
    expectLintClean(definition);
  });

  it("merges the author's fields, messages and locale over the derived definition", () => {
    const html = renderForm(
      { type: "object", properties: { qty: { type: "integer" }, price: { type: "number" } } },
      {},
      {
        rules: {
          version: "1",
          fields: { total: { type: "number", title: "Total" } },
          required: ["qty"],
          messages: { en: { "total-positive": "The total must be positive." } },
          defaultLocale: "en",
          rules: [
            { id: "total", compute: "total", value: { "*": [{ var: "qty" }, { var: "price" }] } },
            { id: "total-positive", validate: { ">": [{ var: "total" }, 0] }, path: "total", message: "total-positive" },
          ],
        },
      },
    );
    const definition = definitionOf(html);
    expect(Object.keys(definition.fields as object)).toEqual(["qty", "price", "total"]);
    expect(definition.required).toEqual(["qty"]);
    expect(definition.defaultLocale).toBe("en");
    expect(rulesOf(html).map((rule) => rule.id)).toEqual(["total", "total-positive"]);
    expectLintClean(definition);
  });

  it("puts the author's rules first and never reuses one of their ids", () => {
    const html = renderForm(CONDITIONAL, {}, {
      rules: {
        rules: [
          { id: "show-company", show: "company", when: { "!": { missing: ["accountType"] } } },
          { id: "require-company", require: "company", when: { "!": { missing: ["accountType"] } } },
        ],
      },
    });
    // The derived pair wanted exactly those two ids, and took the next ones.
    expect(rulesOf(html).map((rule) => rule.id))
      .toEqual(["show-company", "require-company", "show-company-2", "require-company-2"]);
    expectLintClean(definitionOf(html));
  });
});

describe("renderForm derives rules from the schema", () => {
  it("turns if/then/else into show and require rules", () => {
    const html = renderForm({
      ...CONDITIONAL,
      else: { properties: { company: {} } },
    } as ObjectSchema);
    const condition = { "==": [{ var: "accountType" }, "business"] };
    expect(rulesOf(html)).toEqual([
      { id: "show-company", show: "company", when: condition },
      { id: "require-company", require: "company", when: condition },
      { id: "show-company-2", show: "company", when: { "!": condition } },
    ]);
    expectLintClean(definitionOf(html));
  });

  it("reads an enum test and a bare presence test in the same condition", () => {
    const html = renderForm({
      type: "object",
      properties: {
        region: { type: "string", enum: ["eu", "us", "apac"] },
        contact: { type: "string" },
        vat: { type: "string" },
      },
      if: { properties: { region: { enum: ["eu", "us"] } }, required: ["region", "contact"] },
      then: { required: ["vat"] },
    });
    expect(rulesOf(html)[0].when).toEqual({
      and: [
        { in: [{ var: "region" }, ["eu", "us"]] },
        { "!": { missing: ["contact"] } },
      ],
    });
    expectLintClean(definitionOf(html));
  });

  it("takes more than one conditional through allOf", () => {
    const html = renderForm({
      type: "object",
      properties: {
        kind: { type: "string", enum: ["a", "b"] },
        first: { type: "string" },
        second: { type: "string" },
      },
      allOf: [
        { if: { properties: { kind: { const: "a" } } }, then: { properties: { first: {} } } },
        { if: { properties: { kind: { const: "b" } } }, then: { properties: { second: {} } } },
      ],
    });
    expect(rulesOf(html).map((rule) => [rule.id, rule.show, (rule.when as any)["=="][1]]))
      .toEqual([["show-first", "first", "a"], ["show-second", "second", "b"]]);
    expectLintClean(definitionOf(html));
  });

  it("turns dependentRequired into a require rule per dependent", () => {
    const html = renderForm({
      type: "object",
      properties: {
        card: { type: "string" },
        billingStreet: { type: "string" },
        billingCity: { type: "string" },
      },
      dependentRequired: { card: ["billingStreet", "billingCity"] },
    });
    expect(rulesOf(html)).toEqual([
      { id: "require-billingstreet-with-card", require: "billingStreet", when: { "!": { missing: ["card"] } } },
      { id: "require-billingcity-with-card", require: "billingCity", when: { "!": { missing: ["card"] } } },
    ]);
    expectLintClean(definitionOf(html));
  });

  it("turns a wizard step's when into a jump, and wires the navigation to it", () => {
    const html = renderForm(PLAN_WIZARD_SCHEMA, PLAN_WIZARD_UI, { idPrefix: "plan" });
    expect(rulesOf(html, "plan")).toEqual([
      {
        id: "skip-step-2",
        jump: "2",
        from: "0",
        when: { "!": { "==": [{ var: "plan" }, "team"] } },
      },
      // …and the skipped page's fields are hidden on the same condition, so
      // a server's validate() never demands what the skip path never showed.
      { id: "show-step-2-seats", show: "seats", when: { "==": [{ var: "plan" }, "team"] } },
    ]);
    // Forward: the definition answers which page comes next.
    expect(html).toContain(
      'l-validate="step &lt; 2 ? (step = $rules.next[step] === undefined ? step + 1 : +$rules.next[step]) : ($el.dataset.state = &#39;submitted&#39;)"',
    );
    // Back: the same answer, read in reverse, so Back steps over a skipped page.
    expect(html).toContain('@click="step = $rules.next[step - 2] == step ? step - 2 : step - 1"');
    expectLintClean(definitionOf(html, "plan"));
  });

  it("leaves the wizard counting by one when nothing jumps", () => {
    const html = renderForm(PLAN_WIZARD_SCHEMA, {
      "ui:wizard": {
        steps: [
          { title: "Plan", fields: ["plan", "seats"] },
          { title: "Billing", fields: ["email"] },
        ],
      },
    });
    expect(html).toContain('l-validate="step &lt; 1 ? (step = step + 1) : ($el.dataset.state = &#39;submitted&#39;)"');
    expect(html).toContain('@click="step = step - 1"');
    expect(html).not.toContain("l-rules");
  });

  it("keeps the golden rules cases lint-clean", () => {
    expectLintClean(definitionOf(renderForm(BILLING_RULES_SCHEMA, {}, BILLING_RULES_OPTS), "billing"));
    expectLintClean(definitionOf(renderForm(PLAN_WIZARD_SCHEMA, PLAN_WIZARD_UI, { idPrefix: "plan" }), "plan"));
  });

  it("lints clean for every golden case that carries rules", () => {
    for (const fixture of GOLDEN_CASES) {
      const html = renderForm(fixture.schema, fixture.uiSchema, fixture.opts);
      if (!html.includes("l-rules")) continue;
      expectLintClean(definitionOf(html, fixture.opts?.idPrefix ?? "faqir"));
    }
  });
});

describe("renderForm rules strict failures", () => {
  const renderUnchecked = (schema: unknown, uiSchema: unknown = {}, opts: unknown = {}) =>
    renderForm(schema as ObjectSchema, uiSchema as UISchema, opts as RenderFormOptions);

  const base = (extra: object): unknown => ({
    type: "object",
    properties: { kind: { type: "string", enum: ["a", "b"] }, other: { type: "string" } },
    ...extra,
  });

  it("rejects conditionals that cannot mean anything", () => {
    expect(() => renderUnchecked(base({ then: { required: ["other"] } })))
      .toThrow('has a "then"/"else" with no "if"');
    expect(() => renderUnchecked(base({ if: { properties: { kind: { const: "a" } } } })))
      .toThrow("decides nothing");
    expect(() => renderUnchecked(base({ if: {}, then: { required: ["other"] } })))
      .toThrow("states no condition");
    expect(() => renderUnchecked(base({ if: { properties: { kind: {} } }, then: { required: ["other"] } })))
      .toThrow('must state a "const" or a non-empty "enum"');
    expect(() => renderUnchecked(base({ if: { properties: { kind: { const: "a", enum: ["a"] } } }, then: { required: ["other"] } })))
      .toThrow("cannot combine const with enum");
    expect(() => renderUnchecked(base({ if: { properties: { missing: { const: "a" } } }, then: { required: ["other"] } })))
      .toThrow('references unknown property "missing"');
    expect(() => renderUnchecked(base({ if: { properties: { kind: { const: "a" } } }, then: {} })))
      .toThrow("changes nothing");
    expect(() => renderUnchecked(base({ if: { properties: { kind: { const: "a" } } }, then: { required: ["nope"] } })))
      .toThrow('references unknown property "nope"');
  });

  it("refuses a conditional CONSTRAINT rather than dropping it", () => {
    expect(() => renderUnchecked(base({
      if: { properties: { kind: { const: "a" } } },
      then: { properties: { other: { minLength: 3 } } },
    }))).toThrow("carries constraints; a conditional branch decides visibility only");
  });

  it("rejects allOf that is not a list of conditionals", () => {
    expect(() => renderUnchecked(base({ allOf: [] }))).toThrow("must be a non-empty array of conditionals");
    expect(() => renderUnchecked(base({ allOf: [{ properties: { other: { type: "string" } } }] })))
      .toThrow('unsupported keyword "properties"');
    expect(() => renderUnchecked(base({ allOf: [{ then: { required: ["other"] } }] })))
      .toThrow("allOf is not supported for schema composition");
  });

  it("rejects dependentRequired that names nothing, or itself", () => {
    expect(() => renderUnchecked(base({ dependentRequired: { nope: ["other"] } })))
      .toThrow('references unknown property "nope"');
    expect(() => renderUnchecked(base({ dependentRequired: { kind: ["nope"] } })))
      .toThrow('references unknown property "nope"');
    expect(() => renderUnchecked(base({ dependentRequired: { kind: ["kind"] } })))
      .toThrow('cannot make "kind" depend on itself');
  });

  it("rejects a wizard step that cannot be jumped over", () => {
    const schema: ObjectSchema = {
      type: "object",
      properties: { a: { type: "string" }, b: { type: "string" }, c: { type: "string" } },
    };
    const steps = (when: Array<object | undefined>) => ({
      "ui:wizard": {
        steps: [
          { title: "A", fields: ["a"], when: when[0] },
          { title: "B", fields: ["b"], when: when[1] },
          { title: "C", fields: ["c"], when: when[2] },
        ].map((step) => (step.when === undefined ? { title: step.title, fields: step.fields } : step)),
      },
    });
    const cond = { "!": { missing: ["a"] } };
    expect(() => renderUnchecked(schema, steps([cond, undefined, undefined])))
      .toThrow("the first step is always reached");
    expect(() => renderUnchecked(schema, steps([undefined, undefined, cond])))
      .toThrow("the last step cannot be skipped");
    expect(() => renderUnchecked(
      { type: "object", properties: { a: { type: "string" }, b: { type: "string" }, c: { type: "string" }, d: { type: "string" } } },
      {
        "ui:wizard": {
          steps: [
            { title: "A", fields: ["a"] },
            { title: "B", fields: ["b"], when: cond },
            { title: "C", fields: ["c"], when: cond },
            { title: "D", fields: ["d"] },
          ],
        },
      },
    )).toThrow("two consecutive steps cannot both be conditional");
  });

  it("rejects a malformed opts.rules", () => {
    const schema = { type: "object", properties: { a: { type: "string" } } };
    expect(() => renderUnchecked(schema, {}, { rules: { verbs: [] } }))
      .toThrow('unsupported keyword "verbs" at opts.rules');
    expect(() => renderUnchecked(schema, {}, { rules: { version: "2" } }))
      .toThrow('opts.rules.version must be "1"');
    expect(() => renderUnchecked(schema, {}, { rules: { rules: {} } }))
      .toThrow("opts.rules.rules must be an array of rules");
    expect(() => renderUnchecked(schema, {}, { rules: { rules: [{ show: "a", when: {} }] } }))
      .toThrow("opts.rules.rules[0].id must be a non-empty string");
    expect(() => renderUnchecked(schema, {}, {
      rules: { rules: [{ id: "same", show: "a", when: {} }, { id: "same", require: "a", when: {} }] },
    })).toThrow('two rules with the id "same"');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The platform's end-to-end story: a schema in, a form out, and the rules the
// schema implied driving it in a page — faqir-core + faqir-validate +
// faqir-rules, with no @faqir-ui/* package in the browser.
//
// The plugin drop is the artifact under test (the bytes a page loads), and it
// is EVALUATED rather than require()d for the same reason composites.test.ts
// evaluates faqir-validate: `tests/core/faqir-rules.test.ts` asserts on the
// first-require self-registration, and a cached module would rob it of that.
// ─────────────────────────────────────────────────────────────────────────────
const Faqir = require("../../../registry/core/faqir-core.js");
for (const plugin of ["faqir-validate.js", "faqir-rules.js"]) {
  const source = readFileSync(join(import.meta.dir, "../../../registry/core/plugins", plugin), "utf8");
  const module = { exports: {} as unknown };
  const evaluate = new Function("module", "exports", "Faqir", source);
  // faqir-validate exports an install function; the rules drop is an IIFE that
  // self-registers against a global Faqir. Feed both what they expect.
  const previous = (globalThis as any).Faqir;
  (globalThis as any).Faqir = Faqir;
  try {
    evaluate(module, module.exports, Faqir);
  } finally {
    (globalThis as any).Faqir = previous;
  }
  if (typeof module.exports === "function") Faqir.plugin(module.exports);
}

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function boot(html: string): Promise<HTMLFormElement> {
  // A fresh <body> per boot: every Faqir.start() leaves a MutationObserver on
  // the current one. (AGENTS.md, and composites.test.ts for the same reason.)
  const freshBody = document.createElement("body");
  document.documentElement.replaceChild(freshBody, document.body);
  document.body.innerHTML = html;
  Faqir.start();
  await tick();
  return document.querySelector("form") as HTMLFormElement;
}

function control(form: HTMLFormElement, name: string): HTMLInputElement {
  return form.querySelector(`[name="${name}"]`) as HTMLInputElement;
}

function groupOf(el: Element): HTMLElement {
  return el.closest('[data-ui="field-group"]') as HTMLElement;
}

beforeEach(async () => {
  await tick();
});

afterAll(() => {
  document.documentElement.replaceChild(document.createElement("body"), document.body);
});

describe("a rendered form under faqir-core + faqir-validate + faqir-rules", () => {
  it("hides and requires a conditional field as the condition flips", async () => {
    const form = await boot(renderForm(CONDITIONAL, {}, { idPrefix: "billing" }));
    const company = control(form, "company");
    const personal = form.querySelector('input[value="personal"]') as HTMLInputElement;
    const business = form.querySelector('input[value="business"]') as HTMLInputElement;

    // Nothing chosen yet: the condition is false, so the field is off the page
    // and off the wire — disabled controls are absent from FormData.
    expect(groupOf(company).hasAttribute("hidden")).toBe(true);
    expect(company.disabled).toBe(true);
    expect(company.required).toBe(false);

    business.checked = true;
    business.dispatchEvent(new Event("change", { bubbles: true }));
    await tick();
    expect(groupOf(company).hasAttribute("hidden")).toBe(false);
    expect(company.disabled).toBe(false);
    expect(company.required).toBe(true);
    expect(company.getAttribute("aria-required")).toBe("true");

    business.checked = false;
    personal.checked = true;
    personal.dispatchEvent(new Event("change", { bubbles: true }));
    await tick();
    expect(groupOf(company).hasAttribute("hidden")).toBe(true);
    expect(company.required).toBe(false);
  });

  it("makes a dependent field required once its trigger is filled in", async () => {
    const form = await boot(renderForm({
      type: "object",
      properties: { startsOn: { type: "string" }, endsOn: { type: "string" } },
      dependentRequired: { startsOn: ["endsOn"] },
    }));
    const endsOn = control(form, "endsOn");
    expect(endsOn.required).toBe(false);

    const startsOn = control(form, "startsOn");
    startsOn.value = "2026-09-12";
    startsOn.dispatchEvent(new Event("input", { bubbles: true }));
    await tick();
    expect(endsOn.required).toBe(true);
  });

  it("answers the wizard's navigation with the jump the schema implied", async () => {
    const form = await boot(renderForm(PLAN_WIZARD_SCHEMA, PLAN_WIZARD_UI, { idPrefix: "plan" }));
    const scope = (form as any).__faqirScope;
    const solo = form.querySelector('input[value="solo"]') as HTMLInputElement;
    const team = form.querySelector('input[value="team"]') as HTMLInputElement;

    // Solo: step 1 does not apply, so the definition says page 0 leads to page 2.
    solo.checked = true;
    solo.dispatchEvent(new Event("change", { bubbles: true }));
    await tick();
    expect(scope.$rules.next).toEqual({ "0": "2" });

    team.checked = true;
    solo.checked = false;
    team.dispatchEvent(new Event("change", { bubbles: true }));
    await tick();
    expect(scope.$rules.next).toEqual({});

    // And the emitted navigation reads exactly that: Next from the solo path
    // lands on the billing step, and Back returns over it.
    solo.checked = true;
    team.checked = false;
    solo.dispatchEvent(new Event("change", { bubbles: true }));
    await tick();
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await tick();
    expect(scope.step).toBe(2);

    const back = [...form.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Back");
    back!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    await tick();
    expect(scope.step).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A real multi-step wizard, forward and back, on both paths — and the server's
// verdict on what the skip path submits. Every assertion here was a reproduced
// bug before 1.1 shipped: the plugin read the other steps' (disabled) answers
// as blank, so Back jumped over a page that had been filled in; a field a rule
// hid on a later step was re-enabled by the wizard and blocked Next with an
// error nobody could see; and the server rejected every skip-path submission
// because nothing told it the skipped page's fields were never shown.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * happy-dom holds each MutationObserver's delivery callback in a `WeakRef`, so
 * a garbage collection can drop a record; a browser never does. The wizard's
 * step bindings are exactly the writes the plugin observes, so these tests hold
 * the callbacks strongly for their own duration.
 */
let savedWeakRef: typeof WeakRef;

async function submit(form: HTMLFormElement): Promise<void> {
  form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  await tick();
  await tick();
}

async function back(form: HTMLFormElement): Promise<void> {
  const button = [...form.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Back");
  button!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  await tick();
  await tick();
}

async function choose(form: HTMLFormElement, value: string): Promise<void> {
  for (const radio of form.querySelectorAll<HTMLInputElement>('input[type="radio"]')) {
    radio.checked = radio.value === value;
  }
  form.querySelector<HTMLInputElement>(`input[value="${value}"]`)!
    .dispatchEvent(new Event("change", { bubbles: true }));
  await tick();
}

async function fill(el: HTMLInputElement, value: string): Promise<void> {
  el.value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  await tick();
}

/** What a server receives when the page serializes the whole wizard. */
function submission(form: HTMLFormElement): [string, string][] {
  const pairs: [string, string][] = [];
  for (const el of form.querySelectorAll<HTMLInputElement>("input[name]")) {
    if (el.closest('[data-ui="field-group"]')?.hasAttribute("hidden")) continue; // a rule hid it
    if ((el.type === "radio" || el.type === "checkbox") && !el.checked) continue;
    if (el.value !== "") pairs.push([el.name, el.value]);
  }
  return pairs;
}

describe("a multi-step wizard under faqir-rules", () => {
  beforeAll(() => {
    savedWeakRef = globalThis.WeakRef;
    (globalThis as any).WeakRef = class<T> {
      #target: T;
      constructor(target: T) {
        this.#target = target;
      }
      deref(): T {
        return this.#target;
      }
    };
  });
  afterAll(() => {
    (globalThis as any).WeakRef = savedWeakRef;
  });

  // `seats` is required, but only on the team path: its step is conditional.
  const TEAM: ObjectSchema = {
    type: "object",
    properties: {
      plan: { type: "string", title: "Plan", enum: ["solo", "team"] },
      seats: { type: "integer", title: "Seats", minimum: 2 },
      email: { type: "string", format: "email", title: "Billing email" },
    },
    required: ["plan", "seats", "email"],
  };
  const TEAM_UI: UISchema = {
    "ui:wizard": {
      steps: [
        { title: "Plan", fields: ["plan"] },
        { title: "Team", fields: ["seats"], when: { "==": [{ var: "plan" }, "team"] } },
        { title: "Billing", fields: ["email"] },
      ],
    },
  };

  it("goes forward and back through every step on the team path", async () => {
    const form = await boot(renderForm(TEAM, TEAM_UI, { idPrefix: "team" }));
    const scope = (form as any).__faqirScope;
    const seats = control(form, "seats");

    await choose(form, "team");
    await submit(form);
    expect(scope.step).toBe(1);

    // The later step's required field blocks Next until it is filled in.
    await submit(form);
    expect(scope.step).toBe(1);
    expect(groupOf(seats).getAttribute("data-state")).toBe("invalid");
    await fill(seats, "3");
    await submit(form);
    expect(scope.step).toBe(2);

    // Back returns to the page that was filled in — step 0's answer is still
    // "team" although its control is disabled while step 2 is showing.
    expect(scope.$rules.next).toEqual({});
    await back(form);
    expect(scope.step).toBe(1);
    await back(form);
    expect(scope.step).toBe(0);
  });

  it("skips the conditional step on the solo path, both ways, and completes", async () => {
    const form = await boot(renderForm(TEAM, TEAM_UI, { idPrefix: "solo" }));
    const scope = (form as any).__faqirScope;
    const seats = control(form, "seats");

    await choose(form, "solo");
    expect(scope.$rules.next).toEqual({ "0": "2" });
    await submit(form);
    expect(scope.step).toBe(2);
    expect(groupOf(seats).hasAttribute("hidden")).toBe(true);

    await back(form);
    expect(scope.step).toBe(0);
    await submit(form);
    expect(scope.step).toBe(2);

    // The hidden, required `seats` does not stand in the way of finishing.
    await fill(control(form, "email"), "ada@example.com");
    await submit(form);
    expect(form.dataset.state).toBe("submitted");
    expect(seats.disabled).toBe(true);
    expect(groupOf(seats).getAttribute("data-state")).toBe(null);

    // And the server, re-checking the same submission with the same
    // definition, agrees — the skipped page's field is not required there.
    const definition = definitionOf(renderForm(TEAM, TEAM_UI, { idPrefix: "solo" }), "solo");
    const data = coerce(definition, fromFormData(submission(form)));
    expect(data).toEqual({ plan: "solo", email: "ada@example.com" });
    const verdict = validate(definition, data);
    expect(verdict.findings).toEqual([]);
    expect(verdict.valid).toBe(true);
    expect(verdict.visible).toEqual({ seats: false });
  });

  it("the server still requires the conditional step's field on the team path", () => {
    const definition = definitionOf(renderForm(TEAM, TEAM_UI, { idPrefix: "srv" }), "srv");
    const verdict = validate(definition, { plan: "team", email: "ada@example.com" });
    expect(verdict.valid).toBe(false);
    expect(verdict.findings.map((finding) => `${finding.path} ${finding.rule}`)).toEqual(["seats required"]);
  });

  it("never lets a field a rule hid on a later step block Next once the wizard reaches it", async () => {
    // The reviewer's repro: `company` sits on step B and is shown — and
    // required — only for a business. For a person it stays hidden, and the
    // wizard enabling step B's controls must not bring it back.
    const schema: ObjectSchema = {
      type: "object",
      required: ["kind"],
      properties: {
        kind: { type: "string", enum: ["person", "business"] },
        company: { type: "string" },
        email: { type: "string" },
      },
      if: { properties: { kind: { const: "business" } } },
      then: { properties: { company: {} }, required: ["company"] },
    };
    const ui: UISchema = {
      "ui:wizard": { steps: [{ title: "A", fields: ["kind"] }, { title: "B", fields: ["company", "email"] }] },
    };
    const form = await boot(renderForm(schema, ui, { idPrefix: "biz" }));
    const scope = (form as any).__faqirScope;
    const company = control(form, "company");

    await choose(form, "person");
    await submit(form);
    expect(scope.step).toBe(1);
    expect(groupOf(company).hasAttribute("hidden")).toBe(true);
    expect(company.disabled).toBe(true);

    await fill(control(form, "email"), "x@example.com");
    await submit(form);
    expect(form.dataset.state).toBe("submitted");
    expect(groupOf(company).getAttribute("data-state")).toBe(null);

    // And for a business it is there, and required, on step B.
    const second = await boot(renderForm(schema, ui, { idPrefix: "biz2" }));
    const secondScope = (second as any).__faqirScope;
    await choose(second, "business");
    await submit(second);
    expect(secondScope.step).toBe(1);
    const secondCompany = control(second, "company");
    expect(groupOf(secondCompany).hasAttribute("hidden")).toBe(false);
    expect(secondCompany.disabled).toBe(false);
    await submit(second);
    expect(second.dataset.state).toBeUndefined();
    expect(groupOf(secondCompany).getAttribute("data-state")).toBe("invalid");
  });
});
