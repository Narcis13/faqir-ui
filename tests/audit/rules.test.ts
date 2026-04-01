import { describe, it, expect } from "bun:test";
import { extractComponents } from "../../src/parser/html-parser";
import type { Manifest } from "../../src/manifest";
import {
  requiredSlotRule,
  requiredAriaRule,
  validVariantRule,
  validStateRule,
  validSizeRule,
  orphanPartRule,
  closeLabelRule,
  ariaDescribedbyRule,
  controllerLoadedRule,
  focusTrapRule,
} from "../../src/audit/rules";

// Minimal dialog manifest for testing
const DIALOG_MANIFEST: Manifest = {
  name: "dialog",
  version: "1.0.0",
  kind: "recipe",
  category: "overlay",
  description: "Modal dialog",
  anatomy: { tag: "div", selector: "[data-ui='dialog']", content_model: "slots" },
  slots: {
    trigger: { selector: "[data-part='trigger']", required: true, tag_hint: "button" },
    overlay: { selector: "[data-part='overlay']", required: true, tag_hint: "div" },
    panel: { selector: "[data-part='panel']", required: true, tag_hint: "div" },
    title: { selector: "[data-part='title']", required: true, tag_hint: "h2" },
    body: { selector: "[data-part='body']", required: true, tag_hint: "div" },
    close: { selector: "[data-part='close']", required: true, tag_hint: "button" },
    description: { selector: "[data-part='description']", required: false, tag_hint: "p" },
    header: { selector: "[data-part='header']", required: false, tag_hint: "div" },
    footer: { selector: "[data-part='footer']", required: false, tag_hint: "div" },
  },
  variants: {
    size: { values: ["sm", "md", "lg", "full"], default: "md", attr: "data-size", applied_to: "panel" },
    tone: { values: ["default", "danger"], default: "default", attr: "data-variant", applied_to: "panel" },
  },
  states: {
    closed: { attr: 'data-state="closed"', default: true },
    open: { attr: 'data-state="open"' },
    closing: { attr: 'data-state="closing"', transient: true },
  },
  a11y: {
    role: "dialog",
    "aria-modal": true,
    required_attrs: [
      'role="dialog" on panel',
      'aria-modal="true" on panel',
      "aria-labelledby pointing to title id",
      "aria-label on close button",
    ],
    focus_trap: true,
    escape_closes: true,
    return_focus: "trigger",
    keyboard: { Escape: "close", Tab: "cycle focus" },
  },
  tokens_used: [],
  templates: { html: "" },
  safe_transforms: [],
  unsafe_transforms: [],
  composition: { contains: ["button"], used_in: [] },
  files: { html: "dialog.html", css: "dialog.css", js: "dialog.js", manifest: "dialog.manifest.json" },
  tests: [],
};

// Minimal button manifest
const BUTTON_MANIFEST: Manifest = {
  name: "button",
  version: "1.0.0",
  kind: "primitive",
  category: "actions",
  description: "Button",
  anatomy: { tag: "button", selector: "[data-ui='button']", content_model: "inline" },
  slots: {
    icon: { selector: "[data-part='icon']", required: false, tag_hint: "span" },
  },
  variants: {
    visual: { values: ["default", "primary", "secondary", "destructive", "ghost", "outline", "link"], default: "default", attr: "data-variant", applied_to: "root" },
    size: { values: ["sm", "md", "lg"], default: "md", attr: "data-size", applied_to: "root" },
  },
  states: {
    default: { attr: 'data-state="default"', default: true },
    loading: { attr: 'data-state="loading"' },
    disabled: { attr: "disabled" },
  },
  a11y: { required_attrs: [], keyboard: { Enter: "activate", Space: "activate" } },
  tokens_used: [],
  templates: { html: "" },
  safe_transforms: [],
  unsafe_transforms: [],
  composition: { contains: [], used_in: [] },
  files: { html: "button.html", css: "button.css", manifest: "button.manifest.json" },
  tests: [],
};

function getComponents(html: string) {
  return extractComponents(html, "test.html");
}

describe("Audit Rules", () => {
  describe("required-slot", () => {
    it("passes when all required slots exist", () => {
      const html = `
<div data-ui="dialog" data-state="closed">
  <button data-part="trigger">Open</button>
  <div data-part="overlay"></div>
  <div data-part="panel">
    <h2 data-part="title">Title</h2>
    <button data-part="close">X</button>
    <div data-part="body">Content</div>
  </div>
</div>`;
      const comps = getComponents(html);
      const results = requiredSlotRule.check(comps[0], DIALOG_MANIFEST);
      expect(results.length).toBe(0);
    });

    it("fails when required slots are missing", () => {
      const html = `
<div data-ui="dialog" data-state="closed">
  <button data-part="trigger">Open</button>
  <div data-part="panel">
    <p>No title, no close, no body, no overlay</p>
  </div>
</div>`;
      const comps = getComponents(html);
      const results = requiredSlotRule.check(comps[0], DIALOG_MANIFEST);
      // Missing: overlay, title, body, close
      expect(results.length).toBe(4);
      expect(results.every(r => r.severity === "critical")).toBe(true);
      expect(results.every(r => r.rule_id === "required-slot")).toBe(true);
    });
  });

  describe("required-aria", () => {
    it("passes with correct ARIA attributes", () => {
      const html = `
<div data-ui="dialog" data-state="closed">
  <button data-part="trigger">Open</button>
  <div data-part="panel" role="dialog" aria-modal="true" aria-labelledby="t-title">
    <h2 data-part="title" id="t-title">Title</h2>
    <button data-part="close" aria-label="Close">X</button>
    <div data-part="body">Content</div>
  </div>
  <div data-part="overlay"></div>
</div>`;
      const comps = getComponents(html);
      const results = requiredAriaRule.check(comps[0], DIALOG_MANIFEST);
      expect(results.length).toBe(0);
    });

    it("detects missing role on panel", () => {
      const html = `
<div data-ui="dialog" data-state="closed">
  <button data-part="trigger">Open</button>
  <div data-part="panel" aria-modal="true" aria-labelledby="t">
    <h2 data-part="title" id="t">Title</h2>
    <button data-part="close" aria-label="Close">X</button>
    <div data-part="body">Content</div>
  </div>
  <div data-part="overlay"></div>
</div>`;
      const comps = getComponents(html);
      const results = requiredAriaRule.check(comps[0], DIALOG_MANIFEST);
      const roleResult = results.find(r => r.message.includes("role"));
      expect(roleResult).toBeDefined();
      expect(roleResult!.severity).toBe("critical");
    });

    it("detects missing aria-label on close button", () => {
      const html = `
<div data-ui="dialog" data-state="closed">
  <button data-part="trigger">Open</button>
  <div data-part="panel" role="dialog" aria-modal="true" aria-labelledby="t">
    <h2 data-part="title" id="t">Title</h2>
    <button data-part="close">X</button>
    <div data-part="body">Content</div>
  </div>
  <div data-part="overlay"></div>
</div>`;
      const comps = getComponents(html);
      const results = requiredAriaRule.check(comps[0], DIALOG_MANIFEST);
      const closeResult = results.find(r => r.message.includes("aria-label") && r.message.includes("close"));
      expect(closeResult).toBeDefined();
    });

    it("detects missing aria-labelledby on panel", () => {
      const html = `
<div data-ui="dialog" data-state="closed">
  <button data-part="trigger">Open</button>
  <div data-part="panel" role="dialog" aria-modal="true">
    <h2 data-part="title">Title</h2>
    <button data-part="close" aria-label="Close">X</button>
    <div data-part="body">Content</div>
  </div>
  <div data-part="overlay"></div>
</div>`;
      const comps = getComponents(html);
      const results = requiredAriaRule.check(comps[0], DIALOG_MANIFEST);
      const lblResult = results.find(r => r.message.includes("aria-labelledby"));
      expect(lblResult).toBeDefined();
    });
  });

  describe("valid-variant", () => {
    it("passes with valid variant", () => {
      const html = '<button data-ui="button" data-variant="primary">OK</button>';
      const comps = getComponents(html);
      const results = validVariantRule.check(comps[0], BUTTON_MANIFEST);
      expect(results.length).toBe(0);
    });

    it("fails with invalid variant", () => {
      const html = '<button data-ui="button" data-variant="neon">OK</button>';
      const comps = getComponents(html);
      const results = validVariantRule.check(comps[0], BUTTON_MANIFEST);
      expect(results.length).toBe(1);
      expect(results[0].severity).toBe("error");
      expect(results[0].message).toContain("neon");
    });
  });

  describe("valid-state", () => {
    it("passes with valid state", () => {
      const html = '<div data-ui="dialog" data-state="closed"></div>';
      const comps = getComponents(html);
      const results = validStateRule.check(comps[0], DIALOG_MANIFEST);
      expect(results.length).toBe(0);
    });

    it("fails with invalid state", () => {
      const html = '<div data-ui="dialog" data-state="active"></div>';
      const comps = getComponents(html);
      const results = validStateRule.check(comps[0], DIALOG_MANIFEST);
      expect(results.length).toBe(1);
      expect(results[0].severity).toBe("error");
      expect(results[0].message).toContain("active");
    });
  });

  describe("valid-size", () => {
    it("passes with valid size", () => {
      const html = '<button data-ui="button" data-size="sm">Small</button>';
      const comps = getComponents(html);
      const results = validSizeRule.check(comps[0], BUTTON_MANIFEST);
      expect(results.length).toBe(0);
    });

    it("fails with invalid size", () => {
      const html = '<button data-ui="button" data-size="xl">XL</button>';
      const comps = getComponents(html);
      const results = validSizeRule.check(comps[0], BUTTON_MANIFEST);
      expect(results.length).toBe(1);
      expect(results[0].message).toContain("xl");
    });

    it("checks size on parts too", () => {
      const html = `
<div data-ui="dialog" data-state="closed">
  <div data-part="panel" data-size="xl">Content</div>
</div>`;
      const comps = getComponents(html);
      const results = validSizeRule.check(comps[0], DIALOG_MANIFEST);
      expect(results.length).toBe(1);
      expect(results[0].message).toContain("xl");
    });
  });

  describe("orphan-part", () => {
    it("passes with valid slot names", () => {
      const html = `
<div data-ui="dialog" data-state="closed">
  <button data-part="trigger">Open</button>
  <div data-part="overlay"></div>
  <div data-part="panel">
    <h2 data-part="title">Title</h2>
    <div data-part="body">Content</div>
  </div>
</div>`;
      const comps = getComponents(html);
      const results = orphanPartRule.check(comps[0], DIALOG_MANIFEST);
      expect(results.length).toBe(0);
    });

    it("warns on unknown slot names", () => {
      const html = `
<div data-ui="dialog" data-state="closed">
  <button data-part="trigger">Open</button>
  <div data-part="sidebar">Unknown</div>
  <div data-part="panel">Content</div>
</div>`;
      const comps = getComponents(html);
      const results = orphanPartRule.check(comps[0], DIALOG_MANIFEST);
      expect(results.length).toBe(1);
      expect(results[0].severity).toBe("warning");
      expect(results[0].message).toContain("sidebar");
    });
  });

  describe("close-label", () => {
    it("passes when close button has aria-label", () => {
      const html = `
<div data-ui="dialog" data-state="closed">
  <button data-part="close" aria-label="Close dialog">X</button>
</div>`;
      const comps = getComponents(html);
      const results = closeLabelRule.check(comps[0], DIALOG_MANIFEST);
      expect(results.length).toBe(0);
    });

    it("warns when close button lacks aria-label", () => {
      const html = `
<div data-ui="dialog" data-state="closed">
  <button data-part="close">X</button>
</div>`;
      const comps = getComponents(html);
      const results = closeLabelRule.check(comps[0], DIALOG_MANIFEST);
      expect(results.length).toBe(1);
      expect(results[0].severity).toBe("warning");
      expect(results[0].fix).toBeDefined();
    });
  });

  describe("aria-describedby", () => {
    it("skips when no description slot is present", () => {
      const html = `
<div data-ui="dialog" data-state="closed">
  <div data-part="panel">Content</div>
</div>`;
      const comps = getComponents(html);
      const results = ariaDescribedbyRule.check(comps[0], DIALOG_MANIFEST);
      expect(results.length).toBe(0);
    });

    it("warns when description exists but panel lacks aria-describedby", () => {
      const html = `
<div data-ui="dialog" data-state="closed">
  <div data-part="panel">
    <p data-part="description">Some description</p>
    <div data-part="body">Content</div>
  </div>
</div>`;
      const comps = getComponents(html);
      const results = ariaDescribedbyRule.check(comps[0], DIALOG_MANIFEST);
      expect(results.length).toBe(1);
      expect(results[0].severity).toBe("warning");
    });

    it("passes when description exists and panel has aria-describedby", () => {
      const html = `
<div data-ui="dialog" data-state="closed">
  <div data-part="panel" aria-describedby="desc">
    <p data-part="description" id="desc">Some description</p>
    <div data-part="body">Content</div>
  </div>
</div>`;
      const comps = getComponents(html);
      const results = ariaDescribedbyRule.check(comps[0], DIALOG_MANIFEST);
      expect(results.length).toBe(0);
    });
  });

  describe("controller-loaded", () => {
    it("flags recipe components", () => {
      const html = '<div data-ui="dialog" data-state="closed"></div>';
      const comps = getComponents(html);
      const results = controllerLoadedRule.check(comps[0], DIALOG_MANIFEST);
      expect(results.length).toBe(1);
      expect(results[0].rule_id).toBe("controller-loaded");
    });

    it("skips primitives", () => {
      const html = '<button data-ui="button">OK</button>';
      const comps = getComponents(html);
      const results = controllerLoadedRule.check(comps[0], BUTTON_MANIFEST);
      expect(results.length).toBe(0);
    });
  });

  describe("focus-trap", () => {
    it("flags components with focus_trap: true", () => {
      const html = '<div data-ui="dialog" data-state="closed"></div>';
      const comps = getComponents(html);
      const results = focusTrapRule.check(comps[0], DIALOG_MANIFEST);
      expect(results.length).toBe(1);
      expect(results[0].severity).toBe("critical");
    });

    it("skips components without focus_trap", () => {
      const html = '<button data-ui="button">OK</button>';
      const comps = getComponents(html);
      const results = focusTrapRule.check(comps[0], BUTTON_MANIFEST);
      expect(results.length).toBe(0);
    });
  });
});
