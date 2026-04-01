// loom trace <component> — show complete dependency and file trace for a component

import { existsSync } from "node:fs";
import { join, relative } from "node:path";
import { log } from "../utils/logger";
import { configExists, readConfig } from "../utils/config";
import { getRegistryPath } from "../utils/fs";
import { loadManifest, type Manifest } from "../manifest";
import { extractTokenReferences } from "../parser/css-parser";

const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";
const CYAN = "\x1b[36m";
const DIM = "\x1b[2m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";

export async function trace(args: string[]): Promise<void> {
  if (args.includes("--help") || args.includes("-h")) {
    log.heading("loom trace <component>");
    log.blank();
    console.log("Show complete dependency and file trace for a component.");
    log.blank();
    console.log("Options:");
    log.table([
      ["--json", "Output as structured JSON"],
    ]);
    return;
  }

  const name = args.find((a) => !a.startsWith("-"));
  if (!name) {
    log.error("No component specified. Usage: loom trace <component>");
    process.exit(1);
  }

  const jsonMode = args.includes("--json");
  const cwd = process.cwd();

  const traceData = await buildTrace(name, cwd);
  if (!traceData) {
    log.error(`Component '${name}' not found in project or registry.`);
    process.exit(1);
  }

  if (jsonMode) {
    console.log(JSON.stringify(traceData, null, 2));
    return;
  }

  printTrace(traceData);
}

interface TraceData {
  name: string;
  kind: string;
  installed: boolean;
  files: { label: string; path: string; exists: boolean }[];
  selectors: string[];
  tokens_declared: string[];
  tokens_actual: string[];
  dependencies: string[];
  dependents: string[];
  controllers: string[];
  tests: string[];
}

async function buildTrace(name: string, cwd: string): Promise<TraceData | null> {
  const manifest = await findManifest(name, cwd);
  if (!manifest) return null;

  const config = configExists(cwd) ? await readConfig(cwd) : null;
  const outputDir = config ? join(cwd, config.output_dir) : null;

  const layer = manifest.kind === "primitive" ? "primitives"
    : manifest.kind === "recipe" ? "recipes" : "patterns";

  // Check installation status
  const installed = config
    ? (config.installed[layer as keyof typeof config.installed] || []).includes(name)
    : false;

  // Build file list
  const files: TraceData["files"] = [];
  const baseDir = installed && outputDir
    ? join(outputDir, layer, name)
    : join(getRegistryPath(), layer, name);

  if (manifest.files.html) {
    const p = join(baseDir, manifest.files.html);
    files.push({ label: "HTML", path: relative(cwd, p), exists: existsSync(p) });
  }
  if (manifest.files.css) {
    const p = join(baseDir, manifest.files.css);
    files.push({ label: "CSS", path: relative(cwd, p), exists: existsSync(p) });
  }
  if (manifest.files.js) {
    const p = join(baseDir, manifest.files.js);
    files.push({ label: "JS", path: relative(cwd, p), exists: existsSync(p) });
  }
  {
    const p = join(baseDir, manifest.files.manifest);
    files.push({ label: "Manifest", path: relative(cwd, p), exists: existsSync(p) });
  }

  // Selectors
  const selectors: string[] = [manifest.anatomy.selector];
  for (const [, slot] of Object.entries(manifest.slots || {})) {
    selectors.push(slot.selector);
  }

  // Tokens — declared in manifest vs actually found in CSS
  const tokensDeclared = manifest.tokens_used || [];
  let tokensActual: string[] = [];

  const cssPath = join(baseDir, manifest.files.css);
  if (existsSync(cssPath)) {
    const cssSource = await Bun.file(cssPath).text();
    const refs = extractTokenReferences(cssSource);
    tokensActual = [...new Set(refs.map((r) => r.name))];
  }

  // Dependencies (what this component contains)
  const dependencies = manifest.composition?.contains || [];

  // Dependents (what uses this component) — scan all registry manifests
  const dependents: string[] = [];
  const registryPath = getRegistryPath();
  for (const searchLayer of ["primitives", "recipes", "patterns"]) {
    const layerPath = join(registryPath, searchLayer);
    if (!existsSync(layerPath)) continue;
    const glob = new Bun.Glob("*/*.manifest.json");
    for await (const path of glob.scan({ cwd: layerPath, onlyFiles: true })) {
      const m = await loadManifest(join(layerPath, path));
      if (m.name !== name && m.composition?.contains?.includes(name)) {
        dependents.push(m.name);
      }
      if (m.name !== name && m.composition?.used_in?.includes(name)) {
        dependents.push(`${m.name} (used_in)`);
      }
    }
  }
  // Also check used_in from the manifest itself
  const usedIn = manifest.composition?.used_in || [];

  // Controllers
  const controllers: string[] = [];
  if (manifest.files.js) {
    controllers.push(manifest.files.js);
  }
  // Check if it's part of auto-init
  if (manifest.kind === "recipe" && installed && outputDir) {
    const loomJsPath = join(outputDir, "core", "loom.js");
    if (existsSync(loomJsPath)) {
      controllers.push("core/loom.js (auto-init)");
    }
  }

  return {
    name,
    kind: manifest.kind,
    installed,
    files,
    selectors,
    tokens_declared: tokensDeclared,
    tokens_actual: tokensActual,
    dependencies,
    dependents: [...new Set([...dependents, ...usedIn])],
    controllers,
    tests: manifest.tests || [],
  };
}

async function findManifest(name: string, cwd: string): Promise<Manifest | null> {
  if (configExists(cwd)) {
    const config = await readConfig(cwd);
    const outputDir = join(cwd, config.output_dir);
    for (const layer of ["primitives", "recipes", "patterns"]) {
      const path = join(outputDir, layer, name, `${name}.manifest.json`);
      if (existsSync(path)) return loadManifest(path);
    }
  }

  const registryPath = getRegistryPath();
  for (const layer of ["primitives", "recipes", "patterns"]) {
    const path = join(registryPath, layer, name, `${name}.manifest.json`);
    if (existsSync(path)) return loadManifest(path);
  }

  return null;
}

function printTrace(t: TraceData) {
  console.log();
  console.log(`${BOLD}TRACE: ${t.name}${RESET} ${DIM}(${t.kind})${RESET}  ${t.installed ? `${GREEN}installed${RESET}` : `${YELLOW}not installed${RESET}`}`);
  console.log();

  // Files
  console.log(`${CYAN}FILES${RESET}`);
  for (const f of t.files) {
    const status = f.exists ? `${GREEN}✓${RESET}` : `${YELLOW}✗${RESET}`;
    console.log(`  ${status} ${f.label.padEnd(10)} ${f.path}`);
  }
  console.log();

  // Selectors
  console.log(`${CYAN}SELECTORS${RESET}`);
  for (const s of t.selectors) {
    console.log(`  ${s}`);
  }
  console.log();

  // Tokens
  console.log(`${CYAN}TOKENS${RESET} (${t.tokens_declared.length} declared, ${t.tokens_actual.length} found in CSS)`);
  if (t.tokens_declared.length > 0) {
    console.log(`  ${DIM}${t.tokens_declared.join(", ")}${RESET}`);
  }

  // Check for discrepancies
  const declaredSet = new Set(t.tokens_declared);
  const actualSet = new Set(t.tokens_actual);
  const undeclared = t.tokens_actual.filter((t) => !declaredSet.has(t));
  const unused = t.tokens_declared.filter((t) => !actualSet.has(t));

  if (undeclared.length > 0) {
    console.log(`  ${YELLOW}In CSS but not declared:${RESET} ${undeclared.join(", ")}`);
  }
  if (unused.length > 0) {
    console.log(`  ${DIM}Declared but not in CSS: ${unused.join(", ")}${RESET}`);
  }
  console.log();

  // Dependencies
  if (t.dependencies.length > 0) {
    console.log(`${CYAN}DEPENDS ON${RESET}`);
    for (const d of t.dependencies) {
      console.log(`  → ${d}`);
    }
    console.log();
  }

  // Dependents
  if (t.dependents.length > 0) {
    console.log(`${CYAN}USED BY${RESET}`);
    for (const d of t.dependents) {
      console.log(`  ← ${d}`);
    }
    console.log();
  }

  // Controllers
  if (t.controllers.length > 0) {
    console.log(`${CYAN}CONTROLLERS${RESET}`);
    for (const c of t.controllers) {
      console.log(`  ${c}`);
    }
    console.log();
  }

  // Tests
  if (t.tests.length > 0) {
    console.log(`${CYAN}TESTS${RESET} (${t.tests.length})`);
    for (const test of t.tests) {
      console.log(`  ${DIM}•${RESET} ${test}`);
    }
    console.log();
  }
}
