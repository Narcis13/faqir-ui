import { readConfigFile } from "../utils/config";
import { fileExists } from "../utils/fs";
import { readManifestFile, type LoomManifest } from "../utils/manifest";
import { info } from "../utils/logger";
import { resolvePackagePath } from "../utils/paths";
import {
  findInstalledLayer,
  getRegistryComponent,
  listRegistryComponents,
  type RegistryLayer,
} from "../utils/registry";

export async function traceCommand(args: string[], cwd: string): Promise<string> {
  const [componentName, ...rest] = args;

  if (!componentName) {
    throw new Error("Usage: loom trace <component>");
  }

  if (rest.length > 0) {
    throw new Error(`Unexpected arguments: ${rest.join(" ")}`);
  }

  const configPath = resolvePackagePath(cwd, "loom.config.json");
  const hasConfig = await fileExists(configPath);
  const config = hasConfig ? await readConfigFile(configPath) : null;

  const { manifest, layer } = await resolveManifestWithLayer(componentName, cwd, config);
  const output = await formatTrace(manifest, layer, config, cwd);

  for (const line of output.split("\n")) {
    info(line);
  }

  return output;
}

async function resolveManifestWithLayer(
  componentName: string,
  cwd: string,
  config: Awaited<ReturnType<typeof readConfigFile>> | null,
): Promise<{ manifest: LoomManifest; layer: RegistryLayer }> {
  if (config) {
    const installedLayer = findInstalledLayer(config, componentName);
    if (installedLayer) {
      const manifest = await readManifestFile(
        resolvePackagePath(
          cwd,
          config.output_dir,
          installedLayer,
          componentName,
          `${componentName}.manifest.json`,
        ),
      );
      return { manifest, layer: installedLayer };
    }
  }

  const registryComponent = await getRegistryComponent(componentName);

  if (!registryComponent) {
    throw new Error(`Unknown component: ${componentName}`);
  }

  return { manifest: registryComponent.manifest, layer: registryComponent.layer };
}

async function formatTrace(
  manifest: LoomManifest,
  layer: RegistryLayer,
  config: Awaited<ReturnType<typeof readConfigFile>> | null,
  cwd: string,
): Promise<string> {
  const lines: string[] = [];
  const name = manifest.name.toUpperCase();
  const outputDir = config?.output_dir ?? "./ui";

  lines.push(`TRACE: ${name}`);
  lines.push(`${"─".repeat(40)}`);
  lines.push("");

  lines.push("FILES:");
  const basePath = `${outputDir}/${layer}/${manifest.name}`;
  lines.push(`  HTML     → ${basePath}/${manifest.files.html}`);
  lines.push(`  CSS      → ${basePath}/${manifest.files.css}`);
  if (manifest.files.js) {
    lines.push(`  JS       → ${basePath}/${manifest.files.js}`);
  }
  lines.push(`  Manifest → ${basePath}/${manifest.files.manifest}`);
  lines.push("");

  lines.push(`SELECTOR: ${manifest.anatomy.selector}`);
  lines.push("");

  if (manifest.slots && Object.keys(manifest.slots).length > 0) {
    lines.push("PARTS:");
    for (const [slotName, slot] of Object.entries(manifest.slots)) {
      lines.push(`  ${slot.selector}${slot.required ? " (required)" : ""}`);
    }
    lines.push("");
  }

  if (manifest.tokens_used.length > 0) {
    lines.push("TOKENS USED:");
    const tokenLines: string[] = [];
    for (let i = 0; i < manifest.tokens_used.length; i += 4) {
      const chunk = manifest.tokens_used.slice(i, i + 4);
      tokenLines.push(`  ${chunk.map((t) => `--${t}`).join("  ")}`);
    }
    lines.push(...tokenLines);
    lines.push("");
  }

  if (manifest.composition.contains.length > 0) {
    lines.push(`CONTAINS: ${manifest.composition.contains.join(", ")}`);
  }

  if (manifest.composition.used_in.length > 0) {
    lines.push(`USED IN: ${manifest.composition.used_in.join(", ")}`);
  }

  if (manifest.composition.contains.length > 0 || manifest.composition.used_in.length > 0) {
    lines.push("");
  }

  const allComponents = await listRegistryComponents();
  const dependents = allComponents.filter(
    (c) => c.manifest.composition.contains.includes(manifest.name),
  );

  if (dependents.length > 0) {
    lines.push("DEPENDED ON BY:");
    for (const dep of dependents) {
      lines.push(`  ${dep.name} (${dep.layer})`);
    }
    lines.push("");
  }

  if (manifest.tests.length > 0) {
    lines.push("TESTS:");
    for (const test of manifest.tests) {
      lines.push(`  ${test}`);
    }
    lines.push("");
  }

  if (config) {
    const installed = findInstalledLayer(config, manifest.name) !== null;
    lines.push(`STATUS: ${installed ? "installed" : "not installed"}`);
  }

  return lines.join("\n");
}
