#!/usr/bin/env bun
/**
 * Write `registry/themes/{name}.preview.html` for every theme whose preview is
 * generated  [task 1.0R-10].
 *
 * Twelve themes declared a preview; seven had one. The five that did not are
 * rendered here from `renderThemePreview` in `src/theme-preview.ts` — one
 * gallery, one editorial seed per theme — rather than copied from a sibling.
 * The other seven are hand-authored on purpose and this script never touches
 * them; `BESPOKE_PREVIEWS` names them so that generated ∪ bespoke covers every
 * `registry/themes/*.css` and a new theme cannot slip through with neither.
 *
 * Run: `bun run gen:theme-previews` (or `bun scripts/gen-theme-previews.mjs`).
 * `bun test tests/themes/theme-previews.test.ts` re-renders and compares, so a
 * hand-edit to a generated file fails CI until this script is re-run.
 */
import { Glob } from "bun";
import { writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderThemePreview, GALLERY_PREVIEWS, BESPOKE_PREVIEWS } from "../src/theme-preview";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const THEMES_DIR = join(ROOT, "registry", "themes");

const themes = [...new Glob("*.css").scanSync(THEMES_DIR)].map((f) => basename(f, ".css")).sort();
const covered = new Set([...GALLERY_PREVIEWS.map((s) => s.name), ...BESPOKE_PREVIEWS]);
const uncovered = themes.filter((name) => !covered.has(name));
if (uncovered.length > 0) {
  console.error(`✗ No preview decision for theme(s): ${uncovered.join(", ")}`);
  console.error(`  Add a spec to GALLERY_PREVIEWS or a name to BESPOKE_PREVIEWS in src/theme-preview.ts.`);
  process.exit(1);
}

for (const spec of GALLERY_PREVIEWS) {
  const out = join(THEMES_DIR, `${spec.name}.preview.html`);
  writeFileSync(out, renderThemePreview(spec));
  console.log(`✓ ${spec.name}.preview.html`);
}

console.log(
  `\nWrote ${GALLERY_PREVIEWS.length} generated preview(s); ` +
    `${BESPOKE_PREVIEWS.length} hand-authored preview(s) left untouched.`,
);
