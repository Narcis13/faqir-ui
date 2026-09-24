import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { faqirInitRuntime, regenerateFaqirInit } from "../../src/utils/codegen";
import { getRegistryPath } from "../../src/utils/fs";
import { SPAWN_TIMEOUT, runSync } from "../helpers/spawn";

// The `core/faqir.js` that `faqir add` writes into a project used to be a
// hand-kept copy of registry/core/faqir.js. The registry file learned to destroy
// controllers of removed subtrees; the copy did not, and every generated
// project kept the leak. The runtime half is now read from the registry file,
// so the two cannot drift.  [1.1 runtime fixes]

const REGISTRY = getRegistryPath();
const REGISTRY_FAQIR = join(REGISTRY, "core", "faqir.js");
const ROOT = join(import.meta.dir, "../..");

/** Lay out a project the way `faqir init` + `faqir add` do: core/ + recipes/<name>/. */
function install(recipes: string[]) {
  cpSync(join(REGISTRY, "core"), join(dir, "core"), { recursive: true });
  for (const r of recipes) cpSync(join(REGISTRY, "recipes", r), join(dir, "recipes", r), { recursive: true });
}

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "faqir-codegen-"));
  mkdirSync(join(dir, "core"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("regenerateFaqirInit", () => {
  it("writes the registry's runtime verbatim after the project's controller table", async () => {
    await regenerateFaqirInit({ installed: { recipes: ["dialog", "toast"] } }, dir);
    const out = readFileSync(join(dir, "core", "faqir.js"), "utf8");

    const registry = readFileSync(REGISTRY_FAQIR, "utf8");
    const registryRuntime = registry.slice(registry.indexOf("\n// Live controller APIs"));
    expect(registryRuntime.length).toBeGreaterThan(0);
    expect(out.endsWith(registryRuntime)).toBe(true);

    expect(out).toContain('import { createDialog } from "../recipes/dialog/dialog.js";');
    expect(out).toContain('  "toast": createToast'); // no recipe source here: derived name
    expect(out).toContain("mutation.removedNodes.forEach");
    expect(out).toContain("export { init, controllers };");
    // Only the project's recipes are imported — none of the registry file's.
    expect(out.match(/^import /gm)!.length).toBe(2);
  });

  it("does nothing without a core dir or without recipes", async () => {
    await regenerateFaqirInit({ installed: { recipes: [] } }, dir);
    expect(() => readFileSync(join(dir, "core", "faqir.js"))).toThrow();
  });
});

describe("regenerateFaqirInit · installed project", () => {
  // The factory name used to be derived from the recipe name, and three recipes
  // export something else — the generated module imported names that do not
  // exist, a SyntaxError that took the whole auto-init down.
  it("imports each recipe's real exported factory", async () => {
    install(["toast", "input-otp", "qr-code"]);
    await regenerateFaqirInit({ installed: { recipes: ["toast", "input-otp", "qr-code"] } }, dir);
    const out = readFileSync(join(dir, "core", "faqir.js"), "utf8");
    expect(out).toContain('import { createToastContainer } from "../recipes/toast/toast.js";');
    expect(out).toContain('import { createInputOTP } from "../recipes/input-otp/input-otp.js";');
    expect(out).toContain('import { createQRCode } from "../recipes/qr-code/qr-code.js";');
    expect(out).toContain('  "toast": createToastContainer,');
  });

  // End to end, in its own process: the generated module observes
  // document.body for good, which must not leak into this shared realm.
  it("the generated module loads, mounts, and destroys a removed controller", async () => {
    install(["dialog", "toast"]);
    await regenerateFaqirInit({ installed: { recipes: ["dialog", "toast"] } }, dir);
    const child = `
      const tick = () => new Promise((r) => setTimeout(r, 0));
      document.body.innerHTML = '<div id="t" data-ui="toast"></div>' +
        '<div id="d" data-ui="dialog" data-state="closed"><div data-part="overlay" hidden></div>' +
        '<div data-part="panel" role="dialog" hidden></div></div>';
      await import(${JSON.stringify(join(dir, "core", "faqir.js"))});
      const d = document.getElementById("d");
      const out = { toast: !!document.getElementById("t")._faqirToast, dialog: !!d._faqirDialog };
      d.remove();
      await tick();
      out.destroyed = d._faqirDialog === undefined;
      console.log(JSON.stringify(out));
      process.exit(0);
    `;
    const r = runSync("bun", ["--preload", "./tests/setup.ts", "-e", child], {
      cwd: ROOT,
      encoding: "utf8",
      timeout: SPAWN_TIMEOUT.CLI,
    });
    expect(r.stderr).toBe("");
    expect(JSON.parse(r.stdout.trim().split("\n").pop()!)).toEqual({ toast: true, dialog: true, destroyed: true });
  });
});

describe("faqirInitRuntime", () => {
  it("is everything after the registry file's controllers table", () => {
    const runtime = faqirInitRuntime();
    expect(runtime.startsWith("\n// Live controller APIs")).toBe(true);
    expect(runtime).not.toContain("const controllers = {");
  });

  it("fails loudly when the registry file has no table to split at", () => {
    const fake = mkdtempSync(join(tmpdir(), "faqir-codegen-reg-"));
    try {
      mkdirSync(join(fake, "core"));
      writeFileSync(join(fake, "core", "faqir.js"), "export {};\n");
      expect(() => faqirInitRuntime(fake)).toThrow("controllers");
    } finally {
      rmSync(fake, { recursive: true, force: true });
    }
  });
});
