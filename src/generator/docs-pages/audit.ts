/**
 * Audit rules reference (`audit/index.html`).
 *
 * Every rule on the page is read from the engine's own rule lists, so a rule
 * added to `ALL_RULES`, `DOCUMENT_RULES`, `VOCABULARY_RULES`, `CSS_RULES` or
 * `ANTIPATTERN_RULES` appears here with no edit to the generator. Two rules the
 * checker runs without ever describing (`token-exists`, `reduced-motion`) are
 * declared below as `RuleInfo` so the page documents everything `faqir audit`
 * can actually report — the inventory `faqir audit --rules` prints omits them.
 *
 * Import discipline (see `context.ts`): nothing from `../docs` is used at
 * module top level, because `docs.ts` imports this file.
 */
import {
  ALL_RULES,
  ANTIPATTERN_RULES,
  DOCUMENT_RULES,
  PROJECT_SWEEP_RULES,
  SINGLE_FIXED_REGION_RULE,
  TRIGGER_CONTRACT_RULE,
  UNKNOWN_COMPONENT_RULE,
  getHtmlRuleInventory,
  getRuleInventory,
  type AuditResult,
  type RuleInfo,
  type Severity,
} from "../../audit/rules";
import { VOCABULARY_RULES } from "../../audit/vocabulary";
import { CSS_RULES } from "../../audit/css-rules";
import { CONTRAST_TOKENS_RULE, SURFACE_ELEVATION_RULE } from "../../audit/contrast-tokens";
import { RUNTIME_PRESENCE_RULES, auditHtmlSource } from "../../audit/html-audit";
import { buildAuditReport } from "../../audit/reporter";
import type { Manifest } from "../../manifest";
import { extractComponents } from "../../parser/html-parser";
import { code, esc, escAttr, relUrl, renderShell } from "../docs";
import type { PageContext, SiteFile } from "./context";

export const AUDIT_PAGE = "audit/index.html";

// ── Rules the project sweep decides ─────────────────────────────────────────
//
// `checkTokens` and `checkReducedMotion` in `src/audit/checker.ts` emit findings
// straight from the on-disk sweep. They used to have no `RuleInfo`, so this
// page carried its own descriptors for them while `faqir audit --rules` never
// listed them; the descriptors now live in the engine and are in the inventory.

export const CHECKER_ONLY_RULES: RuleInfo[] = PROJECT_SWEEP_RULES;

// ── Fixes ───────────────────────────────────────────────────────────────────
//
// A rule is auto-fixable when it attaches a `fix` to its finding AND the
// repairer (`src/audit/repairer.ts`, `applyFix`) has a case for that fix type.
// Both halves are read from the code: the emitters live in `rules.ts`,
// `html-audit.ts`, `field-wiring.ts` and `checker.ts`; the appliers are
// `add-attribute`, `add-script`, `rewrite-css`, `rename-id`, `wire-field-group`.

interface FixNote {
  type: string;
  note: string;
}

export const AUTO_FIXES: Record<string, FixNote> = {
  "required-aria": {
    type: "add-attribute",
    note:
      "Inserts the missing role or aria-* attribute on the part. aria-labelledby is " +
      "fixed only when the component has one title carrying an id, and points at it; " +
      "otherwise the finding carries no fix — an empty IDREF is never written.",
  },
  "aria-describedby": {
    type: "add-attribute",
    note:
      "Points the panel's aria-describedby at the description part's id — only when " +
      "there is exactly one description and it carries an id; otherwise no fix is offered.",
  },
  "close-label": {
    type: "add-attribute",
    note: 'Adds aria-label="Close" to the close part.',
  },
  "trigger-contract": {
    type: "add-attribute",
    note: 'Adds data-ui="button" to the unstyled trigger, delegating its styling to the button primitive.',
  },
  "controller-loaded": {
    type: "add-script",
    note:
      "Appends a module <script> for the controller before </body> " +
      "(or at the end of the file when there is no body).",
  },
  "duplicate-id": {
    type: "rename-id",
    note:
      "Renames the later occurrence to a unique suffix — only when nothing in the " +
      "document references the id, so the rename changes no behaviour.",
  },
  "field-wiring": {
    type: "wire-field-group",
    note:
      "Generates the missing ids and wires for, aria-describedby and aria-invalid " +
      "deterministically from the field name and label.",
  },
  "logical-properties": {
    type: "rewrite-css",
    note: "Renames the physical property (or text-align value) on the flagged line. Every mapping is 1:1.",
  },
};

/**
 * Rules whose findings carry a `fix` the repairer cannot apply. The JSON report
 * says `fixable: true` for them; `faqir repair` skips them.
 */
export const UNAPPLIED_FIXES: Record<string, string> = {};

// ── Skip and exemption notes, derived from each rule's check() ──────────────

export const RULE_NOTES: Record<string, string[]> = {
  "required-slot": [
    "A root announcing a declared, non-default data-state (crud-table in data-state=\"empty\") is demonstrating that state and is not asked to be structurally complete.",
    "A slot is filled by a data-part anywhere in the subtree — even one a nested component claims for styling.",
  ],
  "required-aria": [
    "Conditional requirements in the manifest prose (when, unless, if, in … mode, or a semicolon) are not statically checkable and are skipped.",
    "field-group's aria-describedby, aria-invalid and aria-required are left to field-wiring, which implements that contract precisely.",
    "A close part with visible text already has an accessible name; aria-label is not demanded on top of it.",
    "Attribute names are matched case-insensitively; the expected value is read from the manifest's original prose.",
  ],
  "focus-trap": [
    "Only recipes whose manifest sets a11y.focus_trap.",
    "Survives only where controller-loaded also fires for the same component — a page that loads the runtime is clean.",
    `Fragments (no <html>, <body> or doctype) skip it: ${RUNTIME_PRESENCE_RULES.join(" and ")} assert a runtime, which a fragment cannot carry.`,
  ],
  "valid-variant": [
    "A part that carries its own data-ui is judged against its own manifest, not the enclosing component's vocabulary.",
    "Responsive suffixes (data-cols-md) are accepted only on a group marked responsive: true and only for a canon tier; a declared attribute is never read as a suffixed form of a shorter one.",
    "Components declaring no data-variant group are skipped.",
  ],
  "valid-state": ["Root element only; a manifest declaring no states is skipped."],
  "valid-size": ["Skipped when the manifest declares no size variant group."],
  "icon-name": [
    "Runs only for components whose manifest declares a variant on data-icon (the icon primitive). A typo gets a nearest-match hint.",
  ],
  "controller-loaded": [
    "Recipes with files.js only.",
    "Satisfied by any reference to the controller file, or to faqir-core.js, faqir-core.min.js, faqir.js or faqir.min.js. HTML comments are stripped first, so an @ui:controller annotation does not count.",
    "Fragments skip it: a fragment cannot carry the runtime.",
  ],
  "orphan-part": ["Only data-part values the manifest does not name as a slot."],
  "aria-describedby": [
    "Only components whose manifest declares a description slot, and only when the markup fills it.",
  ],
  "close-label": ["Visible text, aria-label or aria-labelledby all count as a name."],
  "no-class-attribute": [
    "Walks every element inside a component root; elements outside any component are not visited by this rule.",
  ],
  "token-aware-style": [
    "Inline style attributes only.",
    "Pixel values are ignored on width, height, their min/max forms, grid-column, top, left, right and bottom, and on any declaration that also reads a var(--token).",
  ],
  "duplicate-id": [
    "Scoped per <template>: ids inside a template do not collide with the page.",
    "A duplicate that is referenced by aria-*, for or a #fragment URL is reported without a fix — a human decides which element the reference meant.",
  ],
  "heading-order": [
    "The first heading sets the baseline and is never flagged; going back up a level is allowed; native h1–h6 only.",
  ],
  landmark: [
    "The main-landmark check applies to full documents only; several <main> elements are not flagged.",
    "A lone <nav> needs no accessible name.",
  ],
  "field-wiring": [
    "Runs over every data-ui=\"field-group\" in the document.",
    "A describedby token is dangling only if no element anywhere in the document carries that id.",
  ],
  "no-important": ["Scans the installed component stylesheets under output_dir."],
  "no-class-selector": ["Scans the installed component stylesheets under output_dir."],
  "no-id-selector": ["Scans the installed component stylesheets under output_dir."],
  "no-hardcoded-values": ["Scans the installed component stylesheets under output_dir."],
  "surface-elevation": [
    "Checks bg → surface-1 → surface-2 and each surface against its border, in both light and dark schemes.",
  ],
};

// ── Groups ──────────────────────────────────────────────────────────────────

export interface RuleGroup {
  id: string;
  title: string;
  lede: string;
  rules: RuleInfo[];
}

function fromChecks(applies: string, rules: { id: string; severity: Severity; description: string }[]): RuleInfo[] {
  return rules.map((r) => ({ id: r.id, severity: r.severity, description: r.description, applies_to: applies }));
}

/** Every rule the engine runs, grouped by what it reads. Order is the page order. */
export function ruleGroups(): RuleGroup[] {
  const cssAntiPatterns = ANTIPATTERN_RULES.filter((r) => r.applies_to === "component CSS");
  const jsAntiPatterns = ANTIPATTERN_RULES.filter((r) => r.applies_to !== "component CSS");
  return [
    {
      id: "component-rules",
      title: "Component markup vs manifest",
      lede:
        "One component at a time: the element carrying data-ui and the parts it owns, " +
        "checked against the manifest of that name. A data-ui with no manifest in hand is skipped.",
      rules: fromChecks("component markup vs manifest", ALL_RULES),
    },
    {
      id: "document-rules",
      title: "Whole document",
      lede:
        "Page-level contracts over the parsed document: ids, the heading outline, landmarks " +
        "and field-group wiring. They run on every HTML source, component or not.",
      rules: fromChecks("HTML document", DOCUMENT_RULES),
    },
    {
      id: "registry-rules",
      title: "Markup vs registry",
      lede:
        "The one rule answered by the registry's name list rather than by a manifest — so it " +
        "can fire for a component nobody has installed.",
      rules: [UNKNOWN_COMPONENT_RULE],
    },
    {
      id: "vocabulary-rules",
      title: "Attribute and directive vocabulary",
      lede:
        "The silent-failure rules. Each catches markup that looks right, renders, and does " +
        "nothing: an invented tier suffix, a value outside its enum, a misspelled directive, a " +
        "part on the wrong element.",
      rules: VOCABULARY_RULES,
    },
    {
      id: "markup-css-rules",
      title: "Markup vs its own stylesheet",
      lede:
        "Rules that need both halves of a component — the authored elements and the sheet " +
        "that styles them. A component whose stylesheet the caller cannot supply is skipped, never guessed at.",
      rules: [TRIGGER_CONTRACT_RULE, SINGLE_FIXED_REGION_RULE],
    },
    {
      id: "stylesheet-rules",
      title: "Component stylesheets",
      lede:
        "Source scans over the installed component CSS under output_dir: the manifest contract, " +
        "the breakpoint canon, the anti-patterns, dangling tokens and reduced motion.",
      rules: [...CSS_RULES, ...cssAntiPatterns, ...CHECKER_ONLY_RULES],
    },
    {
      id: "controller-rules",
      title: "Recipe controllers",
      lede: "Source scans over recipe controller JavaScript. Page-level data loading is out of scope by construction.",
      rules: jsAntiPatterns,
    },
    {
      id: "theme-rules",
      title: "Theme tokens",
      lede:
        "Static colour math over the active theme's token graph — contrast and elevation, " +
        "resolved theme → semantic → palette from oklch values. No browser involved.",
      rules: [CONTRAST_TOKENS_RULE, SURFACE_ELEVATION_RULE],
    },
  ];
}

/** Every rule the page documents: the engine inventory, whole. */
export function documentedRules(): RuleInfo[] {
  return getRuleInventory();
}

// ── Severity presentation ───────────────────────────────────────────────────

export const SEVERITY_ORDER: Severity[] = ["critical", "error", "warning", "info"];

/** Badge variant per severity — every value is in badge's manifest. */
export const SEVERITY_BADGE: Record<Severity, string> = {
  critical: "destructive",
  error: "warning",
  warning: "primary",
  info: "default",
};

// ── The worked example ──────────────────────────────────────────────────────

/**
 * Markup the JSON section audits at build time, so the example finding on the
 * page is produced by the engine and not typed by hand. A dialog whose close
 * button has no accessible name and whose variant is not in the manifest.
 */
export const EXAMPLE_SOURCE = [
  '<div data-ui="dialog" data-variant="huge">',
  '  <div data-part="overlay"></div>',
  '  <div data-part="panel" role="dialog" aria-modal="true" aria-labelledby="delete-title">',
  '    <h2 data-part="title" id="delete-title">Delete file?</h2>',
  '    <div data-part="body">This cannot be undone.</div>',
  '    <button data-part="close" data-ui="button"></button>',
  "  </div>",
  "</div>",
].join("\n");

function manifestMap(ctx: PageContext): Map<string, Manifest> {
  const map = new Map<string, Manifest>();
  for (const c of ctx.components) {
    if (!map.has(c.name)) map.set(c.name, c.manifest);
    for (const alias of c.manifest.aliases ?? []) if (!map.has(alias)) map.set(alias, c.manifest);
  }
  return map;
}

/** The exact JSON `faqir audit --stdin --json` prints for {@link EXAMPLE_SOURCE}. */
export function exampleReport(ctx: PageContext): string {
  const results: AuditResult[] = auditHtmlSource({
    source: EXAMPLE_SOURCE,
    file: "<stdin>",
    manifests: manifestMap(ctx),
  });
  const counts: Record<Severity, number> = { critical: 0, error: 0, warning: 0, info: 0 };
  for (const r of results) counts[r.severity]++;
  const report = buildAuditReport({
    results,
    files_scanned: 1,
    components_found: extractComponents(EXAMPLE_SOURCE, "<stdin>").length,
    counts,
    vendor_counts: { critical: 0, error: 0, warning: 0, info: 0 },
    passed: counts.critical === 0 && counts.error === 0,
  });
  return JSON.stringify(report, null, 2);
}

// ── Rendering ───────────────────────────────────────────────────────────────

export function renderAuditPages(ctx: PageContext): SiteFile[] {
  return [{ path: AUDIT_PAGE, content: renderAuditPage(ctx) }];
}

function renderAuditPage(ctx: PageContext): string {
  const groups = ruleGroups();
  const all = documentedRules();
  const html = new Set(getHtmlRuleInventory().map((r) => r.id));
  const inventory = new Set(getRuleInventory().map((r) => r.id));
  const htmlCount = all.filter((r) => html.has(r.id)).length;
  const severities = new Set(all.map((r) => r.severity)).size;
  const fixable = all.filter((r) => r.id in AUTO_FIXES).length;
  const u = (to: string) => escAttr(relUrl(AUDIT_PAGE, to));

  const badge = (severity: Severity) =>
    `<span data-ui="badge" data-variant="${escAttr(SEVERITY_BADGE[severity])}">${esc(severity)}</span>`;

  const stat = (label: string, value: string, change: string) =>
    `          <div data-ui="stat" data-variant="card" aria-label="${escAttr(`${value} ${label}`)}">` +
    `<span data-part="label">${esc(label)}</span><span data-part="value">${esc(value)}</span>` +
    `<span data-part="change">${esc(change)}</span></div>`;

  const stats =
    `      <section aria-label="Audit rule statistics" data-docs-audit-stats>\n` +
    `        <div data-ui="grid" data-cols="2" data-cols-lg="4" data-gap="3">\n` +
    stat("Rules", String(all.length), `${inventory.size} in faqir audit --rules`) + "\n" +
    stat("Run on HTML", String(htmlCount), "CLI, MCP and the playground") + "\n" +
    stat("CLI only", String(all.length - htmlCount), "stylesheets, controllers, tokens") + "\n" +
    stat("Severities", String(severities), SEVERITY_ORDER.join(" · ")) + "\n" +
    `        </div>\n` +
    `      </section>\n`;

  const toc =
    `      <nav aria-label="On this page" data-docs-toc data-docs-audit-toc>\n        <ul>\n` +
    [...groups.map((g) => [g.id, g.title]), ["how-to-run", "How to run it"]]
      .map(([id, title]) => `          <li><a data-ui="link" href="#${escAttr(id)}">${esc(title)}</a></li>`)
      .join("\n") +
    `\n        </ul>\n      </nav>\n`;

  const ruleCard = (r: RuleInfo): string => {
    const fix = AUTO_FIXES[r.id];
    const unapplied = UNAPPLIED_FIXES[r.id];
    const notes = [...(r.exempt ?? []), ...(RULE_NOTES[r.id] ?? [])];
    const meta: [string, string][] = [
      ["Applies to", esc(r.applies_to)],
      ["Repair", fix ? `yes · ${code(fix.type)}` : unapplied ? "reported, not applied" : "no"],
      ["Playground", html.has(r.id) ? "yes" : "CLI only"],
    ];
    return (
      `      <article id="${escAttr(r.id)}" data-docs-rule data-docs-rule-severity="${escAttr(r.severity)}">\n` +
      `        <div data-docs-rule-head>\n` +
      `          <h3><span data-ui="text" data-variant="mono">${esc(r.id)}</span></h3>\n` +
      `          ${badge(r.severity)}\n` +
      `          <dl data-ui="description-list" data-variant="vertical" data-size="sm">\n` +
      meta
        .map(
          ([term, details]) =>
            `            <dt data-part="term">${esc(term)}</dt><dd data-part="details">${details}</dd>`,
        )
        .join("\n") +
      `\n          </dl>\n` +
      `        </div>\n` +
      `        <div data-docs-rule-body>\n` +
      `          <p>${esc(r.description)}</p>\n` +
      (notes.length > 0
        ? `          <p data-docs-rule-label>Skips and exemptions</p>\n          <ul>\n` +
          notes.map((n) => `            <li>${esc(n)}</li>`).join("\n") +
          `\n          </ul>\n`
        : "") +
      (fix ? `          <p data-docs-rule-label>Repair</p>\n          <p>${esc(fix.note)}</p>\n` : "") +
      (unapplied ? `          <p data-docs-rule-label>Repair</p>\n          <p>${esc(unapplied)}</p>\n` : "") +
      `        </div>\n` +
      `      </article>\n`
    );
  };

  const groupSections = groups
    .map(
      (g) =>
        `      <h2 id="${escAttr(g.id)}">${esc(g.title)}</h2>\n` +
        `      <p>${esc(g.lede)}</p>\n` +
        `      <div data-docs-rule-list>\n` +
        g.rules.map(ruleCard).join("") +
        `      </div>\n`,
    )
    .join("");

  const pre = (text: string) => `      <pre tabindex="0"><code>${esc(text)}</code></pre>\n`;

  const cli = [
    "faqir audit                                  # scan the project (needs faqir.config.json)",
    "faqir audit --file src/checkout.html         # one file",
    "faqir audit --json                           # machine-readable report",
    "faqir audit --rules                          # print the rule inventory (--json for the JSON form)",
    "faqir audit --skip-rules unknown-component   # silence rule ids (comma- or space-separated)",
    "faqir audit --strict                         # findings in the installed tree also gate the exit code",
    "faqir audit --fix                            # same as faqir repair",
    "cat page.html | faqir audit --stdin --json   # no project: audits against the bundled registry",
  ].join("\n");

  const howToRun =
    `      <h2 id="how-to-run">How to run it</h2>\n` +
    `      <p>One engine, four doors. The CLI scans a project or a piped string, the MCP server ` +
    `audits a string for an agent, and the playground audits a textarea in the browser. All three ` +
    `call the same function on the same manifests, so a finding is the same finding everywhere.</p>\n` +
    `      <h3 id="cli">Command line</h3>\n` +
    pre(cli) +
    `      <p>Without <code>--stdin</code> the command needs a <code>faqir.config.json</code> and walks every ` +
    `HTML file in the project except <code>node_modules</code> and <code>.faqir</code>, auditing each against ` +
    `the installed manifests and stylesheets. It then scans the installed component CSS and recipe ` +
    `controllers and checks the active theme's tokens.</p>\n` +
    `      <p>The exit code is non-zero only when a critical or error finding lands in a file the project ` +
    `authored. Findings inside the installed tree (<code>output_dir</code>, usually <code>ui/</code>) are ` +
    `reported under <code>vendor_counts</code> and excluded from that decision unless you pass <code>--strict</code>. ` +
    `With <code>--stdin</code> nothing is vendor: whatever is piped in is yours.</p>\n` +
    `      <h3 id="json-shape">The JSON report</h3>\n` +
    `      <p><code>--json</code> prints one object: a schema version, the pass verdict, file and component ` +
    `counts, severity counts for authored and vendor findings, and one result per finding. Each result ` +
    `names its rule, severity, component, file and line, adds a column where the rule can pin one, ` +
    `and says whether <code>faqir repair</code> can fix it. This is the report the engine produced for ` +
    `the markup below when this page was built.</p>\n` +
    pre(EXAMPLE_SOURCE) +
    pre(exampleReport(ctx)) +
    `      <h3 id="repair">Repair</h3>\n` +
    pre("faqir repair            # apply every fix the audit attached\nfaqir repair --dry-run  # list what would change, write nothing") +
    `      <p><code>faqir repair</code> runs the audit, applies every attached fix file by file, then runs ` +
    `the audit again and lists the critical and error findings that remain. Offset-sensitive fixes ` +
    `(id renames, field-group wiring) are applied highest offset first so earlier edits never shift later ` +
    `ones; a fix whose target already carries the attribute is skipped and counted. ` +
    `${fixable} rules attach a fix the repairer can apply; each rule card above says which.</p>\n` +
    `      <h3 id="conform">Conform</h3>\n` +
    pre("faqir conform                       # rewrite installed components and project HTML in place\nfaqir conform --dry-run             # show what would change\nfaqir conform --include 'src/**/*.html' --exclude 'src/legacy/**'") +
    `      <p><code>faqir conform</code> is not an audit. It normalises markup to the canonical shape: attributes ` +
    `on any element carrying one of the five protocol attributes are reordered (<code>data-ui</code>, ` +
    `<code>data-part</code>, <code>data-state</code>, <code>data-variant</code>, <code>data-size</code>, then ` +
    `roles and ARIA, then id, class and the rest), and each installed component file gets its machine ` +
    `comments (<code>@ui:component</code>, <code>@ui:kind</code>, <code>@ui:slots</code>, <code>@ui:variants</code>, ` +
    `<code>@ui:controller</code>, <code>@ui:tokens</code>). Attribute values keep their original quoting, so ` +
    `the rewrite round-trips byte for byte when nothing needs moving. Installed component files are always ` +
    `processed; <code>--include</code> and <code>--exclude</code> filter the project-wide scan only.</p>\n` +
    `      <h3 id="mcp">MCP tools</h3>\n` +
    `      <p>The Faqir MCP server exposes the same engine as two tools. ` +
    `<code>faqir_audit_html</code> takes <code>html</code> and optional <code>skip_rules</code> and returns ` +
    `<code>passed</code>, <code>counts</code> and <code>findings</code> (rule id, severity, component, line, ` +
    `optional column, message, fixable). <code>faqir_repair_html</code> takes the same input and returns the ` +
    `repaired <code>html</code>, <code>applied</code> and <code>skipped</code> counts, a <code>changes</code> ` +
    `log and the <code>before</code> and <code>after</code> reports. Both work on strings: an agent without a ` +
    `disk can validate its own output.</p>\n` +
    `      <h3 id="playground">Browser playground</h3>\n` +
    `      <p>The <a data-ui="link" href="${u("playground/index.html")}">playground</a> bundles the HTML half of ` +
    `the engine and audits as you type. It holds manifests but no stylesheets, so the rule cards marked ` +
    `“CLI only” do not run there; every other rule reports exactly what the CLI would.</p>\n`;

  const body =
    `      <h1>Audit rules</h1>\n` +
    `      <p data-docs-audit-lede>The auditor is one engine shared by <code>faqir audit</code>, the MCP server and the browser ` +
    `playground. It reads a source string, checks it against the manifests it is handed, and emits ` +
    `versioned JSON. It is deterministic: the same input against the same manifests produces the same ` +
    `findings, in the same order, anywhere it runs. Every rule below is read from the engine's own rule lists.</p>\n` +
    toc +
    stats +
    groupSections +
    howToRun;

  return renderShell({
    pagePath: AUDIT_PAGE,
    title: "Audit rules · Faqir UI",
    description: "Every rule faqir audit runs — severity, scope, exemptions, repairs — and how to run the engine from the CLI, MCP or the browser.",
    body,
    config: ctx.config,
    components: ctx.components,
    themes: ctx.themes,
    current: AUDIT_PAGE,
    layout: "reference",
    scripts: [],
  });
}
