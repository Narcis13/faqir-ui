// ═══════════════════════════════════════════════════════════════════════════
// Primitives batch 1: skeleton, chip, link  [task 0.4-01]
// ═══════════════════════════════════════════════════════════════════════════
//
// Three CSS-only primitives. Each must ship a schema-valid manifest with its
// variants/states enumerated, a reference page that audits clean, and CSS whose
// colors and spacing only ever reference tokens (the token-literal check from
// the audit parser, extended here to spacing properties).

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
  hasAnimationProperties,
  hasReducedMotionQuery,
} from "../../src/parser/css-parser";
import { init } from "../../src/commands/init";
import { add } from "../../src/commands/add";
import { readConfig } from "../../src/utils/config";
import { runAudit } from "../../src/audit/checker";

const REGISTRY = join(import.meta.dir, "../../registry");
const BATCH = ["skeleton", "chip", "link"] as const;

async function loadBatchManifest(name: string): Promise<Manifest> {
  return Bun.file(
    join(REGISTRY, "primitives", name, `${name}.manifest.json`)
  ).json();
}

async function loadBatchCss(name: string): Promise<string> {
  return Bun.file(join(REGISTRY, "primitives", name, `${name}.css`)).text();
}

// ── Manifest validation ──
describe("batch 1 · manifests are schema-valid with variants/states enumerated", () => {
  for (const name of BATCH) {
    it(`${name}.manifest.json passes validateManifest`, async () => {
      const json = await loadBatchManifest(name);
      expect(validateManifest(json)).toEqual([]);
    });
  }

  it("skeleton enumerates text/circle/rect shape variants", async () => {
    const m = await loadBatchManifest("skeleton");
    expect(m.variants.shape.values).toEqual(["text", "circle", "rect"]);
    expect(m.variants.shape.default).toBe("text");
    expect(m.variants.shape.attr).toBe("data-variant");
    expect(m.states).toEqual({});
  });

  it("chip declares a required label slot and an optional dismiss slot", async () => {
    const m = await loadBatchManifest("chip");
    expect(m.slots.label.required).toBe(true);
    expect(m.slots.dismiss.required).toBe(false);
    expect(m.slots.dismiss.selector).toBe("[data-part='dismiss']");
    expect(m.variants.visual.values).toContain("primary");
    expect(m.states).toEqual({});
  });

  it("link enumerates default/external/muted variants", async () => {
    const m = await loadBatchManifest("link");
    expect(m.variants.style.values).toEqual(["default", "external", "muted"]);
    expect(m.anatomy.tag).toBe("a");
    expect(m.states).toEqual({});
  });
});

// ── CSS assertions ──

// Spacing extension of the token-literal check: spacing properties may only use
// tokens (or 0 / calc over tokens) — never literal lengths.
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
    // Strip var() references (including their fallbacks); whatever length
    // literal remains is hardcoded spacing.
    const stripped = value.replace(/var\([^)]*\)/g, "");
    if (LENGTH_LITERAL_RE.test(stripped)) findings.push(line);
  }
  return findings;
}

describe("batch 1 · CSS uses tokens only (no literal colors or spacing)", () => {
  for (const name of BATCH) {
    it(`${name}.css has zero hardcoded color values`, async () => {
      const css = await loadBatchCss(name);
      expect(findHardcodedColorValues(css)).toEqual([]);
    });

    it(`${name}.css has zero hardcoded spacing values`, async () => {
      const css = await loadBatchCss(name);
      expect(findSpacingLiterals(css)).toEqual([]);
    });

    it(`${name}.css has no class/ID selectors and no !important`, async () => {
      const css = await loadBatchCss(name);
      expect(findClassSelectors(css)).toEqual([]);
      expect(findIdSelectors(css)).toEqual([]);
      expect(findImportantDeclarations(css)).toEqual([]);
    });

    it(`${name}.css uses only logical (direction-agnostic) properties`, async () => {
      const css = await loadBatchCss(name);
      expect(findLogicalPropertyViolations(css)).toEqual([]);
    });
  }

  it("skeleton.css animates and gates the shimmer on prefers-reduced-motion", async () => {
    const css = await loadBatchCss("skeleton");
    expect(hasAnimationProperties(css)).toBe(true);
    expect(hasReducedMotionQuery(css)).toBe(true);
  });

  it("the spacing check itself catches a literal (proof it can fail)", () => {
    const bad = `[data-ui="x"] {\n  padding: 4px 8px;\n  margin-inline-start: 0.5rem;\n}`;
    expect(findSpacingLiterals(bad).length).toBe(2);
    const good = `[data-ui="x"] {\n  padding: 0 var(--space-2);\n  margin-inline-end: calc(var(--space-1) * -1);\n}`;
    expect(findSpacingLiterals(good)).toEqual([]);
  });
});

// ── End-to-end: faqir add + audit of the reference pages ──
const TEST_DIR = join(import.meta.dir, "../.tmp-batch1-test");

describe("batch 1 · faqir add works end-to-end and reference pages audit clean", () => {
  beforeEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it("adds skeleton, chip, link — files copied, listed in inventory, zero audit findings", async () => {
    const origCwd = process.cwd();
    process.chdir(TEST_DIR);
    try {
      await init([]);
      await add([...BATCH]);
    } finally {
      process.chdir(origCwd);
    }

    const config = await readConfig(TEST_DIR);
    for (const name of BATCH) {
      expect(config.installed.primitives).toContain(name);
      const dir = join(TEST_DIR, "ui/primitives", name);
      expect(existsSync(join(dir, `${name}.html`))).toBe(true);
      expect(existsSync(join(dir, `${name}.css`))).toBe(true);
      expect(existsSync(join(dir, `${name}.manifest.json`))).toBe(true);
    }

    // The copied reference pages are scanned by the audit — zero findings
    // of any severity across HTML rules and CSS-level checks.
    const summary = await runAudit({ cwd: TEST_DIR });
    expect(summary.results).toEqual([]);
    expect(summary.passed).toBe(true);
  });
});
