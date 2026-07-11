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

  const base = {
    name: "test",
    version: "1.0.0",
    kind: "primitive" as const,
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
  };

  it("accepts an absent changes changelog (optional)", () => {
    expect(validateManifest(base)).toEqual([]);
  });

  it("accepts a well-formed changes changelog", () => {
    const errors = validateManifest({
      ...base,
      changes: [
        { version: "1.1.0", note: "Added ghost variant.", breaking: false },
        { version: "2.0.0", note: "Renamed attr.", breaking: true },
      ],
    });
    expect(errors).toEqual([]);
  });

  it("rejects a non-array changes field", () => {
    const errors = validateManifest({ ...base, changes: "nope" });
    expect(errors.some((e) => e.field === "changes")).toBe(true);
  });

  it("rejects changelog entries missing required fields", () => {
    const errors = validateManifest({
      ...base,
      changes: [{ version: "1.1.0" }, { note: "x", breaking: "yes" }],
    });
    expect(errors.some((e) => e.field === "changes[0].note")).toBe(true);
    expect(errors.some((e) => e.field === "changes[0].breaking")).toBe(true);
    expect(errors.some((e) => e.field === "changes[1].version")).toBe(true);
    expect(errors.some((e) => e.field === "changes[1].breaking")).toBe(true);
  });
});
