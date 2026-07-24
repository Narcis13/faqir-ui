// ═══════════════════════════════════════════════════════════════════════════
// toggle-group — controller contract  [task 0.7-06]
// ═══════════════════════════════════════════════════════════════════════════
//
// The controls are REAL <input type="radio"|"checkbox"> elements, so the value
// semantics and l-model binding come from the platform + the engine's native
// paths. The controller adds roving tabindex, single-mode exclusivity (for
// uncontrolled use), the [data-state] hook, and a faqir:change notification.

import { describe, it, expect, afterEach } from "bun:test";
import { createToggleGroup } from "../../registry/recipes/toggle-group/toggle-group.js";

const Faqir = require("../../registry/core/faqir-core.js");
const tick = () => new Promise((r) => setTimeout(r, 0));

const mounted: Array<{ destroy: () => void }> = [];

function single(): {
  root: HTMLElement;
  api: ReturnType<typeof createToggleGroup>;
  controls: () => HTMLInputElement[];
} {
  document.body.innerHTML = `
    <div data-ui="toggle-group" data-mode="single" role="radiogroup" aria-label="Align">
      <label data-part="item"><input data-part="control" type="radio" name="a" value="left" checked><span data-part="label">Left</span></label>
      <label data-part="item"><input data-part="control" type="radio" name="a" value="center"><span data-part="label">Center</span></label>
      <label data-part="item"><input data-part="control" type="radio" name="a" value="right"><span data-part="label">Right</span></label>
    </div>`;
  const root = document.querySelector("[data-ui='toggle-group']") as HTMLElement;
  const api = createToggleGroup(root);
  mounted.push(api);
  const controls = () => [...root.querySelectorAll("[data-part='control']")] as HTMLInputElement[];
  return { root, api, controls };
}

function multi() {
  document.body.innerHTML = `
    <div data-ui="toggle-group" data-mode="multi" role="group" aria-label="Format">
      <label data-part="item"><input data-part="control" type="checkbox" value="bold" checked><span data-part="label">Bold</span></label>
      <label data-part="item"><input data-part="control" type="checkbox" value="italic"><span data-part="label">Italic</span></label>
      <label data-part="item"><input data-part="control" type="checkbox" value="underline"><span data-part="label">Underline</span></label>
    </div>`;
  const root = document.querySelector("[data-ui='toggle-group']") as HTMLElement;
  const api = createToggleGroup(root);
  mounted.push(api);
  const controls = () => [...root.querySelectorAll("[data-part='control']")] as HTMLInputElement[];
  return { root, api, controls };
}

const key = (el: Element, k: string) =>
  el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true }));

describe("toggle-group controller", () => {
  afterEach(() => {
    while (mounted.length) mounted.pop()!.destroy();
    document.body.innerHTML = "";
  });

  // ── roving tabindex ─────────────────────────────────────────────────────────
  it("exposes a single tab-stop (the checked control), the rest tabindex -1", () => {
    const { controls } = single();
    expect(controls().map((c) => c.tabIndex)).toEqual([0, -1, -1]);
  });

  it("the roving tab-stop follows the checked control", () => {
    const { api, controls } = single();
    api.setValue("right");
    expect(controls().map((c) => c.tabIndex)).toEqual([-1, -1, 0]);
  });

  it("ArrowRight/ArrowDown move focus to the next control and wrap", () => {
    const { controls } = single();
    controls()[0].focus();
    key(controls()[0], "ArrowRight");
    expect(document.activeElement).toBe(controls()[1]);
    key(controls()[1], "ArrowDown");
    expect(document.activeElement).toBe(controls()[2]);
    key(controls()[2], "ArrowRight"); // wrap
    expect(document.activeElement).toBe(controls()[0]);
  });

  it("ArrowLeft/ArrowUp move focus to the previous control and wrap", () => {
    const { controls } = single();
    controls()[0].focus();
    key(controls()[0], "ArrowLeft"); // wrap to last
    expect(document.activeElement).toBe(controls()[2]);
    key(controls()[2], "ArrowUp");
    expect(document.activeElement).toBe(controls()[1]);
  });

  it("Home / End jump to the first / last control", () => {
    const { controls } = single();
    controls()[1].focus();
    key(controls()[1], "End");
    expect(document.activeElement).toBe(controls()[2]);
    key(controls()[2], "Home");
    expect(document.activeElement).toBe(controls()[0]);
  });

  it("disabled controls are skipped by arrow navigation", () => {
    document.body.innerHTML = `
      <div data-ui="toggle-group" data-mode="single" role="radiogroup" aria-label="D">
        <label data-part="item"><input data-part="control" type="radio" name="d" value="a" checked><span data-part="label">A</span></label>
        <label data-part="item"><input data-part="control" type="radio" name="d" value="b" disabled><span data-part="label">B</span></label>
        <label data-part="item"><input data-part="control" type="radio" name="d" value="c"><span data-part="label">C</span></label>
      </div>`;
    const root = document.querySelector("[data-ui='toggle-group']") as HTMLElement;
    const api = createToggleGroup(root);
    mounted.push(api);
    const controls = () => [...root.querySelectorAll("[data-part='control']")] as HTMLInputElement[];
    controls()[0].focus();
    key(controls()[0], "ArrowRight"); // skips disabled b → c
    expect(document.activeElement).toBe(controls()[2]);
    expect(api.getValue()).toBe("c");
  });

  // ── single mode: exclusivity + string value ─────────────────────────────────
  it("single mode enforces exclusivity (only one control checked)", () => {
    const { api, controls } = single();
    api.toggle("center");
    expect(controls().map((c) => c.checked)).toEqual([false, true, false]);
    api.toggle("right");
    expect(controls().map((c) => c.checked)).toEqual([false, false, true]);
  });

  it("single mode value is the checked control's string value", () => {
    const { api } = single();
    expect(api.getValue()).toBe("left");
    api.toggle("center");
    expect(api.getValue()).toBe("center");
  });

  it("Space/Enter on the focused control selects it (single mode)", () => {
    const { api, controls } = single();
    controls()[2].focus();
    key(controls()[2], " ");
    expect(api.getValue()).toBe("right");
    expect(controls().map((c) => c.checked)).toEqual([false, false, true]);
  });

  // ── multi mode: independence + array value ──────────────────────────────────
  it("multi mode toggles controls independently", () => {
    const { api, controls } = multi();
    expect(controls().map((c) => c.checked)).toEqual([true, false, false]);
    api.toggle("italic");
    expect(controls().map((c) => c.checked)).toEqual([true, true, false]);
    api.toggle("bold");
    expect(controls().map((c) => c.checked)).toEqual([false, true, false]);
  });

  it("multi mode value is the array of checked values", () => {
    const { api } = multi();
    expect(api.getValue()).toEqual(["bold"]);
    api.toggle("underline");
    expect(api.getValue()).toEqual(["bold", "underline"]);
    api.toggle("bold");
    expect(api.getValue()).toEqual(["underline"]);
  });

  it("Space on the focused control toggles it (multi mode)", () => {
    const { api, controls } = multi();
    controls()[1].focus();
    key(controls()[1], " ");
    expect(api.getValue()).toEqual(["bold", "italic"]);
    key(controls()[1], " ");
    expect(api.getValue()).toEqual(["bold"]);
  });

  // ── [data-state] hook ───────────────────────────────────────────────────────
  it("mirrors on/off onto each item's data-state", () => {
    const { root, api } = multi();
    const items = () => [...root.querySelectorAll("[data-part='item']")] as HTMLElement[];
    expect(items().map((i) => i.dataset.state)).toEqual(["on", "off", "off"]);
    api.toggle("italic");
    expect(items().map((i) => i.dataset.state)).toEqual(["on", "on", "off"]);
  });

  // ── faqir:change ────────────────────────────────────────────────────────────
  it("emits faqir:change with the value + mode on selection", () => {
    const { root, api } = multi();
    const events: any[] = [];
    root.addEventListener("faqir:change", (e) => events.push((e as CustomEvent).detail));
    api.toggle("italic");
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ value: ["bold", "italic"], mode: "multi" });
  });

  // ── lifecycle ───────────────────────────────────────────────────────────────
  it("prevents double initialization", () => {
    const { root, api } = single();
    expect(createToggleGroup(root)).toBe(api);
  });

  it("destroy() unbinds listeners and drops the instance", () => {
    const { root, api, controls } = single();
    api.destroy();
    key(controls()[0], "ArrowRight");
    expect(document.activeElement).not.toBe(controls()[1]); // no controller listening
    expect((root as any)._faqirToggleGroup).toBeUndefined();
  });

  // ── l-model integration (real engine, native paths) ─────────────────────────
  it("l-model binds a string in single mode", async () => {
    document.body.innerHTML = `
      <div l-data='{ "align": "left" }'>
        <div data-ui="toggle-group" data-mode="single" role="radiogroup" aria-label="Align">
          <label data-part="item"><input data-part="control" type="radio" value="left" l-model="align"><span data-part="label">Left</span></label>
          <label data-part="item"><input data-part="control" type="radio" value="center" l-model="align"><span data-part="label">Center</span></label>
          <label data-part="item"><input data-part="control" type="radio" value="right" l-model="align"><span data-part="label">Right</span></label>
        </div>
        <output id="out" l-text="align"></output>
      </div>`;
    Faqir.start();
    const root = document.querySelector("[data-ui='toggle-group']") as HTMLElement;
    const api = createToggleGroup(root);
    mounted.push(api);
    const out = document.querySelector("#out")!;
    await tick();
    expect(out.textContent).toBe("left");

    api.toggle("center"); // dispatches native change → l-model updates the model
    await tick();
    expect(out.textContent).toBe("center");
    expect(api.getValue()).toBe("center");
  });

  it("l-model binds an array in multi mode", async () => {
    document.body.innerHTML = `
      <div l-data='{ "marks": [] }'>
        <div data-ui="toggle-group" data-mode="multi" role="group" aria-label="Format">
          <label data-part="item"><input data-part="control" type="checkbox" value="bold" l-model="marks"><span data-part="label">Bold</span></label>
          <label data-part="item"><input data-part="control" type="checkbox" value="italic" l-model="marks"><span data-part="label">Italic</span></label>
          <label data-part="item"><input data-part="control" type="checkbox" value="underline" l-model="marks"><span data-part="label">Underline</span></label>
        </div>
        <output id="out" l-text="marks.join(',')"></output>
      </div>`;
    Faqir.start();
    const root = document.querySelector("[data-ui='toggle-group']") as HTMLElement;
    const api = createToggleGroup(root);
    mounted.push(api);
    const out = document.querySelector("#out")!;
    await tick();
    expect(out.textContent).toBe("");

    api.toggle("bold");
    await tick();
    expect(out.textContent).toBe("bold");

    api.toggle("underline");
    await tick();
    expect(out.textContent).toBe("bold,underline");
    expect(api.getValue()).toEqual(["bold", "underline"]);

    api.toggle("bold");
    await tick();
    expect(out.textContent).toBe("underline");
  });
});
