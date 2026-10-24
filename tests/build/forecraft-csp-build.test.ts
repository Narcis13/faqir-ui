// ═══════════════════════════════════════════════════════════════════════════
// The strict-CSP build: assembly, seam, package and budget  [forecraft #50]
// ═══════════════════════════════════════════════════════════════════════════
//
// No engine is executed here (this file runs in the production partition):
// everything is read as text. What runs is tested in
// tests/core/forecraft-csp-{engine,dev}.test.ts, in partitions of their own.

import { beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { SPAWN_TIMEOUT, runSync } from "../helpers/spawn";

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");

// Plain-JS scripts, imported through computed specifiers like the other build tests.
const { buildCore, EVALUATOR_END, EVALUATOR_START } = (await import(join(ROOT, "scripts", "build-core.mjs"))) as any;
const { BUDGETS, collectDefaultTargets } = (await import(join(ROOT, "scripts", "check-size.mjs"))) as any;
const CORE = join(ROOT, "registry", "core");
const ENGINE_SRC = join(ROOT, "src", "core-src", "engine.js");
const PKG = join(ROOT, "packages", "core");
const DIST = join(PKG, "dist");
const KB = 1024;

setDefaultTimeout(120_000);

/** Drop the provenance header: every line up to the first blank one. */
const body = (code: string) => code.slice(code.indexOf("\n\n") + 2);

describe("build:core — the evaluator seam", () => {
  test("the engine source carries exactly one evaluator region, around the two compilers", () => {
    const lines = readFileSync(ENGINE_SRC, "utf8").split("\n");
    const start = lines.findIndex((l) => l.trim().startsWith(EVALUATOR_START));
    const end = lines.findIndex((l) => l.trim() === EVALUATOR_END);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(lines.filter((l) => l.includes("@faqir:evaluator-")).length).toBe(2);
    const region = lines.slice(start + 1, end).join("\n");
    expect(region).toContain("function compileExpression(expr)");
    expect(region).toContain("function compileStatement(expr)");
    expect(region).toContain("new Function(");
    expect(lines.slice(0, start).concat(lines.slice(end + 1)).join("\n")).not.toContain("new Function(");
  });

  test("the default builds drop the marker lines and nothing else", () => {
    for (const dev of [false, true]) {
      const { code } = buildCore({ dev, write: false });
      expect(code).not.toContain("@faqir:evaluator");
      expect(code).toContain("'with($scope) { return (' + expr + ') }'");
      expect(code).toBe(readFileSync(join(CORE, dev ? "faqir-core.dev.js" : "faqir-core.js"), "utf8"));
    }
  });

  test("the CSP builds differ from the default ones by the evaluator alone", () => {
    for (const dev of [false, true]) {
      const plain = body(buildCore({ dev, write: false }).code).split("\n");
      const csp = body(buildCore({ dev, csp: true, write: false }).code).split("\n");

      const from = plain.findIndex((l) => l === "  function compileExpression(expr) {");
      const to = plain.findIndex((l, i) => i > from && l === "  function compileStatement(expr) {") + 11;
      expect(plain[to - 1]).toBe("  }");
      const cspFrom = csp.findIndex((l) => l.startsWith("  // ── strict-CSP evaluator ──"));
      const cspTo = csp.findIndex((l) => l === "    return cspInterpreter(expr, false);") + 2;
      expect(cspFrom).toBeGreaterThan(-1);

      const rest = (ls: string[], a: number, b: number) => [...ls.slice(0, a), "<evaluator>", ...ls.slice(b)].join("\n");
      expect(rest(csp, cspFrom, cspTo)).toBe(rest(plain, from, to));
    }
  });

  test("the CSP header says what it is; dev strings stay out of the production CSP build", () => {
    const prod = buildCore({ csp: true, write: false }).code;
    const dev = buildCore({ csp: true, dev: true, write: false }).code;
    expect(prod.split("\n")[1]).toBe("// registry/core/faqir-core.csp.js");
    expect(dev.split("\n")[1]).toBe("// registry/core/faqir-core.csp.dev.js");
    expect(prod).toContain("//   evaluator:   src/core-src/csp-evaluator.js (forecraft #50)");
    expect(prod).toContain("// STRICT-CSP BUILD");
    expect(prod).not.toContain("the strict-CSP build interprets a subset of JavaScript");
    expect(dev).toContain("the strict-CSP build interprets a subset of JavaScript");
  });

  test("the committed CSP artifacts are fresh and deterministic", () => {
    for (const dev of [false, true]) {
      const a = buildCore({ csp: true, dev, write: false });
      const b = buildCore({ csp: true, dev, write: false });
      expect(a.code).toBe(b.code);
      expect(readFileSync(join(CORE, dev ? "faqir-core.csp.dev.js" : "faqir-core.csp.js"), "utf8")).toBe(a.code);
    }
  });

  test("a CSP build of an engine without the region is a build error, not a silent eval build", () => {
    const dir = mkdtempSync(join(tmpdir(), "faqir-csp-seam-"));
    try {
      const engine = join(dir, "engine.js");
      writeFileSync(
        engine,
        readFileSync(ENGINE_SRC, "utf8")
          .split("\n")
          .filter((l) => !l.includes("@faqir:evaluator-"))
          .join("\n"),
      );
      expect(() => buildCore({ enginePath: engine, csp: true, write: false })).toThrow(/evaluator-start/);
      // …while the default build of the same engine still assembles.
      expect(() => buildCore({ enginePath: engine, write: false })).not.toThrow();
      // A half-present region is refused for both.
      const half = join(dir, "half.js");
      writeFileSync(half, readFileSync(ENGINE_SRC, "utf8").replace(/^.*@faqir:evaluator-end.*$/m, ""));
      expect(() => buildCore({ enginePath: half, write: false })).toThrow(/evaluator-end/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("size budget", () => {
  test("the strict-CSP engine has its own enforced budget, and its dev twin is report-only", () => {
    expect(BUDGETS.engineCsp).toBe(65 * KB);
    expect(BUDGETS.engineWithControllers).toBe(61 * KB);
    const targets = collectDefaultTargets();
    const csp = targets.find((t: any) => t.entry === "registry/core/faqir-core.csp.js");
    const cspDev = targets.find((t: any) => t.entry === "registry/core/faqir-core.csp.dev.js");
    expect(csp?.budgetBytes).toBe(BUDGETS.engineCsp);
    expect(cspDev?.budgetBytes).toBeNull();
  });
});

describe("@faqir-ui/core — the strict-CSP artifacts", () => {
  beforeAll(() => {
    const need = ["faqir-core.csp.js", "faqir-core.csp.min.js", "faqir-core.csp.mjs", "faqir-core.mjs"];
    if (need.some((f) => !existsSync(join(DIST, f)))) {
      const build = runSync("bun", ["run", "build:core-package", "--", "--no-pin"], {
        cwd: ROOT,
        encoding: "utf8",
        timeout: SPAWN_TIMEOUT.BUILD,
      });
      if (build.status !== 0) throw new Error(`build:core-package failed:\n${build.stdout ?? ""}${build.stderr ?? ""}`);
    }
  });

  test("dist carries the UMD copy, the minified classic script with its map, and the ESM build", () => {
    expect(readFileSync(join(DIST, "faqir-core.csp.js"), "utf8")).toBe(readFileSync(join(CORE, "faqir-core.csp.js"), "utf8"));
    const min = readFileSync(join(DIST, "faqir-core.csp.min.js"), "utf8");
    expect(min).toContain("sourceMappingURL=faqir-core.csp.min.js.map");
    expect(existsSync(join(DIST, "faqir-core.csp.min.js.map"))).toBe(true);
    expect(min).not.toMatch(/new Function\(|\beval\(/);
    // The temporary entries are gone before the SRI pass.
    expect(existsSync(join(DIST, "faqir-core.csp.entry.js"))).toBe(false);
    expect(existsSync(join(DIST, "faqir-core.csp.min.entry.js"))).toBe(false);
  });

  test("the minified strict-CSP engine is within its gzip budget", () => {
    const gzip = gzipSync(readFileSync(join(DIST, "faqir-core.csp.min.js"))).length;
    expect(gzip).toBeLessThanOrEqual(66 * KB);
  });

  test("the ESM build exports exactly what the default one does", () => {
    const names = (file: string) => {
      const src = readFileSync(join(DIST, file), "utf8");
      const block = src.slice(src.lastIndexOf("export {") + "export {".length, src.lastIndexOf("}"));
      return block
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => (s.includes(" as ") ? s.split(" as ")[1]!.trim() : s))
        .sort();
    };
    expect(names("faqir-core.csp.mjs")).toEqual(names("faqir-core.mjs"));
    expect(readFileSync(join(DIST, "faqir-core.csp.mjs"), "utf8")).toContain("// registry/core/faqir-core.csp.js");
  });

  test("the exports map and sideEffects name every strict-CSP file", () => {
    const pkg = JSON.parse(readFileSync(join(PKG, "package.json"), "utf8"));
    expect(pkg.exports["./csp"]).toEqual({
      types: "./faqir-core.d.ts",
      import: "./dist/faqir-core.csp.mjs",
      default: "./dist/faqir-core.csp.mjs",
    });
    expect(pkg.exports["./faqir-core.csp.js"].default).toBe("./dist/faqir-core.csp.js");
    expect(pkg.exports["./faqir-core.csp.min.js"]).toBe("./dist/faqir-core.csp.min.js");
    for (const f of ["faqir-core.csp.mjs", "faqir-core.csp.js", "faqir-core.csp.min.js"]) {
      expect(pkg.sideEffects).toContain(`./dist/${f}`);
    }
  });

  test("cdn.json pins an SRI hash for every strict-CSP file", () => {
    const pin = JSON.parse(readFileSync(join(PKG, "cdn.json"), "utf8"));
    for (const f of ["faqir-core.csp.js", "faqir-core.csp.min.js", "faqir-core.csp.min.js.map", "faqir-core.csp.mjs"]) {
      expect(pin.integrity[f]).toMatch(/^sha384-[A-Za-z0-9+/]{64}$/);
    }
  });
});
