// Self-contained `faqir scaffold landing-page` output for the browser gates
// (task 0.7-08) — the mirror of ./document-pages.ts for the marketing scaffold.
//
// The four landing patterns are each scanned by the axe matrix on their own
// reference pages. This builds the page a *user* actually gets: the same
// production generator, the same registry sections, with the framework CSS
// inlined so the scan needs no network and no server.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  LANDING_COMPONENTS,
  LANDING_PATTERNS,
  generateLandingPage,
} from "../../src/scaffolds/landing";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const REGISTRY = join(ROOT, "registry");

const TOKEN_ORDER = [
  "palette",
  "spacing",
  "typography",
  "effects",
  "motion",
  "semantic",
  "aliases",
  "document",
  "doc-aliases",
] as const;
const BASE_ORDER = ["reset", "prose", "motion-presets"] as const;

function read(relativePath: string): string {
  return readFileSync(join(REGISTRY, relativePath), "utf8");
}

function componentCss(): string {
  const css: string[] = [];
  for (const component of [...LANDING_COMPONENTS, ...LANDING_PATTERNS]) {
    const layer = (["primitives", "recipes", "patterns"] as const).find((candidate) =>
      existsSync(join(REGISTRY, candidate, component)),
    );
    if (!layer) throw new Error(`Missing registry component: ${component}`);
    // `files.css` rather than `<name>.css` — the icon primitive ships icons.css.
    const dir = join(REGISTRY, layer, component);
    const sheet = JSON.parse(
      readFileSync(join(dir, `${component}.manifest.json`), "utf8"),
    ).files?.css as string | undefined;
    if (!sheet) throw new Error(`Missing stylesheet for landing scaffold component: ${component}`);
    css.push(read(`${layer}/${component}/${sheet}`));
  }
  return css.join("\n");
}

/** Output from the production generator, styled by the named theme. */
export function buildLandingScaffoldPage(theme = "default"): string {
  const tokens = TOKEN_ORDER.map((file) => read(`tokens/${file}.css`)).join("\n");
  const base = BASE_ORDER.map((file) => read(`base/${file}.css`)).join("\n");
  return generateLandingPage({
    title: "Landing Page",
    stylesheets: `  <style>${tokens}\n${read(`themes/${theme}.css`)}\n${base}\n${componentCss()}</style>`,
    registryPath: REGISTRY,
  });
}
