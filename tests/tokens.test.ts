import { describe, it, expect } from "bun:test";
import { join } from "node:path";

const REGISTRY = join(import.meta.dir, "../registry");

describe("token files", () => {
  it("palette.css contains oklch color values", async () => {
    const content = await Bun.file(join(REGISTRY, "tokens/palette.css")).text();
    expect(content).toContain("oklch(");
    expect(content).toContain("--palette-indigo-500");
    expect(content).toContain("--palette-red-500");
    expect(content).toContain("--palette-green-500");
    expect(content).toContain("--palette-amber-500");
    expect(content).toContain("--palette-gray-500");
  });

  it("semantic.css references palette tokens (never raw values)", async () => {
    const content = await Bun.file(join(REGISTRY, "tokens/semantic.css")).text();
    // All semantic tokens should reference palette via var()
    expect(content).toContain("var(--palette-");
    // Check key semantic tokens exist
    expect(content).toContain("--color-bg:");
    expect(content).toContain("--color-fg:");
    expect(content).toContain("--color-primary:");
    expect(content).toContain("--color-destructive:");
    expect(content).toContain("--color-border:");
  });

  it("spacing.css has the correct scale", async () => {
    const content = await Bun.file(join(REGISTRY, "tokens/spacing.css")).text();
    expect(content).toContain("--space-0:");
    expect(content).toContain("--space-1:");
    expect(content).toContain("--space-4:");
    expect(content).toContain("--space-8:");
    expect(content).toContain("--space-24:");
  });

  it("typography.css has font families and sizes", async () => {
    const content = await Bun.file(join(REGISTRY, "tokens/typography.css")).text();
    expect(content).toContain("--font-sans:");
    expect(content).toContain("--font-mono:");
    expect(content).toContain("--text-sm:");
    expect(content).toContain("--text-base:");
    expect(content).toContain("--weight-medium:");
    expect(content).toContain("--leading-normal:");
  });

  it("effects.css has radii, shadows, and z-index", async () => {
    const content = await Bun.file(join(REGISTRY, "tokens/effects.css")).text();
    expect(content).toContain("--radius-md:");
    expect(content).toContain("--shadow-sm:");
    expect(content).toContain("--z-modal:");
  });

  it("motion.css has easings and durations", async () => {
    const content = await Bun.file(join(REGISTRY, "tokens/motion.css")).text();
    expect(content).toContain("--ease-default:");
    expect(content).toContain("--duration-fast:");
    expect(content).toContain("--duration-normal:");
  });

  it("motion.css defines l-transition preset tokens (referencing base tokens)", async () => {
    const content = await Bun.file(join(REGISTRY, "tokens/motion.css")).text();
    // Semantic motion aliases consumed by base/motion-presets.css (0.4-11).
    expect(content).toContain("--motion-enter-duration:");
    expect(content).toContain("--motion-leave-duration:");
    expect(content).toContain("--motion-enter-ease:");
    expect(content).toContain("--motion-leave-ease:");
    expect(content).toContain("--motion-slide-distance:");
    expect(content).toContain("--motion-scale-from:");
    // Preset durations/easings alias existing base tokens, never hardcode a value.
    expect(content).toContain("var(--duration-normal)");
    expect(content).toContain("var(--ease-out)");
  });

  it("aliases.css references semantic tokens via var()", async () => {
    const content = await Bun.file(join(REGISTRY, "tokens/aliases.css")).text();
    expect(content).toContain("var(--radius-");
    expect(content).toContain("var(--shadow-");
    expect(content).toContain("--button-radius:");
    expect(content).toContain("--card-radius:");
    expect(content).toContain("--dialog-radius:");
  });

  it("index.css imports all token files", async () => {
    const content = await Bun.file(join(REGISTRY, "tokens/index.css")).text();
    expect(content).toContain("palette.css");
    expect(content).toContain("semantic.css");
    expect(content).toContain("spacing.css");
    expect(content).toContain("typography.css");
    expect(content).toContain("effects.css");
    expect(content).toContain("motion.css");
    expect(content).toContain("aliases.css");
  });

  it("default theme has dark mode overrides", async () => {
    const content = await Bun.file(join(REGISTRY, "themes/default.css")).text();
    expect(content).toContain('[data-theme="dark"]');
    expect(content).toContain("--color-bg:");
    expect(content).toContain("--color-fg:");
    expect(content).toContain("--shadow-xs:");
  });

  it("no token file contains hardcoded hex colors", async () => {
    const files = ["semantic.css", "aliases.css"];
    for (const file of files) {
      const content = await Bun.file(join(REGISTRY, "tokens", file)).text();
      // Should not have #hex colors (palette uses oklch, semantic uses var())
      const hexPattern = /#[0-9a-fA-F]{3,8}\b/;
      const lines = content.split("\n");
      for (const line of lines) {
        if (line.trim().startsWith("/*") || line.trim().startsWith("*")) continue;
        expect(hexPattern.test(line)).toBe(false);
      }
    }
  });
});
