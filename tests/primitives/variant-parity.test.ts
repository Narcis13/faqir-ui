/**
 * Variant structural parity — task 0.9-11.
 *
 * A group is consistent when every declared value is demonstrated and every
 * demonstration renders the same required slot set. Optional slots are the only
 * permitted differences: the manifest has explicitly declared those exceptions,
 * so an omitted required accent, label, track, or fallback cannot pass as an
 * incidental variation.
 *
 * The assertion knows no component names, attributes, values, or parts. Pointing
 * it at a group means supplying only its registry layer, component name, and
 * manifest group key. `chip/visual` below is the fifth-component proof.
 */

import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { extractComponents } from "../../src/parser/html-parser";

const REGISTRY = join(import.meta.dir, "../../registry");

type Layer = "primitives" | "recipes" | "patterns";

interface SlotContract {
  required?: boolean;
}

interface VariantContract {
  values: string[];
  default?: string;
  attr: string;
}

interface ParityManifest {
  slots?: Record<string, SlotContract>;
  variants?: Record<string, VariantContract>;
}

interface VariantGroupTarget {
  layer: Layer;
  component: string;
  group: string;
}

function assertVariantStructuralParity(target: VariantGroupTarget): void {
  const dir = join(REGISTRY, target.layer, target.component);
  const manifest = JSON.parse(
    readFileSync(join(dir, `${target.component}.manifest.json`), "utf8"),
  ) as ParityManifest;
  const contract = manifest.variants?.[target.group];
  expect(contract, `${target.component} has no ${target.group} variant group`).toBeDefined();

  const source = readFileSync(join(dir, `${target.component}.html`), "utf8");
  const roots = extractComponents(source, `${target.component}.html`).filter(
    (candidate) => candidate.name === target.component,
  );
  const slots = manifest.slots ?? {};
  const required = Object.entries(slots)
    .filter(([, slot]) => slot.required === true)
    .map(([name]) => name)
    .sort();

  const valueOf = (attrs: Record<string, string>): string | undefined =>
    attrs[contract!.attr] || contract!.default;

  for (const value of contract!.values) {
    const cases = roots.filter((root) => valueOf(root.root.attrs) === value);
    expect(cases.length, `${target.component}/${target.group} does not render ${value}`).toBeGreaterThan(0);

    for (const candidate of cases) {
      const present = Object.keys(candidate.parts).sort();
      expect(
        required.filter((part) => present.includes(part)),
        `${target.component}/${target.group}=${value} at line ${candidate.line} omits a required part`,
      ).toEqual(required);

      for (const part of present) {
        expect(slots[part], `${target.component}/${target.group}=${value} renders undeclared part ${part}`)
          .toBeDefined();
      }
    }
  }

  const representatives = contract!.values.map((value) =>
    roots.find((root) => valueOf(root.root.attrs) === value)!,
  );
  const canonicalParts = Object.keys(representatives[0].parts).sort();
  for (let index = 1; index < representatives.length; index++) {
    expect(
      Object.keys(representatives[index].parts).sort(),
      `${target.component}/${target.group}=${contract!.values[index]} differs from ` +
        `${contract!.values[0]}; optional slots may vary in dedicated examples, not across group values`,
    ).toEqual(canonicalParts);
  }

  const groupCases = roots.filter((root) => contract!.values.includes(valueOf(root.root.attrs) ?? ""));
  const union = [...new Set(groupCases.flatMap((candidate) => Object.keys(candidate.parts)))].sort();
  for (const part of union) {
    const absent = groupCases.filter((candidate) => !(part in candidate.parts));
    if (absent.length === 0) continue;
    expect(
      slots[part]?.required,
      `${target.component}/${target.group} varies part ${part}, but the manifest does not declare it optional`,
    ).toBe(false);
  }
}

describe("variant groups render structurally complete peers", () => {
  const taskGroups: VariantGroupTarget[] = [
    { layer: "primitives", component: "callout", group: "variant" },
    { layer: "primitives", component: "avatar", group: "size" },
    { layer: "primitives", component: "badge", group: "size" },
    { layer: "primitives", component: "progress", group: "variant" },
  ];

  for (const target of taskGroups) {
    it(`${target.component}/${target.group}`, () => {
      assertVariantStructuralParity(target);
    });
  }

  it("runs unchanged when pointed at a fifth component", () => {
    assertVariantStructuralParity({
      layer: "primitives",
      component: "chip",
      group: "visual",
    });
  });
});
