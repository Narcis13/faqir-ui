// Self-contained `faqir scaffold admin-dashboard` / `internal-tool` output for
// the browser gates (task 1.0R-08) — the mirror of ./landing-page.ts and
// ./document-pages.ts for the two application scaffolds.
//
// Until 1.0R-08 these two pages were hand-written HTML inside the command
// module, complete with a page-local <style> block, so no axe or visual gate
// could hold them to anything. They are composed from registry patterns now, so
// they are scanned like everything else: the same production generator, the same
// registry blocks, with the framework CSS inlined so the scan needs no network
// and no server.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  APP_SCAFFOLD_COMPONENTS,
  APP_SCAFFOLD_PATTERNS,
  generateAppPage,
  type AppScaffoldName,
} from "../../src/scaffolds/app";

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
  "density",
] as const;
const BASE_ORDER = ["reset", "prose", "rhythm", "motion-presets"] as const;

function read(relativePath: string): string {
  return readFileSync(join(REGISTRY, relativePath), "utf8");
}

function componentCss(name: AppScaffoldName): string {
  const css: string[] = [];
  for (const component of [...APP_SCAFFOLD_COMPONENTS[name], ...APP_SCAFFOLD_PATTERNS[name]]) {
    const layer = (["primitives", "recipes", "patterns"] as const).find((candidate) =>
      existsSync(join(REGISTRY, candidate, component)),
    );
    if (!layer) throw new Error(`Missing registry component: ${component}`);
    // `files.css` rather than `<name>.css` — the icon primitive ships icons.css.
    const dir = join(REGISTRY, layer, component);
    const sheet = JSON.parse(readFileSync(join(dir, `${component}.manifest.json`), "utf8")).files
      ?.css as string | undefined;
    if (!sheet) throw new Error(`Missing stylesheet for app scaffold component: ${component}`);
    css.push(read(`${layer}/${component}/${sheet}`));
  }
  return css.join("\n");
}

const CORE_DATA_SRC = `data:text/javascript;base64,${Buffer.from(
  read("core/faqir-core.js"),
).toString("base64")}`;

/** Output from the production generator, styled by the named theme. */
export function buildAppScaffoldPage(name: AppScaffoldName, theme = "default"): string {
  const tokens = TOKEN_ORDER.map((file) => read(`tokens/${file}.css`)).join("\n");
  const base = BASE_ORDER.map((file) => read(`base/${file}.css`)).join("\n");
  return generateAppPage(name, {
    title: name,
    stylesheets: `  <style>${tokens}\n${read(`themes/${theme}.css`)}\n${base}\n${componentCss(name)}</style>`,
    registryPath: REGISTRY,
    coreScriptSrc: CORE_DATA_SRC,
  });
}
