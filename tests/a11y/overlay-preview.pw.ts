/**
 * Forced-open overlay previews — task 0.9-05 (FAQIR-PLAN §15).
 *
 * Eight recipes documented themselves with a lone trigger and nothing else: the
 * panel is `hidden` until a controller opens it, so `dialog`'s contract page —
 * the flagship recipe — rendered four buttons and no dialog. That is also how
 * `dialog.css` shipped with no `[data-part="trigger"]` rule at all for as long
 * as it did: nobody could see the page was wrong, because the page showed
 * nothing to be wrong about.
 *
 * `OVERLAY_PREVIEW_SURFACES` forces those surfaces open on the example page,
 * from the site stylesheet only. This spec is the half that a static assertion
 * cannot make — that the panel really lays out, in a real browser, and that
 * doing so costs nothing in accessibility:
 *
 *  • every declared surface has a real box, opaque and in flow;
 *  • no page gains horizontal overflow (the panels are `position: fixed` and
 *    viewport-sized until this stylesheet puts them back in the column);
 *  • each page is axe-clean in BOTH colour schemes — a revealed panel is
 *    suddenly in the accessibility tree and in the contrast computation, and
 *    both are scheme-sensitive;
 *  • the landmark placement 0.7-13 built still holds: overlay markup is mounted
 *    beside `<main>`, and forcing a panel open must not move it inside.
 *
 * The site is built in-process and served from memory — no dependency on
 * `site/dist` being fresh, and no network.
 *
 * Run:   npx playwright test --config=playwright.a11y.config.ts
 */

import { test, expect } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import {
  buildDocsSite,
  isExamplePage,
  OVERLAY_PREVIEW_SURFACES,
  OVERLAY_PREVIEW_ATTR,
} from "../../src/generator/docs";
import { WCAG_TAGS } from "./axe-config";
import { formatViolations } from "./report";
import type { AxeViolation } from "./axe-types";

const SCHEMES = ["light", "dark"] as const;

const files = buildDocsSite();
/** Every example page carrying the preview attribute, paired with its surfaces. */
const previewed = files
  .filter((f) => isExamplePage(f.path) && f.content.includes(`${OVERLAY_PREVIEW_ATTR}="`))
  .map((f) => {
    const name = /data-docs-overlay="([^"]+)"/.exec(f.content)![1];
    return { path: f.path, name, surfaces: OVERLAY_PREVIEW_SURFACES[name] };
  });

let root = "";
let server: Server | null = null;
let origin = "";

test.beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), "faqir-overlay-preview-"));
  for (const f of files) {
    const abs = join(root, f.path);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, f.content);
  }
  server = createServer((req, res) => {
    const path =
      decodeURIComponent(new URL(req.url ?? "/", "http://localhost").pathname).replace(/^\//, "") ||
      "index.html";
    const abs = join(root, path);
    if (!abs.startsWith(root)) {
      res.writeHead(403).end();
      return;
    }
    try {
      const body = readFileSync(abs);
      const type = path.endsWith(".css")
        ? "text/css"
        : path.endsWith(".js")
          ? "text/javascript"
          : "text/html; charset=utf-8";
      res.writeHead(200, { "content-type": type }).end(body);
    } catch {
      res.writeHead(404).end("not found");
    }
  });
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server!.address() as { port: number }).port}`;
});

test.afterAll(async () => {
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  if (root) rmSync(root, { recursive: true, force: true });
});

// Tripwire: a generator that stopped emitting the attribute must fail loudly,
// not report "0 tests, all green".
test("the site ships a forced-open preview for every declared component", () => {
  expect(previewed.length).toBe(Object.keys(OVERLAY_PREVIEW_SURFACES).length);
  expect(previewed.every((p) => p.surfaces && p.surfaces.length > 0)).toBe(true);
});

for (const { path, name, surfaces } of previewed) {
  /** Did the generator mount this fragment outside `<main>`? Read off the page. */
  const besideMain = files
    .find((f) => f.path === path)!
    .content.includes("Overlay markup is mounted outside the main landmark");

  test(`renders__${name}`, async ({ page }) => {
    await page.goto(`${origin}/${path}`, { waitUntil: "load" });

    for (const { part, display } of surfaces) {
      const measured = await page.evaluate(
        (selector) => {
          const el = document.querySelector(selector);
          if (!el) return null;
          const rect = el.getBoundingClientRect();
          const style = getComputedStyle(el);
          const main = document.querySelector("main");
          return {
            width: rect.width,
            height: rect.height,
            display: style.display,
            opacity: Number(style.opacity),
            visibility: style.visibility,
            insideMain: main !== null && main.contains(el),
          };
        },
        `[data-part="${part}"][hidden]`,
      );

      expect(measured, `${name}: no [data-part="${part}"][hidden] on the page`).not.toBeNull();
      // A visible panel, not merely a present one: the whole defect was a page
      // that parsed correctly and showed nothing.
      expect(measured!.width, `${name}/${part} has no width`).toBeGreaterThan(50);
      expect(measured!.height, `${name}/${part} has no height`).toBeGreaterThan(20);
      expect(measured!.opacity).toBe(1);
      expect(measured!.visibility).toBe("visible");
      // The display the table records is the one the browser resolves — a flex
      // column relaid out as a block is the failure this pins.
      expect(measured!.display).toBe(display);
      // 0.7-13's landmark placement, unmoved. The generator mounts a fragment
      // carrying dialog-class markup BESIDE `<main>` (the `landmark` rule wants
      // overlays out of the content flow) and everything else inside it; a
      // forced-open panel must not change which side it landed on. Asserted
      // against the page's own mount decision rather than a per-component list.
      expect(measured!.insideMain, `${name}/${part} changed which side of <main> it is on`).toBe(
        !besideMain,
      );
    }

    // The panels are viewport-sized while fixed; back in the column they must fit
    // it. A page that scrolls sideways is the bleed condition of 0.9-01.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `${name} overflows horizontally by ${overflow}px`).toBeLessThanOrEqual(0);
  });

  for (const scheme of SCHEMES) {
    test(`axe__${name}__${scheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(`${origin}/${path}`, { waitUntil: "load" });
      await page.evaluate((s) => document.documentElement.setAttribute("data-theme", s), scheme);

      const results = await new AxeBuilder({ page }).withTags([...WCAG_TAGS]).analyze();
      const violations = results.violations as AxeViolation[];
      expect(
        violations.length,
        violations.length === 0 ? "" : formatViolations(`${path} · ${scheme}`, violations),
      ).toBe(0);
    });
  }
}
