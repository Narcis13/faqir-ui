import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderForm } from "../src/index.js";
import type { ObjectSchema, UISchema } from "../src/index.js";
import { PATIENT_INTAKE_SCHEMA, PATIENT_INTAKE_UI } from "./cases";

// Integration: the rendered markup must work under faqir-core + faqir-validate
// alone (§7.2 — the client runtime never needs @faqir-ui/forms). faqir-core is
// require()d like every other core test; the validate plugin is evaluated from
// source instead of require()d so this file cannot consume the first-require
// self-registration that tests/core/faqir-validate.test.ts asserts on.
// Re-registering the directive is idempotent (Faqir.directive overwrites by name).
const Faqir = require("../../../registry/core/faqir-core.js");
{
  const source = readFileSync(join(import.meta.dir, "../../../registry/core/plugins/faqir-validate.js"), "utf8");
  const mod = { exports: {} as unknown };
  new Function("module", "exports", source)(mod, mod.exports);
  Faqir.plugin(mod.exports);
}

// happy-dom quirk (verified in 20.10.6): an element parsed with BOTH `x` and
// `:x` treats `:x` as a namespaced attribute with localName "x"; after a
// binding REPLACES `x`'s value, getAttribute/attribute-selectors read the stale
// named-item index while the item list (and real browsers, where `:x` is a
// literal name) hold the live value. So: read attributes through the item
// list, and select repeated rows via their STATIC (template) attribute values.
function attrOf(el: Element, name: string): string | null {
  for (const attr of [...el.attributes] as Attr[]) {
    if (attr.name === name) return attr.value;
  }
  return null;
}

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function boot(html: string): Promise<HTMLFormElement> {
  // Every Faqir.start() attaches a persistent MutationObserver to the CURRENT
  // <body>; re-using one body element across boots lets earlier observers
  // re-init later markup with stale scopes. A fresh body per boot keeps each
  // start's observer scoped to its own document lifetime — mirroring a real
  // page load, where core boots exactly once per document.
  const freshBody = document.createElement("body");
  document.documentElement.replaceChild(freshBody, document.body);
  document.body.innerHTML = html;
  Faqir.start();
  await tick();
  return document.querySelector("form") as HTMLFormElement;
}

function submit(form: HTMLFormElement): Event {
  const ev = new Event("submit", { bubbles: true, cancelable: true });
  form.dispatchEvent(ev);
  return ev;
}

function click(el: Element): void {
  el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
}

function buttonByText(root: Element, text: string): HTMLButtonElement {
  const button = [...root.querySelectorAll("button")].find((b) => b.textContent?.trim() === text);
  if (!button) throw new Error(`no <button> with text "${text}"`);
  return button as HTMLButtonElement;
}

beforeEach(async () => {
  await tick(); // drain any pending effects/observers from the previous test
});

afterAll(() => {
  // Leave later test files a body that none of this file's boot observers watch.
  document.documentElement.replaceChild(document.createElement("body"), document.body);
});

const CONTACTS_SCHEMA: ObjectSchema = {
  type: "object",
  properties: {
    contacts: {
      type: "array",
      title: "Contacts",
      minItems: 1,
      maxItems: 3,
      items: {
        type: "object",
        properties: { name: { type: "string", title: "Name" } },
        required: ["name"],
      },
    },
  },
};

describe("repeatable groups under faqir-core", () => {
  const rowsOf = (form: HTMLFormElement) =>
    [...form.querySelectorAll('[data-ui="card"][data-variant="filled"]')];
  const rowInputs = (form: HTMLFormElement) =>
    [...form.querySelectorAll('input[name="contacts[].name"]')] as HTMLInputElement[];

  it("renders minItems rows and adds rows up to maxItems via the rendered markup alone", async () => {
    const form = await boot(renderForm(CONTACTS_SCHEMA));
    expect(rowsOf(form).length).toBe(1);

    const addButton = buttonByText(form, "Add Contacts");
    // minItems = 1 → the lone row's remove button is disabled.
    expect(buttonByText(form, "Remove Contacts").hasAttribute("disabled")).toBe(true);

    click(addButton);
    await tick();
    expect(rowsOf(form).length).toBe(2);

    // Row-unique wiring materialized from the bindings: key-derived ids,
    // index-derived names, label for matching the control id.
    const inputs = rowInputs(form);
    expect(inputs.map((i) => attrOf(i, "id"))).toEqual([
      "faqir-field-contacts-1-name",
      "faqir-field-contacts-2-name",
    ]);
    expect(inputs.map((i) => attrOf(i, "name"))).toEqual(["contacts[0].name", "contacts[1].name"]);
    const secondLabel = rowsOf(form)[1].querySelector('[data-part="label"]') as HTMLElement;
    expect(attrOf(secondLabel, "for")).toBe("faqir-field-contacts-2-name");

    click(addButton);
    await tick();
    expect(rowsOf(form).length).toBe(3);
    // maxItems = 3 → the add button disables itself.
    expect(addButton.hasAttribute("disabled")).toBe(true);
  });

  it("removes rows keyed — surviving rows keep their DOM state and reindex their names", async () => {
    const form = await boot(renderForm(CONTACTS_SCHEMA));
    click(buttonByText(form, "Add Contacts"));
    await tick();

    const inputs = rowInputs(form);
    inputs[0].value = "First person";
    inputs[1].value = "Second person";
    const secondRowInput = inputs[1];

    // Remove the FIRST row; the second row's element must survive (l-key) with
    // its typed value intact, and its bound name must reindex to [0].
    const firstRemove = rowsOf(form)[0].querySelector("button") as HTMLButtonElement;
    click(firstRemove);
    await tick();

    const remaining = rowsOf(form);
    expect(remaining.length).toBe(1);
    const survivor = rowInputs(form)[0];
    expect(survivor).toBe(secondRowInput); // same DOM node — keyed reuse, not re-render
    expect(survivor.value).toBe("Second person");
    expect(attrOf(survivor, "id")).toBe("faqir-field-contacts-2-name");
    expect(attrOf(survivor, "name")).toBe("contacts[0].name");
  });

  it("gates submission on row-level constraints via faqir-validate", async () => {
    const form = await boot(renderForm(CONTACTS_SCHEMA));
    const input = rowInputs(form)[0];

    const blocked = submit(form);
    expect(blocked.defaultPrevented).toBe(true);
    const group = input.closest('[data-ui="field-group"]') as HTMLElement;
    expect(group.getAttribute("data-state")).toBe("invalid");
    expect(group.querySelector('[data-part="error"]')?.textContent).not.toBe("");

    input.value = "Ada";
    const clean = submit(form);
    expect(clean.defaultPrevented).toBe(false);
    expect(group.getAttribute("data-state")).toBeNull();
  });
});

const WIZARD_SCHEMA: ObjectSchema = {
  type: "object",
  properties: {
    fullName: { type: "string", title: "Full name" },
    plan: { type: "string", title: "Plan", enum: ["free", "team"] },
  },
  required: ["fullName"],
};
const WIZARD_UI: UISchema = {
  "ui:wizard": {
    steps: [
      { title: "Profile", fields: ["fullName"] },
      { title: "Plan", fields: ["plan"] },
    ],
  },
};

describe("wizard under faqir-core (0.6-14 pattern contract stub)", () => {
  const panelsOf = (form: HTMLFormElement) => [...form.querySelectorAll('section[data-ui="card"]')];
  const stepsOf = (form: HTMLFormElement) => [...form.querySelectorAll('[data-ui="stepper"] [data-part="step"]')];

  it("derives steps from uiSchema and shows only the active panel", async () => {
    const form = await boot(renderForm(WIZARD_SCHEMA, WIZARD_UI));
    const panels = panelsOf(form);
    const steps = stepsOf(form);
    expect(panels.length).toBe(2);
    expect(steps.length).toBe(2);
    expect(panels[0].hasAttribute("hidden")).toBe(false);
    expect(panels[1].hasAttribute("hidden")).toBe(true);
    expect(attrOf(steps[0], "data-state")).toBe("active");
    expect(attrOf(steps[1], "data-state")).toBeNull();
    // Inactive-step controls are disabled, so they are excluded from validation.
    const radio = form.querySelector('input[name="plan"]') as HTMLInputElement;
    expect(radio.disabled).toBe(true);
  });

  it("blocks advancing while the active step is invalid, then advances when it is valid", async () => {
    const form = await boot(renderForm(WIZARD_SCHEMA, WIZARD_UI));
    const panels = panelsOf(form);
    const nameInput = form.querySelector('input[name="fullName"]') as HTMLInputElement;

    submit(form); // Next with the required field empty
    await tick();
    expect(panels[0].hasAttribute("hidden")).toBe(false);
    const group = nameInput.closest('[data-ui="field-group"]') as HTMLElement;
    expect(group.getAttribute("data-state")).toBe("invalid");

    nameInput.value = "Ada Lovelace";
    submit(form); // Next again, now valid
    await tick();
    expect(panels[0].hasAttribute("hidden")).toBe(true);
    expect(panels[1].hasAttribute("hidden")).toBe(false);
    const steps = stepsOf(form);
    expect(attrOf(steps[0], "data-state")).toBe("completed");
    expect(attrOf(steps[1], "data-state")).toBe("active");
    // Step 2's controls woke up; step 1's went dormant.
    expect((form.querySelector('input[name="plan"]') as HTMLInputElement).disabled).toBe(false);
    expect(nameInput.disabled).toBe(true);
  });

  it("navigates back and completes on the final step", async () => {
    const form = await boot(renderForm(WIZARD_SCHEMA, WIZARD_UI));
    const nameInput = form.querySelector('input[name="fullName"]') as HTMLInputElement;
    nameInput.value = "Ada Lovelace";
    submit(form);
    await tick();

    click(buttonByText(form, "Back"));
    await tick();
    expect(panelsOf(form)[0].hasAttribute("hidden")).toBe(false);

    submit(form); // forward again (still valid)
    await tick();
    expect(panelsOf(form)[1].hasAttribute("hidden")).toBe(false);

    submit(form); // final step — plan is optional, so this completes
    await tick();
    expect(attrOf(form, "data-state")).toBe("submitted");
  });
});

describe("patient intake end-to-end (renders, validates, submits — zero custom JS)", () => {
  it("walks the full three-step intake against faqir-core + faqir-validate only", async () => {
    const html = renderForm(PATIENT_INTAKE_SCHEMA, PATIENT_INTAKE_UI, { idPrefix: "intake" });
    expect(html).not.toContain("<script"); // zero custom JS, by construction

    const form = await boot(html);
    const panels = [...form.querySelectorAll('section[data-ui="card"]')];
    expect(panels.length).toBe(3);
    expect(panels[0].hasAttribute("hidden")).toBe(false);

    // ── Step 1 · Patient — required fullName and address.city gate the step.
    submit(form);
    await tick();
    expect(panels[0].hasAttribute("hidden")).toBe(false);
    const fullName = form.querySelector('input[name="fullName"]') as HTMLInputElement;
    expect(fullName.closest('[data-ui="field-group"]')?.getAttribute("data-state")).toBe("invalid");

    fullName.value = "Ada Lovelace";
    (form.querySelector('input[name="address.city"]') as HTMLInputElement).value = "London";
    submit(form);
    await tick();
    expect(panels[0].hasAttribute("hidden")).toBe(true);
    expect(panels[1].hasAttribute("hidden")).toBe(false);

    // ── Step 2 · History — checkbox group, multi-select, repeatable group.
    const fever = form.querySelector('input[name="symptoms"][value="fever"]') as HTMLInputElement;
    expect(fever.disabled).toBe(false);
    fever.checked = true;

    const medName = () =>
      [...form.querySelectorAll('input[name="medications[].name"]')] as HTMLInputElement[];
    submit(form); // required medication name is empty → blocked
    await tick();
    expect(panels[1].hasAttribute("hidden")).toBe(false);
    expect(medName()[0].closest('[data-ui="field-group"]')?.getAttribute("data-state")).toBe("invalid");

    medName()[0].value = "Aspirin";
    click(buttonByText(form, "Add medication"));
    await tick();
    expect(medName().length).toBe(2);
    medName()[1].value = "Ibuprofen";
    ([...form.querySelectorAll('input[name="medications[].dose"]')][1] as HTMLInputElement).value = "200mg";
    submit(form);
    await tick();
    expect(panels[1].hasAttribute("hidden")).toBe(true);
    expect(panels[2].hasAttribute("hidden")).toBe(false);

    // ── Step 3 · Consent — email format + required consent gate completion.
    const email = form.querySelector('input[name="email"]') as HTMLInputElement;
    const consent = form.querySelector('input[name="consent"]') as HTMLInputElement;
    email.value = "not-an-email";
    submit(form);
    await tick();
    expect(attrOf(form, "data-state")).not.toBe("submitted");
    expect(email.closest('[data-ui="field-group"]')?.getAttribute("data-state")).toBe("invalid");

    email.value = "ada@example.com";
    consent.checked = true;
    submit(form);
    await tick();
    expect(attrOf(form, "data-state")).toBe("submitted");

    // The stepper reports the journey: all steps completed except the active last.
    const steps = [...form.querySelectorAll('[data-ui="stepper"] [data-part="step"]')];
    expect(steps.map((s) => attrOf(s, "data-state"))).toEqual(["completed", "completed", "active"]);
  });
});
