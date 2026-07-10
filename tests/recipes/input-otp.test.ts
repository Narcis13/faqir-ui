import { describe, it, expect, beforeEach } from "bun:test";
import { createInputOTP } from "../../registry/recipes/input-otp/input-otp.js";

// ── Markup helpers ─────────────────────────────────────────────────────────────

/** Build the canonical markup for a code of `length` in `mode` and init it. */
function setup(length = 6, mode: "numeric" | "alphanumeric" = "numeric", attrs = "") {
  const segs = Array.from({ length }, () => `<div data-part="segment"></div>`).join("");
  document.body.innerHTML = `
    <div data-ui="input-otp" data-length="${length}" data-mode="${mode}" ${attrs}>
      <input data-part="input" type="text"
             inputmode="${mode === "numeric" ? "numeric" : "text"}"
             autocomplete="one-time-code" maxlength="${length}"
             aria-label="One-time code" />
      <div data-part="segments" aria-hidden="true">${segs}</div>
    </div>`;
  const root = document.querySelector("[data-ui='input-otp']") as HTMLElement;
  const api = createInputOTP(root);
  const input = root.querySelector("[data-part='input']") as HTMLInputElement;
  return { root, api, input };
}

function key(el: HTMLElement, k: string, mods: Record<string, boolean> = {}) {
  el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...mods }));
}

function paste(input: HTMLInputElement, text: string) {
  const ev = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(ev, "clipboardData", { configurable: true, value: { getData: () => text } });
  input.dispatchEvent(ev);
}

const segments = (root: HTMLElement) =>
  [...root.querySelectorAll("[data-part='segment']")] as HTMLElement[];

/** Index of the segment carrying data-active, or -1. */
function activeIndex(root: HTMLElement) {
  return segments(root).findIndex((s) => s.hasAttribute("data-active"));
}

const textOf = (root: HTMLElement) => segments(root).map((s) => s.textContent).join("");
const filledCount = (root: HTMLElement) =>
  segments(root).filter((s) => s.hasAttribute("data-filled")).length;

// ── Typing & auto-advance ──────────────────────────────────────────────────────

describe("input-otp · typing", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("fills segments and auto-advances the active segment", () => {
    const { root, input } = setup();
    key(input, "1");
    expect(segments(root)[0].textContent).toBe("1");
    expect(segments(root)[0].hasAttribute("data-filled")).toBe(true);
    expect(activeIndex(root)).toBe(1); // caret advanced to the next slot

    key(input, "2");
    expect(segments(root)[1].textContent).toBe("2");
    expect(activeIndex(root)).toBe(2);
    expect(input.value).toBe("12");
  });

  it("ignores characters that don't fit numeric mode", () => {
    const { root, input } = setup(6, "numeric");
    key(input, "a");
    key(input, "-");
    key(input, "5");
    expect(input.value).toBe("5");
    expect(filledCount(root)).toBe(1);
  });

  it("accepts letters and digits in alphanumeric mode", () => {
    const { input } = setup(5, "alphanumeric");
    key(input, "A");
    key(input, "9");
    key(input, "z");
    expect(input.value).toBe("A9z");
  });
});

// ── Backspace ──────────────────────────────────────────────────────────────────

describe("input-otp · backspace", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("on an empty trailing segment moves the caret to the previous segment", () => {
    const { root, input } = setup();
    key(input, "1");
    key(input, "2");
    expect(input.value).toBe("12");
    expect(activeIndex(root)).toBe(2); // caret sits on the empty 3rd slot

    key(input, "Backspace");
    expect(input.value).toBe("1");
    expect(activeIndex(root)).toBe(1); // focus moved back
    expect(segments(root)[1].hasAttribute("data-filled")).toBe(false);
    expect(segments(root)[0].hasAttribute("data-filled")).toBe(true);
  });

  it("deletes the character before the caret", () => {
    const { input } = setup();
    for (const c of "1234") key(input, c);
    key(input, "Backspace");
    key(input, "Backspace");
    expect(input.value).toBe("12");
  });
});

// ── Paste ──────────────────────────────────────────────────────────────────────

describe("input-otp · paste", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("of a full code fills all segments", () => {
    const { root, input } = setup();
    paste(input, "123456");
    expect(input.value).toBe("123456");
    expect(filledCount(root)).toBe(6);
    expect(textOf(root)).toBe("123456");
  });

  it("of a partial code fills from the cursor", () => {
    const { input } = setup();
    key(input, "1");
    key(input, "2"); // caret now at position 2
    paste(input, "34");
    expect(input.value).toBe("1234");
  });

  it("strips separators and caps to the code length", () => {
    const { input } = setup(6, "numeric");
    paste(input, "12-34-56-78");
    expect(input.value).toBe("123456"); // dashes dropped, capped at 6
  });
});

// ── Complete event ─────────────────────────────────────────────────────────────

describe("input-otp · complete event", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("fires exactly once with the full value when filled by typing", () => {
    const { root, input } = setup();
    const values: string[] = [];
    root.addEventListener("faqir:complete", (e) => values.push((e as CustomEvent).detail.value));

    for (const c of "123456") key(input, c);
    // Typing extra characters past the end must not re-fire.
    key(input, "7");

    expect(values).toEqual(["123456"]);
  });

  it("fires once on a full paste", () => {
    const { root, input } = setup();
    let count = 0;
    root.addEventListener("faqir:complete", () => count++);
    paste(input, "998877");
    expect(count).toBe(1);
  });

  it("re-arms after the value drops below full", () => {
    const { root, input } = setup();
    let count = 0;
    root.addEventListener("faqir:complete", () => count++);
    for (const c of "123456") key(input, c);
    expect(count).toBe(1);
    key(input, "Backspace");
    key(input, "9");
    expect(count).toBe(2);
  });

  it("does not fire on init even when prefilled via data-value", () => {
    document.body.innerHTML = `
      <div data-ui="input-otp" data-length="6" data-value="482913">
        <input data-part="input" type="text" aria-label="Code" />
        <div data-part="segments" aria-hidden="true"></div>
      </div>`;
    const root = document.querySelector("[data-ui='input-otp']") as HTMLElement;
    let complete = 0;
    let change = 0;
    root.addEventListener("faqir:complete", () => complete++);
    root.addEventListener("faqir:change", () => change++);
    const api = createInputOTP(root);
    expect(complete).toBe(0);
    expect(change).toBe(0);
    expect(api.getValue()).toBe("482913");
    expect(filledCount(root)).toBe(6);
    expect(root.getAttribute("data-state")).toBe("complete");
  });

  it("emits change carrying the current value", () => {
    const { root, input } = setup();
    const changes: string[] = [];
    root.addEventListener("faqir:change", (e) => changes.push((e as CustomEvent).detail.value));
    key(input, "1");
    expect(changes.at(-1)).toBe("1");
    key(input, "2");
    expect(changes.at(-1)).toBe("12");
  });
});

// ── Structure / ARIA / mobile hints ────────────────────────────────────────────

describe("input-otp · structure and a11y", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("rebuilds the segment row to match data-length", () => {
    document.body.innerHTML = `
      <div data-ui="input-otp" data-length="4">
        <input data-part="input" type="text" aria-label="Code" />
        <div data-part="segments" aria-hidden="true">
          <div data-part="segment"></div>
          <div data-part="segment"></div>
        </div>
      </div>`;
    const root = document.querySelector("[data-ui='input-otp']") as HTMLElement;
    createInputOTP(root);
    expect(segments(root).length).toBe(4);
  });

  it("gives the input one-time-code autocomplete and the right inputmode", () => {
    const { input } = setup(6, "numeric");
    expect(input.getAttribute("autocomplete")).toBe("one-time-code");
    expect(input.getAttribute("inputmode")).toBe("numeric");

    const { input: alnum } = setup(5, "alphanumeric");
    expect(alnum.getAttribute("inputmode")).toBe("text");
  });

  it("defaults an accessible name when markup omits one", () => {
    document.body.innerHTML = `
      <div data-ui="input-otp" data-length="4">
        <input data-part="input" type="text" />
        <div data-part="segments"></div>
      </div>`;
    const root = document.querySelector("[data-ui='input-otp']") as HTMLElement;
    createInputOTP(root);
    const input = root.querySelector("[data-part='input']") as HTMLInputElement;
    expect(input.getAttribute("aria-label")).toBe("One-time code");
  });

  it("marks the decorative segment row aria-hidden", () => {
    const { root } = setup();
    const container = root.querySelector("[data-part='segments']") as HTMLElement;
    expect(container.getAttribute("aria-hidden")).toBe("true");
  });
});

// ── Public API & lifecycle ─────────────────────────────────────────────────────

describe("input-otp · api and lifecycle", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("getValue / setValue / clear round-trip (silent, sanitized)", () => {
    const { root, api } = setup(6, "numeric");
    let changes = 0;
    root.addEventListener("faqir:change", () => changes++);

    api.setValue("12ab34"); // letters dropped in numeric mode
    expect(api.getValue()).toBe("1234");
    expect(filledCount(root)).toBe(4);
    expect(changes).toBe(0); // programmatic set is silent

    api.clear();
    expect(api.getValue()).toBe("");
    expect(filledCount(root)).toBe(0);
  });

  it("prevents double initialization", () => {
    const { root, api } = setup();
    expect(createInputOTP(root)).toBe(api);
  });

  it("destroy removes listeners", () => {
    const { root, api, input } = setup();
    key(input, "1");
    api.destroy();
    key(input, "2");
    expect(input.value).toBe("1"); // no further edits after destroy
    expect((root as any)._faqirInputOTP).toBeUndefined();
  });
});
