// `switcher` — the container-driven row (task 0.8-05).
//
// switcher is the doctrine's MIDDLE rung shipped as a component (FAQIR-SPEC §15
// doctrine 2): the first layout component in the registry whose responsiveness
// asks about the component's own inline size and never about the viewport. That
// claim is only worth as much as its proof, so this suite asserts it three
// different ways:
//
//   • **Structurally** — `switcher.css` contains no `@media` rule at all, and
//     none of its attributes takes a tier suffix. The absence IS the component.
//   • **By prelude** — the four `@container` conditions are rebuilt from the
//     canon module (`containerQuery(tier, "faqir-switcher")`) and compared, so
//     the thresholds cannot drift from the ladder the rest of the framework uses.
//   • **Behaviourally** — the flip is resolved through the real rules at mocked
//     CONTAINER widths, and the same resolutions are repeated at viewport widths
//     from a phone to a 4K display: a viewport that changes nothing is what
//     "zero viewport coupling" means.
//
// The flip lives on the children (`flex-basis: 100%` → `0`) because a container
// query styles a container's DESCENDANTS, never the container itself — so a row
// that measures itself cannot be written as `flex-direction` on the root. The
// cascade helper resolves child rules for exactly this reason.

import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { validateManifest, type Manifest } from "../../src/manifest";
import { manifestToIR } from "../../src/bindings/ir";
import { buildLogicalPropertyResults } from "../../src/audit/checker";
import { generateShippedSkillFiles } from "../../src/generator/skill";
import {
  BREAKPOINTS,
  TIERS,
  containerQuery,
  isProtocolAttribute,
  parseResponsiveAttribute,
  type Tier,
} from "../../src/utils/breakpoints";
import { buildDocsSite } from "../../src/generator/docs";
import {
  collectRules,
  containerName,
  resolveIn,
  resolveValue,
  selectedAttributes,
  selectedPairs,
  type CascadeRule,
  type ElementAttrs,
} from "../helpers/css-cascade";

const ROOT = join(import.meta.dir, "../..");
const DIR = join(ROOT, "registry", "primitives", "switcher");

const CSS = readFileSync(join(DIR, "switcher.css"), "utf8");
const HTML = readFileSync(join(DIR, "switcher.html"), "utf8");
const MANIFEST = JSON.parse(readFileSync(join(DIR, "switcher.manifest.json"), "utf8")) as Manifest;

const RULES = collectRules(CSS);

const CONTAINER = "faqir-switcher";
/** Viewports the container-driven resolutions are repeated at — none may matter. */
const VIEWPORTS = [390, 640.5, 1024, 1920];
const COLUMN = "100%";
const ROW = "0";

/** The child's `flex-basis` for a switcher of `containerPx`, at viewport `widthPx`. */
const basis = (attrs: ElementAttrs, containerPx: number, widthPx = 1024) =>
  resolveValue(RULES, "switcher", "flex-basis", { attrs, child: {}, containerPx, widthPx });

const variantGroups = Object.entries(MANIFEST.variants ?? {});

function declaredValueSets(): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const [, v] of variantGroups) {
    out.set(v.attr, v.values);
    if (v.responsive !== true) continue;
    for (const tier of TIERS) out.set(`${v.attr}-${tier}`, v.values);
  }
  for (const [, p] of Object.entries(MANIFEST.props ?? {})) {
    if (p.type === "enum" && p.attr && p.values) out.set(p.attr, p.values);
  }
  return out;
}

// ── 1 · Completeness ─────────────────────────────────────────────────────────

describe("switcher — manifest declares everything the CSS selects on", () => {
  it("validates as a 1.0.0 layout primitive", () => {
    expect(validateManifest(MANIFEST)).toEqual([]);
    expect(MANIFEST.version).toBe("1.0.0");
    expect(MANIFEST.kind).toBe("primitive");
    expect(MANIFEST.category).toBe("layout");
  });

  it("leaves no data-* attribute in switcher.css undeclared", () => {
    const declared = new Set<string>([...declaredValueSets().keys()]);
    for (const [, p] of Object.entries(MANIFEST.props ?? {})) if (p.attr) declared.add(p.attr);
    const undeclared = [...selectedAttributes(RULES)].filter(
      (attr) => attr !== "data-ui" && !declared.has(attr),
    );
    expect(undeclared, `undeclared in switcher.manifest.json: ${undeclared.join(", ")}`).toEqual([]);
  });

  it("selects on no value the manifest does not declare, and ships a rule for each", () => {
    const sets = declaredValueSets();
    const pairs = selectedPairs(RULES);
    const rogue = [...pairs].filter((pair) => {
      const eq = pair.indexOf("=");
      const values = sets.get(pair.slice(0, eq));
      return values !== undefined && !values.includes(pair.slice(eq + 1));
    });
    expect(rogue).toEqual([]);

    const missing: string[] = [];
    for (const [group, v] of variantGroups) {
      for (const value of v.values) {
        if (!pairs.has(`${v.attr}=${value}`)) missing.push(`${group}: [${v.attr}="${value}"]`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("declares nothing responsive — the viewport grammar has no business here", () => {
    // A `data-gap-md` would make a container-driven component viewport-driven
    // again. Asserted in the manifest AND in the sheet: no attribute anywhere
    // parses as a tier-suffixed one.
    for (const [group, v] of variantGroups) {
      expect(v.responsive ?? false, `${group} must not be responsive`).toBe(false);
    }
    for (const attr of selectedAttributes(RULES)) {
      expect(parseResponsiveAttribute(attr), attr).toBeNull();
      expect(isProtocolAttribute(attr) && attr !== "data-ui").toBe(false);
    }
  });

  it("tokens_used matches the tokens the CSS actually reads", () => {
    const local = new Set([...CSS.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm)].map((m) => m[1]));
    const used = new Set<string>();
    for (const m of CSS.matchAll(/var\((--[a-z0-9-]+)/g)) {
      if (!local.has(m[1])) used.add(m[1].slice(2));
    }
    expect([...used].sort()).toEqual([...MANIFEST.tokens_used].sort());
    const header = /@ui:tokens ([^*]+)\*\//.exec(CSS)![1].trim().split(/\s+/);
    expect(header).toEqual(MANIFEST.tokens_used);
  });

  it("has zero findings from the framework's own logical-properties rule", () => {
    expect(
      buildLogicalPropertyResults(CSS, "switcher", "switcher.css").map((r) => `${r.line}: ${r.message}`),
    ).toEqual([]);
  });
});

// ── 2 · Container-driven, and only container-driven ──────────────────────────

describe("switcher — no viewport coupling anywhere in the file", () => {
  it("contains no @media rule at all", () => {
    const rules = CSS.replace(/\/\*[^]*?\*\//g, "");
    expect(rules).not.toContain("@media");
    expect(rules).not.toContain("max-width");
    expect(RULES.every((r) => r.media === null)).toBe(true);
  });

  it("makes the root its own inline-size query container", () => {
    const base = RULES.find((r) => r.selectors.includes('[data-ui="switcher"]'))!;
    expect(base.decls["container-type"]).toBe("inline-size");
    expect(base.decls["container-name"]).toBe(CONTAINER);
    // An inline-size container may not take its width from its contents.
    expect(base.decls["inline-size"]).toBe("100%");
    expect(base.decls.display).toBe("flex");
  });

  it("uses exactly the four canon thresholds, built from the canon module", () => {
    const preludes = RULES.filter((r) => r.container !== null).map((r) => `@container ${r.container}`);
    const unique = [...new Set(preludes)];
    expect(unique).toEqual(TIERS.map((t) => containerQuery(t, CONTAINER)));
    for (const r of RULES) {
      if (r.container === null) continue;
      expect(containerName(r.container)).toBe(CONTAINER);
    }
  });

  it("names one threshold value per canon tier, in the same order", () => {
    expect(MANIFEST.variants!.threshold.values).toEqual([...TIERS]);
    expect(MANIFEST.variants!.threshold.default).toBe("sm");
  });
});

// ── 3 · The flip ─────────────────────────────────────────────────────────────

describe("switcher — the flip, resolved through the real @container rules", () => {
  it("is a column below its threshold and a row at and above it", () => {
    for (const tier of TIERS) {
      const attrs: ElementAttrs = { "data-threshold": tier };
      const floor = BREAKPOINTS[tier].px;
      expect(basis(attrs, floor - 0.5), `${tier} just below the floor`).toBe(COLUMN);
      expect(basis(attrs, floor), `${tier} at the floor`).toBe(ROW);
      expect(basis(attrs, floor + 400), `${tier} well above`).toBe(ROW);
      // …and never at a width below the floor, however wide the page is.
      expect(basis(attrs, 320)).toBe(COLUMN);
    }
  });

  it("flips at sm when no threshold is named — the declared default, made real", () => {
    expect(basis({}, BREAKPOINTS.sm.px - 0.5)).toBe(COLUMN);
    expect(basis({}, BREAKPOINTS.sm.px)).toBe(ROW);
    // The bare form and the explicit `sm` behave identically at every probe.
    for (const px of [320, 639, 640, 1200]) {
      expect(basis({}, px), `bare @ ${px}`).toBe(basis({ "data-threshold": "sm" }, px)!);
    }
    // …and naming a wider threshold really does opt out of the sm rule.
    expect(basis({ "data-threshold": "lg" }, BREAKPOINTS.sm.px)).toBe(COLUMN);
  });

  it("gives the same answer at every viewport width — the point of the component", () => {
    const cases: Array<[ElementAttrs, number, string]> = [
      [{}, 320, COLUMN],
      [{}, 900, ROW],
      [{ "data-threshold": "lg" }, 800, COLUMN],
      [{ "data-threshold": "lg" }, 1100, ROW],
      [{ "data-threshold": "xl" }, 1300, ROW],
    ];
    for (const [attrs, containerPx, expected] of cases) {
      for (const widthPx of VIEWPORTS) {
        expect(basis(attrs, containerPx, widthPx), `${containerPx}px container @ ${widthPx}px viewport`)
          .toBe(expected);
      }
    }
  });

  it("keeps children full-width and growing in the column arrangement", () => {
    const child = RULES.find(
      (r) => r.container === null && r.selectors.includes('[data-ui="switcher"] > *'),
    )!;
    expect(child.decls["flex-basis"]).toBe(COLUMN);
    expect(child.decls["flex-grow"]).toBe("1");
    expect(child.decls["min-inline-size"]).toBe("0");
    // Equal columns above the threshold: only the basis changes, grow stays 1.
    expect(
      resolveValue(RULES, "switcher", "flex-grow", {
        attrs: { "data-threshold": "sm" },
        child: {},
        containerPx: 900,
      }),
    ).toBe("1");
  });

  it("wins over the base by specificity, so re-ordering the sheet changes nothing", () => {
    const reversed: CascadeRule[] = [...RULES].reverse().map((r, i) => ({ ...r, order: i }));
    const sorted: CascadeRule[] = [...RULES]
      .sort((a, b) => a.selectors.join().localeCompare(b.selectors.join()))
      .map((r, i) => ({ ...r, order: i }));

    for (const attrs of [{}, { "data-threshold": "sm" }, { "data-threshold": "xl" }] as ElementAttrs[]) {
      for (const containerPx of [320, 640, 768, 1024, 1280, 1600]) {
        const ctx = { attrs, child: {}, containerPx, widthPx: 1024 };
        const shipped = resolveValue(RULES, "switcher", "flex-basis", ctx);
        expect(resolveValue(reversed, "switcher", "flex-basis", ctx),
          `reversed @ ${containerPx}`).toBe(shipped!);
        expect(resolveValue(sorted, "switcher", "flex-basis", ctx),
          `sorted @ ${containerPx}`).toBe(shipped!);
      }
    }
  });

  it("resolves every gap step, from a rule no query can reach", () => {
    for (const step of MANIFEST.variants!.gap.values) {
      const expected = step === "0" ? "var(--space-0, 0px)" : `var(--space-${step})`;
      const rule = resolveIn(RULES, "switcher", "gap", { attrs: { "data-gap": step }, widthPx: 390 })!;
      expect(rule.decls.gap).toBe(expected);
      expect(rule.media).toBeNull();
      expect(rule.container).toBeNull();
    }
    // The declared default is what a bare switcher gets.
    expect(MANIFEST.variants!.gap.default).toBe("4");
    expect(resolveValue(RULES, "switcher", "gap", { attrs: {}, widthPx: 390 })).toBe("var(--space-4)");
  });
});

// ── 4 · The generated surfaces ───────────────────────────────────────────────

describe("switcher — one declaration, every generated surface", () => {
  const ir = manifestToIR(MANIFEST, "registry/primitives/switcher/switcher.manifest.json");

  it("expands into two plain variant props and no tier props at all", () => {
    expect(ir.variants.map((v) => v.prop).sort()).toEqual(["gap", "threshold"]);
    expect(ir.variants.every((v) => v.tier === undefined)).toBe(true);
    expect(ir.states).toEqual([]);
  });

  for (const target of ["vue", "react"] as const) {
    it(`LSwitcher (${target}) ships the typed props`, () => {
      const src = readFileSync(join(ROOT, "packages", target, "src/components/switcher.ts"), "utf8");
      expect(src).toContain('export type LSwitcherThreshold = "sm" | "md" | "lg" | "xl";');
      expect(src).toContain(
        'export type LSwitcherGap = "0" | "1" | "2" | "3" | "4" | "6" | "8" | "10" | "12" | "16";',
      );
      for (const tier of ["Sm", "Md", "Lg", "Xl"]) {
        expect(src).not.toContain(`gap${tier}?:`);
        expect(src).not.toContain(`threshold${tier}?:`);
      }
    });
  }

  it("has a docs page, and deliberately no responsive column on it", () => {
    const page = buildDocsSite().find((f) => f.path === "components/primitives/switcher.html")!;
    expect(page, "switcher has a docs page").toBeDefined();
    expect(page.content).toContain("data-threshold");
    expect(page.content).not.toContain('<th scope="col">Responsive</th>');
  });

  it("appears in the generated skill", async () => {
    const files = await generateShippedSkillFiles();
    const primitives = files.find((f) => f.relPath.endsWith("primitives.md"))!.content;
    expect(primitives).toContain("## switcher");
  });

  it("shows the thresholds and a nested switcher on the reference page", () => {
    expect(HTML).toContain('data-ui="switcher"');
    expect(HTML).toContain('data-threshold="lg"');
    expect(HTML).not.toContain("data-threshold-");
    // The nested example is the container-query claim in markup: two switchers,
    // the inner one measuring the column the outer one gave it.
    expect([...HTML.matchAll(/data-ui="switcher"/g)].length).toBeGreaterThan(5);
  });
});
