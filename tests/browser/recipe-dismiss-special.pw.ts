/**
 * The three dismissible recipes whose state vocabulary is not `open` ⇄ `closed`,
 * each walked through its own documented paths in a real browser. [W2-1 gate]
 *
 * `recipe-dismiss.pw.ts` covers the generic population. These three do not fit
 * that shape and would have been quietly skipped by it — which is the failure
 * mode this whole wave exists to end — so they are written out by hand:
 *
 *   • `toast`   entering → visible → exiting → gone. The dismissed thing is a
 *               CHILD of the `[data-ui]` root, not the root, and the same
 *               bubbling `transitionend` hazard applies: the toast's own close
 *               and action buttons transition `background` on hover.
 *   • `tooltip` hidden ⇄ visible, driven by hover and by focus, each with its
 *               own delay, plus Escape.
 *   • `sidebar` expanded ⇄ rail on desktop, drawer ⇄ drawer-open on mobile —
 *               the mobile drawer being the one that locks body scroll and
 *               raises an overlay, i.e. the one that can strand a page.
 */

import { test, expect } from "@playwright/test";
import { liveReferencePage, recipe } from "./harness";

const API = `
window.__api = (el) => {
  for (const k of Object.keys(el)) if (k.startsWith('_faqir')) return el[k];
  return null;
};
`;

// ── toast ───────────────────────────────────────────────────────────────────

test.describe("toast", () => {
  const toast = recipe("toast");

  test.beforeEach(async ({ page }) => {
    await page.setContent(liveReferencePage(toast.htmlRel), { waitUntil: "load" });
    await page.addScriptTag({ content: API });
  });

  test("a programmatically added toast is removed by dismiss()", async ({ page }) => {
    const before = await page.locator("#toast-demo-top-right [data-part='toast']").count();

    const id = await page.evaluate(() =>
      (window as any)
        .__api(document.getElementById("toast-demo-top-right"))
        .add({ message: "Saved", actionLabel: "Undo", duration: 0 }),
    );
    await page.waitForTimeout(600);

    const added = page.locator(`#toast-demo-top-right [data-toast-id="${id}"]`);
    await expect(added).toHaveCount(1);
    await expect(added).toHaveAttribute("data-state", "visible");

    await page.evaluate(
      (id) => (window as any).__api(document.getElementById("toast-demo-top-right")).dismiss(id),
      id,
    );
    await page.waitForTimeout(900);

    await expect(added).toHaveCount(0);
    await expect(page.locator("#toast-demo-top-right [data-part='toast']")).toHaveCount(before);
  });

  test("every close button removes its own toast, and only that one", async ({ page }) => {
    // A real pointer on each close button in turn — the hover transition those
    // buttons run is exactly what used to be mistaken for the toast's own exit.
    for (const container of [
      "#toast-demo-top-right",
      "#toast-demo-top-left",
      "#toast-demo-bottom-right",
      "#toast-demo-bottom-left",
    ]) {
      const toasts = page.locator(`${container} [data-part='toast']`);
      let remaining = await toasts.count();
      expect(remaining, `${container} declares no toast`).toBeGreaterThan(0);

      while (remaining > 0) {
        const close = toasts.first().locator("[data-part='close']");
        await close.scrollIntoViewIfNeeded().catch(() => {});
        await close.click({ force: true });
        await page.waitForTimeout(900);
        remaining -= 1;
        await expect(toasts).toHaveCount(remaining);
      }
    }
    // Nothing left half-exited anywhere on the page.
    await expect(page.locator("[data-part='toast'][data-state='exiting']")).toHaveCount(0);
  });

  test("dismissAll empties the stack", async ({ page }) => {
    await page.evaluate(() => {
      const api = (window as any).__api(document.getElementById("toast-demo-top-right"));
      api.add({ message: "one", duration: 0 });
      api.add({ message: "two", duration: 0 });
      api.dismissAll();
    });
    await page.waitForTimeout(900);
    // dismissAll empties the container it belongs to — added and authored alike.
    await expect(page.locator("#toast-demo-top-right [data-part='toast']")).toHaveCount(0);
  });

  test("auto-dismiss removes a timed toast on its own", async ({ page }) => {
    await page.evaluate(() =>
      (window as any)
        .__api(document.getElementById("toast-demo-top-right"))
        .add({ message: "brief", duration: 250 }),
    );
    await page.waitForTimeout(1400);
    await expect(page.locator("[data-part='toast'] [data-part='message']", { hasText: "brief" })).toHaveCount(0);
  });
});

// ── tooltip ─────────────────────────────────────────────────────────────────

test.describe("tooltip", () => {
  const tooltip = recipe("tooltip");

  test.beforeEach(async ({ page }) => {
    await page.setContent(liveReferencePage(tooltip.htmlRel), { waitUntil: "load" });
    await page.addScriptTag({ content: API });
  });

  test("hover shows and unhover hides, on every instance", async ({ page }) => {
    const roots = page.locator("[data-ui='tooltip']");
    const count = await roots.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const root = roots.nth(i);
      const trigger = root.locator("[data-part='trigger']").first();
      await trigger.scrollIntoViewIfNeeded().catch(() => {});
      await trigger.hover();
      await page.waitForTimeout(500); // 200ms show delay + slack
      await expect(root).toHaveAttribute("data-state", "visible");

      await page.mouse.move(0, 0);
      await page.waitForTimeout(500); // 100ms hide delay + slack
      await expect(root).toHaveAttribute("data-state", "hidden");
    }
  });

  test("focus shows, blur hides, and Escape dismisses", async ({ page }) => {
    const root = page.locator("[data-ui='tooltip']").first();
    const trigger = root.locator("[data-part='trigger']").first();

    await trigger.focus();
    await page.waitForTimeout(500);
    await expect(root).toHaveAttribute("data-state", "visible");

    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
    await expect(root).toHaveAttribute("data-state", "hidden");

    // Escape dismisses without moving focus, and the tooltip must stay down
    // until the trigger is focused afresh — so blur first, then refocus.
    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
    await trigger.focus();
    await page.waitForTimeout(500);
    await expect(root).toHaveAttribute("data-state", "visible");

    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
    await page.waitForTimeout(500);
    await expect(root).toHaveAttribute("data-state", "hidden");
  });
});

// ── sidebar ─────────────────────────────────────────────────────────────────

test.describe("sidebar", () => {
  const sidebar = recipe("sidebar");

  test("desktop: collapse to rail and expand back, by API and by trigger", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.setContent(liveReferencePage(sidebar.htmlRel), { waitUntil: "load" });
    await page.addScriptTag({ content: API });

    const root = page.locator("[data-ui='sidebar']").first();
    await root.evaluate((el) => (window as any).__api(el).collapse());
    await expect(root).toHaveAttribute("data-state", "rail");

    await root.evaluate((el) => (window as any).__api(el).expand());
    await expect(root).toHaveAttribute("data-state", "expanded");

    const trigger = root.locator("[data-part='trigger']").first();
    if (await trigger.count()) {
      await trigger.scrollIntoViewIfNeeded().catch(() => {});
      await trigger.click({ force: true });
      await expect(root).toHaveAttribute("data-state", "rail");
      await trigger.click({ force: true });
      await expect(root).toHaveAttribute("data-state", "expanded");
    }
  });

  test("mobile: the drawer opens and closes without stranding the page", async ({ page }) => {
    await page.setViewportSize({ width: 480, height: 800 });
    await page.setContent(liveReferencePage(sidebar.htmlRel), { waitUntil: "load" });
    await page.addScriptTag({ content: API });

    const root = page.locator("[data-ui='sidebar']").first();
    await expect(root).toHaveAttribute("data-state", "drawer");

    for (const dismiss of ["api", "overlay", "escape"] as const) {
      await root.evaluate((el) => (window as any).__api(el).open());
      await page.waitForTimeout(500);
      await expect(root).toHaveAttribute("data-state", "drawer-open");
      expect(await page.evaluate(() => document.body.style.overflow)).toBe("hidden");

      if (dismiss === "api") {
        await root.evaluate((el) => (window as any).__api(el).close());
      } else if (dismiss === "overlay") {
        const overlay = root.locator("[data-part='overlay']");
        if (!(await overlay.count())) {
          await root.evaluate((el) => (window as any).__api(el).close());
        } else {
          await overlay.dispatchEvent("click");
        }
      } else {
        await root.locator("[data-part='panel'] a, [data-part='panel'] button").first().focus();
        await page.keyboard.press("Escape");
      }
      await page.waitForTimeout(500);

      await expect(root).toHaveAttribute("data-state", "drawer");
      expect(
        await page.evaluate(() => document.body.style.overflow),
        `body left scroll-locked after ${dismiss}`,
      ).not.toBe("hidden");
    }
  });
});
