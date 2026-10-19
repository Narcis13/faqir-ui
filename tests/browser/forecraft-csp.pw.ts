/**
 * The strict-CSP engine under a real `script-src 'self'` policy.  [forecraft #50]
 *
 * The page is served (through `page.route`, so no server is needed) with the
 * header `Content-Security-Policy: script-src 'self'` — no `'unsafe-eval'`, no
 * `'unsafe-inline'`. It loads `faqir-core.csp.js` as an external script and runs
 * the progress, qr-code and dialog reference fragments plus a block of
 * directives that drives them, and asserts that the browser reported **zero**
 * `securitypolicyviolation` events and zero console errors or warnings.
 *
 * The control case serves the default `faqir-core.js` under the same policy
 * and expects the `eval` violation, which is what proves the listener can see
 * one: without it, "zero violations" would also be the result of a probe that
 * never fired.
 *
 * Run: `npx playwright test --config=playwright.browser.config.ts forecraft-csp`
 */

import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, REGISTRY, frameworkCss, sanitizeFragment } from "../visual/matrix";

const ORIGIN = "https://faqir-csp.test";
const POLICY = "script-src 'self'";

// Loaded first, as a same-origin script (inline would itself be a violation):
// records every violation the document reports, from before the engine runs.
const PROBE = `window.__violations = [];
document.addEventListener('securitypolicyviolation', function (e) {
  window.__violations.push(e.violatedDirective + ' ' + e.blockedURI + ' ' + (e.sample || ''));
});`;

const fragment = (rel: string) => sanitizeFragment(readFileSync(join(ROOT, rel), "utf8"));

// The directives that make the scaffolds move, written the way the docs write
// them: magics, a method with a block body, a template literal, an arrow.
const DRIVER = `
<section id="driver" l-data="{ pct: 40, opened: 0, log: [],
                               bump(by) { if (this.pct + by > 100) { this.pct = 100; return } this.pct += by } }">
  <div id="live-progress" data-ui="progress" role="progressbar" aria-label="Live progress"
       :data-value="pct" :aria-valuenow="pct" aria-valuemin="0" aria-valuemax="100">
    <div data-part="track"><div data-part="fill" :style="\`width: \${pct}%\`"></div></div>
    <span data-part="label" l-text="pct + '%'"></span>
  </div>
  <button id="bump" @click="bump(25); log.push($event.type)">More</button>
  <button id="open-dialog" @click="$ui('#demo-dialog').open(); opened++">Open the dialog</button>
  <p id="summary" l-text="\`\${opened} open(s), \${log.filter(t => t === 'click').length} click(s)\`"></p>
</section>`;

function page(engineFile: string): string {
  return `<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
<meta charset="UTF-8">
<title>faqir strict CSP</title>
<script src="/probe.js"></script>
<style>${frameworkCss("default")}</style>
</head>
<body>
<main>
${fragment("registry/primitives/progress/progress.html")}
${fragment("registry/recipes/qr-code/qr-code.html")}
${fragment("registry/recipes/dialog/dialog.html")}
${DRIVER}
</main>
<script src="/${engineFile}"></script>
</body>
</html>`;
}

async function serve(p: Page, engineFile: string) {
  await p.route(`${ORIGIN}/**`, (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/") {
      return route.fulfill({
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8", "content-security-policy": POLICY },
        body: page(engineFile),
      });
    }
    if (path === "/probe.js") {
      return route.fulfill({ status: 200, contentType: "text/javascript", body: PROBE });
    }
    if (path === `/${engineFile}`) {
      return route.fulfill({
        status: 200,
        contentType: "text/javascript",
        body: readFileSync(join(REGISTRY, "core", engineFile), "utf8"),
      });
    }
    return route.fulfill({ status: 404, body: "" });
  });
}

function collect(p: Page): string[] {
  const out: string[] = [];
  p.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") out.push(`[${m.type()}] ${m.text()}`);
  });
  p.on("pageerror", (e) => out.push(`[pageerror] ${e.message}`));
  return out;
}

test.describe("strict-CSP engine under script-src 'self'", () => {
  test("runs progress, qr-code and dialog with zero CSP violations", async ({ page: p }) => {
    const diagnostics = collect(p);
    await serve(p, "faqir-core.csp.js");
    const response = await p.goto(`${ORIGIN}/`);
    expect(response!.headers()["content-security-policy"]).toBe(POLICY);
    await p.waitForFunction(() => !!(window as any).Faqir);

    // l-text and :bind ran at all — the failure mode without eval is silence.
    await expect(p.locator("#live-progress [data-part=label]")).toHaveText("40%");
    await expect(p.locator("#live-progress")).toHaveAttribute("aria-valuenow", "40");
    await expect(p.locator("#summary")).toHaveText("0 open(s), 0 click(s)");

    // qr-code: every instance rendered its symbol.
    const qr = p.locator('[data-ui="qr-code"]');
    const count = await qr.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) await expect(qr.nth(i).locator("svg")).toHaveCount(1);

    // A method with a block body and an early return, then a clamp. Clicks are
    // dispatched DOM events: what is under test is the handler expression, and
    // a pointer click's actionability wait adds nothing here but a dependency
    // on the host's compositor (it stalls in headless WSL).
    await p.locator("#bump").dispatchEvent("click");
    await expect(p.locator("#live-progress [data-part=label]")).toHaveText("65%");
    await p.locator("#bump").dispatchEvent("click");
    await p.locator("#bump").dispatchEvent("click");
    await expect(p.locator("#live-progress [data-part=label]")).toHaveText("100%");
    await expect(p.locator("#live-progress [data-part=fill]")).toHaveAttribute("style", /width: 100%/);

    // $ui reaching another component's controller: the dialog opens…
    await p.locator("#open-dialog").dispatchEvent("click");
    await expect(p.locator("#demo-dialog")).toHaveAttribute("data-state", "open");
    await expect(p.locator("#summary")).toHaveText("1 open(s), 3 click(s)");
    // …and its own controller closes it.
    await p.locator("#demo-dialog [data-part=header] [data-part=close]").dispatchEvent("click");
    await expect(p.locator("#demo-dialog")).toHaveAttribute("data-state", "closed");

    const violations = await p.evaluate(() => (window as any).__violations);
    expect(violations).toEqual([]);
    expect(diagnostics).toEqual([]);
  });

  test("control: the default engine under the same policy is refused eval", async ({ page: p }) => {
    collect(p);
    await serve(p, "faqir-core.js");
    await p.goto(`${ORIGIN}/`);
    await p.waitForFunction(() => !!(window as any).Faqir);
    await expect
      .poll(() => p.evaluate(() => (window as any).__violations.length))
      .toBeGreaterThan(0);
    const violations: string[] = await p.evaluate(() => (window as any).__violations);
    expect(violations.some((v) => v.startsWith("script-src") && v.includes("eval"))).toBe(true);
    // …and, as docs/security.md describes, l-text silently renders nothing.
    await expect(p.locator("#live-progress [data-part=label]")).toHaveText("");
  });
});
