// `grid` 2.0 — mobile-first, intrinsic `auto` mode, spans declared (task 0.8-04).
//
// The 1.x sheet had three defects, and each gets a regression here:
//
//  1. **The dead zone.** `max-width: 640px` / `min-width: 641px and max-width:
//     1024px` ranges meant a fractional viewport width of 640.5px matched
//     neither — twelve columns on a phone. The rewrite is min-width floors on
//     the canon (0.8-01), so a mocked 640.5px viewport must land in the sm tier.
//
//  2. **Source-order dependence.** The 1.x overrides resolved purely by
//     document order at equal (0,2,0) specificity: any bundler that reordered
//     or split blocks silently broke them. The rewrite encodes tier precedence
//     in SPECIFICITY (each tier block repeats `[data-ui="grid"]` once more than
//     the tier below), so resolution here is asserted against deliberately
//     re-ordered copies of the rule list as well as the shipped order.
//
//  3. **The forced collapse.** A blanket `[data-cols] { grid-template-columns:
//     1fr }` at ≤640px made one column mandatory on phones and crushed
//     `data-span` children to span 1. Gone: the unsuffixed base holds at every
//     width and collapsing is an explicit authoring choice.
//
// Plus the feature: `data-cols="auto"` + `data-min` is the zero-media-query
// intrinsic grid of §15 doctrine 1 — its resolution may not touch a media-
// scoped rule at any width.
//
// Completeness both ways and the generated surfaces follow the stack 2.0
// precedent (0.8-03); the cascade machinery lives in tests/helpers/css-cascade.

import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { validateManifest, type Manifest } from "../../src/manifest";
import { manifestToIR } from "../../src/bindings/ir";
import {
  BREAKPOINTS,
  TIERS,
  isProtocolAttribute,
  parseResponsiveAttribute,
  type Tier,
} from "../../src/utils/breakpoints";
import { buildDocsSite } from "../../src/generator/docs";
import {
  collectRules,
  resolve,
  resolveRule,
  selectedAttributes,
  selectedPairs,
  type CascadeRule,
  type ElementAttrs,
} from "../helpers/css-cascade";

const ROOT = join(import.meta.dir, "../..");
const DIR = join(ROOT, "registry", "primitives", "grid");

const CSS = readFileSync(join(DIR, "grid.css"), "utf8");
const HTML = readFileSync(join(DIR, "grid.html"), "utf8");
const MANIFEST = JSON.parse(readFileSync(join(DIR, "grid.manifest.json"), "utf8")) as Manifest;

const RULES = collectRules(CSS);

const AUTO_TEMPLATE = "repeat(auto-fit, minmax(min(100%, var(--grid-min)), 1fr))";

const PHONE = 390;
/** The 1.x dead zone: neither `max-width: 640px` nor `min-width: 641px` matched. */
const DEAD_ZONE = 640.5;
const TABLET = BREAKPOINTS.md.px + 32;
const DESKTOP = BREAKPOINTS.xl.px + 100;

const grid = (attrs: ElementAttrs, property: string, width: number) =>
  resolve(RULES, "grid", attrs, property, width);

// ── The declared surface, read out of the manifest ───────────────────────────

const variantGroups = Object.entries(MANIFEST.variants ?? {});
const propEntries = Object.entries(MANIFEST.props ?? {});

/** attr → allowed values, including every responsive tier of a responsive group. */
function declaredValueSets(): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const [, v] of variantGroups) {
    out.set(v.attr, v.values);
    if (v.responsive !== true) continue;
    for (const tier of TIERS) out.set(`${v.attr}-${tier}`, v.values);
  }
  for (const [, p] of propEntries) {
    if (p.type === "enum" && p.attr && p.values) out.set(p.attr, p.values);
  }
  return out;
}

/** Every attribute the manifest declares in any form. */
function declaredAttributes(): Set<string> {
  const out = new Set<string>([...declaredValueSets().keys()]);
  for (const [, p] of propEntries) if (p.attr) out.add(p.attr);
  return out;
}

// ── 1 · Completeness ─────────────────────────────────────────────────────────

describe("grid — manifest declares everything the CSS selects on", () => {
  it("validates, and is the 2.0 release with a breaking mobile-first changelog entry", () => {
    expect(validateManifest(MANIFEST)).toEqual([]);
    expect(MANIFEST.version).toBe("2.0.0");
    const entry = (MANIFEST.changes ?? []).find((c) => c.version === "2.0.0");
    expect(entry, "grid 2.0 must record its own changelog entry").toBeDefined();
    expect(entry!.breaking).toBe(true);
    expect(entry!.note).toContain("mobile-first");
    expect(entry!.note).toContain("data-cols");
    expect(entry!.note).toContain("auto");
  });

  it("leaves no data-* attribute in grid.css undeclared", () => {
    const declared = declaredAttributes();
    const undeclared = [...selectedAttributes(RULES)].filter(
      (attr) => attr !== "data-ui" && !declared.has(attr),
    );
    expect(undeclared, `undeclared in grid.manifest.json: ${undeclared.join(", ")}`).toEqual([]);
  });

  it("names every attribute the 1.x manifest shipped undeclared", () => {
    const declared = declaredAttributes();
    for (const attr of ["data-cols-sm", "data-cols-md", "data-span", "data-scroll", "data-min"]) {
      expect(declared.has(attr), `${attr} must be declared`).toBe(true);
    }
  });

  it("selects on no value the manifest does not declare", () => {
    const sets = declaredValueSets();
    const rogue = [...selectedPairs(RULES)].filter((pair) => {
      const eq = pair.indexOf("=");
      const [attr, value] = [pair.slice(0, eq), pair.slice(eq + 1)];
      const values = sets.get(attr);
      return values !== undefined && !values.includes(value);
    });
    expect(rogue).toEqual([]);
  });

  it("ships a rule for every declared variant value, base and tier alike — auto included", () => {
    const pairs = selectedPairs(RULES);
    const missing: string[] = [];
    for (const [group, v] of variantGroups) {
      expect(v.responsive, `${group} is a responsive group`).toBe(true);
      for (const attr of [v.attr, ...TIERS.map((t) => `${v.attr}-${t}`)]) {
        for (const value of v.values) {
          if (!pairs.has(`${attr}=${value}`)) missing.push(`${group}: [${attr}="${value}"]`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it("ships a rule for every enum prop value, and selects every boolean prop", () => {
    const pairs = selectedPairs(RULES);
    for (const [name, p] of propEntries) {
      if (p.type !== "enum" || !p.attr) continue;
      for (const value of p.values ?? []) {
        expect(pairs.has(`${p.attr}=${value}`), `${name}: [${p.attr}="${value}"]`).toBe(true);
      }
    }
    for (const [, p] of propEntries) {
      if (p.type !== "boolean" || !p.attr) continue;
      expect(selectedAttributes(RULES).has(p.attr)).toBe(true);
    }
  });

  it("selects no bare value-less attribute except the boolean data-scroll", () => {
    // The 1.x forced collapse rode exactly such selectors: a blanket
    // `[data-cols]` and a blanket `[data-span]`. Only the declared boolean may
    // be selected by presence.
    const presence = new Set<string>();
    for (const rule of RULES) {
      for (const selector of rule.selectors) {
        for (const a of selector.matchAll(/\[([a-z-]+)(="[^"]*")?\]/g)) {
          if (a[2] === undefined && a[1] !== "data-ui") presence.add(a[1]);
        }
      }
    }
    expect([...presence]).toEqual(["data-scroll"]);
  });

  it("suffixes no protocol attribute — the grammar cannot reach data-variant", () => {
    for (const attr of selectedAttributes(RULES)) {
      const parsed = parseResponsiveAttribute(attr);
      if (parsed) expect(isProtocolAttribute(parsed.base), attr).toBe(false);
    }
  });

  it("tokens_used matches the tokens the CSS actually reads", () => {
    const local = new Set([...CSS.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm)].map((m) => m[1]));
    const used = new Set<string>();
    for (const m of CSS.matchAll(/var\((--[a-z0-9-]+)/g)) {
      if (!local.has(m[1])) used.add(m[1].slice(2));
    }
    expect([...used].sort()).toEqual([...MANIFEST.tokens_used].sort());
    // …including the three gaps the 1.x manifest never listed.
    for (const token of ["space-10", "space-12", "space-16"]) {
      expect(MANIFEST.tokens_used).toContain(token);
    }
    const header = /@ui:tokens ([^*]+)\*\//.exec(CSS)![1].trim().split(/\s+/);
    expect(header).toEqual(MANIFEST.tokens_used);
  });

  it("is mobile-first on the canon: min-width only, ascending tiers, no ranges", () => {
    // Comments stripped: the header narrates the 1.x max-width defect; the
    // rules themselves may not contain it.
    const rules = CSS.replace(/\/\*[^]*?\*\//g, "");
    expect(rules).not.toContain("max-width");
    const preludes = [...rules.matchAll(/@media\s*\(([^)]*)\)/g)].map((m) => m[1].trim());
    expect(preludes.length).toBe(TIERS.length);
    expect(preludes).toEqual(TIERS.map((t) => `min-width: ${BREAKPOINTS[t].rem}rem`));
  });

  it("raises each tier's specificity above the one below it", () => {
    // The source-order independence mechanism itself: base (0,2,0), then one
    // more [data-ui="grid"] per tier. Checked structurally so a refactor to
    // equal-specificity blocks cannot pass on the strength of file order.
    const weightOf = (tier: Tier) =>
      2 + TIERS.indexOf(tier) + 1;
    for (const tier of TIERS) {
      const media = `(min-width: ${BREAKPOINTS[tier].rem}rem)`;
      const tierRules = RULES.filter((r) => r.media === media);
      expect(tierRules.length, `tier ${tier} has rules`).toBeGreaterThan(0);
      for (const rule of tierRules) {
        for (const selector of rule.selectors) {
          const uiCount = [...selector.matchAll(/\[data-ui="grid"\]/g)].length;
          const condCount = [...selector.matchAll(/\[[a-z-]+(="[^"]*")?\]/g)].length;
          expect(condCount, selector).toBe(weightOf(tier));
          expect(uiCount, selector).toBe(weightOf(tier) - 1);
        }
      }
    }
  });
});

// ── 2 · Cascade resolution ───────────────────────────────────────────────────

describe("grid — responsive resolution against the shipped rules", () => {
  it("holds the unsuffixed base at every width — the forced collapse is gone", () => {
    for (const width of [PHONE, DEAD_ZONE, TABLET, DESKTOP]) {
      expect(grid({ "data-cols": "4" }, "grid-template-columns", width)).toBe("repeat(4, 1fr)");
      expect(grid({ "data-cols": "12" }, "grid-template-columns", width)).toBe("repeat(12, 1fr)");
    }
  });

  it("lands a 640.5px viewport in the sm tier — min-width floors leave no dead zone", () => {
    const attrs: ElementAttrs = { "data-cols": "1", "data-cols-sm": "2" };
    expect(grid(attrs, "grid-template-columns", BREAKPOINTS.sm.px - 0.5)).toBe("repeat(1, 1fr)");
    expect(grid(attrs, "grid-template-columns", DEAD_ZONE)).toBe("repeat(2, 1fr)");
  });

  it("resolves the mobile-first KPI ladder 1 → 2 → 4", () => {
    const attrs: ElementAttrs = {
      "data-cols": "1",
      "data-cols-md": "2",
      "data-cols-lg": "4",
    };
    expect(grid(attrs, "grid-template-columns", PHONE)).toBe("repeat(1, 1fr)");
    expect(grid(attrs, "grid-template-columns", DEAD_ZONE)).toBe("repeat(1, 1fr)");
    expect(grid(attrs, "grid-template-columns", BREAKPOINTS.md.px)).toBe("repeat(2, 1fr)");
    expect(grid(attrs, "grid-template-columns", BREAKPOINTS.lg.px)).toBe("repeat(4, 1fr)");
    expect(grid(attrs, "grid-template-columns", DESKTOP)).toBe("repeat(4, 1fr)");
  });

  it("lets each tier take over from the one below it", () => {
    const attrs: ElementAttrs = { "data-cols-sm": "2", "data-cols-lg": "6" };
    expect(grid(attrs, "grid-template-columns", PHONE)).toBeUndefined();
    expect(grid(attrs, "grid-template-columns", BREAKPOINTS.sm.px)).toBe("repeat(2, 1fr)");
    expect(grid(attrs, "grid-template-columns", BREAKPOINTS.lg.px)).toBe("repeat(6, 1fr)");
    expect(grid(attrs, "grid-template-columns", DESKTOP)).toBe("repeat(6, 1fr)");
  });

  it("resolves identically against a deliberately re-ordered stylesheet", () => {
    // Tier precedence must come from specificity, never from where a bundler
    // happened to put a block: reverse the whole sheet, and sort it by selector
    // text, and every resolution below must not move.
    const reversed: CascadeRule[] = [...RULES].reverse().map((r, i) => ({ ...r, order: i }));
    const sorted: CascadeRule[] = [...RULES]
      .sort((a, b) => a.selectors.join().localeCompare(b.selectors.join()))
      .map((r, i) => ({ ...r, order: i }));

    const probes: Array<[ElementAttrs, string]> = [
      [{ "data-cols": "1", "data-cols-md": "2", "data-cols-lg": "4" }, "grid-template-columns"],
      [{ "data-cols": "auto", "data-min": "12" }, "grid-template-columns"],
      [{ "data-cols": "auto", "data-min": "12" }, "--grid-min"],
      [{ "data-gap": "2", "data-gap-lg": "16" }, "gap"],
      [{ "data-scroll": true }, "display"],
    ];
    for (const [attrs, property] of probes) {
      for (const width of [PHONE, DEAD_ZONE, TABLET, BREAKPOINTS.lg.px, DESKTOP]) {
        const shipped = grid(attrs, property, width);
        expect(resolve(reversed, "grid", attrs, property, width),
          `${property} @ ${width}px, reversed`).toBe(shipped!);
        expect(resolve(sorted, "grid", attrs, property, width),
          `${property} @ ${width}px, sorted`).toBe(shipped!);
      }
    }
  });

  it("overrides the mobile-first gap from the tier up, and only from there", () => {
    const attrs: ElementAttrs = { "data-gap": "2", "data-gap-lg": "16" };
    expect(grid(attrs, "gap", PHONE)).toBe("var(--space-2)");
    expect(grid(attrs, "gap", TABLET)).toBe("var(--space-2)");
    expect(grid(attrs, "gap", BREAKPOINTS.lg.px)).toBe("var(--space-16)");
  });

  it("compiles auto mode to the auto-fit template, identical at every width", () => {
    const attrs: ElementAttrs = { "data-cols": "auto" };
    for (const width of [PHONE, DEAD_ZONE, TABLET, DESKTOP]) {
      expect(grid(attrs, "grid-template-columns", width)).toBe(AUTO_TEMPLATE);
    }
  });

  it("keeps the auto path free of media queries — doctrine 1 needs none", () => {
    // Whatever the viewport, the rules that decide an intrinsic grid's template
    // and item floor must be unconditioned ones.
    const attrs: ElementAttrs = { "data-cols": "auto", "data-min": "12" };
    for (const width of [PHONE, DEAD_ZONE, TABLET, DESKTOP]) {
      expect(resolveRule(RULES, "grid", attrs, "grid-template-columns", width)!.media).toBeNull();
      expect(resolveRule(RULES, "grid", attrs, "--grid-min", width)!.media).toBeNull();
    }
  });

  it("honors data-min as the item floor, defaulting to 16rem", () => {
    expect(grid({ "data-cols": "auto" }, "--grid-min", PHONE)).toBe("16rem");
    for (const [step, rem] of [["8", "8rem"], ["12", "12rem"], ["20", "20rem"], ["24", "24rem"]]) {
      expect(grid({ "data-cols": "auto", "data-min": step! }, "--grid-min", PHONE)).toBe(rem!);
    }
    // The floor is read through the template, so it works per tier too.
    expect(grid({ "data-cols": "1", "data-cols-md": "auto" }, "grid-template-columns", TABLET)).toBe(
      AUTO_TEMPLATE,
    );
  });

  it("never crushes a span — span rules are unconditioned child rules", () => {
    const spanRules = RULES.filter((r) => r.selectors.some((s) => s.includes("data-span")));
    expect(spanRules.length).toBe(5);
    for (const rule of spanRules) {
      expect(rule.media).toBeNull();
      expect(rule.selectors[0].startsWith('[data-ui="grid"] > [data-span=')).toBe(true);
    }
    const byValue = Object.fromEntries(
      spanRules.map((r) => [/data-span="([^"]+)"/.exec(r.selectors[0])![1], r.decls["grid-column"]]),
    );
    expect(byValue).toEqual({ "2": "span 2", "3": "span 3", "4": "span 4", "6": "span 6", full: "1 / -1" });
  });

  it("makes data-scroll a snap strip below sm and a grid again from sm up", () => {
    const attrs: ElementAttrs = { "data-cols": "4", "data-scroll": true };
    expect(grid(attrs, "display", PHONE)).toBe("flex");
    expect(grid(attrs, "overflow-x", PHONE)).toBe("auto");
    expect(grid(attrs, "scroll-snap-type", PHONE)).toBe("x mandatory");

    for (const width of [BREAKPOINTS.sm.px, DEAD_ZONE, DESKTOP]) {
      expect(grid(attrs, "display", width)).toBe("grid");
      expect(grid(attrs, "overflow-x", width)).toBe("visible");
    }
    // The columns still come from the cols vocabulary once the grid is back.
    expect(grid(attrs, "grid-template-columns", DESKTOP)).toBe("repeat(4, 1fr)");

    // Children: a floor + snap alignment below sm, both released from sm up.
    const child = RULES.find(
      (r) => r.media === null && r.selectors.includes('[data-ui="grid"][data-scroll] > *'),
    )!;
    expect(child.decls["min-inline-size"]).toBe("280px");
    expect(child.decls["scroll-snap-align"]).toBe("start");
    const restore = RULES.find(
      (r) =>
        r.media === `(min-width: ${BREAKPOINTS.sm.rem}rem)` &&
        r.selectors.some((s) => s.endsWith('[data-scroll] > *')),
    )!;
    expect(restore.decls["min-inline-size"]).toBe("auto");
    expect(restore.decls["flex-shrink"]).toBe("1");
  });
});

// ── 3 · The generated surfaces ───────────────────────────────────────────────

describe("grid — one declaration, every generated surface", () => {
  const ir = manifestToIR(MANIFEST, "registry/primitives/grid/grid.manifest.json");

  it("expands cols and gap into four typed tier props each in the IR", () => {
    for (const group of ["cols", "gap"]) {
      for (const tier of TIERS) {
        const prop = `${group}${tier[0].toUpperCase()}${tier.slice(1)}`;
        const v = ir.variants.find((x) => x.prop === prop);
        expect(v, `${prop} missing from the IR`).toBeDefined();
        expect(v!.attr).toBe(`data-${group}-${tier}`);
        expect(v!.basedOn).toBe(group);
        expect(v!.tier).toBe(tier as Tier);
      }
    }
  });

  it("keeps auto in the cols union and scroll as a boolean prop", () => {
    expect(ir.variants.find((v) => v.prop === "cols")!.values).toContain("auto");
    const scroll = ir.states.find((s) => s.prop === "scroll")!;
    expect(scroll).toMatchObject({ attr: "data-scroll", kind: "presence", value: null });
    expect(scroll.doc).toBe(MANIFEST.props!.scroll.description);
    // The enum props document child/auto vocabulary; they are not root booleans.
    expect(ir.states.some((s) => s.prop === "min" || s.prop === "span")).toBe(false);
  });

  for (const target of ["vue", "react"] as const) {
    it(`LGrid (${target}) ships the typed props`, () => {
      const src = readFileSync(join(ROOT, "packages", target, "src/components/grid.ts"), "utf8");
      expect(src).toContain(
        'export type LGridCols = "1" | "2" | "3" | "4" | "6" | "12" | "auto";',
      );
      expect(src).toContain(
        'export type LGridGap = "0" | "1" | "2" | "3" | "4" | "6" | "8" | "10" | "12" | "16";',
      );
      for (const tier of ["Sm", "Md", "Lg", "Xl"]) {
        expect(src).toContain(`cols${tier}?: LGridCols;`);
        expect(src).toContain(`gap${tier}?: LGridGap;`);
      }
      expect(src).toContain("scroll?: boolean;");
      // Tier props reuse the base union — one exported type per group.
      expect(src).not.toContain("LGridColsMd");
    });
  }

  it("shows the responsive column on the docs page", () => {
    const page = buildDocsSite().find((f) => f.path === "components/primitives/grid.html")!;
    expect(page, "grid has a docs page").toBeDefined();
    expect(page.content).toContain('<th scope="col">Responsive</th>');
    for (const tier of TIERS) {
      expect(page.content).toContain(`<code>data-cols-${tier}="…"</code>`);
      expect(page.content).toContain(`<code>data-gap-${tier}="…"</code>`);
    }
  });

  it("shows auto mode and the mobile-first ladder on the reference page", () => {
    expect(HTML).toContain('data-cols="auto"');
    expect(HTML).toContain('data-min="16"');
    expect(HTML).toContain('data-cols="1" data-cols-md="2" data-cols-lg="4"');
    expect(HTML).toContain("data-scroll");
    expect(HTML).toContain('data-span="full"');
  });
});
