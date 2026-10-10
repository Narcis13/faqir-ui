// ═══════════════════════════════════════════════════════════════════════════
// Reduced motion must WIN the cascade, not merely be present
// ═══════════════════════════════════════════════════════════════════════════
//
// The registry audit checks that an animated stylesheet HAS a
// `prefers-reduced-motion` block. That is not enough: `bento` and `reveal`
// shipped one whose selectors were less specific than the entrance rules they
// were meant to cancel (`[data-ui="bento"] > … > [data-part="item"]`, 0,2,0,
// against the `[data-animate]` entrance at 0,3,0), so the tiles kept scrubbing
// in under reduced motion — found by the landing-craft showcase.
//
// The rule pinned here: every selector that STARTS an animation outside a
// reduced-motion block appears verbatim in a reduced-motion block rule that
// sets `animation: none`. Equal specificity plus later source order is then a
// guarantee, not an accident of how the selectors happened to be written.

import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Glob } from "bun";

const REGISTRY = join(import.meta.dir, "../../registry");
const SHEETS = ["primitives", "recipes", "patterns"]
  .flatMap((layer) => [...new Glob(`${layer}/*/*.css`).scanSync(REGISTRY)])
  .sort();

interface Rule {
  selectors: string[];
  body: string;
  at: number;
}

/** Innermost `selector { declarations }` rules, with their offset in the sheet. */
function rules(css: string): Rule[] {
  const out: Rule[] = [];
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const prelude = m[1].trim();
    if (prelude.startsWith("@") || /^(from|to|\d+%)/.test(prelude)) continue;
    out.push({ selectors: prelude.split(/,(?![^(]*\))/).map((s) => s.trim().replace(/\s+/g, " ")), body: m[2], at: m.index! });
  }
  return out;
}

/** [start, end) offsets of every block whose media query asks for reduced motion. */
function reducedBlocks(css: string): Array<[number, number]> {
  const blocks: Array<[number, number]> = [];
  for (const m of css.matchAll(/@media[^{]*prefers-reduced-motion:\s*reduce[^{]*\{/g)) {
    let depth = 1;
    let i = m.index! + m[0].length;
    for (; i < css.length && depth > 0; i++) {
      if (css[i] === "{") depth++;
      else if (css[i] === "}") depth--;
    }
    blocks.push([m.index!, i]);
  }
  return blocks;
}

describe("reduced motion wins the cascade", () => {
  for (const sheet of SHEETS) {
    const css = readFileSync(join(REGISTRY, sheet), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const blocks = reducedBlocks(css);
    const inside = (at: number) => blocks.some(([a, b]) => at > a && at < b);
    const all = rules(css);
    const starters = all.filter(
      (r) => !inside(r.at) && /(^|;)\s*animation(-name)?\s*:\s*(?!none)/.test(r.body),
    );
    // Only sheets whose motion is meant to be removed, not merely calmed: a
    // reduced-motion block that sets `animation: none` somewhere.
    const cancelled = new Set(
      all
        .filter((r) => inside(r.at) && /animation\s*:\s*none/.test(r.body))
        .flatMap((r) => r.selectors),
    );
    if (starters.length === 0 || cancelled.size === 0) continue;

    it(`${sheet}: every entrance selector is cancelled at its own specificity`, () => {
      const uncancelled = starters
        .flatMap((r) => r.selectors)
        // Pseudo-elements and loops a sheet calms rather than stops are out of scope.
        .filter((s) => !s.includes("::") && !cancelled.has(s));
      expect(uncancelled.filter((s) => /data-animate|data-trigger|data-stagger|:not\(\[data-stagger/.test(s))).toEqual([]);
    });
  }

  it("covers the entrances the landing-craft page relies on", () => {
    const names = SHEETS.map((s) => s.split("/")[1]);
    for (const name of ["bento", "reveal", "testimonials", "hero"]) expect(names).toContain(name);
  });
});
