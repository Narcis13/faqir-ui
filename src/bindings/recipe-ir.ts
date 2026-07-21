// Recipe bindings IR — target-agnostic extraction of the binding-relevant
// shape of a RECIPE manifest + its controller (task 0.6-13, FAQIR-NEXT §11.2).
// Primitives are pure markup (see ir.ts); recipes add behavior, so their IR
// carries three extra things: a render TREE parsed from the manifest's
// reference template (`templates.html`), the CONTROLLER factory to attach on
// mount, and the controller's API/EVENT surface for expose/re-emit.
//
// Generation contract (deterministic; this header IS the spec):
// - The tree is the manifest reference template, verbatim: every attribute
//   (`hidden` FOUC guards, `role`/`aria-*` wiring, `data-state` defaults)
//   renders exactly as the registry ships it. `l-*` directive attributes are
//   stripped — faqir-core directives never run inside framework bindings.
// - `{placeholder}` resolution, in priority order:
//     · whole-attr-value placeholder whose attr+element matches a manifest
//       variant group → typed variant prop (attr omitted when unset);
//     · `{id}` → the built-in `id` prop (auto-generated per instance when
//       unset); `"{id}-suffix"` values concatenate around it;
//     · camelCase(name) found in manifest `props` → string prop, default from
//       the manifest (stringified, "" when absent);
//     · `data-state="{x}"` otherwise → the manifest's default state value;
//     · anything else → dropped (template sample content, e.g. `{label1}`).
//   An attribute-POSITION placeholder (`<div {confirm_required}>`) becomes a
//   boolean prop toggling the bare `data-<kebab>` attribute.
// - Manifest variant groups not consumed by a placeholder are still exposed:
//   the prop (named after the group; reserved names get a `Variant` suffix)
//   writes its attr onto the root or onto the unique element carrying the
//   `applied_to` part. Groups whose target part is absent or repeated in the
//   template are skipped — that markup is caller/controller territory.
// - Named slots: every manifest slot whose part appears on exactly ONE
//   template element (and not the root) becomes a Vue slot; caller content
//   replaces that element's template children (the element itself, with its
//   contract attributes, always renders). Template children are the fallback.
//   The root gets a default slot that replaces the entire template anatomy.
// - Controller surface: methods come from the `@ui:provides` header comment
//   (minus `destroy`, which the wrapper owns); events are the `faqir:<name>`
//   CustomEvents the controller dispatches (literal `new CustomEvent("faqir:…")`
//   plus `emit("<name>")` calls when the file builds names as `"faqir:" + type`;
//   `addEventListener` lines are listening, not emitting, and are excluded),
//   united with the events of any recipe controller it imports (alert-dialog
//   re-emits dialog's confirm/cancel; date-picker re-emits calendar-change).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadManifest, type Manifest } from "../manifest";
import { listRegistryComponents } from "../utils/components";
import { pascalCase } from "./ir";

/** One segment of a substituted attribute value or text node. */
export type RecipeSeg = string | { p: string };
/** Attr value: `true` = bare; `{ b }` = bare-when-boolean-prop; segs = string. */
export type RecipeAttrVal = true | { b: string } | RecipeSeg[];

export interface RecipeNode {
  tag: string;
  attrs: [string, RecipeAttrVal][];
  /** Named slot whose fill replaces this node's template children. */
  slot?: string;
  /** Variant props written onto this element when set: [prop, attr][]. */
  dyn?: [string, string][];
  children: (RecipeNode | RecipeSeg)[];
}

export interface RecipeVariantProp {
  prop: string;
  attr: string;
  values: string[];
  default: string;
  group: string;
  /** "root" or the data-part the attr lands on. */
  part: string;
}

export interface RecipeIR {
  name: string;
  componentName: string;
  description: string;
  manifestPath: string;
  /** Vendored controller module name (same as recipe name). */
  controller: string;
  factoryName: string;
  methods: string[];
  events: string[];
  slots: string[];
  stringProps: { prop: string; default: string }[];
  boolProps: string[];
  variantProps: RecipeVariantProp[];
  tree: RecipeNode;
}

/** Raw parse tree of a reference template. */
interface TNode {
  tag: string;
  attrs: [string, string | true][];
  children: (TNode | string)[];
}

const VOID_TAGS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "param", "source", "track", "wbr",
]);

const RESERVED_PROPS = new Set(["style", "class", "key", "ref", "is"]);

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  hellip: "…", laquo: "«", raquo: "»", lsaquo: "‹", rsaquo: "›",
  times: "×", larr: "←", rarr: "→", darr: "↓", uarr: "↑", middot: "·",
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (m, body: string) => {
    if (body.startsWith("#x") || body.startsWith("#X"))
      return String.fromCodePoint(parseInt(body.slice(2), 16));
    if (body.startsWith("#")) return String.fromCodePoint(parseInt(body.slice(1), 10));
    return NAMED_ENTITIES[body] ?? m;
  });
}

/**
 * Parse a reference template (well-formed, attribute-quoted HTML — the
 * registry's audited house style) into a TNode tree. Not a general HTML
 * parser and doesn't need to be: templates are generated/audited artifacts.
 */
export function parseTemplate(html: string, label: string): TNode {
  let i = 0;
  const src = html;

  function parseAttrs(raw: string): [string, string | true][] {
    const attrs: [string, string | true][] = [];
    const re = /([^\s=/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'))?/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(raw))) {
      const value = m[2] ?? m[3];
      attrs.push([m[1], value === undefined ? true : decodeEntities(value)]);
    }
    return attrs;
  }

  function parseNodes(closer: string | null): (TNode | string)[] {
    const out: (TNode | string)[] = [];
    while (i < src.length) {
      const lt = src.indexOf("<", i);
      const text = src.slice(i, lt === -1 ? src.length : lt);
      if (text) out.push(decodeEntities(text));
      if (lt === -1) {
        i = src.length;
        break;
      }
      i = lt;
      if (src.startsWith("</", i)) {
        const end = src.indexOf(">", i);
        const tag = src.slice(i + 2, end).trim().toLowerCase();
        i = end + 1;
        if (tag !== closer) throw new Error(`${label}: unexpected </${tag}>, expected </${closer}>`);
        return out;
      }
      const end = src.indexOf(">", i);
      if (end === -1) throw new Error(`${label}: unterminated tag`);
      let inner = src.slice(i + 1, end);
      i = end + 1;
      const selfClosing = inner.endsWith("/");
      if (selfClosing) inner = inner.slice(0, -1);
      const tagMatch = inner.match(/^[a-zA-Z][a-zA-Z0-9-]*/);
      if (!tagMatch) throw new Error(`${label}: malformed tag <${inner}>`);
      const tag = tagMatch[0].toLowerCase();
      const node: TNode = { tag, attrs: parseAttrs(inner.slice(tagMatch[0].length)), children: [] };
      if (!selfClosing && !VOID_TAGS.has(tag)) node.children = parseNodes(tag);
      out.push(node);
    }
    if (closer !== null) throw new Error(`${label}: missing </${closer}>`);
    return out;
  }

  const roots = parseNodes(null).filter((n) => typeof n !== "string" || n.trim() !== "");
  if (roots.length !== 1 || typeof roots[0] === "string")
    throw new Error(`${label}: template must have exactly one root element`);
  return roots[0];
}

const PLACEHOLDER = /\{([a-z][a-z0-9_-]*)\}/g;

function camelCase(name: string): string {
  return name.replace(/[_-]([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

function variantPropName(group: string): string {
  const prop = camelCase(group);
  return RESERVED_PROPS.has(prop) ? `${prop}Variant` : prop;
}

function partOf(node: TNode): string | undefined {
  const entry = node.attrs.find(([n]) => n === "data-part");
  return typeof entry?.[1] === "string" ? entry[1] : undefined;
}

interface ManifestProps {
  props?: Record<string, { default?: unknown }>;
}

/** Build the RecipeNode tree + prop registrations from manifest + template. */
function extractTree(manifest: Manifest, template: TNode, label: string) {
  const props = (manifest as unknown as ManifestProps).props ?? {};
  const stringProps = new Map<string, string>();
  const boolProps: string[] = [];
  const variantProps: RecipeVariantProp[] = [];
  const consumedGroups = new Set<string>();

  const defaultState = Object.values(manifest.states ?? {}).find((s) => s.default);
  const defaultStateValue = defaultState
    ? (defaultState.attr.match(/^data-state="([^"]*)"$/)?.[1] ?? "")
    : "";

  // Part occurrence census (template-wide, root included).
  const partCount = new Map<string, number>();
  (function census(node: TNode) {
    const part = partOf(node);
    if (part) partCount.set(part, (partCount.get(part) ?? 0) + 1);
    for (const c of node.children) if (typeof c !== "string") census(c);
  })(template);

  const slotNames = Object.keys(manifest.slots ?? {}).filter(
    (name) => partCount.get(name) === 1 && partOf(template) !== name
  );

  function registerVariant(group: string, part: string): RecipeVariantProp {
    const v = manifest.variants[group];
    const prop = variantPropName(group);
    const existing = variantProps.find((x) => x.prop === prop);
    if (existing && existing.group !== group) {
      throw new Error(`${label}: variant groups "${existing.group}" and "${group}" collide on prop "${prop}"`);
    }
    if (existing) return existing;
    const vp: RecipeVariantProp = { prop, attr: v.attr, values: [...v.values], default: v.default, group, part };
    variantProps.push(vp);
    return vp;
  }

  /** Find the variant group targeting `attr` on an element with `part`. */
  function variantFor(attr: string, part: string): string | undefined {
    return Object.keys(manifest.variants ?? {}).find((group) => {
      const v = manifest.variants[group];
      const target = v.applied_to && v.applied_to !== "root" ? v.applied_to : "root";
      return v.attr === attr && target === part;
    });
  }

  function resolveSegs(raw: string, attrName?: string): RecipeSeg[] {
    const segs: RecipeSeg[] = [];
    let last = 0;
    let m: RegExpExecArray | null;
    PLACEHOLDER.lastIndex = 0;
    while ((m = PLACEHOLDER.exec(raw))) {
      if (m.index > last) segs.push(raw.slice(last, m.index));
      const name = camelCase(m[1]);
      // Placeholder names that miss the manifest props fall back to the
      // attr-derived name (`data-value="{url}"` → prop `value`).
      const attrProp = attrName?.startsWith("data-") ? camelCase(attrName.slice(5)) : undefined;
      if (name === "id") segs.push({ p: "id" });
      else if (name in props) {
        stringProps.set(name, String(props[name].default ?? ""));
        segs.push({ p: name });
      } else if (attrProp && attrProp in props) {
        stringProps.set(attrProp, String(props[attrProp].default ?? ""));
        segs.push({ p: attrProp });
      } else if (attrName === "data-state") segs.push(defaultStateValue);
      // otherwise: sample-content placeholder — dropped
      last = m.index + m[0].length;
    }
    if (last < raw.length) segs.push(raw.slice(last));
    // Merge adjacent literals for stable, minimal output.
    return segs.reduce<RecipeSeg[]>((acc, s) => {
      const prev = acc[acc.length - 1];
      if (typeof s === "string" && typeof prev === "string") acc[acc.length - 1] = prev + s;
      else acc.push(s);
      return acc;
    }, []);
  }

  function convert(node: TNode, isRoot: boolean): RecipeNode {
    const part = partOf(node) ?? (isRoot ? "root" : undefined);
    const attrs: [string, RecipeAttrVal][] = [];
    const dyn: [string, string][] = [];

    for (const [name, value] of node.attrs) {
      if (name.startsWith("l-")) continue; // directives never run inside bindings
      const posMatch = name.match(/^\{([a-z][a-z0-9_-]*)\}$/);
      if (posMatch) {
        const prop = camelCase(posMatch[1]);
        if (!boolProps.includes(prop)) boolProps.push(prop);
        attrs.push([`data-${posMatch[1].replace(/_/g, "-")}`, { b: prop }]);
        continue;
      }
      if (value === true) {
        attrs.push([name, true]);
        continue;
      }
      // A whole-value placeholder targeted by a variant group becomes a typed
      // union prop — this wins over a same-named manifest string prop (qr-code
      // declares `ecl` as both; the union is stricter).
      const whole = value.match(/^\{([a-z][a-z0-9_-]*)\}$/);
      const group = whole && part ? variantFor(name, part) : undefined;
      if (whole && group && camelCase(whole[1]) !== "id") {
        const vp = registerVariant(group, part!);
        consumedGroups.add(group);
        dyn.push([vp.prop, name]);
        continue;
      }
      const segs = resolveSegs(value, name);
      const hadPlaceholder = /\{[a-z][a-z0-9_-]*\}/.test(value);
      const isEmpty = segs.every((s) => s === "");
      if (hadPlaceholder && isEmpty) continue; // fully-dropped sample attr
      attrs.push([name, segs.filter((s) => s !== "")]);
    }

    const rnode: RecipeNode = { tag: node.tag, attrs, children: [] };
    if (part && part !== "root" && slotNames.includes(part)) rnode.slot = part;
    if (dyn.length) rnode.dyn = dyn;

    for (const c of node.children) {
      if (typeof c === "string") {
        if (c.trim() === "") continue;
        rnode.children.push(...resolveSegs(c).filter((s) => s !== ""));
      } else {
        rnode.children.push(convert(c, false));
      }
    }
    return rnode;
  }

  const tree = convert(template, true);

  // Variant groups not consumed by a placeholder still become props when their
  // target element exists exactly once in the template.
  for (const group of Object.keys(manifest.variants ?? {})) {
    if (consumedGroups.has(group)) continue;
    const v = manifest.variants[group];
    const target = v.applied_to && v.applied_to !== "root" ? v.applied_to : "root";
    const rootPart = partOf(template);
    const isRootTarget = target === "root" || target === rootPart;
    if (!isRootTarget && partCount.get(target) !== 1) continue; // caller/controller territory
    const prop = variantPropName(group);
    if (variantProps.some((x) => x.prop === prop)) {
      throw new Error(`${label}: variant group "${group}" collides on prop "${prop}"`);
    }
    const vp = registerVariant(group, isRootTarget ? "root" : target);
    (function attach(node: RecipeNode, isRoot: boolean): boolean {
      const nodePart = node.attrs.find(([n]) => n === "data-part")?.[1];
      const nodePartName = Array.isArray(nodePart) && typeof nodePart[0] === "string" ? nodePart[0] : undefined;
      const hit = isRootTarget ? isRoot : nodePartName === target;
      if (hit) {
        (node.dyn ??= []).push([vp.prop, vp.attr]);
        return true;
      }
      for (const c of node.children)
        if (typeof c === "object" && "tag" in c && attach(c, false)) return true;
      return false;
    })(tree, true);
  }

  return {
    tree,
    slots: slotNames,
    stringProps: [...stringProps].map(([prop, def]) => ({ prop, default: def })).sort((a, b) => a.prop.localeCompare(b.prop)),
    boolProps: boolProps.sort(),
    variantProps: variantProps.sort((a, b) => a.prop.localeCompare(b.prop)),
  };
}

/** Parse a controller source: factory, provides, dispatched events, imports. */
export function scanController(source: string, label: string) {
  const factory = source.match(/export\s+function\s+([A-Za-z0-9_$]+)\s*\(/)?.[1];
  if (!factory) throw new Error(`${label}: no exported controller factory`);

  const provides = source.match(/@ui:provides\s+([^\n]+)/)?.[1].trim().split(/\s+/) ?? [];
  const methods = provides.filter((m) => m !== "destroy");

  const events = new Set<string>();
  const emitHelper = /["']faqir:["']\s*\+/.test(source);
  for (const line of source.split("\n")) {
    if (/(add|remove)EventListener/.test(line)) continue;
    for (const m of line.matchAll(/CustomEvent\(\s*["']faqir:([a-z0-9-]+)["']/g)) events.add(m[1]);
    if (emitHelper) for (const m of line.matchAll(/\bemit\(\s*["']([a-z0-9-]+)["']/g)) events.add(m[1]);
  }

  const recipeImports = [...source.matchAll(/from\s+["']\.\.\/([\w-]+)\/[\w-]+\.js["']/g)].map((m) => m[1]);
  const coreImports = [...source.matchAll(/from\s+["']\.\.\/\.\.\/core\/([\w-]+)\.js["']/g)].map((m) => m[1]);

  return { factory, methods, events: [...events], recipeImports, coreImports };
}

export interface RecipeBundle {
  irs: RecipeIR[];
  /** recipe name → controller source (verbatim registry file). */
  controllers: Map<string, string>;
  /** core helper module name (focus, events, utils) → source. */
  helpers: Map<string, string>;
}

/** Load the IR + controller sources for every recipe in the registry. */
export async function loadRecipeBundle(registryPath: string): Promise<RecipeBundle> {
  const names = listRegistryComponents(registryPath, "recipes").sort();
  const irs: RecipeIR[] = [];
  const controllers = new Map<string, string>();
  const helpers = new Map<string, string>();
  const scans = new Map<string, ReturnType<typeof scanController>>();

  for (const name of names) {
    const dir = join(registryPath, "recipes", name);
    const manifest = await loadManifest(join(dir, `${name}.manifest.json`));
    const jsFile = manifest.files.js ?? `${name}.js`;
    const source = readFileSync(join(dir, jsFile), "utf8");
    controllers.set(name, source);
    scans.set(name, scanController(source, `recipes/${name}/${jsFile}`));
  }

  // Events include those of imported recipe controllers (they bubble through
  // the importing recipe's root: alert-dialog→dialog, date-picker→calendar).
  function eventsOf(name: string, seen = new Set<string>()): string[] {
    if (seen.has(name)) return [];
    seen.add(name);
    const scan = scans.get(name);
    if (!scan) return [];
    const all = new Set(scan.events);
    for (const dep of scan.recipeImports) for (const e of eventsOf(dep, seen)) all.add(e);
    return [...all];
  }

  for (const name of names) {
    const dir = join(registryPath, "recipes", name);
    const manifest = await loadManifest(join(dir, `${name}.manifest.json`));
    const label = `recipes/${name}`;
    const scan = scans.get(name)!;
    for (const helper of scan.coreImports) {
      if (!helpers.has(helper)) {
        helpers.set(helper, readFileSync(join(registryPath, "core", `${helper}.js`), "utf8"));
      }
    }
    const template = parseTemplate(manifest.templates.html, label);
    const extracted = extractTree(manifest, template, label);
    irs.push({
      name,
      componentName: `L${pascalCase(name)}`,
      description: manifest.description,
      manifestPath: `registry/recipes/${name}/${name}.manifest.json`,
      controller: name,
      factoryName: scan.factory,
      methods: scan.methods,
      events: eventsOf(name).sort(),
      ...extracted,
    });
  }

  return { irs, controllers, helpers };
}
