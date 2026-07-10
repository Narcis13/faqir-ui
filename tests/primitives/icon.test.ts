// ═══════════════════════════════════════════════════════════════════════════
// Icon primitive — registry artifacts  [task 0.4-04 · §B4]
// ═══════════════════════════════════════════════════════════════════════════
//
// The `icon` primitive renders ~120 Lucide (ISC) glyphs from CSS alone: each is
// a data-URI SVG applied as a `mask-image` on a `background-color: currentColor`
// box, so icons inherit text color and size with `font-size` (1em). No icon
// fonts, no runtime SVG fetch, zero JavaScript.
//
// These tests pin the registry-facing contract:
//   • manifest is schema-valid and machine-enumerable (every name listed)
//   • bijection: manifest names ⇔ [data-icon="…"] CSS rules
//   • every data-URI is valid/escaped and parses back to a real SVG
//   • base rule uses mask + currentColor + 1em sizing
//   • license attribution file is present and referenced
//   • the reference page renders the full grid, colored by currentColor
//   • faqir add icon installs cleanly and the reference page audits with 0 findings
// (Build-side tests — determinism, optimizer, encoder — live in
// tests/build/build-icons.test.ts.)

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { validateManifest, type Manifest } from "../../src/manifest";
import { findClassSelectors, findIdSelectors, findImportantDeclarations } from "../../src/parser/css-parser";
import { extractComponents } from "../../src/parser/html-parser";
import { init } from "../../src/commands/init";
import { add } from "../../src/commands/add";
import { readConfig } from "../../src/utils/config";
import { runAudit } from "../../src/audit/checker";

const ROOT = join(import.meta.dir, "../..");
const ICON_DIR = join(ROOT, "registry", "primitives", "icon");

const css = readFileSync(join(ICON_DIR, "icons.css"), "utf8");
const html = readFileSync(join(ICON_DIR, "icon.html"), "utf8");
const manifest = JSON.parse(readFileSync(join(ICON_DIR, "icon.manifest.json"), "utf8")) as Manifest & {
  icon_set?: { source: string; license: string; attribution_file: string; count: number };
};

const DATA_ICON_RE = /\[data-icon="([^"]+)"\]/g;
function cssRuleNames(source: string): string[] {
  return [...source.matchAll(DATA_ICON_RE)].map((m) => m[1]);
}

// ── Manifest: schema-valid + machine-enumerable ──────────────────────────────
describe("icon · manifest", () => {
  it("passes validateManifest", () => {
    expect(validateManifest(manifest)).toEqual([]);
  });

  it("enumerates every icon name as variants.icon.values (attr data-icon)", () => {
    const v = manifest.variants.icon;
    expect(Array.isArray(v.values)).toBe(true);
    expect(v.values.length).toBe(120);
    expect(v.values.every((n) => typeof n === "string" && n.length > 0)).toBe(true);
    expect(v.attr).toBe("data-icon");
    // Machine-enumerable: sorted, unique.
    expect([...v.values].sort()).toEqual(v.values);
    expect(new Set(v.values).size).toBe(v.values.length);
    // The declared default is itself a real glyph.
    expect(v.values).toContain(v.default);
  });

  it("is a CSS-only span primitive that uses no design tokens", () => {
    expect(manifest.kind).toBe("primitive");
    expect(manifest.anatomy.tag).toBe("span");
    expect(manifest.files.js).toBeUndefined();
    expect(manifest.tokens_used).toEqual([]);
    expect(manifest.files.css).toBe("icons.css");
  });
});

// ── Bijection: manifest names ⇔ CSS [data-icon] rules ────────────────────────
describe("icon · bijection between manifest names and CSS rules", () => {
  it("every manifest name has exactly one [data-icon] rule, and vice versa", () => {
    const names = manifest.variants.icon.values;
    const rules = cssRuleNames(css);

    // No duplicate rules.
    expect(new Set(rules).size).toBe(rules.length);
    // Same cardinality.
    expect(rules.length).toBe(names.length);
    // Bidirectional set equality.
    const nameSet = new Set(names);
    const ruleSet = new Set(rules);
    expect(names.filter((n) => !ruleSet.has(n))).toEqual([]);
    expect(rules.filter((r) => !nameSet.has(r))).toEqual([]);
  });
});

// ── Base rule: mask + currentColor + 1em ─────────────────────────────────────
describe("icon · base rule", () => {
  it("renders via mask on a currentColor box, sized 1em", () => {
    const base = css.slice(css.indexOf('[data-ui="icon"]'), css.indexOf("/* ── Glyphs"));
    expect(base).toContain("mask: var(--icon) center / contain no-repeat;");
    expect(base).toContain("-webkit-mask: var(--icon) center / contain no-repeat;");
    expect(base).toContain("background-color: currentColor;");
    expect(base).toContain("width: 1em;");
    expect(base).toContain("height: 1em;");
  });

  it("has no class/ID selectors and no !important", () => {
    expect(findClassSelectors(css)).toEqual([]);
    expect(findIdSelectors(css)).toEqual([]);
    expect(findImportantDeclarations(css)).toEqual([]);
  });
});

// ── Data-URIs are valid / escaped / parseable ────────────────────────────────
describe("icon · data-URIs", () => {
  const PREFIX = "data:image/svg+xml,";
  const uris = [...css.matchAll(/--icon:\s*url\("([^"]+)"\);/g)].map((m) => m[1]);

  it("there is one data-URI per glyph, each an image/svg+xml URI", () => {
    expect(uris.length).toBe(120);
    for (const u of uris) expect(u.startsWith(PREFIX)).toBe(true);
  });

  it("reserved characters are escaped (no raw <, >, #, or \" in the payload)", () => {
    for (const u of uris) {
      const payload = u.slice(PREFIX.length);
      expect(payload).not.toContain("<");
      expect(payload).not.toContain(">");
      expect(payload).not.toContain("#");
      expect(payload).not.toContain('"');
    }
  });

  it("a sample decodes and parses back into a real 24×24 SVG", () => {
    // DOMParser comes from happy-dom (registered in tests/setup.ts).
    const sample = uris.find((u) => u.includes("data:image/svg+xml"))!;
    const svg = decodeURIComponent(sample.slice(PREFIX.length));
    expect(svg.startsWith("<svg")).toBe(true);
    const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
    expect(doc.querySelector("parsererror")).toBeNull();
    const root = doc.documentElement;
    expect(root.tagName.toLowerCase()).toBe("svg");
    expect(root.getAttribute("viewBox")).toBe("0 0 24 24");
    // At least one drawing element survived optimization.
    expect(doc.querySelectorAll("path, circle, line, rect, polyline, polygon, ellipse").length).toBeGreaterThan(0);
  });

  it("every data-URI decodes to a well-formed <svg>…</svg>", () => {
    for (const u of uris) {
      const svg = decodeURIComponent(u.slice(PREFIX.length));
      expect(svg.startsWith("<svg")).toBe(true);
      expect(svg.endsWith("</svg>")).toBe(true);
    }
  });
});

// ── License attribution present + referenced ─────────────────────────────────
describe("icon · license attribution", () => {
  const licensePath = join(ICON_DIR, "LICENSE.lucide");

  it("the attribution file is present with the ISC text and copyright", () => {
    expect(existsSync(licensePath)).toBe(true);
    const text = readFileSync(licensePath, "utf8");
    expect(text).toContain("ISC License");
    expect(text).toContain("Lucide");
    expect(text).toContain("Permission to use, copy, modify");
  });

  it("is referenced from icons.css and named in the manifest's icon_set", () => {
    expect(css).toContain("LICENSE.lucide");
    expect(css.toLowerCase()).toContain("lucide");
    expect(manifest.icon_set?.attribution_file).toBe("LICENSE.lucide");
    expect(manifest.icon_set?.license).toBe("ISC");
    expect(manifest.icon_set?.count).toBe(120);
  });
});

// ── Reference page: the full grid, colored by currentColor ───────────────────
describe("icon · reference page", () => {
  it("renders every icon as a labeled [data-ui=\"icon\"] element", () => {
    const components = extractComponents(html, "icon.html").filter((c) => c.name === "icon");
    expect(components.length).toBe(120);

    const shown = new Set<string>();
    for (const c of components) {
      expect(c.root.tag).toBe("span");
      const name = c.root.attrs["data-icon"];
      expect(typeof name).toBe("string");
      // Meaningful icons in the showcase are labeled.
      expect(c.root.attrs["role"]).toBe("img");
      expect(c.root.attrs["aria-label"]).toBe(name);
      // No class attribute (Faqir uses data-* attributes, not classes).
      expect("class" in c.root.attrs).toBe(false);
      shown.add(name);
    }
    // The grid shows the whole curated set.
    expect([...shown].sort()).toEqual([...manifest.variants.icon.values].sort());
  });

  it("inherits color via currentColor (no per-icon hardcoded color)", () => {
    // The grid sets color on an ancestor; icons themselves carry no color.
    expect(html).toContain("currentColor");
    expect(html).not.toMatch(/data-icon="[^"]+"[^>]*style="[^"]*#[0-9a-fA-F]{3}/);
  });
});

// ── End-to-end: faqir add icon → clean install + audit ───────────────────────
const TEST_DIR = join(import.meta.dir, "../.tmp-icon-test");
describe("icon · faqir add works end-to-end and the reference page audits clean", () => {
  beforeEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DIR, { recursive: true });
  });
  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it("installs the four artifacts, registers the primitive, and finds zero audit issues", async () => {
    const origCwd = process.cwd();
    process.chdir(TEST_DIR);
    try {
      await init([]);
      await add(["icon"]);
    } finally {
      process.chdir(origCwd);
    }

    const config = await readConfig(TEST_DIR);
    expect(config.installed.primitives).toContain("icon");
    const dir = join(TEST_DIR, "ui/primitives/icon");
    for (const f of ["icons.css", "icon.manifest.json", "icon.html", "LICENSE.lucide"]) {
      expect(existsSync(join(dir, f))).toBe(true);
    }

    const summary = await runAudit({ cwd: TEST_DIR });
    expect(summary.results).toEqual([]);
    expect(summary.passed).toBe(true);
  });
});
