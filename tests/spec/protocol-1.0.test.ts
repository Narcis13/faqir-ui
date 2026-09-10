// ═══════════════════════════════════════════════════════════════════════════
// Protocol 1.0 + manifest schema 1.0 — the freeze, enforced  [task 1.0-01]
// ═══════════════════════════════════════════════════════════════════════════
//
// A frozen spec that nothing checks is a promise with no mechanism. This suite
// is the mechanism, in four parts:
//
//   1. **executable documentation** — every ```html block in `SPEC-1.0.md` is
//      audited against the shipped registry manifests at every severity. The
//      spec cannot show markup the framework would reject, and it cannot go
//      stale when a component's contract tightens: the example fails first.
//   2. **the spec IS `src/protocol.ts`** — every normative table is parsed back
//      out of the markdown and compared, in both directions, with the module the
//      generators and the docs site read. Neither can move without the other.
//   3. **one version, everywhere** — the CLI constant, `package.json`, the
//      schema's `schema_version`, the spec's header and the published site path
//      state the same numbers.
//   4. **schema 1.0** — every registry manifest validates against it, the file
//      declares the freeze, and the versioned copy the site publishes is
//      byte-identical to the repository's.
//
// Part 2 is the one that earns its keep over time. The other three fail loudly
// on the day someone breaks them; a drift between prose and code is silent, and
// is exactly what a freeze cannot survive.

import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Glob } from "bun";
import { auditHtmlSource } from "../../src/audit/checker";
import { loadRegistryManifestMap } from "../../src/utils/components";
import { validateAgainstSchema } from "../../src/utils/json-schema";
import { DRAFT_07_META_SCHEMA } from "../../src/utils/draft-07-meta";
import { PROTOCOL_ATTRIBUTES, TIERS, BREAKPOINT_LIST } from "../../src/utils/breakpoints";
import { VERSION, PROTOCOL_VERSION, SCHEMA_VERSION } from "../../src/version";
import {
  AMENDMENT_POLICY_URL,
  PUBLISHED_LOCATIONS,
  SCHEMA_ID_URL,
  SITE_ORIGIN,
  SPEC_MARKDOWN_URL,
  SPEC_RENDERED_URL,
} from "../../src/canonical";
import {
  AMENDMENT_RULES,
  ATTRIBUTE_SPECS,
  FREEZE_STATEMENT,
  PROTOCOL_RULES,
  PROTOCOL_STATUS,
  PROTOCOL_VALUE_PATTERN,
  PROTOCOL_VALUE_RE,
  RESPONSIVE_RULES,
  SANCTIONED_ATTRIBUTES,
  SCHEMA_CHANGELOG,
  SPEC_FILE,
  SPEC_MARKERS,
  TOKEN_MODIFIERS,
  amendmentsAt,
  isProtocolValue,
  isTokenModifier,
  mayTakeTierSuffix,
  parseSpecAmendments,
  parseSpecAttributes,
  parseSpecChangelog,
  parseSpecExamples,
  parseSpecFences,
  parseSpecList,
  parseSpecModifiers,
  parseSpecTable,
  parseSpecVersions,
  specText,
} from "../../src/protocol";
import {
  SPEC_PAGE,
  SPEC_PREFIX,
  SPEC_MARKDOWN_FILE,
  SPEC_SCHEMA_FILE,
  SCHEMA_FILE,
  buildDocsSite,
} from "../../src/generator/docs";

const ROOT = join(import.meta.dir, "../..");
const SPEC = readFileSync(join(ROOT, SPEC_FILE), "utf8");
const SCHEMA = JSON.parse(readFileSync(join(ROOT, SCHEMA_FILE), "utf8")) as Record<string, any>;
const manifests = await loadRegistryManifestMap(join(ROOT, "registry"));

/** Both sides of every comparison go through the same normalizer. */
const norm = (value: string) => specText(value);

/** …and prose comparisons also ignore the spec's hard line wrapping. */
const flow = (value: string) => norm(value).replace(/\s+/g, " ");

async function listManifests(pattern: string): Promise<string[]> {
  const out: string[] = [];
  for await (const rel of new Glob(pattern).scan({ cwd: ROOT })) out.push(join(ROOT, rel));
  return out.sort();
}

// ── 1. executable documentation ─────────────────────────────────────────────

describe("SPEC-1.0.md — every example is audit-clean", () => {
  const examples = parseSpecExamples(SPEC);

  it("carries markup for every normative section that claims a shape", () => {
    // Tripwire: a spec that stopped *showing* the protocol would still pass the
    // audit sweep below, vacuously.
    expect(examples.length).toBeGreaterThanOrEqual(6);
    const sections = new Set(examples.map((e) => e.section.split(" ")[0]));
    for (const chapter of ["2.", "3.", "4.", "5."]) {
      expect(
        [...sections].some((s) => s.startsWith(chapter)),
        `§${chapter} states a contract and shows no markup`,
      ).toBe(true);
    }
  });

  it("audits every ```html block at every severity", () => {
    const findings = examples.flatMap((e) =>
      auditHtmlSource({ source: e.html, file: `${SPEC_FILE}[${e.index}] ${e.section}`, manifests }).map(
        (r) => `${r.file}:${r.line} [${r.severity}/${r.rule_id}] ${r.message}`,
      ),
    );
    expect(findings.join("\n")).toBe("");
  });

  it("uses only values the shipped manifests declare — and demonstrates all five", () => {
    const markup = examples.map((e) => e.html).join("\n");
    for (const attr of PROTOCOL_ATTRIBUTES) {
      expect(markup, `no example demonstrates ${attr}`).toContain(`${attr}="`);
    }
    for (const m of TOKEN_MODIFIERS) {
      expect(markup, `no example demonstrates ${m.attr}`).toContain(`${m.attr}="`);
    }
    // And the tier suffix, which is the whole of §5.
    expect(markup).toMatch(/data-[a-z-]+-(?:sm|md|lg|xl)="/);
  });

  it("leaves no fenced block unverified — whatever its language", () => {
    // "Executable documentation" has to mean every block, not just the ones a
    // markup auditor happens to understand. Each language below is checked by
    // the checker that fits it, and an unknown language fails here rather than
    // slipping in as a quiet exemption.
    const verified = new Set(["html", "css", "json", "text"]);
    const unknown = parseSpecFences(SPEC)
      .map((f) => f.lang)
      .filter((lang) => !verified.has(lang));
    expect(unknown).toEqual([]);
  });

  it("the CSS block obeys the very selector rule it demonstrates", () => {
    const css = parseSpecFences(SPEC).filter((f) => f.lang === "css");
    expect(css.length).toBeGreaterThan(0);
    for (const fence of css) {
      const selectors = fence.body
        .split("\n")
        .map((line) => line.split("{")[0].trim())
        .filter(Boolean);
      expect(selectors.length).toBeGreaterThan(0);
      for (const selector of selectors) {
        // §3.2: attribute selectors only — no class, no id.
        expect(selector, `${selector} is not an attribute selector`).not.toMatch(/(^|[\s>+~])[.#]/);
        expect(selector).toMatch(/^\[data-/);
      }
    }
  });

  it("the JSON block is a manifest fragment the published schema accepts", () => {
    const json = parseSpecFences(SPEC).filter((f) => f.lang === "json");
    expect(json.length).toBeGreaterThan(0);
    const defs = SCHEMA.definitions as Record<string, any>;
    const withDefs = (name: string) => ({ ...defs[name], definitions: defs });
    for (const fence of json) {
      const parsed = JSON.parse(fence.body) as Record<string, any>;
      for (const group of Object.values(parsed.variants ?? {})) {
        expect(validateAgainstSchema(withDefs("variant"), group)).toEqual([]);
      }
      for (const prop of Object.values(parsed.props ?? {})) {
        expect(validateAgainstSchema(withDefs("prop"), prop)).toEqual([]);
      }
      // The fragment has to demonstrate something, or it proves nothing.
      expect(Object.keys(parsed.variants ?? {}).length + Object.keys(parsed.props ?? {}).length)
        .toBeGreaterThan(0);
    }
  });

  it("the grammar block and the compiled pattern describe the same language", () => {
    const text = parseSpecFences(SPEC).find((f) => f.lang === "text");
    expect(text, "§3.1 states the grammar as a production").toBeDefined();
    // The production names a hyphen-joined repetition of one character class,
    // and that class is the one the compiled pattern uses.
    expect(text!.body).toContain("[a-z0-9]+");
    expect(text!.body).toMatch(/word\s*\(\s*"-"\s*word\s*\)\*/);
  });

  it("every protocol value in every example obeys the published grammar", () => {
    const offenders: string[] = [];
    for (const e of examples) {
      for (const attr of PROTOCOL_ATTRIBUTES) {
        const re = new RegExp(`${attr}="([^"]*)"`, "g");
        for (const m of e.html.matchAll(re)) {
          if (!isProtocolValue(m[1])) offenders.push(`[${e.index}] ${attr}="${m[1]}"`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

// ── 2. the spec IS src/protocol.ts ──────────────────────────────────────────

describe("SPEC-1.0.md and src/protocol.ts describe one protocol", () => {
  it("states the freeze, the status and both versions in its header", () => {
    const versions = parseSpecVersions(SPEC);
    expect(versions.protocol).toBe(PROTOCOL_VERSION);
    expect(versions.schema).toBe(SCHEMA_VERSION);
    expect(versions.status).toBe(PROTOCOL_STATUS);
    // The freeze sentence is the contract; it is stated verbatim (the spec hard
    // wraps its prose, so the comparison ignores line breaks and nothing else).
    expect(flow(SPEC).includes(flow(FREEZE_STATEMENT)), "the freeze sentence is not stated verbatim").toBe(
      true,
    );
  });

  it("lists the five attributes, in order, with their owners and vocabularies", () => {
    const rows = parseSpecAttributes(SPEC);
    expect(rows.map((r) => r.attr)).toEqual([...PROTOCOL_ATTRIBUTES]);
    expect(rows.map((r) => r.attr)).toEqual(ATTRIBUTE_SPECS.map((a) => a.attr));
    for (const [i, spec] of ATTRIBUTE_SPECS.entries()) {
      const row = rows[i];
      expect(row.purpose, `${spec.attr} purpose`).toBe(norm(spec.purpose));
      expect(row.owner, `${spec.attr} owner`).toBe(spec.owner);
      expect(row.vocabulary, `${spec.attr} vocabulary`).toBe(norm(spec.vocabulary));
      expect(row.rule, `${spec.attr} rule`).toBe(spec.rule);
    }
  });

  it("names an audit rule that actually exists for every attribute that has one", async () => {
    const rules = readFileSync(join(ROOT, "src/audit/rules.ts"), "utf8");
    for (const spec of ATTRIBUTE_SPECS) {
      if (!spec.rule) continue;
      expect(rules, `${spec.rule} is published but not implemented`).toContain(`id: "${spec.rule}"`);
    }
  });

  it("carries the seven protocol rules verbatim", () => {
    const listed = parseSpecList(SPEC, SPEC_MARKERS.rules);
    expect(listed).toEqual([...PROTOCOL_RULES]);
  });

  it("carries the responsive rules verbatim, derived from the canon", () => {
    const listed = parseSpecList(SPEC, SPEC_MARKERS.responsive);
    expect(listed).toEqual([...RESPONSIVE_RULES]);
    // Derived, not typed: the ladder in the prose is the ladder in the code.
    const ladder = listed.join(" ");
    for (const b of BREAKPOINT_LIST) expect(ladder).toContain(`\`${b.tier}\` ${b.rem}rem`);
    expect(ladder).toContain(TIERS.join(", "));
  });

  it("lists the three token modifiers with their complete vocabularies", () => {
    const rows = parseSpecModifiers(SPEC);
    expect(rows.map((r) => r.attr)).toEqual(TOKEN_MODIFIERS.map((m) => m.attr));
    for (const [i, m] of TOKEN_MODIFIERS.entries()) {
      expect(rows[i].values, `${m.attr} values`).toEqual([...m.values]);
      expect(rows[i].purpose, `${m.attr} purpose`).toBe(norm(m.purpose));
      expect(rows[i].owner, `${m.attr} owner`).toBe(m.owner);
    }
  });

  it("carries the amendment table row for row, both directions", () => {
    const rows = parseSpecAmendments(SPEC);
    expect(rows.length).toBe(AMENDMENT_RULES.length);
    for (const [i, rule] of AMENDMENT_RULES.entries()) {
      expect(rows[i].change).toBe(norm(rule.change));
      expect(rows[i].level).toBe(rule.level);
      expect(rows[i].because).toBe(norm(rule.because));
    }
    // A taxonomy with an empty side would classify nothing.
    expect(amendmentsAt("additive").length).toBeGreaterThan(0);
    expect(amendmentsAt("major").length).toBeGreaterThan(0);
    expect(amendmentsAt("additive").length + amendmentsAt("major").length).toBe(
      AMENDMENT_RULES.length,
    );
  });

  it("names the change that would end the freeze — the five attributes themselves", () => {
    const major = amendmentsAt("major").map((r) => norm(r.change).toLowerCase());
    expect(major.some((c) => c.includes("five attributes"))).toBe(true);
    expect(major.some((c) => c.includes("value grammar"))).toBe(true);
    expect(major.some((c) => c.includes("breakpoint canon"))).toBe(true);
    expect(major.some((c) => c.includes("required"))).toBe(true);
  });

  it("carries the schema changelog, ending at the frozen version", () => {
    const rows = parseSpecChangelog(SPEC);
    expect(rows.map((r) => r.version)).toEqual(SCHEMA_CHANGELOG.map((c) => c.version));
    for (const [i, c] of SCHEMA_CHANGELOG.entries()) {
      expect(rows[i].task).toBe(c.task);
      expect(rows[i].note).toBe(norm(c.note));
      expect(rows[i].breaking).toBe(c.breaking);
    }
    expect(rows.at(-1)!.version).toBe(SCHEMA_VERSION);
    // The 0.x history is what the freeze is measured from — it has to be there.
    expect(rows.filter((r) => r.version.startsWith("0.")).length).toBeGreaterThan(0);
  });

  it("publishes every marker the parsers depend on", () => {
    for (const [name, marker] of Object.entries(SPEC_MARKERS)) {
      expect(SPEC, `${name} marker missing from the spec`).toContain(marker);
    }
    // Every table marker resolves to a non-empty table.
    for (const marker of [SPEC_MARKERS.attributes, SPEC_MARKERS.modifiers, SPEC_MARKERS.amendments, SPEC_MARKERS.changelog]) {
      expect(parseSpecTable(SPEC, marker).length).toBeGreaterThan(0);
    }
  });
});

describe("the protocol module's own invariants", () => {
  it("keeps the five and the three disjoint", () => {
    for (const attr of PROTOCOL_ATTRIBUTES) expect(isTokenModifier(attr)).toBe(false);
    for (const m of TOKEN_MODIFIERS) expect(PROTOCOL_ATTRIBUTES).not.toContain(m.attr as never);
    expect(SANCTIONED_ATTRIBUTES.length).toBe(PROTOCOL_ATTRIBUTES.length + TOKEN_MODIFIERS.length);
    expect(new Set(SANCTIONED_ATTRIBUTES).size).toBe(SANCTIONED_ATTRIBUTES.length);
  });

  it("refuses a tier suffix on anything the protocol sanctions", () => {
    for (const attr of SANCTIONED_ATTRIBUTES) expect(mayTakeTierSuffix(attr)).toBe(false);
    expect(mayTakeTierSuffix("data-cols")).toBe(true);
    expect(mayTakeTierSuffix("cols")).toBe(false); // must be the `data-` form
  });

  it("accepts exactly the value grammar it publishes", () => {
    for (const ok of ["primary", "2xl", "16-9", "bottom-left", "a1"]) {
      expect(isProtocolValue(ok), ok).toBe(true);
    }
    for (const bad of ["", "Primary", "is_open", "a b", "-lead", "trail-", "a--b", " x"]) {
      expect(isProtocolValue(bad), JSON.stringify(bad)).toBe(false);
    }
    expect(PROTOCOL_VALUE_RE.source).toBe(PROTOCOL_VALUE_PATTERN);
    expect(SPEC).toContain(PROTOCOL_VALUE_PATTERN);
  });

  it("every value the registry actually ships on the five obeys that grammar", () => {
    // The grammar is only a contract if the library it describes already keeps
    // it — this is the direction that would have caught a `data-size="2XL"`.
    const offenders: string[] = [];
    for (const [name, m] of manifests) {
      for (const slot of Object.keys(m.slots ?? {})) {
        if (!isProtocolValue(slot)) offenders.push(`${name}: data-part="${slot}"`);
      }
      for (const state of Object.keys(m.states ?? {})) {
        if (!isProtocolValue(state)) offenders.push(`${name}: data-state="${state}"`);
      }
      for (const group of Object.values(m.variants ?? {})) {
        if (group.attr !== "data-variant" && group.attr !== "data-size") continue;
        for (const value of group.values ?? []) {
          if (!isProtocolValue(value)) offenders.push(`${name}: ${group.attr}="${value}"`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

// ── 3. one version, everywhere ──────────────────────────────────────────────

describe("version constants agree across the CLI, the schema, the spec and the site", () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { version: string };

  it("the CLI constant matches package.json", () => {
    expect(VERSION).toBe(pkg.version);
  });

  // The gap this suite shipped with: it read the root package.json and stopped.
  // Meanwhile `@faqir-ui/{forms,mcp,react,vue}` sat at 0.1.0 and the root at
  // 0.2.4 — six packages published from one commit, four of them lying about
  // which commit that was, and nothing here could see it.
  it("every published workspace package moves in lockstep with the root", () => {
    const skew: string[] = [];
    for (const name of ["core", "forms", "mcp", "react", "vue"]) {
      const wp = JSON.parse(
        readFileSync(join(ROOT, "packages", name, "package.json"), "utf8"),
      ) as { name: string; version: string };
      if (wp.version !== pkg.version) skew.push(`${wp.name}@${wp.version}`);
    }
    expect(skew, `expected every package at ${pkg.version}`).toEqual([]);
  });

  // `Faqir.version` is what a consumer asks the engine at runtime. It is
  // injected by `scripts/build-core.mjs` from package.json; this asserts the
  // committed artifact carries the injection, so shipping without a rebuild
  // fails here rather than in someone's console.
  it("the built engine reports the package version at runtime", () => {
    const built = readFileSync(join(ROOT, "registry/core/faqir-core.js"), "utf8");
    const match = built.match(/version:\s*'([^']*)',\s*\/\/ @faqir:version/);
    expect(match, "faqir-core.js has no @faqir:version marker — rebuild with `bun run build:core`")
      .not.toBeNull();
    expect(match![1]).toBe(pkg.version);
  });

  it("the schema states the frozen schema and protocol versions", () => {
    expect(SCHEMA.schema_version).toBe(SCHEMA_VERSION);
    expect(SCHEMA.protocol_version).toBe(PROTOCOL_VERSION);
    expect(SCHEMA.stability).toBe(PROTOCOL_STATUS);
  });

  it("the spec document's name carries its own version", () => {
    expect(SPEC_FILE).toBe(`SPEC-${PROTOCOL_VERSION}.md`);
  });

  it("the published paths carry the version — and only that version", () => {
    expect(SPEC_PREFIX).toBe(`spec/${PROTOCOL_VERSION}/`);
    expect(SPEC_PAGE).toBe(`spec/${PROTOCOL_VERSION}/index.html`);
    expect(SPEC_MARKDOWN_FILE).toBe(`spec/${PROTOCOL_VERSION}/spec.md`);
    expect(SPEC_SCHEMA_FILE).toBe(`spec/${PROTOCOL_VERSION}/${SCHEMA_FILE}`);
  });

  it("the schema's $id is the alias constant, not a hand-typed URL", () => {
    expect(SCHEMA.$id).toBe(SCHEMA_ID_URL);
  });

  it("the amendment policy the schema points at is a section of the published spec", () => {
    expect(SCHEMA.amendment_policy).toBe(AMENDMENT_POLICY_URL);
    // The anchor has to be a heading that exists, or the link lands at the top
    // of a 500-line document and the reader is on their own.
    const anchor = AMENDMENT_POLICY_URL.split("#")[1]!;
    const headings = [...SPEC.matchAll(/^## (.+)$/gm)].map(([, h]) =>
      h
        .toLowerCase()
        .replace(/[^\w\s-]/g, "")
        .trim()
        .replace(/\s+/g, "-"),
    );
    expect(headings, `#${anchor} is not a heading in ${SPEC_FILE}`).toContain(anchor);
  });

  it("the spec's published-locations table names every canonical URL", () => {
    for (const url of PUBLISHED_LOCATIONS) {
      expect(SPEC, `${url} is canonical but not documented in §10`).toContain(url);
    }
  });

  it("the canonical spec URLs address the spec document this version names", () => {
    expect(SPEC_MARKDOWN_URL).toContain(SPEC_FILE);
    expect(SPEC_RENDERED_URL).toContain(SPEC_FILE);
  });

  it("the site the generator builds is a deployment, not the contract's identity", () => {
    // The dead-domain lesson, pinned: the schema `$id` must never be derived
    // from wherever the docs happen to be hosted. `https://faqir.dev` was both
    // at once, and when it stopped resolving it took the frozen protocol's
    // canonical URL with it.
    expect(SCHEMA_ID_URL.startsWith(SITE_ORIGIN)).toBe(false);
    for (const url of PUBLISHED_LOCATIONS) {
      expect(url.startsWith(SITE_ORIGIN), `${url} is pinned to the docs host`).toBe(false);
    }
  });

  it("the site still serves the spec and schema at their versioned paths", () => {
    // Unchanged by the origin move: these are the generator's own output paths,
    // and `docs-agents.test.ts` hard-codes them as the site's machine contract.
    expect(SPEC_PREFIX).toBe(`spec/${PROTOCOL_VERSION}/`);
    expect(SPEC_MARKDOWN_FILE).toBe(`${SPEC_PREFIX}spec.md`);
    expect(SPEC_SCHEMA_FILE).toBe(`${SPEC_PREFIX}${SCHEMA_FILE}`);
  });
});

// ── 4. schema 1.0 ───────────────────────────────────────────────────────────

describe("manifest schema 1.0", () => {
  it("is valid JSON Schema and declares the freeze", () => {
    expect(validateAgainstSchema(DRAFT_07_META_SCHEMA, SCHEMA)).toEqual([]);
    expect(SCHEMA.$schema).toBe("http://json-schema.org/draft-07/schema#");
    expect(SCHEMA.stability).toBe("frozen");
    expect(String(SCHEMA.description)).toContain("FROZEN");
  });

  it("carries its own 0.x changelog, matching src/protocol.ts", () => {
    const rows = SCHEMA.changelog as { version: string; task: string; note: string; breaking: boolean }[];
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.map((r) => r.version)).toEqual(SCHEMA_CHANGELOG.map((c) => c.version));
    for (const [i, c] of SCHEMA_CHANGELOG.entries()) {
      expect(rows[i].task).toBe(c.task);
      expect(rows[i].note).toBe(c.note);
      expect(rows[i].breaking).toBe(c.breaking);
    }
  });

  it("keeps the 0.8-02 fields that 1.0 freezes", () => {
    const defs = SCHEMA.definitions as Record<string, any>;
    expect(defs.componentManifest.properties.props).toBeDefined();
    expect(defs.prop).toBeDefined();
    expect(defs.variant.properties.responsive.type).toBe("boolean");
    // Frozen means the required set is closed — a new required field is a 2.0.
    expect(defs.componentManifest.required).toContain("anatomy");
    expect(defs.componentManifest.required).not.toContain("props");
    expect(defs.componentManifest.required).not.toContain("changes");
  });

  it("validates every registry manifest — component and theme", async () => {
    const files = [
      ...(await listManifests("registry/**/*.manifest.json")),
      ...(await listManifests("registry/themes/*.theme.json")),
    ];
    expect(files.length).toBeGreaterThan(50);
    const failures: string[] = [];
    for (const file of files) {
      const errors = validateAgainstSchema(SCHEMA, await Bun.file(file).json());
      if (errors.length) {
        failures.push(`${file}: ${errors.map((e) => `${e.path} ${e.message}`).join("; ")}`);
      }
    }
    expect(failures).toEqual([]);
  });
});

// ── the published site ──────────────────────────────────────────────────────

describe("the site publishes the spec and the schema at their versioned URLs", () => {
  const files = buildDocsSite();
  const byPath = new Map(files.map((f) => [f.path, f.content]));

  it("serves the rendered spec, its markdown source and the versioned schema", () => {
    for (const path of [SPEC_PAGE, SPEC_MARKDOWN_FILE, SPEC_SCHEMA_FILE]) {
      expect(byPath.has(path), `the site does not serve ${path}`).toBe(true);
    }
  });

  it("serves the spec markdown byte-identical to the repository's", () => {
    expect(byPath.get(SPEC_MARKDOWN_FILE)).toBe(SPEC);
  });

  it("serves the versioned schema byte-identical to the `$id` alias", () => {
    const versioned = byPath.get(SPEC_SCHEMA_FILE)!;
    expect(versioned).toBe(byPath.get(SCHEMA_FILE)!);
    expect(JSON.parse(versioned).schema_version).toBe(SCHEMA_VERSION);
  });

  it("renders every normative table onto the page", () => {
    const page = byPath.get(SPEC_PAGE)!;
    for (const a of ATTRIBUTE_SPECS) expect(page).toContain(`<code>${a.attr}</code>`);
    for (const m of TOKEN_MODIFIERS) expect(page).toContain(`<code>${m.attr}</code>`);
    for (const r of AMENDMENT_RULES) expect(page).toContain(specText(r.change));
    for (const c of SCHEMA_CHANGELOG) expect(page).toContain(`<code>${c.version}</code>`);
    expect(page).toContain(`id="amendments"`); // the schema's amendment_policy anchor
    expect(page).toContain(specText(FREEZE_STATEMENT));
  });

  it("renders the same example bytes the audit sweep proved clean", () => {
    const page = byPath.get(SPEC_PAGE)!;
    const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const examples = parseSpecExamples(SPEC);
    expect(examples.length).toBeGreaterThan(0);
    for (const e of examples) {
      expect(page, `example ${e.index} (${e.section}) is not on the page`).toContain(escape(e.html));
    }
  });

  it("reaches the spec from the navigation of every page", () => {
    const home = byPath.get("index.html")!;
    expect(home).toContain(`href="${SPEC_PAGE}"`);
  });

  it("audits clean at every severity, like every other generated page", () => {
    const findings = auditHtmlSource({
      source: byPath.get(SPEC_PAGE)!,
      file: SPEC_PAGE,
      manifests,
    }).map((r) => `${r.line} [${r.severity}/${r.rule_id}] ${r.message}`);
    expect(findings.join("\n")).toBe("");
  });
});
