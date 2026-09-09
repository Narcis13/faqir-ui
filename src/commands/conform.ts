// faqir conform — normalize all component instances to canonical structure

import { existsSync } from "node:fs";
import { join, relative } from "node:path";
import { log } from "../utils/logger";
import { configExists, readConfig, missingConfigMessage } from "../utils/config";
import { loadManifest, type Manifest } from "../manifest";
import { tokenizeHTML, RAW_TEXT_ELEMENTS, type RawAttr } from "../parser/html-tokenizer";

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

/** The five attributes whose presence makes an element ours to reorder. */
const FAQIR_ATTRS = new Set(["data-ui", "data-part", "data-state", "data-variant", "data-size"]);

/**
 * Elements whose *content* must never be treated as markup.
 *
 * `script`/`style` are already handled for us — the tokenizer emits a raw-text
 * element's whole body as one text token, so nothing inside it is ever a start
 * tag. `textarea` and `title` are RCDATA, which the tokenizer explicitly does
 * not implement (see its scope note), so we skip their content here: a
 * `<textarea>` showing example markup to the user is text, and rewriting it
 * changes what the page displays.
 */
const OPAQUE_CONTENT = new Set([...RAW_TEXT_ELEMENTS, "textarea", "title"]);

/**
 * Write one attribute back out, preserving how it was authored.
 *
 * This function is the whole of the fix. The previous implementation built
 * every attribute as `name="value"` with hardcoded double quotes and no
 * escaping, which silently destroyed the two shapes that are *most* common in
 * Faqir markup:
 *
 *     l-data='{ "msg": "hi" }'   →  l-data="{ "msg": "hi" }"   ← broken
 *     title='He said "no"'       →  title="He said "no""       ← broken
 *
 * A value quoted in the source can never contain its own delimiter, so keeping
 * the delimiter is both faithful and safe — the round trip is byte-identical.
 * Only an unquoted source value needs a delimiter chosen, and only a value
 * containing *both* quote characters needs escaping.
 */
function serializeAttr(attr: RawAttr): string {
  if (attr.value === null) return attr.name; // bare attribute: `hidden`, not `hidden=""`
  if (attr.quote) return `${attr.name}=${attr.quote}${attr.value}${attr.quote}`;
  if (!attr.value.includes('"')) return `${attr.name}="${attr.value}"`;
  if (!attr.value.includes("'")) return `${attr.name}='${attr.value}'`;
  return `${attr.name}="${attr.value.replace(/"/g, "&quot;")}"`;
}

/**
 * Reorder attributes on elements carrying a Faqir protocol attribute.
 *
 * Tokenized, not regexed. The regex this replaced was applied globally to the
 * whole file, so it also matched — and rewrote — "tags" inside `<script>` and
 * `<style>` bodies, turning valid JavaScript into a SyntaxError:
 *
 *     <script> "<span data-part='x'>" </script>   →  SyntaxError
 *
 * and its `[^>]*?` attribute run stopped at the first `>` wherever it appeared,
 * so any tag with `>` inside an attribute value (`l-if="a > b"`) was skipped
 * without a word. The tokenizer gets both cases right by construction.
 *
 * Edits are collected with source offsets and applied back-to-front so earlier
 * offsets stay valid.
 */
function reorderAttributes(source: string): string {
  const edits: { start: number; end: number; text: string }[] = [];
  /** Set while inside an RCDATA element whose content must be left alone. */
  let opaqueUntil: string | null = null;

  for (const token of tokenizeHTML(source)) {
    if (opaqueUntil !== null) {
      if (token.type === "endTag" && token.name === opaqueUntil) opaqueUntil = null;
      continue;
    }
    if (token.type !== "startTag") continue;
    // The start tag itself is ordinary markup and may carry Faqir attributes;
    // only what follows it is opaque.
    if (OPAQUE_CONTENT.has(token.name) && !token.selfClosing) opaqueUntil = token.name;

    const attrs = token.rawAttrs;
    if (attrs.length === 0) continue;
    if (!attrs.some((a) => FAQIR_ATTRS.has(a.name))) continue;

    const sorted = [...attrs].sort((a, b) => {
      const ka = attrSortKey(a.name);
      const kb = attrSortKey(b.name);
      if (ka !== kb) return ka - kb;
      return a.name.localeCompare(b.name);
    });
    if (attrs.every((a, i) => a.name === sorted[i].name)) continue;

    // Tag name in its authored case — the token's `name` is lowercased, and the
    // name run always starts immediately after the `<`.
    const tagName = source.slice(token.start + 1, token.start + 1 + token.name.length);
    const body = sorted.map((a) => ` ${serializeAttr(a)}`).join("");
    edits.push({
      start: token.start,
      end: token.end,
      text: `<${tagName}${body}${token.selfClosing ? " /" : ""}>`,
    });
  }

  if (edits.length === 0) return source;
  let out = source;
  for (let i = edits.length - 1; i >= 0; i--) {
    const edit = edits[i];
    out = out.slice(0, edit.start) + edit.text + out.slice(edit.end);
  }
  return out;
}

// ── which project files the walk may touch ───────────────────────────────────

/**
 * Directories and file shapes never rewritten, whatever the glob says.
 *
 * The walk used to be an unfiltered recursive HTML glob from the cwd, with
 * only `node_modules` and `.faqir` excluded — so `faqir conform` rewrote build
 * output, vendored third-party HTML, and the user's own `.orig`/`.bak` copies
 * of a file they were mid-way through comparing. None of those are sources,
 * and two of them are things a person is actively relying on not changing.
 */
const DEFAULT_EXCLUDES = [
  "**/node_modules/**",
  "**/.git/**",
  ".faqir/**",
  "**/dist/**",
  "**/build/**",
  "**/vendor/**",
  "**/coverage/**",
  "**/.next/**",
  "**/*.orig",
  "**/*.orig.html",
  "**/*.bak",
  "**/*.bak.html",
  "**/*.rej",
];

/** Collect repeatable `--flag <value>` / `--flag=<value>` occurrences. */
function collectOption(args: string[], flag: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === flag) {
      const value = args[i + 1];
      if (value !== undefined && !value.startsWith("-")) {
        out.push(value);
        i++;
      }
    } else if (arg.startsWith(`${flag}=`)) {
      out.push(arg.slice(flag.length + 1));
    }
  }
  // Comma-separated forms are accepted too: `--exclude a/**,b/**`.
  return out.flatMap((v) => v.split(",")).map((v) => v.trim()).filter(Boolean);
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
      ["--include <glob>", "Only scan project files matching this glob (repeatable; default **/*.html)"],
      ["--exclude <glob>", "Skip project files matching this glob (repeatable; adds to the defaults)"],
    ]);
    log.blank();
    console.log("Both flags accept a comma-separated list and may be repeated.");
    console.log("Installed component files under output_dir are always processed;");
    console.log("--include/--exclude filter the project-wide HTML scan only.");
    log.blank();
    console.log("Always excluded: " + DEFAULT_EXCLUDES.join(", "));
    return;
  }

  const cwd = process.cwd();

  if (!configExists(cwd)) {
    log.error(missingConfigMessage(cwd));
    process.exit(1);
  }

  const dryRun = args.includes("--dry-run");
  const includes = collectOption(args, "--include");
  const excludes = [...DEFAULT_EXCLUDES, ...collectOption(args, "--exclude")];
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
  //
  // `output_dir` is authored as "./ui" while the glob yields "ui/…", so the skip
  // below has to compare normalized forms — otherwise it never fires, every
  // component file is processed a second time here, and --dry-run reports double
  // the real count. `skill.ts` normalizes the same field for the same reason.
  const outputDirRel = config.output_dir.replace(/^\.\//, "").replace(/\/$/, "");
  const excludeGlobs = excludes.map((pattern) => new Bun.Glob(pattern));
  const includeGlobs = includes.map((pattern) => new Bun.Glob(pattern));
  const glob = new Bun.Glob("**/*.html");
  for await (const path of glob.scan({ cwd, onlyFiles: true })) {
    if (excludeGlobs.some((g) => g.match(path))) continue;
    if (includeGlobs.length > 0 && !includeGlobs.some((g) => g.match(path))) continue;
    // Skip component source files (already processed above)
    if (path.startsWith(outputDirRel + "/")) {
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
