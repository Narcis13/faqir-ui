// A flag given with no value is an error — never the next flag, never a default.
//
// `dev --port --open` parsed `--open` as the port, fell back to 3000 and ate
// the `--open`; `context --format` alone quietly meant json; `bindings --out`
// with nothing after it meant the default directory, and `bindings --out dist
// vue` took `dist` for the target. `scaffold --output`'s version of the same
// defect is covered in scaffold.test.ts.

import { afterAll, beforeAll, describe, expect, it, setDefaultTimeout } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SPAWN_TIMEOUT, runSync } from "../helpers/spawn";

const ENTRY = join(import.meta.dir, "../../src/index.ts");

setDefaultTimeout(60_000);

let cwd: string;

function cli(args: string[]) {
  return runSync("bun", [ENTRY, ...args], { cwd, encoding: "utf8", timeout: SPAWN_TIMEOUT.CLI });
}

beforeAll(() => {
  cwd = mkdtempSync(join(tmpdir(), "faqir-flag-values-"));
  expect(cli(["init", "--yes"]).status).toBe(0);
});

afterAll(() => {
  if (cwd) rmSync(cwd, { recursive: true, force: true });
});

describe("a value flag without its value", () => {
  const cases: Array<[string[], RegExp]> = [
    [["dev", "--port"], /Missing value for --port/],
    [["dev", "--port", "--open"], /Missing value for --port/],
    [["dev", "--dir"], /Missing value for --dir/],
    [["dev", "--host", "--open"], /Missing value for --host/],
    [["context", "--format"], /Missing value for --format/],
    [["context", "--format", "--stdout"], /Missing value for --format/],
    [["bindings", "vue", "--out"], /Missing value for --out/],
    [["bindings", "--out", "--check", "vue"], /Missing value for --out/],
  ];

  for (const [args, message] of cases) {
    it(`faqir ${args.join(" ")} exits 1 and says which flag`, () => {
      const r = cli(args);
      expect(r.status).toBe(1);
      expect(`${r.stdout}${r.stderr}`).toMatch(message);
    });
  }

  it("dev rejects a port that is not a port, instead of falling back to 3000", () => {
    for (const port of ["abc", "0", "70000"]) {
      const r = cli(["dev", "--port", port]);
      expect(r.status, port).toBe(1);
      expect(`${r.stdout}${r.stderr}`).toContain(`Invalid port '${port}'`);
    }
  });

  it("bindings does not take the --out value for the target", () => {
    const out = join(cwd, "vue-out");
    const r = cli(["bindings", "--out", out, "vue", "--check"]);
    // `--check` against an empty directory reports drift (exit 1) — what
    // matters is that the target was understood as vue, not as the path.
    expect(`${r.stdout}${r.stderr}`).not.toContain("Unknown bindings target");
  });
});
