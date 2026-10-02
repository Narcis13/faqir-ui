/**
 * Nested components keep their own styles — tasks 1.1F-20 … 1.1F-23
 * (FAQIR-PLAN-1.1-FIXES, entry 5).
 *
 * A component's part rules used to be descendant selectors, so they reached
 * every part of that name below the root: an open collapsible rotated the
 * chevron of the closed one inside it, a collapsible's `<summary
 * data-part="trigger">` in a tabs panel was laid out as a tab. No reference
 * page shows it — a reference page nests nothing — so the fixtures here are
 * synthetic: the smallest nesting that reproduces each case.
 *
 * Every fixture renders the inner component twice, once nested and once
 * standing alone, and asks for the same computed style on both. That is the
 * whole claim: where a component sits does not change how its parts look.
 * (Inherited properties legitimately differ, so each fixture names the
 * properties its component sets itself.)
 *
 * `tests/registry/nesting-css.test.ts` pins the selectors' shape in happy-dom;
 * this file pins what the browser makes of them.
 */

import { test, expect, type Page } from "@playwright/test";
import { frameworkCss } from "./matrix";

interface Fixture {
  name: string;
  /** The nesting. The element under test carries `data-probe`. */
  nested: string;
  /** The inner component alone. The same element carries `data-ref`. */
  alone: string;
  /** Measure a pseudo-element of the probe instead of the probe. */
  pseudo?: string;
  /** Properties the inner component declares for that element. */
  props: readonly string[];
  /**
   * The descendant rule that used to leak, injected after the framework CSS to
   * prove the fixture catches it. Absent for a guard that never failed.
   */
  revert?: string;
}

const collapsible = (attrs: string, mark: string, body = "Closed by default.") =>
  `<details data-ui="collapsible" ${attrs}>
  <summary data-part="trigger" ${mark}>Advanced</summary>
  <div data-part="content">${body}</div>
</details>`;

const progress = (mark: string) =>
  `<div data-ui="progress" role="progressbar" aria-label="Quota" aria-valuenow="40" aria-valuemin="0" aria-valuemax="100">
  <div data-part="track"><div data-part="fill" style="width: 40%"></div></div>
  <span data-part="label" ${mark}>40%</span>
</div>`;

const tabs = (variant: string, id: string, mark: string, panel: string) =>
  `<div data-ui="tabs" data-variant="${variant}">
  <div data-part="list" role="tablist">
    <button data-part="trigger" role="tab" id="${id}-t1" aria-controls="${id}-p1" aria-selected="true" ${mark}>General</button>
    <button data-part="trigger" role="tab" id="${id}-t2" aria-controls="${id}-p2" aria-selected="false" tabindex="-1">Billing</button>
  </div>
  <div data-part="panel" role="tabpanel" id="${id}-p1" aria-labelledby="${id}-t1">${panel}</div>
  <div data-part="panel" role="tabpanel" id="${id}-p2" aria-labelledby="${id}-t2" hidden></div>
</div>`;

const accordion = (id: string, state: "expanded" | "collapsed", mark: string, body: string) =>
  `<div data-ui="accordion" data-variant="multiple">
  <div data-part="item" data-state="${state}">
    <button data-part="trigger" id="${id}-t" aria-expanded="${state === "expanded"}" aria-controls="${id}-c">
      <span>Section</span><span data-part="icon" aria-hidden="true" ${mark}>&#x25BE;</span>
    </button>
    <div data-part="content" id="${id}-c" role="region" aria-labelledby="${id}-t"${state === "collapsed" ? " hidden" : ""}>${body}</div>
  </div>
</div>`;

/** `mark` goes on the icon, or on the title when `on` says so. */
const callout = (variant: string, mark: string, body = "", on: "icon" | "title" = "icon") =>
  `<div data-ui="callout" data-variant="${variant}" role="note">
  <span data-part="icon" ${on === "icon" ? mark : ""}>i</span>
  <div data-part="content">
    <strong data-part="title" ${on === "title" ? mark : ""}>Heads up</strong>
    <p>One paragraph.</p>
    ${body}
  </div>
</div>`;

const descriptionList = (attrs: string, mark: string, details: string) =>
  `<dl data-ui="description-list" ${attrs}>
  <dt data-part="term" ${mark}>Owner</dt>
  <dd data-part="details">${details}</dd>
</dl>`;

const FIXTURES: readonly Fixture[] = [
  {
    name: "an open collapsible holding a closed one keeps the inner chevron unrotated",
    nested: collapsible("open", "", collapsible("", "data-probe")),
    alone: collapsible("", "data-ref"),
    pseudo: "::after",
    props: ["transform"],
    revert: `[data-ui="collapsible"][open] [data-part="trigger"]::after { transform: rotate(-135deg); }`,
  },
  {
    name: "a collapsible inside a tabs panel is not styled as a tab",
    nested: tabs("underline", "outer", "", collapsible("", "data-probe")),
    alone: collapsible("", "data-ref"),
    props: [
      "display",
      "justify-content",
      "padding-top",
      "padding-left",
      "color",
      "font-size",
      "white-space",
      "border-bottom-width",
      "margin-bottom",
    ],
    revert: `[data-ui="tabs"] [data-part="trigger"] { display: inline-flex; justify-content: center; padding: var(--space-2) var(--space-4); color: var(--color-fg-muted); font-size: var(--text-sm); white-space: nowrap; }`,
  },
  {
    // A guard: description-list has no `label` part, so this never failed. It
    // is the layout the downstream report asked about, and it stays covered.
    name: "a progress inside a description-list <dd> keeps its own label",
    nested: descriptionList('data-variant="horizontal" data-size="sm"', "", progress("data-probe")),
    alone: progress("data-ref"),
    props: ["font-size", "font-weight", "color", "padding-right", "margin-top", "text-align", "flex-shrink"],
  },
  {
    name: "a progress inside a small key-value list keeps its own label",
    nested: `<dl data-ui="key-value" data-size="sm">
  <dt data-part="label">Quota</dt>
  <dd data-part="value">${progress("data-probe")}</dd>
</dl>`,
    alone: progress("data-ref"),
    props: ["font-size", "font-weight", "color", "padding-right", "margin-top", "text-align", "flex-shrink"],
    revert: `[data-ui="key-value"][data-size="sm"] [data-part="label"] { font-size: var(--text-xs); }`,
  },
  {
    name: "an accordion in an expanded section keeps its collapsed chevron unrotated",
    nested: accordion("outer", "expanded", "", accordion("inner", "collapsed", "data-probe", "…")),
    alone: accordion("alone", "collapsed", "data-ref", "…"),
    props: ["transform"],
    revert: `[data-ui="accordion"] [data-part="item"][data-state="expanded"] [data-part="icon"] { transform: rotate(180deg); }`,
  },
  {
    name: "a callout inside a warning callout keeps its own icon colour",
    nested: callout("warning", "", callout("info", "data-probe")),
    alone: callout("info", "data-ref"),
    props: ["color", "font-size", "padding-top"],
    revert: `[data-ui="callout"][data-variant="warning"] [data-part="icon"] { color: var(--color-warning); }`,
  },
  {
    name: "underline tabs inside a pill tabs panel keep their own variant",
    nested: tabs("pill", "outer", "", tabs("underline", "inner", "data-probe", "…")),
    alone: tabs("underline", "alone", "data-ref", "…"),
    props: [
      "border-top-left-radius",
      "padding-top",
      "padding-left",
      "background-color",
      "box-shadow",
      "color",
      "border-bottom-width",
    ],
    revert: `[data-ui="tabs"][data-variant="pill"] [data-part="trigger"] { border-radius: var(--radius-md); padding: var(--space-1) var(--space-3); }`,
  },
  {
    name: "a description-list inside a small one keeps its own size",
    nested: descriptionList('data-size="sm"', "", descriptionList("", "data-probe", "Platform")),
    alone: descriptionList("", "data-ref", "Platform"),
    props: ["font-size", "font-weight", "color", "margin-bottom"],
    revert: `[data-ui="description-list"][data-size="sm"] [data-part="term"] { font-size: var(--text-xs); }`,
  },
  {
    name: "a callout inside an empty-state keeps its own title",
    nested: `<div data-ui="empty-state">
  <h3 data-part="title">No runs yet</h3>
  <p data-part="description">Nothing has been imported.</p>
  ${callout("info", "data-probe", "", "title")}
</div>`,
    alone: callout("info", "data-ref", "", "title"),
    props: ["font-size", "font-weight", "font-family", "color", "display", "margin-bottom"],
    revert: `[data-ui="empty-state"] [data-part="title"] { font-size: var(--text-lg); font-weight: var(--weight-medium); color: var(--color-fg); }`,
  },
  // ── shapes that are not direct children, and must keep working ──
  {
    // HTML lets a <dl> wrap each pair in a <div>; the child chain allows it.
    name: "a description-list pair grouped in a <div> is styled like an ungrouped one",
    nested: `<dl data-ui="description-list" data-divided data-size="lg">
  <div><dt data-part="term" data-probe>Owner</dt><dd data-part="details">Platform</dd></div>
  <div><dt data-part="term">Region</dt><dd data-part="details">eu-west-1</dd></div>
</dl>`,
    alone: descriptionList('data-divided data-size="lg"', "data-ref", "Platform"),
    props: ["font-size", "font-weight", "color", "margin-bottom", "padding-top"],
  },
  {
    name: "a key-value pair grouped in a <div> is styled like an ungrouped one",
    nested: `<dl data-ui="key-value" data-variant="inline" data-size="sm">
  <div><dt data-part="label" data-probe>Status</dt><dd data-part="value">Active</dd></div>
</dl>`,
    alone: `<dl data-ui="key-value" data-variant="inline" data-size="sm">
  <dt data-part="label" data-ref>Status</dt><dd data-part="value">Active</dd>
</dl>`,
    props: ["font-size", "font-weight", "color", "margin-top", "flex-shrink"],
  },
  {
    // The APG accordion wraps each header button in a heading.
    name: "an accordion trigger wrapped in a heading is styled like a bare one",
    nested: `<div data-ui="accordion" data-variant="multiple">
  <div data-part="item" data-state="collapsed">
    <h3 style="margin: 0; font: inherit"><button data-part="trigger" id="h-t" aria-expanded="false" aria-controls="h-c" data-probe>
      <span>Section</span><span data-part="icon" aria-hidden="true">&#x25BE;</span>
    </button></h3>
    <div data-part="content" id="h-c" role="region" aria-labelledby="h-t" hidden>…</div>
  </div>
</div>`,
    alone: `<div data-ui="accordion" data-variant="multiple">
  <div data-part="item" data-state="collapsed">
    <button data-part="trigger" id="b-t" aria-expanded="false" aria-controls="b-c" data-ref>
      <span>Section</span><span data-part="icon" aria-hidden="true">&#x25BE;</span>
    </button>
    <div data-part="content" id="b-c" role="region" aria-labelledby="b-t" hidden>…</div>
  </div>
</div>`,
    props: [
      "display",
      "justify-content",
      "padding-top",
      "padding-left",
      "font-size",
      "font-weight",
      "border-top-width",
      "background-color",
      "cursor",
    ],
  },
];

/** The shipped stylesheet around the two renders, with an optional override after it. */
function documentFor(nested: string, alone: string, css = ""): string {
  return `<!DOCTYPE html>
<html lang="en" data-theme="light" dir="ltr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>nesting</title>
<style>${frameworkCss()}</style>
<style>${css}</style>
</head>
<body>
<main>
<section>${nested}</section>
<section>${alone}</section>
</main>
</body>
</html>`;
}

async function mount(page: Page, html: string): Promise<void> {
  await page.route(/^https?:\/\//, (route) => route.abort());
  await page.setContent(html, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
}

type Styles = Record<string, string>;

/** The named properties of the nested element and of the one standing alone. */
function measure(
  page: Page,
  props: readonly string[],
  pseudo: string | null = null,
): Promise<{ nested: Styles; alone: Styles }> {
  return page.evaluate(
    ({ pseudo, props }) => {
      const read = (attr: string): Record<string, string> => {
        const el = document.querySelector(`[${attr}]`);
        if (!el) throw new Error(`no [${attr}] in the fixture`);
        const style = getComputedStyle(el, pseudo);
        return Object.fromEntries(props.map((p) => [p, style.getPropertyValue(p)]));
      };
      return { nested: read("data-probe"), alone: read("data-ref") };
    },
    { pseudo, props: [...props] },
  );
}

// ── the wall ─────────────────────────────────────────────────────────────────

for (const fixture of FIXTURES) {
  test(fixture.name, async ({ page }) => {
    await mount(page, documentFor(fixture.nested, fixture.alone));
    const { nested, alone } = await measure(page, fixture.props, fixture.pseudo);
    expect(nested).toEqual(alone);
  });
}

// The conversion must not cost a component its own state rule: the fixtures
// above would pass just as well if no chevron ever rotated.
test.describe("the outer component's own state rule still applies", () => {
  test("an open collapsible rotates its own chevron", async ({ page }) => {
    await mount(page, documentFor(collapsible("open", "data-probe"), collapsible("", "data-ref")));
    const { nested, alone } = await measure(page, ["transform"], "::after");
    expect(nested.transform).not.toBe(alone.transform);
  });

  test("an expanded accordion section rotates its own chevron", async ({ page }) => {
    await mount(
      page,
      documentFor(
        accordion("open", "expanded", "data-probe", "…"),
        accordion("shut", "collapsed", "data-ref", "…"),
      ),
    );
    const { nested, alone } = await measure(page, ["transform"]);
    expect(nested.transform).not.toBe(alone.transform);
  });
});

// ── the wall must bite ───────────────────────────────────────────────────────

test.describe("each leak is caught when its descendant rule comes back", () => {
  for (const fixture of FIXTURES) {
    if (!fixture.revert) continue;
    test(fixture.name, async ({ page }) => {
      await mount(page, documentFor(fixture.nested, fixture.alone, fixture.revert));
      const { nested, alone } = await measure(page, fixture.props, fixture.pseudo);
      expect(nested, "the descendant rule should have restyled the nested part").not.toEqual(alone);
    });
  }
});
