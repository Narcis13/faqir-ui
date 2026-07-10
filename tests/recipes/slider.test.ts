import { describe, it, expect, beforeEach } from "bun:test";
import {
  createSlider,
  valueFromPointer,
  snapToStep,
  percentOf,
} from "../../registry/recipes/slider/slider.js";

// ── Setups ───────────────────────────────────────────────────────────────────

function setupSingle(attrs = "", extra = "") {
  document.body.innerHTML = `
    <div data-ui="slider" data-variant="single"
         data-min="0" data-max="100" data-step="1" data-value="40" ${attrs}>
      <div data-part="track">
        <div data-part="range"></div>
        <div data-part="thumb" role="slider" tabindex="0" aria-label="Volume"
             aria-valuemin="0" aria-valuemax="100" aria-valuenow="40">${extra}</div>
      </div>
      <output data-part="output">40</output>
    </div>`;
  const root = document.querySelector("[data-ui='slider']") as HTMLElement;
  const api = createSlider(root);
  const thumb = root.querySelector("[data-part='thumb']") as HTMLElement;
  const track = root.querySelector("[data-part='track']") as HTMLElement;
  return { root, api, thumb, track };
}

function setupRange() {
  document.body.innerHTML = `
    <div data-ui="slider" data-variant="range"
         data-min="0" data-max="1000" data-step="10" data-value="200,800">
      <div data-part="track">
        <div data-part="range"></div>
        <div data-part="thumb" role="slider" tabindex="0" aria-label="Minimum"></div>
        <div data-part="thumb" role="slider" tabindex="0" aria-label="Maximum"></div>
      </div>
    </div>`;
  const root = document.querySelector("[data-ui='slider']") as HTMLElement;
  const api = createSlider(root);
  const thumbs = [...root.querySelectorAll("[data-part='thumb']")] as HTMLElement[];
  return { root, api, lower: thumbs[0], upper: thumbs[1], thumbs };
}

function setupRTL() {
  document.body.innerHTML = `
    <div dir="rtl">
      <div data-ui="slider" data-variant="single"
           data-min="0" data-max="100" data-step="1" data-value="40">
        <div data-part="track">
          <div data-part="range"></div>
          <div data-part="thumb" role="slider" tabindex="0" aria-label="Volume"
               aria-valuemin="0" aria-valuemax="100" aria-valuenow="40"></div>
        </div>
      </div>
    </div>`;
  const root = document.querySelector("[data-ui='slider']") as HTMLElement;
  const api = createSlider(root);
  const thumb = root.querySelector("[data-part='thumb']") as HTMLElement;
  return { root, api, thumb };
}

function key(el: HTMLElement, k: string) {
  el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true }));
}

const now = (el: HTMLElement) => el.getAttribute("aria-valuenow");

// ── Keyboard ─────────────────────────────────────────────────────────────────

describe("slider · keyboard", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("ArrowRight increments by step", () => {
    const { thumb } = setupSingle();
    key(thumb, "ArrowRight");
    expect(now(thumb)).toBe("41");
  });

  it("ArrowLeft decrements by step", () => {
    const { thumb } = setupSingle();
    key(thumb, "ArrowLeft");
    expect(now(thumb)).toBe("39");
  });

  it("ArrowUp increments and ArrowDown decrements", () => {
    const { thumb } = setupSingle();
    key(thumb, "ArrowUp");
    expect(now(thumb)).toBe("41");
    key(thumb, "ArrowDown");
    key(thumb, "ArrowDown");
    expect(now(thumb)).toBe("39");
  });

  it("PageUp/PageDown move by the big step (10 × step)", () => {
    const { thumb } = setupSingle();
    key(thumb, "PageUp");
    expect(now(thumb)).toBe("50");
    key(thumb, "PageDown");
    key(thumb, "PageDown");
    expect(now(thumb)).toBe("30");
  });

  it("respects an explicit data-page-step", () => {
    const { thumb } = setupSingle('data-page-step="25"');
    key(thumb, "PageUp");
    expect(now(thumb)).toBe("65");
  });

  it("Home goes to min, End goes to max", () => {
    const { thumb } = setupSingle();
    key(thumb, "Home");
    expect(now(thumb)).toBe("0");
    key(thumb, "End");
    expect(now(thumb)).toBe("100");
  });

  it("clamps at the lower and upper bounds", () => {
    const { thumb, api } = setupSingle();
    api.setValue(0, -50);
    expect(now(thumb)).toBe("0");
    key(thumb, "ArrowLeft");
    expect(now(thumb)).toBe("0"); // cannot go below min
    api.setValue(0, 500);
    expect(now(thumb)).toBe("100");
    key(thumb, "ArrowRight");
    expect(now(thumb)).toBe("100"); // cannot go above max
  });

  it("snaps arbitrary values to the step", () => {
    document.body.innerHTML = `
      <div data-ui="slider" data-min="0" data-max="100" data-step="10" data-value="0">
        <div data-part="track"><div data-part="range"></div>
          <div data-part="thumb" role="slider" tabindex="0" aria-label="x"></div>
        </div>
      </div>`;
    const root = document.querySelector("[data-ui='slider']") as HTMLElement;
    const api = createSlider(root);
    const thumb = root.querySelector("[data-part='thumb']") as HTMLElement;
    api.setValue(0, 47);
    expect(now(thumb)).toBe("50");
    api.setValue(0, 43);
    expect(now(thumb)).toBe("40");
  });

  it("ignores keyboard when disabled", () => {
    const { thumb } = setupSingle("data-disabled");
    key(thumb, "ArrowRight");
    expect(now(thumb)).toBe("40");
  });
});

// ── ARIA ─────────────────────────────────────────────────────────────────────

describe("slider · ARIA", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("thumb has role slider", () => {
    const { thumb } = setupSingle();
    expect(thumb.getAttribute("role")).toBe("slider");
  });

  it("aria-valuemin/max/now are present on the thumb", () => {
    const { thumb } = setupSingle();
    expect(thumb.getAttribute("aria-valuemin")).toBe("0");
    expect(thumb.getAttribute("aria-valuemax")).toBe("100");
    expect(thumb.getAttribute("aria-valuenow")).toBe("40");
  });

  it("aria-valuenow tracks the value continuously through key presses", () => {
    const { thumb } = setupSingle();
    for (let i = 0; i < 5; i++) key(thumb, "ArrowRight");
    expect(now(thumb)).toBe("45");
  });

  it("data-value-suffix drives aria-valuetext", () => {
    const { thumb } = setupSingle('data-value-suffix="%"');
    expect(thumb.getAttribute("aria-valuetext")).toBe("40%");
    key(thumb, "ArrowRight");
    expect(thumb.getAttribute("aria-valuetext")).toBe("41%");
  });

  it("setFormatter updates aria-valuetext", () => {
    const { thumb, api } = setupSingle();
    api.setFormatter((v: number) => `$${v}`);
    expect(thumb.getAttribute("aria-valuetext")).toBe("$40");
    key(thumb, "ArrowRight");
    expect(thumb.getAttribute("aria-valuetext")).toBe("$41");
  });

  it("defensively adds role/tabindex when markup omits them", () => {
    document.body.innerHTML = `
      <div data-ui="slider" data-min="0" data-max="100" data-value="10">
        <div data-part="track"><div data-part="range"></div>
          <div data-part="thumb"></div>
        </div>
      </div>`;
    const root = document.querySelector("[data-ui='slider']") as HTMLElement;
    createSlider(root);
    const thumb = root.querySelector("[data-part='thumb']") as HTMLElement;
    expect(thumb.getAttribute("role")).toBe("slider");
    expect(thumb.getAttribute("tabindex")).toBe("0");
  });
});

// ── Range mode ───────────────────────────────────────────────────────────────

describe("slider · range mode", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("is detected from two thumbs and exposes an array value", () => {
    const { api } = setupRange();
    expect(api.getValue()).toEqual([200, 800]);
  });

  it("seeds each thumb from the comma-separated data-value", () => {
    const { lower, upper } = setupRange();
    expect(now(lower)).toBe("200");
    expect(now(upper)).toBe("800");
  });

  it("constrains each thumb's aria bounds to its neighbour", () => {
    const { lower, upper } = setupRange();
    expect(lower.getAttribute("aria-valuemin")).toBe("0");
    expect(lower.getAttribute("aria-valuemax")).toBe("800"); // capped by upper
    expect(upper.getAttribute("aria-valuemin")).toBe("200"); // floored by lower
    expect(upper.getAttribute("aria-valuemax")).toBe("1000");
  });

  it("thumbs cannot cross — lower is capped at the upper's value", () => {
    const { lower, upper, api } = setupRange();
    api.setValue(0, 950); // try to push lower past upper (800)
    expect(now(lower)).toBe("800");
    expect(now(upper)).toBe("800");
    expect(api.getValues()).toEqual([800, 800]);
  });

  it("thumbs cannot cross — upper is floored at the lower's value", () => {
    const { lower, upper, api } = setupRange();
    api.setValue(1, 50); // try to push upper below lower (200)
    expect(now(upper)).toBe("200");
    expect(now(lower)).toBe("200");
  });

  it("each thumb is independently keyboard-operable", () => {
    const { lower, upper } = setupRange();
    key(lower, "ArrowRight"); // +10
    expect(now(lower)).toBe("210");
    expect(now(upper)).toBe("800"); // untouched
    key(upper, "ArrowLeft"); // -10
    expect(now(upper)).toBe("790");
    expect(now(lower)).toBe("210");
  });

  it("End on the lower thumb stops at the upper (non-crossing)", () => {
    const { lower, upper } = setupRange();
    key(lower, "End");
    expect(now(lower)).toBe(now(upper)); // 800
  });

  it("Home on the upper thumb stops at the lower (non-crossing)", () => {
    const { lower, upper } = setupRange();
    key(upper, "Home");
    expect(now(upper)).toBe(now(lower)); // 200
  });
});

// ── Events + lifecycle ───────────────────────────────────────────────────────

describe("slider · events and lifecycle", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("emits a faqir:change event carrying value, index and values", () => {
    const { root, thumb } = setupSingle();
    let detail: any = null;
    root.addEventListener("faqir:change", (e) => {
      detail = (e as CustomEvent).detail;
    });
    key(thumb, "ArrowRight");
    expect(detail).toEqual({ index: 0, value: 41, values: [41] });
  });

  it("does not emit a change on init", () => {
    document.body.innerHTML = `
      <div data-ui="slider" data-min="0" data-max="100" data-value="40">
        <div data-part="track"><div data-part="range"></div>
          <div data-part="thumb" role="slider" tabindex="0" aria-label="x"></div>
        </div>
      </div>`;
    const root = document.querySelector("[data-ui='slider']") as HTMLElement;
    let fired = false;
    root.addEventListener("faqir:change", () => {
      fired = true;
    });
    createSlider(root);
    expect(fired).toBe(false);
  });

  it("prevents double initialization", () => {
    const { root, api } = setupSingle();
    const again = createSlider(root);
    expect(again).toBe(api);
  });

  it("destroy removes listeners", () => {
    const { thumb, api } = setupSingle();
    api.destroy();
    key(thumb, "ArrowRight");
    expect(now(thumb)).toBe("40"); // no change after destroy
  });

  it("reflects the filled span through CSS custom properties on the root", () => {
    const { root, thumb } = setupSingle();
    expect(root.style.getPropertyValue("--slider-end")).toBe("40%");
    expect(thumb.style.getPropertyValue("--pos")).toBe("40%");
    key(thumb, "ArrowRight");
    expect(root.style.getPropertyValue("--slider-end")).toBe("41%");
  });
});

// ── RTL keyboard ─────────────────────────────────────────────────────────────

describe("slider · RTL", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("inverts the horizontal arrows under dir=rtl", () => {
    const { thumb } = setupRTL();
    key(thumb, "ArrowRight"); // decreases in RTL
    expect(now(thumb)).toBe("39");
    key(thumb, "ArrowLeft"); // increases in RTL
    key(thumb, "ArrowLeft");
    expect(now(thumb)).toBe("41");
  });

  it("keeps ArrowUp/ArrowDown direction-independent under RTL", () => {
    const { thumb } = setupRTL();
    key(thumb, "ArrowUp");
    expect(now(thumb)).toBe("41");
    key(thumb, "ArrowDown");
    key(thumb, "ArrowDown");
    expect(now(thumb)).toBe("39");
  });
});

// ── Pure value math ──────────────────────────────────────────────────────────

describe("slider · pure value math", () => {
  const rect = { left: 0, width: 100 };

  it("maps pointer x to value (LTR)", () => {
    expect(valueFromPointer(25, rect, { min: 0, max: 100, step: 1 })).toBe(25);
    expect(valueFromPointer(80, rect, { min: 0, max: 100, step: 1 })).toBe(80);
  });

  it("inverts the mapping under RTL", () => {
    expect(valueFromPointer(25, rect, { min: 0, max: 100, step: 1, rtl: true })).toBe(75);
    expect(valueFromPointer(80, rect, { min: 0, max: 100, step: 1, rtl: true })).toBe(20);
  });

  it("accounts for the track's left offset", () => {
    expect(
      valueFromPointer(150, { left: 100, width: 100 }, { min: 0, max: 100, step: 1 }),
    ).toBe(50);
  });

  it("snaps to the step and clamps to the range", () => {
    expect(valueFromPointer(23, rect, { min: 0, max: 100, step: 10 })).toBe(20);
    expect(valueFromPointer(-40, rect, { min: 0, max: 100, step: 1 })).toBe(0);
    expect(valueFromPointer(400, rect, { min: 0, max: 100, step: 1 })).toBe(100);
  });

  it("returns min for a zero-width track (unmeasured)", () => {
    expect(valueFromPointer(50, { left: 0, width: 0 }, { min: 0, max: 100, step: 1 })).toBe(0);
  });

  it("maps into an arbitrary min/max range", () => {
    expect(valueFromPointer(50, rect, { min: 200, max: 1000, step: 10 })).toBe(600);
  });

  it("snapToStep rounds to the nearest step and clamps", () => {
    expect(snapToStep(47, 0, 100, 10)).toBe(50);
    expect(snapToStep(43, 0, 100, 10)).toBe(40);
    expect(snapToStep(999, 0, 100, 1)).toBe(100);
    expect(snapToStep(-5, 0, 100, 1)).toBe(0);
  });

  it("snapToStep keeps fractional steps free of float dust", () => {
    expect(snapToStep(0.30000000000000004, 0, 1, 0.1)).toBe(0.3);
    expect(snapToStep(0.55, 0, 1, 0.1)).toBe(0.6);
  });

  it("percentOf maps value to a clamped 0–100 percentage", () => {
    expect(percentOf(25, 0, 100)).toBe(25);
    expect(percentOf(600, 200, 1000)).toBe(50);
    expect(percentOf(-10, 0, 100)).toBe(0);
    expect(percentOf(150, 0, 100)).toBe(100);
  });
});
