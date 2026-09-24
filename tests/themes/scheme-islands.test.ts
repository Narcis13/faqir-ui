// A theme's alias overrides survive a nested scheme island
//
// The token layer restates its colour aliases on `[data-theme]` and
// `[data-skin]` (SCHEME_ALIASES, `tests/tokens/scheme-islands.test.ts`): a
// custom property resolves its var() on the element that DECLARES it, so
// without the restatement a `<div data-theme="dark">` inherits aliases computed
// from the page's light colours. The restatement has a cost on the theme side.
// It re-declares the alias with the TOKEN LAYER's default on every island, so a
// theme that re-points one on `:root` alone loses it there — a filled-input
// theme draws boxed inputs, and glass draws opaque cards, inside a dark island.
//
// So a theme states such an override on the same selector the token layer does,
// `:root, [data-theme]`. This file pins that from three sides: a sweep over
// every shipped stylesheet, the generator's output, and what a cascade actually
// resolves inside a nested island.

import { describe, expect, it } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { Window } from "happy-dom";
import { SCHEME_ALIASES } from "../../src/theme/scope";
import { generateThemeBundle, ISLAND_ALIASES } from "../../src/commands/theme-generate";
import { themeBaseSources } from "../../src/theme/sources";
import { axesFromCss } from "../../src/theme/axes";
import { isRootSelectorList, parseThemeValues } from "../../src/utils/oklch";

const REGISTRY = join(import.meta.dir, "../../registry");
const THEMES_DIR = join(REGISTRY, "themes");
const BASE = themeBaseSources(REGISTRY);
const THEME_FILES = readdirSync(THEMES_DIR).filter((f) => f.endsWith(".css")).sort();

/** Every `--alias` a stylesheet declares in a block whose selector list includes `:root`, with that list. */
function rootAliasDeclarations(css: string): Array<{ token: string; selectors: string[] }> {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, " ");
  const out: Array<{ token: string; selectors: string[] }> = [];
  for (const m of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = m[1].trim().split(",").map((s) => s.trim().replace(/\s+/g, " "));
    if (!selectors.includes(":root")) continue;
    for (const d of m[2].matchAll(/--([\w-]+)\s*:/g)) {
      if (ISLAND_ALIASES.has(d[1])) out.push({ token: d[1], selectors });
    }
  }
  return out;
}

const onRootOnly = (css: string) =>
  rootAliasDeclarations(css)
    .filter(({ selectors }) => !selectors.includes("[data-theme]"))
    .map(({ token }) => token);

describe("parseThemeValues · a selector list with a :root branch is a root block", () => {
  it("isRootSelectorList matches a branch that is exactly :root, in any position", () => {
    expect(isRootSelectorList(":root")).toBe(true);
    expect(isRootSelectorList(":root,\n[data-theme]")).toBe(true);
    expect(isRootSelectorList("[data-theme], :root")).toBe(true);
    expect(isRootSelectorList("[data-theme], [data-skin]")).toBe(false);
    expect(isRootSelectorList(":root[data-theme]")).toBe(false);
    expect(isRootSelectorList('[data-skin="x"] :root')).toBe(false);
  });

  it("records a :root, [data-theme] block's declarations as light (root) values", () => {
    const values = parseThemeValues(
      `:root { --a: 1; }\n:root,\n[data-theme] { --b: 2; }\n[data-theme], [data-skin] { --c: 3; }\n` +
        `[data-theme="dark"] { --b: 4; }\n`,
    );
    expect(values.light.get("a")).toBe("1");
    expect(values.light.get("b")).toBe("2");
    // The token layer's own island block has no :root branch and stays out.
    expect(values.light.has("c")).toBe(false);
    // A later dark block still owns the dark side, exactly as the cascade does.
    expect(values.dark.get("b")).toBe("4");
  });
});

describe("theme alias overrides · stated on every scheme island", () => {
  it("ISLAND_ALIASES is SCHEME_ALIASES, minus the dashes", () => {
    expect([...ISLAND_ALIASES].sort()).toEqual(SCHEME_ALIASES.map(([n]) => n.slice(2)).sort());
  });

  it("no shipped theme re-points a restated alias on :root alone", () => {
    const offenders: string[] = [];
    for (const file of THEME_FILES) {
      for (const token of onRootOnly(readFileSync(join(THEMES_DIR, file), "utf8"))) {
        offenders.push(`${file}: --${token}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("is not vacuous: the sweep sees the overrides, and a :root-only one is reported", () => {
    const glass = readFileSync(join(THEMES_DIR, "glass.css"), "utf8");
    expect(rootAliasDeclarations(glass).map((d) => d.token).sort()).toEqual(["card-bg", "input-fill", "panel-bg"]);
    expect(onRootOnly(`${glass}\n:root { --input-fill: var(--input-bg); }\n`)).toEqual(["input-fill"]);
  });
});

describe("the generator states island aliases on :root, [data-theme]", () => {
  const filled = generateThemeBundle(
    { name: "island-probe", accent: "#2563eb", controls: { input: "filled" }, depth: "glass" },
    BASE,
  ).generated[0].css;

  it("puts --input-fill, --focus-ring-color and glass's --card-bg in the island block, and nothing else", () => {
    const island = /:root,\n\[data-theme\] \{([^}]*)\}/.exec(filled);
    expect(island).not.toBeNull();
    const tokens = [...island![1].matchAll(/--([\w-]+)\s*:/g)].map((m) => m[1]).sort();
    expect(tokens).toEqual(["card-bg", "focus-ring-color", "input-fill"]);
    expect(island![1]).toContain("var(--input-bg-filled)");
    expect(onRootOnly(filled)).toEqual([]);
  });

  it("the parser and the classifier still read the island block as :root", () => {
    expect(parseThemeValues(filled).light.get("input-fill")).toBe("var(--input-bg-filled)");
    expect(axesFromCss(filled, BASE).controls.input).toBe("filled");
    expect(axesFromCss(filled, BASE).depth).toBe("glass");
  });

  it("a theme that re-points no alias writes no island block, so older output is unchanged", () => {
    // `box` inputs and a `ring` focus still restate their aliases at the default
    // spelling (the 1.0 generator always did), so the block exists — but a
    // document companion, which re-points none, has only `:root`.
    const companion = generateThemeBundle(
      { name: "island-doc", accent: "#2563eb", document: true },
      BASE,
    ).generated[1].css;
    expect(companion).not.toContain("[data-theme] {");
  });
});

describe("in a cascade: a nested dark island keeps the theme's override", () => {
  const read = (rel: string) => readFileSync(join(REGISTRY, rel), "utf8");
  // happy-dom's value parser drops a space-separated oklch(); swap each for a
  // unique hex so the var() chains resolve to something comparable.
  const hex = new Map<string, string>();
  const hexify = (css: string) =>
    css.replace(/oklch\([^)]*\)/g, (m) => {
      if (!hex.has(m)) hex.set(m, `#${(hex.size + 1).toString(16).padStart(6, "0")}`);
      return hex.get(m)!;
    });

  function probe(themeCss: string) {
    const w = new Window();
    const d = w.document;
    d.head.innerHTML = `<style>
      ${hexify(read("tokens/palette.css"))}
      ${hexify(read("tokens/semantic.css"))}
      ${hexify(read("tokens/effects.css"))}
      ${hexify(read("tokens/aliases.css"))}
      ${hexify(themeCss)}
      [data-probe="fill"] { color: var(--input-fill); }
      [data-probe="subtle"] { color: var(--color-bg-subtle); }
      [data-probe="bg"] { color: var(--color-bg); }
    </style>`;
    d.body.innerHTML = `
      <div id="island" data-theme="dark">
        <i id="fill" data-probe="fill"></i>
        <i id="subtle" data-probe="subtle"></i>
        <i id="bg" data-probe="bg"></i>
      </div>`;
    const color = (id: string) => w.getComputedStyle(d.getElementById(id)!).getPropertyValue("color");
    return { color, close: () => w.close() };
  }

  // Three-block form: happy-dom has no light-dark(), and the island's dark
  // values have to be literal for the cascade to show which one won.
  const theme = generateThemeBundle(
    {
      name: "island-cascade",
      accent: "#2563eb",
      controls: { input: "filled" },
      legacyBlocks: true,
    },
    BASE,
  ).generated[0].css;

  it("a filled-input theme's island input is filled with the ISLAND's subtle surface", () => {
    const dom = probe(theme);
    try {
      expect(dom.color("fill")).not.toBe("");
      expect(dom.color("fill")).toBe(dom.color("subtle"));
      expect(dom.color("fill")).not.toBe(dom.color("bg"));
    } finally {
      dom.close();
    }
  });

  it("is not vacuous: stated on :root alone, the island falls back to the boxed default", () => {
    const rootOnly = theme.replace(":root,\n[data-theme] {", ":root {");
    expect(rootOnly).not.toBe(theme);
    const dom = probe(rootOnly);
    try {
      expect(dom.color("fill")).toBe(dom.color("bg"));
      expect(dom.color("fill")).not.toBe(dom.color("subtle"));
    } finally {
      dom.close();
    }
  });
});
