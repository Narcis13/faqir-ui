import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
const REAL_RECIPES = join(ROOT, "registry", "recipes");
const OUT = join(ROOT, "registry", "core", "faqir-core.js");

// scripts/build-core.mjs is plain JS outside tsconfig's include; import it via a
// computed specifier so `tsc --noEmit` doesn't try to resolve a .mjs declaration.
type Controller = { name: string; factory: string; label: string };
type BuildResult = { code: string; controllers: Controller[]; outPath: string };
let buildCore: (opts?: Record<string, unknown>) => BuildResult;

beforeAll(async () => {
  const mod = (await import(join(ROOT, "scripts", "build-core.mjs"))) as {
    buildCore: typeof buildCore;
  };
  buildCore = mod.buildCore;
});

function tick(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

const tmpDirs: string[] = [];
function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), "faqir-build-"));
  tmpDirs.push(d);
  return d;
}
afterAll(() => {
  for (const d of tmpDirs) rmSync(d, { recursive: true, force: true });
  document.body.innerHTML = "";
});

describe("build:core determinism", () => {
  test("two consecutive in-memory builds produce identical bytes", () => {
    const a = buildCore({ write: false }).code;
    const b = buildCore({ write: false }).code;
    expect(a).toBe(b);
    expect(a.length).toBeGreaterThan(50_000);
  });

  test("`bun run build:core` is deterministic and the committed artifact is fresh", () => {
    const before = readFileSync(OUT);

    const r1 = spawnSync("bun", ["run", "build:core"], { cwd: ROOT, encoding: "utf8" });
    expect(r1.status).toBe(0);
    const after1 = readFileSync(OUT);

    const r2 = spawnSync("bun", ["run", "build:core"], { cwd: ROOT, encoding: "utf8" });
    expect(r2.status).toBe(0);
    const after2 = readFileSync(OUT);

    // Byte-stable across builds …
    expect(after1.equals(after2)).toBe(true);
    // … and the checked-in file is already the assembly output (not stale).
    expect(after1.equals(before)).toBe(true);
  });
});

describe("build:core provenance header", () => {
  test("carries version + build inputs and no wall-clock timestamp", () => {
    const { code } = buildCore({ write: false });
    expect(code).toContain("GENERATED FILE — DO NOT EDIT BY HAND");
    expect(code).toContain("scripts/build-core.mjs");
    expect(code).toContain("src/core-src/engine.js");
    expect(code).toMatch(/Package version: \d+\.\d+\.\d+/);
    // A timestamp would break byte-stability; the header must not carry one.
    expect(code).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
  });
});

describe("build:core controller discovery", () => {
  test("assembles every standalone recipe controller as a collision-safe IIFE", () => {
    const { code, controllers } = buildCore({ write: false });
    const names = controllers.map((c) => c.name);

    // qr-code lives only as a standalone recipe file — it was never inlined into
    // the hand-maintained core, so its presence proves auto-discovery works.
    expect(names).toContain("qr-code");
    expect(names).toContain("dialog");

    // Each controller registers via a self-contained IIFE (private module scope).
    expect(code).toContain(`controllerRegistry["dialog"] = (function() {`);
    expect(code).toContain(`controllerRegistry["qr-code"] = (function() {`);

    // Deterministic, sorted-by-name order.
    expect([...names]).toEqual([...names].sort());

    // Module plumbing must not leak into the UMD bundle.
    const block = code.slice(code.indexOf(`controllerRegistry["accordion"]`));
    expect(block).not.toMatch(/^\s*import\s/m);
    expect(block).not.toMatch(/^\s*export\s+(function|const|let|var|class)\b/m);
  });
});

describe("build:core assembled artifact", () => {
  // Build one artifact that augments the real recipes with a temp-only fixture
  // recipe, then load it once and exercise it.
  let Faqir: any;

  beforeAll(() => {
    const fixtureRoot = tmp();
    const recipe = join(fixtureRoot, "fixture-widget");
    mkdirSync(recipe);
    writeFileSync(
      join(recipe, "fixture-widget.js"),
      [
        "// @ui:controller fixture-widget",
        "// @ui:provides destroy",
        "export function createFixtureWidget(root) {",
        "  if (root._faqirFixtureWidget) return root._faqirFixtureWidget;",
        "  root.dataset.ready = 'yes';",
        "  const api = { destroy() { delete root._faqirFixtureWidget; } };",
        "  root._faqirFixtureWidget = api;",
        "  return api;",
        "}",
        "",
      ].join("\n"),
    );

    const outPath = join(fixtureRoot, "faqir-core.built.js");
    const { controllers } = buildCore({
      recipeDirs: [REAL_RECIPES, fixtureRoot],
      outPath,
      write: true,
    });
    expect(controllers.map((c) => c.name)).toContain("fixture-widget");

    Faqir = require(outPath);
  });

  test("loads as a UMD module and exposes the engine API", () => {
    expect(typeof Faqir).toBe("object");
    expect(Faqir.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(typeof Faqir.reactive).toBe("function");
    expect(typeof Faqir.start).toBe("function");
  });

  test("auto-initializes a controller present only as a standalone file", () => {
    document.body.innerHTML = `<div id="fw" data-ui="fixture-widget"></div>`;
    Faqir.start();
    const el = document.getElementById("fw")!;
    expect(el.dataset.ready).toBe("yes");
    document.body.innerHTML = "";
  });

  test("assembled engine still drives l-data reactivity", async () => {
    document.body.innerHTML = `
      <div l-data="{ n: 1 }">
        <span l-text="n"></span>
        <button l-on:click="n++"></button>
      </div>`;
    Faqir.start();
    await tick();
    const span = document.querySelector("span")!;
    expect(span.textContent).toBe("1");
    document.querySelector("button")!.click();
    await tick();
    expect(span.textContent).toBe("2");
    document.body.innerHTML = "";
  });

  test("an inlined recipe controller (dialog) drives its component", () => {
    document.body.innerHTML = `
      <div id="d" data-ui="dialog" data-state="closed">
        <button data-part="trigger"></button>
        <div data-part="overlay" hidden></div>
        <div data-part="panel" hidden tabindex="-1"></div>
      </div>`;
    Faqir.start();
    const root = document.getElementById("d")!;
    (document.querySelector("[data-part='trigger']") as HTMLElement).click();
    expect(root.dataset.state).toBe("open");
    document.body.innerHTML = "";
  });
});
