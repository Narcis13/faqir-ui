import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { log } from "../utils/logger";
import { configExists, readConfig, writeConfig, missingConfigMessage } from "../utils/config";
import { ensureDir, getPackageRoot } from "../utils/fs";
import { controllerName } from "../utils/components";
import { regenerateContext } from "../utils/codegen";
import { generateBundle } from "../utils/bundler";

type Kind = "primitive" | "recipe" | "pattern";

/** Which layer directory a kind is scaffolded into. */
const LAYER: Record<Kind, "primitives" | "recipes" | "patterns"> = {
  primitive: "primitives",
  recipe: "recipes",
  pattern: "patterns",
};

interface CreateOptions {
  kind: Kind | null;
  category: string;
}

function parseArgs(args: string[]): { name: string | null; options: CreateOptions } {
  let name: string | null = null;
  const options: CreateOptions = { kind: null, category: "custom" };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--kind": {
        const val = args[++i];
        if (val === "primitive" || val === "recipe" || val === "pattern") {
          options.kind = val;
        } else {
          log.error(`Invalid kind: ${val}. Must be: primitive, recipe, pattern`);
          process.exit(1);
        }
        break;
      }
      case "--category":
        options.category = args[++i] || "custom";
        break;
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
        break;
      default:
        if (!args[i].startsWith("-")) {
          name = args[i];
        }
    }
  }

  return { name, options };
}

function printHelp() {
  log.heading("faqir create <name> --kind <primitive|recipe|pattern>");
  log.blank();
  console.log("Scaffold a new custom component with manifest, CSS, HTML, and optional JS.");
  log.blank();
  console.log("Usage:");
  console.log("  faqir create my-widget --kind primitive");
  console.log("  faqir create data-grid --kind recipe");
  console.log("  faqir create status-bar --kind primitive --category layout");
  console.log("  faqir create pricing-block --kind pattern");
  log.blank();
  console.log("Options:");
  log.table([
    ["--kind <type>", "Component kind: primitive, recipe or pattern (required)"],
    ["--category <name>", "Component category (default: 'custom')"],
  ]);
}

/**
 * The `$schema` a scaffolded manifest carries (task 1.0R-04).
 *
 * Computed exactly the way `scripts/add-schema-refs.mjs` computes it for the
 * registry: a path from the manifest's own directory to the project root's
 * `manifest.schema.json`, so it resolves at any `output_dir` depth and a fresh
 * component satisfies the same rule every installed manifest already does.
 * Before this, `faqir create` was the one thing in a project that produced a
 * manifest with no `$schema` at all.
 */
function schemaRefFor(manifestDir: string, projectRoot: string): string {
  const rel = relative(manifestDir, join(projectRoot, "manifest.schema.json")).split("\\").join("/");
  return rel.startsWith(".") ? rel : `./${rel}`;
}

/**
 * Put the schema the `$schema` above points at where it points.
 *
 * The reference resolves to `<project>/manifest.schema.json`, and nothing ever
 * wrote that file: the created manifest named a schema that was not there, so
 * an editor validated nothing and reported the dangling reference instead. The
 * CLI's own copy is written when the project has none, and refreshed when the
 * one there is a CLI copy (same `$id`) from an older release; a schema file of
 * the project's own is never touched.
 */
async function ensureProjectSchema(projectRoot: string): Promise<void> {
  const source = join(getPackageRoot(), "manifest.schema.json");
  if (!existsSync(source)) return;
  const target = join(projectRoot, "manifest.schema.json");
  const shipped = readFileSync(source, "utf8");
  if (existsSync(target)) {
    const current = readFileSync(target, "utf8");
    if (current === shipped) return;
    let ours = false;
    try {
      ours = (JSON.parse(current) as { $id?: unknown }).$id === (JSON.parse(shipped) as { $id?: unknown }).$id;
    } catch {
      // Not JSON we wrote — the project's own file.
    }
    if (!ours) return;
  }
  await Bun.write(target, shipped);
  log.success("manifest.schema.json");
}

function generateManifest(name: string, kind: Kind, category: string, schemaRef: string): object {
  const manifest: Record<string, unknown> = {
    // First property, as `add-schema-refs.mjs` inserts it — editors resolve it
    // for completion, and CI resolves it for validation.
    $schema: schemaRef,
    name,
    version: "0.1.0",
    kind,
    category,
    description: `Custom ${kind}: ${name}`,
    anatomy: {
      tag: "div",
      selector: `[data-ui="${name}"]`,
      content_model: "block",
    },
    slots: {},
    variants: {},
    states: {},
    a11y: {},
    tokens_used: [
      "color-bg",
      "color-fg",
      "color-border",
      "radius-md",
      "space-4",
    ],
    templates: {
      html: `<div data-ui="${name}">\n  <!-- content -->\n</div>`,
    },
    safe_transforms: [
      "add slot content",
      "change text content",
      "add variant",
    ],
    unsafe_transforms: [
      "remove data-ui attribute",
      "change root element tag",
    ],
    composition: {
      contains: [],
      used_in: [],
    },
    files: {
      html: `${name}.html`,
      css: `${name}.css`,
      manifest: `${name}.manifest.json`,
      ...(kind === "recipe" ? { js: `${name}.js` } : {}),
    },
    tests: [],
  };

  return manifest;
}

function generateCSS(name: string): string {
  return `/* @ui:component ${name} */
/* @ui:tokens color-bg, color-fg, color-border, radius-md, space-4 */

[data-ui="${name}"] {
  display: block;
  padding: var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg);
  color: var(--color-fg);
}
`;
}

/**
 * The canonical reference FRAGMENT — the shape every registry component's
 * `<name>.html` has: `@ui:*` header comments, then labelled examples. It used
 * to be a whole `<!DOCTYPE html>` document, which is not a fragment: nothing
 * that reads reference markup (the audit, `explain`, the context generator,
 * docs) expects `<html>`/`<head>` around it, so every created component had its
 * reference rewritten by hand.
 */
function generateHTML(name: string, kind: Kind): string {
  const header = [
    `<!-- @ui:component ${name} -->`,
    `<!-- @ui:kind ${kind} -->`,
    `<!-- @ui:slots -->`,
    `<!-- @ui:variants -->`,
    ...(kind === "recipe" ? [`<!-- @ui:controller ${name}.js -->`] : []),
  ];
  return `${header.join("\n")}

<!-- Default -->
<div data-ui="${name}">
  Content goes here.
</div>
`;
}

function generateController(name: string): string {
  const factoryName = controllerName(name);
  return `// @ui:controller ${name}
// @ui:provides ${factoryName}

export function ${factoryName}(root) {
  // Prevent double init
  if (root._faqir${factoryName.slice(6)}) return;
  root._faqir${factoryName.slice(6)} = true;

  // Query parts
  // const parts = root.querySelectorAll("[data-part]");

  // State management
  function setState(state) {
    root.dataset.state = state;
  }

  // Event listeners
  // root.addEventListener("click", () => { ... });

  // Return public API
  return {
    destroy() {
      root._faqir${factoryName.slice(6)} = false;
    },
  };
}
`;
}

export async function create(args: string[]): Promise<void> {
  const { name, options } = parseArgs(args);
  const cwd = process.cwd();

  if (!name) {
    log.error("Component name required. Usage: faqir create <name> --kind <primitive|recipe|pattern>");
    process.exit(1);
  }

  if (!options.kind) {
    log.error("--kind is required. Must be: primitive, recipe or pattern");
    process.exit(1);
  }

  // Validate name: kebab-case
  if (!/^[a-z][a-z0-9-]*$/.test(name)) {
    log.error("Component name must be lowercase kebab-case (e.g., 'my-widget').");
    process.exit(1);
  }

  if (!configExists(cwd)) {
    log.error(missingConfigMessage(cwd));
    process.exit(1);
  }

  const config = await readConfig(cwd);
  const outputDir = join(cwd, config.output_dir);
  const layer = LAYER[options.kind];
  const compDir = join(outputDir, layer, name);

  if (existsSync(compDir)) {
    log.error(`Component '${name}' already exists at ${config.output_dir}/${layer}/${name}/`);
    process.exit(1);
  }

  log.heading(`Creating ${options.kind}: ${name}`);

  ensureDir(compDir);

  // Generate files
  await ensureProjectSchema(cwd);
  const manifest = generateManifest(name, options.kind, options.category, schemaRefFor(compDir, cwd));
  await Bun.write(join(compDir, `${name}.manifest.json`), JSON.stringify(manifest, null, 2) + "\n");
  log.success(`${name}.manifest.json`);

  await Bun.write(join(compDir, `${name}.css`), generateCSS(name));
  log.success(`${name}.css`);

  await Bun.write(join(compDir, `${name}.html`), generateHTML(name, options.kind));
  log.success(`${name}.html`);

  if (options.kind === "recipe") {
    await Bun.write(join(compDir, `${name}.js`), generateController(name));
    log.success(`${name}.js`);
  }

  // Register in config
  if (!config.installed[layer].includes(name)) {
    config.installed[layer].push(name);
    config.installed[layer].sort();
  }
  await writeConfig(config, cwd);

  // Regenerate context
  await regenerateContext(config, outputDir, cwd);

  // Regenerate bundle if exists
  const bundlePath = join(outputDir, "faqir.bundle.css");
  if (config.bundle?.auto !== false && existsSync(bundlePath)) {
    await generateBundle(cwd);
    log.step("Bundle regenerated.");
  }

  log.blank();
  log.success(`Component '${name}' created at ${config.output_dir}/${layer}/${name}/`);
  log.blank();
  console.log("  Next steps:");
  log.step(`Edit ${config.output_dir}/${layer}/${name}/${name}.css — add your styles`);
  log.step(`Edit ${config.output_dir}/${layer}/${name}/${name}.manifest.json — define slots, variants, states`);
  if (options.kind === "recipe") {
    log.step(`Edit ${config.output_dir}/${layer}/${name}/${name}.js — implement controller logic`);
  }
}
