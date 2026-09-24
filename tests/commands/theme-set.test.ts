// faqir theme set / list / bundle — finding a theme, and what setting one says
//
// Four promises the 1.1 release review found broken, each pinned here:
//
//   1. A theme `theme generate` wrote is usable by name. It lands in
//      `themes/<name>.css`, and `set`, `list` and `bundle` used to look only in
//      the registry and in `theme create`'s `tokens/theme-<name>.css` — so the
//      README's "`theme list` shows every registry and project theme" was false
//      the moment a user generated one.
//   2. A theme name is a path segment, so it is validated before it is joined
//      onto anything: `theme bundle ../../x --scope` wrote outside `--out`, and
//      `theme set ../../x` saved the traversal into the config.
//   3. `--out` is resolved, not glued: an absolute path is honoured as given,
//      and a relative one may not climb out of the project.
//   4. `theme set` says what it cannot apply — the density a theme declares in
//      its `@ui:density` header, and the self-hosted faces its manifest names —
//      and refreshes `.faqir/context.json` when one exists.

import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveOutDir, theme, themeSetHints } from "../../src/commands/theme";
import type { ThemeManifest } from "../../src/theme-manifest";

const REGISTRY_THEMES = join(import.meta.dir, "../../registry/themes");

function writeProject(cwd: string, theme = "default"): void {
  writeFileSync(
    join(cwd, "faqir.config.json"),
    JSON.stringify({
      version: "1.0.0",
      output_dir: "ui",
      theme,
      installed: { primitives: [], recipes: [], patterns: [] },
    }),
  );
  mkdirSync(join(cwd, "ui/tokens"), { recursive: true });
}

/** Run `fn` with console.log captured; returns everything it printed, colour stripped. */
async function captured(fn: () => Promise<void>): Promise<string> {
  const lines: string[] = [];
  const spy = spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    lines.push(args.map(String).join(" "));
  });
  try {
    await fn();
  } finally {
    spy.mockRestore();
  }
  // eslint-disable-next-line no-control-regex
  return lines.join("\n").replace(/\x1b\[[0-9;]*m/g, "");
}

describe("theme set / list / bundle · a generated theme is a theme", () => {
  let cwd: string;
  let origCwd: string;

  beforeEach(() => {
    origCwd = process.cwd();
    cwd = mkdtempSync(join(tmpdir(), "faqir-theme-set-"));
    process.chdir(cwd);
    writeProject(cwd);
  });

  afterEach(() => {
    process.chdir(origCwd);
    rmSync(cwd, { recursive: true, force: true });
  });

  const read = (rel: string) => readFileSync(join(cwd, rel), "utf8");

  it("sets a theme from themes/ by name, exactly as generate wrote it", async () => {
    await captured(() => theme(["generate", "acme", "--accent", "#168c5b", "--document"]));
    const out = await captured(() => theme(["set", "acme"]));
    expect(read("ui/tokens/theme.css")).toBe(read("themes/acme.css"));
    expect(JSON.parse(read("faqir.config.json")).theme).toBe("acme");
    expect(out).toContain("from themes/acme.css");
  });

  it("lists generated themes, without their scoped derivatives or shadowed names", async () => {
    await captured(() => theme(["generate", "acme", "--accent", "#168c5b", "--document"]));
    // A scoped bundle written into the same folder is not a theme…
    await captured(() => theme(["bundle", "acme", "--scope", "--out", "themes"]));
    expect(existsSync(join(cwd, "themes/acme.scoped.css"))).toBe(true);
    // …and a generated file that shadows a registry name is listed once, where
    // `set` resolves it (the registry).
    writeFileSync(join(cwd, "themes/aurora.css"), ":root { --color-primary: red; }\n");

    const out = await captured(() => theme(["list"]));
    const generated = out.slice(out.indexOf("Generated (themes/):"));
    expect(generated).toContain("acme");
    expect(generated).toContain("acme-document");
    expect(generated).not.toContain("scoped");
    expect(generated).not.toContain("aurora");
  });

  it("marks a generated theme active once it is set", async () => {
    await captured(() => theme(["generate", "acme", "--accent", "#168c5b"]));
    await captured(() => theme(["set", "acme"]));
    const out = await captured(() => theme(["list"]));
    expect(out).toContain("✓ acme (active)");
  });

  it("bundles a generated theme and its print companion", async () => {
    await captured(() => theme(["generate", "acme", "--accent", "#168c5b", "--document"]));
    await captured(() => theme(["bundle", "acme", "--scope", "--out", "skins"]));
    expect(readdirSync(join(cwd, "skins")).sort()).toEqual(["acme-document.scoped.css", "acme.scoped.css"]);
    expect(read("skins/acme.scoped.css")).toContain('[data-skin="acme"]');
  });

  it("still prefers the registry, then the project's own theme-<name>.css", async () => {
    writeFileSync(join(cwd, "ui/tokens/theme-mine.css"), ":root { --color-primary: rebeccapurple; }\n");
    mkdirSync(join(cwd, "themes"));
    writeFileSync(join(cwd, "themes/mine.css"), ":root { --color-primary: red; }\n");
    await captured(() => theme(["set", "mine"]));
    expect(read("ui/tokens/theme.css")).toContain("rebeccapurple");
  });
});

describe("theme set / bundle / create · a theme name is not a path", () => {
  let cwd: string;
  let origCwd: string;

  beforeEach(() => {
    origCwd = process.cwd();
    cwd = mkdtempSync(join(tmpdir(), "faqir-theme-name-"));
    process.chdir(cwd);
    writeProject(cwd);
  });

  afterEach(() => {
    process.chdir(origCwd);
    rmSync(cwd, { recursive: true, force: true });
  });

  it("refuses a traversal before touching the disk or the config", async () => {
    const before = readFileSync(join(cwd, "faqir.config.json"), "utf8");
    await expect(theme(["set", "../../x"])).rejects.toThrow(/Invalid theme name '\.\.\/\.\.\/x'/);
    await expect(theme(["bundle", "../../x", "--scope"])).rejects.toThrow(/Invalid theme name/);
    await expect(theme(["create", "../x"])).rejects.toThrow(/Invalid theme name/);
    await expect(theme(["set", "Aurora"])).rejects.toThrow(/lowercase kebab-case/);
    expect(readFileSync(join(cwd, "faqir.config.json"), "utf8")).toBe(before);
    expect(readdirSync(join(cwd, "ui/tokens"))).toEqual([]);
  });

  it("throws rather than exiting, so the CLI's one error path reports it", async () => {
    await expect(theme(["set"])).rejects.toThrow(/Theme name required/);
    await expect(theme(["set", "nope"])).rejects.toThrow(/Theme 'nope' not found/);
    await expect(theme(["wat"])).rejects.toThrow(/Unknown subcommand: wat/);
    rmSync(join(cwd, "faqir.config.json"));
    await expect(theme(["set", "aurora"])).rejects.toThrow(/faqir init/);
  });
});

describe("--out · resolved, and contained unless it is absolute", () => {
  let cwd: string;
  let outside: string;
  let origCwd: string;

  beforeEach(() => {
    origCwd = process.cwd();
    cwd = mkdtempSync(join(tmpdir(), "faqir-theme-out-"));
    outside = mkdtempSync(join(tmpdir(), "faqir-theme-out-abs-"));
    process.chdir(cwd);
  });

  afterEach(() => {
    process.chdir(origCwd);
    rmSync(cwd, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  });

  it("resolveOutDir honours an absolute path and refuses a relative escape", () => {
    expect(resolveOutDir("/p/q", "themes")).toBe("/p/q/themes");
    expect(resolveOutDir("/p/q", "a/../b")).toBe("/p/q/b");
    expect(resolveOutDir("/p/q", "/abs/dir")).toBe("/abs/dir");
    expect(() => resolveOutDir("/p/q", "../x")).toThrow(/Refusing to write outside the project/);
    expect(() => resolveOutDir("/p/q", "a/../../x")).toThrow(/outside the project/);
  });

  it("theme generate writes to an absolute --out, not to <cwd>/<abs>", async () => {
    await captured(() => theme(["generate", "abs", "--accent", "#2563eb", "--out", outside]));
    expect(existsSync(join(outside, "abs.css"))).toBe(true);
    expect(existsSync(join(outside, "abs.seed.json"))).toBe(true);
    expect(readdirSync(cwd)).toEqual([]);
  });

  it("theme generate and bundle refuse a relative --out that climbs out, writing nothing", async () => {
    await expect(theme(["generate", "esc", "--accent", "#2563eb", "--out", "../escape"]))
      .rejects.toThrow(/Refusing to write outside the project/);
    await expect(theme(["bundle", "aurora", "--scope", "--out", "../escape"]))
      .rejects.toThrow(/Refusing to write outside the project/);
    expect(readdirSync(cwd)).toEqual([]);
  });

  it("theme bundle writes to an absolute --out", async () => {
    await captured(() => theme(["bundle", "aurora", "--scope", "--out", outside]));
    expect(existsSync(join(outside, "aurora.scoped.css"))).toBe(true);
  });
});

describe("theme set · says what it cannot apply", () => {
  let cwd: string;
  let origCwd: string;

  beforeEach(() => {
    origCwd = process.cwd();
    cwd = mkdtempSync(join(tmpdir(), "faqir-theme-hints-"));
    process.chdir(cwd);
    writeProject(cwd);
  });

  afterEach(() => {
    process.chdir(origCwd);
    rmSync(cwd, { recursive: true, force: true });
  });

  it("prints the data-density a theme's @ui:density header asks for", async () => {
    // editorial is designed spacious, slate compact; default declares none.
    const editorial = await captured(() => theme(["set", "editorial"]));
    expect(editorial).toContain('data-density="spacious"');
    const slate = await captured(() => theme(["set", "slate"]));
    expect(slate).toContain('data-density="compact"');
    const plain = await captured(() => theme(["set", "default"]));
    expect(plain).not.toContain("data-density");
  });

  it("stays quiet about a comfortable density, which is what a page already renders", () => {
    expect(themeSetHints("/* @ui:density comfortable */\n:root {}", null)).toEqual([]);
    expect(themeSetHints(":root {}", null)).toEqual([]);
  });

  it("names `faqir fonts add` for every catalogued face the manifest declares, one command per family", () => {
    const manifest = {
      fonts: [
        { family: "Fraunces", license: "OFL-1.1", role: "heading", source: "fraunces" },
        { family: "Inter", license: "OFL-1.1", role: "body", source: "inter" },
        { family: "Inter", license: "OFL-1.1", role: "ui", source: "inter" },
        // A family the catalog does not carry has no command to suggest.
        { family: "Not A Font", license: "OFL-1.1", role: "mono" },
      ],
    } as unknown as ThemeManifest;
    expect(themeSetHints(":root {}", manifest)).toEqual([
      "Designed for a self-hosted face — run: faqir fonts add fraunces --role heading",
      "Designed for a self-hosted face — run: faqir fonts add inter --role body --role ui",
    ]);
  });

  it("reads the fonts off the manifest beside the stylesheet it set", async () => {
    // The registry manifests carry `fonts` once gen:theme-manifests has run
    // over the editorial seed; a generated theme's manifest is the other
    // place one lives, so the lookup is proven there without depending on it.
    await captured(() => theme(["generate", "acme", "--accent", "#168c5b"]));
    const path = join(cwd, "themes/acme.theme.json");
    const manifest = JSON.parse(readFileSync(path, "utf8"));
    manifest.fonts = [{ family: "JetBrains Mono", license: "OFL-1.1", role: "mono", source: "jetbrains-mono" }];
    writeFileSync(path, JSON.stringify(manifest));
    const out = await captured(() => theme(["set", "acme"]));
    expect(out).toContain("faqir fonts add jetbrains-mono --role mono");
  });

  it("the registry's designed-for faces all resolve in the font catalog", () => {
    // Guard for the editorial seed in scripts/gen-theme-manifests.mjs: once
    // the manifests are regenerated, every `fonts` entry must turn into a hint.
    for (const file of readdirSync(REGISTRY_THEMES).filter((f) => f.endsWith(".theme.json"))) {
      const manifest = JSON.parse(readFileSync(join(REGISTRY_THEMES, file), "utf8")) as ThemeManifest;
      const fonts = manifest.fonts ?? [];
      const hints = themeSetHints(":root {}", manifest);
      expect(hints.length, file).toBe(new Set(fonts.map((f) => f.source)).size);
    }
  });

  it("refreshes .faqir/context.json when one exists, and creates none when it does not", async () => {
    await captured(() => theme(["set", "midnight"]));
    expect(existsSync(join(cwd, ".faqir/context.json"))).toBe(false);

    mkdirSync(join(cwd, ".faqir"));
    writeFileSync(join(cwd, ".faqir/context.json"), JSON.stringify({ meta: { theme: "midnight" } }));
    await captured(() => theme(["set", "slate"]));
    expect(JSON.parse(readFileSync(join(cwd, ".faqir/context.json"), "utf8")).meta.theme).toBe("slate");
  });
});
