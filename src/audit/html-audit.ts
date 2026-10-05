// HTML audit core — the filesystem-free half of the checker (task 0.7-14).
//
// `auditHtmlSource` audits one HTML *string* against in-memory manifests. It
// reads nothing and writes nothing, so it is the piece that can run anywhere:
// in `faqir audit` (per file), in the MCP `faqir_audit_html` tool (per string),
// and — since this module and everything it imports are free of `node:*` — in a
// browser, which is what the docs-site playground bundles (`src/audit/browser.ts`).
//
// It lives in its own module for exactly that reason: `checker.ts` needs
// `node:fs`/`node:path` for the on-disk sweep (`runAudit`), and a single
// `node:fs` import anywhere in the graph makes the whole thing unbundlable for
// the browser. `checker.ts` re-exports this file's API, so every existing call
// site is unchanged and there is only ever ONE implementation — which is what
// makes CLI ↔ browser finding parity structural rather than a coincidence to
// re-test.

import { type ParsedDocument, extractComponents, parseDocument } from "../parser/html-parser";
import type { Manifest } from "../manifest";
import {
  type AuditResult,
  ALL_RULES,
  DOCUMENT_RULES,
  SINGLE_FIXED_REGION_RULE,
  TRIGGER_CONTRACT_RULE,
  UNKNOWN_COMPONENT_RULE,
  buildSingleFixedRegionResults,
  buildTriggerContractResults,
  buildUnknownComponentResults,
} from "./rules";
import { buildVocabularyResults } from "./vocabulary";

/**
 * Rules that assert a **runtime is present in the same file** — not a property
 * of the markup (task 0.9-04, resolving follow-up 0.7-17).
 *
 * A component *fragment* — `<div data-ui="dialog">…</div>` with no `<html>`,
 * `<body>` or doctype — is by construction a thing that gets included into a
 * page; the `<script>` that boots its controller belongs to that page, and no
 * edit to the fragment can satisfy the rule without making the fragment stop
 * being a fragment. Firing here produced 39 findings on Faqir's own reference
 * markup and, worse, reached users: `faqir audit` scans `ui/**`, so a fresh
 * `init` + `add crud-table` reported the framework's own files as broken.
 *
 * The scope is derived from the content (`ParsedDocument.isFullDocument`), never
 * from a path allow-list, so it holds identically for the registry, for a user's
 * server-side partial, and for the docs-site playground — and the moment the
 * same markup is emitted as a real page (the docs example pages, the
 * copy-for-agents payloads, both of which carry the CDN preamble) the rules
 * apply again and must pass.
 */
export const RUNTIME_PRESENCE_RULES = ["controller-loaded", "focus-trap"] as const;

export interface HtmlAuditInput {
  /** Raw HTML source to audit. */
  source: string;
  /** File label used in findings (offsets index into `source`, not this path). */
  file?: string;
  /** Manifests keyed by their `data-ui` name (canonical + aliases). */
  manifests: Map<string, Manifest>;
  /**
   * Component stylesheets, keyed exactly as `manifests` is (task 0.9-05).
   *
   * Optional, and the input the markup+css rules can be decided from:
   * `trigger-contract` needs to know whether the sheet styles a trigger, while
   * `single-fixed-region` resolves fixed anchors across component instances. A
   * component whose stylesheet the caller cannot supply is skipped rather than
   * guessed at. Every caller that has the sheets on hand passes them —
   * `runAudit` from the project's `ui/**`, the registry gate from `registry/**`.
   */
  styles?: Map<string, string>;
  /**
   * Every `data-ui` value **Faqir defines** — each registry component in all
   * three layers, their aliases, and the base-layer values that are styling
   * rather than components (task 1.0R-11). Not the same thing as `manifests`,
   * which is what this caller *holds*: in a project that is the installed
   * subset, in `--stdin` and in a page it is the whole registry.
   *
   * The input `unknown-component` is decided from, and optional for the same
   * reason `styles` is: a caller that cannot produce it does not get a guess.
   * Without it, an unrecognised `data-ui` is skipped exactly as it always was,
   * because the alternative — treating `manifests` as the registry — would
   * report every component the project has not installed yet.
   */
  knownUiValues?: Iterable<string>;
  /**
   * What the page's local modules import (task 1.1F-24): the import specifiers
   * of each `<script type="module">` file and of the relative modules it
   * imports, read by a caller that can reach the disk. `runAudit` follows them
   * two levels deep, inside the project root. They are tested exactly as the
   * page's own `<script>` sources and inline text are, so an `app/main.mjs`
   * that imports `faqir-core.mjs` loads the runtime. A caller holding only a
   * string (`--stdin`, MCP, the playground) omits it and gets inline detection.
   */
  runtimeReferences?: readonly string[];
  /**
   * The recipes the engine bundle carries — the registry's own (task 1.1F-24).
   * A reference to `faqir-core.*` or `@faqir-ui/core` loads these controllers
   * and no others, so a project's custom recipe still needs its own script.
   * Omitted, an engine reference covers every recipe, as it always did.
   */
  engineControllers?: ReadonlySet<string>;
  /**
   * Where the page would load the project's assembled runtime from: the
   * page-relative path to `<output_dir>/core/faqir.js` (task 1.1F-25). Only a
   * caller that knows the page's location and the project can say, so only
   * then does a `controller-loaded` finding carry an `add-script` fix. A
   * string-only caller (`--stdin`, MCP, the playground) omits it and the
   * finding carries no fix.
   */
  runtimeScript?: string;
  /**
   * Directives the project bans in markup — `faqir.config.json` →
   * `audit.forbid_directives` (task 1.1F-27). Each entry is a directive as it
   * would be written (`l-html`, `:src`, `@click`) or its bare name, and the
   * `forbidden-directive` rule fires on every spelling of it. Omitted or empty,
   * the rule finds nothing.
   */
  forbidDirectives?: readonly string[];
  /**
   * Report every undeclared `data-*` inside a known component, not only the
   * near-misses `unknown-attribute` catches — the `undeclared-markup-attribute`
   * rule (task 1.1F-28). The MCP tools' `strict` input. Off by default, because
   * an application's own `data-*` hooks are legitimate markup.
   */
  strict?: boolean;
  /** Rule IDs to skip. */
  skipRules?: string[];
}

/**
 * Audit one HTML source string against in-memory manifests — the shared,
 * **filesystem-free** core behind `faqir audit` (per file), the MCP
 * `faqir_audit_html` tool (per string) and the docs-site playground (in the
 * browser). Runs every HTML-derived rule: the per-component manifest rules
 * ({@link ALL_RULES}), the document-level rules ({@link DOCUMENT_RULES}), and the
 * file-level `controller-loaded` reconciliation. CSS/JS/token/contrast checks are
 * NOT here — they scan on-disk component sources and stay in `runAudit`.
 *
 * Pure: it reads nothing and writes nothing. Unknown `data-ui` names (no manifest
 * in the map) are skipped for per-component rules, exactly as `runAudit` skips
 * not-installed components; document rules still run over the whole source. A
 * caller that also supplies {@link HtmlAuditInput.knownUiValues} gets
 * `unknown-component` on top: the names that are not merely uninstalled but do
 * not exist in the registry at all (task 1.0R-11).
 */
export function auditHtmlSource(input: HtmlAuditInput): AuditResult[] {
  const { source, manifests } = input;
  const file = input.file ?? "input.html";
  const skipRules = new Set(input.skipRules ?? []);

  // One parse decides the scope, and it is the same `isFullDocument` the
  // document rules have always used to tell a page from a fragment. A fragment
  // cannot carry the runtime, so the rules that ask for one do not apply to it
  // (task 0.9-04 — see RUNTIME_PRESENCE_RULES).
  const doc = parseDocument(source, file);
  if (!doc.isFullDocument) for (const id of RUNTIME_PRESENCE_RULES) skipRules.add(id);

  const activeRules = ALL_RULES.filter((r) => !skipRules.has(r.id));
  const activeDocRules = DOCUMENT_RULES.filter((r) => !skipRules.has(r.id));

  const results: AuditResult[] = [];
  // Composition-aware part attribution (task 0.9-04): the manifests decide which
  // enclosing component a `data-part` belongs to, so a pattern's own slot stays
  // its own when it sits inside a nested primitive. See `extractComponents`.
  // A component with no manifest here answers `undefined` — it may well declare
  // the slot, so a part nobody else claims is left with it (task 1.1F-28).
  const components = extractComponents(source, file, (name, slot) => {
    const manifest = manifests.get(name);
    return manifest ? manifest.slots?.[slot] !== undefined : undefined;
  });

  const triggerContract = !skipRules.has(TRIGGER_CONTRACT_RULE.id) && input.styles !== undefined;
  const known = input.knownUiValues !== undefined ? new Set(input.knownUiValues) : undefined;

  for (const component of components) {
    const manifest = manifests.get(component.name);
    if (!manifest) continue; // unknown/not-installed component — skip per-component rules
    for (const rule of activeRules) {
      results.push(...rule.check(component, manifest));
    }
    if (triggerContract) {
      const css = input.styles!.get(component.name);
      if (css !== undefined) results.push(...buildTriggerContractResults(component, css, file));
    }
  }

  // The name nothing else can see (task 1.0R-11). Every rule above is answered
  // by a manifest, so a `data-ui` with none is skipped — deliberately, since a
  // registry component that is simply not installed here must not error. Given
  // the registry's own names, the other case becomes visible: a name that exists
  // nowhere at all.
  if (known !== undefined && !skipRules.has(UNKNOWN_COMPONENT_RULE.id)) {
    results.push(...buildUnknownComponentResults(components, known, manifests, file));
  }

  if (!skipRules.has(SINGLE_FIXED_REGION_RULE.id) && input.styles !== undefined) {
    results.push(...buildSingleFixedRegionResults(components, input.styles, file));
  }

  if (activeDocRules.length > 0) {
    for (const rule of activeDocRules) {
      results.push(...rule.check(doc));
    }
  }

  // The silent-failure rules (W2-2). Document-wide and manifest-aware, which is
  // why they take `doc` + `manifests` rather than being `AuditRule`s: the
  // attributes they check are not all written on a component root or on a part
  // (`data-span` lives on a plain grid CHILD), and a directive attribute is
  // normally on an element carrying no `data-ui` at all.
  results.push(...buildVocabularyResults(doc, manifests, file, skipRules, input.forbidDirectives, input.strict));

  // File-level controller-loaded: replace the generic per-component reminders
  // (emitted by controllerLoadedRule) with the precise "is the script actually
  // referenced?" findings. When every controller is referenced, the generics are
  // simply dropped. Mirrors the reconciliation in runAudit.
  const references = [...pageScriptReferences(doc), ...(input.runtimeReferences ?? [])];
  const missingControllers = () =>
    checkControllersInFile(references, file, components, manifests, input.engineControllers, input.runtimeScript);
  if (!skipRules.has("controller-loaded")) {
    const fileControllerResults = missingControllers();
    const hasGeneric = results.some((r) => r.rule_id === "controller-loaded");
    if (hasGeneric) {
      for (let i = results.length - 1; i >= 0; i--) {
        if (results[i].rule_id === "controller-loaded") results.splice(i, 1);
      }
      results.push(...fileControllerResults);
    }
  }

  // `focus-trap` says "ensure the controller is loaded" — so it is answered by
  // the same file-level check, not asserted unconditionally (task 0.9-04). The
  // per-component rule cannot see the file, so it emits the reminder for every
  // focus-trapping recipe and it was never satisfiable: a page that loads
  // faqir-core.js still got four criticals from a dialog reference. Now it
  // survives only where `controller-loaded` also fires, which is the condition
  // its own message names, and the copy-for-agents payloads — real documents
  // carrying the CDN preamble — are clean under the full rule set because of it.
  if (!skipRules.has("focus-trap") && results.some((r) => r.rule_id === "focus-trap")) {
    const missing = new Set(missingControllers().map((r) => r.component_name));
    for (let i = results.length - 1; i >= 0; i--) {
      if (results[i].rule_id === "focus-trap" && !missing.has(results[i].component_name)) {
        results.splice(i, 1);
      }
    }
  }

  return results;
}

/** Script types the browser runs (an import map is how a module finds the engine). */
const RUNNABLE_SCRIPT_TYPES = new Set([
  "", "module", "importmap", "text/javascript", "application/javascript",
]);

/** One `<script>` the page runs: its `src` and its inline text, either possibly empty. */
export interface PageScript {
  type: string;
  src: string;
  text: string;
}

/**
 * Every script element the page runs, read from the parsed document rather
 * than the raw source (task 1.1F-24) — so a `<script>` inside a comment, or a
 * file name in body copy, is not a loaded runtime.
 */
export function pageScripts(doc: ParsedDocument): PageScript[] {
  const scripts: PageScript[] = [];
  for (const el of doc.elements) {
    if (el.tag !== "script") continue;
    const type = (el.attrs.type ?? "").trim().toLowerCase();
    if (!RUNNABLE_SCRIPT_TYPES.has(type)) continue;
    const close = doc.source.slice(el.tagEnd).search(/<\/script\s*>/i);
    const text = close < 0 ? "" : doc.source.slice(el.tagEnd, el.tagEnd + close);
    scripts.push({ type, src: (el.attrs.src ?? "").trim(), text });
  }
  return scripts;
}

/** The strings a page's scripts reference the runtime by: each `src` and inline body. */
function pageScriptReferences(doc: ParsedDocument): string[] {
  return pageScripts(doc).flatMap((s) => [s.src, s.text].filter((r) => r.trim() !== ""));
}

/**
 * The engine bundle, under every name it ships as: `faqir-core.js`, `.min.js`,
 * `.dev.js` and `.mjs`, and the `@faqir-ui/core` package, bare or by subpath.
 * It carries the registry's recipe controllers (see `engineControllers`).
 */
const ENGINE_REFERENCE = /(?<![\w.-])faqir-core(?:\.min|\.dev)?\.m?js(?![\w.-])|@faqir-ui\/core(?![\w-])/;

/** The project's assembled runtime (`core/faqir.js`), which imports every installed recipe. */
const PROJECT_RUNTIME_REFERENCE = /(?<![\w.-])faqir(?:\.min)?\.js(?![\w.-])/;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Which recipe controllers the page does not load. `references` are the
 * strings it could load them by — each `<script>`'s `src` and inline text, plus
 * whatever the caller read out of the local modules they import — so only what
 * the page runs counts, never prose or a comment that names a file.
 */
export function checkControllersInFile(
  references: readonly string[],
  filePath: string,
  components: ReturnType<typeof extractComponents>,
  manifests: Map<string, Manifest>,
  engineControllers?: ReadonlySet<string>,
  runtimeScript?: string,
): AuditResult[] {
  const results: AuditResult[] = [];
  const recipeComponents = components.filter(c => {
    const m = manifests.get(c.name);
    return m && m.kind === "recipe" && m.files.js;
  });

  if (recipeComponents.length === 0) return results;

  // Lower-cased once: file names were always matched case-insensitively. Each
  // pattern is anchored on a path boundary, so `alert-dialog.js` does not load
  // `dialog.js` and `my-faqir.js` is not the project runtime.
  const refs = references.map((r) => r.toLowerCase());
  const projectRuntime = refs.some((r) => PROJECT_RUNTIME_REFERENCE.test(r));
  const engine = refs.some((r) => ENGINE_REFERENCE.test(r));

  for (const comp of recipeComponents) {
    const manifest = manifests.get(comp.name)!;
    const jsFile = manifest.files.js!;

    // The engine bundle carries the registry's controllers, so it clears a
    // registry recipe and not a project's own (task 1.1F-24); the assembled
    // `faqir.js` imports every installed recipe and clears them all. Otherwise
    // the page has to load the controller file itself.
    const own = new RegExp(`(?<![\\w.-])${escapeRegExp(jsFile.toLowerCase())}(?![\\w.-])`);
    const hasScript = projectRuntime
      || (engine && (engineControllers === undefined || engineControllers.has(manifest.name)))
      || refs.some((r) => own.test(r));

    if (!hasScript) {
      results.push({
        rule_id: "controller-loaded",
        severity: "error",
        component_name: comp.name,
        file: filePath,
        line: comp.line,
        message: `Recipe [data-ui="${comp.name}"] needs its controller "${jsFile}" loaded via script tag or import`,
        // The fix loads the assembled runtime, which imports and starts every
        // installed recipe; a bare controller module only exports its factory
        // and would start nothing (task 1.1F-25). A page that already runs the
        // engine gets no fix: `faqir.js` would load the registry's controllers
        // a second time beside it, so the custom recipe is left to a human.
        ...(runtimeScript && !engine
          ? { fix: { type: "add-script" as const, offset: 0, details: { src: runtimeScript, component: comp.name } } }
          : {}),
      });
    }
  }

  return results;
}
