import { defineConfig, devices } from "@playwright/test";

/**
 * Print visual regression — task 0.6-10 (FAQIR-PLAN §7.4 / §12).
 *
 * Chromium creates PDFs from the document references; pdftoppm then rasterizes
 * every physical page and Playwright image-diffs those PNGs. CI and baseline
 * updates use the same pinned Playwright Linux container.
 */
export default defineConfig({
  testDir: "./tests/visual/print",
  testMatch: "**/*.pw.ts",
  snapshotPathTemplate: "{testDir}/__screenshots__/{arg}{ext}",

  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 45_000,

  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }], ["list"]]
    : [["html", { open: "never" }], ["list"]],

  use: {
    ...devices["Desktop Chrome"],
    colorScheme: "light",
    reducedMotion: "reduce",
  },

  expect: {
    toMatchSnapshot: {
      // Same container + browser + rasterizer should be exact. A tiny YIQ
      // threshold tolerates imperceptible edge noise while maxDiffPixels keeps
      // page-number glyph changes well above the failure boundary.
      threshold: 0.1,
      maxDiffPixels: 25,
    },
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
