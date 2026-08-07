// Browser audit bundle — parity with the CLI (task 0.7-14, FAQIR-PLAN §13).
//
// `site/lib/faqir-audit.js` is the audit engine compiled for the browser, and the
// docs-site playground runs it with no server at all. That is only worth shipping
// if it reports what `faqir audit` reports, so this suite:
//
//  • evaluates the COMMITTED bundle in a bare `node:vm` context — no DOM, no
//    `require`, no module loader — which is itself the proof that it is
//    self-contained and browser-loadable;
//  • runs it against a large shared fixture set (every page of the docs site,
//    every registry reference fragment, hand-written dirty snippets and samples
//    from the parser fuzz corpus) and asserts the findings are DEEP-EQUAL to
//    `auditHtmlSource` called in-process;
//  • holds the committed bytes honest with the build script's own `--check` gate,
//    and reports the size.
//
// Parity is structural, not coincidental: the bundle's entry re-exports the same
// `auditHtmlSource`. What the fixtures actually test is the thin browser-shaped
// seam around it — manifest keying from a plain object, and the promise that the
// engine never throws at a page.
//
// Task 0.8-10 added a second seam through the same bundle: `auditComponentCss`,
// which runs the stylesheet rules (`undeclared-attribute`, `breakpoint-canon`)
// over a component's CSS and its manifest. Its fixtures are every registry
// stylesheet paired with its own manifest, plus seeded-broken sheets — see the
// "stylesheet rules" block below.

import { describe, it, expect } from "bun:test";
import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { createContext, runInContext } from "node:vm";
import { gzipSync } from "node:zlib";
import {
  buildDocsSite,
  discoverDocsComponents,
  sanitizeReferenceFragment,
  MANIFESTS_GLOBAL,
} from "../../src/generator/docs";
import { auditHtmlSource } from "../../src/audit/checker";
import {
  ALL_RULES,
  DOCUMENT_RULES,
  SINGLE_FIXED_REGION_RULE,
  TRIGGER_CONTRACT_RULE,
  type AuditResult,
} from "../../src/audit/rules";
import {
  CSS_RULES,
  buildBreakpointCanonResults,
  buildUndeclaredAttributeResults,
} from "../../src/audit/css-rules";
import { VERSION } from "../../src/version";
import { generateAt } from "../parser/fuzz/fuzz-core";
import type { Manifest } from "../../src/manifest";

const REPO = join(import.meta.dir, "../..");
const BUNDLE = join(REPO, "site", "lib", "faqir-audit.js");
const REGISTRY = join(REPO, "registry");

const components = discoverDocsComponents(REGISTRY);
const bundleSource = readFileSync(BUNDLE, "utf8");

// ── the bundle, evaluated the way a page would ───────────────────────────────

interface BundleApi {
  version: string;
  rules: Array<{ id: string; severity: string; description: string; scope: string }>;
  severities: string[];
  createAuditor(
    manifests: Record<string, Manifest>,
    styles?: Record<string, string>,
  ): {
    audit(source: string, options?: { file?: string; skipRules?: string[] }): AuditResult[];
    components: string[];
  };
  auditComponentCss(input: {
    css: string;
    manifest: Manifest;
    file?: string;
    skipRules?: string[];
  }): AuditResult[];
}

/** Evaluate the committed bundle in an empty context and hand back its global. */
function loadBundle(): BundleApi {
  const context = createContext({}) as { FaqirAudit?: BundleApi };
  runInContext(bundleSource, context as object, { filename: "faqir-audit.js" });
  if (!context.FaqirAudit) throw new Error("the bundle installed no FaqirAudit global");
  return context.FaqirAudit;
}

/**
 * The manifests exactly as the site ships them: the payload
 * `scripts/faqir-manifests.js` assigns, read back out of the generated file so the
 * fixture is the deployed bytes and not a second construction of them.
 */
function shippedManifests(): Record<string, Manifest> {
  const script = buildDocsSite().find((f) => f.path === "scripts/faqir-manifests.js");
  expect(script, "the site does not ship scripts/faqir-manifests.js").toBeDefined();
  const context = createContext({ window: {} }) as { window: Record<string, unknown> };
  runInContext(script!.content, context as object, { filename: "faqir-manifests.js" });
  return context.window[MANIFESTS_GLOBAL] as Record<string, Manifest>;
}

/** The same map `faqir audit` builds: canonical names then aliases, in load order. */
function cliManifests(): Map<string, Manifest> {
  const map = new Map<string, Manifest>();
  for (const c of components) {
    map.set(c.name, c.manifest);
    for (const alias of c.manifest.aliases ?? []) map.set(alias, c.manifest);
  }
  return map;
}

// ── fixtures ────────────────────────────────────────────────────────────────

interface Fixture {
  label: string;
  source: string;
}

/** Markup written to trip specific rules, including the alias and skip paths. */
const HAND_WRITTEN: Fixture[] = [
  { label: "empty", source: "" },
  { label: "text only", source: "hello" },
  { label: "unknown component", source: '<div data-ui="not-a-component">x</div>' },
  { label: "invalid variant", source: '<button data-ui="button" data-variant="nope">Go</button>' },
  { label: "invalid size", source: '<button data-ui="button" data-size="enormous">Go</button>' },
  {
    label: "missing required slot",
    source: '<div data-ui="card"><div data-part="header">h</div></div>',
  },
  {
    label: "duplicate id across components",
    source: '<span data-ui="badge" id="x">a</span><span data-ui="badge" id="x">b</span>',
  },
  { label: "heading order", source: "<h1>a</h1><h4>b</h4>" },
  {
    label: "recipe without its controller",
    source: '<div data-ui="accordion"><div data-part="item"><button data-part="trigger">t</button><div data-part="content">c</div></div></div>',
  },
  {
    label: "alias name resolves to the aliased manifest",
    source: '<div data-ui="alert" data-variant="not-a-variant"><div data-part="content">c</div></div>',
  },
  { label: "unclosed tag", source: '<div data-ui="card"><div data-part="body">' },
  { label: "attribute soup", source: '<div data-ui = card data-part=body <<>' },
  { label: "html comment only", source: "<!-- nothing to see -->" },
  { label: "script and style", source: "<script>var a = 1 < 2;</script><style>a{}</style>" },
];

/** Every page the site ships — real, large, generated documents. */
function sitePageFixtures(): Fixture[] {
  return buildDocsSite()
    .filter((f) => f.path.endsWith(".html"))
    .map((f) => ({ label: `site:${f.path}`, source: f.content }));
}

/** Every registry reference fragment, raw and sanitized. */
function referenceFixtures(): Fixture[] {
  const out: Fixture[] = [];
  for (const c of components) {
    if (!existsSync(c.referencePath)) continue;
    const raw = readFileSync(c.referencePath, "utf8");
    out.push({ label: `reference:${c.layer}/${c.name}`, source: raw });
    out.push({ label: `sanitized:${c.layer}/${c.name}`, source: sanitizeReferenceFragment(raw) });
  }
  return out;
}

/**
 * Samples from the parser fuzz corpus (task 0.5-09) — the same generator that
 * hardened the tokenizer, reused here so "malformed input" is not a handful of
 * snippets someone imagined.
 */
function fuzzFixtures(count: number): Fixture[] {
  return Array.from({ length: count }, (_, i) => ({
    label: `fuzz:${i}`,
    source: generateAt(0x7014, i),
  }));
}

const fixtures: Fixture[] = [
  ...HAND_WRITTEN,
  ...sitePageFixtures(),
  ...referenceFixtures(),
  ...fuzzFixtures(150),
];

// ── the bundle loads and describes itself ───────────────────────────────────

describe("the browser audit bundle", () => {
  it("installs one global in a context with no DOM and no module loader", () => {
    const api = loadBundle();
    expect(typeof api.createAuditor).toBe("function");
    expect(api.version).toBe(VERSION);
    expect(api.severities).toEqual(["critical", "error", "warning", "info"]);
  });

  it("references no node builtin, no bundler runtime and no network", () => {
    expect(bundleSource).not.toMatch(/\bnode:[a-z_]+/);
    expect(bundleSource).not.toMatch(/\brequire\s*\(/);
    expect(bundleSource).not.toMatch(/\bprocess\.(?:cwd|env|argv)\b/);
    expect(bundleSource).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|import\s*\(/);
    expect(bundleSource).not.toMatch(/https?:\/\//);
  });

  it("advertises exactly the rules the engine runs, in all four scopes", () => {
    const api = loadBundle();
    const expected = [
      ...ALL_RULES.map((r) => ({ id: r.id, severity: r.severity, scope: "component" })),
      ...DOCUMENT_RULES.map((r) => ({ id: r.id, severity: r.severity, scope: "document" })),
      ...CSS_RULES.map((r) => ({ id: r.id, severity: r.severity, scope: "css" })),
      {
        id: TRIGGER_CONTRACT_RULE.id,
        severity: TRIGGER_CONTRACT_RULE.severity,
        scope: "markup+css",
      },
      {
        id: SINGLE_FIXED_REGION_RULE.id,
        severity: SINGLE_FIXED_REGION_RULE.severity,
        scope: "markup+css",
      },
    ];
    expect(api.rules.map((r) => ({ id: r.id, severity: r.severity, scope: r.scope }))).toEqual(
      expected,
    );
    // The stylesheet rules of 0.8-10 are a scope of their own, not markup rules
    // wearing a different hat: the playground counts only what it can run.
    expect(api.rules.filter((r) => r.scope === "css").map((r) => r.id)).toEqual([
      "undeclared-attribute",
      "breakpoint-canon",
    ]);
    // The markup+css rules are neither: trigger-contract needs to know whether
    // the component styles its trigger, and single-fixed-region needs to resolve
    // viewport anchors across instances. A caller holding only markup cannot run
    // either — which is exactly what the playground is, and why it counts neither
    // scope.
    expect(api.rules.filter((r) => r.scope === "markup+css").map((r) => r.id)).toEqual([
      "trigger-contract",
      "single-fixed-region",
    ]);
  });

  it("reports its size", () => {
    const raw = Buffer.byteLength(bundleSource);
    const gzip = gzipSync(bundleSource).length;
    console.log(
      `browser audit bundle: ${(raw / 1024).toFixed(2)} KB raw · ${(gzip / 1024).toFixed(2)} KB gzip`,
    );
    // A tripwire, not a budget: a bundle this size cannot have pulled in a
    // filesystem shim or a second copy of the rules.
    expect(raw).toBeLessThan(64 * 1024);
  });

  it("is the current build of src/audit/browser.ts", () => {
    const result = spawnSync("node", [join(REPO, "scripts", "build-audit-browser.mjs"), "--check"], {
      cwd: REPO,
      encoding: "utf8",
    });
    expect(`${result.stdout ?? ""}${result.stderr ?? ""}`.trim()).toContain("up to date");
    expect(result.status).toBe(0);
  });
});

// ── parity ──────────────────────────────────────────────────────────────────

describe("CLI ↔ browser finding parity", () => {
  const api = loadBundle();
  const shipped = shippedManifests();
  const auditor = api.createAuditor(shipped);
  const cli = cliManifests();

  it("ships every registry component to the browser", () => {
    expect(Object.keys(shipped).length).toBe(components.length);
    expect(auditor.components).toEqual([...new Set(components.map((c) => c.name))].sort());
  });

  it("keys a duplicated name the way runAudit does — last layer loaded wins", () => {
    // `empty-state` is both a primitive and a pattern. `faqir audit` loads
    // primitives → recipes → patterns, so the pattern's manifest is the one in
    // force; a browser that sorted the payload would silently use the other.
    const dupes = components.filter((c) => c.name === "empty-state");
    expect(dupes.length).toBe(2);
    const winner = dupes[dupes.length - 1];
    expect(winner.layer).toBe("patterns");
    expect(cli.get("empty-state")).toBe(winner.manifest);
    const keys = Object.keys(shipped);
    expect(keys.indexOf("primitives/empty-state")).toBeLessThan(keys.indexOf("patterns/empty-state"));
  });

  it(`agrees with auditHtmlSource on all ${fixtures.length} shared fixtures`, () => {
    const disagreements: string[] = [];
    for (const fixture of fixtures) {
      const expected = auditHtmlSource({
        source: fixture.source,
        file: "fixture.html",
        manifests: cli,
      });
      const actual = auditor.audit(fixture.source, { file: "fixture.html" });
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        disagreements.push(
          `${fixture.label}: browser ${actual.length} vs cli ${expected.length}\n` +
            `  browser: ${JSON.stringify(actual.slice(0, 3))}\n` +
            `  cli:     ${JSON.stringify(expected.slice(0, 3))}`,
        );
      }
    }
    expect(disagreements.join("\n")).toBe("");
  });

  it("never falls back to its own error finding — the engine survives every fixture", () => {
    // `createAuditor` converts an unexpected engine failure into a synthetic
    // `audit-error` finding so a page cannot be taken down by one string. If that
    // ever fires, parity above would be comparing an excuse to a result.
    const errored = fixtures.filter((f) =>
      auditor.audit(f.source).some((r) => r.rule_id === "audit-error"),
    );
    expect(errored.map((f) => f.label)).toEqual([]);
  });

  it("honours skipRules identically", () => {
    const source = '<button data-ui="button" data-variant="nope" data-size="enormous">Go</button>';
    const skipRules = ["valid-variant"];
    expect(auditor.audit(source, { file: "f.html", skipRules })).toEqual(
      auditHtmlSource({ source, file: "f.html", manifests: cli, skipRules }),
    );
    expect(auditor.audit(source, { file: "f.html", skipRules }).map((r) => r.rule_id)).toEqual([
      "valid-size",
    ]);
  });

  // ── the stylesheet rules, in the browser (task 0.8-10) ────────────────────
  //
  // `undeclared-attribute` and `breakpoint-canon` read a *stylesheet* against a
  // manifest, so they are a second seam through the same bundle. The fixtures
  // are every registry stylesheet paired with its own manifest — the pairs the
  // registry gate checks — plus deliberately broken sheets, because a parity
  // suite over 86 clean inputs would agree on the empty array 86 times and
  // prove nothing about the finding path.
  describe("stylesheet rules", () => {
    /** The sheet a component's manifest names, beside its reference fragment. */
    const stylesheetOf = (c: (typeof components)[number]) =>
      join(dirname(c.referencePath), c.manifest.files?.css ?? `${c.name}.css`);

    const registryPairs = components
      .filter((c) => existsSync(stylesheetOf(c)))
      .map((c) => ({
        label: `css:${c.layer}/${c.name}`,
        css: readFileSync(stylesheetOf(c), "utf8"),
        manifest: c.manifest,
      }));

    const button = components.find((c) => c.name === "button")!;
    const buttonCss = readFileSync(stylesheetOf(button), "utf8");

    const brokenPairs = [
      {
        label: "css:seeded undeclared attribute",
        css: buttonCss + '\n[data-ui="button"][data-elevated] { box-shadow: none; }\n',
        manifest: button.manifest,
      },
      {
        label: "css:seeded max-width prelude",
        css: buttonCss + "\n@media (max-width: 40rem) {\n  [data-ui=\"button\"] { width: 100%; }\n}\n",
        manifest: button.manifest,
      },
      {
        label: "css:seeded off-canon floor",
        css: "@media (min-width: 37.5rem) { [data-ui=\"button\"] { gap: 0; } }",
        manifest: button.manifest,
      },
      { label: "css:empty", css: "", manifest: button.manifest },
      { label: "css:garbage", css: "}}} [data-x { @media ( { ", manifest: button.manifest },
      { label: "css:comment only", css: "/* nothing here */", manifest: button.manifest },
    ];

    const cssFixtures = [...registryPairs, ...brokenPairs];

    it(`agrees with the CLI rules on all ${cssFixtures.length} stylesheet fixtures`, () => {
      const disagreements: string[] = [];
      for (const fixture of cssFixtures) {
        const file = "fixture.css";
        const expected = [
          ...buildUndeclaredAttributeResults(fixture.css, fixture.manifest, file),
          ...buildBreakpointCanonResults(fixture.css, fixture.manifest.name, file),
        ];
        const actual = api.auditComponentCss({ css: fixture.css, manifest: fixture.manifest, file });
        if (JSON.stringify(actual) !== JSON.stringify(expected)) {
          disagreements.push(
            `${fixture.label}: browser ${actual.length} vs cli ${expected.length}\n` +
              `  browser: ${JSON.stringify(actual.slice(0, 2))}\n` +
              `  cli:     ${JSON.stringify(expected.slice(0, 2))}`,
          );
        }
      }
      expect(disagreements.join("\n")).toBe("");
    });

    it("the fixture set is not all-clean — the seeded sheets really report", () => {
      const found = brokenPairs.flatMap((f) =>
        api.auditComponentCss({ css: f.css, manifest: f.manifest }).map((r) => r.rule_id),
      );
      expect(found).toEqual(["undeclared-attribute", "breakpoint-canon", "breakpoint-canon"]);
      // …and every real registry pair is silent, in the browser as on the CLI.
      expect(
        registryPairs.flatMap((f) =>
          api.auditComponentCss({ css: f.css, manifest: f.manifest }).map((r) => r.message),
        ),
      ).toEqual([]);
      expect(registryPairs.length).toBe(86);
    });

    it("honours skipRules and defaults the file label to the component's sheet", () => {
      const dirty = brokenPairs[0];
      expect(
        api.auditComponentCss({ css: dirty.css, manifest: dirty.manifest, skipRules: ["undeclared-attribute"] }),
      ).toEqual([]);
      expect(api.auditComponentCss({ css: dirty.css, manifest: dirty.manifest })[0].file).toBe(
        "button.css",
      );
    });

    it("never throws at a page — a broken sheet reports rather than crashes", () => {
      for (const css of ["", "@media", "[", " ", "a".repeat(10_000)]) {
        const results = api.auditComponentCss({ css, manifest: button.manifest });
        expect(Array.isArray(results)).toBe(true);
        expect(results.some((r) => r.rule_id === "audit-error")).toBe(false);
      }
    });
  });

  // ── the trigger contract, through the same bundle (task 0.9-05) ───────────
  //
  // The third seam: a rule decided from a component's markup AND its stylesheet.
  // It only runs where the caller supplies the sheets, so the parity claim has
  // to be made twice — once for an auditor that was given them and once for one
  // that was not, because "the rule is silent" and "the rule never ran" look the
  // same from the outside and only one of them is parity.
  describe("the trigger contract", () => {
    const dialog = components.find((c) => c.name === "dialog")!;
    const dialogCss = readFileSync(
      join(dirname(dialog.referencePath), dialog.manifest.files?.css ?? "dialog.css"),
      "utf8",
    );
    const bare = '<div data-ui="dialog" data-state="closed"><button data-part="trigger">Open</button></div>';
    const delegated =
      '<div data-ui="dialog" data-state="closed">' +
      '<button data-part="trigger" data-ui="button" data-variant="primary">Open</button></div>';
    const styledSheet = '[data-ui="dialog"] [data-part="trigger"] { cursor: pointer; }';

    const cases = [
      { label: "neither form — a finding", source: bare, css: "" },
      { label: "delegated to a primitive — silent", source: delegated, css: "" },
      { label: "styled by its own recipe — silent", source: bare, css: styledSheet },
      { label: "both forms at once — silent", source: delegated, css: styledSheet },
      { label: "the shipped recipe, its own sheet", source: readFileSync(dialog.referencePath, "utf8"), css: dialogCss },
    ];

    it("reports a finding for neither form and stays silent for both", () => {
      for (const c of cases) {
        const withStyles = api.createAuditor(shipped, { dialog: c.css });
        const ids = withStyles.audit(c.source, { file: "f.html" }).map((r) => r.rule_id);
        const fired = ids.filter((id) => id === TRIGGER_CONTRACT_RULE.id);
        expect(fired.length, c.label).toBe(c.label.includes("a finding") ? 1 : 0);
      }
    });

    it("agrees with the CLI on every case — through the committed bundle", () => {
      for (const c of cases) {
        const styles = new Map([["dialog", c.css]]);
        const expected = auditHtmlSource({
          source: c.source,
          file: "f.html",
          manifests: cli,
          styles,
        });
        const actual = api.createAuditor(shipped, { dialog: c.css }).audit(c.source, { file: "f.html" });
        expect(JSON.stringify(actual), c.label).toBe(JSON.stringify(expected));
      }
    });

    it("skips the rule — on both sides — when the sheets were never supplied", () => {
      const ids = auditor.audit(bare, { file: "f.html" }).map((r) => r.rule_id);
      expect(ids).not.toContain(TRIGGER_CONTRACT_RULE.id);
      expect(JSON.stringify(auditor.audit(bare, { file: "f.html" }))).toBe(
        JSON.stringify(auditHtmlSource({ source: bare, file: "f.html", manifests: cli })),
      );
    });

    it("honours skipRules", () => {
      const withStyles = api.createAuditor(shipped, { dialog: "" });
      expect(
        withStyles
          .audit(bare, { file: "f.html", skipRules: [TRIGGER_CONTRACT_RULE.id] })
          .map((r) => r.rule_id),
      ).not.toContain(TRIGGER_CONTRACT_RULE.id);
    });
  });

  // ── fixed-region uniqueness, through the same bundle (task 0.9-06) ────────
  describe("fixed-region uniqueness", () => {
    const toast = components.find((component) => component.name === "toast")!;
    const toastCss = readFileSync(
      join(dirname(toast.referencePath), toast.manifest.files?.css ?? "toast.css"),
      "utf8",
    );
    const container = (position: string, id: string) =>
      `<div data-ui="toast" data-part="container" data-variant="${position}" ` +
      `role="region" aria-label="Notifications" id="${id}"></div>`;
    const cases = [
      {
        label: "two top-right regions — one finding",
        source: container("top-right", "first") + container("top-right", "second"),
        count: 1,
      },
      { label: "one region — silent", source: container("top-right", "only"), count: 0 },
      {
        label: "four distinct positions — silent",
        source: ["top-right", "top-left", "bottom-right", "bottom-left"]
          .map((position) => container(position, position))
          .join(""),
        count: 0,
      },
      {
        label: "hidden duplicate — silent",
        source:
          container("top-right", "visible") +
          `<div hidden>${container("top-right", "hidden")}</div>`,
        count: 0,
      },
      {
        label: "shipped reference — silent",
        source: readFileSync(toast.referencePath, "utf8"),
        count: 0,
      },
    ];

    it("reports the seeded collision and stays silent for the valid fixtures", () => {
      const withStyles = api.createAuditor(shipped, { toast: toastCss });
      for (const fixture of cases) {
        const findings = withStyles
          .audit(fixture.source, { file: "f.html" })
          .filter((result) => result.rule_id === SINGLE_FIXED_REGION_RULE.id);
        expect(findings.length, fixture.label).toBe(fixture.count);
      }
    });

    it("agrees with the CLI on the shared fixture set through the committed bundle", () => {
      for (const fixture of cases) {
        const styleMap = new Map([["toast", toastCss]]);
        const expected = auditHtmlSource({
          source: fixture.source,
          file: "f.html",
          manifests: cli,
          styles: styleMap,
        });
        const actual = api
          .createAuditor(shipped, { toast: toastCss })
          .audit(fixture.source, { file: "f.html" });
        expect(JSON.stringify(actual), fixture.label).toBe(JSON.stringify(expected));
      }
    });

    it("skips the rule without styles and honours skipRules with styles", () => {
      const collision = cases[0].source;
      expect(auditor.audit(collision).map((result) => result.rule_id)).not.toContain(
        SINGLE_FIXED_REGION_RULE.id,
      );
      expect(
        api
          .createAuditor(shipped, { toast: toastCss })
          .audit(collision, { skipRules: [SINGLE_FIXED_REGION_RULE.id] })
          .map((result) => result.rule_id),
      ).not.toContain(SINGLE_FIXED_REGION_RULE.id);
    });
  });

  it("finds the playground's own sample dirty — the demo demonstrates something", () => {
    const seed = readFileSync(join(REPO, "site", "content", "playground.html"), "utf8");
    const findings = auditor.audit(seed, { file: "playground.html" });
    const rules = new Set(findings.map((r) => r.rule_id));
    expect(rules.has("required-slot")).toBe(true);
    expect(rules.has("valid-variant")).toBe(true);
    expect(rules.has("valid-size")).toBe(true);
    expect(rules.has("duplicate-id")).toBe(true);
    expect(findings).toEqual(
      auditHtmlSource({ source: seed, file: "playground.html", manifests: cli }),
    );
  });
});
