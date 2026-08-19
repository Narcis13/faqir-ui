// The application page scaffolds — `admin-dashboard` and `internal-tool`
// (task 1.0R-08).
//
// Both used to be hand-written HTML inside `src/commands/scaffold.ts`: a
// page-local `<style>` block, `style="…"` attributes, and `data-part` values
// belonging to no component. They named `dashboard-shell`, `crud-table` and
// `settings-page` in the catalogue and composed none of them, so `faqir
// scaffold admin-dashboard` wrote a page `faqir audit` would have complained
// about — and the documentation site could not show it at all.
//
// These tests hold the replacement to the three properties that fix means:
// every block is a registry pattern's own marked block, byte for byte; the page
// is audit-clean at every severity; and the catalogue's component list is the
// list the page actually references.

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { auditHtmlSource } from "../../src/audit/checker";
import { scaffold } from "../../src/commands/scaffold";
import {
  APP_SCAFFOLD_COMPANION_SELECTORS,
  APP_SCAFFOLD_COMPONENTS,
  APP_SCAFFOLD_NAMES,
  APP_SCAFFOLD_PATTERNS,
  appScaffoldBody,
} from "../../src/scaffolds/app";
import {
  SCAFFOLD_OMIT_MARKER,
  SCAFFOLD_SLOT_MARKER,
  readPatternSection,
  stripOmitted,
} from "../../src/scaffolds/compose";
import { SCAFFOLDS } from "../../src/scaffolds/registry";
import { findAllUIElements, parseDocument } from "../../src/parser/html-parser";
import { loadRegistryManifestMap } from "../../src/utils/components";

const ROOT = join(import.meta.dir, "../..");
const REGISTRY = join(ROOT, "registry");
const TEST_DIR = join(import.meta.dir, "../.tmp-app-scaffold");
const UI_DIR = join(TEST_DIR, "ui");

async function writeProject(): Promise<void> {
  for (const dir of ["tokens", "base", "core", "primitives", "recipes", "patterns"]) {
    mkdirSync(join(UI_DIR, dir), { recursive: true });
  }
  const tokenFiles = [
    "palette.css", "spacing.css", "typography.css", "effects.css", "motion.css",
    "semantic.css", "aliases.css", "document.css", "doc-aliases.css", "density.css",
  ];
  const tokens = await Promise.all(
    tokenFiles.map((file) => Bun.file(join(REGISTRY, "tokens", file)).text()),
  );
  await Bun.write(join(UI_DIR, "tokens/index.css"), tokens.join("\n"));
  await Bun.write(join(UI_DIR, "tokens/theme.css"), "/* initial theme */\n");
  for (const base of ["reset", "prose", "rhythm", "motion-presets"]) {
    await Bun.write(join(UI_DIR, `base/${base}.css`), `/* ${base} */\n`);
  }
  await Bun.write(join(UI_DIR, "core/faqir-core.js"), "/* core */\n");
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

describe("the composed application scaffolds", () => {
  it("copies every block verbatim out of the pattern that owns it", () => {
    for (const name of APP_SCAFFOLD_NAMES) {
      const body = appScaffoldBody(name, REGISTRY);
      for (const pattern of APP_SCAFFOLD_PATTERNS[name]) {
        const block = stripOmitted(readPatternSection(REGISTRY, pattern, name));
        expect(block.length, `${pattern} offered ${name} an empty block`).toBeGreaterThan(200);
        // A shell pattern's block is one string with a hole in it, so it is
        // asserted on both sides of the hole: everything before the slot and
        // everything after it must still be the pattern's own bytes.
        for (const half of block.split(SCAFFOLD_SLOT_MARKER)) {
          expect(body, `${name} did not copy ${pattern} verbatim`).toContain(half);
        }
      }
    }
  });

  it("mounts the composition under exactly one main landmark", () => {
    for (const name of APP_SCAFFOLD_NAMES) {
      const mains = [...appScaffoldBody(name, REGISTRY).matchAll(/<main\b/g)];
      expect(mains.length, `${name} declares ${mains.length} main landmarks`).toBe(1);
    }
  });

  it("omits the patterns' unwired modals rather than nesting them in <main>", () => {
    // The omission is the registry's decision, marked in the pattern; this is the
    // proof it took effect, and that the pattern still ships the dialog for
    // someone who wants it.
    for (const name of APP_SCAFFOLD_NAMES) {
      const body = appScaffoldBody(name, REGISTRY);
      expect(body).not.toContain('data-ui="dialog"');
      expect(body).not.toContain(SCAFFOLD_OMIT_MARKER);
    }
    for (const pattern of ["crud-table", "settings-page"]) {
      const source = readFileSync(join(REGISTRY, "patterns", pattern, `${pattern}.html`), "utf8");
      expect(source, `${pattern} lost its dialogs`).toContain('data-ui="dialog"');
      expect(source.match(/<!-- @ui:scaffold-omit -->/g)?.length).toBe(1);
      expect(source.match(/<!-- @ui:scaffold-omit-end -->/g)?.length).toBe(1);
    }
  });

  it("declares exactly the components the composed page references", () => {
    for (const name of APP_SCAFFOLD_NAMES) {
      const referenced = new Set(
        findAllUIElements(appScaffoldBody(name, REGISTRY))
          .map((el) => el.name)
          .map((n) => APP_SCAFFOLD_COMPANION_SELECTORS[n] ?? n),
      );
      const declared = new Set([
        ...APP_SCAFFOLD_COMPONENTS[name],
        ...APP_SCAFFOLD_PATTERNS[name],
      ]);
      expect([...referenced].filter((n) => !declared.has(n)).sort(), `${name} under-declares`).toEqual([]);
      expect([...declared].filter((n) => !referenced.has(n)).sort(), `${name} over-declares`).toEqual([]);
      // …and the catalogue entry the CLI reads is the same list.
      expect(SCAFFOLDS[name].components).toEqual([...APP_SCAFFOLD_COMPONENTS[name]]);
      expect(SCAFFOLDS[name].patterns).toEqual([...APP_SCAFFOLD_PATTERNS[name]]);
    }
  });
});

describe("faqir scaffold admin-dashboard/internal-tool", () => {
  beforeEach(async () => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DIR, { recursive: true });
    await writeProject();
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it("writes a deterministic, audit-clean page that synthesises no markup", async () => {
    const manifests = await loadRegistryManifestMap(REGISTRY);

    for (const name of APP_SCAFFOLD_NAMES) {
      await runScaffold([name]);
      const first = await Bun.file(join(TEST_DIR, `${name}.html`)).text();

      expect(first).toContain("<!DOCTYPE html>");
      // The defect this task closed: a page-local stylesheet and inline styles.
      expect(first).not.toContain("<style");
      expect(first).not.toMatch(/\sstyle\s*=/);
      expect(first).not.toMatch(/\sclass\s*=/);
      const doc = parseDocument(first, `${name}.html`);
      expect(doc.elements.filter((el) => el.attrs["style"] !== undefined)).toEqual([]);

      expect(auditHtmlSource({ source: first, file: `${name}.html`, manifests })).toEqual([]);

      await runScaffold([name, "--output", `${name}-again.html`]);
      expect(await Bun.file(join(TEST_DIR, `${name}-again.html`)).text()).toBe(first);
    }
  });

  it("installs every component the page references, and links its stylesheet", async () => {
    // The other half of "audit-clean": a page whose components are declared but
    // not installed renders unstyled. (A whole-project `runAudit` is deliberately
    // not run here — it also audits the copied component CSS, where
    // `dashboard-shell.css` trips `token-exists` on its own component-local
    // custom properties. That is a registry finding, not a scaffold one, and it
    // predates this task.)
    for (const name of APP_SCAFFOLD_NAMES) {
      await runScaffold([name]);
      const html = await Bun.file(join(TEST_DIR, `${name}.html`)).text();
      for (const component of [...APP_SCAFFOLD_COMPONENTS[name], ...APP_SCAFFOLD_PATTERNS[name]]) {
        const layer = (["primitives", "recipes", "patterns"] as const).find((candidate) =>
          existsSync(join(UI_DIR, candidate, component)),
        );
        expect(layer, `${name} did not install ${component}`).toBeDefined();
        expect(html, `${name} does not link ${component}`).toContain(
          `/${layer}/${component}/`,
        );
      }
    }
  });
});
