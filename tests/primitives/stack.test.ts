// `stack` 2.0 — the full flexbox surface, declared (task 0.8-03).
//
// Three things are under test, in the order they matter:
//
//  1. **Completeness, both ways.** Every `data-*` attribute `stack.css` selects
//     on is declared in the manifest — as a variant attr, a responsive tier of
//     one, a prop or a state — and every declared value has a rule that selects
//     it. This is the per-component forerunner of 0.8-10's general
//     `undeclared-attribute` audit rule; until that rule exists, the drift it
//     will catch is caught here for the one component that had six of them.
//
//  2. **Cascade resolution against the real sheet.** The rules are parsed out of
//     the shipped CSS and resolved for a mocked viewport — specificity first,
//     document order second, media blocks filtered through `window.matchMedia`
//     (the inbox precedent). That is the only way to assert the two things the
//     rewrite actually promises: a tier value wins over the mobile-first base,
//     and the deprecated `data-variant` / `data-responsive` spellings still
//     resolve to the same layout they did in 0.x.
//
//  3. **The generated surfaces.** The declaration is written once; the vue/react
//     bindings and the docs page must show it without anyone editing them.

import { describe, it, expect, afterAll } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { validateManifest, type Manifest } from "../../src/manifest";
import { manifestToIR } from "../../src/bindings/ir";
import {
  BREAKPOINTS,
  ROOT_FONT_SIZE_PX,
  TIERS,
  isProtocolAttribute,
  parseResponsiveAttribute,
  type Tier,
} from "../../src/utils/breakpoints";
import { buildDocsSite } from "../../src/generator/docs";

const ROOT = join(import.meta.dir, "../..");
const DIR = join(ROOT, "registry", "primitives", "stack");

const CSS = readFileSync(join(DIR, "stack.css"), "utf8");
const HTML = readFileSync(join(DIR, "stack.html"), "utf8");
const MANIFEST = JSON.parse(readFileSync(join(DIR, "stack.manifest.json"), "utf8")) as Manifest;

// ── CSS model ────────────────────────────────────────────────────────────────

interface Rule {
  selectors: string[];
  decls: Record<string, string>;
  /** `(min-width: 48rem)` for a rule inside a media block, else null. */
  media: string | null;
  /** Position in the sheet — the tie-breaker at equal specificity. */
  order: number;
}

const ATTR_RE = /\[([a-z-]+)(?:="([^"]*)")?\]/g;

function parseDecls(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const decl of body.split(";")) {
    const colon = decl.indexOf(":");
    if (colon === -1) continue;
    out[decl.slice(0, colon).trim()] = decl.slice(colon + 1).trim();
  }
  return out;
}

function flatRules(css: string, media: string | null, next: () => number): Rule[] {
  const rules: Rule[] = [];
  for (const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    rules.push({
      selectors: m[1].split(",").map((s) => s.trim().replace(/\s+/g, " ")).filter(Boolean),
      decls: parseDecls(m[2]),
      media,
      order: next(),
    });
  }
  return rules;
}

/** Every rule in the sheet, in document order, media blocks flattened. */
function collectRules(source: string): Rule[] {
  const css = source.replace(/\/\*[^]*?\*\//g, "");
  const rules: Rule[] = [];
  let order = 0;
  const next = () => order++;
  let i = 0;
  while (i < css.length) {
    const at = css.indexOf("@media", i);
    if (at === -1) {
      rules.push(...flatRules(css.slice(i), null, next));
      break;
    }
    rules.push(...flatRules(css.slice(i, at), null, next));
    const open = css.indexOf("{", at);
    let depth = 0;
    let close = open;
    for (; close < css.length; close++) {
      if (css[close] === "{") depth++;
      else if (css[close] === "}" && --depth === 0) break;
    }
    const query = css.slice(at + "@media".length, open).trim();
    rules.push(...flatRules(css.slice(open + 1, close), query, next));
    i = close + 1;
  }
  return rules;
}

const RULES = collectRules(CSS);

/** One attribute condition of a selector; `weight` is 0 inside `:where()`. */
interface Cond {
  attr: string;
  value: string | null;
  weight: number;
}

/** Conditions of a compound selector, or null for a rule targeting a child. */
function conditions(selector: string): Cond[] | null {
  if (selector.includes(">") || selector.includes(" ")) return null;
  const conds: Cond[] = [];
  for (const where of selector.matchAll(/:where\(([^)]*)\)/g)) {
    for (const a of where[1].matchAll(ATTR_RE)) {
      conds.push({ attr: a[1], value: a[2] ?? null, weight: 0 });
    }
  }
  for (const a of selector.replace(/:where\([^)]*\)/g, "").matchAll(ATTR_RE)) {
    conds.push({ attr: a[1], value: a[2] ?? null, weight: 1 });
  }
  return conds;
}

/** Every `data-*` attribute the sheet selects on, anywhere. */
function selectedAttributes(): Set<string> {
  const found = new Set<string>();
  for (const rule of RULES) {
    for (const selector of rule.selectors) {
      for (const a of selector.matchAll(ATTR_RE)) found.add(a[1]);
    }
  }
  return found;
}

/** Every `[attr="value"]` pair the sheet selects on. */
function selectedPairs(): Set<string> {
  const found = new Set<string>();
  for (const rule of RULES) {
    for (const selector of rule.selectors) {
      for (const a of selector.matchAll(ATTR_RE)) {
        if (a[2] !== undefined) found.add(`${a[1]}=${a[2]}`);
      }
    }
  }
  return found;
}

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
  return out;
}

/** Every attribute the manifest declares in any form. */
function declaredAttributes(): Set<string> {
  const out = new Set<string>([...declaredValueSets().keys()]);
  for (const [, p] of propEntries) if (p.attr) out.add(p.attr);
  for (const [, s] of Object.entries(MANIFEST.states ?? {})) {
    if (s.attr) out.add(s.attr.split("=")[0]);
  }
  return out;
}

// ── matchMedia mock — the viewport, as the cascade sees it ───────────────────

const realMatchMedia = window.matchMedia;
afterAll(() => {
  window.matchMedia = realMatchMedia;
});

/** A viewport of `width` px. Only `min-width` floors match — by canon. */
function mockViewport(width: number): void {
  window.matchMedia = ((query: string) => {
    const rem = /min-width:\s*([\d.]+)rem/.exec(query);
    const px = /min-width:\s*([\d.]+)px/.exec(query);
    const floor = rem ? Number(rem[1]) * ROOT_FONT_SIZE_PX : px ? Number(px[1]) : null;
    return {
      matches: floor !== null && width >= floor,
      media: query,
      addEventListener() {},
      removeEventListener() {},
    } as unknown as MediaQueryList;
  }) as typeof window.matchMedia;
}

type Attrs = Record<string, string | true>;

/**
 * Resolve one property for a `[data-ui="stack"]` element carrying `attrs` at
 * the currently mocked viewport: highest specificity wins, document order
 * breaks ties, media blocks are filtered through `window.matchMedia`.
 */
function resolve(attrs: Attrs, property: string): string | undefined {
  const all: Attrs = { "data-ui": "stack", ...attrs };
  let best: { spec: number; order: number; value: string } | undefined;
  for (const rule of RULES) {
    if (rule.media && !window.matchMedia(rule.media).matches) continue;
    const value = rule.decls[property];
    if (value === undefined) continue;
    for (const selector of rule.selectors) {
      const conds = conditions(selector);
      if (!conds || conds.length === 0) continue;
      const ok = conds.every((c) =>
        c.value === null ? all[c.attr] !== undefined : all[c.attr] === c.value,
      );
      if (!ok) continue;
      const spec = conds.reduce((n, c) => n + c.weight, 0);
      if (!best || spec > best.spec || (spec === best.spec && rule.order >= best.order)) {
        best = { spec, order: rule.order, value };
      }
    }
  }
  return best?.value;
}

const PHONE = 390;
const TABLET = BREAKPOINTS.md.px + 32;
const DESKTOP = BREAKPOINTS.xl.px + 100;

// ── 1 · Completeness ─────────────────────────────────────────────────────────

describe("stack — manifest declares everything the CSS selects on", () => {
  it("validates, and is the 2.0 release with a breaking changelog entry", () => {
    expect(validateManifest(MANIFEST)).toEqual([]);
    expect(MANIFEST.version).toBe("2.0.0");
    const entry = (MANIFEST.changes ?? []).find((c) => c.version === "2.0.0");
    expect(entry, "stack 2.0 must record its own changelog entry").toBeDefined();
    expect(entry!.breaking).toBe(true);
    expect(entry!.note).toContain("data-direction");
    expect(entry!.note).toContain("data-variant");
  });

  it("leaves no data-* attribute in stack.css undeclared", () => {
    const declared = declaredAttributes();
    const undeclared = [...selectedAttributes()].filter(
      (attr) => attr !== "data-ui" && attr !== "data-part" && !declared.has(attr),
    );
    expect(undeclared, `undeclared in stack.manifest.json: ${undeclared.join(", ")}`).toEqual([]);
  });

  it("names every attribute the 0.7-20 audit found missing", () => {
    const declared = declaredAttributes();
    for (const attr of [
      "data-justify",
      "data-wrap",
      "data-align-text",
      "data-responsive",
      "data-flex",
      "data-direction",
    ]) {
      expect(declared.has(attr), `${attr} must be declared`).toBe(true);
    }
  });

  it("selects on no value a variant group does not declare", () => {
    const sets = declaredValueSets();
    const rogue = [...selectedPairs()].filter((pair) => {
      const eq = pair.indexOf("=");
      const [attr, value] = [pair.slice(0, eq), pair.slice(eq + 1)];
      const values = sets.get(attr);
      return values !== undefined && !values.includes(value);
    });
    expect(rogue).toEqual([]);
  });

  it("ships a rule for every declared variant value, base and tier alike", () => {
    const pairs = selectedPairs();
    const missing: string[] = [];
    for (const [group, v] of variantGroups) {
      // `direction-legacy` rides `data-variant`, which the canon forbids
      // suffixing; the canonical `direction` group carries the tiers.
      const attrs = v.responsive === true ? [v.attr, ...TIERS.map((t) => `${v.attr}-${t}`)] : [v.attr];
      for (const attr of attrs) {
        for (const value of v.values) {
          if (!pairs.has(`${attr}=${value}`)) missing.push(`${group}: [${attr}="${value}"]`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it("declares each responsive prop's values in the CSS too", () => {
    const pairs = selectedPairs();
    for (const [name, p] of propEntries) {
      if (p.type !== "enum" || !p.attr) continue;
      for (const value of p.values ?? []) {
        expect(pairs.has(`${p.attr}=${value}`), `${name}: [${p.attr}="${value}"]`).toBe(true);
      }
    }
    // Boolean props are bare-attribute selectors, not value selectors.
    for (const [, p] of propEntries) {
      if (p.type !== "boolean" || !p.attr) continue;
      expect(selectedAttributes().has(p.attr)).toBe(true);
    }
  });

  it("suffixes no protocol attribute — the grammar cannot reach data-variant", () => {
    for (const attr of selectedAttributes()) {
      expect(parseResponsiveAttribute(attr)?.base ?? "", `${attr}`).not.toBe("data-variant");
      const parsed = parseResponsiveAttribute(attr);
      if (parsed) expect(isProtocolAttribute(parsed.base)).toBe(false);
    }
  });

  it("tokens_used matches the space tokens the CSS actually reads", () => {
    const used = new Set<string>();
    for (const m of CSS.matchAll(/var\(--([a-z0-9-]+)/g)) used.add(m[1]);
    expect([...used].sort()).toEqual([...MANIFEST.tokens_used].sort());
    // …including the three the 1.0 manifest never listed.
    for (const token of ["space-10", "space-12", "space-16"]) {
      expect(MANIFEST.tokens_used).toContain(token);
    }
    // The `@ui:tokens` header is the same list, in the same order.
    const header = /@ui:tokens ([^*]+)\*\//.exec(CSS)![1].trim().split(/\s+/);
    expect(header).toEqual(MANIFEST.tokens_used);
  });

  it("is mobile-first on the canon: min-width only, ascending tiers", () => {
    expect(CSS).not.toContain("max-width");
    const preludes = [...CSS.matchAll(/@media\s*\(([^)]*)\)/g)].map((m) => m[1].trim());
    expect(preludes.length).toBe(TIERS.length);
    expect(preludes).toEqual(TIERS.map((t) => `min-width: ${BREAKPOINTS[t].rem}rem`));
  });
});

// ── 2 · Cascade resolution ───────────────────────────────────────────────────

describe("stack — responsive resolution against the shipped rules", () => {
  it("is a column on a phone and a row from md up", () => {
    const attrs: Attrs = { "data-direction": "vertical", "data-direction-md": "horizontal" };

    mockViewport(PHONE);
    expect(window.matchMedia(`(min-width: ${BREAKPOINTS.md.rem}rem)`).matches).toBe(false);
    expect(resolve(attrs, "flex-direction")).toBe("column");

    mockViewport(TABLET);
    expect(window.matchMedia(`(min-width: ${BREAKPOINTS.md.rem}rem)`).matches).toBe(true);
    expect(resolve(attrs, "flex-direction")).toBe("row");
  });

  it("lets each tier take over from the one below it", () => {
    const attrs: Attrs = {
      "data-direction": "vertical",
      "data-direction-sm": "horizontal",
      "data-direction-lg": "vertical",
    };
    mockViewport(PHONE);
    expect(resolve(attrs, "flex-direction")).toBe("column");
    mockViewport(BREAKPOINTS.sm.px);
    expect(resolve(attrs, "flex-direction")).toBe("row");
    mockViewport(BREAKPOINTS.lg.px);
    expect(resolve(attrs, "flex-direction")).toBe("column");
    mockViewport(DESKTOP);
    expect(resolve(attrs, "flex-direction")).toBe("column");
  });

  it("overrides the mobile-first gap from the tier up, and only from there", () => {
    const attrs: Attrs = { "data-gap": "2", "data-gap-lg": "16" };
    mockViewport(PHONE);
    expect(resolve(attrs, "gap")).toBe("var(--space-2)");
    mockViewport(TABLET);
    expect(resolve(attrs, "gap")).toBe("var(--space-2)");
    mockViewport(BREAKPOINTS.lg.px);
    expect(resolve(attrs, "gap")).toBe("var(--space-16)");
  });

  it("resolves align and justify per tier, baseline included", () => {
    const attrs: Attrs = {
      "data-align": "baseline",
      "data-align-md": "center",
      "data-justify": "between",
      "data-justify-xl": "around",
    };
    mockViewport(PHONE);
    expect(resolve(attrs, "align-items")).toBe("baseline");
    expect(resolve(attrs, "justify-content")).toBe("space-between");
    mockViewport(TABLET);
    expect(resolve(attrs, "align-items")).toBe("center");
    expect(resolve(attrs, "justify-content")).toBe("space-between");
    mockViewport(DESKTOP);
    expect(resolve(attrs, "justify-content")).toBe("space-around");
  });

  it("keeps the deprecated data-variant spelling on the same rules", () => {
    mockViewport(DESKTOP);
    expect(resolve({ "data-variant": "horizontal" }, "flex-direction")).toBe("row");
    expect(resolve({ "data-direction": "horizontal" }, "flex-direction")).toBe("row");
    // Same rules, not merely the same outcome: one declaration block, both spellings.
    const rule = RULES.find((r) => r.selectors.includes('[data-ui="stack"][data-variant="horizontal"]'))!;
    expect(rule.selectors).toContain('[data-ui="stack"][data-direction="horizontal"]');
    expect(rule.decls["flex-direction"]).toBe("row");
  });

  it("keeps the deprecated data-responsive collapse working, mobile-first", () => {
    const legacy: Attrs = { "data-variant": "horizontal", "data-responsive": true };
    mockViewport(PHONE);
    expect(resolve(legacy, "flex-direction")).toBe("column");
    mockViewport(BREAKPOINTS.sm.px);
    expect(resolve(legacy, "flex-direction")).toBe("row");

    // The canonical spelling collapses identically.
    const canonical: Attrs = { "data-direction": "horizontal", "data-responsive": true };
    mockViewport(PHONE);
    expect(resolve(canonical, "flex-direction")).toBe("column");
  });

  it("lets an explicit tier beat the deprecated collapse — :where() adds no weight", () => {
    const mixed: Attrs = {
      "data-direction": "horizontal",
      "data-responsive": true,
      "data-direction-md": "vertical",
    };
    mockViewport(PHONE);
    expect(resolve(mixed, "flex-direction")).toBe("column"); // collapsed
    mockViewport(TABLET);
    expect(resolve(mixed, "flex-direction")).toBe("column"); // the md tier, not the restore
  });

  it("wraps intrinsically, without a breakpoint", () => {
    mockViewport(PHONE);
    expect(resolve({ "data-wrap": true }, "flex-wrap")).toBe("wrap");
    expect(resolve({}, "flex-wrap")).toBeUndefined();
  });

  it("sizes children through data-flex on the child, not the root", () => {
    const childRules = RULES.filter((r) =>
      r.selectors.some((s) => s.startsWith('[data-ui="stack"] > [data-flex=')),
    );
    expect(childRules.map((r) => r.decls["flex"])).toEqual(["1", "auto", "none"]);
  });

  it("aligns text logically — `right` is text-align: end, so it flips under RTL", () => {
    mockViewport(PHONE);
    expect(resolve({ "data-align-text": "right" }, "text-align")).toBe("end");
    expect(resolve({ "data-align-text": "center" }, "text-align")).toBe("center");
  });
});

// ── 3 · The generated surfaces ───────────────────────────────────────────────

describe("stack — one declaration, every generated surface", () => {
  const ir = manifestToIR(MANIFEST, "registry/primitives/stack/stack.manifest.json");

  it("expands each responsive group into four typed tier props in the IR", () => {
    for (const group of ["direction", "gap", "align", "justify"]) {
      for (const tier of TIERS) {
        const prop = `${group}${tier[0].toUpperCase()}${tier.slice(1)}`;
        const v = ir.variants.find((x) => x.prop === prop);
        expect(v, `${prop} missing from the IR`).toBeDefined();
        expect(v!.attr).toBe(`data-${group}-${tier}`);
        expect(v!.basedOn).toBe(group);
        expect(v!.tier).toBe(tier as Tier);
      }
    }
    // The deprecated alias stays a plain prop — the protocol attribute has no tiers.
    const legacy = ir.variants.find((v) => v.attr === "data-variant")!;
    expect(legacy.prop).toBe("variant");
    expect(ir.variants.some((v) => v.attr.startsWith("data-variant-"))).toBe(false);
  });

  it("turns the boolean props into attribute-writing boolean props", () => {
    const wrap = ir.states.find((s) => s.prop === "wrap")!;
    expect(wrap).toMatchObject({ attr: "data-wrap", kind: "presence", value: null });
    expect(wrap.doc).toBe(MANIFEST.props!.wrap.description);
    expect(ir.states.find((s) => s.prop === "responsive")?.attr).toBe("data-responsive");
    // The enum props are documentation, not root booleans.
    expect(ir.states.some((s) => s.prop === "flex" || s.prop === "align-text")).toBe(false);
  });

  for (const target of ["vue", "react"] as const) {
    it(`LStack (${target}) ships the typed props`, () => {
      const src = readFileSync(join(ROOT, "packages", target, "src/components/stack.ts"), "utf8");
      expect(src).toContain('export type LStackDirection = "vertical" | "horizontal";');
      expect(src).toContain(
        'export type LStackJustify = "start" | "center" | "end" | "between" | "around";',
      );
      for (const tier of ["Sm", "Md", "Lg", "Xl"]) {
        expect(src).toContain(`direction${tier}?: LStackDirection;`);
        expect(src).toContain(`justify${tier}?: LStackJustify;`);
        expect(src).toContain(`gap${tier}?: LStackGap;`);
      }
      expect(src).toContain("wrap?: boolean;");
      // Tier props reuse the base union — one exported type per group.
      expect(src).not.toContain("LStackDirectionMd");
    });
  }

  it("shows the responsive column on the docs page", () => {
    const page = buildDocsSite().find((f) => f.path === "components/primitives/stack.html")!;
    expect(page, "stack has a docs page").toBeDefined();
    expect(page.content).toContain('<th scope="col">Responsive</th>');
    for (const tier of TIERS) {
      expect(page.content).toContain(`<code>data-direction-${tier}="…"</code>`);
    }
  });

  it("leaves no inline flex-wrap escape in the theme-preview frames", () => {
    // 0.7-20's debt, paid here in 0.8-03 by declaring `data-wrap`. The frames
    // themselves moved on again in 0.8-05: a button row and a swatch row are
    // `cluster`s now (asserted in tests/primitives/cluster.test.ts), whose wrap
    // is intrinsic rather than opted into. What must never come back, whichever
    // component holds those rows, is the escape.
    const frames = buildDocsSite().filter((f) => f.path.startsWith("frames/theme-preview-"));
    expect(frames.length).toBeGreaterThan(0);
    for (const frame of frames) {
      expect(frame.content, frame.path).not.toContain("flex-wrap");
      expect(frame.content, frame.path).not.toContain("style=\"display: flex");
    }
  });

  it("documents the canonical spelling in the reference fragment", () => {
    expect(HTML).not.toContain('data-variant="horizontal"');
    expect(HTML).toContain('data-direction="horizontal"');
  });
});
