// ═══════════════════════════════════════════════════════════════════════════
// tag-input — controller contract  [task 0.7-06]
// ═══════════════════════════════════════════════════════════════════════════
//
// Composes the CHIP primitive (committed tags → real data-ui="chip" markup) and
// the COMBOBOX listbox behaviour (optional filtered suggestions). Value is an
// array of strings, exposed via getValue(), the faqir:change detail, and the
// hidden [data-part="value"] input (JSON) that drives l-model.

import { describe, it, expect, afterEach } from "bun:test";
import { createTagInput } from "../../registry/recipes/tag-input/tag-input.js";

const Faqir = require("../../registry/core/faqir-core.js");
const tick = () => new Promise((r) => setTimeout(r, 0));

const mounted: Array<{ destroy: () => void }> = [];

function setup(opts: { suggestions?: boolean; allowDuplicates?: boolean; seed?: string[] } = {}) {
  const seed = opts.seed ?? ["TypeScript"];
  const chips = seed
    .map(
      (t) =>
        `<span data-ui="chip" data-part="tag"><span data-part="label">${t}</span><button data-part="dismiss" type="button" aria-label="Remove ${t}">&times;</button></span>`,
    )
    .join("");
  const list = opts.suggestions
    ? `<ul data-part="listbox" role="listbox" id="s1" hidden>
         <li data-part="option" role="option">Vue</li>
         <li data-part="option" role="option">Svelte</li>
         <li data-part="option" role="option">Angular</li>
         <li data-part="empty" hidden>No matches</li>
       </ul>`
    : "";
  document.body.innerHTML = `
    <div data-ui="tag-input" data-state="closed"${opts.allowDuplicates ? " data-allow-duplicates" : ""}>
      <span data-part="taglist" role="group" aria-label="Tags">
        ${chips}
        <input data-part="input" type="text" role="combobox" aria-expanded="false" aria-autocomplete="list"${opts.suggestions ? ' aria-controls="s1"' : ""} placeholder="Add…">
      </span>
      ${list}
      <input data-part="value" type="hidden">
    </div>`;
  const root = document.querySelector("[data-ui='tag-input']") as HTMLElement;
  const api = createTagInput(root);
  mounted.push(api);
  const input = root.querySelector("[data-part='input']") as HTMLInputElement;
  const tags = () =>
    [...root.querySelectorAll("[data-part='tag'] [data-part='label']")].map((l) => l.textContent!.trim());
  const options = () => [...root.querySelectorAll("[data-part='option']")] as HTMLElement[];
  const empty = () => root.querySelector("[data-part='empty']") as HTMLElement | null;
  const type = (v: string) => {
    input.value = v;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  };
  const key = (k: string) => input.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true }));
  return { root, api, input, tags, options, empty, type, key };
}

describe("tag-input controller", () => {
  afterEach(() => {
    while (mounted.length) mounted.pop()!.destroy();
    document.body.innerHTML = "";
  });

  // ── add ─────────────────────────────────────────────────────────────────────
  it("type + Enter adds a trimmed tag", () => {
    const { input, tags, key } = setup();
    input.value = "  React  ";
    key("Enter");
    expect(tags()).toEqual(["TypeScript", "React"]);
    expect(input.value).toBe(""); // input cleared after commit
  });

  it("Enter with an empty (or whitespace) input adds nothing", () => {
    const { input, tags, key } = setup();
    input.value = "   ";
    key("Enter");
    expect(tags()).toEqual(["TypeScript"]);
  });

  it("new tags reuse the chip primitive markup", () => {
    const { root, input, key } = setup({ seed: [] });
    input.value = "Design";
    key("Enter");
    const chip = root.querySelector("[data-part='tag']") as HTMLElement;
    expect(chip.dataset.ui).toBe("chip");
    // No role: the taglist is a role="group", and a bare `listitem` outside a
    // `list` is itself invalid ARIA. The chip is reached via its dismiss button.
    expect(chip.getAttribute("role")).toBe(null);
    const dismiss = chip.querySelector("[data-part='dismiss']") as HTMLButtonElement;
    expect(dismiss.type).toBe("button");
    expect(dismiss.getAttribute("aria-label")).toBe("Remove Design");
  });

  // ── remove ──────────────────────────────────────────────────────────────────
  it("Backspace on an empty input removes the last tag", () => {
    const { input, tags, key } = setup({ seed: ["a", "b", "c"] });
    input.value = "";
    key("Backspace");
    expect(tags()).toEqual(["a", "b"]);
  });

  it("Backspace does NOT remove a tag while the input has text", () => {
    const { input, tags, key } = setup({ seed: ["a", "b"] });
    input.value = "typing";
    key("Backspace");
    expect(tags()).toEqual(["a", "b"]);
  });

  it("clicking a chip's dismiss button removes that tag (pointer)", () => {
    const { root, tags } = setup({ seed: ["a", "b", "c"] });
    const dismissB = [...root.querySelectorAll("[data-part='tag']")]
      .find((c) => c.querySelector("[data-part='label']")!.textContent === "b")!
      .querySelector("[data-part='dismiss']") as HTMLButtonElement;
    dismissB.click();
    expect(tags()).toEqual(["a", "c"]);
  });

  // ── duplicates policy ───────────────────────────────────────────────────────
  it("rejects duplicate tags (case-insensitive) by default", () => {
    const { input, tags, key } = setup({ seed: ["React"] });
    input.value = "react";
    key("Enter");
    expect(tags()).toEqual(["React"]);
  });

  it("allows duplicates when data-allow-duplicates is set", () => {
    const { input, tags, key } = setup({ seed: ["React"], allowDuplicates: true });
    input.value = "react";
    key("Enter");
    expect(tags()).toEqual(["React", "react"]);
  });

  // ── value API ───────────────────────────────────────────────────────────────
  it("getValue() returns the live tag array", () => {
    const { api } = setup({ seed: ["a", "b"] });
    expect(api.getValue()).toEqual(["a", "b"]);
  });

  it("setValue() rebuilds the chips exactly", () => {
    const { api, tags } = setup({ seed: ["a"] });
    api.setValue(["x", "y", "z"]);
    expect(tags()).toEqual(["x", "y", "z"]);
    expect(api.getValue()).toEqual(["x", "y", "z"]);
  });

  it("emits faqir:change on add and remove with the array", () => {
    const { root, input, key } = setup({ seed: [] });
    const details: any[] = [];
    root.addEventListener("faqir:change", (e) => details.push((e as CustomEvent).detail.value));
    input.value = "a";
    key("Enter");
    input.value = "b";
    key("Enter");
    input.value = "";
    key("Backspace");
    expect(details).toEqual([["a"], ["a", "b"], ["a"]]);
  });

  // ── suggestions (combobox listbox behaviour) ────────────────────────────────
  it("typing filters suggestions and opens the listbox", () => {
    const { root, options, empty, type } = setup({ suggestions: true, seed: [] });
    type("vu");
    expect(root.dataset.state).toBe("open");
    const visible = options().filter((o) => !o.hasAttribute("data-hidden")).map((o) => o.textContent);
    expect(visible).toEqual(["Vue"]);
    expect(empty()!.hidden).toBe(true);
  });

  it("shows the empty state when no suggestion matches", () => {
    const { options, empty, type } = setup({ suggestions: true, seed: [] });
    type("zzz");
    expect(options().every((o) => o.hasAttribute("data-hidden"))).toBe(true);
    expect(empty()!.hidden).toBe(false);
  });

  it("ArrowDown + Enter commits the highlighted suggestion", () => {
    const { input, tags, key, type } = setup({ suggestions: true, seed: [] });
    type("");
    key("ArrowDown"); // highlight Vue
    key("Enter");
    expect(tags()).toEqual(["Vue"]);
    expect(input.value).toBe("");
  });

  it("clicking a suggestion commits it as a tag", () => {
    const { root, tags } = setup({ suggestions: true, seed: [] });
    const svelte = [...root.querySelectorAll("[data-part='option']")].find(
      (o) => o.textContent === "Svelte",
    ) as HTMLElement;
    svelte.click();
    expect(tags()).toEqual(["Svelte"]);
  });

  it("already-chosen suggestions are filtered out of the list", () => {
    const { options, type } = setup({ suggestions: true, seed: ["Vue"] });
    type("vue");
    const visible = options().filter((o) => !o.hasAttribute("data-hidden"));
    expect(visible.map((o) => o.textContent)).toEqual([]); // Vue already a tag → excluded
  });

  // ── lifecycle ───────────────────────────────────────────────────────────────
  it("prevents double initialization", () => {
    const { root, api } = setup();
    expect(createTagInput(root)).toBe(api);
  });

  it("destroy() unbinds listeners and drops the instance", () => {
    const { root, input, api, tags } = setup({ seed: ["a"] });
    api.destroy();
    input.value = "b";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(tags()).toEqual(["a"]); // no controller listening
    expect((root as any)._faqirTagInput).toBeUndefined();
  });

  // ── l-model integration (hidden value seam, real engine) ────────────────────
  it("value array is exposed to l-model via the hidden value input", async () => {
    document.body.innerHTML = `
      <div l-data='{ "tags": "[]" }'>
        <div data-ui="tag-input" data-state="closed">
          <span data-part="taglist" role="group" aria-label="Tags">
            <input data-part="input" type="text" role="combobox" aria-expanded="false" aria-autocomplete="list" placeholder="Add…">
          </span>
          <input data-part="value" type="hidden" l-model="tags">
        </div>
      </div>`;
    Faqir.start();
    const root = document.querySelector("[data-ui='tag-input']") as HTMLElement;
    const api = createTagInput(root);
    mounted.push(api);
    const input = root.querySelector("[data-part='input']") as HTMLInputElement;
    const scope = document.querySelector("[l-data]") as any;
    await tick();

    input.value = "alpha";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    input.value = "beta";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await tick();

    // The engine model now holds the serialized array; parse it back.
    const modelValue = (root.querySelector("[data-part='value']") as HTMLInputElement).value;
    expect(JSON.parse(modelValue)).toEqual(["alpha", "beta"]);
    expect(api.getValue()).toEqual(["alpha", "beta"]);
  });
});
