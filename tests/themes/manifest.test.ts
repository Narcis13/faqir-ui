// ═══════════════════════════════════════════════════════════════════════════
// Theme manifest gate — every theme has a valid, CSS-consistent manifest  [0.4-12]
// ═══════════════════════════════════════════════════════════════════════════
//
// Every shipped theme ships `registry/themes/{name}.theme.json` next to its
// stylesheet. The two token fields are DERIVED from the CSS (never hand-written):
// this suite re-derives them and asserts the stored manifest still matches, so a
// hand-edit that drifts from the CSS — or a new override added to the CSS without
// regenerating — fails CI. Regenerate with `bun run gen:theme-manifests`.
//
// Fully data-driven: themes are globbed, the base surface is parsed from
// registry/tokens/*.css. Adding a sixth theme needs no edits here — only a seed
// entry in the generator and a fresh run.

import { describe, it, expect } from "bun:test";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { Glob } from "bun";
import {
  validateThemeManifest,
  overriddenTokens,
  inheritedTokens,
  surfaceTokens,
  isSurfaceTokenFile,
  type ThemeManifest,
} from "../../src/theme-manifest";

const REGISTRY = join(import.meta.dir, "../../registry");
const THEMES_DIR = join(REGISTRY, "themes");
const TOKENS_DIR = join(REGISTRY, "tokens");

// The base token surface — every base stylesheet minus raw palette primitives.
const BASE_SOURCES = [...new Glob("*.css").scanSync(TOKENS_DIR)]
  .filter(isSurfaceTokenFile)
  .map((f) => readFileSync(join(TOKENS_DIR, f), "utf8"));
const SURFACE = surfaceTokens(BASE_SOURCES);

// Themes discovered by globbing (no hand-maintained list).
const THEME_FILES = [...new Glob("*.css").scanSync(THEMES_DIR)].sort();

function readManifestRaw(cssFile: string): { path: string; json: unknown } {
  const path = join(THEMES_DIR, cssFile.replace(/\.css$/, ".theme.json"));
  return { path, json: JSON.parse(readFileSync(path, "utf8")) };
}

describe("theme manifest · every theme has one", () => {
  it("discovers the shipped themes by globbing", () => {
    expect(THEME_FILES.length).toBeGreaterThanOrEqual(5);
  });

  for (const file of THEME_FILES) {
    it(`${file} has a sibling ${file.replace(/\.css$/, ".theme.json")}`, () => {
      const path = join(THEMES_DIR, file.replace(/\.css$/, ".theme.json"));
      expect(existsSync(path)).toBe(true);
    });
  }
});

describe("theme manifest · schema validation", () => {
  for (const file of THEME_FILES) {
    it(`${file} manifest passes schema validation`, () => {
      const { json } = readManifestRaw(file);
      expect(validateThemeManifest(json)).toEqual([]);
    });
  }

  it("manifest name matches the stylesheet filename", () => {
    for (const file of THEME_FILES) {
      const { json } = readManifestRaw(file);
      expect((json as ThemeManifest).name).toBe(file.replace(/\.css$/, ""));
    }
  });
});

describe("theme manifest · tokens are CSS-consistent (generated, then asserted)", () => {
  for (const file of THEME_FILES) {
    it(`${file} tokens_overridden exactly matches the parsed CSS`, () => {
      const css = readFileSync(join(THEMES_DIR, file), "utf8");
      const { json } = readManifestRaw(file);
      const manifest = json as ThemeManifest;
      // Re-derive from the CSS and compare to what's stored on disk.
      expect(manifest.tokens_overridden).toEqual(overriddenTokens(css));
    });

    it(`${file} tokens_inherited is exactly surface − overridden`, () => {
      const css = readFileSync(join(THEMES_DIR, file), "utf8");
      const { json } = readManifestRaw(file);
      const manifest = json as ThemeManifest;
      expect(manifest.tokens_inherited).toEqual(inheritedTokens(css, SURFACE));
    });

    it(`${file} overridden and inherited never overlap`, () => {
      const { json } = readManifestRaw(file);
      const manifest = json as ThemeManifest;
      const inherited = new Set(manifest.tokens_inherited);
      const overlap = manifest.tokens_overridden.filter((t) => inherited.has(t));
      expect(overlap).toEqual([]);
    });
  }
});

// ── The surface itself: what a theme may re-declare ──
describe("theme manifest · the token surface", () => {
  // 1.1A-01 added the three type ROLES plus the four heading-voice knobs. Pinned
  // as a count so a token quietly added to (or dropped from) tokens/*.css shows
  // up here as a number that moved, and as names so the 1.1 type contract cannot
  // be renamed without this failing.
  const ROLE_TOKENS = [
    "font-heading",
    "font-body",
    "font-ui",
    "heading-weight",
    "heading-tracking",
    "heading-transform",
    "heading-leading",
  ];

  it("is 241 tokens — the 1.0 surface of 234 plus the seven type roles [1.1A-01]", () => {
    expect(SURFACE.length).toBe(241);
  });

  it("contains every type role and voice token", () => {
    expect(ROLE_TOKENS.filter((t) => !SURFACE.includes(t))).toEqual([]);
  });

  it("every theme accounts for them — inherited unless it overrides them", () => {
    for (const file of THEME_FILES) {
      const manifest = readManifestRaw(file).json as ThemeManifest;
      const known = new Set([...manifest.tokens_inherited, ...manifest.tokens_overridden]);
      expect({ [file]: ROLE_TOKENS.filter((t) => !known.has(t)) }).toEqual({ [file]: [] });
    }
  });
});

// ── Proof the schema gate has teeth ──
describe("theme manifest · validator rejects malformed manifests", () => {
  const valid: ThemeManifest = {
    name: "x",
    version: "1.0.0",
    mood: ["neutral"],
    scheme: "both",
    dark_mode: "native",
    tokens_overridden: ["color-bg"],
    tokens_inherited: ["space-4"],
    pairs_with: [],
    preview: "x.preview.html",
  };

  it("accepts a well-formed manifest", () => {
    expect(validateThemeManifest(valid)).toEqual([]);
  });

  it("rejects a non-object", () => {
    expect(validateThemeManifest("nope").length).toBe(1);
  });

  it("rejects an unknown scheme", () => {
    const errors = validateThemeManifest({ ...valid, scheme: "sepia" });
    expect(errors.some((e) => e.field === "scheme")).toBe(true);
  });

  it("rejects an empty mood array", () => {
    const errors = validateThemeManifest({ ...valid, mood: [] });
    expect(errors.some((e) => e.field === "mood")).toBe(true);
  });

  it("rejects empty tokens_overridden", () => {
    const errors = validateThemeManifest({ ...valid, tokens_overridden: [] });
    expect(errors.some((e) => e.field === "tokens_overridden")).toBe(true);
  });

  it("rejects scheme/dark_mode inconsistency", () => {
    // light-only scheme must pair with dark_mode: none
    const errors = validateThemeManifest({ ...valid, scheme: "light", dark_mode: "native" });
    expect(errors.some((e) => e.field === "dark_mode")).toBe(true);
  });

  it("accepts a consistent light-only manifest", () => {
    expect(validateThemeManifest({ ...valid, scheme: "light", dark_mode: "none" })).toEqual([]);
  });
});
