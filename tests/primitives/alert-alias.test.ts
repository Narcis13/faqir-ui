// ═══════════════════════════════════════════════════════════════════════════
// `alert` alias of `callout`  [task 0.4-03]
// ═══════════════════════════════════════════════════════════════════════════
//
// `alert` is a manifest-level alias of `callout` — a discovery affordance that
// ships no files of its own (no duplicated CSS payload). This suite proves the
// alias resolves on every surface an agent might use:
//   • resolution — findComponentInRegistry / resolveAlias / getRegistryAliases
//   • `faqir add alert`   → installs the canonical `callout`
//   • `faqir search alert`→ resolves to `callout`
//   • `faqir list`        → shows the alias
//   • `.faqir/context.json` + skill output → carry the alias
// and that the new optional [data-part="dismiss"] is token-only, logical, and
// audit-valid.

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { validateManifest, type Manifest } from "../../src/manifest";
import {
  findHardcodedColorValues,
  findClassSelectors,
  findIdSelectors,
  findImportantDeclarations,
  findLogicalPropertyViolations,
} from "../../src/parser/css-parser";
import { extractComponents } from "../../src/parser/html-parser";
import {
  findComponentInRegistry,
  getRegistryAliases,
  resolveAlias,
} from "../../src/utils/components";
import { getRegistryPath } from "../../src/utils/fs";
import { init } from "../../src/commands/init";
import { add } from "../../src/commands/add";
import { list } from "../../src/commands/list";
import { search } from "../../src/commands/search";
import { readConfig } from "../../src/utils/config";
import { runAudit } from "../../src/audit/checker";
import { generateContext, formatContextJSON } from "../../src/generator/context";
import { generateSkill } from "../../src/generator/skill";

const REGISTRY = getRegistryPath();

async function calloutManifest(): Promise<Manifest> {
  return Bun.file(join(REGISTRY, "primitives", "callout", "callout.manifest.json")).json();
}
async function calloutCss(): Promise<string> {
  return Bun.file(join(REGISTRY, "primitives", "callout", "callout.css")).text();
}
async function calloutHtml(): Promise<string> {
  return Bun.file(join(REGISTRY, "primitives", "callout", "callout.html")).text();
}

// Spacing properties may only use tokens (or 0 / calc over tokens) — never
// literal lengths. Mirrors the batch-suite check.
const SPACING_PROP_RE =
  /^(padding|margin|gap|row-gap|column-gap|inset)(-(inline|block)(-(start|end))?)?$/;
const LENGTH_LITERAL_RE = /\d+(\.\d+)?(px|rem|em|%|ch|vw|vh)\b/;
function findSpacingLiterals(source: string): string[] {
  const findings: string[] = [];
  for (const rawLine of source.split("\n")) {
    const line = rawLine.trim();
    if (line.startsWith("/*") || line.startsWith("*")) continue;
    const m = line.match(/^([a-z-]+)\s*:\s*([^;]+);/);
    if (!m) continue;
    const [, prop, value] = m;
    if (!SPACING_PROP_RE.test(prop)) continue;
    const stripped = value.replace(/var\([^)]*\)/g, "");
    if (LENGTH_LITERAL_RE.test(stripped)) findings.push(line);
  }
  return findings;
}

function captureLog(fn: () => Promise<void>): Promise<string> {
  return (async () => {
    const orig = console.log;
    const out: string[] = [];
    console.log = (...args: any[]) => out.push(args.join(" "));
    try {
      await fn();
    } finally {
      console.log = orig;
    }
    // Strip ANSI so substring assertions are colour-agnostic.
    return out.join("\n").replace(/\x1b\[[0-9;]*m/g, "");
  })();
}

// ── Manifest: alias + dismiss slot ──
describe("0.4-03 · callout manifest declares the alert alias and dismiss slot", () => {
  it("is still schema-valid with the new fields", async () => {
    expect(validateManifest(await calloutManifest())).toEqual([]);
  });

  it("declares aliases: ['alert']", async () => {
    const m = await calloutManifest();
    expect(m.aliases).toEqual(["alert"]);
  });

  it("documents an optional dismiss slot (button, not required)", async () => {
    const m = await calloutManifest();
    expect(m.slots.dismiss).toBeDefined();
    expect(m.slots.dismiss.required).toBe(false);
    expect(m.slots.dismiss.selector).toBe("[data-part='dismiss']");
    expect(m.slots.dismiss.tag_hint).toBe("button");
  });

  it("lists add/remove-dismiss as safe transforms", async () => {
    const m = await calloutManifest();
    expect(m.safe_transforms).toContain("add-dismiss");
    expect(m.safe_transforms).toContain("remove-dismiss");
  });
});

// ── Alias resolution ──
describe("0.4-03 · alias resolution maps alert → callout", () => {
  it("getRegistryAliases carries alert → callout", () => {
    expect(getRegistryAliases(REGISTRY).get("alert")).toBe("callout");
  });

  it("resolveAlias('alert') is 'callout'; a real name passes through", () => {
    expect(resolveAlias("alert", REGISTRY)).toBe("callout");
    expect(resolveAlias("callout", REGISTRY)).toBe("callout");
    expect(resolveAlias("button", REGISTRY)).toBe("button");
  });

  it("findComponentInRegistry('alert') resolves to the canonical callout dir", () => {
    const found = findComponentInRegistry("alert", REGISTRY);
    expect(found).not.toBeNull();
    expect(found!.name).toBe("callout");
    expect(found!.layer).toBe("primitives");
    expect(existsSync(join(found!.path, "callout.manifest.json"))).toBe(true);
  });
});

// ── Dismiss part CSS is token-only, logical, audit-clean ──
describe("0.4-03 · dismiss part CSS is contract-clean", () => {
  it("styles [data-part='dismiss'] and hides it in print", async () => {
    const css = await calloutCss();
    expect(css).toContain('[data-ui="callout"] [data-part="dismiss"]');
    // Print block hides the interactive control.
    expect(css).toMatch(/@media print[\s\S]*\[data-part="dismiss"\][\s\S]*display:\s*none/);
  });

  it("adds zero hardcoded colours, class/id selectors, or spacing literals", async () => {
    const css = await calloutCss();
    expect(findHardcodedColorValues(css)).toEqual([]);
    expect(findClassSelectors(css)).toEqual([]);
    expect(findIdSelectors(css)).toEqual([]);
    expect(findSpacingLiterals(css)).toEqual([]);
    expect(findLogicalPropertyViolations(css)).toEqual([]);
  });

  it("introduces no new !important (only the pre-existing print override remains)", async () => {
    const css = await calloutCss();
    const importants = findImportantDeclarations(css);
    // Exactly one — the print background override that predates this task.
    expect(importants.length).toBe(1);
    expect(importants[0].text.toLowerCase()).toContain("background");
  });
});

// ── Dismiss part HTML parses with an accessible button ──
describe("0.4-03 · dismiss example is well-formed", () => {
  it("has a callout whose dismiss part is a labelled type=button", async () => {
    const html = await calloutHtml();
    const callouts = extractComponents(html, "callout.html").filter((c) => c.name === "callout");
    const withDismiss = callouts.filter((c) => (c.parts["dismiss"] ?? []).length > 0);
    expect(withDismiss.length).toBeGreaterThan(0);

    for (const c of withDismiss) {
      const btn = c.parts["dismiss"][0];
      expect(btn.tag).toBe("button");
      expect(btn.attrs["type"]).toBe("button");
      expect(btn.attrs["aria-label"]).toBeTruthy();
    }
  });
});

// ── End-to-end: add / list / search / context / skill ──
const TEST_DIR = join(import.meta.dir, "../.tmp-alert-alias-test");

describe("0.4-03 · alert resolves across every discovery surface", () => {
  beforeEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DIR, { recursive: true });
    process.chdir(TEST_DIR);
  });

  afterEach(() => {
    process.chdir(join(import.meta.dir, "../.."));
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it("`faqir add alert` installs the canonical callout, not a phantom 'alert'", async () => {
    await init([]);
    await add(["alert"]);

    const config = await readConfig(TEST_DIR);
    expect(config.installed.primitives).toContain("callout");
    expect(config.installed.primitives).not.toContain("alert");

    const dir = join(TEST_DIR, "ui/primitives/callout");
    expect(existsSync(join(dir, "callout.css"))).toBe(true);
    expect(existsSync(join(dir, "callout.manifest.json"))).toBe(true);
    // No duplicated payload: there is no ui/primitives/alert directory.
    expect(existsSync(join(TEST_DIR, "ui/primitives/alert"))).toBe(false);
  });

  it("the dismiss part is audit-valid (adds no findings beyond the pre-existing print !important)", async () => {
    await init([]);
    await add(["alert"]);

    const summary = await runAudit({ cwd: TEST_DIR });
    // Every finding, if any, is the pre-existing no-important print override.
    expect(summary.results.every((r) => r.rule_id === "no-important")).toBe(true);
    // Nothing the dismiss part introduced is flagged.
    expect(summary.results.some((r) => r.message.toLowerCase().includes("dismiss"))).toBe(false);
  });

  it("`faqir list` shows the alert alias", async () => {
    const text = await captureLog(() => list([]));
    expect(text).toContain("ALIASES");
    expect(text).toContain("alert");
    expect(text).toContain("callout");
  });

  it("`faqir search alert` resolves to callout via the alias", async () => {
    const text = await captureLog(() => search(["alert"]));
    expect(text).toContain("callout");
    expect(text.toLowerCase()).toContain("alias");
    expect(text).toContain("alert");
  });

  it("`faqir search dismiss` finds callout via its description", async () => {
    const text = await captureLog(() => search(["dismiss"]));
    expect(text).toContain("callout");
  });

  it("context.json (in-memory + written file) carries the alert alias", async () => {
    await init([]);
    await add(["alert"]);

    const data = await generateContext(TEST_DIR);
    expect((data.components.callout as any).aliases).toEqual(["alert"]);
    expect(formatContextJSON(data)).toContain("alert");

    // add() also writes .faqir/context.json via regenerateContext.
    const written = await Bun.file(join(TEST_DIR, ".faqir/context.json")).json();
    expect(written.components.callout.aliases).toEqual(["alert"]);
  });

  it("skill output lists the alert alias so agents can discover it", async () => {
    await init([]);
    await add(["alert"]);

    const skill = await generateSkill(TEST_DIR);
    expect(skill).toContain("Aliases");
    expect(skill).toContain("alert");
    expect(skill).toContain("callout");
  });
});
