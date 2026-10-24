/**
 * tree-view 1.1 in a real engine, with real CSS and a real pointer: what
 * happy-dom cannot do — native drag-and-drop with drop geometry, the drop
 * indicator, the CSS Custom Highlight API, a lazy load against the reference
 * page's own fake loader — plus the click and keyboard paths end to end.
 *
 * Run: `npx playwright test --config=playwright.browser.config.ts tree-view`
 */

import { test, expect, type Page, type Locator } from "@playwright/test";
import { liveReferencePage } from "./harness";

const PAGE = liveReferencePage("registry/recipes/tree-view/tree-view.html", {
  css: "main.smoke-root { padding: 24px; }",
});

const tree = (page: Page, label: string) => page.getByRole("tree", { name: label });
const item = (scope: Locator, value: string) => scope.locator(`[data-part="item"][data-value="${value}"]`);
const row = (scope: Locator, value: string) => item(scope, value).locator(":scope > [data-part='label']");
const children = (scope: Locator, value: string) =>
  item(scope, value).locator(":scope > [data-part='group'] > [data-part='item']").evaluateAll((els) =>
    els.map((el) => (el as HTMLElement).dataset.value));

test.describe("tree-view · live reference page", () => {
  test.beforeEach(async ({ page }) => {
    await page.setContent(PAGE);
    await page.waitForFunction(() => (document.querySelector("[data-ui='tree-view']") as any)?._faqirTreeView);
  });

  test("click, Ctrl-click and Shift-click build a multiple selection", async ({ page }) => {
    const outline = tree(page, "Course outline");
    await row(outline, "tokens").click();
    await row(outline, "attributes").click({ modifiers: ["Shift"] });
    await row(outline, "primitives").click({ modifiers: ["ControlOrMeta"] });
    const selected = () =>
      outline.locator("[aria-selected='true']").evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.value));
    expect(await selected()).toEqual(["tokens", "themes", "attributes", "primitives"]);
    await row(outline, "themes").click({ modifiers: ["ControlOrMeta"] });
    expect(await selected()).toEqual(["tokens", "attributes", "primitives"]);
    await expect(outline).toHaveAttribute("data-state", "selected");
  });

  test("dragging with the mouse moves a row inside a folder, and before a row", async ({ page }) => {
    const outline = tree(page, "Course outline");
    // Into the middle of a collapsed folder's row: inside, and the folder opens.
    await row(outline, "tokens").dragTo(row(outline, "week-3"));
    expect(await children(outline, "week-3")).toEqual(["auditing", "releasing", "tokens"]);
    await expect(item(outline, "week-3")).toHaveAttribute("aria-expanded", "true");
    await expect(item(outline, "tokens")).toHaveAttribute("aria-level", "2");
    await expect(item(outline, "themes")).toHaveAttribute("aria-posinset", "1");

    // The top edge of a row: before it, at its level.
    const box = (await row(outline, "week-1").boundingBox())!;
    await row(outline, "a11y").dragTo(row(outline, "week-1"), { targetPosition: { x: box.width / 2, y: 2 } });
    const top = await outline.locator(":scope > [data-part='item']").evaluateAll((els) =>
      els.map((el) => (el as HTMLElement).dataset.value));
    expect(top).toEqual(["a11y", "week-1", "week-2", "week-3", "backlog"]);
    await expect(item(outline, "a11y")).toHaveAttribute("aria-level", "1");
    await expect(item(outline, "backlog")).toHaveAttribute("aria-posinset", "5");
    await expect(page.locator("[data-part='drop-indicator']")).toHaveCount(0);
  });

  test("a folder never drops into its own subtree", async ({ page }) => {
    const outline = tree(page, "Course outline");
    await row(outline, "week-2").dragTo(row(outline, "recipes"));
    expect(await children(outline, "week-2")).toEqual(["primitives", "recipes", "patterns"]);
    await expect(item(outline, "week-2")).toHaveAttribute("aria-level", "1");
  });

  // Playwright's drag emulation delivers dragover only at release, so the
  // mid-drag picture is driven with DragEvents at real layout coordinates; the
  // native pipeline end to end is the dragTo cases above.
  test("the drop indicator follows the pointer: line before/after, ring inside", async ({ page }) => {
    const outline = tree(page, "Course outline");
    const drag = (type: string, value: string, fy: number) =>
      page.evaluate(([type, value, fy]) => {
        const label = document.querySelector(`[aria-label="Course outline"] [data-value="${value}"] > [data-part="label"]`)!;
        const r = label.getBoundingClientRect();
        const target = type === "dragstart" ? label.parentElement! : label;
        target.dispatchEvent(new DragEvent(type as string, {
          bubbles: true, cancelable: true, dataTransfer: new DataTransfer(),
          clientX: r.left + 60, clientY: r.top + r.height * (fy as number),
        }));
      }, [type, value, fy] as const);
    const indicator = page.locator("[data-part='drop-indicator']");
    const target = (await row(outline, "week-3").boundingBox())!;

    await drag("dragstart", "themes", 0.5);
    await expect(item(outline, "themes")).toHaveAttribute("data-state", "grabbed");

    await drag("dragover", "week-3", 0.5);
    await expect(indicator).toHaveAttribute("data-state", "inside");
    let box = (await indicator.boundingBox())!;
    expect(Math.abs(box.y - target.y)).toBeLessThan(2);
    expect(Math.abs(box.height - target.height)).toBeLessThan(2);

    await drag("dragover", "week-3", 0.1);
    await expect(indicator).toHaveAttribute("data-state", "before");
    box = (await indicator.boundingBox())!;
    expect(Math.abs(box.y + box.height / 2 - target.y)).toBeLessThan(2);
    expect(Math.abs(box.x - target.x)).toBeLessThan(2);

    // Below an open folder's row is its first child's top edge.
    await drag("dragover", "week-2", 0.9);
    await expect(indicator).toHaveAttribute("data-state", "before");
    const first = (await row(outline, "primitives").boundingBox())!;
    box = (await indicator.boundingBox())!;
    expect(Math.abs(box.x - first.x)).toBeLessThan(2);

    // Over its own row: nowhere to drop, no indicator.
    await drag("dragover", "themes", 0.5);
    await expect(indicator).toHaveCount(0);

    await drag("dragover", "week-3", 0.5);
    await drag("drop", "week-3", 0.5);
    expect(await children(outline, "week-3")).toEqual(["auditing", "releasing", "themes"]);
    await expect(indicator).toHaveCount(0);
    await expect(item(outline, "themes")).not.toHaveAttribute("data-state", "grabbed");
    await expect(page.locator("[aria-label='Course outline'] + [role='status']")).toHaveText("Moved Themes and schemes into Week 3 · Shipping");
  });

  test("Alt+Enter, arrows and Enter move a row from the keyboard, announced", async ({ page }) => {
    const outline = tree(page, "Course outline");
    const status = page.locator("[data-ui='tree-view'][aria-label='Course outline'] + [role='status']");
    // Open the collapsed week with the keyboard and walk down to its last lesson.
    await row(outline, "week-3").click();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await expect(item(outline, "releasing")).toBeFocused();
    await page.keyboard.press("Alt+Enter");
    await expect(status).toContainText("Picked up Releasing");
    await expect(item(outline, "releasing")).toHaveAttribute("data-state", "grabbed");
    await page.keyboard.press("ArrowUp");
    await expect(status).toHaveText("Before Auditing, level 2");
    await expect(page.locator("[data-part='drop-indicator']")).toHaveAttribute("data-state", "before");
    // "Inside Week 3" is where it already is (its last child), so it is skipped.
    await page.keyboard.press("ArrowUp");
    await expect(status).toHaveText("Before Week 3 · Shipping, level 1");
    await page.keyboard.press("Enter");
    await expect(status).toHaveText("Moved Releasing before Week 3 · Shipping");
    await expect(item(outline, "releasing")).toHaveAttribute("aria-level", "1");
    await expect(item(outline, "releasing")).toBeFocused();

    // Escape puts a picked-up row back.
    await page.keyboard.press("Alt+Enter");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Escape");
    await expect(status).toHaveText("Move cancelled. Releasing stays where it was.");
    await expect(item(outline, "releasing")).not.toHaveAttribute("data-state", "grabbed");
  });

  test("a lazy folder loads through the page's loader; a failure retries", async ({ page }) => {
    const drive = tree(page, "Cloud drive");
    await row(drive, "documents").click();
    await page.keyboard.press("ArrowRight");
    await expect(item(drive, "documents")).toHaveAttribute("aria-busy", "true");
    await expect(item(drive, "documents").locator("[data-part='spinner']")).toBeVisible();
    await expect(item(drive, "budget")).toBeVisible({ timeout: 5000 });
    await expect(item(drive, "documents")).not.toHaveAttribute("aria-busy", /.*/);

    await row(drive, "shared").click();
    await page.keyboard.press("ArrowRight");
    const retry = item(drive, "shared").locator("[data-part='retry']");
    await expect(retry).toBeVisible({ timeout: 5000 });
    await expect(item(drive, "shared")).toHaveAttribute("data-state", "error");
    await retry.click();
    await expect(item(drive, "design")).toBeVisible({ timeout: 5000 });
    await expect(item(drive, "shared")).toHaveAttribute("data-state", "expanded");
  });

  test("typing in the filter hides, highlights and announces", async ({ page }) => {
    const input = page.getByRole("searchbox", { name: "Filter components" });
    const components = tree(page, "Components");
    await input.fill("ta");
    await expect(item(components, "tabs")).toBeVisible();
    await expect(item(components, "toast")).toBeHidden();
    await expect(item(components, "button")).toBeHidden();
    await expect(item(components, "patterns")).toBeHidden();
    const ranges = await page.evaluate(() => (CSS as any).highlights.get("faqir-tree-match")?.size ?? 0);
    expect(ranges).toBe(1);
    await expect(page.locator("[data-ui='tree-view'] > [data-part='status']")).toHaveText("1 item matches ta");

    await page.keyboard.press("ArrowDown");
    await expect(item(components, "recipes")).toBeFocused();
    await input.focus();
    await page.keyboard.press("Escape");
    await expect(item(components, "button")).toBeVisible();
    await expect(item(components, "patterns")).toHaveAttribute("aria-expanded", "false");
  });

  test("clicking a checkbox row checks its subtree; Space unchecks it", async ({ page }) => {
    const backup = tree(page, "Folders to back up");
    await row(backup, "documents").click();
    for (const value of ["documents", "invoices", "taxes", "taxes-2024", "taxes-2025", "drafts"]) {
      await expect(item(backup, value)).toHaveAttribute("aria-checked", "true");
    }
    await page.keyboard.press("Space");
    await expect(item(backup, "taxes")).toHaveAttribute("aria-checked", "false");
    await row(backup, "taxes-2025").click();
    await expect(item(backup, "taxes")).toHaveAttribute("aria-checked", "mixed");
    await expect(item(backup, "documents")).toHaveAttribute("aria-checked", "mixed");
  });
});
