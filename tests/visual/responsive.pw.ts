/**
 * The viewport axis of the visual suite — task 0.8-11 (FAQIR-NEXT §19).
 *
 * The main matrix (`visual.pw.ts`) captures every component at one width, so the
 * whole of phase 0.8's responsive work — grid 2.0's mobile-first ladder, the
 * dashboard-shell drawer, the inbox pane swap, auth-form's full bleed — is
 * proven only at CSS-resolution level by the `bun test` cascade models. This
 * spec adds the missing axis for the layout-bearing set:
 *
 *     category `layout` + every pattern  ×  { 390, 768, 1280 }
 *     default theme · light · ltr
 *
 * The set is discovered from manifests (`./responsive-matrix`), never listed
 * here: a new layout primitive or a new pattern enters this suite with zero
 * edits, the same property the main matrix has.
 *
 * **Every capture pre-asserts in the page first** (the 0.7-11 rule: a screenshot
 * cannot go green on an inert attribute). Before the shutter, the browser is
 * asked what it actually computed — the track count of every `[data-ui="grid"]`,
 * the drawer's position and the shell's column count, the panes' visibility —
 * and `checkLayoutFacts` compares it against the ladder the markup authored and
 * the canon. A broken responsive rule fails there, with a sentence naming the
 * element and the expected column count, instead of surfacing as an unexplained
 * pixel diff (or worse, no diff at all when nothing visible moved). The
 * "pre-assertion actually bites" test below proves that in the browser.
 *
 * The three widths: 390 is an iPhone 14, below every canon floor; 768 is the
 * `md` floor *exactly* — mobile-first `min-width` semantics put a boundary width
 * on the WIDE side, the off-by-one a `max-width` ladder gets wrong; 1280 is the
 * `xl` floor and a laptop.
 *
 * Baselines are produced in the pinned Linux container by CI, never locally —
 * see tests/visual/README.md.
 */
import { expect, test, type Page } from "@playwright/test";
import { buildMatrix, buildPageHtml, type Case } from "./matrix";
import {
  buildResponsiveMatrix,
  checkLayoutFacts,
  gatherLayoutFacts,
  RESPONSIVE_HEIGHT,
  RESPONSIVE_WIDTHS,
  type ResponsiveCase,
} from "./responsive-matrix";

/** Viewport widths every archetype below is measured at. */
const WIDTHS = { phone: 390, floor: 768, laptop: 1280 } as const;

const responsiveMatrix = buildResponsiveMatrix();

/** The default-theme, light, LTR capture case for one component. */
function caseFor(name: string): Case {
  const found = buildMatrix().find(
    (c) => c.component.name === name && c.theme === "default" && c.scheme === "light" && c.dir === "ltr",
  );
  if (!found) throw new Error(`no matrix case for ${name}`);
  return found;
}

/** Mount an assembled document at `width`, offline, with fonts settled. */
async function mountHtml(page: Page, html: string, width: number): Promise<void> {
  await page.setViewportSize({ width, height: RESPONSIVE_HEIGHT });
  await page.route(/^https?:\/\//, (route) => route.abort());
  await page.setContent(html, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
}

/** Mount a reference page by component name at `width`. */
async function mount(page: Page, name: string, width: number): Promise<void> {
  await mountHtml(page, buildPageHtml(caseFor(name)), width);
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

/** Ask the page what it computed, then check it against the canon + the markup. */
async function preAssert(page: Page, width: number): Promise<string[]> {
  const facts = await page.evaluate(gatherLayoutFacts, width);
  return checkLayoutFacts(facts);
}

// ── the generated viewport matrix ───────────────────────────────────────────

// Tripwire, not a real capture: if manifest-driven discovery ever stops yielding
// cases, fail loudly instead of "0 tests, all pass".
test("responsive matrix is non-empty", () => {
  expect(responsiveMatrix.length).toBeGreaterThan(0);
  // Every discovered component contributes exactly one case per width.
  expect(responsiveMatrix.length % RESPONSIVE_WIDTHS.length).toBe(0);
  for (const width of RESPONSIVE_WIDTHS) {
    expect(responsiveMatrix.filter((c) => c.width === width).length).toBe(
      responsiveMatrix.length / RESPONSIVE_WIDTHS.length,
    );
  }
});

for (const c of responsiveMatrix as ResponsiveCase[]) {
  test(c.id, async ({ page }) => {
    await mountHtml(page, buildPageHtml(c), c.width);

    const problems = await preAssert(page, c.width);
    expect(
      problems.join("\n"),
      `${c.component.name} did not compute the layout its markup authored at ${c.width}px`,
    ).toBe("");

    await expect(page).toHaveScreenshot(`${c.id}.png`, { fullPage: true });
  });
}

// ── the pre-assertion must bite ─────────────────────────────────────────────

test.describe("the pre-assertion catches a broken responsive rule", () => {
  // Each case breaks ONE rule with a stylesheet override injected after the
  // framework CSS — a faithful stand-in for a regression in the registry sheet,
  // without touching the registry. If any of these went green, the viewport axis
  // would be a screenshot suite with no claim behind it.
  const CASES = [
    {
      what: "grid ignores its md override",
      component: "stats-dashboard",
      width: WIDTHS.floor,
      // Beat every tier's specificity ladder so the base 1-column rule wins again.
      css: `[data-ui="grid"][data-ui="grid"][data-ui="grid"][data-ui="grid"][data-ui="grid"][data-ui="grid"][data-cols="1"] { grid-template-columns: repeat(1, 1fr) !important; }`,
      expect: /expected 2 columns|expected 4 columns/,
    },
    {
      what: "the dashboard-shell drawer never leaves the flow on a phone",
      component: "dashboard-shell",
      width: WIDTHS.phone,
      css: `[data-ui="dashboard-shell"] [data-part="sidebar"] { position: static !important; }`,
      expect: /expected an off-canvas drawer/,
    },
    {
      what: "the inbox shows both panes on a phone",
      component: "inbox",
      width: WIDTHS.phone,
      css: `[data-ui="inbox"] [data-part="detail-pane"] { display: block !important; }`,
      expect: /expected exactly the active pane/,
    },
  ] as const;

  for (const c of CASES) {
    test(c.what, async ({ page }) => {
      const html = buildPageHtml(caseFor(c.component)).replace(
        "</head>",
        `<style>${c.css}</style></head>`,
      );
      await mountHtml(page, html, c.width);

      const problems = await preAssert(page, c.width);
      expect(problems.join("\n"), "the broken rule should have been caught").toMatch(c.expect);

      // …and the same page, unbroken, is silent — so the check is not just
      // failing on everything.
      await mount(page, c.component, c.width);
      expect(await preAssert(page, c.width)).toEqual([]);
    });
  }
});

// ── dashboard-shell — the off-canvas drawer ─────────────────────────────────
//
// The generated matrix pre-asserts the drawer's position and the shell's column
// count at all three widths. These cases cover what a static fact cannot: the
// *transition* between the two states, which is the behaviour a user meets.

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
      const base = caseFor("auth-form");
      await mountHtml(page, buildPageHtml({ ...base, scheme }), 640);

      const style = await computed(page, CARD, ["border-radius", "box-shadow", "max-width"]);
      expect(style["border-radius"], scheme).not.toBe("0px");
      expect(style["box-shadow"], scheme).not.toBe("none");
      expect(style["max-width"], scheme).toBe("400px");
    }
  });
});
