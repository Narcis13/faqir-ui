// The silent-failure rules (task W2-2).
//
// The audit was strong on static attribute vocabulary and blind to everything
// around it. Six mistakes an agent makes by natural extrapolation produced no
// error, no warning and no console output anywhere:
//
//   | `data-span-lg="6"`         | an invented tier suffix on a prop that is not responsive |
//   | `data-gap="7"`             | a value outside a declared enum, on a non-protocol attr  |
//   | `data-variant-md="ghost"`  | a tier suffix on one of the five, which never take one   |
//   | `l-tex="v"`                | a misspelled directive name                              |
//   | `<span data-part="title">` | a part whose manifest names a different element          |
//   | `@click.debounce.500ms`    | the dotted time the docs themselves flag as a footgun    |
//
// Each is a case where the agent's guess is reasonable, the markup looks right,
// the page renders, and nothing anywhere says the attribute did nothing. That
// is the worst possible failure shape for a generate-audit-repair loop: there
// is no signal to retry on.
//
// Every rule here is decided from the manifest and the protocol — never from a
// hardcoded component or attribute name — and, like the rest of `src/audit/**`,
// this module is free of `node:*` so the browser bundle keeps finding parity
// with the CLI.

import type { ParsedDocument, ParsedElement } from "../parser/html-parser";
import type { Manifest, ManifestVariant, ManifestProp } from "../manifest";
import { TIERS, isTier, isProtocolAttribute, PROTOCOL_ATTRIBUTES } from "../utils/breakpoints";
import {
  DIRECTIVE_NAMES,
  KEY_MODIFIERS,
  acceptsFreeSuffix,
  directiveByName,
  parseDirectiveName,
  splitTimedModifier,
} from "../utils/directives";
import { suggestClosest } from "../utils/suggest";
import type { AuditResult, RuleInfo, Severity } from "./rules";

// ---------------------------------------------------------------------------
// Rule metadata
// ---------------------------------------------------------------------------

export const ATTRIBUTE_VOCABULARY_RULE: RuleInfo = {
  id: "attribute-vocabulary",
  severity: "error",
  applies_to: "every element inside a known component, in HTML",
  description:
    "A manifest-declared attribute must carry a value from its declared set, and " +
    "the `data-<attr>-<tier>` suffix is legal only on a group the manifest marks " +
    "`responsive: true` and only for a canon tier. The five protocol attributes " +
    "never take a suffix at all.",
};

export const UNKNOWN_ATTRIBUTE_RULE: RuleInfo = {
  id: "unknown-attribute",
  severity: "warning",
  applies_to: "data-* attributes inside a known component, in HTML",
  description:
    "A `data-*` attribute that LOOKS like part of a component's vocabulary but " +
    "is not: a near-miss of one the manifest declares, or one that belongs to a " +
    "different component. An application's own `data-*` hooks are not findings.",
};

export const DIRECTIVE_NAME_RULE: RuleInfo = {
  id: "directive-name",
  severity: "error",
  applies_to: "every l-* / : / @ attribute in HTML",
  description:
    "A directive attribute must name a directive the engine or an official " +
    "plugin implements, take its argument when it requires one, and use only " +
    "modifiers that directive accepts.",
};

export const PART_ELEMENT_RULE: RuleInfo = {
  id: "part-element",
  severity: "warning",
  applies_to: "elements carrying data-part, in HTML",
  description:
    "A slot whose manifest names a `tag_hint` expects that element. The hint is " +
    "usually semantic — a `title` slot declared `h3` is a heading, and a `span` " +
    "in its place is invisible to the document outline and to assistive tech.",
};

/** Every rule this module contributes, for the rule inventory. */
export const VOCABULARY_RULES: RuleInfo[] = [
  ATTRIBUTE_VOCABULARY_RULE,
  UNKNOWN_ATTRIBUTE_RULE,
  DIRECTIVE_NAME_RULE,
  PART_ELEMENT_RULE,
];

// ---------------------------------------------------------------------------
// Manifest vocabulary, flattened
// ---------------------------------------------------------------------------

/** One attribute a manifest declares, whichever section declared it. */
interface DeclaredAttribute {
  /** The attribute name, `data-` prefixed. */
  attr: string;
  /** The manifest key that declared it (`cols`, `span`, …) — quoted in messages. */
  key: string;
  /** `variants` | `props` | `states`. */
  section: string;
  /** Permitted values, or null when the attribute is not an enum. */
  values: readonly string[] | null;
  /** Whether the declaration opts into the `-<tier>` grammar. */
  responsive: boolean;
}

/**
 * Every attribute a manifest declares, keyed by attribute name. Variant groups,
 * props and states alike: the audit's question is "is this attribute part of
 * this component's vocabulary", and all three sections answer it.
 */
function declaredAttributes(manifest: Manifest): Map<string, DeclaredAttribute> {
  const out = new Map<string, DeclaredAttribute>();

  for (const [key, v] of Object.entries(manifest.variants ?? {})) {
    const variant = v as ManifestVariant;
    if (!variant?.attr) continue;
    out.set(variant.attr, {
      attr: variant.attr,
      key,
      section: "variants",
      values: variant.values ?? null,
      responsive: variant.responsive === true,
    });
  }

  for (const [key, p] of Object.entries(manifest.props ?? {})) {
    const prop = p as ManifestProp;
    const attr = prop?.attr ?? `data-${kebab(key)}`;
    out.set(attr, {
      attr,
      key,
      section: "props",
      // Only an enum has a closed set. A string/number/boolean prop takes
      // anything the component's CSS can read, and guessing at one would report
      // correct markup — which is how a rule teaches an agent to ignore it.
      values: prop?.type === "enum" && prop.values ? prop.values : null,
      responsive: false,
    });
  }

  for (const [key, s] of Object.entries(manifest.states ?? {})) {
    const attr = (s as { attr?: string })?.attr;
    // A state's `attr` is written as a full `data-state="open"` pair; the
    // attribute half is what belongs in the vocabulary.
    const name = attr ? attr.split("=")[0] : null;
    if (!name || out.has(name)) continue;
    out.set(name, { attr: name, key, section: "states", values: null, responsive: false });
  }

  return out;
}

function kebab(key: string): string {
  return key.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

/**
 * Which components declare each `data-*` attribute, across the whole manifest
 * map — the index that turns "this component does not declare it" into the far
 * more useful "this is grid's attribute, on a stack".
 *
 * Cached per map identity: the caller passes the same `Map` for every file of a
 * run, and rebuilding it per element would be quadratic in the registry.
 */
const OWNER_INDEX = new WeakMap<Map<string, Manifest>, Map<string, string[]>>();

function attributeOwners(manifests: Map<string, Manifest>): Map<string, string[]> {
  const cached = OWNER_INDEX.get(manifests);
  if (cached) return cached;
  const index = new Map<string, string[]>();
  for (const [name, manifest] of manifests) {
    for (const attr of declaredAttributes(manifest).keys()) {
      if (isProtocolAttribute(attr)) continue;
      const owners = index.get(attr);
      if (owners) {
        if (!owners.includes(name)) owners.push(name);
      } else {
        index.set(attr, [name]);
      }
    }
  }
  OWNER_INDEX.set(manifests, index);
  return index;
}

/**
 * `data-*` attributes that belong to the engine or to a cross-component
 * convention rather than to any one manifest, and are therefore never
 * attributable to the component they happen to sit inside.
 *
 * `data-prop-*` seeds an `l-data` scope; `data-error-*` supplies a validation
 * message to `l-validate`; `data-persist-*` names a storage key; `data-motion`
 * is the phase the transition machinery stamps. The rest are controller hooks
 * read on an element whose own manifest does not declare them — a drawer's
 * external `data-open`, a sidebar's external toggle.
 *
 * Page-level token switches are deliberately NOT listed: they are written on
 * `<html>`/`<body>`, which no component encloses, so this rule never sees them.
 */
const CONVENTION_PREFIXES = ["data-prop-", "data-error-", "data-persist-", "data-testid"];
const CONVENTION_ATTRIBUTES = new Set([
  "data-motion",
  "data-align-rows",
  "data-validate-ignore",
  "data-confirm-required",
  "data-open",
  "data-sidebar-toggle",
  "data-breakpoint",
  "data-toast-id",
]);

/**
 * Flow roots, from `registry/base/rhythm.css`'s own selector list. `data-gap` on
 * one of these is a BASE-LAYER attribute — it sets `--flow-space`, the rhythm
 * between an element's children — and belongs to no component manifest, which is
 * why `<main data-ui="surface" data-gap="4">` is exactly right and was reported.
 */
const FLOW_ROOT_TAGS = new Set([
  "body", "main", "article", "section", "aside", "header", "footer",
  "form", "fieldset", "dialog", "blockquote", "figure",
]);
const FLOW_ROOT_COMPONENTS = new Set(["container", "surface"]);

function isFlowRoot(el: ParsedElement): boolean {
  if (FLOW_ROOT_TAGS.has(el.tag.toLowerCase())) return true;
  return FLOW_ROOT_COMPONENTS.has(el.attrs["data-ui"] ?? "");
}

function isConventionAttribute(name: string, el: ParsedElement): boolean {
  if (CONVENTION_ATTRIBUTES.has(name)) return true;
  if (name === "data-gap" && isFlowRoot(el)) return true;
  return CONVENTION_PREFIXES.some((p) => name.startsWith(p));
}

// ---------------------------------------------------------------------------
// The component an element belongs to
// ---------------------------------------------------------------------------

/**
 * Every `[data-ui]` from this element outward, nearest first, the element itself
 * included.
 *
 * A `data-*` attribute is not necessarily declared by the component the element
 * IS, or even by the one it sits directly inside: the layout primitives declare
 * attributes written on their CHILDREN — `grid` declares `data-span`, `cluster`
 * declares `data-push` — and those children are routinely components in their
 * own right. `<button data-ui="button" data-push>` inside a cluster is correct
 * markup, and a rule that asked only the button's manifest would report it.
 *
 * So the vocabulary question is answered outward: the first enclosing component
 * that declares the attribute owns it, and only an attribute NONE of them
 * declares is unknown.
 */
function componentChain(el: ParsedElement): ParsedElement[] {
  const chain: ParsedElement[] = [];
  let node: ParsedElement | null = el;
  while (node) {
    if (node.attrs["data-ui"]) chain.push(node);
    node = node.parent;
  }
  return chain;
}

/** The nearest enclosing `[data-ui]`, the element itself included. */
function owningComponent(el: ParsedElement): ParsedElement | null {
  return componentChain(el)[0] ?? null;
}

// ---------------------------------------------------------------------------
// attribute-vocabulary + unknown-attribute
// ---------------------------------------------------------------------------

function finding(
  ruleId: string,
  severity: Severity,
  component: string,
  file: string,
  el: ParsedElement,
  message: string,
): AuditResult {
  return {
    rule_id: ruleId,
    severity,
    component_name: component,
    file,
    line: el.line,
    column: el.column,
    message,
  };
}

/**
 * Value-, suffix- and membership-check every `data-*` attribute inside every
 * known component on the page.
 *
 * Two rules come out of one walk because they read the same two inputs — the
 * attribute and the manifest that should declare it — and splitting the walk
 * would mean answering "which component owns this element" twice.
 */
export function buildAttributeVocabularyResults(
  doc: ParsedDocument,
  manifests: Map<string, Manifest>,
  file: string,
  skip: Set<string> = new Set(),
): AuditResult[] {
  const results: AuditResult[] = [];
  const wantsVocabulary = !skip.has(ATTRIBUTE_VOCABULARY_RULE.id);
  const wantsUnknown = !skip.has(UNKNOWN_ATTRIBUTE_RULE.id);
  if (!wantsVocabulary && !wantsUnknown) return results;

  // One flattened vocabulary per manifest, not per element.
  const vocabularies = new Map<string, Map<string, DeclaredAttribute>>();
  const vocabularyFor = (name: string): Map<string, DeclaredAttribute> | null => {
    const cached = vocabularies.get(name);
    if (cached) return cached;
    const manifest = manifests.get(name);
    if (!manifest) return null;
    const built = declaredAttributes(manifest);
    vocabularies.set(name, built);
    return built;
  };

  for (const el of doc.elements) {
    // The manifests that could legitimately declare an attribute written on
    // this element, nearest first, each paired with the name to quote.
    const chain: { name: string; vocabulary: Map<string, DeclaredAttribute> }[] = [];
    let unresolved = false;
    for (const node of componentChain(el)) {
      const name = node.attrs["data-ui"];
      const vocabulary = vocabularyFor(name);
      // A component with no manifest on hand (not installed here, or not a
      // registry component at all) is a HOLE in the chain, not an empty
      // vocabulary. An attribute it would have declared must not be reported as
      // unknown just because the caller could not supply its manifest.
      if (!vocabulary) { unresolved = true; continue; }
      chain.push({ name, vocabulary });
    }
    if (chain.length === 0) continue;

    const activeName = chain[0].name;

    for (const [name, value] of Object.entries(el.attrs)) {
      if (!name.startsWith("data-")) continue;
      if (isConventionAttribute(name, el)) continue;

      // ── the five ────────────────────────────────────────────────────────
      // Their VALUES are `valid-variant` / `valid-state` / `valid-size`'s job.
      // Their SUFFIXED forms are nobody's, and are checked here — before the
      // manifest lookup, because a variant group declares `data-variant` as its
      // `attr` and would otherwise answer with "this group is not responsive"
      // when the real answer is that the five never take a suffix at all.
      if (isProtocolAttribute(name)) continue;

      const protocolSuffix = splitProtocolSuffix(name);
      if (protocolSuffix) {
        if (!wantsVocabulary) continue;
        results.push(
          finding(
            ATTRIBUTE_VOCABULARY_RULE.id,
            "error",
            activeName,
            file,
            el,
            `${name} does nothing: the five protocol attributes ` +
              `(${PROTOCOL_ATTRIBUTES.join(", ")}) never take a breakpoint suffix. ` +
              `Write ${protocolSuffix.base}, and put the responsive part on a layout ` +
              `attribute that declares "responsive": true.`,
          ),
        );
        continue;
      }

      // ── declared, somewhere out along the chain ─────────────────────────
      const owner = chain.find((c) => c.vocabulary.has(name));
      if (owner) {
        const declared = owner.vocabulary.get(name)!;
        if (wantsVocabulary && declared.values && value && !declared.values.includes(value)) {
          results.push(
            finding(
              ATTRIBUTE_VOCABULARY_RULE.id,
              "error",
              owner.name,
              file,
              el,
              `Invalid value "${value}" for ${name} on <${el.tag}> in [data-ui="${owner.name}"] ` +
                `(${declared.section} "${declared.key}"). Valid values: ${declared.values.join(", ")}`,
            ),
          );
        }
        continue;
      }

      // ── a tier suffix of something declared out along the chain ─────────
      const suffixed = splitTierSuffix(name, chain);
      if (suffixed) {
        if (!wantsVocabulary) continue;
        const { base, owner: suffixOwner, tier } = suffixed;
        if (!isTier(tier)) {
          results.push(
            finding(
              ATTRIBUTE_VOCABULARY_RULE.id,
              "error",
              suffixOwner,
              file,
              el,
              `Unknown breakpoint tier "${tier}" in ${name} on <${el.tag}> in ` +
                `[data-ui="${suffixOwner}"]. Canon tiers: ${TIERS.join(", ")}`,
            ),
          );
          continue;
        }
        if (!base.responsive) {
          results.push(
            finding(
              ATTRIBUTE_VOCABULARY_RULE.id,
              "error",
              suffixOwner,
              file,
              el,
              `${base.attr} is not responsive, so ${name} does nothing on <${el.tag}> in ` +
                `[data-ui="${suffixOwner}"]. The \`data-<attr>-<tier>\` grammar applies only to a ` +
                `manifest group declaring "responsive": true — ${base.attr} is ` +
                `${base.section} "${base.key}", which does not. Write ${base.attr} instead.`,
            ),
          );
          continue;
        }
        if (base.values && value && !base.values.includes(value)) {
          results.push(
            finding(
              ATTRIBUTE_VOCABULARY_RULE.id,
              "error",
              suffixOwner,
              file,
              el,
              `Invalid responsive value "${value}" in ${name} on <${el.tag}> in ` +
                `[data-ui="${suffixOwner}"] (${base.section} "${base.key}"). ` +
                `Valid values: ${base.values.join(", ")}`,
            ),
          );
        }
        continue;
      }

      // ── declared nowhere ────────────────────────────────────────────────
      //
      // NOT every such attribute is a finding. `data-*` is the platform's own
      // extension point and an application hangs its hooks there routinely —
      // Faqir's docs site alone carries `data-docs-page`, `data-theme-select`,
      // `data-docs-control`. Reporting those produced 5,943 warnings on the
      // site's own pages, which is not a rule, it is a reason to stop reading
      // the output.
      //
      // What IS a finding is an attribute that looks like it belongs to the
      // component vocabulary and does not:
      //
      //   • a near-miss of one this component declares (`data-siz`, `data-colls`)
      //     — the typo an agent makes and gets no signal for;
      //   • one that is a real Faqir attribute owned by a DIFFERENT component
      //     (`data-cols` on a `stack`) — the cross-component confusion an agent
      //     makes from a half-remembered layout doc.
      //
      // Anything else is the author's own namespace and is left alone.
      if (!wantsUnknown || unresolved) continue;
      const declaredHere = chain.flatMap((c) => [...c.vocabulary.keys()]);
      const nearMiss = suggestClosest(name, declaredHere, 2);
      if (nearMiss) {
        results.push(
          finding(
            UNKNOWN_ATTRIBUTE_RULE.id,
            "warning",
            activeName,
            file,
            el,
            `${name} on <${el.tag}> is not declared by the ${activeName} manifest — ` +
              `nothing reads it and nothing styles it. Did you mean ${nearMiss}?`,
          ),
        );
        continue;
      }
      const elsewhere = attributeOwners(manifests).get(name);
      if (elsewhere && elsewhere.length > 0) {
        results.push(
          finding(
            UNKNOWN_ATTRIBUTE_RULE.id,
            "warning",
            activeName,
            file,
            el,
            `${name} on <${el.tag}> is a ${elsewhere.slice(0, 3).join("/")} attribute, and ` +
              `${activeName} does not declare it — nothing reads it here.`,
          ),
        );
      }
    }
  }

  return results;
}

/**
 * Split `data-cols-md` into the declaration it suffixes and the tier, searching
 * outward along the component chain — but only when the full name is not itself
 * declared anywhere on it. `stack` declares both `data-align` (responsive) and
 * `data-align-text` (a prop), and reading the second as the first at a tier
 * called "text" would report exactly-correct markup.
 */
function splitTierSuffix(
  name: string,
  chain: { name: string; vocabulary: Map<string, DeclaredAttribute> }[],
): { base: DeclaredAttribute; owner: string; tier: string } | null {
  const cut = name.lastIndexOf("-");
  if (cut <= "data-".length) return null;
  const baseName = name.slice(0, cut);
  for (const link of chain) {
    const base = link.vocabulary.get(baseName);
    if (base) return { base, owner: link.name, tier: name.slice(cut + 1) };
  }
  return null;
}

/** Split `data-variant-md` into `data-variant` + `md`, or null. */
function splitProtocolSuffix(name: string): { base: string; tier: string } | null {
  const cut = name.lastIndexOf("-");
  if (cut <= "data-".length) return null;
  const base = name.slice(0, cut);
  return isProtocolAttribute(base) ? { base, tier: name.slice(cut + 1) } : null;
}

// ---------------------------------------------------------------------------
// directive-name
// ---------------------------------------------------------------------------

/**
 * Every `l-*` / `:` / `@` attribute in the document, checked against the
 * vocabulary the engine actually dispatches on.
 *
 * Document-wide rather than per-component, because a directive is not a
 * component attribute: `<form l-validate>` and `<div l-data>` are the canonical
 * placements and neither carries `data-ui`.
 */
export function buildDirectiveNameResults(doc: ParsedDocument, file: string): AuditResult[] {
  const results: AuditResult[] = [];

  for (const el of doc.elements) {
    for (const [attr, value] of Object.entries(el.attrs)) {
      const parsed = parseDirectiveName(attr);
      if (!parsed) continue;

      const spec = directiveByName(parsed.name);
      if (!spec) {
        const suggestion = suggestClosest(parsed.name, DIRECTIVE_NAMES, 3);
        results.push(
          finding(
            DIRECTIVE_NAME_RULE.id,
            "error",
            componentOf(el),
            file,
            el,
            `Unknown directive ${attr} on <${el.tag}> — the engine has no "l-${parsed.name}", ` +
              `so the attribute is inert.` +
              (suggestion ? ` Did you mean l-${suggestion}?` : ""),
          ),
        );
        continue;
      }

      // ── the argument ────────────────────────────────────────────────────
      if (spec.arg === "required" && !parsed.arg) {
        results.push(
          finding(
            DIRECTIVE_NAME_RULE.id,
            "error",
            componentOf(el),
            file,
            el,
            `${attr} needs an argument — write ${spec.attribute}.`,
          ),
        );
        continue;
      }
      if (spec.arg === "none" && parsed.arg && !acceptsFreeSuffix(spec.name)) {
        results.push(
          finding(
            DIRECTIVE_NAME_RULE.id,
            "error",
            componentOf(el),
            file,
            el,
            `${attr} takes no argument — the engine dispatches on "${parsed.name}:${parsed.arg}", ` +
              `which is not a directive. Write l-${spec.name}.`,
          ),
        );
        continue;
      }

      results.push(...modifierFindings(el, spec, parsed.modifiers, attr, file));

      // A directive whose expression is empty where one is required reads as
      // "bound to nothing" at runtime and as "typo'd the value away" here.
      if (value === "" && REQUIRES_EXPRESSION.has(spec.name)) {
        results.push(
          finding(
            DIRECTIVE_NAME_RULE.id,
            "error",
            componentOf(el),
            file,
            el,
            `${attr} on <${el.tag}> has an empty expression — it binds nothing.`,
          ),
        );
      }
    }
  }

  return results;
}

/** Directives that do nothing at all without an expression. */
const REQUIRES_EXPRESSION = new Set([
  "text", "html", "bind", "on", "model", "show", "if", "for", "key", "ref", "effect",
  "init", "transition", "teleport", "source", "collapse", "intersect", "mask", "persist",
]);

function modifierFindings(
  el: ParsedElement,
  spec: ReturnType<typeof directiveByName>,
  modifiers: string[],
  attr: string,
  file: string,
): AuditResult[] {
  if (!spec) return [];
  const results: AuditResult[] = [];
  const allowed = new Set(spec.modifiers);
  const timed = new Set(spec.timed ?? []);
  const valued = new Set(spec.valued ?? []);

  for (let i = 0; i < modifiers.length; i++) {
    const modifier = modifiers[i];
    if (!modifier) continue;

    // The value segment of a `.poll.5000` / `.key.uuid` pair belongs to the
    // modifier before it, and is not a modifier in its own right. So does the
    // stray time in a mistaken `.debounce.500ms` — reported once, below, as the
    // dotted-time mistake it is, not twice as an unknown modifier as well.
    const previous = i > 0 ? modifiers[i - 1] : null;
    if (previous && valued.has(previous)) continue;
    if (previous && timed.has(previous) && /^\d+(ms|s)?$/.test(modifier)) continue;

    if (allowed.has(modifier)) {
      // `.debounce.500ms` — the docs' own documented footgun. The engine takes
      // the time from the SAME segment, so a dotted one is a second modifier
      // that means nothing and the handler silently runs at the default.
      const next = modifiers[i + 1];
      if (timed.has(modifier) && next && /^\d+(ms|s)?$/.test(next)) {
        results.push(
          finding(
            DIRECTIVE_NAME_RULE.id,
            "error",
            componentOf(el),
            file,
            el,
            `.${modifier}.${next} on ${attr} is two modifiers, and the time is ignored — ` +
              `${modifier} runs at its default. Fuse them: .${modifier}${next}.`,
          ),
        );
      }
      continue;
    }

    // `.debounce500ms` — legal, and only when the base is a timed modifier.
    const fused = splitTimedModifier(modifier);
    if (fused) {
      if (timed.has(fused.base)) continue;
      if (allowed.has(fused.base)) {
        results.push(
          finding(
            DIRECTIVE_NAME_RULE.id,
            "error",
            componentOf(el),
            file,
            el,
            `.${modifier} on ${attr}: .${fused.base} takes no time — the digits are ignored.`,
          ),
        );
        continue;
      }
    }

    // A key name is a legal `l-on` modifier and is not in `modifiers`.
    if (spec.keys && KEY_MODIFIERS.includes(modifier)) continue;
    // A number after a valued modifier that we did not skip above is junk.
    const suggestion = suggestClosest(
      modifier,
      spec.keys ? [...spec.modifiers, ...KEY_MODIFIERS] : spec.modifiers,
      2,
    );
    results.push(
      finding(
        DIRECTIVE_NAME_RULE.id,
        "error",
        componentOf(el),
        file,
        el,
        `Unknown modifier .${modifier} on ${attr} — ${spec.attribute} accepts ` +
          `${spec.modifiers.length ? spec.modifiers.map((m) => `.${m}`).join(", ") : "no modifiers"}` +
          `${spec.keys ? ", plus a key name" : ""}.` +
          (suggestion ? ` Did you mean .${suggestion}?` : ""),
      ),
    );
  }

  return results;
}

/** The component name a finding on this element belongs to, for the report. */
function componentOf(el: ParsedElement): string {
  return owningComponent(el)?.attrs["data-ui"] ?? "document";
}

// ---------------------------------------------------------------------------
// part-element
// ---------------------------------------------------------------------------

/**
 * Which `tag_hint`s the rule enforces, and what satisfies each.
 *
 * A hint is authoring guidance, and most substitutions are the author's call: a
 * `<div>` where the reference wrote `<span>`, an `<svg>` filling an `icon` slot,
 * a `<section>` for a `<div>`. Reporting those produced 39 findings on the
 * framework's own reference markup and nothing an agent could act on — which is
 * how a rule teaches its reader to ignore the tool.
 *
 * So this rule enforces only the hints where the substitution changes what the
 * element IS to a screen reader, a keyboard, or the document outline:
 *
 *   • a heading hint → any heading, but never a `<span>` or `<div>`: a title
 *     that is not a heading is missing from every heading list;
 *   • `button`/`a` → an interactive element, never a `<span>`: a `<span>` is not
 *     focusable, not keyboard-operable and has no role;
 *   • `label` → a `<label>`, which is what associates text with a control;
 *   • `li` → an `<li>`, because a non-`li` child of a list is invalid and
 *     silently drops out of the list semantics;
 *   • the form controls and the table elements, which their parents' implicit
 *     ARIA depends on.
 *
 * A hint outside this set is documentation, and is not a finding.
 */
const HEADINGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);

const ENFORCED_HINTS: Record<string, { accepts: Set<string>; why: string }> = {
  button: {
    accepts: new Set(["button", "a", "summary"]),
    why: "a non-interactive element here is not focusable, not keyboard-operable, and has no role",
  },
  a: {
    accepts: new Set(["a", "button"]),
    why: "a non-interactive element here is not focusable, not keyboard-operable, and has no role",
  },
  label: {
    accepts: new Set(["label"]),
    why: "only a <label> associates its text with the control it names",
  },
  li: {
    accepts: new Set(["li"]),
    why: "a non-<li> child of a list is invalid and drops out of the list semantics",
  },
  input: { accepts: new Set(["input", "textarea", "select"]), why: "the slot holds a form control" },
  select: { accepts: new Set(["select", "input"]), why: "the slot holds a form control" },
  textarea: { accepts: new Set(["textarea", "input"]), why: "the slot holds a form control" },
  table: { accepts: new Set(["table"]), why: "table semantics come from the element, not from styling" },
  thead: { accepts: new Set(["thead"]), why: "table semantics come from the element, not from styling" },
  tbody: { accepts: new Set(["tbody"]), why: "table semantics come from the element, not from styling" },
  tr: { accepts: new Set(["tr"]), why: "table semantics come from the element, not from styling" },
  td: { accepts: new Set(["td", "th"]), why: "table semantics come from the element, not from styling" },
  th: { accepts: new Set(["th", "td"]), why: "table semantics come from the element, not from styling" },
};

/** Elements whose children carry list semantics an `li` hint is protecting. */
const LIST_TAGS = new Set(["ul", "ol", "menu"]);

/** `null` when the hint is satisfied (or not enforced); otherwise why it is not. */
function hintViolation(hint: string, tag: string): string | null {
  const wanted = hint.toLowerCase();
  const actual = tag.toLowerCase();
  if (wanted === actual) return null;

  if (HEADINGS.has(wanted)) {
    // A `<legend>` names its `<fieldset>` — it IS the group's accessible name,
    // which is the job the heading hint is protecting. `@faqir-ui/forms` emits
    // exactly that for a nested-object group's title.
    if (HEADINGS.has(actual) || actual === "legend" || actual === "figcaption") return null;
    return "a non-heading here is missing from the document outline and from every screen reader's heading list";
  }

  const enforced = ENFORCED_HINTS[wanted];
  if (!enforced) return null; // presentational hint — guidance, not a contract
  return enforced.accepts.has(actual) ? null : enforced.why;
}

/**
 * Every `data-part` whose manifest names a `tag_hint`, checked against the
 * element that fills it.
 */
export function buildPartElementResults(
  doc: ParsedDocument,
  manifests: Map<string, Manifest>,
  file: string,
): AuditResult[] {
  const results: AuditResult[] = [];

  for (const el of doc.elements) {
    const part = el.attrs["data-part"];
    if (!part) continue;

    // A part answers to the manifest of the component that DECLARES it, walking
    // out through any nesting — a pattern's `title` slot filled inside a card it
    // composes is still the pattern's slot.
    //
    // The walk STOPS at any `[data-ui]` whose manifest the caller does not hold:
    // that component may well declare the slot, and attributing the part to
    // whatever lies further out is a guess. `<span data-part="label">` inside
    // `<label data-ui="radio-label">` is the case — correct markup, which
    // walking past `radio-label` reported against `field-group`'s `<label>` hint.
    let node: ParsedElement | null = el.parent;
    let hint: string | undefined;
    let owner: string | undefined;
    while (node) {
      const name = node.attrs["data-ui"];
      if (name) {
        const manifest = manifests.get(name);
        if (!manifest) break; // unresolvable — do not attribute past it
        const slot = manifest.slots?.[part];
        if (slot) {
          hint = slot.tag_hint;
          owner = name;
          break;
        }
      }
      node = node.parent;
    }
    if (!hint || !owner) continue;

    // Explicitly removed from the accessibility tree, so the semantic argument
    // for the hint does not apply — `<span data-part="expander" data-leaf
    // aria-hidden="true">` is the table's deliberate non-interactive placeholder
    // where a branch row carries a real `<button>`.
    if (el.attrs["aria-hidden"] === "true") continue;

    // The `li` hint is about list semantics, and there are none to break unless
    // the element is actually in a list. A manifest may name `<li>` for a slot
    // its reference composes inside a plain container.
    const parentTag = el.parent?.tag?.toLowerCase();
    if (hint.toLowerCase() === "li" && !LIST_TAGS.has(parentTag ?? "")) continue;

    const violation = hintViolation(hint, el.tag);
    if (violation) {
      results.push(
        finding(
          PART_ELEMENT_RULE.id,
          "warning",
          owner,
          file,
          el,
          `[data-part="${part}"] in [data-ui="${owner}"] is a <${el.tag}>; the manifest names ` +
            `<${hint}> — ${violation}.`,
        ),
      );
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Every silent-failure rule, over one parsed document. Called from
 * `auditHtmlSource` so the CLI, the MCP tool and the browser playground all run
 * the identical set.
 */
export function buildVocabularyResults(
  doc: ParsedDocument,
  manifests: Map<string, Manifest>,
  file: string,
  skipRules: Set<string> = new Set(),
): AuditResult[] {
  const results: AuditResult[] = [];
  results.push(...buildAttributeVocabularyResults(doc, manifests, file, skipRules));
  if (!skipRules.has(DIRECTIVE_NAME_RULE.id)) {
    results.push(...buildDirectiveNameResults(doc, file));
  }
  if (!skipRules.has(PART_ELEMENT_RULE.id)) {
    results.push(...buildPartElementResults(doc, manifests, file));
  }
  return results;
}
