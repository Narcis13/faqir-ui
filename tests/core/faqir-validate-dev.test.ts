/**
 * faqir-validate under the DEVELOPMENT engine.  [1.1B-03 · §8.3]
 *
 * A plugin is a separate file with no reach into the engine's `devHooks`, so
 * before this task it could only be silent or noisy in a shipped page. It now
 * reports through `Faqir.devtools.report()` — recorded and printed in the dev
 * build, an empty function in production (asserted on the other side, in
 * tests/core/faqir-validate.test.ts).
 *
 * This file loads ONLY `registry/core/faqir-core.dev.js`, so `scripts/test.mjs`
 * puts it in the isolated dev partition: two live engines in one happy-dom realm
 * double-initialize every scope.
 */
import { describe, it, expect, beforeEach, afterEach } from "bun:test";

const Faqir = require("../../registry/core/faqir-core.dev.js");
// Browser load order: the plugin attaches to whatever global `Faqir` it finds.
(globalThis as any).Faqir = Faqir;
require("../../registry/core/plugins/faqir-validate.js");
const DEVTOOLS = Faqir.devtools;

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

let container: HTMLElement | null = null;
let originalWarn: typeof console.warn;
// The log lives as long as the page and its dedupe memory is deliberately not
// resettable, so each test reads the tail recorded since it began.
let baseline = 0;

function mount(html: string): HTMLElement {
  container = document.createElement("div");
  container.innerHTML = html;
  document.body.appendChild(container);
  Faqir.initTree(container.firstElementChild as Element);
  return container;
}

function unmount(): void {
  if (!container) return;
  Faqir.destroy(container);
  container.remove();
  container = null;
}

/** Diagnostics recorded since this test began, optionally filtered by kind. */
function fresh(kind?: string): any[] {
  const all = DEVTOOLS.warnings().slice(baseline);
  return kind ? all.filter((w: any) => w.kind === kind) : all;
}

beforeEach(async () => {
  unmount();
  await tick();
  originalWarn = console.warn;
  console.warn = () => {};
  baseline = DEVTOOLS.warnings().length;
});

afterEach(() => {
  console.warn = originalWarn;
  unmount();
});

describe("the plugin reporting seam", () => {
  it("records a plugin report as its own warning class, and dedupes it", () => {
    expect(DEVTOOLS.dev).toBe(true);
    expect(DEVTOOLS.report("a plugin said so", document.body)).toBe(true);
    expect(DEVTOOLS.report("a plugin said so", document.body)).toBe(false); // once
    const reports = fresh("plugin");
    expect(reports.length).toBe(1);
    expect(reports[0].message).toBe("a plugin said so");
    expect(reports[0].html).toContain("<body");
  });
});

describe("mis-registration is reported, never silent", () => {
  it("names a register() whose field matches no control, once", () => {
    const host = mount(`
      <div l-data="{}">
        <form id="f" l-validate>
          <div data-ui="field-group"><input data-part="input" name="email"></div>
        </form>
      </div>`);
    const form = host.querySelector("form") as HTMLFormElement;

    (Faqir as any).validate.register(form, "emial", "spelled", () => true);
    (Faqir as any).validate.register(form, "emial", "spelled", () => true);

    const reports = fresh("plugin");
    expect(reports.length).toBe(1);
    expect(reports[0].message).toContain('register("emial", "spelled")');
    expect(reports[0].message).toContain("matches no control");
    (Faqir as any).validate.unregister(form, "emial");
  });

  it("says nothing when the field does exist", () => {
    const host = mount(`
      <div l-data="{}">
        <form l-validate>
          <div data-ui="field-group"><input data-part="input" name="email"></div>
        </form>
      </div>`);
    const form = host.querySelector("form") as HTMLFormElement;
    (Faqir as any).validate.register(form, "email", "spelled", () => true);
    expect(fresh("plugin")).toEqual([]);
    (Faqir as any).validate.unregister(form, "email");
  });

  it("names a run() on a form that carries no l-validate", async () => {
    const host = mount(`
      <div l-data="{}">
        <form>
          <div data-ui="field-group"><input data-part="input" name="a" required></div>
        </form>
      </div>`);
    const form = host.querySelector("form") as HTMLFormElement;

    expect(await (Faqir as any).validate.run(form)).toBe(false); // still validates natively
    const reports = fresh("plugin");
    expect(reports.length).toBe(1);
    expect(reports[0].message).toContain("no l-validate");
  });

  it("names a validator that returns a promise without .async", async () => {
    const host = mount(`
      <div l-data="{ check: () => Promise.resolve(true) }">
        <form l-validate>
          <div data-ui="field-group">
            <input data-part="input" name="a" value="x" l-validate:free="check(value)">
          </div>
        </form>
      </div>`);
    const form = host.querySelector("form") as HTMLFormElement;

    await (Faqir as any).validate.run(form);
    const reports = fresh("plugin");
    expect(reports.length).toBe(1);
    expect(reports[0].message).toContain("l-validate:<name>.async");
  });
});

describe("correct markup is not reported as broken", () => {
  it("does not call l-validate:<name> an unknown directive", async () => {
    mount(`
      <div l-data="{ ok: true }">
        <form l-validate>
          <div data-ui="field-group">
            <input data-part="input" name="a" value="x"
                   l-validate:shape="ok" l-validate:free.async="ok">
          </div>
        </form>
      </div>`);
    await tick();
    expect(fresh("directive")).toEqual([]);
  });

  it("still reports a directive nobody registered", async () => {
    mount(`<div l-data="{}"><p l-txet="1"></p></div>`);
    await tick();
    const reports = fresh("directive");
    expect(reports.length).toBe(1);
    expect(reports[0].message).toContain("l-txet");
  });
});
