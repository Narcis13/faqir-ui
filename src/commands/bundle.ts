import { existsSync, watch } from "node:fs";
import { join } from "node:path";
import { log } from "../utils/logger";
import { configExists, readConfig, writeConfig } from "../utils/config";
import { generateBundle, type BundleOptions } from "../utils/bundler";

interface BundleCmdOptions {
  output: string | null;
  minify: boolean;
  watchMode: boolean;
  dryRun: boolean;
}

function parseArgs(args: string[]): BundleCmdOptions {
  const opts: BundleCmdOptions = {
    output: null,
    minify: false,
    watchMode: false,
    dryRun: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--output":
        opts.output = args[++i] || null;
        break;
      case "--minify":
        opts.minify = true;
        break;
      case "--watch":
        opts.watchMode = true;
        break;
      case "--dry-run":
        opts.dryRun = true;
        break;
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
    }
  }

  return opts;
}

function printHelp() {
  log.heading("faqir bundle");
  log.blank();
  console.log("Compose all installed CSS into a single bundle file.");
  console.log("Replaces 50+ <link> tags with one.");
  log.blank();
  console.log("Usage:");
  console.log("  faqir bundle");
  console.log("  faqir bundle --minify");
  console.log("  faqir bundle --output dist/styles.css");
  log.blank();
  console.log("Options:");
  log.table([
    ["--output <path>", "Output file path (default: {output_dir}/faqir.bundle.css)"],
    ["--minify", "Strip comments and whitespace"],
    ["--watch", "Re-bundle on CSS file changes"],
    ["--dry-run", "Show what would be bundled without writing"],
  ]);
}

export async function bundle(args: string[]): Promise<void> {
  const opts = parseArgs(args);
  const cwd = process.cwd();

  if (!configExists(cwd)) {
    log.error("No faqir.config.json found. Run 'faqir init' first.");
    process.exit(1);
  }

  const config = await readConfig(cwd);
  const outputDir = join(cwd, config.output_dir);

  if (!existsSync(outputDir)) {
    log.error(`Output directory '${config.output_dir}' not found. Run 'faqir init' first.`);
    process.exit(1);
  }

  const bundleOpts: BundleOptions = {};
  if (opts.output) bundleOpts.output = join(cwd, opts.output);
  if (opts.minify) bundleOpts.minify = true;

  if (opts.dryRun) {
    log.heading("Dry run — would bundle:");
    const result = await generateBundle(cwd, { ...bundleOpts, dryRun: true });
    for (const file of result.files) {
      log.step(file);
    }
    log.blank();
    log.info(`${result.fileCount} files → ${result.output}`);
    return;
  }

  // Persist bundle config on first run
  if (!config.bundle) {
    config.bundle = {
      output: opts.output ?? `${config.output_dir}/faqir.bundle.css`,
      auto: true,
      minify: opts.minify,
    };
    await writeConfig(config, cwd);
  }

  const result = await generateBundle(cwd, bundleOpts);

  log.heading("Bundle generated");
  log.step(`${result.fileCount} CSS files composed`);
  log.success(result.output);
  log.blank();
  console.log("  Use in HTML:");
  log.dim(`  <link rel="stylesheet" href="${config.output_dir}/faqir.bundle.css">`);

  if (opts.watchMode) {
    log.blank();
    log.info("Watching for CSS changes... (Ctrl+C to stop)");

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    watch(outputDir, { recursive: true }, (eventType, filename) => {
      if (!filename?.endsWith(".css")) return;
      if (filename === "faqir.bundle.css") return;

      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        const r = await generateBundle(cwd, bundleOpts);
        log.step(`Rebundled (${r.fileCount} files)`);
      }, 200);
    });

    // Keep process alive
    await new Promise(() => {});
  }
}
