// ═══════════════════════════════════════════════════════════════════════════
// The happy-dom realm keeps a MutationObserver hooked up across a GC
// ═══════════════════════════════════════════════════════════════════════════
//
// happy-dom before 20.11.2 held each observer's per-target callback ONLY through
// a `WeakRef` (`MutationObserverListener`: `callback: new WeakRef((record) =>
// this.report(record))`, with nothing else referencing the arrow). Once the
// garbage collector ran, `Node[reportMutation]` found the ref empty and spliced
// the listener off the node, so the observer never fired again for that target.
// Upstream fixed it in 20.11.2 ("MutationObserver callback being GC'd due to
// orphaned WeakRef").
//
// That was the whole of follow-up 1.1A-23. Whether a given test saw its
// delivery depended on whether a GC happened to land between `observe()` and the
// mutation — rare in a short run, likely in the main partition's big shared
// heap — which is why `tests/core/lifecycle.test.ts`'s late-append `l-cloak`
// case and `tests/recipes/tree-view-reactive.test.ts`'s observer-driven reorder
// failed intermittently, only in the full suite, and "all or nothing" (a
// dropped listener stays dropped, so no `settle()` budget could reach it).
//
// `package.json` now requires `^20.11.2`, but `bun.lock` is not committed, so a
// checkout installed before the bump keeps whatever it resolved. This file
// turns that stale install from a 1-in-10 flake somewhere else into a
// deterministic, named failure here.

import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/** The happy-dom the global registrator actually loaded — the realm's, not ours. */
function realmHappyDomVersion(): string {
  const registrator = require.resolve("@happy-dom/global-registrator");
  const manifest = Bun.resolveSync("happy-dom/package.json", dirname(registrator));
  return JSON.parse(readFileSync(manifest, "utf8")).version;
}

function atLeast(version: string, floor: string): boolean {
  const a = version.split(".").map(Number);
  const b = floor.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return true;
}

describe("the shared happy-dom realm", () => {
  it("is a happy-dom that holds observer callbacks strongly (>= 20.11.2)", () => {
    const version = realmHappyDomVersion();
    expect(
      atLeast(version, "20.11.2"),
      `happy-dom ${version} drops MutationObserver deliveries after a GC — run \`bun install\``,
    ).toBe(true);
  });

  it("still delivers to an observer after the garbage collector has run", async () => {
    const target = document.createElement("div");
    let deliveries = 0;
    const observer = new MutationObserver(() => {
      deliveries++;
    });
    observer.observe(target, { childList: true, subtree: true });

    // Collect between observe() and the mutation — the window the old WeakRef
    // lost. Across turns, so nothing on this job's stack keeps it alive.
    for (let i = 0; i < 2; i++) {
      await tick();
      Bun.gc(true);
    }
    await tick();

    target.appendChild(document.createElement("span"));
    await tick();

    expect(deliveries, "the observer was unhooked by a GC").toBe(1);
    observer.disconnect();
  });
});
