// faqir theme bundle --scope — scoped themes [task 1.1A-19 · §5.4]
//
// A theme declares on `:root`, which is the whole page. `theme bundle --scope`
// rewrites it onto `[data-skin="<name>"]` — the fourth sanctioned token modifier
// (SPEC-1.0 §4) — so two themes can be live at once: a customer's brand
// previewed inside an admin (§9.3), a gallery, two candidates side by side.
//
// The gates below are in three layers:
//
//   1. the transform, run over EVERY shipped theme, so a theme added later is
//      checked without editing this file;
//   2. the CLI surface — where the file lands, what `--json` says, what each
//      error path says;
//   3. what a browser resolves, in happy-dom: the nesting rule, and the island's
//      isolation from the page around it.
//
// `light-dark()` is the one thing no static gate here can decide — it resolves
// at used-value time and happy-dom has no engine — so the rendering proof for
// the one-block authoring form lives in `tests/browser/theme-scope.pw.ts`.

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Window } from "happy-dom";
import { theme, THEME_BUNDLE_JSON_VERSION } from "../../src/commands/theme";
import {
  defaultScopeSelector,
  parseBlocks,
  scopeBranch,
  scopeRootScheme,
  scopeThemeCss,
  SCHEME_ALIASES,
} from "../../src/theme/scope";
import { listRegistryThemes, stripCssComments } from "../../src/theme-manifest";
import { extractTokenDefinitions } from "../../src/parser/css-parser";
import { SPAWN_TIMEOUT, runSync } from "../helpers/spawn";

const ROOT = join(import.meta.dir, "../..");
const REGISTRY = join(ROOT, "registry");
const SRC_INDEX = join(ROOT, "src/index.ts");

const THEMES = listRegistryThemes(REGISTRY);
const themeCss = (name: string) => readFileSync(join(REGISTRY, "themes", `${name}.css`), "utf8");

/** Every declaration in a sheet, in document order — preludes excluded. */
function declarations(css: string): string[] {
  const source = stripCssComments(css);
  const out: string[] = [];
  const walk = (blocks: ReturnType<typeof parseBlocks>): void => {
    for (const block of blocks) {
      if (block.children.length > 0) {
        walk(block.children);
        continue;
      }
      for (const decl of source.slice(block.braceAt + 1, block.closeAt).split(";")) {
        const text = decl.trim().replace(/\s+/g, " ");
        if (text) out.push(text);
      }
    }
  };
  walk(parseBlocks(source));
  return out;
}

// ── 1. the transform ────────────────────────────────────────────────────────

describe("scopeThemeCss · the block walker", () => {
  it("finds a nested block's extent and prelude", () => {
    const blocks = parseBlocks(":root { --a: 1; }\n@media print { :root { --b: 2; } }");
    expect(blocks.map((b) => b.prelude.trim())).toEqual([":root", "@media print"]);
    expect(blocks[1].children.map((b) => b.prelude.trim())).toEqual([":root"]);
    expect(blocks[0].children).toEqual([]);
  });

  it("is not desynchronized by a brace in a comment or a string", () => {
    const css = `/* :root { not a rule */\n:root { --quote: "}{;"; --a: 1; }`;
    const blocks = parseBlocks(css);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].prelude.trim()).toBe(":root");
    const scoped = scopeThemeCss(css, { selector: "[data-skin=x]" });
    // The comment keeps its own `:root`; only the rule's prelude moved.
    expect(scoped.css).toContain("/* :root { not a rule */");
    expect(scoped.css).toContain('--quote: "}{;";');
    expect(scoped.rewrites).toHaveLength(1);
  });

  it("scopeBranch states the rule for each shape a selector can take", () => {
    const s = "[data-skin=x]";
    // The root itself IS the scope — one branch, no descendant form.
    expect(scopeBranch(":root", s)).toEqual([s]);
    // A modifier can be on the scope root or under it: both forms, both (0,2,0).
    // A scheme can also sit OVER it — the page's own data-theme (SPEC-1.0 §3) —
    // except on a scope root that states its own.
    expect(scopeBranch('[data-theme="dark"]', s)).toEqual([
      '[data-skin=x][data-theme="dark"]',
      '[data-skin=x] [data-theme="dark"]',
      '[data-theme="dark"] [data-skin=x]:not([data-theme])',
    ]);
    expect(scopeBranch(':root[data-theme="dark"]', s)).toEqual([
      '[data-skin=x][data-theme="dark"]',
      '[data-skin=x] [data-theme="dark"]',
      '[data-theme="dark"] [data-skin=x]:not([data-theme])',
    ]);
    // Only a scheme cascades in from outside; any other compound does not.
    expect(scopeBranch(".a", s)).toEqual(["[data-skin=x].a", "[data-skin=x] .a"]);
    // A combinator after :root keeps its shape.
    expect(scopeBranch(":root > .a", s)).toEqual(["[data-skin=x] > .a"]);
    // A type selector cannot be concatenated — `[data-skin=x]html` is not a
    // selector — so it takes the descendant form only.
    expect(scopeBranch("html", s)).toEqual(["[data-skin=x] html"]);
    expect(scopeBranch("  ", s)).toEqual([]);
  });
});

describe("scopeThemeCss · every shipped theme scopes", () => {
  it("the sweep covers the whole registry (not vacuous)", () => {
    expect(THEMES.length).toBeGreaterThanOrEqual(27);
  });

  for (const name of THEMES) {
    describe(name, () => {
      const source = themeCss(name);
      const scoped = scopeThemeCss(source, { selector: defaultScopeSelector(name), name });

      it("declares nothing on :root any more", () => {
        // Comments are stripped first: several themes discuss `:root` in prose.
        const rules = parseBlocks(stripCssComments(scoped.css));
        const preludes: string[] = [];
        const collect = (blocks: ReturnType<typeof parseBlocks>) => {
          for (const block of blocks) {
            preludes.push(block.prelude.trim().replace(/\s+/g, " "));
            collect(block.children);
          }
        };
        collect(rules);
        expect(preludes.filter((p) => p.includes(":root"))).toEqual([]);
        expect(preludes.some((p) => p.includes(defaultScopeSelector(name)))).toBe(true);
      });

      it("declares exactly the tokens the theme declared, with the same values", () => {
        // Plus the restated colour aliases, which open the scope root — and only
        // those, once each, ahead of anything the theme itself says.
        const before = extractTokenDefinitions(stripCssComments(source));
        const after = extractTokenDefinitions(stripCssComments(scoped.css));
        const restated = SCHEME_ALIASES.map(([token, value]) => `${token.slice(2)}: ${value}`);
        const all = after.map((d) => `${d.name}: ${d.value}`);
        const first = all.indexOf(restated[0]);
        expect(all.slice(first, first + restated.length)).toEqual(restated);
        expect([...all.slice(0, first), ...all.slice(first + restated.length)]).toEqual(
          before.map((d) => `${d.name}: ${d.value}`),
        );
      });

      it("copies every declaration through — only preludes and the scope root moved", () => {
        // The scope root's five restated properties and the colour aliases open
        // the sheet, and a light skin's two data-theme scheme rules follow its
        // root block; every other declaration, `light-dark()` included, is
        // byte-identical and in the same order.
        const before = declarations(source);
        const after = declarations(scoped.css);
        const added = [
          // A dual theme declares no color-scheme: it inherits the page's.
          ...(scoped.colorScheme === "inherit" ? [] : [`color-scheme: ${scoped.colorScheme}`]),
          "color: var(--color-fg)",
          "background-color: var(--color-bg)",
          "background-image: var(--texture-page)",
          "font-family: var(--font-body)",
          ...SCHEME_ALIASES.map(([token, value]) => `${token}: ${value}`),
        ];
        const scheme =
          scoped.colorScheme === "light"
            ? ["color-scheme: dark", "color-scheme: light dark"]
            : scoped.colorScheme === "inherit"
              ? ["color-scheme: light"]
              : [];
        const rootCount = before.length - declarations(source.slice(source.indexOf("}") + 1)).length;
        expect(after).toEqual([
          ...added,
          ...before.slice(0, rootCount),
          ...scheme,
          ...before.slice(rootCount),
        ]);
      });

      it("reports every rewrite it made, with the line it was on", () => {
        expect(scoped.rewrites.length).toBeGreaterThan(0);
        for (const rewrite of scoped.rewrites) {
          expect(rewrite.to.startsWith(defaultScopeSelector(name))).toBe(true);
          expect(source.split("\n")[rewrite.line - 1]).toContain(rewrite.from.split(",")[0].trim());
        }
      });
    });
  }
});

describe("scopeThemeCss · the four block shapes a theme uses", () => {
  const scoped = (name: string) =>
    scopeThemeCss(themeCss(name), { selector: defaultScopeSelector(name), name }).css;

  it("`:root` becomes the scope selector", () => {
    expect(scoped("aurora")).toContain('[data-skin="aurora"] {');
  });

  it('`[data-theme="dark"]` becomes the compound, the descendant AND the ancestor form', () => {
    expect(scoped("aurora")).toContain(
      '[data-skin="aurora"][data-theme="dark"],\n[data-skin="aurora"] [data-theme="dark"],\n' +
        '[data-theme="dark"] [data-skin="aurora"]:not([data-theme]) {',
    );
  });

  it("the auto media block is scoped the same way, indentation kept", () => {
    expect(scoped("aurora")).toContain(
      '  [data-skin="aurora"][data-theme="auto"],\n  [data-skin="aurora"] [data-theme="auto"],\n' +
        '  [data-theme="auto"] [data-skin="aurora"]:not([data-theme]) {',
    );
    expect(scoped("aurora")).toContain("@media (prefers-color-scheme: dark) {");
  });

  it("a `:root` inside @media print or @supports is scoped where it stands", () => {
    expect(scoped("document")).toContain('@media print {\n  [data-skin="document"] {');
    expect(scoped("glass")).toContain(
      '(backdrop-filter: blur(1rem))) {\n  [data-skin="glass"] {',
    );
  });

  it("@page is left as authored, and says why", () => {
    const result = scopeThemeCss(themeCss("editorial-document"), {
      selector: '[data-skin="editorial-document"]',
    });
    expect(result.css).toContain("@page {");
    const page = result.untouched.find((skip) => skip.prelude === "@page");
    expect(page?.reason).toContain("printed page");
    expect(page?.line).toBeGreaterThan(0);
  });
});

describe("scopeThemeCss · the scope root re-declares what reset.css puts on :root", () => {
  it("pins a single-scheme theme's one scheme, and lets a dual theme inherit", () => {
    // `light-dark()` reads `color-scheme`. A single-scheme skin has one side to
    // show, so it pins it; a dual skin follows the page around it — SPEC-1.0 §3
    // cascades `data-theme` to every descendant. 1.1 pinned `light` on dual
    // skins too, which kept every island light on a dark page.
    expect(scopeRootScheme(themeCss("luxe"))).toBe("dark");
    expect(scopeRootScheme(themeCss("ink"))).toBe("light");
    expect(scopeRootScheme(themeCss("clinical"))).toBe("inherit"); // "light dark"
    expect(scopeRootScheme(themeCss("aurora"))).toBe("inherit"); // no header, a dark block
    expect(scopeRootScheme(":root { --a: red; }")).toBe("light"); // nothing dark to show
  });

  it("only `luxe` pins dark, and only single-scheme light themes pin light", () => {
    const by = (scheme: string) => THEMES.filter((name) => scopeRootScheme(themeCss(name)) === scheme);
    expect(by("dark")).toEqual(["luxe"]);
    for (const name of by("light")) {
      expect(themeCss(name), `${name} pins light`).toMatch(/@ui:schemes\s+light(?!\s*,?\s*dark)/);
    }
  });

  it("restates the ink, the ground, the face and the material too", () => {
    // Each of these resolves its var() at the element that DECLARES it — reset
    // puts them on `html`/`body`, which an island is not.
    const css = scopeThemeCss(themeCss("midnight"), { selector: ".preview" }).css;
    const root = css.slice(css.indexOf(".preview {"), css.indexOf("}"));
    // Dual, so no color-scheme of its own; a light-only skin pins light.
    expect(root).not.toMatch(/^\s*color-scheme:/m);
    const ink = scopeThemeCss(themeCss("ink"), { selector: ".preview" }).css;
    expect(ink.slice(ink.indexOf(".preview {"), ink.indexOf("}"))).toContain("color-scheme: light;");
    expect(root).toContain("color: var(--color-fg);");
    expect(root).toContain("background-color: var(--color-bg);");
    expect(root).toContain("background-image: var(--texture-page);");
    expect(root).toContain("font-family: var(--font-body);");
  });

  it("a data-theme on the scope root, or around it, picks a dual skin's scheme", () => {
    const selector = defaultScopeSelector("aurora");
    const css = scopeThemeCss(themeCss("aurora"), { selector }).css;
    const attr = selector.slice(1, -1);

    const reset = readFileSync(join(REGISTRY, "base/reset.css"), "utf8");
    const w = new Window();
    try {
      const d = w.document;
      const style = d.createElement("style");
      style.textContent = reset + css;
      d.head.appendChild(style);
      d.body.innerHTML =
        `<div id="both" ${attr} data-theme="dark"></div><div id="skin" ${attr}></div>` +
        `<div data-theme="dark"><div id="in-dark" ${attr}></div>` +
        `<div id="marked-light" ${attr} data-theme="light"></div></div>`;
      // Only what is DECLARED on each element is read here: happy-dom does not
      // inherit `color-scheme`, so the unmarked islands following the page
      // around them is proved in tests/browser/theme-scope.pw.ts.
      const scheme = (id: string) => w.getComputedStyle(d.getElementById(id)!).colorScheme;
      expect(scheme("both")).toBe("dark");
      // An island that says light stays light inside a dark page — reset.css has
      // no light rule, so without the skin's own it inherited dark.
      expect(scheme("marked-light")).toBe("light");
      expect(css).toContain(`${selector}[data-theme="light"] {\n  color-scheme: light;\n}`);
      expect(css).not.toContain(`${selector}[data-theme="dark"] {\n  color-scheme`);
    } finally {
      w.close();
    }
  });

  it("a light-only skin keeps the compound rules that let a data-theme on its root win", () => {
    // reset.css maps `[data-theme="dark"]` to `color-scheme: dark` at (0,1,0) —
    // the scope selector's own specificity — and the skin is linked later, so
    // without the compound rules `<div data-skin="x" data-theme="dark">` kept
    // the pinned `light`.
    const selector = defaultScopeSelector("ink");
    const css = scopeThemeCss(themeCss("ink"), { selector }).css;
    expect(css).toContain(`${selector}[data-theme="dark"] {\n  color-scheme: dark;\n}`);
    expect(css).toContain(`${selector}[data-theme="auto"] {\n  color-scheme: light dark;\n}`);
  });

  it("a dark-only skin needs no scheme rules — its root is dark already", () => {
    const css = scopeThemeCss(themeCss("luxe"), { selector: defaultScopeSelector("luxe") }).css;
    expect(css).not.toContain('[data-skin="luxe"][data-theme="dark"] {\n  color-scheme');
  });

  it("restates the token layer's colour aliases, ahead of the theme's own values", () => {
    // Under a custom selector the token layer's `[data-skin]` block does not
    // match, so the scope root is what makes `--panel-bg` resolve to the skin.
    const css = scopeThemeCss(`:root {\n  --panel-bg: red;\n}\n`, { selector: ".preview" }).css;
    const root = css.slice(css.indexOf(".preview {"));
    for (const [name, value] of SCHEME_ALIASES) expect(root).toContain(`${name}: ${value};`);
    expect(root.lastIndexOf("--panel-bg: var(--color-bg);")).toBeLessThan(root.indexOf("--panel-bg: red;"));
  });

  it("restates them once — a second top-level :root block is only scoped", () => {
    // `paper` declares document tokens in a second `:root` at the end.
    const result = scopeThemeCss(themeCss("paper"), { selector: '[data-skin="paper"]' });
    expect(result.css.split("Restated from base/reset.css")).toHaveLength(2);
    expect(result.rewrites.filter((r) => r.from === ":root")).toHaveLength(2);
  });
});

// ── 2. the CLI surface ──────────────────────────────────────────────────────

describe("faqir theme bundle · the CLI surface", () => {
  let cwd: string;
  let origCwd: string;

  beforeEach(() => {
    origCwd = process.cwd();
    cwd = mkdtempSync(join(tmpdir(), "faqir-theme-bundle-"));
    process.chdir(cwd);
  });

  afterEach(() => {
    process.chdir(origCwd);
    rmSync(cwd, { recursive: true, force: true });
  });

  const read = (rel: string) => readFileSync(join(cwd, rel), "utf8");

  it("writes <name>.scoped.css beside the caller, scoped to the theme's own skin", async () => {
    await theme(["bundle", "aurora", "--scope"]);
    expect(readdirSync(cwd)).toEqual(["aurora.scoped.css"]);
    const css = read("aurora.scoped.css");
    expect(css).toContain('[data-skin="aurora"] {');
    expect(css).not.toContain("\n:root {");
    // Byte-identical to the transform's own output: the command adds nothing.
    expect(css).toBe(
      scopeThemeCss(themeCss("aurora"), {
        selector: '[data-skin="aurora"]',
        name: "aurora",
      }).css,
    );
  });

  it("writes into the project's output dir when there is a project", async () => {
    writeFileSync(
      join(cwd, "faqir.config.json"),
      JSON.stringify({
        version: "1.0.0",
        output_dir: "src/faqir",
        theme: "default",
        installed: { primitives: [], recipes: [], patterns: [] },
      }),
    );
    await theme(["bundle", "midnight", "--scope"]);
    expect(existsSync(join(cwd, "src/faqir/midnight.scoped.css"))).toBe(true);
  });

  it("honours --out", async () => {
    await theme(["bundle", "slate", "--scope", "--out", "dist/skins"]);
    expect(read("dist/skins/slate.scoped.css")).toContain('[data-skin="slate"]');
  });

  it("takes an explicit selector, in both the = and the spaced form", async () => {
    await theme(["bundle", "terminal", "--scope=.brand-preview"]);
    expect(read("terminal.scoped.css")).toContain(".brand-preview {");
    await theme(["bundle", "soft", "--scope", '[data-brand="acme"]', "--out", "b"]);
    expect(read("b/soft.scoped.css")).toContain('[data-brand="acme"] {');
  });

  it("reads a bare word after --scope as the theme name, not a selector", async () => {
    // `faqir theme bundle --scope aurora` is the natural typo; scoping an
    // unnamed theme to a selector spelled `aurora` would be nonsense.
    await theme(["bundle", "--scope", "aurora"]);
    expect(read("aurora.scoped.css")).toContain('[data-skin="aurora"] {');
  });

  it("scopes a theme's print companion too, each to its own skin", async () => {
    await theme(["bundle", "editorial", "--scope"]);
    expect(readdirSync(cwd).sort()).toEqual([
      "editorial-document.scoped.css",
      "editorial.scoped.css",
    ]);
    expect(read("editorial-document.scoped.css")).toContain('[data-skin="editorial-document"] {');
  });

  it("leaves the companion to a second run when the selector is explicit", async () => {
    // One selector names one subtree; giving two themes the same one would make
    // the second silently win.
    await theme(["bundle", "editorial", "--scope=.preview"]);
    expect(readdirSync(cwd)).toEqual(["editorial.scoped.css"]);
  });

  it("resolves a project's own custom theme", async () => {
    mkdirSync(join(cwd, "ui/tokens"), { recursive: true });
    writeFileSync(
      join(cwd, "faqir.config.json"),
      JSON.stringify({
        version: "1.0.0",
        output_dir: "ui",
        theme: "default",
        installed: { primitives: [], recipes: [], patterns: [] },
      }),
    );
    writeFileSync(
      join(cwd, "ui/tokens/theme-acme.css"),
      "/* @ui:theme acme */\n:root {\n  --color-primary: rebeccapurple;\n}\n",
    );
    await theme(["bundle", "acme", "--scope"]);
    expect(read("ui/acme.scoped.css")).toContain('[data-skin="acme"] {');
  });

  it("refuses without --scope, without a name, and for an unknown theme or flag", async () => {
    expect(theme(["bundle", "aurora"])).rejects.toThrow(/--scope/);
    expect(theme(["bundle", "--scope"])).rejects.toThrow(/Theme name required/);
    expect(theme(["bundle", "nope", "--scope"])).rejects.toThrow(/not found/);
    expect(theme(["bundle", "aurora", "--wat"])).rejects.toThrow(/Unknown option/);
    expect(theme(["bundle", "aurora", "--scope="])).rejects.toThrow(/requires a selector/);
    expect(readdirSync(cwd)).toEqual([]);
  });

  it("--help prints the usage and writes nothing", async () => {
    await theme(["bundle", "--help"]);
    expect(readdirSync(cwd)).toEqual([]);
  });
});

describe("faqir theme bundle --json", () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), "faqir-theme-bundle-json-"));
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  it("emits the versioned rewrite report and nothing else", () => {
    const result = runSync(
      process.execPath,
      [SRC_INDEX, "theme", "bundle", "editorial", "--scope", "--json"],
      { cwd, encoding: "utf8", timeout: SPAWN_TIMEOUT.CLI },
    );
    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout ?? "");
    expect(report.json_schema_version).toBe(THEME_BUNDLE_JSON_VERSION);
    expect(report.theme).toBe("editorial");
    expect(report.scope).toBe('[data-skin="editorial"]');
    expect(report.files.map((file: { theme: string }) => file.theme)).toEqual([
      "editorial",
      "editorial-document",
    ]);

    const primary = report.files[0];
    expect(primary.source).toBe("registry/themes/editorial.css");
    expect(primary.path).toBe("editorial.scoped.css");
    // `editorial` is dual: the island follows the page's scheme.
    expect(primary.color_scheme).toBe("inherit");
    expect(primary.tokens).toBeGreaterThan(50);
    expect(primary.rewrites.map((r: { from: string }) => r.from)).toEqual([
      ":root",
      // The aliases a theme re-points on every scheme island (see
      // tests/themes/scheme-islands.test.ts) — scoped like any other list.
      ":root, [data-theme]",
      '[data-theme="dark"]',
      '[data-theme="auto"]',
    ]);
    expect(report.files[1].untouched[0].prelude).toBe("@page");
    expect(report.skipped).toEqual([]);
  });
});

// ── 3. what a browser resolves ──────────────────────────────────────────────

describe("scoped themes render as islands", () => {
  const read = (rel: string) => readFileSync(join(REGISTRY, rel), "utf8");

  /**
   * Every distinct `oklch()` in the page, swapped for a unique hex — the same
   * accommodation 1.1A-02 made, for the same reason: happy-dom's value parser
   * drops a colour function whose arguments are space-separated, so a real theme
   * resolves to `""` under the shim whatever the cascade did. The SELECTORS are
   * untouched, which is the whole subject here; the colours are just labels, and
   * the map is what each assertion compares against, so nothing is hard-coded.
   */
  const hex = new Map<string, string>();
  function hexify(css: string): string {
    return css.replace(/oklch\([^)]*\)/g, (match) => {
      if (!hex.has(match)) hex.set(match, `#${(hex.size + 1).toString(16).padStart(6, "0")}`);
      return hex.get(match)!;
    });
  }

  /** What a theme's `:root` (or `[data-theme="dark"]`) block sets a token to. */
  function tokenValue(name: string, token: string, occurrence = 0): string {
    const defs = extractTokenDefinitions(stripCssComments(themeCss(name))).filter(
      (def) => def.name === token,
    );
    const value = defs[occurrence]?.value;
    expect(value, `${name} declares --${token} at least ${occurrence + 1}×`).toBeDefined();
    return hexify(value!);
  }

  const scoped = (name: string) =>
    hexify(scopeThemeCss(themeCss(name), { selector: defaultScopeSelector(name), name }).css);

  /**
   * A default page — the token layer itself, which is what `default` looks like
   * — with two skins linked after it. happy-dom resolves `var()` chains through
   * the cascade, which is all these cases need; it has no `light-dark()`, so the
   * one-block authoring form is proved in the Playwright spec instead.
   */
  function page() {
    const w = new Window();
    const d = w.document;
    d.head.innerHTML = `<style>
      ${hexify(read("tokens/palette.css"))}
      ${hexify(read("tokens/semantic.css"))}
      ${hexify(read("primitives/badge/badge.css"))}
      ${scoped("aurora")}
      ${scoped("midnight")}
    </style>`;
    d.body.innerHTML = `
      <span id="page-badge" data-ui="badge">page</span>
      <div id="aurora" data-skin="aurora">
        <span id="aurora-badge" data-ui="badge">aurora</span>
        <div id="midnight" data-skin="midnight">
          <span id="midnight-badge" data-ui="badge">midnight</span>
        </div>
        <div id="aurora-dark" data-theme="dark">
          <span id="aurora-dark-badge" data-ui="badge">aurora dark</span>
        </div>
      </div>`;
    const colorOf = (id: string) =>
      w.getComputedStyle(d.getElementById(id)!).getPropertyValue("color");
    return { colorOf, close: () => w.close() };
  }

  it("a component inside a skin resolves that skin's tokens, and the page keeps its own", () => {
    const dom = page();
    try {
      // `--color-fg`, read through the property a badge actually declares.
      const aurora = tokenValue("aurora", "color-fg");
      expect(dom.colorOf("aurora-badge")).toBe(aurora);
      expect(dom.colorOf("aurora")).toBe(aurora);
      // The page around the island still resolves the base token layer.
      expect(dom.colorOf("page-badge")).not.toBe(aurora);
      expect(dom.colorOf("page-badge")).toBe(hexify(read("tokens/palette.css").match(/--palette-gray-950:\s*([^;]+);/)![1].trim()));
    } finally {
      dom.close();
    }
  });

  it("nested skins resolve innermost-first", () => {
    const dom = page();
    try {
      const midnight = tokenValue("midnight", "color-fg");
      expect(dom.colorOf("midnight-badge")).toBe(midnight);
      expect(dom.colorOf("midnight")).toBe(midnight);
      // …and the outer skin is unaffected by the inner one.
      expect(dom.colorOf("aurora-badge")).toBe(tokenValue("aurora", "color-fg"));
      expect(midnight).not.toBe(tokenValue("aurora", "color-fg"));
    } finally {
      dom.close();
    }
  });

  it("a dark page reaches the skin's dark block — the island follows the page", () => {
    // SPEC-1.0 §3: `data-theme` cascades to every descendant. The scoped dark
    // block used to match only the island itself or something inside it, so a
    // dual skin stayed light on a dark page.
    const w = new Window();
    const d = w.document;
    d.head.innerHTML = `<style>${hexify(read("tokens/palette.css"))}${hexify(read("tokens/semantic.css"))}
      ${hexify(read("primitives/badge/badge.css"))}${scoped("aurora")}</style>`;
    d.body.innerHTML = `
      <div data-theme="dark">
        <div data-skin="aurora"><span id="followed" data-ui="badge">a</span></div>
        <div data-skin="aurora" data-theme="light"><span id="marked" data-ui="badge">b</span></div>
      </div>`;
    const colorOf = (id: string) => w.getComputedStyle(d.getElementById(id)!).getPropertyValue("color");
    try {
      expect(colorOf("followed")).toBe(tokenValue("aurora", "color-fg", 1));
      expect(colorOf("marked")).toBe(tokenValue("aurora", "color-fg"));
    } finally {
      w.close();
    }
  });

  it("a data-theme inside the skin resolves the SKIN's dark block, not the page's", () => {
    const dom = page();
    try {
      // The descendant form, at (0,2,0), outranks the page theme's own
      // `[data-theme="dark"]` — whichever order the two sheets are linked in.
      expect(dom.colorOf("aurora-dark-badge")).toBe(tokenValue("aurora", "color-fg", 1));
    } finally {
      dom.close();
    }
  });
});
