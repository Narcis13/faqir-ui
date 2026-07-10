import { describe, it, expect } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

// base/motion-presets.css — attribute-driven l-transition presets. [0.4-11 · §A4]
const REGISTRY = join(import.meta.dir, "../../registry");
const PRESETS = join(REGISTRY, "base", "motion-presets.css");

describe("base/motion-presets.css", () => {
  it("exists", () => {
    expect(existsSync(PRESETS)).toBe(true);
  });

  it("styles the data-motion lifecycle stages (attribute-visible, auditable)", async () => {
    const css = await Bun.file(PRESETS).text();
    expect(css).toContain('[data-motion="enter"]');
    expect(css).toContain('[data-motion="enter-active"]');
    expect(css).toContain('[data-motion="leave"]');
    expect(css).toContain('[data-motion="leave-active"]');
  });

  it("provides all three named presets", async () => {
    const css = await Bun.file(PRESETS).text();
    expect(css).toContain('[l-transition="fade"]');
    expect(css).toContain('[l-transition="slide-up"]');
    expect(css).toContain('[l-transition="scale"]');
  });

  it("sources timing and geometry from motion tokens — no hardcoded durations", async () => {
    const css = await Bun.file(PRESETS).text();
    expect(css).toContain("var(--motion-enter-duration)");
    expect(css).toContain("var(--motion-leave-duration)");
    expect(css).toContain("var(--motion-enter-ease)");
    expect(css).toContain("var(--motion-slide-distance)");
    expect(css).toContain("var(--motion-scale-from)");
    // No raw time literals (e.g. "200ms", "0.2s") anywhere in preset CSS.
    const comments = css.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(comments).not.toMatch(/\d+\s*ms\b/);
    expect(comments).not.toMatch(/\b\d*\.?\d+\s*s\b/);
  });

  it("uses no per-stage classes and no !important", async () => {
    const css = await Bun.file(PRESETS).text();
    // Strip comments before asserting on the actual rules.
    const rules = css.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(rules).not.toContain("!important");
    // No CSS class selectors — the framework is class-free (attributes only).
    expect(rules).not.toMatch(/\.[a-zA-Z][\w-]*\s*\{/);
    expect(rules).not.toContain("enter-from");
    expect(rules).not.toContain("leave-to");
  });
});
