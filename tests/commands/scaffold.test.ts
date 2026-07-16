import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { auditHtmlSource, runAudit } from "../../src/audit/checker";
import { scaffold } from "../../src/commands/scaffold";
import {
  DOCUMENT_LAYER_COMPONENTS,
  type DocumentScaffoldName,
} from "../../src/scaffolds/documents";
import { findAllUIElements } from "../../src/parser/html-parser";
import { loadRegistryManifestMap } from "../../src/utils/components";

const ROOT = join(import.meta.dir, "../..");
const REGISTRY = join(ROOT, "registry");
const TEST_DIR = join(import.meta.dir, "../.tmp-scaffold-test");
const UI_DIR = join(TEST_DIR, "ui");

async function writeProject(): Promise<void> {
  for (const dir of ["tokens", "base", "core", "primitives", "recipes", "patterns"]) {
    mkdirSync(join(UI_DIR, dir), { recursive: true });
  }

  const tokenFiles = [
    "palette.css",
    "spacing.css",
    "typography.css",
    "effects.css",
    "motion.css",
    "semantic.css",
    "aliases.css",
    "document.css",
    "doc-aliases.css",
  ];
  const tokens = await Promise.all(
    tokenFiles.map((file) => Bun.file(join(REGISTRY, "tokens", file)).text()),
  );
  await Bun.write(join(UI_DIR, "tokens/index.css"), tokens.join("\n"));
  await Bun.write(join(UI_DIR, "tokens/theme.css"), "/* initial theme */\n");
  await Bun.write(join(UI_DIR, "base/reset.css"), "/* reset */\n");
  await Bun.write(join(UI_DIR, "base/prose.css"), "/* prose */\n");
  await Bun.write(join(UI_DIR, "base/motion-presets.css"), "/* motion */\n");
  await Bun.write(join(UI_DIR, "core/faqir-core.js"), "/* core */\n");
  await Bun.write(join(UI_DIR, "faqir.bundle.css"), "/* stale bundle */\n");
  await Bun.write(
    join(TEST_DIR, "faqir.config.json"),
    JSON.stringify(
      {
        version: "1.0.0",
        theme: "default",
        output_dir: "./ui",
        tokens_split: false,
        include_core: true,
        installed: { primitives: [], recipes: [], patterns: [] },
        bundle: { output: "./ui/faqir.bundle.css", auto: true, minify: false },
      },
      null,
      2,
    ) + "\n",
  );
}

async function runScaffold(args: string[]): Promise<void> {
  const originalCwd = process.cwd();
  process.chdir(TEST_DIR);
  try {
    await scaffold(args);
  } finally {
    process.chdir(originalCwd);
  }
}

async function readScaffold(name: DocumentScaffoldName): Promise<string> {
  return Bun.file(join(TEST_DIR, `${name}.html`)).text();
}

describe("faqir scaffold invoice/report", () => {
  beforeEach(async () => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DIR, { recursive: true });
    await writeProject();
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it("generates deterministic, audit-clean invoice and report pages", async () => {
    const manifests = await loadRegistryManifestMap(REGISTRY);

    for (const name of ["invoice", "report"] as const) {
      await runScaffold([name]);
      const first = await readScaffold(name);

      expect(first).toContain("<!DOCTYPE html>");
      expect(first).toContain('data-part="doc-header"');
      expect(first).toContain('data-part="doc-footer"');
      expect(first).toContain("FAQIR scaffold placeholder convention");
      expect(first).toContain("FAQIR_REPLACE:");
      expect(
        auditHtmlSource({ source: first, file: `${name}.html`, manifests }),
      ).toEqual([]);

      await runScaffold([name, "--output", `${name}-again.html`]);
      const second = await Bun.file(join(TEST_DIR, `${name}-again.html`)).text();
      expect(second).toBe(first);
    }
  });

  it("covers every document-layer component across the two scaffolds", async () => {
    await runScaffold(["invoice"]);
    await runScaffold(["report"]);

    const names = new Set(
      [findAllUIElements(await readScaffold("invoice")), findAllUIElements(await readScaffold("report"))]
        .flat()
        .map((element) => element.name),
    );

    for (const component of DOCUMENT_LAYER_COMPONENTS) {
      expect(names.has(component), `missing document-layer component: ${component}`).toBe(true);
    }
  });

  it("leaves both generated files at zero full-project audit findings", async () => {
    await runScaffold(["invoice"]);
    await runScaffold(["report"]);

    for (const name of ["invoice", "report"] as const) {
      const summary = await runAudit({ cwd: TEST_DIR, file: join(TEST_DIR, `${name}.html`) });
      expect(summary.passed).toBe(true);
      expect(summary.results).toEqual([]);
    }
  });

  it("applies the document theme by default and supports switching themes", async () => {
    await runScaffold(["invoice"]);

    let config = await Bun.file(join(TEST_DIR, "faqir.config.json")).json();
    let theme = await Bun.file(join(UI_DIR, "tokens/theme.css")).text();
    let bundle = await Bun.file(join(UI_DIR, "faqir.bundle.css")).text();

    expect(config.theme).toBe("document");
    expect(theme).toContain("@ui:theme document");
    expect(bundle).toContain("@ui:component document");
    expect(bundle).toContain("@ui:component qr-code");

    await runScaffold(["report", "--theme", "paper"]);

    config = await Bun.file(join(TEST_DIR, "faqir.config.json")).json();
    theme = await Bun.file(join(UI_DIR, "tokens/theme.css")).text();
    bundle = await Bun.file(join(UI_DIR, "faqir.bundle.css")).text();

    expect(config.theme).toBe("paper");
    expect(theme).toContain("@ui:theme paper");
    expect(bundle).toContain("@ui:theme paper");
  });

  it("links document components from their actual layers when no bundle exists", async () => {
    rmSync(join(UI_DIR, "faqir.bundle.css"));
    const configPath = join(TEST_DIR, "faqir.config.json");
    const config = await Bun.file(configPath).json();
    delete config.bundle;
    await Bun.write(configPath, JSON.stringify(config, null, 2) + "\n");

    await runScaffold(["invoice"]);
    const html = await readScaffold("invoice");

    expect(html).toContain('href="./ui/patterns/document/document.css"');
    expect(html).toContain('href="./ui/primitives/key-value/key-value.css"');
    expect(html).toContain('href="./ui/recipes/qr-code/qr-code.css"');
    expect(existsSync(join(UI_DIR, "patterns/document/document.css"))).toBe(true);
  });
});
