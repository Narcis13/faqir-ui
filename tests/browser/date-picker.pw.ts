/**
 * date-picker 2.2 in a real engine: the popup opening and closing through a
 * real pointer and keyboard, a date typed and committed by Tab, the clear
 * button, a range picked in the popup, and the inline variant — with the
 * shipped engine and the full framework CSS.
 *
 * Run: `PW_BASE=browser bunx playwright test --config=playwright.wsl.config.ts date-picker`
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

const CLEAR = `<button data-part="clear" type="button" aria-label="Clear date" hidden><span data-ui="icon" data-icon="x" aria-hidden="true"></span></button>`;
const TRIGGER = `<button data-part="trigger" type="button" aria-label="Open calendar" tabindex="-1"><span data-ui="icon" data-icon="calendar" aria-hidden="true"></span></button>`;

const TYPED = `<form id="form">
  <div id="dp" data-ui="date-picker" data-state="closed">
    <input data-part="value" type="hidden" name="when">
    <div data-part="field">
      <input data-part="input" type="text" role="combobox" aria-haspopup="dialog" aria-expanded="false" aria-label="Date" autocomplete="off">
      ${CLEAR}${TRIGGER}
    </div>
    <p data-part="error" hidden>Not a date</p>
    <div data-part="calendar" role="dialog" aria-label="Choose a date" hidden>
      <div data-ui="calendar" data-min="2026-01-01" data-max="2026-12-31">${GRID}</div>
    </div>
  </div>
  <button id="after" type="button">After</button>
</form>`;

const RANGE = `<div id="dp" data-ui="date-picker" data-state="closed" data-mode="range">
  <input data-part="value" type="hidden" name="from"><input data-part="value-end" type="hidden" name="to" >
  <div data-part="field">
    <input data-part="input" type="text" role="combobox" readonly aria-haspopup="dialog" aria-expanded="false" aria-label="Start date" placeholder="Start date">
    <span data-part="separator" aria-hidden="true">&rarr;</span>
    <input data-part="input-end" type="text" role="combobox" readonly aria-haspopup="dialog" aria-expanded="false" aria-label="End date" placeholder="End date">
    ${CLEAR}${TRIGGER}
  </div>
  <div data-part="calendar" role="dialog" aria-label="Choose a date range" hidden>
    <div data-ui="calendar" data-mode="range" data-months="2">
      <div data-part="presets" role="group" aria-label="Quick ranges">
        <button data-part="preset" type="button" data-value="last-7-days" aria-pressed="false">Last 7 days</button>
      </div>${GRID}
    </div>
  </div>
</div>`;

const INLINE = `<div id="dp" data-ui="date-picker" data-state="closed" data-variant="inline">
  <input data-part="value" type="hidden" name="d">
  <div data-part="field"><input data-part="input" type="text" aria-label="Delivery date" autocomplete="off">${CLEAR}</div>
  <div data-part="calendar"><div data-ui="calendar">${GRID}</div></div>
</div>`;

/** The typed fixture sits in a form: Enter submits it, so keep the page and count submits. */
async function typedPage(page: Page) {
  await page.setContent(livePage(TYPED));
  await page.evaluate(() => {
    (window as any).__submits = 0;
    document.getElementById("form")!.addEventListener("submit", (e) => {
      e.preventDefault();
      (window as any).__submits++;
    });
  });
}

const part = (page: Page, name: string) => page.locator(`#dp [data-part="${name}"]`);
const hiddenValue = (page: Page, name = "value") => page.$eval(`#dp [data-part="${name}"]`, (el) => (el as HTMLInputElement).value);

test.describe("date-picker · popup", () => {
  test("the trigger opens it, Escape closes it and focus returns to the field", async ({ page }) => {
    await page.setContent(livePage(TYPED));
    await part(page, "trigger").click();
    await expect(page.locator("#dp")).toHaveAttribute("data-state", "open");
    await expect(part(page, "calendar")).toBeVisible();
    await expect(part(page, "input")).toHaveAttribute("aria-expanded", "true");
    // Focus is in the grid, on a day
    expect(await page.evaluate(() => (document.activeElement as HTMLElement).dataset.part)).toBe("day");
    await page.keyboard.press("Escape");
    await expect(page.locator("#dp")).toHaveAttribute("data-state", "closed");
    await expect(part(page, "calendar")).toBeHidden();
    await expect(part(page, "input")).toBeFocused();
  });

  test("ArrowDown on the field opens it; a click outside closes it", async ({ page }) => {
    await page.setContent(livePage(TYPED));
    await part(page, "input").focus();
    await page.keyboard.press("ArrowDown");
    await expect(page.locator("#dp")).toHaveAttribute("data-state", "open");
    await page.mouse.click(5, 5);
    await expect(page.locator("#dp")).toHaveAttribute("data-state", "closed");
  });

  test("picking a day fills the field and closes", async ({ page }) => {
    await page.setContent(livePage(TYPED));
    await part(page, "input").fill("2026-03-10");
    await part(page, "trigger").click();
    await page.locator('#dp [data-date="2026-03-12"]').click();
    await expect(part(page, "input")).toHaveValue("March 12, 2026");
    expect(await hiddenValue(page)).toBe("2026-03-12");
    await expect(page.locator("#dp")).toHaveAttribute("data-state", "closed");
  });
});

test.describe("date-picker · typing", () => {
  test("a typed date is read on Tab, shown in full and submitted as ISO", async ({ page }) => {
    await page.setContent(livePage(TYPED));
    await expect(part(page, "input")).toHaveAttribute("placeholder", "mm/dd/yyyy");
    await part(page, "input").click();
    await page.keyboard.type("3/14/26");
    await page.keyboard.press("Tab");
    await expect(part(page, "input")).toHaveValue("March 14, 2026");
    expect(await hiddenValue(page)).toBe("2026-03-14");
    expect(await page.evaluate(() => new FormData(document.getElementById("form") as HTMLFormElement).get("when"))).toBe("2026-03-14");
  });

  test("an invalid entry keeps its text and turns the field destructive", async ({ page }) => {
    await typedPage(page);
    await part(page, "input").fill("2/30/2026");
    await part(page, "input").press("Enter");
    await expect(part(page, "input")).toHaveValue("2/30/2026");
    await expect(part(page, "input")).toHaveAttribute("aria-invalid", "true");
    await expect(part(page, "error")).toBeVisible();
    expect(await hiddenValue(page)).toBe("");
    await page.locator("#after").focus();
    // Polled: the border colour transitions (motion is on in this suite).
    const colours = () =>
      page.$eval("#dp [data-part=field]", (f) => {
        const probe = document.createElement("span");
        probe.style.color = "var(--color-destructive)";
        f.appendChild(probe);
        const want = getComputedStyle(probe).color;
        probe.remove();
        return getComputedStyle(f).borderTopColor === want;
      });
    await expect.poll(colours).toBe(true);
    // Out of the calendar's bounds is invalid too
    await part(page, "input").fill("1/1/2027");
    await part(page, "input").press("Enter");
    await expect(part(page, "input")).toHaveAttribute("aria-invalid", "true");
  });

  test("the clear button appears with a value, empties it and hands focus back", async ({ page }) => {
    await typedPage(page);
    await expect(part(page, "clear")).toBeHidden();
    await part(page, "input").fill("2026-04-05");
    await part(page, "input").press("Enter");
    // Enter committed the date AND still submitted the form, with the new value
    expect(await page.evaluate(() => (window as any).__submits)).toBe(1);
    await expect(part(page, "input")).toHaveValue("April 5, 2026");
    await expect(part(page, "clear")).toBeVisible();
    await expect(part(page, "clear")).toHaveAccessibleName("Clear date");
    await part(page, "clear").click();
    await expect(part(page, "input")).toHaveValue("");
    await expect(part(page, "input")).toBeFocused();
    await expect(part(page, "clear")).toBeHidden();
    expect(await hiddenValue(page)).toBe("");
  });
});

test.describe("date-picker · range", () => {
  test("start and end picked in two months fill both fields, then it closes", async ({ page }) => {
    await page.setContent(livePage(RANGE));
    await part(page, "input").click();
    await expect(page.locator("#dp")).toHaveAttribute("data-state", "open");
    await expect(page.locator("#dp [data-part='grid']")).toHaveCount(2);
    await page.locator("#dp [data-part='nav-next']").click();
    const firstMonthDay = page.locator("#dp [data-part='month']").first().locator("[data-part='day']").nth(9);
    const secondMonthDay = page.locator("#dp [data-part='month']").nth(1).locator("[data-part='day']").nth(2);
    const start = await firstMonthDay.getAttribute("data-date");
    const end = await secondMonthDay.getAttribute("data-date");
    await firstMonthDay.click();
    await secondMonthDay.hover();
    expect(await page.locator("#dp [data-state='preview']").count()).toBeGreaterThan(5);
    await secondMonthDay.click();
    await expect(page.locator("#dp")).toHaveAttribute("data-state", "closed");
    expect(await hiddenValue(page)).toBe(start);
    expect(await hiddenValue(page, "value-end")).toBe(end);
    await expect(part(page, "input-end")).not.toHaveValue("");
    await expect(part(page, "input")).toBeFocused();
  });

  test("a preset commits from the popup", async ({ page }) => {
    await page.setContent(livePage(RANGE));
    await part(page, "trigger").click();
    await page.locator("#dp [data-part='preset']").click();
    await expect(page.locator("#dp")).toHaveAttribute("data-state", "closed");
    expect(await hiddenValue(page, "value-end")).toMatch(/^\d{4}-\d\d-\d\d$/);
  });

  test("one month on a phone", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await page.setContent(livePage(RANGE, { css: "main.smoke-root { padding: 16px; }" }));
    await part(page, "input").click();
    await expect(page.locator("#dp [data-part='grid']")).toHaveCount(1);
    const right = await part(page, "calendar").evaluate((el) => el.getBoundingClientRect().right);
    expect(right).toBeLessThanOrEqual(390);
  });
});

test.describe("date-picker · inline", () => {
  test("the calendar is shown without opening; a click fills the field", async ({ page }) => {
    await page.setContent(livePage(INLINE));
    await expect(part(page, "calendar")).toBeVisible();
    const cell = page.locator("#dp [data-part='day']:not([data-outside])").nth(14);
    const iso = await cell.getAttribute("data-date");
    await cell.click();
    expect(await hiddenValue(page)).toBe(iso);
    await expect(part(page, "input")).not.toHaveValue("");
    await expect(part(page, "calendar")).toBeVisible();
    await expect(cell).toHaveAttribute("aria-selected", "true");
  });
});
