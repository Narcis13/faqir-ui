// Spacing, rhythm, and density documentation surfaces — task 0.9-12.
//
// The two important directions are intentionally separate:
//   1. source → page: examples extracted from site/content are the exact bytes
//      audited and the exact bytes mounted live/printed by the generated page;
//   2. CSS ↔ page: every spacing/rhythm/density declaration is documented, and
//      every token row the pages document resolves to a real declaration.

import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { auditHtmlSource } from "../../src/audit/checker";
import {
  buildDocsSite,
  DENSITY_PAGE,
  esc,
  parseGuideExamples,
  SPACING_PAGE,
} from "../../src/generator/docs";
import { parseDocument } from "../../src/parser/html-parser";
import { loadRegistryManifestMap } from "../../src/utils/components";
import {
  DENSITY_TOKENS,
  RHYTHM_TOKENS,
  SPACING_LADDER,
} from "../../src/utils/layout";

const ROOT = join(import.meta.dir, "../..");
const REGISTRY = join(ROOT, "registry");
const SPACING_SOURCE = readFileSync(join(ROOT, "site/content/spacing.html"), "utf8");
const DENSITY_SOURCE = readFileSync(join(ROOT, "site/content/density.html"), "utf8");
const SPACING_CSS = readFileSync(join(REGISTRY, "tokens/spacing.css"), "utf8");
const ALIASES_CSS = readFileSync(join(REGISTRY, "tokens/aliases.css"), "utf8");
const DENSITY_CSS = readFileSync(join(REGISTRY, "tokens/density.css"), "utf8");
const manifests = await loadRegistryManifestMap(REGISTRY);
const files = buildDocsSite();
const byPath = new Map(files.map((file) => [file.path, file.content]));

function page(path: string): string {
  const content = byPath.get(path);
  expect(content, `missing generated page ${path}`).toBeDefined();
  return content!;
}

function declarations(body: string): Map<string, string> {
  const out = new Map<string, string>();
  const clean = body.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const match of clean.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
    out.set(match[1], match[2].trim().replace(/\s+/g, " "));
  }
  return out;
}

function rule(css: string, selector: string): Map<string, string> {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const start = clean.indexOf(selector);
  expect(start, `missing ${selector}`).toBeGreaterThanOrEqual(0);
  const open = clean.indexOf("{", start);
  const close = clean.indexOf("}", open);
  return declarations(clean.slice(open + 1, close));
}

function documentedTokens(html: string): string[] {
  return parseDocument(html, "generated-guide.html").elements
    .map((element) => element.attrs["data-token"])
    .filter((token): token is string => !!token)
    .map((token) => token.replace(/^--/, ""));
}

function sorted(values: Iterable<string>): string[] {
  return [...values].sort();
}

describe("spacing/density guides — one source for audited and shipped examples", () => {
  for (const [path, source] of [
    [SPACING_PAGE, SPACING_SOURCE],
    [DENSITY_PAGE, DENSITY_SOURCE],
  ] as const) {
    it(`${path} audits and renders every authored example byte-for-byte`, () => {
      const examples = parseGuideExamples(source);
      expect(examples.length, `${path} needs more than a token table`).toBeGreaterThanOrEqual(2);
      expect(new Set(examples.map((example) => example.id)).size).toBe(examples.length);

      const generated = page(path);
      expect(generated).not.toContain("<template data-docs-example=");
      for (const example of examples) {
        const findings = auditHtmlSource({
          source: example.html,
          file: `${path}#${example.id}`,
          manifests,
        });
        expect(
          findings.map((finding) => `${finding.severity}/${finding.rule_id}: ${finding.message}`).join("\n"),
        ).toBe("");
        expect(generated, `${example.id} is not mounted from its source bytes`).toContain(
          `\n${example.html}\n`,
        );
        expect(generated, `${example.id} code differs from its live markup`).toContain(
          `<code>${esc(example.html)}</code>`,
        );
      }
    });
  }

  it("keeps both complete generated pages audit-clean at every severity", () => {
    for (const path of [SPACING_PAGE, DENSITY_PAGE]) {
      const findings = auditHtmlSource({ source: page(path), file: path, manifests });
      expect(
        findings.map((finding) => `${finding.severity}/${finding.rule_id}: ${finding.message}`).join("\n"),
      ).toBe("");
    }
  });
});

describe("spacing/rhythm page — CSS and documentation cross-check both ways", () => {
  const spacing = rule(SPACING_CSS, ":root");
  const aliases = rule(ALIASES_CSS, ":root");
  const rhythm = new Map(
    [...aliases].filter(([name]) => name.startsWith("section-gap-") || name === "content-gutter"),
  );
  const declared = new Set([...spacing.keys(), ...rhythm.keys()]);
  const documented = documentedTokens(page(SPACING_PAGE));

  it("keeps the doctrine ladder equal to spacing.css, including values", () => {
    expect(sorted(SPACING_LADDER.map((entry) => entry.token))).toEqual(sorted(spacing.keys()));
    for (const entry of SPACING_LADDER) {
      const value = spacing.get(entry.token)!;
      const px = value === "0" ? 0 : value.endsWith("rem") ? Number.parseFloat(value) * 16 : Number.parseFloat(value);
      expect(px, `--${entry.token} value drift`).toBe(entry.px);
    }
  });

  it("keeps the named rhythm set equal to aliases.css", () => {
    expect(sorted(RHYTHM_TOKENS.map((entry) => entry.token))).toEqual(sorted(rhythm.keys()));
  });

  it("documents every declaration and declares every documented row", () => {
    expect(documented.length).toBe(new Set(documented).size);
    expect(sorted(documented)).toEqual(sorted(declared));
  });
});

describe("density page — scoped CSS and documentation cross-check both ways", () => {
  const compact = rule(DENSITY_CSS, '[data-density="compact"]');
  const comfortable = rule(DENSITY_CSS, '[data-density="comfortable"]');
  const documented = documentedTokens(page(DENSITY_PAGE));

  it("declares the same complete token set in compact and comfortable", () => {
    expect(sorted(compact.keys())).toEqual(sorted(DENSITY_TOKENS));
    expect(sorted(comfortable.keys())).toEqual(sorted(DENSITY_TOKENS));
  });

  it("documents every density declaration and declares every documented row", () => {
    expect(documented.length).toBe(new Set(documented).size);
    expect(sorted(documented)).toEqual(sorted(compact.keys()));
  });

  it("makes the rhythm remap and nesting reset explicit", () => {
    const density = page(DENSITY_PAGE);
    for (const token of ["section-gap-sm", "section-gap-md", "section-gap-lg", "content-gutter"]) {
      expect(compact.has(token), `compact omits --${token}`).toBe(true);
      expect(comfortable.has(token), `comfortable omits --${token}`).toBe(true);
      expect(density).toContain(`data-token="--${token}"`);
    }
    expect(density).toContain('data-density="comfortable"');
    expect(density).toContain("nearest density scope wins");
  });
});
