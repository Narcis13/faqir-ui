/**
 * Responsive spot-check across the viewport axis (task 0.8-09).
 *
 * The `bun test` suites resolve the registry's sheets through a miniature
 * cascade — good enough to pin specificity and tier order, but it is still a
 * model of CSS, not CSS. This spec runs the two STRUCTURAL patterns through a
 * real engine at three widths and asks the browser what it actually computed.
 *
 * Deliberately assertions, not screenshots. Baselines for this suite are
 * produced in one pinned Linux container (see playwright.config.ts), so a new
 * `toHaveScreenshot` here would either ship images from a developer's laptop or
 * fail CI until someone regenerated them. Computed-style facts — "the drawer is
 * `position: fixed` and translated off-canvas at 390px, `static` at 768px" — are
 * platform-independent, and they are the claims that would actually regress.
 * Task 0.8-11 systematizes the viewport axis into the screenshot matrix; this is
 * the interim proof that the sheets behave, in a browser, right now.
 *
 * 390 / 768 / 1280 = an iPhone 14, the canon md floor exactly, and a laptop. The
 * middle width is the interesting one: it is the boundary, and mobile-first
 * min-width semantics mean it belongs to the WIDE side.
 */
import { expect, test, type Page } from "@playwright/test";
import { buildMatrix, buildPageHtml, type Case } from "./matrix";

/** Viewport widths every pattern below is measured at. */
const WIDTHS = { phone: 390, floor: 768, laptop: 1280 } as const;

/** The default-theme, light, LTR capture case for one component. */
function caseFor(name: string): Case {
  const found = buildMatrix().find(
    (c) => c.component.name === name && c.theme === "default" && c.scheme === "light" && c.dir === "ltr",
  );
  if (!found) throw new Error(`no matrix case for ${name}`);
  return found;
}

/** Mount a reference page at `width`, offline, with fonts settled. */
async function mount(page: Page, name: string, width: number): Promise<void> {
  await page.setViewportSize({ width, height: 900 });
  await page.route(/^https?:\/\//, (route) => route.abort());
  await page.setContent(buildPageHtml(caseFor(name)), { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
}

/** Computed values of `properties` for the first element matching `selector`. */
async function computed(
  page: Page,
  selector: string,
  properties: string[],
): Promise<Record<string, string>> {
  return page.evaluate(
    ([sel, props]) => {
      const el = document.querySelector(sel as string);
      if (!el) throw new Error(`no element for ${sel}`);
      const style = getComputedStyle(el);
      return Object.fromEntries((props as string[]).map((p) => [p, style.getPropertyValue(p)]));
    },
    [selector, properties] as const,
  );
}

// ── dashboard-shell — the off-canvas drawer ─────────────────────────────────

test.describe("dashboard-shell · the sidebar drawer", () => {
  const SHELL = '[data-ui="dashboard-shell"]';
  const SIDEBAR = `${SHELL} [data-part="sidebar"]`;

  /** Set (or clear) `data-state` on the first sidebar. */
  async function setState(page: Page, state: string | null): Promise<void> {
    await page.evaluate(
      ([sel, value]) => {
        const el = document.querySelector(sel as string)!;
        if (value === null) el.removeAttribute("data-state");
        else el.setAttribute("data-state", value as string);
      },
      [SIDEBAR, state] as const,
    );
  }

  test("is fixed and off-canvas at 390px", async ({ page }) => {
    await mount(page, "dashboard-shell", WIDTHS.phone);
    // The reference page authors data-state="expanded" — an OPEN drawer, which
    // is the right default for a screenshot. Clear it to see the closed one.
    await setState(page, null);

    expect((await computed(page, SIDEBAR, ["position"])).position).toBe("fixed");
    // `translateX(-100%)` computes to a matrix, so the readable assertion is
    // geometric: the whole box sits at or past the inline start edge.
    await expect
      .poll(async () => {
        const box = await page.locator(SIDEBAR).first().boundingBox();
        return box === null ? -1 : box.x + box.width;
      }, { timeout: 5_000 })
      .toBeLessThanOrEqual(0);

    // The shell itself is one column: content starts at the viewport edge.
    const columns = (await computed(page, SHELL, ["grid-template-columns"]))[
      "grid-template-columns"
    ];
    expect(columns.split(" ").length).toBe(1);
  });

  test("slides in when data-state=expanded, still at 390px", async ({ page }) => {
    await mount(page, "dashboard-shell", WIDTHS.phone);
    await setState(page, null);
    await expect
      .poll(async () => (await page.locator(SIDEBAR).first().boundingBox())!.x, { timeout: 5_000 })
      .toBeLessThan(0);

    await setState(page, "expanded");
    // The slide is a transition; wait for it to land rather than guessing.
    await expect
      .poll(async () => (await page.locator(SIDEBAR).first().boundingBox())!.x, { timeout: 5_000 })
      .toBeCloseTo(0, 0);
  });

  test("rejoins the grid as a real column at the md floor and stays there", async ({ page }) => {
    for (const width of [WIDTHS.floor, WIDTHS.laptop]) {
      await mount(page, "dashboard-shell", width);
      const style = await computed(page, SIDEBAR, ["position", "transform"]);
      expect(style.position, `@${width}px`).toBe("static");
      expect(style.transform, `@${width}px`).toBe("none");

      const box = (await page.locator(SIDEBAR).first().boundingBox())!;
      expect(box.x, `@${width}px the sidebar is on screen`).toBeGreaterThanOrEqual(0);

      const columns = (await computed(page, SHELL, ["grid-template-columns"]))[
        "grid-template-columns"
      ];
      expect(columns.split(" ").length, `@${width}px the shell has two columns`).toBe(2);
    }
  });
});

// ── inbox — the pane swap ───────────────────────────────────────────────────

test.describe("inbox · the single-pane swap", () => {
  const INBOX = '[data-ui="inbox"]';
  const LIST = `${INBOX} [data-part="list-pane"]`;
  const DETAIL = `${INBOX} [data-part="detail-pane"]`;
  const BACK = `${INBOX} [data-part="back"]`;

  /** Force one pane active and the other inactive on the first inbox. */
  async function select(page: Page, active: "list" | "detail"): Promise<void> {
    await page.evaluate((which) => {
      const root = document.querySelector('[data-ui="inbox"]')!;
      for (const part of ["list", "detail"]) {
        const pane = root.querySelector(`[data-part="${part}-pane"]`)!;
        pane.setAttribute("data-state", part === which ? "active" : "inactive");
      }
    }, active);
  }

  test("shows exactly one pane at 390px, and the back link with it", async ({ page }) => {
    await mount(page, "inbox", WIDTHS.phone);

    await select(page, "detail");
    expect(await page.locator(LIST).first().isVisible()).toBe(false);
    expect(await page.locator(DETAIL).first().isVisible()).toBe(true);
    expect(await page.locator(BACK).first().isVisible()).toBe(true);

    await select(page, "list");
    expect(await page.locator(LIST).first().isVisible()).toBe(true);
    expect(await page.locator(DETAIL).first().isVisible()).toBe(false);
  });

  test("shows both panes from the md floor up, whatever the selection says", async ({ page }) => {
    for (const width of [WIDTHS.floor, WIDTHS.laptop]) {
      await mount(page, "inbox", width);
      for (const active of ["list", "detail"] as const) {
        await select(page, active);
        expect(await page.locator(LIST).first().isVisible(), `list @${width}px`).toBe(true);
        expect(await page.locator(DETAIL).first().isVisible(), `detail @${width}px`).toBe(true);
        expect(await page.locator(BACK).first().isVisible(), `back @${width}px`).toBe(false);
      }
    }
  });

  test("the list column widens at lg, having arrived at md", async ({ page }) => {
    await mount(page, "inbox", WIDTHS.floor);
    const atFloor = (await page.locator(LIST).first().boundingBox())!.width;
    await mount(page, "inbox", WIDTHS.laptop);
    const atLaptop = (await page.locator(LIST).first().boundingBox())!.width;
    expect(atFloor).toBeGreaterThan(0);
    expect(atLaptop).toBeGreaterThan(atFloor);
  });
});

// ── auth-form — full bleed below sm, a card above it ────────────────────────

test.describe("auth-form · full bleed on the canon sm floor", () => {
  const CARD = '[data-ui="auth-form"] > [data-ui="card"]';

  test("is square, shadowless and edge-to-edge at 390px", async ({ page }) => {
    await mount(page, "auth-form", WIDTHS.phone);
    const style = await computed(page, CARD, ["border-radius", "box-shadow", "border-left-style"]);
    expect(style["border-radius"]).toBe("0px");
    expect(style["box-shadow"]).toBe("none");
    expect(style["border-left-style"]).toBe("none");
  });

  test("is a card again at the sm floor, in both colour schemes", async ({ page }) => {
    // 640px is the width the retired 480px block used to leave as a floating
    // card; the acceptance criterion for 0.8-09 is that it reads as a card here.
    for (const scheme of ["light", "dark"] as const) {
      await page.setViewportSize({ width: 640, height: 900 });
      await page.route(/^https?:\/\//, (route) => route.abort());
      const base = caseFor("auth-form");
      await page.setContent(buildPageHtml({ ...base, scheme }), { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready);

      const style = await computed(page, CARD, ["border-radius", "box-shadow", "max-width"]);
      expect(style["border-radius"], scheme).not.toBe("0px");
      expect(style["box-shadow"], scheme).not.toBe("none");
      expect(style["max-width"], scheme).toBe("400px");
    }
  });
});
