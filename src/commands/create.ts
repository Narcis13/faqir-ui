import { existsSync } from "node:fs";
import { join } from "node:path";
import { log } from "../utils/logger";
import { configExists, readConfig, writeConfig } from "../utils/config";
import { ensureDir } from "../utils/fs";
import { controllerName } from "../utils/components";
import { regenerateContext } from "../utils/codegen";
import { generateBundle } from "../utils/bundler";

type Kind = "primitive" | "recipe";

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
        if (val === "primitive" || val === "recipe") {
          options.kind = val;
        } else {
          log.error(`Invalid kind: ${val}. Must be: primitive, recipe`);
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
  log.heading("faqir create <name> --kind <primitive|recipe>");
  log.blank();
  console.log("Scaffold a new custom component with manifest, CSS, HTML, and optional JS.");
  log.blank();
  console.log("Usage:");
  console.log("  faqir create my-widget --kind primitive");
  console.log("  faqir create data-grid --kind recipe");
  console.log("  faqir create status-bar --kind primitive --category layout");
  log.blank();
  console.log("Options:");
  log.table([
    ["--kind <type>", "Component kind: primitive or recipe (required)"],
    ["--category <name>", "Component category (default: 'custom')"],
  ]);
}

function generateManifest(name: string, kind: Kind, category: string): object {
  const manifest: Record<string, unknown> = {
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

function generateHTML(name: string, kind: Kind): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${name} — Reference</title>
  <style>
    body { font-family: system-ui, sans-serif; padding: 2rem; }
    section { margin-bottom: 2rem; }
    h2 { font-size: 1.25rem; margin-bottom: 0.5rem; }
  </style>
  <!-- Include your project's faqir.bundle.css or individual token/base/component CSS -->
</head>
<body>

  <h1>${name}</h1>
  <p>Custom ${kind} component.</p>

  <section>
    <h2>Default</h2>
    <div data-ui="${name}">
      Content goes here.
    </div>
  </section>

${kind === "recipe" ? `  <script type="module" src="${name}.js"><\/script>\n` : ""}
</body>
</html>`;
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
    log.error("Component name required. Usage: faqir create <name> --kind <primitive|recipe>");
    process.exit(1);
  }

  if (!options.kind) {
    log.error("--kind is required. Must be: primitive or recipe");
    process.exit(1);
  }

  // Validate name: kebab-case
  if (!/^[a-z][a-z0-9-]*$/.test(name)) {
    log.error("Component name must be lowercase kebab-case (e.g., 'my-widget').");
    process.exit(1);
  }

  if (!configExists(cwd)) {
    log.error("No faqir.config.json found. Run 'faqir init' first.");
    process.exit(1);
  }

  const config = await readConfig(cwd);
  const outputDir = join(cwd, config.output_dir);
  const layer = options.kind === "recipe" ? "recipes" : "primitives";
  const compDir = join(outputDir, layer, name);

  if (existsSync(compDir)) {
    log.error(`Component '${name}' already exists at ${config.output_dir}/${layer}/${name}/`);
    process.exit(1);
  }

  log.heading(`Creating ${options.kind}: ${name}`);

  ensureDir(compDir);

  // Generate files
  const manifest = generateManifest(name, options.kind, options.category);
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
