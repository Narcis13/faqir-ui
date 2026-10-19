// forecraft #25: a toggle-group whose controls are driven by a reactive
// `:checked` binding (not `l-model`) kept every item at `data-state="off"`.
//
// `:checked` is a boolean-attribute binding. The engine writes the `checked`
// ATTRIBUTE first, and on a control the user has not touched yet that write
// flips the `checked` PROPERTY too — so the property write that follows finds
// nothing to change and announces nothing (`faqir:model` fires only when the
// property write itself changes the value). The controller only re-synced on
// `change` and `faqir:model`, so it never heard about it. It now also observes
// the `checked` attribute of its own controls.
//
// Mounted into a disposable container — never `Faqir.start()` /
// `initTree(document.body)`, which would leak into every later file.

import { describe, it, expect, afterEach } from "bun:test";
import { createToggleGroup } from "../../registry/recipes/toggle-group/toggle-group.js";

const Faqir = require("../../registry/core/faqir-core.js");
const tick = () => new Promise((r) => setTimeout(r, 0));

let box: HTMLElement | null = null;
let api: { destroy(): void } | null = null;

afterEach(() => {
  api?.destroy();
  api = null;
  if (!box) return;
  Faqir.destroy(box);
  box.remove();
  box = null;
});

async function mount(markup: string) {
  box = document.createElement("div");
  box.innerHTML = markup;
  document.body.appendChild(box);
  const root = box.querySelector("[data-ui='toggle-group']") as HTMLElement;
  // The controller first, then the bindings: the order a page that
  // initialises controllers before its scopes runs in, and the one where the
  // binding's write arrives after the controller's initial sync.
  api = createToggleGroup(root);
  Faqir.initTree(box.firstElementChild as Element);
  await tick();
  const scope = (box.firstElementChild as any).__faqirScope;
  const states = () =>
    [...root.querySelectorAll("[data-part='item']")].map((el) => (el as HTMLElement).dataset.state);
  return { root, scope, states };
}

const radios = `
  <div l-data='{ "mode": "wizard" }'>
    <div data-ui="toggle-group" data-mode="single" role="radiogroup" aria-label="Mode">
      <label data-part="item"><input data-part="control" type="radio" name="m" value="single" :checked="mode === 'single'"><span data-part="label">Single</span></label>
      <label data-part="item"><input data-part="control" type="radio" name="m" value="wizard" :checked="mode === 'wizard'"><span data-part="label">Wizard</span></label>
    </div>
  </div>`;

describe("toggle-group follows a reactive :checked binding (forecraft #25)", () => {
  it("reflects the bound initial value in data-state", async () => {
    const { root, states } = await mount(radios);
    const controls = [...root.querySelectorAll("input")] as HTMLInputElement[];
    expect(controls.map((c) => c.checked)).toEqual([false, true]);
    expect(states()).toEqual(["off", "on"]);
  });

  it("re-syncs data-state when the bound value changes", async () => {
    const { scope, states } = await mount(radios);
    scope.mode = "single";
    await tick();
    expect(states()).toEqual(["on", "off"]);
    scope.mode = "wizard";
    await tick();
    expect(states()).toEqual(["off", "on"]);
  });

  it("moves the roving tab stop with the bound value", async () => {
    const { root, scope } = await mount(radios);
    const controls = [...root.querySelectorAll("input")] as HTMLInputElement[];
    expect(controls.map((c) => c.tabIndex)).toEqual([-1, 0]);
    scope.mode = "single";
    await tick();
    expect(controls.map((c) => c.tabIndex)).toEqual([0, -1]);
  });

  it("follows a bound checkbox in multi mode", async () => {
    const { scope, states } = await mount(`
      <div l-data='{ "bold": true, "italic": false }'>
        <div data-ui="toggle-group" data-mode="multi" role="group" aria-label="Format">
          <label data-part="item"><input data-part="control" type="checkbox" value="b" :checked="bold"><span data-part="label">B</span></label>
          <label data-part="item"><input data-part="control" type="checkbox" value="i" :checked="italic"><span data-part="label">I</span></label>
        </div>
      </div>`);
    expect(states()).toEqual(["on", "off"]);
    scope.italic = true;
    await tick();
    expect(states()).toEqual(["on", "on"]);
    scope.bold = false;
    await tick();
    expect(states()).toEqual(["off", "on"]);
  });

  it("emits no faqir:change for a binding-driven write (the user did not act)", async () => {
    const { root, scope } = await mount(radios);
    let changes = 0;
    root.addEventListener("faqir:change", () => changes++);
    scope.mode = "single";
    await tick();
    expect(changes).toBe(0);
  });

  it("stops observing after destroy()", async () => {
    const { root, states } = await mount(radios);
    api!.destroy();
    api = null;
    const controls = [...root.querySelectorAll("input")] as HTMLInputElement[];
    controls[0].setAttribute("checked", "");
    await tick();
    expect(states()).toEqual(["off", "on"]);
  });
});
