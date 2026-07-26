// The agent-facing surfaces of a responsive declaration (task 0.8-02).
//
// `"responsive": true` is written once in a manifest. The skill reference, the
// context entry, the context markdown and llms-full.txt must all state the
// `data-<attr>-<tier>` grammar for that component — derived from the declaration
// and the breakpoint canon, never from per-component prose. (llms.txt is a pure
// index of links, so it carries no per-component detail to check.) The negative
// half matters just as much: a component that declares nothing must gain nothing.

import { describe, it, expect } from "bun:test";
import { renderComponentSection } from "../../src/generator/skill";
import {
  buildComponentEntry,
  composeContextData,
  formatContextMarkdown,
  formatContextLlmsFull,
} from "../../src/generator/context";
import { TIERS, BREAKPOINTS } from "../../src/utils/breakpoints";
import type { Manifest } from "../../src/manifest";

function probe(responsive: boolean): Manifest {
  return {
    name: "zz-grid",
    version: "1.0.0",
    kind: "primitive",
    category: "layout",
    description: "Probe grid.",
    anatomy: { tag: "div", selector: "[data-ui='zz-grid']", content_model: "block" },
    slots: {},
    variants: {
      cols: {
        values: ["1", "2", "3", "4"],
        default: "1",
        attr: "data-cols",
        applied_to: "root",
        ...(responsive ? { responsive: true } : {}),
      },
      gap: { values: ["0", "4"], default: "4", attr: "data-gap", applied_to: "root" },
    },
    states: {},
    a11y: {},
    tokens_used: [],
    templates: { html: '<div data-ui="zz-grid"></div>' },
    safe_transforms: [],
    unsafe_transforms: [],
    composition: { contains: [], used_in: [] },
    files: { html: "zz-grid.html", css: "zz-grid.css", manifest: "zz-grid.manifest.json" },
    tests: [],
  };
}

describe("skill reference", () => {
  const responsive = renderComponentSection(probe(true)).join("\n");
  const plain = renderComponentSection(probe(false)).join("\n");

  it("adds a Responsive column listing every canon tier attribute", () => {
    expect(responsive).toContain("| Variant | Values | Default | Attribute | Applied to | Responsive |");
    for (const tier of TIERS) expect(responsive).toContain(`\`data-cols-${tier}\``);
  });

  it("marks the non-responsive group in the same table with a dash", () => {
    const gapRow = responsive.split("\n").find((l) => l.startsWith("| gap |"))!;
    expect(gapRow.endsWith("| — |")).toBe(true);
  });

  it("states the grammar once, with the canon numbers", () => {
    expect(responsive).toContain(`\`md\` (${BREAKPOINTS.md.rem}rem)`);
    expect(responsive).toContain('`data-cols-md="4"` applies that value from `md` up');
    expect(responsive).toContain("Mobile-first: the unsuffixed attribute is the base.");
  });

  it("adds neither column nor note to a component that declares nothing", () => {
    expect(plain).toContain("| Variant | Values | Default | Attribute | Applied to |");
    expect(plain).not.toContain("Responsive");
    expect(plain).not.toContain("data-cols-md");
  });
});

describe("context entry", () => {
  it("carries attr → tiers for a responsive group only", () => {
    expect(buildComponentEntry(probe(true)).responsive).toEqual({ "data-cols": [...TIERS] });
    expect(buildComponentEntry(probe(false)).responsive).toBeUndefined();
  });
});

describe("context markdown + llms-full.txt", () => {
  function render(manifest: Manifest) {
    const data = composeContextData({
      entries: [["zz-grid", manifest]],
      theme: { name: "default", manifest_found: false },
      themeName: "default",
      pluginMetadata: [],
      componentCount: { primitives: 1, recipes: 0, patterns: 0 },
      generatedAt: "1970-01-01T00:00:00.000Z",
      scope: "registry",
    });
    return { markdown: formatContextMarkdown(data), full: formatContextLlmsFull(data) };
  }

  it("states the grammar in both files", () => {
    const { markdown, full } = render(probe(true));
    for (const text of [markdown, full]) {
      expect(text).toContain("Responsive: data-cols-{sm|md|lg|xl}");
      expect(text).toContain("value applies from that tier up");
    }
  });

  it("says nothing when nothing is declared", () => {
    const { markdown, full } = render(probe(false));
    for (const text of [markdown, full]) expect(text).not.toContain("Responsive:");
  });
});
