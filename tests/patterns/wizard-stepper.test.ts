// The wizard's clickable stepper (wizard 1.1, stepper 1.2). The reference page
// is mounted verbatim in a disposable container under faqir-core +
// faqir-validate — never Faqir.start() — and driven through its stepper buttons:
// a completed step goes back to its panel, steps ahead stay disabled, the
// current one carries aria-current, and nothing a step click does submits.

import { afterEach, describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadEngine } from "../helpers/engine-build";

const Faqir = loadEngine();
{
  // Evaluated from source, as tests/patterns/wizard.test.ts does, so the
  // plugin's first-require self-registration is left to its own test.
  const source = readFileSync(join(import.meta.dir, "../../registry/core/plugins/faqir-validate.js"), "utf8");
  const mod = { exports: {} as unknown };
  new Function("module", "exports", source)(mod, mod.exports);
  Faqir.plugin(mod.exports);
}

const WIZARD_HTML = readFileSync(join(import.meta.dir, "../../registry/patterns/wizard/wizard.html"), "utf8");
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

// happy-dom indexes the stale named attribute of an element parsed with both
// `x` and `:x` (see wizard.test.ts): read attributes through the item list.
const attr = (el: Element, name: string) =>
  [...el.attributes].find((a) => a.name === name)?.value ?? null;
const has = (el: Element, name: string) => [...el.attributes].some((a) => a.name === name);

let box: HTMLElement | null = null;

afterEach(() => {
  if (box) {
    Faqir.destroy(box.firstElementChild);
    box.remove();
    box = null;
  }
});

async function mount() {
  box = document.createElement("div");
  box.innerHTML = WIZARD_HTML;
  document.body.appendChild(box);
  const form = box.querySelector("[data-ui='wizard']") as HTMLFormElement;
  Faqir.initTree(form);
  await tick();
  const steps = [...form.querySelectorAll<HTMLButtonElement>("[data-ui='stepper'] > [data-part='step']")];
  const panels = [...form.querySelectorAll("section[data-part='panel']")];
  const field = (name: string) => form.querySelector(`[name="${name}"]`) as HTMLInputElement;
  return { form, steps, panels, field };
}

async function advance(form: HTMLFormElement, field: (name: string) => HTMLInputElement) {
  field("fullName").value = "Ada Lovelace";
  field("email").value = "ada@example.com";
  form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  await tick();
}

describe("wizard · clickable stepper", () => {
  it("renders the steps as type=button, the first current and the second disabled", async () => {
    const { steps } = await mount();
    expect(steps).toHaveLength(2);
    for (const step of steps) {
      expect(step.tagName).toBe("BUTTON");
      expect(step.type).toBe("button");
    }
    expect(attr(steps[0], "aria-current")).toBe("step");
    expect(attr(steps[1], "aria-current")).toBeNull();
    expect(has(steps[0], "disabled")).toBe(false);
    expect(has(steps[1], "disabled")).toBe(true);
    expect(steps[0].querySelector("[data-part='status']")!.textContent).toBe("");
  });

  it("Next marks the step completed, says so, and moves aria-current along", async () => {
    const { form, steps, field } = await mount();
    await advance(form, field);
    expect(attr(steps[0], "data-state")).toBe("completed");
    expect(steps[0].querySelector("[data-part='status']")!.textContent).toBe("Completed");
    expect(attr(steps[0], "aria-current")).toBeNull();
    expect(attr(steps[1], "aria-current")).toBe("step");
    expect(has(steps[1], "disabled")).toBe(false);
    const connector = form.querySelector("[data-ui='stepper'] > [data-part='connector']")!;
    expect(attr(connector, "data-state")).toBe("completed");
  });

  it("clicking a completed step returns to its panel and re-disables the step ahead", async () => {
    const { form, steps, panels, field } = await mount();
    await advance(form, field);
    let submits = 0;
    form.addEventListener("submit", () => submits++);

    steps[0].click();
    await tick();

    expect(submits).toBe(0);
    expect(has(panels[0], "hidden")).toBe(false);
    expect(has(panels[1], "hidden")).toBe(true);
    expect(attr(steps[0], "data-state")).toBe("active");
    expect(attr(steps[0], "aria-current")).toBe("step");
    expect(steps[0].querySelector("[data-part='status']")!.textContent).toBe("");
    expect(attr(steps[1], "data-state")).toBeNull();
    expect(has(steps[1], "disabled")).toBe(true);
    // The step being left goes dormant, the one returned to wakes up.
    expect(field("plan").disabled).toBe(true);
    expect(field("fullName").disabled).toBe(false);
    // What was typed is still there, and Next validates it again.
    expect(field("fullName").value).toBe("Ada Lovelace");
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await tick();
    expect(has(panels[1], "hidden")).toBe(false);
  });

  it("clicking the current step changes nothing", async () => {
    const { steps, panels } = await mount();
    steps[0].click();
    await tick();
    expect(has(panels[0], "hidden")).toBe(false);
    expect(attr(steps[0], "data-state")).toBe("active");
  });
});
