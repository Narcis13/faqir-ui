/**
 * Registry-wide `var()` resolution — `findDanglingTokenReferences` and Gate 4 of
 * `scripts/registry-audit.mjs` (task 0.8-07).
 *
 * ── The bug this closes, and why nothing caught it ──
 * `registry/patterns/settings-page/settings-page.css` shipped
 * `grid-template-columns: var(--space-48, 12rem) 1fr` while `--space-48` existed
 * in no token file. The task asked *why* `token-exists` never flagged it, given
 * it matches none of that rule's three documented skips (`palette-*`,
 * `<component>-*`, `button-|card-|dialog-`). The answer is not a skip and not a
 * blind spot in the extractor — both are asserted below. It is that
 * **`token-exists` is a project rule that was never pointed at the registry**:
 * `checkTokens` walks `<outputDir>/{primitives,recipes,patterns}/…` from
 * `.faqir/config.json`'s installed list, and the registry's own CI gate
 * (`scripts/registry-audit.mjs`) ran logical-properties, theme manifests and
 * document rules — no CSS-token gate at all. The registry was simply never an
 * input to the rule, so a project that installed `settings-page` would have been
 * warned and the framework's own source of truth never was.
 *
 * Gate 4 closes that, and these tests keep it closed.
 */
import { describe, it, expect } from "bun:test";
import { Glob } from "bun";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { findDanglingTokenReferences } from "../../src/audit/checker";
import { extractTokenReferences, collectDefinedTokens } from "../../src/parser/css-parser";

const ROOT = join(import.meta.dir, "../..");
const REGISTRY = join(ROOT, "registry");
const TOKENS = join(REGISTRY, "tokens");

const TOKEN_SOURCES = [...new Glob("*.css").scanSync(TOKENS)]
  .sort()
  .map((f) => readFileSync(join(TOKENS, f), "utf8"));
const DEFINED = collectDefinedTokens(TOKEN_SOURCES);

/** Every registry stylesheet the gate sweeps: all of them except the token layer. */
const SWEPT = [...new Glob("**/*.css").scanSync(REGISTRY)]
  .sort()
  .filter((rel) => !rel.startsWith("tokens/"));

describe("token resolution · the registry-wide sweep", () => {
  it("sweeps every registry stylesheet outside the token layer", () => {
    expect(SWEPT.length).toBeGreaterThan(50);
    // Not just components — themes, base and core CSS are swept too.
    expect(SWEPT.some((r) => r.startsWith("primitives/"))).toBe(true);
    expect(SWEPT.some((r) => r.startsWith("recipes/"))).toBe(true);
    expect(SWEPT.some((r) => r.startsWith("patterns/"))).toBe(true);
    expect(SWEPT.some((r) => r.startsWith("themes/"))).toBe(true);
  });

  it("finds zero dangling var() references registry-wide", () => {
    const offenders: string[] = [];
    for (const rel of SWEPT) {
      const css = readFileSync(join(REGISTRY, rel), "utf8");
      for (const f of findDanglingTokenReferences(css, DEFINED)) {
        offenders.push(`${rel}:${f.line} — [${f.kind}] ${f.message}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("is a real sweep — it sees the thousands of references it is clearing", () => {
    // Guards the vacuous pass: a broken glob or an empty token set would also
    // report zero offenders.
    const refs = SWEPT.flatMap((rel) =>
      extractTokenReferences(readFileSync(join(REGISTRY, rel), "utf8")),
    );
    expect(refs.length).toBeGreaterThan(1000);
    expect(DEFINED.size).toBeGreaterThan(200);
  });

  it("is wired into the registry CI gate, not only into this test", () => {
    const gate = readFileSync(join(ROOT, "scripts/registry-audit.mjs"), "utf8");
    expect(gate).toContain("findDanglingTokenReferences");
    expect(gate).toContain("collectDefinedTokens");
  });
});

describe("token resolution · why token-exists missed it", () => {
  const SETTINGS_PAGE = readFileSync(
    join(REGISTRY, "patterns/settings-page/settings-page.css"),
    "utf8",
  );

  it("the extractor always saw the reference — a fallback does not hide it", () => {
    // Hypothesis 1, refuted: `var(--x, fallback)` parsing out as no reference.
    const refs = extractTokenReferences(
      `a { grid-template-columns: var(--space-48, 12rem) 1fr; }`,
    );
    expect(refs.map((r) => r.name)).toEqual(["space-48"]);
    expect(refs[0].expression).toBe("var(--space-48, 12rem)");
  });

  it("no documented token-exists skip ever matched it", () => {
    // Hypothesis 2, refuted: the three skips in `checkTokens` are
    // `palette-*`, `<component>-*` and `button-|card-|dialog-`.
    const name = "space-48";
    const component = "settings-page";
    expect(name.startsWith("palette-")).toBe(false);
    expect(name.startsWith(`${component}-`)).toBe(false);
    expect(
      name.startsWith("button-") || name.startsWith("card-") || name.startsWith("dialog-"),
    ).toBe(false);
  });

  it("the actual gap: token-exists is project-scoped and never read registry/", () => {
    // Hypothesis 3, confirmed. `checkTokens` resolves its inputs from the
    // project's output dir and installed list — there is no registry path in it.
    const checker = readFileSync(join(ROOT, "src/audit/checker.ts"), "utf8");
    const fn = checker.slice(
      checker.indexOf("async function checkTokens("),
      checker.indexOf("* Static WCAG-AA contrast gate"),
    );
    expect(fn.length).toBeGreaterThan(0);
    expect(fn).toContain("installed.primitives");
    expect(fn).toContain("join(outputDir,");
    expect(fn).not.toContain("registry");
  });

  it("and the registry's own gate ran three rules, none of them about tokens", () => {
    // The gate file is the evidence: before 0.8-07 its header said "Three
    // gates" and named logical-properties, theme-manifests and document-rules.
    // It gained var() resolution here — which is the fix — and two more in
    // 0.8-10 (undeclared-attribute, breakpoint-canon), so the count is read out
    // of the header rather than pinned to the number this task left it at.
    const gate = readFileSync(join(ROOT, "scripts/registry-audit.mjs"), "utf8");
    expect(gate).toMatch(/^ \* (Four|Five|Six|Seven|Eight) gates, all fatal on a single finding:$/m);
    expect(gate).toContain("var() resolution");
    for (const older of ["logical-properties", "theme-manifests", "document-rules"]) {
      expect(gate).toContain(older);
    }
  });

  it("the settings-page reference is fixed: a real token, no fallback left", () => {
    expect(SETTINGS_PAGE).toContain("var(--space-48) 1fr");
    expect(SETTINGS_PAGE).not.toContain("var(--space-48, 12rem)");
    expect(DEFINED.has("space-48")).toBe(true);
    // And the declaration it now leans on is the one the scale actually ships.
    expect(readFileSync(join(TOKENS, "spacing.css"), "utf8")).toContain("--space-48:  12rem;");
  });
});

describe("token resolution · what the rule accepts, and why", () => {
  it("accepts a design token", () => {
    expect(findDanglingTokenReferences(`a { gap: var(--space-4); }`, DEFINED)).toEqual([]);
  });

  it("accepts a knob the same stylesheet declares", () => {
    const css = `[data-ui="x"] { --x-width: 16rem; }\n[data-ui="x"] { inline-size: var(--x-width); }`;
    expect(findDanglingTokenReferences(css, DEFINED)).toEqual([]);
  });

  it("accepts an author/runtime knob outside the token vocabulary, with a fallback", () => {
    // `--shell-sidebar-width` (dashboard-shell) and `--pos` (slider, set by its
    // controller) are the shipped examples: no `--shell-*` or `--pos-*` family
    // exists, and the fallback is what makes the component render unset.
    const css = `[data-ui="s"] { inline-size: var(--shell-sidebar-width, 16rem); }`;
    expect(findDanglingTokenReferences(css, DEFINED)).toEqual([]);
  });

  it("rejects an undefined name inside a defined token family, fallback or not", () => {
    // The exact shape of the settings-page bug, and of --z-tooltip.
    const withFallback = findDanglingTokenReferences(
      `a { gap: var(--space-999, 12rem); }`,
      DEFINED,
    );
    expect(withFallback.map((f) => [f.token, f.kind])).toEqual([["space-999", "family"]]);
    expect(withFallback[0].message).toContain(`"--space-*" is a token family`);

    const bare = findDanglingTokenReferences(`a { color: var(--color-nope); }`, DEFINED);
    expect(bare.map((f) => [f.token, f.kind])).toEqual([["color-nope", "family"]]);
  });

  it("rejects a non-token knob that is neither declared locally nor given a fallback", () => {
    const found = findDanglingTokenReferences(`a { inline-size: var(--mystery-knob); }`, DEFINED);
    expect(found.map((f) => [f.token, f.kind])).toEqual([["mystery-knob", "unresolved"]]);
  });

  it("reports the line, so a finding points at the offending declaration", () => {
    const found = findDanglingTokenReferences(`a {\n  gap: 0;\n  margin: var(--space-999);\n}`, DEFINED);
    expect(found).toHaveLength(1);
    expect(found[0].line).toBe(3);
  });

  it("the two knobs 0.8-07 declared stay declared (no silent revert to a fallback)", () => {
    // `--text-tabular-width` and `--z-tooltip` both read as members of a token
    // family (`--text-*` type scale, `--z-*` layer ladder) while being component
    // knobs. Declaring them locally is what makes them resolve honestly.
    const text = readFileSync(join(REGISTRY, "primitives/text/text.css"), "utf8");
    expect(text).toContain("--text-tabular-width: 8ch;");
    expect(text).toContain("min-width: var(--text-tabular-width);");

    const tooltip = readFileSync(join(REGISTRY, "recipes/tooltip/tooltip.css"), "utf8");
    expect(tooltip).toContain("--z-tooltip: var(--z-dropdown);");
    expect(tooltip).toContain("z-index: var(--z-tooltip);");
  });
});
