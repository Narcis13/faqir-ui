/**
 * Scheme islands — colour aliases re-resolve under a nested `data-theme`.
 *
 * A custom property resolves its `var()` on the element that DECLARES it. 1.1
 * routed a dozen component colours through aliases — `--panel-bg`,
 * `--focus-ring-color`, `--input-fill` — declared on `:root` alone, so each was
 * computed once, from the page's colours, and a nested
 * `<div data-theme="dark">` inherited the light value: a white dialog on a dark
 * island in every theme authored as separate light/dark blocks (brutalist,
 * midnight, and the default theme every 1.0 project has in `tokens/theme.css`).
 *
 * The token layer now restates its colour aliases on `[data-theme]` and
 * `[data-skin]`. Three things are pinned here:
 *
 * 1. **The restatement is complete and exact.** Every `:root` alias whose value
 *    reads a `--color-*` token (or another restated alias) is restated, with the
 *    same value, and `SCHEME_ALIASES` in `src/theme/scope.ts` — what a scoped
 *    skin's root restates — lists exactly those.
 * 2. **An island resolves what a whole dark page resolves**, for every restated
 *    alias, under a three-block theme — read back from a cascade, not asserted
 *    from the source.
 * 3. **A theme's own override still wins at page level**: `html[data-theme]`
 *    matches both the theme's `:root` and the token layer's `[data-theme]`, and
 *    the theme is linked later.
 */
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Window } from "happy-dom";
import { parseBlocks, SCHEME_ALIASES } from "../../src/theme/scope";
import { stripCssComments } from "../../src/theme-manifest";

const ROOT = join(import.meta.dir, "../..");
const read = (rel: string) => readFileSync(join(ROOT, "registry", rel), "utf8");

/** The files that carry an island block, in bundle order. */
const ISLAND_FILES = ["tokens/effects.css", "tokens/aliases.css", "tokens/document.css", "tokens/doc-aliases.css"];
const ISLAND_SELECTOR = "[data-theme], [data-skin]";

/** name → value for every custom property a block with this exact prelude declares. */
function blockDecls(css: string, prelude: string): Array<[string, string]> {
  const source = stripCssComments(css);
  const out: Array<[string, string]> = [];
  for (const block of parseBlocks(source)) {
    if (block.prelude.trim().replace(/\s+/g, " ") !== prelude) continue;
    for (const decl of source.slice(block.braceAt + 1, block.closeAt).split(";")) {
      const m = /^\s*(--[\w-]+)\s*:\s*([\s\S]+?)\s*$/.exec(decl);
      if (m) out.push([m[1], m[2].replace(/\s+/g, " ")]);
    }
  }
  return out;
}

describe("the island blocks restate the colour aliases exactly", () => {
  for (const file of ISLAND_FILES) {
    const css = read(file);
    const root = new Map(blockDecls(css, ":root"));
    const island = blockDecls(css, ISLAND_SELECTOR);

    it(`${file} has an island block`, () => {
      expect(island.length).toBeGreaterThan(0);
    });

    it(`${file}: every restated alias carries its :root value`, () => {
      for (const [name, value] of island) expect(`${name}: ${value}`).toBe(`${name}: ${root.get(name)}`);
    });
  }

  it("every alias that reads a scheme colour is restated (aliases, effects, doc-aliases)", () => {
    // document.css is print ink apart from `--doc-legal-color`, so it is exempt
    // from the sweep and checked by the value test above instead.
    const restated = new Set(SCHEME_ALIASES.map(([name]) => name));
    for (const file of ["tokens/aliases.css", "tokens/effects.css", "tokens/doc-aliases.css"]) {
      for (const [name, value] of blockDecls(read(file), ":root")) {
        const refs = [...value.matchAll(/var\(\s*(--[\w-]+)/g)].map((m) => m[1]);
        const schemeDependent = refs.some((ref) => ref.startsWith("--color-") || restated.has(ref));
        if (schemeDependent) expect(restated.has(name), `${file}: ${name} reads a scheme colour`).toBe(true);
      }
    }
  });

  it("SCHEME_ALIASES is exactly the union of the island blocks", () => {
    const union = ISLAND_FILES.flatMap((file) => blockDecls(read(file), ISLAND_SELECTOR));
    expect([...SCHEME_ALIASES].map(([n, v]) => `${n}: ${v}`).sort()).toEqual(
      union.map(([n, v]) => `${n}: ${v}`).sort(),
    );
  });

  it("restates no shadow or geometry — those belong to the theme's :root", () => {
    for (const [name] of SCHEME_ALIASES) expect(name).not.toMatch(/shadow|radius|width|height|size|font/);
  });
});

// ── 2 & 3: what the cascade resolves ────────────────────────────────────────

const TOKEN_ORDER = [
  "palette", "spacing", "typography", "effects", "textures", "motion",
  "semantic", "aliases", "document", "doc-aliases", "density",
];

/**
 * happy-dom drops a colour function whose arguments are space-separated, so
 * every distinct `oklch()` becomes a unique hex label — the same accommodation
 * `tests/commands/theme-bundle.test.ts` makes. Selectors are untouched.
 */
function hexify(css: string): string {
  const seen = new Map<string, string>();
  return css.replace(/oklch\([^)]*\)/g, (match) => {
    if (!seen.has(match)) seen.set(match, `#${(seen.size + 1).toString(16).padStart(6, "0")}`);
    return seen.get(match)!;
  });
}

/** Every restated alias, resolved on `#probe` through a real `color`-typed read. */
function resolve(themeCss: string, body: string, htmlAttrs = ""): Record<string, string> {
  const css = hexify(TOKEN_ORDER.map((t) => read(`tokens/${t}.css`)).join("\n") + themeCss);
  const win = new Window();
  try {
    const doc = win.document;
    if (htmlAttrs) doc.documentElement.setAttribute("data-theme", htmlAttrs);
    const style = doc.createElement("style");
    // Each alias is read through a real property on its own probe element, so
    // what comes back is the value the cascade resolved, not the source text.
    style.textContent =
      css + SCHEME_ALIASES.map(([name], i) => `\n[data-probe="${i}"] { background-color: var(${name}); }`).join("");
    doc.head.appendChild(style);
    doc.body.innerHTML = body.replace(
      "<probe/>",
      SCHEME_ALIASES.map((_, i) => `<i data-probe="${i}"></i>`).join(""),
    );
    const out: Record<string, string> = {};
    SCHEME_ALIASES.forEach(([name], i) => {
      out[name] = win.getComputedStyle(doc.querySelector(`[data-probe="${i}"]`)!).backgroundColor;
    });
    return out;
  } finally {
    win.close();
  }
}

describe("a nested data-theme region resolves what a whole dark page resolves", () => {
  // brutalist is authored in the three-block form — `:root` light, a separate
  // `[data-theme="dark"]` block — which is the form every 1.0 project's
  // `tokens/theme.css` is in.
  const brutalist = read("themes/brutalist.css");

  it("brutalist: every restated alias follows the island's scheme", () => {
    const page = resolve(brutalist, "<main><probe/></main>", "dark");
    const island = resolve(brutalist, `<main><section data-theme="dark"><probe/></section></main>`);
    const light = resolve(brutalist, "<main><probe/></main>");
    expect(island).toEqual(page);
    // Not vacuous: the dark page really differs from the light one where it matters.
    expect(page["--panel-bg"]).not.toBe(light["--panel-bg"]);
    expect(page["--focus-ring-color"]).toBeTruthy();
  });

  it("a theme's own :root override still wins on a whole-page data-theme", () => {
    const theme = `${brutalist}\n:root { --panel-bg: #123456; }`;
    expect(resolve(theme, "<main><probe/></main>", "dark")["--panel-bg"]).toBe("#123456");
  });
});
