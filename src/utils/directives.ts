// The directive vocabulary, as data (task W2-2).
//
// The engine declares its `l-*` surface in `@ui:directive` / `@ui:modifier`
// comment lines (src/core-src/engine.js §3.0), and `src/generator/skill.ts`
// reads those to build `references/directives.md`. That reader needs the engine
// file on disk, which the audit cannot have: `src/audit/**` bundles for the
// browser and one `node:fs` anywhere in its import graph makes the bundle
// impossible. So the vocabulary lives here as plain data, exactly the way
// `./breakpoints` owns the tier canon and `../protocol` owns the five
// attributes — and `tests/utils/directives.test.ts` re-parses the engine's own
// declarations and compares them to this module in both directions, so a
// directive added to one and not the other is a failing test rather than a
// silent gap in the audit.
//
// Why the audit needs it at all: `l-tex="v"` — one letter off `l-text` — did
// nothing, reported nothing, and warned nothing. The engine's `applyDirective`
// has a dev-build diagnostic for an unknown directive, but the production build
// strips it and no static tool knew the vocabulary, so the single most likely
// authoring mistake in the reactive layer was invisible on every surface.
//
// Deliberately dependency-free and free of `node:*` imports.

/** How a directive takes its `:<arg>` segment. */
export type DirectiveArg = "none" | "required";

/** One directive the engine or an official plugin implements. */
export interface DirectiveSpec {
  /** Base name without the `l-` prefix — the `type` the engine dispatches on. */
  name: string;
  /** The attribute as authored, e.g. `l-bind:<attr>`. */
  attribute: string;
  /** Shorthand prefix (`:` for `l-bind`, `@` for `l-on`), or null. */
  shorthand: string | null;
  /** Whether an `:<arg>` segment is required or must be absent. */
  arg: DirectiveArg;
  /** Plain modifiers, without the leading dot. */
  modifiers: readonly string[];
  /**
   * Modifiers that carry their time FUSED into the same segment —
   * `.debounce500ms`, `.throttle2s`. A dotted `.debounce.500ms` is two
   * modifiers and the engine reads no time from it, which is the docs' own
   * documented footgun.
   */
  timed?: readonly string[];
  /** Modifiers whose value is the NEXT dotted segment — `.poll.5000`, `.key.uuid`. */
  valued?: readonly string[];
  /** Whether a key name from {@link KEY_MODIFIERS} is a legal modifier. */
  keys?: boolean;
  /** The plugin that supplies it, or null for a core directive. */
  plugin: string | null;
}

/**
 * Key modifiers `l-on` accepts, from the engine's `KEY_MAP` (§3.9). A modifier
 * that is one of these filters the handler to that key.
 */
export const KEY_MODIFIERS: readonly string[] = Object.freeze([
  "enter", "escape", "esc", "tab", "space", "delete", "backspace",
  "up", "down", "left", "right",
  "arrow-up", "arrow-down", "arrow-left", "arrow-right",
  "home", "end", "page-up", "page-down",
]);

/** Every directive the shipped engine implements. */
export const CORE_DIRECTIVES: readonly DirectiveSpec[] = Object.freeze([
  { name: "data", attribute: "l-data", shorthand: null, arg: "none", modifiers: [], plugin: null },
  { name: "init", attribute: "l-init", shorthand: null, arg: "none", modifiers: [], plugin: null },
  {
    name: "source",
    attribute: "l-source:<name>",
    shorthand: null,
    arg: "required",
    modifiers: ["lazy", "optimistic", "poll", "key"],
    valued: ["poll", "key"],
    plugin: null,
  },
  { name: "text", attribute: "l-text", shorthand: null, arg: "none", modifiers: [], plugin: null },
  { name: "html", attribute: "l-html", shorthand: null, arg: "none", modifiers: [], plugin: null },
  { name: "bind", attribute: "l-bind:<attr>", shorthand: ":", arg: "required", modifiers: [], plugin: null },
  {
    name: "on",
    attribute: "l-on:<event>",
    shorthand: "@",
    arg: "required",
    modifiers: [
      "prevent", "stop", "self", "once", "capture", "passive",
      "window", "document", "debounce", "throttle",
    ],
    timed: ["debounce", "throttle"],
    keys: true,
    plugin: null,
  },
  {
    name: "model",
    attribute: "l-model",
    shorthand: null,
    arg: "none",
    modifiers: ["number", "trim", "lazy", "debounce"],
    plugin: null,
  },
  { name: "show", attribute: "l-show", shorthand: null, arg: "none", modifiers: [], plugin: null },
  { name: "if", attribute: "l-if", shorthand: null, arg: "none", modifiers: [], plugin: null },
  { name: "for", attribute: "l-for", shorthand: null, arg: "none", modifiers: [], plugin: null },
  { name: "key", attribute: "l-key", shorthand: null, arg: "none", modifiers: [], plugin: null },
  { name: "ref", attribute: "l-ref", shorthand: null, arg: "none", modifiers: [], plugin: null },
  { name: "effect", attribute: "l-effect", shorthand: null, arg: "none", modifiers: [], plugin: null },
  { name: "cloak", attribute: "l-cloak", shorthand: null, arg: "none", modifiers: [], plugin: null },
  { name: "transition", attribute: "l-transition", shorthand: null, arg: "none", modifiers: [], plugin: null },
  { name: "teleport", attribute: "l-teleport", shorthand: null, arg: "none", modifiers: [], plugin: null },
] as const) as readonly DirectiveSpec[];

/**
 * Directives the official plugins register. Known to the audit whether or not
 * the page loads the plugin — an unloaded plugin is a different (and reportable)
 * problem from a misspelled directive, and conflating them would report correct
 * markup.
 */
export const PLUGIN_DIRECTIVES: readonly DirectiveSpec[] = Object.freeze([
  { name: "collapse", attribute: "l-collapse", shorthand: null, arg: "none", modifiers: [], plugin: "faqir-collapse" },
  {
    name: "intersect",
    attribute: "l-intersect",
    shorthand: null,
    arg: "none",
    modifiers: ["leave", "once"],
    plugin: "faqir-intersect",
  },
  { name: "mask", attribute: "l-mask", shorthand: null, arg: "none", modifiers: [], plugin: "faqir-mask" },
  { name: "persist", attribute: "l-persist", shorthand: null, arg: "none", modifiers: [], plugin: "faqir-persist" },
  {
    // `l-validate` on the form; `l-validate:<name>` on a control declares a
    // custom validator, so the argument is optional rather than required.
    name: "validate",
    attribute: "l-validate",
    shorthand: null,
    arg: "none",
    modifiers: [],
    plugin: "faqir-validate",
  },
] as const) as readonly DirectiveSpec[];

/** Core + plugin, the whole vocabulary. */
export const ALL_DIRECTIVES: readonly DirectiveSpec[] = Object.freeze([
  ...CORE_DIRECTIVES,
  ...PLUGIN_DIRECTIVES,
]);

const BY_NAME: ReadonlyMap<string, DirectiveSpec> = new Map(
  ALL_DIRECTIVES.map((d) => [d.name, d]),
);

/** The directive with this base name, or null. */
export function directiveByName(name: string): DirectiveSpec | null {
  return BY_NAME.get(name) ?? null;
}

/** Every base name, for "did you mean" lookups. */
export const DIRECTIVE_NAMES: readonly string[] = Object.freeze(
  ALL_DIRECTIVES.map((d) => d.name),
);

/**
 * `l-validate:<name>` names a custom validator, not a directive argument the
 * engine dispatches on — the plugin reads those attributes itself. Directives
 * that accept a free-form suffix the engine never parses as an arg live here so
 * the audit does not report them as unknown directives.
 */
const FREE_SUFFIX_DIRECTIVES = new Set(["validate"]);

/** One parsed `l-*` / `:` / `@` attribute name. */
export interface ParsedDirectiveName {
  /** Base directive name, `bind` for `:class` and `l-bind:class` alike. */
  name: string;
  /** The `:<arg>` segment, or null. */
  arg: string | null;
  /** Dotted modifiers, without their leading dots. */
  modifiers: string[];
  /** How the attribute was written — needed for a message that quotes it back. */
  raw: string;
}

/**
 * Parse an attribute name the way the engine's `parseDirectives` does, so the
 * audit reasons about exactly what the runtime will see. Returns null for an
 * attribute that is not a directive at all.
 */
export function parseDirectiveName(attr: string): ParsedDirectiveName | null {
  let rest: string;
  let forced: string | null = null;

  if (attr.startsWith("l-bind:")) {
    forced = "bind";
    rest = attr.slice("l-bind:".length);
  } else if (attr.startsWith("l-on:")) {
    forced = "on";
    rest = attr.slice("l-on:".length);
  } else if (attr.startsWith("l-source:")) {
    forced = "source";
    rest = attr.slice("l-source:".length);
  } else if (attr.startsWith(":")) {
    forced = "bind";
    rest = attr.slice(1);
  } else if (attr.startsWith("@")) {
    forced = "on";
    rest = attr.slice(1);
  } else if (attr.startsWith("l-")) {
    rest = attr.slice(2);
  } else {
    return null;
  }

  const parts = rest.split(".");
  if (forced) {
    return { name: forced, arg: parts[0] || null, modifiers: parts.slice(1), raw: attr };
  }
  // `l-<name>` — the engine takes everything up to the first dot as the type,
  // colon included, which is why `l-validate:company` dispatches on nothing.
  const [head, ...modifiers] = parts;
  const colon = head.indexOf(":");
  return colon === -1
    ? { name: head, arg: null, modifiers, raw: attr }
    : { name: head.slice(0, colon), arg: head.slice(colon + 1), modifiers, raw: attr };
}

/** True when this directive accepts a free-form `:<suffix>` the engine ignores. */
export function acceptsFreeSuffix(name: string): boolean {
  return FREE_SUFFIX_DIRECTIVES.has(name);
}

/** A modifier with a fused time — `debounce500ms` → `{ base, ms }`. */
export function splitTimedModifier(modifier: string): { base: string; ms: number } | null {
  const m = /^([a-z]+)(\d+)(ms|s)?$/.exec(modifier);
  if (!m) return null;
  const value = Number(m[2]);
  return { base: m[1], ms: m[3] === "s" ? value * 1000 : value };
}
