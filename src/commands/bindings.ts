// `faqir bindings <target>` — generate framework bindings from the registry
// manifests (tasks 0.6-12/0.7-01, FAQIR-NEXT §11). Targets: `vue` (primitives +
// recipes) and `react` (primitives; recipes land in 0.7-02). Every target
// consumes the same manifest→IR walker (src/bindings/ir.ts). Generation is
// deterministic; `--check` verifies the output on disk matches a fresh
// regeneration byte-for-byte (the CI drift guard).

import { existsSync, readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { log } from "../utils/logger";
import { ensureDir, getRegistryPath, getPackageRoot } from "../utils/fs";
import { isJSONMode, emitJSON } from "../utils/json-output";
import { loadPrimitiveIRs } from "../bindings/ir";
import { loadRecipeBundle } from "../bindings/recipe-ir";
import { emitVuePackage } from "../bindings/vue";
import { emitReactPackage } from "../bindings/react";

const TARGETS = ["vue", "react"] as const;
type Target = (typeof TARGETS)[number];

function printHelp() {
  log.heading("faqir bindings <target>");
  log.blank();
  console.log("Generate typed framework components from registry manifests.");
  log.blank();
  console.log("Targets:");
  console.log("  vue          Vue 3 components into packages/vue/src/");
  console.log("  react        React components into packages/react/src/");
  log.blank();
  console.log("Options:");
  console.log("  --out <dir>  Output directory (default: packages/<target>/src next to the registry)");
  console.log("  --check      Verify generated files match a fresh regeneration (drift guard)");
  console.log("  --json       Machine-readable output");
}

function defaultOutDir(target: Target): string {
  return join(getPackageRoot(), "packages", target, "src");
}

/** Files a previous generation wrote that a fresh one no longer produces. */
function staleFiles(outDir: string, fresh: Map<string, string>): string[] {
  const stale: string[] = [];
  for (const sub of ["components", "recipes", "controllers"]) {
    const dir = join(outDir, sub);
    if (!existsSync(dir)) continue;
    stale.push(
      ...readdirSync(dir)
        .filter((f) => f.endsWith(".ts") && statSync(join(dir, f)).isFile())
        .map((f) => `${sub}/${f}`)
        .filter((rel) => !fresh.has(rel))
    );
  }
  return stale;
}

export async function bindings(args: string[]): Promise<void> {
  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    return;
  }

  const positional = args.filter((a) => !a.startsWith("-"));
  const target = positional[0] as Target | undefined;
  const check = args.includes("--check");
  const outFlag = args.indexOf("--out");
  const outArg = outFlag !== -1 ? args[outFlag + 1] : undefined;

  if (!target || !TARGETS.includes(target)) {
    log.error(
      target ? `Unknown bindings target: ${target}` : "No target. Usage: faqir bindings vue"
    );
    log.dim(`Available targets: ${TARGETS.join(", ")}`);
    process.exit(1);
  }

  const outDir = outArg ?? defaultOutDir(target);
  const irs = await loadPrimitiveIRs(getRegistryPath());

  // Recipes are a Vue-only layer today (React recipes land in 0.7-02).
  let files: Map<string, string>;
  let recipeCount = 0;
  if (target === "vue") {
    const recipes = await loadRecipeBundle(getRegistryPath());
    files = emitVuePackage(irs, recipes);
    recipeCount = recipes.irs.length;
  } else {
    files = emitReactPackage(irs);
  }

  const scope = recipeCount > 0 ? `${irs.length} primitives + ${recipeCount} recipes` : `${irs.length} primitives`;

  if (check) {
    const drifted: string[] = [];
    for (const [rel, content] of files) {
      const path = join(outDir, rel);
      if (!existsSync(path) || readFileSync(path, "utf8") !== content) drifted.push(rel);
    }
    drifted.push(...staleFiles(outDir, files));

    if (isJSONMode()) {
      emitJSON({ target, out: outDir, components: irs.length, recipes: recipeCount, drifted, ok: drifted.length === 0 });
    } else if (drifted.length > 0) {
      log.error(`Bindings drift: ${drifted.length} file(s) differ from regeneration.`);
      for (const rel of drifted) console.log(`  ${rel}`);
      log.dim(`Run 'faqir bindings ${target}' to regenerate.`);
    } else {
      log.success(`Bindings in sync: ${scope}, zero drift.`);
    }
    if (drifted.length > 0) process.exit(1);
    return;
  }

  for (const [rel, content] of files) {
    const path = join(outDir, rel);
    ensureDir(dirname(path));
    writeFileSync(path, content);
  }

  if (isJSONMode()) {
    emitJSON({
      target,
      out: outDir,
      components: irs.length,
      recipes: recipeCount,
      files: [...files.keys()],
      ok: true,
    });
    return;
  }
  log.success(`Generated ${scope} into ${outDir}`);
  log.dim("Runtimes are hand-written (src/runtime.ts); everything else regenerates.");
}
