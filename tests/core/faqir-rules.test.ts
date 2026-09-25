import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { settle, tick } from "../helpers/settle";
import { coerce, validate } from "../../packages/rules/src/index.js";
import { expectedVerdict, loadCorpus, type GoldenCase } from "../../packages/rules/tests/corpus";

// faqir-rules — the l-rules plugin, built from @faqir-ui/rules. [1.1B-04 · §8.3]
//
// The artifact under test is the GENERATED drop, not the source: the bytes a
// page loads are the bytes that have to behave, and `check:rules-plugin` is
// what keeps them in step with `packages/rules/src/plugin.js`.
const Faqir = require("../../registry/core/faqir-core.js");

// Browser load order, and the order this plugin documents: core, faqir-validate,
// then faqir-rules. The spy goes on before the require so self-registration can
// be asserted; the plugin file's top-level code runs exactly once per process.
(globalThis as any).Faqir = Faqir;
require("../../registry/core/plugins/faqir-validate.js");
let pluginCalls = 0;
const origPlugin = Faqir.plugin;
Faqir.plugin = function (fn: any) {
  pluginCalls++;
  return origPlugin.call(Faqir, fn);
};
require("../../registry/core/plugins/faqir-rules.js");
Faqir.plugin = origPlugin;

type Definition = Record<string, unknown>;

/** Collect what `console.warn` says while `fn` runs — the production report channel. */
async function capturingWarnings(fn: () => unknown | Promise<unknown>): Promise<string[]> {
  const said: string[] = [];
  const original = console.warn;
  console.warn = (...args: unknown[]) => {
    said.push(args.map(String).join(" "));
  };
  try {
    await fn();
  } finally {
    console.warn = original;
  }
  return said;
}

// Every test mounts into its own container and tears it down again: this suite
// shares one happy-dom realm with every other engine file, so `Faqir.start()`
// on the shared document would leave a MutationObserver on `body` per boot.
// `initTree` binds exactly the subtree we built. (AGENTS.md, "Setup".)
let container: HTMLElement | null = null;
let ids = 0;

function unmount(): void {
  if (!container) return;
  Faqir.destroy(container);
  container.remove();
  container = null;
}

/**
 * A definition, as the `<script type="application/json">` a page embeds.
 *
 * `<` is escaped to `\u003c` — still valid JSON, and the standard precaution
 * for JSON inside a script element, where `</script` ends the raw-text run. It
 * is not paranoia here: the corpus is full of `{"<=": …}` operators, and
 * happy-dom's parser drops everything after the first `<` in the element.
 */
function jsonScript(id: string, definition: Definition): string {
  return `<script type="application/json" id="${id}">${
    JSON.stringify(definition).replace(/</g, "\\u003c")
  }</script>`;
}

/** A field-group wrapping one control, exactly the markup @faqir-ui/forms emits. */
function group(inner: string): string {
  return `<div data-ui="field-group">
    <label data-part="label">Field</label>
    ${inner}
    <p data-part="error"></p>
  </div>`;
}

interface BootOptions {
  /** The form's body — field-groups, usually built with `group()`. */
  body: string;
  /** The definition. An object is written into a JSON script the form points at. */
  rules?: Definition;
  /** Override the `l-rules` value (for the scope-key form, or a broken one). */
  rulesAttr?: string;
  /** The `l-data` expression for the enclosing scope. */
  data?: string;
  /** Override the form's own attributes (defaults to `l-validate`). */
  formAttr?: string;
}

async function boot(opts: BootOptions) {
  unmount();
  const id = `rules-${++ids}`;
  const script = opts.rules ? jsonScript(id, opts.rules) : "";
  const attr = opts.rulesAttr === undefined ? `#${id}` : opts.rulesAttr;
  const formAttr = opts.formAttr === undefined ? "l-validate" : opts.formAttr;
  container = document.createElement("div");
  container.innerHTML = `
    <div l-data="${(opts.data ?? "{}").replace(/"/g, "&quot;")}">
      ${script}
      <form ${formAttr} l-rules="${attr.replace(/"/g, "&quot;")}">
        ${opts.body}
        <button type="submit">Save</button>
      </form>
    </div>`;
  document.body.appendChild(container);
  Faqir.initTree(container.firstElementChild as Element);
  await tick();
  const form = container.querySelector("form") as HTMLFormElement;
  const scope = (container.querySelector("[l-data]") as any).__faqirScope;
  return { form, scope };
}

function control(form: HTMLFormElement, name: string): HTMLInputElement {
  return form.querySelector(`[name="${name}"]`) as HTMLInputElement;
}
function groupOf(el: Element): HTMLElement {
  return el.closest('[data-ui="field-group"]') as HTMLElement;
}
function errorOf(el: Element): string {
  return (groupOf(el).querySelector('[data-part="error"]') as HTMLElement).textContent ?? "";
}

/** Type into a control the way a person does: set the value, fire `input`. */
async function type(el: HTMLInputElement, value: string): Promise<void> {
  el.value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  await tick();
}

beforeEach(async () => {
  unmount();
  await tick();
});

afterEach(() => {
  unmount();
});

describe("faqir-rules · registration", () => {
  it("self-registers via Faqir.plugin", () => {
    expect(pluginCalls).toBe(1);
  });

  it("installs the l-rules directive and the $rules magic", async () => {
    const { scope } = await boot({
      body: group(`<input data-part="input" name="plan" value="solo">`),
      rules: { version: "1", fields: { plan: { type: "string" } } },
    });
    // A form with no verbs still answers — `$rules` is never undefined.
    expect(scope.$rules).toEqual({ visible: {}, required: {}, computed: {}, next: {} });
  });

  it("answers $rules in a scope that has no rules form at all", async () => {
    unmount();
    container = document.createElement("div");
    container.innerHTML = `<div l-data="{}"><span l-text="JSON.stringify($rules.next)"></span></div>`;
    document.body.appendChild(container);
    Faqir.initTree(container.firstElementChild as Element);
    await tick();
    expect((container.querySelector("span") as HTMLElement).textContent).toBe("{}");
  });
});

describe("faqir-rules · show", () => {
  const definition = {
    version: "1",
    fields: {
      plan: { type: "string" },
      seats: { type: "integer", minimum: 1, required: true },
    },
    rules: [{ id: "seats-for-teams", show: "seats", when: { "==": [{ var: "plan" }, "team"] } }],
  };

  const body =
    group(`<input data-part="input" name="plan" value="solo">`) +
    group(`<input data-part="input" name="seats" type="number">`);

  it("hides a field's group and disables its control, so it neither validates nor submits", async () => {
    const { form } = await boot({ body, rules: definition });
    const seats = control(form, "seats");
    expect(groupOf(seats).hasAttribute("hidden")).toBe(true);
    expect(seats.disabled).toBe(true);
    // Disabled means absent from the form's own FormData — the same data a
    // server would receive, which is why the two verdicts can agree at all.
    expect([...new FormData(form).keys()]).toEqual(["plan"]);
  });

  it("brings it back when the condition turns, and only what it took", async () => {
    const { form } = await boot({ body, rules: definition });
    const seats = control(form, "seats");
    await type(control(form, "plan"), "team");
    expect(groupOf(seats).hasAttribute("hidden")).toBe(false);
    expect(seats.disabled).toBe(false);
  });

  it("never clears a `hidden` the page wrote itself", async () => {
    // Boot with the field already shown, so the plugin never hid it and never
    // took ownership of the attribute…
    const { form } = await boot({
      body:
        group(`<input data-part="input" name="plan" value="team">`) +
        group(`<input data-part="input" name="seats" type="number">`),
      rules: definition,
    });
    const seats = control(form, "seats");
    expect(groupOf(seats).hasAttribute("hidden")).toBe(false);

    // …then the page hides it for its own reasons. The rule still says "shown",
    // and the next repaint must leave the page's attribute alone.
    groupOf(seats).setAttribute("hidden", "");
    await type(control(form, "plan"), "team");
    expect(groupOf(seats).hasAttribute("hidden")).toBe(true);
    expect(seats.disabled).toBe(false);
  });

  it("suppresses a hidden field's findings on submit — a field nobody sees cannot be wrong", async () => {
    const { form } = await boot({ body, rules: definition });
    const seats = control(form, "seats");
    seats.required = true; // the field's own constraint, which hiding must defeat
    const event = new Event("submit", { bubbles: true, cancelable: true });
    form.dispatchEvent(event);
    await tick();
    expect(groupOf(seats).getAttribute("data-state")).toBe(null);
    expect(errorOf(seats)).toBe("");
  });

  it("hides everything nested under an object field, which has no control of its own", async () => {
    const { form } = await boot({
      body:
        group(`<input data-part="input" name="ship" value="false">`) +
        group(`<input data-part="input" name="address.city" value="Cluj">`),
      rules: {
        version: "1",
        fields: {
          ship: { type: "boolean" },
          address: { type: "object", properties: { city: { type: "string", required: true } } },
        },
        rules: [{ id: "address-when-shipping", show: "address", when: { var: "ship" } }],
      },
    });
    const city = control(form, "address.city");
    expect(groupOf(city).hasAttribute("hidden")).toBe(true);
    expect(city.disabled).toBe(true);
  });
});

describe("faqir-rules · require", () => {
  const definition = {
    version: "1",
    fields: { kind: { type: "string" }, vat: { type: "string", minLength: 4 } },
    rules: [{ id: "vat-for-companies", require: "vat", when: { "==": [{ var: "kind" }, "company"] } }],
  };
  const body =
    group(`<input data-part="input" name="kind" value="person">`) +
    group(`<input data-part="input" name="vat">`);

  it("toggles required and aria-required with the condition", async () => {
    const { form } = await boot({ body, rules: definition });
    const vat = control(form, "vat");
    expect(vat.required).toBe(false);
    expect(vat.getAttribute("aria-required")).toBe(null);

    await type(control(form, "kind"), "company");
    expect(vat.required).toBe(true);
    expect(vat.getAttribute("aria-required")).toBe("true");

    await type(control(form, "kind"), "person");
    expect(vat.required).toBe(false);
    expect(vat.getAttribute("aria-required")).toBe(null);
  });

  it("never lifts a requiredness the markup declared", async () => {
    const { form } = await boot({
      body:
        group(`<input data-part="input" name="kind" value="person">`) +
        group(`<input data-part="input" name="vat" required>`),
      rules: definition,
    });
    const vat = control(form, "vat");
    // The rule says "not required today"; the markup says "always". A rule adds
    // a demand, it does not remove one.
    expect(vat.required).toBe(true);
    expect(vat.getAttribute("aria-required")).toBe("true");
  });

  it("a hidden field is never required, whatever the require rule says", async () => {
    const { form } = await boot({
      body:
        group(`<input data-part="input" name="kind" value="company">`) +
        group(`<input data-part="input" name="vat">`),
      rules: {
        version: "1",
        fields: { kind: { type: "string" }, vat: { type: "string" } },
        rules: [
          { id: "vat-for-companies", require: "vat", when: { "==": [{ var: "kind" }, "company"] } },
          { id: "vat-never", show: "vat", when: false },
        ],
      },
    });
    expect(control(form, "vat").required).toBe(false);
  });
});

describe("faqir-rules · compute", () => {
  const definition = {
    version: "1",
    fields: {
      qty: { type: "integer" },
      price: { type: "number" },
      total: { type: "number" },
    },
    rules: [{ id: "total", compute: "total", value: { "*": [{ var: "qty" }, { var: "price" }] } }],
  };
  const body =
    group(`<input data-part="input" name="qty" value="3">`) +
    group(`<input data-part="input" name="price" value="4">`) +
    group(`<input data-part="input" name="total" readonly>`);

  it("writes the value into the control, so the form submits it", async () => {
    const { form } = await boot({ body, rules: definition });
    expect(control(form, "total").value).toBe("12");
    await type(control(form, "qty"), "5");
    expect(control(form, "total").value).toBe("20");
  });

  it("writes the value into the scope, so an expression renders it", async () => {
    unmount();
    container = document.createElement("div");
    container.innerHTML = `
      <div l-data="{ total: 0 }">
        ${jsonScript("compute-scope", definition)}
        <form l-validate l-rules="#compute-scope">${body}</form>
        <output l-text="total"></output>
      </div>`;
    document.body.appendChild(container);
    Faqir.initTree(container.firstElementChild as Element);
    await tick();
    expect((container.querySelector("output") as HTMLElement).textContent).toBe("12");

    const form = container.querySelector("form") as HTMLFormElement;
    await type(control(form, "price"), "10");
    expect((container.querySelector("output") as HTMLElement).textContent).toBe("30");
  });

  it("also lands in $rules.computed", async () => {
    const { scope } = await boot({ body, rules: definition });
    expect(scope.$rules.computed).toEqual({ total: 12 });
  });

  it("does not invent scope structure a page never declared", async () => {
    const { scope } = await boot({
      body:
        group(`<input data-part="input" name="qty" value="2">`) +
        group(`<input data-part="input" name="cart.total" readonly>`),
      data: "{}",
      rules: {
        version: "1",
        fields: { qty: { type: "integer" }, cart: { type: "object", properties: { total: { type: "number" } } } },
        rules: [{ id: "cart-total", compute: "cart.total", value: { "*": [{ var: "qty" }, 10] } }],
      },
    });
    // No `cart` in the scope, so nothing is written there — but the control,
    // which is what submits, is filled in all the same.
    expect(scope.cart).toBeUndefined();
    expect((container!.querySelector('[name="cart.total"]') as HTMLInputElement).value).toBe("20");
  });
});

describe("faqir-rules · jump", () => {
  it("exposes the wizard's next page as $rules.next", async () => {
    const definition = {
      version: "1",
      fields: { kind: { type: "string" } },
      rules: [
        { id: "to-company", jump: "billing", from: "who", when: { "==": [{ var: "kind" }, "company"] } },
        { id: "to-person", jump: "done", from: "who" },
      ],
    };
    const { form, scope } = await boot({
      body: group(`<input data-part="input" name="kind" value="person">`),
      rules: definition,
    });
    expect(scope.$rules.next).toEqual({ who: "done" });

    await type(control(form, "kind"), "company");
    expect(scope.$rules.next).toEqual({ who: "billing" });
  });

  it("re-renders an expression reading $rules.next, because the state is reactive", async () => {
    unmount();
    const definition = {
      version: "1",
      fields: { kind: { type: "string" } },
      rules: [
        { id: "to-company", jump: "billing", from: "who", when: { "==": [{ var: "kind" }, "company"] } },
        { id: "to-person", jump: "done", from: "who" },
      ],
    };
    container = document.createElement("div");
    container.innerHTML = `
      <div l-data="{}">
        ${jsonScript("jump-live", definition)}
        <form l-validate l-rules="#jump-live">
          ${group(`<input data-part="input" name="kind" value="person">`)}
        </form>
        <span l-text="$rules.next.who"></span>
      </div>`;
    document.body.appendChild(container);
    Faqir.initTree(container.firstElementChild as Element);
    await tick();
    const label = container.querySelector("span") as HTMLElement;
    expect(label.textContent).toBe("done");

    const form = container.querySelector("form") as HTMLFormElement;
    await type(control(form, "kind"), "company");
    expect(label.textContent).toBe("billing");
  });
});

describe("faqir-rules · cross-field validate", () => {
  const definition = {
    version: "1",
    fields: {
      start: { type: "string", format: "date" },
      end: { type: "string", format: "date" },
    },
    rules: [
      {
        id: "end-after-start",
        validate: { date: [{ var: "start" }, "<", { var: "end" }] },
        path: "end",
        message: "The end date must come after the start date.",
      },
    ],
  };
  const body =
    group(`<input data-part="input" name="start" value="2026-03-01">`) +
    group(`<input data-part="input" name="end" value="2026-02-01">`);

  it("fails the field through faqir-validate, with the rule's own message", async () => {
    const { form } = await boot({ body, rules: definition });
    const end = control(form, "end");
    expect(await Faqir.validate.run(form)).toBe(false);
    expect(groupOf(end).getAttribute("data-state")).toBe("invalid");
    expect(errorOf(end)).toBe("The end date must come after the start date.");
    expect(end.getAttribute("aria-invalid")).toBe("true");
  });

  it("clears as the page is fixed, because it is an ordinary registered validator", async () => {
    const { form } = await boot({ body, rules: definition });
    const end = control(form, "end");
    expect(await Faqir.validate.run(form)).toBe(false);
    await type(end, "2026-04-01");
    expect(groupOf(end).getAttribute("data-state")).toBe(null);
    expect(errorOf(end)).toBe("");
    expect(await Faqir.validate.run(form)).toBe(true);
  });

  it("says nothing while its own field is blank — `required` is what should speak", async () => {
    const { form } = await boot({
      body:
        group(`<input data-part="input" name="start" value="2026-03-01">`) +
        group(`<input data-part="input" name="end">`),
      rules: definition,
    });
    expect(await Faqir.validate.run(form)).toBe(true);
    expect(errorOf(control(form, "end"))).toBe("");
  });
});

describe("faqir-rules · remote validate", () => {
  const definition = {
    version: "1",
    fields: { email: { type: "string" } },
    rules: [
      {
        id: "email-free",
        validate: "remote",
        path: "email",
        remote: "/api/email-free",
        message: "That address is already registered.",
      },
    ],
  };
  const body = group(`<input data-part="input" name="email" value="ada@example.com">`);

  let calls: { url: string; body: any }[] = [];
  const realFetch = globalThis.fetch;

  function stubFetch(answer: () => { status?: number; body?: unknown }): void {
    (globalThis as any).fetch = async (url: string, init: any) => {
      calls.push({ url, body: JSON.parse(init.body) });
      const { status = 200, body: payload } = answer();
      return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => payload,
      };
    };
  }

  beforeEach(() => {
    calls = [];
  });

  afterEach(() => {
    (globalThis as any).fetch = realFetch;
  });

  it("POSTs { path, value, data } and passes on { ok: true }", async () => {
    stubFetch(() => ({ body: { ok: true } }));
    const { form } = await boot({ body, rules: definition });
    expect(await Faqir.validate.run(form)).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("/api/email-free");
    expect(calls[0].body).toEqual({
      path: "email",
      value: "ada@example.com",
      data: { email: "ada@example.com" },
    });
  });

  it("fails with the resolver's sentence when it sends one", async () => {
    stubFetch(() => ({ body: { ok: false, message: "Taken since 1843." } }));
    const { form } = await boot({ body, rules: definition });
    expect(await Faqir.validate.run(form)).toBe(false);
    expect(errorOf(control(form, "email"))).toBe("Taken since 1843.");
  });

  it("falls back to the rule's message when the resolver sends none", async () => {
    stubFetch(() => ({ body: { ok: false } }));
    const { form } = await boot({ body, rules: definition });
    expect(await Faqir.validate.run(form)).toBe(false);
    expect(errorOf(control(form, "email"))).toBe("That address is already registered.");
  });

  it("a check that could not run is a failure, not a pass", async () => {
    stubFetch(() => ({ status: 503, body: null }));
    const { form } = await boot({ body, rules: definition });
    expect(await Faqir.validate.run(form)).toBe(false);
    // faqir-validate's own sentence for a check that never answered: the
    // resolver's message would be a lie about a verdict nobody reached.
    expect(errorOf(control(form, "email"))).toBe("Could not check this field. Please try again.");
  });

  it("shows the validating state while the check is out", async () => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    (globalThis as any).fetch = async () => {
      await held;
      return { ok: true, status: 200, json: async () => ({ ok: true }) };
    };
    const { form } = await boot({ body, rules: definition });
    const email = control(form, "email");
    const running = Faqir.validate.run(form);
    await tick();
    expect(groupOf(email).getAttribute("data-state")).toBe("validating");
    release();
    expect(await running).toBe(true);
    expect(groupOf(email).getAttribute("data-state")).toBe(null);
  });
});

describe("faqir-rules · coercion", () => {
  it("reads a checkbox group as a list, one ticked box included", async () => {
    const { form, scope } = await boot({
      body:
        group(
          `<input data-part="input" type="checkbox" name="topics" value="css" checked>` +
            `<input data-part="input" type="checkbox" name="topics" value="html" checked>`,
        ) +
        group(`<input data-part="input" name="summary">`),
      rules: {
        version: "1",
        fields: {
          topics: { type: "array", items: { type: "string" } },
          summary: { type: "string" },
        },
        // Indexing is the discriminating probe: `topics.0` is "css" only if the
        // value is a LIST. A bare string answers null to a path with an index.
        rules: [
          { id: "summary-for-css", show: "summary", when: { "==": [{ var: "topics.0" }, "css"] } },
        ],
      },
    });
    // Two boxes ticked arrive as two entries under one name.
    expect(scope.$rules.visible).toEqual({ summary: true });

    const html = form.querySelector('[value="html"]') as HTMLInputElement;
    html.checked = false;
    html.dispatchEvent(new Event("change", { bubbles: true }));
    await tick();
    // One box left: a lone ticked checkbox is a SCALAR in FormData, and the
    // coercion is the only reason `topics.0` still answers "css".
    expect(groupOf(control(form, "summary")).hasAttribute("hidden")).toBe(false);

    const css = form.querySelector('[value="css"]') as HTMLInputElement;
    css.checked = false;
    css.dispatchEvent(new Event("change", { bubbles: true }));
    await tick();
    expect(groupOf(control(form, "summary")).hasAttribute("hidden")).toBe(true);
  });

  it("reads a numeric control as a number, not as the string it submits", async () => {
    const { form, scope } = await boot({
      body:
        group(`<input data-part="input" name="age" type="number" value="9">`) +
        group(`<input data-part="input" name="licence">`),
      rules: {
        version: "1",
        fields: { age: { type: "integer" }, licence: { type: "string" } },
        rules: [{ id: "licence-for-adults", show: "licence", when: { ">=": [{ var: "age" }, 18] } }],
      },
    });
    expect(scope.$rules.visible).toEqual({ licence: false });
    // "9" > 18 is false as a number and true as a string comparison; the
    // coercion is the difference between the two.
    await type(control(form, "age"), "21");
    expect(scope.$rules.visible).toEqual({ licence: true });
  });
});

describe("faqir-rules · where the definition comes from", () => {
  const definition = {
    version: "1",
    fields: { plan: { type: "string" }, seats: { type: "integer" } },
    rules: [{ id: "seats-for-teams", show: "seats", when: { "==": [{ var: "plan" }, "team"] } }],
  };
  const body =
    group(`<input data-part="input" name="plan" value="team">`) +
    group(`<input data-part="input" name="seats" type="number">`);

  it("reads a selector to a JSON script", async () => {
    const { form } = await boot({ body, rules: definition });
    expect(groupOf(control(form, "seats")).hasAttribute("hidden")).toBe(false);
  });

  it("reads a scope key holding the object", async () => {
    const { form } = await boot({
      body,
      rulesAttr: "rulesDef",
      data: `{ rulesDef: ${JSON.stringify(definition)} }`,
    });
    expect(groupOf(control(form, "seats")).hasAttribute("hidden")).toBe(false);
  });

  it("reads a scope key holding the JSON as a string", async () => {
    const { form } = await boot({
      body,
      rulesAttr: "rulesDef",
      data: `{ rulesDef: ${JSON.stringify(JSON.stringify(definition))} }`,
    });
    expect(groupOf(control(form, "seats")).hasAttribute("hidden")).toBe(false);
  });
});

describe("faqir-rules · nothing fails quietly", () => {
  const body = group(`<input data-part="input" name="plan" value="solo">`);

  it("reports an l-rules that matches no element", async () => {
    const said = await capturingWarnings(() =>
      boot({ body, rulesAttr: "#no-such-rules-anywhere" }),
    );
    expect(said.join("\n")).toContain("#no-such-rules-anywhere");
    expect(said.join("\n")).toContain("matches no element");
  });

  it("reports an l-rules whose scope key resolves to nothing", async () => {
    const said = await capturingWarnings(() => boot({ body, rulesAttr: "missingKey" }));
    expect(said.join("\n")).toContain("resolved to nothing");
  });

  it("reports a definition the package refuses", async () => {
    const said = await capturingWarnings(() =>
      boot({
        body,
        rules: {
          version: "1",
          fields: { plan: { type: "string" } },
          rules: [{ id: "nope", show: "plan", when: { "no-such-op": [1, 2] } }],
        },
      }),
    );
    expect(said.join("\n")).toContain("no-such-op");
  });

  it("reports a rule naming a field no control is named for", async () => {
    const said = await capturingWarnings(() =>
      boot({
        body,
        rules: {
          version: "1",
          fields: { plan: { type: "string" }, ghost: { type: "string" } },
          rules: [{ id: "ghost-rule", show: "ghost", when: { var: "plan" } }],
        },
      }),
    );
    expect(said.join("\n")).toContain("ghost-rule");
    expect(said.join("\n")).toContain("ghost");
  });

  it("reports a form-level check as one, not as a mistake", async () => {
    const said = await capturingWarnings(() =>
      boot({
        body,
        rules: {
          version: "1",
          fields: { plan: { type: "string" } },
          // A rule whose path is not a declared field is legitimate — the
          // package runs it — but a page has no field-group to paint it on.
          rules: [{ id: "form-check", validate: { var: "plan" }, path: "form" }],
        },
      }),
    );
    expect(said.join("\n")).toContain("form-level check");
    expect(said.join("\n")).not.toContain("will never change anything");
  });

  it("says nothing about a compute with no control — the scope is a destination", async () => {
    const said = await capturingWarnings(() =>
      boot({
        body,
        rules: {
          version: "1",
          fields: { plan: { type: "string" }, tier: { type: "string" } },
          rules: [{ id: "tier", compute: "tier", value: { var: "plan" } }],
        },
      }),
    );
    expect(said).toEqual([]);
  });

  it("reports validate rules on a form with no l-validate", async () => {
    const said = await capturingWarnings(() =>
      boot({
        body,
        formAttr: "",
        rules: {
          version: "1",
          fields: { plan: { type: "string" } },
          rules: [{ id: "plan-set", validate: { var: "plan" }, path: "plan" }],
        },
      }),
    );
    expect(said.join("\n")).toContain("no l-validate");
  });

  it("reports the load order when faqir-validate is not there at all", async () => {
    const installed = Faqir.validate;
    delete (Faqir as any).validate;
    try {
      const said = await capturingWarnings(() =>
        boot({
          body,
          rules: {
            version: "1",
            fields: { plan: { type: "string" } },
            rules: [{ id: "plan-set", validate: { var: "plan" }, path: "plan" }],
          },
        }),
      );
      expect(said.join("\n")).toContain("faqir-validate is not loaded");
    } finally {
      (Faqir as any).validate = installed;
    }
  });
});

// ── Browser verdicts equal server verdicts, on the golden corpus ─────────────
//
// The claim 1.1B-04 exists to make literal. Every case in
// `packages/rules/tests/golden/` that a plain form can express is rendered,
// read back through the real `FormData` the plugin reads, and compared against
// the verdict `validate()` gives the server for the same data. Two halves:
//
//   1. the DATA round-trip — what the DOM carries coerces back to exactly the
//      case's data, so the two sides are judging the same thing at all;
//   2. the VERDICT — `visible`, `required`, `computed` and `next` as applied to
//      the DOM, and each rule finding as the sentence faqir-validate shows.
//
// Nothing here is a second corpus: a case added to `golden/` is a case this
// runs, which is the arrangement `corpus.ts` was written for.

const SCALARS = new Set(["string", "number", "integer", "boolean"]);

/** Cases a plain form can express without changing what the data means. */
function renderable(testCase: GoldenCase): boolean {
  if (testCase.raw !== undefined) return false;
  const fields = (testCase.definition.fields ?? {}) as Record<string, { type?: string }>;
  const names = Object.keys(fields);
  if (names.length === 0) return false;
  if (!names.every((name) => SCALARS.has(fields[name].type ?? ""))) return false;
  const data = testCase.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) return false;
  return Object.entries(data as Record<string, unknown>).every(([key, value]) => {
    if (!(key in fields)) return false;
    // A blank string and a missing key are the same value to `coerce`, and
    // `null` is not a thing a control can hold: neither survives the trip, so
    // neither belongs in a parity claim about the trip.
    if (value === null || value === "") return false;
    return ["string", "number", "boolean"].includes(typeof value);
  });
}

/** One control per declared field, holding the case's value for it. */
function renderCase(testCase: GoldenCase): string {
  const fields = (testCase.definition.fields ?? {}) as Record<string, { type?: string }>;
  const data = (testCase.data ?? {}) as Record<string, unknown>;
  return Object.keys(fields)
    .map((name) => {
      const has = Object.prototype.hasOwnProperty.call(data, name);
      if (fields[name].type === "boolean") {
        // A select, not a checkbox: an unticked box submits nothing, and
        // "absent" is a different value from `false`.
        const chosen = has ? String(data[name]) : "";
        return group(
          `<select data-part="input" name="${name}">` +
            ["", "true", "false"]
              .map((v) => `<option value="${v}"${v === chosen ? " selected" : ""}>${v || "—"}</option>`)
              .join("") +
            `</select>`,
        );
      }
      const value = has ? String(data[name]) : "";
      return group(
        `<input data-part="input" type="text" name="${name}" value="${value.replace(/"/g, "&quot;")}">`,
      );
    })
    .join("");
}

/** The flat record `new FormData(form)` carries — the plugin's own input. */
function readRaw(form: HTMLFormElement): Record<string, unknown> {
  const raw: Record<string, unknown> = {};
  new FormData(form).forEach((value, key) => {
    if (!Object.prototype.hasOwnProperty.call(raw, key)) raw[key] = value;
    else if (Array.isArray(raw[key])) (raw[key] as unknown[]).push(value);
    else raw[key] = [raw[key], value];
  });
  return raw;
}

describe("faqir-rules · the browser's verdict is the server's verdict", () => {
  const corpus = loadCorpus().filter(
    (testCase) => renderable(testCase) && ((testCase.definition.rules ?? []) as unknown[]).length > 0,
  );

  it("covers a real slice of the corpus, so a green run means something", () => {
    expect(corpus.length).toBeGreaterThanOrEqual(30);
  });

  for (const testCase of corpus) {
    it(`${testCase.file} · ${testCase.name}`, async () => {
      const definition = testCase.definition as unknown as Definition;
      const expected = expectedVerdict(testCase);

      // The form, unbound: what it carries has to be the case's data before the
      // plugin writes a single computed value into it.
      unmount();
      container = document.createElement("div");
      container.innerHTML = `<div l-data="{}"><form>${renderCase(testCase)}</form></div>`;
      document.body.appendChild(container);
      const bare = container.querySelector("form") as HTMLFormElement;
      expect(coerce(definition, readRaw(bare)), "the DOM round-trip is lossy").toEqual(
        testCase.data as Record<string, unknown>,
      );

      // The plugin takes its locale from the page, which is where a real one
      // comes from — so a case that asks for `fr` gets a French document.
      const lang = document.documentElement.lang;
      if (testCase.locale) document.documentElement.lang = testCase.locale;
      let booted!: { form: HTMLFormElement; scope: any };
      // A corpus case is correct by construction, so the only diagnostic the
      // plugin may produce while binding one is the form-level-check note.
      const said = await capturingWarnings(async () => {
        booted = await boot({ body: renderCase(testCase), rules: definition });
      });
      document.documentElement.lang = lang;
      for (const line of said) expect(line, "unexpected report").toContain("form-level check");
      const { form, scope } = booted;

      // The four maps, as applied to the DOM rather than as returned.
      for (const [path, visible] of Object.entries(expected.visible)) {
        const el = control(form, path);
        if (!el) continue; // an object field: the nested controls carry it
        expect(groupOf(el).hasAttribute("hidden"), `visible.${path}`).toBe(!visible);
        expect(el.disabled, `visible.${path} disabled`).toBe(!visible);
      }
      for (const [path, required] of Object.entries(expected.required)) {
        expect(control(form, path).required, `required.${path}`).toBe(required);
      }
      for (const [path, value] of Object.entries(expected.computed)) {
        const el = control(form, path);
        if (!el) continue;
        const text = value === undefined || value === null ? "" : String(value);
        expect(el.value, `computed.${path}`).toBe(text);
      }
      expect(scope.$rules.next, "next").toEqual(expected.next);

      // …and each rule finding, as the sentence the field-group shows. A remote
      // rule is left to its own describe: it needs the network, which is the one
      // thing a verdict comparison must not depend on.
      if (expected.pending.length > 0) return;
      const ruleIds = new Set(
        ((definition.rules ?? []) as { id: string }[]).map((rule) => rule.id),
      );
      const byPath = new Map<string, string[]>();
      for (const finding of expected.findings) {
        if (!ruleIds.has(finding.rule)) continue;
        byPath.set(finding.path, [...(byPath.get(finding.path) ?? []), finding.message]);
      }
      await Faqir.validate.run(form);
      for (const [path, messages] of byPath) {
        const el = control(form, path);
        if (!el) continue; // a form-level check has no control to paint
        // A field the rules made required and left blank fails natively first,
        // and first failure wins — that message is faqir-validate's, not a
        // disagreement about the rule.
        if (el.required && el.value === "") continue;
        expect(messages, `findings.${path}`).toContain(errorOf(el));
      }
    });
  }
});

// ── The 1.1 release review ───────────────────────────────────────────────────
//
// Each block below was a reproduced bug before the package first shipped: a
// control someone else disabled read as blank, a hidden control revived by a
// wizard, a rule path spelled `contacts[0]` matching nothing, a reset the plugin
// never saw, listeners that outlived their form, a remote answer read two ways,
// and a pattern the markup could not carry enforced by nobody.

/**
 * happy-dom holds each MutationObserver's delivery callback in a `WeakRef`
 * (`MutationObserverListener.js`), so a garbage collection between a mutation
 * and its delivery drops the record — nondeterministically, a few rounds in
 * twenty. A browser holds it strongly. The blocks whose subject IS that
 * delivery — another party's writes to `disabled` — hold it strongly too, for
 * their own duration only.
 */
function withReliableMutationObservers(): void {
  let saved: typeof WeakRef;
  beforeAll(() => {
    saved = globalThis.WeakRef;
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
    (globalThis as any).WeakRef = saved;
  });
}

describe("faqir-rules · someone else's disabled", () => {
  withReliableMutationObservers();
  const definition = {
    version: "1",
    fields: { plan: { type: "string" }, seats: { type: "integer", required: true } },
    rules: [{ id: "seats-for-teams", show: "seats", when: { "==": [{ var: "plan" }, "team"] } }],
  };

  it("still reads a control another party disabled — its answer did not stop existing", async () => {
    const { form, scope } = await boot({
      body:
        group(`<input data-part="input" name="plan" value="team" disabled>`) +
        group(`<input data-part="input" name="seats" type="number">`),
      rules: definition,
    });
    const seats = control(form, "seats");
    expect(scope.$rules.visible).toEqual({ seats: true });
    expect(groupOf(seats).hasAttribute("hidden")).toBe(false);
    expect(seats.disabled).toBe(false);
  });

  it("holds a hidden control disabled when someone else enables it", async () => {
    const { form } = await boot({
      body:
        group(`<input data-part="input" name="plan" value="solo">`) +
        group(`<input data-part="input" name="seats" type="number">`),
      rules: definition,
    });
    const seats = control(form, "seats");
    expect(seats.disabled).toBe(true);

    seats.required = true; // so a check that reached it would fail
    seats.disabled = false; // a wizard reaching this step, say
    await tick();
    expect(seats.disabled).toBe(true);
    expect(groupOf(seats).hasAttribute("hidden")).toBe(true);

    // Nothing blocks a submit on the field nobody can see — even when the
    // other party re-enables it in the same task as the submit.
    seats.disabled = false;
    const submit = new Event("submit", { bubbles: true, cancelable: true });
    form.dispatchEvent(submit);
    await tick();
    expect(seats.disabled).toBe(true);
    expect(groupOf(seats).getAttribute("data-state")).toBe(null);
    expect(errorOf(seats)).toBe("");
    seats.required = false;

    // Shown again, it takes the other party's last wish: enabled.
    await type(control(form, "plan"), "team");
    expect(seats.disabled).toBe(false);
  });

  it("gives a revealed control back to the party that disabled it meanwhile, in either order", async () => {
    const { form } = await boot({
      body:
        group(`<input data-part="input" name="plan" value="solo">`) +
        group(`<input data-part="input" name="seats" type="number">`),
      rules: definition,
    });
    const seats = control(form, "seats");
    // The plugin disabled it first; now another party disables it too — the
    // wizard's binding for a step that is not current.
    seats.setAttribute("disabled", "");
    await tick();
    await type(control(form, "plan"), "team");
    expect(groupOf(seats).hasAttribute("hidden")).toBe(false);
    expect(seats.disabled).toBe(true);

    // That party lets go; the rule has nothing more to say about it.
    seats.removeAttribute("disabled");
    await tick();
    expect(seats.disabled).toBe(false);
  });
});

describe("faqir-rules · indexed paths", () => {
  it("matches `contacts[0]` in a rule to a control named `contacts[0].name`", async () => {
    const { form, scope } = await boot({
      body:
        group(`<input data-part="input" name="solo" value="yes">`) +
        group(`<input data-part="input" name="contacts[0].name" value="Ada">`),
      rules: {
        version: "1",
        fields: {
          solo: { type: "string" },
          contacts: { type: "array", items: { type: "object", properties: { name: { type: "string" } } } },
        },
        rules: [{ id: "first-contact", show: "contacts[0]", when: { "!=": [{ var: "solo" }, "yes"] } }],
      },
    });
    const name = control(form, "contacts[0].name");
    expect(scope.$rules.visible).toEqual({ "contacts.0": false });
    expect(groupOf(name).hasAttribute("hidden")).toBe(true);
    expect(name.disabled).toBe(true);

    await type(control(form, "solo"), "no");
    expect(groupOf(name).hasAttribute("hidden")).toBe(false);
    expect(name.disabled).toBe(false);
  });

  it("registers a validate rule on `contacts.0.name` under the control's own name", async () => {
    const { form } = await boot({
      body: group(`<input data-part="input" name="contacts[0].name" value="x">`),
      rules: {
        version: "1",
        fields: {
          contacts: { type: "array", items: { type: "object", properties: { name: { type: "string" } } } },
        },
        rules: [{
          id: "long-name",
          validate: { ">=": [{ var: "contacts.0.name.length" }, 2] },
          path: "contacts.0.name",
          message: "Too short.",
        }],
      },
    });
    expect(await Faqir.validate.run(form)).toBe(false);
    expect(errorOf(control(form, "contacts[0].name"))).toBe("Too short.");
  });

  it("lets a hidden parent win over a shown child, whichever rule comes first", async () => {
    const { form } = await boot({
      body:
        group(`<input data-part="input" name="ship" value="">`) +
        group(`<input data-part="input" name="address.city" value="Cluj">`),
      rules: {
        version: "1",
        fields: {
          ship: { type: "string" },
          address: { type: "object", properties: { city: { type: "string" } } },
        },
        rules: [
          { id: "city", show: "address.city", when: true },
          { id: "address", show: "address", when: { var: "ship" } },
        ],
      },
    });
    const city = control(form, "address.city");
    expect(groupOf(city).hasAttribute("hidden")).toBe(true);
    expect(city.disabled).toBe(true);
  });
});

describe("faqir-rules · reset and teardown", () => {
  const definition = {
    version: "1",
    fields: { plan: { type: "string" }, seats: { type: "integer" } },
    rules: [
      { id: "seats-for-teams", show: "seats", when: { "==": [{ var: "plan" }, "team"] } },
      { id: "seats-set", validate: { ">": [{ var: "seats" }, 1] }, path: "seats", message: "Two or more." },
    ],
  };
  const body =
    group(`<input data-part="input" name="plan" value="solo">`) +
    group(`<input data-part="input" name="seats" value="1">`);

  it("repaints after a reset has put the values back", async () => {
    const { form } = await boot({ body, rules: definition });
    const seats = control(form, "seats");
    await type(control(form, "plan"), "team");
    expect(seats.disabled).toBe(false);

    form.reset();
    await settle(() => seats.disabled, "the repaint a reset defers by one task");
    expect(control(form, "plan").value).toBe("solo");
    expect(seats.disabled).toBe(true);
    expect(groupOf(seats).hasAttribute("hidden")).toBe(true);
  });

  it("removes its listeners and its validators when the form's scope is destroyed", async () => {
    const { form } = await boot({
      body:
        group(`<input data-part="input" name="plan" value="team">`) +
        group(`<input data-part="input" name="seats" value="1">`),
      rules: definition,
    });
    const seats = control(form, "seats");
    expect(await Faqir.validate.run(form)).toBe(false);
    expect(errorOf(seats)).toBe("Two or more.");

    Faqir.destroy(container);
    // The rule would hide seats now — nothing is listening any more.
    const plan = control(form, "plan");
    plan.value = "solo";
    plan.dispatchEvent(new Event("input", { bubbles: true }));
    await tick();
    expect(groupOf(seats).hasAttribute("hidden")).toBe(false);
    // …and the rule's validator is gone from faqir-validate's registry.
    expect(await Faqir.validate.run(form)).toBe(true);
  });
});

describe("faqir-rules · a remote answer means what it means on the server", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    (globalThis as any).fetch = realFetch;
  });
  const answer = (payload: unknown) => {
    (globalThis as any).fetch = async () => ({ ok: true, status: 200, json: async () => payload });
  };
  const definition = {
    version: "1",
    fields: { email: { type: "string" } },
    messages: { en: { "email.email-free": "Someone has that one." } },
    rules: [{ id: "email-free", validate: "remote", path: "email", remote: "/api/free", message: "Taken." }],
  };
  const body = group(`<input data-part="input" name="email" value="ada@example.com">`);

  it("an empty message is no message: the definition's own sentence, resolved like the server does", async () => {
    answer({ ok: false, message: "" });
    const { form } = await boot({ body, rules: definition });
    expect(await Faqir.validate.run(form)).toBe(false);
    expect(errorOf(control(form, "email"))).toBe("Someone has that one.");
  });

  it("a message that is not a string is not a message either", async () => {
    answer({ ok: false, message: 42 });
    const { form } = await boot({ body, rules: definition });
    expect(await Faqir.validate.run(form)).toBe(false);
    expect(errorOf(control(form, "email"))).toBe("Someone has that one.");
  });

  it("a body with no boolean ok is a check that could not run", async () => {
    answer({ ok: "yes" });
    const { form } = await boot({ body, rules: definition });
    expect(await Faqir.validate.run(form)).toBe(false);
    expect(errorOf(control(form, "email"))).toBe("Could not check this field. Please try again.");
  });
});

describe("faqir-rules · a pattern the markup does not carry", () => {
  const definition = {
    version: "1",
    fields: { code: { type: "string", pattern: "^[A-Z]{2}$" } },
  };

  it("is enforced through faqir-validate with the package's sentence", async () => {
    const { form } = await boot({ body: group(`<input data-part="input" name="code" value="abc">`), rules: definition });
    expect(await Faqir.validate.run(form)).toBe(false);
    expect(errorOf(control(form, "code"))).toBe("Please match the requested format.");
    await type(control(form, "code"), "AB");
    expect(await Faqir.validate.run(form)).toBe(true);
  });

  it("is left to the browser when the control carries the attribute", async () => {
    const { form } = await boot({
      body: group(`<input data-part="input" name="code" value="AB" pattern="[A-Z]+">`),
      rules: definition,
    });
    // The attribute says something looser than the definition; the plugin
    // does not second-guess markup that states its own constraint.
    expect(await Faqir.validate.run(form)).toBe(true);
  });
});
