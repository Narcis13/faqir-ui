/**
 * calendar 1.2 in a real engine: the range band and its preview are drawn by
 * `td::before` and `:has()`, which happy-dom neither lays out nor computes, and
 * the multi-month row wraps by flexbox. These drive the shipped engine with a
 * real pointer and keyboard and read the computed result.
 *
 * Run: `PW_BASE=browser bunx playwright test --config=playwright.wsl.config.ts calendar`
 */

import { test, expect, type Page } from "@playwright/test";
import { livePage } from "./harness";

const GRID = `
  <div data-part="header">
    <button data-part="nav-prev" type="button" aria-label="Previous month">&lsaquo;</button>
    <span data-part="month-label" aria-live="polite"></span>
    <button data-part="nav-next" type="button" aria-label="Next month">&rsaquo;</button>
  </div>
  <table data-part="grid" role="grid" aria-label="Calendar">
    <thead><tr><th>Su</th><th>Mo</th><th>Tu</th><th>We</th><th>Th</th><th>Fr</th><th>Sa</th></tr></thead>
    <tbody data-part="grid-body"></tbody>
  </table>`;

// A complete range pins the view to March 2026; the first click starts afresh.
const RANGE = `<div id="cal" data-ui="calendar" data-mode="range" data-value="2026-03-01,2026-03-02">${GRID}
  <p data-part="summary" aria-live="polite">No dates selected</p></div>`;

const MULTI = `<div id="cal" data-ui="calendar" data-mode="range" data-months="2" data-value="2026-03-01,2026-03-02">
  <div data-part="presets" role="group" aria-label="Quick ranges">
    <button data-part="preset" type="button" data-start="2026-03-28" data-end="2026-04-03" aria-pressed="false">Spring break</button>
  </div>${GRID}</div>`;

const dayAt = (page: Page, iso: string) => page.locator(`#cal [data-part="day"][data-date="${iso}"]`);

/** The band colour painted behind a day (its cell's ::before), or "none". */
function band(page: Page, iso: string): Promise<string> {
  return page.evaluate((iso) => {
    const td = document.querySelector(`#cal [data-date="${iso}"]`)!.parentElement!;
    const cs = getComputedStyle(td, "::before");
    return cs.content === "none" ? "none" : cs.backgroundColor;
  }, iso);
}

const states = (page: Page, state: string) =>
  page.$$eval(`#cal [data-part="day"][data-state="${state}"]`, (els) => els.map((e) => (e as HTMLElement).dataset.date));

test.describe("calendar · range in a real browser", () => {
  test("hovering after the start previews the span; leaving clears it", async ({ page }) => {
    await page.setContent(livePage(RANGE));
    await dayAt(page, "2026-03-10").click();
    await dayAt(page, "2026-03-14").hover();
    expect(await states(page, "preview")).toEqual(["2026-03-11", "2026-03-12", "2026-03-13"]);
    expect(await states(page, "preview-end")).toEqual(["2026-03-14"]);
    // The preview is painted, as a lighter band than a committed range
    const previewBand = await band(page, "2026-03-12");
    expect(previewBand).not.toBe("none");
    expect(previewBand).not.toBe("rgba(0, 0, 0, 0)");
    // The end ring is dashed
    expect(await dayAt(page, "2026-03-14").evaluate((b) => getComputedStyle(b).borderTopStyle)).toBe("dashed");

    await page.mouse.move(2, 2);
    expect(await states(page, "preview")).toEqual([]);
    expect(await states(page, "preview-end")).toEqual([]);
  });

  test("two clicks commit a range drawn as one band with capped ends", async ({ page }) => {
    await page.setContent(livePage(RANGE));
    const events = await page.evaluateHandle(() => {
      const list: any[] = [];
      document.getElementById("cal")!.addEventListener("faqir:calendar-change", (e: any) => list.push(e.detail));
      return list;
    });
    await dayAt(page, "2026-03-10").click();
    await dayAt(page, "2026-03-14").click();
    expect(await states(page, "in-range")).toEqual(["2026-03-11", "2026-03-12", "2026-03-13"]);
    expect(await events.evaluate((l) => l.map((d: any) => `${d.start}..${d.end}`))).toEqual(["2026-03-10..2026-03-14"]);

    const committed = await band(page, "2026-03-12");
    expect(committed).not.toBe("none");
    // The band joins the endpoints: half a band under each circle
    expect(await band(page, "2026-03-10")).toBe(committed);
    expect(await band(page, "2026-03-14")).toBe(committed);
    // …and is not the preview colour
    await dayAt(page, "2026-03-20").click();
    await dayAt(page, "2026-03-24").hover();
    expect(await band(page, "2026-03-22")).not.toBe(committed);
    await expect(page.locator("#cal [data-part='summary']")).toContainText("select an end date");
  });

  test("keyboard: Enter, arrows (previewing), Enter", async ({ page }) => {
    await page.setContent(livePage(RANGE));
    await dayAt(page, "2026-03-10").focus();
    await page.keyboard.press("Enter");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowDown");
    expect(await states(page, "preview-end")).toEqual(["2026-03-19"]);
    await expect(dayAt(page, "2026-03-19")).toBeFocused();
    await page.keyboard.press("Enter");
    expect(await states(page, "in-range")).toHaveLength(8);
    await expect(page.locator("#cal [data-part='summary']")).toContainText("10 days");
    await expect(dayAt(page, "2026-03-15")).toHaveAttribute("aria-label", "Sunday, March 15, 2026, in range");
  });
});

test.describe("calendar · several months", () => {
  test("two months sit side by side at desktop width, focus crosses between them", async ({ page }) => {
    await page.setContent(livePage(MULTI));
    const [a, b] = await page.$$eval("#cal [data-part='grid']", (gs) => gs.map((g) => g.getBoundingClientRect().toJSON()));
    expect(b.x).toBeGreaterThan(a.x + a.width - 1);
    expect(Math.abs(b.y - a.y)).toBeLessThan(2);

    await dayAt(page, "2026-03-31").focus();
    await page.keyboard.press("ArrowRight");
    await expect(dayAt(page, "2026-04-01")).toBeFocused();
    await expect(page.locator("#cal [data-part='month-title']").first()).toHaveText("March 2026");

    // The nav pair rides over the titles and stays clickable
    await page.locator("#cal [data-part='nav-next']").click();
    await expect(page.locator("#cal [data-part='month-title']")).toHaveText(["April 2026", "May 2026"]);
    await expect(page.locator("#cal [data-part='month-label']")).toHaveText("April – May 2026");
  });

  test("they wrap to a stack on a phone, without bleeding past the viewport", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await page.setContent(livePage(MULTI, { css: "main.smoke-root { padding: 16px; }" }));
    const [a, b] = await page.$$eval("#cal [data-part='grid']", (gs) => gs.map((g) => g.getBoundingClientRect().toJSON()));
    expect(b.y).toBeGreaterThan(a.y + a.height - 1);
    const right = await page.$eval("#cal", (el) => el.getBoundingClientRect().right);
    expect(right).toBeLessThanOrEqual(390);
  });

  test("a preset selects across months, is pressed and the range spans both grids", async ({ page }) => {
    await page.setContent(livePage(MULTI));
    const preset = page.locator("#cal [data-part='preset']");
    await preset.click();
    await expect(preset).toHaveAttribute("aria-pressed", "true");
    await expect(preset).toBeFocused();
    expect(await states(page, "range-start")).toEqual(["2026-03-28"]);
    expect(await states(page, "range-end")).toEqual(["2026-04-03"]);
    expect(await states(page, "in-range")).toHaveLength(5);
  });
});
