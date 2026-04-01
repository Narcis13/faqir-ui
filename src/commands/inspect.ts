import { existsSync } from "node:fs";
import { join } from "node:path";
import { log } from "../utils/logger";
import { configExists, readConfig } from "../utils/config";
import { getRegistryPath } from "../utils/fs";
import { loadManifest, type Manifest } from "../manifest";

const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";
const CYAN = "\x1b[36m";
const DIM = "\x1b[2m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";

export async function inspect(args: string[]): Promise<void> {
  if (args.includes("--help") || args.includes("-h")) {
    log.heading("loom inspect <component>");
    log.blank();
    console.log("Show detailed information about a component from its manifest.");
    log.blank();
    console.log("Options:");
    log.table([
      ["--json", "Output raw manifest JSON"],
    ]);
    return;
  }

  const name = args.find((a) => !a.startsWith("-"));
  if (!name) {
    log.error("No component specified. Usage: loom inspect <component>");
    process.exit(1);
  }

  const jsonMode = args.includes("--json");

  // Find the manifest — check installed first, then registry
  const manifest = await findManifest(name);
  if (!manifest) {
    log.error(`Component '${name}' not found in project or registry.`);
    process.exit(1);
  }

  if (jsonMode) {
    console.log(JSON.stringify(manifest, null, 2));
    return;
  }

  // Pretty print
  printManifest(manifest);
}

async function findManifest(name: string): Promise<Manifest | null> {
  const cwd = process.cwd();

  // Check installed project first
  if (configExists(cwd)) {
    const config = await readConfig(cwd);
    const outputDir = join(cwd, config.output_dir);
    for (const layer of ["primitives", "recipes", "patterns"]) {
      const path = join(outputDir, layer, name, `${name}.manifest.json`);
      if (existsSync(path)) {
        return loadManifest(path);
      }
    }
  }

  // Check registry
  const registryPath = getRegistryPath();
  for (const layer of ["primitives", "recipes", "patterns"]) {
    const path = join(registryPath, layer, name, `${name}.manifest.json`);
    if (existsSync(path)) {
      return loadManifest(path);
    }
  }

  return null;
}

function printManifest(m: Manifest) {
  console.log();
  console.log(`${BOLD}${m.name.toUpperCase()}${RESET} ${DIM}v${m.version}${RESET} — ${m.description}`);
  console.log(`${DIM}kind: ${m.kind} | category: ${m.category}${RESET}`);

  // Anatomy
  console.log();
  console.log(`${CYAN}ANATOMY${RESET}`);
  console.log(`  tag: ${BOLD}<${m.anatomy.tag}>${RESET}  selector: ${m.anatomy.selector}  content: ${m.anatomy.content_model}`);

  // Slots
  if (m.slots && Object.keys(m.slots).length > 0) {
    console.log();
    console.log(`${CYAN}SLOTS${RESET}`);
    for (const [name, slot] of Object.entries(m.slots)) {
      const req = slot.required ? `${YELLOW}required${RESET}` : `${DIM}optional${RESET}`;
      const hint = slot.tag_hint ? ` <${slot.tag_hint}>` : "";
      const desc = slot.description ? ` — ${slot.description}` : "";
      console.log(`  ${slot.selector.padEnd(28)} ${req}${hint}${desc}`);
    }
  }

  // Variants
  if (m.variants && Object.keys(m.variants).length > 0) {
    console.log();
    console.log(`${CYAN}VARIANTS${RESET}`);
    for (const [name, variant] of Object.entries(m.variants)) {
      const values = variant.values.map((v) =>
        v === variant.default ? `${BOLD}${v}${RESET}` : v
      ).join(" | ");
      console.log(`  ${name}: ${values}  ${DIM}(${variant.attr})${RESET}`);
    }
  }

  // States
  if (m.states && Object.keys(m.states).length > 0) {
    console.log();
    console.log(`${CYAN}STATES${RESET}`);
    const stateNames = Object.entries(m.states).map(([name, s]) => {
      if (s.default) return `${BOLD}${name}${RESET} (default)`;
      if (s.transient) return `${DIM}${name} (transient)${RESET}`;
      return name;
    });
    console.log(`  ${stateNames.join(" → ")}`);
  }

  // A11y
  if (m.a11y) {
    const hasContent = m.a11y.role || m.a11y.required_attrs?.length || m.a11y.focus_trap ||
      (m.a11y.keyboard && Object.keys(m.a11y.keyboard).length > 0);
    if (hasContent) {
      console.log();
      console.log(`${CYAN}ACCESSIBILITY${RESET}`);
      if (m.a11y.role) console.log(`  role: ${m.a11y.role}`);
      if (m.a11y["aria-modal"]) console.log(`  aria-modal: true`);
      if (m.a11y.focus_trap) console.log(`  focus-trap: yes`);
      if (m.a11y.escape_closes) console.log(`  escape-closes: yes`);
      if (m.a11y.required_attrs) {
        for (const attr of m.a11y.required_attrs) {
          console.log(`  ${YELLOW}•${RESET} ${attr}`);
        }
      }
      if (m.a11y.keyboard && Object.keys(m.a11y.keyboard).length > 0) {
        console.log(`  keyboard:`);
        for (const [key, action] of Object.entries(m.a11y.keyboard)) {
          console.log(`    ${key} → ${action}`);
        }
      }
    }
  }

  // Templates
  console.log();
  console.log(`${CYAN}TEMPLATE${RESET}`);
  console.log(`  ${GREEN}${m.templates.html}${RESET}`);

  // Safe/unsafe transforms
  if (m.safe_transforms?.length > 0) {
    console.log();
    console.log(`${CYAN}SAFE TRANSFORMS${RESET}`);
    console.log(`  ${m.safe_transforms.join(", ")}`);
  }
  if (m.unsafe_transforms?.length > 0) {
    console.log(`${CYAN}UNSAFE TRANSFORMS${RESET}`);
    console.log(`  ${m.unsafe_transforms.join(", ")}`);
  }

  // Files
  console.log();
  console.log(`${CYAN}FILES${RESET}`);
  log.table(Object.entries(m.files));

  // Tokens
  if (m.tokens_used?.length > 0) {
    console.log();
    console.log(`${CYAN}TOKENS USED${RESET} (${m.tokens_used.length})`);
    console.log(`  ${DIM}${m.tokens_used.join(", ")}${RESET}`);
  }

  console.log();
}
