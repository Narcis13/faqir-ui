import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import { createRequire } from "node:module";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Task 0.3-04 · every recipe auto-initializes from the *built* faqir-core.js.
// Loading the shipped artifact and dropping a component's canonical markup into
// the page must attach its controller — no manual wiring. qr-code, which was
// never inlined into the old hand-maintained core, must now behave like the rest.

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
const RECIPES_DIR = join(ROOT, "registry", "recipes");
const BUILT_CORE = join(ROOT, "registry", "core", "faqir-core.js");

type Recipe = { name: string; prop: string };

/**
 * Discover recipes from disk and read each controller's private handle
 * (`root._faqir…`) straight from source, so the smoke tests stay in sync with the
 * recipes automatically rather than hard-coding a list that can rot.
 */
function discoverRecipes(): Recipe[] {
  const out: Recipe[] = [];
  for (const dir of readdirSync(RECIPES_DIR).sort()) {
    const abs = join(RECIPES_DIR, dir);
    if (!statSync(abs).isDirectory()) continue;
    let src: string;
    try {
      src = readFileSync(join(abs, `${dir}.js`), "utf8");
    } catch {
      continue;
    }
    if (!/@ui:controller\s+/.test(src)) continue;
    const propM = src.match(/root\.(_faqir[A-Za-z]+)\s*=/);
    out.push({ name: dir, prop: propM ? propM[1] : "" });
  }
  return out;
}

const RECIPES = discoverRecipes();

// The built core is a UMD bundle: required as CommonJS it returns the Faqir API.
// happy-dom provides `document`, so requiring it auto-bootstraps once; we still
// call Faqir.start() per test to init freshly-injected markup synchronously.
const require = createRequire(import.meta.url);
let Faqir: any;
beforeAll(() => {
  Faqir = require(BUILT_CORE);
});

afterEach(() => {
  document.body.innerHTML = "";
});

/** Was a recipe controller attached to `el`? Its factory sets `_faqir<Name>`. */
function controllerAttached(el: Element): boolean {
  return Object.keys(el).some((k) => /^_faqir[A-Z]/.test(k));
}

describe("recipe auto-init from built faqir-core.js", () => {
  test("loads as a UMD module exposing the engine API", () => {
    expect(typeof Faqir).toBe("object");
    expect(typeof Faqir.start).toBe("function");
    expect(Faqir.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  test("exactly 22 recipe controllers are present", () => {
    expect(RECIPES.length).toBe(22);
  });

  // One smoke test per recipe: canonical markup in → controller attached.
  for (const { name, prop } of RECIPES) {
    test(`${name}: element present → controller attached`, () => {
      const html = readFileSync(join(RECIPES_DIR, name, `${name}.html`), "utf8");
      document.body.innerHTML = html;
      Faqir.start();

      const el = document.querySelector(`[data-ui="${name}"]`);
      expect(el).not.toBeNull();
      // Generic signal every controller emits …
      expect(controllerAttached(el!)).toBe(true);
      // … and the specific private handle this recipe declares.
      if (prop) expect((el as any)[prop]).toBeDefined();
    });
  }
});

describe("barcode auto-init (built core)", () => {
  test('data-ui="barcode" initializes and renders Code 128 bars from the built core', () => {
    document.body.innerHTML = `<div data-ui="barcode" data-value="INV-0042" role="img" aria-label="Barcode"></div>`;
    Faqir.start();

    const el = document.querySelector('[data-ui="barcode"]')!;
    expect(controllerAttached(el)).toBe(true);
    expect((el as any)._faqirBarcode).toBeDefined();
    expect(el.getAttribute("data-state")).toBe("ready");
    expect(el.querySelector("[data-part='svg'] path")).not.toBeNull();
  });
});

describe("qr-code auto-init (built core)", () => {
  test('data-ui="qr-code" initializes and renders its SVG from the built core', () => {
    document.body.innerHTML = `<div data-ui="qr-code" data-value="https://faqir.dev/INV-0042"></div>`;
    Faqir.start();

    const el = document.querySelector('[data-ui="qr-code"]')!;
    // Behaves like every other recipe: controller attached on init.
    expect(controllerAttached(el)).toBe(true);
    expect((el as any)._faqirQR).toBeDefined();

    // And it did real work — encoded the value into an SVG module matrix.
    const svg = el.querySelector("[data-part='svg']");
    expect(svg).not.toBeNull();
    expect(svg!.tagName.toLowerCase()).toBe("svg");
    expect(svg!.querySelector("path")).not.toBeNull();
  });

  test("qr-code re-renders when data-value changes (live like other recipes)", async () => {
    document.body.innerHTML = `<div data-ui="qr-code" data-value="A"></div>`;
    Faqir.start();
    const el = document.querySelector('[data-ui="qr-code"]')!;
    const firstPath = el.querySelector("[data-part='svg'] path")!.getAttribute("d");

    el.setAttribute("data-value", "a-much-longer-value-forcing-a-different-matrix");
    // The controller observes attribute mutations; give the observer a tick.
    await new Promise((r) => setTimeout(r, 0));

    const nextPath = el.querySelector("[data-part='svg'] path")!.getAttribute("d");
    expect(nextPath).not.toBe(firstPath);
  });
});
