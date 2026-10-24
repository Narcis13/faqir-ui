/**
 * stepper 1.2 + wizard 1.1 in Chromium: clicking a stepper step drives the
 * wizard (pointer and keyboard), steps ahead stay disabled, and the stepper's
 * computed styles — the error pair, the drawn glyphs, the visually hidden
 * status, the phone-width label rules — are what the sheet says.
 *
 * Run: `npx playwright test --config=playwright.browser.config.ts stepper-wizard`
 */

import { test, expect, type Page } from "@playwright/test";
import { liveReferencePage } from "./harness";

const WIZARD = liveReferencePage("registry/patterns/wizard/wizard.html", { plugins: ["validate"] });
const STEPPER = liveReferencePage("registry/primitives/stepper/stepper.html", {
  css: "main.smoke-root { padding: 16px; }",
});

async function toPlan(page: Page) {
  await page.getByLabel("Full name").fill("Ada Lovelace");
  await page.getByLabel("Email").fill("ada@example.com");
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByRole("heading", { name: "Plan" })).toBeVisible();
}

test.describe("wizard · stepper navigation", () => {
  test.beforeEach(async ({ page }) => {
    await page.setContent(WIZARD);
  });

  test("a step ahead is disabled until Next validates the way to it", async ({ page }) => {
    const nav = page.getByRole("navigation", { name: "Progress" });
    const plan = nav.getByRole("button", { name: /Plan/ });
    await expect(plan).toBeDisabled();
    await expect(nav.getByRole("button", { name: /Profile/ })).toHaveAttribute("aria-current", "step");
    // Next with the step invalid: still disabled, still on Profile.
    await page.getByRole("button", { name: "Next" }).click();
    await expect(plan).toBeDisabled();
    await expect(page.getByRole("heading", { name: "Profile" })).toBeVisible();
  });

  test("clicking a completed step goes back to its panel", async ({ page }) => {
    await toPlan(page);
    const nav = page.getByRole("navigation", { name: "Progress" });
    const profile = nav.getByRole("button", { name: "Profile Completed" });
    await expect(profile).toBeEnabled();
    await expect(nav.getByRole("button", { name: /Plan/ })).toHaveAttribute("aria-current", "step");

    await profile.click();
    await expect(page.getByRole("heading", { name: "Profile" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Plan" })).toBeHidden();
    await expect(nav.getByRole("button", { name: /Profile/ })).toHaveAttribute("aria-current", "step");
    await expect(nav.getByRole("button", { name: /Plan/ })).toBeDisabled();
    await expect(page.getByLabel("Full name")).toHaveValue("Ada Lovelace");
    await expect(page.locator("[data-ui='wizard']")).toHaveAttribute("data-state", "active");
  });

  test("the same from the keyboard: Tab to the step, Enter", async ({ page }) => {
    await toPlan(page);
    const profile = page.getByRole("button", { name: "Profile Completed" });
    // Back, then Shift+Tab: the plan radio, the current step, the completed step.
    await page.getByRole("button", { name: "Back" }).focus();
    for (let i = 0; i < 3; i++) await page.keyboard.press("Shift+Tab");
    await expect(profile).toBeFocused();
    const ring = await profile.evaluate((el) => getComputedStyle(el).outlineStyle);
    expect(ring).not.toBe("none");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: "Profile" })).toBeVisible();
    // Forward again only through Next, which validates.
    await page.getByRole("button", { name: "Next" }).click();
    await expect(page.getByRole("heading", { name: "Plan" })).toBeVisible();
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.locator("[data-ui='wizard']")).toHaveAttribute("data-state", "submitted");
  });

  test("a completed step draws a tick over its number", async ({ page }) => {
    await toPlan(page);
    const indicator = page.locator("[data-ui='stepper'] > [data-part='step']").first().locator("[data-part='indicator']");
    const glyph = await indicator.evaluate((el) => {
      const before = getComputedStyle(el, "::before");
      return { content: before.content, mask: before.maskImage || (before as any).webkitMaskImage, fill: getComputedStyle(el).webkitTextFillColor };
    });
    expect(glyph.content).toBe('""');
    expect(glyph.mask).toContain("data:image/svg+xml");
    expect(glyph.fill).toBe("rgba(0, 0, 0, 0)");
  });
});

test.describe("stepper · reference page", () => {
  test("the error step reads the destructive tokens, and its status is hidden but named", async ({ page }) => {
    await page.setContent(STEPPER);
    const step = page.locator("[data-part='step'][data-state='error']").first();
    const colours = await step.evaluate((el) => {
      const root = getComputedStyle(document.documentElement);
      const probe = document.createElement("span");
      document.body.append(probe);
      probe.style.color = root.getPropertyValue("--color-destructive");
      const destructive = getComputedStyle(probe).color;
      probe.remove();
      const indicator = el.querySelector("[data-part='indicator']")!;
      return { bg: getComputedStyle(indicator).backgroundColor, destructive };
    });
    expect(colours.bg).toBe(colours.destructive);
    const status = step.locator("[data-part='status']");
    const box = (await status.boundingBox())!;
    expect(box.width).toBeLessThanOrEqual(1);
    await expect(step).toContainText("Error");
  });

  test("at phone width only the current step keeps its label; vertical keeps them all", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await page.setContent(STEPPER);
    const first = page.locator("ol[data-ui='stepper']").first();
    await expect(first.locator("[aria-current='step'] [data-part='label']")).toBeVisible();
    await expect(first.locator("[data-part='step']:not([aria-current]) [data-part='label']").first()).toBeHidden();
    const vertical = page.locator("[data-ui='stepper'][data-variant='vertical']");
    await expect(vertical.locator("[data-part='label']")).toHaveCount(4);
    for (const label of await vertical.locator("[data-part='label']").all()) await expect(label).toBeVisible();
    await expect(vertical.locator("[data-part='description']").first()).toBeVisible();
    // Nothing overflows the phone.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("the clickable demo: completed steps go back, steps ahead are disabled", async ({ page }) => {
    await page.setContent(STEPPER);
    const nav = page.getByRole("navigation", { name: "Order steps" });
    await expect(nav.getByRole("button", { name: /Confirm/ })).toBeDisabled();
    await nav.getByRole("button", { name: /Basket/ }).click();
    await expect(nav.getByRole("button", { name: /Basket/ })).toHaveAttribute("aria-current", "step");
    await expect(nav.getByRole("button", { name: /Delivery/ })).toBeDisabled();
    await page.getByRole("button", { name: "Next" }).click();
    await expect(nav.getByRole("button", { name: /Delivery/ })).toHaveAttribute("aria-current", "step");
    await expect(nav.getByRole("button", { name: "Basket Completed" })).toBeEnabled();
  });
});
