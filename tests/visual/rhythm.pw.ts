/**
 * The default rhythm, in a real browser — FAQIR-SPEC §20 (task 0.9-02).
 *
 * `tests/utils/rhythm.test.ts` proves the rule is stated consistently everywhere.
 * It cannot prove the rule *works*: `margin-block-start` behind a `:where()`
 * flow-root selector is exactly the kind of CSS that reads correctly and lays out
 * wrongly. Three shapes decide that, and they are the three §20 has to survive:
 *
 *   1. **nested scopes** — a `section` inside a `main` is a flow root in its own
 *      right, and nesting must not compound (48 + 48 between two boxes is the
 *      failure mode of a rule written with `margin-block` on both ends);
 *   2. **a `surface` boundary** — the margin-collapse trap that made candidate 3
 *      look dangerous in the first place. The owl form (nothing on the first
 *      child, nothing on the last) means there is never a margin at a box edge to
 *      collapse through, and that is measurable: a surface's top edge sits its own
 *      padding above its first child, never 48px above it;
 *   3. **the `data-gap="0"` opt-out**, plus a rung of the ladder, because a
 *      default nobody can turn off is not a default.
 *
 * Two guards ride along, because they are what the rule's exclusions buy: a row
 * of inline-level components stays a row (a vertical margin on an atomic inline
 * would break the baseline it shares with its neighbours), and a `stack`'s
 * children keep exactly the `gap` the stack asked for — a margin on top of that
 * would silently double every stack in the registry.
 *
 * Geometry only; no screenshots, so this cannot go stale against a baseline.
 */

import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REGISTRY = join(dirname(fileURLToPath(import.meta.url)), "../../registry");

/** Token cascade order — mirrors `registry/tokens/index.css`. */
const TOKENS = [
  "palette", "spacing", "typography", "effects", "motion", "semantic", "aliases",
  "document", "doc-aliases", "density",
];
/** Base cascade order — `rhythm` is the file under test. */
const BASE = ["reset", "prose", "rhythm", "motion-presets"];
/** Only the components these shapes use. */
const COMPONENTS: [string, string][] = [
  ["primitives", "card"],
  ["primitives", "surface"],
  ["primitives", "badge"],
  ["primitives", "stack"],
];

const CSS = [
  ...TOKENS.map((n) => readFileSync(join(REGISTRY, "tokens", `${n}.css`), "utf8")),
  ...BASE.map((n) => readFileSync(join(REGISTRY, "base", `${n}.css`), "utf8")),
  readFileSync(join(REGISTRY, "themes", "default.css"), "utf8"),
  ...COMPONENTS.map(([kind, name]) => readFileSync(join(REGISTRY, kind, name, `${name}.css`), "utf8")),
].join("\n");

/** `--section-gap-sm` is `--space-12` is 3rem is 48px at the default root size. */
const FLOW_SPACE = 48;

function doc(body: string): string {
  return `<!DOCTYPE html><html lang="en" data-theme="light" dir="ltr"><head><meta charset="utf-8">
<style>${CSS}</style></head><body>\n${body}\n</body></html>`;
}

/** A card, so every shape is made of a real component rather than a bare div. */
const card = (id: string, text: string): string =>
  `<div id="${id}" data-ui="card" data-variant="outlined"><div data-part="body">${text}</div></div>`;

/** Rectangles for a list of ids, in the order asked for. */
async function rects(page: Page, ids: string[]): Promise<Record<string, DOMRect>> {
  return page.evaluate((wanted) => {
    const out: Record<string, DOMRect> = {};
    for (const id of wanted) {
      out[id] = document.getElementById(id)!.getBoundingClientRect().toJSON() as DOMRect;
    }
    return out;
  }, ids);
}

/** Vertical distance between the bottom of `a` and the top of `b`. */
const gapBetween = (a: DOMRect, b: DOMRect): number => Math.round(b.y - (a.y + a.height));

// ── 1. the bare case: no wrapper, no attribute ──────────────────────────────

test("a bare sequence of components is spaced without being wrapped", async ({ page }) => {
  await page.setContent(
    doc(`<main>\n${card("a", "one")}\n${card("b", "two")}\n${card("c", "three")}\n</main>`),
    { waitUntil: "load" },
  );
  const r = await rects(page, ["a", "b", "c"]);
  // The claim the whole decision rests on — spaced output, nothing wrapped.
  expect(gapBetween(r.a, r.b)).toBe(FLOW_SPACE);
  expect(gapBetween(r.b, r.c)).toBe(FLOW_SPACE);
});

test("the first child carries no margin, so the page does not start with a hole", async ({ page }) => {
  await page.setContent(doc(`<main>\n${card("a", "one")}\n${card("b", "two")}\n</main>`), {
    waitUntil: "load",
  });
  const main = await page.evaluate(() => document.querySelector("main")!.getBoundingClientRect().y);
  const r = await rects(page, ["a"]);
  expect(Math.round(r.a.y - main)).toBe(0);
});

// ── 2. nested scopes ────────────────────────────────────────────────────────

test("nested flow roots each carry the rhythm, and nesting does not compound it", async ({ page }) => {
  await page.setContent(
    doc(
      `<main>
  <section id="s1">${card("a", "one")}${card("b", "two")}</section>
  <section id="s2">${card("c", "three")}</section>
</main>`,
    ),
    { waitUntil: "load" },
  );
  const r = await rects(page, ["s1", "s2", "a", "b", "c"]);
  // The inner section is a flow root in its own right…
  expect(gapBetween(r.a, r.b)).toBe(FLOW_SPACE);
  // …and the outer main spaces the sections themselves, once.
  expect(gapBetween(r.s1, r.s2)).toBe(FLOW_SPACE);
  // A section is a block box with no padding, so its first child sits flush with
  // it — the proof that no margin escaped upward through the nesting.
  expect(Math.round(r.a.y - r.s1.y)).toBe(0);
  expect(Math.round(r.c.y - r.s2.y)).toBe(0);
});

test("a heading stays welded to the thing it labels", async ({ page }) => {
  await page.setContent(
    doc(`<main>\n${card("a", "one")}\n<h2 id="h">Line items</h2>\n${card("b", "two")}\n</main>`),
    { waitUntil: "load" },
  );
  const r = await rects(page, ["a", "h", "b"]);
  // "Consecutive" is the load-bearing word: a non-participant between two
  // participants suppresses the margin. Measured, not assumed — the first draft
  // of §20 spaced every non-first child and floated every invoice heading 48px
  // above its own section.
  expect(gapBetween(r.h, r.b)).toBe(0);
  expect(gapBetween(r.a, r.h)).toBe(0);
});

// ── 3. the surface boundary — the margin-collapse trap ──────────────────────

test("a surface boundary does not leak: no margin collapses through either edge", async ({ page }) => {
  await page.setContent(
    doc(
      `<main>
  ${card("before", "outside")}
  <div id="box" data-ui="surface" data-variant="raised" data-size="lg">${card("a", "one")}${card("b", "two")}</div>
  ${card("after", "outside")}
</main>`,
    ),
    { waitUntil: "load" },
  );
  const r = await rects(page, ["before", "box", "after", "a", "b"]);
  // The surface's own inset: padding plus its border, because a bounding rect is
  // the border box and `paddingTop` is not.
  const inset = await page.evaluate(() => {
    const cs = getComputedStyle(document.getElementById("box")!);
    return parseFloat(cs.paddingTop) + parseFloat(cs.borderTopWidth);
  });

  // The surface is itself in the outer rhythm…
  expect(gapBetween(r.before, r.box)).toBe(FLOW_SPACE);
  expect(gapBetween(r.box, r.after)).toBe(FLOW_SPACE);
  // …and a flow root for what it holds.
  expect(gapBetween(r.a, r.b)).toBe(FLOW_SPACE);
  // The trap: if the rule put a margin on the first child (or a trailing margin
  // on the last), it would collapse out through a padding-less box and show up
  // here as extra distance. The surface's own padding is the whole distance.
  expect(Math.round(r.a.y - r.box.y)).toBe(Math.round(inset));
  expect(Math.round(r.box.y + r.box.height - (r.b.y + r.b.height))).toBe(Math.round(inset));
});

// ── 4. re-tuning and opting out ─────────────────────────────────────────────

test('data-gap="0" on the flow root turns the rhythm off', async ({ page }) => {
  await page.setContent(doc(`<main data-gap="0">\n${card("a", "one")}\n${card("b", "two")}\n</main>`), {
    waitUntil: "load",
  });
  const r = await rects(page, ["a", "b"]);
  expect(gapBetween(r.a, r.b)).toBe(0);
});

test("data-gap on the flow root re-tunes it, and inherits into nested roots", async ({ page }) => {
  await page.setContent(
    doc(
      `<main data-gap="4">
  ${card("a", "one")}
  <section id="s">${card("b", "two")}${card("c", "three")}</section>
</main>`,
    ),
    { waitUntil: "load" },
  );
  const r = await rects(page, ["a", "s", "b", "c"]);
  expect(gapBetween(r.a, r.s)).toBe(16); // --space-4, and a bare <section> is spaced too
  expect(gapBetween(r.b, r.c)).toBe(16); // …and the nested root inherited it
});

// ── 5. the two guards the exclusions buy ────────────────────────────────────

test("a row of inline-level components stays a row", async ({ page }) => {
  await page.setContent(
    doc(
      `<main>
  <span id="x" data-ui="badge">one</span>
  <span id="y" data-ui="badge">two</span>
  <span id="z" data-ui="badge">three</span>
</main>`,
    ),
    { waitUntil: "load" },
  );
  const r = await rects(page, ["x", "y", "z"]);
  // Same line, same baseline: a vertical margin on an atomic inline would shift
  // the 2nd and 3rd inside the line box and break exactly this.
  expect(Math.round(r.y.y)).toBe(Math.round(r.x.y));
  expect(Math.round(r.z.y)).toBe(Math.round(r.x.y));
  expect(r.y.x).toBeGreaterThan(r.x.x);
});

test("a stack's children keep exactly the gap the stack asked for", async ({ page }) => {
  await page.setContent(
    doc(`<main>\n<div data-ui="stack" data-gap="4">${card("a", "one")}${card("b", "two")}</div>\n</main>`),
    { waitUntil: "load" },
  );
  const r = await rects(page, ["a", "b"]);
  // 16, not 16 + 48: a component that lays out its own children is not a flow
  // root, which is what keeps the default from doubling every gap in the registry.
  expect(gapBetween(r.a, r.b)).toBe(16);
});

// ── 6. the default is a default ─────────────────────────────────────────────

test("any authored rule outweighs the rule, because it weighs nothing", async ({ page }) => {
  await page.setContent(
    doc(
      `<style>#b { margin-block-start: 7px; }</style>
<main>\n${card("a", "one")}\n${card("b", "two")}\n</main>`,
    ),
    { waitUntil: "load" },
  );
  const r = await rects(page, ["a", "b"]);
  expect(gapBetween(r.a, r.b)).toBe(7);
});
