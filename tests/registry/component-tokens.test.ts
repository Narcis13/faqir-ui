/**
 * Component token metadata gate (task 1.1F-15).
 *
 * Three lists name a component's tokens — the CSS it reads, the manifest's
 * `tokens_used`, the stylesheet's `@ui:tokens` header — and until this task no
 * gate compared them: at v1.1.1, 65 of 86 manifests and 70 headers disagreed
 * with their own CSS. `bun run gen:component-tokens` now derives both lists from
 * the CSS; gate 8 of `scripts/registry-audit.mjs` and `check:component-tokens`
 * keep them derived. The rules are in `src/component-tokens.ts`.
 */
import { describe, it, expect } from "bun:test";
import { Glob } from "bun";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  checkComponentTokens,
  deriveTokensUsed,
  directTokenRefs,
  readCssTokensHeader,
  readTokenLayer,
  reachableTokens,
  writeCssTokensHeader,
  writeManifestTokensUsed,
  type ComponentTokenInput,
} from "../../src/component-tokens";
import { runSyncBun, SPAWN_TIMEOUT } from "../helpers/spawn";

const ROOT = join(import.meta.dir, "../..");
const REGISTRY = join(ROOT, "registry");
const TOKENS_DIR = join(REGISTRY, "tokens");

const LAYER = readTokenLayer(
  [...new Glob("*.css").scanSync(TOKENS_DIR)].sort().map((f) => readFileSync(join(TOKENS_DIR, f), "utf8")),
);

function components(): ComponentTokenInput[] {
  return ["primitives", "recipes", "patterns"].flatMap((dir) =>
    [...new Glob(`${dir}/*/*.manifest.json`).scanSync(REGISTRY)].sort().flatMap((rel) => {
      const manifestText = readFileSync(join(REGISTRY, rel), "utf8");
      const manifest = JSON.parse(manifestText);
      const cssRel = join(dirname(rel), manifest.files?.css ?? `${manifest.name}.css`);
      if (!existsSync(join(REGISTRY, cssRel))) return [];
      return [{
        name: manifest.name,
        manifestRel: rel,
        manifestText,
        tokensUsed: manifest.tokens_used,
        cssRel,
        css: readFileSync(join(REGISTRY, cssRel), "utf8"),
      }];
    }),
  );
}

const ALL = components();
const byName = (layerDir: string, name: string) =>
  ALL.find((c) => c.manifestRel.startsWith(`${layerDir}/${name}/`))!;

describe("the regenerated registry", () => {
  it("passes the gate: every component's three lists agree", () => {
    expect(ALL.length).toBe(105);
    const findings = ALL.flatMap((c) => checkComponentTokens(c, LAYER));
    expect(findings).toEqual([]);
  });

  it("is a fixed point of the generator", () => {
    for (const c of ALL) {
      const again = deriveTokensUsed(c.tokensUsed, directTokenRefs(c.css, LAYER.defined), LAYER);
      expect(again, c.name).toEqual(c.tokensUsed);
    }
  });

  it("`check:component-tokens` is green", () => {
    const run = runSyncBun(["bun", "scripts/gen-component-tokens.mjs", "--check"], {
      cwd: ROOT,
      timeout: SPAWN_TIMEOUT.CLI,
    });
    expect(run.stderr.toString()).toBe("");
    expect(run.exitCode).toBe(0);
  });

  it("is wired into the registry audit (the release preflight is release.test.ts's check)", () => {
    expect(readFileSync(join(ROOT, "scripts/registry-audit.mjs"), "utf8")).toContain("checkComponentTokens");
  });
});

describe("the gate", () => {
  it("fails a planted undeclared token with the stylesheet and line", () => {
    const badge = byName("primitives", "badge");
    expect(badge.tokensUsed).not.toContain("space-16");
    const lines = badge.css.split("\n");
    const at = lines.findIndex((l) => l.startsWith('[data-ui="badge"]')) + 1;
    lines.splice(at, 0, "  margin-block: var(--space-16);");
    const findings = checkComponentTokens({ ...badge, css: lines.join("\n") }, LAYER);
    expect(findings).toEqual([
      {
        file: "primitives/badge/badge.css",
        line: at + 1,
        kind: "undeclared",
        message: "var(--space-16) is not in badge's tokens_used",
      },
    ]);
  });

  it("names `space-9` nowhere: a name the token layer lacks is gate 4's dangling ref, not a tokens_used entry", () => {
    // The plan's example plant, `var(--space-9)`, is not a token. Declaring it in
    // tokens_used would not fix anything, so this gate leaves it to gate 4.
    expect(LAYER.defined.has("space-9")).toBe(false);
    expect(directTokenRefs("a { gap: var(--space-9); }", LAYER.defined)).toEqual([]);
  });

  it("fails a planted stale entry with the manifest and line", () => {
    const badge = byName("primitives", "badge");
    expect(badge.css).not.toContain("--shadow-lg");
    const tokensUsed = [...badge.tokensUsed, "shadow-lg"];
    const manifestText = writeManifestTokensUsed(badge.manifestText, tokensUsed);
    const css = writeCssTokensHeader(badge.css, "badge", tokensUsed);
    const findings = checkComponentTokens({ ...badge, manifestText, tokensUsed, css }, LAYER);
    const line = manifestText.split("\n").findIndex((l) => l.includes('"shadow-lg"')) + 1;
    expect(findings).toEqual([
      {
        file: "primitives/badge/badge.manifest.json",
        line,
        kind: "stale",
        message: '"shadow-lg" is in tokens_used but primitives/badge/badge.css never reads it, directly or through an alias',
      },
    ]);
  });

  it("accepts `color-ring` reached only through `--focus-ring-color`", () => {
    expect(reachableTokens(["focus-ring-color"], LAYER).has("color-ring")).toBe(true);
    const css = '/* @ui:component x */\n/* @ui:tokens focus-ring-color color-ring */\n[data-ui="x"] { outline-color: var(--focus-ring-color); }';
    const input = {
      name: "x", manifestRel: "x.manifest.json", manifestText: '{ "tokens_used": ["focus-ring-color", "color-ring"] }',
      tokensUsed: ["focus-ring-color", "color-ring"], cssRel: "x.css", css,
    };
    expect(checkComponentTokens(input, LAYER)).toEqual([]);
    // …and the registry still carries it that way somewhere.
    const viaAlias = ALL.filter(
      (c) => c.tokensUsed.includes("color-ring") && !directTokenRefs(c.css, LAYER.defined).some((r) => r.name === "color-ring"),
    );
    expect(viaAlias.length).toBeGreaterThan(0);
  });

  it("reports a header that drifted from tokens_used, and a missing one", () => {
    const badge = byName("primitives", "badge");
    const reordered = writeCssTokensHeader(badge.css, "badge", [...badge.tokensUsed].reverse());
    expect(checkComponentTokens({ ...badge, css: reordered }, LAYER)).toEqual([
      { file: "primitives/badge/badge.css", line: 2, kind: "header", message: "the @ui:tokens header differs from badge's tokens_used" },
    ]);
    const headerless = badge.css.replace(/\/\* @ui:tokens [^*]*\*\/\n/, "");
    expect(checkComponentTokens({ ...badge, css: headerless }, LAYER).map((f) => f.kind)).toEqual(["header"]);
  });

  it("reports a duplicated entry", () => {
    const input = {
      name: "x", manifestRel: "x.manifest.json", manifestText: '{ "tokens_used": ["space-2", "space-2"] }',
      tokensUsed: ["space-2", "space-2"], cssRel: "x.css",
      css: "/* @ui:tokens space-2 space-2 */\na { gap: var(--space-2); }",
    };
    expect(checkComponentTokens(input, LAYER).map((f) => f.kind)).toEqual(["duplicate"]);
  });
});

describe("reading the CSS", () => {
  it("counts a nested fallback and ignores comments, local knobs and author knobs", () => {
    const css = [
      "/* var(--space-16) in a comment */",
      "a {",
      "  --x-gap: var(--space-2);",
      "  gap: var(--x-gap);",
      "  outline-color: var(--focus-ring-color, var(--color-ring));",
      "  inline-size: var(--author-width, 10rem);",
      "}",
    ].join("\n");
    expect(directTokenRefs(css, LAYER.defined)).toEqual([
      { name: "space-2", line: 3 },
      { name: "focus-ring-color", line: 5 },
      { name: "color-ring", line: 5 },
    ]);
  });

  it("groups the derived list by family, keeps existing order, appends new reads, drops the unreachable", () => {
    const css = "a { color: var(--color-fg); gap: var(--space-2); padding: var(--space-4); border-color: var(--color-border); }";
    const derived = deriveTokensUsed(["space-4", "shadow-lg", "color-fg"], directTokenRefs(css, LAYER.defined), LAYER);
    expect(derived).toEqual(["space-4", "space-2", "color-fg", "color-border"]);
  });

  it("parses the icon sheet's empty header as an empty list", () => {
    const icon = byName("primitives", "icon");
    expect(readCssTokensHeader(icon.css)).toEqual([]);
    expect(icon.tokensUsed).toEqual([]);
  });
});

describe("writing the files", () => {
  it("rewrites only the tokens_used array of a manifest", () => {
    const text = '{\n  "name": "x",\n  "tokens_used": ["a"],\n  "files": {}\n}\n';
    const out = writeManifestTokensUsed(text, ["space-2", "space-4", "color-fg"]);
    expect(out).toBe('{\n  "name": "x",\n  "tokens_used": [\n    "space-2", "space-4", "color-fg"\n  ],\n  "files": {}\n}\n');
    expect(JSON.parse(out).tokens_used).toEqual(["space-2", "space-4", "color-fg"]);
    expect(writeManifestTokensUsed(text, [])).toBe('{\n  "name": "x",\n  "tokens_used": [],\n  "files": {}\n}\n');
  });

  it("keeps a JSON.stringify-formatted manifest in that form (build:manifest-api byte-compares it)", () => {
    const manifest = { name: "x", tokens_used: ["a"], api: { methods: [] } };
    const text = `${JSON.stringify(manifest, null, 2)}\n`;
    const out = writeManifestTokensUsed(text, ["space-2", "color-fg"]);
    expect(out).toBe(`${JSON.stringify({ ...manifest, tokens_used: ["space-2", "color-fg"] }, null, 2)}\n`);
  });

  it("wraps a long list before 100 columns", () => {
    const tokens = Array.from({ length: 20 }, (_, i) => `color-token-${i}`);
    const out = writeManifestTokensUsed('{\n  "tokens_used": []\n}', tokens);
    for (const line of out.split("\n")) expect(line.length).toBeLessThan(100);
    expect(JSON.parse(out).tokens_used).toEqual(tokens);
  });

  it("writes the header in place, after @ui:component, or as a new header", () => {
    expect(writeCssTokensHeader("/* @ui:component x */\n/* @ui:tokens a */\nb{}", "x", ["c", "d"])).toBe(
      "/* @ui:component x */\n/* @ui:tokens c d */\nb{}",
    );
    expect(writeCssTokensHeader("/* @ui:component x */\nb{}", "x", ["c"])).toBe(
      "/* @ui:component x */\n/* @ui:tokens c */\nb{}",
    );
    expect(writeCssTokensHeader("/* prose */\nb{}", "x", ["c"])).toBe(
      "/* @ui:component x */\n/* @ui:tokens c */\n/* prose */\nb{}",
    );
  });
});
