// `cluster` — the wrapping inline row (task 0.8-05).
//
// cluster is the doctrine's FIRST rung shipped as a component (FAQIR-SPEC §15
// doctrine 1): its responsiveness is intrinsic, so the row that reflows needs no
// threshold to be right. The registry faked it for a year — the docs site's
// theme frames, hero's bespoke actions CSS, half a dozen patterns' local
// `flex-wrap: wrap` — and this suite is what says the fake is over.
//
// Four things are under test, in the order they matter:
//
//  1. **Completeness, both ways** — every `data-*` the sheet selects on is
//     declared, and every declared value has a rule. Born clean under the rule
//     0.8-10 will generalize (the stack 2.0 precedent, applied to a component
//     that never had a chance to drift).
//  2. **Resolution against the real sheet** — wrap, gap, align, justify and the
//     tier ladder, resolved through the shared cascade helper, including against
//     a deliberately re-ordered stylesheet: tier precedence is specificity here,
//     never document order (the grid 2.0 mechanism, task 0.8-04).
//  3. **Logical-property compliance** — the framework's own audit rule over the
//     sheet, plus the specific claim that the push idiom is
//     `margin-inline-start`, so "actions on the right" is "actions at the end"
//     in an RTL locale.
//  4. **The generated surfaces** — one declaration, and the bindings, the docs
//     page and the skill all show it without anyone editing them.

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
  isProtocolAttribute,
  parseResponsiveAttribute,
  type Tier,
} from "../../src/utils/breakpoints";
import { buildDocsSite } from "../../src/generator/docs";
import {
  collectRules,
  resolve,
  resolveIn,
  resolveValue,
  selectedAttributes,
  selectedPairs,
  type CascadeRule,
  type ElementAttrs,
} from "../helpers/css-cascade";

const ROOT = join(import.meta.dir, "../..");
const DIR = join(ROOT, "registry", "primitives", "cluster");

const CSS = readFileSync(join(DIR, "cluster.css"), "utf8");
const HTML = readFileSync(join(DIR, "cluster.html"), "utf8");
const MANIFEST = JSON.parse(readFileSync(join(DIR, "cluster.manifest.json"), "utf8")) as Manifest;

const RULES = collectRules(CSS);

const PHONE = 390;
/** grid 1.x's fractional dead zone — a width the canon must still place. */
const DEAD_ZONE = 640.5;
const TABLET = BREAKPOINTS.md.px + 32;
const DESKTOP = BREAKPOINTS.xl.px + 100;
const WIDTHS = [PHONE, DEAD_ZONE, TABLET, BREAKPOINTS.lg.px, DESKTOP];

const cluster = (attrs: ElementAttrs, property: string, width: number) =>
  resolve(RULES, "cluster", attrs, property, width);

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

describe("cluster — manifest declares everything the CSS selects on", () => {
  it("validates as a 1.0.0 layout primitive", () => {
    expect(validateManifest(MANIFEST)).toEqual([]);
    expect(MANIFEST.version).toBe("1.0.0");
    expect(MANIFEST.kind).toBe("primitive");
    expect(MANIFEST.category).toBe("layout");
  });

  it("leaves no data-* attribute in cluster.css undeclared", () => {
    const declared = declaredAttributes();
    const undeclared = [...selectedAttributes(RULES)].filter(
      (attr) => attr !== "data-ui" && !declared.has(attr),
    );
    expect(undeclared, `undeclared in cluster.manifest.json: ${undeclared.join(", ")}`).toEqual([]);
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

  it("ships a rule for every declared variant value, base and tier alike", () => {
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

  it("selects no bare value-less attribute except the boolean data-push", () => {
    const presence = new Set<string>();
    for (const rule of RULES) {
      for (const selector of rule.selectors) {
        for (const a of selector.matchAll(/\[([a-z-]+)(="[^"]*")?\]/g)) {
          if (a[2] === undefined && a[1] !== "data-ui") presence.add(a[1]);
        }
      }
    }
    expect([...presence]).toEqual(["data-push"]);
    expect(MANIFEST.props!.push.type).toBe("boolean");
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
    const header = /@ui:tokens ([^*]+)\*\//.exec(CSS)![1].trim().split(/\s+/);
    expect(header).toEqual(MANIFEST.tokens_used);
  });

  it("is mobile-first on the canon: min-width only, four ascending tiers", () => {
    const rules = CSS.replace(/\/\*[^]*?\*\//g, "");
    expect(rules).not.toContain("max-width");
    const preludes = [...rules.matchAll(/@media\s*\(([^)]*)\)/g)].map((m) => m[1].trim());
    expect(preludes.length).toBe(TIERS.length);
    expect(preludes).toEqual(TIERS.map((t) => `min-width: ${BREAKPOINTS[t].rem}rem`));
  });

  it("raises each tier's specificity above the one below it", () => {
    // grid 2.0's mechanism (0.8-04): base (0,2,0), one more [data-ui="cluster"]
    // per tier. Checked structurally, so a refactor to equal-specificity blocks
    // cannot pass on the strength of file order.
    const weightOf = (tier: Tier) => 3 + TIERS.indexOf(tier);
    for (const tier of TIERS) {
      const media = `(min-width: ${BREAKPOINTS[tier].rem}rem)`;
      const tierRules = RULES.filter((r) => r.media === media);
      expect(tierRules.length, `tier ${tier} has rules`).toBeGreaterThan(0);
      for (const rule of tierRules) {
        for (const selector of rule.selectors) {
          const uiCount = [...selector.matchAll(/\[data-ui="cluster"\]/g)].length;
          const condCount = [...selector.matchAll(/\[[a-z-]+(="[^"]*")?\]/g)].length;
          expect(condCount, selector).toBe(weightOf(tier));
          expect(uiCount, selector).toBe(weightOf(tier) - 1);
        }
      }
    }
  });
});

// ── 2 · Cascade resolution ───────────────────────────────────────────────────

describe("cluster — resolution against the shipped rules", () => {
  it("wraps at every width, from a rule no query can switch off", () => {
    // The whole thesis of the primitive: the wrap is not responsive behaviour
    // that a breakpoint turns on, it is what the component IS.
    for (const width of WIDTHS) {
      expect(cluster({}, "flex-wrap", width)).toBe("wrap");
      expect(resolveIn(RULES, "cluster", "flex-wrap", { attrs: {}, widthPx: width })!.media).toBeNull();
    }
    expect(cluster({}, "display", PHONE)).toBe("flex");
  });

  it("applies the declared defaults to a bare cluster", () => {
    // A declared default is a promise about markup that names no attribute.
    expect(cluster({}, "gap", PHONE)).toBe("var(--space-2)");
    expect(MANIFEST.variants!.gap.default).toBe("2");
    expect(cluster({}, "align-items", PHONE)).toBe("center");
    expect(MANIFEST.variants!.align.default).toBe("center");
    // justify's default is `start`, which is flex's own default — the value
    // rule exists, and nothing overrides it on a bare cluster.
    expect(MANIFEST.variants!.justify.default).toBe("start");
    expect(cluster({}, "justify-content", PHONE)).toBeUndefined();
    expect(cluster({ "data-justify": "start" }, "justify-content", PHONE)).toBe("flex-start");
  });

  it("resolves every gap step from the spacing scale", () => {
    for (const step of MANIFEST.variants!.gap.values) {
      const expected = step === "0" ? "var(--space-0, 0px)" : `var(--space-${step})`;
      expect(cluster({ "data-gap": step }, "gap", PHONE)).toBe(expected);
    }
  });

  it("resolves align and justify to their flexbox values", () => {
    const align: Record<string, string> = {
      start: "flex-start",
      center: "center",
      end: "flex-end",
      stretch: "stretch",
      baseline: "baseline",
    };
    for (const [value, css] of Object.entries(align)) {
      expect(cluster({ "data-align": value }, "align-items", PHONE)).toBe(css);
    }
    const justify: Record<string, string> = {
      start: "flex-start",
      center: "center",
      end: "flex-end",
      between: "space-between",
      around: "space-around",
    };
    for (const [value, css] of Object.entries(justify)) {
      expect(cluster({ "data-justify": value }, "justify-content", PHONE)).toBe(css);
    }
  });

  it("lets a tier value override the base from its floor up, and only from there", () => {
    const attrs: ElementAttrs = { "data-gap": "1", "data-gap-md": "4", "data-justify-lg": "between" };
    expect(cluster(attrs, "gap", PHONE)).toBe("var(--space-1)");
    expect(cluster(attrs, "gap", DEAD_ZONE)).toBe("var(--space-1)");
    expect(cluster(attrs, "gap", BREAKPOINTS.md.px)).toBe("var(--space-4)");
    expect(cluster(attrs, "gap", DESKTOP)).toBe("var(--space-4)");

    expect(cluster(attrs, "justify-content", TABLET)).toBeUndefined();
    expect(cluster(attrs, "justify-content", BREAKPOINTS.lg.px)).toBe("space-between");
  });

  it("hands each tier over to the one above it", () => {
    const attrs: ElementAttrs = { "data-align": "start", "data-align-sm": "center", "data-align-xl": "end" };
    expect(cluster(attrs, "align-items", PHONE)).toBe("flex-start");
    expect(cluster(attrs, "align-items", BREAKPOINTS.sm.px)).toBe("center");
    expect(cluster(attrs, "align-items", BREAKPOINTS.lg.px)).toBe("center");
    expect(cluster(attrs, "align-items", BREAKPOINTS.xl.px)).toBe("flex-end");
  });

  it("resolves identically against a deliberately re-ordered stylesheet", () => {
    const reversed: CascadeRule[] = [...RULES].reverse().map((r, i) => ({ ...r, order: i }));
    const sorted: CascadeRule[] = [...RULES]
      .sort((a, b) => a.selectors.join().localeCompare(b.selectors.join()))
      .map((r, i) => ({ ...r, order: i }));

    const probes: Array<[ElementAttrs, string]> = [
      [{ "data-gap": "1", "data-gap-md": "4" }, "gap"],
      [{ "data-align": "start", "data-align-lg": "baseline" }, "align-items"],
      [{ "data-justify": "center", "data-justify-sm": "between" }, "justify-content"],
      [{}, "flex-wrap"],
    ];
    for (const [attrs, property] of probes) {
      for (const width of WIDTHS) {
        const shipped = cluster(attrs, property, width);
        expect(resolve(reversed, "cluster", attrs, property, width),
          `${property} @ ${width}px, reversed`).toBe(shipped!);
        expect(resolve(sorted, "cluster", attrs, property, width),
          `${property} @ ${width}px, sorted`).toBe(shipped!);
      }
    }
  });
});

// ── 3 · Logical properties ───────────────────────────────────────────────────

describe("cluster — direction-agnostic by construction", () => {
  it("has zero findings from the framework's own logical-properties rule", () => {
    const findings = buildLogicalPropertyResults(CSS, "cluster", "cluster.css").map(
      (r) => `${r.line}: ${r.message}`,
    );
    expect(findings).toEqual([]);
  });

  it("pushes a child with margin-inline-start, not margin-left", () => {
    const value = resolveValue(RULES, "cluster", "margin-inline-start", {
      attrs: {},
      child: { "data-push": true },
      widthPx: PHONE,
    });
    expect(value).toBe("auto");
    // …and only that child: an unpushed sibling is untouched.
    expect(
      resolveValue(RULES, "cluster", "margin-inline-start", { attrs: {}, child: {}, widthPx: PHONE }),
    ).toBeUndefined();
    // The push holds at every width — it is an idiom, not a breakpoint.
    const rule = resolveIn(RULES, "cluster", "margin-inline-start", {
      attrs: {},
      child: { "data-push": true },
      widthPx: DESKTOP,
    })!;
    expect(rule.media).toBeNull();
  });

  it("names no physical direction anywhere in the sheet", () => {
    const rules = CSS.replace(/\/\*[^]*?\*\//g, "");
    for (const banned of [
      /margin-(left|right)\s*:/,
      /padding-(left|right)\s*:/,
      /(^|[\s;{])(left|right)\s*:/,
      /text-align:\s*(left|right)/,
      /border-(left|right)/,
    ]) {
      expect(banned.test(rules), `cluster.css must not use ${banned}`).toBe(false);
    }
  });
});

// ── 4 · The generated surfaces ───────────────────────────────────────────────

describe("cluster — one declaration, every generated surface", () => {
  const ir = manifestToIR(MANIFEST, "registry/primitives/cluster/cluster.manifest.json");

  it("expands each responsive group into four typed tier props in the IR", () => {
    for (const group of ["gap", "align", "justify"]) {
      for (const tier of TIERS) {
        const prop = `${group}${tier[0].toUpperCase()}${tier.slice(1)}`;
        const v = ir.variants.find((x) => x.prop === prop);
        expect(v, `${prop} missing from the IR`).toBeDefined();
        expect(v!.attr).toBe(`data-${group}-${tier}`);
        expect(v!.basedOn).toBe(group);
        expect(v!.tier).toBe(tier as Tier);
      }
    }
    const push = ir.states.find((s) => s.prop === "push")!;
    expect(push).toMatchObject({ attr: "data-push", kind: "presence", value: null });
  });

  for (const target of ["vue", "react"] as const) {
    it(`LCluster (${target}) ships the typed props`, () => {
      const src = readFileSync(join(ROOT, "packages", target, "src/components/cluster.ts"), "utf8");
      expect(src).toContain(
        'export type LClusterGap = "0" | "1" | "2" | "3" | "4" | "6" | "8" | "10" | "12" | "16";',
      );
      expect(src).toContain(
        'export type LClusterAlign = "start" | "center" | "end" | "stretch" | "baseline";',
      );
      expect(src).toContain(
        'export type LClusterJustify = "start" | "center" | "end" | "between" | "around";',
      );
      for (const tier of ["Sm", "Md", "Lg", "Xl"]) {
        expect(src).toContain(`gap${tier}?: LClusterGap;`);
        expect(src).toContain(`align${tier}?: LClusterAlign;`);
        expect(src).toContain(`justify${tier}?: LClusterJustify;`);
      }
      expect(src).toContain("push?: boolean;");
      // Tier props reuse the base union — one exported type per group.
      expect(src).not.toContain("LClusterGapMd");
    });
  }

  it("has a docs page with the responsive column", () => {
    const page = buildDocsSite().find((f) => f.path === "components/primitives/cluster.html")!;
    expect(page, "cluster has a docs page").toBeDefined();
    expect(page.content).toContain('<th scope="col">Responsive</th>');
    for (const tier of TIERS) {
      expect(page.content).toContain(`<code>data-gap-${tier}="…"</code>`);
      expect(page.content).toContain(`<code>data-justify-${tier}="…"</code>`);
    }
  });

  it("holds the docs site's wrap use cases — the fakes are retired", () => {
    // The two rows in every theme-preview frame were an inline `flex-wrap`
    // escape (0.7-20), then stack + `data-wrap` (0.8-03), and are a cluster now:
    // a button row and a swatch row are what the primitive is for. The theme and
    // scheme switchers on the gallery page move with them — and shed the
    // deprecated `data-variant="horizontal"` spelling in the process.
    const site = buildDocsSite();
    const frames = site.filter((f) => f.path.startsWith("frames/theme-preview-"));
    expect(frames.length).toBeGreaterThan(0);
    for (const frame of frames) {
      expect(frame.content, frame.path).toContain('<div data-ui="cluster" data-gap="2">');
      expect(frame.content, frame.path).toContain('<div data-ui="cluster" data-gap="1">');
      expect(frame.content, frame.path).not.toContain("flex-wrap");
      expect(frame.content, frame.path).not.toContain("data-wrap");
    }
    const gallery = site.find((f) => f.path === "themes/index.html")!;
    expect(gallery.content).toContain('<div data-ui="cluster" data-gap="2" role="group" aria-label="Theme">');
    expect(gallery.content).toContain(
      '<div data-ui="cluster" data-gap="2" role="group" aria-label="Colour scheme">',
    );
    expect(gallery.content).not.toContain('data-variant="horizontal"');
  });

  it("appears in the generated skill with its responsive grammar", async () => {
    const files = await generateShippedSkillFiles();
    const primitives = files.find((f) => f.relPath.endsWith("primitives.md"))!.content;
    expect(primitives).toContain("## cluster");
    expect(primitives).toContain("data-gap-sm");
  });

  it("shows the workhorse rows on the reference page", () => {
    expect(HTML).toContain('data-ui="cluster"');
    expect(HTML).toContain("data-push");
    expect(HTML).toContain('data-justify="between"');
    expect(HTML).toContain('data-gap-md="4"');
  });
});
