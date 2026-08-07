// ═══════════════════════════════════════════════════════════════════════════
// Layout documentation — one system, five surfaces  [task 0.8-12]
// ═══════════════════════════════════════════════════════════════════════════
//
// v0.8 built the layout system; this task made every surface an agent reads
// teach it. Five surfaces now describe one thing — README.md, docs/layout.md,
// the generated skill, `faqir context` (llms.txt / llms-full.txt / context.json)
// and the docs site's token reference — and prose that agrees today drifts
// tomorrow unless something checks. This suite is that something:
//
//   1. **executable documentation** — every HTML block in `docs/layout.md` and
//      in README's Layout System section passes `faqir audit` at every severity;
//   2. **no undeclared documentation** — every `data-*` attribute those blocks
//      and README's tables use resolves to a manifest declaration, and every
//      attribute the five layout manifests declare is documented (the inverse of
//      0.8-10's `undeclared-attribute` rule, pointed at the docs instead of CSS);
//   3. **one source** — the doctrine module names components, tokens and
//      archetypes that actually exist, and each surface carries what the module
//      says rather than a copy someone kept up to date by hand.
//
// The audit direction matters: an example can be audit-clean and still be
// *wrong*, because the HTML rules validate the values of declared attributes and
// say nothing about an attribute nobody declared. `data-align-text` on a
// `container` (a `stack` prop, silently inert there) is exactly that shape, and
// section 2 is what catches it.

import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { auditHtmlSource } from "../../src/audit/checker";
import { loadRegistryManifestMap } from "../../src/utils/components";
import { parseDocument, type ParsedElement } from "../../src/parser/html-parser";
import type { Manifest } from "../../src/manifest";
import {
  BREAKPOINT_LIST,
  PROTOCOL_ATTRIBUTES,
  parseResponsiveAttribute,
} from "../../src/utils/breakpoints";
import {
  ARCHETYPES,
  ARCHETYPE_SECTION_HEADING,
  LAYOUT_MECHANISMS,
  LAYOUT_PRIMITIVES,
  LAYOUT_RULES,
  MEASURE_TOKENS,
  RESPONSIVE_GRAMMAR,
  RHYTHM_TOKENS,
  parseArchetypes,
} from "../../src/utils/layout";
import {
  composeContextData,
  formatContextCursorRules,
  formatContextJSON,
  formatContextLlms,
  formatContextLlmsFull,
  formatContextMarkdown,
} from "../../src/generator/context";
import { buildDocsSite, esc, LAYOUT_PAGE, parseTokenReference } from "../../src/generator/docs";
import { generateShippedSkillFiles } from "../../src/generator/skill";

const ROOT = join(import.meta.dir, "../..");
const LAYOUT_DOC = readFileSync(join(ROOT, "docs/layout.md"), "utf8");
const README = readFileSync(join(ROOT, "README.md"), "utf8");
const PLAN = readFileSync(join(ROOT, "FAQIR-PLAN.md"), "utf8");
const manifests = await loadRegistryManifestMap(join(ROOT, "registry"));

/** README's Layout System section — up to the next H2. */
function readmeLayoutSection(): string {
  const start = README.indexOf("## Layout System");
  expect(start, "README must carry a Layout System section").toBeGreaterThan(-1);
  const rest = README.slice(start + 3);
  const end = rest.indexOf("\n## ");
  return end === -1 ? rest : rest.slice(0, end);
}

/** Fenced ```html blocks of a markdown body. */
function htmlFences(body: string): string[] {
  return [...body.matchAll(/```html\n([\s\S]*?)```/g)].map((m) => m[1]);
}

const README_SECTION = readmeLayoutSection();

// ── 1. executable documentation ─────────────────────────────────────────────

describe("layout docs — every example is audit-clean", () => {
  const audit = (source: string, label: string): string[] =>
    auditHtmlSource({ source, file: label, manifests }).map(
      (r) => `${r.file}:${r.line} [${r.severity}/${r.rule_id}] ${r.message}`,
    );

  it("audits every HTML block in docs/layout.md at every severity", () => {
    const fences = htmlFences(LAYOUT_DOC);
    // The grammar block, the five-primitive tour, and one per archetype.
    expect(fences.length, "docs/layout.md shows the system, not just describes it")
      .toBeGreaterThanOrEqual(2 + ARCHETYPES.length);

    const findings = fences.flatMap((source, i) => audit(source, `docs/layout.md[${i}]`));
    expect(findings.join("\n")).toBe("");
  });

  it("audits every HTML block in README's Layout System section", () => {
    const fences = htmlFences(README_SECTION);
    expect(fences.length, "each primitive is shown in markup").toBeGreaterThanOrEqual(
      LAYOUT_PRIMITIVES.length,
    );

    const findings = fences.flatMap((source, i) => audit(source, `README.md#layout[${i}]`));
    expect(findings.join("\n")).toBe("");
  });

  it("ships an archetype per documented page shape, each with markup", () => {
    const parsed = parseArchetypes(LAYOUT_DOC);
    expect(parsed.map((a) => a.id)).toEqual(ARCHETYPES.map((a) => a.id));
    expect(parsed.map((a) => a.title)).toEqual(ARCHETYPES.map((a) => a.title));
    for (const a of parsed) {
      expect(a.summary.length, `${a.id} has a summary`).toBeGreaterThan(40);
      expect(a.html.length, `${a.id} has markup`).toBeGreaterThan(100);
      expect(audit(a.html, `archetype:${a.id}`).join("\n")).toBe("");
    }
  });

  it("uses all five layout primitives across the archetypes", () => {
    const markup = parseArchetypes(LAYOUT_DOC)
      .map((a) => a.html)
      .join("\n");
    for (const p of LAYOUT_PRIMITIVES) {
      expect(markup, `no archetype uses ${p.name}`).toContain(`data-ui="${p.name}"`);
    }
    // And the ladder is demonstrated, not only described.
    const suffixed = [...markup.matchAll(/\b(data-[a-z-]+)="/g)]
      .map((m) => m[1])
      .filter((name) => parseResponsiveAttribute(name) !== null);
    expect(suffixed.length, "an archetype demonstrates a tier attribute").toBeGreaterThan(0);
  });
});

// ── 2. no undeclared documentation (the inverse of 0.8-10) ──────────────────

/** Every attribute a manifest declares under its own name, split by kind. */
interface Declared {
  plain: Set<string>;
  responsive: Set<string>;
  /** Props the manifest itself says go on a CHILD (`data-push`, `data-span`). */
  child: Set<string>;
}

function declaredAttributes(m: Manifest): Declared {
  const plain = new Set<string>();
  const responsive = new Set<string>();
  const child = new Set<string>();
  for (const v of Object.values(m.variants ?? {})) {
    if (!v.attr) continue;
    plain.add(v.attr);
    if (v.responsive === true) responsive.add(v.attr);
  }
  for (const p of Object.values(m.props ?? {})) {
    if (!p.attr) continue;
    plain.add(p.attr);
    // The manifest's own prose is the source: every child-applied prop in the
    // registry says "Written on a CHILD of the …, never the root".
    if (/\bCHILD\b/.test(p.description ?? "")) child.add(p.attr);
  }
  for (const s of Object.values(m.states ?? {})) {
    const attr = (s as { attr?: string })?.attr;
    if (attr) plain.add(attr);
  }
  return { plain, responsive, child };
}

/** Token modifiers that are sanctioned framework-wide, not per component. */
const SANCTIONED = new Set([...PROTOCOL_ATTRIBUTES, "data-theme", "data-density", "data-motion"]);

/**
 * Findings for markup that uses a `data-*` attribute nothing declares. An
 * attribute reaches an element from its own `data-ui` manifest, or — for a bare
 * wrapper, or a child-applied prop — from the nearest enclosing component.
 */
function undeclaredAttributes(source: string, label: string): string[] {
  const out: string[] = [];
  const owner = (el: ParsedElement): Manifest | undefined => {
    const name = el.attrs["data-ui"];
    return name ? manifests.get(name) : undefined;
  };
  for (const el of parseDocument(source, label).elements) {
    const own = owner(el);
    let scope: Manifest | undefined;
    for (let cur = el.parent; cur && !scope; cur = cur.parent) scope = owner(cur);
    const ownD = own ? declaredAttributes(own) : null;
    const scopeD = scope ? declaredAttributes(scope) : null;

    for (const attr of Object.keys(el.attrs)) {
      if (!attr.startsWith("data-") || SANCTIONED.has(attr)) continue;
      const tier = parseResponsiveAttribute(attr);
      const byOwn = !!ownD && (ownD.plain.has(attr) || (!!tier && ownD.responsive.has(tier.base)));
      const byScope =
        !!scopeD &&
        (own
          ? scopeD.child.has(attr)
          : scopeD.plain.has(attr) || (!!tier && scopeD.responsive.has(tier.base)));
      if (!byOwn && !byScope) {
        out.push(
          `${label}:${el.line} <${el.tag}> ${attr} — declared by neither ${own?.name ?? "(no component)"} nor its scope ${scope?.name ?? "(none)"}`,
        );
      }
    }
  }
  return out;
}

describe("layout docs — nothing documented that no manifest declares", () => {
  it("resolves every data-* attribute in docs/layout.md to a declaration", () => {
    const findings = htmlFences(LAYOUT_DOC).flatMap((source, i) =>
      undeclaredAttributes(source, `docs/layout.md[${i}]`),
    );
    expect(findings.join("\n")).toBe("");
  });

  it("resolves every data-* attribute in README's layout section to a declaration", () => {
    const findings = htmlFences(README_SECTION).flatMap((source, i) =>
      undeclaredAttributes(source, `README.md#layout[${i}]`),
    );
    expect(findings.join("\n")).toBe("");
  });

  // The two directions of the README's attribute tables. `## Layout System`
  // documents the five primitives; each `### <Name> — …` subsection owns the
  // attributes named inside it.
  const subsections = new Map<string, string>();
  {
    const blocks = README_SECTION.split(/^### /m).slice(1);
    for (const block of blocks) {
      const heading = block.slice(0, block.indexOf("\n")).trim();
      const name = heading.split(/\s+[—-]\s+/)[0].trim().toLowerCase();
      subsections.set(name, block);
    }
  }

  it("gives every layout primitive its own README subsection", () => {
    for (const p of LAYOUT_PRIMITIVES) {
      expect([...subsections.keys()], `README has no subsection for ${p.name}`).toContain(p.name);
    }
  });

  it("documents no attribute the primitive's manifest does not declare", () => {
    const offenders: string[] = [];
    for (const p of LAYOUT_PRIMITIVES) {
      const block = subsections.get(p.name)!;
      const m = manifests.get(p.name)!;
      const d = declaredAttributes(m);
      const named = new Set(
        [...block.matchAll(/`(data-[a-z-]+)`/g)].map((x) => x[1]),
      );
      for (const attr of named) {
        if (SANCTIONED.has(attr)) continue;
        const tier = parseResponsiveAttribute(attr);
        if (d.plain.has(attr) || (tier && d.responsive.has(tier.base))) continue;
        offenders.push(`README §${p.name} documents ${attr}, which ${p.name}'s manifest never declares`);
      }
    }
    expect(offenders.join("\n")).toBe("");
  });

  it("documents every attribute the primitive's manifest declares", () => {
    const missing: string[] = [];
    for (const p of LAYOUT_PRIMITIVES) {
      const block = subsections.get(p.name)!;
      const m = manifests.get(p.name)!;
      for (const attr of declaredAttributes(m).plain) {
        if (!block.includes(`\`${attr}\``)) {
          missing.push(`README §${p.name} never documents ${attr}, which the manifest declares`);
        }
      }
    }
    expect(missing.join("\n")).toBe("");
  });

  it("documents the ladder with the canon's own numbers", () => {
    for (const b of BREAKPOINT_LIST) {
      expect(README_SECTION, `README omits the ${b.tier} tier`).toContain(`| \`${b.tier}\` | \`${b.rem}rem\` | ${b.px}px |`);
    }
    expect(README_SECTION).toContain(RESPONSIVE_GRAMMAR);
    expect(LAYOUT_DOC).toContain(RESPONSIVE_GRAMMAR);
    for (const b of BREAKPOINT_LIST) {
      expect(LAYOUT_DOC, `docs/layout.md omits the ${b.tier} tier`).toContain(
        `| \`${b.tier}\` | \`${b.rem}rem\` | ${b.px}px |`,
      );
    }
  });
});

// ── 3. the doctrine module names things that exist ──────────────────────────

describe("layout doctrine — the module's names resolve", () => {
  it("names five layout primitives, each a real registry primitive", () => {
    expect(LAYOUT_PRIMITIVES.length).toBe(5);
    for (const p of LAYOUT_PRIMITIVES) {
      const m = manifests.get(p.name);
      expect(m, `${p.name} is not in the registry`).toBeDefined();
      expect(m!.kind).toBe("primitive");
      expect(m!.category, `${p.name} should be category: layout`).toBe("layout");
      expect(LAYOUT_MECHANISMS.map((x) => x.key)).toContain(p.mechanism);
    }
  });

  it("names measure and rhythm tokens the registry actually declares", () => {
    const tokens = new Set(parseTokenReference(join(ROOT, "registry")).map((t) => t.name));
    for (const entry of [...MEASURE_TOKENS, ...RHYTHM_TOKENS]) {
      expect(tokens, `--${entry.token} is not declared in registry/tokens`).toContain(entry.token);
    }
  });

  it("orders the doctrine intrinsic → container → viewport", () => {
    expect(LAYOUT_MECHANISMS.map((m) => m.key)).toEqual(["intrinsic", "container", "viewport"]);
    expect(LAYOUT_MECHANISMS.map((m) => m.step)).toEqual([1, 2, 3]);
  });

  it("distinguishes equal peer heights from cross-card row alignment", () => {
    expect(LAYOUT_DOC).toContain("Equal height is not alignment");
    expect(LAYOUT_DOC).toContain("`switcher` stretches the peer boxes");
    expect(LAYOUT_DOC).toContain("`data-align-rows`");
    expect(LAYOUT_DOC).toContain("`grid-template-rows: subgrid`");
    expect(LAYOUT_DOC).toContain("non-subgrid fallback");
    expect(LAYOUT_RULES.some((rule) => rule.startsWith("Equal heights are not"))).toBe(true);
  });

  it("files its archetypes under the heading the parser looks for", () => {
    expect(LAYOUT_DOC).toContain(ARCHETYPE_SECTION_HEADING);
    // A markdown file with no archetype section parses to nothing rather than throwing.
    expect(parseArchetypes("# nothing here\n\ntext")).toEqual([]);
  });
});

// ── 4. the agent surfaces carry it ──────────────────────────────────────────

const context = composeContextData({
  entries: [...manifests].filter(([name, m]) => m.name === name),
  theme: { name: "default", manifest_found: false },
  themeName: "default",
  pluginMetadata: [],
  componentCount: { primitives: 0, recipes: 0, patterns: 0 },
  generatedAt: "1970-01-01T00:00:00.000Z",
  scope: "registry",
});

describe("context — the layout and responsive blocks", () => {
  it("carries the ladder in context.json, derived from the canon", () => {
    const json = JSON.parse(formatContextJSON(context));
    expect(json.responsive.grammar).toBe(RESPONSIVE_GRAMMAR);
    expect(json.responsive.tiers).toEqual(
      BREAKPOINT_LIST.map((b) => ({ tier: b.tier, min_width: `${b.rem}rem`, px: b.px })),
    );
    expect(json.responsive.excluded_attributes).toEqual([...PROTOCOL_ATTRIBUTES]);
    expect(json.responsive.rules).toEqual([...LAYOUT_RULES]);
  });

  it("carries the doctrine, the primitives and the ladders in context.json", () => {
    const json = JSON.parse(formatContextJSON(context));
    expect(json.layout.doctrine.map((d: { mechanism: string }) => d.mechanism)).toEqual([
      "intrinsic",
      "container",
      "viewport",
    ]);
    expect(json.layout.primitives.map((p: { name: string }) => p.name)).toEqual(
      LAYOUT_PRIMITIVES.map((p) => p.name),
    );
    expect(Object.keys(json.layout.measure)).toEqual(MEASURE_TOKENS.map((m) => `--${m.token}`));
    expect(Object.keys(json.layout.rhythm)).toEqual(RHYTHM_TOKENS.map((r) => `--${r.token}`));
    expect(json.layout.archetypes).toEqual(ARCHETYPES.map((a) => a.title));
    expect(json.layout.reference).toBe("docs/layout.md");
  });

  it("lets an agent that reads ONLY llms.txt discover the ladder, the grammar and the primitives", () => {
    const index = formatContextLlms(context);
    for (const b of BREAKPOINT_LIST) expect(index).toContain(`${b.tier} ${b.rem}rem`);
    expect(index).toContain(RESPONSIVE_GRAMMAR);
    for (const p of LAYOUT_PRIMITIVES) expect(index, `llms.txt omits ${p.name}`).toContain(`\`${p.name}\``);
    for (const a of ARCHETYPES) expect(index).toContain(a.title);
    // …and it can still follow a link to the expanded sections.
    expect(index).toContain("llms-full.txt#layout-system");
    expect(index).toContain("llms-full.txt#responsive-tiers");
  });

  it("gives llms-full.txt the anchors llms.txt links to", () => {
    const full = formatContextLlmsFull(context);
    expect(full).toContain("## Layout system");
    expect(full).toContain("## Responsive tiers");
    for (const b of BREAKPOINT_LIST) expect(full).toContain(`| \`${b.tier}\` | \`${b.rem}rem\` | ${b.px} |`);
    for (const p of LAYOUT_PRIMITIVES) expect(full).toContain(`| \`${p.name}\` |`);
    for (const m of MEASURE_TOKENS) expect(full).toContain(`--${m.token}`);
    for (const r of RHYTHM_TOKENS) expect(full).toContain(`--${r.token}`);
  });

  it("carries the same system in the markdown and cursorrules formats", () => {
    const md = formatContextMarkdown(context);
    expect(md).toContain("## Layout System");
    expect(md).toContain("## Responsive Tiers");
    for (const p of LAYOUT_PRIMITIVES) expect(md).toContain(`| \`${p.name}\` |`);

    const rules = formatContextCursorRules(context);
    expect(rules).toContain("## Layout");
    for (const p of LAYOUT_PRIMITIVES) expect(rules).toContain(`\`${p.name}\``);
    expect(rules).toContain(RESPONSIVE_GRAMMAR);
  });

  it("audits the responsive example it hands agents", () => {
    // The block is elided (`… </div>`), so audit the completed form — the point
    // is that the attributes it teaches are real ones on a real component.
    const source = context.responsive.example.replace("…", '<div data-ui="card"><div data-part="body">x</div></div>');
    expect(auditHtmlSource({ source, file: "context.responsive.example", manifests })).toEqual([]);
    expect(undeclaredAttributes(source, "context.responsive.example")).toEqual([]);
  });
});

describe("skill — the layout guidance survives regeneration", () => {
  it("teaches the doctrine, the ladder and the grammar", async () => {
    const files = await generateShippedSkillFiles();
    const skill = files.find((f) => f.relPath === "SKILL.md")!.content;
    expect(skill).toContain("## Layout System");
    for (const m of LAYOUT_MECHANISMS) expect(skill).toContain(m.title);
    for (const p of LAYOUT_PRIMITIVES) expect(skill).toContain(`| \`${p.name}\` |`);
    for (const b of BREAKPOINT_LIST) expect(skill).toContain(`| \`${b.tier}\` | \`${b.rem}rem\` | ${b.px} |`);
    expect(skill).toContain(RESPONSIVE_GRAMMAR);
    expect(skill).toContain("Equal heights are not internal alignment");
    for (const a of ARCHETYPES) expect(skill).toContain(a.title);
    expect(skill).toContain("docs/layout.md");
  });

  it("is committed in the state the generator produces (drift gate)", async () => {
    const files = await generateShippedSkillFiles();
    for (const f of files) {
      const committed = readFileSync(join(ROOT, ".claude/skills/faqir-creator", f.relPath), "utf8");
      expect(committed, `${f.relPath} is stale — run \`bun run gen:skill\``).toBe(f.content);
    }
  });
});

describe("docs site — the layout guide and the token reference", () => {
  const files = buildDocsSite();
  const page = (path: string): string => {
    const f = files.find((x) => x.path === path);
    expect(f, `site is missing ${path}`).toBeDefined();
    return f!.content;
  };

  it("ships the layout guide, reachable from every page's navigation", () => {
    const layout = page(LAYOUT_PAGE);
    expect(layout).toContain("<h1>Layout</h1>");
    for (const p of LAYOUT_PRIMITIVES) {
      expect(layout, `the guide omits ${p.name}`).toContain(esc(p.use));
    }
    // The nav is rendered from one shell, so the home page is a sufficient witness.
    expect(page("index.html")).toContain(`href="${LAYOUT_PAGE}"`);
  });

  it("renders all five archetypes, byte-identical to docs/layout.md", () => {
    const layout = page(LAYOUT_PAGE);
    for (const a of parseArchetypes(LAYOUT_DOC)) {
      expect(layout, `${a.id} missing from the site`).toContain(`id="${a.id}"`);
      // Escaped into a <pre><code>, so compare the escaped form of the doc's markup.
      expect(layout, `${a.id}'s markup differs from docs/layout.md`).toContain(esc(a.html));
    }
  });

  it("gives the token reference breakpoint, measure and rhythm sections", () => {
    const tokens = page("tokens/index.html");
    expect(tokens).toContain('id="breakpoints"');
    expect(tokens).toContain('id="measure"');
    expect(tokens).toContain('id="rhythm"');
    for (const b of BREAKPOINT_LIST) expect(tokens).toContain(`min-width: ${b.rem}rem`);
    for (const m of MEASURE_TOKENS) expect(tokens).toContain(`ladder-${m.token}`);
    for (const r of RHYTHM_TOKENS) expect(tokens).toContain(`ladder-${r.token}`);
    // The breakpoints are documented as NOT tokens — the reason they are literal.
    expect(tokens).toContain("cannot read a custom property");
  });

  it("keeps both pages audit-clean at every severity, like every site page", () => {
    for (const path of [LAYOUT_PAGE, "tokens/index.html"]) {
      const findings = auditHtmlSource({ source: page(path), file: path, manifests });
      expect(findings.map((r) => `${r.severity}/${r.rule_id}: ${r.message}`).join("\n")).toBe("");
    }
  });
});

// ── 5. the freeze list still names what v0.8 added ──────────────────────────

describe("spec alignment — 1.0-01's frozen surface names the v0.8 additions", () => {
  it("names the tier grammar and the props/responsive schema fields", () => {
    const start = PLAN.indexOf("### 1.0-01 · Protocol spec 1.0");
    expect(start, "FAQIR-PLAN must still carry 1.0-01").toBeGreaterThan(-1);
    const rest = PLAN.slice(start + 3);
    const end = rest.indexOf("\n### ");
    // Line-wrapped prose: compare on collapsed whitespace, so a re-wrap of the
    // paragraph cannot fail this the way a deletion should.
    const section = (end === -1 ? rest : rest.slice(0, end)).replace(/\s+/g, " ");

    // Amended when v0.8 was planned — this asserts the amendment survived.
    expect(section, "1.0-01 must freeze the tier grammar").toContain("data-<attr>-<tier>");
    expect(section).toContain("responsive tier suffix grammar");
    expect(section, "1.0-01 must freeze the props + responsive schema fields").toContain(
      "`props` + `responsive` fields",
    );
  });

  it("keeps FAQIR-SPEC §15 pointing at the guide this task wrote", () => {
    const spec = readFileSync(join(ROOT, "FAQIR-SPEC.md"), "utf8");
    const start = spec.indexOf("## 15. Layout & Responsiveness");
    const rest = spec.slice(start + 3);
    const end = rest.indexOf("\n## ");
    const section = end === -1 ? rest : rest.slice(0, end);
    expect(section, "§15 should send a reader to the practical guide").toContain("docs/layout.md");
  });
});
