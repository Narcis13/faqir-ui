/**
 * Every disabled dim reads `--disabled-opacity`  [1.1A-27]
 *
 * 1.1A-15 gave the dim a token and re-pointed the seventeen rules that spelled
 * `opacity: 0.5`. Four were left on literals because they held DIFFERENT values
 * and re-pointing them would have changed rendering: `calendar`'s nav arrows
 * and `carousel`'s prev/next at 0.4, `menubar`'s `[aria-disabled]` item at 0.6
 * and `field-group`'s own `--field-disabled-opacity: 0.55`. So a theme that set
 * the role (`contrast`: 0.6) reached every disabled control except those four.
 *
 * They now scale the role — `calc(var(--disabled-opacity) * k)` — with `k`
 * chosen so the DEFAULT renders exactly what it rendered before. Pinned: the
 * sweep (no disabled rule dims with a literal), and the arithmetic at 0.5.
 */
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseBlocks } from "../../src/theme/scope";
import { stripCssComments } from "../../src/theme-manifest";

const REGISTRY = join(import.meta.dir, "../../registry");
const read = (rel: string) => stripCssComments(readFileSync(join(REGISTRY, rel), "utf8"));

/** `opacity` declarations of every rule whose selector is about being disabled. */
function disabledOpacities(css: string): Array<{ selector: string; value: string }> {
  const out: Array<{ selector: string; value: string }> = [];
  const walk = (blocks: ReturnType<typeof parseBlocks>) => {
    for (const block of blocks) {
      if (block.children.length) {
        walk(block.children);
        continue;
      }
      const selector = block.prelude.trim().replace(/\s+/g, " ");
      if (!/disabled/.test(selector)) continue;
      for (const decl of css.slice(block.braceAt + 1, block.closeAt).split(";")) {
        const m = /^\s*opacity\s*:\s*(.+?)\s*$/s.exec(decl);
        if (m) out.push({ selector, value: m[1] });
      }
    }
  };
  walk(parseBlocks(css));
  return out;
}

/** Evaluate `calc(var(--disabled-opacity) * k)` (or a bare var) at a role value. */
function atRole(value: string, role: number): number {
  if (value === "var(--disabled-opacity)") return role;
  const m = /^calc\(var\(--disabled-opacity\) \* ([\d.]+)\)$/.exec(value);
  if (!m) throw new Error(`not a scaled role: ${value}`);
  return role * Number(m[1]);
}

describe("disabled dims follow --disabled-opacity", () => {
  const files = [...new Bun.Glob("{primitives,recipes,patterns}/*/*.css").scanSync({ cwd: REGISTRY })];

  it("no component dims a disabled state with a literal opacity", () => {
    const literal: string[] = [];
    let seen = 0;
    for (const file of files) {
      for (const { selector, value } of disabledOpacities(read(file))) {
        seen++;
        if (!/var\(--(field-)?disabled-opacity\)/.test(value)) literal.push(`${file}: ${selector} { opacity: ${value} }`);
      }
    }
    expect(literal).toEqual([]);
    expect(seen).toBeGreaterThanOrEqual(20);
  });

  it("the four scaled dims render what they rendered before, at the 0.5 default", () => {
    const value = (file: string, part: string) =>
      disabledOpacities(read(file)).find((d) => d.selector.includes(part))!.value;
    expect(atRole(value("recipes/calendar/calendar.css", "nav-prev"), 0.5)).toBeCloseTo(0.4, 10);
    expect(atRole(value("recipes/carousel/carousel.css", "prev"), 0.5)).toBeCloseTo(0.4, 10);
    expect(atRole(value("recipes/menubar/menubar.css", "aria-disabled"), 0.5)).toBeCloseTo(0.6, 10);

    const field = /--field-disabled-opacity:\s*([^;]+);/.exec(read("tokens/doc-aliases.css"))![1].trim();
    expect(atRole(field, 0.5)).toBeCloseTo(0.55, 10);
  });

  it("…and move with a theme that states the role", () => {
    // `contrast` sets 0.6: the arrows follow to 0.48 instead of staying at 0.4.
    expect(atRole(disabledOpacities(read("recipes/carousel/carousel.css"))[0].value, 0.6)).toBeCloseTo(0.48, 10);
  });
});
