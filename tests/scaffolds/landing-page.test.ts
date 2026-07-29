// `faqir scaffold landing-page` — composed from the maintained patterns
// (task 0.7-08).
//
// The point of this suite is that the scaffold no longer *synthesises* markup.
// Before 0.7-08 it emitted a hand-written hero/features/CTA page with its own
// inline <style> block, which could drift from the registry without anything
// failing. Now every section is lifted verbatim out of a pattern's reference
// page, so these tests assert composition (byte-identical sections, no inline
// styles, the patterns installed and linked) rather than a golden string.

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { runAudit } from "../../src/audit/checker";
import { scaffold } from "../../src/commands/scaffold";
import {
  LANDING_COMPONENTS,
  LANDING_PATTERNS,
  extractScaffoldBlock,
  readPatternSection,
} from "../../src/scaffolds/landing";
import { findAllUIElements, parseDocument } from "../../src/parser/html-parser";
import { DOCUMENT_RULES } from "../../src/audit/rules";

const ROOT = join(import.meta.dir, "../..");
const REGISTRY = join(ROOT, "registry");
const TEST_DIR = join(import.meta.dir, "../.tmp-landing-scaffold");
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
  await Bun.write(join(UI_DIR, "base/reset.css"), "/* reset */\n");
  await Bun.write(join(UI_DIR, "base/prose.css"), "/* prose */\n");
  await Bun.write(join(UI_DIR, "base/rhythm.css"), "/* rhythm */\n");
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

async function generated(file = "landing-page.html"): Promise<string> {
  return Bun.file(join(TEST_DIR, file)).text();
}

describe("faqir scaffold landing-page", () => {
  beforeEach(async () => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DIR, { recursive: true });
    await writeProject();
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it("composes every section verbatim from its pattern", async () => {
    await runScaffold(["landing-page"]);
    const html = await generated();

    for (const pattern of LANDING_PATTERNS) {
      const section = readPatternSection(REGISTRY, pattern);
      expect(section.length).toBeGreaterThan(200);
      expect(html, `${pattern} section copied verbatim`).toContain(section);
    }
  });

  it("synthesises no markup of its own", async () => {
    await runScaffold(["landing-page"]);
    const html = await generated();

    // The old generator shipped a page-local <style> block and ad-hoc parts
    // ([data-part="hero"], [data-part="cta"]) that belonged to no component.
    expect(html).not.toContain("<style");
    expect(html).not.toContain("<script");
    expect(html).not.toMatch(/\sstyle\s*=/);

    // Every data-ui on the page comes from a pattern or a declared primitive.
    const allowed = new Set<string>([...LANDING_PATTERNS, ...LANDING_COMPONENTS]);
    for (const element of findAllUIElements(html)) {
      expect(allowed.has(element.name), `unexpected data-ui="${element.name}"`).toBe(true);
    }
  });

  it("lays the sections out as one main landmark plus a sibling footer", async () => {
    await runScaffold(["landing-page"]);
    const html = await generated();
    const doc = parseDocument(html, "landing-page.html");

    expect(doc.isFullDocument).toBe(true);
    const mains = doc.elements.filter((el) => el.tag === "main");
    expect(mains.length).toBe(1);

    const inMain = (name: string) =>
      doc.elements.some((el) => {
        if (el.attrs["data-ui"] !== name) return false;
        for (let a = el.parent; a; a = a.parent) if (a.tag === "main") return true;
        return false;
      });

    expect(inMain("hero")).toBe(true);
    expect(inMain("feature-grid")).toBe(true);
    expect(inMain("pricing")).toBe(true);
    expect(inMain("site-footer")).toBe(false);

    // Source order is hero → feature-grid → pricing → site-footer.
    const order = findAllUIElements(html)
      .map((el) => el.name)
      .filter((name) => (LANDING_PATTERNS as readonly string[]).includes(name));
    expect(order).toEqual([...LANDING_PATTERNS]);
  });

  it("passes the full project audit, including document rules", async () => {
    await runScaffold(["landing-page"]);

    const summary = await runAudit({
      cwd: TEST_DIR,
      file: join(TEST_DIR, "landing-page.html"),
    });
    expect(summary.results).toEqual([]);
    expect(summary.passed).toBe(true);

    const doc = parseDocument(await generated(), "landing-page.html");
    expect(DOCUMENT_RULES.flatMap((rule) => rule.check(doc))).toEqual([]);
  });

  it("installs and links the patterns it composes", async () => {
    await runScaffold(["landing-page"]);

    const config = await Bun.file(join(TEST_DIR, "faqir.config.json")).json();
    expect(config.installed.patterns.sort()).toEqual([...LANDING_PATTERNS].sort());
    for (const component of LANDING_COMPONENTS) {
      expect(config.installed.primitives).toContain(component);
    }

    const html = await generated();
    for (const pattern of LANDING_PATTERNS) {
      expect(existsSync(join(UI_DIR, "patterns", pattern, `${pattern}.css`))).toBe(true);
      expect(html).toContain(`href="./ui/patterns/${pattern}/${pattern}.css"`);
    }

    // Every linked stylesheet must exist in the project. The icon primitive
    // ships `icons.css`, not `icon.css`, so a name-by-convention link would 404.
    const linked = [...html.matchAll(/href="\.\/ui\/([^"]+)"/g)].map((m) => m[1]);
    expect(linked.length).toBeGreaterThan(LANDING_COMPONENTS.length);
    for (const href of linked) {
      expect(existsSync(join(UI_DIR, href)), `linked stylesheet exists: ${href}`).toBe(true);
    }
    for (const component of LANDING_COMPONENTS) {
      expect(linked.some((href) => href.startsWith(`primitives/${component}/`))).toBe(true);
    }
  });

  it("is deterministic", async () => {
    await runScaffold(["landing-page"]);
    const first = await generated();
    await runScaffold(["landing-page", "--output", "again.html"]);
    expect(await generated("again.html")).toBe(first);
  });
});

describe("landing-page scaffold block extraction", () => {
  it("returns exactly what sits between the markers", () => {
    const block = extractScaffoldBlock(
      `<!-- @ui:component x -->\n<!-- @ui:scaffold landing-page -->\n<section data-ui="x"></section>\n<!-- @ui:scaffold-end -->\n<section data-ui="x" data-variant="other"></section>\n`,
      "x",
    );
    expect(block).toBe(`<section data-ui="x"></section>`);
  });

  it("refuses to guess when a pattern has no marked block", () => {
    expect(() => extractScaffoldBlock(`<section data-ui="x"></section>`, "x")).toThrow(
      /no <!-- @ui:scaffold landing-page -->/,
    );
  });

  it("every landing pattern carries exactly one marked block", async () => {
    for (const pattern of LANDING_PATTERNS) {
      const source = await Bun.file(
        join(REGISTRY, "patterns", pattern, `${pattern}.html`),
      ).text();
      expect(source.match(/<!-- @ui:scaffold landing-page -->/g)?.length).toBe(1);
      expect(source.match(/<!-- @ui:scaffold-end -->/g)?.length).toBe(1);
      expect(readPatternSection(REGISTRY, pattern)).toContain(`data-ui="${pattern}"`);
    }
  });
});
