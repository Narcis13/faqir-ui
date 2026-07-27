// Stylesheet contract rules — `undeclared-attribute` + `breakpoint-canon` (0.8-10)
//
// The two systemic holes this file closes were both found by hand:
//
//  • `stack` shipped `[data-ui="stack"][data-wrap]` in its CSS while its manifest
//    declared three attributes and not that one (follow-up 0.7-20), so every
//    surface generated FROM the manifest — the docs site, the skill, `faqir
//    context`, the vue/react bindings — was blind to an attribute the framework
//    ships. Layout carried ten of those before 0.8-03/0.8-04. Nothing caught them,
//    because every value rule (`valid-variant`, `valid-size`, …) validates the
//    *values* of attributes the manifest already declares; an attribute it never
//    declares is invisible to all of them. `undeclared-attribute` inverts the
//    direction: it starts from what the CSS selects on and demands a declaration.
//
//  • The breakpoint canon (0.8-01) was doctrine plus two sweep *tests*
//    (0.8-08/0.8-09). A test that walks a directory proves today's tree is clean;
//    a rule travels with the component into a user's project and into the
//    playground. `breakpoint-canon` is that sweep's predicate, promoted.
//
// **Why these are not in `ALL_RULES`.** That array is the markup contract —
// `check(component: ParsedComponent, manifest: Manifest)` over parsed HTML. Both
// rules here read a *stylesheet* against a manifest, which is a different input
// pair, the same one the `logical-properties` / `no-important` family already
// uses. Forcing them into `ALL_RULES` would mean handing every HTML rule a CSS
// source it must ignore. They ship instead as `CSS_RULES`, which the inventory,
// the checker, the registry gate and the browser bundle all read — so "shipped in
// both bundles" is satisfied by one export rather than by two rule engines.
//
// Free of `node:*` by construction (string in, findings out) — the browser bundle
// exposes both through `auditComponentCss`.

import type { Manifest } from "../manifest";
import type { AuditResult, RuleInfo } from "./rules";
import { findAtRulePreludes, findSelectedAttributes } from "../parser/css-parser";
import {
  BREAKPOINTS,
  TIERS,
  isProtocolAttribute,
  isTier,
  minWidth,
  parseResponsiveAttribute,
} from "../utils/breakpoints";

/**
 * The two attributes a component never declares because the protocol declares
 * them for it: `data-ui` names the component and `data-part` names its slots
 * (whose vocabulary `orphan-part` already checks against `slots`). Every other
 * `data-*` attribute is component surface and needs a declaration.
 */
export const IMPLICIT_ATTRIBUTES: readonly string[] = Object.freeze(["data-ui", "data-part"]);

export const UNDECLARED_ATTRIBUTE_RULE: RuleInfo = {
  id: "undeclared-attribute",
  severity: "error",
  applies_to: "component CSS vs its manifest",
  exempt: [
    "data-ui and data-part (declared by the protocol, not by a component)",
    "non-data attributes ([dir], [disabled], [aria-*], [hidden] …) — not component surface",
  ],
  description:
    "Every data-* attribute a component's CSS selects on must be declared in its " +
    "manifest as a variant attr, a prop or a state — including tier-suffixed forms " +
    "(data-cols-md) and attributes on child elements. Manifests are the source of " +
    "truth: an undeclared attribute is invisible to the docs, the skill, `faqir " +
    "context` and the framework bindings, so it cannot be discovered or used.",
};

export const BREAKPOINT_CANON_RULE: RuleInfo = {
  id: "breakpoint-canon",
  severity: "warning",
  applies_to: "component CSS (@media / @container preludes)",
  exempt: [
    "preludes with no width condition (prefers-reduced-motion, prefers-color-scheme, forced-colors, hover, print …)",
  ],
  description:
    `A width prelude may only be one canon min-width floor — ${TIERS.map(
      (t) => `${t} ${BREAKPOINTS[t].rem}rem`,
    ).join(" · ")}. ` +
    "The canon (FAQIR-SPEC §15) is mobile-first and min-width-only: a max-width " +
    "query inverts the cascade, and a pair of them leaves a dead zone at fractional " +
    "viewport widths. Preludes that carry no width at all are exempt.",
};

/** Both stylesheet-contract rules, for the inventory and the browser legend. */
export const CSS_RULES: RuleInfo[] = [UNDECLARED_ATTRIBUTE_RULE, BREAKPOINT_CANON_RULE];

/**
 * Every attribute a manifest declares, in any of the three ways the schema
 * allows — a variant group's `attr` (plus its four tier forms when the group is
 * `responsive`), a prop's `attr` (defaulting to `data-<name>`), and a state's
 * `attr` with any `="value"` suffix removed.
 *
 * Exported because the same set answers "what surface does this component have?"
 * for callers other than the rule. It holds ONLY what the manifest says — the
 * protocol's own `data-ui`/`data-part` are exempted at the rule, not smuggled
 * in here, so a caller asking about a component's declared surface gets exactly
 * that.
 */
export function declaredAttributes(manifest: Manifest): Set<string> {
  const declared = new Set<string>();

  for (const variant of Object.values(manifest.variants ?? {})) {
    if (!variant?.attr) continue;
    declared.add(variant.attr);
    if (variant.responsive !== true) continue;
    for (const tier of TIERS) declared.add(`${variant.attr}-${tier}`);
  }

  for (const [name, prop] of Object.entries(manifest.props ?? {})) {
    declared.add(prop?.attr ?? `data-${name}`);
  }

  for (const state of Object.values(manifest.states ?? {})) {
    if (!state?.attr) continue;
    declared.add(state.attr.split("=")[0].trim());
  }

  return declared;
}

/** Why an attribute is undeclared, phrased for whoever has to fix it. */
function undeclaredHint(attr: string, declared: Set<string>): string {
  const responsive = parseResponsiveAttribute(attr);
  if (responsive && declared.has(responsive.base)) {
    return (
      ` — "${responsive.base}" is declared but its variant group is not marked ` +
      `"responsive": true, which is what makes the four data-<attr>-<tier> forms legal`
    );
  }
  const dash = attr.lastIndexOf("-");
  const suffix = dash > 0 ? attr.slice(dash + 1) : "";
  if (isTier(suffix) && isProtocolAttribute(attr.slice(0, dash))) {
    return (
      ` — the responsive grammar never applies to a protocol attribute, so ` +
      `"${attr}" cannot be declared; use a component attribute instead (FAQIR-SPEC §15)`
    );
  }
  return "";
}

/**
 * `undeclared-attribute` findings for one component (task 0.8-10).
 *
 * One finding per distinct attribute, pinned to the first selector that uses it:
 * `table` selects `[data-stacked]` in eleven rules, and eleven identical findings
 * would say nothing the first does not.
 */
export function buildUndeclaredAttributeResults(
  source: string,
  manifest: Manifest,
  file: string,
): AuditResult[] {
  const declared = declaredAttributes(manifest);
  const results: AuditResult[] = [];
  const seen = new Set<string>();

  for (const selected of findSelectedAttributes(source)) {
    const attr = selected.attr.toLowerCase();
    if (!attr.startsWith("data-")) continue; // [dir], [disabled], [aria-*] — not component surface
    if (IMPLICIT_ATTRIBUTES.includes(attr)) continue; // declared by the protocol itself
    if (declared.has(attr) || seen.has(attr)) continue;
    seen.add(attr);
    results.push({
      rule_id: UNDECLARED_ATTRIBUTE_RULE.id,
      severity: UNDECLARED_ATTRIBUTE_RULE.severity,
      component_name: manifest.name,
      file,
      line: selected.line,
      message:
        `"${attr}" is selected by "${selected.selector}" but ${manifest.name}.manifest.json ` +
        `declares no variant, prop or state that writes it${undeclaredHint(attr, declared)}. ` +
        `Declare it, or stop selecting on it — a manifest is the only surface agents read.`,
    });
  }

  return results;
}

/** The canon conditions, derived from the module and never re-typed. */
const CANON_CONDITIONS = new Map(TIERS.map((tier) => [minWidth(tier), tier] as const));

/** A width prelude, stripped of its optional container name. */
const SINGLE_CONDITION = /^(?:[a-z][\w-]*\s+)?\(\s*([^()]+?)\s*\)$/;

/**
 * `breakpoint-canon` findings for one stylesheet (task 0.8-10).
 *
 * The predicate is the one 0.8-08 wrote as a sweep test and deliberately shaped
 * to be lifted: a prelude that *mentions* a width must be exactly one
 * parenthesised canon `min-width` condition (optionally preceded by a container
 * name). Everything with no width in it — `prefers-reduced-motion`,
 * `prefers-color-scheme`, `forced-colors`, `hover`, `print` — is exempt by
 * construction rather than by an allowlist anyone has to maintain.
 */
export function buildBreakpointCanonResults(
  source: string,
  name: string,
  file: string,
): AuditResult[] {
  const results: AuditResult[] = [];
  const canon = TIERS.map((t) => `${t} (${BREAKPOINTS[t].rem}rem)`).join(", ");

  for (const prelude of findAtRulePreludes(source)) {
    if (!/width/i.test(prelude.text)) continue; // no width — nothing the canon governs

    const at = `@${prelude.kind} ${prelude.text}`;
    let why: string;
    const single = SINGLE_CONDITION.exec(prelude.text);
    const condition = single?.[1].replace(/\s+/g, " ").toLowerCase();

    if (/max-width|max-inline-size/i.test(prelude.text)) {
      why =
        "the canon is min-width-only and mobile-first — invert the block so the " +
        "unconditional rule is the phone case and the tier reveals the wider one";
    } else if (!single) {
      why = "a width prelude must be exactly one parenthesised condition";
    } else if (condition && CANON_CONDITIONS.has(condition)) {
      continue; // canon
    } else {
      why = `"${single[1].trim()}" is not a canon floor`;
    }

    results.push({
      rule_id: BREAKPOINT_CANON_RULE.id,
      severity: BREAKPOINT_CANON_RULE.severity,
      component_name: name,
      file,
      line: prelude.line,
      message: `Off-canon width prelude "${at}" in ${name}.css — ${why}. Canon floors: ${canon}.`,
    });
  }

  return results;
}
