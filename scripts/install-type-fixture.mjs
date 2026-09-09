#!/usr/bin/env node
/**
 * Install `@faqir-ui/core` into `tests/fixtures/types/node_modules` from a real
 * `npm pack` tarball.  [task 1.0-02 · W1-4]
 *
 * WHY A TARBALL. The fixture used to reach the declaration through a `paths`
 * mapping straight at `packages/core/faqir-core.d.ts`. That bypasses package
 * resolution entirely — no `exports` map, no condition matching, no ESM/CJS
 * classification from `"type"`. So the fixture happily compiled a declaration
 * that every real consumer's compiler rejected: the same file passed via
 * `paths` and failed through `node_modules` with TS1192, which is the one shape
 * everybody actually uses and the one shape nothing tested.
 *
 * Installing the packed tarball closes that gap. What the fixture compiles
 * against is exactly what `npm install @faqir-ui/core` puts on disk — the
 * `files` allow-list included, so a declaration left out of the tarball fails
 * here rather than in someone's editor.
 *
 * The install is content-addressed: a stamp file records the hash of every input
 * that can change the tarball, and the whole step is skipped when it matches.
 * `bun run typecheck` and `tests/core/faqir-core-types.test.ts` both call this,
 * so the second one through pays nothing.
 *
 * Usage:  node scripts/install-type-fixture.mjs [--force]
 */
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BUILD_TIMEOUT_MS, isTimeout, spawnBudgeted, timeoutMessage } from "./spawn.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PKG = join(ROOT, "packages", "core");
const FIXTURE = join(ROOT, "tests", "fixtures", "types");
const TARGET = join(FIXTURE, "node_modules", "@faqir-ui", "core");
const STAMP = join(FIXTURE, "node_modules", ".faqir-core-stamp");

const force = process.argv.slice(2).includes("--force");

function run(cmd, args, opts = {}) {
  const result = spawnBudgeted(cmd, args, {
    cwd: ROOT,
    encoding: "utf8",
    timeout: BUILD_TIMEOUT_MS,
    ...opts,
  });
  if (isTimeout(result)) throw new Error(`install-type-fixture ${timeoutMessage(cmd, args)}`);
  if (result.error) throw new Error(`failed to launch ${cmd}: ${result.error.message}`);
  if (result.status !== 0) {
    throw new Error(`${cmd} ${args.join(" ")} exited ${result.status}:\n${result.stderr ?? ""}`);
  }
  return result;
}

// ── 1. The package must be built: `npm pack` copies dist/, it does not make it.
run("node", [join(ROOT, "scripts", "build-core-package.mjs")], { stdio: ["ignore", "ignore", "inherit"] });

// ── 2. Skip when nothing that shapes the tarball has moved.
const INPUTS = [
  join(PKG, "package.json"),
  join(PKG, "faqir-core.d.ts"),
  join(PKG, "dist", "faqir-core.mjs"),
  join(PKG, "dist", "faqir-core.js"),
];
const fingerprint = createHash("sha256");
for (const file of INPUTS) fingerprint.update(readFileSync(file));
const stamp = fingerprint.digest("hex");

if (!force && existsSync(STAMP) && readFileSync(STAMP, "utf8").trim() === stamp && existsSync(TARGET)) {
  process.stdout.write("✓ tests/fixtures/types: @faqir-ui/core already installed and current\n");
  process.exit(0);
}

// ── 3. Pack, unpack, install.
const scratch = mkdtempSync(join(tmpdir(), "faqir-core-pack-"));
try {
  const packed = run("npm", ["pack", "--silent", "--pack-destination", scratch], { cwd: PKG });
  const tarball = join(scratch, packed.stdout.trim().split("\n").pop().trim());
  run("tar", ["-xzf", tarball, "-C", scratch]);

  rmSync(TARGET, { recursive: true, force: true });
  mkdirSync(dirname(TARGET), { recursive: true });
  cpSync(join(scratch, "package"), TARGET, { recursive: true });
  writeFileSync(STAMP, stamp + "\n");
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

process.stdout.write(`✓ tests/fixtures/types: installed @faqir-ui/core from a packed tarball\n`);
