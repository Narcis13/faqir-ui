import { defineConfig, devices } from "@playwright/test";

/**
 * Visual-regression suite — task 0.4-23 (FAQIR-PLAN §12.2).
 *
 * The suite (tests/visual/visual.pw.ts) screenshots every component × every theme
 * × light/dark × LTR/RTL, all generated from the registry at runtime. See
 * tests/visual/README.md for the runtime budget, sharding, and baseline flow.
 *
 * Screenshots are platform-specific (font rasterisation differs across OSes), so
 * baselines and the CI comparison run in the SAME pinned Linux container
 * (mcr.microsoft.com/playwright:v1.61.1-noble). That is why the snapshot path is
 * platform-agnostic — there is exactly one baseline set, produced in that image.
 * A developer's local run regenerates its own (git-ignored) set to compare
 * against, and never commits it.
 */
export default defineConfig({
  testDir: "./tests/visual",
  // Only Playwright specs — keep `bun test` and this runner from colliding.
  testMatch: "**/*.pw.ts",
  // Printed PDFs have their own runner, rasterizer, and small baseline
  // set. Keep them out of the 2k+ screen matrix and its four-way sharding.
  testIgnore: "print/**/*.pw.ts",

  // One baseline set, keyed only by the snapshot name (the matrix case id).
  snapshotPathTemplate: "{testDir}/__screenshots__/{arg}{ext}",

  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  // Screenshots are deterministic; a runaway matrix shouldn't hang a shard.
  timeout: 30_000,

  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }], ["list"]]
    : [["html", { open: "never" }], ["list"]],

  use: {
    // One viewport (§12.2: "one viewport"). fullPage captures the whole page,
    // so height grows with content; only the width is fixed here.
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    // Scheme is driven by data-theme on <html>, not the media query — pin the
    // media feature so a stray prefers-color-scheme block can't perturb a render.
    colorScheme: "light",
    reducedMotion: "reduce",
  },

  expect: {
    toHaveScreenshot: {
      // Freeze CSS animations/transitions (spinner, skeleton, toast…) and hide
      // the text caret so nothing time-dependent leaks into a capture.
      animations: "disabled",
      caret: "hide",
      scale: "css",
      // Strict enough to catch a 1px shift, with a hair of tolerance for
      // sub-pixel AA jitter between container patch versions.
      maxDiffPixelRatio: 0.002,
    },
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
