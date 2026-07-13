import { describe, it, expect, beforeEach } from "bun:test";

// faqir-validate — l-validate declarative form validation plugin. [0.6-02 · §7.1, §A5]
const Faqir = require("../../registry/core/faqir-core.js");

// Simulate browser load order (core, then plugin): expose a global Faqir and spy
// on .plugin BEFORE requiring the plugin so we can assert self-registration.
let pluginCalls = 0;
const origPlugin = Faqir.plugin;
Faqir.plugin = function (fn: any) {
  pluginCalls++;
  return origPlugin.call(Faqir, fn);
};
(globalThis as any).Faqir = Faqir;
const install = require("../../registry/core/plugins/faqir-validate.js");
Faqir.plugin = origPlugin;

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

// A field-group + control + error part, exactly the markup @faqir-ui/forms emits.
// Extra attributes/controls are injected via the `extra` slot per test.
function group(inner: string, groupAttrs = ""): string {
  return `
    <div data-ui="field-group"${groupAttrs ? " " + groupAttrs : ""}>
      <label data-part="label">Field</label>
      ${inner}
      <p data-part="error"></p>
    </div>`;
}

// Build a page with the given form body and optional l-data scope, then boot.
async function boot(formBody: string, opts: { data?: string; formAttr?: string } = {}) {
  const data = opts.data ? opts.data : "{}";
  const formAttr = opts.formAttr === undefined ? "l-validate" : opts.formAttr;
  document.body.innerHTML = `
    <div l-data="${data.replace(/"/g, "&quot;")}">
      <form ${formAttr}>
        ${formBody}
        <button type="submit" id="submit">Save</button>
      </form>
    </div>`;
  Faqir.start();
  await tick();
  const form = document.querySelector("form") as HTMLFormElement;
  return { form };
}

function submit(form: HTMLFormElement): Event {
  const ev = new Event("submit", { bubbles: true, cancelable: true });
  form.dispatchEvent(ev);
  return ev;
}

function fieldGroupOf(control: Element): HTMLElement {
  return control.closest('[data-ui="field-group"]') as HTMLElement;
}
function errorOf(control: Element): HTMLElement {
  return fieldGroupOf(control).querySelector('[data-part="error"]') as HTMLElement;
}

beforeEach(async () => {
  document.body.innerHTML = "";
  await tick();
});

describe("faqir-validate · registration", () => {
  it("self-registers via Faqir.plugin and exports the installer", () => {
    expect(pluginCalls).toBe(1);
    expect(typeof install).toBe("function");
  });
});

describe("faqir-validate · native constraints on submit", () => {
  it("required: empty field flips its field-group to invalid with a message", async () => {
    const { form } = await boot(group(`<input data-part="input" name="a" required>`));
    const input = form.querySelector("input")!;

    // No error shown before the first attempt.
    expect(fieldGroupOf(input).getAttribute("data-state")).toBe(null);

    const ev = submit(form);
    expect(ev.defaultPrevented).toBe(true); // submit blocked
    expect(fieldGroupOf(input).getAttribute("data-state")).toBe("invalid");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(errorOf(input).textContent!.length).toBeGreaterThan(0);
  });

  it("type=email: malformed value is invalid on submit", async () => {
    const { form } = await boot(
      group(`<input data-part="input" name="e" type="email" value="not-an-email">`)
    );
    const input = form.querySelector("input")!;
    submit(form);
    expect(fieldGroupOf(input).getAttribute("data-state")).toBe("invalid");
    expect(input.getAttribute("aria-invalid")).toBe("true");
  });

  it("pattern: value not matching the pattern is invalid on submit", async () => {
    const { form } = await boot(
      group(`<input data-part="input" name="p" pattern="\\d+" value="abc">`)
    );
    const input = form.querySelector("input")!;
    submit(form);
    expect(fieldGroupOf(input).getAttribute("data-state")).toBe("invalid");
  });

  it("author data-error message overrides the built-in default", async () => {
    const { form } = await boot(
      group(`<input data-part="input" name="a" required data-error="We need this.">`)
    );
    const input = form.querySelector("input")!;
    submit(form);
    expect(errorOf(input).textContent).toBe("We need this.");
  });

  it("per-constraint data-error-<constraint> wins over the generic data-error", async () => {
    const { form } = await boot(
      group(
        `<input data-part="input" name="a" required data-error="generic" data-error-required="Required!">`
      )
    );
    const input = form.querySelector("input")!;
    submit(form);
    expect(errorOf(input).textContent).toBe("Required!");
  });
});

describe("faqir-validate · valid input clears state", () => {
  it("filling a required field clears state, error text, and aria-invalid", async () => {
    const { form } = await boot(group(`<input data-part="input" name="a" required>`));
    const input = form.querySelector("input") as HTMLInputElement;

    submit(form);
    expect(fieldGroupOf(input).getAttribute("data-state")).toBe("invalid");

    // Fix it and revalidate live (post-attempt input revalidation).
    input.value = "hello";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await tick();

    expect(fieldGroupOf(input).getAttribute("data-state")).toBe(null);
    expect(input.getAttribute("aria-invalid")).toBe(null);
    expect(errorOf(input).textContent).toBe("");
  });

  it("a clean submit with no expression is not prevented (native submit proceeds)", async () => {
    const { form } = await boot(
      group(`<input data-part="input" name="a" value="ok" required>`)
    );
    const ev = submit(form);
    expect(ev.defaultPrevented).toBe(false);
  });
});

describe("faqir-validate · custom expression validators", () => {
  it("custom validator receives value; falsy result → invalid with provided message", async () => {
    const { form } = await boot(
      group(
        `<input data-part="input" name="e" value="alice@gmail.com"
                l-validate:company="isCompanyEmail(value)"
                data-error-company="Use your company address.">`
      ),
      { data: "{ isCompanyEmail: (v) => /@acme\\.com$/.test(v) }" }
    );
    const input = form.querySelector("input") as HTMLInputElement;

    submit(form);
    expect(fieldGroupOf(input).getAttribute("data-state")).toBe("invalid");
    expect(errorOf(input).textContent).toBe("Use your company address.");

    // Satisfy the custom rule → clears on live revalidation.
    input.value = "alice@acme.com";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await tick();
    expect(fieldGroupOf(input).getAttribute("data-state")).toBe(null);
    expect(input.getAttribute("aria-invalid")).toBe(null);
  });

  it("custom validator runs only after native constraints pass", async () => {
    // Empty + required + a custom rule: the native 'required' message wins,
    // the custom rule is not consulted (can't check format of an empty value).
    const { form } = await boot(
      group(
        `<input data-part="input" name="e" required
                l-validate:company="isCompanyEmail(value)"
                data-error-required="Required." data-error-company="Company only.">`
      ),
      { data: "{ isCompanyEmail: (v) => false }" }
    );
    const input = form.querySelector("input")!;
    submit(form);
    expect(errorOf(input).textContent).toBe("Required.");
  });
});

describe("faqir-validate · submit gating + on-valid hook", () => {
  it("blocks submit while invalid, then fires the on-valid hook when clean", async () => {
    const { form } = await boot(
      group(`<input data-part="input" name="a" required>`),
      { data: "{ saved: false }", formAttr: 'l-validate="saved = true"' }
    );
    const input = form.querySelector("input") as HTMLInputElement;
    const scope = (document.querySelector("[l-data]") as any).__faqirScope;

    const bad = submit(form);
    expect(bad.defaultPrevented).toBe(true);
    expect(scope.saved).toBe(false); // hook did NOT run while invalid

    input.value = "here";
    const good = submit(form);
    expect(good.defaultPrevented).toBe(true); // SPA hook suppresses native submit
    expect(scope.saved).toBe(true); // hook ran once clean
  });

  it("focuses the first invalid control on a blocked submit", async () => {
    const { form } = await boot(
      group(`<input data-part="input" name="a" value="ok" required>`) +
        group(`<input data-part="input" id="second" name="b" required>`)
    );
    submit(form);
    expect(document.activeElement).toBe(document.getElementById("second"));
  });
});

describe("faqir-validate · revalidation policy", () => {
  it("blur before the first submit does NOT show errors", async () => {
    const { form } = await boot(group(`<input data-part="input" name="a" required>`));
    const input = form.querySelector("input")!;

    input.dispatchEvent(new Event("blur", { bubbles: false }));
    await tick();
    // Untouched before first attempt — no error surfaced.
    expect(fieldGroupOf(input).getAttribute("data-state")).toBe(null);
    expect(input.getAttribute("aria-invalid")).toBe(null);
  });

  it("blur AFTER the first submit revalidates that field", async () => {
    const { form } = await boot(
      group(`<input data-part="input" name="a" value="ok" required>`) +
        group(`<input data-part="input" id="b" name="b" required>`)
    );
    const a = form.querySelector("input") as HTMLInputElement;
    submit(form); // first attempt: b is invalid, a is fine

    // Now clear a and blur it — post-attempt blur revalidates it live.
    a.value = "";
    a.dispatchEvent(new Event("blur", { bubbles: false }));
    await tick();
    expect(fieldGroupOf(a).getAttribute("data-state")).toBe("invalid");
  });
});

describe("faqir-validate · aria wiring", () => {
  it("wires aria-describedby to the error part when it has an id, and clears it", async () => {
    const { form } = await boot(
      `<div data-ui="field-group">
         <label data-part="label">Field</label>
         <input data-part="input" name="a" required>
         <p data-part="error" id="a-err"></p>
       </div>`
    );
    const input = form.querySelector("input") as HTMLInputElement;

    submit(form);
    expect(input.getAttribute("aria-describedby")).toBe("a-err");

    input.value = "x";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await tick();
    expect(input.getAttribute("aria-describedby")).toBe(null);
  });

  it("skips disabled controls and [data-validate-ignore] controls", async () => {
    const { form } = await boot(
      group(`<input data-part="input" name="a" required disabled>`) +
        group(`<input data-part="input" name="b" required data-validate-ignore>`)
    );
    const [a, b] = Array.from(form.querySelectorAll("input")) as HTMLInputElement[];
    const ev = submit(form);
    // Neither participates → clean submit, nothing marked invalid.
    expect(ev.defaultPrevented).toBe(false);
    expect(fieldGroupOf(a).getAttribute("data-state")).toBe(null);
    expect(fieldGroupOf(b).getAttribute("data-state")).toBe(null);
  });
});
