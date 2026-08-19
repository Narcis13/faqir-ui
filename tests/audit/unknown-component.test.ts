// The unknown component — `unknown-component` (task 1.0R-11, FAQIR-PLAN §15).
//
// Every other per-component rule is answered by a manifest, and the audit skips
// a `data-ui` value it has no manifest for. That skip protects a real case — a
// component in the registry that this project has not installed must not error —
// and hid the opposite one: `<div data-ui="datatable">`, a name the registry has
// never had, audited completely clean.
//
// What this suite pins is the DISTINCTION, in both directions, because a rule
// that fires on everything unknown would break every page that references a
// component before adding it, and a rule that fires on nothing is what shipped:
//
//   • not a Faqir name at all           → one warning, naming the closest match;
//   • in the registry, not installed     → silent, and the rule provably ran;
//   • an alias (`alert` is `callout`)    → silent;
//   • a base-layer value (`prose`)       → silent;
//   • a companion value (`button-group`) → silent;
//   • a custom component installed here  → silent, and offered as a suggestion;
//   • no registry names supplied         → the rule does not run at all.
//
// The last one is the load-bearing default: `knownUiValues` is optional exactly
// as `styles` is, so a caller that cannot produce the registry's names gets the
// pre-1.0R-11 behaviour rather than a guess derived from the manifests it holds.

import { describe, expect, it, beforeAll, beforeEach, afterEach } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { extractComponents } from "../../src/parser/html-parser";
import {
  UNKNOWN_COMPONENT_RULE,
  buildUnknownComponentResults,
  getHtmlRuleInventory,
  getRuleInventory,
  type AuditResult,
} from "../../src/audit/rules";
import { auditHtmlSource, runAudit } from "../../src/audit/checker";
import {
  componentDefinedUiValues,
  knownUiValues,
  loadRegistryManifestMap,
} from "../../src/utils/components";
import { parseSkipRules } from "../../src/commands/audit";
import { init } from "../../src/commands/init";
import { add } from "../../src/commands/add";
import type { Manifest } from "../../src/manifest";

const REPO = join(import.meta.dir, "../..");
const REGISTRY = join(REPO, "registry");
const TEST_DIR = join(REPO, ".tmp-unknown-component");

const known = new Set(knownUiValues(REGISTRY));

let registry: Map<string, Manifest>;
beforeAll(async () => {
  registry = await loadRegistryManifestMap(REGISTRY);
});

/** The components of a fragment, as the engine extracts them. */
const parse = (source: string) => extractComponents(source, "f.html");

/** Findings for a fragment against a chosen set of installed manifests. */
function findings(source: string, installed: Map<string, Manifest> = new Map()): AuditResult[] {
  return buildUnknownComponentResults(parse(source), known, installed, "f.html");
}

describe("the known-value set", () => {
  it("is the registry's components, their aliases and the base layer", () => {
    // Components: all three layers, whatever the project installed.
    expect(known.has("button")).toBe(true); // primitive
    expect(known.has("dialog")).toBe(true); // recipe
    expect(known.has("inbox")).toBe(true); // pattern
    // The alias with no directory of its own — the case `registry-index.json`
    // cannot answer, which is why the set is read from the manifests.
    expect(known.has("alert")).toBe(true);
    expect(registry.get("alert")?.name).toBe("callout");
    expect(existsSync(join(REGISTRY, "primitives", "alert"))).toBe(false);
    // The base-layer value with no manifest anywhere (task 1.0R-10).
    expect(known.has("prose")).toBe(true);
    expect(registry.has("prose")).toBe(false);
    // And nothing invented.
    expect(known.has("datatable")).toBe(false);
  });

  it("includes the companion values a component's own stylesheet defines", () => {
    // Found by this rule on its first run, and the reason it exists as a
    // derivation rather than a list: `button.css` declares
    // `[data-ui="button-group"]`, `button.html` uses it, and no `button-group`
    // component exists. Seven such values ship — every one written by the
    // framework, so calling them unknown would report Faqir's own markup broken.
    expect(componentDefinedUiValues(REGISTRY)).toEqual([
      "button-group",
      "checkbox-label",
      "heading",
      "input-group",
      "radio-group",
      "radio-label",
      "switch-label",
    ]);
    for (const value of componentDefinedUiValues(REGISTRY)) expect(known.has(value)).toBe(true);
  });

  it("derives the companions from stylesheets, never from the markup being audited", () => {
    // The evidence that a value is real is that something STYLES it. Trusting
    // the reference HTML instead would let a typo in the very file under audit
    // legitimise itself — `radio.html` uses `data-ui="radio-group"` because
    // `radio.css` defines it, not the other way round. Asserted on a registry
    // built for the purpose, because in the real one every companion appears in
    // both files and the two rules cannot be told apart.
    const fake = join(REPO, ".tmp-fake-registry");
    rmSync(fake, { recursive: true, force: true });
    const dir = join(fake, "primitives", "foo");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "foo.manifest.json"), JSON.stringify({ name: "foo" }));
    writeFileSync(join(dir, "foo.css"), '[data-ui="foo"] [data-ui="foo-group"] { gap: 0; }');
    writeFileSync(join(dir, "foo.html"), '<div data-ui="foo"><div data-ui="typo-only"></div></div>');
    try {
      expect(componentDefinedUiValues(fake)).toEqual(["foo-group"]);
    } finally {
      rmSync(fake, { recursive: true, force: true });
    }
  });

  it("is sorted and free of duplicates — the suggestion order is deterministic", () => {
    const values = knownUiValues(REGISTRY);
    expect(values).toEqual([...values].sort());
    expect(new Set(values).size).toBe(values.length);
  });
});

describe("a name that is not Faqir's", () => {
  it("reports exactly one warning, naming the closest registry match", () => {
    const results = findings('<div data-ui="dailog">panel</div>');
    expect(results.length).toBe(1);
    expect(results[0].rule_id).toBe("unknown-component");
    expect(results[0].severity).toBe("warning");
    expect(results[0].component_name).toBe("dailog");
    expect(results[0].file).toBe("f.html");
    expect(results[0].line).toBe(1);
    expect(results[0].message).toContain('data-ui="dailog" is not a Faqir component');
    expect(results[0].message).toContain('Did you mean data-ui="dialog"?');
  });

  it("carries no fix — the closest name is a guess, and `faqir repair` applies fixes", () => {
    // Every other suggestion in the engine repairs markup a manifest proves
    // wrong. Here the manifest is the thing that does not exist, so an automatic
    // rename would rewrite another system's data-ui into a Faqir component.
    expect(findings('<div data-ui="dailog">panel</div>')[0].fix).toBeUndefined();
  });

  it("says how to look the names up when nothing is close", () => {
    // `datatable` is the plan's own example, and nothing in the registry is
    // within an edit of it (`table` is four, `crud-table` further). The finding
    // is the point; the suggestion is a bonus the shared `suggestClosest`
    // budget — three edits, as everywhere else in the CLI — cannot always pay.
    for (const name of ["datatable", "zzqqxx-widget-9000"]) {
      const results = findings(`<div data-ui="${name}"></div>`);
      expect(results.length).toBe(1);
      expect(results[0].message).not.toContain("Did you mean");
      expect(results[0].message).toContain("faqir list");
    }
  });

  it("always names the escape hatch, so a mixed page is told how to be quiet", () => {
    for (const source of ['<div data-ui="dailog"></div>', '<div data-ui="zzqqxx-9000"></div>']) {
      expect(findings(source)[0].message).toContain(
        "faqir audit --skip-rules unknown-component",
      );
    }
  });

  it("reports each occurrence, at its own line", () => {
    const results = findings('<div data-ui="dailog"></div>\n<p data-ui="dailog"></p>');
    expect(results.map((r) => r.line)).toEqual([1, 2]);
  });
});

describe("a name that is Faqir's", () => {
  it("stays silent for a registry component this project never installed", () => {
    // The deliberate behaviour of `if (!manifest) continue` — a page may name a
    // component before `faqir add` runs, and the audit is not an install nag.
    // The control in the same fixture proves the rule RAN and chose silence.
    const results = findings(
      '<div data-ui="dialog"></div><div data-ui="dailog"></div>',
      new Map(),
    );
    expect(results.map((r) => r.component_name)).toEqual(["dailog"]);
    expect(results[0].message).toContain('Did you mean data-ui="dialog"?');
  });

  it("stays silent for an alias, installed or not", () => {
    expect(findings('<div data-ui="alert"></div>')).toEqual([]);
  });

  it("stays silent for a base-layer value that has no manifest at all", () => {
    // `data-ui="prose"` is styling, not a component (task 1.0R-10). Faqir's own
    // documentation site is built out of it on a dozen pages.
    expect(findings('<article data-ui="prose"><p>Text.</p></article>')).toEqual([]);
  });

  it("stays silent for a custom component installed in this project", () => {
    // `faqir create` writes a component the registry has never heard of. It is
    // in the caller's manifests, which is the second half of "known".
    const custom = { name: "my-widget" } as Manifest;
    const installed = new Map<string, Manifest>([["my-widget", custom]]);
    expect(findings('<div data-ui="my-widget"></div>', installed)).toEqual([]);
    // …and it is offered as a suggestion for a typo of itself.
    const typo = findings('<div data-ui="my-widgit"></div>', installed);
    expect(typo.length).toBe(1);
    expect(typo[0].message).toContain('Did you mean data-ui="my-widget"?');
  });
});

describe("the engine seam", () => {
  it("does not run at all when the caller supplies no registry names", () => {
    // The regression guard for every existing call site: the whole test suite,
    // the MCP server and the docs generator audit without a name list, and none
    // of them may start reporting components they simply do not hold.
    const source = '<div data-ui="datatable"></div>';
    expect(auditHtmlSource({ source, file: "f.html", manifests: registry })).toEqual([]);
    // The same input WITH the names is the finding — so the silence above is the
    // absent input, not an absent rule.
    const armed = auditHtmlSource({
      source,
      file: "f.html",
      manifests: registry,
      knownUiValues: known,
    });
    expect(armed.map((r) => r.rule_id)).toEqual(["unknown-component"]);
  });

  it("is suppressed by skipRules — the opt-out the CLI flag reaches", () => {
    const input = {
      source: '<div data-ui="datatable"></div>',
      file: "f.html",
      manifests: registry,
      knownUiValues: known,
    };
    expect(auditHtmlSource(input).length).toBe(1);
    expect(auditHtmlSource({ ...input, skipRules: ["unknown-component"] })).toEqual([]);
  });

  it("leaves every other rule's verdict untouched", () => {
    // A hallucinated name inside otherwise-real markup adds one finding and
    // changes nothing else: the manifest rules never saw that element anyway.
    const source =
      '<div data-ui="card"><div data-part="header"><h3 data-part="title">T</h3></div>' +
      '<div data-ui="datatable"></div></div>';
    const without = auditHtmlSource({ source, file: "f.html", manifests: registry });
    const with_ = auditHtmlSource({
      source,
      file: "f.html",
      manifests: registry,
      knownUiValues: known,
    });
    expect(with_.filter((r) => r.rule_id !== "unknown-component")).toEqual(without);
  });

  it("accepts any iterable of names, and an empty one means nothing is known", () => {
    const results = auditHtmlSource({
      source: '<div data-ui="button"></div>',
      file: "f.html",
      manifests: new Map(),
      knownUiValues: [],
    });
    // An empty list is a supplied list, not a missing one — the distinction the
    // `undefined` check draws.
    expect(results.map((r) => r.rule_id)).toEqual(["unknown-component"]);
  });
});

describe("the escape hatch", () => {
  it("parses --skip-rules in each form the CLI accepts", () => {
    expect(parseSkipRules(["--json"])).toBeUndefined();
    expect(parseSkipRules(["--skip-rules", "unknown-component"])).toEqual(["unknown-component"]);
    expect(parseSkipRules(["--skip-rules", "a,b"])).toEqual(["a", "b"]);
    expect(parseSkipRules(["--skip-rules", "a", "b", "--json"])).toEqual(["a", "b"]);
    expect(parseSkipRules(["--skip-rules"])).toEqual([]);
  });

  it("is documented on the rule itself, with the exemptions it grants", () => {
    const listed = getRuleInventory().find((r) => r.id === "unknown-component");
    expect(listed).toBe(UNKNOWN_COMPONENT_RULE);
    expect(listed!.exempt?.join(" ")).toContain("--skip-rules unknown-component");
    expect(listed!.exempt?.join(" ")).toContain("not installed");
    // `faqir audit --rules` prints this inventory, so the hatch is discoverable
    // from the tool itself and not only from a document.
  });

  it("is in the HTML inventory the playground legend renders", () => {
    const ids = getHtmlRuleInventory().map((r) => r.id);
    expect(ids).toContain("unknown-component");
    // Markup rules only: the stylesheet and markup+css rules need files a
    // textarea does not have.
    expect(ids).not.toContain("trigger-contract");
    expect(ids).not.toContain("undeclared-attribute");
  });
});

describe("`faqir audit` on a real project", () => {
  beforeEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DIR, { recursive: true });
    process.chdir(TEST_DIR);
  });

  afterEach(() => {
    process.chdir(REPO);
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  /** A page carrying one hallucinated name beside legitimate, uninstalled ones. */
  const PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>T</title></head>
<body><main>
  <div data-ui="card"><div data-part="body">Installed.</div></div>
  <div data-ui="dialog"><div data-part="panel" role="dialog" aria-modal="true"></div></div>
  <article data-ui="prose"><p>Base layer.</p></article>
  <div data-ui="alert"><div data-part="content">Alias.</div></div>
  <div data-ui="datatable"></div>
</main></body></html>
`;

  it("catches the hallucinated name and nothing else, and still exits zero", async () => {
    await init([]);
    await add(["card"]);
    writeFileSync(join(TEST_DIR, "page.html"), PAGE);

    const summary = await runAudit({ cwd: TEST_DIR });
    const unknown = summary.results.filter((r) => r.rule_id === "unknown-component");
    // `dialog`, `prose` and `alert` are Faqir's — uninstalled, base-layer and
    // aliased respectively — so exactly one name is reported.
    expect(unknown.map((r) => r.component_name)).toEqual(["datatable"]);
    expect(unknown[0].file).toBe("page.html");
    // A warning, chosen so a page that mixes in another system's data-ui values
    // stays usable: `passed` is decided by criticals and errors.
    expect(unknown[0].severity).toBe("warning");
    expect(summary.counts.critical).toBe(0);
    expect(summary.counts.error).toBe(0);
    expect(summary.passed).toBe(true);
  });

  it("is silenced by --skip-rules, leaving the rest of the audit intact", async () => {
    await init([]);
    await add(["card"]);
    writeFileSync(join(TEST_DIR, "page.html"), PAGE);

    const all = await runAudit({ cwd: TEST_DIR });
    const skipped = await runAudit({ cwd: TEST_DIR, skipRules: ["unknown-component"] });
    expect(skipped.results.some((r) => r.rule_id === "unknown-component")).toBe(false);
    expect(skipped.results).toEqual(all.results.filter((r) => r.rule_id !== "unknown-component"));
  });

  it("does not report the framework's own installed reference markup", async () => {
    // `faqir audit` scans `ui/**` too, and those fragments name the components
    // they compose. A rule that read the project's installed set as "the
    // registry" would light them up.
    // `button` is the case that found the companion values: its reference file
    // demonstrates `<div data-ui="button-group">`, a value its own stylesheet
    // defines and no manifest claims.
    await init([]);
    await add(["button", "dialog", "radio", "input", "text"]);
    const summary = await runAudit({ cwd: TEST_DIR });
    expect(summary.results.filter((r) => r.rule_id === "unknown-component")).toEqual([]);
  });
});
