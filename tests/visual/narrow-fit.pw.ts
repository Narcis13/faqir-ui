/**
 * Narrow-width fit, per component — task 1.0R-07 (FAQIR-PLAN §1.0-R).
 *
 * Task 1.0R-06 taught the layout ratchet to measure a 375px viewport and it
 * immediately found 52 bleeding boxes over eight pages that a single 1280px
 * ruler had called clean for the whole of v0.9. That budget is a *site* total:
 * it proves the pages got better, but it names no component, and a page can be
 * green because its defect was fixed or because that page happened to give the
 * component room.
 *
 * This spec is the other half — a wall, not a ratchet, and per component. Each
 * one is mounted **in isolation**: `buildPageHtml` is the shipped-bytes document
 * the screenshot matrix uses, with no harness padding, no docs container and no
 * page gutter.
 *
 * Two questions are asked, because one of them alone lets a real defect through:
 *
 *   1. **Does it fit a phone window?** 320 is the floor the responsive doctrine
 *      (FAQIR-NEXT §19) claims to support and 375 is the ratchet's ruler. Both,
 *      because three of the five components below measured clean at 375 while
 *      still bleeding at 320 — a fix that works at one width and not the other
 *      is a coincidence, not a fix.
 *
 *   2. **Does it fit a container narrower than its own content?** A window is
 *      not the only thing that runs out: `menubar` fits a 375px window in
 *      isolation at 229px wide and still bled 198px on its own example page,
 *      because a `data-gutter="4"` page offers 343px and the docs site's type
 *      renders those four triggers far wider than the system font does. Asking
 *      only about the window would have pinned nothing for it. So each component
 *      is also squeezed into a container narrower than the width it wants, which
 *      is the property that actually makes a component responsive and the one
 *      every fix in this task delivers.
 *
 * The gate is intrinsic by construction: the assertion is about painted
 * geometry, so `flex-wrap`, `min-inline-size: 0` and `overflow-wrap` satisfy it
 * and a media query at a width outside the canon does not help at all.
 */

import { test, expect, type Page } from "@playwright/test";
import { buildMatrix, buildPageHtml, type Case } from "./matrix";

/**
 * 320 is the doctrine's floor (FAQIR-NEXT §19) and 375 is the layout ratchet's
 * phone ruler. Anything clearing both clears every mainstream phone.
 */
const WINDOW_WIDTHS = [320, 375] as const;

/**
 * How much of its preferred width a component is squeezed to in the second
 * block. 60% is well past any rounding and still a width a real page hands out
 * — `menubar` met 343 of the 556 it wanted on its own example page, which is
 * 62%.
 */
const SQUEEZE = 0.6;

/** A comfortable window for the squeeze cases, so the *container* is the only constraint. */
const WIDE_WINDOW = 1280;

/** Wider than any reference's max-content, so a preferred width is never clipped by the window. */
const MEASURING_WINDOW = 2400;

/** Tall enough that a wrapped component lays out fully above the fold. */
const HEIGHT = 900;

/**
 * Sub-pixel tolerance. Fractional layout routinely lands a box a few hundredths
 * of a pixel past a container; `layout-lint.ts` uses the same 1px threshold for
 * the same reason, and every real finding this task fixed was 13px or worse.
 */
const TOLERANCE = 1;

/**
 * The five components this task repaired, with the mechanism each one needed.
 * All five bled at phone width on their example pages; the first three bled in
 * isolation too.
 *
 * The list is explicit rather than discovered on purpose. A sweep of all 100+
 * references would be a second layout ratchet with a second budget file, and
 * 1.0R-06 already argued that one measurement beats two. What this spec adds is
 * a wall — no budget, no slack, no update mode — which is affordable only for a
 * set known to be at zero. Components join it as they are fixed.
 */
const FIXED = [
  {
    name: "pagination",
    kind: "recipe",
    mechanism: "the numbered nav wraps instead of running off the window",
  },
  {
    name: "key-value",
    kind: "primitive",
    mechanism: "an unbreakable value (an IBAN) no longer sizes the grid track",
  },
  {
    name: "empty-state",
    kind: "pattern",
    mechanism: "the centred action cluster wraps instead of overflowing both edges",
  },
  {
    name: "input-otp",
    kind: "recipe",
    mechanism: "the segment row wraps and the fit-content root gains a ceiling",
  },
  {
    name: "menubar",
    kind: "recipe",
    mechanism: "the trigger bar wraps and gains a ceiling",
  },
] as const;

/**
 * Page shells, held to the WINDOW cases only.  [W3-3]
 *
 * All three overflowed a phone: `settings-page` rendered 403px wide at 375 (its
 * stylesheet had no media query at all), `sidebar` the same 403 (its collapse to
 * a drawer was the controller's job alone, so every rendering without JS — a
 * screenshot, a print, a page before its script runs — kept a 256px rail on a
 * 320px phone), and `dashboard-shell` 369 at 320.
 *
 * They are not in `FIXED` because the squeeze case does not apply to them. Each
 * reference is a whole PAGE — a shell with its own header, its own content
 * column and, in two of the three, a sidebar beside them — and a page's
 * container IS the window. "Fits a box 60% of its own max-content" is a
 * meaningful question about a pagination bar; asked of an app shell it measures
 * the demo page's inner `<main>`, not the component. The window cases are the
 * criterion these three failed, and the criterion a reader meets.
 */
const PAGE_SHELLS = [
  {
    name: "settings-page",
    kind: "pattern",
    mechanism: "the tab rail stacks below `md` and the tab row wraps",
  },
  {
    name: "sidebar",
    kind: "recipe",
    mechanism: "off-canvas below `md` in CSS, not only when the controller says so",
  },
  {
    name: "dashboard-shell",
    kind: "pattern",
    mechanism: "phone gutters, `minmax(0, 1fr)` tracks, and a closed drawer that is not painted",
  },
] as const;

/** Everything held to the window cases: the five squeezed components and the three shells. */
const FITS_A_PHONE = [...FIXED, ...PAGE_SHELLS] as const;

/** One painted box that reaches past the content box it was given. */
interface Bleed {
  label: string;
  edge: "start" | "end";
  overflow: number;
}

/** The default-theme, light, LTR capture case for one component. */
function caseFor(name: string, kind: string): Case {
  // Two different components ship as `empty-state` (a primitive and a pattern),
  // so the kind is part of the key — matching on name alone would silently
  // measure whichever the walk happened to reach first.
  const found = buildMatrix().find(
    (c) =>
      c.component.name === name &&
      c.component.kind === kind &&
      c.theme === "default" &&
      c.scheme === "light" &&
      c.dir === "ltr",
  );
  if (!found) throw new Error(`no matrix case for ${kind} ${name}`);
  return found;
}

/**
 * The document for one component, optionally with the content root pinned to a
 * fixed width and with a stylesheet appended after the framework's.
 */
function documentFor(
  component: { name: string; kind: string },
  { container, css }: { container?: number; css?: string } = {},
): string {
  const extra = [
    container === undefined ? "" : `main { inline-size: ${container}px; }`,
    css ?? "",
  ].join("\n");
  return buildPageHtml(caseFor(component.name, component.kind)).replace(
    "</head>",
    `<style>${extra}</style></head>`,
  );
}

/** Mount an assembled document at `width`, offline, with fonts and motion settled. */
async function mount(page: Page, html: string, width: number): Promise<void> {
  await page.setViewportSize({ width, height: HEIGHT });
  await page.route(/^https?:\/\//, (route) => route.abort());
  await page.setContent(html, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  // The same reason the site sweep settles motion: a component that animates in
  // (empty-state's icon does) must be measured where it lands, not mid-flight.
  await page.evaluate(() => {
    for (const animation of document.getAnimations()) {
      try {
        animation.finish();
      } catch {
        // An infinite animation has no end state to settle to.
      }
    }
  });
}

/**
 * Every painted box that reaches past the content box of `<main>`.
 *
 * Serialised into the page, so it closes over nothing. It is deliberately
 * *stricter* than the site sweep's collector: there is no scrollable-ancestor
 * excuse and no clipping-ancestor slice, because a reference page mounted alone
 * has neither — a box past the edge here is past the edge, full stop.
 *
 * `<main>` rather than the window because that is the box the component was
 * actually given. When nothing pins its width the two coincide, and the window
 * cases below get exactly the assertion they read as.
 */
function collectBleeds(tolerance: number): Bleed[] {
  const main = document.querySelector("main");
  if (!main) throw new Error("no <main> to measure against");
  const cs = getComputedStyle(main);
  const mr = main.getBoundingClientRect();
  const start = mr.x + Number.parseFloat(cs.paddingLeft) + Number.parseFloat(cs.borderLeftWidth);
  const end =
    mr.x + mr.width - Number.parseFloat(cs.paddingRight) - Number.parseFloat(cs.borderRightWidth);

  const label = (el: Element): string => {
    const own =
      el.getAttribute("data-ui") !== null
        ? `[data-ui="${el.getAttribute("data-ui")}"]`
        : el.getAttribute("data-part") !== null
          ? `[data-part="${el.getAttribute("data-part")}"]`
          : "";
    return `${el.tagName.toLowerCase()}${own}`;
  };

  const painted = (el: Element): boolean => {
    const style = getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") return false;
    // `clip-path: inset(50%)` is the screen-reader-only idiom, and `[inert]` is a
    // subtree no reader can reach — the same two exemptions the site sweep makes,
    // for the same reasons.
    if (style.clipPath !== "none") return false;
    if (el.closest("[inert]")) return false;
    const r = el.getBoundingClientRect();
    return r.width >= 1 && r.height >= 1;
  };

  const out: Bleed[] = [];
  for (const el of Array.from(main.querySelectorAll("*"))) {
    if (!painted(el)) continue;
    const r = el.getBoundingClientRect();
    if (start - r.x > tolerance) out.push({ label: label(el), edge: "start", overflow: start - r.x });
    const past = r.x + r.width - end;
    if (past > tolerance) out.push({ label: label(el), edge: "end", overflow: past });
  }
  return out;
}

/**
 * The width the widest demo on the reference page *wants*: each root measured at
 * `max-content`, one at a time.
 *
 * Neither shortcut works. The laid-out width is no good because most roots are
 * block-level and fill whatever they are given, so an unconstrained mount
 * reports the window and 60% of that constrains nothing. `max-content` on
 * `<main>` is no good either: `pagination` and `input-otp` root at
 * `inline-flex`, so their several demos share one inline formatting context and
 * `<main>`'s max-content is the whole row laid end to end — three times any
 * single demo's width, and again a squeeze that squeezes nothing.
 *
 * So each root is sized to `max-content` on its own and restored, and the widest
 * wins: the width at which nothing in that demo would ever need to wrap, which
 * is exactly the number a squeeze has to be a fraction of.
 */
function measurePreferredWidth(): number {
  const main = document.querySelector("main");
  if (!main) throw new Error("no <main> to measure");
  let widest = 0;
  for (const el of Array.from(main.children) as HTMLElement[]) {
    const before = el.style.inlineSize;
    el.style.inlineSize = "max-content";
    widest = Math.max(widest, el.getBoundingClientRect().width);
    el.style.inlineSize = before;
  }
  return widest;
}

/** Readable failure text: which box, which edge, how far. */
function describe(bleeds: Bleed[]): string {
  return bleeds
    .map(
      (b) =>
        `${b.label} ${b.edge === "start" ? "before" : "past"} the inline ${b.edge} by ${b.overflow.toFixed(1)}px`,
    )
    .join("\n");
}

/** Mount at `max-content`, read the preferred width, return the squeezed container width. */
async function squeezeWidth(
  page: Page,
  component: { name: string; kind: string },
): Promise<number> {
  // A window wider than any reference's max-content, so the measurement reads
  // the component's preference rather than the window's limit.
  await mount(page, documentFor(component), MEASURING_WINDOW);
  const preferred = await page.evaluate(measurePreferredWidth);
  expect(preferred, `${component.name} laid out nothing to squeeze`).toBeGreaterThan(0);
  return Math.round(preferred * SQUEEZE);
}

// ── the wall: a phone window ─────────────────────────────────────────────────

for (const component of FITS_A_PHONE) {
  for (const width of WINDOW_WIDTHS) {
    test(`${component.kind}/${component.name} fits a ${width}px window — ${component.mechanism}`, async ({
      page,
    }) => {
      await mount(page, documentFor(component), width);

      const bleeds = await page.evaluate(collectBleeds, TOLERANCE);
      expect(describe(bleeds), `${component.name} paints outside a ${width}px window`).toBe("");

      // …and the document itself does not scroll sideways, which is the
      // criterion as a reader meets it rather than as a rectangle states it.
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(overflow, `${component.name} scrolls horizontally at ${width}px`).toBeLessThanOrEqual(
        TOLERANCE,
      );
    });
  }
}

// ── the wall: a container narrower than the component wants ──────────────────

for (const component of FIXED) {
  test(`${component.kind}/${component.name} fits a container ${Math.round(SQUEEZE * 100)}% of its preferred width`, async ({
    page,
  }) => {
    const container = await squeezeWidth(page, component);
    await mount(page, documentFor(component, { container }), WIDE_WINDOW);

    const bleeds = await page.evaluate(collectBleeds, TOLERANCE);
    expect(
      describe(bleeds),
      `${component.name} paints outside the ${container}px container it was given`,
    ).toBe("");
  });
}

// ── the wall must bite ───────────────────────────────────────────────────────

test.describe("the fit assertion catches each fix being undone", () => {
  // Every case reverts exactly one declaration this task added, with an override
  // injected after the framework CSS — a faithful stand-in for the regression,
  // without touching the registry. If any of these went green, the wall above
  // would be fifteen tests asserting nothing.
  const REGRESSIONS = [
    {
      what: "pagination's nav stops wrapping",
      component: { name: "pagination", kind: "recipe" },
      css: `[data-ui="pagination"] { max-inline-size: none !important; }
            [data-ui="pagination"] [data-part="nav"] { flex-wrap: nowrap !important; }`,
      expect: /data-part="nav"\] past the inline end/,
    },
    {
      what: "key-value's values stop breaking",
      component: { name: "key-value", kind: "primitive" },
      css: `[data-ui="key-value"] [data-part="value"] { overflow-wrap: normal !important; min-inline-size: auto !important; }`,
      expect: /data-part="value"\] past the inline end/,
    },
    {
      what: "empty-state's action cluster stops wrapping",
      component: { name: "empty-state", kind: "pattern" },
      css: `[data-ui="empty-state"] [data-part="actions"] { flex-wrap: nowrap !important; max-inline-size: none !important; }`,
      // The centred cluster overflows symmetrically: the inline-START half is
      // the half no scroll gesture can reach, so that is the edge to pin.
      expect: /data-part="actions"\] before the inline start/,
    },
    {
      what: "input-otp's segment row stops wrapping",
      component: { name: "input-otp", kind: "recipe" },
      css: `[data-ui="input-otp"] { max-inline-size: none !important; }
            [data-ui="input-otp"] [data-part="segments"] { flex-wrap: nowrap !important; }`,
      expect: /data-part="segments"\] past the inline end/,
    },
    {
      what: "menubar's trigger bar stops wrapping",
      component: { name: "menubar", kind: "recipe" },
      css: `[data-ui="menubar"] { flex-wrap: nowrap !important; max-inline-size: none !important; }`,
      expect: /data-ui="menubar"\] past the inline end/,
    },
  ] as const;

  /** The same shape for the page shells, at the phone window they each failed. */
  const SHELL_REGRESSIONS = [
    {
      what: "the tab row stops wrapping",
      component: { name: "settings-page", kind: "pattern" },
      width: 320,
      css: `[data-ui="tabs"] [data-part="list"] { flex-wrap: nowrap !important; }`,
      expect: /data-part="trigger"\] past the inline end/,
    },
    {
      what: "the sidebar stops going off-canvas without JS",
      component: { name: "sidebar", kind: "recipe" },
      width: 320,
      css: `[data-ui="sidebar"] { inline-size: 16rem !important; }`,
      expect: /past the inline end/,
    },
    {
      what: "the shell's grid track stops being allowed to shrink",
      component: { name: "dashboard-shell", kind: "pattern" },
      width: 320,
      css: `[data-ui="dashboard-shell"] { grid-template-columns: 1fr !important; }`,
      expect: /past the inline end/,
    },
  ] as const;

  for (const regression of SHELL_REGRESSIONS) {
    test(regression.what, async ({ page }) => {
      await mount(
        page,
        documentFor(regression.component, { css: regression.css }),
        regression.width,
      );
      expect(
        describe(await page.evaluate(collectBleeds, TOLERANCE)),
        "the reverted fix should have been caught",
      ).toMatch(regression.expect);

      await mount(page, documentFor(regression.component), regression.width);
      expect(await page.evaluate(collectBleeds, TOLERANCE)).toEqual([]);
    });
  }

  for (const regression of REGRESSIONS) {
    test(regression.what, async ({ page }) => {
      // The squeeze width is read from the *unbroken* component, so a regression
      // cannot widen its own container and escape the assertion.
      const container = await squeezeWidth(page, regression.component);

      await mount(
        page,
        documentFor(regression.component, { container, css: regression.css }),
        WIDE_WINDOW,
      );
      const broken = await page.evaluate(collectBleeds, TOLERANCE);
      expect(describe(broken), "the reverted fix should have been caught").toMatch(
        regression.expect,
      );

      // …and the same page, unbroken, is silent — so the check is not simply
      // failing on everything it is shown.
      await mount(page, documentFor(regression.component, { container }), WIDE_WINDOW);
      expect(await page.evaluate(collectBleeds, TOLERANCE)).toEqual([]);
    });
  }
});
