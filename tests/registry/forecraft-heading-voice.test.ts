// Every pattern heading speaks in the theme's heading voice (forecraft #19).
//
// `feature-grid` set its section heading in the body face at a fixed
// `--weight-bold`, while bento, faq, testimonials, cta, pricing and the hero
// read `--font-heading` at `--heading-weight`. A theme with a distinct display
// face showed it everywhere but there, and a one-weight display face would have
// been asked for a synthesised bold. The check is generic: every pattern whose
// manifest declares a `heading` or `headline` slot styles it, at the top level
// of its stylesheet, with `font-family: var(--font-heading)` and
// `font-weight: var(--heading-weight)`.

import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { REGISTRY, registryCss, type CssRule } from "./forecraft-css";

/** Section-heading slots: the pattern's own title, not an item's. */
const HEADING_SLOTS = ["heading", "headline"];

/** Patterns whose heading is deliberately or provisionally not in the heading voice. */
const EXEMPT: Record<string, string> = {
  "logo-cloud":
    "the heading is a small UI-voice eyebrow over the logos, demoted from the outline by design (logo-cloud.css)",
  "form-page":
    "pending: owned by the forms area, which is rewriting form-page in the same release; its heading sets no font at all yet",
};

function patterns(): string[] {
  return readdirSync(join(REGISTRY, "patterns")).sort();
}

function slotsOf(name: string): string[] {
  const m = JSON.parse(
    readFileSync(join(REGISTRY, "patterns", name, `${name}.manifest.json`), "utf8"),
  ) as { slots?: Record<string, unknown> };
  return Object.keys(m.slots ?? {});
}

/** Top-level declarations of every rule whose selector ends on the part, merged in source order. */
function partDecls(rules: CssRule[], part: string): Record<string, string> {
  const tail = `[data-part="${part}"]`;
  const merged: Record<string, string> = {};
  for (const r of rules) {
    if (r.at !== "") continue;
    if (!r.selectors.some((s) => s.endsWith(tail) && !s.includes(`${tail}:`))) continue;
    Object.assign(merged, r.decls);
  }
  return merged;
}

const cases = patterns().flatMap((name) =>
  slotsOf(name)
    .filter((slot) => HEADING_SLOTS.includes(slot))
    .map((slot) => ({ name, slot })),
);

describe("pattern headings read the heading tokens", () => {
  it("finds the section headings to check", () => {
    // feature-grid, bento, faq, testimonials, cta, pricing, hero, article…
    expect(cases.length).toBeGreaterThan(10);
    expect(cases.map((c) => c.name)).toContain("feature-grid");
  });

  for (const { name, slot } of cases) {
    if (name in EXEMPT) continue;
    it(`${name} [data-part="${slot}"] is --font-heading at --heading-weight`, () => {
      const decls = partDecls(registryCss(`patterns/${name}/${name}.css`), slot);
      expect(decls["font-family"], `${name} ${slot}: font-family`).toBe("var(--font-heading)");
      expect(decls["font-weight"], `${name} ${slot}: font-weight`).toBe("var(--heading-weight)");
    });
  }

  it("exempts only patterns that exist and really lack the heading voice", () => {
    for (const name of Object.keys(EXEMPT)) {
      expect(patterns(), `${name} is not a pattern`).toContain(name);
      const slot = slotsOf(name).find((s) => HEADING_SLOTS.includes(s));
      expect(slot, `${name} declares no heading slot`).toBeDefined();
      const decls = partDecls(registryCss(`patterns/${name}/${name}.css`), slot!);
      const voiced =
        decls["font-family"] === "var(--font-heading)" &&
        decls["font-weight"] === "var(--heading-weight)";
      expect(voiced, `${name} now reads the heading tokens — drop its exemption`).toBe(false);
    }
  });
});

describe("feature-grid (forecraft #19)", () => {
  const rules = registryCss("patterns/feature-grid/feature-grid.css");

  it("sets the section heading in the full heading voice", () => {
    const d = partDecls(rules, "heading");
    expect(d["font-family"]).toBe("var(--font-heading)");
    expect(d["font-weight"]).toBe("var(--heading-weight)");
    expect(d["letter-spacing"]).toBe("var(--heading-tracking)");
    expect(d["text-transform"]).toBe("var(--heading-transform)");
    expect(d["font-variant-caps"]).toBe("var(--heading-caps)");
  });

  it("sets the item titles in the heading face at the heading weight, like bento's", () => {
    const d = partDecls(rules, "item-title");
    expect(d["font-family"]).toBe("var(--font-heading)");
    expect(d["font-weight"]).toBe("var(--heading-weight)");
  });

  it("no longer hard-codes a body-face weight on either", () => {
    for (const part of ["heading", "item-title"]) {
      expect(partDecls(rules, part)["font-weight"]).not.toMatch(/--weight-(bold|semibold)/);
    }
  });
});
