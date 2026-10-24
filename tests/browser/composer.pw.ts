/**
 * The composer in a real engine with real layout: the textarea grows with its
 * content to --composer-max-lines and then scrolls; Enter sends and
 * Shift+Enter breaks the line; an IME-composing Enter never sends; the send
 * button follows the content; files picked through the attach button become
 * removable chips and ride along with faqir:send.
 *
 * Run: `npx playwright test --config=playwright.browser.config.ts composer`
 */

import { test, expect, type Page } from "@playwright/test";
import { liveReferencePage } from "./harness";

const PAGE = liveReferencePage("registry/recipes/composer/composer.html");

const first = (page: Page) => page.locator("[data-ui='composer']").first();

async function collectSends(page: Page) {
  await page.evaluate(() => {
    (window as any).__sent = [];
    document.addEventListener("faqir:send", (e) => {
      const d = (e as CustomEvent).detail;
      (window as any).__sent.push({ text: d.text, files: d.files.map((f: File) => f.name) });
    });
  });
  return () => page.evaluate(() => (window as any).__sent as { text: string; files: string[] }[]);
}

test.describe("composer", () => {
  test.beforeEach(async ({ page }) => {
    await page.setContent(PAGE, { waitUntil: "load" });
  });

  test("the send button is live only while there is something to send", async ({ page }) => {
    const composer = first(page);
    const send = composer.getByRole("button", { name: "Send" });
    await expect(send).toBeDisabled();
    await composer.getByRole("textbox").fill("   ");
    await expect(send).toBeDisabled();
    await composer.getByRole("textbox").fill("Hello");
    await expect(send).toBeEnabled();
    await expect(composer).toHaveAttribute("data-state", "ready");
  });

  test("Enter sends, Shift+Enter breaks the line, and the composer clears and keeps focus", async ({ page }) => {
    const sent = await collectSends(page);
    const box = first(page).getByRole("textbox");
    await box.click();
    await page.keyboard.type("first line");
    await page.keyboard.press("Shift+Enter");
    await page.keyboard.type("second line");
    expect(await sent()).toEqual([]);
    await page.keyboard.press("Enter");
    expect(await sent()).toEqual([{ text: "first line\nsecond line", files: [] }]);
    await expect(box).toHaveValue("");
    await expect(box).toBeFocused();
    await expect(first(page).getByRole("button", { name: "Send" })).toBeDisabled();
  });

  test("an Enter that commits an IME composition does not send", async ({ page }) => {
    const sent = await collectSends(page);
    const box = first(page).getByRole("textbox");
    await box.fill("にほんご");
    await box.evaluate((el) => {
      el.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
      el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", isComposing: true, bubbles: true, cancelable: true }));
      el.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "日本語" }));
    });
    expect(await sent()).toEqual([]);
    await box.press("Enter");
    expect(await sent()).toEqual([{ text: "にほんご", files: [] }]);
  });

  test("the textarea grows to the line cap and then scrolls", async ({ page }) => {
    const box = first(page).getByRole("textbox");
    const height = () => box.evaluate((el) => el.getBoundingClientRect().height);
    const one = await height();
    await box.fill("1\n2\n3");
    const three = await height();
    expect(three).toBeGreaterThan(one * 2);
    await box.fill(Array.from({ length: 12 }, (_, i) => `line ${i + 1}`).join("\n"));
    const capped = await height();
    await box.fill(Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join("\n"));
    expect(await height()).toBe(capped);
    const { scrollHeight, clientHeight, lineHeight, padding } = await box.evaluate((el) => ({
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
      lineHeight: parseFloat(getComputedStyle(el).lineHeight),
      padding: parseFloat(getComputedStyle(el).paddingTop) + parseFloat(getComputedStyle(el).paddingBottom),
    }));
    expect(scrollHeight).toBeGreaterThan(clientHeight);
    // Six lines of text (the default cap) plus the block padding.
    expect(Math.round((clientHeight - padding) / lineHeight)).toBe(6);
  });

  test("attach opens the picker; files become chips that can be removed and are sent along", async ({ page }) => {
    const sent = await collectSends(page);
    const composer = first(page);
    const chooser = page.waitForEvent("filechooser");
    await composer.getByRole("button", { name: "Attach files" }).click();
    await (await chooser).setFiles([
      { name: "brief.pdf", mimeType: "application/pdf", buffer: Buffer.alloc(2048) },
      { name: "photo.png", mimeType: "image/png", buffer: Buffer.alloc(3 * 1024 * 1024) },
    ]);
    const tray = composer.getByRole("list", { name: "Attachments" });
    await expect(tray).toBeVisible();
    await expect(tray.getByRole("listitem")).toHaveText([/^brief.pdf · 2 KB/, /^photo.png · 3.0 MB/]);
    await expect(composer.getByRole("button", { name: "Send" })).toBeEnabled();

    await tray.getByRole("button", { name: "Remove brief.pdf" }).click();
    await expect(tray.getByRole("listitem")).toHaveCount(1);
    await expect(tray.getByRole("button", { name: "Remove photo.png" })).toBeFocused();

    await composer.getByRole("button", { name: "Send" }).click();
    expect(await sent()).toEqual([{ text: "", files: ["photo.png"] }]);
    await expect(tray).toBeHidden();
  });

  test("long-form mode: Enter breaks the line, Ctrl+Enter posts", async ({ page }) => {
    const sent = await collectSends(page);
    const composer = page.locator("[data-ui='composer'][data-enter='newline']");
    const box = composer.getByRole("textbox");
    await box.click();
    await page.keyboard.type("Shipping Friday");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Details in the doc");
    expect(await sent()).toEqual([]);
    await page.keyboard.press("Control+Enter");
    expect(await sent()).toEqual([{ text: "Shipping Friday\nDetails in the doc", files: [] }]);
  });
});
