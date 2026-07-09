import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const BIN_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(BIN_DIR, "..");

/** Compiled, Node-compatible single-file bundle (shipped in the npm package). */
export const DIST_ENTRY = join(ROOT, "dist", "faqir.mjs");
/** TypeScript source entry — used for the Bun dev flow from a source checkout. */
export const SRC_ENTRY = join(ROOT, "src", "index.ts");

/**
 * Locate a Bun executable without spawning it.
 *
 * - `FAQIR_FORCE_NODE=1` pretends Bun is absent (used by tests / to force Node).
 * - `FAQIR_BUN` explicitly points at a Bun binary.
 * - Otherwise scan `PATH` for a `bun` executable.
 *
 * Returns the resolved command (or `null` when Bun is unavailable).
 */
export function findBun(env = process.env) {
  if (env.FAQIR_FORCE_NODE === "1") return null;
  if (env.FAQIR_BUN) return env.FAQIR_BUN;

  const names = process.platform === "win32" ? ["bun.exe", "bun.cmd", "bun"] : ["bun"];
  const dirs = (env.PATH || "").split(delimiter).filter(Boolean);
  for (const dir of dirs) {
    for (const name of names) {
      if (existsSync(join(dir, name))) return join(dir, name);
    }
  }
  return null;
}

/**
 * Decide which runtime + entry point to launch. Pure function for testability.
 *
 * - Compiled bundle present → run it, preferring Bun when available, else Node.
 * - No bundle (source checkout) → run the TS source, which requires Bun.
 */
export function resolveLaunch({ hasDist, bun }) {
  if (hasDist) {
    return { runtime: bun || "node", entry: DIST_ENTRY };
  }
  return { runtime: bun || null, entry: SRC_ENTRY };
}

export function launchFaqir(argv = process.argv.slice(2), env = process.env) {
  const bun = findBun(env);
  const hasDist = existsSync(DIST_ENTRY);
  const { runtime, entry } = resolveLaunch({ hasDist, bun });

  if (!runtime) {
    process.stderr.write(
      "faqir could not find a runtime to run the CLI.\n" +
        "  • Install Bun (https://bun.sh) to run from source, or\n" +
        "  • build the Node bundle with `bun run build:cli` so faqir runs on plain Node >= 18.\n"
    );
    process.exit(1);
  }

  const result = spawnSync(runtime, [entry, ...argv], { stdio: "inherit" });

  if (result.error) {
    if (result.error.code === "ENOENT") {
      process.stderr.write(`faqir failed to start: '${runtime}' was not found on your PATH.\n`);
      process.exit(1);
    }
    process.stderr.write(`faqir failed to start with ${runtime}: ${result.error.message}\n`);
    process.exit(1);
  }

  process.exit(result.status ?? 1);
}
