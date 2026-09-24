// Audit rules reference page (docs-site refactor, `audit/index.html`).
//
// The page is derived from the engine's own rule lists, and these tests hold it
// to that: one article per rule the engine can report (the `--rules` inventory,
// which now includes the two project-sweep ids), a stable anchor per rule id, every `rule_id`
// literal the audit sources emit documented, and the page itself audit-clean
// with no class or style attribute anywhere in it.

import { describe, it, expect } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  discoverDocsComponents,
  discoverThemes,
  parseTokenReference,
  readCdnPin,
  readSiteConfig,
  type DocsComponent,
} from "../../src/generator/docs";
import type { PageContext } from "../../src/generator/docs-pages/context";
import {
  AUDIT_PAGE,
  AUTO_FIXES,
  CHECKER_ONLY_RULES,
  RULE_NOTES,
  SEVERITY_BADGE,
  UNAPPLIED_FIXES,
  documentedRules,
  exampleReport,
  renderAuditPages,
  ruleGroups,
} from "../../src/generator/docs-pages/audit";
import { getRuleInventory } from "../../src/audit/rules";
import { auditHtmlSource } from "../../src/audit/checker";
import type { Manifest } from "../../src/manifest";

const REPO = join(import.meta.dir, "../..");
const REGISTRY = join(REPO, "registry");
const SITE = join(REPO, "site");

function context(): PageContext {
  const components = discoverDocsComponents(REGISTRY);
  const byName = new Map<string, DocsComponent>();
  for (const c of components) if (!byName.has(c.name)) byName.set(c.name, c);
  return {
    config: readSiteConfig(SITE),
    components,
    themes: discoverThemes(REGISTRY),
    byName,
    tokenList: parseTokenReference(REGISTRY),
    registryRoot: REGISTRY,
    packageRoot: REPO,
    siteRoot: SITE,
    pin: readCdnPin(REPO),
  };
}

const ctx = context();
const files = renderAuditPages(ctx);
const page = files.find((f) => f.path === AUDIT_PAGE)?.content ?? "";

/** Manifests keyed the way `faqir audit` keys them: canonical names + aliases. */
function auditManifests(): Map<string, Manifest> {
  const map = new Map<string, Manifest>();
  for (const c of ctx.components) {
    map.set(c.name, c.manifest);
    for (const alias of c.manifest.aliases ?? []) map.set(alias, c.manifest);
  }
  return map;
}

/** Every `rule_id: "…"` literal the audit sources emit (the browser's synthetic `audit-error` aside). */
function emittedRuleIds(): string[] {
  const dir = join(REPO, "src", "audit");
  const ids = new Set<string>();
  for (const entry of readdirSync(dir)) {
    if (!entry.endsWith(".ts")) continue;
    const source = readFileSync(join(dir, entry), "utf8");
    for (const m of source.matchAll(/rule_id:\s*"([a-z][a-z-]*)"/g)) ids.add(m[1]);
  }
  ids.delete("audit-error");
  return [...ids].sort();
}

describe("audit rules page", () => {
  it("renders the page at its route", () => {
    expect(files.map((f) => f.path)).toEqual([AUDIT_PAGE]);
    expect(page).toContain("<h1>Audit rules</h1>");
    expect(page).toContain('<nav aria-label="On this page" data-docs-toc');
    expect(page).toContain("data-docs-audit-stats");
  });

  it("documents every rule the inventory lists, once each — the project-sweep pair included", () => {
    const documented = documentedRules().map((r) => r.id);
    const inventory = getRuleInventory().map((r) => r.id);
    expect(new Set(documented).size).toBe(documented.length);
    expect(documented.sort()).toEqual([...inventory].sort());
    // `token-exists` and `reduced-motion` are decided by the on-disk sweep and
    // used to be documented only here, never listed by `faqir audit --rules`.
    expect(CHECKER_ONLY_RULES.map((r) => r.id).sort()).toEqual(["reduced-motion", "token-exists"]);
    for (const r of CHECKER_ONLY_RULES) expect(inventory).toContain(r.id);
  });

  it("the groups partition the documented rules exactly", () => {
    const grouped = ruleGroups().flatMap((g) => g.rules.map((r) => r.id));
    expect(grouped.sort()).toEqual(documentedRules().map((r) => r.id).sort());
    for (const g of ruleGroups()) expect(g.rules.length).toBeGreaterThan(0);
  });

  it("emits one article per rule, anchored on the rule id", () => {
    const articles = [...page.matchAll(/<article id="([^"]+)" data-docs-rule /g)].map((m) => m[1]);
    const ids = documentedRules().map((r) => r.id);
    expect(articles.length).toBe(ids.length);
    expect(articles.sort()).toEqual(ids.sort());
    for (const id of ids) expect(page).toContain(`<article id="${id}" data-docs-rule `);
  });

  it("every rule_id the engine sources emit is documented", () => {
    const documented = new Set(documentedRules().map((r) => r.id));
    const missing = emittedRuleIds().filter((id) => !documented.has(id));
    expect(missing).toEqual([]);
  });

  it("badge variants, notes and fixes name only real rules and real badge values", () => {
    const badgeManifest = JSON.parse(
      readFileSync(join(REGISTRY, "primitives", "badge", "badge.manifest.json"), "utf8"),
    ) as { variants: { visual: { values: string[] } } };
    for (const variant of Object.values(SEVERITY_BADGE)) {
      expect(badgeManifest.variants.visual.values).toContain(variant);
    }
    const ids = new Set(documentedRules().map((r) => r.id));
    for (const id of [...Object.keys(RULE_NOTES), ...Object.keys(AUTO_FIXES), ...Object.keys(UNAPPLIED_FIXES)]) {
      expect(ids.has(id)).toBe(true);
    }
    for (const id of Object.keys(AUTO_FIXES)) expect(page).toContain(`<article id="${id}" data-docs-rule `);
  });

  it("the worked example is a real engine report that includes a fixable finding", () => {
    const report = JSON.parse(exampleReport(ctx)) as {
      audit_schema_version: number;
      passed: boolean;
      results: { rule_id: string; fixable: boolean }[];
    };
    expect(report.audit_schema_version).toBe(1);
    expect(report.passed).toBe(false);
    expect(report.results.length).toBeGreaterThan(0);
    expect(report.results.some((r) => r.fixable)).toBe(true);
    expect(page).toContain('"audit_schema_version": 1');
  });

  it("links only to pages the site generates", () => {
    expect(page).toContain('href="../playground/index.html"');
    const anchors = [...page.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]);
    for (const a of anchors) expect(page).toContain(`id="${a}"`);
  });

  it("is audit-clean at every severity and carries no class or style attribute", () => {
    const findings = auditHtmlSource({ source: page, file: AUDIT_PAGE, manifests: auditManifests() }).map(
      (r) => `${AUDIT_PAGE}:${r.line} [${r.severity}/${r.rule_id}] ${r.message}`,
    );
    expect(findings.join("\n")).toBe("");
    expect(page).not.toMatch(/\sclass=/);
    expect(page).not.toMatch(/\sstyle=/);
  });

  it("is deterministic", () => {
    expect(renderAuditPages(ctx)[0].content).toBe(page);
  });
});
