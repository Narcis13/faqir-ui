import type { LoomManifest } from "../utils/manifest";
import { readConfigFile } from "../utils/config";
import { fileExists, readTextFile, writeJsonFile, writeTextFile } from "../utils/fs";
import { info, success, warn } from "../utils/logger";
import { readManifestFile, validateManifest } from "../utils/manifest";
import { resolvePackagePath } from "../utils/paths";
import { regenerateProjectContext } from "../utils/project";
import { findInstalledLayer } from "../utils/registry";

export async function variantCommand(args: string[], cwd: string): Promise<void> {
  const [action, componentName, assignment] = args;

  if (!action || !componentName || !assignment) {
    throw new Error("Usage: loom variant <add|remove> <component> <variant>=<value>");
  }

  if (!["add", "remove"].includes(action)) {
    throw new Error(`Unknown variant command: ${action}`);
  }

  const configPath = resolvePackagePath(cwd, "loom.config.json");

  if (!(await fileExists(configPath))) {
    throw new Error("Missing loom.config.json. Run `loom init` first.");
  }

  const config = await readConfigFile(configPath);
  const layer = findInstalledLayer(config, componentName);

  if (!layer) {
    throw new Error(`Component is not installed: ${componentName}`);
  }

  const { variantName, value } = parseAssignment(assignment);
  const componentDir = resolvePackagePath(cwd, config.output_dir, layer, componentName);
  const manifestPath = resolvePackagePath(componentDir, `${componentName}.manifest.json`);
  const cssPath = resolvePackagePath(componentDir, `${componentName}.css`);
  const manifest = await readManifestFile(manifestPath);
  const variant = manifest.variants?.[variantName];

  if (!variant) {
    const available = Object.keys(manifest.variants ?? {});
    throw new Error(
      available.length > 0
        ? `Unknown variant group "${variantName}". Available: ${available.join(", ")}`
        : `Component "${componentName}" does not define variants`,
    );
  }

  const cssSource = await readTextFile(cssPath);

  if (action === "add") {
    if (variant.values.includes(value)) {
      info(`Variant ${variantName}=${value} already exists on ${componentName}`);
      return;
    }

    variant.values = [...variant.values, value];
    await persistManifest(manifestPath, manifest);
    await writeTextFile(cssPath, appendVariantStub(cssSource, manifest, variantName, value));
    await regenerateProjectContext(cwd, config);
    success(`Added ${variantName}=${value} to ${componentName}`);
    return;
  }

  if (!variant.values.includes(value)) {
    info(`Variant ${variantName}=${value} does not exist on ${componentName}`);
    return;
  }

  if (variant.values.length === 1) {
    throw new Error(`Cannot remove the last value from variant group "${variantName}"`);
  }

  variant.values = variant.values.filter((candidate) => candidate !== value);

  if (variant.default === value) {
    variant.default = variant.values[0];
    info(`Updated default ${variantName} variant to ${variant.default}`);
  }

  await persistManifest(manifestPath, manifest);

  const nextCss = removeVariantStub(cssSource, manifest, variantName, value);

  if (nextCss !== cssSource) {
    await writeTextFile(cssPath, nextCss);
  } else {
    warn(`No generated CSS stub found for ${variantName}=${value}; manifest updated only.`);
  }

  await regenerateProjectContext(cwd, config);
  success(`Removed ${variantName}=${value} from ${componentName}`);
}

function parseAssignment(value: string): { variantName: string; value: string } {
  const match = value.match(/^([a-z0-9-]+)=([a-z0-9-]+)$/);

  if (!match) {
    throw new Error("Variant values must use the form <variant>=<value>");
  }

  return {
    variantName: match[1],
    value: match[2],
  };
}

function appendVariantStub(
  cssSource: string,
  manifest: LoomManifest,
  variantName: string,
  value: string,
): string {
  const stub = buildVariantStub(manifest, variantName, value);

  if (cssSource.includes(stub.trim())) {
    return cssSource;
  }

  const trimmed = cssSource.trimEnd();
  return `${trimmed}\n\n${stub}`;
}

function removeVariantStub(
  cssSource: string,
  manifest: LoomManifest,
  variantName: string,
  value: string,
): string {
  const stub = buildVariantStub(manifest, variantName, value).trim();

  if (!cssSource.includes(stub)) {
    return cssSource;
  }

  return cssSource
    .replace(`\n\n${stub}\n`, "\n")
    .replace(`\n\n${stub}`, "")
    .replace(`${stub}\n\n`, "")
    .replace(stub, "")
    .trimEnd() + "\n";
}

function buildVariantStub(manifest: LoomManifest, variantName: string, value: string): string {
  const variant = manifest.variants?.[variantName];

  if (!variant) {
    throw new Error(`Unknown variant group: ${variantName}`);
  }

  const selector = getVariantSelector(manifest, variantName, value);

  return [
    `${selector} {`,
    `  /* TODO: customize ${variantName}="${value}" */`,
    "}",
    "",
  ].join("\n");
}

function getVariantSelector(manifest: LoomManifest, variantName: string, value: string): string {
  const variant = manifest.variants?.[variantName];

  if (!variant) {
    throw new Error(`Unknown variant group: ${variantName}`);
  }

  const base = variant.applied_to && variant.applied_to !== "root"
    ? `${manifest.anatomy.selector} ${manifest.slots?.[variant.applied_to]?.selector ?? `[data-part="${variant.applied_to}"]`}`
    : manifest.anatomy.selector;

  return `${base}[${variant.attr}="${value}"]`;
}

async function persistManifest(path: string, manifest: LoomManifest): Promise<void> {
  const issues = validateManifest(manifest);

  if (issues.length > 0) {
    throw new Error(`Refusing to write invalid manifest: ${issues.join("; ")}`);
  }

  await writeJsonFile(path, manifest);
}
