import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { settle, tick } from "../helpers/settle";

// faqir-validate — l-validate form validation plugin. [0.6-02 · 1.1B-03 · §7.1, §A5, §8.3]
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

/** Real time, for the 250 ms async debounce. */
function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** A promise plus the handles to settle it from the test. */
function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void; reject: (e?: any) => void } {
  let resolve!: (v: T) => void;
  let reject!: (e?: any) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
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

// Every test mounts into its own container and tears it down again: this suite
// shares one happy-dom realm with every other engine file, so `Faqir.start()`
// on the shared document would leave a MutationObserver on `body` per boot.
// `initTree` binds exactly the subtree we built. (AGENTS.md, "Setup".)
let container: HTMLElement | null = null;

function unmount(): void {
  if (!container) return;
  Faqir.destroy(container);
  container.remove();
  container = null;
}

// Build a page with the given form body and optional l-data scope, then bind it.
async function boot(formBody: string, opts: { data?: string; formAttr?: string } = {}) {
  const data = opts.data ? opts.data : "{}";
  const formAttr = opts.formAttr === undefined ? "l-validate" : opts.formAttr;
  unmount();
  container = document.createElement("div");
  container.innerHTML = `
    <div l-data="${data.replace(/"/g, "&quot;")}">
      <form ${formAttr}>
        ${formBody}
        <button type="submit" id="submit">Save</button>
      </form>
    </div>`;
  document.body.appendChild(container);
  Faqir.initTree(container.firstElementChild as Element);
  await tick();
  const form = container.querySelector("form") as HTMLFormElement;
  const scope = (container.querySelector("[l-data]") as any).__faqirScope;
  return { form, scope };
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
  unmount();
  await tick();
});

afterEach(() => {
  unmount();
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

describe("faqir-validate · a validator's locals are its own", () => {
  it("does not write `value` or `$el` into the page's scope", async () => {
    // The locals hang off `Object.create(scope)`, and the scope is a reactive
    // PROXY, so a plain assignment on the child runs the prototype's `set` trap
    // rather than creating an own property: it can write into page data, and
    // for a magic it is refused outright — a TypeError under "use strict" that
    // made every custom validator fail in Chromium while this suite stayed
    // green. They are `defineProperty`'d for that reason. This case pins the
    // realm-independent half (nothing leaks); the throw is pinned in a real
    // browser by tests/browser/directives.pw.ts. [1.1B-03]
    const { form, scope } = await boot(
      group(
        `<input data-part="input" name="e" value="alice@gmail.com"
                l-validate:company="isCompanyEmail(value)"
                data-error-company="Use your company address.">`
      ),
      { data: "{ isCompanyEmail: (v) => /@acme\\.com$/.test(v) }" }
    );
    const input = form.querySelector("input") as HTMLInputElement;

    submit(form);
    expect(errorOf(input).textContent).toBe("Use your company address.");
    expect(scope.value).toBeUndefined();
    expect(scope.$el).not.toBe(input);
  });
});

describe("faqir-validate · submit gating + on-valid hook", () => {
  it("blocks submit while invalid, then fires the on-valid hook when clean", async () => {
    const { form, scope } = await boot(
      group(`<input data-part="input" name="a" required>`),
      { data: "{ saved: false }", formAttr: 'l-validate="saved = true"' }
    );
    const input = form.querySelector("input") as HTMLInputElement;

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

// ───────────────────────────────────────────────────────────────────────────
// 1.1B-03 — the programmatic registry and async validators
// ───────────────────────────────────────────────────────────────────────────

const validate = () => (Faqir as any).validate as any;

describe("faqir-validate · Faqir.validate is a plugin-installed member", () => {
  it("is installed by the plugin, not by the engine", () => {
    expect(typeof validate()).toBe("object");
    expect(typeof validate().register).toBe("function");
    expect(typeof validate().unregister).toBe("function");
    expect(typeof validate().run).toBe("function");
  });

  it("resolves a form by selector as well as by element", async () => {
    const { form } = await boot(group(`<input data-part="input" id="by-sel" name="a" value="x">`));
    form.id = "the-form";
    let seen = 0;
    validate().register("#the-form", "a", "counts", () => {
      seen++;
      return true;
    });
    await validate().run("#the-form");
    expect(seen).toBe(1);
    validate().unregister(form, "a");
  });

  it("throws rather than silently doing nothing on a bad target or a non-function", async () => {
    const { form } = await boot(group(`<input data-part="input" name="a">`));
    expect(() => validate().register("#nope", "a", "x", () => true)).toThrow(TypeError);
    expect(() => validate().register(form, "a", "x", "not a function" as any)).toThrow(TypeError);
  });
});

describe("faqir-validate · registered validators", () => {
  it("fails the field with the registered message and makes run() resolve false", async () => {
    const { form } = await boot(group(`<input data-part="input" name="a" value="bob">`));
    const input = form.querySelector("input") as HTMLInputElement;
    validate().register(form, "a", "known", (v: string) => v === "alice", "Unknown user.");

    expect(await validate().run(form)).toBe(false);
    expect(fieldGroupOf(input).getAttribute("data-state")).toBe("invalid");
    expect(errorOf(input).textContent).toBe("Unknown user.");
    expect(input.getAttribute("aria-invalid")).toBe("true");

    input.value = "alice";
    expect(await validate().run(form)).toBe(true);
    expect(fieldGroupOf(input).getAttribute("data-state")).toBe(null);
    expect(errorOf(input).textContent).toBe("");
  });

  it("hands the validator the value and { el, form, data }", async () => {
    const { form, scope } = await boot(
      group(`<input data-part="input" name="a" value="v1">`),
      { data: "{ tenant: 'acme' }" }
    );
    const input = form.querySelector("input") as HTMLInputElement;
    let seen: any = null;
    validate().register(form, "a", "ctx", (value: string, ctx: any) => {
      seen = { value, ...ctx };
      return true;
    });
    await validate().run(form);
    expect(seen.value).toBe("v1");
    expect(seen.el).toBe(input);
    expect(seen.form).toBe(form);
    expect(seen.data).toBe(scope);
    expect(seen.data.tenant).toBe("acme");
  });

  it("unregister removes one by name, and the disposer register() returns removes it too", async () => {
    const { form } = await boot(group(`<input data-part="input" name="a" value="x">`));
    validate().register(form, "a", "no", () => false, "nope");
    expect(await validate().run(form)).toBe(false);

    validate().unregister(form, "a", "no");
    expect(await validate().run(form)).toBe(true);

    const dispose = validate().register(form, "a", "no", () => false, "nope");
    expect(await validate().run(form)).toBe(false);
    dispose();
    expect(await validate().run(form)).toBe(true);
  });

  it("unregister with no name drops every validator on the field", async () => {
    const { form } = await boot(group(`<input data-part="input" name="a" value="x">`));
    validate().register(form, "a", "one", () => true);
    validate().register(form, "a", "two", () => false, "no");
    expect(await validate().run(form)).toBe(false);
    validate().unregister(form, "a");
    expect(await validate().run(form)).toBe(true);
  });

  it("runs after native constraints and after the attribute validators", async () => {
    const { form } = await boot(
      group(
        `<input data-part="input" name="a" required
                l-validate:shape="ok"
                data-error-required="Required." data-error-shape="Bad shape.">`
      ),
      { data: "{ ok: false }" }
    );
    const input = form.querySelector("input") as HTMLInputElement;
    const order: string[] = [];
    validate().register(form, "a", "reg", () => {
      order.push("registered");
      return false;
    }, "Registered says no.");

    // Empty: the native constraint decides, nothing else is consulted.
    expect(await validate().run(form)).toBe(false);
    expect(errorOf(input).textContent).toBe("Required.");
    expect(order).toEqual([]);

    // Filled but the attribute validator fails: still ahead of the registered one.
    input.value = "x";
    expect(await validate().run(form)).toBe(false);
    expect(errorOf(input).textContent).toBe("Bad shape.");
    expect(order).toEqual([]);

    // Attribute validator passes: now the registered one is reached.
    (form.closest("[l-data]") as any).__faqirScope.ok = true;
    expect(await validate().run(form)).toBe(false);
    expect(errorOf(input).textContent).toBe("Registered says no.");
    expect(order).toEqual(["registered"]);
  });

  it("runs registered validators in registration order, first failure winning", async () => {
    const { form } = await boot(group(`<input data-part="input" name="a" value="x">`));
    const input = form.querySelector("input") as HTMLInputElement;
    const seen: string[] = [];
    validate().register(form, "a", "first", () => {
      seen.push("first");
      return false;
    }, "First.");
    validate().register(form, "a", "second", () => {
      seen.push("second");
      return false;
    }, "Second.");

    expect(await validate().run(form)).toBe(false);
    expect(errorOf(input).textContent).toBe("First.");
    expect(seen).toEqual(["first"]);

    // Re-registering a name replaces it IN PLACE — order is where a name was
    // first seen, not where it was last set.
    validate().register(form, "a", "first", () => {
      seen.push("first");
      return true;
    });
    seen.length = 0;
    expect(await validate().run(form)).toBe(false);
    expect(errorOf(input).textContent).toBe("Second.");
    expect(seen).toEqual(["first", "second"]);
  });

  it("takes the message from the return value, then the registered one, then data-error-<name>", async () => {
    const { form } = await boot(
      group(`<input data-part="input" name="a" value="x" data-error-rule="From the attribute." data-error="Generic.">`)
    );
    const input = form.querySelector("input") as HTMLInputElement;

    validate().register(form, "a", "rule", () => "From the return value.", "From the argument.");
    await validate().run(form);
    expect(errorOf(input).textContent).toBe("From the return value.");

    validate().register(form, "a", "rule", () => false, "From the argument.");
    await validate().run(form);
    expect(errorOf(input).textContent).toBe("From the argument.");

    validate().register(form, "a", "rule", () => false);
    await validate().run(form);
    expect(errorOf(input).textContent).toBe("From the attribute.");

    validate().unregister(form, "a");
    validate().register(form, "b", "unused", () => false);
    validate().register(form, "a", "other", () => false);
    await validate().run(form);
    expect(errorOf(input).textContent).toBe("Generic.");
    validate().unregister(form, "a");
    validate().unregister(form, "b");
  });

  it("a validator that throws is a failure with the built-in message, never a pass", async () => {
    const { form } = await boot(group(`<input data-part="input" name="a" value="x">`));
    const input = form.querySelector("input") as HTMLInputElement;
    validate().register(form, "a", "boom", () => {
      throw new Error("network down");
    }, "Author message.");

    expect(await validate().run(form)).toBe(false);
    expect(errorOf(input).textContent).toBe("Could not check this field. Please try again.");
  });

  it("run() turns live revalidation on, so its errors can be typed away", async () => {
    const { form } = await boot(group(`<input data-part="input" name="a" required>`));
    const input = form.querySelector("input") as HTMLInputElement;

    expect(await validate().run(form)).toBe(false);
    expect(fieldGroupOf(input).getAttribute("data-state")).toBe("invalid");

    input.value = "typed";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await tick();
    expect(fieldGroupOf(input).getAttribute("data-state")).toBe(null);
  });

  it("keeps registries per form", async () => {
    const { form } = await boot(group(`<input data-part="input" name="a" value="x">`));
    const other = document.createElement("form");
    other.innerHTML = `<input name="a" value="x">`;
    container!.appendChild(other);

    validate().register(form, "a", "no", () => false, "no");
    expect(await validate().run(form)).toBe(false);
    expect(await validate().run(other)).toBe(true);
    validate().unregister(form, "a");
  });
});

describe("faqir-validate · async validators", () => {
  it("l-validate:<name>.async: validating while out, invalid with its message when it fails", async () => {
    const gate = deferred<boolean>();
    const { form } = await boot(
      group(
        `<input data-part="input" name="u" value="taken"
                l-validate:free.async="isFree(value)"
                data-error-free="That name is taken.">`
      ),
      { data: "{ isFree: () => null }" }
    );
    const input = form.querySelector("input") as HTMLInputElement;
    (form.closest("[l-data]") as any).__faqirScope.isFree = () => gate.promise;

    const verdict = validate().run(form);
    await tick();
    expect(fieldGroupOf(input).getAttribute("data-state")).toBe("validating");
    expect(errorOf(input).textContent).toBe("");

    gate.resolve(false);
    expect(await verdict).toBe(false);
    expect(fieldGroupOf(input).getAttribute("data-state")).toBe("invalid");
    expect(errorOf(input).textContent).toBe("That name is taken.");
    expect(input.getAttribute("aria-invalid")).toBe("true");
  });

  it("clears the validating state when the check passes", async () => {
    const gate = deferred<boolean>();
    const { form } = await boot(
      group(`<input data-part="input" name="u" value="free" l-validate:free.async="check(value)">`),
      { data: "{ check: () => null }" }
    );
    const input = form.querySelector("input") as HTMLInputElement;
    (form.closest("[l-data]") as any).__faqirScope.check = () => gate.promise;

    const verdict = validate().run(form);
    await tick();
    expect(fieldGroupOf(input).getAttribute("data-state")).toBe("validating");
    gate.resolve(true);
    expect(await verdict).toBe(true);
    expect(fieldGroupOf(input).getAttribute("data-state")).toBe(null);
    expect(input.getAttribute("aria-invalid")).toBe(null);
  });

  it("a rejected check is a failure with a built-in message — never a silent pass", async () => {
    const gate = deferred<boolean>();
    const { form } = await boot(group(`<input data-part="input" name="a" value="x">`));
    const input = form.querySelector("input") as HTMLInputElement;
    validate().register(form, "a", "remote", () => gate.promise, "Author message.");

    const verdict = validate().run(form);
    await tick();
    expect(fieldGroupOf(input).getAttribute("data-state")).toBe("validating");

    gate.reject(new Error("500"));
    expect(await verdict).toBe(false);
    expect(fieldGroupOf(input).getAttribute("data-state")).toBe("invalid");
    expect(errorOf(input).textContent).toBe("Could not check this field. Please try again.");
    validate().unregister(form, "a");
  });

  it("awaits a promise from a validator that forgot .async, rather than passing on truthiness", async () => {
    const { form } = await boot(
      group(
        `<input data-part="input" name="u" value="x" l-validate:free="check(value)"
                data-error-free="Taken.">`
      ),
      { data: "{ check: () => Promise.resolve(false) }" }
    );
    const input = form.querySelector("input") as HTMLInputElement;
    expect(await validate().run(form)).toBe(false);
    expect(errorOf(input).textContent).toBe("Taken.");
  });

  it("debounces live runs 250 ms and lets the newest win", async () => {
    const calls: string[] = [];
    const gates: Record<string, ReturnType<typeof deferred<boolean>>> = {};
    const { form } = await boot(
      group(`<input data-part="input" name="u" value="a" l-validate:free.async="check(value)" data-error-free="Taken.">`),
      { data: "{ check: () => null }" }
    );
    const input = form.querySelector("input") as HTMLInputElement;
    (form.closest("[l-data]") as any).__faqirScope.check = (v: string) => {
      calls.push(v);
      gates[v] = deferred<boolean>();
      return gates[v].promise;
    };

    // First attempt arms live revalidation; its own check resolves clean.
    submit(form);
    await tick();
    gates["a"].resolve(true);
    await tick();
    expect(calls).toEqual(["a"]);

    // Three keystrokes inside one debounce window → exactly one more run.
    input.value = "ab";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await wait(60);
    input.value = "abc";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await wait(60);
    input.value = "abcd";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(fieldGroupOf(input).getAttribute("data-state")).toBe("validating");
    expect(calls).toEqual(["a"]);

    await wait(320);
    expect(calls).toEqual(["a", "abcd"]);
    gates["abcd"].resolve(false);
    await tick();
    expect(errorOf(input).textContent).toBe("Taken.");
  });

  it("ignores a superseded run: the last verdict owns the field", async () => {
    const gates: Record<string, ReturnType<typeof deferred<boolean>>> = {};
    const { form } = await boot(group(`<input data-part="input" name="a" value="one">`));
    const input = form.querySelector("input") as HTMLInputElement;
    validate().register(form, "a", "slow", (v: string) => {
      gates[v] = deferred<boolean>();
      return gates[v].promise;
    }, "Rejected.");

    const first = validate().run(form);
    await tick();
    input.value = "two";
    const second = validate().run(form);
    await tick();

    // The stale run answers LAST and says "invalid" — and is ignored.
    gates["two"].resolve(true);
    expect(await second).toBe(true);
    gates["one"].resolve(false);
    expect(await first).toBe(false); // it still reports its own verdict…
    await tick();
    expect(fieldGroupOf(input).getAttribute("data-state")).toBe(null); // …but not on screen
    expect(errorOf(input).textContent).toBe("");
    validate().unregister(form, "a");
  });

  it("blocks the submit until every check has settled, then runs the on-valid hook", async () => {
    const gate = deferred<boolean>();
    const { form, scope } = await boot(
      group(`<input data-part="input" name="a" value="x">`),
      { data: "{ saved: false }", formAttr: 'l-validate="saved = true"' }
    );
    validate().register(form, "a", "remote", () => gate.promise);

    const ev = submit(form);
    expect(ev.defaultPrevented).toBe(true);
    await tick();
    expect(scope.saved).toBe(false); // still out — the hook has not run

    gate.resolve(true);
    await settle(() => scope.saved === true, "the on-valid hook after the awaited check");
    validate().unregister(form, "a");
  });

  it("does not submit, and focuses the offender, when a waited-for check fails", async () => {
    const gate = deferred<boolean>();
    const { form, scope } = await boot(
      group(`<input data-part="input" id="waited" name="a" value="x">`),
      { data: "{ saved: false }", formAttr: 'l-validate="saved = true"' }
    );
    validate().register(form, "a", "remote", () => gate.promise, "Rejected by the server.");

    submit(form);
    await tick();
    gate.resolve(false);
    await settle(
      () => document.activeElement === document.getElementById("waited"),
      "focus moving to the offender once the awaited check answered",
    );

    expect(scope.saved).toBe(false);
    expect(errorOf(form.querySelector("input")!).textContent).toBe("Rejected by the server.");
    validate().unregister(form, "a");
  });

  it("a submit flushes a pending debounce instead of waiting it out", async () => {
    const calls: string[] = [];
    const { form } = await boot(
      group(`<input data-part="input" name="u" value="a" l-validate:free.async="check(value)">`),
      { data: "{ check: () => null }" }
    );
    const input = form.querySelector("input") as HTMLInputElement;
    (form.closest("[l-data]") as any).__faqirScope.check = (v: string) => {
      calls.push(v);
      return Promise.resolve(true);
    };

    submit(form); // arms live revalidation, one run
    await tick();
    input.value = "ab";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(calls).toEqual(["a"]); // debounced, not yet run

    submit(form);
    await tick();
    expect(calls).toEqual(["a", "ab"]); // flushed by the submit, not 250 ms later
  });
});

// ── The 1.1 release review ───────────────────────────────────────────────────

describe("faqir-validate · what an answer means", () => {
  it("an attribute expression keeps 1.0's truthiness: a non-empty string passes", async () => {
    const { form } = await boot(
      group(`<input data-part="input" name="a" value="  hi  " l-validate:nonblank="value.trim()" data-error-nonblank="Say something.">`)
    );
    const input = form.querySelector("input") as HTMLInputElement;
    expect(await validate().run(form)).toBe(true);
    expect(errorOf(input).textContent).toBe("");

    input.value = "   ";
    expect(await validate().run(form)).toBe(false);
    expect(errorOf(input).textContent).toBe("Say something.");
  });

  it("a registered validator's string is its message, and an empty one falls back", async () => {
    const { form } = await boot(group(`<input data-part="input" name="a" value="x">`));
    const input = form.querySelector("input") as HTMLInputElement;
    const off = validate().register(form, "a", "said", () => "Not like that.");
    expect(await validate().run(form)).toBe(false);
    expect(errorOf(input).textContent).toBe("Not like that.");
    off();

    validate().register(form, "a", "blank", () => "", "The registered message.");
    expect(await validate().run(form)).toBe(false);
    expect(errorOf(input).textContent).toBe("The registered message.");
    validate().unregister(form, "a");
  });
});

describe("faqir-validate · run() on a form with no l-validate", () => {
  it("skips the attribute validators, as documented, instead of failing on a missing scope", async () => {
    const { form } = await boot(
      group(`<input data-part="input" name="a" value="x" l-validate:ok="isOk(value)">`),
      { formAttr: "" }
    );
    const input = form.querySelector("input") as HTMLInputElement;
    expect(await validate().run(form)).toBe(true);
    expect(fieldGroupOf(input).getAttribute("data-state")).toBe(null);
    expect(input.getAttribute("aria-invalid")).toBe(null);
  });

  it("still runs native constraints and registered validators there", async () => {
    const { form } = await boot(
      group(`<input data-part="input" name="a" value="x">`) + group(`<input data-part="input" name="b" required>`),
      { formAttr: "" }
    );
    validate().register(form, "a", "never", () => false, "Registered says no.");
    expect(await validate().run(form)).toBe(false);
    expect(errorOf(form.querySelector('[name="a"]')!).textContent).toBe("Registered says no.");
    expect(fieldGroupOf(form.querySelector('[name="b"]')!).getAttribute("data-state")).toBe("invalid");
    validate().unregister(form, "a");
  });
});

describe("faqir-validate · an async submit the page cancelled", () => {
  function counting(form: HTMLFormElement): () => number {
    let calls = 0;
    (form as any).submit = () => {
      calls++;
    };
    return () => calls;
  }

  it("does not navigate when a handler after it called preventDefault (@submit.prevent)", async () => {
    const gate = deferred<boolean>();
    const { form } = await boot(group(`<input data-part="input" name="a" value="x">`));
    const submits = counting(form);
    form.addEventListener("submit", (e) => e.preventDefault()); // registered after l-validate's
    validate().register(form, "a", "remote", () => gate.promise);

    submit(form);
    gate.resolve(true);
    await tick();
    await tick();
    expect(submits()).toBe(0);
    validate().unregister(form, "a");
  });

  it("does not navigate when a handler before it had already cancelled", async () => {
    const gate = deferred<boolean>();
    const { form } = await boot(group(`<input data-part="input" name="a" value="x">`));
    const submits = counting(form);
    form.addEventListener("submit", (e) => e.preventDefault(), true); // capture: runs first
    validate().register(form, "a", "remote", () => gate.promise);

    submit(form);
    gate.resolve(true);
    await tick();
    await tick();
    expect(submits()).toBe(0);
    validate().unregister(form, "a");
  });

  it("still completes a plain native submit that nobody cancelled", async () => {
    const gate = deferred<boolean>();
    const { form } = await boot(group(`<input data-part="input" name="a" value="x">`));
    const submits = counting(form);
    validate().register(form, "a", "remote", () => gate.promise);

    const ev = submit(form);
    expect(ev.defaultPrevented).toBe(true); // held while the check is out
    gate.resolve(true);
    await settle(() => submits() === 1, "the native submit once the check passed");
    validate().unregister(form, "a");
  });
});

describe("faqir-validate · the production engine reports nothing", () => {
  it("devtools.report() is a no-op that records nothing outside the dev build", () => {
    expect(Faqir.devtools.dev).toBe(false);
    expect(Faqir.devtools.report("anything at all", document.body)).toBe(false);
    expect(Faqir.devtools.warnings()).toEqual([]);
  });
});
