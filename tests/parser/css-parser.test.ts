import { describe, it, expect } from "bun:test";
import {
  extractTokenReferences,
  extractTokenDefinitions,
  hasReducedMotionQuery,
  hasAnimationProperties,
  collectDefinedTokens,
} from "../../src/parser/css-parser";

describe("CSS Parser", () => {
  describe("extractTokenReferences", () => {
    it("extracts var() references", () => {
      const css = `
[data-ui="button"] {
  background: var(--color-primary);
  color: var(--color-primary-fg);
  border-radius: var(--radius-md);
}`;
      const refs = extractTokenReferences(css);
      expect(refs.length).toBe(3);
      expect(refs[0].name).toBe("color-primary");
      expect(refs[1].name).toBe("color-primary-fg");
      expect(refs[2].name).toBe("radius-md");
    });

    it("handles var() with fallback", () => {
      const css = `[data-ui="button"] { height: var(--button-height-md, 40px); }`;
      const refs = extractTokenReferences(css);
      expect(refs.length).toBe(1);
      expect(refs[0].name).toBe("button-height-md");
    });

    it("extracts line numbers", () => {
      const css = `line1\nline2\n  color: var(--color-fg);\nline4`;
      const refs = extractTokenReferences(css);
      expect(refs[0].line).toBe(3);
    });

    it("returns empty for CSS without var()", () => {
      const css = `[data-ui="button"] { display: flex; }`;
      const refs = extractTokenReferences(css);
      expect(refs.length).toBe(0);
    });
  });

  describe("extractTokenDefinitions", () => {
    it("extracts custom property definitions", () => {
      const css = `
:root {
  --color-primary: oklch(0.55 0.22 264);
  --color-bg: white;
  --space-4: 1rem;
}`;
      const defs = extractTokenDefinitions(css);
      expect(defs.length).toBe(3);
      expect(defs[0].name).toBe("color-primary");
      expect(defs[0].value).toBe("oklch(0.55 0.22 264)");
      expect(defs[1].name).toBe("color-bg");
      expect(defs[2].name).toBe("space-4");
    });

    it("handles var() references in values", () => {
      const css = `:root { --color-bg: var(--palette-gray-25); }`;
      const defs = extractTokenDefinitions(css);
      expect(defs[0].value).toBe("var(--palette-gray-25)");
    });
  });

  describe("hasReducedMotionQuery", () => {
    it("detects prefers-reduced-motion media query", () => {
      const css = `
@media (prefers-reduced-motion: reduce) {
  [data-ui="button"] { transition: none; }
}`;
      expect(hasReducedMotionQuery(css)).toBe(true);
    });

    it("returns false when absent", () => {
      const css = `[data-ui="button"] { transition: all 0.2s; }`;
      expect(hasReducedMotionQuery(css)).toBe(false);
    });
  });

  describe("hasAnimationProperties", () => {
    it("detects transition property", () => {
      const css = `[data-ui="button"] { transition: background 100ms ease; }`;
      expect(hasAnimationProperties(css)).toBe(true);
    });

    it("detects animation property", () => {
      const css = `[data-ui="spinner"] { animation: spin 1s linear infinite; }`;
      expect(hasAnimationProperties(css)).toBe(true);
    });

    it("returns false for static CSS", () => {
      const css = `[data-ui="card"] { border: 1px solid var(--color-border); }`;
      expect(hasAnimationProperties(css)).toBe(false);
    });
  });

  describe("collectDefinedTokens", () => {
    it("collects tokens from multiple sources", () => {
      const sources = [
        `:root { --color-primary: blue; --color-bg: white; }`,
        `:root { --space-4: 1rem; --radius-md: 6px; }`,
      ];
      const tokens = collectDefinedTokens(sources);
      expect(tokens.has("color-primary")).toBe(true);
      expect(tokens.has("color-bg")).toBe(true);
      expect(tokens.has("space-4")).toBe(true);
      expect(tokens.has("radius-md")).toBe(true);
      expect(tokens.has("nonexistent")).toBe(false);
    });
  });
});
