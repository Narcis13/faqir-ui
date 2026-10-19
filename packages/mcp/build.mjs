#!/usr/bin/env node
/**
 * Build the Node-compatible single-file MCP server at `packages/mcp/dist/index.mjs`.
 *
 * Uses `bun build packages/mcp/src/index.ts --target=node` to bundle the stdio
 * MCP server — the `@modelcontextprotocol/sdk`, `zod`, the shared CLI internals,
 * and the Bun→Node runtime shim — into one ESM file that runs on plain Node
 * >= 18. Requires Bun to *build*; the output needs only Node to *run*.
 *
 * Also bundles `src/audit.ts` to `dist/audit.mjs`, the `@faqir-ui/mcp/audit`
 * library entry (its types are the hand-written `audit.d.ts`, held to the
 * source by `tests/forecraft-audit-types.ts` under `bun run typecheck`).
 *
 * Runnable via `bun run build` (from packages/mcp) or `node build.mjs`.
 */
import { chmodSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BUILD_TIMEOUT_MS, isTimeout, spawnBudgeted, timeoutMessage } from "../../scripts/spawn.mjs";

const PKG = resolve(dirname(fileURLToPath(import.meta.url)));
const REPO_ROOT = resolve(PKG, "..", "..");
const ENTRY = join(PKG, "src", "index.ts");
const OUTFILE = join(PKG, "dist", "index.mjs");
const AUDIT_ENTRY = join(PKG, "src", "audit.ts");
const AUDIT_OUTFILE = join(PKG, "dist", "audit.mjs");
const NODE_SHEBANG = "#!/usr/bin/env node\n";

mkdirSync(dirname(OUTFILE), { recursive: true });

// Vendor the registry into the package so `npx @faqir-ui/mcp` is self-contained.
// The bundle resolves the registry by walking up from dist/ to the nearest
// `registry/` sibling (see src/utils/fs.ts); in the published package only
// packages/mcp/ ships, so the registry must live here. Copied fresh each build.
const REGISTRY_SRC = join(REPO_ROOT, "registry");
const REGISTRY_DEST = join(PKG, "registry");
if (existsSync(REGISTRY_SRC)) {
  rmSync(REGISTRY_DEST, { recursive: true, force: true });
  cpSync(REGISTRY_SRC, REGISTRY_DEST, { recursive: true });
  const files = countFiles(REGISTRY_DEST);
  console.log(`✓ Vendored registry → ${relative(PKG, REGISTRY_DEST)}/ (${files} files)`);
} else {
  console.warn(`⚠ registry not found at ${REGISTRY_SRC}; the packaged server will not resolve components.`);
}

function countFiles(dir) {
  let n = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    n += entry.isDirectory() ? countFiles(join(dir, entry.name)) : 1;
  }
  return n;
}

const bun = process.env.FAQIR_BUN || "bun";

/** Bundle one entry with `bun build --target=node`, exiting on any failure. */
function bundle(entry, outfile) {
  const buildArgs = ["build", entry, "--target=node", `--outfile=${outfile}`];
  const result = spawnBudgeted(bun, buildArgs, {
    stdio: "inherit",
    cwd: PKG,
    timeout: BUILD_TIMEOUT_MS,
  });

  if (isTimeout(result)) {
    process.stderr.write(`build ${timeoutMessage(bun, buildArgs)}`);
    process.exit(1);
  }

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
}

bundle(ENTRY, OUTFILE);

// Normalize to a Node shebang and make the bundle directly executable.
let output = readFileSync(OUTFILE, "utf8");
output = output.replace(/^#![^\n]*\n/, "");
writeFileSync(OUTFILE, NODE_SHEBANG + output);
chmodSync(OUTFILE, 0o755);

const kb = (statSync(OUTFILE).size / 1024).toFixed(1);
console.log(`✓ Built ${relative(PKG, OUTFILE)} (${kb} KB) — runs on Node >= 18`);

// The programmatic auditor, `@faqir-ui/mcp/audit` (forecraft upstream note 7):
// a library module, not an executable, so no shebang. Bun also stamps a
// `// @bun` pragma on its output, and Bun reads a file carrying it as its own
// pre-transpiled code — decoding it as Latin-1, which mangles every non-ASCII
// byte in the audit messages for an app that imports this under Bun. The
// bundle targets Node; it must not claim to be Bun's (as `scripts/build-cli.mjs`
// does for the CLI).
bundle(AUDIT_ENTRY, AUDIT_OUTFILE);
let audit = readFileSync(AUDIT_OUTFILE, "utf8");
audit = audit.replace(/^#![^\n]*\n/, "").replace(/^\/\/ @bun[^\n]*\n/, "");
writeFileSync(AUDIT_OUTFILE, audit);
const auditKb = (statSync(AUDIT_OUTFILE).size / 1024).toFixed(1);
console.log(`✓ Built ${relative(PKG, AUDIT_OUTFILE)} (${auditKb} KB) — import { auditHtml } from "@faqir-ui/mcp/audit"`);
