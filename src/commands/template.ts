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
import { isVoidTag, manifestToIR, parseStateAttr } from "../bindings/ir";
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
import * as tagsJs from "../../packages/template/src/tags.js" with { type: "text" };
import * as textJs from "../../packages/template/src/text.js" with { type: "text" };

export const TEMPLATE_TABLE_VERSION = 1;

/** A fillable slot (docs/template.md §11.4, §16.3). */
export interface TableSlot {
  required: boolean;
  /** The string prop the call may set instead of filling the slot. */
  prop?: string;
  /**
   * The repeating slot this one sits in (accordion's `content` in `item`): it
   * is filled inside that slot's fills, never directly under the call.
   */
  within?: string;
  /** States the manifest applies to this part, set as fill arguments. */
  states?: Record<string, { attr: string; value: string | null; kind: string }>;
}

export interface TableEntry {
  defaultSlot: boolean;
  slots: Record<string, TableSlot>;
  variants: Record<string, { attr: string; values: string[]; default: string }>;
  states: Record<string, { attr: string; value: string | null; kind: string }>;
  props: Record<string, { default: string }>;
  bools: string[];
  /** The tag of the reference tree's headings, which `heading=` changes. */
  heading?: string;
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
  if (node.sample) out.sample = true;
  if (node.self) out.self = true;
  out.children = node.children.map((c) => (typeof c === "object" && "tag" in c ? renameTree(c, names) : c));
  return out;
}

/** A tree node's element children. */
function elements(node: RecipeNode): RecipeNode[] {
  return node.children.filter((c): c is RecipeNode => typeof c === "object" && "tag" in c);
}

/** A tree node's literal `data-part`, if any. */
function partName(node: RecipeNode): string | undefined {
  const value = node.attrs.find(([name]) => name === "data-part")?.[1];
  return Array.isArray(value) && value.length === 1 && typeof value[0] === "string" ? value[0] : undefined;
}

/** Every element carrying `part`, with its ancestors (root first), in document order. */
function occurrences(node: RecipeNode, part: string, path: RecipeNode[] = []): { node: RecipeNode; path: RecipeNode[] }[] {
  const own = partName(node) === part ? [{ node, path }] : [];
  return own.concat(elements(node).flatMap((c) => occurrences(c, part, [...path, node])));
}

/**
 * The element a fill of `node` writes into (docs/template.md §11.4): the part
 * itself when its reference content was a sample, or the one part-less
 * sample element it holds — accordion's trigger keeps its icon and fills its
 * label — or nothing when the part holds no sample.
 */
function sampleTarget(node: RecipeNode): RecipeNode | undefined {
  if (node.sample) return node;
  if (node.children.some((c) => typeof c !== "object" || !("tag" in c))) return undefined;
  const kids = elements(node);
  const held = kids.filter((c) => c.sample && partName(c) === undefined);
  // Only beside structure the fill would otherwise wipe out: a part holding
  // nothing but one sample element (quote's `<p>`) takes the whole fill.
  return held.length === 1 && kids.length > 1 ? held[0] : undefined;
}

/** The prop a slot's reference content is, when it is exactly one prop placeholder. */
function slotProp(node: RecipeNode | undefined): string | undefined {
  const children = node?.children ?? [];
  const only = children.length === 1 ? (children[0] as RecipeSeg) : undefined;
  return typeof only === "object" && only !== null && "p" in only && only.p !== "id" ? only.p : undefined;
}

/** True when the tree wraps the component's own element (a `self` node). */
function hasSelf(node: RecipeNode): boolean {
  return node.self === true || elements(node).some(hasSelf);
}

/** The tag of the first heading in a tree, if any. */
function headingTag(node: RecipeNode): string | undefined {
  if (/^h[1-6]$/.test(node.tag)) return node.tag;
  for (const c of elements(node)) {
    const hit = headingTag(c);
    if (hit) return hit;
  }
  return undefined;
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
  const ir = manifestTreeIR(manifest, label, { keepDirectives: true, markSamples: true, focus: [manifest.name, ...(manifest.aliases ?? [])] });
  const names = variantArgNames(ir.variantProps);
  const tree = renameTree(ir.tree, names);
  const entry: TableEntry = {
    // A wrapped sample (a checkbox in its label) has no one place for default
    // content: the label part is filled by name instead.
    defaultSlot: base.defaultSlot && !hasSelf(tree),
    slots: {},
    variants: {},
    states: {},
    props: {},
    bools: ir.boolProps.filter((b) => !base.states.some((s) => s.prop === b)),
    tree,
  };
  const heading = headingTag(tree);
  if (heading) entry.heading = heading;
  // Fillable: a manifest slot whose part is on an element of the reference
  // tree other than the root (§11.4) and holds content — a void element (an
  // `<input data-part>`) does not. A part may repeat (tabs' triggers).
  const found = new Map<string, { node: RecipeNode; path: RecipeNode[] }[]>();
  for (const slot of Object.keys(manifest.slots ?? {})) {
    const occ = occurrences(tree, slot);
    if (occ.length === 0 || occ.some((o) => o.path.length === 0 || o.node.self || isVoidTag(o.node.tag))) continue;
    found.set(slot, occ);
  }
  // A slot inside a repeating part is filled within that part's fills.
  const within = (slot: string) => {
    const path = found.get(slot)![0].path;
    for (let i = path.length - 1; i >= 0; i--) {
      const outer = partName(path[i]);
      if (outer && outer !== slot && (found.get(outer)?.length ?? 0) > 1) return outer;
    }
    return undefined;
  };
  // Required means "the caller must fill it" only where the reference holds
  // a sample (or a prop) in that place; a required part whose reference
  // content is structure or literal text is already there (§11.4). A repeating
  // part is required when a required slot sits in it.
  const mustFill = (slot: string) => {
    const first = found.get(slot)![0].node;
    return manifest.slots?.[slot]?.required === true && (sampleTarget(first) !== undefined || slotProp(first) !== undefined);
  };
  const outers = new Set([...found.keys()].filter((slot) => mustFill(slot)).map(within).filter((s) => s !== undefined));
  for (const [slot, occ] of found) {
    const prop = slotProp(occ[0].node);
    const outer = within(slot);
    const states = partStates(manifest, slot);
    const required = mustFill(slot) || (outers.has(slot) && manifest.slots?.[slot]?.required === true);
    entry.slots[slot] = { required, ...(prop ? { prop } : {}), ...(outer ? { within: outer } : {}), ...(states ? { states } : {}) };
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

/** The non-default states a manifest applies to one part, parsed as the IR parses root states. */
function partStates(manifest: Manifest, part: string): TableSlot["states"] {
  const states: NonNullable<TableSlot["states"]> = {};
  for (const [name, s] of Object.entries(manifest.states ?? {})) {
    if (s.default || s.transient || (s as { applied_to?: string }).applied_to !== part || !s.attr) continue;
    const { attr, value, kind } = parseStateAttr(name, s.attr);
    states[name] = { attr, value, kind };
  }
  return Object.keys(states).length > 0 ? states : undefined;
}

/** Every argument name must mean one thing. */
function assertDistinctArgs(entry: TableEntry, label: string): void {
  const all = [...Object.keys(entry.variants), ...Object.keys(entry.states), ...Object.keys(entry.props), ...entry.bools, ...(entry.heading ? ["heading"] : [])];
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

/**
 * Component → plugin file, for a component whose controller ships as an opt-in
 * plugin rather than in the engine: the plugin's header names it with
 * `@ui:controller <name>` (faqir-chart draws the `chart` primitive). A page
 * that uses the component needs that file as it needs a recipe's (§11.6).
 */
export function pluginControllerTable(pluginDir: string): Record<string, string> {
  const controllers: Record<string, string> = {};
  if (!existsSync(pluginDir)) return controllers;
  for (const file of readdirSync(pluginDir).filter((f) => f.endsWith(".js")).sort()) {
    const name = /^\/\/ @ui:controller\s+([a-z0-9-]+)\s*$/m.exec(readFileSync(join(pluginDir, file), "utf8"))?.[1];
    if (name) controllers[name] = file;
  }
  return controllers;
}

/** Assemble a table from components (sorted by name) and plugins. */
export function buildTemplateTable(
  sources: TableSource[],
  plugins: Record<string, string>,
  pluginControllers: Record<string, string> = {},
): TemplateTable {
  const components: Record<string, TableEntry> = {};
  const unavailable: Record<string, string> = {};
  const controllers: Record<string, string[]> = {};
  for (const source of [...sources].sort((a, b) => a.manifest.name.localeCompare(b.manifest.name))) {
    const files = requiresOf(source);
    const plugin = Object.prototype.hasOwnProperty.call(pluginControllers, source.manifest.name)
      ? pluginControllers[source.manifest.name]
      : undefined;
    if (files.length === 0 && plugin) files.push(plugin);
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
  const pluginDir = join(registryPath, "core", "plugins");
  return buildTemplateTable(sources, pluginTable(pluginDir), pluginControllerTable(pluginDir));
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
    ["node.js", nodeJs], ["parse.js", parseJs], ["render.js", renderJs], ["tags.js", tagsJs], ["text.js", textJs],
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
  const pluginDir = existsSync(own) ? own : join(getRegistryPath(), "core", "plugins");
  return buildTemplateTable(sources, pluginTable(pluginDir), pluginControllerTable(pluginDir));
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
