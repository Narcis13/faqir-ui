/**
 * Documentation-site accessibility suite — task 0.7-13 (FAQIR-PLAN §13).
 *
 * The docs site is built from registry components and design tokens only, so it
 * is the framework's own accessibility claim rendered as 86 real pages. This
 * spec builds the site, serves it from a plain static file server (no rewrites,
 * no framework, no dev middleware — the same thing a CDN does), and runs one
 * axe-core WCAG 2.0/2.1 A/AA scan per page per colour scheme. Zero-violation
 * policy: any violation fails the case, naming the page, the rule and the
 * offending selector.
 *
 * **Scope.** Only the pages the *generator authors* are scanned. `examples/**`
 * pages wrap a registry reference fragment verbatim; that markup is already
 * scanned case-by-case by the registry a11y matrix (task 0.4-24) — where its
 * one known failure is tracked — and re-scanning it here would duplicate that
 * gate rather than test the site. `tests/generator/docs-site.test.ts` asserts
 * that claim two ways: every example page's body IS its registry fragment, and
 * every example page's component is present in the registry a11y matrix.
 *
 * Run:   npx playwright test --config=playwright.a11y.config.ts
 *        npm run test:a11y
 */

import { test, expect } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { buildDocsSite, isSitePage } from "../../src/generator/docs";
import { WCAG_TAGS } from "./axe-config";
import { formatViolations } from "./report";
import type { AxeViolation } from "./axe-types";

const SCHEMES = ["light", "dark"] as const;

const files = buildDocsSite();
const pages = files.filter((f) => isSitePage(f.path)).map((f) => f.path);

let root = "";
let server: Server | null = null;
let origin = "";

test.beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), "faqir-docs-a11y-"));
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

// Tripwire: a generator that silently stopped emitting pages must fail loudly,
// not report "0 tests, all green".
test("docs site produced pages to scan", () => {
  expect(pages.length).toBeGreaterThan(50);
});

for (const path of pages) {
  for (const scheme of SCHEMES) {
    test(`docs__${path.replace(/[/.]/g, "_")}__${scheme}`, async ({ page }) => {
      await page.goto(`${origin}/${path}`, { waitUntil: "load" });
      // Freeze transitions BEFORE flipping the scheme. Nav items and controls
      // transition `color`/`background`, so a scan started right after the swap
      // samples half-interpolated pairs (light text already over dark chrome) and
      // reports contrast failures that never exist on a real page load.
      await page.addStyleTag({
        content: "*, *::before, *::after { transition: none !important; animation: none !important; }",
      });
      // The scheme axis is driven by `data-theme` on <html>, exactly as the
      // component matrix drives it — the site ships one theme with both schemes.
      await page.evaluate((s) => document.documentElement.setAttribute("data-theme", s), scheme);
      await page.evaluate(() => document.fonts.ready);

      const results = await new AxeBuilder({ page })
        .withTags([...WCAG_TAGS])
        // The live-example frame holds verbatim registry markup, scanned by the
        // registry a11y matrix (0.4-24). Excluding it keeps this gate about the
        // site's own pages instead of duplicating that one.
        .exclude("iframe")
        .analyze();
      const violations = results.violations as unknown as AxeViolation[];

      const report = violations.length ? formatViolations(`${path} · ${scheme}`, violations) : "";
      expect(report, `Accessibility violations on ${path} (${scheme})`).toBe("");
    });
  }
}
