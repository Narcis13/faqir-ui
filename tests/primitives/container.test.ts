// `container` — the centred measure column (task 0.8-06).
//
// This primitive exists because three call sites had already written it by hand.
// The docs generator put `style="max-width: 72rem"` on the prose of every
// generated page — the single most-repeated framework escape in the codebase —
// form-page and wizard each hand-rolled an identical `max-inline-size: 32rem;
// margin-inline: auto` column, and surface hardcoded five `data-max` pixel
// values named after the breakpoint canon. One primitive and one token ladder
// replace all of it, so this suite tests in three registers:
//
//  1. **The primitive itself** — completeness both ways (nothing selected but
//     undeclared, nothing declared but unruled), measure resolution per value,
//     and the responsive tier ladder, resolved through the shared cascade helper
//     against the shipped sheet AND two deliberately re-ordered copies of it:
//     tier precedence is specificity here, never document order (grid 2.0's
//     mechanism, task 0.8-04).
//  2. **The ladder is one ladder** — surface, form-page and wizard reference the
//     measure tokens rather than their own numbers, every referenced token is
//     defined in `aliases.css` (what `token-exists` checks), and no hardcoded
//     measure width survives in any of them.
//  3. **The escape is gone** — the docs generator emits no inline `max-width`
//     at all, and the prose measure on every generated page comes from the real
//     component.

import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { validateManifest, type Manifest } from "../../src/manifest";
import { manifestToIR } from "../../src/bindings/ir";
import { buildLogicalPropertyResults } from "../../src/audit/checker";
import { generateShippedSkillFiles } from "../../src/generator/skill";
import { collectDefinedTokens, extractTokenReferences } from "../../src/parser/css-parser";
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
  selectedAttributes,
  selectedPairs,
  type CascadeRule,
  type ElementAttrs,
} from "../helpers/css-cascade";

const ROOT = join(import.meta.dir, "../..");
const DIR = join(ROOT, "registry", "primitives", "container");

const CSS = readFileSync(join(DIR, "container.css"), "utf8");
const HTML = readFileSync(join(DIR, "container.html"), "utf8");
const MANIFEST = JSON.parse(
  readFileSync(join(DIR, "container.manifest.json"), "utf8"),
) as Manifest;

const RULES = collectRules(CSS);

const PHONE = 390;
/** grid 1.x's fractional dead zone — a width the canon must still place. */
const DEAD_ZONE = 640.5;
const TABLET = BREAKPOINTS.md.px + 32;
const DESKTOP = BREAKPOINTS.xl.px + 100;
const WIDTHS = [PHONE, DEAD_ZONE, TABLET, BREAKPOINTS.lg.px, DESKTOP];

/** The one measure ladder — value → the token (or literal) it must resolve to. */
const MEASURE: Record<string, string> = {
  narrow: "var(--measure-narrow)",
  content: "var(--measure-content)",
  wide: "var(--measure-wide)",
  prose: "var(--measure-prose)",
  full: "100%",
};

const container = (attrs: ElementAttrs, property: string, width: number) =>
  resolve(RULES, "container", attrs, property, width);

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

describe("container — manifest declares everything the CSS selects on", () => {
  it("validates as a 1.0.0 layout primitive", () => {
    expect(validateManifest(MANIFEST)).toEqual([]);
    expect(MANIFEST.version).toBe("1.0.0");
    expect(MANIFEST.kind).toBe("primitive");
    expect(MANIFEST.category).toBe("layout");
  });

  it("disambiguates itself from the CSS container-type feature in its description", () => {
    // The naming collision is accepted (every framework has a container), so the
    // manifest — the source of truth every generated surface reads — is what has
    // to carry the disambiguation. A container establishes no containment
    // context; the sheet must not quietly grow one either.
    expect(MANIFEST.description).toContain("container-type");
    expect(CSS.replace(/\/\*[^]*?\*\//g, "")).not.toContain("container-type");
    expect(CSS.replace(/\/\*[^]*?\*\//g, "")).not.toContain("@container");
  });

  it("leaves no data-* attribute in container.css undeclared", () => {
    const declared = declaredAttributes();
    const undeclared = [...selectedAttributes(RULES)].filter(
      (attr) => attr !== "data-ui" && !declared.has(attr),
    );
    expect(
      undeclared,
      `undeclared in container.manifest.json: ${undeclared.join(", ")}`,
    ).toEqual([]);
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

  it("ships a rule for every declared measure value, base and tier alike", () => {
    const pairs = selectedPairs(RULES);
    const missing: string[] = [];
    const measure = MANIFEST.variants!.measure;
    expect(measure.responsive).toBe(true);
    for (const attr of ["data-measure", ...TIERS.map((t) => `data-measure-${t}`)]) {
      for (const value of measure.values) {
        if (!pairs.has(`${attr}=${value}`)) missing.push(`[${attr}="${value}"]`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("ships a rule for every declared gutter step", () => {
    const pairs = selectedPairs(RULES);
    for (const step of MANIFEST.props!.gutter.values!) {
      expect(pairs.has(`data-gutter=${step}`), `[data-gutter="${step}"]`).toBe(true);
    }
  });

  it("selects no bare value-less attribute — container has no boolean surface", () => {
    const presence = new Set<string>();
    for (const rule of RULES) {
      for (const selector of rule.selectors) {
        for (const a of selector.matchAll(/\[([a-z-]+)(="[^"]*")?\]/g)) {
          if (a[2] === undefined && a[1] !== "data-ui") presence.add(a[1]);
        }
      }
    }
    expect([...presence]).toEqual([]);
  });

  it("suffixes no protocol attribute — the grammar cannot reach data-variant", () => {
    for (const attr of selectedAttributes(RULES)) {
      const parsed = parseResponsiveAttribute(attr);
      if (parsed) expect(isProtocolAttribute(parsed.base), attr).toBe(false);
    }
  });

  it("leaves the gutter deliberately non-responsive", () => {
    // Declared, and asserted: a data-gutter-md would be a second way to say what
    // the padding parent already says. If a later task makes it responsive, this
    // is the line that has to change on purpose.
    expect(MANIFEST.props!.gutter.type).toBe("enum");
    for (const tier of TIERS) {
      expect(selectedAttributes(RULES).has(`data-gutter-${tier}`), tier).toBe(false);
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
    const weightOf = (tier: Tier) => 3 + TIERS.indexOf(tier);
    for (const tier of TIERS) {
      const media = `(min-width: ${BREAKPOINTS[tier].rem}rem)`;
      const tierRules = RULES.filter((r) => r.media === media);
      expect(tierRules.length, `tier ${tier} has rules`).toBeGreaterThan(0);
      for (const rule of tierRules) {
        for (const selector of rule.selectors) {
          const uiCount = [...selector.matchAll(/\[data-ui="container"\]/g)].length;
          const condCount = [...selector.matchAll(/\[[a-z-]+(="[^"]*")?\]/g)].length;
          expect(condCount, selector).toBe(weightOf(tier));
          expect(uiCount, selector).toBe(weightOf(tier) - 1);
        }
      }
    }
  });
});

// ── 2 · Cascade resolution ───────────────────────────────────────────────────

describe("container — resolution against the shipped rules", () => {
  it("is a centred content column with nothing declared", () => {
    for (const width of WIDTHS) {
      expect(container({}, "max-inline-size", width)).toBe("var(--measure-content)");
      expect(container({}, "margin-inline", width)).toBe("auto");
    }
    expect(MANIFEST.variants!.measure.default).toBe("content");
    // The centring is unconditional — no query can switch it off, which is what
    // makes "centred measure column" a property of the component, not a tier.
    expect(
      resolveIn(RULES, "container", "margin-inline", { attrs: {}, widthPx: DESKTOP })!.media,
    ).toBeNull();
  });

  it("resolves every measure value to its shared token", () => {
    for (const [value, expected] of Object.entries(MEASURE)) {
      expect(
        container({ "data-measure": value }, "max-inline-size", PHONE),
        `data-measure="${value}"`,
      ).toBe(expected);
    }
    // The ladder in the manifest and the ladder in the sheet are the same set.
    expect([...MANIFEST.variants!.measure.values].sort()).toEqual(Object.keys(MEASURE).sort());
  });

  it("declares the gutter default of 0 and resolves every step from the spacing scale", () => {
    // Default 0 is a promise: a bare container adds no padding, so it composes
    // inside a parent that already pads without doubling the inset.
    expect(MANIFEST.props!.gutter.default).toBe("0");
    expect(container({}, "padding-inline", PHONE)).toBeUndefined();
    for (const step of MANIFEST.props!.gutter.values!) {
      const expected = step === "0" ? "var(--space-0, 0px)" : `var(--space-${step})`;
      expect(container({ "data-gutter": step }, "padding-inline", PHONE)).toBe(expected);
    }
  });

  it("lets data-measure-lg override the base from the lg floor up, and only from there", () => {
    // The task's named case: a narrow column on a phone that opens up at lg.
    const attrs: ElementAttrs = { "data-measure": "narrow", "data-measure-lg": "wide" };
    expect(container(attrs, "max-inline-size", PHONE)).toBe("var(--measure-narrow)");
    expect(container(attrs, "max-inline-size", DEAD_ZONE)).toBe("var(--measure-narrow)");
    expect(container(attrs, "max-inline-size", BREAKPOINTS.md.px)).toBe("var(--measure-narrow)");
    expect(container(attrs, "max-inline-size", BREAKPOINTS.lg.px - 1)).toBe("var(--measure-narrow)");
    expect(container(attrs, "max-inline-size", BREAKPOINTS.lg.px)).toBe("var(--measure-wide)");
    expect(container(attrs, "max-inline-size", DESKTOP)).toBe("var(--measure-wide)");
  });

  it("hands each tier over to the one above it", () => {
    const attrs: ElementAttrs = {
      "data-measure": "narrow",
      "data-measure-sm": "content",
      "data-measure-xl": "full",
    };
    expect(container(attrs, "max-inline-size", PHONE)).toBe("var(--measure-narrow)");
    expect(container(attrs, "max-inline-size", BREAKPOINTS.sm.px)).toBe("var(--measure-content)");
    expect(container(attrs, "max-inline-size", BREAKPOINTS.lg.px)).toBe("var(--measure-content)");
    expect(container(attrs, "max-inline-size", BREAKPOINTS.xl.px)).toBe("100%");
  });

  it("resolves identically against a deliberately re-ordered stylesheet", () => {
    const reversed: CascadeRule[] = [...RULES].reverse().map((r, i) => ({ ...r, order: i }));
    const sorted: CascadeRule[] = [...RULES]
      .sort((a, b) => a.selectors.join().localeCompare(b.selectors.join()))
      .map((r, i) => ({ ...r, order: i }));

    const probes: Array<[ElementAttrs, string]> = [
      [{ "data-measure": "narrow", "data-measure-lg": "wide" }, "max-inline-size"],
      [{ "data-measure": "prose", "data-measure-md": "full" }, "max-inline-size"],
      [{ "data-gutter": "6" }, "padding-inline"],
      [{}, "margin-inline"],
    ];
    for (const [attrs, property] of probes) {
      for (const width of WIDTHS) {
        const shipped = container(attrs, property, width);
        expect(
          resolve(reversed, "container", attrs, property, width),
          `${property} @ ${width}px, reversed`,
        ).toBe(shipped!);
        expect(
          resolve(sorted, "container", attrs, property, width),
          `${property} @ ${width}px, sorted`,
        ).toBe(shipped!);
      }
    }
  });
});

// ── 3 · Logical properties ───────────────────────────────────────────────────

describe("container — direction-agnostic by construction", () => {
  it("has zero findings from the framework's own logical-properties rule", () => {
    const findings = buildLogicalPropertyResults(CSS, "container", "container.css").map(
      (r) => `${r.line}: ${r.message}`,
    );
    expect(findings).toEqual([]);
  });

  it("caps with max-inline-size, never max-width — the escapes it replaces did not", () => {
    const rules = CSS.replace(/\/\*[^]*?\*\//g, "");
    expect(rules).toContain("max-inline-size");
    expect(rules).not.toContain("max-width");
    expect(rules).not.toContain("padding-left");
    expect(rules).not.toContain("margin-left");
  });
});

// ── 4 · One ladder, everywhere ───────────────────────────────────────────────

describe("the measure ladder is a token set, not a number repeated", () => {
  const ALIASES = readFileSync(join(ROOT, "registry", "tokens", "aliases.css"), "utf8");
  const DEFINED = collectDefinedTokens([ALIASES]);

  /** The consumers the task re-bases: the primitive itself and the three call sites. */
  const CONSUMERS: Array<[string, string]> = [
    ["container.css", CSS],
    ["surface.css", readFileSync(join(ROOT, "registry/primitives/surface/surface.css"), "utf8")],
    ["form-page.css", readFileSync(join(ROOT, "registry/patterns/form-page/form-page.css"), "utf8")],
    ["wizard.css", readFileSync(join(ROOT, "registry/patterns/wizard/wizard.css"), "utf8")],
  ];

  it("defines all four measure tokens in aliases.css, at the documented values", () => {
    expect(/--measure-narrow:\s*32rem/.test(ALIASES)).toBe(true);
    expect(/--measure-content:\s*48rem/.test(ALIASES)).toBe(true);
    expect(/--measure-wide:\s*72rem/.test(ALIASES)).toBe(true);
    expect(/--measure-prose:\s*65ch/.test(ALIASES)).toBe(true);
    for (const name of ["measure-narrow", "measure-content", "measure-wide", "measure-prose"]) {
      expect(DEFINED.has(name), `--${name} is defined`).toBe(true);
    }
  });

  it("names the measure ladder apart from the breakpoint canon", () => {
    // The 1.x surface ladder called 1024px "lg". Reusing the tier names for
    // widths is the multi-ladder drift 0.8-01 killed, so the measure tokens may
    // never be spelled with them.
    for (const tier of TIERS) {
      expect(DEFINED.has(`measure-${tier}`), `--measure-${tier} must not exist`).toBe(false);
    }
  });

  it("resolves every measure token each consumer references — token-exists clean", () => {
    for (const [file, source] of CONSUMERS) {
      const refs = extractTokenReferences(source)
        .map((r) => r.name)
        .filter((n) => n.startsWith("measure-"));
      expect(refs.length, `${file} references the measure ladder`).toBeGreaterThan(0);
      for (const name of refs) {
        expect(DEFINED.has(name), `${file} references undefined --${name}`).toBe(true);
      }
    }
  });

  it("leaves no hardcoded measure width in any consumer", () => {
    // The literals this task deleted: surface's five px widths, and the 32rem
    // that form-page and wizard each wrote out in full.
    for (const [file, source] of CONSUMERS) {
      const body = source.replace(/\/\*[^]*?\*\//g, "");
      for (const literal of ["640px", "768px", "1024px", "1280px", "1400px", "32rem", "72rem"]) {
        expect(body.includes(literal), `${file} still hardcodes ${literal}`).toBe(false);
      }
    }
  });

  it("re-bases surface's data-max onto the same vocabulary, and records the break", () => {
    const manifest = JSON.parse(
      readFileSync(join(ROOT, "registry/primitives/surface/surface.manifest.json"), "utf8"),
    ) as Manifest;
    expect(validateManifest(manifest)).toEqual([]);
    expect(manifest.version).toBe("2.1.0");
    const entry = (manifest.changes ?? []).find((c) => c.version === "2.0.0")!;
    expect(entry, "surface 2.0.0 has a changelog entry").toBeDefined();
    expect(entry.breaking).toBe(true);
    // data-max was in the CSS but not the manifest before this task — the same
    // undeclared-attribute gap 0.7-20 found on stack.
    expect(manifest.props!.max.attr).toBe("data-max");
    expect(manifest.props!.max.values).toEqual(["narrow", "content", "wide", "prose", "full"]);
    expect(manifest.props!["align-text"].attr).toBe("data-align-text");

    const surfaceRules = collectRules(CONSUMERS[1][1]);
    for (const [value, expected] of Object.entries(MEASURE)) {
      expect(
        resolve(surfaceRules, "surface", { "data-max": value }, "max-inline-size", PHONE),
        `surface data-max="${value}"`,
      ).toBe(expected);
    }
    // The one value preserved exactly: 1.x md was 768px, which is 48rem.
    expect(
      resolve(surfaceRules, "surface", { "data-max": "content" }, "max-inline-size", PHONE),
    ).toBe("var(--measure-content)");
    // The retired canon-named values select nothing at all now.
    for (const gone of ["sm", "md", "lg", "xl", "2xl"]) {
      expect(
        resolve(surfaceRules, "surface", { "data-max": gone }, "max-inline-size", PHONE),
        `surface data-max="${gone}" is retired`,
      ).toBeUndefined();
    }
  });

  it("keeps form-page and wizard on the narrow measure, markup unchanged", () => {
    for (const [file, source] of CONSUMERS.slice(2)) {
      expect(source, file).toContain("max-inline-size: var(--measure-narrow)");
      expect(source, file).toContain("margin-inline: auto");
    }
  });
});

// ── 5 · The generated surfaces ───────────────────────────────────────────────

describe("container — one declaration, every generated surface", () => {
  const ir = manifestToIR(MANIFEST, "registry/primitives/container/container.manifest.json");

  it("expands the responsive measure group into four typed tier props in the IR", () => {
    for (const tier of TIERS) {
      const prop = `measure${tier[0].toUpperCase()}${tier.slice(1)}`;
      const v = ir.variants.find((x) => x.prop === prop);
      expect(v, `${prop} missing from the IR`).toBeDefined();
      expect(v!.attr).toBe(`data-measure-${tier}`);
      expect(v!.basedOn).toBe("measure");
      expect(v!.tier).toBe(tier as Tier);
    }
  });

  for (const target of ["vue", "react"] as const) {
    it(`LContainer (${target}) ships the typed props`, () => {
      const src = readFileSync(
        join(ROOT, "packages", target, "src/components/container.ts"),
        "utf8",
      );
      expect(src).toContain(
        'export type LContainerMeasure = "narrow" | "content" | "wide" | "prose" | "full";',
      );
      for (const tier of ["Sm", "Md", "Lg", "Xl"]) {
        expect(src).toContain(`measure${tier}?: LContainerMeasure;`);
      }
      // Tier props reuse the base union — one exported type for the group.
      expect(src).not.toContain("LContainerMeasureLg");
    });
  }

  it("has a docs page with the responsive column", () => {
    const page = buildDocsSite().find(
      (f) => f.path === "components/primitives/container.html",
    )!;
    expect(page, "container has a docs page").toBeDefined();
    expect(page.content).toContain('<th scope="col">Responsive</th>');
    for (const tier of TIERS) {
      expect(page.content).toContain(`<code>data-measure-${tier}="…"</code>`);
    }
  });

  it("appears in the generated skill", async () => {
    const files = await generateShippedSkillFiles();
    const primitives = files.find((f) => f.relPath.endsWith("primitives.md"))!.content;
    expect(primitives).toContain("## container");
    expect(primitives).toContain("data-measure-sm");
  });

  it("shows the measure ladder on the reference page", () => {
    expect(HTML).toContain('data-ui="container"');
    for (const value of Object.keys(MEASURE)) {
      expect(HTML, `reference page demonstrates ${value}`).toContain(`data-measure="${value}"`);
    }
    expect(HTML).toContain('data-measure-lg="wide"');
    expect(HTML).toContain("data-gutter=");
  });
});

// ── 6 · The escape is gone ───────────────────────────────────────────────────

describe("the docs site's most-repeated escape is retired", () => {
  const site = buildDocsSite();
  /**
   * Every page built through the shared docs shell — the ~80 that carried the
   * escape. Keyed on the shell's own navigation landmark rather than on
   * `data-ui="dashboard-shell"`, which the pattern's verbatim example pages also
   * contain without ever going through the shell.
   */
  const shellPages = site.filter(
    (f) =>
      f.path.endsWith(".html") &&
      f.content.includes('<nav data-part="nav" role="navigation" aria-label="Documentation">'),
  );

  it("built the shell pages this claim is about", () => {
    expect(shellPages.length).toBeGreaterThan(50);
  });

  it("emits zero inline max-width styles anywhere on the site", () => {
    const offenders = site
      .filter((f) => f.path.endsWith(".html"))
      .filter((f) => /style="[^"]*max-width/.test(f.content))
      .map((f) => f.path);
    expect(offenders).toEqual([]);
  });

  it("takes the prose measure from the container primitive on every shell page", () => {
    for (const page of shellPages) {
      expect(page.content, page.path).toContain(
        '<div data-ui="container" data-measure="wide">',
      );
      expect(page.content, page.path).toContain('<article data-ui="prose">');
      expect(page.content, page.path).not.toContain("max-width: 72rem");
    }
  });

  it("ships container's rules in the one stylesheet those pages link", () => {
    // The swap is only real if the primitive's CSS is in the bundle the pages
    // load — otherwise the escape was deleted and nothing replaced it.
    const bundle = site.find((f) => f.path === "styles/faqir.css")!;
    expect(bundle.content).toContain('[data-ui="container"]');
    expect(bundle.content).toContain("--measure-wide");
  });
});
