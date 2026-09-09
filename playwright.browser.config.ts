import { defineConfig, devices } from "@playwright/test";

/**
 * Browser smoke suite — the runtime gate the three W2-1 defects walked past.
 *
 * Distinct from `playwright.config.ts` (screenshots, no controller JS, motion
 * frozen) and from `bun test` (controllers, but happy-dom). This config runs the
 * shipped engine against the shipped CSS in a real layout engine, with motion
 * **on**: `reducedMotion` is deliberately unset, because a transition that
 * actually runs — and a `transitionend` that actually bubbles — is the subject
 * under test.
 *
 * Run: `npm run test:browser`
 */
export default defineConfig({
  testDir: "./tests/browser",
  testMatch: "**/*.pw.ts",

  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  // Each spec walks every instance × every close path with real transition
  // settling time, so the per-test budget is generous by design.
  timeout: 120_000,

  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],

  use: {
    viewport: { width: 1280, height: 720 },
    colorScheme: "light",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
