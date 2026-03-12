import { generateContext } from "../generator/context";
import { readConfigFile, type LoomConfig } from "../utils/config";
import { copyTextFile, fileExists, writeJsonFile } from "../utils/fs";
import { info, success } from "../utils/logger";
import { resolvePackagePath } from "../utils/paths";
import { ensureCoreModules, writeLoomScript } from "../utils/recipes";
import {
  getComponentFileNames,
  getRegistryComponent,
  isInstalled,
  listRegistryComponents,
  type RegistryComponent,
  type RegistryLayer,
} from "../utils/registry";

type AddOptions = {
  names: string[];
  all: boolean;
  layer?: RegistryLayer;
  dryRun: boolean;
  noDeps: boolean;
};

export async function addCommand(args: string[], cwd: string): Promise<void> {
  const options = parseAddArgs(args);
  const configPath = resolvePackagePath(cwd, "loom.config.json");

  if (!(await fileExists(configPath))) {
    throw new Error("Missing loom.config.json. Run `loom init` first.");
  }

  const config = await readConfigFile(configPath);
  const requested = await resolveRequestedComponents(options);

  if (requested.length === 0) {
    throw new Error("No components selected");
  }

  const { plan, dependencyNotices, alreadyInstalled } = await buildInstallPlan(requested, config, options.noDeps);

  if (dependencyNotices.length > 0) {
    for (const notice of dependencyNotices) {
      info(notice);
    }
  }

  if (alreadyInstalled.length > 0) {
    info(`Already installed: ${alreadyInstalled.sort().join(", ")}`);
  }

  if (plan.length === 0) {
    success("No components to add");
    return;
  }

  if (options.dryRun) {
    info(`Would add ${plan.length} component(s): ${plan.map((component) => component.name).join(", ")}`);
    return;
  }

  await installComponents(cwd, config, plan);

  if (config.installed.recipes.length > 0) {
    config.include_core = true;
    await ensureCoreModules(cwd, config);
  }

  await writeLoomScript(cwd, config);
  await writeJsonFile(configPath, config);
  await writeJsonFile(resolvePackagePath(cwd, ".loom", "context.json"), await generateContext(cwd, config));

  success(`Added ${plan.length} component(s): ${plan.map((component) => component.name).join(", ")}`);
}

function parseAddArgs(args: string[]): AddOptions {
  const options: AddOptions = {
    names: [],
    all: false,
    dryRun: false,
    noDeps: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--all") {
      options.all = true;
      continue;
    }

    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    if (arg === "--no-deps") {
      options.noDeps = true;
      continue;
    }

    if (arg === "--layer") {
      const layer = args[index + 1] as RegistryLayer | undefined;

      if (!layer || !["primitives", "recipes", "patterns"].includes(layer)) {
        throw new Error("--layer requires one of: primitives, recipes, patterns");
      }

      options.layer = layer;
      index += 1;
      continue;
    }

    if (arg.startsWith("--")) {
      throw new Error(`Unknown option: ${arg}`);
    }

    options.names.push(arg);
  }

  if (!options.all && !options.layer && options.names.length === 0) {
    throw new Error("Usage: loom add <components...> [--all] [--layer <layer>] [--dry-run] [--no-deps]");
  }

  return options;
}

async function resolveRequestedComponents(options: AddOptions): Promise<RegistryComponent[]> {
  if (options.all) {
    return await listRegistryComponents();
  }

  if (options.layer) {
    return await listRegistryComponents(options.layer);
  }

  const components = await Promise.all(
    options.names.map(async (name) => {
      const component = await getRegistryComponent(name);

      if (!component) {
        throw new Error(`Unknown component: ${name}`);
      }

      return component;
    }),
  );

  return dedupeComponents(components);
}

async function buildInstallPlan(
  requested: RegistryComponent[],
  config: LoomConfig,
  noDeps: boolean,
): Promise<{
  plan: RegistryComponent[];
  dependencyNotices: string[];
  alreadyInstalled: string[];
}> {
  const plan: RegistryComponent[] = [];
  const dependencyNotices: string[] = [];
  const alreadyInstalled = new Set<string>();
  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visit = async (component: RegistryComponent, parent?: string): Promise<void> => {
    if (visited.has(component.name)) {
      return;
    }

    if (visiting.has(component.name)) {
      throw new Error(`Circular component dependency detected at ${component.name}`);
    }

    visiting.add(component.name);

    if (!noDeps) {
      for (const dependencyName of component.manifest.composition.contains) {
        if (isInstalled(config, dependencyName)) {
          alreadyInstalled.add(dependencyName);
          continue;
        }

        const dependency = await getRegistryComponent(dependencyName);

        if (!dependency) {
          throw new Error(`Component "${component.name}" depends on unknown component "${dependencyName}"`);
        }

        if (parent !== undefined || !requested.some((candidate) => candidate.name === dependencyName)) {
          dependencyNotices.push(`Auto-adding dependency "${dependencyName}" required by "${component.name}"`);
        }

        await visit(dependency, component.name);
      }
    }

    visiting.delete(component.name);
    visited.add(component.name);

    if (isInstalled(config, component.name)) {
      alreadyInstalled.add(component.name);
      return;
    }

    plan.push(component);
  };

  for (const component of requested) {
    await visit(component);
  }

  return {
    plan: dedupeComponents(plan),
    dependencyNotices: [...new Set(dependencyNotices)],
    alreadyInstalled: [...alreadyInstalled],
  };
}

async function installComponents(
  projectRoot: string,
  config: LoomConfig,
  components: RegistryComponent[],
): Promise<void> {
  const outputRoot = resolvePackagePath(projectRoot, config.output_dir);

  for (const component of components) {
    const targetDir = resolvePackagePath(outputRoot, component.layer, component.name);

    for (const fileName of getComponentFileNames(component.manifest)) {
      await copyTextFile(
        resolvePackagePath(component.dirPath, fileName),
        resolvePackagePath(targetDir, fileName),
      );
    }

    config.installed[component.layer] = sortUnique([...config.installed[component.layer], component.name]);
  }
}

function dedupeComponents(components: RegistryComponent[]): RegistryComponent[] {
  const seen = new Set<string>();
  const unique: RegistryComponent[] = [];

  for (const component of components) {
    if (seen.has(component.name)) {
      continue;
    }

    seen.add(component.name);
    unique.push(component);
  }

  return unique;
}

function sortUnique(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

export const testables = {
  parseAddArgs,
};
