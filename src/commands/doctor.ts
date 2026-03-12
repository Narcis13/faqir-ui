import { readConfigFile, type LoomConfig, validateConfig } from "../utils/config";
import { fileExists } from "../utils/fs";
import { error, info, success, warn } from "../utils/logger";
import { readManifestFile } from "../utils/manifest";
import { resolvePackagePath } from "../utils/paths";
import { CORE_FILES, requiresCoreModules } from "../utils/recipes";
import { type RegistryLayer } from "../utils/registry";

type DoctorIssue = {
  level: "error" | "warning";
  message: string;
};

export type DoctorResult = {
  ok: boolean;
  issues: DoctorIssue[];
};

export async function doctorCommand(_args: string[], cwd: string): Promise<DoctorResult> {
  const issues: DoctorIssue[] = [];
  const configPath = resolvePackagePath(cwd, "loom.config.json");

  if (!(await fileExists(configPath))) {
    const result = {
      ok: false,
      issues: [{ level: "error", message: "Missing loom.config.json" }],
    } satisfies DoctorResult;
    error("Missing loom.config.json");
    return result;
  }

  let config: LoomConfig;

  try {
    config = await readConfigFile(configPath);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught);
    const result = {
      ok: false,
      issues: [{ level: "error", message }],
    } satisfies DoctorResult;
    error(message);
    return result;
  }

  for (const validationIssue of validateConfig(config)) {
    issues.push({ level: "error", message: validationIssue });
  }

  const outputRoot = resolvePackagePath(cwd, config.output_dir);
  await requireFile(issues, resolvePackagePath(outputRoot, "tokens", "index.css"), "Missing token bundle");
  await requireFile(issues, resolvePackagePath(outputRoot, "base", "reset.css"), "Missing base reset");
  await requireFile(issues, resolvePackagePath(outputRoot, "base", "prose.css"), "Missing prose styles");
  await requireFile(issues, resolvePackagePath(outputRoot, "loom.js"), "Missing loom.js auto-init script");
  await requireFile(issues, resolvePackagePath(cwd, ".loom", "context.json"), "Missing .loom/context.json");

  if (config.tokens_split) {
    for (const tokenFile of [
      "palette.css",
      "semantic.css",
      "aliases.css",
      "spacing.css",
      "typography.css",
      "effects.css",
      "motion.css",
      "theme.css",
    ]) {
      await requireFile(
        issues,
        resolvePackagePath(outputRoot, "tokens", tokenFile),
        `Missing split token file: ${tokenFile}`,
      );
    }
  }

  if (requiresCoreModules(config)) {
    for (const fileName of CORE_FILES) {
      await requireFile(
        issues,
        resolvePackagePath(outputRoot, "core", fileName),
        `Missing core module: ${fileName}`,
      );
    }
  }

  await checkInstalledComponents(issues, cwd, config);

  if (issues.length === 0) {
    success("Loom project is healthy");
    return { ok: true, issues };
  }

  for (const issue of issues) {
    if (issue.level === "error") {
      error(issue.message);
    } else {
      warn(issue.message);
    }
  }
  info(`Doctor found ${issues.length} issue${issues.length === 1 ? "" : "s"}`);

  return { ok: false, issues };
}

async function requireFile(issues: DoctorIssue[], filePath: string, message: string): Promise<void> {
  if (!(await fileExists(filePath))) {
    issues.push({ level: "error", message });
  }
}

async function checkInstalledComponents(
  issues: DoctorIssue[],
  projectRoot: string,
  config: LoomConfig,
): Promise<void> {
  const outputRoot = resolvePackagePath(projectRoot, config.output_dir);

  for (const name of config.installed.primitives) {
    await requireComponentFiles(
      issues,
      resolvePackagePath(outputRoot, "primitives", name),
      name,
      "primitives",
      [
      `${name}.html`,
      `${name}.css`,
      `${name}.manifest.json`,
      ],
    );
  }

  for (const name of config.installed.recipes) {
    await requireComponentFiles(
      issues,
      resolvePackagePath(outputRoot, "recipes", name),
      name,
      "recipes",
      [
      `${name}.html`,
      `${name}.css`,
      `${name}.js`,
      `${name}.manifest.json`,
      ],
    );
  }

  for (const name of config.installed.patterns) {
    await requireComponentFiles(
      issues,
      resolvePackagePath(outputRoot, "patterns", name),
      name,
      "patterns",
      [
      `${name}.html`,
      `${name}.css`,
      `${name}.manifest.json`,
      ],
    );
  }
}

async function requireComponentFiles(
  issues: DoctorIssue[],
  componentDir: string,
  name: string,
  layer: RegistryLayer,
  fileNames: string[],
): Promise<void> {
  for (const fileName of fileNames) {
    await requireFile(
      issues,
      resolvePackagePath(componentDir, fileName),
      `Installed component "${name}" is missing ${fileName}`,
    );
  }

  const manifestPath = resolvePackagePath(componentDir, `${name}.manifest.json`);

  if (!(await fileExists(manifestPath))) {
    return;
  }

  try {
    const manifest = await readManifestFile(manifestPath);
    const expectedKind = layer.slice(0, -1);

    if (manifest.name !== name) {
      issues.push({
        level: "error",
        message: `Installed component "${name}" has manifest.name="${manifest.name}"`,
      });
    }

    if (manifest.kind !== expectedKind) {
      issues.push({
        level: "error",
        message: `Installed component "${name}" has manifest.kind="${manifest.kind}", expected "${expectedKind}"`,
      });
    }
  } catch (caught) {
    issues.push({
      level: "error",
      message: caught instanceof Error ? caught.message : String(caught),
    });
  }
}
