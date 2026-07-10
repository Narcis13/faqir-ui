// Audit rule definitions — each rule checks a parsed component against its manifest

import type { ParsedComponent, ParsedElement } from "../parser/html-parser";
import type { Manifest } from "../manifest";
import { suggestClosest } from "../utils/suggest";

export type Severity = "critical" | "error" | "warning" | "info";

export interface RepairAction {
  type: "add-attribute" | "rename-attribute" | "remove-element" | "add-element" | "add-script" | "rewrite-css";
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
  return [...fromManifestRules, ...ANTIPATTERN_RULES];
}

// Helper to estimate line number from element position
function countLineFromEl(component: ParsedComponent, _el: ParsedElement): number {
  // Elements store their start offset — but we need the source to count lines
  // We'll use the component's line as a baseline
  return component.line;
}
