// Manifest templates pass their own components' rules (forecraft #12).
//
// auth-form's template put its header, form and footer straight into a `card`,
// whose manifest requires `[data-part="body"]` — a critical `required-slot`
// that `faqir audit` reported on every page built from it, while the reference
// fragment beside it was clean. Gate 10 of `audit:registry` now runs every
// manifest template through the same engine as the reference fragments; this
// file pins the gate's contract and the templates it caught.

import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  TEMPLATE_AUDIT_PENDING,
  auditManifestTemplates,
  isPlaceholderFinding,
  listManifestTemplates,
} from "../../src/audit/manifest-templates";
import { auditHtmlSource } from "../../src/audit/html-audit";
import {
  knownUiValues,
  loadRegistryManifestMap,
  loadRegistryStylesheetMap,
} from "../../src/utils/components";
import { REGISTRY } from "./forecraft-css";

const manifests = await loadRegistryManifestMap(REGISTRY);
const styles = await loadRegistryStylesheetMap(REGISTRY);
const known = knownUiValues(REGISTRY);
const templates = listManifestTemplates(REGISTRY);
const findings = auditManifestTemplates({ templates, manifests, styles, knownUiValues: known });

const audit = (html: string) =>
  auditHtmlSource({ source: html, manifests, styles, knownUiValues: known });

/** auth-form's template as 1.2.5 shipped it, trimmed to the card. */
const AUTH_FORM_125 = `<div data-ui="auth-form" data-variant="login" data-size="md" data-state="default">
  <div data-ui="card">
    <div data-part="header">
      <h2 data-part="title">{title}</h2>
    </div>
    <form data-part="form" aria-label="{form_label}">
      <button data-ui="button" data-variant="primary" data-part="submit" type="submit">{submit_text}</button>
    </form>
    <div data-part="footer">{footer_content}</div>
  </div>
</div>`;

describe("gate 10 — every manifest template, the real auditor", () => {
  it("reads the templates of all three layers", () => {
    const layers = new Set(templates.map((t) => t.layer));
    expect([...layers].sort()).toEqual(["patterns", "primitives", "recipes"]);
    expect(templates.find((t) => t.name === "auth-form" && t.key === "html")).toBeDefined();
  });

  it("finds nothing outside the pending list", () => {
    const offenders = findings
      .filter((f) => !(f.id in TEMPLATE_AUDIT_PENDING))
      .map((f) => `${f.id}:${f.result.line} [${f.result.rule_id}] ${f.result.message}`);
    expect(offenders).toEqual([]);
  });

  it("holds every pattern and primitive template at zero, with no pending escape", () => {
    const pending = Object.keys(TEMPLATE_AUDIT_PENDING);
    expect(pending.filter((id) => !id.startsWith("recipes/"))).toEqual([]);
    expect(findings.filter((f) => !f.id.startsWith("recipes/"))).toEqual([]);
  });

  it("names only templates that exist in the pending list", () => {
    const ids = new Set(templates.map((t) => `${t.layer}/${t.name}#${t.key}`));
    for (const id of Object.keys(TEMPLATE_AUDIT_PENDING)) expect(ids.has(id), id).toBe(true);
  });
});

describe("what the gate catches", () => {
  it("the 1.2.5 auth-form card with no body — the downstream report", () => {
    const results = audit(AUTH_FORM_125);
    const slot = results.find(
      (r) => r.rule_id === "required-slot" && r.message.includes('[data-part="body"]'),
    );
    expect(slot?.severity).toBe("critical");
    expect(slot?.message).toContain('<div data-ui="card">');
    expect(results.some(isPlaceholderFinding)).toBe(false);
  });

  it("drops a finding only when the value is still a whole {placeholder}", () => {
    const placeholder = audit('<button data-ui="button" data-variant="{variant}">Go</button>');
    expect(placeholder.length).toBeGreaterThan(0);
    expect(placeholder.every(isPlaceholderFinding)).toBe(true);

    const real = audit('<button data-ui="button" data-variant="bogus">Go</button>');
    expect(real.some((r) => r.severity === "error")).toBe(true);
    expect(real.some(isPlaceholderFinding)).toBe(false);
  });
});

describe("the pattern templates the gate caught, fixed", () => {
  const tpl = (name: string, key = "html") =>
    templates.find((t) => t.layer === "patterns" && t.name === name && t.key === key)!.html;

  it("auth-form puts the card's content in its body, footer outside it", () => {
    const html = tpl("auth-form");
    const body = html.indexOf('<div data-part="body">');
    expect(body).toBeGreaterThan(html.indexOf('<div data-part="header">'));
    expect(html.indexOf('<form data-part="form"')).toBeGreaterThan(body);
    expect(html.indexOf('<div data-part="social">')).toBeGreaterThan(body);
    expect(audit(html).filter((r) => r.rule_id === "required-slot")).toEqual([]);
  });

  it("the auth-form reference fragment has a body in every variant", () => {
    const html = readFileSync(join(REGISTRY, "patterns/auth-form/auth-form.html"), "utf8");
    const cards = html.split('<div data-ui="card"').slice(1);
    expect(cards.length).toBeGreaterThanOrEqual(3);
    for (const card of cards) expect(card).toContain('<div data-part="body">');
  });

  it("wizard steps, crud-table, settings-page, search-results and inbox are clean too", () => {
    for (const [name, key] of [
      ["wizard", "html"],
      ["crud-table", "html"],
      ["settings-page", "html"],
      ["search-results", "html"],
      ["inbox", "html"],
      ["inbox", "html_source"],
      ["dashboard-shell", "html"],
    ] as const) {
      const bad = audit(tpl(name, key)).filter(
        (r) => (r.severity === "critical" || r.severity === "error") && !isPlaceholderFinding(r),
      );
      expect(bad.map((r) => `${name}#${key} [${r.rule_id}] ${r.message}`)).toEqual([]);
    }
  });

  it("no pattern template elides a nested component with '...'", () => {
    for (const t of templates.filter((x) => x.layer === "patterns")) {
      expect(t.html, `${t.name}#${t.key}`).not.toMatch(/>\s*\.\.\.\s*</);
    }
  });
});
