import { afterEach, describe, expect, it } from "bun:test";
import { createImageCompare } from "../../registry/recipes/image-compare/image-compare.js";

let box: HTMLElement | null = null;
afterEach(() => {
  box?.remove();
  box = null;
});

function mount(attrs = "", now = "50") {
  box = document.createElement("div");
  box.innerHTML = `<div data-ui="image-compare" ${attrs}>
    <img data-part="after" src="data:," alt="After: graded">
    <img data-part="before" src="data:," alt="Before: as shot">
    <span data-part="before-label" aria-hidden="true">Before</span>
    <span data-part="after-label" aria-hidden="true">After</span>
    <div data-part="handle" role="slider" tabindex="0" aria-label="Before and after divider"
         aria-valuemin="0" aria-valuemax="100" aria-valuenow="${now}"><span data-part="grip"></span></div>
  </div>`;
  document.body.appendChild(box);
  const root = box.querySelector<HTMLElement>('[data-ui="image-compare"]')!;
  root.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 200, right: 400, bottom: 200, x: 0, y: 0, toJSON() {} }) as DOMRect;
  const api = createImageCompare(root)!;
  const handle = root.querySelector<HTMLElement>('[data-part="handle"]')!;
  return { root, api, handle };
}

const key = (el: Element, k: string) => {
  const ev = new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true });
  el.dispatchEvent(ev);
  return ev;
};
const pointer = (el: Element, type: string, x: number, y = 100, pointerType = "mouse") =>
  el.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, button: 0, pointerId: 1, pointerType, bubbles: true, cancelable: true }));
const pos = (root: HTMLElement) => root.style.getPropertyValue("--image-compare-pos");

describe("image-compare · seeding and ARIA", () => {
  it("seeds from the handle's aria-valuenow and names both sides in aria-valuetext", () => {
    const { root, handle, api } = mount("", "30");
    expect(api.getPosition()).toBe(30);
    expect(pos(root)).toBe("30%");
    expect(handle.getAttribute("aria-valuetext")).toBe("30% before, 70% after");
    expect(handle.getAttribute("aria-orientation")).toBe("horizontal");
  });

  it("data-position wins over aria-valuenow", () => {
    const { api } = mount('data-position="64"', "30");
    expect(api.getPosition()).toBe(64);
  });
});

describe("image-compare · keyboard", () => {
  it("arrows step, Page keys jump ten steps, Home and End go to the ends", () => {
    const { handle, api } = mount();
    expect(key(handle, "ArrowRight").defaultPrevented).toBe(true);
    expect(api.getPosition()).toBe(51);
    key(handle, "ArrowUp");
    expect(api.getPosition()).toBe(52);
    key(handle, "ArrowLeft");
    key(handle, "ArrowDown");
    key(handle, "ArrowDown");
    expect(api.getPosition()).toBe(49);
    key(handle, "PageUp");
    expect(api.getPosition()).toBe(59);
    key(handle, "PageDown");
    key(handle, "PageDown");
    expect(api.getPosition()).toBe(39);
    key(handle, "End");
    expect(api.getPosition()).toBe(100);
    key(handle, "Home");
    expect(api.getPosition()).toBe(0);
    expect(handle.getAttribute("aria-valuenow")).toBe("0");
  });

  it("data-step sets the arrow step", () => {
    const { handle, api } = mount('data-step="5"');
    key(handle, "ArrowRight");
    expect(api.getPosition()).toBe(55);
    key(handle, "PageDown");
    expect(api.getPosition()).toBe(5);
  });

  it("vertical: the divider moves the way the arrow points, and aria-orientation says so", () => {
    const { handle, api } = mount('data-orientation="vertical"');
    expect(handle.getAttribute("aria-orientation")).toBe("vertical");
    key(handle, "ArrowDown");
    expect(api.getPosition()).toBe(51);
    key(handle, "ArrowUp");
    key(handle, "ArrowUp");
    expect(api.getPosition()).toBe(49);
  });

  it("ignores keys it does not own", () => {
    const { handle, api } = mount();
    expect(key(handle, "a").defaultPrevented).toBe(false);
    expect(api.getPosition()).toBe(50);
  });
});

describe("image-compare · pointer", () => {
  it("a press anywhere moves the divider there, focuses the handle, and a drag follows", () => {
    const { root, handle, api } = mount();
    pointer(root, "pointerdown", 100);
    expect(api.getPosition()).toBe(25);
    expect(root.dataset.state).toBe("dragging");
    expect(document.activeElement).toBe(handle);
    pointer(root, "pointermove", 300);
    expect(api.getPosition()).toBe(75);
    pointer(root, "pointerup", 300);
    expect(root.dataset.state).toBeUndefined();
    pointer(root, "pointermove", 40);
    expect(api.getPosition()).toBe(75);
  });

  it("clamps outside the picture", () => {
    const { root, api } = mount();
    pointer(root, "pointerdown", -80);
    expect(api.getPosition()).toBe(0);
    pointer(root, "pointermove", 999);
    expect(api.getPosition()).toBe(100);
  });

  it("vertical reads the pointer's y", () => {
    const { root, api } = mount('data-orientation="vertical"');
    pointer(root, "pointerdown", 0, 150);
    expect(api.getPosition()).toBe(75);
  });

  it("hover mode follows a mouse without a press, but not a touch", () => {
    const { root, api } = mount('data-mode="hover"');
    pointer(root, "pointermove", 120);
    expect(api.getPosition()).toBe(30);
    pointer(root, "pointermove", 300, 100, "touch");
    expect(api.getPosition()).toBe(30);
  });

  it("emits faqir:change with the position, and only on a change", () => {
    const { root, api } = mount();
    const seen: number[] = [];
    root.addEventListener("faqir:change", (e) => seen.push((e as CustomEvent).detail.position));
    api.setPosition(70);
    api.setPosition(70);
    api.setPosition(-10);
    expect(seen).toEqual([70, 0]);
  });
});

describe("image-compare · lifecycle", () => {
  it("prevents double initialization", () => {
    const { root, api } = mount();
    expect(createImageCompare(root)).toBe(api);
  });

  it("destroy removes every listener", () => {
    const { root, handle, api } = mount();
    api.destroy();
    key(handle, "End");
    pointer(root, "pointerdown", 10);
    expect(api.getPosition()).toBe(50);
    expect((root as any)._faqirImageCompare).toBeUndefined();
  });
});
