import { afterEach, describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createLightbox } from "../../registry/recipes/lightbox/lightbox.js";

// Mounted into a disposable container, torn down after every test — never
// document.body itself (one happy-dom realm is shared by the whole run).
const REF = readFileSync(join(import.meta.dir, "../../registry/recipes/lightbox/lightbox.html"), "utf8").replace(
  /<!--[^]*?-->/g,
  "",
);

let box: HTMLElement | null = null;
afterEach(() => {
  box?.remove();
  box = null;
});

function mount(html = REF) {
  box = document.createElement("div");
  box.innerHTML = html;
  document.body.appendChild(box);
  const root = box.querySelector<HTMLElement>('[data-ui="lightbox"]')!;
  const api = createLightbox(root)!;
  const part = (name: string) => root.querySelector<HTMLElement>(`[data-part="${name}"]`)!;
  const items = [...root.querySelectorAll<HTMLAnchorElement>('[data-part="item"]')];
  const image = part("image") as HTMLImageElement;
  return { root, api, part, items, image, panel: part("panel"), stage: part("stage") };
}

const key = (el: Element, k: string) => {
  const ev = new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true });
  el.dispatchEvent(ev);
  return ev;
};
const click = (el: Element, init: MouseEventInit = {}) => {
  const ev = new MouseEvent("click", { bubbles: true, cancelable: true, ...init });
  el.dispatchEvent(ev);
  return ev;
};
const zoomOf = (panel: HTMLElement) => Number(panel.style.getPropertyValue("--lightbox-zoom"));

describe("lightbox · opening", () => {
  it("a click on an item opens the viewer on that picture instead of following the link", () => {
    const { root, items, image, part, panel } = mount();
    const ev = click(items[2]);
    expect(ev.defaultPrevented).toBe(true);
    expect(root.dataset.state).toBe("open");
    expect(panel.hidden).toBe(false);
    expect(part("overlay").hidden).toBe(false);
    expect(image.getAttribute("src")).toBe(items[2].getAttribute("href"));
    expect(image.alt).toBe(items[2].querySelector("img")!.alt);
    expect(part("caption").textContent).toBe("Aurora over Lake Inari — Lapland, Finland");
    expect(part("counter").textContent).toBe("3 / 6");
    expect(part("status").textContent).toBe("Image 3 of 6: Green aurora over a still lake at night");
    expect(document.activeElement).toBe(panel);
  });

  it("a modified click (new tab) follows the link", () => {
    const { root, items } = mount();
    expect(click(items[0], { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(click(items[0], { metaKey: true }).defaultPrevented).toBe(false);
    expect(root.dataset.state).toBe("closed");
  });

  it("open() with no index opens on the first picture; the stage shows loading until load", () => {
    const { api, image, stage, part } = mount();
    // happy-dom "loads" a data: URI synchronously; hold the picture in flight.
    let src = "";
    Object.defineProperty(image, "src", { configurable: true, get: () => src, set: (v) => (src = v) });
    Object.defineProperty(image, "complete", { configurable: true, value: false });
    api.open();
    expect(part("counter").textContent).toBe("1 / 6");
    expect(stage.dataset.state).toBe("loading");
    image.dispatchEvent(new Event("load"));
    expect(stage.dataset.state).toBe("loaded");
  });

  it("emits faqir:change with the index on every move", () => {
    const { root, api } = mount();
    const seen: number[] = [];
    root.addEventListener("faqir:change", (e) => seen.push((e as CustomEvent).detail.index));
    api.open(4);
    api.next();
    api.next();
    expect(seen).toEqual([4, 5, 0]);
  });
});

describe("lightbox · closing", () => {
  it("Escape closes and returns focus to the item that opened it", () => {
    const { root, items, panel, part } = mount();
    items[1].focus();
    click(items[1]);
    const ev = key(panel, "Escape");
    expect(ev.defaultPrevented).toBe(true);
    expect(root.dataset.state).toBe("closed");
    expect(panel.hidden).toBe(true);
    expect(part("overlay").hidden).toBe(true);
    expect(document.activeElement).toBe(items[1]);
  });

  it("the close button and the overlay close", () => {
    const { root, api, part } = mount();
    api.open(0);
    click(part("close"));
    expect(root.dataset.state).toBe("closed");
    api.open(0);
    click(part("overlay"));
    expect(root.dataset.state).toBe("closed");
  });

  it("a tap on the bare stage closes; a tap on the picture does not", () => {
    const { root, api, stage, image } = mount();
    api.open(0);
    image.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: 10, clientY: 10 }));
    image.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, clientX: 10, clientY: 10 }));
    click(image);
    expect(root.dataset.state).toBe("open");
    stage.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: 10, clientY: 10 }));
    stage.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, clientX: 10, clientY: 10 }));
    click(stage);
    expect(root.dataset.state).toBe("closed");
  });
});

describe("lightbox · navigation", () => {
  it("arrows move through the set and wrap; Home and End jump", () => {
    const { api, panel, part } = mount();
    api.open(0);
    key(panel, "ArrowRight");
    expect(part("counter").textContent).toBe("2 / 6");
    key(panel, "ArrowLeft");
    key(panel, "ArrowLeft");
    expect(part("counter").textContent).toBe("6 / 6");
    key(panel, "Home");
    expect(part("counter").textContent).toBe("1 / 6");
    key(panel, "End");
    expect(part("counter").textContent).toBe("6 / 6");
  });

  it("the prev and next buttons navigate", () => {
    const { api, part } = mount();
    api.open(3);
    click(part("next"));
    expect(part("counter").textContent).toBe("5 / 6");
    click(part("prev"));
    click(part("prev"));
    expect(part("counter").textContent).toBe("3 / 6");
  });

  it("a horizontal swipe at 1× moves to the next or previous picture", () => {
    const { api, stage, part } = mount();
    api.open(0);
    stage.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: 300, clientY: 200 }));
    stage.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: 200, clientY: 205 }));
    stage.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, clientX: 200, clientY: 205 }));
    expect(part("counter").textContent).toBe("2 / 6");
    stage.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: 100, clientY: 200 }));
    stage.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, clientX: 260, clientY: 200 }));
    expect(part("counter").textContent).toBe("1 / 6");
  });

  it("a single picture hides prev and next", () => {
    const one = REF.replace(/<li>[^]*?<\/li>/g, (li, offset: number) => (offset === REF.indexOf("<li>") ? li : ""));
    const { api, part } = mount(one);
    api.open();
    expect(part("prev").hidden).toBe(true);
    expect(part("next").hidden).toBe(true);
    expect(part("counter").textContent).toBe("1 / 1");
  });
});

describe("lightbox · zoom and pan", () => {
  it("the buttons and + − 0 zoom in half steps between 1× and 4×, with aria-disabled at the limits", () => {
    const { api, panel, part, image } = mount();
    api.open(0);
    expect(part("zoom-out").getAttribute("aria-disabled")).toBe("true");
    click(part("zoom-in"));
    expect(zoomOf(panel)).toBe(1.5);
    expect(image.dataset.state).toBe("zoomed");
    expect(part("zoom-out").getAttribute("aria-disabled")).toBe("false");
    for (let i = 0; i < 8; i++) key(panel, "+");
    expect(zoomOf(panel)).toBe(4);
    expect(part("zoom-in").getAttribute("aria-disabled")).toBe("true");
    key(panel, "-");
    expect(zoomOf(panel)).toBe(3.5);
    key(panel, "0");
    expect(zoomOf(panel)).toBe(1);
    expect(image.dataset.state).toBeUndefined();
  });

  it("the wheel zooms around the pointer and a double-click toggles 2.5×", () => {
    const { api, panel, stage, image } = mount();
    api.open(0);
    const wheel = new WheelEvent("wheel", { deltaY: -500, bubbles: true, cancelable: true });
    stage.dispatchEvent(wheel);
    expect(wheel.defaultPrevented).toBe(true);
    expect(zoomOf(panel)).toBeCloseTo(Math.E, 3);
    key(panel, "0");
    image.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    expect(zoomOf(panel)).toBe(2.5);
    image.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    expect(zoomOf(panel)).toBe(1);
  });

  it("a zoomed picture pans by drag and by arrows, never past its own edges", () => {
    const { api, panel, stage, image } = mount();
    Object.defineProperty(image, "offsetWidth", { configurable: true, value: 400 });
    Object.defineProperty(image, "offsetHeight", { configurable: true, value: 300 });
    Object.defineProperty(stage, "clientWidth", { configurable: true, value: 500 });
    Object.defineProperty(stage, "clientHeight", { configurable: true, value: 400 });
    api.open(0);
    api.zoomIn();
    api.zoomIn(); // 2× → 800×600 over a 500×400 stage: ±150 by ±100
    const px = () => [parseFloat(panel.style.getPropertyValue("--lightbox-x")), parseFloat(panel.style.getPropertyValue("--lightbox-y"))];
    stage.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: 100, clientY: 100 }));
    stage.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: 160, clientY: 140 }));
    expect(px()).toEqual([60, 40]);
    stage.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: 900, clientY: 900 }));
    expect(px()).toEqual([150, 100]);
    stage.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, clientX: 900, clientY: 900 }));
    // Zoomed, the arrows pan (a tenth of the stage) instead of navigating.
    key(panel, "ArrowRight");
    key(panel, "ArrowDown");
    expect(px()).toEqual([100, 50]);
    expect(api).toBeDefined();
  });

  it("moving to another picture resets the zoom", () => {
    const { api, panel } = mount();
    api.open(0);
    api.zoomIn();
    api.next();
    expect(zoomOf(panel)).toBe(1);
  });
});

describe("lightbox · lifecycle", () => {
  it("prevents double initialization", () => {
    const { root, api } = mount();
    expect(createLightbox(root)).toBe(api);
  });

  it("destroy closes the viewer and removes every listener", () => {
    const { root, api, items, panel } = mount();
    api.open(1);
    api.destroy();
    expect(root.dataset.state).toBe("closed");
    expect(panel.hidden).toBe(true);
    expect(click(items[0]).defaultPrevented).toBe(false);
    expect(root.dataset.state).toBe("closed");
    expect((root as any)._faqirLightbox).toBeUndefined();
  });
});

describe("lightbox · items outside the root", () => {
  it("opens from a [data-open] link elsewhere on the page and counts it in the gallery", () => {
    const outside = document.createElement("div");
    outside.innerHTML = `<a data-open="lb-external" href="data:image/gif;base64,R0lGODlhAQABAAAAACw=" title="Harbour at dusk"><img alt="A harbour" src="data:image/gif;base64,R0lGODlhAQABAAAAACw="></a>`;
    document.body.appendChild(outside);
    try {
      box = document.createElement("div");
      box.innerHTML = REF.replace('data-ui="lightbox"', 'data-ui="lightbox" id="lb-external"');
      document.body.appendChild(box);
      const root = box.querySelector<HTMLElement>('[data-ui="lightbox"]')!;
      const own = root.querySelectorAll('[data-part="item"]').length;
      createLightbox(root);
      click(outside.querySelector("a")!);
      const panel = root.querySelector<HTMLElement>('[data-part="panel"]')!;
      expect(panel.hidden).toBe(false);
      expect(root.querySelector('[data-part="counter"]')!.textContent).toBe(`${own + 1} / ${own + 1}`);
      expect(root.querySelector('[data-part="caption"]')!.textContent).toBe("Harbour at dusk");
    } finally {
      outside.remove();
    }
  });
});
