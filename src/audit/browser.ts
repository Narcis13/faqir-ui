// Browser entry for the audit engine (task 0.7-14, FAQIR-PLAN §13).
//
// Bundled by `scripts/build-audit-browser.mjs` into `site/lib/faqir-audit.js`, an
// IIFE that installs one global — `window.FaqirAudit` — so the docs-site
// playground can audit markup **entirely client-side**: no server, no API call,
// no build step in the page.
//
// The engine here is not a re-implementation: it re-exports `auditHtmlSource`
// from `src/audit/html-audit.ts`, the same function `faqir audit` and the MCP
// `faqir_audit_html` tool call. That is what makes CLI ↔ browser parity
// structural. The only browser-shaped part is the shape of the input: the CLI
// hands the auditor a `Map<string, Manifest>` it built from disk, while a page
// has a plain JSON object, so `createAuditor` performs the identical keying
// (canonical name + every alias) over an object.
//
// Nothing in this module's import graph touches `node:*` — asserted by the
// bundle test, which is the gate that keeps the browser build possible at all.

import { auditHtmlSource } from "./html-audit";
import { ALL_RULES, DOCUMENT_RULES, type AuditResult, type Severity } from "./rules";
import {
  CSS_RULES,
  buildBreakpointCanonResults,
  buildUndeclaredAttributeResults,
} from "./css-rules";
import type { Manifest } from "../manifest";
import { VERSION } from "../version";

/** Manifests as a page has them: a plain object keyed by component name. */
export type ManifestRecord = Record<string, Manifest>;

export interface BrowserAuditOptions {
  /** File label used in findings. Defaults to `input.html`. */
  file?: string;
  /** Rule IDs to skip. */
  skipRules?: string[];
}

/** A rule descriptor, for a legend the page can render without hardcoding rules. */
export interface BrowserRuleInfo {
  id: string;
  severity: Severity;
  description: string;
  /** Which contract the rule enforces. */
  scope: "component" | "document" | "css";
}

/** Input for {@link auditComponentCss} — one stylesheet and the manifest it belongs to. */
export interface BrowserCssAuditInput {
  /** The stylesheet source. */
  css: string;
  /** The component's manifest — the declaration `undeclared-attribute` checks against. */
  manifest: Manifest;
  /** File label used in findings. Defaults to `<name>.css`. */
  file?: string;
  /** Rule IDs to skip. */
  skipRules?: string[];
}

export interface Auditor {
  /** Audit one HTML source string. Never throws — see {@link audit}. */
  audit(source: string, options?: BrowserAuditOptions): AuditResult[];
  /** Component names this auditor knows (canonical names only), sorted. */
  components: string[];
}

/**
 * Key manifests exactly as `faqir audit` does: canonical name plus every alias,
 * all pointing at the same manifest object. An unkeyed alias would make the
 * browser silently skip a component the CLI audits — the parity fixtures include
 * an aliased component for that reason.
 *
 * **Insertion order is load-bearing and deliberately not sorted.** One name can
 * exist in two layers (`empty-state` ships as both a primitive and a pattern), and
 * `runAudit` loads primitives, then recipes, then patterns, so the last one keyed
 * wins. The payload the docs generator emits is written in that same layer order;
 * re-sorting here would silently pick the other manifest and audit those
 * components against the wrong contract in the browser only.
 */
export function manifestMap(manifests: ManifestRecord): Map<string, Manifest> {
  const map = new Map<string, Manifest>();
  for (const key of Object.keys(manifests)) {
    const manifest = manifests[key];
    if (!manifest) continue;
    map.set(manifest.name ?? key, manifest);
    for (const alias of manifest.aliases ?? []) map.set(alias, manifest);
  }
  return map;
}

/**
 * Build an auditor bound to a set of manifests.
 *
 * `audit()` **never throws.** A playground types into a textarea, so most input
 * is malformed HTML mid-keystroke; the tokenizer is total by design (task 0.5-08)
 * but a page that dies on one pathological string is worse than one that reports
 * it, so an unexpected engine error is surfaced as a synthetic `info` finding
 * instead of an exception. The fuzz-corpus test asserts both halves: no throw,
 * and no silent swallow of real findings.
 */
export function createAuditor(manifests: ManifestRecord): Auditor {
  const map = manifestMap(manifests);
  const canonical = new Set<string>();
  for (const key of Object.keys(manifests)) {
    const m = manifests[key];
    if (m) canonical.add(m.name ?? key);
  }

  return {
    components: [...canonical].sort(),
    audit(source, options = {}) {
      try {
        return auditHtmlSource({
          source,
          file: options.file ?? "input.html",
          manifests: map,
          skipRules: options.skipRules,
        });
      } catch (error) {
        return [
          {
            rule_id: "audit-error",
            severity: "info",
            component_name: "",
            file: options.file ?? "input.html",
            line: 1,
            message: `The audit engine could not finish on this input: ${
              error instanceof Error ? error.message : String(error)
            }`,
          },
        ];
      }
    },
  };
}

/**
 * Audit one stylesheet against its manifest (task 0.8-10) — the CSS half of the
 * engine, in the browser.
 *
 * Same shape of promise as {@link createAuditor}: it never throws, because the
 * playground's next keystroke may leave the sheet mid-token. Same functions the
 * CLI and the registry gate call, so the parity claim covers these rules too.
 */
export function auditComponentCss(input: BrowserCssAuditInput): AuditResult[] {
  const file = input.file ?? `${input.manifest?.name ?? "component"}.css`;
  const skip = new Set(input.skipRules ?? []);
  try {
    const results: AuditResult[] = [];
    if (!skip.has("undeclared-attribute")) {
      results.push(...buildUndeclaredAttributeResults(input.css, input.manifest, file));
    }
    if (!skip.has("breakpoint-canon")) {
      results.push(
        ...buildBreakpointCanonResults(input.css, input.manifest?.name ?? "component", file),
      );
    }
    return results;
  } catch (error) {
    return [
      {
        rule_id: "audit-error",
        severity: "info",
        component_name: input.manifest?.name ?? "",
        file,
        line: 1,
        message: `The audit engine could not finish on this stylesheet: ${
          error instanceof Error ? error.message : String(error)
        }`,
      },
    ];
  }
}

/** Every rule the browser bundle runs — HTML, document and stylesheet alike. */
export function ruleInventory(): BrowserRuleInfo[] {
  return [
    ...ALL_RULES.map((r) => ({
      id: r.id,
      severity: r.severity,
      description: r.description,
      scope: "component" as const,
    })),
    ...DOCUMENT_RULES.map((r) => ({
      id: r.id,
      severity: r.severity,
      description: r.description,
      scope: "document" as const,
    })),
    ...CSS_RULES.map((r) => ({
      id: r.id,
      severity: r.severity,
      description: r.description,
      scope: "css" as const,
    })),
  ];
}

/** Severity order, worst first — the order the playground groups findings in. */
export const SEVERITY_ORDER: Severity[] = ["critical", "error", "warning", "info"];

/** The global the bundle installs. */
export interface FaqirAuditGlobal {
  /** CLI version this engine was built from — the parity claim is per-version. */
  version: string;
  createAuditor: typeof createAuditor;
  manifestMap: typeof manifestMap;
  auditComponentCss: typeof auditComponentCss;
  rules: BrowserRuleInfo[];
  severities: Severity[];
}

const api: FaqirAuditGlobal = {
  version: VERSION,
  createAuditor,
  manifestMap,
  auditComponentCss,
  rules: ruleInventory(),
  severities: SEVERITY_ORDER,
};

// `globalThis` rather than `window`: the parity test evaluates this bundle in a
// bare `node:vm` context, with no DOM at all, and gets the identical engine.
(globalThis as unknown as { FaqirAudit: FaqirAuditGlobal }).FaqirAudit = api;

export default api;
