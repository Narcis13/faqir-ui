// Behavior contract for the `wizard` pattern (task 0.6-14).
//
// The reference page is mounted verbatim under faqir-core + faqir-validate —
// no @faqir-ui/forms, no custom JS. These tests pin the declarative wizard
// contract: next/back navigation, step-indicator states, per-step validation
// gating (an invalid active step cannot advance), inactive-step controls being
// excluded from validation, and the completion event fired on the final step.

import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// faqir-core is require()d like every other core test; the validate plugin is
// evaluated from source (not require()d) so this file never consumes the
// first-require self-registration that tests/core/faqir-validate.test.ts
// asserts on. Re-registering the directive is idempotent.
const Faqir = require("../../registry/core/faqir-core.js");
{
  const source = readFileSync(
    join(import.meta.dir, "../../registry/core/plugins/faqir-validate.js"),
    "utf8",
  );
  const mod = { exports: {} as unknown };
  new Function("module", "exports", source)(mod, mod.exports);
  Faqir.plugin(mod.exports);
}

const WIZARD_HTML = readFileSync(
  join(import.meta.dir, "../../registry/patterns/wizard/wizard.html"),
  "utf8",
);

// happy-dom quirk (see composites.test.ts): an element parsed with BOTH `x` and
// `:x` indexes the stale named attribute after a binding rewrites the live one.
// Read such attributes through the item list.
function attrOf(el: Element, name: string): string | null {
  for (const attr of [...el.attributes] as Attr[]) {
    if (attr.name === name) return attr.value;
  }
  return null;
}

// Same quirk: elements carry a static `hidden` FOUC guard AND a `:hidden`
// binding (both correct — a real browser lets the binding manage `hidden` while
// `:hidden` stays a literal directive marker). happy-dom's stale named-item
// index makes `hasAttribute("hidden")` lie after the binding removes it, so read
// the live presence through the item list.
function isHidden(el: Element): boolean {
  return [...el.attributes].some((a) => a.name === "hidden");
}

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function boot(): Promise<HTMLFormElement> {
  // Fresh <body> per boot so each Faqir.start()'s MutationObserver is scoped to
  // its own document lifetime — mirroring one core boot per page load.
  const freshBody = document.createElement("body");
  document.documentElement.replaceChild(freshBody, document.body);
  document.body.innerHTML = WIZARD_HTML;
  Faqir.start();
  await tick();
  return document.querySelector('[data-ui="wizard"]') as HTMLFormElement;
}

function submit(form: HTMLFormElement): Event {
  const ev = new Event("submit", { bubbles: true, cancelable: true });
  form.dispatchEvent(ev);
  return ev;
}

function click(el: Element): void {
  el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
}

const panelsOf = (form: HTMLElement) => [...form.querySelectorAll('section[data-ui="card"]')];
const stepsOf = (form: HTMLElement) => [...form.querySelectorAll('[data-ui="stepper"] [data-part="step"]')];
const fieldOf = (form: HTMLElement, name: string) =>
  form.querySelector(`[name="${name}"]`) as HTMLInputElement;

beforeEach(async () => {
  await tick();
});

afterAll(() => {
  document.documentElement.replaceChild(document.createElement("body"), document.body);
});

describe("wizard pattern — reference page", () => {
  it("has zero custom JavaScript", () => {
    expect(WIZARD_HTML).not.toContain("<script");
    expect(WIZARD_HTML).not.toContain("onclick");
  });

  it("renders one card panel and one stepper step per wizard step", async () => {
    const form = await boot();
    expect(form.getAttribute("data-ui")).toBe("wizard");
    expect(panelsOf(form).length).toBe(2);
    expect(stepsOf(form).length).toBe(2);
  });

  it("shows only the active step's panel", async () => {
    const form = await boot();
    const panels = panelsOf(form);
    expect(isHidden(panels[0])).toBe(false);
    expect(isHidden(panels[1])).toBe(true);
  });

  it("marks the first step active and the rest pending", async () => {
    const form = await boot();
    const steps = stepsOf(form);
    expect(attrOf(steps[0], "data-state")).toBe("active");
    expect(attrOf(steps[1], "data-state")).toBeNull();
  });

  it("disables inactive-step controls so validation skips them", async () => {
    const form = await boot();
    expect(fieldOf(form, "fullName").disabled).toBe(false);
    expect(fieldOf(form, "email").disabled).toBe(false);
    expect(fieldOf(form, "plan").disabled).toBe(true);
  });
});

describe("wizard pattern — navigation & validation", () => {
  it("blocks advancing while the active step is invalid", async () => {
    const form = await boot();
    const panels = panelsOf(form);
    const name = fieldOf(form, "fullName");

    submit(form); // Next with required fields empty
    await tick();

    // Still on step 0; the offending field-group is marked invalid.
    expect(isHidden(panels[0])).toBe(false);
    expect(isHidden(panels[1])).toBe(true);
    const group = name.closest('[data-ui="field-group"]') as HTMLElement;
    expect(group.getAttribute("data-state")).toBe("invalid");
  });

  it("advances to the next step once the active step is valid", async () => {
    const form = await boot();
    fieldOf(form, "fullName").value = "Ada Lovelace";
    fieldOf(form, "email").value = "ada@example.com";

    submit(form);
    await tick();

    const panels = panelsOf(form);
    expect(isHidden(panels[0])).toBe(true);
    expect(isHidden(panels[1])).toBe(false);

    const steps = stepsOf(form);
    expect(attrOf(steps[0], "data-state")).toBe("completed");
    expect(attrOf(steps[1], "data-state")).toBe("active");

    // Step 2's controls woke up; step 1's went dormant.
    expect(fieldOf(form, "plan").disabled).toBe(false);
    expect(fieldOf(form, "fullName").disabled).toBe(true);
  });

  it("navigates back to the previous step", async () => {
    const form = await boot();
    fieldOf(form, "fullName").value = "Ada Lovelace";
    fieldOf(form, "email").value = "ada@example.com";
    submit(form);
    await tick();

    click(form.querySelector('[data-part="back"]')!);
    await tick();

    const panels = panelsOf(form);
    expect(isHidden(panels[0])).toBe(false);
    expect(isHidden(panels[1])).toBe(true);
    expect(attrOf(stepsOf(form)[0], "data-state")).toBe("active");
    // Back on step 1, step-2 controls are dormant again.
    expect(fieldOf(form, "plan").disabled).toBe(true);
  });

  it("Back is disabled on the first step and Submit is hidden until the last", async () => {
    const form = await boot();
    const back = form.querySelector('[data-part="back"]') as HTMLButtonElement;
    const next = form.querySelector('[data-part="next"]') as HTMLElement;
    const done = form.querySelector('[data-part="submit"]') as HTMLElement;

    expect(back.disabled).toBe(true);
    expect(isHidden(next)).toBe(false);
    expect(isHidden(done)).toBe(true);

    fieldOf(form, "fullName").value = "Ada Lovelace";
    fieldOf(form, "email").value = "ada@example.com";
    submit(form);
    await tick();

    expect(back.disabled).toBe(false);
    expect(isHidden(next)).toBe(true);
    expect(isHidden(done)).toBe(false);
  });
});

describe("wizard pattern — completion", () => {
  it("marks the form submitted and fires faqir:wizard-complete on the final step", async () => {
    const form = await boot();
    fieldOf(form, "fullName").value = "Ada Lovelace";
    fieldOf(form, "email").value = "ada@example.com";
    submit(form); // step 0 -> 1
    await tick();

    let completed: CustomEvent | null = null;
    form.addEventListener("faqir:wizard-complete", (e) => {
      completed = e as CustomEvent;
    });

    submit(form); // final step — plan defaults to "free", so this completes
    await tick();

    expect(form.getAttribute("data-state")).toBe("submitted");
    expect(completed).not.toBeNull();
    expect((completed as unknown as CustomEvent).detail).toEqual({ steps: 2 });
  });

  it("does not complete while an earlier step blocks", async () => {
    const form = await boot();
    let completed = false;
    form.addEventListener("faqir:wizard-complete", () => {
      completed = true;
    });

    submit(form); // step 0 invalid — cannot even reach the final step
    await tick();

    expect(completed).toBe(false);
    expect(form.getAttribute("data-state")).toBe("active");
  });
});
