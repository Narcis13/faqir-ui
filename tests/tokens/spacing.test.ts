/**
 * Spacing scale + rhythm aliases — `registry/tokens/spacing.css` and the
 * `--section-gap-*` / `--content-gutter` block in `registry/tokens/aliases.css`
 * (task 0.8-07, FAQIR-NEXT §19/§B6).
 *
 * Three claims:
 *
 * 1. **The scale really extends.** The four page-rhythm steps (32/40/48/64) are
 *    declared, keep the 4px base and the harmonic doubling, and — the part a
 *    string match cannot prove — RESOLVE through a real property at base density
 *    and under `[data-density="compact"]`. That is the 0.7-11 probe-rule method:
 *    happy-dom substitutes `var()` but not `calc()`, so a probe rule consumes the
 *    token the way a component does and the computed value is read back.
 *
 * 2. **The rhythm aliases are composed, not declared.** `--section-gap-*` and
 *    `--content-gutter` resolve to scale members, so they inherit density for
 *    free rather than needing their own multiplier.
 *
 * 3. **The two invariants stay invariant.** `--space-0` is 0 and `--space-px` is
 *    a hairline at every density — asserted here as well as in density.test.ts,
 *    because they are the scale's contract and not only density's.
 */
import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Window } from "happy-dom";
import { parseTokenReference, tokenAnchor } from "../../src/generator/docs";

const REGISTRY = join(import.meta.dir, "../../registry");
const read = (rel: string) => readFileSync(join(REGISTRY, rel), "utf8");

const SPACING_CSS = read("tokens/spacing.css");
const ALIASES_CSS = read("tokens/aliases.css");
const DENSITY_CSS = read("tokens/density.css");

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

/** Declarations of the first rule whose selector list matches `selector`. */
function block(css: string, selector: string): Record<string, string> {
  const src = stripComments(css);
  const start = src.indexOf(selector);
  if (start === -1) throw new Error(`No rule for selector: ${selector}`);
  const open = src.indexOf("{", start);
  const close = src.indexOf("}", open);
  const decls: Record<string, string> = {};
  for (const line of src.slice(open + 1, close).split(";")) {
    const m = line.match(/^\s*(--[\w-]+)\s*:\s*([\s\S]+?)\s*$/);
    if (m) decls[m[1]] = m[2].replace(/\s+/g, " ");
  }
  return decls;
}

const BASE_SPACING = block(SPACING_CSS, ":root");
const BASE_ALIASES = block(ALIASES_CSS, ":root");
const COMPACT = block(DENSITY_CSS, '[data-density="compact"]');
const SCALE = Number(COMPACT["--density-scale"]);

/** The four steps this task added, with their intended rem values. */
const NEW_STEPS: Array<[string, number]> = [
  ["--space-32", 8],
  ["--space-40", 10],
  ["--space-48", 12],
  ["--space-64", 16],
];

/** The rhythm aliases this task added, and the scale step each composes. */
const RHYTHM: Array<[string, string]> = [
  ["--section-gap-sm", "--space-12"],
  ["--section-gap-md", "--space-20"],
  ["--section-gap-lg", "--space-32"],
  ["--content-gutter", "--space-6"],
];

// ── the probe: a rule that consumes tokens the way a component does ──────────

/**
 * One probe rule per token under test, each reading it through a real property.
 * `padding` is used because it accepts every length the scale produces and
 * happy-dom reports it back verbatim after `var()` substitution.
 */
const PROBE_CSS = [...NEW_STEPS, ...RHYTHM.map(([a]) => [a] as const), ["--space-0"], ["--space-px"]]
  .map(([token]) => `[data-probe="${token}"] { padding: var(${token}); }`)
  .join("\n");

function mount(bodyHtml: string) {
  const w = new Window();
  const d = w.document;
  d.head.innerHTML = `<style>${SPACING_CSS}\n${ALIASES_CSS}\n${DENSITY_CSS}\n${PROBE_CSS}</style>`;
  d.body.innerHTML = bodyHtml;
  return {
    raw: (id: string) => w.getComputedStyle(d.getElementById(id)!).getPropertyValue("padding"),
    close: () => w.close(),
  };
}

/** Resolve the value forms these tokens produce (`<n>rem`, `<n>px`, `calc(v * k)`) to px. */
function px(value: string): number {
  const v = value.trim();
  const calc = v.match(/^calc\(\s*([\s\S]+?)\s*\*\s*([\d.]+)\s*\)$/);
  if (calc) return px(calc[1]) * Number(calc[2]);
  if (v.endsWith("rem")) return Number.parseFloat(v) * 16;
  if (v.endsWith("px")) return Number.parseFloat(v);
  if (v === "0") return 0;
  throw new Error(`Cannot resolve to px: ${value}`);
}

/** Mount every probe once at base density and once inside a compact scope. */
function probes() {
  const tokens = [...NEW_STEPS.map(([t]) => t), ...RHYTHM.map(([a]) => a), "--space-0", "--space-px"];
  const cell = (prefix: string, t: string) =>
    `<span id="${prefix}${t}" data-probe="${t}"></span>`;
  const dom = mount(
    tokens.map((t) => cell("base", t)).join("") +
      `<div data-density="compact">${tokens.map((t) => cell("dense", t)).join("")}</div>`,
  );
  return {
    base: (t: string) => px(dom.raw(`base${t}`)),
    dense: (t: string) => px(dom.raw(`dense${t}`)),
    rawBase: (t: string) => dom.raw(`base${t}`),
    rawDense: (t: string) => dom.raw(`dense${t}`),
    close: dom.close,
  };
}

describe("spacing · the scale extends into page rhythm", () => {
  it("declares the four new steps with the scale's own arithmetic", () => {
    for (const [token, rem] of NEW_STEPS) {
      expect(BASE_SPACING[token], `${token} is missing from spacing.css`).toBe(`${rem}rem`);
      // 4px base: every step is a whole number of 4px units.
      expect((rem * 16) % 4).toBe(0);
    }
  });

  it("keeps the scale strictly ascending — a step is never smaller than its predecessor", () => {
    const steps = Object.entries(BASE_SPACING)
      .filter(([t]) => /^--space-\d+$/.test(t))
      .map(([t, v]) => [Number(t.slice("--space-".length)), px(v)] as const)
      .sort((a, b) => a[0] - b[0]);
    expect(steps.length).toBeGreaterThan(0);
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i][1], `--space-${steps[i][0]} must exceed --space-${steps[i - 1][0]}`)
        .toBeGreaterThan(steps[i - 1][1]);
    }
    // The scale tops out at the new ceiling, not the old one.
    expect(steps[steps.length - 1][0]).toBe(64);
  });

  it("resolves each new step at base density, through a real property", () => {
    const p = probes();
    for (const [token, rem] of NEW_STEPS) expect(p.base(token)).toBe(rem * 16);
    p.close();
  });

  it("resolves each new step under [data-density=compact], scaled", () => {
    const p = probes();
    for (const [token, rem] of NEW_STEPS) {
      expect(p.dense(token)).toBeCloseTo(rem * 16 * SCALE, 6);
      expect(p.dense(token)).toBeLessThan(p.base(token));
    }
    p.close();
  });

  it("leaves --space-0 and --space-px invariant at both densities", () => {
    const p = probes();
    // Read as numbers: happy-dom normalises the `0` the token declares to `0px`.
    expect(p.base("--space-0")).toBe(0);
    expect(p.dense("--space-0")).toBe(0);
    expect(p.base("--space-px")).toBe(1);
    expect(p.dense("--space-px")).toBe(1);
    // Density leaves the computed text itself untouched — not merely the number.
    expect(p.rawDense("--space-0")).toBe(p.rawBase("--space-0"));
    expect(p.rawDense("--space-px")).toBe(p.rawBase("--space-px"));
    p.close();
  });
});

describe("spacing · rhythm aliases are composed over the scale", () => {
  it("each alias references a scale member rather than declaring a number", () => {
    for (const [alias, step] of RHYTHM) {
      expect(BASE_ALIASES[alias], `${alias} is missing from aliases.css`).toBe(`var(${step})`);
      expect(BASE_SPACING[step], `${alias} composes ${step}, which must exist`).toBeDefined();
    }
  });

  it("the section-gap ramp ascends sm → md → lg", () => {
    const p = probes();
    expect(p.base("--section-gap-sm")).toBeLessThan(p.base("--section-gap-md"));
    expect(p.base("--section-gap-md")).toBeLessThan(p.base("--section-gap-lg"));
    p.close();
  });

  it("resolves at base density to the step each composes", () => {
    const p = probes();
    for (const [alias, step] of RHYTHM) expect(p.base(alias)).toBe(px(BASE_SPACING[step]));
    p.close();
  });

  it("inherits density for free — no alias declares its own multiplier", () => {
    const p = probes();
    for (const [alias, step] of RHYTHM) {
      expect(p.dense(alias)).toBeCloseTo(px(BASE_SPACING[step]) * SCALE, 6);
      expect(p.dense(alias)).toBeLessThan(p.base(alias));
    }
    // The proof that it is composition and not duplication: no rhythm alias
    // mentions --density-scale anywhere in the token layer.
    for (const [alias] of RHYTHM) {
      expect(BASE_ALIASES[alias]).not.toContain("density-scale");
      expect(COMPACT[alias]).not.toContain("density-scale");
    }
    p.close();
  });

  it("every new token enters the token reference page (the docs site derives them)", () => {
    // `parseTokenReference` reads the `:root` blocks of the token files in
    // cascade order, so nothing is registered by hand — this asserts the eight
    // new declarations really are visible to it, value and all.
    const entries = new Map(
      parseTokenReference(REGISTRY).map((e) => [e.name, e] as const),
    );
    for (const [token, rem] of NEW_STEPS) {
      const entry = entries.get(token.slice(2));
      expect(entry, `${token} must appear in the token reference`).toBeDefined();
      expect(entry!.group).toBe("spacing");
      expect(entry!.value).toBe(`${rem}rem`);
      expect(tokenAnchor(token.slice(2))).toBe(`token-space-${token.slice("--space-".length)}`);
    }
    for (const [alias, step] of RHYTHM) {
      const entry = entries.get(alias.slice(2));
      expect(entry, `${alias} must appear in the token reference`).toBeDefined();
      expect(entry!.group).toBe("aliases");
      expect(entry!.value).toBe(`var(${step})`);
    }
  });

  it("the page rhythm actually uses the new headroom (lg is above the old ceiling)", () => {
    // The reason the scale was extended: --space-24 (6rem) was the ceiling and a
    // spacious section rhythm needs more than the largest component padding.
    const p = probes();
    expect(p.base("--section-gap-lg")).toBeGreaterThan(px(BASE_SPACING["--space-24"]));
    p.close();
  });
});
