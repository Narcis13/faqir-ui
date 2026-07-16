// Bindings IR — target-agnostic extraction of the binding-relevant shape of a
// primitive manifest (task 0.6-12, FAQIR-NEXT §11.1). Framework emitters (Vue
// today, React in 0.7-01) consume this IR so there is exactly one piece of
// manifest-walking logic across all binding targets.
//
// Contract (deterministic, documented here because it IS the generation spec):
// - Root element = anatomy.tag carrying `data-ui="<name>"`.
// - Variant groups applied to the root become string props typed as literal
//   unions. The prop name is the variant attr minus its `data-` prefix
//   (`data-variant` → `variant`); reserved framework names (`style`, `class`,
//   `key`, `ref`, `is`) get a `Variant` suffix (`data-style` → `styleVariant`).
//   The attr is written only when the prop is explicitly set — registry
//   convention keeps default values attribute-free.
// - States applied to the root become boolean props (the manifest's default
//   state is the absence of every state prop and is skipped). The state attr
//   string is parsed into one of three kinds:
//     `data-state="x"` / bare `data-state` → value kind (first truthy wins),
//     bare `aria-*`                        → aria kind (always "true"/"false"),
//     any other bare attr                  → presence kind (`disabled`, `open`).
//   States/variants applied to a named part (`applied_to` ≠ root) belong to
//   slot content the caller supplies and are NOT props.
// - Manifest slots become named slots wrapped in `<tag_hint data-part="name">`
//   in declaration order; required slots always render their wrapper. Slots
//   whose tag_hint is a void element can't wrap content — the slot renders
//   as-is and the caller supplies the `data-part` element itself.
// - Content models `inline`/`text`/`block` get a trailing default slot;
//   `slots`/`empty` do not. A void root tag renders no children at all.

import { join } from "node:path";
import { loadManifest, type Manifest } from "../manifest";
import { listRegistryComponents } from "../utils/components";

export interface IRVariant {
  prop: string;
  attr: string;
  values: string[];
  default: string;
  /** Manifest variant group key (e.g. button's `visual`), for docs. */
  group: string;
}

export interface IRState {
  prop: string;
  attr: string;
  value: string | null;
  kind: "value" | "presence" | "aria";
}

export interface IRSlot {
  name: string;
  tag: string;
  required: boolean;
  isVoid: boolean;
}

export interface ComponentIR {
  /** Manifest name (kebab), e.g. `field-group`. */
  name: string;
  /** Exported component name, e.g. `LFieldGroup`. */
  componentName: string;
  tag: string;
  voidRoot: boolean;
  defaultSlot: boolean;
  description: string;
  manifestPath: string;
  variants: IRVariant[];
  states: IRState[];
  slots: IRSlot[];
}

const VOID_TAGS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "param", "source", "track", "wbr",
]);

/** Prop names that collide with framework-reserved attributes. */
const RESERVED_PROPS = new Set(["style", "class", "key", "ref", "is"]);

export function pascalCase(name: string): string {
  return name.replace(/(^|-)(\w)/g, (_, __, c: string) => c.toUpperCase());
}

export function isVoidTag(tag: string): boolean {
  return VOID_TAGS.has(tag);
}

function variantPropName(attr: string): string {
  const base = attr.replace(/^data-/, "");
  return RESERVED_PROPS.has(base) ? `${base}Variant` : base;
}

/**
 * Parse a manifest state attr string into (attr, value, kind).
 * Forms seen in the registry: `disabled`, `open`, `checked` (presence),
 * `aria-pressed` (aria), `data-state="loading"` / `aria-checked="false"`
 * (value), and bare `data-state` where the value is the state's own name.
 */
function parseStateAttr(stateName: string, attr: string): Omit<IRState, "prop"> {
  const eq = attr.indexOf("=");
  if (eq !== -1) {
    const name = attr.slice(0, eq);
    const value = attr.slice(eq + 1).replace(/^["']|["']$/g, "");
    return { attr: name, value, kind: "value" };
  }
  if (attr === "data-state") return { attr, value: stateName, kind: "value" };
  if (attr.startsWith("aria-")) return { attr, value: null, kind: "aria" };
  return { attr, value: null, kind: "presence" };
}

/** Extract the binding IR from one primitive manifest. */
export function manifestToIR(manifest: Manifest, manifestPath: string): ComponentIR {
  const voidRoot = isVoidTag(manifest.anatomy.tag);
  const usedProps = new Set<string>();

  const variants: IRVariant[] = [];
  for (const [group, v] of Object.entries(manifest.variants ?? {})) {
    if (v.applied_to && v.applied_to !== "root") continue;
    const prop = variantPropName(v.attr);
    if (usedProps.has(prop)) {
      throw new Error(
        `${manifest.name}: variant group "${group}" maps to duplicate prop "${prop}"`
      );
    }
    usedProps.add(prop);
    variants.push({ prop, attr: v.attr, values: [...v.values], default: v.default, group });
  }

  const states: IRState[] = [];
  for (const [stateName, s] of Object.entries(manifest.states ?? {})) {
    if (s.default) continue; // the default state is the absence of every state prop
    const appliedTo = (s as { applied_to?: string }).applied_to;
    if (appliedTo && appliedTo !== "root") continue; // belongs to slot content
    if (usedProps.has(stateName)) {
      throw new Error(`${manifest.name}: state "${stateName}" collides with an existing prop`);
    }
    usedProps.add(stateName);
    states.push({ prop: stateName, ...parseStateAttr(stateName, s.attr) });
  }

  const slots: IRSlot[] = [];
  if (!voidRoot) {
    for (const [name, slot] of Object.entries(manifest.slots ?? {})) {
      const tag = slot.tag_hint ?? "div";
      slots.push({ name, tag, required: slot.required, isVoid: isVoidTag(tag) });
    }
  }

  const model = manifest.anatomy.content_model;
  const defaultSlot = !voidRoot && (model === "inline" || model === "text" || model === "block");

  return {
    name: manifest.name,
    componentName: `L${pascalCase(manifest.name)}`,
    tag: manifest.anatomy.tag,
    voidRoot,
    defaultSlot,
    description: manifest.description,
    manifestPath,
    variants,
    states,
    slots,
  };
}

/** Load the IR for every primitive in the registry, sorted by name. */
export async function loadPrimitiveIRs(registryPath: string): Promise<ComponentIR[]> {
  const names = listRegistryComponents(registryPath, "primitives").sort();
  const irs: ComponentIR[] = [];
  for (const name of names) {
    const manifestPath = join(registryPath, "primitives", name, `${name}.manifest.json`);
    const manifest = await loadManifest(manifestPath);
    irs.push(manifestToIR(manifest, `registry/primitives/${name}/${name}.manifest.json`));
  }
  return irs;
}
