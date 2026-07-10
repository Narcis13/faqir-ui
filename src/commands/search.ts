import { existsSync } from "node:fs";
import { join } from "node:path";
import { log } from "../utils/logger";
import { configExists, readConfig } from "../utils/config";
import { getRegistryPath } from "../utils/fs";
import { loadManifest } from "../manifest";
import type { Layer } from "../utils/components";

interface SearchHit {
  name: string;
  layer: Layer;
  kind: string;
  description: string;
  aliases: string[];
  /** The alias that matched the query, if the match came via an alias. */
  matchedAlias?: string;
  /** Where the query matched (name, alias, description, category). */
  reasons: string[];
}

function printHelp() {
  log.heading("faqir search <query>");
  log.blank();
  console.log("Search the registry by name, alias, description, or category.");
  log.blank();
  console.log("Usage:");
  console.log("  faqir search alert");
  console.log("  faqir search \"date picker\"");
  log.blank();
  log.dim("Aliases resolve to their canonical component (e.g. 'alert' → 'callout').");
}

export async function search(args: string[]): Promise<void> {
  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    return;
  }

  const query = args
    .filter((a) => !a.startsWith("-"))
    .join(" ")
    .trim()
    .toLowerCase();

  if (!query) {
    log.error("No search query. Usage: faqir search <query>");
    log.dim("Run 'faqir search --help' for options.");
    process.exit(1);
  }

  const cwd = process.cwd();
  const registryPath = getRegistryPath();

  let installed = new Set<string>();
  if (configExists(cwd)) {
    const config = await readConfig(cwd);
    installed = new Set([
      ...config.installed.primitives,
      ...config.installed.recipes,
      ...config.installed.patterns,
    ]);
  }

  const hits: SearchHit[] = [];

  for (const layer of ["primitives", "recipes", "patterns"] as Layer[]) {
    const layerPath = join(registryPath, layer);
    if (!existsSync(layerPath)) continue;

    const glob = new Bun.Glob("*/");
    for (const dir of glob.scanSync({ cwd: layerPath, onlyFiles: false })) {
      const name = dir.replace(/\/$/, "");
      const manifestPath = join(layerPath, name, `${name}.manifest.json`);
      if (!existsSync(manifestPath)) continue;

      const m = await loadManifest(manifestPath);
      const aliases = Array.isArray(m.aliases) ? m.aliases : [];

      const reasons: string[] = [];
      let matchedAlias: string | undefined;

      if (name.toLowerCase().includes(query)) reasons.push("name");

      const aliasHit = aliases.find((a) => a.toLowerCase().includes(query));
      if (aliasHit) {
        reasons.push(`alias:${aliasHit}`);
        matchedAlias = aliasHit;
      }

      if (m.description?.toLowerCase().includes(query)) reasons.push("description");
      if (m.category?.toLowerCase().includes(query)) reasons.push("category");

      // Slot names and their descriptions — lets "dismiss" find the component
      // that owns a [data-part="dismiss"], etc.
      const slotText = Object.entries(m.slots ?? {})
        .flatMap(([slotName, slot]) => [slotName, slot?.description ?? ""])
        .join(" ")
        .toLowerCase();
      if (slotText.includes(query)) reasons.push("slot");

      if (reasons.length > 0) {
        hits.push({ name, layer, kind: m.kind, description: m.description, aliases, matchedAlias, reasons });
      }
    }
  }

  if (hits.length === 0) {
    log.heading(`No components match "${query}"`);
    log.dim("Run 'faqir list' to see all components.");
    return;
  }

  // Rank exact-name and alias matches first, then alphabetical.
  const rank = (h: SearchHit): number => {
    if (h.name.toLowerCase() === query) return 0;
    if (h.matchedAlias?.toLowerCase() === query) return 1;
    if (h.reasons.includes("name")) return 2;
    if (h.matchedAlias) return 3;
    return 4;
  };
  hits.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));

  log.heading(`Search results for "${query}" (${hits.length})`);
  log.blank();

  for (const hit of hits) {
    const mark = installed.has(hit.name) ? "\x1b[32m✓\x1b[0m" : "\x1b[2m·\x1b[0m";
    let note = "";
    if (hit.matchedAlias) {
      note = ` \x1b[2m(matched alias '${hit.matchedAlias}')\x1b[0m`;
    } else if (hit.aliases.length > 0) {
      note = ` \x1b[2m(aliases: ${hit.aliases.join(", ")})\x1b[0m`;
    }
    console.log(`  ${mark} \x1b[1m${hit.name}\x1b[0m \x1b[2m${hit.layer}/${hit.kind}\x1b[0m${note}`);
    console.log(`      \x1b[2m${hit.description}\x1b[0m`);
  }

  log.blank();
  log.dim("Add with: faqir add <name>");
}
