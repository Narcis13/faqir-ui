import { beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { SPAWN_TIMEOUT, runSync } from "../helpers/spawn";

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
const REGISTRY = join(ROOT, "registry");
const DIST = join(ROOT, "packages", "core", "dist");

const themeNames = readdirSync(join(REGISTRY, "themes"))
  .filter((f) => f.endsWith(".css"))
  .map((f) => f.replace(/\.css$/, ""))
  .sort();

function tick(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

// The beforeAll below shells out to a full package build on a cold checkout,
// which blows past bun's 5s default hook timeout on CI (the runner SIGTERMs
// the child build mid-flight). Hooks take no timeout argument, so raise the
// file-wide default instead.
setDefaultTimeout(120_000);

/**
 * Ensure the `@faqir-ui/core` dist exists. It's a gitignored build output, so on a
 * fresh checkout (or CI) we build it once here — mirrors tests/build/dist-cli.test.ts.
 */
beforeAll(() => {
  const needsBuild = !existsSync(join(DIST, "faqir-core.min.js")) ||
    themeNames.some((t) => !existsSync(join(DIST, `faqir.${t}.css`)));
  if (needsBuild) {
    const build = runSync("bun", ["run", "build:core-package"], {
      cwd: ROOT,
      encoding: "utf8",
      timeout: SPAWN_TIMEOUT.BUILD,
    });
    if (build.status !== 0) {
      throw new Error(`build:core-package failed:\n${build.stdout ?? ""}${build.stderr ?? ""}`);
    }
  }
});

describe("per-theme CSS bundles", () => {
  test("every registry theme yields a faqir.{theme}.css", () => {
    expect(themeNames.length).toBeGreaterThan(0);
    for (const theme of themeNames) {
      expect(existsSync(join(DIST, `faqir.${theme}.css`))).toBe(true);
    }
  });

  test("bundles are non-empty and carry tokens + component rules", () => {
    for (const theme of themeNames) {
      const css = readFileSync(join(DIST, `faqir.${theme}.css`), "utf8");
      expect(css.length).toBeGreaterThan(10_000);
      expect(css).toContain("--color-"); // token definitions inlined
      expect(css).toContain("[data-ui="); // component rules inlined
    }
  });

  test("bundles contain no @import (fully self-contained)", () => {
    for (const theme of themeNames) {
      const css = readFileSync(join(DIST, `faqir.${theme}.css`), "utf8");
      expect(css).not.toContain("@import");
    }
  });

  test("bundles parse cleanly (CSSOM populates rules, no throw)", () => {
    for (const theme of themeNames) {
      const css = readFileSync(join(DIST, `faqir.${theme}.css`), "utf8");
      document.head.innerHTML = "";
      const style = document.createElement("style");
      style.textContent = css;
      document.head.appendChild(style);
      const sheet = document.styleSheets[document.styleSheets.length - 1];
      // A parseable bundle yields many rules; a broken one yields ~0 or throws.
      expect(sheet.cssRules.length).toBeGreaterThan(50);
    }
    document.head.innerHTML = "";
  });
});

describe("minified engine artifact", () => {
  test("the package report uses the assembled runtime budget", () => {
    const build = readFileSync(join(ROOT, "scripts", "build-core-package.mjs"), "utf8");
    expect(build).toContain("const ASSEMBLED_GZIP_BUDGET = 45 * 1024");
    expect(build).not.toContain("Recipe controllers are still inlined in the engine");
    expect(build).not.toContain("controller de-duplication (0.3-04) bring this under budget");
  });

  test("faqir-core.min.js and its sourcemap exist and are linked", () => {
    const min = join(DIST, "faqir-core.min.js");
    expect(existsSync(min)).toBe(true);
    expect(existsSync(join(DIST, "faqir-core.min.js.map"))).toBe(true);
    expect(readFileSync(min, "utf8")).toContain("sourceMappingURL=faqir-core.min.js.map");
  });

  test("loads as a classic script, exposes the Faqir global, and boots l-data", async () => {
    const code = readFileSync(join(DIST, "faqir-core.min.js"), "utf8");
    // Simulate a browser <script> (no module/exports/define in scope) so the
    // iife wrapper assigns the engine to the global.
    new Function("module", "exports", "define", code)(undefined, undefined, undefined);

    const Faqir = (globalThis as any).Faqir;
    expect(typeof Faqir).toBe("object");
    expect(Faqir.version).toMatch(/^\d+\.\d+\.\d+$/);

    document.body.innerHTML = `
      <div l-data="{ count: 3 }">
        <span l-text="count"></span>
        <button l-on:click="count++"></button>
      </div>
    `;
    Faqir.start();
    await tick();

    // Freshly evaluated in this realm, so the devtools handle it installs on
    // window is unambiguously this engine's. [task 0.7-12]
    const tools = (globalThis as any).window.__FAQIR_DEVTOOLS__;
    expect(tools).toBeDefined();
    expect(tools).toBe(Faqir.devtools);
    expect(tools.version).toBe(1);
    expect(tools.dev).toBe(false);
    expect(tools.faqir).toBe(Faqir);
    expect(Object.keys(tools).sort()).toEqual([
      "components", "dev", "faqir", "inspect", "scopes", "stores", "version", "warnings",
    ]);

    const span = document.querySelector("span")!;
    expect(span.textContent).toBe("3");

    document.querySelector("button")!.click();
    await tick();
    expect(span.textContent).toBe("4");

    // …and inspect() works off the minified artifact.
    expect(tools.inspect("span").scope).toEqual({ count: 4 });
    expect(tools.scopes().length).toBe(1);
    expect(tools.warnings()).toEqual([]);

    document.body.innerHTML = "";
  });

  // Acceptance criterion of task 0.7-12. The dev-only string list is derived
  // from src/core-src/dev-diagnostics.js (see tests/build/dev-build.test.ts) so
  // a diagnostic added later is covered here without touching this test.
  test("is byte-free of every dev-only string, and carries no dev build", () => {
    const min = readFileSync(join(DIST, "faqir-core.min.js"), "utf8");
    const diagnostics = readFileSync(join(ROOT, "src", "core-src", "dev-diagnostics.js"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    const literals = new Set<string>();
    for (const m of diagnostics.matchAll(/'((?:[^'\\]|\\.)*)'/g)) {
      if (m[1].length >= 12) literals.add(m[1]);
    }
    expect(literals.size).toBeGreaterThanOrEqual(8);
    for (const literal of literals) {
      expect(min.includes(literal)).toBe(false);
    }
    expect(min).not.toContain("[Faqir dev]");
    expect(min).not.toContain("devReport");
    // The dev engine is a registry file, not a CDN artifact.
    expect(existsSync(join(DIST, "faqir-core.dev.js"))).toBe(false);
  });

  test("still exposes the devtools surface agents read", () => {
    const min = readFileSync(join(DIST, "faqir-core.min.js"), "utf8");
    expect(min).toContain("__FAQIR_DEVTOOLS__");
  });

  test("is within the engine + controllers gzip budget", () => {
    // 45 → 46 KB in Wave 3. The budget has moved on the same terms three times
    // before (42 → 43 for the 29th controller, 43 → 44 for inspect/devtools,
    // 44 → 45 for Wave 2's exit-transition helper and unscoped sweep); this move
    // bought `aria-activedescendant` in the four widgets that published the
    // combobox contract without implementing it, dismiss-on-destroy across
    // twelve overlay controllers, cleanup ownership that survives a detached
    // template, `l-model` listener teardown, and the missing-part guards that
    // name the part instead of throwing. See scripts/check-size.mjs for the ledger.
    const gzip = gzipSync(readFileSync(join(DIST, "faqir-core.min.js"))).length;
    expect(gzip).toBeLessThanOrEqual(46 * 1024);
  });
});

describe("SRI manifest", () => {
  test("sri.json exists and every entry matches a recomputed SHA-384", () => {
    const sriPath = join(DIST, "sri.json");
    expect(existsSync(sriPath)).toBe(true);
    const sri = JSON.parse(readFileSync(sriPath, "utf8")) as Record<string, string>;

    const keys = Object.keys(sri);
    expect(keys.length).toBeGreaterThan(0);
    // Covers the engine + min + sourcemap + every theme bundle.
    expect(keys).toContain("faqir-core.js");
    expect(keys).toContain("faqir-core.min.js");
    for (const theme of themeNames) {
      expect(keys).toContain(`faqir.${theme}.css`);
    }

    for (const [rel, hash] of Object.entries(sri)) {
      expect(hash).toMatch(/^sha384-[A-Za-z0-9+/]+=*$/);
      const buf = readFileSync(join(DIST, rel));
      const recomputed = "sha384-" + createHash("sha384").update(buf).digest("base64");
      expect(recomputed).toBe(hash);
    }
  });

  test("sri.json does not hash itself", () => {
    const sri = JSON.parse(readFileSync(join(DIST, "sri.json"), "utf8")) as Record<string, string>;
    expect(sri["sri.json"]).toBeUndefined();
  });
});

describe("package.json is publish-valid", () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, "packages", "core", "package.json"), "utf8"));

  test("has the reserved scoped name and exports map", () => {
    expect(pkg.name).toBe("@faqir-ui/core");
    expect(pkg.exports).toBeDefined();
    expect(pkg.exports["."]).toBeDefined();
    expect(pkg.exports["./faqir-core.min.js"]).toBe("./dist/faqir-core.min.js");
  });

  test("has a files whitelist that ships dist", () => {
    expect(Array.isArray(pkg.files)).toBe(true);
    expect(pkg.files).toContain("dist");
  });
});


// ── the `import` condition: a packed, installed consumer ────────────────────
//
// `packages/core/README.md` and `faqir-core.d.ts` both lead with
// `import Faqir from "@faqir-ui/core"`. That line threw
// `SyntaxError: … does not provide an export named 'default'` for every
// consumer: the `import` condition resolved to the UMD file, and under
// `"type": "module"` a UMD wrapper takes its global branch and exports nothing.
// Nothing caught it because nothing here ever resolved the package by name.

describe("the published `import` shape actually imports", () => {
  const ESM = join(DIST, "faqir-core.mjs");

  test("dist/faqir-core.mjs exists and the exports map points at it", () => {
    expect(existsSync(ESM)).toBe(true);
    const pkg = JSON.parse(readFileSync(join(ROOT, "packages", "core", "package.json"), "utf8"));
    expect(pkg.exports["."].import).toBe("./dist/faqir-core.mjs");
    expect(pkg.main).toBe("./dist/faqir-core.mjs");
    expect(pkg.module).toBe("./dist/faqir-core.mjs");
    // The require condition is deliberately gone: it threw ERR_REQUIRE_ESM on
    // Node 18 and 20, most of the range `engines` promises.
    expect(pkg.exports["."].require).toBeUndefined();
  });

  test("Node imports the default export and every named export", () => {
    const probe = [
      `import Faqir, { version, start, reactive, controller, devtools } from ${JSON.stringify(ESM)};`,
      `const missing = ["version","reactive","effect","batch","untrack","evaluate",`,
      `  "evaluateAssignment","nextTick","data","store","directive","magic","plugin",`,
      `  "controller","start","initTree","inspect","devtools","destroy"]`,
      `  .filter((k) => Faqir[k] === undefined);`,
      `if (typeof Faqir !== "object") throw new Error("no default export");`,
      `if (missing.length) throw new Error("default missing: " + missing.join(","));`,
      `for (const [name, value] of Object.entries({ version, start, reactive, controller, devtools })) {`,
      `  if (value === undefined) throw new Error("named export missing: " + name);`,
      `}`,
      // The ESM build must NOT reach the consumer through a global — that was
      // the UMD fallback path, and it makes two installed copies fight.
      `if (globalThis.Faqir !== undefined) throw new Error("ESM build polluted globalThis.Faqir");`,
      `console.log("ok");`,
    ].join("\n");

    const result = runSync("node", ["--input-type=module", "-e", probe], {
      cwd: ROOT,
      encoding: "utf8",
      timeout: SPAWN_TIMEOUT.CLI,
    });
    expect(result.stderr ?? "").not.toContain("SyntaxError");
    expect(result.status, result.stderr ?? "").toBe(0);
    expect(result.stdout).toContain("ok");
  });

  test("the ESM entry's named exports match the live engine, both directions", () => {
    // The entry is hand-written, so it can fall behind the engine silently —
    // a member added to `Faqir` with no line in esm-entry.js is simply absent
    // from every bundler import of it, with no error anywhere.
    const entry = readFileSync(
      join(ROOT, "packages", "core", "src", "esm-entry.js"),
      "utf8",
    );
    const exported = [...entry.matchAll(/^export const (\w+) = Faqir\.(\w+);$/gm)]
      .map((m) => {
        expect(m[1], "the export name must match the engine member it aliases").toBe(m[2]);
        return m[1];
      })
      .sort();

    const engine = require("../../registry/core/faqir-core.js") as Record<string, unknown>;
    expect(exported).toEqual(Object.keys(engine).sort());
  });

  test("the declaration's named exports match the ESM entry's", () => {
    const dts = readFileSync(join(ROOT, "packages", "core", "faqir-core.d.ts"), "utf8");
    const declared = [...dts.matchAll(/^export declare const (\w+): FaqirGlobal\["(\w+)"\];$/gm)]
      .map((m) => {
        expect(m[1]).toBe(m[2]);
        return m[1];
      })
      .sort();
    const engine = require("../../registry/core/faqir-core.js") as Record<string, unknown>;
    expect(declared).toEqual(Object.keys(engine).sort());
  });
});
