import { defineConfig, devices } from "@playwright/test";

/**
 * Automated accessibility suite — task 0.4-24 (FAQIR-PLAN §12.3).
 *
 * A separate config from the visual suite (playwright.config.ts) on purpose: this
 * gate is pass/fail (axe violations), not a pixel diff, so it needs none of the
 * snapshot machinery — no baselines, no platform-pinned container, no sharding.
 * It shares the *harness* (the registry-derived matrix + page builder in
 * tests/visual/matrix.ts) but nothing else, and runs in seconds on any platform
 * because axe evaluates the DOM/CSS, not rasterised pixels.
 *
 * Run:   npx playwright test --config=playwright.a11y.config.ts   (npm run test:a11y)
 */
export default defineConfig({
  testDir: "./tests/a11y",
  // Only Playwright specs — keep `bun test` (the meta-tests) and this runner from
  // colliding, exactly as the visual config does.
  testMatch: "**/*.pw.ts",

  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  // Scans are deterministic; a runaway case shouldn't hang the job.
  timeout: 30_000,

  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],

  use: {
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    // The scheme axis is driven by data-theme on <html> (see buildPageHtml), not
    // the media query — pin the media feature so a stray prefers-color-scheme
    // block can't perturb what axe evaluates.
    colorScheme: "light",
    reducedMotion: "reduce",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
