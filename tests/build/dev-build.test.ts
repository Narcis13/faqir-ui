/**
 * The two-build seam: `faqir-core.js` (production) and `faqir-core.dev.js`
 * (development) are assembled from ONE engine source.  [task 0.7-12]
 *
 * The load-bearing claim this file defends: not one dev-only message string
 * reaches the production engine. It is checked by DERIVING the string list from
 * src/core-src/dev-diagnostics.js rather than hand-listing it, so a new
 * diagnostic cannot be added without the gate covering it.
 */
import { beforeAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
const PROD = join(ROOT, "registry", "core", "faqir-core.js");
const DEV = join(ROOT, "registry", "core", "faqir-core.dev.js");
const ENGINE_SRC = join(ROOT, "src", "core-src", "engine.js");
const DIAGNOSTICS_SRC = join(ROOT, "src", "core-src", "dev-diagnostics.js");

type BuildResult = { code: string; controllers: unknown[]; outPath: string; dev: boolean };
let buildCore: (opts?: Record<string, unknown>) => BuildResult;
let applyDevMarkers: (source: string, dev: boolean) => string;
let DEV_LINE: string;
let DEV_START: string;
let DEV_END: string;

beforeAll(async () => {
  const mod = (await import(join(ROOT, "scripts", "build-core.mjs"))) as any;
  buildCore = mod.buildCore;
  applyDevMarkers = mod.applyDevMarkers;
  DEV_LINE = mod.DEV_LINE;
  DEV_START = mod.DEV_START;
  DEV_END = mod.DEV_END;
});

const prod = () => readFileSync(PROD, "utf8");
const dev = () => readFileSync(DEV, "utf8");

/**
 * Every distinctive string literal the diagnostics module can print. Comments
 * are stripped first so prose about a warning is not mistaken for the warning.
 */
function devOnlyStrings(): string[] {
  const source = readFileSync(DIAGNOSTICS_SRC, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  const found = new Set<string>();
  for (const m of source.matchAll(/'((?:[^'\\]|\\.)*)'/g)) {
    const literal = m[1];
    if (literal.length >= 12) found.add(literal);
  }
  return [...found].sort();
}

describe("applyDevMarkers", () => {
  test("drops a marked line for production and keeps it (marker gone) for dev", () => {
    const src = ["keep();", `  ${DEV_LINE} devOnly();`, "keep2();"].join("\n");
    expect(applyDevMarkers(src, false)).toBe("keep();\nkeep2();");
    expect(applyDevMarkers(src, true)).toBe("keep();\n  devOnly();\nkeep2();");
  });

  test("drops a marked region for production and keeps its body for dev", () => {
    const src = ["a();", DEV_START, "  x();", "  y();", DEV_END, "b();"].join("\n");
    expect(applyDevMarkers(src, false)).toBe("a();\nb();");
    expect(applyDevMarkers(src, true)).toBe("a();\n  x();\n  y();\nb();");
  });

  test("markers are removed from BOTH builds — they never survive as code", () => {
    const src = [DEV_START, "x();", DEV_END, `${DEV_LINE} y();`].join("\n");
    for (const isDev of [true, false]) {
      const out = applyDevMarkers(src, isDev);
      expect(out).not.toContain(DEV_START);
      expect(out).not.toContain(DEV_END);
      expect(out).not.toContain(DEV_LINE);
    }
  });

  test("nested regions are handled", () => {
    const src = [DEV_START, "a();", DEV_START, "b();", DEV_END, "c();", DEV_END, "d();"].join("\n");
    expect(applyDevMarkers(src, false)).toBe("d();");
    expect(applyDevMarkers(src, true)).toBe("a();\nb();\nc();\nd();");
  });

  test("an unbalanced region is a build error, not a silent mis-strip", () => {
    expect(() => applyDevMarkers([DEV_START, "x();"].join("\n"), false)).toThrow(/unterminated/);
    expect(() => applyDevMarkers(["x();", DEV_END].join("\n"), false)).toThrow(/without a matching/);
  });
});

describe("the production engine is byte-free of dev-only strings", () => {
  test("the diagnostics module contributes real strings to check against", () => {
    const strings = devOnlyStrings();
    expect(strings.length).toBeGreaterThanOrEqual(8);
    // Sanity: the four warning-class messages are among them.
    expect(strings.some((s) => s.includes("Unknown directive"))).toBe(true);
    expect(strings.some((s) => s.includes("reordered without l-key"))).toBe(true);
    expect(strings.some((s) => s.includes("unsanitized"))).toBe(true);
    expect(strings.some((s) => s.includes("[Faqir dev]"))).toBe(true);
  });

  test("not one of them appears in registry/core/faqir-core.js", () => {
    const code = prod();
    for (const literal of devOnlyStrings()) {
      expect(code.includes(literal)).toBe(false);
    }
  });

  test("all of them appear in registry/core/faqir-core.dev.js", () => {
    const code = dev();
    for (const literal of devOnlyStrings()) {
      expect(code.includes(literal)).toBe(true);
    }
  });

  test("the diagnostics implementation itself is absent from production", () => {
    const code = prod();
    expect(code).not.toContain("devReport");
    expect(code).not.toContain("devSnippet");
    expect(code).not.toContain("@ui:core dev-diagnostics");
    expect(dev()).toContain("devReport");
  });

  test("dev-only engine code is stripped too (the reorder detector)", () => {
    expect(prod()).not.toContain("function isReorder");
    expect(dev()).toContain("function isReorder");
  });

  test("no guarded call site survives — production never even tests devHooks", () => {
    // The one legitimate mention is the devtools handle's `warnings()`, which
    // must keep working (and returning []) in production.
    const mentions = prod().split("\n").filter((l) => /\bdevHooks\b/.test(l) && !/^\s*\/\//.test(l));
    expect(mentions.length).toBe(2); // `var devHooks = null;` + warnings()
    expect(mentions.some((l) => l.includes("var devHooks = null"))).toBe(true);
    expect(mentions.some((l) => l.includes("warnings"))).toBe(true);
  });
});

describe("both builds are assembled from one source", () => {
  test("the engine source carries the dev-diagnostics marker", () => {
    expect(readFileSync(ENGINE_SRC, "utf8")).toContain("// @faqir:dev-diagnostics");
  });

  test("the committed dev artifact is fresh and deterministic", () => {
    const a = buildCore({ dev: true, write: false });
    const b = buildCore({ dev: true, write: false });
    expect(a.code).toBe(b.code);
    expect(a.dev).toBe(true);
    expect(a.code).toBe(dev());
  });

  test("the committed production artifact is unchanged by the dev target", () => {
    const res = buildCore({ write: false });
    expect(res.dev).toBe(false);
    expect(res.code).toBe(prod());
  });

  test("`bun run build:core` writes both files and reports the dev size", () => {
    const r = spawnSync("bun", ["run", "build:core"], { cwd: ROOT, encoding: "utf8" });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("registry/core/faqir-core.js");
    expect(r.stdout).toContain("registry/core/faqir-core.dev.js");
    expect(r.stdout).toMatch(/size\s+[\d.]+ KB raw · production [\d.]+ KB raw/);
  });

  test("the two builds carry the same controllers and differ only by diagnostics", () => {
    const p = buildCore({ write: false });
    const d = buildCore({ dev: true, write: false });
    expect(d.controllers).toEqual(p.controllers);
    expect(d.code.length).toBeGreaterThan(p.code.length);
    for (const marker of ["PRODUCTION BUILD", "DEVELOPMENT BUILD"]) {
      expect(p.code.includes(marker)).toBe(marker === "PRODUCTION BUILD");
      expect(d.code.includes(marker)).toBe(marker === "DEVELOPMENT BUILD");
    }
  });

  test("both artifacts parse as JavaScript", () => {
    for (const file of [PROD, DEV]) {
      const r = spawnSync("node", ["--check", file], { encoding: "utf8" });
      expect(r.status).toBe(0);
    }
  });
});

describe("distribution", () => {
  const TEST_DIR = join(ROOT, "tests", ".tmp-dev-build");

  test("`faqir init` installs both engines; `bundle --js` ships only production", async () => {
    const { rmSync, mkdirSync, existsSync } = await import("node:fs");
    const { init } = await import("../../src/commands/init");
    const { bundle } = await import("../../src/commands/bundle");

    rmSync(TEST_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DIR, { recursive: true });
    process.chdir(TEST_DIR);
    try {
      await init([]);
      expect(existsSync(join(TEST_DIR, "ui/core/faqir-core.js"))).toBe(true);
      expect(existsSync(join(TEST_DIR, "ui/core/faqir-core.dev.js"))).toBe(true);

      await bundle(["--js"]);
      const js = readFileSync(join(TEST_DIR, "ui/faqir.bundle.js"), "utf8");
      expect(js).toContain("=== core/faqir-core.js ===");
      // No dev-engine section — the production header's pointer to it does not count.
      expect(js).not.toContain("=== core/faqir-core.dev.js ===");
      // …and therefore none of the dev diagnostics rode along.
      expect(js).not.toContain("[Faqir dev]");
      expect(js).not.toContain("devReport");
    } finally {
      process.chdir(ROOT);
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  }, 60_000);
});

describe("size reporting", () => {
  test("the dev engine is a report-only target — measured, never enforced", async () => {
    const mod = (await import(join(ROOT, "scripts", "check-size.mjs"))) as any;
    const target = mod
      .collectDefaultTargets()
      .find((t: any) => t.entry.endsWith("faqir-core.dev.js"));
    expect(target).toBeDefined();
    expect(target.budgetBytes).toBeNull();

    // A report-only row can never fail the gate, however large it gets.
    const row = mod.checkBudget({ label: target.label, gzipBytes: 10 ** 9, budgetBytes: null });
    expect(row.ok).toBe(true);
    expect(row.reportOnly).toBe(true);
    expect(mod.enforce([row]).ok).toBe(true);
  });

  test("`bun run size` prints the dev engine without a budget and still passes", () => {
    const r = spawnSync("bun", ["run", "size"], { cwd: ROOT, encoding: "utf8" });
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/dev engine \(report only\).*no budget.*reported, not enforced/);
    expect(r.stdout).toContain("within budget");
  });
});
