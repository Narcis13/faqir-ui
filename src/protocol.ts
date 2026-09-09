// The frozen protocol, as data (task 1.0-01, FAQIR-SPEC §2/§15, SPEC-1.0.md).
//
// `SPEC-1.0.md` is the normative document a human reads. This module is the same
// contract in a form the framework can check itself against, and it exists for
// the reason every other doctrine module in `src/utils/` exists: prose that
// agrees with the code today drifts tomorrow unless something re-derives one
// from the other. `tests/spec/protocol-1.0.test.ts` parses the spec's tables
// back out with the parsers below and compares them, in both directions, to
// these constants — so a value grammar can no longer be tightened in the audit
// engine while the published spec keeps promising the old one.
//
// What lives here and what deliberately does not:
//
//   • here — the five attributes, their value grammars and owners; the three
//     sanctioned token modifiers; the freeze statement and the amendment
//     taxonomy; the manifest-schema changelog.
//   • NOT here — the breakpoint canon (`src/utils/breakpoints.ts` owns it, and
//     this module reads it), the layout doctrine (`src/utils/layout.ts`), or any
//     per-component vocabulary, which is what a manifest is for. The protocol
//     says `data-variant` takes one lower-case ident drawn from the component's
//     own declared group; it never says which idents.
//
// Deliberately free of `node:*` imports and of any dependency, so it can be read
// by the CLI, by the docs generator, by the tests and — if it is ever needed
// there — by the browser audit bundle.

import { PROTOCOL_VERSION, SCHEMA_VERSION, VERSION } from "./version";
import {
  BREAKPOINT_LIST,
  PROTOCOL_ATTRIBUTES,
  TIERS,
  isProtocolAttribute,
  responsiveAttribute,
} from "./utils/breakpoints";
import { RESPONSIVE_GRAMMAR } from "./utils/layout";

export { PROTOCOL_VERSION, SCHEMA_VERSION, VERSION };
export { PROTOCOL_ATTRIBUTES, RESPONSIVE_GRAMMAR };

/** The frozen spec document, at the repository root. */
export const SPEC_FILE = "SPEC-1.0.md";

/**
 * The one word that decides what may change before 2.0. Stated in the spec's
 * header, on the site, and in `manifest.schema.json` — all three compared.
 */
export const PROTOCOL_STATUS = "frozen";

// ---------------------------------------------------------------------------
// The five attributes
// ---------------------------------------------------------------------------

/** Who writes the attribute — an author in markup, or a controller at runtime. */
export type AttributeOwner = "author" | "controller";

/** One of the five frozen attributes, fully specified. */
export interface AttributeSpec {
  /** The attribute name, `data-` prefixed. */
  attr: string;
  /** What the attribute means — one sentence, no hedging. */
  purpose: string;
  /** Who is allowed to write it. */
  owner: AttributeOwner;
  /** Where the legal values come from. Never the protocol itself. */
  vocabulary: string;
  /** The audit rule that enforces the vocabulary, or `null` where none can. */
  rule: string | null;
  /** A worked value. */
  example: string;
}

/**
 * The **value grammar** shared by all five: one identifier, lower-case ASCII
 * letters and digits, hyphen-separated. Not a list — `data-variant="a b"` is two
 * variants in a protocol that has one, and `data-state` is single-valued because
 * a controller that needs two states needs a second attribute.
 *
 * A string rather than a `RegExp` literal so it can be embedded verbatim in the
 * spec, the schema and the site; {@link PROTOCOL_VALUE_RE} is the compiled form.
 */
export const PROTOCOL_VALUE_PATTERN = "^[a-z0-9]+(?:-[a-z0-9]+)*$";

/** {@link PROTOCOL_VALUE_PATTERN}, compiled. */
export const PROTOCOL_VALUE_RE = new RegExp(PROTOCOL_VALUE_PATTERN);

/** The grammar in the words the spec uses, so both can be one string. */
export const PROTOCOL_VALUE_GRAMMAR =
  "one identifier — `[a-z0-9]+(-[a-z0-9]+)*` — never a space-separated list";

/** `true` if `value` is a legal value for any of the five attributes. */
export function isProtocolValue(value: string): boolean {
  return PROTOCOL_VALUE_RE.test(value);
}

/**
 * The five, in the order the spec's table lists them — which is the order
 * {@link PROTOCOL_ATTRIBUTES} declares, asserted rather than assumed.
 */
export const ATTRIBUTE_SPECS: readonly AttributeSpec[] = Object.freeze([
  Object.freeze({
    attr: "data-ui",
    purpose: "Component identity — what this element IS.",
    owner: "author" as AttributeOwner,
    vocabulary: "A manifest's `name`, or one of its `aliases`.",
    rule: null,
    example: 'data-ui="dialog"',
  }),
  Object.freeze({
    attr: "data-part",
    purpose: "The slot this element fills inside the nearest enclosing component.",
    owner: "author" as AttributeOwner,
    vocabulary: "A key of that component manifest's `slots`.",
    rule: "orphan-part",
    example: 'data-part="panel"',
  }),
  Object.freeze({
    attr: "data-state",
    purpose: "Runtime state. The only attribute a controller writes to express state.",
    owner: "controller" as AttributeOwner,
    vocabulary: "A key of the manifest's `states`.",
    rule: "valid-state",
    example: 'data-state="open"',
  }),
  Object.freeze({
    attr: "data-variant",
    purpose: "Visual variant — authored once, rarely changed.",
    owner: "author" as AttributeOwner,
    vocabulary: "A value of the manifest variant group whose `attr` is `data-variant`.",
    rule: "valid-variant",
    example: 'data-variant="destructive"',
  }),
  Object.freeze({
    attr: "data-size",
    purpose: "Size variant, held apart from the visual one so the two compose.",
    owner: "author" as AttributeOwner,
    vocabulary: "A value of `variants.size.values`.",
    rule: "valid-size",
    example: 'data-size="lg"',
  }),
]);

/**
 * The normative rules of the protocol — the short, checkable form of SPEC-1.0
 * §2.3. Numbered, because an amendment has to be able to name one.
 */
export const PROTOCOL_RULES: readonly string[] = Object.freeze([
  "`data-ui` marks the root element of a component. A component nested inside another marks its own root.",
  "`data-part` names a slot of the nearest enclosing component that declares it; a part with no such declaration is an error.",
  "`data-state` is the only attribute a controller may write to express state, and the only one CSS should read for it.",
  "`data-variant` and `data-size` are authored in markup and take exactly one value each.",
  "State and visual identity never live in `class`. A class attribute on a component root is an error.",
  "Standard HTML and ARIA (`role`, `aria-*`, `hidden`, `disabled`) are used alongside these five, never replaced by them.",
  "None of the five takes a responsive tier suffix; the grammar in §5 reaches component attributes only.",
]);

// ---------------------------------------------------------------------------
// Sanctioned token modifiers
// ---------------------------------------------------------------------------

/**
 * A sanctioned modifier — an attribute that is part of the frozen contract but
 * is **not** a sixth protocol attribute: it names no component, fills no slot,
 * and carries no per-component vocabulary. Each one re-declares design tokens
 * for its subtree and is inherited by every descendant, which is exactly why it
 * needs no manifest and cannot be audited per component.
 */
export interface TokenModifier {
  attr: string;
  purpose: string;
  /** The closed value vocabulary. Adding a value is additive; removing one is not. */
  values: readonly string[];
  /** Where it is conventionally written. */
  scope: string;
  /** Who writes it. */
  owner: AttributeOwner;
}

/** The three sanctioned token modifiers, alphabetical by attribute. */
export const TOKEN_MODIFIERS: readonly TokenModifier[] = Object.freeze([
  Object.freeze({
    attr: "data-density",
    purpose: "Re-declares the spacing and control-height ramps for a subtree.",
    values: Object.freeze(["compact", "comfortable"]),
    scope: "Any element. Nesting is supported: an inner value replaces the outer one for its own subtree.",
    owner: "author" as AttributeOwner,
  }),
  Object.freeze({
    attr: "data-motion",
    purpose: "The transition phase of one enter/leave cycle, driven by the engine.",
    values: Object.freeze(["enter", "enter-active", "leave", "leave-active"]),
    scope: "The element being transitioned. Removed again when the cycle ends.",
    owner: "controller" as AttributeOwner,
  }),
  Object.freeze({
    attr: "data-theme",
    purpose: "Selects the colour scheme a theme's token blocks resolve to.",
    values: Object.freeze(["light", "dark", "auto"]),
    scope: "Conventionally the document root; legal on any element, which scopes the scheme to that subtree.",
    owner: "author" as AttributeOwner,
  }),
]);

/** `true` if `attr` is a sanctioned token modifier. */
export function isTokenModifier(attr: string): boolean {
  return TOKEN_MODIFIERS.some((m) => m.attr === attr);
}

/**
 * Every attribute name the protocol itself sanctions — the five plus the three.
 * This is the set that needs no manifest declaration, which is what the
 * documentation cross-checks exempt (see `tests/generator/layout-docs.test.ts`).
 */
export const SANCTIONED_ATTRIBUTES: readonly string[] = Object.freeze([
  ...PROTOCOL_ATTRIBUTES,
  ...TOKEN_MODIFIERS.map((m) => m.attr),
]);

// ---------------------------------------------------------------------------
// The responsive tier suffix (v0.8)
// ---------------------------------------------------------------------------

/**
 * The grammar, its ladder and its one exclusion, as the sentences the spec
 * states. Derived from the canon so a fifth tier could never be documented
 * without existing.
 */
export const RESPONSIVE_RULES: readonly string[] = Object.freeze([
  `\`${RESPONSIVE_GRAMMAR}\` reads "this value, from that tier up". The unsuffixed attribute is the mobile-first base.`,
  `The tiers are ${TIERS.join(", ")} — ${BREAKPOINT_LIST.map((b) => `\`${b.tier}\` ${b.rem}rem`).join(", ")} — applied as \`min-width\` floors and nothing else.`,
  "A suffix is legal only on an attribute whose manifest variant group declares `responsive: true`.",
  `The five protocol attributes never take a suffix: \`${responsiveAttribute("cols", "md")}\` is a component attribute, \`data-size-md\` is a sixth protocol attribute in all but name.`,
]);

/** `true` if `attr` may legally carry a tier suffix under protocol 1.0. */
export function mayTakeTierSuffix(attr: string): boolean {
  return attr.startsWith("data-") && !isProtocolAttribute(attr) && !isTokenModifier(attr);
}

// ---------------------------------------------------------------------------
// The freeze and its amendment process
// ---------------------------------------------------------------------------

/** The freeze, in one sentence — stated identically by the spec and the site. */
export const FREEZE_STATEMENT =
  "Protocol 1.0 is frozen: until 2.0 the contract may only grow. " +
  "Nothing already published here may be renamed, removed, narrowed, or given a new meaning.";

/** Which kind of release a change may ship in. */
export type AmendmentLevel = "additive" | "major";

/** One row of the amendment taxonomy. */
export interface AmendmentRule {
  /** The change, phrased as something someone would propose. */
  change: string;
  /** `additive` — any 1.x release. `major` — 2.0 and no sooner. */
  level: AmendmentLevel;
  /** Why it lands on that side of the line. */
  because: string;
}

/**
 * **The amendment process, as a decision table.** The prose in SPEC-1.0 §8
 * describes how a change is proposed; this is what the answer has to be.
 *
 * The test in `tests/spec/protocol-1.0.test.ts` parses the spec's table back out
 * and compares it row for row, so the published answer and the checked one are
 * the same list.
 */
export const AMENDMENT_RULES: readonly AmendmentRule[] = Object.freeze([
  Object.freeze({
    change: "Add a component to the registry.",
    level: "additive" as AmendmentLevel,
    because: "A manifest is the component's own contract; the protocol gains nothing to break.",
  }),
  Object.freeze({
    change: "Add a value to a component's own variant group.",
    level: "additive" as AmendmentLevel,
    because: "Existing markup keeps validating; only the component's manifest and its minor version move.",
  }),
  Object.freeze({
    change: "Add an optional field to the manifest schema.",
    level: "additive" as AmendmentLevel,
    because: "Every manifest written against 1.0 still validates, because the field is optional.",
  }),
  Object.freeze({
    change: "Add a value to a sanctioned token modifier — a third density, say.",
    level: "additive" as AmendmentLevel,
    because: "The vocabulary grows; no existing value changes meaning.",
  }),
  Object.freeze({
    change: "Add an audit rule at `info` or `warning`.",
    level: "additive" as AmendmentLevel,
    because: "It reports; it does not redefine what conforming markup is.",
  }),
  Object.freeze({
    change: "Add, remove or rename one of the five attributes.",
    level: "major" as AmendmentLevel,
    because: "The five ARE the contract. A sixth is a different contract.",
  }),
  Object.freeze({
    change: "Change a protocol attribute's value grammar — accept a space-separated list, say.",
    level: "major" as AmendmentLevel,
    because: "Every parser, selector and audit rule reads the grammar; widening it re-specifies all of them.",
  }),
  Object.freeze({
    change: "Extend the tier suffix grammar to a protocol attribute.",
    level: "major" as AmendmentLevel,
    because: "`data-size-md` is a sixth attribute under another name — the previous row, indirectly.",
  }),
  Object.freeze({
    change: "Promote a token modifier to a protocol attribute (or demote one).",
    level: "major" as AmendmentLevel,
    because: "It moves an attribute across the line that decides whether a manifest must declare it.",
  }),
  Object.freeze({
    change: "Change the breakpoint canon — a tier's name or its floor.",
    level: "major" as AmendmentLevel,
    because: "Every suffixed attribute in every project silently re-targets a different width.",
  }),
  Object.freeze({
    change: "Make an optional manifest field required, or remove/rename an existing one.",
    level: "major" as AmendmentLevel,
    because: "Manifests that validate against 1.0 would stop validating — the definition of breaking.",
  }),
  Object.freeze({
    change: "Change the meaning of a published attribute value framework-wide.",
    level: "major" as AmendmentLevel,
    because: "Markup that still validates would render something else, which is worse than failing.",
  }),
]);

/** Amendment rules for one level, in declaration order. */
export function amendmentsAt(level: AmendmentLevel): readonly AmendmentRule[] {
  return AMENDMENT_RULES.filter((r) => r.level === level);
}

// ---------------------------------------------------------------------------
// Manifest schema changelog (0.x → 1.0)
// ---------------------------------------------------------------------------

/** One published state of `manifest.schema.json`. */
export interface SchemaChange {
  /** The schema version this row describes. */
  version: string;
  /** The task that shipped it, for the archaeology. */
  task: string;
  /** What changed. */
  note: string;
  /** Whether a manifest that validated before stopped validating. */
  breaking: boolean;
}

/**
 * The manifest schema's history, ending at the freeze. Mirrored into
 * `manifest.schema.json`'s own `changelog` — the schema carries its history so a
 * consumer who fetched only the schema still has it — and into SPEC-1.0 §9,
 * with the test asserting all three agree.
 *
 * One honest note the table records rather than tidies away: the file has
 * claimed `schema_version: "1.0.0"` since its first commit, before there was a
 * freeze to back the claim. 1.0-01 is where the claim becomes true, and the
 * spelling is normalised to `1.0` — the version the *protocol* is frozen at,
 * which is the thing being promised.
 */
export const SCHEMA_CHANGELOG: readonly SchemaChange[] = Object.freeze([
  Object.freeze({
    version: "0.5",
    task: "0.5-07",
    note:
      "First published as a file: component and theme manifests in one document, `changes[]` " +
      "changelog entries, an `$id`, and a resolvable `$schema` on every registry manifest. " +
      "Before this the contract existed only as the validator in `src/manifest.ts`.",
    breaking: false,
  }),
  Object.freeze({
    version: "0.8",
    task: "0.8-02",
    note:
      "`props` — the non-variant attributes — declared; `variants.<group>.responsive` added for the " +
      "tier suffix grammar; `category` closed to a documented enum, which retired the `form` spelling " +
      "in favour of `forms`.",
    breaking: true,
  }),
  Object.freeze({
    version: "1.0",
    task: "1.0-01",
    note:
      "Frozen. `schema_version` is `1.0`, `stability` and `amendment_policy` are declared in the file, " +
      "this changelog is carried in it, and the schema is published at a versioned URL beside the spec. " +
      "No field changed shape.",
    breaking: false,
  }),
  Object.freeze({
    version: "1.0",
    task: "W2-4",
    note:
      "`api` — a component's controller surface, generated from the controller's `@ui:provides` " +
      "annotation. Optional, so every 1.0 manifest still validates; additive under SPEC-1.0 §8. It " +
      "exists because the data was already in every controller and on no surface an agent reads: " +
      "`faqir explain <recipe> --json` returned no `api` for any of the 29 JS-backed recipes.",
    breaking: false,
  }),
]);

// ---------------------------------------------------------------------------
// SPEC-1.0.md, parsed
// ---------------------------------------------------------------------------

/**
 * Markers the spec places directly above each normative table. Parsing by marker
 * rather than by heading text means the prose can be rewritten freely and the
 * drift tests keep working — the same convention `site/content/*.html` uses for
 * its generated ladders.
 */
export const SPEC_MARKERS = Object.freeze({
  attributes: "<!-- @faqir:protocol-attributes -->",
  rules: "<!-- @faqir:protocol-rules -->",
  modifiers: "<!-- @faqir:token-modifiers -->",
  responsive: "<!-- @faqir:responsive-rules -->",
  amendments: "<!-- @faqir:amendments -->",
  changelog: "<!-- @faqir:schema-changelog -->",
});

/**
 * Strip the markdown a table cell may carry — code ticks and bold — leaving the
 * text. Applied to **both** sides of every drift comparison, so the spec is free
 * to mark `data-ui` up as code while the constant stores it plain.
 */
export function specText(cell: string): string {
  return cell.replace(/`/g, "").replace(/\*\*/g, "").trim();
}

/**
 * The rows of the markdown table that follows `marker`, as arrays of trimmed
 * cells with the header and the `---` separator dropped. Returns `[]` when the
 * marker is absent, so a caller can assert "the spec has this table" as a
 * failure with a name rather than a crash.
 *
 * Splits on *unescaped* pipes only: a cell listing a value vocabulary writes it
 * `` `compact` \| `comfortable` ``, which is one cell and not two.
 */
export function parseSpecTable(markdown: string, marker: string): string[][] {
  const at = markdown.indexOf(marker);
  if (at === -1) return [];
  const lines = markdown.slice(at + marker.length).split("\n");
  const rows: string[][] = [];
  let started = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) {
      if (started) break;
      continue;
    }
    started = true;
    const cells = trimmed
      .slice(1, -1)
      .split(/(?<!\\)\|/)
      .map((c) => c.replace(/\\\|/g, "|").trim());
    if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue;
    rows.push(cells);
  }
  return rows.slice(1); // drop the header row
}

/** The bullet list that follows `marker`, one string per `- ` item. */
export function parseSpecList(markdown: string, marker: string): string[] {
  const at = markdown.indexOf(marker);
  if (at === -1) return [];
  const out: string[] = [];
  let started = false;
  for (const line of markdown.slice(at + marker.length).split("\n")) {
    const match = /^\s*\d+\.\s+(.*)$/.exec(line) ?? /^\s*-\s+(.*)$/.exec(line);
    if (!match) {
      if (started && line.trim() === "") continue;
      if (started) break;
      continue;
    }
    started = true;
    out.push(match[1].trim());
  }
  return out;
}

/** The versions the spec's own header states. */
export interface SpecVersions {
  protocol: string | null;
  schema: string | null;
  status: string | null;
}

/**
 * Read the version line out of the spec header. The spec states its versions in
 * prose exactly once, in a shape this can find:
 *
 *     **Status:** Frozen · **Protocol version:** 1.0 · **Manifest schema version:** 1.0
 */
export function parseSpecVersions(markdown: string): SpecVersions {
  const read = (label: string): string | null => {
    const re = new RegExp(`\\*\\*${label}:\\*\\*\\s*([^·\\n*]+)`);
    const m = re.exec(markdown);
    return m ? m[1].trim() : null;
  };
  return {
    protocol: read("Protocol version"),
    schema: read("Manifest schema version"),
    status: read("Status")?.toLowerCase() ?? null,
  };
}

/** One fenced code block of the spec. */
export interface SpecFence {
  /** The info string — `html`, `css`, `json`, `text`. Empty for a bare fence. */
  lang: string;
  /** The nearest preceding heading, without its `#`s. */
  section: string;
  /** The block's contents, verbatim. */
  body: string;
}

/**
 * Every fenced block in the spec, whatever its language. The test asserts that
 * each one is verified by *some* checker — markup by the auditor, JSON against
 * the schema, CSS against the selector rule it demonstrates — so a fence in a
 * language nobody checks is a failure rather than a quiet exemption.
 */
export function parseSpecFences(markdown: string): SpecFence[] {
  const out: SpecFence[] = [];
  let section = "";
  let open: { lang: string; section: string; lines: string[] } | null = null;
  for (const line of markdown.split("\n")) {
    if (open !== null) {
      if (line.trim() === "```") {
        out.push({ lang: open.lang, section: open.section, body: open.lines.join("\n") });
        open = null;
      } else {
        open.lines.push(line);
      }
      continue;
    }
    if (line.startsWith("```")) {
      open = { lang: line.trim().slice(3).trim(), section, lines: [] };
      continue;
    }
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    if (heading) section = heading[1].trim();
  }
  return out;
}

/** One fenced HTML block of the spec, with the heading it sits under. */
export interface SpecExample {
  /** The nearest preceding heading, without its `#`s. */
  section: string;
  /** 0-based index across the whole document, for stable failure messages. */
  index: number;
  /** The markup, verbatim. */
  html: string;
}

/**
 * Every ```html fence in the spec, tagged with its section. This is what makes
 * the spec executable documentation: the test audits exactly what this returns,
 * and the site renders exactly what this returns, so the example that is proven
 * clean, the example that is published and the example in the file are one thing.
 *
 * Only `html` fences — a `json`, `css` or `text` fence is not markup and is not
 * audited, which is also how the spec is able to show a violation without the
 * violation failing the build.
 */
export function parseSpecExamples(markdown: string): SpecExample[] {
  return parseSpecFences(markdown)
    .filter((f) => f.lang === "html")
    .map((f, index) => ({ section: f.section, index, html: f.body }));
}

/** The spec's attribute table, in {@link AttributeSpec}'s own shape. */
export function parseSpecAttributes(
  markdown: string,
): Pick<AttributeSpec, "attr" | "purpose" | "owner" | "vocabulary" | "rule">[] {
  return parseSpecTable(markdown, SPEC_MARKERS.attributes).map((cells) => {
    const rule = specText(cells[4] ?? "");
    return {
      attr: specText(cells[0] ?? ""),
      purpose: specText(cells[1] ?? ""),
      owner: specText(cells[2] ?? "").toLowerCase() as AttributeOwner,
      vocabulary: specText(cells[3] ?? ""),
      rule: rule === "—" || rule === "" ? null : rule,
    };
  });
}

/** The token-modifier rows, as `{attr, purpose, values, owner}`. */
export function parseSpecModifiers(
  markdown: string,
): { attr: string; purpose: string; values: string[]; owner: string }[] {
  return parseSpecTable(markdown, SPEC_MARKERS.modifiers).map((cells) => ({
    attr: specText(cells[0] ?? ""),
    purpose: specText(cells[1] ?? ""),
    values: specText(cells[2] ?? "")
      .split("|")
      .map((v) => v.trim())
      .filter(Boolean),
    owner: specText(cells[3] ?? "").toLowerCase(),
  }));
}

/** The amendment rows, as `{change, level, because}`. */
export function parseSpecAmendments(
  markdown: string,
): { change: string; level: string; because: string }[] {
  return parseSpecTable(markdown, SPEC_MARKERS.amendments).map((cells) => ({
    change: specText(cells[0] ?? ""),
    level: specText(cells[1] ?? "").toLowerCase(),
    because: specText(cells[2] ?? ""),
  }));
}

/** The schema changelog rows, as `{version, task, note, breaking}`. */
export function parseSpecChangelog(
  markdown: string,
): { version: string; task: string; note: string; breaking: boolean }[] {
  return parseSpecTable(markdown, SPEC_MARKERS.changelog).map((cells) => ({
    version: specText(cells[0] ?? ""),
    task: specText(cells[1] ?? ""),
    note: specText(cells[2] ?? ""),
    breaking: specText(cells[3] ?? "").toLowerCase().startsWith("yes"),
  }));
}
