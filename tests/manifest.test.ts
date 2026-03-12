import { describe, it, expect } from "bun:test";
import { validateManifest, type Manifest } from "../src/manifest";
import { join } from "node:path";

const REGISTRY = join(import.meta.dir, "../registry");

describe("manifest validation", () => {
  it("returns errors for empty object", () => {
    const errors = validateManifest({});
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.field === "name")).toBe(true);
    expect(errors.some((e) => e.field === "kind")).toBe(true);
  });

  it("returns errors for non-object", () => {
    const errors = validateManifest("not an object");
    expect(errors.length).toBe(1);
    expect(errors[0].field).toBe("(root)");
  });

  it("returns errors for null", () => {
    const errors = validateManifest(null);
    expect(errors.length).toBe(1);
  });

  it("validates invalid kind", () => {
    const errors = validateManifest({
      name: "test",
      version: "1.0.0",
      kind: "invalid",
      category: "test",
      description: "test",
      anatomy: { tag: "div", selector: "[data-ui='test']", content_model: "block" },
      slots: {},
      variants: {},
      states: {},
      a11y: {},
      tokens_used: [],
      templates: { html: "<div></div>" },
      safe_transforms: [],
      unsafe_transforms: [],
      composition: { contains: [], used_in: [] },
      files: { html: "test.html", css: "test.css", manifest: "test.manifest.json" },
      tests: [],
    });
    expect(errors.some((e) => e.field === "kind")).toBe(true);
  });

  it("passes for valid button manifest", async () => {
    const json = await Bun.file(
      join(REGISTRY, "primitives/button/button.manifest.json")
    ).json();
    const errors = validateManifest(json);
    expect(errors).toEqual([]);
  });

  it("passes for valid input manifest", async () => {
    const json = await Bun.file(
      join(REGISTRY, "primitives/input/input.manifest.json")
    ).json();
    const errors = validateManifest(json);
    expect(errors).toEqual([]);
  });

  it("passes for valid card manifest", async () => {
    const json = await Bun.file(
      join(REGISTRY, "primitives/card/card.manifest.json")
    ).json();
    const errors = validateManifest(json);
    expect(errors).toEqual([]);
  });

  it("passes for valid badge manifest", async () => {
    const json = await Bun.file(
      join(REGISTRY, "primitives/badge/badge.manifest.json")
    ).json();
    const errors = validateManifest(json);
    expect(errors).toEqual([]);
  });

  it("passes for valid avatar manifest", async () => {
    const json = await Bun.file(
      join(REGISTRY, "primitives/avatar/avatar.manifest.json")
    ).json();
    const errors = validateManifest(json);
    expect(errors).toEqual([]);
  });

  it("passes for valid separator manifest", async () => {
    const json = await Bun.file(
      join(REGISTRY, "primitives/separator/separator.manifest.json")
    ).json();
    const errors = validateManifest(json);
    expect(errors).toEqual([]);
  });

  it("passes for valid label manifest", async () => {
    const json = await Bun.file(
      join(REGISTRY, "primitives/label/label.manifest.json")
    ).json();
    const errors = validateManifest(json);
    expect(errors).toEqual([]);
  });

  it("validates slot requires selector and required fields", () => {
    const errors = validateManifest({
      name: "test",
      version: "1.0.0",
      kind: "primitive",
      category: "test",
      description: "test",
      anatomy: { tag: "div", selector: "[data-ui='test']", content_model: "block" },
      slots: { bad: { tag_hint: "div" } },
      variants: {},
      states: {},
      a11y: {},
      tokens_used: [],
      templates: { html: "<div></div>" },
      safe_transforms: [],
      unsafe_transforms: [],
      composition: { contains: [], used_in: [] },
      files: { html: "test.html", css: "test.css", manifest: "test.manifest.json" },
      tests: [],
    });
    expect(errors.some((e) => e.field === "slots.bad.selector")).toBe(true);
    expect(errors.some((e) => e.field === "slots.bad.required")).toBe(true);
  });

  it("validates variant requires values, default, and attr", () => {
    const errors = validateManifest({
      name: "test",
      version: "1.0.0",
      kind: "primitive",
      category: "test",
      description: "test",
      anatomy: { tag: "div", selector: "[data-ui='test']", content_model: "block" },
      slots: {},
      variants: { bad: {} },
      states: {},
      a11y: {},
      tokens_used: [],
      templates: { html: "<div></div>" },
      safe_transforms: [],
      unsafe_transforms: [],
      composition: { contains: [], used_in: [] },
      files: { html: "test.html", css: "test.css", manifest: "test.manifest.json" },
      tests: [],
    });
    expect(errors.some((e) => e.field === "variants.bad.values")).toBe(true);
    expect(errors.some((e) => e.field === "variants.bad.default")).toBe(true);
    expect(errors.some((e) => e.field === "variants.bad.attr")).toBe(true);
  });
});
