// ═══════════════════════════════════════════════════════════════════════════
// The rules of the shift, enforced rather than written down     [task 1.1N-01]
// ═══════════════════════════════════════════════════════════════════════════
//
// FAQIR-VISION §10.2 states them in prose. Prose is what an agent is *asked* to
// follow; `scripts/dream/guards.mjs` is what it is *able* to do, and this file
// is the proof the second matches the first.
//
// The allow-list is the half that needs the most care, because it fails in a
// direction nobody notices: an entry naming a path no step writes is dead
// permission — the same "declaration with no consumer" drift 1.1A-21/24/29
// track, seen from the security end. So it is checked in BOTH directions here:
// every path the pipeline legitimately produces is allowed, and every entry in
// the list is one some gate actually writes.

import { describe, expect, it, beforeAll } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadGuards, loadTheme, ROOT, type GuardsModule, type ThemeModule } from "./load";

let guards: GuardsModule;
let theme: ThemeModule;
beforeAll(async () => {
  guards = await loadGuards();
  theme = await loadTheme();
});

describe("the forbidden paths §10.2 names", () => {
  const cases: [string, RegExp][] = [
    ["SPEC-1.0.md", /amendment process/],
    ["src/protocol.ts", /frozen protocol/],
    ["manifest.schema.json", /manifest contract/],
    ["package.json", /no dependency/],
    ["bun.lock", /no dependency/],
    ["tests/visual/__screenshots__/theme-matrix-default-light.png", /visual baseline/],
    ["tests/visual/print/__screenshots__/invoice.png", /visual baseline/],
    ["FAQIR-VISION.md", /plan of record/],
    ["FAQIR-PLAN-1.1.md", /plan of record/],
    [".faqir-plan/state.json", /plan cursor/],
  ];

  for (const [path, reason] of cases) {
    it(`refuses ${path}, and says why`, () => {
      const violation = guards.classifyPath(path);
      expect(violation, path).not.toBeNull();
      expect(violation!.kind).toBe("forbidden");
      expect(violation!.reason).toMatch(reason);
    });
  }

  it("distinguishes 'forbidden' from 'nothing writes here'", () => {
    // The two need different answers from whoever reads the refusal: one is a
    // rule, the other is a missing allow-list entry.
    expect(guards.classifyPath("SPEC-1.0.md")!.kind).toBe("forbidden");
    expect(guards.classifyPath("src/commands/theme.ts")!.kind).toBe("outside-allow-list");
    expect(guards.classifyPath("src/commands/theme.ts")!.reason).toMatch(/ALLOWED_PATHS/);
  });

  it("refuses a dependency change by refusing package.json whole", () => {
    // Deliberately not a parse of the diff's `dependencies` block: a parser
    // standing between a dream and the one file it has no business editing is
    // a parser that can be wrong. Nothing a theme dream produces is in there.
    expect(guards.classifyPath("package.json")!.kind).toBe("forbidden");
    expect(guards.classifyPath("packages/rules/package.json")!.kind).toBe("outside-allow-list");
  });
});

describe("the allow-list", () => {
  const allowed = [
    "registry/themes/arcade.css",
    "registry/themes/arcade.theme.json",
    "registry/themes/arcade.seed.json",
    "registry/themes/arcade.preview.html",
    "registry/themes/arcade-document.css",
    "scripts/gen-theme-manifests.mjs",
    "src/theme-preview.ts",
    "README.md",
    "packages/core/cdn.json",
    ".claude/skills/faqir-creator/SKILL.md",
    ".claude/skills/faqir-creator/references/tokens.md",
    "tests/themes/distinctiveness.test.ts",
    "tests/themes/generated-themes.test.ts",
    "tests/visual/matrix.test.ts",
    ".faqir-dreams/queue.json",
    ".faqir-dreams/seeds/arcade.seed.json",
    "dreams.tsv",
  ];

  for (const path of allowed) {
    it(`allows ${path}`, () => {
      expect(guards.classifyPath(path)).toBeNull();
    });
  }

  const refused = [
    "src/core-src/engine.js",
    "src/commands/theme-generate.ts",
    "registry/primitives/button/button.css",
    "registry/tokens/color.css",
    "registry/core/faqir-core.js",
    "tests/core/lifecycle.test.ts",
    "tests/dream/guards.test.ts",
    "docs/night-shift.md",
    ".github/workflows/ci.yml",
    "registry/themes/arcade.js",
    "registry/themes/Arcade.css",
  ];

  for (const path of refused) {
    it(`refuses ${path}, which no gate writes`, () => {
      const violation = guards.classifyPath(path);
      expect(violation, path).not.toBeNull();
      expect(violation!.kind).toBe("outside-allow-list");
    });
  }

  it("does not let a dream edit the tests that judge it, only the pins it moves", () => {
    // `tests/themes/**` is allowed because a new theme moves the distinctiveness
    // table and the byte-for-byte regeneration cases. Everything else under
    // `tests/` is the gate, not the pin — a dream that may rewrite its own
    // verdict has no verdict.
    expect(guards.classifyPath("tests/themes/axes.test.ts")).toBeNull();
    expect(guards.classifyPath("tests/themes/helpers/render.ts")).not.toBeNull();
    expect(guards.classifyPath("tests/audit/contrast.test.ts")).not.toBeNull();
    expect(guards.classifyPath("tests/visual/layout-lint.pw.ts")).not.toBeNull();
  });

  it("every entry names the step that writes there, and that step exists", () => {
    // A permission nobody uses is dead permission. Each entry's `by` has to name
    // a real gate (or the shift itself), so the list cannot outlive the pipeline.
    const gateNames = theme.THEME_GATES.map((g) => g.name);
    for (const entry of guards.ALLOWED_PATHS) {
      expect(entry.by.length, String(entry.pattern)).toBeGreaterThan(5);
      const namesAGate =
        gateNames.some((name) => entry.by.includes(name)) ||
        /theme generate|the shift itself|the ledger|pinned tables|roster/.test(entry.by);
      expect(namesAGate, `${entry.pattern} is written by "${entry.by}", which is not a gate`).toBe(true);
    }
  });

  it("the two source files it allows are allowed because the generators refuse without them", () => {
    // Not a convenience: `gen:theme-manifests` exits non-zero on a theme with no
    // editorial seed, and `gen:theme-previews` exits non-zero on a theme in
    // neither GALLERY_PREVIEWS nor BESPOKE_PREVIEWS. A dream that may not touch
    // these two files cannot produce a theme at all — asserted against the
    // generators rather than trusted, because the day one stops refusing is the
    // day the permission should go.
    expect(readFileSync(join(ROOT, "scripts", "gen-theme-manifests.mjs"), "utf8")).toContain(
      "No manifest metadata seed for theme(s)",
    );
    expect(readFileSync(join(ROOT, "scripts", "gen-theme-previews.mjs"), "utf8")).toContain(
      "No preview decision for theme(s)",
    );
  });
});

describe("checking a whole diff", () => {
  it("passes a diff of exactly what a theme dream writes", () => {
    const verdict = guards.checkDiffPaths([
      "registry/themes/arcade.css",
      "registry/themes/arcade.theme.json",
      "registry/themes/arcade.seed.json",
      "registry/themes/arcade.preview.html",
      "README.md",
      "packages/core/cdn.json",
      ".claude/skills/faqir-creator/SKILL.md",
      ".faqir-dreams/queue.json",
      "dreams.tsv",
    ]);
    expect(verdict).toEqual({ ok: true, violations: [] });
  });

  it("rejects the diff when one path in it is forbidden", () => {
    const verdict = guards.checkDiffPaths([
      "registry/themes/arcade.css",
      "SPEC-1.0.md",
      "registry/themes/arcade.theme.json",
    ]);
    expect(verdict.ok).toBe(false);
    expect(verdict.violations.map((v) => v.path)).toEqual(["SPEC-1.0.md"]);
  });

  it("reports every violation, and summarises the first for the ledger", () => {
    // The ledger row's `description` is a single cell; the console gets them all.
    const verdict = guards.checkDiffPaths(["package.json", "src/core-src/engine.js"]);
    expect(verdict.violations.length).toBe(2);
    const summary = guards.diffViolationSummary(verdict.violations);
    expect(summary).toContain("package.json");
    expect(summary).toContain("(and 1 more)");
    expect(summary).not.toContain("\n");
  });

  it("an empty diff is clean — a dream that wrote nothing broke no rule", () => {
    expect(guards.checkDiffPaths([])).toEqual({ ok: true, violations: [] });
  });
});

describe("where a dream may run and what it may commit", () => {
  it("refuses to start on a dirty tree, naming what is in the way", () => {
    expect(() =>
      guards.assertCleanStart({ branch: "main", dirty: true, files: ["src/index.ts", "README.md"] }),
    ).toThrow(/dirty tree \(main\): src\/index\.ts, README\.md/);
  });

  it("says why a dirty tree matters, rather than just refusing", () => {
    try {
      guards.assertCleanStart({ branch: "main", dirty: true, files: ["a.ts"] });
      throw new Error("expected a refusal");
    } catch (error) {
      expect((error as Error).message).toMatch(/would ship inside its PR/);
      expect((error as Error).message).toMatch(/Commit or stash first/);
    }
  });

  it("truncates a long dirty list instead of printing a hundred paths", () => {
    const files = Array.from({ length: 12 }, (_, i) => `file-${i}.ts`);
    expect(() => guards.assertCleanStart({ branch: "main", dirty: true, files })).toThrow(/…7 more/);
  });

  it("starts happily on a clean tree, on any branch", () => {
    for (const branch of ["main", "dream/theme-arcade", "HEAD"]) {
      expect(() => guards.assertCleanStart({ branch, dirty: false })).not.toThrow();
    }
  });

  it("refuses to commit on main, and allows it anywhere else", () => {
    expect(() => guards.assertNotProtected("main")).toThrow(/never merges and never writes to the trunk/);
    expect(() => guards.assertNotProtected("main", "amend")).toThrow(/refuses to amend on 'main'/);
    expect(() => guards.assertNotProtected("dream/theme-arcade")).not.toThrow();
  });
});

describe("the git the shift may run", () => {
  it("refuses push, merge, rebase, tag and remote surgery by name", () => {
    for (const args of [
      ["push", "origin", "dream/theme-arcade"],
      ["merge", "dream/theme-arcade"],
      ["rebase", "main"],
      ["tag", "v1.1.0"],
      ["reset", "--hard", "HEAD~1"],
      ["cherry-pick", "abc1234"],
    ]) {
      expect(() => guards.assertGitAllowed(args), args.join(" ")).toThrow(/may not run 'git /);
    }
  });

  it("allows the invocations the pipeline actually makes", () => {
    for (const args of [
      ["status", "--porcelain"],
      ["rev-parse", "--abbrev-ref", "HEAD"],
      ["checkout", "-b", "dream/theme-arcade"],
      ["add", "--all"],
      ["commit", "-m", "feat(dream/arcade): arcade"],
      ["branch", "-D", "dream/theme-arcade"],
      ["clean", "-fd"],
      ["remote"],
    ]) {
      expect(() => guards.assertGitAllowed(args), args.join(" ")).not.toThrow();
    }
  });

  it("lets a discarded dream go home to main — the commit guard is what protects it", () => {
    // Moving HEAD back to the trunk is how a discard cleans up. The invariant
    // that matters is that nothing is ever COMMITTED there, and that is checked
    // at the commit itself, where it cannot be routed around.
    expect(() => guards.assertGitAllowed(["checkout", "main"])).not.toThrow();
    expect(() => guards.assertNotProtected("main", "commit")).toThrow();
  });

  it("refuses `git clean -x` however it is spelled", () => {
    // `-x` and `-fdx` do the same thing; a guard that only sees the first
    // spelling has the second spelling as its hole.
    for (const args of [["clean", "-x"], ["clean", "-fd", "-x"], ["clean", "-fdx"], ["clean", "-xfd"]]) {
      expect(() => guards.assertGitAllowed(args), args.join(" ")).toThrow(/ignored files/);
    }
    expect(() => guards.assertGitAllowed(["clean", "-fd"])).not.toThrow();
  });

  it("names the trunk once, so the guards cannot disagree about which it is", () => {
    expect(guards.PROTECTED_BRANCH).toBe("main");
  });
});

describe("the distinctiveness override", () => {
  it("refuses --allow-similar, because distinctiveness IS the keep condition", () => {
    expect(() =>
      guards.assertGenerateArgsAllowed(["theme", "generate", "arcade", "--allow-similar"]),
    ).toThrow(/may not pass --allow-similar/);
  });

  it("says what to do instead of overriding", () => {
    try {
      guards.assertGenerateArgsAllowed(["--allow-similar"]);
      throw new Error("expected a refusal");
    } catch (error) {
      expect((error as Error).message).toMatch(/a look-alike is a discard with a reason, not a flag/);
    }
  });

  it("passes an ordinary generate through untouched", () => {
    const args = ["src/index.ts", "theme", "generate", "--seed", "x.seed.json", "--out", "registry/themes"];
    expect(guards.assertGenerateArgsAllowed(args)).toBe(args);
  });

  it("the pipeline's own generate gate does not carry the flag", () => {
    // The guard above is a net; this is the thing it is a net for.
    const gate = theme.THEME_GATES.find((g) => g.name === "generate")!;
    const [, args] = gate.command({ seedPath: "s.json", theme: "arcade", id: "arcade" });
    expect(args).not.toContain("--allow-similar");
    expect(() => guards.assertGenerateArgsAllowed(args)).not.toThrow();
  });
});
