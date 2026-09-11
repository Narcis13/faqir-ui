/**
 * `light-dark()` authoring — the one thing no static gate can decide [1.1A-06].
 *
 * `default.css` was collapsed from three colour blocks to one `:root` block of
 * `light-dark(<light>, <dark>)` declarations, and `base/reset.css` grew the
 * three rules that turn `data-theme` into the `color-scheme` that function
 * reads. Every browser-free gate in the repo now understands that form — but
 * "understands the source" is not "renders the same page": `light-dark()` is
 * resolved by the engine at used-value time, and happy-dom has no engine. A
 * migration that silently served the LIGHT side under `data-theme="dark"` would
 * pass the entire Bun suite.
 *
 * So this spec renders both stylesheets in Chromium and compares what the engine
 * computes, token by token, in every scheme the theme claims. The reference is
 * the v1.0.0 file itself, read out of git at test time rather than pasted, so it
 * cannot drift into agreement with the thing it is checking.
 *
 * Run: `npx playwright test --config=playwright.browser.config.ts light-dark`
 */

import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, REGISTRY, frameworkCss } from "../visual/matrix";
import { SPAWN_TIMEOUT } from "../helpers/spawn";

/** The migrated stylesheet, exactly as the framework sheet embeds it. */
const MIGRATED = readFileSync(join(REGISTRY, "themes", "default.css"), "utf8");

/** The three-block stylesheet 1.0 shipped. Read from git; never pasted. */
const V1_0_0 = execFileSync("git", ["show", "v1.0.0:registry/themes/default.css"], {
  cwd: ROOT,
  encoding: "utf8",
  timeout: SPAWN_TIMEOUT.QUICK,
});

const MIGRATED_CSS = frameworkCss("default");
const LEGACY_CSS = MIGRATED_CSS.replace(MIGRATED, V1_0_0);

/**
 * The tokens under comparison: every `--color-*` and `--shadow-*` the base
 * declares, derived from the stylesheets rather than listed, so a token added in
 * a later task is compared without editing this file.
 */
const TOKENS = (() => {
  const names = new Set<string>();
  for (const file of ["semantic.css", "effects.css"]) {
    const css = readFileSync(join(REGISTRY, "tokens", file), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    for (const m of css.matchAll(/--((?:color|shadow)-[\w-]+)\s*:/g)) names.add(m[1]);
  }
  return [...names].sort();
})();

type Scheme = "light" | "dark" | "auto";

/**
 * A page whose only content is one probe element per token. Each probe pins the
 * token to a property the engine must fully resolve to report — a colour token
 * to `background-color`, a shadow token to `box-shadow` — so `getComputedStyle`
 * returns the USED value, with `light-dark()` already collapsed.
 */
function probePage(themeCss: string, scheme: Scheme): string {
  const probes = TOKENS.map(
    (token) =>
      `<div data-token="${token}" style="${
        token.startsWith("shadow-") ? "box-shadow" : "background-color"
      }: var(--${token})"></div>`,
  ).join("\n");

  return `<!DOCTYPE html>
<html lang="en" data-theme="${scheme}" dir="ltr">
<head>
<meta charset="UTF-8">
<title>light-dark ${scheme}</title>
<style>${themeCss}</style>
</head>
<body>
<main>
${probes}
<button data-ui="button" data-variant="primary" id="probe-button">Primary</button>
<div data-ui="card" id="probe-card"><p>Card body</p></div>
</main>
</body>
</html>`;
}

/** token → used value, plus the page chrome a theme is actually judged by. */
async function readComputed(
  page: import("@playwright/test").Page,
  css: string,
  scheme: Scheme,
  prefers: "light" | "dark",
): Promise<Record<string, string>> {
  await page.emulateMedia({ colorScheme: prefers });
  await page.setContent(probePage(css, scheme), { waitUntil: "load" });
  return page.evaluate(() => {
    const out: Record<string, string> = {};
    for (const el of document.querySelectorAll<HTMLElement>("[data-token]")) {
      const style = getComputedStyle(el);
      const token = el.dataset.token!;
      out[token] = token.startsWith("shadow-") ? style.boxShadow : style.backgroundColor;
    }
    const html = getComputedStyle(document.documentElement);
    out["@html.background-color"] = html.backgroundColor;
    out["@html.color"] = html.color;
    out["@html.color-scheme"] = html.colorScheme;
    const button = getComputedStyle(document.getElementById("probe-button")!);
    out["@button.background-color"] = button.backgroundColor;
    out["@button.color"] = button.color;
    const card = getComputedStyle(document.getElementById("probe-card")!);
    out["@card.background-color"] = card.backgroundColor;
    out["@card.border-color"] = card.borderTopColor;
    return out;
  });
}

/** The three scheme states a dual-scheme theme claims, as the DOM expresses them. */
const CASES: Array<{ name: string; scheme: Scheme; prefers: "light" | "dark" }> = [
  { name: 'data-theme="light"', scheme: "light", prefers: "light" },
  { name: 'data-theme="dark"', scheme: "dark", prefers: "light" },
  { name: 'data-theme="auto" + prefers dark', scheme: "auto", prefers: "dark" },
  { name: 'data-theme="auto" + prefers light', scheme: "auto", prefers: "light" },
];

test.describe("light-dark() authoring renders what the three-block form rendered", () => {
  test("the reference really is the three-block file", () => {
    // Guard against the replace above silently matching nothing, which would
    // compare the migrated stylesheet with itself and pass every assertion.
    expect(V1_0_0).toContain('[data-theme="dark"]');
    expect(V1_0_0).not.toContain("light-dark(");
    expect(MIGRATED).toContain("light-dark(");
    expect(LEGACY_CSS).not.toBe(MIGRATED_CSS);
    expect(TOKENS.length).toBeGreaterThanOrEqual(36);
  });

  for (const { name, scheme, prefers } of CASES) {
    test(`${name}: every token computes to the 1.0 value`, async ({ page }) => {
      const before = await readComputed(page, LEGACY_CSS, scheme, prefers);
      const after = await readComputed(page, MIGRATED_CSS, scheme, prefers);
      expect(after).toEqual(before);
    });
  }

  test("the schemes actually differ (the comparison is not vacuous)", async ({ page }) => {
    // Four identical readings would satisfy every assertion above. They must not
    // be identical: this is the whole behaviour `light-dark()` is carrying.
    const light = await readComputed(page, MIGRATED_CSS, "light", "light");
    const dark = await readComputed(page, MIGRATED_CSS, "dark", "light");
    const differing = Object.keys(light).filter((key) => light[key] !== dark[key]);
    expect(differing.length).toBeGreaterThanOrEqual(25);
    expect(differing).toContain("color-bg");
    expect(differing).toContain("@html.background-color");
    expect(differing).toContain("@button.color");
  });

  test("data-theme drives color-scheme, which is what the function reads", async ({ page }) => {
    // The cascade contract, observed rather than assumed. Without it every
    // light-dark() below would resolve to its light side in all three states.
    const readScheme = async (scheme: Scheme, prefers: "light" | "dark") =>
      (await readComputed(page, MIGRATED_CSS, scheme, prefers))["@html.color-scheme"];
    expect(await readScheme("light", "light")).toBe("light");
    expect(await readScheme("dark", "light")).toBe("dark");
    expect(await readScheme("auto", "dark")).toBe("light dark");
  });
});
