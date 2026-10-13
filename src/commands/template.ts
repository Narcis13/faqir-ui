// `faqir template` — the @faqir-ui/template component table, and the install
// path for projects that take the engine as committed files rather than as an
// npm package (docs/template.md §11.1, §15.4).
//
// The table is built from the bindings IR (src/bindings/ir.ts and
// src/bindings/recipe-ir.ts), never from a second manifest walker: the
// reference tree, slots and props come from `manifestTreeIR`, the root states
// and the default slot from `manifestToIR`. `scripts/build-template-table.mjs`
// writes the registry's table into the package; this command writes a
// project's, from its installed manifests, beside a copy of the engine.

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isVoidTag, manifestToIR } from "../bindings/ir";
import { manifestTreeIR, scanController, type RecipeNode, type RecipeSeg } from "../bindings/recipe-ir";
import { loadManifest, type Manifest } from "../manifest";
import { listRegistryComponents } from "../utils/components";
import { configExists, missingConfigMessage, readConfig, type FaqirConfig } from "../utils/config";
import { ensureDir, getRegistryPath } from "../utils/fs";
import { emitJSON, isJSONMode } from "../utils/json-output";
import { log } from "../utils/logger";
// The engine's files, embedded as text at build time so the compiled CLI can
// install them without shipping `packages/`. The single source stays
// packages/template/src. A text import has no TypeScript type of its own, so
// each comes in as a namespace and is read through `text()` below.
import * as attrsJs from "../../packages/template/src/attrs.js" with { type: "text" };
import * as checksJs from "../../packages/template/src/checks.js" with { type: "text" };
import * as compileJs from "../../packages/template/src/compile.js" with { type: "text" };
import * as componentsJs from "../../packages/template/src/components.js" with { type: "text" };
import * as composeJs from "../../packages/template/src/compose.js" with { type: "text" };
import * as diagnosticsJs from "../../packages/template/src/diagnostics.js" with { type: "text" };
import * as escapeJs from "../../packages/template/src/escape.js" with { type: "text" };
import * as evaluateJs from "../../packages/template/src/evaluate.js" with { type: "text" };
import * as exprJs from "../../packages/template/src/expr.js" with { type: "text" };
import * as indexJs from "../../packages/template/src/index.js" with { type: "text" };
import * as jsonJs from "../../packages/template/src/json.js" with { type: "text" };
import * as linesJs from "../../packages/template/src/lines.js" with { type: "text" };
import * as nodeJs from "../../packages/template/src/node.js" with { type: "text" };
import * as parseJs from "../../packages/template/src/parse.js" with { type: "text" };
import * as renderJs from "../../packages/template/src/render.js" with { type: "text" };
import * as textJs from "../../packages/template/src/text.js" with { type: "text" };

export const TEMPLATE_TABLE_VERSION = 1;

export interface TableEntry {
  defaultSlot: boolean;
  slots: Record<string, { required: boolean; prop?: string }>;
  variants: Record<string, { attr: string; values: string[]; default: string }>;
  states: Record<string, { attr: string; value: string | null; kind: string }>;
  props: Record<string, { default: string }>;
  bools: string[];
  tree: RecipeNode;
}

export interface TemplateTable {
  version: number;
  plugins: Record<string, string>;
  components: Record<string, TableEntry>;
  /**
   * Controller files by component, for every component with a controller —
   * callable or not, since a plain `data-ui` element needs them too (§11.6).
   */
  controllers: Record<string, string[]>;
  /** Components the IR refuses, with the reason (docs/template.md §11.1). */
  unavailable: Record<string, string>;
}

/** One component to put in a table: its manifest, a label, and its controller source if it has one. */
export interface TableSource {
  manifest: Manifest;
  label: string;
  controller?: string;
}

/**
 * Argument names for a component's variant props (docs/template.md §11.3):
 * the attribute without `data-`, unless another variant of the component
 * already writes that attribute — then the IR's group-derived name.
 */
function variantArgNames(variantProps: { prop: string; attr: string; part: string }[]): Map<string, string> {
  const byAttr = new Map<string, number>();
  for (const v of variantProps) byAttr.set(v.attr, (byAttr.get(v.attr) ?? 0) + 1);
  const names = new Map<string, string>();
  for (const v of variantProps) {
    const shared = (byAttr.get(v.attr) ?? 0) > 1 && v.part !== "root";
    names.set(v.prop, shared ? v.prop : v.attr.replace(/^data-/, ""));
  }
  return names;
}

/** Rename the IR's variant prop names in a tree's `dyn` lists to argument names. */
function renameTree(node: RecipeNode, names: Map<string, string>): RecipeNode {
  const out: RecipeNode = { tag: node.tag, attrs: node.attrs, children: [] };
  if (node.slot) out.slot = node.slot;
  if (node.dyn) out.dyn = node.dyn.map(([prop, attr]) => [names.get(prop) ?? prop, attr]);
  out.children = node.children.map((c) => (typeof c === "object" && "tag" in c ? renameTree(c, names) : c));
  return out;
}

/** The node carrying a slot's part in a tree, if any. */
function slotNode(node: RecipeNode, slot: string): RecipeNode | undefined {
  if (node.slot === slot) return node;
  for (const c of node.children) {
    if (typeof c === "object" && "tag" in c) {
      const hit = slotNode(c, slot);
      if (hit) return hit;
    }
  }
  return undefined;
}

/** The prop a slot's reference content is, when it is exactly one prop placeholder. */
function slotProp(tree: RecipeNode, slot: string): string | undefined {
  const children = slotNode(tree, slot)?.children ?? [];
  const only = children.length === 1 ? (children[0] as RecipeSeg) : undefined;
  return typeof only === "object" && only !== null && "p" in only && only.p !== "id" ? only.p : undefined;
}

/** Controller files a component needs: its own, then the recipe controllers it imports. */
function requiresOf(source: TableSource): string[] {
  if (source.controller === undefined) return [];
  const own = source.manifest.files.js as string; // a controller is read only when files.js names it
  const scan = scanController(source.controller, source.label);
  return [own, ...scan.recipeImports.map((dep) => `${dep}.js`)];
}

/** Build one table entry from the IR of a manifest. */
export function tableEntry(source: TableSource): TableEntry {
  const { manifest, label } = source;
  const base = manifestToIR(manifest, label);
  const ir = manifestTreeIR(manifest, label, { keepDirectives: true, markSamples: true });
  const rootUi = ir.tree.attrs.find(([name]) => name === "data-ui")?.[1];
  const rootName = Array.isArray(rootUi) ? rootUi.join("") : "";
  if (rootName !== manifest.name && !(manifest.aliases ?? []).includes(rootName)) {
    throw new Error(`templates.html has data-ui="${rootName}" at its root, not "${manifest.name}": the reference is a group of samples, not one component`);
  }
  const names = variantArgNames(ir.variantProps);
  const entry: TableEntry = {
    defaultSlot: base.defaultSlot,
    slots: {},
    variants: {},
    states: {},
    props: {},
    bools: ir.boolProps.filter((b) => !base.states.some((s) => s.prop === b)),
    tree: renameTree(ir.tree, names),
  };
  for (const slot of ir.slots) {
    // A void element (an `<input data-part>`) holds no content: not fillable.
    if (isVoidTag(slotNode(ir.tree, slot)?.tag ?? "")) continue;
    const prop = slotProp(ir.tree, slot);
    // Required means "the caller must fill it" only where the reference holds
    // a sample (or a prop) in that place; a required part whose reference
    // content is structure or literal text is already there (§11.4).
    const mustFill = slotNode(ir.tree, slot)?.sample === true || prop !== undefined;
    entry.slots[slot] = { required: manifest.slots?.[slot]?.required === true && mustFill, ...(prop ? { prop } : {}) };
  }
  for (const v of ir.variantProps) {
    entry.variants[names.get(v.prop)!] = { attr: v.attr, values: [...v.values], default: v.default };
  }
  for (const s of base.states) {
    entry.states[s.prop] = { attr: s.attr, value: s.value, kind: s.kind };
  }
  for (const p of ir.stringProps) entry.props[p.prop] = { default: p.default };
  assertDistinctArgs(entry, label);
  return entry;
}

/** Every argument name must mean one thing. */
function assertDistinctArgs(entry: TableEntry, label: string): void {
  const all = [...Object.keys(entry.variants), ...Object.keys(entry.states), ...Object.keys(entry.props), ...entry.bools];
  const seen = new Set<string>();
  for (const name of all) {
    if (seen.has(name) || name === "id") throw new Error(`${label}: template argument "${name}" has two meanings`);
    seen.add(name);
  }
}

/**
 * Directive → plugin file, from each plugin's `@ui:plugin` / `@ui:provides`
 * header (docs/template.md §11.6): each `l-*` name it lists maps to the plugin file.
 */
export function pluginTable(pluginDir: string): Record<string, string> {
  const plugins: Record<string, string> = {};
  if (!existsSync(pluginDir)) return plugins;
  for (const file of readdirSync(pluginDir).filter((f) => f.endsWith(".js")).sort()) {
    const source = readFileSync(join(pluginDir, file), "utf8");
    const provides = /@ui:provides\s+([^\n]+)/.exec(source)?.[1] ?? "";
    for (const token of provides.split(/[\s,]+/)) if (token.startsWith("l-")) plugins[token] = file;
  }
  return plugins;
}

/** Assemble a table from components (sorted by name) and plugins. */
export function buildTemplateTable(sources: TableSource[], plugins: Record<string, string>): TemplateTable {
  const components: Record<string, TableEntry> = {};
  const unavailable: Record<string, string> = {};
  const controllers: Record<string, string[]> = {};
  for (const source of [...sources].sort((a, b) => a.manifest.name.localeCompare(b.manifest.name))) {
    const files = requiresOf(source);
    if (files.length > 0) controllers[source.manifest.name] = files;
    // A manifest the IR refuses cannot be called; the table says why, so the
    // engine's `unknown-component` diagnostic can name the manifest gap.
    try {
      components[source.manifest.name] = tableEntry(source);
    } catch (error) {
      unavailable[source.manifest.name] = error instanceof Error ? error.message : String(error);
    }
  }
  return { version: TEMPLATE_TABLE_VERSION, plugins, controllers, components, unavailable };
}

/** Read a component directory's manifest and controller. */
async function readSource(dir: string, name: string, label: string): Promise<TableSource> {
  const manifest = await loadManifest(join(dir, `${name}.manifest.json`));
  const js = join(dir, manifest.files.js ?? `${name}.js`);
  return { manifest, label, ...(manifest.files.js && existsSync(js) ? { controller: readFileSync(js, "utf8") } : {}) };
}

/** The table of every registry primitive and recipe. */
export async function registryTemplateTable(registryPath: string): Promise<TemplateTable> {
  const sources: TableSource[] = [];
  for (const layer of ["primitives", "recipes"] as const) {
    for (const name of listRegistryComponents(registryPath, layer).sort()) {
      sources.push(await readSource(join(registryPath, layer, name), name, `registry/${layer}/${name}`));
    }
  }
  return buildTemplateTable(sources, pluginTable(join(registryPath, "core", "plugins")));
}

/** The JavaScript module a table is shipped as: deterministic, with a header. */
export function tableModule(table: TemplateTable, generator: string): string {
  return [
    `// GENERATED by ${generator} — do not edit. The @faqir-ui/template component`,
    "// table (docs/template.md §11.1, §16.3), built from the bindings IR.",
    `export const components = ${JSON.stringify(table, null, 1)};`,
    "",
  ].join("\n");
}

/** A text import's content (see the import block at the top). */
function text(module: unknown): string {
  return (module as { default: string }).default;
}

/** The engine's files by name, as `faqir template` installs them. */
export function engineFiles(): Map<string, string> {
  const modules: [string, unknown][] = [
    ["attrs.js", attrsJs], ["checks.js", checksJs], ["compile.js", compileJs], ["components.js", componentsJs],
    ["compose.js", composeJs], ["diagnostics.js", diagnosticsJs], ["escape.js", escapeJs], ["evaluate.js", evaluateJs],
    ["expr.js", exprJs], ["index.js", indexJs], ["json.js", jsonJs], ["lines.js", linesJs],
    ["node.js", nodeJs], ["parse.js", parseJs], ["render.js", renderJs], ["text.js", textJs],
  ];
  return new Map(modules.map(([name, module]) => [name, text(module)]));
}

/**
 * A project's table: every installed primitive and recipe (project-made ones
 * included, since `faqir create` lists them as installed), and the plugins it
 * has installed — the registry's when it has none of its own.
 */
export async function projectTemplateTable(config: Pick<FaqirConfig, "installed">, outputDir: string): Promise<TemplateTable> {
  const sources: TableSource[] = [];
  for (const layer of ["primitives", "recipes"] as const) {
    for (const name of [...config.installed[layer]].sort()) {
      const dir = join(outputDir, layer, name);
      if (existsSync(join(dir, `${name}.manifest.json`))) sources.push(await readSource(dir, name, `${layer}/${name}`));
    }
  }
  const own = join(outputDir, "core", "plugins");
  return buildTemplateTable(sources, pluginTable(existsSync(own) ? own : join(getRegistryPath(), "core", "plugins")));
}

function printHelp(): void {
  log.heading("faqir template");
  console.log("Install @faqir-ui/template into <output_dir>/template/ — the engine's files and");
  console.log("table.js, this project's component table from its installed manifests.");
  console.log("Options:");
  console.log("  --check     Report files that differ from a fresh install; write nothing");
}

/**
 * `faqir template [--check]` (docs/template.md §15.4): copy the engine into the
 * project and write its component table, or report drift.
 */
export async function template(args: string[]): Promise<void> {
  if (args.includes("--help") || args.includes("-h")) return printHelp();
  const cwd = process.cwd();
  if (!configExists(cwd)) {
    log.error(missingConfigMessage(cwd));
    process.exit(1);
  }
  const config = await readConfig(cwd);
  const dir = join(cwd, config.output_dir, "template");
  const files = engineFiles();
  files.set("table.js", tableModule(await projectTemplateTable(config, join(cwd, config.output_dir)), "faqir template"));

  const drifted = [...files].filter(([name, content]) => {
    const path = join(dir, name);
    return !existsSync(path) || readFileSync(path, "utf8") !== content;
  }).map(([name]) => name);

  if (args.includes("--check")) {
    if (isJSONMode()) emitJSON({ ok: drifted.length === 0, dir, files: [...files.keys()], drifted });
    else if (drifted.length > 0) log.error(`Template engine drift in ${dir}: ${drifted.join(", ")} — run 'faqir template'.`);
    else log.success(`Template engine in sync: ${files.size} files in ${dir}.`);
    if (drifted.length > 0) process.exit(1);
    return;
  }

  ensureDir(dir);
  for (const [name, content] of files) writeFileSync(join(dir, name), content);
  if (isJSONMode()) return emitJSON({ ok: true, dir, files: [...files.keys()], drifted });
  log.success(`Installed @faqir-ui/template into ${dir} (${files.size} files; ${drifted.length} changed).`);
}
