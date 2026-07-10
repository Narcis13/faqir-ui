// ═══════════════════════════════════════════════════════════════════════════
// Primitives batch 2: breadcrumb, toggle, collapsible, aspect-ratio  [task 0.4-02]
// ═══════════════════════════════════════════════════════════════════════════
//
// Four CSS-only primitives. Each ships a schema-valid manifest with its
// variants/states enumerated, a reference page that audits clean, and CSS whose
// colors and spacing only ever reference tokens. Batch-2 specifics:
//   • breadcrumb — <nav aria-label="Breadcrumb"> with item/separator/current
//     parts; the current crumb carries aria-current="page" (asserted via the
//     HTML parser).
//   • toggle — pressed state driven purely by aria-pressed (CSS selector asserted).
//   • collapsible — native <details>/<summary>, so it opens/closes with ZERO JS.
//   • aspect-ratio — CSS wrapper with ratio variants.

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
import { extractComponents } from "../../src/parser/html-parser";
import { init } from "../../src/commands/init";
import { add } from "../../src/commands/add";
import { readConfig } from "../../src/utils/config";
import { runAudit } from "../../src/audit/checker";

const REGISTRY = join(import.meta.dir, "../../registry");
const BATCH = ["breadcrumb", "toggle", "collapsible", "aspect-ratio"] as const;

async function loadBatchManifest(name: string): Promise<Manifest> {
  return Bun.file(
    join(REGISTRY, "primitives", name, `${name}.manifest.json`)
  ).json();
}

async function loadBatchCss(name: string): Promise<string> {
  return Bun.file(join(REGISTRY, "primitives", name, `${name}.css`)).text();
}

async function loadBatchHtml(name: string): Promise<string> {
  return Bun.file(join(REGISTRY, "primitives", name, `${name}.html`)).text();
}

// ── Manifest validation ──
describe("batch 2 · manifests are schema-valid with variants/states enumerated", () => {
  for (const name of BATCH) {
    it(`${name}.manifest.json passes validateManifest`, async () => {
      const json = await loadBatchManifest(name);
      expect(validateManifest(json)).toEqual([]);
    });
  }

  it("breadcrumb is a <nav>, requires the current slot, enumerates sizes", async () => {
    const m = await loadBatchManifest("breadcrumb");
    expect(m.anatomy.tag).toBe("nav");
    expect(m.slots.current.required).toBe(true);
    expect(m.slots.separator.required).toBe(false);
    expect(m.slots.item.selector).toBe("[data-part='item']");
    expect(m.variants.size.values).toEqual(["sm", "md", "lg"]);
    expect(m.a11y.required_attrs).toContain('aria-current="page" on current');
    expect(m.states).toEqual({});
  });

  it("toggle is a <button>, models the pressed state off aria-pressed", async () => {
    const m = await loadBatchManifest("toggle");
    expect(m.anatomy.tag).toBe("button");
    expect(m.slots).toEqual({});
    expect(m.states.pressed.attr).toBe("aria-pressed");
    expect(m.variants.size.values).toEqual(["sm", "md", "lg"]);
    expect(m.a11y.required_attrs).toContain('type="button" on root');
  });

  it("collapsible is a <details> with required trigger+content and zero JS", async () => {
    const m = await loadBatchManifest("collapsible");
    expect(m.anatomy.tag).toBe("details");
    expect(m.slots.trigger.required).toBe(true);
    expect(m.slots.content.required).toBe(true);
    expect(m.variants.visual.values).toEqual(["default", "bordered"]);
    // No controller: a primitive built on native <details> ships no JS file.
    expect(m.files.js).toBeUndefined();
    expect(m.kind).toBe("primitive");
  });

  it("aspect-ratio is a wrapper with ratio variants, no slots", async () => {
    const m = await loadBatchManifest("aspect-ratio");
    expect(m.anatomy.tag).toBe("div");
    expect(m.slots).toEqual({});
    expect(m.variants.ratio.values).toEqual(["square", "16-9", "4-3", "3-2", "21-9", "portrait"]);
    expect(m.variants.ratio.default).toBe("square");
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

describe("batch 2 · CSS uses tokens only (no literal colors or spacing)", () => {
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

    it(`${name}.css that animates also gates motion on prefers-reduced-motion`, async () => {
      const css = await loadBatchCss(name);
      if (hasAnimationProperties(css)) {
        expect(hasReducedMotionQuery(css)).toBe(true);
      }
    });
  }

  it("toggle.css reacts to aria-pressed=\"true\" (pressed styling is pure CSS)", async () => {
    const css = await loadBatchCss("toggle");
    expect(css).toContain('[data-ui="toggle"][aria-pressed="true"]');
  });

  it("collapsible.css animates the disclosure and gates it on reduced-motion", async () => {
    const css = await loadBatchCss("collapsible");
    expect(hasAnimationProperties(css)).toBe(true);
    expect(hasReducedMotionQuery(css)).toBe(true);
    // Animation rides on ::details-content — no JS toggling required.
    expect(css).toContain("::details-content");
  });
});

// ── Breadcrumb a11y structure (parser-based) ──
describe("batch 2 · breadcrumb a11y structure is well-formed", () => {
  it("every breadcrumb is a <nav aria-label=\"Breadcrumb\"> whose current crumb has aria-current=\"page\"", async () => {
    const html = await loadBatchHtml("breadcrumb");
    const components = extractComponents(html, "breadcrumb.html").filter(
      (c) => c.name === "breadcrumb"
    );

    expect(components.length).toBeGreaterThan(0);

    for (const bc of components) {
      // Root is a nav labelled "Breadcrumb"
      expect(bc.root.tag).toBe("nav");
      expect(bc.root.attrs["aria-label"]).toBe("Breadcrumb");

      // Exactly one current crumb, carrying aria-current="page"
      const current = bc.parts["current"] ?? [];
      expect(current.length).toBe(1);
      expect(current[0].attrs["aria-current"]).toBe("page");

      // Separators, when present, are hidden from assistive tech
      for (const sep of bc.parts["separator"] ?? []) {
        expect(sep.attrs["aria-hidden"]).toBe("true");
      }
    }
  });
});

// ── Collapsible: zero JavaScript ──
describe("batch 2 · collapsible opens/closes with zero JavaScript", () => {
  it("ships no controller and is built on native <details>/<summary>", async () => {
    // No JS file in the component directory.
    expect(
      existsSync(join(REGISTRY, "primitives/collapsible/collapsible.js"))
    ).toBe(false);

    const html = await loadBatchHtml("collapsible");
    expect(html).toContain("<details data-ui=\"collapsible\"");
    expect(html).toContain("<summary data-part=\"trigger\"");
    // No <script> anywhere in the reference page.
    expect(html.toLowerCase()).not.toContain("<script");
  });
});

// ── End-to-end: faqir add + audit of the reference pages ──
const TEST_DIR = join(import.meta.dir, "../.tmp-batch2-test");

describe("batch 2 · faqir add works end-to-end and reference pages audit clean", () => {
  beforeEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it("adds all four — files copied, listed in inventory, zero audit findings", async () => {
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

    // The copied reference pages are scanned by the audit — zero findings of any
    // severity across HTML rules and CSS-level checks.
    const summary = await runAudit({ cwd: TEST_DIR });
    expect(summary.results).toEqual([]);
    expect(summary.passed).toBe(true);
  });
});
