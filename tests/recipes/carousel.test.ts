// ═══════════════════════════════════════════════════════════════════════════
// carousel — controller contract  [task 0.7-07]
// ═══════════════════════════════════════════════════════════════════════════
//
// CSS scroll-snap does the sliding. The controller only adds prev/next buttons,
// dot indicators, current-slide tracking (scroll math), the polite live region
// and the loop-or-stop boundary contract — so these tests are mostly about
// *scroll targets*, not animation.
//
// happy-dom performs no layout, so every test stubs the geometry the controller
// measures: a viewport at x=0 of `WIDTH` px and slide i occupying
// [i*WIDTH, (i+1)*WIDTH] in content coordinates, shifted by the current
// scrollLeft. That is exactly the arithmetic a browser hands the controller.

import { describe, it, expect, afterEach } from "bun:test";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createCarousel } from "../../registry/recipes/carousel/carousel.js";

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
const RECIPE_DIR = join(ROOT, "registry", "recipes", "carousel");

const WIDTH = 300;
const mounted: Array<{ destroy: () => void }> = [];
const origMatchMedia = (globalThis as any).window?.matchMedia;

type ScrollCall = { left: number; behavior: string };

interface Harness {
  root: HTMLElement;
  viewport: HTMLElement;
  api: ReturnType<typeof createCarousel>;
  calls: ScrollCall[];
  slides: () => HTMLElement[];
  dots: () => HTMLButtonElement[];
  prev: HTMLButtonElement;
  next: HTMLButtonElement;
  status: HTMLElement;
  /** Simulate the reader scrolling the strip themselves. */
  scrollTo: (left: number) => void;
}

function markup(count: number, loop: boolean): string {
  const slides = Array.from(
    { length: count },
    (_, i) =>
      `<div data-part="slide" role="group" aria-roledescription="slide" aria-label="${i + 1} of ${count}">S${i + 1}</div>`,
  ).join("");
  const dots = Array.from(
    { length: count },
    (_, i) => `<button data-part="dot" type="button" aria-label="Slide ${i + 1}"></button>`,
  ).join("");
  return `
    <div data-ui="carousel"${loop ? " data-loop" : ""} role="group" aria-roledescription="carousel" aria-label="Test">
      <div data-part="viewport" tabindex="0" role="group" aria-label="Slides">${slides}</div>
      <div data-part="controls" hidden>
        <button data-part="prev" type="button" aria-label="Previous slide">&laquo;</button>
        <button data-part="next" type="button" aria-label="Next slide">&raquo;</button>
      </div>
      <div data-part="dots" role="group" aria-label="Choose slide" hidden>${dots}</div>
      <p data-part="status" role="status" aria-live="polite"></p>
    </div>`;
}

/** Give an element a fixed horizontal rect (happy-dom lays nothing out). */
function stubRect(el: Element, left: () => number, right: () => number): void {
  (el as any).getBoundingClientRect = () =>
    ({ left: left(), right: right(), top: 0, bottom: 0, width: right() - left(), height: 0 }) as DOMRect;
}

function mount({ count = 3, loop = false, init = true } = {}): Harness {
  document.body.innerHTML = markup(count, loop);
  const root = document.querySelector("[data-ui='carousel']") as HTMLElement;
  const viewport = root.querySelector("[data-part='viewport']") as HTMLElement;

  let scrollLeft = 0;
  Object.defineProperty(viewport, "scrollLeft", {
    configurable: true,
    get: () => scrollLeft,
    set: (v: number) => {
      scrollLeft = v;
    },
  });

  stubRect(viewport, () => 0, () => WIDTH);
  const slides = () => [...root.querySelectorAll("[data-part='slide']")] as HTMLElement[];
  slides().forEach((s, i) => {
    stubRect(s, () => i * WIDTH - scrollLeft, () => (i + 1) * WIDTH - scrollLeft);
  });

  const calls: ScrollCall[] = [];
  (viewport as any).scrollTo = (opts: ScrollCall) => {
    calls.push(opts);
    // A real smooth scroll settles asynchronously; landing immediately keeps the
    // geometry consistent for the next assertion without changing the contract.
    scrollLeft = opts.left;
  };

  const api = init ? createCarousel(root) : (null as any);
  if (api) mounted.push(api);

  return {
    root,
    viewport,
    api,
    calls,
    slides,
    dots: () => [...root.querySelectorAll("[data-part='dot']")] as HTMLButtonElement[],
    prev: root.querySelector("[data-part='prev']") as HTMLButtonElement,
    next: root.querySelector("[data-part='next']") as HTMLButtonElement,
    status: root.querySelector("[data-part='status']") as HTMLElement,
    scrollTo: (left: number) => {
      scrollLeft = left;
      viewport.dispatchEvent(new Event("scroll"));
    },
  };
}

const click = (el: Element) => el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
/** The controller throttles scroll tracking through rAF. */
const settle = () => new Promise((r) => setTimeout(r, 30));

describe("carousel controller", () => {
  afterEach(() => {
    while (mounted.length) mounted.pop()!.destroy();
    document.body.innerHTML = "";
    if (origMatchMedia) (window as any).matchMedia = origMatchMedia;
  });

  // ── button navigation → scroll targets ──────────────────────────────────────
  it("the next button scrolls to the next slide's offset", () => {
    const c = mount();
    click(c.next);
    expect(c.calls).toEqual([{ left: WIDTH, behavior: "smooth" }]);
    expect(c.api.getIndex()).toBe(1);

    click(c.next);
    expect(c.calls[1]).toEqual({ left: 2 * WIDTH, behavior: "smooth" });
    expect(c.api.getIndex()).toBe(2);
  });

  it("the prev button scrolls back to the previous slide's offset", () => {
    const c = mount();
    c.api.goTo(2);
    expect(c.calls.at(-1)).toEqual({ left: 2 * WIDTH, behavior: "smooth" });

    click(c.prev);
    expect(c.calls.at(-1)).toEqual({ left: WIDTH, behavior: "smooth" });
    expect(c.api.getIndex()).toBe(1);
  });

  it("goTo() scrolls to an arbitrary slide", () => {
    const c = mount({ count: 5 });
    c.api.goTo(3);
    expect(c.calls.at(-1)!.left).toBe(3 * WIDTH);
    expect(c.api.getIndex()).toBe(3);
    expect(c.api.getCount()).toBe(5);
  });

  it("falls back to assigning scrollLeft when scrollTo is unavailable", () => {
    const c = mount();
    (c.viewport as any).scrollTo = undefined; // shadows happy-dom's prototype method
    c.api.goTo(2);
    expect(c.viewport.scrollLeft).toBe(2 * WIDTH);
  });

  // ── dots reflect and set the current slide ──────────────────────────────────
  it("dots reflect the current slide via data-state + aria-current", () => {
    const c = mount();
    expect(c.dots().map((d) => d.dataset.state)).toEqual(["active", "inactive", "inactive"]);
    expect(c.dots().map((d) => d.getAttribute("aria-current"))).toEqual(["true", null, null]);

    c.api.next();
    expect(c.dots().map((d) => d.dataset.state)).toEqual(["inactive", "active", "inactive"]);
    expect(c.dots().map((d) => d.getAttribute("aria-current"))).toEqual([null, "true", null]);
  });

  it("clicking a dot scrolls to its slide and makes it current", () => {
    const c = mount({ count: 4 });
    click(c.dots()[2]);
    expect(c.calls.at(-1)).toEqual({ left: 2 * WIDTH, behavior: "smooth" });
    expect(c.api.getIndex()).toBe(2);
    expect(c.dots()[2].getAttribute("aria-current")).toBe("true");
  });

  // ── boundary contract ───────────────────────────────────────────────────────
  it("stop contract: prev is disabled on the first slide, next on the last", () => {
    const c = mount();
    expect(c.prev.disabled).toBe(true);
    expect(c.next.disabled).toBe(false);

    c.api.goTo(1);
    expect(c.prev.disabled).toBe(false);
    expect(c.next.disabled).toBe(false);

    c.api.goTo(2);
    expect(c.prev.disabled).toBe(false);
    expect(c.next.disabled).toBe(true);
  });

  it("stop contract: navigating past an edge clamps instead of wrapping", () => {
    const c = mount();
    c.api.prev(); // already at 0
    expect(c.api.getIndex()).toBe(0);

    c.api.goTo(2);
    c.api.next(); // already at the last slide
    expect(c.api.getIndex()).toBe(2);
    expect(c.calls.at(-1)!.left).toBe(2 * WIDTH);
  });

  it("loop contract: data-loop wraps at both edges and never disables a button", () => {
    const c = mount({ loop: true });
    expect(c.prev.disabled).toBe(false);
    expect(c.next.disabled).toBe(false);

    c.api.prev(); // 0 → last
    expect(c.api.getIndex()).toBe(2);
    expect(c.calls.at(-1)!.left).toBe(2 * WIDTH);

    c.api.next(); // last → 0
    expect(c.api.getIndex()).toBe(0);
    expect(c.calls.at(-1)!.left).toBe(0);
    expect(c.next.disabled).toBe(false);
  });

  // ── announcements ───────────────────────────────────────────────────────────
  it("the live region announces the slide position and updates on change", () => {
    const c = mount();
    expect(c.status.getAttribute("role")).toBe("status");
    expect(c.status.getAttribute("aria-live")).toBe("polite");
    expect(c.status.textContent).toBe("Slide 1 of 3");

    c.api.next();
    expect(c.status.textContent).toBe("Slide 2 of 3");

    c.api.goTo(2);
    expect(c.status.textContent).toBe("Slide 3 of 3");
  });

  // ── tracking a user-driven scroll ───────────────────────────────────────────
  it("scrolling the strip updates the current slide, dots and announcement", async () => {
    const c = mount();
    c.scrollTo(2 * WIDTH);
    await settle();

    expect(c.api.getIndex()).toBe(2);
    expect(c.status.textContent).toBe("Slide 3 of 3");
    expect(c.dots()[2].getAttribute("aria-current")).toBe("true");
    expect(c.next.disabled).toBe(true);
    // Tracking is measurement only — it must not scroll the strip itself.
    expect(c.calls).toEqual([]);
  });

  it("a partial scroll snaps tracking to the nearest slide", async () => {
    const c = mount();
    c.scrollTo(WIDTH * 0.6); // past the midpoint of slide 2
    await settle();
    expect(c.api.getIndex()).toBe(1);
  });

  it("emits faqir:change with the index and count on every change", async () => {
    const c = mount();
    const seen: any[] = [];
    c.root.addEventListener("faqir:change", (e) => seen.push((e as CustomEvent).detail));

    c.api.next();
    c.scrollTo(2 * WIDTH);
    await settle();
    c.api.goTo(2); // already there — no second event

    expect(seen).toEqual([
      { index: 1, count: 3 },
      { index: 2, count: 3 },
    ]);
  });

  // ── reduced motion ──────────────────────────────────────────────────────────
  it("reduced motion scrolls instantly instead of smoothly", () => {
    (window as any).matchMedia = (q: string) => ({
      matches: q.includes("prefers-reduced-motion"),
      media: q,
      addEventListener() {},
      removeEventListener() {},
    });
    const c = mount();
    c.api.next();
    expect(c.calls.at(-1)).toEqual({ left: WIDTH, behavior: "instant" });
  });

  it("without a reduced-motion preference the scroll is smooth", () => {
    (window as any).matchMedia = (q: string) => ({
      matches: false,
      media: q,
      addEventListener() {},
      removeEventListener() {},
    });
    const c = mount();
    c.api.next();
    expect(c.calls.at(-1)!.behavior).toBe("smooth");
  });

  // ── progressive enhancement ─────────────────────────────────────────────────
  it("controls and dots stay hidden until the controller enhances them", () => {
    const c = mount({ init: false });
    const controls = c.root.querySelector("[data-part='controls']") as HTMLElement;
    const dots = c.root.querySelector("[data-part='dots']") as HTMLElement;
    expect(controls.hidden).toBe(true);
    expect(dots.hidden).toBe(true);

    const api = createCarousel(c.root)!;
    mounted.push(api);
    expect(controls.hidden).toBe(false);
    expect(dots.hidden).toBe(false);
  });

  it("destroy() unbinds listeners and returns to the no-JS baseline", async () => {
    const c = mount();
    const controls = c.root.querySelector("[data-part='controls']") as HTMLElement;
    c.api.destroy();
    mounted.length = 0;

    expect(controls.hidden).toBe(true);
    expect((c.root as any)._faqirCarousel).toBeUndefined();

    click(c.next);
    expect(c.calls).toEqual([]);
    c.scrollTo(2 * WIDTH);
    await settle();
    expect(c.status.textContent).toBe("Slide 1 of 3"); // no longer tracking
  });

  it("prevents double initialization", () => {
    const c = mount();
    expect(createCarousel(c.root)).toBe(c.api);
  });

  it("a carousel without a viewport is a no-op", () => {
    document.body.innerHTML = `<div data-ui="carousel"></div>`;
    const root = document.querySelector("[data-ui='carousel']") as HTMLElement;
    expect(createCarousel(root)).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Registry contract — the reference page and the stated JS budget
// ═══════════════════════════════════════════════════════════════════════════

describe("carousel registry contract", () => {
  const html = readFileSync(join(RECIPE_DIR, "carousel.html"), "utf8");
  const css = readFileSync(join(RECIPE_DIR, "carousel.css"), "utf8");

  it("the reference page is a working scroll-snap strip with JS disabled", () => {
    // CSS — not the controller — does the sliding …
    expect(css).toMatch(/\[data-part="viewport"\][^{]*\{[^}]*scroll-snap-type:\s*inline mandatory/s);
    expect(css).toMatch(/\[data-part="viewport"\][^{]*\{[^}]*overflow-x:\s*auto/s);
    expect(css).toMatch(/\[data-part="slide"\][^{]*\{[^}]*scroll-snap-align:\s*start/s);
    // … and the strip is keyboard-scrollable without a controller.
    expect(html).toMatch(/data-part="viewport" tabindex="0"/);
  });

  it("the reference page ships every JS-only control `hidden`", () => {
    document.body.innerHTML = html; // no createCarousel() — the no-JS rendering
    const carousels = [...document.querySelectorAll("[data-ui='carousel']")];
    expect(carousels.length).toBeGreaterThan(0);

    for (const c of carousels) {
      // The content is all there …
      expect(c.querySelectorAll("[data-part='slide']").length).toBeGreaterThan(1);
      // … and nothing inert is offered to a reader without JavaScript.
      for (const sel of ["[data-part='controls']", "[data-part='dots']"]) {
        const el = c.querySelector(sel) as HTMLElement;
        expect(el).not.toBeNull();
        expect(el.hidden).toBe(true);
      }
    }
    document.body.innerHTML = "";
  });

  it("the reference page demonstrates both boundary contracts", () => {
    document.body.innerHTML = html;
    const carousels = [...document.querySelectorAll("[data-ui='carousel']")] as HTMLElement[];
    expect(carousels.some((c) => !c.hasAttribute("data-loop"))).toBe(true);
    expect(carousels.some((c) => c.hasAttribute("data-loop"))).toBe(true);
    document.body.innerHTML = "";
  });

  it("carousel.js stays under its stated 1.5 KB gzip budget", async () => {
    // Same measurement the size gate applies to the bundles: minify with Bun,
    // then gzip. The manifest states the budget; this pins it.
    const mod = (await import(join(ROOT, "scripts", "check-size.mjs"))) as {
      measureGzip: (t: { label: string; entry: string }) => number;
      formatBytes: (n: number) => string;
    };
    const manifest = JSON.parse(readFileSync(join(RECIPE_DIR, "carousel.manifest.json"), "utf8"));
    const budget = manifest.js_budget.gzip_bytes as number;
    expect(budget).toBe(1536);

    const gzip = mod.measureGzip({
      label: "carousel.js",
      entry: "registry/recipes/carousel/carousel.js",
    });
    expect(gzip).toBeLessThanOrEqual(budget);
  });
});
