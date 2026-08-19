// The base layer, and the one `data-ui` value in it (task 1.0R-10).
//
// `registry/base/prose.css` defines `data-ui="prose"`. It has no manifest, so it
// is in no manifest-derived surface: not the component list, not the skill's
// per-layer references, not `llms.txt`. The framework's own site is built out of
// it on a dozen pages, which is exactly why an agent asked for a Faqir docs page
// could not find it. These tests hold the three surfaces that now document it,
// and hold the stylesheet itself to the rules it teaches.

import { describe, expect, it } from "bun:test";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BASE_LAYER_BLURB, baseLayerUiValues, loadBaseLayer } from "../../src/base-layer";
import { extractTokenDefinitions } from "../../src/parser/css-parser";
import { stripCssComments } from "../../src/theme-manifest";
import { buildDocsSite } from "../../src/generator/docs";
import { generateShippedSkillFiles, generateSkill } from "../../src/generator/skill";
import { init } from "../../src/commands/init";

const REPO = join(import.meta.dir, "../..");
const REGISTRY = join(REPO, "registry");
const PROSE = readFileSync(join(REGISTRY, "base", "prose.css"), "utf8");

const baseFiles = loadBaseLayer(REGISTRY);
const baseValues = baseLayerUiValues(baseFiles);

describe("the base layer is derived, not listed", () => {
  it("finds the data-ui values that base CSS defines and no component claims", () => {
    // Today that is exactly one. The assertion is on the SET, so a second
    // base-layer value fails here first and has to be documented.
    expect(baseValues).toEqual(["prose"]);
    expect(baseFiles.map((f) => f.file)).toEqual([
      "motion-presets.css",
      "prose.css",
      "reset.css",
      "rhythm.css",
    ]);
    // rhythm.css selects on a dozen `data-ui` values — every one of them a
    // component with a manifest, so none of them is a base-layer value.
    expect(baseFiles.find((f) => f.file === "rhythm.css")!.defines).toEqual([]);
  });

  it("picks up a new base-layer value with no edit to the generator", () => {
    const dir = join(import.meta.dir, "../.tmp-base-layer");
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(join(dir, "base"), { recursive: true });
    mkdirSync(join(dir, "primitives", "button"), { recursive: true });
    writeFileSync(
      join(dir, "base", "figure.css"),
      '/* @ui:base figure — captioned media defaults */\n[data-ui="figure"] { margin-block: 0; }\n' +
        '[data-ui="button"] { margin: 0; }\n',
    );
    try {
      const files = loadBaseLayer(dir);
      // `figure` is new and appears; `button` is a component and does not.
      expect(baseLayerUiValues(files)).toEqual(["figure"]);
      expect(files[0].blurb).toBe("captioned media defaults");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("refuses a base stylesheet with no @ui:base header to document it from", () => {
    const dir = join(import.meta.dir, "../.tmp-base-layer-bad");
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(join(dir, "base"), { recursive: true });
    writeFileSync(join(dir, "base", "mystery.css"), '[data-ui="mystery"] { color: red; }\n');
    try {
      expect(() => loadBaseLayer(dir)).toThrow(/@ui:base/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("every base-layer value is documented on every agent surface", () => {
  it("appears in the shipped skill", async () => {
    const files = await generateShippedSkillFiles();
    const skill = files.find((f) => f.relPath === "SKILL.md")!.content;
    expect(skill).toContain("## Base Layer");
    expect(skill).toContain(BASE_LAYER_BLURB);
    for (const value of baseValues) {
      expect(skill, `SKILL.md never names data-ui="${value}"`).toContain(`| \`${value}\` |`);
    }
    // Every base stylesheet is named, not only the ones that define a value.
    for (const file of baseFiles) expect(skill).toContain(`\`base/${file.file}\``);
  });

  it("appears in a project's own skill, under that project's output directory", async () => {
    // `base/` is installed into every project, so an agent reading
    // `.faqir/SKILL.md` needs the value AND a path it can actually open.
    const dir = join(import.meta.dir, "../.tmp-base-layer-project");
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    const origCwd = process.cwd();
    process.chdir(dir);
    try {
      await init([]);
      const skill = await generateSkill(dir);
      expect(skill).toContain("## Base Layer");
      for (const value of baseValues) expect(skill).toContain(`| \`${value}\` |`);
      expect(skill).toContain("`ui/base/prose.css`");
      expect(skill).not.toContain("| `base/prose.css` |");
    } finally {
      process.chdir(origCwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("appears in llms.txt and in llms-full.txt", () => {
    // The hosted pair is the CLI's own `--format llms` generator pointed at the
    // whole registry, so asserting on the site's copy asserts on both.
    const site = new Map(buildDocsSite().map((f) => [f.path, f.content]));
    const index = site.get("llms.txt")!;
    const full = site.get("llms-full.txt")!;
    expect(index).toContain("## Base layer");
    expect(full).toContain("## Base layer");
    for (const value of baseValues) {
      expect(index, `llms.txt never names ${value}`).toContain(`- [${value}](llms-full.txt#base-layer)`);
      expect(full, `llms-full.txt never names ${value}`).toContain(`| \`${value}\` |`);
    }
  });

  it("appears on the site, on the page that lists every component", () => {
    const page = buildDocsSite().find((f) => f.path === "components/index.html")!.content;
    expect(page).toContain('<section id="base-layer">');
    for (const value of baseValues) {
      expect(page, `components/index.html never names ${value}`).toContain(
        `<code>data-ui="${value}"</code>`,
      );
    }
  });
});

// ── prose.css itself ────────────────────────────────────────────────────────
//
// Strict Rule 2 says never hardcode a value a token exists for, and the layout
// system is written in logical properties. The base layer is where an agent
// looks for the house style, so it is held to both.

/** Every declared token value in `registry/tokens/*.css`, mapped back to its names. */
function tokenValues(): Map<string, string[]> {
  const byValue = new Map<string, string[]>();
  const dir = join(REGISTRY, "tokens");
  for (const file of require("node:fs").readdirSync(dir).filter((f: string) => f.endsWith(".css"))) {
    // Comments are stripped first: `document.css` documents an `@page` block
    // inside one, and a commented-out declaration is not a declared token.
    for (const def of extractTokenDefinitions(stripCssComments(readFileSync(join(dir, file), "utf8")))) {
      if (def.value.includes("var(")) continue;
      byValue.set(def.value, [...(byValue.get(def.value) ?? []), def.name]);
    }
  }
  return byValue;
}

/**
 * Physical properties whose logical form means the same thing in every writing
 * mode. `overflow-x` is deliberately absent: `overflow-inline` is an axis
 * keyword rather than a 1:1 rename, and the registry writes `overflow-x` in six
 * other places — changing one of the seven would be inconsistency, not a fix.
 */
const PHYSICAL_TO_LOGICAL: Record<string, string> = {
  "width": "inline-size",
  "height": "block-size",
  "min-width": "min-inline-size",
  "min-height": "min-block-size",
  "max-width": "max-inline-size",
  "max-height": "max-block-size",
  "margin-top": "margin-block-start",
  "margin-bottom": "margin-block-end",
  "padding-top": "padding-block-start",
  "padding-bottom": "padding-block-end",
  "border-top": "border-block-start",
  "border-bottom": "border-block-end",
  "border-top-width": "border-block-start-width",
  "border-bottom-width": "border-block-end-width",
};

/** Every `property: value` pair in a stylesheet, comments stripped, custom properties excluded. */
function declarations(css: string): { property: string; value: string }[] {
  const out: { property: string; value: string }[] = [];
  for (const match of stripCssComments(css).matchAll(/([a-z-]+)\s*:\s*([^;{}]+);/g)) {
    if (match[1].startsWith("--")) continue;
    out.push({ property: match[1], value: match[2].trim() });
  }
  return out;
}

describe("prose.css obeys the rules it teaches", () => {
  const decls = declarations(PROSE);

  it("hardcodes no length a token already carries", () => {
    const byValue = tokenValues();
    const offenders: string[] = [];
    for (const { property, value } of decls) {
      // Border WIDTHS are exempt, and by construction rather than by exception:
      // this framework has no border-width ladder, and every rule in the
      // registry that draws a hairline writes `1px solid var(--color-border)`.
      // Matching `1px` against `--space-px` would swap a spacing token into a
      // border, which is a worse stylesheet, not a more tokenised one.
      if (/^border(?!.*radius)/.test(property)) continue;
      for (const length of value.matchAll(/(?<![\w.-])(\d*\.?\d+)(ch|rem|em|px|vh|vw|%)/g)) {
        const literal = length[0];
        const names = byValue.get(literal);
        if (names) offenders.push(`${property}: ${literal} → var(--${names[0]})`);
      }
    }
    expect(offenders).toEqual([]);
    // The one this task removed: 65ch is --measure-prose, and still is.
    expect(byValue.get("65ch")).toContain("measure-prose");
    expect(PROSE).toContain("max-inline-size: var(--measure-prose)");
  });

  it("uses a logical property wherever one means the same thing", () => {
    const offenders = decls
      .filter(({ property }) => property in PHYSICAL_TO_LOGICAL)
      .map(({ property }) => `${property} → ${PHYSICAL_TO_LOGICAL[property]}`);
    expect(offenders).toEqual([]);
  });

  it("still says what it said before, in logical form", () => {
    // Behaviour, not spelling: the table is full-bleed, rules sit under the
    // header row, and the first and last children have no outer margin.
    expect(PROSE).toContain("inline-size: 100%");
    expect(PROSE).toContain("border-block-end: 2px solid var(--color-border-strong)");
    expect(PROSE).toContain("margin-block-start: 0");
    expect(PROSE).toContain("margin-block-end: 0");
  });
});
