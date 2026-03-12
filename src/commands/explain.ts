import { readConfigFile } from "../utils/config";
import { fileExists } from "../utils/fs";
import { readManifestFile, type LoomManifest } from "../utils/manifest";
import { info } from "../utils/logger";
import { resolvePackagePath } from "../utils/paths";
import { findInstalledLayer, getRegistryComponent } from "../utils/registry";

export async function explainCommand(args: string[], cwd: string): Promise<string> {
  const [componentName, ...rest] = args;

  if (!componentName) {
    throw new Error("Usage: loom explain <component>");
  }

  if (rest.length > 0) {
    throw new Error(`Unexpected arguments: ${rest.join(" ")}`);
  }

  const manifest = await resolveManifest(componentName, cwd);
  const output = formatExplanation(manifest);

  for (const line of output.split("\n")) {
    info(line);
  }

  return output;
}

async function resolveManifest(componentName: string, cwd: string): Promise<LoomManifest> {
  const configPath = resolvePackagePath(cwd, "loom.config.json");

  if (await fileExists(configPath)) {
    const config = await readConfigFile(configPath);
    const installedLayer = findInstalledLayer(config, componentName);

    if (installedLayer) {
      return await readManifestFile(
        resolvePackagePath(cwd, config.output_dir, installedLayer, componentName, `${componentName}.manifest.json`),
      );
    }
  }

  const registryComponent = await getRegistryComponent(componentName);

  if (!registryComponent) {
    throw new Error(`Unknown component: ${componentName}`);
  }

  return registryComponent.manifest;
}

function formatExplanation(manifest: LoomManifest): string {
  const lines: string[] = [];
  const name = manifest.name.toUpperCase();

  lines.push(`${name} — ${manifest.description}`);
  lines.push("");

  lines.push("PURPOSE:");
  lines.push(`  ${manifest.description}`);
  lines.push(`  Kind: ${manifest.kind} | Category: ${manifest.category}`);
  lines.push("");

  lines.push("ANATOMY:");
  lines.push(`  ${manifest.anatomy.selector.padEnd(36)} Root container (${manifest.anatomy.tag})`);

  if (manifest.slots) {
    for (const [slotName, slot] of Object.entries(manifest.slots)) {
      const selector = slot.selector.padEnd(36);
      const desc = slot.description ?? slotName;
      const required = slot.required ? "" : " (optional)";
      lines.push(`    ${selector}${desc}${required}`);
    }
  }

  lines.push("");

  if (manifest.states && Object.keys(manifest.states).length > 0) {
    const stateNames = Object.keys(manifest.states);
    const defaultState = Object.entries(manifest.states).find(([_, s]) => s.default)?.[0];
    const stateFlow = stateNames.join(" → ");
    lines.push(`STATES:  ${stateFlow}${defaultState ? ` (default: ${defaultState})` : ""}`);
  }

  if (manifest.variants && Object.keys(manifest.variants).length > 0) {
    const variantParts = Object.entries(manifest.variants).map(
      ([name, v]) => `${name}: ${v.values.join(" | ")}`,
    );
    lines.push(`VARIANTS:  ${variantParts.join("  •  ")}`);
  }

  lines.push("");

  if (manifest.a11y?.keyboard) {
    lines.push("KEYBOARD:");
    const keyEntries = Object.entries(manifest.a11y.keyboard).map(
      ([key, action]) => `${key} → ${action}`,
    );
    lines.push(`  ${keyEntries.join("  •  ")}`);
    lines.push("");
  }

  if (manifest.a11y) {
    lines.push("ACCESSIBILITY:");
    const parts: string[] = [];
    if (manifest.a11y.role) parts.push(`role=${manifest.a11y.role}`);
    if (manifest.a11y["aria-modal"]) parts.push("aria-modal=true");
    if (manifest.a11y.focus_trap) parts.push("focus-trap");
    if (manifest.a11y.escape_closes) parts.push("escape-closes");
    if (manifest.a11y.return_focus) parts.push(`return-focus→${manifest.a11y.return_focus}`);
    if (manifest.a11y.required_attrs) {
      parts.push(...manifest.a11y.required_attrs);
    }
    lines.push(`  ${parts.join(", ")}`);
    lines.push("");
  }

  if (manifest.safe_transforms.length > 0) {
    lines.push(`SAFE TO MODIFY:  ${manifest.safe_transforms.join(", ")}`);
  }

  if (manifest.unsafe_transforms.length > 0) {
    lines.push(`DO NOT REMOVE:   ${manifest.unsafe_transforms.join(", ")}`);
  }

  lines.push("");

  lines.push("FILES:");
  lines.push(`  HTML → ${manifest.files.html}`);
  lines.push(`  CSS  → ${manifest.files.css}`);
  if (manifest.files.js) {
    lines.push(`  JS   → ${manifest.files.js}`);
  }
  lines.push(`  Spec → ${manifest.files.manifest}`);

  return lines.join("\n");
}
