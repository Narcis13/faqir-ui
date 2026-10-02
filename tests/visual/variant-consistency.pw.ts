/**
 * Computed variant geometry — task 0.9-11.
 *
 * Structural parity is proved under Bun. These are the properties only a real
 * layout engine can answer: mixed-size baselines, visible callout accents,
 * progress-label containment, and carousel scroll containment/reachability.
 *
 * Task 1.1F-17 adds button: what `aria-pressed="true"` computes to per variant
 * (and under the pointer, and in forced colors), and the box a link button
 * keeps when it also carries a size.
 */

import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REGISTRY = join(dirname(fileURLToPath(import.meta.url)), "../../registry");
const TOKENS = [
  "palette", "spacing", "typography", "effects", "motion", "semantic", "aliases",
  "document", "doc-aliases", "density",
];
const BASE = ["reset", "prose", "rhythm", "motion-presets"];
const COMPONENTS: Array<["primitives" | "recipes", string]> = [
  ["primitives", "avatar"],
  ["primitives", "badge"],
  ["primitives", "button"],
  ["primitives", "callout"],
  ["primitives", "progress"],
  ["primitives", "text"],
  ["primitives", "toggle"],
  ["recipes", "carousel"],
];

const read = (...parts: string[]): string => readFileSync(join(REGISTRY, ...parts), "utf8");
const CSS = [
  ...TOKENS.map((name) => read("tokens", `${name}.css`)),
  ...BASE.map((name) => read("base", `${name}.css`)),
  read("themes", "default.css"),
  ...COMPONENTS.map(([layer, name]) => read(layer, name, `${name}.css`)),
].join("\n");

function documentFor(body: string): string {
  return `<!DOCTYPE html><html lang="en" data-theme="light"><head><meta charset="utf-8">
<style>${CSS}</style></head><body><main>${body}</main></body></html>`;
}

async function mount(page: Page, body: string): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.route(/^https?:\/\//, (route) => route.abort());
  await page.setContent(documentFor(body), { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
}

test("avatar and badge sizes share one computed bottom baseline", async ({ page }) => {
  await mount(
    page,
    `<p data-size-row="avatar">
      <span data-ui="avatar" data-size="sm"><span data-part="fallback">SM</span></span>
      <span data-ui="avatar" data-size="md"><span data-part="fallback">MD</span></span>
      <span data-ui="avatar" data-size="lg"><span data-part="fallback">LG</span></span>
    </p>
    <p data-size-row="badge">
      <span data-ui="badge" data-size="sm">Small</span>
      <span data-ui="badge" data-size="md">Medium</span>
      <span data-ui="badge" data-size="lg">Large</span>
    </p>`,
  );

  for (const component of ["avatar", "badge"]) {
    const geometry = await page.locator(`[data-size-row="${component}"] > [data-ui="${component}"]`)
      .evaluateAll((elements) => elements.map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          size: element.getAttribute("data-size"),
          bottom: rect.bottom,
          verticalAlign: getComputedStyle(element).verticalAlign,
        };
      }));
    expect(geometry.map((entry) => entry.size)).toEqual(["sm", "md", "lg"]);
    expect(new Set(geometry.map((entry) => entry.verticalAlign))).toEqual(new Set(["bottom"]));
    for (const entry of geometry.slice(1)) {
      expect(entry.bottom, `${component}/${entry.size} is off the shared baseline`)
        .toBeCloseTo(geometry[0].bottom, 5);
    }
  }
});

test("every callout variant paints the same visible inline-start accent", async ({ page }) => {
  const variants = ["info", "warning", "destructive", "success", "muted"];
  await mount(
    page,
    variants.map((variant) =>
      `<div data-ui="callout" data-variant="${variant}" role="note"><div data-part="content">${variant}</div></div>`,
    ).join("\n"),
  );

  const accents = await page.locator('[data-ui="callout"]').evaluateAll((elements) =>
    elements.map((element) => {
      const style = getComputedStyle(element);
      return {
        variant: element.getAttribute("data-variant"),
        width: Number.parseFloat(style.borderInlineStartWidth),
        style: style.borderInlineStartStyle,
        color: style.borderInlineStartColor,
        background: style.backgroundColor,
      };
    }),
  );
  expect(accents.map((accent) => accent.variant)).toEqual(variants);
  expect(new Set(accents.map((accent) => accent.width))).toEqual(new Set([3]));
  for (const accent of accents) {
    expect(accent.style, `${accent.variant} has no solid accent`).toBe("solid");
    expect(accent.color, `${accent.variant} accent is transparent`).not.toBe("rgba(0, 0, 0, 0)");
    expect(accent.color, `${accent.variant} accent blends into its surface`).not.toBe(accent.background);
  }
});

test("every progress label, including 100%, stays fully inside its root", async ({ page }) => {
  await mount(page, `<section data-progress-reference>${read("primitives", "progress", "progress.html")}</section>`);

  const labels = await page.locator('[data-progress-reference] > [data-ui="progress"]')
    .evaluateAll((roots) => roots.map((root) => {
      const label = root.querySelector<HTMLElement>(':scope > [data-part="label"]');
      if (!label || !label.firstChild) return { text: null };
      const rootRect = root.getBoundingClientRect();
      const labelRect = label.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(label);
      const textRect = range.getBoundingClientRect();
      return {
        text: label.textContent?.trim() ?? "",
        rootLeft: rootRect.left,
        rootRight: rootRect.right,
        labelLeft: labelRect.left,
        labelRight: labelRect.right,
        textLeft: textRect.left,
        textRight: textRect.right,
      };
    }));

  expect(labels.map((label) => label.text)).toEqual(["60%", "100%", "40%", "75%"]);
  for (const label of labels) {
    expect(label.labelLeft!, `${label.text} label starts outside the progress root`)
      .toBeGreaterThanOrEqual(label.rootLeft!);
    expect(label.labelRight!, `${label.text} label ends outside the progress root`)
      .toBeLessThanOrEqual(label.rootRight!);
    expect(label.textLeft!, `${label.text} text starts outside the progress root`)
      .toBeGreaterThanOrEqual(label.rootLeft!);
    expect(label.textRight!, `${label.text} text is clipped at the inline end`)
      .toBeLessThan(label.rootRight!);
  }
});

test("carousel overflow stays in its viewport and every slide remains reachable", async ({ page }) => {
  await mount(page, `<section data-carousel-reference>${read("recipes", "carousel", "carousel.html")}</section>`);

  const carousels = page.locator('[data-carousel-reference] > [data-ui="carousel"]');
  await expect(carousels).toHaveCount(2);
  for (let index = 0; index < await carousels.count(); index++) {
    const result = await carousels.nth(index).evaluate(async (root) => {
      const viewport = root.querySelector<HTMLElement>(':scope > [data-part="viewport"]')!;
      const slides = [...viewport.querySelectorAll<HTMLElement>(':scope > [data-part="slide"]')];
      const rootRect = root.getBoundingClientRect();
      const viewportRect = viewport.getBoundingClientRect();
      const initiallyOffscreen = slides.filter((slide) => {
        const rect = slide.getBoundingClientRect();
        return rect.left >= viewportRect.right || rect.right <= viewportRect.left;
      }).length;
      const reachable: boolean[] = [];
      for (const slide of slides) {
        viewport.scrollTo({ left: slide.offsetLeft, behavior: "instant" as ScrollBehavior });
        await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        const rect = slide.getBoundingClientRect();
        reachable.push(rect.right > viewportRect.left && rect.left < viewportRect.right);
      }
      return {
        root: { left: rootRect.left, right: rootRect.right },
        viewport: { left: viewportRect.left, right: viewportRect.right },
        scrollWidth: viewport.scrollWidth,
        clientWidth: viewport.clientWidth,
        initiallyOffscreen,
        reachable,
      };
    });

    expect(result.viewport.left).toBeGreaterThanOrEqual(result.root.left);
    expect(result.viewport.right).toBeLessThanOrEqual(result.root.right);
    expect(result.scrollWidth).toBeGreaterThan(result.clientWidth);
    expect(result.initiallyOffscreen).toBeGreaterThan(0);
    expect(result.reachable).toEqual(result.reachable.map(() => true));
  }
});

/** Paint-relevant computed colours of one element. */
const PAINT = (element: Element) => {
  const style = getComputedStyle(element);
  return {
    background: style.backgroundColor,
    border: style.borderTopColor,
    color: style.color,
  };
};

/** What the pressed tokens resolve to, read off probes the cascade cannot touch. */
const PRESSED_PROBES = `<span data-probe="subtle" style="background: var(--color-primary-subtle)"></span>
<span data-probe="primary" style="background: var(--color-primary)"></span>`;

test("a pressed button shows it in default, outline and ghost — and stays pressed under the pointer", async ({ page }) => {
  const variants = [null, "default", "outline", "ghost"];
  await mount(
    page,
    `${PRESSED_PROBES}
    ${variants.map((variant) => {
      const attr = variant ? ` data-variant="${variant}"` : "";
      return `<p><button data-ui="button"${attr} type="button" aria-pressed="true" data-case="${variant ?? "none"}-on">On</button>
      <button data-ui="button"${attr} type="button" aria-pressed="false" data-case="${variant ?? "none"}-off">Off</button></p>`;
    }).join("\n")}`,
  );

  const subtle = await page.locator('[data-probe="subtle"]').evaluate((el) => getComputedStyle(el).backgroundColor);
  const primary = await page.locator('[data-probe="primary"]').evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(subtle).not.toBe(primary);

  for (const variant of variants) {
    const name = variant ?? "none";
    const on = page.locator(`[data-case="${name}-on"]`);
    const off = page.locator(`[data-case="${name}-off"]`);
    // Transitions would report a colour mid-flight.
    await page.addStyleTag({ content: `[data-ui="button"] { transition: none !important; }` });

    expect(await on.evaluate(PAINT), `${name}: pressed`).toEqual({
      background: subtle,
      border: primary,
      color: primary,
    });
    const released = await off.evaluate(PAINT);
    expect(released.background, `${name}: aria-pressed="false" is not styled as pressed`).not.toBe(subtle);
    expect(released.color).not.toBe(primary);

    // The variant's own :hover fill is the more specific rule without the twin.
    await on.hover();
    expect((await on.evaluate(PAINT)).background, `${name}: pressed + hover`).toBe(subtle);
    await page.mouse.move(0, 0);
  }
});

test("a filled or link button gets no pressed style", async ({ page }) => {
  const variants = ["primary", "secondary", "destructive", "link"];
  await mount(
    page,
    variants.map((variant) =>
      `<p><button data-ui="button" data-variant="${variant}" type="button" aria-pressed="true" data-case="${variant}-on">On</button>
      <button data-ui="button" data-variant="${variant}" type="button" data-case="${variant}-plain">Plain</button></p>`,
    ).join("\n"),
  );
  for (const variant of variants) {
    expect(
      await page.locator(`[data-case="${variant}-on"]`).evaluate(PAINT),
      `${variant}: aria-pressed changed its paint`,
    ).toEqual(await page.locator(`[data-case="${variant}-plain"]`).evaluate(PAINT));
  }
});

test("forced colors: a pressed button and a pressed toggle are Highlight / HighlightText", async ({ page }) => {
  await mount(
    page,
    `<span data-probe="highlight" style="background: Highlight; color: HighlightText"></span>
    <button data-ui="button" data-variant="outline" type="button" aria-pressed="true" data-case="button-on">On</button>
    <button data-ui="button" data-variant="outline" type="button" aria-pressed="false" data-case="button-off">Off</button>
    <button data-ui="toggle" type="button" aria-pressed="true" data-case="toggle-on">On</button>
    <button data-ui="toggle" type="button" aria-pressed="false" data-case="toggle-off">Off</button>`,
  );
  await page.emulateMedia({ forcedColors: "active" });
  await page.addStyleTag({ content: `[data-ui] { transition: none !important; }` });

  const system = await page.locator('[data-probe="highlight"]').evaluate((el) => {
    const style = getComputedStyle(el);
    return { background: style.backgroundColor, color: style.color };
  });

  for (const component of ["button", "toggle"]) {
    const on = page.locator(`[data-case="${component}-on"]`);
    expect(await on.evaluate(PAINT), `${component}: pressed`).toEqual({
      background: system.background,
      border: system.background,
      color: system.color,
    });
    // Without the rule the OS palette paints both the same.
    const off = await page.locator(`[data-case="${component}-off"]`).evaluate(PAINT);
    expect(off.background, `${component}: released`).not.toBe(system.background);

    await on.hover();
    expect((await on.evaluate(PAINT)).background, `${component}: pressed + hover`).toBe(system.background);
    await page.mouse.move(0, 0);
  }
});

test("a link button with a size keeps the text's own box", async ({ page }) => {
  await mount(
    page,
    `<p><button data-ui="button" data-variant="link" data-case="link">Link</button>
    <button data-ui="button" data-variant="link" data-size="sm" data-case="link-sm">Link</button>
    <button data-ui="button" data-variant="link" data-size="lg" data-case="link-lg">Link</button>
    <button data-ui="button" data-size="sm" data-case="default-sm">Default</button>
    <button data-ui="button" data-size="lg" data-case="default-lg">Default</button></p>`,
  );

  const box = (name: string) =>
    page.locator(`[data-case="${name}"]`).evaluate((element) => {
      const style = getComputedStyle(element);
      const px = (value: string) => Number.parseFloat(value);
      return {
        height: element.getBoundingClientRect().height,
        // `line-height: 1` computes to the font size; the box is that plus its border.
        text: px(style.lineHeight) + px(style.borderTopWidth) + px(style.borderBottomWidth),
        paddingStart: px(style.paddingInlineStart),
        paddingEnd: px(style.paddingInlineEnd),
        fontSize: px(style.fontSize),
      };
    });

  for (const size of ["sm", "lg"]) {
    const link = await box(`link-${size}`);
    const sized = await box(`default-${size}`);
    expect(link.height, `link/${size} is taller than its line of text`).toBeCloseTo(link.text, 1);
    expect(link.paddingStart).toBe(0);
    expect(link.paddingEnd).toBe(0);
    // The size still means something: its font size.
    expect(link.fontSize).toBe(sized.fontSize);
    expect(link.height).toBeLessThan(sized.height);
  }
  expect((await box("link-sm")).fontSize).toBeLessThan((await box("link")).fontSize);
  expect((await box("link-lg")).fontSize).toBeGreaterThan((await box("link")).fontSize);
});
