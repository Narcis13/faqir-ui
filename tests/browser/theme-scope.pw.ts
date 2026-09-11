/**
 * Scoped themes in a real engine [1.1A-19].
 *
 * `faqir theme bundle <name> --scope` moves a theme's declarations from `:root`
 * onto `[data-skin="<name>"]`. Three of the things that makes true cannot be
 * decided without a layout engine:
 *
 *   • `light-dark()` — the one-block authoring form 1.1A-06 introduced — is
 *     resolved at used-value time against `color-scheme`. happy-dom has no
 *     engine, so a scoped theme that served the wrong SIDE of every colour would
 *     pass the whole Bun suite. The scope root re-declares `color-scheme`, and
 *     this is what proves the function reads it there.
 *   • Two skins side by side is a cascade question — two rules of equal
 *     specificity on different elements — and the answer is per-element, not
 *     per-stylesheet.
 *   • The island's isolation from the page's own theme runs the other way too:
 *     a `data-theme` INSIDE the island must resolve the skin's dark block, not
 *     the host's.
 *
 * Each side is read through a real property a component declares —
 * `background-color` on `[data-ui="button"][data-variant="primary"]`, which is
 * `var(--color-primary)` — not through the custom property, so what is asserted
 * is what a reader sees.
 *
 * Run: `npx playwright test --config=playwright.browser.config.ts theme-scope`
 */

import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { REGISTRY, frameworkCss } from "../visual/matrix";
import { scopeThemeCss, defaultScopeSelector } from "../../src/theme/scope";

/** The page's own theme: `default`, the one authored with `light-dark()`. */
const PAGE_CSS = frameworkCss("default");

function scoped(name: string): string {
  const css = readFileSync(join(REGISTRY, "themes", `${name}.css`), "utf8");
  return scopeThemeCss(css, { selector: defaultScopeSelector(name), name }).css;
}

/** Three skins: a dual three-block theme, a dual one-block theme, a dark-only one. */
const SKINS = ["aurora", "swiss", "luxe"] as const;

const SCOPED_CSS = SKINS.map(scoped).join("\n");

function button(id: string): string {
  return `<button id="${id}" data-ui="button" data-variant="primary">Primary</button>`;
}

/**
 * The page under test: the host theme, the three scoped sheets after it, and one
 * island per skin — plus an unscoped control, a nested skin, and a `data-theme`
 * written inside an island.
 */
function skinPage(scheme: "light" | "dark"): string {
  return `<!DOCTYPE html>
<html lang="en" data-theme="${scheme}" dir="ltr">
<head>
<meta charset="UTF-8">
<title>scoped themes</title>
<style>${PAGE_CSS}
${SCOPED_CSS}</style>
</head>
<body>
<main>
  ${button("page")}
  ${SKINS.map(
    (skin) => `<div id="island-${skin}" data-skin="${skin}">${button(`btn-${skin}`)}</div>`,
  ).join("\n  ")}
  <div data-skin="aurora">
    ${button("outer")}
    <div data-skin="luxe">${button("nested")}</div>
    <div data-theme="dark">${button("inner-dark")}</div>
  </div>
</main>
</body>
</html>`;
}

/** Computed `background-color` per button id, plus each island's own ground. */
async function read(
  page: import("@playwright/test").Page,
  scheme: "light" | "dark",
): Promise<Record<string, string>> {
  await page.setContent(skinPage(scheme), { waitUntil: "load" });
  return page.evaluate(() => {
    const out: Record<string, string> = {};
    for (const el of document.querySelectorAll<HTMLElement>("button[id]")) {
      out[el.id] = getComputedStyle(el).backgroundColor;
    }
    for (const el of document.querySelectorAll<HTMLElement>("div[id^='island-']")) {
      const style = getComputedStyle(el);
      out[`${el.id}.background`] = style.backgroundColor;
      out[`${el.id}.color-scheme`] = style.colorScheme;
      out[`${el.id}.color`] = style.color;
    }
    return out;
  });
}

test.describe("scoped themes coexist on one page", () => {
  test("the scoped sheets really are scoped (the comparison is not vacuous)", () => {
    expect(SCOPED_CSS).not.toContain("\n:root {");
    for (const skin of SKINS) expect(SCOPED_CSS).toContain(`[data-skin="${skin}"] {`);
    // `default` is the light-dark() theme — the side the engine picks is the
    // thing these cases are about.
    expect(PAGE_CSS).toContain("light-dark(");
  });

  for (const scheme of ["light", "dark"] as const) {
    test(`each island renders its own theme, in a ${scheme} page`, async ({ page }) => {
      const seen = await read(page, scheme);

      // Every skin differs from the page and from every other skin: three
      // themes, four distinct primaries on one page.
      const values = [seen.page, ...SKINS.map((skin) => seen[`btn-${skin}`])];
      expect(new Set(values).size).toBe(values.length);
      for (const value of values) expect(value).toMatch(/^(rgb|oklch|color)/);

      // The island paints its own ground and ink — a theme, not a palette.
      for (const skin of SKINS) {
        expect(seen[`island-${skin}.background`]).not.toBe("rgba(0, 0, 0, 0)");
        expect(seen[`island-${skin}.color`]).not.toBe(seen.page);
      }

      // The scope root pins `color-scheme`, which is what `light-dark()` reads:
      // a dual theme's island stays light inside a dark page, `luxe` stays dark.
      expect(seen["island-aurora.color-scheme"]).toBe("light");
      expect(seen["island-swiss.color-scheme"]).toBe("light");
      expect(seen["island-luxe.color-scheme"]).toBe("dark");
    });
  }

  test("the page's own theme is untouched by the skins around it", async ({ page }) => {
    // `default`'s primary, read from a page with no skin at all.
    await page.setContent(
      `<!DOCTYPE html><html data-theme="light"><head><style>${PAGE_CSS}</style></head>` +
        `<body>${button("page")}</body></html>`,
      { waitUntil: "load" },
    );
    const alone = await page.evaluate(
      () => getComputedStyle(document.getElementById("page")!).backgroundColor,
    );
    const together = (await read(page, "light")).page;
    expect(together).toBe(alone);
  });

  test("nested skins resolve innermost-first", async ({ page }) => {
    const seen = await read(page, "light");
    expect(seen.outer).toBe(seen["btn-aurora"]);
    expect(seen.nested).toBe(seen["btn-luxe"]);
    expect(seen.nested).not.toBe(seen.outer);
  });

  test("a data-theme inside an island resolves that island's dark block", async ({ page }) => {
    const light = await read(page, "light");
    // Not the page's dark primary, and not the island's own light one.
    const pageDark = (await read(page, "dark")).page;
    expect(light["inner-dark"]).not.toBe(pageDark);
    expect(light["inner-dark"]).not.toBe(light["btn-aurora"]);

    // It is exactly what `aurora` renders at page level under data-theme="dark".
    await page.setContent(
      `<!DOCTYPE html><html data-theme="dark"><head><style>${frameworkCss("aurora")}</style></head>` +
        `<body>${button("page")}</body></html>`,
      { waitUntil: "load" },
    );
    const auroraDark = await page.evaluate(
      () => getComputedStyle(document.getElementById("page")!).backgroundColor,
    );
    expect(light["inner-dark"]).toBe(auroraDark);
  });

  test("a scoped theme renders what it renders at page level", async ({ page }) => {
    // The claim the whole feature rests on: scoping changes WHERE a theme
    // applies, never WHAT it renders. Read at page level, then in an island.
    const inIsland = await read(page, "light");
    for (const skin of SKINS) {
      await page.setContent(
        `<!DOCTYPE html><html data-theme="light"><head><style>${frameworkCss(skin)}</style></head>` +
          `<body>${button("page")}</body></html>`,
        { waitUntil: "load" },
      );
      const atRoot = await page.evaluate(() => {
        const el = document.getElementById("page")!;
        return {
          button: getComputedStyle(el).backgroundColor,
          background: getComputedStyle(document.documentElement).backgroundColor,
          color: getComputedStyle(document.documentElement).color,
        };
      });
      expect(inIsland[`btn-${skin}`], `${skin} primary`).toBe(atRoot.button);
      expect(inIsland[`island-${skin}.background`], `${skin} ground`).toBe(atRoot.background);
      expect(inIsland[`island-${skin}.color`], `${skin} ink`).toBe(atRoot.color);
    }
  });
});
