#!/usr/bin/env node
/**
 * Build the published artifacts of `@faqir-ui/react` and `@faqir-ui/vue`.
 * [tasks 0.6-12 / 0.7-01 · W1-3]
 *
 *   packages/<target>/src/*.ts  ──tsc──▶  packages/<target>/dist/*.js + *.d.ts
 *
 * Both packages used to publish their TypeScript sources and point every entry
 * field at `./src/index.ts`. Vite tolerated it; nothing else did — plain Node
 * refused the extension, `tsc --moduleResolution node16` reported errors that
 * `skipLibCheck` cannot suppress (it skips `.d.ts`, and those were `.ts`), and
 * `next build` failed to parse the module unless the consumer added
 * `transpilePackages`. Emitting real JS and real declarations is the fix.
 *
 * Plain `tsc`, not a bundler: the packages are ~107 files each with no runtime
 * dependency beyond their peer framework, one module per component, so a
 * one-to-one emit preserves both tree-shaking and the `"use client"` boundary
 * that RSC needs on individual recipe modules. `tsc` carries a directive
 * prologue through emit; `tests/bindings/packaged-consumer.test.ts` verifies it
 * on the packed tarball rather than assuming.
 *
 * Usage:  bun run build:bindings   (or node scripts/build-bindings-packages.mjs)
 */
import { existsSync, rmSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BUILD_TIMEOUT_MS, isTimeout, spawnBudgeted, timeoutMessage } from "./spawn.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TSC = join(ROOT, "node_modules", ".bin", "tsc");
const TARGETS = ["react", "vue"];

if (!existsSync(TSC)) {
  process.stderr.write("build:bindings needs TypeScript — run `bun install` first.\n");
  process.exit(1);
}

for (const target of TARGETS) {
  const pkg = join(ROOT, "packages", target);
  // Stale output is worse than no output: a component deleted from the registry
  // would keep shipping from a previous build.
  rmSync(join(pkg, "dist"), { recursive: true, force: true });

  const args = ["-p", join(pkg, "tsconfig.build.json")];
  const result = spawnBudgeted(TSC, args, {
    cwd: ROOT,
    stdio: "inherit",
    timeout: BUILD_TIMEOUT_MS,
  });
  if (isTimeout(result)) {
    process.stderr.write(`build:bindings ${timeoutMessage(TSC, args)}`);
    process.exit(1);
  }
  if (result.error) {
    process.stderr.write(`build:bindings failed to launch tsc: ${result.error.message}\n`);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);

  process.stdout.write(`✓ @faqir-ui/${target} → ${relative(ROOT, join(pkg, "dist"))}\n`);
}
