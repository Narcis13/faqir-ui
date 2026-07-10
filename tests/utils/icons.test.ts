// ═══════════════════════════════════════════════════════════════════════════
// Icon subsetting — pure helpers  [task 0.4-05 · §B4]
// ═══════════════════════════════════════════════════════════════════════════
//
// `faqir add icons --only …` trims the shipped 120-glyph icons.css down to just
// the icons a project uses. These tests pin the pure transforms that do the
// trimming — CSS subsetting, manifest subsetting, the reference page, and name
// validation with nearest-match suggestions. The end-to-end command behaviour
// (install, merge-on-re-run, audit-clean) lives in tests/commands/add-icons.test.ts.

import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  parseIconsCss,
  iconNamesFromCss,
  subsetIconsCss,
  subsetIconManifest,
  buildSubsetReferenceHtml,
  validateIconNames,
} from "../../src/utils/icons";
import { extractComponents } from "../../src/parser/html-parser";
import { validateManifest, type Manifest } from "../../src/manifest";
import { findClassSelectors, findIdSelectors } from "../../src/parser/css-parser";

const ROOT = join(import.meta.dir, "../..");
const ICON_DIR = join(ROOT, "registry", "primitives", "icon");
const FULL_CSS = readFileSync(join(ICON_DIR, "icons.css"), "utf8");
const FULL_MANIFEST = JSON.parse(readFileSync(join(ICON_DIR, "icon.manifest.json"), "utf8"));

const DATA_ICON_RE = /\[data-icon="([^"]+)"\]/g;
const ruleNames = (css: string) => [...css.matchAll(DATA_ICON_RE)].map((m) => m[1]);

// ── parseIconsCss ────────────────────────────────────────────────────────────
describe("parseIconsCss", () => {
  it("splits the full sheet into base rule + a glyph-per-name map", () => {
    const { base, glyphs } = parseIconsCss(FULL_CSS);
    expect(base).toContain('[data-ui="icon"]');
    expect(base).toContain("mask: var(--icon) center / contain no-repeat;");
    expect(glyphs.size).toBe(120);
    expect(glyphs.get("check")).toContain('[data-icon="check"]');
  });

  it("throws on a sheet that is not a generated icon sheet", () => {
    expect(() => parseIconsCss("body { color: red; }")).toThrow();
  });

  it("iconNamesFromCss returns every glyph name, sorted", () => {
    const names = iconNamesFromCss(FULL_CSS);
    expect(names.length).toBe(120);
    expect([...names].sort()).toEqual(names);
  });
});

// ── subsetIconsCss ───────────────────────────────────────────────────────────
describe("subsetIconsCss", () => {
  const REQUESTED = ["check", "x", "chevron-down"];

  it("contains exactly the base rule + requested glyphs (sorted)", () => {
    const css = subsetIconsCss(FULL_CSS, REQUESTED);
    // Base rule survives.
    expect(css).toContain('[data-ui="icon"]');
    expect(css).toContain("background-color: currentColor;");
    // Exactly the requested glyph rules, sorted, no extras.
    expect(ruleNames(css)).toEqual(["check", "chevron-down", "x"]);
    // The glyph section header reflects the subset count.
    expect(css).toContain("/* ── Glyphs (3) ── */");
    // Attribution to Lucide/ISC is preserved (legal).
    expect(css).toContain("Lucide (ISC)");
    expect(css).toContain("LICENSE.lucide");
  });

  it("de-duplicates and sorts the requested names", () => {
    const css = subsetIconsCss(FULL_CSS, ["x", "check", "x", "check"]);
    expect(ruleNames(css)).toEqual(["check", "x"]);
  });

  it("re-parses cleanly (so a subset can be merged on re-run) and stays class/ID-free", () => {
    const css = subsetIconsCss(FULL_CSS, REQUESTED);
    expect(iconNamesFromCss(css)).toEqual(["check", "chevron-down", "x"]);
    expect(findClassSelectors(css)).toEqual([]);
    expect(findIdSelectors(css)).toEqual([]);
  });

  it("throws if asked for a glyph that isn't in the full sheet", () => {
    expect(() => subsetIconsCss(FULL_CSS, ["check", "definitely-not-real"])).toThrow(/unknown icon/i);
  });

  // Acceptance: trimmed icons.css for 5 icons is ≤ ~2KB (record actual).
  it("trims to ≤ ~2KB for 5 icons (recorded actual: 1883 B for check,x,chevron-down,plus,minus)", () => {
    const css = subsetIconsCss(FULL_CSS, ["check", "x", "chevron-down", "plus", "minus"]);
    const bytes = Buffer.byteLength(css);
    expect(bytes).toBe(1883); // pinned to the committed sheet; changes if a glyph's path changes
    expect(bytes).toBeLessThanOrEqual(2048);
    // …and a fraction of the full ~46 KB sheet.
    expect(bytes).toBeLessThan(Buffer.byteLength(FULL_CSS) / 10);
  });
});

// ── subsetIconManifest ───────────────────────────────────────────────────────
describe("subsetIconManifest", () => {
  it("rewrites the enumerated name lists and icon_set count, staying schema-valid", () => {
    const names = ["check", "x", "chevron-down"];
    const m = subsetIconManifest(FULL_MANIFEST, names);
    expect(validateManifest(m as Manifest)).toEqual([]);
    expect(m.variants.icon.values).toEqual(["check", "chevron-down", "x"]);
    expect(m.props.name.values).toEqual(["check", "chevron-down", "x"]);
    expect(m.icon_set.count).toBe(3);
  });

  it("re-points a default that fell outside the subset (invariant: values.includes(default))", () => {
    // The full default is "circle"; it's not in this subset.
    const m = subsetIconManifest(FULL_MANIFEST, ["check", "x"]);
    expect(m.variants.icon.default).toBe("check"); // first kept name
    expect(m.variants.icon.values).toContain(m.variants.icon.default);
    expect(m.props.name.values).toContain(m.props.name.default);
  });

  it("keeps a default that is inside the subset", () => {
    const m = subsetIconManifest(FULL_MANIFEST, ["check", "circle", "x"]);
    expect(m.variants.icon.default).toBe("circle");
  });

  it("does not mutate the input manifest", () => {
    const before = FULL_MANIFEST.variants.icon.values.length;
    subsetIconManifest(FULL_MANIFEST, ["check", "x"]);
    expect(FULL_MANIFEST.variants.icon.values.length).toBe(before);
  });
});

// ── buildSubsetReferenceHtml ─────────────────────────────────────────────────
describe("buildSubsetReferenceHtml", () => {
  const names = ["check", "x", "chevron-down"];
  const html = buildSubsetReferenceHtml(names, FULL_MANIFEST.icon_set);

  it("renders one labeled [data-ui=\"icon\"] cell per requested glyph", () => {
    const comps = extractComponents(html, "icon.html").filter((c) => c.name === "icon");
    expect(comps.length).toBe(3);
    const shown = comps.map((c) => c.root.attrs["data-icon"]).sort();
    expect(shown).toEqual(["check", "chevron-down", "x"]);
    for (const c of comps) {
      expect(c.root.tag).toBe("span");
      expect(c.root.attrs["role"]).toBe("img");
      expect(c.root.attrs["aria-label"]).toBe(c.root.attrs["data-icon"]);
      expect("class" in c.root.attrs).toBe(false);
    }
  });

  it("colors via currentColor with no hardcoded colors (audit-clean)", () => {
    expect(html).toContain("currentColor");
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});

// ── validateIconNames ────────────────────────────────────────────────────────
describe("validateIconNames", () => {
  const catalog = iconNamesFromCss(FULL_CSS);

  it("partitions requested names and suggests nearest match on a typo", () => {
    const { valid, unknown } = validateIconNames(["chekc", "x", "chevron-down"], catalog);
    expect(valid).toEqual(["chevron-down", "x"]);
    expect(unknown).toEqual([{ name: "chekc", suggestion: "check" }]);
  });

  it("suggestion is null when nothing is close", () => {
    const { unknown } = validateIconNames(["zzzzzzzz"], catalog);
    expect(unknown).toEqual([{ name: "zzzzzzzz", suggestion: null }]);
  });

  it("all-valid input yields no unknowns", () => {
    const { valid, unknown } = validateIconNames(["check", "x"], catalog);
    expect(valid).toEqual(["check", "x"]);
    expect(unknown).toEqual([]);
  });
});
