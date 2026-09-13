// The "Rules & validation" docs section (`rules/index.html`).
//
// The page is derived from `@faqir-ui/rules` and `@faqir-ui/forms` rather
// than restated, so these tests hold it to the packages: every logic operator,
// verb, shape rule, format and lint rule the code exports appears on the page;
// the published schema is emitted byte-identical beside it; the three worked
// examples are the packages' own output; and the page passes the same audit
// gate every other site page does, with no class or style attribute.

import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  discoverDocsComponents,
  discoverThemes,
  parseTokenReference,
  readCdnPin,
  relUrl,
  type SiteConfig,
  type SiteFile,
} from "../../src/generator/docs";
import type { PageContext } from "../../src/generator/docs-pages/context";
import {
  RULES_NAV_TITLE,
  RULES_PAGE,
  RULES_SCHEMA_FILE,
  parseLogicOperators,
  parseRulesExports,
  renderRulesPages,
} from "../../src/generator/docs-pages/rules";
import * as rulesPkg from "../../packages/rules/src/index.js";
import { renderForm } from "../../packages/forms/src/index.js";
import { auditHtmlSource } from "../../src/audit/checker";
import { parseDocument } from "../../src/parser/html-parser";
import type { Manifest } from "../../src/manifest";

const REPO = join(import.meta.dir, "../..");
const REGISTRY = join(REPO, "registry");
const SITE = join(REPO, "site");

const components = discoverDocsComponents(REGISTRY);
const themes = discoverThemes(REGISTRY);
const config: SiteConfig = JSON.parse(readFileSync(join(SITE, "site.config.json"), "utf8"));

const byName = new Map<string, (typeof components)[number]>();
for (const c of components) if (!byName.has(c.name)) byName.set(c.name, c);

const ctx: PageContext = {
  config,
  components,
  themes,
  byName,
  tokenList: parseTokenReference(REGISTRY),
  registryRoot: REGISTRY,
  packageRoot: REPO,
  siteRoot: SITE,
  pin: readCdnPin(REPO),
};

const files: SiteFile[] = renderRulesPages(ctx);
const byPath = new Map(files.map((f) => [f.path, f.content]));

function file(path: string): string {
  const content = byPath.get(path);
  if (content === undefined) throw new Error(`renderRulesPages did not emit ${path}`);
  return content;
}

function auditManifests(): Map<string, Manifest> {
  const map = new Map<string, Manifest>();
  for (const c of components) {
    map.set(c.name, c.manifest);
    for (const alias of c.manifest.aliases ?? []) map.set(alias, c.manifest);
  }
  return map;
}

describe("rules docs page", () => {
  const html = file(RULES_PAGE);

  it("emits the page and the schema file, and nothing else", () => {
    expect(files.map((f) => f.path).sort()).toEqual([RULES_PAGE, RULES_SCHEMA_FILE].sort());
    expect(html).toContain(`<h1>${RULES_NAV_TITLE.replace("&", "&amp;")}</h1>`);
    expect(html).toContain('<nav aria-label="On this page" data-docs-toc>');
  });

  it("emits rules.schema.json byte-identical to the package's copy, and links it", () => {
    const source = readFileSync(join(REPO, "packages/rules/rules.schema.json"), "utf8");
    expect(file(RULES_SCHEMA_FILE)).toBe(source);
    expect(html).toContain(`href="${relUrl(RULES_PAGE, RULES_SCHEMA_FILE)}"`);
  });

  it("lists every logic operator the evaluator implements, in its order", () => {
    const cells = [...html.matchAll(/<td><code>([^<]+)<\/code><\/td><td>(data|logic|compare|arithmetic|string|arrays|Faqir)<\/td>/g)]
      .map((m) => m[1].replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"));
    expect(cells).toEqual([...rulesPkg.LOGIC_OPS]);
    expect(rulesPkg.LOGIC_OPS.length).toBe(31);
    expect(html).toContain(`The JSONLogic subset: ${rulesPkg.LOGIC_OPS.length} operators`);
  });

  it("derives operator families and arities from logic.js rather than a hand list", () => {
    const rows = parseLogicOperators(readFileSync(join(REPO, "packages/rules/src/logic.js"), "utf8"));
    expect(rows.map((r) => r.op)).toEqual([...rulesPkg.LOGIC_OPS]);
    expect(rows.find((r) => r.op === "date")).toEqual({ op: "date", family: "faqir", arity: 3 });
    expect(rows.find((r) => r.op === "var")?.arity).toBe(0);
    expect(() => parseLogicOperators("// nothing here")).toThrow(/OP_ARITY/);
  });

  it("lists the verbs, the shape rules, the formats, the lint rules and the limits from the package", () => {
    for (const verb of rulesPkg.RULE_VERBS) expect(html).toContain(`<td><code>${verb}</code></td>`);
    for (const rule of rulesPkg.SHAPE_RULES) {
      expect(html).toContain(`<td><code>${rule}</code></td><td>${rulesPkg.DEFAULT_MESSAGES[rule]}</td>`);
    }
    for (const format of rulesPkg.BUILT_IN_FORMATS) expect(html).toContain(`<td><code>${format}</code></td>`);
    for (const rule of rulesPkg.LINT_RULES) expect(html).toContain(`<td><code>${rule}</code></td>`);
    for (const key of Object.keys(rulesPkg.RULE_MESSAGES)) expect(html).toContain(`<td><code>${key}</code></td>`);
    expect(html).toContain(`<td><code>MAX_PATTERN_LENGTH</code></td><td>${rulesPkg.MAX_PATTERN_LENGTH}</td>`);
    expect(html).toContain(`<td><code>MAX_REGEX_SUBJECT_LENGTH</code></td><td>${rulesPkg.MAX_REGEX_SUBJECT_LENGTH}</td>`);
    expect(html).toContain(`<td><code>MAX_LOGIC_NODES</code></td><td>${rulesPkg.MAX_LOGIC_NODES}</td>`);
    expect(html).toContain(`<td><code>MAX_LOGIC_DEPTH</code></td><td>${rulesPkg.MAX_LOGIC_DEPTH}</td>`);
    expect(html).toContain(`The ${rulesPkg.RULE_VERBS.length} verbs`);
    expect(html).toContain(`The ${rulesPkg.SHAPE_RULES.length} shape rules`);
    expect(html).toContain(`The ${rulesPkg.BUILT_IN_FORMATS.length} formats`);
    expect(html).toContain(`The ${rulesPkg.LINT_RULES.length} checks`);
  });

  it("names every export of @faqir-ui/rules, grouped by source module", () => {
    const groups = parseRulesExports(readFileSync(join(REPO, "packages/rules/src/index.js"), "utf8"));
    const names = groups.flatMap((g) => g.names).sort();
    // The namespace is the truth: 36 names at the time of writing (the evaluator's
    // notes said 34; `CompiledDefinition` and `DefinitionError` were uncounted).
    expect(names).toEqual(Object.keys(rulesPkg).sort());
    expect(names.length).toBeGreaterThanOrEqual(34);
    for (const name of names) expect(html).toContain(`<code>${name}</code>`);
    expect(html).toContain(`The ${names.length} exports`);
    expect(() => parseRulesExports('export { foo } from "./nowhere.js";')).toThrow(/disagrees/);
  });

  it("walks rules.schema.json for the field reference and the rule branches", () => {
    const schema = JSON.parse(readFileSync(join(REPO, "packages/rules/rules.schema.json"), "utf8"));
    for (const key of Object.keys(schema.properties)) expect(html).toContain(`<td><code>${key}</code></td>`);
    for (const branch of ["stringField", "numericField", "booleanField", "objectField", "arrayField"]) {
      for (const keyword of Object.keys(schema.definitions[branch].properties)) {
        expect(html).toContain(`<td><code>${keyword}</code></td>`);
      }
    }
    expect(html).toContain(schema.$id);
    // The remote branch is marked as such.
    expect(html).toContain('<span data-ui="badge" data-size="sm">remote</span>');
  });

  it("shows the packages' own output for the worked examples", () => {
    // The forms example is the string renderForm returns, escaped once.
    const formHtml = renderForm(
      {
        type: "object",
        title: "Sign up",
        required: ["email", "plan"],
        properties: {
          email: { type: "string", format: "email", title: "Work email" },
          plan: { type: "string", enum: ["solo", "team"], title: "Plan" },
          seats: { type: "integer", minimum: 2, title: "Seats" },
        },
        if: { properties: { plan: { const: "team" } } },
        then: { properties: { seats: {} }, required: ["seats"] },
      },
      { plan: { widget: "radio" } },
      { idPrefix: "signup" },
    );
    const escaped = formHtml.trimEnd().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    expect(html).toContain(escaped);
    expect(formHtml).toContain("@ui:requires faqir-core.js faqir-validate.js faqir-rules.js");

    // The Node verdict is a real verdict.
    expect(html).toContain('"rule": "format"');
    expect(html).toContain('"rule": "minimum"');
    expect(html).toContain('"pending": []');

    // The lint report is a real report in the CLI's envelope.
    expect(html).toContain('"rules_lint_schema_version": 1');
    expect(html).toContain('"rule": "rule-refs"');
    expect(html).toContain('"id": "seats-for-teams"');
  });

  it("links the three packages on GitHub in a new tab", () => {
    for (const name of ["rules", "forms", "core"]) {
      expect(html).toContain(
        `href="https://github.com/Narcis13/faqir-ui/tree/main/packages/${name}" target="_blank" rel="noopener noreferrer"`,
      );
    }
  });

  it("is deterministic", () => {
    const again = renderRulesPages(ctx);
    expect(again.map((f) => f.content)).toEqual(files.map((f) => f.content));
  });

  it("passes the audit gate at every severity, with no class or style attribute", () => {
    const manifests = auditManifests();
    const findings = auditHtmlSource({ source: html, file: RULES_PAGE, manifests }).map(
      (r) => `${RULES_PAGE}:${r.line} [${r.severity}/${r.rule_id}] ${r.message}`,
    );
    expect(findings.join("\n")).toBe("");
    expect(html).not.toMatch(/\sclass\s*=/);
    const doc = parseDocument(html, RULES_PAGE);
    expect(doc.elements.filter((el) => el.attrs["style"] !== undefined)).toEqual([]);
  });

  it("uses unique heading ids and links only to anchors that exist", () => {
    const headingIds = [...html.matchAll(/<h[1-6] id="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(headingIds).size).toBe(headingIds.length);
    // Element ids from the parsed document, so an `id="…"` inside an escaped
    // `<pre>` example is text and not an anchor.
    const allIds = parseDocument(html, RULES_PAGE)
      .elements.map((el) => el.attrs["id"])
      .filter((id): id is string => typeof id === "string");
    expect(new Set(allIds).size).toBe(allIds.length);
    for (const m of html.matchAll(/href="#([^"]+)"/g)) {
      expect(allIds, `anchor #${m[1]} has no target`).toContain(m[1]);
    }
    const order = [...html.matchAll(/<h([1-6])/g)].map((m) => Number(m[1]));
    for (let i = 1; i < order.length; i++) expect(order[i] - order[i - 1]).toBeLessThanOrEqual(1);
  });
});
