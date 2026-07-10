import { beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Task 0.3-04 · Controllers: single source of truth.
// Recipe controllers must live ONLY in registry/recipes/<name>/<name>.js. The
// engine source carries the lone `// @faqir:controllers` marker and no inline
// copy; the build injects the standalone factories at that seam. These tests are
// the drift guard: they fail if the engine ever re-grows an inline controller for
// a recipe that also exists on disk, and they prove the build rejects such drift.

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
const ENGINE_SRC = join(ROOT, "src", "core-src", "engine.js");
const RECIPES_DIR = join(ROOT, "registry", "recipes");
const BUILT_CORE = join(ROOT, "registry", "core", "faqir-core.js");

type Recipe = { name: string; factory: string };

/** Recipes discovered exactly the way scripts/build-core.mjs discovers them. */
function discoverRecipes(): Recipe[] {
  const out: Recipe[] = [];
  for (const dir of readdirSync(RECIPES_DIR).sort()) {
    const abs = join(RECIPES_DIR, dir);
    if (!statSync(abs).isDirectory()) continue;
    const file = join(abs, `${dir}.js`);
    let src: string;
    try {
      src = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    const nameM = src.match(/@ui:controller\s+([A-Za-z0-9_-]+)/);
    const fnM = src.match(/export\s+function\s+([A-Za-z0-9_$]+)\s*\(/);
    if (nameM && fnM) out.push({ name: nameM[1], factory: fnM[1] });
  }
  return out;
}

const RECIPES = discoverRecipes();

// build-core.mjs is plain JS outside tsconfig's include — import via a computed
// specifier so `tsc --noEmit` doesn't try to resolve a .mjs declaration.
type BuildResult = { code: string; controllers: Recipe[]; outPath: string };
let buildCore: (opts?: Record<string, unknown>) => BuildResult;
beforeAll(async () => {
  const mod = (await import(join(ROOT, "scripts", "build-core.mjs"))) as {
    buildCore: typeof buildCore;
  };
  buildCore = mod.buildCore;
});

const tmpDirs: string[] = [];
function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), "faqir-drift-"));
  tmpDirs.push(d);
  return d;
}

describe("controllers: single source of truth", () => {
  test("all 17 recipes are discoverable and tagged @ui:controller", () => {
    expect(RECIPES.map((r) => r.name).sort()).toEqual([
      "accordion",
      "alert-dialog",
      "combobox",
      "command-palette",
      "date-picker",
      "dialog",
      "drawer",
      "dropdown",
      "pagination",
      "popover",
      "qr-code",
      "select-custom",
      "sheet",
      "table",
      "tabs",
      "toast",
      "tooltip",
    ]);
  });

  test("engine source keeps only the @faqir:controllers injection marker", () => {
    const engine = readFileSync(ENGINE_SRC, "utf8");
    expect(engine).toContain("// @faqir:controllers");
  });

  test("engine source carries no inline controller for any registry recipe", () => {
    const engine = readFileSync(ENGINE_SRC, "utf8");
    const esc = (s: string) => s.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
    const offenders: string[] = [];
    for (const { name, factory } of RECIPES) {
      // (a) inline factory definition, (b) static keyed registration,
      // (c) an explicit Faqir.controller('name', …) registration.
      if (new RegExp(`function\\s+${esc(factory)}\\s*\\(`).test(engine)) {
        offenders.push(`${name}: inline factory function ${factory}(`);
      }
      if (new RegExp(`controllerRegistry\\s*\\[\\s*['"]${esc(name)}['"]\\s*\\]\\s*=`).test(engine)) {
        offenders.push(`${name}: static controllerRegistry['${name}'] = …`);
      }
      if (new RegExp(`\\.controller\\s*\\(\\s*['"]${esc(name)}['"]`).test(engine)) {
        offenders.push(`${name}: Faqir.controller('${name}', …)`);
      }
    }
    expect(offenders).toEqual([]);
  });

  test("the build injects every recipe controller into the shipped artifact", () => {
    const built = readFileSync(BUILT_CORE, "utf8");
    for (const { name } of RECIPES) {
      expect(built).toContain(`controllerRegistry[${JSON.stringify(name)}] = (function() {`);
    }
  });

  test("the build REJECTS re-introduced drift (inline copy of a registry controller)", () => {
    // Doctor a copy of the engine so it re-grows an inline `createDialog` — the
    // exact drift this task forbids — then confirm the build refuses to assemble.
    const engine = readFileSync(ENGINE_SRC, "utf8");
    const doctored = engine.replace(
      "// @faqir:controllers",
      "function createDialog(root) { return {}; }\n  // @faqir:controllers",
    );
    const dir = tmp();
    const badEngine = join(dir, "engine.drift.js");
    writeFileSync(badEngine, doctored);

    expect(() =>
      buildCore({ enginePath: badEngine, recipeDirs: [RECIPES_DIR], write: false }),
    ).toThrow(/single-source-of-truth/);
  });

  test("a clean engine assembles without tripping the guard", () => {
    // Sanity floor: the real engine + real recipes must build (no false positive).
    const dir = tmp();
    const { controllers } = buildCore({
      enginePath: ENGINE_SRC,
      recipeDirs: [RECIPES_DIR],
      outPath: join(dir, "faqir-core.built.js"),
      write: true,
    });
    expect(controllers.length).toBe(RECIPES.length);
  });
});

// Bun runs afterAll via the process; clean temp dirs on exit.
process.on("exit", () => {
  for (const d of tmpDirs) rmSync(d, { recursive: true, force: true });
});
