// Manifest JSON schema — TypeScript types + validation

export interface ManifestSlot {
  selector: string;
  required: boolean;
  tag_hint?: string;
  description?: string;
}

export interface ManifestVariant {
  values: string[];
  default: string;
  attr: string;
  applied_to?: string;
}

export interface ManifestState {
  attr: string;
  default?: boolean;
  transient?: boolean;
}

export interface ManifestA11y {
  role?: string;
  "aria-modal"?: boolean;
  required_attrs?: string[];
  focus_trap?: boolean;
  escape_closes?: boolean;
  return_focus?: string;
  keyboard?: Record<string, string>;
}

export interface ManifestAnatomy {
  tag: string;
  selector: string;
  content_model: "inline" | "block" | "slots" | "text";
}

export interface ManifestComposition {
  contains: string[];
  used_in: string[];
}

export interface ManifestFiles {
  html: string;
  css: string;
  js?: string;
  manifest: string;
}

/**
 * One entry of a component's changelog (task 0.5-04, FAQIR-PLAN §9.3).
 *
 * The `changes` array records what changed between component versions. It is
 * consumed by `faqir upgrade` (0.5-05), which prints the entries between the
 * user's installed version and the target version and surfaces any `breaking`
 * one prominently before applying a merge.
 */
export interface ManifestChange {
  /** Component version this entry describes (matches a `version` value). */
  version: string;
  /** Human/agent-readable summary of what changed in this version. */
  note: string;
  /** Whether upgrading across this version can break existing usage. */
  breaking: boolean;
}

export interface ManifestTemplates {
  html: string;
  [key: string]: string;
}

export interface Manifest {
  name: string;
  version: string;
  kind: "primitive" | "recipe" | "pattern" | "scaffold";
  category: string;
  description: string;
  /**
   * Alias mechanism (schema note).
   *
   * Optional list of alternate names that resolve to THIS component. An alias is
   * a pure discovery/lookup affordance — it ships no files of its own, so there
   * is never a duplicated CSS/JS payload. `faqir add <alias>` installs the
   * canonical component; `faqir search`, `faqir list`, and the generated
   * `.faqir/context.json` all surface the alias so agents searching the alias
   * name find the real component.
   *
   * To add a future alias, list it here on the canonical manifest (e.g. callout
   * declares `"aliases": ["alert"]`). Names must be unique across the registry;
   * a real component directory always wins over an alias of the same name.
   */
  aliases?: string[];
  /**
   * Version changelog (schema in place from 0.5-04; populated going forward).
   *
   * Optional, ordered oldest-to-newest. `faqir upgrade` reads it to tell the
   * user what changed between their version and the target, flagging breaking
   * entries. Absent or empty on components that have not yet recorded history.
   */
  changes?: ManifestChange[];
  anatomy: ManifestAnatomy;
  slots: Record<string, ManifestSlot>;
  variants: Record<string, ManifestVariant>;
  states: Record<string, ManifestState>;
  a11y: ManifestA11y;
  tokens_used: string[];
  templates: ManifestTemplates;
  safe_transforms: string[];
  unsafe_transforms: string[];
  composition: ManifestComposition;
  files: ManifestFiles;
  tests: string[];
}

export interface ManifestValidationError {
  field: string;
  message: string;
}

const VALID_KINDS = ["primitive", "recipe", "pattern", "scaffold"] as const;
const VALID_CONTENT_MODELS = ["inline", "block", "slots", "text"] as const;

export function validateManifest(data: unknown): ManifestValidationError[] {
  const errors: ManifestValidationError[] = [];

  if (typeof data !== "object" || data === null) {
    errors.push({ field: "(root)", message: "Manifest must be an object" });
    return errors;
  }

  const m = data as Record<string, unknown>;

  // Required string fields
  for (const field of ["name", "version", "kind", "category", "description"]) {
    if (typeof m[field] !== "string" || (m[field] as string).length === 0) {
      errors.push({ field, message: `Required string field '${field}' is missing or empty` });
    }
  }

  // Validate kind
  if (typeof m.kind === "string" && !VALID_KINDS.includes(m.kind as any)) {
    errors.push({ field: "kind", message: `Invalid kind '${m.kind}'. Must be: ${VALID_KINDS.join(", ")}` });
  }

  // Validate aliases (optional) — must be an array of non-empty strings when present
  if (m.aliases !== undefined) {
    if (!Array.isArray(m.aliases) || !m.aliases.every((a) => typeof a === "string" && a.length > 0)) {
      errors.push({ field: "aliases", message: "Optional field 'aliases' must be an array of non-empty strings" });
    }
  }

  // Validate changes (optional changelog) — array of { version, note, breaking }
  if (m.changes !== undefined) {
    if (!Array.isArray(m.changes)) {
      errors.push({ field: "changes", message: "Optional field 'changes' must be an array" });
    } else {
      m.changes.forEach((entry, i) => {
        if (typeof entry !== "object" || entry === null) {
          errors.push({ field: `changes[${i}]`, message: "Changelog entry must be an object" });
          return;
        }
        const c = entry as Record<string, unknown>;
        if (typeof c.version !== "string" || c.version.length === 0) {
          errors.push({ field: `changes[${i}].version`, message: "Required non-empty string" });
        }
        if (typeof c.note !== "string" || c.note.length === 0) {
          errors.push({ field: `changes[${i}].note`, message: "Required non-empty string" });
        }
        if (typeof c.breaking !== "boolean") {
          errors.push({ field: `changes[${i}].breaking`, message: "Required boolean" });
        }
      });
    }
  }

  // Validate anatomy
  if (typeof m.anatomy !== "object" || m.anatomy === null) {
    errors.push({ field: "anatomy", message: "Required object 'anatomy' is missing" });
  } else {
    const a = m.anatomy as Record<string, unknown>;
    if (typeof a.tag !== "string") errors.push({ field: "anatomy.tag", message: "Required string" });
    if (typeof a.selector !== "string") errors.push({ field: "anatomy.selector", message: "Required string" });
    if (typeof a.content_model === "string" && !VALID_CONTENT_MODELS.includes(a.content_model as any)) {
      errors.push({ field: "anatomy.content_model", message: `Must be: ${VALID_CONTENT_MODELS.join(", ")}` });
    }
  }

  // Validate slots (must be object)
  if (typeof m.slots !== "object" || m.slots === null) {
    errors.push({ field: "slots", message: "Required object 'slots' is missing" });
  } else {
    const slots = m.slots as Record<string, unknown>;
    for (const [name, slot] of Object.entries(slots)) {
      if (typeof slot !== "object" || slot === null) {
        errors.push({ field: `slots.${name}`, message: "Slot must be an object" });
        continue;
      }
      const s = slot as Record<string, unknown>;
      if (typeof s.selector !== "string") {
        errors.push({ field: `slots.${name}.selector`, message: "Required string" });
      }
      if (typeof s.required !== "boolean") {
        errors.push({ field: `slots.${name}.required`, message: "Required boolean" });
      }
    }
  }

  // Validate variants (must be object)
  if (typeof m.variants !== "object" || m.variants === null) {
    errors.push({ field: "variants", message: "Required object 'variants' is missing" });
  } else {
    const variants = m.variants as Record<string, unknown>;
    for (const [name, variant] of Object.entries(variants)) {
      if (typeof variant !== "object" || variant === null) {
        errors.push({ field: `variants.${name}`, message: "Variant must be an object" });
        continue;
      }
      const v = variant as Record<string, unknown>;
      if (!Array.isArray(v.values) || v.values.length === 0) {
        errors.push({ field: `variants.${name}.values`, message: "Required non-empty array" });
      }
      if (typeof v.default !== "string") {
        errors.push({ field: `variants.${name}.default`, message: "Required string" });
      }
      if (typeof v.attr !== "string") {
        errors.push({ field: `variants.${name}.attr`, message: "Required string" });
      }
    }
  }

  // Validate states (must be object)
  if (typeof m.states !== "object" || m.states === null) {
    errors.push({ field: "states", message: "Required object 'states' is missing" });
  }

  // Validate files
  if (typeof m.files !== "object" || m.files === null) {
    errors.push({ field: "files", message: "Required object 'files' is missing" });
  } else {
    const f = m.files as Record<string, unknown>;
    if (typeof f.html !== "string") errors.push({ field: "files.html", message: "Required string" });
    if (typeof f.css !== "string") errors.push({ field: "files.css", message: "Required string" });
    if (typeof f.manifest !== "string") errors.push({ field: "files.manifest", message: "Required string" });
  }

  // Validate arrays
  for (const field of ["tokens_used", "safe_transforms", "unsafe_transforms", "tests"]) {
    if (!Array.isArray(m[field])) {
      errors.push({ field, message: `Required array '${field}' is missing` });
    }
  }

  // Validate templates
  if (typeof m.templates !== "object" || m.templates === null) {
    errors.push({ field: "templates", message: "Required object 'templates' is missing" });
  } else {
    const t = m.templates as Record<string, unknown>;
    if (typeof t.html !== "string") {
      errors.push({ field: "templates.html", message: "Required string 'html' template" });
    }
  }

  // Validate composition
  if (typeof m.composition !== "object" || m.composition === null) {
    errors.push({ field: "composition", message: "Required object 'composition' is missing" });
  } else {
    const c = m.composition as Record<string, unknown>;
    if (!Array.isArray(c.contains)) errors.push({ field: "composition.contains", message: "Required array" });
    if (!Array.isArray(c.used_in)) errors.push({ field: "composition.used_in", message: "Required array" });
  }

  return errors;
}

export async function loadManifest(path: string): Promise<Manifest> {
  const file = Bun.file(path);
  const json = await file.json();
  return json as Manifest;
}
