/**
 * `@faqir-ui/react` and `@faqir-ui/vue` as a consumer actually receives them.
 * [tasks 0.6-12 / 0.7-01 · W1-3]
 *
 * Both packages pointed `main`, `module`, `types` and every `exports` condition
 * at `./src/index.ts` and shipped 108 and 110 TypeScript files with no JS and
 * no declarations. Every test in the repo passed, because every test in the
 * repo reached the sources directly — the same blind spot the type fixture had
 * with its `paths` mapping. Four independent consumer paths failed:
 *
 *   • Node 18   → ERR_UNKNOWN_FILE_EXTENSION
 *   • Node 24   → ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING
 *   • tsc node16 → 175 / 146 errors, unsuppressable by `skipLibCheck` (it skips
 *                  `.d.ts`; these were `.ts`)
 *   • next build → Module parse failed
 *
 * So this test refuses to look at `src/`. It builds, packs, extracts and
 * installs each package into a throwaway consumer project and exercises it the
 * only two ways a consumer can: `tsc` under `node16`, and Node importing it.
 */
import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SPAWN_TIMEOUT, runSync } from "../helpers/spawn";

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
const TSC = join(ROOT, "node_modules", ".bin", "tsc");

// Build + pack + two tsc runs on a cold checkout runs well past bun's default.
setDefaultTimeout(300_000);

let workspace: string;

/** Run a command, failing the test with its full output rather than a status code. */
function must(cmd: string, args: string[], cwd: string, budgetMs = SPAWN_TIMEOUT.BUILD) {
  const r = runSync(cmd, args, { cwd, encoding: "utf8", timeout: budgetMs });
  if (r.status !== 0) {
    throw new Error(
      `${cmd} ${args.join(" ")} exited ${r.status} in ${cwd}\n${r.stdout ?? ""}\n${r.stderr ?? ""}`,
    );
  }
  return r;
}

/** Pack one workspace package and extract the tarball into `<workspace>/pkgs/<name>`. */
function packInto(name: "react" | "vue"): string {
  const pkgDir = join(ROOT, "packages", name);
  const scratch = join(workspace, "tarballs", name);
  mkdirSync(scratch, { recursive: true });
  const packed = must("npm", ["pack", "--silent", "--pack-destination", scratch], pkgDir);
  const tarball = join(scratch, packed.stdout.trim().split("\n").pop()!.trim());
  must("tar", ["-xzf", tarball, "-C", scratch], workspace);
  return join(scratch, "package");
}

beforeAll(() => {
  expect(existsSync(TSC), "typescript must be installed").toBe(true);

  // Emit from source first. `npm pack` copies dist/, it does not create it.
  must("node", [join(ROOT, "scripts", "build-bindings-packages.mjs")], ROOT);

  workspace = mkdtempSync(join(tmpdir(), "faqir-packaged-consumer-"));

  // A consumer project: ESM, with both packages installed from their tarballs
  // and the peer frameworks linked out of the repo's own install.
  writeFileSync(
    join(workspace, "package.json"),
    JSON.stringify({ name: "consumer", private: true, type: "module" }, null, 2) + "\n",
  );
  const nm = join(workspace, "node_modules");
  mkdirSync(join(nm, "@faqir-ui"), { recursive: true });
  cpSync(packInto("react"), join(nm, "@faqir-ui", "react"), { recursive: true });
  cpSync(packInto("vue"), join(nm, "@faqir-ui", "vue"), { recursive: true });

  for (const [pkg, deps] of [
    ["react", ["react", "react-dom", "@types/react", "@types/react-dom"]],
    ["vue", ["vue", "@vue"]],
  ] as const) {
    for (const dep of deps) {
      const from = join(ROOT, "packages", pkg, "node_modules", dep);
      const to = join(nm, dep);
      if (existsSync(from) && !existsSync(to)) {
        mkdirSync(join(to, ".."), { recursive: true });
        symlinkSync(from, to);
      }
    }
  }
});

afterAll(() => {
  if (workspace) rmSync(workspace, { recursive: true, force: true });
});

// ── what the tarball contains ──────────────────────────────────────────────

describe.each(["react", "vue"] as const)("the %s tarball", (name) => {
  const installed = () => join(workspace, "node_modules", "@faqir-ui", name);

  function walk(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full, out);
      else out.push(full);
    }
    return out;
  }

  test("ships JS and declarations, not bare TypeScript entry points", () => {
    const dist = join(installed(), "dist");
    expect(existsSync(dist), "dist/ must be in the `files` allow-list").toBe(true);
    const files = walk(dist);
    expect(files.filter((f) => f.endsWith(".js")).length).toBeGreaterThan(100);
    expect(files.filter((f) => f.endsWith(".d.ts")).length).toBeGreaterThan(100);
    expect(existsSync(join(dist, "index.js"))).toBe(true);
    expect(existsSync(join(dist, "index.d.ts"))).toBe(true);
  });

  test("every entry field resolves to a file that exists", () => {
    const pkg = JSON.parse(readFileSync(join(installed(), "package.json"), "utf8"));
    for (const field of ["main", "module", "types"]) {
      expect(pkg[field], field).toMatch(/^\.\/dist\//);
      expect(existsSync(join(installed(), pkg[field])), `${field} → ${pkg[field]}`).toBe(true);
    }
    for (const [condition, target] of Object.entries(pkg.exports["."] as Record<string, string>)) {
      expect(existsSync(join(installed(), target)), `${condition} → ${target}`).toBe(true);
    }
    expect(pkg.scripts.prepublishOnly, "a package that must be built needs one").toBeTruthy();
  });

  test("every relative specifier carries an extension Node can resolve", () => {
    // Extensionless relative imports are legal TypeScript and illegal Node ESM,
    // which is how a package can typecheck in `bundler` mode and still fail to
    // load. The generators emit `.js` on every relative specifier for this.
    const offenders: string[] = [];
    for (const file of walk(join(installed(), "dist"))) {
      if (!file.endsWith(".js") && !file.endsWith(".d.ts")) continue;
      for (const m of readFileSync(file, "utf8").matchAll(/from\s+"(\.[^"]*)"/g)) {
        if (!m[1].endsWith(".js")) offenders.push(`${file}: ${m[1]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  test("typechecks from node_modules under moduleResolution node16", () => {
    const dir = join(workspace, `tsc-${name}`);
    mkdirSync(dir, { recursive: true });
    const importLine =
      name === "react"
        ? `import { LButton, LDialog, type LButtonVariant } from "@faqir-ui/react";`
        : `import { LButton, LDialog, type LButtonVariant } from "@faqir-ui/vue";`;
    writeFileSync(
      join(dir, "consumer.ts"),
      [
        importLine,
        `const variant: LButtonVariant = "primary";`,
        `void [LButton, LDialog, variant];`,
        `// @ts-expect-error — the manifest's variant union is enforced, not widened to string.`,
        `const bad: LButtonVariant = "chartreuse";`,
        `void bad;`,
      ].join("\n") + "\n",
    );
    writeFileSync(
      join(dir, "tsconfig.json"),
      JSON.stringify(
        {
          compilerOptions: {
            target: "ES2022",
            module: "node16",
            moduleResolution: "node16",
            lib: ["ES2022", "DOM"],
            jsx: "react-jsx",
            strict: true,
            noEmit: true,
            // OFF on purpose. `skipLibCheck` was the reason nobody noticed: it
            // skips `.d.ts` files, and the package shipped `.ts`, so it
            // suppressed nothing at all here.
            skipLibCheck: false,
            types: [],
          },
          include: ["consumer.ts"],
        },
        null,
        2,
      ),
    );
    const r = runSync(TSC, ["-p", join(dir, "tsconfig.json")], {
      cwd: workspace,
      encoding: "utf8",
      timeout: SPAWN_TIMEOUT.BUILD,
    });
    const output = `${r.stdout ?? ""}${r.stderr ?? ""}`.trim();
    expect(output, output).toBe("");
    expect(r.status).toBe(0);
  });

  test("plain Node imports it and gets the components", () => {
    const probe = [
      `const mod = await import("@faqir-ui/${name}");`,
      `for (const n of ["LButton", "LCard", "LDialog", "LTabs"]) {`,
      `  if (typeof mod[n] === "undefined") throw new Error("missing export: " + n);`,
      `}`,
      `console.log("ok");`,
    ].join("\n");
    const r = runSync("node", ["--input-type=module", "-e", probe], {
      cwd: workspace,
      encoding: "utf8",
      timeout: SPAWN_TIMEOUT.CLI,
    });
    expect(r.stderr ?? "").not.toContain("ERR_UNKNOWN_FILE_EXTENSION");
    expect(r.stderr ?? "").not.toContain("ERR_MODULE_NOT_FOUND");
    expect(r.status, `${r.stdout ?? ""}${r.stderr ?? ""}`).toBe(0);
    expect(r.stdout).toContain("ok");
  });
});

// ── the RSC boundary ───────────────────────────────────────────────────────

test('React recipe modules keep their "use client" directive through emit', () => {
  const dist = join(workspace, "node_modules", "@faqir-ui", "react", "dist");
  const recipes = readdirSync(join(dist, "recipes")).filter((f) => f.endsWith(".js"));
  expect(recipes.length).toBeGreaterThan(20);

  for (const file of recipes) {
    const source = readFileSync(join(dist, "recipes", file), "utf8");
    // A directive prologue is only a directive when nothing executable precedes
    // it. Comments and blank lines are fine; an import is not.
    const firstCode = source
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l !== "" && !l.startsWith("//") && !l.startsWith("/*") && !l.startsWith("*"));
    expect(firstCode, `${file} must open with "use client"`).toBe('"use client";');
  }
});
