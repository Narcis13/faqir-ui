// Audit rule definitions — each rule checks a parsed component against its manifest

import type { ParsedComponent, ParsedElement, ParsedDocument } from "../parser/html-parser";
import { offsetToPosition } from "../parser/html-parser";
import type { Manifest } from "../manifest";
import { suggestClosest } from "../utils/suggest";

export type Severity = "critical" | "error" | "warning" | "info";

export interface RepairAction {
  type: "add-attribute" | "rename-attribute" | "remove-element" | "add-element" | "add-script" | "rewrite-css" | "rename-id";
  /** Byte offset in source where the fix applies */
  offset: number;
  details: Record<string, string>;
}

export interface AuditResult {
  rule_id: string;
  severity: Severity;
  component_name: string;
  file: string;
  line: number;
  /** 1-based column, when a rule can pin the finding precisely (document rules). */
  column?: number;
  message: string;
  fix?: RepairAction;
}

export interface AuditRule {
  id: string;
  severity: Severity;
  description: string;
  check(component: ParsedComponent, manifest: Manifest): AuditResult[];
}

// ── Rule: required-slot ──
// All slots marked required: true in manifest must exist in DOM
export const requiredSlotRule: AuditRule = {
  id: "required-slot",
  severity: "critical",
  description: "Required slot is missing from component",
  check(component, manifest) {
    const results: AuditResult[] = [];
    for (const [slotName, slotDef] of Object.entries(manifest.slots)) {
      if (!slotDef.required) continue;
      const found = component.parts[slotName];
      if (!found || found.length === 0) {
        results.push({
          rule_id: "required-slot",
          severity: "critical",
          component_name: component.name,
          file: component.file,
          line: component.line,
          message: `Missing required slot [data-part="${slotName}"] in <${component.root.tag} data-ui="${component.name}">`,
        });
      }
    }
    return results;
  },
};

// ── Rule: required-aria ──
// Check ARIA attributes from manifest a11y.required_attrs
export const requiredAriaRule: AuditRule = {
  id: "required-aria",
  severity: "critical",
  description: "Required ARIA attribute is missing",
  check(component, manifest) {
    const results: AuditResult[] = [];
    if (!manifest.a11y?.required_attrs) return results;

    for (const requirement of manifest.a11y.required_attrs) {
      const lower = requirement.toLowerCase();

      // Parse patterns like 'role="dialog" on panel'
      const attrOnMatch = lower.match(/^(\w[\w-]*)="?([^"]*)"?\s+on\s+(\w+)/);
      if (attrOnMatch) {
        const [, attrName, attrValue, partName] = attrOnMatch;
        const target = partName === "root" ? [component.root] : (component.parts[partName] || []);
        for (const el of target) {
          if (!(attrName in el.attrs)) {
            results.push({
              rule_id: "required-aria",
              severity: "critical",
              component_name: component.name,
              file: component.file,
              line: el.start ? countLineFromEl(component, el) : component.line,
              message: `Missing ${attrName}="${attrValue}" on [data-part="${partName}"]`,
              fix: {
                type: "add-attribute",
                offset: el.tagEnd - 1, // Before the closing >
                details: { attr: attrName, value: attrValue },
              },
            });
          } else if (attrValue && el.attrs[attrName] !== attrValue) {
            results.push({
              rule_id: "required-aria",
              severity: "critical",
              component_name: component.name,
              file: component.file,
              line: countLineFromEl(component, el),
              message: `${attrName} should be "${attrValue}" on [data-part="${partName}"], found "${el.attrs[attrName]}"`,
            });
          }
        }
        continue;
      }

      // Parse patterns like 'aria-labelledby pointing to title id'
      if (lower.includes("aria-labelledby") && lower.includes("title")) {
        const panels = component.parts["panel"] || [];
        for (const panel of panels) {
          if (!("aria-labelledby" in panel.attrs)) {
            results.push({
              rule_id: "required-aria",
              severity: "critical",
              component_name: component.name,
              file: component.file,
              line: countLineFromEl(component, panel),
              message: `Missing aria-labelledby on [data-part="panel"] — should point to title element id`,
              fix: {
                type: "add-attribute",
                offset: panel.tagEnd - 1,
                details: { attr: "aria-labelledby", value: "" },
              },
            });
          }
        }
        continue;
      }

      // Parse patterns like 'aria-label on close button'
      if (lower.includes("aria-label") && lower.includes("close")) {
        const closeButtons = component.parts["close"] || [];
        for (const btn of closeButtons) {
          if (!("aria-label" in btn.attrs)) {
            results.push({
              rule_id: "required-aria",
              severity: "critical",
              component_name: component.name,
              file: component.file,
              line: countLineFromEl(component, btn),
              message: `Missing aria-label on [data-part="close"] button`,
              fix: {
                type: "add-attribute",
                offset: btn.tagEnd - 1,
                details: { attr: "aria-label", value: "Close" },
              },
            });
          }
        }
        continue;
      }

      // Parse patterns like 'aria-expanded on trigger'
      if (lower.includes("aria-expanded") && lower.includes("trigger")) {
        const triggers = component.parts["trigger"] || [];
        for (const trigger of triggers) {
          if (!("aria-expanded" in trigger.attrs)) {
            results.push({
              rule_id: "required-aria",
              severity: "critical",
              component_name: component.name,
              file: component.file,
              line: countLineFromEl(component, trigger),
              message: `Missing aria-expanded on [data-part="trigger"]`,
              fix: {
                type: "add-attribute",
                offset: trigger.tagEnd - 1,
                details: { attr: "aria-expanded", value: "false" },
              },
            });
          }
        }
        continue;
      }

      // Parse patterns like 'aria-haspopup="true" on trigger'
      if (lower.includes("aria-haspopup") && lower.includes("trigger")) {
        const triggers = component.parts["trigger"] || [];
        for (const trigger of triggers) {
          if (!("aria-haspopup" in trigger.attrs)) {
            results.push({
              rule_id: "required-aria",
              severity: "critical",
              component_name: component.name,
              file: component.file,
              line: countLineFromEl(component, trigger),
              message: `Missing aria-haspopup on [data-part="trigger"]`,
              fix: {
                type: "add-attribute",
                offset: trigger.tagEnd - 1,
                details: { attr: "aria-haspopup", value: "true" },
              },
            });
          }
        }
        continue;
      }

      // Parse role requirements on specific parts: 'role="xyz" on each thing'
      const roleMatch = lower.match(/role="(\w+)"\s+on\s+(?:each\s+)?(\w+)/);
      if (roleMatch) {
        const [, roleValue, partName] = roleMatch;
        const elements = component.parts[partName] || [];
        for (const el of elements) {
          if (el.attrs.role !== roleValue) {
            results.push({
              rule_id: "required-aria",
              severity: "critical",
              component_name: component.name,
              file: component.file,
              line: countLineFromEl(component, el),
              message: `Missing role="${roleValue}" on [data-part="${partName}"]`,
              fix: {
                type: "add-attribute",
                offset: el.tagEnd - 1,
                details: { attr: "role", value: roleValue },
              },
            });
          }
        }
        continue;
      }

      // aria-selected, aria-controls, aria-labelledby on specific parts
      const ariaOnMatch = lower.match(/(aria-[\w-]+)\s+on\s+(\w+)/);
      if (ariaOnMatch) {
        const [, attrName, partName] = ariaOnMatch;
        const elements = component.parts[partName] || [];
        for (const el of elements) {
          if (!(attrName in el.attrs)) {
            results.push({
              rule_id: "required-aria",
              severity: "critical",
              component_name: component.name,
              file: component.file,
              line: countLineFromEl(component, el),
              message: `Missing ${attrName} on [data-part="${partName}"]`,
            });
          }
        }
      }
    }

    return results;
  },
};

// ── Rule: focus-trap ──
// Recipe with a11y.focus_trap: true must have its JS controller
export const focusTrapRule: AuditRule = {
  id: "focus-trap",
  severity: "critical",
  description: "Component with focus_trap requires its JS controller to be loaded",
  check(component, manifest) {
    if (!manifest.a11y?.focus_trap) return [];
    if (manifest.kind !== "recipe") return [];
    // This is checked at the file level by controller-loaded, but we flag it here too
    return [{
      rule_id: "focus-trap",
      severity: "critical",
      component_name: component.name,
      file: component.file,
      line: component.line,
      message: `[data-ui="${component.name}"] requires focus trap — ensure ${manifest.files.js || component.name + ".js"} controller is loaded`,
    }];
  },
};

// ── Rule: valid-variant ──
// data-variant value must exist in manifest variants
export const validVariantRule: AuditRule = {
  id: "valid-variant",
  severity: "error",
  description: "Invalid data-variant value not defined in manifest",
  check(component, manifest) {
    const results: AuditResult[] = [];

    // Collect all valid variant values across all variant groups that use data-variant
    const validValues = new Set<string>();
    for (const variant of Object.values(manifest.variants)) {
      if (variant.attr === "data-variant") {
        for (const v of variant.values) {
          validValues.add(v);
        }
      }
    }

    // Check root element
    if ("data-variant" in component.root.attrs) {
      const value = component.root.attrs["data-variant"];
      if (value && validValues.size > 0 && !validValues.has(value)) {
        results.push({
          rule_id: "valid-variant",
          severity: "error",
          component_name: component.name,
          file: component.file,
          line: component.line,
          message: `Invalid variant "${value}" on [data-ui="${component.name}"]. Valid values: ${[...validValues].join(", ")}`,
        });
      }
    }

    // Check parts with data-variant
    for (const [partName, elements] of Object.entries(component.parts)) {
      for (const el of elements) {
        if ("data-variant" in el.attrs) {
          const value = el.attrs["data-variant"];
          // Check if this part has variant rules
          let partValidValues = new Set<string>();
          for (const variant of Object.values(manifest.variants)) {
            if (variant.attr === "data-variant" && (variant.applied_to === partName || !variant.applied_to || variant.applied_to === "root")) {
              for (const v of variant.values) {
                partValidValues.add(v);
              }
            }
          }
          if (value && partValidValues.size > 0 && !partValidValues.has(value)) {
            results.push({
              rule_id: "valid-variant",
              severity: "error",
              component_name: component.name,
              file: component.file,
              line: countLineFromEl(component, el),
              message: `Invalid variant "${value}" on [data-part="${partName}"]. Valid values: ${[...partValidValues].join(", ")}`,
            });
          }
        }
      }
    }

    return results;
  },
};

// ── Rule: valid-state ──
// data-state value must exist in manifest states
export const validStateRule: AuditRule = {
  id: "valid-state",
  severity: "error",
  description: "Invalid data-state value not defined in manifest",
  check(component, manifest) {
    const results: AuditResult[] = [];
    const validStates = new Set(Object.keys(manifest.states));

    if ("data-state" in component.root.attrs) {
      const value = component.root.attrs["data-state"];
      if (value && validStates.size > 0 && !validStates.has(value)) {
        results.push({
          rule_id: "valid-state",
          severity: "error",
          component_name: component.name,
          file: component.file,
          line: component.line,
          message: `Invalid state "${value}" on [data-ui="${component.name}"]. Valid states: ${[...validStates].join(", ")}`,
        });
      }
    }

    return results;
  },
};

// ── Rule: valid-size ──
// data-size value must exist in manifest variants.size.values
export const validSizeRule: AuditRule = {
  id: "valid-size",
  severity: "error",
  description: "Invalid data-size value not defined in manifest",
  check(component, manifest) {
    const results: AuditResult[] = [];

    const sizeVariant = manifest.variants.size;
    if (!sizeVariant) return results;

    const validSizes = new Set(sizeVariant.values);

    // Check root
    if ("data-size" in component.root.attrs) {
      const value = component.root.attrs["data-size"];
      if (value && !validSizes.has(value)) {
        results.push({
          rule_id: "valid-size",
          severity: "error",
          component_name: component.name,
          file: component.file,
          line: component.line,
          message: `Invalid size "${value}" on [data-ui="${component.name}"]. Valid sizes: ${[...validSizes].join(", ")}`,
        });
      }
    }

    // Check parts with data-size
    for (const [partName, elements] of Object.entries(component.parts)) {
      for (const el of elements) {
        if ("data-size" in el.attrs) {
          const value = el.attrs["data-size"];
          if (value && !validSizes.has(value)) {
            results.push({
              rule_id: "valid-size",
              severity: "error",
              component_name: component.name,
              file: component.file,
              line: countLineFromEl(component, el),
              message: `Invalid size "${value}" on [data-part="${partName}"]. Valid sizes: ${[...validSizes].join(", ")}`,
            });
          }
        }
      }
    }

    return results;
  },
};

// ── Rule: icon-name ──
// data-icon value must be a known glyph in the manifest's icon set. Manifest-
// driven: any component whose manifest declares a variant with attr "data-icon"
// (the icon primitive's `variants.icon`) has its data-icon values validated
// against that variant's `values`. A typo gets a nearest-match suggestion via
// the shared typo-suggestion util (same one that powers `faqir <typo>`).
export const iconNameRule: AuditRule = {
  id: "icon-name",
  severity: "error",
  description: "data-icon value must be a known icon name from the manifest's icon set",
  check(component, manifest) {
    const results: AuditResult[] = [];

    // The variant that drives data-icon (icon primitive → variants.icon).
    let validNames: string[] | null = null;
    for (const variant of Object.values(manifest.variants)) {
      if (variant.attr === "data-icon") {
        validNames = variant.values;
        break;
      }
    }
    if (!validNames || validNames.length === 0) return results;
    const valid = new Set(validNames);

    const checkEl = (el: ParsedElement, where: string, line: number) => {
      if (!("data-icon" in el.attrs)) return;
      const value = el.attrs["data-icon"];
      if (!value || valid.has(value)) return;
      const suggestion = suggestClosest(value, validNames!, 3);
      const hint = suggestion ? ` — did you mean "${suggestion}"?` : "";
      results.push({
        rule_id: "icon-name",
        severity: "error",
        component_name: component.name,
        file: component.file,
        line,
        message: `Unknown icon "${value}" on ${where}${hint}`,
      });
    };

    checkEl(component.root, `[data-ui="${component.name}"]`, component.line);
    for (const [partName, elements] of Object.entries(component.parts)) {
      for (const el of elements) {
        checkEl(el, `[data-part="${partName}"]`, countLineFromEl(component, el));
      }
    }

    return results;
  },
};

// ── Rule: controller-loaded ──
// Recipe components must have their JS controller referenced
// (We check for script tags or module imports referencing the controller file)
export const controllerLoadedRule: AuditRule = {
  id: "controller-loaded",
  severity: "error",
  description: "Recipe component JS controller is not referenced",
  check(component, manifest) {
    if (manifest.kind !== "recipe") return [];
    if (!manifest.files.js) return [];

    // This is a file-level check — we note it as a reminder
    // The actual script check happens at the audit command level
    return [{
      rule_id: "controller-loaded",
      severity: "error",
      component_name: component.name,
      file: component.file,
      line: component.line,
      message: `Recipe [data-ui="${component.name}"] requires controller "${manifest.files.js}" to be loaded`,
    }];
  },
};

// ── Rule: orphan-part ──
// data-part values should be valid slot names from the manifest
export const orphanPartRule: AuditRule = {
  id: "orphan-part",
  severity: "warning",
  description: "data-part value is not a recognized slot name in the manifest",
  check(component, manifest) {
    const results: AuditResult[] = [];
    const validSlots = new Set(Object.keys(manifest.slots));

    for (const [partName, elements] of Object.entries(component.parts)) {
      if (!validSlots.has(partName)) {
        for (const el of elements) {
          results.push({
            rule_id: "orphan-part",
            severity: "warning",
            component_name: component.name,
            file: component.file,
            line: countLineFromEl(component, el),
            message: `Unknown slot [data-part="${partName}"] in [data-ui="${component.name}"]. Valid slots: ${[...validSlots].join(", ")}`,
          });
        }
      }
    }

    return results;
  },
};

// ── Rule: aria-describedby ──
// If description slot exists, panel should have aria-describedby
export const ariaDescribedbyRule: AuditRule = {
  id: "aria-describedby",
  severity: "warning",
  description: "Description slot exists but aria-describedby is missing on panel",
  check(component, manifest) {
    const results: AuditResult[] = [];

    // Only applies if manifest defines a description slot
    if (!manifest.slots.description) return results;

    const descriptionParts = component.parts["description"] || [];
    if (descriptionParts.length === 0) return results;

    const panels = component.parts["panel"] || [];
    for (const panel of panels) {
      if (!("aria-describedby" in panel.attrs)) {
        results.push({
          rule_id: "aria-describedby",
          severity: "warning",
          component_name: component.name,
          file: component.file,
          line: countLineFromEl(component, panel),
          message: `Description slot exists but [data-part="panel"] is missing aria-describedby`,
          fix: {
            type: "add-attribute",
            offset: panel.tagEnd - 1,
            details: { attr: "aria-describedby", value: "" },
          },
        });
      }
    }

    return results;
  },
};

// ── Rule: close-label ──
// Close buttons must have aria-label
export const closeLabelRule: AuditRule = {
  id: "close-label",
  severity: "warning",
  description: "Close button is missing aria-label",
  check(component, _manifest) {
    const results: AuditResult[] = [];

    const closeButtons = component.parts["close"] || [];
    for (const btn of closeButtons) {
      if (!("aria-label" in btn.attrs)) {
        results.push({
          rule_id: "close-label",
          severity: "warning",
          component_name: component.name,
          file: component.file,
          line: countLineFromEl(component, btn),
          message: `[data-part="close"] button is missing aria-label`,
          fix: {
            type: "add-attribute",
            offset: btn.tagEnd - 1,
            details: { attr: "aria-label", value: "Close" },
          },
        });
      }
    }

    return results;
  },
};

// ── Rule: no-class-attribute ──
// Components should never use class attributes — data attributes are the Faqir protocol
export const noClassAttributeRule: AuditRule = {
  id: "no-class-attribute",
  severity: "warning",
  description: "Element uses class attribute — Faqir components use data-ui, data-variant, data-state instead",
  check(component, _manifest) {
    const results: AuditResult[] = [];

    function walk(el: ParsedElement) {
      if (el.attrs["class"]) {
        results.push({
          rule_id: "no-class-attribute",
          severity: "warning",
          component_name: component.name,
          file: component.file,
          line: countLineFromEl(component, el),
          message: `Element <${el.tag}> uses class="${el.attrs["class"]}" — use data-ui, data-variant, or data-state attributes instead of classes`,
        });
      }
      for (const child of el.children) {
        walk(child);
      }
    }

    walk(component.root);
    return results;
  },
};

// ── Rule: token-aware-style ──
// Inline style attributes should reference design tokens (var(--...)) not hardcoded values
const HARDCODED_COLOR_RE = /#[0-9a-fA-F]{3,8}\b/;
const HARDCODED_RGB_RE = /\b(?:rgb|hsl|oklch)\s*\(/i;
const HARDCODED_PX_RE = /(?:^|[\s:;])(\d+(?:\.\d+)?px)/;
const TOKEN_VAR_RE = /var\(\s*--/;

export const tokenAwareStyleRule: AuditRule = {
  id: "token-aware-style",
  severity: "info",
  description: "Inline style uses hardcoded values instead of design tokens",
  check(component, _manifest) {
    const results: AuditResult[] = [];

    function walk(el: ParsedElement) {
      const style = el.attrs["style"];
      if (style) {
        // Check for hardcoded colors
        if (HARDCODED_COLOR_RE.test(style) || HARDCODED_RGB_RE.test(style)) {
          results.push({
            rule_id: "token-aware-style",
            severity: "info",
            component_name: component.name,
            file: component.file,
            line: countLineFromEl(component, el),
            message: `Element <${el.tag}> inline style contains hardcoded color values — use var(--color-*) tokens instead`,
          });
        }

        // Check for hardcoded pixel values (skip width/height percentages which are fine)
        // Only flag if there are px values and NO token references in the same property
        const properties = style.split(";").map(s => s.trim()).filter(Boolean);
        for (const prop of properties) {
          if (HARDCODED_PX_RE.test(prop) && !TOKEN_VAR_RE.test(prop)) {
            // Whitelist common non-token properties: width/height with specific values, grid-column
            const propName = prop.split(":")[0]?.trim().toLowerCase() ?? "";
            const whitelisted = ["width", "height", "min-width", "max-width", "min-height", "max-height", "grid-column", "top", "left", "right", "bottom"];
            if (!whitelisted.includes(propName)) {
              results.push({
                rule_id: "token-aware-style",
                severity: "info",
                component_name: component.name,
                file: component.file,
                line: countLineFromEl(component, el),
                message: `Element <${el.tag}> inline style "${prop.trim()}" uses hardcoded pixel value — use var(--space-*) or var(--text-*) tokens instead`,
              });
            }
          }
        }
      }
      for (const child of el.children) {
        walk(child);
      }
    }

    walk(component.root);
    return results;
  },
};

// ── All rules ──
export const ALL_RULES: AuditRule[] = [
  requiredSlotRule,
  requiredAriaRule,
  focusTrapRule,
  validVariantRule,
  validStateRule,
  validSizeRule,
  iconNameRule,
  controllerLoadedRule,
  orphanPartRule,
  ariaDescribedbyRule,
  closeLabelRule,
  noClassAttributeRule,
  tokenAwareStyleRule,
];

// ─────────────────────────────────────────────────────────────────────────────
// Document-level rules (task 0.4-15)
//
// These operate on a whole HTML file (`ParsedDocument`), not a single component
// vs its manifest. They are deterministic, manifest-independent accessibility
// checks and run on every scanned HTML file, in addition to the per-component
// rules above. Each finding carries a 1-based line AND column, pinned to the
// offending element via `offsetToPosition`.
// ─────────────────────────────────────────────────────────────────────────────

export interface DocumentRule {
  id: string;
  severity: Severity;
  description: string;
  check(doc: ParsedDocument): AuditResult[];
}

const HEADING_TAGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);

/** True if `el` has the given ARIA role (role attribute is a space-separated list). */
function hasRole(el: ParsedElement, role: string): boolean {
  const r = el.attrs["role"];
  return !!r && r.split(/\s+/).includes(role);
}

/** 1-based line/column of an element's opening `<`, against the document source. */
function elementPosition(doc: ParsedDocument, el: ParsedElement): { line: number; column: number } {
  return offsetToPosition(doc.source, el.start);
}

// Attributes whose value is an IDREF (or a space-separated IDREF list). If a
// duplicated id is the target of any of these, an automatic rename is unsafe —
// the reference would become ambiguous (which element did it mean?) — so those
// duplicates are report-only. See `duplicateIdRule`.
const IDREF_ATTRS = [
  "for", "form", "list", "headers", "aria-labelledby", "aria-describedby",
  "aria-controls", "aria-owns", "aria-activedescendant", "aria-details",
  "aria-errormessage", "aria-flowto", "popovertarget", "itemref", "contextmenu",
];

/** Every id value referenced anywhere in the document (IDREF attrs + `#frag` URLs). */
function collectReferencedIds(doc: ParsedDocument): Set<string> {
  const refs = new Set<string>();
  for (const el of doc.elements) {
    for (const attr of IDREF_ATTRS) {
      const v = el.attrs[attr];
      if (!v) continue;
      for (const token of v.split(/\s+/)) if (token) refs.add(token);
    }
    for (const attr of ["href", "xlink:href"]) {
      const v = el.attrs[attr];
      if (v && v.length > 1 && v.startsWith("#")) refs.add(v.slice(1));
    }
  }
  return refs;
}

// Ids inside a <template> live in a separate scope: template content is inert and
// seeds declarative shadow DOM, so the same id there is NOT a document-level
// duplicate. We key each id by its nearest ancestor <template> (light DOM = the
// document scope). Duplicate IDs *across shadow boundaries* are therefore out of
// scope by design — a static scan cannot see into a real shadow root, and the
// <template> case is the one we can and do model here.
function idScopeKey(el: ParsedElement): string {
  let p = el.parent;
  while (p) {
    if (p.tag === "template") return `tpl@${p.start}`;
    p = p.parent;
  }
  return "doc";
}

/** Next id not already present/assigned, e.g. `email` → `email-2` → `email-3`. */
function uniqueIdName(base: string, used: Set<string>): string {
  let n = 2;
  let candidate = `${base}-${n}`;
  while (used.has(candidate)) candidate = `${base}-${++n}`;
  return candidate;
}

// ── Rule: duplicate-id ──
// Every id must be unique within a document; duplicates break ARIA relationships
// (aria-labelledby/for/aria-controls resolve to the first match, silently
// mis-wiring the rest) and are invalid HTML. The first occurrence in a scope is
// treated as canonical; each subsequent one is flagged.
//
// Auto-repair decision: a duplicate is marked auto-repairable ONLY when a *safe*
// rename exists — i.e. the id is not referenced by any IDREF attribute or `#frag`
// URL anywhere in the document. An unreferenced duplicate can be given a unique
// suffix with no behavioral change. A *referenced* duplicate is report-only: we
// can't know which element the reference intended, so renaming could break the
// wiring — a human must resolve it.
export const duplicateIdRule: DocumentRule = {
  id: "duplicate-id",
  severity: "error",
  description: "Every id must be unique within a document — duplicates break ARIA references (aria-labelledby/for/aria-controls) and are invalid HTML.",
  check(doc) {
    const results: AuditResult[] = [];

    // Group id-bearing elements by (scope, id value), preserving document order.
    const groups = new Map<string, ParsedElement[]>();
    const allIds = new Set<string>();
    for (const el of doc.elements) {
      const id = el.attrs["id"];
      if (!id) continue; // skip missing/empty id
      allIds.add(id);
      const key = `${idScopeKey(el)} ${id}`;
      const arr = groups.get(key);
      if (arr) arr.push(el);
      else groups.set(key, [el]);
    }

    const referenced = collectReferencedIds(doc);
    const used = new Set(allIds); // pool for generating collision-free rename targets

    for (const [key, els] of groups) {
      if (els.length < 2) continue;
      const id = key.slice(key.indexOf(" ") + 1);
      const safe = !referenced.has(id);

      // Keep the first occurrence as canonical; flag every later one.
      for (let i = 1; i < els.length; i++) {
        const el = els[i];
        const { line, column } = elementPosition(doc, el);
        const result: AuditResult = {
          rule_id: "duplicate-id",
          severity: "error",
          component_name: el.attrs["data-ui"] || "",
          file: doc.file,
          line,
          column,
          message: "",
        };
        if (safe) {
          const to = uniqueIdName(id, used);
          used.add(to);
          result.message =
            `Duplicate id="${id}" on <${el.tag}> — ids must be unique per document (${els.length} elements share it). ` +
            `Rename this one to id="${to}" (nothing references it, so the rename is safe), or remove the id.`;
          result.fix = { type: "rename-id", offset: el.start, details: { from: id, to } };
        } else {
          result.message =
            `Duplicate id="${id}" on <${el.tag}> — ids must be unique per document (${els.length} elements share it), ` +
            `and this id is referenced (aria-*/for/href="#${id}"). Resolve manually and re-point the reference so the ARIA/label wiring stays correct.`;
        }
        results.push(result);
      }
    }

    return results;
  },
};

// ── Rule: heading-order ──
// Heading levels must not skip when descending: after an h{n} the next heading
// may be h{n+1} at deepest (or any shallower level — going back up is fine). A
// jump like h2 → h4 is flagged. The first heading sets the baseline and is never
// flagged, so a fragment/section that legitimately starts at h2 or h3 is fine;
// h1 → h2 → h2 is fine (same level repeats). Native h1–h6 only.
export const headingOrderRule: DocumentRule = {
  id: "heading-order",
  severity: "warning",
  description: "Heading levels must not skip when going deeper (h2 → h4 is a skip) — jumping levels breaks the document outline for assistive tech. The first heading sets the baseline; going back up a level is allowed.",
  check(doc) {
    const results: AuditResult[] = [];
    let prevLevel = 0;
    let prevTag = "";

    for (const el of doc.elements) {
      if (!HEADING_TAGS.has(el.tag)) continue;
      const level = Number(el.tag[1]);
      if (prevLevel !== 0 && level > prevLevel + 1) {
        const { line, column } = elementPosition(doc, el);
        const expected = `h${prevLevel + 1}`;
        results.push({
          rule_id: "heading-order",
          severity: "warning",
          component_name: "",
          file: doc.file,
          line,
          column,
          message:
            `Heading level skipped: <${el.tag}> follows <${prevTag}> (h${prevLevel} → h${level}). ` +
            `Use <${expected}> here so levels increase one at a time, or add the missing intermediate heading(s).`,
        });
      }
      prevLevel = level;
      prevTag = el.tag;
    }

    return results;
  },
};

// ── Rule: landmark ──
// Three deterministic landmark checks:
//   1. A full page must expose a main landmark (<main> or role="main"), so
//      assistive tech and skip links can reach the primary content. Only applies
//      to full documents — a component fragment is not a page. Multiple mains are
//      intentionally NOT flagged here (reference pages demo several variants).
//   2. A dialog (<dialog>, role="dialog"/"alertdialog", or data-ui="dialog") must
//      not be nested inside <main> — overlays belong outside the content flow
//      (typically a direct child of <body>).
//   3. When 2+ navigation landmarks exist, each needs an accessible name
//      (aria-label/aria-labelledby) so they can be told apart. A lone nav is fine.
export const landmarkRule: DocumentRule = {
  id: "landmark",
  severity: "warning",
  description: "Landmark hygiene: full pages must have a main landmark; dialogs must not be nested inside <main>; and when multiple navigation landmarks exist each must have an accessible name.",
  check(doc) {
    const results: AuditResult[] = [];
    const isMain = (el: ParsedElement) => el.tag === "main" || hasRole(el, "main");
    const isNav = (el: ParsedElement) => el.tag === "nav" || hasRole(el, "navigation");
    const isDialog = (el: ParsedElement) =>
      el.tag === "dialog" || hasRole(el, "dialog") || hasRole(el, "alertdialog") || el.attrs["data-ui"] === "dialog";

    // 1) Full pages need a main landmark.
    if (doc.isFullDocument && !doc.elements.some(isMain)) {
      const body = doc.elements.find((e) => e.tag === "body");
      const { line, column } = body ? elementPosition(doc, body) : { line: 1, column: 1 };
      results.push({
        rule_id: "landmark",
        severity: "warning",
        component_name: "",
        file: doc.file,
        line,
        column,
        message:
          `Page has no main landmark — wrap the primary content in a <main> element (or add role="main"). ` +
          `Assistive tech and "skip to content" links rely on it.`,
      });
    }

    // 2) Dialogs must not live inside the main content flow.
    for (const el of doc.elements) {
      if (!isDialog(el)) continue;
      let ancestor = el.parent;
      let insideMain = false;
      while (ancestor) {
        if (isMain(ancestor)) { insideMain = true; break; }
        ancestor = ancestor.parent;
      }
      if (insideMain) {
        const { line, column } = elementPosition(doc, el);
        results.push({
          rule_id: "landmark",
          severity: "warning",
          component_name: el.attrs["data-ui"] || "",
          file: doc.file,
          line,
          column,
          message:
            `Dialog <${el.tag}> is nested inside <main> — move it out of the main content flow ` +
            `(typically a direct child of <body>) so it overlays the page instead of sitting in document order.`,
        });
      }
    }

    // 3) Multiple navigation landmarks each need an accessible name.
    const navs = doc.elements.filter(isNav);
    if (navs.length >= 2) {
      for (const nav of navs) {
        const labeled = !!(nav.attrs["aria-label"]?.trim() || nav.attrs["aria-labelledby"]?.trim());
        if (labeled) continue;
        const { line, column } = elementPosition(doc, nav);
        results.push({
          rule_id: "landmark",
          severity: "warning",
          component_name: nav.attrs["data-ui"] || "",
          file: doc.file,
          line,
          column,
          message:
            `Multiple navigation landmarks present (${navs.length}), but this <${nav.tag}> has no accessible name — ` +
            `add aria-label (or aria-labelledby) so each nav is distinguishable to assistive tech.`,
        });
      }
    }

    return results;
  },
};

/** Every document-level rule, run on each scanned HTML file (task 0.4-15). */
export const DOCUMENT_RULES: DocumentRule[] = [
  duplicateIdRule,
  headingOrderRule,
  landmarkRule,
];

// ── Anti-pattern rule metadata ──
// The CSS/JS anti-pattern rules don't run against a parsed component + manifest
// (they scan raw .css / .js source in the checker), so they aren't AuditRule
// objects. Their metadata lives here so the audit can *describe* them — the
// scope of each rule, and any exemptions, are encoded as data, not left to
// prose in a doc that can drift from the code.

/** Lightweight descriptor for a rule that scans source rather than a component. */
export interface RuleInfo {
  id: string;
  severity: Severity;
  description: string;
  /** Which files/sources this rule scans — its scope. */
  applies_to: string;
  /** Sources explicitly exempt from this rule (never scanned, never flagged). */
  exempt?: string[];
}

// The `no-fetch` stance, encoded (task 0.3-08). The rule is deliberately scoped
// to recipe controller JS: page-level data loading via the `l-source` directive
// (and the `apiSource()` service layer) is application code, NOT a component
// controller, and is exempt. Because the check only ever scans
// registry/recipes/<name>/<name>.js, `l-source` in page markup is structurally
// out of scope — the exemption is enforced by where we scan, and documented by
// the `exempt` field below, so it stays code rather than prose.
export const NO_FETCH_RULE: RuleInfo = {
  id: "no-fetch",
  severity: "error",
  applies_to: "recipe controller JS (registry/recipes/<name>/<name>.js)",
  exempt: [
    "l-source directives in page markup (declarative data loading)",
    "apiSource() application/service-layer code",
  ],
  description:
    "Recipe component controllers must not fetch data or manage routing " +
    "(fetch/XHR/axios/history/router). Scoped to recipe controller JS only — " +
    "the l-source directive in page markup and apiSource() service code are " +
    "exempt, since data loading belongs in pages, not component controllers.",
};

export const NO_EXTERNAL_IMPORT_RULE: RuleInfo = {
  id: "no-external-import",
  severity: "error",
  applies_to: "recipe controller JS (registry/recipes/<name>/<name>.js)",
  description:
    "Recipe controllers may only import from ../../core/ or relative paths — " +
    "no external/bare package specifiers.",
};

// The `logical-properties` rule (task 0.3-09). Physical, direction-bound CSS
// properties (margin-left, padding-right, left/right offsets, border-*-left/right*,
// corner radii, text-align: left|right) break in right-to-left locales; their
// logical equivalents flip with the writing direction. Every mapping is 1:1, so
// `faqir repair` rewrites them deterministically. A rule scoped to an explicit
// writing direction (e.g. `[dir="ltr"]`) is the escape hatch — it has opted into
// physical directions on purpose and is never flagged. Severity is `warning`:
// it's an i18n/RTL lint guiding toward logical properties, not a hard protocol
// break, and it is auto-fixable.
export const LOGICAL_PROPERTIES_RULE: RuleInfo = {
  id: "logical-properties",
  severity: "warning",
  applies_to: "component CSS",
  exempt: [
    'physical properties inside a [dir="ltr"]/[dir="rtl"]-scoped block (explicit-direction escape hatch)',
    "logical properties and direction-agnostic values (text-align: start/end/center)",
  ],
  description:
    "Component CSS should use logical properties (margin-inline-start, " +
    "inset-inline-end, border-start-end-radius, text-align: start, …) instead of " +
    "physical, direction-bound ones (margin-left, right, border-top-left-radius, " +
    "text-align: left, …) so layouts flip correctly in RTL locales. Auto-fixed by " +
    "`faqir repair` (all mappings are 1:1); rules scoped to an explicit [dir=…] are exempt.",
};

/** Every source-scanning anti-pattern rule, for inventory/description output. */
export const ANTIPATTERN_RULES: RuleInfo[] = [
  { id: "no-important", severity: "error", applies_to: "component CSS",
    description: "Component CSS must not use !important." },
  { id: "no-class-selector", severity: "error", applies_to: "component CSS",
    description: "Component CSS must not use class selectors — use data-ui/data-part/data-variant/data-state." },
  { id: "no-id-selector", severity: "error", applies_to: "component CSS",
    description: "Component CSS must not use ID selectors." },
  { id: "no-hardcoded-values", severity: "error", applies_to: "component CSS",
    description: "Component CSS must reference tokens via var(--token) instead of hardcoded color values." },
  LOGICAL_PROPERTIES_RULE,
  NO_EXTERNAL_IMPORT_RULE,
  NO_FETCH_RULE,
];

/**
 * Full rule inventory (manifest rules + source-scanning anti-pattern rules),
 * as flat descriptors — powers `faqir audit --rules` and the JSON `rules` field.
 */
export function getRuleInventory(): RuleInfo[] {
  const fromManifestRules: RuleInfo[] = ALL_RULES.map(r => ({
    id: r.id,
    severity: r.severity,
    description: r.description,
    applies_to: "component markup vs manifest",
  }));
  const fromDocumentRules: RuleInfo[] = DOCUMENT_RULES.map(r => ({
    id: r.id,
    severity: r.severity,
    description: r.description,
    applies_to: "HTML document",
  }));
  return [...fromManifestRules, ...fromDocumentRules, ...ANTIPATTERN_RULES];
}

// Helper to estimate line number from element position
function countLineFromEl(component: ParsedComponent, _el: ParsedElement): number {
  // Elements store their start offset — but we need the source to count lines
  // We'll use the component's line as a baseline
  return component.line;
}
