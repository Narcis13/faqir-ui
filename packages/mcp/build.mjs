#!/usr/bin/env node
/**
 * Build the Node-compatible single-file MCP server at `packages/mcp/dist/index.mjs`.
 *
 * Uses `bun build packages/mcp/src/index.ts --target=node` to bundle the stdio
 * MCP server — the `@modelcontextprotocol/sdk`, `zod`, the shared CLI internals,
 * and the Bun→Node runtime shim — into one ESM file that runs on plain Node
 * >= 18. Requires Bun to *build*; the output needs only Node to *run*.
 *
 * Runnable via `bun run build` (from packages/mcp) or `node build.mjs`.
 */
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PKG = resolve(dirname(fileURLToPath(import.meta.url)));
const ENTRY = join(PKG, "src", "index.ts");
const OUTFILE = join(PKG, "dist", "index.mjs");
const NODE_SHEBANG = "#!/usr/bin/env node\n";

mkdirSync(dirname(OUTFILE), { recursive: true });

const bun = process.env.FAQIR_BUN || "bun";
const result = spawnSync(
  bun,
  ["build", ENTRY, "--target=node", `--outfile=${OUTFILE}`],
  { stdio: "inherit", cwd: PKG }
);

if (result.error) {
  if (result.error.code === "ENOENT") {
    process.stderr.write(
      "build requires Bun to compile the bundle. Install Bun from https://bun.sh and retry.\n"
    );
    process.exit(1);
  }
  process.stderr.write(`build failed to launch ${bun}: ${result.error.message}\n`);
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
console.log(`✓ Built ${relative(PKG, OUTFILE)} (${kb} KB) — runs on Node >= 18`);
