// forecraft #48 — a typographic identity for each print theme.
//
// `editorial-document`, `ink-document` and `swiss-document` used to differ on
// the accent alone: `renderDocumentCss` wrote one fixed block of `--doc-*`
// tokens whatever the parent seed said. A companion now takes a PRINT VOICE
// from its parent's `type.pairing`, stated in document tokens only. This file
// pins the generator side: which pairing speaks which voice, what each voice
// declares, that every other pairing keeps the neutral block, that a voice
// re-points only tokens the base layer defines, that it keeps faces on the role
// tokens (#38), and that it moves no axis — so the reason a companion is not a
// distinctiveness peer is unchanged. The printed result is asserted by
// `tests/visual/print/forecraft-print-themes.pw.ts`.

import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Glob } from "bun";
import { generateThemeBundle, printVoiceFor } from "../../src/commands/theme-generate";
import { themeBaseSources } from "../../src/theme/sources";
import { axesFromCss } from "../../src/theme/axes";
import { surfaceTokens, type ThemeSeed } from "../../src/theme-manifest";

const REGISTRY = join(import.meta.dir, "../../registry");
const THEMES_DIR = join(REGISTRY, "themes");
const TOKENS_DIR = join(REGISTRY, "tokens");
const BASE = themeBaseSources(REGISTRY);
const AXIS_BASE = [...new Glob("*.css").scanSync(TOKENS_DIR)]
  .sort()
  .map((f) => readFileSync(join(TOKENS_DIR, f), "utf8"));

const PRINT_THEMES = ["document", "document-serif", "editorial-document", "ink-document", "swiss-document"];
const COMPANIONS = ["editorial-document", "ink-document", "swiss-document"] as const;
/** The four tokens #48 added to tokens/document.css. */
const VOICE_TOKENS = ["doc-rule-scale", "doc-rule-strong-scale", "doc-table-num-scale", "doc-table-flush"];

const read = (file: string) => readFileSync(join(THEMES_DIR, file), "utf8");
const seedOf = (name: string) => JSON.parse(read(`${name}.seed.json`)) as ThemeSeed;

/** `--name: value` declarations of a stylesheet's first `:root` block. */
function rootTokens(css: string): Map<string, string> {
  const block = /:root\s*\{([^}]*)\}/.exec(css.replace(/\/\*[\s\S]*?\*\//g, ""))?.[1] ?? "";
  return new Map(
    [...block.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()] as const),
  );
}

/** The companion a seed produces, under whichever type pairing is asked for. */
function companionFor(parent: string, pairing?: string): string {
  const seed = seedOf(parent);
  const input = pairing ? { ...seed, type: { ...seed.type, pairing } } : seed;
  const bundle = generateThemeBundle(input as never, BASE);
  return bundle.generated.find((file) => file.kind === "document")!.css;
}

describe("forecraft #48 · which pairing speaks which print voice", () => {
  it("serif pairings are editorial, the grotesque is Swiss, the slab is letterpress", () => {
    expect(printVoiceFor("serif-editorial")).toBe("editorial");
    expect(printVoiceFor("serif-modern")).toBe("editorial");
    expect(printVoiceFor("sans-grotesque")).toBe("swiss");
    expect(printVoiceFor("slab")).toBe("letterpress");
  });

  it("every other pairing has no voice and keeps the neutral block", () => {
    for (const pairing of ["system", "sans-humanist", "sans-geometric", "rounded", "mono", "custom"]) {
      expect({ [pairing]: printVoiceFor(pairing) }).toEqual({ [pairing]: null });
    }
  });

  it("the three shipped parents name the three voices, and each companion says which it took", () => {
    expect(COMPANIONS.map((c) => seedOf(c.replace(/-document$/, "")).type?.pairing)).toEqual([
      "serif-editorial",
      "slab",
      "sans-grotesque",
    ]);
    expect(read("editorial-document.css")).toContain("/* Print voice: editorial, from the parent's type pairing (serif-editorial). */");
    expect(read("ink-document.css")).toContain("/* Print voice: letterpress, from the parent's type pairing (slab). */");
    expect(read("swiss-document.css")).toContain("/* Print voice: swiss, from the parent's type pairing (sans-grotesque). */");
  });
});

describe("forecraft #48 · what each voice declares", () => {
  const tokens = Object.fromEntries(COMPANIONS.map((c) => [c, rootTokens(read(`${c}.css`))]));

  it("editorial: a serif heading voice, a wider measure, softer rules", () => {
    const t = tokens["editorial-document"];
    expect(t.get("doc-heading-font")).toBe("var(--doc-serif)");
    expect(t.get("doc-font")).toBe("var(--font-body)");
    expect(t.get("page-margin-left")).toBe("11mm");
    expect(t.get("page-margin-right")).toBe("11mm");
    expect(t.get("doc-line-height")).toBe("1.5");
    expect(t.get("doc-print-border-color")).toBe("var(--color-border)");
    expect(t.get("doc-table-border")).toBe("var(--color-border)");
    expect(t.get("doc-rule-strong-scale")).toBe("0.5");
  });

  it("swiss: a tight grotesk setting, flush rules, larger tabular numerals", () => {
    const t = tokens["swiss-document"];
    expect(t.get("doc-heading-font")).toBe("var(--font-heading)");
    expect(t.get("doc-line-height")).toBe("1.3");
    expect(t.get("doc-table-cell-pad-y")).toBe("var(--space-1h)");
    expect(t.get("doc-table-flush")).toBe("1");
    expect(t.get("doc-table-header-bg")).toBe("var(--color-bg)");
    expect(t.get("doc-table-footer-bg")).toBe("var(--color-bg)");
    expect(t.get("doc-print-border-color")).toBe("var(--color-fg)");
    expect(t.get("doc-table-num-scale")).toBe("1.2");
    expect(t.get("doc-table-font-size")).toBe("9pt");
  });

  it("letterpress (ink): heavier rules, a table head in stronger contrast", () => {
    const t = tokens["ink-document"];
    expect(t.get("doc-rule-scale")).toBe("2");
    expect(t.get("doc-rule-strong-scale")).toBe("1.5");
    expect(t.get("doc-print-border-color")).toBe("var(--palette-ink-900)");
    expect(t.get("doc-table-border")).toBe("var(--palette-ink-900)");
    expect(t.get("doc-table-header-bg")).toBe("var(--palette-ink-100)");
    expect(t.get("doc-table-header-fg")).toBe("var(--palette-ink-950)");
    expect(t.get("doc-table-header-weight")).toBe("var(--weight-bold)");
  });

  it("the three companions no longer share one document block", () => {
    const docBlock = (name: string) =>
      JSON.stringify(
        [...tokens[name]]
          .filter(([token]) => token.startsWith("doc-") || token.startsWith("page-"))
          // The accent is the one thing they always differed on; it is not a voice.
          .filter(([token]) => token !== "doc-accent")
          .sort(),
      );
    const blocks = COMPANIONS.map(docBlock);
    expect(new Set(blocks).size).toBe(3);
  });
});

describe("forecraft #48 · what a voice may not do", () => {
  const surface = new Set(surfaceTokens(BASE));

  it("re-points only tokens the base layer defines", () => {
    for (const name of COMPANIONS) {
      const unknown = [...rootTokens(read(`${name}.css`)).keys()].filter(
        (token) => !token.startsWith("palette-") && !surface.has(token),
      );
      expect({ [name]: unknown }).toEqual({ [name]: [] });
    }
    for (const token of VOICE_TOKENS) {
      expect(surface.has(token)).toBe(true);
    }
  });

  it("keeps every document face on a role token — no literal family is a primary face (#38)", () => {
    for (const name of PRINT_THEMES) {
      const t = rootTokens(read(`${name}.css`));
      for (const token of ["doc-font", "doc-heading-font", "doc-serif"]) {
        const value = t.get(token);
        if (value == null) continue;
        expect({ [name]: { [token]: value } }).toEqual({
          [name]: { [token]: expect.stringMatching(/^var\(--(font-[\w-]+|doc-serif)\)$/) },
        });
      }
    }
    // And the face `--doc-serif` names is the project's serif role.
    expect(rootTokens(readFileSync(join(TOKENS_DIR, "document.css"), "utf8")).get("doc-serif")).toBe(
      "var(--font-serif)",
    );
  });

  it("differs from the neutral block only in document tokens, so it moves no axis", () => {
    for (const name of COMPANIONS) {
      const parent = name.replace(/-document$/, "");
      const voiced = companionFor(parent);
      const neutral = companionFor(parent, "system");
      expect(voiced).toBe(read(`${name}.css`));
      expect(neutral).not.toContain("Print voice");

      const a = rootTokens(voiced);
      const b = rootTokens(neutral);
      const moved = [...new Set([...a.keys(), ...b.keys()])].filter((token) => a.get(token) !== b.get(token));
      expect(moved.length).toBeGreaterThan(0);
      expect({ [name]: moved.filter((token) => !/^(doc|page)-/.test(token)) }).toEqual({ [name]: [] });

      expect(axesFromCss(voiced, AXIS_BASE)).toEqual(axesFromCss(neutral, AXIS_BASE));
    }
  });

  it("a seed with no voice writes the same companion as before the voices existed", () => {
    // `ink` under the system pairing: none of the four voice-only tokens, and
    // the document block 1.1A-16 shipped, value for value.
    const t = rootTokens(companionFor("ink", "system"));
    for (const token of [...VOICE_TOKENS, "page-margin-left"]) {
      expect(t.has(token)).toBe(false);
    }
    expect(t.get("doc-heading-font")).toBe("var(--font-heading)");
    expect(t.get("doc-line-height")).toBe("1.4");
    expect(t.get("doc-table-header-bg")).toBe("var(--color-bg-muted)");
    expect(t.get("doc-table-border")).toBe("var(--color-border-strong)");
  });
});

describe("forecraft #48 · the defaults draw what a document table drew before", () => {
  const tokens = rootTokens(readFileSync(join(TOKENS_DIR, "document.css"), "utf8"));

  it("each new table token is a multiplier whose default is the identity", () => {
    // Multipliers rather than aliases: the pattern applies each one where the
    // table draws, so a document that restates --border-width or
    // --doc-table-font-size on a subtree (a `data-skin` island, say) still
    // reaches every cell — an alias resolved at :root would not.
    expect(tokens.get("doc-rule-scale")).toBe("1");
    expect(tokens.get("doc-rule-strong-scale")).toBe("1");
    expect(tokens.get("doc-table-num-scale")).toBe("1");
    expect(tokens.get("doc-table-flush")).toBe("0");
    const pattern = readFileSync(join(REGISTRY, "patterns/document/document.css"), "utf8");
    expect(pattern).toContain("calc(var(--border-width) * var(--doc-rule-scale))");
    expect(pattern).toContain("calc(var(--border-width-strong) * var(--doc-rule-strong-scale))");
    expect(pattern).toContain("calc(var(--doc-table-font-size) * var(--doc-table-num-scale))");
    expect(pattern).toContain("calc(var(--doc-table-cell-pad-x) * (1 - var(--doc-table-flush)))");
  });
});
