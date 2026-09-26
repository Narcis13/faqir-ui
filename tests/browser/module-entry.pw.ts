/**
 * The engine loaded as a module — the way a Vite / bundler project loads it.
 *
 * Two defects only a real module loader shows:
 *
 *   • the engine booted during its own evaluation whenever the document was
 *     already parsed (always, for a module), so a `Faqir.data()` registered on
 *     the line after the `import` was never seen and its `l-data` bound to
 *     nothing; and `data-manual` was read off `document.currentScript`, which a
 *     module does not have;
 *   • `ui/core/` shipped only the UMD engine, which exports nothing when served
 *     raw — `core/faqir-core.mjs` is the entry that works raw and bundled.
 */

import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { REGISTRY } from "../visual/matrix";

const ORIGIN = "http://faqir.test";

async function serve(page: Page, html: string) {
  await page.route(`${ORIGIN}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/") return route.fulfill({ contentType: "text/html", body: html });
    if (path.startsWith("/core/")) {
      return route.fulfill({
        contentType: "application/javascript",
        body: readFileSync(join(REGISTRY, "core", path.slice("/core/".length)), "utf8"),
      });
    }
    return route.fulfill({ status: 404, body: "" });
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${ORIGIN}/`);
  return errors;
}

const COUNTER = `
  <div l-data="counter">
    <button id="inc" @click="n++">+</button>
    <output id="out" l-text="n"></output>
  </div>`;

test("a data factory registered right after importing the module entry is bound", async ({ page }) => {
  const errors = await serve(page, `<!DOCTYPE html><html><body>${COUNTER}
    <script type="module">
      import Faqir, { version } from "/core/faqir-core.mjs";
      Faqir.data("counter", () => ({ n: 1 }));
      window.__esm = { version, sameGlobal: window.Faqir === Faqir };
    </script></body></html>`);

  await expect(page.locator("#out")).toHaveText("1");
  await page.locator("#inc").click();
  await expect(page.locator("#out")).toHaveText("2");
  const esm = await page.evaluate(() => (window as any).__esm);
  expect(esm.sameGlobal).toBe(true);
  expect(typeof esm.version).toBe("string");
  expect(errors).toEqual([]);
});

test("data-manual on the module script defers boot to Faqir.start()", async ({ page }) => {
  const errors = await serve(page, `<!DOCTYPE html><html><body>${COUNTER}
    <script type="module" data-manual>
      import Faqir from "/core/faqir-core.mjs";
      window.__start = () => {
        Faqir.data("counter", () => ({ n: 10 }));
        Faqir.start();
      };
    </script></body></html>`);

  await page.waitForFunction(() => typeof (window as any).__start === "function");
  // Give an auto-start every chance to have (wrongly) happened.
  await page.waitForTimeout(50);
  await expect(page.locator("#out")).toHaveText("");
  await page.evaluate(() => (window as any).__start());
  await expect(page.locator("#out")).toHaveText("10");
  expect(errors).toEqual([]);
});
