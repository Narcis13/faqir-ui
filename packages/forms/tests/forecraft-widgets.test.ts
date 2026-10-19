// Widget fixes from a downstream app's notes on 1.2.5 (forecraft, items 6, 14,
// 16, 17, 29): every data-ui the renderer emits is a registry name, a date
// field submits its ISO value, a scale and horizontal choice groups, a field
// width, and the form's own gap.

import { afterEach, beforeAll, describe, expect, it } from "bun:test";
import { auditHtmlSource } from "../../../src/audit/checker";
import { knownUiValues, loadRegistryManifestMap, loadRegistryStylesheetMap } from "../../../src/utils/components";
import { getRegistryPath } from "../../../src/utils/fs";
import { coerce, fromFormData, lintDefinition, validate } from "../../rules/src/index.js";
import { buildForm } from "../src/dom.js";
import { DEFAULT_FORM_GAP, renderForm } from "../src/index.js";
import type { ObjectSchema, RenderFormOptions, UISchema } from "../src/index.js";
import { GOLDEN_CASES } from "./cases";

let manifests: Awaited<ReturnType<typeof loadRegistryManifestMap>>;
let styles: Awaited<ReturnType<typeof loadRegistryStylesheetMap>>;
let known: string[];

/** The registry controller, loaded by path so this package's `checkJs` stays out of registry sources. */
interface DatePickerApi {
  selectDate(date: Date): void;
  setValue(dateStr: string): void;
  getValue(): string | null;
  clear(): void;
  destroy(): void;
}
const DATE_PICKER = "../../../registry/recipes/date-picker/date-picker.js";
let createDatePicker: (root: HTMLElement) => DatePickerApi;

beforeAll(async () => {
  ({ createDatePicker } = (await import(DATE_PICKER)) as { createDatePicker: typeof createDatePicker });
  const registry = getRegistryPath();
  manifests = await loadRegistryManifestMap(registry);
  styles = await loadRegistryStylesheetMap(registry);
  known = knownUiValues(registry);
});

/** The audit `faqir audit` runs, with the registry's own names armed — so an unknown data-ui fails. */
function audit(source: string, file: string) {
  return auditHtmlSource({ source, file, manifests, styles, knownUiValues: known })
    .map((finding) => `${finding.rule_id}: ${finding.message}`);
}

/** One schema that reaches every widget the renderer has. */
const BROAD: ObjectSchema = {
  type: "object",
  title: "Everything",
  properties: {
    name: { type: "string", title: "Name", minLength: 2 },
    email: { type: "string", format: "email" },
    site: { type: "string", format: "uri" },
    bio: { type: "string" },
    born: { type: "string", format: "date", default: "1990-04-02" },
    plan: { type: "string", enum: ["free", "pro"] },
    country: { type: "string", enum: ["ro", "de", "fr", "it", "es"] },
    agree: { type: "string", enum: ["no", "maybe", "yes"] },
    rating: { type: "integer", enum: [1, 2, 3, 4, 5] },
    nps: { type: "integer", minimum: 0, maximum: 10 },
    seats: { type: "integer", minimum: 1 },
    price: { type: "number" },
    news: { type: "boolean" },
    dark: { type: "boolean" },
    channels: { type: "array", items: { type: "string", enum: ["email", "sms"] }, uniqueItems: true },
    topics: { type: "array", items: { type: "string", enum: ["a", "b", "c", "d", "e"] } },
    address: { type: "object", properties: { street: { type: "string" }, city: { type: "string" } } },
    meds: {
      type: "array",
      items: { type: "object", properties: { drug: { type: "string" }, since: { type: "string", format: "date" } } },
    },
  },
  required: ["name", "born", "nps"],
};

const BROAD_UI: UISchema = {
  bio: { widget: "textarea", width: "full" },
  name: { width: "half" },
  email: { "ui:width": "half" },
  plan: { orientation: "horizontal" },
  agree: { widget: "scale", minLabel: "Disagree", maxLabel: "Agree" },
  rating: { widget: "scale", maxLabel: "Excellent" },
  nps: { widget: "scale", minLabel: "Not likely", maxLabel: "Very likely" },
  seats: { width: "third" },
  price: { width: "third" },
  dark: { widget: "switch", width: "third" },
  channels: { orientation: "horizontal" },
};

const mounted: HTMLElement[] = [];
afterEach(() => {
  for (const box of mounted.splice(0)) box.remove();
});

/** Mount markup into a disposable container (never `document.body` itself). */
function mount(html: string): HTMLElement {
  const box = document.createElement("div");
  box.innerHTML = html;
  document.body.appendChild(box);
  mounted.push(box);
  return box;
}

// ── #14: every data-ui the renderer emits is one Faqir defines ──────────────

describe("renderForm output audits clean against the registry, unknown-component armed", () => {
  it("checkbox-group is a name the registry defines (the checkbox stylesheet styles it)", () => {
    expect(known).toContain("checkbox-group");
    expect(known).toContain("radio-group");
  });

  it("the gate is armed: a data-ui nothing defines is reported", () => {
    const html = renderForm(BROAD, BROAD_UI).replace('data-ui="checkbox-group"', 'data-ui="checkbox-groupe"');
    expect(audit(html, "broken.html").some((line) => line.startsWith("unknown-component"))).toBe(true);
  });

  it("a schema reaching every widget — flat, grouped and as a wizard — has zero findings", () => {
    const groups: UISchema = {
      ...BROAD_UI,
      "ui:groups": [
        { title: "You", fields: ["name", "email", "site", "bio", "born"] },
        { title: "Choices", fields: ["plan", "country", "agree", "rating", "nps", "seats", "price", "news", "dark"] },
        { title: "More", fields: ["channels", "topics", "address", "meds"] },
      ],
    };
    const wizard: UISchema = {
      ...BROAD_UI,
      "ui:wizard": {
        steps: [
          { title: "You", fields: ["name", "email", "site", "bio", "born"] },
          { title: "Choices", fields: ["plan", "country", "agree", "rating", "nps", "seats", "price", "news", "dark"] },
          { title: "More", fields: ["channels", "topics", "address", "meds"] },
        ],
      },
    };
    for (const [name, ui] of [["flat", BROAD_UI], ["groups", groups], ["wizard", wizard]] as const) {
      expect(audit(renderForm(BROAD, ui), `${name}.html`), name).toEqual([]);
    }
  });

  it("every golden case has zero findings with unknown-component armed", () => {
    for (const fixture of GOLDEN_CASES) {
      const findings = audit(renderForm(fixture.schema, fixture.uiSchema, fixture.opts), `${fixture.name}.html`);
      expect(findings, fixture.name).toEqual([]);
    }
  });

  it("buildForm's DOM for the broad schema is audit-clean too", () => {
    expect(audit(buildForm(BROAD, document, BROAD_UI).outerHTML, "built.html")).toEqual([]);
  });
});

// ── #29: a date field submits the ISO date ──────────────────────────────────

describe("a date field submits its ISO value, not its display text", () => {
  const DATE_FORM: ObjectSchema = {
    type: "object",
    properties: { due: { type: "string", format: "date", title: "Due" }, note: { type: "string" } },
    required: ["due"],
  };

  function picker(html: string) {
    const box = mount(html);
    const form = box.querySelector("form") as HTMLFormElement;
    const root = box.querySelector('[data-ui="date-picker"]') as HTMLElement;
    const api = createDatePicker(root);
    const input = root.querySelector('[data-part="input"]') as HTMLInputElement;
    const value = root.querySelector('[data-part="value"]') as HTMLInputElement;
    return { form, root, api, input, value };
  }

  it("renders the name on a hidden value part, never on the visible input", () => {
    const { input, value } = picker(renderForm(DATE_FORM));
    expect(value.type).toBe("hidden");
    expect(value.name).toBe("due");
    expect(input.hasAttribute("name")).toBe(false);
    // The label, required and the description wiring stay where a person is.
    expect(input.id).toBe("faqir-field-due");
    expect(input.required).toBe(true);
    expect(input.getAttribute("aria-describedby")).toBe("faqir-field-due-error");
  });

  it("FormData carries the ISO date after a pick", () => {
    const { form, api, input } = picker(renderForm(DATE_FORM));
    api.selectDate(new Date(2026, 9, 15));
    expect(input.value).toBe("October 15, 2026");
    expect(new FormData(form).get("due")).toBe("2026-10-15");
    expect(new FormData(form).getAll("due")).toEqual(["2026-10-15"]);
  });

  it("announces the value with input and change on the hidden input, as typing would", () => {
    const { form, api, value } = picker(renderForm(DATE_FORM));
    const seen: string[] = [];
    form.addEventListener("input", (event) => { if (event.target === value) seen.push(`input:${value.value}`); });
    form.addEventListener("change", (event) => { if (event.target === value) seen.push(`change:${value.value}`); });
    api.selectDate(new Date(2026, 9, 15));
    api.setValue("2026-11-01");
    api.setValue("2026-11-01"); // unchanged: nothing announced
    api.clear();
    expect(seen).toEqual([
      "input:2026-10-15", "change:2026-10-15",
      "input:2026-11-01", "change:2026-11-01",
      "input:", "change:",
    ]);
    expect(new FormData(form).get("due")).toBe("");
  });

  it("a server-rendered default is the selection at start-up, shown as a person reads it", () => {
    const schema: ObjectSchema = { type: "object", properties: { due: { type: "string", format: "date", default: "2026-03-10" } } };
    const { form, api, input, value } = picker(renderForm(schema));
    expect(value.value).toBe("2026-03-10");
    expect(input.value).toBe("March 10, 2026");
    expect(api.getValue()).toBe("2026-03-10");
    expect(new FormData(form).get("due")).toBe("2026-03-10");
  });

  it("a form reset restores the rendered value", async () => {
    const schema: ObjectSchema = { type: "object", properties: { due: { type: "string", format: "date", default: "2026-03-10" } } };
    const { form, api, value } = picker(renderForm(schema));
    api.setValue("2026-05-01");
    form.reset();
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(value.value).toBe("2026-03-10");
    expect(api.getValue()).toBe("2026-03-10");
  });

  it("destroy() stops listening for the form's reset", async () => {
    const { form, api, value } = picker(renderForm(DATE_FORM));
    api.setValue("2026-05-01");
    api.destroy();
    form.reset();
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(value.value).toBe("2026-05-01");
  });

  it("the rules read the ISO date: a server validating the FormData accepts the pick", () => {
    const html = renderForm(DATE_FORM, {}, { rules: {} });
    const definition = JSON.parse(/<script type="application\/json"[^>]*>([\s\S]*?)<\/script>/.exec(html)![1]);
    expect(definition.fields.due).toEqual({ type: "string", title: "Due", format: "date" });
    const { form, api } = picker(html);
    expect(validate(definition, coerce(definition, fromFormData(new FormData(form)))).valid).toBe(false); // required, empty
    api.selectDate(new Date(2026, 9, 15));
    const verdict = validate(definition, coerce(definition, fromFormData(new FormData(form))));
    expect(verdict.findings).toEqual([]);
  });

  it("inside a repeatable row the value part carries the row's name binding", () => {
    const schema: ObjectSchema = {
      type: "object",
      properties: { meds: { type: "array", items: { type: "object", properties: { since: { type: "string", format: "date" } } } } },
    };
    const html = renderForm(schema);
    expect(html).toContain(
      `<input data-part="value" type="hidden" name="meds[].since" :name="&#39;meds[&#39; + rowIndex + &#39;].since&#39;">`,
    );
  });

  it("buildForm builds the same hidden value part", () => {
    const form = buildForm(DATE_FORM, document);
    const value = form.querySelector('[data-ui="date-picker"] > [data-part="value"]') as HTMLInputElement;
    expect(value.type).toBe("hidden");
    expect(value.name).toBe("due");
    expect(form.querySelector('[data-part="input"]')!.hasAttribute("name")).toBe(false);
  });
});

// ── #17: scale, horizontal choice groups, integer enums ─────────────────────

describe("the scale widget and horizontal choice groups", () => {
  const one = (field: object, ui: object = {}, opts: RenderFormOptions = {}) =>
    renderForm({ type: "object", properties: { f: field } } as ObjectSchema, { f: ui } as UISchema, opts);

  it("an integer range renders one radio per value in a horizontal group, with end captions", () => {
    const box = mount(one({ type: "integer", minimum: 0, maximum: 10 }, { widget: "scale", minLabel: "Not likely", maxLabel: "Very likely" }));
    const group = box.querySelector('[data-ui="radio-group"]')!;
    expect(group.getAttribute("data-orientation")).toBe("horizontal");
    const radios = [...group.querySelectorAll<HTMLInputElement>('input[type="radio"]')];
    expect(radios.map((radio) => radio.value)).toEqual(["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10"]);
    const captions = group.querySelector(':scope > [data-part="captions"]')!;
    expect([...captions.children].map((span) => span.textContent)).toEqual(["Not likely", "Very likely"]);
    // Each caption describes the option at its end.
    expect(radios[0].getAttribute("aria-describedby")).toBe("faqir-field-f-min-caption faqir-field-f-error");
    expect(radios[10].getAttribute("aria-describedby")).toBe("faqir-field-f-max-caption faqir-field-f-error");
    expect(radios[5].getAttribute("aria-describedby")).toBe("faqir-field-f-error");
    // The field's label points at the first option, as a radio group's does.
    expect(box.querySelector('[data-part="label"]')!.getAttribute("for")).toBe("faqir-field-f-option-1");
  });

  it("a string or integer enum can be a scale, with enum labels; a missing caption leaves its end empty", () => {
    const box = mount(one({ type: "string", enum: ["1", "2", "3"] }, { widget: "scale", enumLabels: ["Low", "Mid", "High"], maxLabel: "Best" }));
    expect([...box.querySelectorAll('[data-ui="radio-label"] > [data-part="label"]')].map((el) => el.textContent))
      .toEqual(["Low", "Mid", "High"]);
    const captions = box.querySelector('[data-part="captions"]')!;
    expect(captions.children[0].textContent).toBe("");
    expect(captions.children[0].hasAttribute("id")).toBe(false);
    expect(captions.children[1].id).toBe("faqir-field-f-max-caption");
    const integer = mount(one({ type: "integer", enum: [1, 2, 3, 4, 5], default: 3 }, { widget: "scale" }));
    expect(integer.querySelector<HTMLInputElement>("input:checked")!.value).toBe("3");
    expect(integer.querySelector('[data-part="captions"]')).toBeNull();
  });

  it("steps an integer range by multipleOf or step", () => {
    const values = (field: object) =>
      [...mount(one(field, { widget: "scale" })).querySelectorAll<HTMLInputElement>('input[type="radio"]')].map((r) => r.value);
    expect(values({ type: "integer", minimum: 0, maximum: 100, multipleOf: 25 })).toEqual(["0", "25", "50", "75", "100"]);
    expect(values({ type: "integer", minimum: 1, maximum: 9, step: 2 })).toEqual(["1", "3", "5", "7", "9"]);
  });

  it("an integer enum without a widget is a choice list like a string enum", () => {
    expect(one({ type: "integer", enum: [1, 2, 3] })).toContain('data-ui="radio-group"');
    expect(one({ type: "integer", enum: [1, 2, 3, 4, 5] })).toContain('<select data-ui="select"');
    expect(one({ type: "integer", enum: [1, 2, 3, 4, 5], default: 2 })).toContain('<option value="2" selected>2</option>');
  });

  it("the rules read an integer enum's answer as a number, on both sides", () => {
    const html = renderForm(
      { type: "object", properties: { score: { type: "integer", enum: [1, 2, 3, 4, 5] } }, required: ["score"] },
      { score: { widget: "scale" } },
      { rules: {} },
    );
    const definition = JSON.parse(/<script type="application\/json"[^>]*>([\s\S]*?)<\/script>/.exec(html)![1]);
    expect(definition.fields.score).toEqual({ type: "integer", enum: [1, 2, 3, 4, 5] });
    expect(lintDefinition(definition).findings).toEqual([]);
    const box = mount(html);
    box.querySelector<HTMLInputElement>('input[value="4"]')!.checked = true;
    const data = coerce(definition, fromFormData(new FormData(box.querySelector("form")!)));
    expect(data.score).toBe(4);
    expect(validate(definition, data).valid).toBe(true);
  });

  it("orientation lays a radio group or checkbox group out as a row", () => {
    expect(one({ type: "string", enum: ["a", "b"] }, { orientation: "horizontal" }))
      .toContain('<div data-ui="radio-group" role="radiogroup" data-orientation="horizontal"');
    expect(one({ type: "array", items: { type: "string", enum: ["a", "b"] } }, { "ui:orientation": "horizontal" }))
      .toContain('<div data-ui="checkbox-group" role="group" data-orientation="horizontal"');
    // Vertical is the default, so it is not written.
    expect(one({ type: "string", enum: ["a", "b"] }, { orientation: "vertical" })).not.toContain("data-orientation");
  });

  it("refuses what cannot mean anything", () => {
    expect(() => one({ type: "integer" }, { widget: "scale" })).toThrow("needs an enum or both minimum and maximum");
    expect(() => one({ type: "integer", minimum: 0, maximum: 100 }, { widget: "scale" })).toThrow("more than 21 choices");
    expect(() => one({ type: "number", minimum: 0, maximum: 5 }, { widget: "scale" })).toThrow('widget "scale" is incompatible');
    expect(() => one({ type: "string" }, { widget: "scale" })).toThrow('widget "scale" is incompatible');
    expect(() => one({ type: "string", enum: ["a", "b"] }, { minLabel: "Low" })).toThrow("supported only with the scale widget");
    expect(() => one({ type: "string", enum: ["a", "b", "c", "d", "e"] }, { orientation: "horizontal" }))
      .toThrow("applies to a radio or checkbox-group widget");
    expect(() => one({ type: "integer", enum: [1, 2] }, { widget: "scale", orientation: "horizontal" })).toThrow("always a row");
    expect(() => one({ type: "string", enum: ["a"] }, { orientation: "diagonal" })).toThrow('must be "vertical" or "horizontal"');
    expect(() => one({ type: "integer", enum: [1, 1.5] })).toThrow("must be an integer");
    expect(() => one({ type: "number", enum: [1, 2] })).toThrow("supported only for string or integer fields");
    // A scale cannot go in a repeatable row: its option ids cannot be made row-unique.
    expect(() => renderForm(
      { type: "object", properties: { rows: { type: "array", items: { type: "object", properties: { s: { type: "integer", enum: [1, 2] } } } } } },
      { rows: { items: { s: { widget: "scale" } } } },
    )).toThrow('widget "scale" is incompatible');
  });
});

// ── #6: a field's width ──────────────────────────────────────────────────────

describe("ui:width writes data-span on the field-group", () => {
  it("full, half and third, on scalars and choice sets", () => {
    const box = mount(renderForm(BROAD, BROAD_UI));
    const span = (name: string) =>
      box.querySelector(`[name="${name}"]`)!.closest('[data-ui="field-group"]')!.getAttribute("data-span");
    expect(span("name")).toBe("half");
    expect(span("email")).toBe("half");
    expect(span("bio")).toBe("full");
    expect(span("seats")).toBe("third");
    expect(span("channels")).toBeNull();
    expect(span("site")).toBeNull();
  });

  it("refuses a width it has no layout for", () => {
    const schema: ObjectSchema = { type: "object", properties: { a: { type: "string" } } };
    expect(() => renderForm(schema, { a: { width: "quarter" } } as unknown as UISchema)).toThrow('width must be one of "full", "half", "third"');
    expect(() => renderForm(schema, { a: { width: "half", "ui:width": "third" } })).toThrow("conflicts");
  });
});

// ── #16: the form's gap ──────────────────────────────────────────────────────

describe("opts.gap writes the form's data-gap", () => {
  const schema: ObjectSchema = { type: "object", properties: { a: { type: "string" } } };
  const gapOf = (opts?: RenderFormOptions) => /<form[^>]* data-gap="([^"]+)"/.exec(renderForm(schema, {}, opts))?.[1];

  it("defaults to 4, takes a rhythm step as a string or a number, and refuses anything else", () => {
    expect(DEFAULT_FORM_GAP).toBe("4");
    expect(gapOf()).toBe("4");
    expect(gapOf({ gap: "6" })).toBe("6");
    expect(gapOf({ gap: 0 })).toBe("0");
    expect(() => renderForm(schema, {}, { gap: "5" } as unknown as RenderFormOptions)).toThrow("opts.gap must be one of the rhythm steps");
    expect(() => renderForm(schema, {}, { gap: true } as unknown as RenderFormOptions)).toThrow("opts.gap must be a string");
  });

  it("buildForm writes the same gap", () => {
    expect(buildForm(schema, document).getAttribute("data-gap")).toBe("4");
    expect(buildForm(schema, document, {}, { gap: 8 }).getAttribute("data-gap")).toBe("8");
  });
});

// ── buildForm parity for everything above ────────────────────────────────────

describe("buildForm builds the new widgets element for element", () => {
  /** Tag + sorted attributes + text, ids and directives left out (dom.test.ts compares the same way). */
  function shape(node: Element, depth = 0, out: string[] = []): string[] {
    const tag = node.tagName.toLowerCase();
    if (tag === "template") {
      for (const child of (node as HTMLTemplateElement).content.children) shape(child, depth, out);
      return out;
    }
    const attrs = [...node.attributes]
      .filter((attr) => !["id", "for", "aria-describedby", "aria-labelledby"].includes(attr.name) && !/^(?:l-|:|@)/.test(attr.name))
      .filter((attr) => !(tag === "button" && attr.name === "disabled"))
      .map((attr) => `${attr.name}=${attr.name === "name" ? attr.value.replace(/\[\d+\]/g, "[]") : attr.value}`)
      .sort();
    const text = [...node.childNodes].filter((child) => child.nodeType === 3).map((child) => child.textContent!.trim()).join("");
    out.push(`${"  ".repeat(depth)}<${tag} ${attrs.join(" ")}>${text}`);
    for (const child of node.children) shape(child, depth + 1, out);
    return out;
  }

  it("matches renderForm for the broad schema", () => {
    const built = buildForm(BROAD, document, BROAD_UI);
    const rendered = mount(renderForm(BROAD, BROAD_UI)).querySelector("form")!;
    expect(shape(built)).toEqual(shape(rendered));
  });

  it("wires each caption to the option at its end", () => {
    const built = buildForm(BROAD, document, BROAD_UI);
    const radios = [...built.querySelectorAll<HTMLInputElement>('input[name="nps"]')];
    const first = radios[0].getAttribute("aria-describedby")!.split(" ")[0];
    const last = radios[radios.length - 1].getAttribute("aria-describedby")!.split(" ")[0];
    expect(built.querySelector(`#${first}`)!.textContent).toBe("Not likely");
    expect(built.querySelector(`#${last}`)!.textContent).toBe("Very likely");
  });
});
