// faqir conform — normalize all component instances to canonical structure

import { existsSync } from "node:fs";
import { join, relative } from "node:path";
import { log } from "../utils/logger";
import { configExists, readConfig } from "../utils/config";
import { loadManifest, type Manifest } from "../manifest";

/** Canonical attribute order for Faqir component elements. */
const CANONICAL_ORDER = [
  "data-ui",
  "data-part",
  "data-state",
  "data-variant",
  "data-size",
  "role",
  "aria-modal",
  "aria-labelledby",
  "aria-describedby",
  "aria-label",
  "aria-selected",
  "aria-controls",
  "aria-expanded",
  "aria-haspopup",
  "aria-hidden",
  "id",
  "class",
  "tabindex",
  "hidden",
  "disabled",
  "type",
  "name",
  "value",
  "placeholder",
  "for",
  "href",
  "src",
];

/** Get the sort key for an attribute name. Lower = earlier. */
function attrSortKey(name: string): number {
  const idx = CANONICAL_ORDER.indexOf(name);
  if (idx >= 0) return idx;
  // aria-* attributes cluster together after explicit ones
  if (name.startsWith("aria-")) return CANONICAL_ORDER.length;
  // data-* attributes cluster after aria
  if (name.startsWith("data-")) return CANONICAL_ORDER.length + 1;
  // Everything else at the end
  return CANONICAL_ORDER.length + 2;
}

/** Machine comment templates for HTML files */
function buildMachineComments(manifest: Manifest): string {
  const lines: string[] = [];

  lines.push(`<!-- @ui:component ${manifest.name} -->`);
  lines.push(`<!-- @ui:kind ${manifest.kind} -->`);

  if (manifest.slots && Object.keys(manifest.slots).length > 0) {
    lines.push(`<!-- @ui:slots ${Object.keys(manifest.slots).join(" ")} -->`);
  }

  if (manifest.variants && Object.keys(manifest.variants).length > 0) {
    const variantStrs = Object.entries(manifest.variants)
      .map(([name, v]) => `${name}=${v.values.join("|")}`)
      .join(" ");
    lines.push(`<!-- @ui:variants ${variantStrs} -->`);
  }

  if (manifest.files.js) {
    lines.push(`<!-- @ui:controller ${manifest.files.js} -->`);
  }

  return lines.join("\n");
}

/** Machine comment template for CSS files */
function buildCSSMachineComments(manifest: Manifest): string {
  const lines: string[] = [];
  lines.push(`/* @ui:component ${manifest.name} */`);
  if (manifest.tokens_used && manifest.tokens_used.length > 0) {
    lines.push(`/* @ui:tokens ${manifest.tokens_used.join(" ")} */`);
  }
  return lines.join("\n");
}

// Regex to match an opening HTML tag with its attributes
const TAG_WITH_ATTRS_RE = /<([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^>]*?)?)(\s*\/?)>/g;
const ATTR_RE = /([a-zA-Z_][\w.:-]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|(\S+)))?/g;

interface ParsedAttr {
  name: string;
  value: string | null;
  raw: string;
}

function parseAttrsFromString(attrStr: string): ParsedAttr[] {
  const attrs: ParsedAttr[] = [];
  let match: RegExpExecArray | null;
  ATTR_RE.lastIndex = 0;
  while ((match = ATTR_RE.exec(attrStr)) !== null) {
    const name = match[1];
    const value = match[2] ?? match[3] ?? match[4] ?? null;
    // Reconstruct the raw attribute
    let raw: string;
    if (value === null && !match[0].includes("=")) {
      raw = name;
    } else {
      raw = `${name}="${value ?? ""}"`;
    }
    attrs.push({ name, value, raw });
  }
  return attrs;
}

/**
 * Reorder attributes on elements that have data-ui or data-part attributes.
 */
function reorderAttributes(source: string): string {
  return source.replace(TAG_WITH_ATTRS_RE, (fullMatch, tagName, attrString, closing) => {
    if (!attrString || attrString.trim().length === 0) return fullMatch;

    const attrs = parseAttrsFromString(attrString);
    if (attrs.length === 0) return fullMatch;

    // Only process elements with faqir attributes
    const hasFaqirAttr = attrs.some(
      (a) => a.name === "data-ui" || a.name === "data-part" || a.name === "data-state" || a.name === "data-variant" || a.name === "data-size"
    );
    if (!hasFaqirAttr) return fullMatch;

    // Sort attributes
    const sorted = [...attrs].sort((a, b) => {
      const ka = attrSortKey(a.name);
      const kb = attrSortKey(b.name);
      if (ka !== kb) return ka - kb;
      return a.name.localeCompare(b.name);
    });

    // Check if already in order
    const alreadyOrdered = attrs.every((a, i) => a.name === sorted[i].name);
    if (alreadyOrdered) return fullMatch;

    const attrStr = sorted.map((a) => a.raw).join(" ");
    return `<${tagName} ${attrStr}${closing}>`;
  });
}

/**
 * Ensure machine comments are present at the top of component HTML files.
 */
function ensureMachineCommentsHTML(source: string, manifest: Manifest): string {
  const expected = buildMachineComments(manifest);
  const firstLine = expected.split("\n")[0];

  // Already has machine comments
  if (source.includes(firstLine)) return source;

  return expected + "\n" + source;
}

/**
 * Ensure machine comments are present at the top of component CSS files.
 */
function ensureMachineCommentsCSS(source: string, manifest: Manifest): string {
  const expected = buildCSSMachineComments(manifest);
  const firstLine = expected.split("\n")[0];

  // Already has machine comments
  if (source.includes(firstLine)) return source;

  return expected + "\n" + source;
}

export async function conform(args: string[]): Promise<void> {
  if (args.includes("--help") || args.includes("-h")) {
    log.heading("faqir conform");
    log.blank();
    console.log("Normalize all component instances to canonical structure.");
    log.blank();
    console.log("What it does:");
    console.log("  - Reorder attributes to canonical order (data-ui, data-part, data-state, ...)");
    console.log("  - Ensure machine comments are present at top of component files");
    log.blank();
    console.log("Options:");
    log.table([
      ["--dry-run", "Show what would change without writing"],
    ]);
    return;
  }

  const cwd = process.cwd();

  if (!configExists(cwd)) {
    log.error("No faqir.config.json found. Run 'faqir init' first.");
    process.exit(1);
  }

  const dryRun = args.includes("--dry-run");
  const config = await readConfig(cwd);
  const outputDir = join(cwd, config.output_dir);

  log.heading("Faqir Conform");
  log.blank();

  let filesChanged = 0;

  // Process installed component files
  for (const layer of ["primitives", "recipes", "patterns"] as const) {
    for (const name of config.installed[layer]) {
      const baseDir = join(outputDir, layer, name);
      const manifestPath = join(baseDir, `${name}.manifest.json`);
      if (!existsSync(manifestPath)) continue;

      const manifest = await loadManifest(manifestPath);

      // Process HTML file
      const htmlPath = join(baseDir, manifest.files.html);
      if (existsSync(htmlPath)) {
        const original = await Bun.file(htmlPath).text();
        let modified = reorderAttributes(original);
        modified = ensureMachineCommentsHTML(modified, manifest);

        if (modified !== original) {
          const relPath = relative(cwd, htmlPath);
          if (dryRun) {
            log.step(`Would update: ${relPath}`);
          } else {
            await Bun.write(htmlPath, modified);
            log.success(`Updated: ${relPath}`);
          }
          filesChanged++;
        }
      }

      // Process CSS file
      const cssPath = join(baseDir, `${name}.css`);
      if (existsSync(cssPath)) {
        const original = await Bun.file(cssPath).text();
        const modified = ensureMachineCommentsCSS(original, manifest);

        if (modified !== original) {
          const relPath = relative(cwd, cssPath);
          if (dryRun) {
            log.step(`Would update: ${relPath}`);
          } else {
            await Bun.write(cssPath, modified);
            log.success(`Updated: ${relPath}`);
          }
          filesChanged++;
        }
      }
    }
  }

  // Process project HTML files (reorder attributes only)
  const glob = new Bun.Glob("**/*.html");
  for await (const path of glob.scan({ cwd, onlyFiles: true })) {
    if (path.includes("node_modules")) continue;
    if (path.startsWith(".faqir")) continue;
    // Skip component source files (already processed above)
    if (path.startsWith(config.output_dir + "/")) {
      const parts = path.split("/");
      // Skip if it's layer/name/name.html (component source)
      if (parts.length >= 4) continue;
    }

    const filePath = join(cwd, path);
    const original = await Bun.file(filePath).text();
    const modified = reorderAttributes(original);

    if (modified !== original) {
      if (dryRun) {
        log.step(`Would update: ${path}`);
      } else {
        await Bun.write(filePath, modified);
        log.success(`Updated: ${path}`);
      }
      filesChanged++;
    }
  }

  log.blank();
  if (filesChanged === 0) {
    log.success("All files already conform to canonical structure.");
  } else if (dryRun) {
    log.info(`${filesChanged} file(s) would be updated. Run without --dry-run to apply.`);
  } else {
    log.success(`${filesChanged} file(s) updated.`);
  }
}
