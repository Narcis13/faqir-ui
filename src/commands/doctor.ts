import { existsSync } from "node:fs";
import { join } from "node:path";
import { log } from "../utils/logger";
import { configExists, readConfig, getConfigPath } from "../utils/config";
import { validateManifest } from "../manifest";

interface CheckResult {
  name: string;
  passed: boolean;
  message: string;
}

export async function doctor(args: string[]): Promise<void> {
  if (args.includes("--help") || args.includes("-h")) {
    log.heading("faqir doctor");
    log.blank();
    console.log("Check environment and project health.");
    return;
  }

  const cwd = process.cwd();
  const results: CheckResult[] = [];

  log.heading("Faqir Doctor — checking project health");
  log.blank();

  // 1. Check faqir.config.json exists
  const configPath = getConfigPath(cwd);
  if (configExists(cwd)) {
    results.push({ name: "faqir.config.json", passed: true, message: "Found" });
  } else {
    results.push({
      name: "faqir.config.json",
      passed: false,
      message: `Not found at ${configPath}. Run 'faqir init' first.`,
    });
    // Can't continue without config
    printResults(results);
    return;
  }

  // 2. Validate config structure
  let config: Awaited<ReturnType<typeof readConfig>> | undefined;
  try {
    config = await readConfig(cwd);

    const requiredFields = ["version", "theme", "output_dir", "installed"];
    const missing = requiredFields.filter(
      (f) => !(f in config!)
    );

    if (missing.length > 0) {
      results.push({
        name: "Config schema",
        passed: false,
        message: `Missing fields: ${missing.join(", ")}`,
      });
    } else {
      results.push({ name: "Config schema", passed: true, message: "Valid" });
    }
  } catch {
    results.push({
      name: "Config schema",
      passed: false,
      message: "Failed to parse faqir.config.json",
    });
    printResults(results);
    return;
  }

  const outputDir = join(cwd, config.output_dir);

  // 3. Check output directory exists
  if (existsSync(outputDir)) {
    results.push({ name: "Output directory", passed: true, message: outputDir });
  } else {
    results.push({
      name: "Output directory",
      passed: false,
      message: `${outputDir} not found`,
    });
  }

  // 4. Check token files
  const tokenDir = join(outputDir, "tokens");
  if (config.tokens_split) {
    const tokenFiles = [
      "palette.css",
      "semantic.css",
      "spacing.css",
      "typography.css",
      "effects.css",
      "motion.css",
    ];
    const missingTokens = tokenFiles.filter(
      (f) => !existsSync(join(tokenDir, f))
    );
    if (missingTokens.length === 0) {
      results.push({ name: "Token files", passed: true, message: "All present (split mode)" });
    } else {
      results.push({
        name: "Token files",
        passed: false,
        message: `Missing: ${missingTokens.join(", ")}`,
      });
    }
  } else {
    const indexPath = join(tokenDir, "index.css");
    if (existsSync(indexPath)) {
      results.push({ name: "Token files", passed: true, message: "index.css found" });
    } else {
      results.push({
        name: "Token files",
        passed: false,
        message: "tokens/index.css not found",
      });
    }
  }

  // 5. Check base files
  const baseDir = join(outputDir, "base");
  const baseFiles = ["reset.css", "prose.css"];
  const missingBase = baseFiles.filter((f) => !existsSync(join(baseDir, f)));
  if (missingBase.length === 0) {
    results.push({ name: "Base styles", passed: true, message: "reset.css + prose.css" });
  } else {
    results.push({
      name: "Base styles",
      passed: false,
      message: `Missing: ${missingBase.join(", ")}`,
    });
  }

  // 6. Check theme file
  const themePath = join(tokenDir, "theme.css");
  if (existsSync(themePath)) {
    results.push({
      name: "Theme",
      passed: true,
      message: `${config.theme} (theme.css present)`,
    });
  } else {
    results.push({
      name: "Theme",
      passed: false,
      message: "tokens/theme.css not found",
    });
  }

  // 7. Check core modules (if configured)
  if (config.include_core) {
    const coreDir = join(outputDir, "core");
    if (existsSync(coreDir)) {
      const coreFiles = ["faqir-core.js", "api-source.js"];
      const missingCore = coreFiles.filter(
        (f) => !existsSync(join(coreDir, f))
      );
      if (missingCore.length === 0) {
        results.push({ name: "Core modules", passed: true, message: "faqir-core.js + api-source.js present" });
      } else {
        results.push({
          name: "Core modules",
          passed: false,
          message: `Missing: ${missingCore.join(", ")}. Run 'faqir init' to restore.`,
        });
      }
    } else {
      results.push({
        name: "Core modules",
        passed: false,
        message: "core/ directory not found (configured as include_core: true)",
      });
    }
  } else {
    results.push({ name: "Core modules", passed: true, message: "Skipped (include_core: false)" });
  }

  // 8. Check installed components have their files
  const allInstalled = [
    ...config.installed.primitives.map((n) => ({ name: n, layer: "primitives" })),
    ...config.installed.recipes.map((n) => ({ name: n, layer: "recipes" })),
    ...config.installed.patterns.map((n) => ({ name: n, layer: "patterns" })),
  ];

  if (allInstalled.length === 0) {
    results.push({
      name: "Components",
      passed: true,
      message: "None installed yet",
    });
  } else {
    const missing: string[] = [];
    for (const comp of allInstalled) {
      const compDir = join(outputDir, comp.layer, comp.name);
      if (!existsSync(compDir)) {
        missing.push(`${comp.layer}/${comp.name}`);
      }
    }
    if (missing.length === 0) {
      results.push({
        name: "Components",
        passed: true,
        message: `All ${allInstalled.length} installed components have files`,
      });
    } else {
      results.push({
        name: "Components",
        passed: false,
        message: `Missing directories: ${missing.join(", ")}`,
      });
    }
  }

  // 8b. Validate manifests for installed components
  if (allInstalled.length > 0) {
    const invalidManifests: string[] = [];
    for (const comp of allInstalled) {
      const manifestPath = join(outputDir, comp.layer, comp.name, `${comp.name}.manifest.json`);
      if (!existsSync(manifestPath)) continue;

      try {
        const json = await Bun.file(manifestPath).json();
        const errors = validateManifest(json);
        if (errors.length > 0) {
          invalidManifests.push(`${comp.name}: ${errors.map((e) => e.message).join(", ")}`);
        }
      } catch {
        invalidManifests.push(`${comp.name}: failed to parse manifest JSON`);
      }
    }

    if (invalidManifests.length === 0) {
      results.push({
        name: "Manifest validation",
        passed: true,
        message: `All ${allInstalled.length} manifests are valid`,
      });
    } else {
      results.push({
        name: "Manifest validation",
        passed: false,
        message: invalidManifests.join("; "),
      });
    }
  }

  // 9. Check .faqir/context.json
  const contextPath = join(cwd, ".faqir", "context.json");
  if (existsSync(contextPath)) {
    results.push({ name: "Context file", passed: true, message: ".faqir/context.json" });
  } else {
    results.push({
      name: "Context file",
      passed: false,
      message: ".faqir/context.json not found. Run 'faqir context' to generate.",
    });
  }

  printResults(results);
}

function printResults(results: CheckResult[]) {
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  for (const result of results) {
    if (result.passed) {
      log.success(`${result.name}: ${result.message}`);
    } else {
      log.error(`${result.name}: ${result.message}`);
    }
  }

  log.blank();
  if (failed === 0) {
    log.success(`All ${passed} checks passed. Project is healthy.`);
  } else {
    log.warn(`${passed} passed, ${failed} failed.`);
  }
}
