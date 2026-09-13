/**
 * Tooling section of the docs site: the CLI reference and the integrations
 * page (MCP server, framework bindings, CDN, ESM exports, the Claude Code
 * skill, and the package family).
 *
 * Every table on these two pages is read off a source of truth at build time:
 * the command registry, the live MCP server's registrations, the package
 * manifests, the ESM entry, the shipped skill, the CDN pin. The only authored
 * text is the per-command flag glosses, which mirror each command's own
 * `--help` table — and a command the registry knows but this file does not
 * still renders (usage + summary from the registry), so a new command can
 * never be missing from the reference.
 *
 * Import rule: nothing from `../docs` at module top level (import cycle).
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  COMMAND_CATEGORIES,
  COMMAND_DEFINITIONS,
  COMMAND_NAMES,
  commandsInCategory,
  type CommandCategory,
} from "../../command-registry";
import { SCAFFOLDS } from "../../scaffolds/registry";
import { SEED_FLAGS } from "../../theme/seed";
import { THEME_AXIS_VALUES } from "../../theme-manifest";
import { FONT_CATALOG } from "../../fonts/catalog";
import { ROLE_ORDER, ROLE_TOKENS } from "../../fonts/install";
import { LINT_RULES } from "../../../packages/rules/src/index.js";
import { createFaqirMcpServer } from "../../../packages/mcp/src/server";
import { ALIAS_REF, REPO_URL } from "../../canonical";
import { JSON_ENVELOPE_VERSION } from "../../utils/json-output";
import { OVERLAY_ROUTE, OVERLAY_SHORTCUT } from "../../dev/overlay";
import {
  PACKAGE_ROOT,
  esc,
  escAttr,
  relUrl,
  renderCdnPreamble,
  renderShell,
  section,
  slug,
  table,
} from "../docs";
import type { PageContext, SiteFile } from "./context";

export const CLI_PAGE = "cli/index.html";
export const INTEGRATIONS_PAGE = "integrations/index.html";

/** The npm package the CLI is published as (root `package.json`). */
const CLI_PACKAGE = "faqir-ui-cli";

/** The publishable packages, in the order the family table lists them. */
const PACKAGE_DIRS = ["core", "forms", "mcp", "react", "rules", "vue"] as const;

// ---------------------------------------------------------------------------
// Command documentation — the flags each handler actually parses
// ---------------------------------------------------------------------------

type Row = [string, string];

interface CommandDoc {
  /** Usage lines shown in the mono bar; defaults to `faqir <name> <args>`. */
  usage?: string[];
  /** Sub-commands, for the commands that dispatch on their first word. */
  subcommands?: Row[];
  /** Flags the handler parses, with the gloss its `--help` prints. */
  flags?: Row[];
  /** Short notes: defaults, side effects, what the command writes. */
  notes?: string[];
  /** Example invocations. */
  examples?: string[];
  /** Extra generated rows appended after the flags (axes, roles, …). */
  extra?: (() => string) | undefined;
}

/** `--<flag> <value>` rows for every seed axis, read off the seed flag table. */
function axisFlagRows(): Row[] {
  const vocabulary = THEME_AXIS_VALUES as Record<string, readonly (string | number)[] | undefined>;
  return Object.entries(SEED_FLAGS)
    .filter(([flag]) => flag !== "accent")
    .map(([flag, path]): Row => [
      `--${flag} <value>`,
      `${path}: ${(vocabulary[path] ?? []).join(", ")}`,
    ]);
}

function fontRoleRows(): Row[] {
  return ROLE_ORDER.map((role): Row => [role, `sets ${ROLE_TOKENS[role]}`]);
}

const LINT_RULE_GLOSS: Record<string, string> = {
  schema: "The definition does not match rules.schema.json",
  "rule-verb": "A rule with zero or two verbs",
  "rule-ops": "An unsupported operator, a bad arity, a malformed node",
  "rule-refs": "A path — a target or a var — that names no field",
  "rule-cycles": "compute rules that depend on each other in a cycle",
  "rule-unreachable": "A when (or a validate) that is constant after folding",
  "rule-messages": "A message key that addresses nothing, or a locale gap",
};

const CONTEXT_FORMATS: Row[] = [
  ["json", ".faqir/context.json (default)"],
  ["md", ".faqir/context.md — Markdown for LLM prompts"],
  ["cursorrules", ".cursorrules — Cursor IDE rules format"],
  ["llms", "llms.txt + llms-full.txt (llmstxt.org convention)"],
];

const COMMAND_DOCS: Record<string, CommandDoc> = {
  init: {
    flags: [
      ["--theme <name>", "Apply a theme during init (default: 'default')"],
      ["--tokens-split", "Keep token files separate instead of single index.css"],
      ["--no-core", "Skip core JS modules (for static-only projects)"],
      ["--dir <path>", "Output to a custom directory (default: './ui')"],
      ["--force, -f", "Reinitialize even if faqir.config.json exists"],
    ],
    notes: ["Writes faqir.config.json and the output directory with tokens, base styles and the core engine."],
    examples: ["faqir init", "faqir init --theme midnight --dir assets/ui"],
  },
  doctor: {
    flags: [["--json", "Machine-readable check results"]],
    notes: ["Exit code 1 when any check fails."],
  },
  add: {
    usage: [
      "faqir add <component...>",
      "faqir add icons [--only <names>] [--dry-run]",
      "faqir add @scope/name",
    ],
    flags: [
      ["--all", "Add all components"],
      ["--layer <name>", "Add all from a layer (primitives|recipes|patterns)"],
      ["--registry <url>", "Fetch from a remote registry (SHA-256 verified)"],
      ["--dry-run", "Show what would be added without writing"],
      ["--no-deps", "Don't auto-install dependencies"],
      ["--only <names>", "icons only: comma-separated icon names to include (repeatable)"],
    ],
    notes: [
      "Resolves dependencies and aliases; a pristine copy is kept under .faqir/pristine/ for diff and upgrade.",
      "--all and --layer require an explicit --registry <url>.",
      "Scoped names like @scope/name resolve through the 'registries' map in faqir.config.json.",
      "Re-running add icons --only with a different set merges the new glyphs into the installed subset.",
    ],
    examples: [
      "faqir add button card dialog",
      "faqir add icons --only check,x,chevron-down",
      "faqir add button --registry https://ui.example.com/registry",
    ],
  },
  remove: {
    flags: [
      ["--force", "Remove even if other components depend on it"],
      ["--dry-run", "Show what would be removed without deleting"],
    ],
    examples: ["faqir remove dialog toast", "faqir remove button --force"],
  },
  upgrade: {
    flags: [
      ["--dry-run", "Report the merge (and any conflicts) without writing"],
      ["--json", "Emit a stable JSON report instead of the human summary"],
    ],
    notes: [
      "Three-way merge between the pristine copy, your edits and the registry's latest; conflicts are written with standard git markers.",
      "Exit code 2 means the upgrade wrote conflict markers to resolve. Nothing is dropped by a merge.",
    ],
    examples: ["faqir upgrade", "faqir upgrade button --dry-run"],
  },
  list: { notes: ["Lists installed components against the registry inventory."] },
  search: { examples: ["faqir search overlay"] },
  create: {
    flags: [
      ["--kind <type>", "Component kind: primitive, recipe or pattern (required)"],
      ["--category <name>", "Component category (default: 'custom')"],
    ],
    notes: ["Scaffolds a manifest, CSS, HTML and (for recipes) a controller under the output directory."],
    examples: ["faqir create my-widget --kind primitive", "faqir create data-grid --kind recipe"],
  },
  inspect: {
    flags: [["--json", "Output raw manifest JSON"]],
  },
  diff: {
    flags: [["--json", "Emit a stable JSON drift summary instead of a unified diff"]],
    notes: ["The pristine baseline is captured on faqir add under .faqir/pristine/."],
    examples: ["faqir diff", "faqir diff button --json"],
  },
  audit: {
    usage: ["faqir audit [--json] [--skip-rules <ids>] [--fix] [--file <path>] [--strict] [--stdin] [--rules]"],
    flags: [
      ["--stdin", "Audit HTML read from stdin — no project required"],
      ["--rules", "List the rule inventory instead of auditing"],
      ["--skip-rules <ids>", "Comma-separated rule IDs to skip"],
      ["--file <path>", "Audit one file instead of the whole project"],
      ["--strict", "Fail on findings in ui/ too — the framework's own installed files"],
      ["--fix", "Apply the deterministic fixes (same as faqir repair)"],
      ["--json", "Machine-readable output"],
    ],
    notes: [
      "Findings are split into authored and vendor files; only authored errors fail the run unless --strict.",
      "Exit code 1 when the audit does not pass.",
    ],
    examples: ["faqir audit", "faqir audit --skip-rules no-class-attribute --json", "faqir audit --rules"],
  },
  rules: {
    usage: ["faqir rules lint <def.json> [--locales <a,b>] [--json]", "faqir rules lint --stdin"],
    subcommands: [["lint", "Lint a form-rules definition before anything runs it"]],
    flags: [
      ["--stdin", "Read the definition from stdin instead of a file"],
      ["--locales <a,b>", "Locales that must be complete, e.g. --locales en,ro"],
      ["--json", "Machine-readable output"],
    ],
    notes: ["Exit code 1 on any lint error."],
    extra: () =>
      subTable(
        "Lint rules",
        ["Id", "Reports"],
        LINT_RULES.map((id): Row => [id, LINT_RULE_GLOSS[id] ?? ""]),
      ),
  },
  repair: {
    flags: [
      ["--dry-run", "Show what would be fixed without writing"],
      ["--json", "Machine-readable output"],
    ],
    notes: ["Applies the deterministic fixes the audit knows how to make: missing ARIA, safe duplicate-id renames, controller scripts, field-group wiring."],
  },
  trace: { flags: [["--json", "Output as structured JSON"]] },
  conform: {
    flags: [
      ["--dry-run", "Show what would change without writing"],
      ["--include <glob>", "Only scan project files matching this glob (repeatable; default **/*.html)"],
      ["--exclude <glob>", "Skip project files matching this glob (repeatable; adds to the defaults)"],
    ],
    notes: [
      "Reorders attributes to canonical order (data-ui, data-part, data-state, …) and ensures machine comments are present.",
      "Installed component files under output_dir are always processed; --include/--exclude filter the project-wide scan only.",
    ],
  },
  context: {
    flags: [
      ["--format <fmt>", "json (default), md, cursorrules or llms"],
      ["--skill", "Also generate .faqir/SKILL.md"],
      ["--stdout", "Print to stdout instead of writing file"],
      ["--json", "Print command metadata (formats + outputs) as JSON"],
    ],
    extra: () => subTable("Formats", ["Format", "Writes"], CONTEXT_FORMATS),
    examples: ["faqir context", "faqir context --format llms", "faqir context --skill"],
  },
  explain: { flags: [["--json", "Output as structured JSON"]] },
  theme: {
    usage: [
      "faqir theme set <name>",
      "faqir theme list",
      "faqir theme create <name>",
      "faqir theme generate <name> --accent <color> [--seed <file>] [axis flags]",
      "faqir theme bundle <name> --scope[=<selector>] [--out <dir>]",
    ],
    subcommands: [
      ["set <name>", "Switch the active theme"],
      ["create <name>", "Scaffold a new custom theme"],
      ["generate <name>", "Generate a complete theme from one brand color"],
      ["bundle <name>", "Emit a theme scoped to a subtree (data-skin)"],
      ["list", "Show available and active themes"],
    ],
    flags: [
      ["--accent <color>", "generate: opaque oklch(), #rgb, or #rrggbb brand color (required)"],
      ["--seed <file>", "generate: a .seed.json to start from; individual flags override it"],
      ["--out <dir>", "generate: directory to write into (default: themes); bundle: default is the project's output dir"],
      ["--document", "generate: also emit a brand-matched print/document variant"],
      ["--radius <size>", "generate: 1.0 compatibility flag for --shape: sm, md, or lg"],
      ["--legacy-blocks", "generate: dual themes write three colour blocks instead of one light-dark() block"],
      ["--allow-similar", "generate: write even when a theme in --out is too close on axes / ΔE"],
      ["--scope [selector]", 'bundle: required; defaults to [data-skin="<name>"]'],
      ["--json", "generate: the full scorecard; bundle: the rewrite report"],
    ],
    notes: [
      "generate writes <out>/<name>.css, .theme.json, .seed.json and .preview.html after in-memory contrast, elevation, token-parity and axes round-trip checks.",
      "Theme names must be lowercase kebab-case. A bundle selector that is a bare word must use the --scope=<selector> form.",
    ],
    extra: () =>
      subTable(
        "Axis flags for generate (each optional; an unstated axis takes its default)",
        ["Flag", "Axis and allowed values"],
        axisFlagRows(),
      ),
    examples: [
      "faqir theme set midnight",
      'faqir theme generate my-brand --accent "oklch(0.55 0.2 150)" --type serif-editorial --depth glass',
      "faqir theme bundle aurora --scope",
    ],
  },
  fonts: {
    usage: ["faqir fonts list", "faqir fonts add <family> [--role <role>]...", "faqir fonts remove <family>"],
    subcommands: [
      ["list", "Show the curated catalog with roles, classes and sizes"],
      ["add <family> [--role <r>]", "Download, verify and install a family"],
      ["remove <family>", "Remove a family and its files"],
    ],
    flags: [
      ["--role <role>", "Point the family at a role token (repeatable; default: its first catalogued role)"],
      ["--json", "Machine-readable output"],
    ],
    notes: [
      `The catalog holds ${FONT_CATALOG.length} OFL families, pinned to versioned files with a SHA-256 per file; every file is verified before anything is written.`,
      "A role has exactly one family, so assigning one takes it off whoever held it. No Google Fonts link: the WOFF2 files are served by your project.",
    ],
    extra: () => subTable("Roles", ["Role", "Token"], fontRoleRows()),
    examples: ["faqir fonts add fraunces --role heading", "faqir fonts add inter --role body --role ui"],
  },
  variant: {
    usage: ["faqir variant add <component> <group>=<value>", "faqir variant remove <component> <group>=<value>"],
    subcommands: [
      ["add", "Add a variant value to the manifest and its CSS together"],
      ["remove", "Remove a variant value from the manifest (CSS rules are left for you)"],
    ],
    examples: ["faqir variant add button visual=ghost"],
  },
  scaffold: {
    usage: ["faqir scaffold <name> [--output <path>] [--theme <name>] [--no-add]"],
    flags: [
      ["--output <path>", "Output file path (default: ./<name>.html)"],
      ["--theme <name>", "Theme to apply (invoice/report default: 'document')"],
      ["--no-add", "Don't auto-install missing components"],
    ],
    extra: () =>
      subTable(
        "Scaffolds",
        ["Name", "Composed from", "Description"],
        Object.values(SCAFFOLDS).map((s): [string, string, string] => [
          s.name,
          s.patterns.join(", "),
          s.description + (s.defaultTheme ? ` (theme: ${s.defaultTheme})` : ""),
        ]),
      ),
    examples: ["faqir scaffold landing-page", "faqir scaffold invoice --output billing/invoice.html"],
  },
  bundle: {
    flags: [
      ["--output <path>", "Output file path (default: {output_dir}/faqir.bundle.css)"],
      ["--js", "Bundle faqir-core plus official plugins into faqir.bundle.js"],
      ["--minify", "Strip comments and whitespace (CSS only)"],
      ["--watch", "Re-bundle on CSS file changes"],
      ["--dry-run", "Show what would be bundled without writing"],
    ],
    examples: ["faqir bundle --minify", "faqir bundle --js"],
  },
  dev: {
    usage: ["faqir dev [--port <n>] [--dir <path>] [--host <addr>] [--open] [--bundle] [--no-overlay]"],
    flags: [
      ["--port <number>", "Port to listen on (default: 3000)"],
      ["--dir <path>", "Directory to serve (default: '.')"],
      ["--host <addr>", "Address to bind (default: 127.0.0.1; use 0.0.0.0 to expose on the network)"],
      ["--open", "Open browser automatically"],
      ["--bundle", "Auto-rebuild CSS bundle on file changes"],
      ["--no-overlay", "Do not inject the inspector overlay into served HTML"],
      ["--json", "Describe the server it would start, without listening"],
    ],
    notes: [
      `The inspector overlay is served at ${OVERLAY_ROUTE} and toggled with ${OVERLAY_SHORTCUT}.`,
      "Binds loopback by default; percent-decoded paths are checked against the served root.",
    ],
  },
  bindings: {
    usage: ["faqir bindings vue|react [--out <dir>] [--check]"],
    subcommands: [
      ["vue", "Vue 3 components into packages/vue/src/"],
      ["react", "React components into packages/react/src/"],
    ],
    flags: [
      ["--out <dir>", "Output directory (default: packages/<target>/src next to the registry)"],
      ["--check", "Verify generated files match a fresh regeneration (drift guard)"],
      ["--json", "Machine-readable output"],
    ],
    notes: ["--check exits 1 when any generated file differs from a fresh regeneration."],
  },
};

/** Command files that emit a bespoke `--json` document, mapped to the command they serve. */
const COMMAND_FILE_ALIASES: Record<string, string> = {
  "theme-generate": "theme",
  icons: "add",
};

/** Commands whose handler calls `emitJSON` — read off the source, not asserted. */
function bespokeJsonCommands(packageRoot: string): string[] {
  const dir = join(packageRoot, "src", "commands");
  if (!existsSync(dir)) return [];
  const out = new Set<string>();
  for (const entry of readdirSync(dir).sort()) {
    if (!entry.endsWith(".ts")) continue;
    const base = entry.slice(0, -3);
    const name = COMMAND_FILE_ALIASES[base] ?? base;
    if (!COMMAND_NAMES.includes(name)) continue;
    if (readFileSync(join(dir, entry), "utf8").includes("emitJSON(")) out.add(name);
  }
  return [...out].sort();
}

// ---------------------------------------------------------------------------
// Shared HTML bits (helpers from ../docs are only imported inside functions)
// ---------------------------------------------------------------------------

function code(value: string): string {
  return `<code>${esc(value)}</code>`;
}

function pre(text: string): string {
  return `<pre tabindex="0"><code>${esc(text)}</code></pre>`;
}

/** A captioned table; the first `codeCols` columns render as code, the rest as prose. */
function subTable(caption: string, headers: string[], rows: string[][], codeCols = 1): string {
  const mixed = rows.map((r) => r.map((c, j) => (j < codeCols ? code(c) : esc(c))));
  return (
    `<div data-docs-tooling-subtable>\n` +
    `<p data-docs-tooling-caption><span data-ui="text" data-variant="subtle" data-size="sm">${esc(caption)}</span></p>\n` +
    table(headers, mixed, "None.") +
    `\n</div>`
  );
}

function toc(entries: [string, string][]): string {
  return (
    `<nav aria-label="On this page" data-docs-toc data-docs-tooling-toc>\n<ul>\n` +
    entries.map(([id, label]) => `<li><a data-ui="link" href="#${escAttr(id)}">${esc(label)}</a></li>`).join("\n") +
    `\n</ul>\n</nav>`
  );
}

function categoryId(category: CommandCategory): string {
  return `cat-${slug(category)}`;
}

// ---------------------------------------------------------------------------
// CLI reference
// ---------------------------------------------------------------------------

function renderCommand(name: string): string {
  const def = COMMAND_DEFINITIONS[name]!;
  const doc = COMMAND_DOCS[name] ?? {};
  const usage = doc.usage ?? [`faqir ${name}${def.args ? ` ${def.args}` : ""}`];
  const parts: string[] = [];

  parts.push(`<article id="cmd-${escAttr(name)}" data-docs-cmd>`);
  parts.push(`<h3 id="cmd-${escAttr(name)}-title">faqir ${esc(name)}</h3>`);
  parts.push(`<p>${esc(def.summary)}.</p>`);
  parts.push(`<pre tabindex="0" data-docs-tooling-usage><code>${esc(usage.join("\n"))}</code></pre>`);

  if (doc.subcommands?.length) {
    parts.push(
      subTable("Subcommands", ["Subcommand", "Does"], doc.subcommands),
    );
  }
  if (doc.flags?.length) {
    parts.push(subTable("Options", ["Flag", "Effect"], doc.flags));
  } else {
    parts.push(
      `<p data-docs-tooling-noflags><span data-ui="text" data-variant="subtle" data-size="sm">No options beyond --json and --help.</span></p>`,
    );
  }
  if (doc.extra) parts.push(doc.extra());
  if (doc.notes?.length) {
    parts.push(`<ul data-docs-tooling-notes>${doc.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>`);
  }
  if (doc.examples?.length) {
    parts.push(pre(doc.examples.join("\n")));
  }
  parts.push(`</article>`);
  return parts.join("\n");
}

function renderQuickStart(): string {
  const steps: [string, string, string][] = [
    ["Install", `npm install -g ${CLI_PACKAGE}`, "One global binary; runs on Bun or plain Node."],
    ["Initialise", "faqir init", "Writes faqir.config.json, the tokens, the base layer and the engine."],
    ["Add components", "faqir add button card dialog", "Copies each component and its dependencies into your project."],
    ["Serve", "faqir dev", "Live reload with the inspector overlay on loopback."],
  ];
  return (
    `<div data-ui="grid" data-cols="1" data-cols-md="2" data-cols-lg="4" data-gap="4" data-docs-tooling-quickstart>\n` +
    steps
      .map(
        ([title, cmd, blurb], i) =>
          `<div data-ui="card" data-variant="outlined">\n` +
          `<div data-part="header"><span data-ui="badge" data-variant="primary" data-size="sm">${i + 1}</span> <h3 data-part="title">${esc(title)}</h3></div>\n` +
          `<div data-part="body">${pre(cmd)}<p><span data-ui="text" data-variant="muted" data-size="sm">${esc(blurb)}</span></p></div>\n` +
          `</div>`,
      )
      .join("\n") +
    `\n</div>`
  );
}

function renderCommandNav(): string {
  const groups = COMMAND_CATEGORIES.map((category) => ({
    category,
    commands: commandsInCategory(category),
  })).filter((g) => g.commands.length > 0);
  return (
    `<nav aria-label="Commands by category" data-docs-tooling-cmdnav>\n` +
    groups
      .map(
        (g) =>
          `<div data-docs-tooling-cmdnav-group>\n` +
          `<a data-ui="link" href="#${escAttr(categoryId(g.category))}">${esc(g.category)}</a> ` +
          `<span data-ui="badge" data-size="sm">${g.commands.length}</span>\n` +
          `<div data-ui="cluster" data-gap="1">` +
          g.commands
            .map(([name]) => `<a data-ui="link" href="#cmd-${escAttr(name)}"><span data-ui="text" data-variant="mono" data-size="sm">${esc(name)}</span></a>`)
            .join(" ") +
          `</div>\n</div>`,
      )
      .join("\n") +
    `\n</nav>`
  );
}

function renderJsonSection(ctx: PageContext): string {
  const bespoke = bespokeJsonCommands(ctx.packageRoot);
  const envelope = {
    json_schema_version: JSON_ENVELOPE_VERSION,
    command: "add",
    ok: false,
    exit_code: 1,
    messages: [{ level: "error", text: "Unknown component: buton" }],
    error: { message: "Unknown component: buton" },
  };
  return (
    `<p>Every command accepts ${code("--json")}. In that mode stdout is exactly one JSON document, on success and on failure alike. ` +
    `Commands with a stable schema of their own emit it directly; every other command has its console output captured into a generic envelope, flushed once on exit.</p>\n` +
    pre(JSON.stringify(envelope, null, 2)) +
    `\n<p>Commands with a bespoke document (their handler calls the JSON emitter): ` +
    bespoke.map((n) => `<a data-ui="link" href="#cmd-${n}"><span data-ui="text" data-variant="mono">${esc(n)}</span></a>`).join(", ") +
    `. Everything else returns the envelope above.</p>`
  );
}

function renderExitCodes(): string {
  const rows: Row[] = [
    ["0", "Success. For audit: no authored error or critical finding (no finding at all with --strict)."],
    ["1", "Unknown command, a handler error, an audit that does not pass, a rules lint error, a doctor check that fails, or bindings --check drift."],
    ["2", "upgrade completed but wrote git conflict markers for you to resolve."],
  ];
  return table(
    ["Code", "Meaning"],
    rows.map(([c, m]) => [`<code>${esc(c)}</code>`, esc(m)]),
    "None.",
  );
}

function renderCliPage(ctx: PageContext): SiteFile {
  const categories = COMMAND_CATEGORIES.filter((c) => commandsInCategory(c).length > 0);
  const total = COMMAND_NAMES.length;

  const tocEntries: [string, string][] = [
    ["quick-start", "Quick start"],
    ...categories.map((c): [string, string] => [categoryId(c), c]),
    ["json-output", "JSON output"],
    ["exit-codes", "Exit codes"],
  ];

  const body =
    `<h1>CLI reference</h1>\n` +
    `<p data-docs-tooling-lede>The ${code("faqir")} command line owns your components: it copies them into the project, keeps a pristine baseline, audits the markup you write against the manifests, and generates themes, fonts, bindings and agent context. ` +
    `Every one of the ${total} commands below is read from the command registry that ${code("faqir help")} and the shipped skill also read, so this page cannot list a command the binary does not have. ` +
    `Read it alongside <a data-ui="link" href="${escAttr(relUrl(CLI_PAGE, INTEGRATIONS_PAGE))}">Integrations</a> for the MCP server and the framework packages.</p>\n` +
    toc(tocEntries) +
    `\n` +
    section("quick-start", "Quick start", renderQuickStart()) +
    `\n<p>The binary is also available without a global install: <code>npx ${esc(CLI_PACKAGE)} init</code>. Run <code>faqir &lt;command&gt; --help</code> for any command's own options table.</p>\n` +
    renderCommandNav() +
    `\n` +
    categories
      .map((category) => {
        const commands = commandsInCategory(category);
        return section(
          categoryId(category),
          category,
          `<p><span data-ui="text" data-variant="muted">${commands.length} command${commands.length === 1 ? "" : "s"}.</span></p>\n` +
            commands.map(([name]) => renderCommand(name)).join("\n"),
        );
      })
      .join("\n") +
    `\n` +
    section("json-output", "JSON output", renderJsonSection(ctx)) +
    `\n` +
    section("exit-codes", "Exit codes", renderExitCodes());

  return {
    path: CLI_PAGE,
    content: renderShell({
      pagePath: CLI_PAGE,
      title: "CLI reference · Faqir UI",
      description:
        "Every faqir command, generated from the command registry: arguments, flags, sub-commands, the universal --json envelope and the exit codes.",
      body,
      config: ctx.config,
      components: ctx.components,
      themes: ctx.themes,
      current: CLI_PAGE,
      layout: "reference",
      scripts: [],
    }),
  };
}

// ---------------------------------------------------------------------------
// Integrations
// ---------------------------------------------------------------------------

interface McpToolDoc {
  name: string;
  title: string;
  description: string;
  inputs: { key: string; type: string; optional: boolean; description: string }[];
  outputs: string[];
  readOnly: boolean;
}

interface McpResourceDoc {
  uri: string;
  name: string;
  title: string;
  description: string;
  mimeType: string;
}

/**
 * The slice of a zod schema this page reads. `zod` is a dependency of the MCP
 * package, not of the CLI, so the schemas are duck-typed on their `_def` rather
 * than imported: the shape is stable across zod 3 and is what the SDK itself
 * reads to build the JSON schema it advertises.
 */
interface ZodLike {
  description?: string;
  _def: {
    typeName?: string;
    innerType?: ZodLike;
    type?: ZodLike;
    values?: string[];
    options?: ZodLike[];
    shape?: () => Record<string, ZodLike>;
  };
  shape?: Record<string, ZodLike>;
  isOptional?: () => boolean;
}

/** A one-word summary of a zod schema, unwrapping optionals. */
function zodSummary(schema: ZodLike): { type: string; optional: boolean } {
  let s = schema;
  let optional = false;
  while (
    s._def.innerType &&
    (s._def.typeName === "ZodOptional" || s._def.typeName === "ZodNullable" || s._def.typeName === "ZodDefault")
  ) {
    if (s._def.typeName === "ZodOptional") optional = true;
    s = s._def.innerType;
  }
  switch (s._def.typeName) {
    case "ZodEnum":
      return { type: (s._def.values ?? []).join(" | "), optional };
    case "ZodString":
      return { type: "string", optional };
    case "ZodNumber":
      return { type: "number", optional };
    case "ZodBoolean":
      return { type: "boolean", optional };
    case "ZodArray":
      return { type: `${s._def.type ? zodSummary(s._def.type).type : "value"}[]`, optional };
    case "ZodRecord":
    case "ZodObject":
      return { type: "object", optional };
    case "ZodUnion":
      return { type: (s._def.options ?? []).map((o) => zodSummary(o).type).join(" | "), optional };
    default:
      return { type: "value", optional };
  }
}

/**
 * The tools and resources the live MCP server registers. Built by constructing
 * the server exactly as the `npx` entry does and reading its registration
 * tables, so a tool added to `server.ts` appears here with no edit.
 */
function introspectMcp(): { tools: McpToolDoc[]; resources: McpResourceDoc[] } {
  type Registered = {
    _registeredTools: Record<
      string,
      {
        title?: string;
        description?: string;
        inputSchema?: Record<string, ZodLike> | ZodLike;
        outputSchema?: Record<string, ZodLike> | ZodLike;
        annotations?: { readOnlyHint?: boolean };
      }
    >;
    _registeredResources: Record<
      string,
      { name: string; metadata?: { title?: string; description?: string; mimeType?: string } }
    >;
    _registeredResourceTemplates: Record<
      string,
      {
        resourceTemplate: { uriTemplate: { toString(): string } };
        metadata?: { title?: string; description?: string; mimeType?: string };
      }
    >;
  };
  const server = createFaqirMcpServer() as unknown as Registered;

  // A raw shape (`{ key: schema }`) or a ZodObject wrapping one.
  const shapeOf = (s: Record<string, ZodLike> | ZodLike | undefined): Record<string, ZodLike> => {
    if (!s) return {};
    const maybe = s as ZodLike;
    if (maybe._def && typeof maybe._def === "object" && maybe._def.typeName === "ZodObject") {
      return maybe.shape ?? maybe._def.shape?.() ?? {};
    }
    return s as Record<string, ZodLike>;
  };

  const tools = Object.entries(server._registeredTools)
    .map(([name, t]): McpToolDoc => ({
      name,
      title: t.title ?? name,
      description: t.description ?? "",
      inputs: Object.entries(shapeOf(t.inputSchema)).map(([key, schema]) => {
        const { type, optional } = zodSummary(schema);
        return { key, type, optional, description: schema.description ?? "" };
      }),
      outputs: Object.keys(shapeOf(t.outputSchema)),
      readOnly: t.annotations?.readOnlyHint === true,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const resources: McpResourceDoc[] = [
    ...Object.entries(server._registeredResources).map(([uri, r]) => ({
      uri,
      name: r.name,
      title: r.metadata?.title ?? r.name,
      description: r.metadata?.description ?? "",
      mimeType: r.metadata?.mimeType ?? "",
    })),
    ...Object.entries(server._registeredResourceTemplates).map(([name, r]) => ({
      uri: r.resourceTemplate.uriTemplate.toString(),
      name,
      title: r.metadata?.title ?? name,
      description: r.metadata?.description ?? "",
      mimeType: r.metadata?.mimeType ?? "",
    })),
  ].sort((a, b) => a.uri.localeCompare(b.uri));

  return { tools, resources };
}

/** Strip the light Markdown emphasis the tool descriptions carry (`**bold**`, `` `code` ``). */
function plainMarkdown(text: string): string {
  return esc(text)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

function renderMcpSection(ctx: PageContext): string {
  const { tools, resources } = introspectMcp();
  const mcpPkg = readPackage(join(ctx.packageRoot, "packages", "mcp"));
  const readme = readOptional(join(ctx.packageRoot, "packages", "mcp", "README.md"));
  const claudeAdd = fencedBlock(readme, "sh", "claude mcp add") ?? "claude mcp add faqir -- npx -y @faqir-ui/mcp";
  const mcpJson = fencedBlock(readme, "json", '"mcpServers"') ?? "";
  const envRows = markdownTableRows(readme, "| Variable |");

  const toolCards = tools
    .map(
      (t) =>
        `<article id="mcp-${escAttr(t.name)}" data-docs-cmd data-docs-tooling-tool>\n` +
        `<h4 id="mcp-${escAttr(t.name)}-title"><span data-ui="text" data-variant="mono">${esc(t.name)}</span></h4>\n` +
        `<p><strong>${esc(t.title)}</strong> ${
          t.readOnly
            ? `<span data-ui="badge" data-variant="secondary" data-size="sm">read-only</span>`
            : `<span data-ui="badge" data-variant="primary" data-size="sm">write / verify</span>`
        }</p>\n` +
        `<p>${plainMarkdown(t.description)}</p>\n` +
        (t.inputs.length
          ? subTable(
              "Input",
              ["Field", "Type", "Meaning"],
              t.inputs.map((i) => [`${i.key}${i.optional ? "?" : ""}`, i.type, i.description]),
              2,
            )
          : `<p><span data-ui="text" data-variant="subtle" data-size="sm">No input.</span></p>`) +
        `\n<p><span data-ui="text" data-variant="subtle" data-size="sm">Returns: ${t.outputs
          .map((o) => code(o))
          .join(", ")}</span></p>\n` +
        `</article>`,
    )
    .join("\n");

  const resourceTable = table(
    ["URI", "Type", "Contents"],
    resources.map((r) => [code(r.uri), code(r.mimeType), `<strong>${esc(r.title)}</strong> — ${esc(r.description)}`]),
    "No resources.",
  );

  return (
    `<p>${code(mcpPkg.name)} ${mcpPkg.version} is a stdio Model Context Protocol server that wraps the same TypeScript internals as the CLI: the audit, the repairer and the theme generator are imported from the CLI source, so a verdict in an MCP host is the verdict in the terminal. ` +
    `It ships the registry inside the package, needs no local checkout, and runs on plain Node 18 or newer. ${tools.length} tools and ${resources.length} resources are registered; the tables below are read off the live server at build time.</p>\n` +
    `<h3 id="mcp-host-config">Host configuration</h3>\n` +
    `<p>Claude Code, with the CLI:</p>\n` +
    pre(claudeAdd) +
    `\n<p>Or by hand in <code>.mcp.json</code> at the project root (Cursor uses the same shape in <code>~/.cursor/mcp.json</code> or a project <code>.cursor/mcp.json</code>):</p>\n` +
    pre(mcpJson) +
    `\n<p>The host launches the server with your project as its working directory, so <code>faqir_project_context</code> reads that project's <code>.faqir/context.json</code>.</p>\n` +
    (envRows.length
      ? subTable("Environment overrides", ["Variable", "Purpose"], envRows.map((r) => [r[0]!, r[1]!]))
      : "") +
    `\n<h3 id="mcp-tools">Tools</h3>\n` +
    `<div data-docs-tooling-tools>\n${toolCards}\n</div>\n` +
    `<h3 id="mcp-resources">Resources</h3>\n` +
    `<p>Pinned into a host's context so an agent can author correct markup offline.</p>\n` +
    resourceTable
  );
}

function readPackage(dir: string): { name: string; version: string; description: string } {
  const raw = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as {
    name: string;
    version: string;
    description?: string;
  };
  return { name: raw.name, version: raw.version, description: raw.description ?? "" };
}

function readOptional(path: string): string {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

/** The first fenced block of `lang` whose body contains `needle`, verbatim. */
function fencedBlock(markdown: string, lang: string, needle: string): string | null {
  const re = new RegExp("```" + lang + "\\n([\\s\\S]*?)```", "g");
  for (const m of markdown.matchAll(re)) {
    if (m[1]!.includes(needle)) return m[1]!.replace(/\n$/, "");
  }
  return null;
}

/** The first fenced block of `lang` after a `## heading` line. */
function fencedBlockAfter(markdown: string, heading: string, lang: string): string | null {
  const at = markdown.indexOf(`\n${heading}\n`);
  if (at === -1) return null;
  const rest = markdown.slice(at);
  const m = rest.match(new RegExp("```" + lang + "\\n([\\s\\S]*?)```"));
  return m ? m[1]!.replace(/\n$/, "") : null;
}

/** Body rows of the first Markdown table whose header line starts with `headerStart`. */
function markdownTableRows(markdown: string, headerStart: string): string[][] {
  const lines = markdown.split("\n");
  const start = lines.findIndex((l) => l.startsWith(headerStart));
  if (start === -1) return [];
  const rows: string[][] = [];
  for (let i = start + 2; i < lines.length && lines[i]!.startsWith("|"); i++) {
    rows.push(
      lines[i]!
        .split("|")
        .slice(1, -1)
        .map((c) => c.trim().replace(/`/g, "")),
    );
  }
  return rows;
}

function countTs(dir: string): number {
  return existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".ts")).length : 0;
}

function renderBindingsSection(ctx: PageContext): string {
  const scripts = (JSON.parse(readFileSync(join(ctx.packageRoot, "package.json"), "utf8")) as {
    scripts?: Record<string, string>;
  }).scripts ?? {};
  const gate = scripts["check:bindings"] ?? "";

  const targets = (["react", "vue"] as const).map((target) => {
    const pkgDir = join(ctx.packageRoot, "packages", target);
    const pkg = readPackage(pkgDir);
    const readme = readOptional(join(pkgDir, "README.md"));
    const src = join(pkgDir, "src");
    return {
      target,
      pkg,
      components: countTs(join(src, "components")),
      recipes: countTs(join(src, "recipes")),
      controllers: countTs(join(src, "controllers")),
      example: fencedBlockAfter(readme, "## Usage", target === "react" ? "tsx" : "vue") ?? "",
      requires: target === "react" ? "React 18.2+ or 19" : "Vue 3.5+",
    };
  });

  return (
    `<p>${code("faqir bindings react")} and ${code("faqir bindings vue")} generate typed framework components from the registry manifests. ` +
    `Both targets share one manifest-walking core (${code("src/bindings/ir.ts")} for primitives, ${code("src/bindings/recipe-ir.ts")} for recipes); the only hand-written code in each package is its runtime. ` +
    `Recipe controllers are vendored verbatim from the registry, and neither package ships CSS: style with your project's ${code("faqir bundle")} output or a prebuilt bundle from ${code("@faqir-ui/core")}.</p>\n` +
    table(
      ["Package", "Requires", "Primitives", "Recipes", "Vendored controllers"],
      targets.map((t) => [
        code(t.pkg.name) + ` ${esc(t.pkg.version)}`,
        esc(t.requires),
        String(t.components),
        String(t.recipes),
        String(t.controllers),
      ]),
      "No bindings packages.",
    ) +
    `\n<h3 id="bindings-contract">What the generator emits</h3>\n` +
    `<ul>` +
    `<li><strong>Root</strong> — the manifest anatomy tag carrying <code>data-ui="&lt;name&gt;"</code>; every non-Faqir prop or attribute falls through to it.</li>` +
    `<li><strong>Variants become typed props</strong> — the attribute minus <code>data-</code>, typed as the literal union of manifest values, written only when set.</li>` +
    `<li><strong>States become boolean props</strong> — <code>data-state</code> values, bare attributes and <code>aria-*</code> states each rendered the way the manifest declares them.</li>` +
    `<li><strong>Slots</strong> — React: one <code>ReactNode</code> prop per manifest slot; Vue: one named slot per manifest slot, each projected inside <code>&lt;tag_hint data-part="name"&gt;</code>.</li>` +
    `<li><strong>Recipes</strong> — the manifest reference markup, a vendored controller attached on mount and destroyed on unmount, the controller API exposed on the ref, and <code>faqir:*</code> events re-emitted as callbacks (React) or component events (Vue).</li>` +
    `</ul>\n` +
    `<p>The generated sources are gated in CI: ${code("bun run check:bindings")} runs ${code(gate)}, which regenerates both packages and fails on any byte of difference, so the components cannot drift from the manifests.</p>\n` +
    targets
      .map(
        (t) =>
          `<h3 id="bindings-${t.target}">${esc(t.pkg.name)}</h3>\n` +
          `<p>${esc(t.pkg.description)}.</p>\n` +
          pre(t.example),
      )
      .join("\n")
  );
}

function renderCdnSection(ctx: PageContext): string {
  const pin = ctx.pin;
  const themes = Object.keys(pin.integrity)
    .filter((f) => f.startsWith("faqir.") && f.endsWith(".css"))
    .map((f) => f.slice("faqir.".length, -".css".length))
    .sort();
  const plugins = Object.keys(pin.integrity)
    .filter((f) => f.startsWith("plugins/"))
    .map((f) => f.slice("plugins/".length))
    .sort();
  const theme = themes.includes(ctx.config.theme) ? ctx.config.theme : themes[0] ?? "default";
  return (
    `<p>The two-tag path needs no build step and no install: one prebuilt per-theme CSS bundle and the minified engine, which sets ${code("window.Faqir")} and boots on ${code("DOMContentLoaded")}. ` +
    `The tags below are pinned to ${code(`${pin.package}@${pin.version}`)} with subresource integrity hashes read from the package's ${code("cdn.json")}; the CLI remains the ownership path when you want the files in your repository.</p>\n` +
    pre(renderCdnPreamble(pin, theme)) +
    `\n<p>Swap the stylesheet to change theme. Bundles shipped at this pin: ${themes.map((t) => code(`faqir.${t}.css`)).join(", ")}.</p>\n` +
    `<p>Official plugins are self-registering scripts under ${code("dist/plugins/")}; load any of them after the engine: ${plugins.map((p) => code(p)).join(", ")}. ` +
    `A definition carrying ${code("validate")} rules needs ${code("faqir-validate.js")} on the page alongside ${code("faqir-rules.js")}.</p>\n` +
    `<p>Every file in ${code("dist/")} has a SHA-384 hash in ${code("dist/sri.json")}; the hashes above come from the same source.</p>`
  );
}

/** Named exports of the ESM entry, grouped by its `// ── Group ──` comments. */
function coreExports(packageRoot: string): { group: string; names: string[] }[] {
  const source = readOptional(join(packageRoot, "packages", "core", "src", "esm-entry.js"));
  const groups: { group: string; names: string[] }[] = [];
  let current = { group: "Version", names: [] as string[] };
  for (const line of source.split("\n")) {
    const heading = line.match(/^\/\/ ── (.+?) ──/);
    if (heading) {
      if (current.names.length) groups.push(current);
      current = { group: heading[1]!, names: [] };
      continue;
    }
    const named = line.match(/^export const (\w+) =/);
    if (named) current.names.push(named[1]!);
  }
  if (current.names.length) groups.push(current);
  return groups;
}

function renderCoreSection(ctx: PageContext): string {
  const pkg = readPackage(join(ctx.packageRoot, "packages", "core"));
  const groups = coreExports(ctx.packageRoot);
  const total = groups.reduce((n, g) => n + g.names.length, 0);
  return (
    `<p>${code(pkg.name)} ${esc(pkg.version)} is ESM-only. The default export is the engine and every engine member is also a named export, so a bundler can tree-shake the import site. ` +
    `There is no ${code("require")} condition; use ${code('await import("@faqir-ui/core")')} from CommonJS, or reach the UMD build directly at ${code("@faqir-ui/core/faqir-core.js")}. ` +
    `${total} named exports, read off the package's ESM entry:</p>\n` +
    table(
      ["Group", "Exports"],
      groups.map((g) => [esc(g.group), g.names.map((n) => code(n)).join(" ")]),
      "No exports.",
    ) +
    `\n` +
    pre(
      [
        'import Faqir from "@faqir-ui/core";              // dist/faqir-core.mjs',
        'import "@faqir-ui/core/dist/faqir.default.css";  // or your project\'s own bundle',
        "",
        "Faqir.start();",
        "",
        "// or, tree-shaken at the import site",
        'import { start, reactive, store } from "@faqir-ui/core";',
        "start();",
      ].join("\n"),
    )
  );
}

function renderSkillSection(ctx: PageContext): string {
  const skillDir = join(ctx.packageRoot, ".claude", "skills", "faqir-creator");
  const skill = readOptional(join(skillDir, "SKILL.md"));
  const name = skill.match(/^name:\s*(.+)$/m)?.[1]?.trim() ?? "faqir-creator";
  const headings = [...skill.matchAll(/^## (.+)$/gm)].map((m) => m[1]!);
  const references = existsSync(join(skillDir, "references"))
    ? readdirSync(join(skillDir, "references")).filter((f) => f.endsWith(".md")).sort()
    : [];
  const scripts = (JSON.parse(readFileSync(join(ctx.packageRoot, "package.json"), "utf8")) as {
    scripts?: Record<string, string>;
  }).scripts ?? {};
  return (
    `<p>The repository ships a Claude Code skill, ${code(name)}, under ${code(".claude/skills/faqir-creator/")}. ` +
    `It is generated from the registry manifests by ${code("bun run gen:skill")} (${code(scripts["gen:skill"] ?? "scripts/gen-skill.mjs")}), deterministic and gated in CI, so an agent reading it sees the same anatomy, variants and CLI reference this site does. ` +
    `Its CLI section is rendered from the same command registry as the <a data-ui="link" href="${escAttr(relUrl(INTEGRATIONS_PAGE, CLI_PAGE))}">CLI reference</a>.</p>\n` +
    `<p>${code("SKILL.md")} carries ${headings.length} sections:</p>\n` +
    `<ol data-docs-tooling-skill>${headings.map((h) => `<li>${esc(h)}</li>`).join("")}</ol>\n` +
    `<p>Reference files: ${references.map((r) => code(`references/${r}`)).join(", ")}.</p>\n` +
    `<p>For your own project, ${code("faqir context --skill")} writes a project-specific ${code(".faqir/SKILL.md")} that covers only the components you installed, next to the ${code(".faqir/context.json")} every ${code("faqir context")} run produces.</p>`
  );
}

function renderFamilySection(ctx: PageContext): string {
  const external = (href: string, label: string) =>
    `<a data-ui="link" data-variant="external" href="${escAttr(href)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>`;
  const root = readPackage(ctx.packageRoot);
  const rows: string[][] = [
    [
      code(root.name),
      esc(root.version),
      esc(root.description),
      external(`${REPO_URL}/tree/${ALIAS_REF}`, "repository root"),
    ],
    ...PACKAGE_DIRS.map((dir) => {
      const pkg = readPackage(join(ctx.packageRoot, "packages", dir));
      return [
        code(pkg.name),
        esc(pkg.version),
        esc(pkg.description),
        external(`${REPO_URL}/tree/${ALIAS_REF}/packages/${dir}`, `packages/${dir}`),
      ];
    }),
  ];
  return (
    `<p>Seven publishable packages, one version line. Versions and descriptions are read from each ${code("package.json")} at build time.</p>\n` +
    table(["Package", "Version", "Purpose", "Source"], rows, "No packages.")
  );
}

function renderIntegrationsPage(ctx: PageContext): SiteFile {
  const tocEntries: [string, string][] = [
    ["mcp", "MCP server"],
    ["bindings", "React and Vue bindings"],
    ["cdn", "CDN, two tags"],
    ["core-esm", "@faqir-ui/core ESM exports"],
    ["skill", "Claude Code skill"],
    ["packages", "Package family"],
  ];
  const body =
    `<h1>Integrations</h1>\n` +
    `<p data-docs-tooling-lede>Faqir has one core and several front doors. The ${code("faqir")} CLI copies components into a project you own; the MCP server gives an agent the same registry, audit and theme generator over stdio; the React and Vue packages are typed components generated from the manifests; and the CDN build is two tags for a page with no build step. ` +
    `This page documents each entry point from its source: the live MCP registrations, the package manifests, the ESM entry and the shipped skill. For the commands themselves, see the <a data-ui="link" href="${escAttr(relUrl(INTEGRATIONS_PAGE, CLI_PAGE))}">CLI reference</a>.</p>\n` +
    toc(tocEntries) +
    `\n` +
    section("mcp", "MCP server", renderMcpSection(ctx)) +
    `\n` +
    section("bindings", "React and Vue bindings", renderBindingsSection(ctx)) +
    `\n` +
    section("cdn", "CDN, two tags", renderCdnSection(ctx)) +
    `\n` +
    section("core-esm", "@faqir-ui/core ESM exports", renderCoreSection(ctx)) +
    `\n` +
    section("skill", "Claude Code skill", renderSkillSection(ctx)) +
    `\n` +
    section("packages", "Package family", renderFamilySection(ctx));

  return {
    path: INTEGRATIONS_PAGE,
    content: renderShell({
      pagePath: INTEGRATIONS_PAGE,
      title: "Integrations · Faqir UI",
      description:
        "The MCP server's tools and resources, the React and Vue bindings, the two-tag CDN setup, the @faqir-ui/core ESM exports, the Claude Code skill and the package family.",
      body,
      config: ctx.config,
      components: ctx.components,
      themes: ctx.themes,
      current: INTEGRATIONS_PAGE,
      layout: "reference",
      scripts: [],
    }),
  };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function renderToolingPages(input: PageContext): SiteFile[] {
  // A fixture packageRoot (the generator tests build against one) carries no
  // workspace packages; document the ones the generator itself ships with.
  const ctx: PageContext = existsSync(join(input.packageRoot, "packages", "mcp", "package.json"))
    ? input
    : { ...input, packageRoot: PACKAGE_ROOT };
  return [renderCliPage(ctx), renderIntegrationsPage(ctx)];
}
