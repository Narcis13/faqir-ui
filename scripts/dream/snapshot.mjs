#!/usr/bin/env node
/**
 * A light/dark PNG pair of a theme's preview  [task 1.1N-01]
 *
 * The deterministic gates say a theme is *correct*. They cannot say it is worth
 * a human's minute, and §10.5 is explicit that the taste gate needs something
 * to look at — so every dream ends with two pictures the scorecard references
 * and the PR shows.
 *
 * Dev-time only, and deliberately so: Playwright is already a devDependency and
 * the browser is already installed for the visual suite, so this adds nothing
 * to the dependency budget §10.2 protects. Nothing under `bun run test` launches
 * it — the pure half (which URLs, which files) is exported and tested, the
 * impure half takes its browser as an argument.
 *
 * A generated preview inlines every stylesheet it needs (`renderGeneratedPreview`
 * writes into a bare drop folder with no registry beside it), so `file://` is
 * enough and the shift needs no server. The preview reads `?scheme=light|dark`
 * and sets `data-theme` on the root from it, which is how one file yields both.
 *
 * Run: `node scripts/dream/snapshot.mjs --theme editorial --out .faqir-dreams/out/<id>`
 */
import { existsSync, mkdirSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** The two schemes every pair carries, in the order the scorecard shows them. */
export const SNAPSHOT_SCHEMES = ["light", "dark"];

/**
 * The viewport. Wide enough that the preview's gallery lays out as it was
 * designed to rather than collapsing to its narrow tier — a picture of the
 * responsive fallback would score the wrong thing — and tall enough to reach
 * the controls below the fold without a full-page capture, which stitches and
 * is not comparable between runs.
 */
export const SNAPSHOT_VIEWPORT = { width: 1280, height: 1600 };

/**
 * What a capture will do, computed without touching a browser.
 *
 * Separated out so the pipeline can state its intent — and a test can check it —
 * without Chromium being installed, which is also what keeps this file reachable
 * from `bun run test` at all.
 */
export function snapshotPlan({ theme, outDir, root = ROOT }) {
  if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(String(theme ?? ""))) {
    throw new Error(`'${theme}' is not a theme name (lowercase kebab-case).`);
  }
  const previewPath = join(root, "registry", "themes", `${theme}.preview.html`);
  const absoluteOut = isAbsolute(outDir) ? outDir : join(root, outDir);
  const base = pathToFileURL(previewPath).href;
  return {
    theme,
    preview: previewPath,
    outDir: absoluteOut,
    viewport: SNAPSHOT_VIEWPORT,
    shots: SNAPSHOT_SCHEMES.map((scheme) => ({
      scheme,
      url: `${base}?scheme=${scheme}`,
      file: join(absoluteOut, `${theme}-${scheme}.png`),
    })),
  };
}

/** The default browser source, imported lazily so importing this file is cheap. */
async function defaultLaunch() {
  const { chromium } = await import("@playwright/test");
  return chromium.launch();
}

/**
 * Capture the plan's shots. `launch` is injectable for the same reason the
 * pipeline's spawner is: a test that needs a real Chromium to check that two
 * filenames were chosen correctly is a test nobody runs.
 */
export async function captureSnapshots(plan, { launch = defaultLaunch } = {}) {
  if (!existsSync(plan.preview)) {
    throw new Error(
      `No preview at ${plan.preview}. The theme's manifest declares one, so either the ` +
        `generator did not run or gen:theme-previews has not caught up.`,
    );
  }
  mkdirSync(plan.outDir, { recursive: true });
  const browser = await launch();
  const written = [];
  try {
    for (const shot of plan.shots) {
      const page = await browser.newPage({ viewport: plan.viewport });
      try {
        await page.goto(shot.url, { waitUntil: "load" });
        // The preview applies `?scheme=` from an inline script on load; one
        // animation frame is enough for the attribute to be painted, and the
        // themes that animate declare `motion` presets far shorter than this.
        await page.waitForTimeout(250);
        await page.screenshot({ path: shot.file });
        written.push(shot.file);
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
  return written;
}

/** Parse this script's own argv. Returns `null` for `--help`. */
export function parseSnapshotArgs(argv) {
  if (argv.includes("--help") || argv.includes("-h")) return null;
  const parsed = { theme: null, outDir: null };
  for (let i = 0; i < argv.length; i++) {
    const [flag, inline] = argv[i].split(/=(.*)/s);
    const take = () => {
      if (inline !== undefined && inline !== "") return inline;
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) throw new Error(`${flag} requires a value.`);
      i += 1;
      return next;
    };
    if (flag === "--theme") parsed.theme = take();
    else if (flag === "--out") parsed.outDir = take();
    else throw new Error(`Unknown option '${argv[i]}'. Usage: --theme <name> --out <dir>`);
  }
  if (!parsed.theme) throw new Error("--theme <name> is required.");
  if (!parsed.outDir) throw new Error("--out <dir> is required.");
  return parsed;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const parsed = parseSnapshotArgs(process.argv.slice(2));
    if (!parsed) {
      console.log("Usage: node scripts/dream/snapshot.mjs --theme <name> --out <dir>");
    } else {
      const plan = snapshotPlan(parsed);
      const written = await captureSnapshots(plan);
      for (const file of written) console.log(`✓ ${file}`);
    }
  } catch (error) {
    console.error(`\n✗ ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
