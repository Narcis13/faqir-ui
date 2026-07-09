import { beforeAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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

/**
 * Ensure the `@faqir-ui/core` dist exists. It's a gitignored build output, so on a
 * fresh checkout (or CI) we build it once here — mirrors tests/build/dist-cli.test.ts.
 */
beforeAll(() => {
  const needsBuild = !existsSync(join(DIST, "faqir-core.min.js")) ||
    themeNames.some((t) => !existsSync(join(DIST, `faqir.${t}.css`)));
  if (needsBuild) {
    const build = spawnSync("bun", ["run", "build:core-package"], { cwd: ROOT, encoding: "utf8" });
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

    const span = document.querySelector("span")!;
    expect(span.textContent).toBe("3");

    document.querySelector("button")!.click();
    await tick();
    expect(span.textContent).toBe("4");

    document.body.innerHTML = "";
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
