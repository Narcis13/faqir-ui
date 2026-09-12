// ═══════════════════════════════════════════════════════════════════════════
// Theme docs gate — every surface describes a theme by its axes  [1.1A-20]
// ═══════════════════════════════════════════════════════════════════════════
//
// `src/theme/describe.ts` is the one place a manifest's `axes` block becomes
// words. This suite holds the module to its renderers and holds README.md to
// the module: the two generated blocks between `<!-- @faqir:… -->` markers must
// equal a fresh render (`bun run check:theme-docs`), exactly as the skill and
// the docs site are held to theirs. The prose around the blocks is the
// author's; the tables are the manifests'.

import { describe, expect, it } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  THEME_AXIS_VALUES,
  THEME_SEED_DEFAULTS,
  THEME_DERIVED_AXES,
  type ThemeManifest,
} from "../../src/theme-manifest";
import { SEED_FLAGS } from "../../src/theme/seed";
import {
  AXIS_COLUMNS,
  AXIS_PATHS,
  GALLERY_AXES,
  NO_AXES_CELL,
  applyDocBlocks,
  axisCells,
  axisFlag,
  axisLeaves,
  axisMatches,
  axisSummary,
  axisValue,
  docBlockDrift,
  galleryAxisAttribute,
  galleryChips,
  galleryFilterOptions,
  renderAxisVocabularyTable,
  renderThemeDocBlocks,
  renderThemeTable,
  themeKind,
  themeTableHeaders,
} from "../../src/theme/describe";

const ROOT = join(import.meta.dir, "../..");
const THEMES_DIR = join(ROOT, "registry", "themes");

const manifests: ThemeManifest[] = readdirSync(THEMES_DIR)
  .filter((f) => f.endsWith(".theme.json"))
  .sort()
  .map((f) => JSON.parse(readFileSync(join(THEMES_DIR, f), "utf8")));

const withAxes = manifests.filter((m) => m.axes);
const editorial = manifests.find((m) => m.name === "editorial")!;
const glass = manifests.find((m) => m.name === "glass")!;
const companion = manifests.find((m) => m.name === "editorial-document")!;

describe("describe.ts — reading axes", () => {
  it("knows every enumerated leaf, in vocabulary order, and its generate flag", () => {
    expect(AXIS_PATHS).toEqual(Object.keys(THEME_AXIS_VALUES) as typeof AXIS_PATHS);
    for (const path of AXIS_PATHS) {
      const flag = axisFlag(path);
      expect(flag, `${path} has no flag`).not.toBeNull();
      expect(SEED_FLAGS[flag!.slice(2)]).toBe(path);
    }
    expect(axisFlag("accent_hue")).toBeNull();
  });

  it("reads dotted paths out of an axes block and flattens to leaves", () => {
    expect(axisValue(editorial.axes!, "type.pairing")).toBe("serif-editorial");
    expect(axisValue(editorial.axes!, "type.voice.tracking")).toBe("tight");
    expect(axisValue(editorial.axes!, "depth")).toBe("flat");
    expect(axisValue(editorial.axes!, "no.such.path")).toBeUndefined();
    const leaves = axisLeaves(editorial.axes!);
    // Accent's two numbers, then every enumerated leaf: the fourteen top-level
    // axes expand to two numbers plus the leaves of the vocabulary.
    expect(leaves.length).toBe(2 + AXIS_PATHS.length);
    expect(leaves[0]).toEqual(["accent_hue", editorial.axes!.accent_hue]);
    expect(leaves.map(([p]) => p).slice(2)).toEqual(AXIS_PATHS);
  });

  it("matches values as their axis' type — a numeric leaf compares as a number", () => {
    expect(axisMatches(editorial.axes!, "type.scale", 1.333)).toBe(true);
    expect(axisMatches(editorial.axes!, "type.scale", "1.333")).toBe(true);
    expect(axisMatches(editorial.axes!, "type.scale", 1.2)).toBe(false);
    expect(axisMatches(editorial.axes!, "depth", "flat")).toBe(true);
    expect(axisMatches(editorial.axes!, "depth", "glass")).toBe(false);
    expect(axisMatches(editorial.axes!, "nope", "flat")).toBe(false);
  });

  it("classifies a theme by how it came to be", () => {
    expect(themeKind(editorial)).toBe("generated");
    expect(themeKind(glass)).toBe("authored");
    expect(themeKind(companion)).toBe("companion");
    // Twelve of each, plus the three companions the seeds with `document: true` bring.
    const kinds = manifests.map(themeKind);
    expect(kinds.filter((k) => k === "generated").length).toBe(12);
    expect(kinds.filter((k) => k === "authored").length).toBe(12);
    expect(kinds.filter((k) => k === "companion").length).toBe(3);
  });
});

describe("describe.ts — cells and summaries", () => {
  it("renders twelve axis columns that, with scheme, are the fourteen derived axes", () => {
    expect(AXIS_COLUMNS.length).toBe(12);
    // Every top-level derived axis is a column, except the accent pair (one
    // column) and `scheme` (the manifest's own field, rendered by the caller).
    const covered = new Set(AXIS_COLUMNS.map((c) => c.key));
    for (const axis of THEME_DERIVED_AXES) {
      if (axis === "accent_hue" || axis === "accent_chroma") expect(covered.has("accent")).toBe(true);
      else if (axis === "scheme") expect(covered.has("scheme")).toBe(false);
      else expect(covered.has(axis), `no column for ${axis}`).toBe(true);
    }
  });

  it("derives every cell from the manifest, and marks a companion's cells rather than blanking them", () => {
    const cells = axisCells(editorial);
    expect(cells[AXIS_COLUMNS.findIndex((c) => c.key === "depth")]).toBe("flat");
    expect(cells[AXIS_COLUMNS.findIndex((c) => c.key === "type")]).toBe("serif-editorial · 1.333/17px · semibold tight");
    expect(cells[AXIS_COLUMNS.findIndex((c) => c.key === "shape")]).toBe("soft · hairline · round");
    expect(cells[AXIS_COLUMNS.findIndex((c) => c.key === "accent")]).toBe("256° · 0.07");
    expect(axisCells(companion)).toEqual(AXIS_COLUMNS.map(() => NO_AXES_CELL));
    // The heading voice states only what departs from the default.
    const brutalist = manifests.find((m) => m.name === "brutalist")!;
    expect(axisCells(brutalist)[AXIS_COLUMNS.findIndex((c) => c.key === "type")]).toContain("uppercase");
    expect(axisCells(glass)[AXIS_COLUMNS.findIndex((c) => c.key === "type")]).toBe("system · 1.2/16px · bold");
  });

  it("summarises a theme on one line, every column named", () => {
    const summary = axisSummary(editorial.axes!);
    for (const column of AXIS_COLUMNS) expect(summary).toContain(`${column.key} ${column.cell(editorial.axes!)}`);
    expect(summary.split("; ").length).toBe(AXIS_COLUMNS.length);
  });
});

describe("describe.ts — markdown tables", () => {
  it("names every axis leaf exactly once in the vocabulary table, with its values, flag and default", () => {
    const table = renderAxisVocabularyTable().join("\n");
    for (const path of AXIS_PATHS) {
      expect(table.split(`\`${path}\``).length - 1, path).toBe(1);
      for (const value of THEME_AXIS_VALUES[path]) expect(table).toContain(`\`${value}\``);
      expect(table).toContain(`\`${axisFlag(path)}\``);
      expect(table).toContain(`\`${(THEME_SEED_DEFAULTS as Record<string, string | number | boolean>)[path]}\``);
    }
    expect(table).toContain("| `accent` | `--accent` |");
  });

  it("renders one row per manifest, with the headers the options ask for", () => {
    const plain = renderThemeTable(manifests);
    expect(plain.length).toBe(2 + manifests.length);
    expect(plain[0]).toBe(`| ${themeTableHeaders().join(" | ")} |`);
    expect(themeTableHeaders({ kind: true, mood: true, extended: true })).toEqual([
      "Theme",
      "Kind",
      "Mood",
      "Scheme",
      "Dark mode",
      "Pairs with",
      ...AXIS_COLUMNS.map((c) => c.label),
    ]);
    const kinds = renderThemeTable([editorial, glass, companion], { kind: true });
    expect(kinds[2]).toContain("| `editorial` | generated | both |");
    expect(kinds[3]).toContain("| `glass` | authored | both |");
    expect(kinds[4]).toContain("| `editorial-document` | companion | light |");
  });
});

describe("README.md carries the generated theme blocks", () => {
  const readme = readFileSync(join(ROOT, "README.md"), "utf8");
  const blocks = renderThemeDocBlocks(manifests);

  it("is current — the same check `bun run check:theme-docs` runs", () => {
    expect(docBlockDrift(readme, blocks)).toEqual([]);
  });

  it("tables the twenty-four themes with their axes, and names the companions apart", () => {
    const table = blocks["theme-table"]!;
    const rows = table.split("\n").filter((l) => /^\| `/.test(l));
    expect(rows.length).toBe(withAxes.length);
    expect(withAxes.length).toBe(24);
    for (const m of withAxes) {
      const row = rows.find((l) => l.startsWith(`| \`${m.name}\` |`))!;
      expect(row, m.name).toBeDefined();
      expect(row).toContain(`| ${themeKind(m)} |`);
      expect(row).toContain(m.axes!.depth);
      expect(row).toContain(m.axes!.type.pairing!);
    }
    for (const m of manifests.filter((x) => !x.axes)) {
      expect(rows.some((l) => l.startsWith(`| \`${m.name}\` |`))).toBe(false);
      expect(table).toContain(`\`${m.name}\``);
    }
    expect(table).toContain("carry no axes of their own");
  });

  it("puts the vocabulary table under the axes heading and the theme table under its own", () => {
    const axesAt = readme.indexOf("<!-- @faqir:theme-axes start -->");
    const tableAt = readme.indexOf("<!-- @faqir:theme-table start -->");
    expect(readme.lastIndexOf("### The fourteen axes", axesAt)).toBeGreaterThan(-1);
    expect(readme.lastIndexOf("### Every theme, by axis", tableAt)).toBeGreaterThan(axesAt);
    // And the section documents the rest of Theme System 2.0 where it says it does.
    const section = readme.slice(readme.indexOf("## Theme System"), readme.indexOf("## Faqir Core"));
    for (const claim of [
      "light-dark(",
      "faqir fonts add",
      "faqir theme bundle",
      "--scope",
      "--seed",
      "faqir_theme_list",
      "gen:theme-docs",
    ]) {
      expect(section, claim).toContain(claim);
    }
  });

  it("applyDocBlocks writes between the markers and reports markers it cannot find", () => {
    const doc = "intro\n<!-- @faqir:x start -->\nold\n<!-- @faqir:x end -->\nouter";
    const { markdown, missing } = applyDocBlocks(doc, { x: "new\nlines", y: "unplaced" });
    expect(markdown).toBe("intro\n<!-- @faqir:x start -->\nnew\nlines\n<!-- @faqir:x end -->\nouter");
    expect(missing).toEqual(["y"]);
    expect(docBlockDrift(markdown, { x: "new\nlines" })).toEqual([]);
    expect(docBlockDrift(markdown, { x: "other" })).toEqual(["x"]);
    expect(docBlockDrift(markdown, { y: "unplaced" })).toEqual(["y (markers missing)"]);
    // Empty markers — the state a fresh section is authored in — are filled, not skipped.
    const fresh = applyDocBlocks("<!-- @faqir:x start -->\n<!-- @faqir:x end -->", { x: "t" });
    expect(fresh.missing).toEqual([]);
    expect(fresh.markdown).toBe("<!-- @faqir:x start -->\nt\n<!-- @faqir:x end -->");
  });
});

describe("describe.ts — the gallery's chips and filter", () => {
  it("chips every gallery axis for a theme with axes, none for a companion", () => {
    const chips = galleryChips(editorial);
    expect(chips.map(([p]) => p)).toEqual([...GALLERY_AXES]);
    expect(chips).toContainEqual(["depth", "flat"]);
    expect(chips).toContainEqual(["type.pairing", "serif-editorial"]);
    expect(galleryChips(companion)).toEqual([]);
    expect(galleryAxisAttribute("type.pairing")).toBe("data-theme-axis-type-pairing");
  });

  it("offers only the values some shipped theme lands on, in vocabulary order", () => {
    const options = galleryFilterOptions(manifests);
    expect(options.map((o) => o.path)).toEqual([...GALLERY_AXES]);
    for (const { path, values } of options) {
      const vocabulary = THEME_AXIS_VALUES[path].map(String);
      expect(values.length).toBeGreaterThan(0);
      expect(values).toEqual(vocabulary.filter((v) => values.includes(v)));
      for (const v of values) {
        expect(withAxes.some((m) => String(axisValue(m.axes!, path)) === v), `${path}=${v} selects nothing`).toBe(
          true,
        );
      }
    }
    expect(options.find((o) => o.path === "depth")!.values).toContain("glass");
  });
});
