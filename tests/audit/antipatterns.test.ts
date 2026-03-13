import { describe, it, expect } from "bun:test";
import {
  findImportantDeclarations,
  findClassSelectors,
  findIdSelectors,
  findHardcodedColorValues,
} from "../../src/parser/css-parser";
import { findExternalImports, findDataFetching } from "../../src/parser/js-parser";

describe("CSS Anti-Pattern Detection", () => {
  describe("findImportantDeclarations — anti-pattern #8: no !important", () => {
    it("detects !important in a rule", () => {
      const css = `[data-ui="button"] { color: red !important; }`;
      expect(findImportantDeclarations(css).length).toBe(1);
      expect(findImportantDeclarations(css)[0].line).toBe(1);
    });

    it("passes clean CSS", () => {
      const css = `[data-ui="button"] { color: var(--color-fg); }`;
      expect(findImportantDeclarations(css).length).toBe(0);
    });

    it("ignores !important inside comments", () => {
      const css = `/* use !important sparingly */\n[data-ui="button"] { color: var(--color-fg); }`;
      expect(findImportantDeclarations(css).length).toBe(0);
    });

    it("detects multiple !important on separate lines", () => {
      const css = `[data-ui="button"] {\n  color: red !important;\n  margin: 0 !important;\n}`;
      expect(findImportantDeclarations(css).length).toBe(2);
    });
  });

  describe("findClassSelectors — anti-pattern #1: no class names", () => {
    it("detects a simple class selector", () => {
      const css = `.btn { color: red; }`;
      expect(findClassSelectors(css).length).toBe(1);
      expect(findClassSelectors(css)[0].text).toBe(".btn");
    });

    it("detects class selector after attribute selector", () => {
      const css = `[data-ui="button"].active { color: red; }`;
      const results = findClassSelectors(css);
      expect(results.length).toBe(1);
      expect(results[0].text).toBe(".active");
    });

    it("detects class selector in descendant combinator", () => {
      const css = `[data-ui="button"] .icon { display: flex; }`;
      expect(findClassSelectors(css).length).toBe(1);
    });

    it("passes attribute-only selectors", () => {
      const css = `[data-ui="button"] { color: var(--color-fg); }\n[data-ui="button"]:hover { color: var(--color-primary); }`;
      expect(findClassSelectors(css).length).toBe(0);
    });

    it("ignores class-like patterns in string values", () => {
      const css = `[data-ui="button"]::after { content: ".icon"; }`;
      expect(findClassSelectors(css).length).toBe(0);
    });

    it("ignores class-like patterns in comments", () => {
      const css = `/* .btn is an old pattern */\n[data-ui="button"] { color: var(--color-fg); }`;
      expect(findClassSelectors(css).length).toBe(0);
    });
  });

  describe("findIdSelectors — anti-pattern #9: no ID selectors", () => {
    it("detects an ID selector", () => {
      const css = `#main-button { color: red; }`;
      expect(findIdSelectors(css).length).toBe(1);
      expect(findIdSelectors(css)[0].text).toBe("#main-button");
    });

    it("detects ID selector combined with attribute selector", () => {
      const css = `[data-ui="button"]#submit { color: red; }`;
      expect(findIdSelectors(css).length).toBe(1);
    });

    it("does not flag hex color #fff", () => {
      const css = `[data-ui="button"] { color: #fff; }`;
      expect(findIdSelectors(css).length).toBe(0);
    });

    it("does not flag hex color #ffffff", () => {
      const css = `[data-ui="button"] { color: #ffffff; }`;
      expect(findIdSelectors(css).length).toBe(0);
    });

    it("does not flag hex color #a1b2c3", () => {
      const css = `[data-ui="button"] { color: #a1b2c3; }`;
      expect(findIdSelectors(css).length).toBe(0);
    });

    it("passes clean attribute-selector CSS", () => {
      const css = `[data-ui="button"] { color: var(--color-fg); }`;
      expect(findIdSelectors(css).length).toBe(0);
    });

    it("ignores ID selectors in comments", () => {
      const css = `/* #header is used for accessibility */\n[data-ui="button"] { }`;
      expect(findIdSelectors(css).length).toBe(0);
    });
  });

  describe("findHardcodedColorValues — anti-pattern #2: no hardcoded values", () => {
    it("detects hardcoded hex color in property value", () => {
      const css = `[data-ui="button"] { color: #ff0000; }`;
      expect(findHardcodedColorValues(css).length).toBe(1);
    });

    it("detects rgb() in property value", () => {
      const css = `[data-ui="button"] { background: rgb(255, 0, 0); }`;
      expect(findHardcodedColorValues(css).length).toBe(1);
    });

    it("detects rgba() in property value", () => {
      const css = `[data-ui="button"] { box-shadow: 0 2px 4px rgba(0,0,0,0.2); }`;
      expect(findHardcodedColorValues(css).length).toBe(1);
    });

    it("detects hsl() in property value", () => {
      const css = `[data-ui="button"] { color: hsl(220, 90%, 56%); }`;
      expect(findHardcodedColorValues(css).length).toBe(1);
    });

    it("detects oklch() in property value", () => {
      const css = `[data-ui="button"] { color: oklch(0.55 0.22 264); }`;
      expect(findHardcodedColorValues(css).length).toBe(1);
    });

    it("passes when color is via var()", () => {
      const css = `[data-ui="button"] { color: var(--color-primary); }`;
      expect(findHardcodedColorValues(css).length).toBe(0);
    });

    it("skips token definition lines (--name: value)", () => {
      const css = `[data-ui="button"] { --button-color: oklch(0.55 0.22 264); }`;
      expect(findHardcodedColorValues(css).length).toBe(0);
    });

    it("skips color inside var() fallback", () => {
      const css = `[data-ui="button"] { color: var(--color-primary, #4f46e5); }`;
      expect(findHardcodedColorValues(css).length).toBe(0);
    });

    it("passes CSS with only token references", () => {
      const css = [
        `[data-ui="button"] {`,
        `  color: var(--color-fg);`,
        `  background: var(--color-bg);`,
        `  border: 1px solid var(--color-border);`,
        `}`,
      ].join("\n");
      expect(findHardcodedColorValues(css).length).toBe(0);
    });
  });
});

describe("JS Anti-Pattern Detection", () => {
  describe("findExternalImports — anti-pattern #4: no external dependencies", () => {
    it("detects a bare module specifier", () => {
      const js = `import { debounce } from "lodash";`;
      expect(findExternalImports(js).length).toBe(1);
      expect(findExternalImports(js)[0].text).toBe("lodash");
    });

    it("detects npm-style package import", () => {
      const js = `import React from "react";`;
      expect(findExternalImports(js).length).toBe(1);
    });

    it("allows relative imports (../)", () => {
      const js = `import { trapFocus } from "../../core/focus.js";`;
      expect(findExternalImports(js).length).toBe(0);
    });

    it("allows relative imports (./)", () => {
      const js = `import { something } from "./utils.js";`;
      expect(findExternalImports(js).length).toBe(0);
    });

    it("allows absolute path imports (/)", () => {
      const js = `import { foo } from "/vendor/foo.js";`;
      expect(findExternalImports(js).length).toBe(0);
    });

    it("detects side-effect external import", () => {
      const js = `import "some-polyfill";`;
      expect(findExternalImports(js).length).toBe(1);
    });

    it("ignores commented-out imports", () => {
      const js = `// import { foo } from "lodash";\nimport { bar } from "./bar.js";`;
      expect(findExternalImports(js).length).toBe(0);
    });

    it("passes a valid recipe controller", () => {
      const js = [
        `// @ui:controller dialog`,
        `import { trapFocus } from "../../core/focus.js";`,
        `export function createDialog(root) { }`,
      ].join("\n");
      expect(findExternalImports(js).length).toBe(0);
    });
  });

  describe("findDataFetching — anti-pattern #7: no routing or data fetching", () => {
    it("detects fetch()", () => {
      const js = `const data = await fetch("/api/data");`;
      expect(findDataFetching(js).length).toBe(1);
    });

    it("detects XMLHttpRequest", () => {
      const js = `const xhr = new XMLHttpRequest();`;
      expect(findDataFetching(js).length).toBe(1);
    });

    it("detects axios usage", () => {
      const js = `const res = await axios.get("/api/items");`;
      expect(findDataFetching(js).length).toBe(1);
    });

    it("detects history.push", () => {
      const js = `history.push("/dashboard");`;
      expect(findDataFetching(js).length).toBe(1);
    });

    it("detects router.navigate", () => {
      const js = `router.navigate("/home");`;
      expect(findDataFetching(js).length).toBe(1);
    });

    it("passes clean controller code", () => {
      const js = [
        `import { trapFocus } from "../../core/focus.js";`,
        `export function createDialog(root) {`,
        `  function open() { root.dataset.state = "open"; }`,
        `  function close() { root.dataset.state = "closed"; }`,
        `  return { open, close };`,
        `}`,
      ].join("\n");
      expect(findDataFetching(js).length).toBe(0);
    });

    it("ignores commented fetch calls", () => {
      const js = `// const data = await fetch("/api");\nroot.dataset.state = "open";`;
      expect(findDataFetching(js).length).toBe(0);
    });
  });
});
