#!/usr/bin/env node
/**
 * Build the Node-compatible single-file CLI at `dist/faqir.mjs`.
 *
 * Uses `bun build src/index.ts --target=node` to bundle the TypeScript CLI into
 * one ESM file that runs on plain Node >= 18 (the `Bun.*` globals it relies on
 * are polyfilled at runtime by `src/utils/runtime-shim.ts`). Requires Bun to be
 * installed to *build* — but not to *run* the output.
 *
 * Runnable via either `bun run build:cli` or `node scripts/build-cli.mjs`.
 */
import { chmodSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BUILD_TIMEOUT_MS, isTimeout, spawnBudgeted, timeoutMessage } from "./spawn.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ENTRY = join(ROOT, "src", "index.ts");
const OUTFILE = join(ROOT, "dist", "faqir.mjs");
const NODE_SHEBANG = "#!/usr/bin/env node\n";

mkdirSync(dirname(OUTFILE), { recursive: true });

const bun = process.env.FAQIR_BUN || "bun";
const buildArgs = ["build", ENTRY, "--target=node", `--outfile=${OUTFILE}`];
const result = spawnBudgeted(bun, buildArgs, {
  stdio: "inherit",
  cwd: ROOT,
  timeout: BUILD_TIMEOUT_MS,
});

if (isTimeout(result)) {
  process.stderr.write(`build:cli ${timeoutMessage(bun, buildArgs)}`);
  process.exit(1);
}

if (result.error) {
  if (result.error.code === "ENOENT") {
    process.stderr.write(
      "build:cli requires Bun to compile the bundle. Install Bun from https://bun.sh and retry.\n"
    );
    process.exit(1);
  }
  process.stderr.write(`build:cli failed to launch ${bun}: ${result.error.message}\n`);
  process.exit(1);
}

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

// Normalize to a Node shebang and make the bundle directly executable.
let output = readFileSync(OUTFILE, "utf8");
output = output.replace(/^#![^\n]*\n/, "");
writeFileSync(OUTFILE, NODE_SHEBANG + output);
chmodSync(OUTFILE, 0o755);

const kb = (statSync(OUTFILE).size / 1024).toFixed(1);
console.log(`✓ Built ${relative(ROOT, OUTFILE)} (${kb} KB) — runs on Node >= 18`);
