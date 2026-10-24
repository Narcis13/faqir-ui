/**
 * knob in a real engine: the shipped core, the shipped CSS, a real pointer and
 * a real keyboard, on the registry's own reference page.
 *
 * The Bun suite drives the controller under happy-dom, which has no layout, no
 * wheel default action and no l-model engine running beside it. This proves
 * the parts only a browser has: a drag measured in real pixels, the wheel
 * leaving the page alone until the knob has focus, the focus ring drawn on the
 * dial while focus sits on the invisible native range, a native form reset, and
 * l-model in both directions through the real directive.
 *
 * Run: `npx playwright test --config=playwright.browser.config.ts knob`
 */

import { test, expect, type Page } from "@playwright/test";
import { liveReferencePage } from "./harness";

const PAGE = liveReferencePage("registry/recipes/knob/knob.html");

const knob = (id: string) => `[data-ui="knob"]:has(#${id})`;

async function value(page: Page, id: string): Promise<number> {
  return page.evaluate((id) => Number((document.getElementById(id) as HTMLInputElement).value), id);
}

async function knobPos(page: Page, id: string): Promise<number> {
  return page.evaluate(
    (sel) => Number((document.querySelector(sel) as HTMLElement).style.getPropertyValue("--knob-pos")),
    knob(id),
  );
}

/** Centre of a knob's control, in page coordinates. */
async function centre(page: Page, id: string) {
  const box = (await page.locator(`${knob(id)} [data-part="control"]`).boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test.describe("knob · live", () => {
  test.beforeEach(async ({ page }) => {
    await page.setContent(PAGE, { waitUntil: "load" });
  });

  test("a vertical drag turns it, Shift is finer, and the dial follows", async ({ page }) => {
    const c = await centre(page, "knob-resonance");
    expect(await value(page, "knob-resonance")).toBe(68);

    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    await expect(page.locator(knob("knob-resonance"))).toHaveAttribute("data-state", "dragging");
    await page.mouse.move(c.x, c.y - 30, { steps: 6 }); // 30px of 200 = +15
    expect(await value(page, "knob-resonance")).toBe(83);
    await page.keyboard.down("Shift");
    await page.mouse.move(c.x, c.y - 70, { steps: 8 }); // 40px fine = +2
    await page.keyboard.up("Shift");
    await page.mouse.up();
    expect(await value(page, "knob-resonance")).toBe(85);
    await expect(page.locator(knob("knob-resonance"))).not.toHaveAttribute("data-state", /./);

    await expect(page.locator("#knob-resonance")).toBeFocused();
    await expect(page.locator("#knob-resonance")).toHaveAttribute("aria-valuetext", "85%");
    await expect(page.locator(`${knob("knob-resonance")} [data-part="output"]`)).toHaveText("85%");
    expect(await knobPos(page, "knob-resonance")).toBeCloseTo(0.85);
    // The indicator's rotation and the arc's dash are computed from --knob-pos:
    // 0.85 × 270 − 135 = 94.5deg, and a dash 85 of the path's 100 long.
    const sel = knob("knob-resonance");
    await expect
      .poll(() => page.evaluate((s) => getComputedStyle(document.querySelector(`${s} [data-part="indicator"]`)!).rotate, sel))
      .toBe("94.5deg");
    const dash = await page.evaluate((s) => getComputedStyle(document.querySelector(`${s} [data-part="arc"]`)!).strokeDasharray, sel);
    expect(dash).toMatch(/^(calc\()?85(\.\d+)?px\)?,\s*200px$/);
  });

  test("angular drag follows the pointer around the centre", async ({ page }) => {
    const c = await centre(page, "knob-master");
    await page.mouse.move(c.x, c.y - 40); // straight up: half way
    await page.mouse.down();
    expect(await value(page, "knob-master")).toBe(50);
    await page.mouse.move(c.x - 40, c.y, { steps: 4 }); // 9 o'clock: 45/270
    expect(await value(page, "knob-master")).toBe(17);
    await page.mouse.up();
  });

  test("keyboard: Tab to it, arrows, Page keys and Home/End, with the ring on the dial", async ({ page }) => {
    await page.locator("#knob-cutoff").focus();
    await page.keyboard.press("Tab"); // → resonance, through the real tab order
    await expect(page.locator("#knob-resonance")).toBeFocused();
    const ring = await page.evaluate(
      (sel) => getComputedStyle(document.querySelector(`${sel} [data-part="control"]`)!).outlineStyle,
      knob("knob-resonance"),
    );
    expect(ring).not.toBe("none");

    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("ArrowRight");
    expect(await value(page, "knob-resonance")).toBe(70);
    await page.keyboard.press("PageDown");
    expect(await value(page, "knob-resonance")).toBe(60);
    await page.keyboard.press("End");
    expect(await value(page, "knob-resonance")).toBe(100);
    await page.keyboard.press("Home");
    expect(await value(page, "knob-resonance")).toBe(0);

    // data-page-step="100" on the cutoff knob.
    await page.locator("#knob-cutoff").focus();
    await page.keyboard.press("PageUp");
    expect(await value(page, "knob-cutoff")).toBe(740);
    await expect(page.locator("#knob-cutoff")).toHaveAttribute("aria-valuetext", "740 Hz");
  });

  test("the wheel never hijacks the page: it turns a knob only once it has focus", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 400 });
    await page.setContent(PAGE, { waitUntil: "load" });
    const c = await centre(page, "knob-drive");
    await page.mouse.move(c.x, c.y);
    const before = await page.evaluate(() => scrollY);
    await page.mouse.wheel(0, 200);
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(before);
    expect(await value(page, "knob-drive")).toBe(9);

    await page.locator("#knob-drive").focus();
    const c2 = await centre(page, "knob-drive");
    await page.mouse.move(c2.x, c2.y);
    const still = await page.evaluate(() => scrollY);
    await page.mouse.wheel(0, -100); // one notch up = +5% of 0–24 = +1.2, snapped to 0.5
    await expect.poll(() => value(page, "knob-drive")).toBe(10);
    expect(await page.evaluate(() => scrollY)).toBe(still);
  });

  test("l-model: the model drives the dial, and the dial drives the model", async ({ page }) => {
    const model = page.locator('[l-data] strong[l-text="gain"]');
    await expect(model).toHaveText("64");

    await page.getByRole("button", { name: "Full" }).click();
    await expect.poll(() => value(page, "knob-gain")).toBe(100);
    expect(await knobPos(page, "knob-gain")).toBe(1);
    await expect(page.locator(`${knob("knob-gain")} [data-part="output"]`)).toHaveText("100%");

    await page.getByRole("button", { name: "Silence" }).click();
    expect(await knobPos(page, "knob-gain")).toBe(0);

    // And back the other way — a drag and a key, through the real directive.
    const c = await centre(page, "knob-gain");
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    await page.mouse.move(c.x + 50, c.y, { steps: 5 }); // 50px right = +25
    await page.mouse.up();
    await expect(model).toHaveText("25");
    await page.keyboard.press("PageUp");
    await expect(model).toHaveText("35");
  });

  test("a native form reset puts every dial back, and the form submits the values", async ({ page }) => {
    await page.locator("#knob-bass").focus();
    await page.keyboard.press("End");
    await page.locator("#knob-treble").focus();
    await page.keyboard.press("Home");
    const data = await page.evaluate(() => {
      const form = document.querySelector('form[aria-label="Equaliser"]') as HTMLFormElement;
      return Object.fromEntries(new FormData(form));
    });
    expect(data).toEqual({ bass: "12", treble: "-12" });

    await page.getByRole("button", { name: "Reset" }).click();
    await expect.poll(() => value(page, "knob-bass")).toBe(4);
    expect(await value(page, "knob-treble")).toBe(-3);
    await expect.poll(() => knobPos(page, "knob-bass")).toBeCloseTo(0.6667, 3);
    await expect(page.locator(`${knob("knob-treble")} [data-part="output"]`)).toHaveText("−3 dB");
  });

  test("a disabled knob is out of the tab order and ignores the pointer", async ({ page }) => {
    await page.locator("#knob-size-lg").focus();
    await page.keyboard.press("Tab");
    await expect(page.locator("#knob-disabled")).not.toBeFocused();
    const c = await centre(page, "knob-disabled");
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    await page.mouse.move(c.x, c.y - 60, { steps: 4 });
    await page.mouse.up();
    expect(await value(page, "knob-disabled")).toBe(40);
  });

  test("the input is the accessible slider", async ({ page }) => {
    const slider = page.getByRole("slider", { name: "Detune" });
    await expect(slider).toHaveAttribute("aria-valuetext", "+12 ct");
    await slider.focus();
    await page.keyboard.press("Home");
    await expect(slider).toHaveAttribute("aria-valuetext", "−50 ct");
  });
});
