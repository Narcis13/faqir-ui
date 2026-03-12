import { readJsonFile } from "./fs";

const MANIFEST_KINDS = ["primitive", "recipe", "pattern", "scaffold"] as const;
const MANIFEST_CATEGORIES = [
  "actions",
  "forms",
  "layout",
  "navigation",
  "data-display",
  "feedback",
  "overlay",
  "typography",
  "composite",
] as const;
const CONTENT_MODELS = ["inline", "block", "slots", "text"] as const;
const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const KEBAB_CASE_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type LoomManifestKind = (typeof MANIFEST_KINDS)[number];
export type LoomManifestCategory = (typeof MANIFEST_CATEGORIES)[number];
export type LoomContentModel = (typeof CONTENT_MODELS)[number];

export type LoomManifest = {
  $schema?: string;
  name: string;
  version: string;
  kind: LoomManifestKind;
  category: LoomManifestCategory;
  description: string;
  anatomy: {
    tag: string;
    selector: string;
    content_model: LoomContentModel;
  };
  slots?: Record<
    string,
    {
      selector: string;
      required: boolean;
      tag_hint?: string;
      description?: string;
    }
  >;
  variants?: Record<
    string,
    {
      values: string[];
      default: string;
      attr: string;
      applied_to?: string;
    }
  >;
  states?: Record<
    string,
    {
      attr: string;
      default?: boolean;
      transient?: boolean;
    }
  >;
  a11y?: {
    role?: string;
    "aria-modal"?: boolean;
    required_attrs?: string[];
    focus_trap?: boolean;
    escape_closes?: boolean;
    return_focus?: string;
    keyboard?: Record<string, string>;
  };
  tokens_used: string[];
  templates: Record<string, string>;
  safe_transforms: string[];
  unsafe_transforms: string[];
  composition: {
    contains: string[];
    used_in: string[];
  };
  files: {
    html: string;
    css: string;
    js?: string;
    manifest: string;
  };
  tests: string[];
};

export async function readManifestFile(path: string): Promise<LoomManifest> {
  const manifest = await readJsonFile(path);
  const issues = validateManifest(manifest);

  if (issues.length > 0) {
    throw new Error(`Invalid manifest at ${path}: ${issues.join("; ")}`);
  }

  return manifest as LoomManifest;
}

export function validateManifest(value: unknown): string[] {
  const issues: string[] = [];

  if (!isRecord(value)) {
    return ["manifest must be a JSON object"];
  }

  if (value.$schema !== undefined && !isNonEmptyString(value.$schema)) {
    issues.push("$schema must be a non-empty string");
  }

  if (!isNonEmptyString(value.name) || !KEBAB_CASE_RE.test(value.name)) {
    issues.push("name must be lowercase kebab-case");
  }

  if (!isNonEmptyString(value.version) || !SEMVER_RE.test(value.version)) {
    issues.push("version must be a valid semver string");
  }

  if (!isEnumValue(value.kind, MANIFEST_KINDS)) {
    issues.push(`kind must be one of: ${MANIFEST_KINDS.join(", ")}`);
  }

  if (!isEnumValue(value.category, MANIFEST_CATEGORIES)) {
    issues.push(`category must be one of: ${MANIFEST_CATEGORIES.join(", ")}`);
  }

  if (!isNonEmptyString(value.description)) {
    issues.push("description must be a non-empty string");
  }

  validateAnatomy(value.anatomy, issues);
  validateSlots(value.slots, issues);
  validateVariants(value.variants, issues);
  validateStates(value.states, issues);
  validateA11y(value.a11y, issues);

  if (!isStringArray(value.tokens_used)) {
    issues.push("tokens_used must be an array of strings");
  }

  if (!isRecord(value.templates)) {
    issues.push("templates must be an object");
  } else {
    if (!isNonEmptyString(value.templates.html)) {
      issues.push("templates.html must be a non-empty string");
    }

    for (const [key, template] of Object.entries(value.templates)) {
      if (!isNonEmptyString(template)) {
        issues.push(`templates.${key} must be a non-empty string`);
      }
    }
  }

  if (!isStringArray(value.safe_transforms)) {
    issues.push("safe_transforms must be an array of strings");
  }

  if (!isStringArray(value.unsafe_transforms)) {
    issues.push("unsafe_transforms must be an array of strings");
  }

  validateComposition(value.composition, issues);
  validateFiles(value.files, value.kind, issues);

  if (!isStringArray(value.tests)) {
    issues.push("tests must be an array of strings");
  }

  return issues;
}

function validateAnatomy(value: unknown, issues: string[]): void {
  if (!isRecord(value)) {
    issues.push("anatomy must be an object");
    return;
  }

  if (!isNonEmptyString(value.tag)) {
    issues.push("anatomy.tag must be a non-empty string");
  }

  if (!isNonEmptyString(value.selector)) {
    issues.push("anatomy.selector must be a non-empty string");
  }

  if (!isEnumValue(value.content_model, CONTENT_MODELS)) {
    issues.push(`anatomy.content_model must be one of: ${CONTENT_MODELS.join(", ")}`);
  }
}

function validateSlots(value: unknown, issues: string[]): void {
  if (value === undefined) {
    return;
  }

  if (!isRecord(value)) {
    issues.push("slots must be an object");
    return;
  }

  for (const [slotName, slotValue] of Object.entries(value)) {
    if (!KEBAB_CASE_RE.test(slotName)) {
      issues.push(`slots.${slotName} must use kebab-case keys`);
      continue;
    }

    if (!isRecord(slotValue)) {
      issues.push(`slots.${slotName} must be an object`);
      continue;
    }

    if (!isNonEmptyString(slotValue.selector)) {
      issues.push(`slots.${slotName}.selector must be a non-empty string`);
    }

    if (typeof slotValue.required !== "boolean") {
      issues.push(`slots.${slotName}.required must be a boolean`);
    }

    if (slotValue.tag_hint !== undefined && !isNonEmptyString(slotValue.tag_hint)) {
      issues.push(`slots.${slotName}.tag_hint must be a non-empty string`);
    }

    if (slotValue.description !== undefined && !isNonEmptyString(slotValue.description)) {
      issues.push(`slots.${slotName}.description must be a non-empty string`);
    }
  }
}

function validateVariants(value: unknown, issues: string[]): void {
  if (value === undefined) {
    return;
  }

  if (!isRecord(value)) {
    issues.push("variants must be an object");
    return;
  }

  for (const [variantName, variantValue] of Object.entries(value)) {
    if (!KEBAB_CASE_RE.test(variantName)) {
      issues.push(`variants.${variantName} must use kebab-case keys`);
      continue;
    }

    if (!isRecord(variantValue)) {
      issues.push(`variants.${variantName} must be an object`);
      continue;
    }

    if (!isStringArray(variantValue.values) || variantValue.values.length === 0) {
      issues.push(`variants.${variantName}.values must be a non-empty array of strings`);
    }

    if (!isNonEmptyString(variantValue.default)) {
      issues.push(`variants.${variantName}.default must be a non-empty string`);
    } else if (Array.isArray(variantValue.values) && !variantValue.values.includes(variantValue.default)) {
      issues.push(`variants.${variantName}.default must be included in values`);
    }

    if (!isNonEmptyString(variantValue.attr)) {
      issues.push(`variants.${variantName}.attr must be a non-empty string`);
    }

    if (variantValue.applied_to !== undefined && !isNonEmptyString(variantValue.applied_to)) {
      issues.push(`variants.${variantName}.applied_to must be a non-empty string`);
    }
  }
}

function validateStates(value: unknown, issues: string[]): void {
  if (value === undefined) {
    return;
  }

  if (!isRecord(value)) {
    issues.push("states must be an object");
    return;
  }

  for (const [stateName, stateValue] of Object.entries(value)) {
    if (!KEBAB_CASE_RE.test(stateName)) {
      issues.push(`states.${stateName} must use kebab-case keys`);
      continue;
    }

    if (!isRecord(stateValue)) {
      issues.push(`states.${stateName} must be an object`);
      continue;
    }

    if (!isNonEmptyString(stateValue.attr)) {
      issues.push(`states.${stateName}.attr must be a non-empty string`);
    }

    if (stateValue.default !== undefined && typeof stateValue.default !== "boolean") {
      issues.push(`states.${stateName}.default must be a boolean`);
    }

    if (stateValue.transient !== undefined && typeof stateValue.transient !== "boolean") {
      issues.push(`states.${stateName}.transient must be a boolean`);
    }
  }
}

function validateA11y(value: unknown, issues: string[]): void {
  if (value === undefined) {
    return;
  }

  if (!isRecord(value)) {
    issues.push("a11y must be an object");
    return;
  }

  if (value.role !== undefined && !isNonEmptyString(value.role)) {
    issues.push("a11y.role must be a non-empty string");
  }

  if (value["aria-modal"] !== undefined && typeof value["aria-modal"] !== "boolean") {
    issues.push('a11y["aria-modal"] must be a boolean');
  }

  if (value.required_attrs !== undefined && !isStringArray(value.required_attrs)) {
    issues.push("a11y.required_attrs must be an array of strings");
  }

  if (value.focus_trap !== undefined && typeof value.focus_trap !== "boolean") {
    issues.push("a11y.focus_trap must be a boolean");
  }

  if (value.escape_closes !== undefined && typeof value.escape_closes !== "boolean") {
    issues.push("a11y.escape_closes must be a boolean");
  }

  if (value.return_focus !== undefined && !isNonEmptyString(value.return_focus)) {
    issues.push("a11y.return_focus must be a non-empty string");
  }

  if (value.keyboard !== undefined) {
    if (!isRecord(value.keyboard)) {
      issues.push("a11y.keyboard must be an object");
      return;
    }

    for (const [key, description] of Object.entries(value.keyboard)) {
      if (!isNonEmptyString(key) || !isNonEmptyString(description)) {
        issues.push("a11y.keyboard entries must map non-empty strings to non-empty strings");
      }
    }
  }
}

function validateComposition(value: unknown, issues: string[]): void {
  if (!isRecord(value)) {
    issues.push("composition must be an object");
    return;
  }

  if (!isStringArray(value.contains)) {
    issues.push("composition.contains must be an array of strings");
  }

  if (!isStringArray(value.used_in)) {
    issues.push("composition.used_in must be an array of strings");
  }
}

function validateFiles(value: unknown, kind: unknown, issues: string[]): void {
  if (!isRecord(value)) {
    issues.push("files must be an object");
    return;
  }

  if (!isNonEmptyString(value.html)) {
    issues.push("files.html must be a non-empty string");
  }

  if (!isNonEmptyString(value.css)) {
    issues.push("files.css must be a non-empty string");
  }

  if (!isNonEmptyString(value.manifest)) {
    issues.push("files.manifest must be a non-empty string");
  }

  if (value.js !== undefined && !isNonEmptyString(value.js)) {
    issues.push("files.js must be a non-empty string");
  }

  if (kind === "recipe" && !isNonEmptyString(value.js)) {
    issues.push("files.js is required for recipe manifests");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isNonEmptyString);
}

function isEnumValue<T extends readonly string[]>(value: unknown, values: T): value is T[number] {
  return typeof value === "string" && values.includes(value);
}
