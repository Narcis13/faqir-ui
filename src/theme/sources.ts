// ═══════════════════════════════════════════════════════════════════════════
// The token stylesheets the generator reads                    [task 1.1A-11]
// ═══════════════════════════════════════════════════════════════════════════
//
// `generateThemeBundle` is pure — it takes CSS strings and returns CSS strings.
// Somebody still has to READ those strings off the registry, and until this
// file there were two somebodies: the CLI globbed `registry/tokens/*.css` and
// filtered with `isSurfaceTokenFile`, while the MCP server handed the whole
// concatenated token reference over as a single source. That is not a cosmetic
// difference — `surfaceTokens()` is derived from the files it is given, so the
// MCP server's "surface" silently included `density.css` and `textures.css`,
// which `NON_SURFACE_TOKEN_FILES` exists to keep out of it.
//
// One reader, so the CLI and the MCP tool generate from the same base layer and
// `assertSurfaceOnly` means the same thing on both. `node:fs` rather than
// `Bun.Glob` because this module is compiled into `dist/faqir.mjs` and run on
// plain Node.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isSurfaceTokenFile } from "../theme-manifest";

/** `registry/tokens/density.css` — the file the density axis re-declares. */
export const DENSITY_TOKEN_FILE = "density.css";

/**
 * Every themeable-surface token stylesheet, in a stable (alphabetical) order.
 *
 * The order is the one the generator has always used and is what keeps
 * `generateThemeBundle` byte-deterministic across machines: `readdirSync` makes
 * no ordering promise of its own.
 */
export function themeBaseSources(registryPath: string): string[] {
  const tokensDir = join(registryPath, "tokens");
  return readdirSync(tokensDir)
    .filter((file) => file.endsWith(".css") && isSurfaceTokenFile(file))
    .sort()
    .map((file) => readFileSync(join(tokensDir, file), "utf8"));
}

/**
 * `density.css`, which is NOT part of the themeable surface (it re-declares
 * surface tokens inside `[data-density]` subtree scopes) and so is not among
 * {@link themeBaseSources} — but which the scorecard has to read, because the
 * tap-target heights a seed's density lands on live nowhere else.
 *
 * Returns `""` when the file is absent, which is what a scorecard with no tap
 * targets means: the registry has no density ramp to measure.
 */
export function densityTokenCss(registryPath: string): string {
  const path = join(registryPath, "tokens", DENSITY_TOKEN_FILE);
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}
