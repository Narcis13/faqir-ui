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
import { isSurfaceTokenFile, type ThemeManifest } from "../theme-manifest";
import type { DistinctivenessTheme } from "./distinctiveness";

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

/**
 * The themes already sitting in a directory, as the distinctiveness gate reads
 * them [1.1A-12]: the stylesheet, the scheme its manifest declares, and the
 * `axes` block that manifest carries.
 *
 * A theme with no `axes` block is SKIPPED rather than guessed at — that is a
 * 1.0 manifest, or a generated theme's document companion (which deliberately
 * carries neither seed nor axes, because its CSS was never run through
 * `axesFromCss`). An axis distance needs both sides' axes to be derived facts;
 * inferring one here would put a number on a comparison nobody measured.
 *
 * `exclude` is how a regeneration does not collide with the copy of itself it
 * is about to overwrite.
 */
export function readPeerThemes(dir: string, exclude: readonly string[] = []): DistinctivenessTheme[] {
  if (!existsSync(dir)) return [];
  const skip = new Set(exclude);
  const peers: DistinctivenessTheme[] = [];
  for (const file of readdirSync(dir).sort()) {
    if (!file.endsWith(".theme.json")) continue;
    const name = file.slice(0, -".theme.json".length);
    if (skip.has(name)) continue;
    const css = join(dir, `${name}.css`);
    if (!existsSync(css)) continue;
    let manifest: ThemeManifest;
    try {
      manifest = JSON.parse(readFileSync(join(dir, file), "utf8")) as ThemeManifest;
    } catch {
      // A directory the user edits by hand is not a database. An unreadable
      // manifest means "nothing to compare against", not a failed generation.
      continue;
    }
    if (!manifest.axes || !manifest.scheme) continue;
    peers.push({
      name: manifest.name ?? name,
      css: readFileSync(css, "utf8"),
      scheme: manifest.scheme,
      axes: manifest.axes,
    });
  }
  return peers;
}
