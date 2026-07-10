// ═══════════════════════════════════════════════════════════════════════════
// icon-name audit rule  [task 0.4-05 · §B4]
// ═══════════════════════════════════════════════════════════════════════════
//
// Every data-icon value in audited HTML must be a real glyph in the icon
// manifest's icon set. The rule is manifest-driven: it fires for any component
// whose manifest declares a variant with attr "data-icon" (the icon primitive's
// `variants.icon`), and a typo gets a nearest-match "did you mean …" suggestion
// via the shared typo-suggestion util.

import { describe, it, expect } from "bun:test";
import { extractComponents } from "../../src/parser/html-parser";
import type { Manifest } from "../../src/manifest";
import { iconNameRule, getRuleInventory, ALL_RULES } from "../../src/audit/rules";

// Minimal icon manifest: the one variant that drives data-icon.
const ICON_MANIFEST = {
  name: "icon",
  version: "1.0.0",
  kind: "primitive",
  category: "data-display",
  description: "CSS-only icon",
  anatomy: { tag: "span", selector: "[data-ui='icon']", content_model: "text" },
  slots: {},
  variants: {
    icon: { values: ["check", "x", "chevron-down", "circle"], default: "circle", attr: "data-icon", applied_to: "root" },
  },
  states: {},
  a11y: { keyboard: {} },
  tokens_used: [],
  templates: { html: "" },
  safe_transforms: [],
  unsafe_transforms: [],
  composition: { contains: [], used_in: [] },
  files: { html: "icon.html", css: "icons.css", manifest: "icon.manifest.json" },
  tests: [],
} as unknown as Manifest;

const only = (html: string) => extractComponents(html, "page.html")[0];

describe("icon-name rule", () => {
  it("passes for a known glyph", () => {
    const c = only(`<span data-ui="icon" data-icon="check"></span>`);
    expect(iconNameRule.check(c, ICON_MANIFEST)).toEqual([]);
  });

  it("flags an unknown glyph with a 'did you mean' suggestion", () => {
    const c = only(`<span data-ui="icon" data-icon="chekc"></span>`);
    const results = iconNameRule.check(c, ICON_MANIFEST);
    expect(results.length).toBe(1);
    expect(results[0].rule_id).toBe("icon-name");
    expect(results[0].severity).toBe("error");
    expect(results[0].message).toContain('Unknown icon "chekc"');
    expect(results[0].message).toContain('did you mean "check"');
  });

  it("omits the suggestion when nothing is close enough", () => {
    const c = only(`<span data-ui="icon" data-icon="zzzzzzzz"></span>`);
    const results = iconNameRule.check(c, ICON_MANIFEST);
    expect(results.length).toBe(1);
    expect(results[0].message).toContain('Unknown icon "zzzzzzzz"');
    expect(results[0].message).not.toContain("did you mean");
  });

  it("checks data-icon on nested parts too", () => {
    // A component that carries an icon on a labeled part.
    const c = only(`<button data-ui="icon" data-icon="check"><span data-part="glyph" data-icon="chekc"></span></button>`);
    const results = iconNameRule.check(c, ICON_MANIFEST);
    expect(results.length).toBe(1);
    expect(results[0].message).toContain('[data-part="glyph"]');
    expect(results[0].message).toContain('did you mean "check"');
  });

  it("is a no-op for components with no data-icon attribute", () => {
    const c = only(`<span data-ui="icon"></span>`);
    expect(iconNameRule.check(c, ICON_MANIFEST)).toEqual([]);
  });

  it("does not apply to manifests without a data-icon variant", () => {
    const buttonManifest = {
      ...ICON_MANIFEST,
      name: "button",
      variants: { size: { values: ["sm", "md"], default: "md", attr: "data-size" } },
    } as unknown as Manifest;
    // Even a bogus data-icon is ignored — this manifest has no icon set to check against.
    const c = only(`<button data-ui="button" data-icon="nope">Go</button>`);
    expect(iconNameRule.check(c, buttonManifest)).toEqual([]);
  });
});

describe("icon-name rule is registered", () => {
  it("is in ALL_RULES", () => {
    expect(ALL_RULES.some((r) => r.id === "icon-name")).toBe(true);
  });

  it("appears in the audit rule inventory (powers `faqir audit --rules` + --json)", () => {
    const entry = getRuleInventory().find((r) => r.id === "icon-name");
    expect(entry).toBeDefined();
    expect(entry!.severity).toBe("error");
    expect(entry!.applies_to).toBe("component markup vs manifest");
  });
});
