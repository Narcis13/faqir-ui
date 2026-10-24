/**
 * The list recipe in a real engine with real layout: selection by pointer and
 * keyboard, pointer drag-reordering with the drop indicator, keyboard
 * reordering in both modes, the live announcements, and the sticky section
 * headers staying on top of the rows scrolling under them.
 *
 * Run: `npx playwright test --config=playwright.browser.config.ts list`
 */

import { test, expect, type Page } from "@playwright/test";
import { liveReferencePage } from "./harness";

const PAGE = liveReferencePage("registry/recipes/list/list.html");

const contacts = (page: Page) => page.locator("#list-contacts");
const mailboxes = (page: Page) => page.locator("[data-ui='list']").filter({ has: page.locator("[aria-label='Mailboxes']") });
const tasks = (page: Page) =>
  page.locator("[data-ui='list']").filter({ has: page.locator("[aria-label='Launch checklist, in priority order']") });

const order = (list: ReturnType<typeof mailboxes>) =>
  list.locator("[data-part='item']").evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.value));
const selected = (list: ReturnType<typeof mailboxes>) =>
  list
    .locator("[data-part='item'][aria-selected='true']")
    .evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.value));

test.describe("list · selection", () => {
  test.beforeEach(async ({ page }) => {
    await page.setContent(PAGE, { waitUntil: "load" });
  });

  test("multi-select by pointer: click toggles, Shift+click extends, the toolbar counts", async ({ page }) => {
    const list = contacts(page);
    await expect(list.locator("[data-part='toolbar'] [role='status']")).toHaveText("2 selected");
    await list.locator("[data-value='ana']").click();
    expect(await selected(list)).toEqual(["amara", "ana", "jonah"]);
    await list.locator("[data-value='lea']").click({ modifiers: ["Shift"] });
    // Jun is disabled: the range skips him.
    expect(await selected(list)).toEqual(["amara", "ana", "dara", "jonah", "lea"]);
    await expect(list.locator("[data-part='toolbar'] [role='status']")).toHaveText("5 selected");
    await list.getByRole("button", { name: "Clear" }).click();
    expect(await selected(list)).toEqual([]);
    await expect(list.locator("[data-part='toolbar'] [role='status']")).toHaveText("0 selected");
  });

  test("multi-select by keyboard: one tab stop, arrows, Space, Shift+Arrow, Ctrl+A", async ({ page }) => {
    const list = contacts(page);
    await list.getByRole("button", { name: "Clear" }).focus();
    await page.keyboard.press("Tab");
    await expect(list.locator("[data-value='amara']")).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(list.locator("[data-value='ana']")).toBeFocused();
    await page.keyboard.press("Space");
    expect(await selected(list)).toEqual(["amara", "ana", "jonah"]);
    await page.keyboard.press("Shift+ArrowDown");
    expect(await selected(list)).toEqual(["amara", "ana", "dara", "jonah"]);
    await page.keyboard.press("Control+a");
    expect(await selected(list)).toEqual(["amara", "ana", "dara", "jonah", "lea", "noor", "sam"]);
    await page.keyboard.press("Tab");
    await expect(list.locator("[role='option']:focus")).toHaveCount(0);
  });

  test("type-ahead jumps by title", async ({ page }) => {
    const list = contacts(page);
    await list.locator("[data-value='amara']").focus();
    await page.keyboard.type("s");
    await expect(list.locator("[data-value='sam']")).toBeFocused();
  });

  test("sticky headers stay pinned while their section scrolls under them", async ({ page }) => {
    const items = contacts(page).locator(":scope > [data-part='items']");
    await items.evaluate((el) => el.scrollBy(0, 150));
    const { top, stuck } = await items.evaluate((el) => {
      const top = el.getBoundingClientRect().top;
      const stuck = [...el.querySelectorAll("[data-part='header']")]
        .filter((h) => Math.abs(h.getBoundingClientRect().top - top) < 1.5)
        .map((h) => h.textContent);
      return { top, stuck };
    });
    // The section being read keeps its header at the top of the scroller…
    expect(stuck.length).toBe(1);
    // …which starts below the toolbar, so nothing slides under it.
    const toolbar = await contacts(page).locator("[data-part='toolbar']").boundingBox();
    expect(toolbar!.y + toolbar!.height).toBeLessThanOrEqual(top + 1);
  });
});

test.describe("list · reordering", () => {
  test.beforeEach(async ({ page }) => {
    await page.setContent(PAGE, { waitUntil: "load" });
  });

  test("Alt+ArrowDown moves the focused option and announces it", async ({ page }) => {
    const list = mailboxes(page);
    await list.locator("[data-value='inbox']").focus();
    await page.keyboard.press("Alt+ArrowDown");
    await page.keyboard.press("Alt+ArrowDown");
    expect(await order(list)).toEqual(["starred", "drafts", "inbox", "sent", "archive"]);
    await expect(list.locator("[data-value='inbox']")).toBeFocused();
    await expect(list.locator("[data-part='live']")).toHaveText(/Moved Inbox to position 3 of 5/);
  });

  test("dragging a handle moves the row, with a drop indicator on the way", async ({ page }) => {
    const list = mailboxes(page);
    const events: unknown[] = [];
    await page.exposeFunction("__reorder", (d: unknown) => events.push(d));
    await list.evaluate((el) =>
      el.addEventListener("faqir:reorder", (e) => (window as any).__reorder({ ...(e as CustomEvent).detail, item: null })),
    );
    const handle = list.locator("[data-value='inbox'] [data-part='handle']");
    const target = await list.locator("[data-value='sent']").boundingBox();
    const from = await handle.boundingBox();
    await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2);
    await page.mouse.down();
    await page.mouse.move(from!.x + from!.width / 2, target!.y + target!.height * 0.75, { steps: 8 });
    await expect(list.locator("[data-value='inbox']")).toHaveAttribute("data-state", "dragging");
    await expect(list).toHaveAttribute("data-state", "dragging");
    await expect(list.locator("[data-value='archive']")).toHaveAttribute("data-state", "drop-before");
    const lifted = await list.locator("[data-value='inbox']").evaluate((el) => getComputedStyle(el).translate);
    expect(lifted).not.toBe("none");
    await page.mouse.up();
    expect(await order(list)).toEqual(["starred", "drafts", "sent", "inbox", "archive"]);
    await expect(list.locator("[data-part='item'][data-state]")).toHaveCount(0);
    await expect(list).toHaveAttribute("data-state", "idle");
    await expect(list.locator("[data-part='live']")).toHaveText(/Moved Inbox to position 4 of 5/);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ value: "inbox", from: 0, to: 3 });
  });

  test("a plain list's handle grabs, moves and drops from the keyboard", async ({ page }) => {
    const list = tasks(page);
    const handle = list.getByRole("button", { name: "Reorder Write the launch brief" });
    await handle.focus();
    await page.keyboard.press("Space");
    await expect(list.locator("[data-value='brief']")).toHaveAttribute("data-state", "dragging");
    await expect(list.locator("[data-part='live']")).toHaveText(/grabbed, position 1 of 4/);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await expect(handle).toBeFocused();
    await page.keyboard.press("Space");
    expect(await order(list)).toEqual(["copy", "qa", "brief", "ship"]);
    await expect(list.locator("[data-part='live']")).toHaveText(/dropped at position 3 of 4/);
  });

  test("Escape cancels a keyboard grab", async ({ page }) => {
    const list = tasks(page);
    await list.getByRole("button", { name: "Reorder Ship it" }).focus();
    await page.keyboard.press("Enter");
    await page.keyboard.press("ArrowUp");
    expect(await order(list)).toEqual(["brief", "copy", "ship", "qa"]);
    await page.keyboard.press("Escape");
    expect(await order(list)).toEqual(["brief", "copy", "qa", "ship"]);
    await expect(list.locator("[data-part='live']")).toHaveText(/Reorder cancelled/);
  });
});
