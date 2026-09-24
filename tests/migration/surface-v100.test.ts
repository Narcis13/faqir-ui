// 1.1 is additive · the v1.0.0 surface gate  [task 1.1R-01]
//
// The 1.1 release notes say "no breaking changes". This is where that sentence
// is proven rather than asserted: `tests/fixtures/v100/surface.json` is every
// attribute value the v1.0.0 registry honoured — declared in a manifest or
// selected on by a stylesheet or controller — read out of the release tag by
// `scripts/gen-v100-surface.mjs`, through the same extractor this file runs on
// today's registry. A 1.0 page could legally carry any of those values; a value
// the current registry no longer honours is a page that silently stopped
// working, whatever the changelog says.
//
// Unlike the v0.2.4 gate next door, there are no documented exceptions here.
// A 1.x minor may not break anything (SPEC-1.0 §8), so the only acceptable
// number of losses is zero.

import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  extractSurface,
  listRegistryComponents,
  surfaceKey,
  surfaceLoss,
  type ComponentSurface,
} from "../../src/migration";

const ROOT = resolve(import.meta.dir, "../..");
const REGISTRY = join(ROOT, "registry");
const pinned = JSON.parse(
  readFileSync(join(ROOT, "tests/fixtures/v100/surface.json"), "utf8"),
) as { release: string; components: Record<string, ComponentSurface> };

const current = new Map(listRegistryComponents(REGISTRY).map((c) => [surfaceKey(c.layer, c.name), c]));

describe("no vocabulary loss against v1.0.0", () => {
  it("pins the v1.0.0 release, and all of it", () => {
    expect(pinned.release).toBe("1.0.0");
    expect(Object.keys(pinned.components).length).toBe(86);
  });

  it("is looking at real vocabulary — a gate over empty surfaces proves nothing", () => {
    const tokens = Object.values(pinned.components).reduce(
      (n, s) => n + Object.values(s.attrs).reduce((m, values) => m + values.length, 0) + s.bare.length,
      0,
    );
    expect(tokens).toBeGreaterThan(500);
    expect(pinned.components["recipes/dialog"].attrs["data-part"]).toContain("panel");
  });

  it("every component v1.0.0 shipped still ships, and honours everything it did", () => {
    const losses: string[] = [];
    for (const [key, before] of Object.entries(pinned.components)) {
      const component = current.get(key);
      const after = component ? extractSurface(component.dir, component.name) : null;
      for (const loss of surfaceLoss(before, after)) losses.push(`${key}: ${loss.token}`);
    }
    expect(losses).toEqual([]);
  });

  it("the gate bites: removing a honoured value is reported", () => {
    const [key, before] = Object.entries(pinned.components).find(
      ([, s]) => (s.attrs["data-part"] ?? []).length > 1,
    )!;
    const [dropped, ...kept] = before.attrs["data-part"];
    const after: ComponentSurface = { ...before, attrs: { ...before.attrs, "data-part": kept } };
    expect(surfaceLoss(before, after).map((l) => l.token), key).toEqual([`data-part="${dropped}"`]);
  });
});
