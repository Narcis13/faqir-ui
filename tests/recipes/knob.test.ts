import { afterEach, describe, expect, it } from "bun:test";
import { createKnob } from "../../registry/recipes/knob/knob.js";

// Mounted into a disposable container (never document.body itself), torn down
// after every test: the happy-dom realm is shared by every file in the run.
let box: HTMLElement | null = null;
afterEach(() => {
  box?.remove();
  box = null;
});

const DIAL = `<span data-part="cap" aria-hidden="true"></span>
  <svg data-part="dial" viewBox="0 0 100 100" aria-hidden="true">
    <path data-part="track" d="M 21.716 78.284 A 40 40 0 1 1 78.284 78.284" pathLength="100"/>
    <path data-part="arc" d="M 21.716 78.284 A 40 40 0 1 1 78.284 78.284" pathLength="100"/>
    <line data-part="indicator" x1="50" y1="27" x2="50" y2="39"/>
  </svg>`;

function mount(opts: { root?: string; input?: string; wrap?: (knob: string) => string } = {}) {
  const knob = `<div data-ui="knob" ${opts.root ?? ""}>
    <label data-part="label" for="k">Gain</label>
    <div data-part="control">
      <input data-part="input" id="k" type="range" name="gain" ${opts.input ?? 'min="0" max="100" step="1" value="40"'}>
      ${DIAL}
    </div>
    <output data-part="output" aria-hidden="true"></output>
  </div>`;
  box = document.createElement("div");
  box.innerHTML = opts.wrap ? opts.wrap(knob) : knob;
  document.body.appendChild(box);
  const root = box.querySelector<HTMLElement>("[data-ui='knob']")!;
  const input = root.querySelector<HTMLInputElement>("[data-part='input']")!;
  const control = root.querySelector<HTMLElement>("[data-part='control']")!;
  const output = root.querySelector<HTMLElement>("[data-part='output']")!;
  const api = createKnob(root)!;
  return { root, input, control, output, api };
}

const key = (el: HTMLElement, k: string, init: KeyboardEventInit = {}) =>
  el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...init }));

function pointer(el: HTMLElement, type: string, x: number, y: number, init: PointerEventInit = {}) {
  el.dispatchEvent(
    new PointerEvent(type, { clientX: x, clientY: y, button: 0, pointerId: 1, bubbles: true, cancelable: true, ...init }),
  );
}

/** Record every event of `types` the input fires, in order. */
function recorder(el: EventTarget, ...types: string[]) {
  const seen: string[] = [];
  for (const t of types) el.addEventListener(t, () => seen.push(t));
  return seen;
}

const pos = (root: HTMLElement) => Number(root.style.getPropertyValue("--knob-pos"));

describe("knob · seeding and value math", () => {
  it("seeds from the native input and paints --knob-pos, readout and aria-valuetext", () => {
    const { root, input, output } = mount({ root: 'data-value-suffix="%"' });
    expect(pos(root)).toBeCloseTo(0.4);
    expect(output.textContent).toBe("40%");
    expect(input.getAttribute("aria-valuetext")).toBe("40%");
  });

  it("snaps an off-grid authored value onto the step grid (based at min)", () => {
    const { input, api } = mount({ input: 'min="20" max="2000" step="10" value="647"' });
    expect(input.value).toBe("650");
    api.setValue(1234);
    expect(api.getValue()).toBe(1230);
    api.setValue(99999);
    expect(api.getValue()).toBe(2000);
    api.setValue(-5);
    expect(api.getValue()).toBe(20);
  });

  it("keeps decimal steps free of float dust", () => {
    const { api } = mount({ input: 'min="0" max="24" step="0.5" value="9"' });
    api.stepBy(3);
    expect(api.getValue()).toBe(10.5);
    api.setValue(0.1 + 0.2);
    expect(api.getValue()).toBe(0.5);
  });
});

describe("knob · keyboard", () => {
  it("arrows move by one step either way", () => {
    const { input, api } = mount();
    key(input, "ArrowUp");
    key(input, "ArrowRight");
    expect(api.getValue()).toBe(42);
    key(input, "ArrowDown");
    key(input, "ArrowLeft");
    key(input, "ArrowLeft");
    expect(api.getValue()).toBe(39);
  });

  it("PageUp/PageDown honour data-page-step, and default to ten steps", () => {
    const paged = mount({ root: 'data-page-step="25"' });
    key(paged.input, "PageUp");
    expect(paged.api.getValue()).toBe(65);
    paged.root.parentElement!.remove();

    const plain = mount();
    key(plain.input, "PageDown");
    expect(plain.api.getValue()).toBe(30);
  });

  it("Home and End jump to the bounds", () => {
    const { input, api } = mount({ input: 'min="-12" max="12" value="3"' });
    key(input, "End");
    expect(api.getValue()).toBe(12);
    key(input, "Home");
    expect(api.getValue()).toBe(-12);
  });

  it("each handled key prevents the native step and fires input then change", () => {
    const { input, root } = mount();
    const seen = recorder(input, "input", "change");
    const faqir: number[] = [];
    root.addEventListener("faqir:change", (e) => faqir.push((e as CustomEvent).detail.value));
    const ev = new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true, cancelable: true });
    input.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(seen).toEqual(["input", "change"]);
    expect(faqir).toEqual([41]);
  });

  it("a key at a bound changes nothing and fires nothing", () => {
    const { input } = mount({ input: 'min="0" max="100" value="100"' });
    const seen = recorder(input, "input", "change");
    key(input, "ArrowUp");
    expect(seen).toEqual([]);
  });

  it("ignores keys it does not own", () => {
    const { input, api } = mount();
    const ev = new KeyboardEvent("keydown", { key: "a", bubbles: true, cancelable: true });
    input.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
    expect(api.getValue()).toBe(40);
  });
});

describe("knob · pointer", () => {
  it("a vertical drag turns the knob (200px for the whole sweep), and change fires on release", () => {
    const { input, control, root, api } = mount();
    const seen = recorder(input, "change");
    pointer(control, "pointerdown", 100, 300);
    expect(root.dataset.state).toBe("dragging");
    expect(document.activeElement).toBe(input);
    pointer(control, "pointermove", 100, 260); // 40px up = 20% of the range
    expect(api.getValue()).toBe(60);
    pointer(control, "pointermove", 130, 260); // and 30px right = 15% more
    expect(api.getValue()).toBe(75);
    expect(seen).toEqual([]);
    pointer(control, "pointerup", 130, 260);
    expect(seen).toEqual(["change"]);
    expect(root.dataset.state).toBeUndefined();
  });

  it("Shift makes the drag ten times finer, accumulating across steps", () => {
    const { control, api } = mount();
    pointer(control, "pointerdown", 0, 300);
    for (let y = 296; y >= 260; y -= 4) pointer(control, "pointermove", 0, y, { shiftKey: true });
    // 40px at 2000px for the sweep = 2% of the range.
    expect(api.getValue()).toBe(42);
    pointer(control, "pointerup", 0, 260);
  });

  it("angular mode follows the pointer's angle around the centre", () => {
    const { control, api } = mount({ root: 'data-drag="angular"' });
    control.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0, toJSON() {} }) as DOMRect;
    pointer(control, "pointerdown", 50, 0); // straight up = the middle of the sweep
    expect(api.getValue()).toBe(50);
    pointer(control, "pointermove", 100, 50); // 3 o'clock = +90° = 225/270
    expect(api.getValue()).toBe(83);
    pointer(control, "pointermove", 55, 100); // into the gap near the max end — pins to max
    expect(api.getValue()).toBe(100);
    pointer(control, "pointerup", 55, 100);
  });

  it("a double-click restores the authored default", () => {
    const { control, input, api } = mount();
    api.setValue(90);
    const seen = recorder(input, "input", "change");
    control.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    expect(api.getValue()).toBe(40);
    expect(seen).toEqual(["input", "change"]);
  });
});

describe("knob · wheel", () => {
  const wheel = (el: HTMLElement, deltaY: number, init: WheelEventInit = {}) => {
    const ev = new WheelEvent("wheel", { deltaY, bubbles: true, cancelable: true, ...init });
    // happy-dom's WheelEvent drops the modifier keys from its init dictionary.
    if (init.shiftKey) Object.defineProperty(ev, "shiftKey", { value: true });
    el.dispatchEvent(ev);
    return ev;
  };

  it("does nothing — and leaves the page to scroll — until the knob has focus", () => {
    const { control, api } = mount();
    const ev = wheel(control, -100);
    expect(ev.defaultPrevented).toBe(false);
    expect(api.getValue()).toBe(40);
  });

  it("turns a focused knob: a 100px notch is 5% of the range, Shift 0.5%", () => {
    const { control, input, api } = mount();
    input.focus();
    const ev = wheel(control, -100);
    expect(ev.defaultPrevented).toBe(true);
    expect(api.getValue()).toBe(45);
    wheel(control, 200);
    expect(api.getValue()).toBe(35);
    for (let i = 0; i < 4; i++) wheel(control, -100, { shiftKey: true });
    expect(api.getValue()).toBe(37);
  });
});

describe("knob · programmatic writes, forms and l-model", () => {
  it("a write to input.value repaints the dial (the l-model → dial path)", () => {
    const { root, input, output } = mount({ root: 'data-value-suffix="%"' });
    input.value = "75";
    expect(pos(root)).toBeCloseTo(0.75);
    expect(output.textContent).toBe("75%");
    expect(input.value).toBe("75");
  });

  it("a form reset restores the default, repaints and fires input", async () => {
    const { root, input, api } = mount({ wrap: (k) => `<form>${k}<button type="reset">Reset</button></form>` });
    api.setValue(90);
    expect(pos(root)).toBeCloseTo(0.9);
    const seen = recorder(input, "input");
    input.form!.reset();
    await new Promise((r) => setTimeout(r, 5));
    expect(input.value).toBe("40");
    expect(pos(root)).toBeCloseTo(0.4);
    expect(seen).toEqual(["input"]);
  });

  it("submits under its name with its form", () => {
    const { input, api } = mount({ wrap: (k) => `<form>${k}</form>` });
    api.setValue(55);
    expect(new FormData(input.form!).get("gain")).toBe("55");
  });

  it("honours both seams l-model uses: input events out, value writes in", async () => {
    // The engine's l-model writes `el.value` from an effect and reads it back on
    // `input` — exactly the two seams the knob hooks. Exercised against the real
    // directive in the browser suite (tests/browser/knob.pw.ts); here the same
    // contract is checked without booting the engine in this shared realm.
    const { input, root, api } = mount();
    let model = 40;
    input.addEventListener("input", () => (model = parseFloat(input.value)));
    key(input, "PageUp");
    expect(model).toBe(50);
    input.value = String(12); // the effect's write
    expect(pos(root)).toBeCloseTo(0.12);
    expect(api.getValue()).toBe(12);
  });
});

describe("knob · bipolar, formatting and disabled", () => {
  it("a bipolar knob paints --knob-origin and signs its readout", () => {
    const { root, output, api } = mount({ root: 'data-origin="0" data-value-suffix=" dB"', input: 'min="-12" max="12" value="4"' });
    expect(Number(root.style.getPropertyValue("--knob-origin"))).toBeCloseTo(0.5);
    expect(output.textContent).toBe("+4 dB");
    api.setValue(-3);
    expect(output.textContent).toBe("−3 dB");
    api.setValue(0);
    expect(output.textContent).toBe("0 dB");
  });

  it("setFormatter drives the readout and aria-valuetext", () => {
    const { input, output, api } = mount();
    api.setFormatter((v: number) => (v < 50 ? `L ${50 - v}` : v > 50 ? `R ${v - 50}` : "C"));
    expect(output.textContent).toBe("L 10");
    api.setValue(65);
    expect(input.getAttribute("aria-valuetext")).toBe("R 15");
  });

  it("a disabled input ignores drag, wheel and double-click", () => {
    const { control, input, api } = mount({ input: 'min="0" max="100" value="40" disabled' });
    pointer(control, "pointerdown", 0, 300);
    pointer(control, "pointermove", 0, 100);
    control.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    expect(api.getValue()).toBe(40);
    expect(input.disabled).toBe(true);
  });
});

describe("knob · lifecycle", () => {
  it("prevents double initialization", () => {
    const { root, api } = mount();
    expect(createKnob(root)).toBe(api);
  });

  it("destroy removes the listeners and the value accessor", () => {
    const { root, input, control, api } = mount();
    api.destroy();
    expect(Object.getOwnPropertyDescriptor(input, "value")).toBeUndefined();
    key(input, "ArrowUp");
    pointer(control, "pointerdown", 0, 300);
    pointer(control, "pointermove", 0, 200);
    expect(input.value).toBe("40");
    input.value = "80";
    expect(pos(root)).toBeCloseTo(0.4); // no longer repainted
    expect((root as any)._faqirKnob).toBeUndefined();
  });
});

describe("knob · review fixes", () => {
  it("snaps onto a grid based at a fractional min", () => {
    const { api } = mount({ input: 'min="0.05" max="1" step="0.1" value="0.05"' });
    api.setValue(0.15);
    expect(api.getValue()).toBeCloseTo(0.15, 10);
    api.setValue(0.36);
    expect(api.getValue()).toBeCloseTo(0.35, 10);
  });

  it("keeps the places of a step written in exponent notation", () => {
    const { api } = mount({ input: 'min="0" max="0.000001" step="1e-7" value="0"' });
    api.setValue(0.0000003);
    expect(api.getValue()).toBeCloseTo(0.0000003, 12);
  });
});
