/**
 * The chat pattern in a real engine with real layout, at desktop and phone
 * widths: picking a conversation by pointer and keyboard, sending a message
 * that lands — visible, at the bottom of the open thread — and updates the
 * list, the one-pane collapse with its back button, and the typing indicator
 * that animates unless reduced motion is asked for.
 *
 * Run: `npx playwright test --config=playwright.browser.config.ts chat`
 */

import { test, expect, type Page } from "@playwright/test";
import { liveReferencePage } from "./harness";

const PAGE = liveReferencePage("registry/patterns/chat/chat.html", { css: "main.smoke-root { padding: 16px; }" });

const chat = (page: Page) => page.locator("[data-ui='chat']");
const option = (page: Page, name: RegExp) => chat(page).getByRole("option", { name });
const thread = (page: Page, name: string) => chat(page).getByRole("log", { name });
const header = (page: Page, name: string) => chat(page).getByRole("heading", { name, level: 3 });

test.describe("chat · desktop", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.setContent(PAGE, { waitUntil: "load" });
  });

  test("both panes show, and picking a conversation swaps the thread", async ({ page }) => {
    await expect(chat(page).locator("[data-part='sidebar']")).toBeVisible();
    await expect(header(page, "Lisbon trip")).toBeVisible();
    await expect(chat(page).getByRole("button", { name: "Back to chats" }).first()).toBeHidden();

    await option(page, /^Maya Chen/).click();
    await expect(header(page, "Maya Chen")).toBeVisible();
    await expect(header(page, "Lisbon trip")).toBeHidden();
    await expect(option(page, /^Maya Chen/)).toHaveAttribute("aria-selected", "true");
    await expect(option(page, /^Lisbon trip/)).toHaveAttribute("aria-selected", "false");
    // Opening it read the unread messages.
    await expect(option(page, /^Maya Chen/).locator("[data-part='count']")).toBeHidden();
  });

  test("the keyboard drives the list: arrows move, Enter opens", async ({ page }) => {
    await chat(page).getByRole("button", { name: "Groups" }).focus();
    await page.keyboard.press("Tab");
    await expect(option(page, /^Lisbon trip/)).toBeFocused();
    await page.keyboard.press("ArrowUp");
    await expect(option(page, /^Maya Chen/)).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(header(page, "Maya Chen")).toBeVisible();
  });

  test("sending appends a visible outgoing bubble at the bottom and updates the preview", async ({ page }) => {
    const box = chat(page).getByRole("textbox", { name: "Message Lisbon trip" });
    await box.click();
    await page.keyboard.type("Landing at 10:40 — see you at arrivals!");
    await page.keyboard.press("Enter");

    const log = thread(page, "Lisbon trip");
    const mine = log.locator("[data-ui='chat-message'][data-variant='outgoing']").last();
    await expect(mine.locator("[data-part='text']")).toHaveText("Landing at 10:40 — see you at arrivals!");
    await expect(mine).toBeInViewport();
    // Pinned: the log is scrolled to its newest end (column-reverse origin).
    expect(await log.evaluate((el) => Math.abs(el.scrollTop))).toBeLessThan(2);
    await expect(option(page, /^Lisbon trip/).locator("[data-part='subtitle']")).toHaveText(
      "You: Landing at 10:40 — see you at arrivals!",
    );
    await expect(box).toBeFocused();
    await expect(box).toHaveValue("");
  });

  test("search narrows the list", async ({ page }) => {
    await chat(page).getByRole("searchbox", { name: "Search chats" }).fill("pri");
    await expect(chat(page).getByRole("option")).toHaveCount(1);
    await expect(option(page, /^Priya Shah/)).toBeVisible();
    // The list's one tab stop moved onto the option that is left.
    await chat(page).getByRole("button", { name: "Groups" }).focus();
    await page.keyboard.press("Tab");
    await expect(option(page, /^Priya Shah/)).toBeFocused();
  });

  test("the typing indicator animates, and stays still under reduced motion", async ({ page }) => {
    const dots = () =>
      chat(page)
        .locator("[data-ui='chat-message'][data-state='typing'] [data-part='dots'] > span")
        .filter({ visible: true })
        .first()
        .evaluate((el) => el.getAnimations().length);
    expect(await dots()).toBeGreaterThan(0);
    await page.emulateMedia({ reducedMotion: "reduce" });
    expect(await dots()).toBe(0);
  });
});

test.describe("chat · phone", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.setContent(PAGE, { waitUntil: "load" });
  });

  test("one pane at a time, with back to the list and into another chat", async ({ page }) => {
    const sidebar = chat(page).locator("[data-part='sidebar']");
    await expect(header(page, "Lisbon trip")).toBeVisible();
    await expect(sidebar).toBeHidden();

    const back = chat(page).getByRole("button", { name: "Back to chats" }).filter({ visible: true });
    await back.click();
    await expect(sidebar).toBeVisible();
    await expect(chat(page).locator("[data-part='main']")).toBeHidden();
    await expect(chat(page).getByRole("option", { selected: true })).toHaveCount(0);

    await option(page, /^Priya Shah/).click();
    await expect(sidebar).toBeHidden();
    await expect(header(page, "Priya Shah")).toBeVisible();
    await expect(chat(page).getByRole("textbox", { name: "Message Priya Shah" })).toBeVisible();
  });

  test("nothing overflows the phone width", async ({ page }) => {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
