// The forms API a downstream app asked for (forecraft upstream notes #1–#5):
// the rules definition as data, a single-page submit button, one valid-submit
// event for both form shapes, the public form reader, and a form whose page
// supplies its own heading.

import { afterAll, afterEach, beforeEach, describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildForm } from "../src/dom.js";
import { renderForm, rulesFor } from "../src/index.js";
import type { ObjectSchema, RenderFormOptions, UISchema } from "../src/index.js";
import {
  BILLING_RULES_OPTS,
  BILLING_RULES_SCHEMA,
  GOLDEN_CASES,
  PLAN_WIZARD_SCHEMA,
  PLAN_WIZARD_UI,
} from "./cases";

// ── #1 · rulesFor ────────────────────────────────────────────────────────────

/** The definition a rendered form embeds, parsed back out of its script. */
function embedded(html: string): unknown {
  const match = html.match(/<script type="application\/json" id="[^"]*">\n([\s\S]*?)\n<\/script>/);
  return match ? JSON.parse(match[1]) : null;
}

const RULES_CASES: Array<{ name: string; schema: ObjectSchema; ui?: UISchema; opts?: RenderFormOptions }> = [
  ...GOLDEN_CASES.map((fixture) => ({ name: fixture.name, schema: fixture.schema, ui: fixture.uiSchema, opts: fixture.opts })),
  { name: "billing rules", schema: BILLING_RULES_SCHEMA, opts: BILLING_RULES_OPTS },
  { name: "plan wizard", schema: PLAN_WIZARD_SCHEMA, ui: PLAN_WIZARD_UI, opts: { idPrefix: "plan" } },
  {
    name: "a pattern no attribute can carry",
    schema: { type: "object", properties: { host: { type: "string", pattern: "[a-z0-9.-]+" } } },
  },
  {
    name: "author rules with a compute target and a required path",
    schema: { type: "object", properties: { price: { type: "number" }, qty: { type: "integer" } } },
    opts: {
      rules: {
        fields: { total: { type: "number" } },
        required: ["qty"],
        rules: [{ id: "total", compute: "total", value: { "*": [{ var: "price" }, { var: "qty" }] } }],
      },
    },
  },
];

describe("rulesFor (#1)", () => {
  const carrying = RULES_CASES.filter((fixture) =>
    embedded(renderForm(fixture.schema, fixture.ui, fixture.opts)) !== null);

  it("is exercised by every kind of case that emits a rules script", () => {
    expect(carrying.map((fixture) => fixture.name)).toEqual(expect.arrayContaining([
      "conditional-rules", "wizard-jump", "nullable", "billing rules", "plan wizard",
      "a pattern no attribute can carry", "author rules with a compute target and a required path",
    ]));
  });

  for (const fixture of RULES_CASES) {
    it(`returns exactly what ${fixture.name} embeds`, () => {
      const script = embedded(renderForm(fixture.schema, fixture.ui, fixture.opts));
      expect(rulesFor(fixture.schema, fixture.ui, fixture.opts)).toEqual(script as any);
    });
  }

  it("answers null for a form that carries no definition", () => {
    const schema: ObjectSchema = { type: "object", properties: { name: { type: "string" } } };
    expect(renderForm(schema)).not.toContain("<script");
    expect(rulesFor(schema)).toBeNull();
  });

  it("hands back a copy, never the author's own rule objects", () => {
    const rule = { id: "total", compute: "total", value: 1 };
    const opts: RenderFormOptions = { rules: { fields: { total: { type: "number" } }, rules: [rule] } };
    const schema: ObjectSchema = { type: "object", properties: { qty: { type: "integer" } } };
    const definition = rulesFor(schema, {}, opts) as any;
    expect(definition.rules[0]).toEqual(rule);
    expect(definition.rules[0]).not.toBe(rule);
    definition.rules[0].value = 2;
    expect(rulesFor(schema, {}, opts)?.rules?.[0]).toEqual(rule);
  });

  it("throws where renderForm throws", () => {
    const bad = { type: "object", properties: { x: { type: "string", format: "color" } } } as unknown as ObjectSchema;
    expect(() => renderForm(bad)).toThrow(/format/);
    expect(() => rulesFor(bad)).toThrow(/format/);
  });
});

// ── #2 · the single-page submit button ───────────────────────────────────────

const FOOTER = [
  "  <div>",
  '    <button type="submit" data-ui="button" data-variant="primary">Submit</button>',
  "  </div>",
  "</form>",
].join("\n");

const SIMPLE: ObjectSchema = {
  type: "object",
  title: "Contact",
  description: "How to reach you.",
  properties: {
    name: { type: "string", title: "Name" },
    age: { type: "integer", title: "Age" },
  },
  required: ["name"],
};

describe("a single-page form's submit button (#2)", () => {
  it("ends the form in a footer holding a primary submit button", () => {
    expect(renderForm(SIMPLE).endsWith(`${FOOTER}\n`)).toBe(true);
  });

  it("labels it from i18n.submitLabel, escaped", () => {
    const html = renderForm(SIMPLE, {}, { i18n: { submitLabel: "Send <now> & go" } });
    expect(html).toContain('<button type="submit" data-ui="button" data-variant="primary">Send &lt;now&gt; &amp; go</button>');
  });

  it("follows layout groups too", () => {
    const html = renderForm(SIMPLE, { "ui:groups": [{ title: "All", fields: ["name", "age"] }] });
    expect(html.endsWith(`  </fieldset>\n${FOOTER}\n`)).toBe(true);
  });

  it("is left out with submit: false", () => {
    const html = renderForm(SIMPLE, {}, { submit: false });
    expect(html).not.toContain('type="submit"');
    expect(html.endsWith("  </div>\n</form>\n")).toBe(true);
  });

  it("adds nothing to a wizard, whose last step already submits", () => {
    const ui: UISchema = { "ui:wizard": { steps: [{ title: "A", fields: ["name"] }, { title: "B", fields: ["age"] }] } };
    const html = renderForm(SIMPLE, ui);
    expect(html.match(/type="submit"/g)?.length).toBe(2); // Next and Submit
    expect(renderForm(SIMPLE, ui, { submit: false })).toBe(html);
  });

  it("refuses a submit option that is not a boolean", () => {
    expect(() => renderForm(SIMPLE, {}, { submit: "no" } as unknown as RenderFormOptions)).toThrow(/opts\.submit must be a boolean/);
  });

  it("is built by buildForm as well, and left out the same way", () => {
    const built = buildForm(SIMPLE, document, {}, { i18n: { submitLabel: "Send" } });
    const last = built.lastElementChild as HTMLElement;
    expect(last.tagName).toBe("DIV");
    expect(last.outerHTML).toBe('<div><button type="submit" data-ui="button" data-variant="primary">Send</button></div>');
    expect(buildForm(SIMPLE, document, {}, { submit: false }).querySelector('[type="submit"]')).toBeNull();
  });

  it("is in the form-page pattern's canonical HTML", () => {
    const pattern = readFileSync(join(import.meta.dir, "../../../registry/patterns/form-page/form-page.html"), "utf8");
    expect(pattern.endsWith(`${FOOTER}\n`)).toBe(true);
  });
});

// ── #5 · a heading the page supplies ─────────────────────────────────────────

describe("heading and labelledBy (#5)", () => {
  it("heading: false keeps the accessible name and drops the h1 and description", () => {
    const html = renderForm(SIMPLE, {}, { heading: false, idPrefix: "c" });
    expect(html).toContain('aria-label="Contact"');
    expect(html).not.toContain("<h1>");
    expect(html).not.toContain("How to reach you.");
    expect(html).not.toContain("aria-describedby=\"c-form-description\"");
  });

  it("labelledBy names the form from the page's own heading", () => {
    const html = renderForm(SIMPLE, {}, { labelledBy: "hero-title", idPrefix: "c" });
    expect(html).toContain('aria-labelledby="hero-title"');
    expect(html).not.toContain('aria-label="Contact"');
    // Orthogonal to `heading`: the h1 stays unless that is turned off too.
    expect(html).toContain("<h1>Contact</h1>");
    const both = renderForm(SIMPLE, {}, { labelledBy: "hero-title", heading: false });
    expect(both).toContain('aria-labelledby="hero-title"');
    expect(both).not.toContain("<h1>");
  });

  it("applies to a wizard as well", () => {
    const ui: UISchema = { "ui:wizard": { steps: [{ title: "A", fields: ["name"] }, { title: "B", fields: ["age"] }] } };
    const html = renderForm(SIMPLE, ui, { heading: false });
    expect(html).toContain('aria-label="Contact"');
    expect(html).not.toContain("<h1>");
  });

  it("refuses malformed values", () => {
    expect(() => renderForm(SIMPLE, {}, { heading: 0 } as unknown as RenderFormOptions)).toThrow(/opts\.heading must be a boolean/);
    expect(() => renderForm(SIMPLE, {}, { labelledBy: "  " })).toThrow(/opts\.labelledBy cannot be empty/);
    expect(() => renderForm(SIMPLE, {}, { labelledBy: 3 } as unknown as RenderFormOptions)).toThrow(/opts\.labelledBy must be a string/);
  });

  it("is honoured by buildForm", () => {
    const built = buildForm(SIMPLE, document, {}, { heading: false, labelledBy: "hero-title" });
    expect(built.getAttribute("aria-labelledby")).toBe("hero-title");
    expect(built.hasAttribute("aria-label")).toBe(false);
    expect(built.hasAttribute("aria-describedby")).toBe(false);
    expect(built.querySelector("h1, p:not([data-part])")).toBeNull();
  });
});

// ── #3 / #4 · faqir:valid-submit and Faqir.rules.data, in a page ──────────────
//
// faqir-core + faqir-validate + faqir-rules, the drops a page loads, evaluated
// into the engine as `rules.test.ts` does (a cached require would rob
// `tests/core/faqir-rules.test.ts` of the first-require registration it pins).

const Faqir = require("../../../registry/core/faqir-core.js");
for (const plugin of ["faqir-validate.js", "faqir-rules.js"]) {
  const source = readFileSync(join(import.meta.dir, "../../../registry/core/plugins", plugin), "utf8");
  const module = { exports: {} as unknown };
  const evaluate = new Function("module", "exports", "Faqir", source);
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

let container: HTMLElement | null = null;
let mounts = 0;

function unmount(): void {
  if (!container) return;
  Faqir.destroy(container);
  container.remove();
  container = null;
}

/** Mount a rendered form into a disposable container — never the document. */
async function mount(html: string): Promise<HTMLFormElement> {
  unmount();
  container = document.createElement("div");
  container.innerHTML = html;
  document.body.appendChild(container);
  const form = container.querySelector("form") as HTMLFormElement;
  Faqir.initTree(form);
  await tick();
  return form;
}

function control(form: HTMLFormElement, name: string, value?: string): HTMLInputElement {
  const selector = value === undefined ? `[name="${name}"]` : `[name="${name}"][value="${value}"]`;
  return form.querySelector(selector) as HTMLInputElement;
}

/** Fill a control the way a person does, so the rules plugin repaints. */
async function fill(el: HTMLInputElement, value: string | boolean): Promise<void> {
  if (typeof value === "boolean") el.checked = value;
  else el.value = value;
  el.dispatchEvent(new Event(typeof value === "boolean" ? "change" : "input", { bubbles: true }));
  await tick();
}

function submit(form: HTMLFormElement): Event {
  const ev = new Event("submit", { bubbles: true, cancelable: true });
  form.dispatchEvent(ev);
  return ev;
}

/** Every `faqir:valid-submit` the form fires, and what it carried. */
function listen(form: HTMLFormElement, cancel = false): CustomEvent[] {
  const seen: CustomEvent[] = [];
  form.addEventListener("faqir:valid-submit", (event) => {
    seen.push(event as CustomEvent);
    if (cancel) event.preventDefault();
  });
  return seen;
}

/** Stand in for `HTMLFormElement.submit`, which a test page cannot navigate with. */
function countNativeSubmits(form: HTMLFormElement): { count: number } {
  const calls = { count: 0 };
  form.submit = () => {
    calls.count++;
  };
  return calls;
}

let rulesBefore: unknown;
beforeEach(async () => {
  unmount();
  rulesBefore = (Faqir as any).rules;
  await tick();
});
afterEach(() => unmount());
afterAll(() => unmount());

const WIZARD_UI: UISchema = {
  "ui:wizard": { steps: [{ title: "You", fields: ["name"] }, { title: "More", fields: ["age"] }] },
};

describe("faqir:valid-submit on a single-page form (#3)", () => {
  it("fires once on a clean submit, with the data, and lets the native submit through", async () => {
    const form = await mount(renderForm(SIMPLE, {}, { idPrefix: `sp${++mounts}` }));
    const seen = listen(form);

    expect(submit(form).defaultPrevented).toBe(true); // name is required
    expect(seen.length).toBe(0);

    await fill(control(form, "name"), "Ada");
    await fill(control(form, "age"), "36");
    const ev = submit(form);
    expect(seen.length).toBe(1);
    expect(ev.defaultPrevented).toBe(false);
    expect(seen[0].bubbles).toBe(true);
    expect(seen[0].cancelable).toBe(true);
    // A form with no definition: Faqir.rules.data's uncoerced read.
    expect(seen[0].detail).toEqual({ name: "Ada", age: "36" });
  });

  it("is the SPA hook: cancelling it keeps the browser from posting", async () => {
    const form = await mount(renderForm(SIMPLE, {}, { idPrefix: `sp${++mounts}` }));
    const seen = listen(form, true);
    await fill(control(form, "name"), "Ada");
    expect(submit(form).defaultPrevented).toBe(true);
    expect(seen.length).toBe(1);
  });

  it("coerces through the definition when the form carries one", async () => {
    const schema: ObjectSchema = {
      ...SIMPLE,
      properties: { ...SIMPLE.properties, company: { type: "string", title: "Company" }, kind: { type: "string", enum: ["me", "org"] } },
      if: { properties: { kind: { const: "org" } } },
      then: { properties: { company: {} } },
    };
    const form = await mount(renderForm(schema, {}, { idPrefix: `sp${++mounts}` }));
    const seen = listen(form);
    await fill(control(form, "name"), "Ada");
    await fill(control(form, "age"), "36");
    await fill(control(form, "kind", "me"), true);
    submit(form);
    expect(seen.length).toBe(1);
    // `age` is a number now, and the hidden `company` is not there at all.
    expect(seen[0].detail).toEqual({ name: "Ada", age: 36, kind: "me" });
    expect(seen[0].detail).toEqual((Faqir as any).rules.data(form));
  });

  it("waits for an async check, then fires once before the native submit", async () => {
    const form = await mount(renderForm(SIMPLE, {}, { idPrefix: `sp${++mounts}` }));
    const native = countNativeSubmits(form);
    const seen = listen(form);
    let release: (ok: boolean) => void = () => {};
    Faqir.validate.register(form, "name", "free", () => new Promise<boolean>((resolve) => (release = resolve)));
    await fill(control(form, "name"), "Ada");

    expect(submit(form).defaultPrevented).toBe(true); // held while the check is out
    expect(seen.length).toBe(0);
    release(true);
    await tick();
    expect(seen.length).toBe(1);
    expect(native.count).toBe(1);
  });

  it("does not post after an async check when a listener took the submit", async () => {
    const form = await mount(renderForm(SIMPLE, {}, { idPrefix: `sp${++mounts}` }));
    const native = countNativeSubmits(form);
    const seen = listen(form, true);
    Faqir.validate.register(form, "name", "free", () => Promise.resolve(true));
    await fill(control(form, "name"), "Ada");
    submit(form);
    await tick();
    expect(seen.length).toBe(1);
    expect(native.count).toBe(0);
  });
});

describe("faqir:valid-submit on a wizard (#3)", () => {
  it("fires once, on the last step only, with every step's answers", async () => {
    const form = await mount(renderForm(SIMPLE, WIZARD_UI, { idPrefix: `wz${++mounts}` }));
    const seen = listen(form);

    await fill(control(form, "name"), "Ada");
    expect(submit(form).defaultPrevented).toBe(true); // Next
    await tick();
    expect(seen.length).toBe(0);
    expect(control(form, "name").disabled).toBe(true); // step 1 went dormant

    await fill(control(form, "age"), "36");
    submit(form); // Submit
    await tick();
    expect(form.getAttribute("data-state")).toBe("submitted");
    expect(seen.length).toBe(1);
    // FormData would have lost `name` with its step; this reader keeps it.
    expect(seen[0].detail).toEqual({ name: "Ada", age: "36" });
  });

  it("fires again for a second final submit, but not for a step moved after completion", async () => {
    const form = await mount(renderForm(SIMPLE, WIZARD_UI, { idPrefix: `wz${++mounts}` }));
    const seen = listen(form);
    await fill(control(form, "name"), "Ada");
    submit(form);
    await tick();
    submit(form);
    await tick();
    expect(seen.length).toBe(1);

    submit(form); // a retry after a failed post: one more finished submit
    await tick();
    expect(seen.length).toBe(2);

    const back = [...form.querySelectorAll("button")].find((b) => b.textContent === "Back") as HTMLButtonElement;
    back.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    await tick();
    submit(form); // Next from step one again: not a finished form
    await tick();
    expect(seen.length).toBe(2);
  });

  it("reads the controls itself when faqir-rules is not loaded — the same read, uncoerced", async () => {
    const schema: ObjectSchema = {
      type: "object",
      properties: {
        name: { type: "string" },
        news: { type: "boolean" },
        terms: { type: "boolean" },
        langs: { type: "array", items: { type: "string", enum: ["en", "fr", "de", "ro", "it"] }, uniqueItems: true },
        age: { type: "integer" },
      },
    };
    const ui: UISchema = {
      "ui:wizard": { steps: [{ title: "A", fields: ["name", "news", "terms", "langs"] }, { title: "B", fields: ["age"] }] },
    };
    const saved = (Faqir as any).rules;
    delete (Faqir as any).rules;
    try {
      const form = await mount(renderForm(schema, ui, { idPrefix: `fb${++mounts}` }));
      const seen = listen(form);
      await fill(control(form, "name"), "Ada");
      await fill(control(form, "news"), true);
      const langs = form.querySelector('select[name="langs"]') as HTMLSelectElement;
      langs.options[1].selected = true;
      langs.options[3].selected = true;
      submit(form);
      await tick();
      await fill(control(form, "age"), "36");
      submit(form);
      await tick();
      expect(seen.length).toBe(1);
      expect(seen[0].detail).toEqual({ name: "Ada", news: "on", langs: ["fr", "ro"], age: "36" });
    } finally {
      (Faqir as any).rules = saved;
    }
  });

  it("carries the coerced data, without a page a rule skipped, when the wizard has rules", async () => {
    const form = await mount(renderForm(PLAN_WIZARD_SCHEMA, PLAN_WIZARD_UI, { idPrefix: `plan${++mounts}` }));
    const seen = listen(form);
    await fill(control(form, "plan", "team"), true);
    submit(form);
    await tick();
    await fill(control(form, "seats"), "4");
    submit(form);
    await tick();
    await fill(control(form, "email"), "ada@example.com");
    submit(form);
    await tick();
    expect(seen.length).toBe(1);
    expect(seen[0].detail).toEqual({ plan: "team", seats: 4, email: "ada@example.com" });
  });
});

describe("Faqir.rules.data (#4)", () => {
  it("is installed by faqir-rules", () => {
    expect(typeof (Faqir as any).rules.data).toBe("function");
    expect((Faqir as any).rules).toBe(rulesBefore);
  });

  it("reads a bound form coerced, disabled controls included, rule-hidden ones out", async () => {
    const form = await mount(renderForm(PLAN_WIZARD_SCHEMA, PLAN_WIZARD_UI, { idPrefix: `plan${++mounts}` }));
    await fill(control(form, "plan", "solo"), true);
    await fill(control(form, "seats"), "9"); // on a page the solo path skips
    await fill(control(form, "email"), "ada@example.com"); // on a step not shown yet
    expect(control(form, "email").disabled).toBe(true);
    expect([...new FormData(form).keys()]).toEqual(["plan"]);
    expect((Faqir as any).rules.data(form)).toEqual({ plan: "solo", email: "ada@example.com" });

    await fill(control(form, "plan", "team"), true);
    expect((Faqir as any).rules.data(`#${form.id}`)).toEqual({ plan: "team", seats: 9, email: "ada@example.com" });
  });

  it("reads a form with no l-rules uncoerced, the way fromFormData would", async () => {
    const schema: ObjectSchema = {
      type: "object",
      properties: {
        n: { type: "integer" },
        tags: { type: "array", items: { type: "string", enum: ["a", "b", "c"] }, uniqueItems: true },
      },
    };
    const form = await mount(renderForm(schema, {}, { idPrefix: `raw${++mounts}` }));
    await fill(control(form, "n"), "7");
    await fill(control(form, "tags", "a"), true);
    await fill(control(form, "tags", "c"), true);
    control(form, "n").disabled = true;
    expect((Faqir as any).rules.data(form)).toEqual({ n: "7", tags: ["a", "c"] });
  });

  it("refuses something that is not a form", () => {
    expect(() => (Faqir as any).rules.data("#no-such-form")).toThrow(TypeError);
  });
});
