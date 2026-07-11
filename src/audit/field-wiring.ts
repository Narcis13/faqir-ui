// ═══════════════════════════════════════════════════════════════════════════
// Audit rule: field-wiring  [task 0.4-17 · §7.1, §8.3]
// ═══════════════════════════════════════════════════════════════════════════
//
// Enforces the `field-group` ARIA contract (§7.1). For every
// `[data-ui="field-group"]` the control's wiring to its label/description/error
// parts must be internally consistent:
//
//   1. label `for` matches the control `id`.
//   2. the control's `aria-describedby` references the existing description/error
//      part IDs (nothing that should be announced is left unwired).
//   3. `aria-describedby` has no dangling references (every token resolves to a
//      real element id in the document).
//   4. `aria-invalid="true"` is present iff the group is in the invalid state —
//      tolerating BOTH the shipped `data-state="error"` naming AND the normalized
//      `data-state="invalid"` naming (forward-compatible with 0.6-01).
//
// Auto-repair generates any missing IDs and wires them, deriving a deterministic
// base id from the field name/label so the same input always repairs to the same
// canonical wiring (§7.1 example: id="email", description id="email-hint",
// error id="email-error", aria-describedby="email-hint email-error"). The repair
// is emitted as a single `wire-field-group` fix carrying a list of tag-local edits
// (see `applyWireFieldGroup` in repairer.ts).
//
// This is a document-level rule: the contract is about id references spanning
// several elements, so it reasons over the whole parsed document (like
// duplicate-id / heading-order / landmark) and needs no manifest.

import type { ParsedDocument, ParsedElement } from "../parser/html-parser";
import { offsetToPosition } from "../parser/html-parser";
import type { AuditResult, DocumentRule, RepairAction } from "./rules";

export const FIELD_WIRING_RULE_ID = "field-wiring";

/** Native form-control tags that count as "the control" inside a field-group. */
const CONTROL_TAGS = new Set(["input", "select", "textarea"]);

/** `data-ui` values that also identify a control, when it isn't a native tag. */
const CONTROL_UI = new Set(["input", "select", "textarea", "checkbox", "radio", "switch"]);

/** `data-state` values that mean "the group is invalid" — shipped + normalized. */
const INVALID_STATES = new Set(["invalid", "error"]);

/** One tag-local edit for the repairer: set and/or remove attributes on the tag
 * whose opening `<` sits at `offset`. Serialized into the fix payload. */
export interface TagEdit {
  offset: number;
  set?: Record<string, string>;
  remove?: string[];
}

interface FieldGroupScope {
  control: ParsedElement | null;
  label: ParsedElement | null;
  descriptions: ParsedElement[];
  errors: ParsedElement[];
}

/**
 * Collect the parts and control of a single field-group, without descending into
 * a nested `[data-ui="field-group"]` (its parts belong to that inner group). The
 * control lives inside the `[data-part="input"]` wrapper, so we DO recurse through
 * ordinary descendants — we only stop at a nested field-group boundary.
 */
function collectScope(root: ParsedElement): FieldGroupScope {
  const scope: FieldGroupScope = { control: null, label: null, descriptions: [], errors: [] };

  const walk = (el: ParsedElement) => {
    for (const child of el.children) {
      if (child.attrs["data-ui"] === "field-group") continue; // nested group — its own scope
      const part = child.attrs["data-part"];
      if (part === "label" && !scope.label) scope.label = child;
      else if (part === "description") scope.descriptions.push(child);
      else if (part === "error") scope.errors.push(child);
      if (!scope.control && isControl(child)) scope.control = child;
      walk(child);
    }
  };
  walk(root);
  return scope;
}

function isControl(el: ParsedElement): boolean {
  if (CONTROL_TAGS.has(el.tag)) return true;
  const ui = el.attrs["data-ui"];
  return !!ui && CONTROL_UI.has(ui);
}

/** Slugify a string into an id-safe token: lowercase, non-alphanumerics → `-`. */
function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * The visible text of an element, tags stripped (used as a last-resort id source
 * when a control has neither `id` nor `name`). Finds the element's own closing
 * tag from the source; labels are shallow (`<label>Email <span>*</span></label>`)
 * so a same-tag scan is sufficient.
 */
function innerText(source: string, el: ParsedElement): string {
  const open = `<${el.tag}`;
  const close = `</${el.tag}`;
  let depth = 1;
  let i = el.tagEnd;
  let end = -1;
  while (i < source.length) {
    const nextClose = source.indexOf(close, i);
    if (nextClose === -1) break;
    const nextOpen = source.indexOf(open, i);
    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth++;
      i = nextOpen + open.length;
    } else {
      depth--;
      if (depth === 0) { end = nextClose; break; }
      i = nextClose + close.length;
    }
  }
  if (end === -1) return "";
  return source.slice(el.tagEnd, end).replace(/<[^>]*>/g, " ");
}

/**
 * The deterministic base id for a field-group's control: an existing control id
 * wins (keep it, don't churn references), else the control `name`, else the label
 * text, else the literal `field`. Purely a function of the markup, so repeated
 * runs derive the same id (acceptance: "generated IDs deterministic across runs").
 */
function deriveBase(source: string, control: ParsedElement, label: ParsedElement | null): string {
  const existing = (control.attrs["id"] || "").trim();
  if (existing) return existing;
  const name = (control.attrs["name"] || "").trim();
  if (name) { const s = slug(name); if (s) return s; }
  if (label) { const s = slug(innerText(source, label)); if (s) return s; }
  return "field";
}

/** Split an IDREF-list attribute (e.g. aria-describedby) into its tokens. */
function tokens(value: string | undefined): string[] {
  return (value || "").split(/\s+/).filter(Boolean);
}

/** True when the control asserts invalidity (`aria-invalid` present and not "false"). */
function assertsInvalid(control: ParsedElement): boolean {
  const v = control.attrs["aria-invalid"];
  return v !== undefined && v.toLowerCase() !== "false";
}

/**
 * Canonical wiring for a field-group: the ids each part should carry and the
 * aria-describedby the control should have. Existing part ids are preserved;
 * missing ones are generated from the base (`{base}-hint`, `{base}-error`, with a
 * numeric suffix for the rare multi-part case). The describedby lists descriptions
 * first, then errors — matching the §7.1 example ("email-hint email-error").
 */
function canonicalWiring(base: string, scope: FieldGroupScope) {
  const idFor = (el: ParsedElement, kind: "hint" | "error", index: number): string => {
    const existing = (el.attrs["id"] || "").trim();
    if (existing) return existing;
    const suffix = index === 0 ? `${base}-${kind}` : `${base}-${kind}-${index + 1}`;
    return suffix;
  };
  const descIds = scope.descriptions.map((el, i) => idFor(el, "hint", i));
  const errIds = scope.errors.map((el, i) => idFor(el, "error", i));
  return {
    controlId: base,
    descIds,
    errIds,
    describedby: [...descIds, ...errIds].join(" "),
  };
}

/**
 * The `field-wiring` rule. Runs over every field-group in the document, emits one
 * finding per violation class, and attaches a single comprehensive
 * `wire-field-group` repair (to the first finding of each group) that produces the
 * canonical §7.1 wiring when applied.
 */
export const fieldWiringRule: DocumentRule = {
  id: FIELD_WIRING_RULE_ID,
  severity: "error",
  description:
    "field-group ARIA contract (§7.1): the control's aria-describedby must reference the " +
    "existing description/error part IDs (no missing, no dangling refs), aria-invalid must be " +
    "present iff the group is in the invalid state (data-state invalid|error), and the label's " +
    "for must match the control id. Auto-repairable: missing IDs are generated and wired " +
    "deterministically from the field name/label.",
  check(doc) {
    const results: AuditResult[] = [];

    // Document-wide id pool: a describedby token is only "dangling" if it resolves
    // to no element anywhere in the document, not merely outside this field-group.
    const docIds = new Set<string>();
    for (const el of doc.elements) {
      const id = (el.attrs["id"] || "").trim();
      if (id) docIds.add(id);
    }

    for (const root of doc.elements) {
      if (root.attrs["data-ui"] !== "field-group") continue;
      results.push(...checkFieldGroup(doc, root, docIds));
    }

    return results;
  },
};

function checkFieldGroup(doc: ParsedDocument, root: ParsedElement, docIds: Set<string>): AuditResult[] {
  const scope = collectScope(root);
  const control = scope.control;
  // No control → nothing to wire to. Missing label/input is required-slot's job.
  if (!control) return [];

  const invalid = INVALID_STATES.has(root.attrs["data-state"] || "");
  const controlId = (control.attrs["id"] || "").trim();
  const describedby = tokens(control.attrs["aria-describedby"]);
  const describedbySet = new Set(describedby);

  const findings: AuditResult[] = [];
  const at = (el: ParsedElement) => offsetToPosition(doc.source, el.start);
  const base = (message: string, el: ParsedElement): AuditResult => {
    const { line, column } = at(el);
    return {
      rule_id: FIELD_WIRING_RULE_ID,
      severity: "error",
      component_name: "field-group",
      file: doc.file,
      line,
      column,
      message,
    };
  };

  // (1) label `for` must match control `id`.
  if (scope.label) {
    const forVal = (scope.label.attrs["for"] || "").trim();
    if (!forVal || !controlId || forVal !== controlId) {
      findings.push(base(
        `field-group label [data-part="label"] for="${forVal}" does not match the control id="${controlId}" — ` +
        `the label's for must equal the control's id so clicking the label focuses the control.`,
        scope.label,
      ));
    }
  }

  // (2) missing describedby: a description/error part that should be referenced isn't.
  //     "should be referenced" = the part has an id, OR the group is invalid and the
  //     part is an error (an invalid group must announce its error).
  const parts: Array<{ el: ParsedElement; kind: "description" | "error" }> = [
    ...scope.descriptions.map((el) => ({ el, kind: "description" as const })),
    ...scope.errors.map((el) => ({ el, kind: "error" as const })),
  ];
  const missing: string[] = [];
  for (const { el, kind } of parts) {
    const id = (el.attrs["id"] || "").trim();
    const shouldRef = !!id || (invalid && kind === "error");
    if (shouldRef && (!id || !describedbySet.has(id))) {
      missing.push(id ? `#${id}` : `[data-part="${kind}"] (no id yet)`);
    }
  }
  if (missing.length > 0) {
    findings.push(base(
      `field-group control is missing aria-describedby wiring to ${missing.join(", ")} — ` +
      `the control's aria-describedby must reference its description/error part id(s).`,
      control,
    ));
  }

  // (3) dangling describedby ref: a token pointing at no element in the document.
  const dangling = describedby.filter((t) => !docIds.has(t));
  if (dangling.length > 0) {
    findings.push(base(
      `field-group control aria-describedby has dangling reference(s): ${dangling.map((t) => `#${t}`).join(", ")} — ` +
      `every aria-describedby token must resolve to a real element id.`,
      control,
    ));
  }

  // (4) aria-invalid present iff invalid.
  const asserted = assertsInvalid(control);
  if (invalid && !asserted) {
    findings.push(base(
      `field-group is in the invalid state (data-state="${root.attrs["data-state"]}") but the control has no ` +
      `aria-invalid="true" — assistive tech won't announce the field as invalid.`,
      control,
    ));
  } else if (!invalid && asserted) {
    findings.push(base(
      `field-group control has aria-invalid="${control.attrs["aria-invalid"]}" but the group is not in the invalid ` +
      `state — aria-invalid must be present only while the group is invalid (data-state="invalid"|"error").`,
      control,
    ));
  }

  // Attach a single canonical-wiring repair to the first finding for this group.
  if (findings.length > 0) {
    const fix = buildRepair(doc, root, scope, control, invalid);
    if (fix) findings[0].fix = fix;
  }

  return findings;
}

/**
 * Build the `wire-field-group` repair: the exact set of tag-local edits that bring
 * this field-group to canonical §7.1 wiring. Edits are serialized (offsets +
 * attrs) so the repairer can apply them without re-deriving anything.
 */
function buildRepair(
  doc: ParsedDocument,
  root: ParsedElement,
  scope: FieldGroupScope,
  control: ParsedElement,
  invalid: boolean,
): RepairAction | null {
  const b = deriveBase(doc.source, control, scope.label);
  const wiring = canonicalWiring(b, scope);
  const edits: TagEdit[] = [];

  // Control: id, aria-describedby (or remove if there are no parts), aria-invalid.
  edits.push({ offset: control.start, set: { id: wiring.controlId } });
  if (wiring.describedby) {
    edits.push({ offset: control.start, set: { "aria-describedby": wiring.describedby } });
  } else {
    edits.push({ offset: control.start, remove: ["aria-describedby"] });
  }
  edits.push(invalid
    ? { offset: control.start, set: { "aria-invalid": "true" } }
    : { offset: control.start, remove: ["aria-invalid"] });

  // Label: for = control id.
  if (scope.label) edits.push({ offset: scope.label.start, set: { for: wiring.controlId } });

  // Description / error parts: their canonical ids.
  scope.descriptions.forEach((el, i) => edits.push({ offset: el.start, set: { id: wiring.descIds[i] } }));
  scope.errors.forEach((el, i) => edits.push({ offset: el.start, set: { id: wiring.errIds[i] } }));

  return {
    type: "wire-field-group",
    offset: root.start,
    details: { edits: JSON.stringify(edits) },
  };
}
