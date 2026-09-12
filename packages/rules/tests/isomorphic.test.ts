// The isomorphism gate — the promise that makes a rules *definition* a contract
// rather than a client-side convenience.
//
// The same definition is enforced twice: once by the `faqir-rules` plugin in
// the page (1.1B-04) and once by whatever writes the record down. If those two
// verdicts can differ by so much as a sentence, every "but it let me submit it"
// bug report becomes unanswerable. So this file proves two things:
//
//   1. **No host coupling, by inspection.** No module in `src/` names `window`,
//      `document`, `process` or a filesystem, and nothing is imported from
//      outside the package — not even a `node:` builtin. A source scan catches
//      this on the line it is written, where a runtime test only catches it on
//      the code path that happens to execute.
//   2. **No host coupling, by execution.** The whole golden corpus is run in two
//      realms and diffed: this process, where `tests/setup.ts` has registered
//      happy-dom's `Window` globally, and a bare `bun` child with no preload and
//      therefore no DOM at all — and in a different time zone, which is what
//      proves the `date` operator reads a zoneless timestamp as UTC rather than
//      as wherever the process happens to be. Identical output, case by case.

import { describe, expect, it } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { SPAWN_TIMEOUT, runSync } from "../../../tests/helpers/spawn";
import { coerce, validate } from "../src/index.js";
import { loadCorpus } from "./corpus";

const PACKAGE_DIR = join(import.meta.dir, "..");
const SRC_DIR = join(PACKAGE_DIR, "src");
const ROOT = join(PACKAGE_DIR, "..", "..");
const RUNNER = join(import.meta.dir, "support", "run-corpus.mjs");

const SOURCES = readdirSync(SRC_DIR).filter((f) => f.endsWith(".js")).sort();

/**
 * The one module in `src/` that is ALLOWED to name a host global, and the
 * reason the split is stated here rather than assumed: `plugin.js` is the
 * browser glue 1.1B-04 bundles into `registry/core/plugins/faqir-rules.js`, so
 * `document`, `FormData` and `fetch` are its entire job. Everything else in the
 * package is the evaluator, and the evaluator is what the isomorphism claim is
 * about — a verdict must not depend on which realm computed it.
 *
 * Naming it costs the gate nothing: the exact module list below still fails
 * when a file appears, so a second host-coupled module has to be argued for
 * here before it can exist, and the tests below prove this exemption is used
 * (the file really does reach for the host) rather than left idle.
 */
const HOST_MODULES = new Set(["plugin.js"]);

/** Source with comments removed. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
}

/** Source with comments and string literals blanked — what actually executes. */
function executable(source: string): string {
  return stripComments(source)
    .replace(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g, '""');
}

describe("@faqir-ui/rules is isomorphic by construction", () => {
  it("ships the modules the package promises", () => {
    expect(SOURCES).toEqual([
      "errors.js", "formats.js", "index.js", "limits.js",
      "logic.js", "messages.js", "plugin.js", "rules.js", "shape.js",
    ]);
  });

  it("the host-coupled module is exactly plugin.js, and it really is coupled", () => {
    expect([...HOST_MODULES]).toEqual(["plugin.js"]);
    // An exemption nothing uses is a hole waiting for a second file to fall
    // into it: this one is only sound while the file it names genuinely needs
    // the host — the same both-sides rule the size budgets are held to.
    const plugin = executable(readFileSync(join(SRC_DIR, "plugin.js"), "utf8"));
    for (const host of ["document", "FormData", "fetch"]) {
      expect(plugin, `plugin.js no longer needs ${host}`).toMatch(new RegExp(`\\b${host}\\b`));
    }
    // …and it must still be the thin layer: no evaluation of its own, only the
    // package's. Every verdict in the page comes from these four functions.
    // (String literals are blanked by `executable`, so the identifiers are what
    // there is to match on — which is the half that matters here anyway.)
    expect(plugin).toMatch(/import\s*\{\s*coerce,\s*compile,\s*evaluate,\s*validate\s*\}/);
  });

  for (const file of SOURCES.filter((f) => !HOST_MODULES.has(f))) {
    it(`${file} names no host global`, () => {
      const source = executable(readFileSync(join(SRC_DIR, file), "utf8"));
      for (const host of ["window", "document", "process", "globalThis", "navigator", "localStorage"]) {
        expect(source, `${file} refers to ${host}`).not.toMatch(new RegExp(`\\b${host}\\b`));
      }
      for (const dom of ["HTMLElement", "Element", "Node", "FormData", "fetch", "XMLHttpRequest"]) {
        expect(source, `${file} refers to ${dom}`).not.toMatch(new RegExp(`\\b${dom}\\b`));
      }
    });
  }

  // The zero-dependency claim covers every module, plugin.js included: the
  // shipped drop must bundle from this package and nothing else.
  for (const file of SOURCES) {
    it(`${file} imports nothing from outside the package`, () => {
      const source = readFileSync(join(SRC_DIR, file), "utf8");
      // Comments are stripped first: the header of `index.js` shows the usage
      // example, whose `from "@faqir-ui/rules"` is documentation, not an import.
      // The lookbehind keeps a *string* ending in one of these words out of it —
      // `["id", "jump", "from", "when"]` is a key list, not an import of `, `.
      const importRe =
        /(?<!["'\w])(?:from|import)\s+["']([^"']+)["']|(?<!["'\w])(?:import|require)\s*\(\s*["']([^"']+)["']/g;
      const specifiers = [...stripComments(source).matchAll(importRe)]
        .map((match) => match[1] ?? match[2]);
      for (const specifier of specifiers) {
        expect(specifier, `${file} imports ${specifier}`).toMatch(/^\.\/[a-z-]+\.js$/);
      }
      // No filesystem, no child process, no dynamic import of either.
      expect(executable(source)).not.toMatch(/\brequire\s*\(|\bimport\s*\(/);
    });
  }

  it("bundles for the browser with no external dependency", async () => {
    const build = await Bun.build({ entrypoints: [join(SRC_DIR, "index.js")], target: "browser" });
    expect(build.success, build.logs.map(String).join("\n")).toBe(true);
    expect(build.outputs).toHaveLength(1);
    const bundle = await build.outputs[0].text();
    expect(bundle).toContain("function validate");
    expect(bundle).toContain("function coerce");
  });

  it("declares no dependencies at all", () => {
    const manifest = JSON.parse(readFileSync(join(PACKAGE_DIR, "package.json"), "utf8"));
    expect(manifest.dependencies).toBeUndefined();
    expect(manifest.peerDependencies).toBeUndefined();
    expect(manifest.name).toBe("@faqir-ui/rules");
  });
});

describe("@faqir-ui/rules gives one answer in every realm", () => {
  // Realm A: this process. `bunfig.toml` preloads `tests/setup.ts`, which calls
  // happy-dom's GlobalRegistrator — so `window` and `document` are live here,
  // exactly as they are in the page where the plugin runs.
  it("runs inside a happy-dom Window realm", () => {
    expect(typeof globalThis.window).toBe("object");
    expect(typeof globalThis.document).toBe("object");
    expect(document.createElement("div").tagName).toBe("DIV");
  });

  it("produces byte-identical verdicts in a happy-dom realm and in plain Bun", () => {
    const corpus = loadCorpus();
    const here = corpus.map((testCase) => {
      const data = testCase.raw === undefined
        ? testCase.data
        : coerce(testCase.definition, testCase.raw);
      return {
        name: testCase.name,
        coerced: testCase.raw === undefined ? null : data,
        verdict: validate(testCase.definition, data, { locale: testCase.locale }),
      };
    });

    // Realm B: a bare `bun <file>`, in another time zone. No bunfig preload
    // applies to a run like this, so nothing has registered a DOM — which the
    // child reports back and this test asserts, so the comparison cannot
    // quietly become A against A.
    const hostZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const childZone = hostZone === "Asia/Tokyo" ? "America/Los_Angeles" : "Asia/Tokyo";
    const child = runSync("bun", [RUNNER], {
      cwd: ROOT,
      encoding: "utf8",
      timeout: SPAWN_TIMEOUT.CLI,
      env: { ...process.env, TZ: childZone },
    });
    expect(child.status, child.stderr).toBe(0);
    const there = JSON.parse(child.stdout) as {
      realm: { hasDom: boolean; timeZone: string };
      results: typeof here;
    };

    expect(there.realm.hasDom).toBe(false);
    expect(there.realm.timeZone).toBe(childZone);
    expect(there.realm.timeZone).not.toBe(hostZone);
    expect(there.results).toHaveLength(here.length);
    // Compare case by case: a whole-array diff on 90-odd verdicts names the
    // array, where this names the case.
    for (let i = 0; i < here.length; i++) {
      expect(there.results[i], here[i].name).toEqual(JSON.parse(JSON.stringify(here[i])));
    }
  });
});

describe("the repository's own test runner picks this package up", () => {
  it("walks packages/ as well as tests/", () => {
    const runner = readFileSync(join(ROOT, "scripts", "test.mjs"), "utf8");
    expect(runner).toContain('walk(join(ROOT, "packages"))');
  });
});
