/**
 * The image family in a real engine: the image primitive's new CSS (ratio,
 * focal point, fit, caption placement, placeholders) measured off computed
 * styles, and the two recipes built on it — lightbox and image-compare —
 * driven by a real pointer and a real keyboard on their reference pages.
 *
 * Run: `npx playwright test --config=playwright.browser.config.ts image`
 */

import { test, expect, type Page } from "@playwright/test";
import { liveReferencePage } from "./harness";

const IMAGE = liveReferencePage("registry/primitives/image/image.html");
const LIGHTBOX = liveReferencePage("registry/recipes/lightbox/lightbox.html");
const COMPARE = liveReferencePage("registry/recipes/image-compare/image-compare.html");

// ── image primitive ─────────────────────────────────────────────────────────

test.describe("image · ratio, focus, fit, caption, placeholder", () => {
  test.beforeEach(async ({ page }) => {
    await page.setContent(IMAGE, { waitUntil: "load" });
  });

  const img = (page: Page, sel: string) =>
    page.evaluate((sel) => {
      const el = document.querySelector(sel) as HTMLElement;
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return { fit: cs.objectFit, pos: cs.objectPosition, w: r.width, h: r.height, opacity: cs.opacity, origin: cs.transformOrigin };
    }, sel);

  test("a ratio crops to its shape and --image-focus moves the crop", async ({ page }) => {
    const centre = await img(page, 'figure[data-ratio="square"]:not([style]) > img');
    expect(centre.fit).toBe("cover");
    expect(centre.pos).toBe("50% 50%");
    expect(Math.abs(centre.w - centre.h)).toBeLessThan(1);

    const focused = await img(page, 'figure[data-ratio="square"][data-hover="zoom"] > img');
    expect(focused.pos).toBe("78% 34%");
    // …and the hover zoom leans in toward the same point.
    const [ox, oy] = focused.origin.split(" ").map(parseFloat);
    expect(ox).toBeCloseTo(0.78 * focused.w, 0);
    expect(oy).toBeCloseTo(0.34 * focused.h, 0);

    const portrait = await img(page, 'figure[data-ratio="portrait"] > img');
    expect(portrait.h / portrait.w).toBeCloseTo(4 / 3, 1);
    const wide = await img(page, 'figure[data-ratio="16-9"] > img');
    expect(wide.w / wide.h).toBeCloseTo(16 / 9, 1);
  });

  test("data-fit overrides object-fit and letterboxes on the muted background", async ({ page }) => {
    const fit = await img(page, 'figure[data-fit="contain"] > img');
    expect(fit.fit).toBe("contain");
    const bg = await page.evaluate(() => getComputedStyle(document.querySelector('figure[data-fit="contain"] > img')!).backgroundColor);
    expect(bg).not.toBe("rgba(0, 0, 0, 0)");
  });

  test("an overlay caption sits over the bottom edge of the picture", async ({ page }) => {
    const geo = await page.evaluate(() => {
      const fig = document.querySelector('figure[data-caption="overlay"]')!;
      const i = fig.querySelector("img")!.getBoundingClientRect();
      const c = fig.querySelector("figcaption")!.getBoundingClientRect();
      return { imgBottom: i.bottom, capBottom: c.bottom, capTop: c.top, imgTop: i.top, color: getComputedStyle(fig.querySelector("figcaption")!).color };
    });
    expect(Math.abs(geo.capBottom - geo.imgBottom)).toBeLessThan(2);
    expect(geo.capTop).toBeGreaterThan(geo.imgTop);
  });

  test("a below caption is start-aligned; the default stays centred", async ({ page }) => {
    const align = await page.evaluate(() => [
      getComputedStyle(document.querySelector('figure[data-caption="below"] > figcaption')!).textAlign,
      getComputedStyle(document.querySelector('figure[data-size="lg"]:not([data-caption]) > figcaption')!).textAlign,
    ]);
    expect(align).toEqual(["start", "center"]);
  });

  test("placeholders paint behind the picture; loading holds it back; the skeleton is bounded", async ({ page }) => {
    const p = await page.evaluate(() => {
      const blur = document.querySelector('figure[data-placeholder="blur"][data-state="loading"]')!;
      const skel = document.querySelector('figure[data-placeholder="skeleton"]')!;
      const b = getComputedStyle(blur, "::before");
      const s = getComputedStyle(skel, "::before");
      return {
        blurImage: b.backgroundImage,
        blurFilter: b.filter,
        held: getComputedStyle(blur.querySelector("img")!).opacity,
        loaded: getComputedStyle(document.querySelector('figure[data-state="loaded"] > img')!).animationName,
        skelLoading: s.animationIterationCount,
      };
    });
    expect(p.blurImage).toMatch(/^url\("data:image\/svg\+xml/);
    expect(p.blurFilter).toContain("blur(");
    expect(p.held).toBe("0");
    expect(p.loaded).toBe("faqir-image-reveal");
    expect(p.skelLoading).toBe("infinite");

    // Outside the loading state the shimmer stops after a few passes.
    await page.evaluate(() => document.querySelector('figure[data-placeholder="skeleton"]')!.removeAttribute("data-state"));
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('figure[data-placeholder="skeleton"]')!, "::before").animationIterationCount)).toBe("8");
  });

  test("reduced motion stops the placeholder motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const names = await page.evaluate(() => [
      getComputedStyle(document.querySelector('figure[data-placeholder="skeleton"]')!, "::before").animationName,
      getComputedStyle(document.querySelector('figure[data-state="loaded"] > img')!).animationName,
    ]);
    expect(names).toEqual(["none", "none"]);
  });

  test("markup without the new attributes is unchanged: responsive images keep their centre and no placeholder", async ({ page }) => {
    const plain = await page.evaluate(() => {
      const fig = document.querySelector('figure[data-ui="image"]:not([data-variant]):not([data-size])')!;
      return { display: getComputedStyle(fig).display, before: getComputedStyle(fig, "::before").content, fit: getComputedStyle(fig.querySelector("img")!).objectFit };
    });
    expect(plain).toEqual({ display: "inline-block", before: "none", fit: "contain" });
  });
});

// ── lightbox ────────────────────────────────────────────────────────────────

test.describe("lightbox · live", () => {
  test.beforeEach(async ({ page }) => {
    await page.setContent(LIGHTBOX, { waitUntil: "load" });
  });

  const items = (page: Page) => page.locator('[data-ui="lightbox"] [data-part="item"]');
  const viewer = (page: Page) => page.getByRole("dialog", { name: "Image viewer" });

  test("Enter on a thumbnail opens it; Tab stays inside; Escape returns focus", async ({ page }) => {
    await items(page).nth(1).focus();
    await page.keyboard.press("Enter");
    await expect(viewer(page)).toBeVisible();
    await expect(page.locator('[data-ui="lightbox"]')).toHaveAttribute("data-state", "open");
    await expect(page.locator('[data-part="counter"]')).toHaveText("2 / 6");
    await expect(page.locator('[data-part="image"]')).toHaveAttribute("alt", "Golden dunes under a blue sky");
    await expect(page.locator('[data-part="stage"]')).toHaveAttribute("data-state", "loaded");

    // Focus is trapped: Tab round the viewer's buttons never leaves it.
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press("Tab");
      expect(await page.evaluate(() => !!document.activeElement?.closest('[data-part="panel"]'))).toBe(true);
    }
    await page.keyboard.press("Escape");
    await expect(page.locator('[data-ui="lightbox"]')).toHaveAttribute("data-state", "closed");
    await expect(viewer(page)).toBeHidden();
    await expect(items(page).nth(1)).toBeFocused();
  });

  test("arrows, Home/End and the buttons move through the set, and the move is announced", async ({ page }) => {
    await items(page).first().click();
    await page.keyboard.press("ArrowRight");
    await expect(page.locator('[data-part="counter"]')).toHaveText("2 / 6");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await expect(page.locator('[data-part="counter"]')).toHaveText("6 / 6");
    await expect(page.locator('[data-part="status"]')).toHaveText("Image 6 of 6: A city skyline at night under a crescent moon");
    await page.getByRole("button", { name: "Next image" }).click();
    await expect(page.locator('[data-part="counter"]')).toHaveText("1 / 6");
    await page.keyboard.press("End");
    await expect(page.locator('[data-part="caption"]')).toHaveText("Midnight on the waterfront");
  });

  test("RTL mirrors the arrows", async ({ page }) => {
    await page.evaluate(() => document.documentElement.setAttribute("dir", "rtl"));
    await items(page).first().click();
    await page.keyboard.press("ArrowLeft");
    await expect(page.locator('[data-part="counter"]')).toHaveText("2 / 6");
  });

  test("zoom by button, key, wheel and double-click; a drag pans within the picture's edges", async ({ page }) => {
    await items(page).nth(2).click();
    const zoom = () => page.evaluate(() => Number((document.querySelector('[data-part="panel"]') as HTMLElement).style.getPropertyValue("--lightbox-zoom")));
    await page.getByRole("button", { name: "Zoom in" }).click();
    expect(await zoom()).toBe(1.5);
    await page.keyboard.press("+");
    expect(await zoom()).toBe(2);
    await expect(page.locator('[data-part="image"]')).toHaveAttribute("data-state", "zoomed");

    const box = (await page.locator('[data-part="image"]').boundingBox())!;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 5000, cy + 5000, { steps: 4 });
    await page.mouse.up();
    const pan = await page.evaluate(() => {
      const panel = document.querySelector('[data-part="panel"]') as HTMLElement;
      const stage = document.querySelector('[data-part="stage"]') as HTMLElement;
      const image = document.querySelector('[data-part="image"]') as HTMLElement;
      return {
        x: parseFloat(panel.style.getPropertyValue("--lightbox-x")),
        maxX: (image.offsetWidth * 2 - stage.clientWidth) / 2,
      };
    });
    expect(pan.x).toBeGreaterThan(0);
    expect(pan.x).toBeLessThanOrEqual(Math.max(0, pan.maxX) + 0.5);
    await expect(page.locator('[data-ui="lightbox"]')).toHaveAttribute("data-state", "open"); // a pan is not a close

    await page.keyboard.press("0");
    expect(await zoom()).toBe(1);
    await page.mouse.move(cx, cy);
    await page.mouse.wheel(0, -400);
    await expect.poll(zoom).toBeGreaterThan(2);
    await page.keyboard.press("0");
    await page.locator('[data-part="image"]').dblclick();
    expect(await zoom()).toBe(2.5);
  });

  test("a click on the empty stage closes, a click on the picture does not", async ({ page }) => {
    await items(page).first().click();
    await page.locator('[data-part="image"]').click();
    await expect(page.locator('[data-ui="lightbox"]')).toHaveAttribute("data-state", "open");
    const stage = (await page.locator('[data-part="stage"]').boundingBox())!;
    const pic = (await page.locator('[data-part="image"]').boundingBox())!;
    // A point on the stage just beside the picture (the stage is wider than it).
    expect(pic.x - stage.x).toBeGreaterThan(80);
    await page.mouse.click(pic.x - 12, stage.y + stage.height / 2);
    await expect(page.locator('[data-ui="lightbox"]')).toHaveAttribute("data-state", "closed");
  });
});

// ── image-compare ───────────────────────────────────────────────────────────

test.describe("image-compare · live", () => {
  test.beforeEach(async ({ page }) => {
    await page.setContent(COMPARE, { waitUntil: "load" });
  });

  const first = '[data-ui="image-compare"]:not([data-mode]):not([data-orientation])';
  const position = (page: Page, sel: string) =>
    page.evaluate((sel) => (document.querySelector(sel) as HTMLElement).style.getPropertyValue("--image-compare-pos"), sel);

  test("a press and drag move the divider, and the before picture is clipped there", async ({ page }) => {
    const box = (await page.locator(first).boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.7, box.y + box.height / 2, { steps: 5 });
    await page.mouse.up();
    expect(parseFloat(await position(page, first))).toBeCloseTo(70, 0);
    const slider = page.getByRole("slider", { name: "Before and after divider" });
    await expect(slider).toBeFocused();
    await expect(slider).toHaveAttribute("aria-valuetext", "70% before, 30% after");
    // The before picture's visible width ends at the divider.
    const clip = await page.evaluate((sel) => getComputedStyle(document.querySelector(`${sel} [data-part="before"]`)!).clipPath, first);
    expect(clip).toContain("30%");
  });

  test("keyboard: arrows, Page keys, Home and End", async ({ page }) => {
    const slider = page.getByRole("slider", { name: "Before and after divider" });
    await slider.focus();
    await page.keyboard.press("ArrowRight");
    await expect(slider).toHaveAttribute("aria-valuenow", "51");
    await page.keyboard.press("PageDown");
    await expect(slider).toHaveAttribute("aria-valuenow", "41");
    await page.keyboard.press("End");
    await expect(slider).toHaveAttribute("aria-valuenow", "100");
    await page.keyboard.press("Home");
    await expect(slider).toHaveAttribute("aria-valuenow", "0");
  });

  test("RTL: before is on the right, and ArrowLeft moves the divider toward the end", async ({ page }) => {
    await page.evaluate(() => document.documentElement.setAttribute("dir", "rtl"));
    const slider = page.getByRole("slider", { name: "Before and after divider" });
    await slider.focus();
    await page.keyboard.press("ArrowLeft");
    await expect(slider).toHaveAttribute("aria-valuenow", "51");
    const box = (await page.locator(first).boundingBox())!;
    await page.mouse.click(box.x + box.width * 0.25, box.y + box.height / 2);
    await expect(slider).toHaveAttribute("aria-valuenow", "75");
    const clip = await page.evaluate((sel) => getComputedStyle(document.querySelector(`${sel} [data-part="before"]`)!).clipPath, first);
    expect(clip).toMatch(/^inset\(0px 0px 0px 25%\)$/);
  });

  test("vertical reads the pointer's height; hover mode follows without a press", async ({ page }) => {
    const v = '[data-ui="image-compare"][data-orientation="vertical"]';
    await page.locator(v).scrollIntoViewIfNeeded();
    const vb = (await page.locator(v).boundingBox())!;
    await page.mouse.click(vb.x + vb.width / 2, vb.y + vb.height * 0.8);
    expect(parseFloat(await position(page, v))).toBeCloseTo(80, 0);

    const h = '[data-ui="image-compare"][data-mode="hover"]';
    await page.locator(h).scrollIntoViewIfNeeded();
    const hb = (await page.locator(h).boundingBox())!;
    await page.mouse.move(hb.x + hb.width * 0.6, hb.y + hb.height / 2);
    await page.mouse.move(hb.x + hb.width * 0.9, hb.y + hb.height / 2, { steps: 3 });
    expect(parseFloat(await position(page, h))).toBeCloseTo(90, 0);
  });
});
