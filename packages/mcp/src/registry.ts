/**
 * Registry data layer for the write/verify tools.
 *
 * The read tools (0.5-01) resolve each registry artifact lazily per call. The
 * write/verify tools — `faqir_generate`, `faqir_scaffold_page`, `faqir_audit_html`,
 * `faqir_repair_html` — instead work against an **in-memory manifest map** loaded
 * once at server boot. That is what lets `faqir_audit_html`/`faqir_repair_html`
 * do zero filesystem access *per call*: they only ever touch the input string and
 * this pre-loaded map (see `auditHtmlSource`/`applyRepairsToSource`, which are pure).
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  listRegistryComponents,
  loadRegistryManifest,
  getRegistryAliases,
} from "../../../src/utils/components";
import type { Manifest } from "../../../src/manifest";

/**
 * Load every registry component manifest into a single map, keyed by both its
 * canonical `data-ui` name and each of its aliases (an alias points at the same
 * manifest object). This is the manifest source the audit/generate engines index
 * `data-ui` names into.
 */
export async function loadManifestMap(registryPath: string): Promise<Map<string, Manifest>> {
  const map = new Map<string, Manifest>();

  for (const name of listRegistryComponents(registryPath)) {
    const manifest = await loadRegistryManifest(name, registryPath);
    if (manifest) map.set(name, manifest);
  }

  // Alias keys resolve to the same manifest, so markup or a caller referencing an
  // alias name still finds the canonical component.
  for (const [alias, canonical] of getRegistryAliases(registryPath)) {
    const manifest = map.get(canonical);
    if (manifest && !map.has(alias)) map.set(alias, manifest);
  }

  return map;
}

/**
 * The concatenated design-token CSS, assembled in the registry's own `index.css`
 * `@import` order so the cascade is faithful. Exposed verbatim as the
 * `faqir://tokens` MCP resource — the definitive reference for every `var(--…)`
 * an agent may use. Falls back to a glob of `tokens/*.css` if `index.css` is absent.
 */
export function readTokenReference(registryPath: string): string {
  const tokenDir = join(registryPath, "tokens");
  const indexPath = join(tokenDir, "index.css");

  const files: string[] = [];
  if (existsSync(indexPath)) {
    const index = readFileSync(indexPath, "utf8");
    const importRe = /@import\s+['"]\.\/([^'"]+)['"]/g;
    let m: RegExpExecArray | null;
    while ((m = importRe.exec(index)) !== null) files.push(m[1]);
  }
  if (files.length === 0) {
    // Fallback: whatever token CSS files exist, in a stable order.
    for (const name of [
      "palette.css", "spacing.css", "typography.css", "effects.css",
      "motion.css", "semantic.css", "aliases.css",
    ]) {
      files.push(name);
    }
  }

  const parts: string[] = [
    "/* Faqir UI — design token reference (assembled from registry/tokens/). */",
    "/* Every value below is a CSS custom property you reference via var(--name). */",
    "",
  ];
  for (const file of files) {
    const path = join(tokenDir, file);
    if (!existsSync(path)) continue;
    parts.push(`/* ── tokens/${file} ── */`);
    parts.push(readFileSync(path, "utf8").trim());
    parts.push("");
  }

  return parts.join("\n");
}
