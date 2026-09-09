/**
 * The v0.x → 1.0 migration, as data (task 1.0-03, FAQIR-PLAN §15).
 *
 * `docs/migration-1.0.md` is the document a person reads; this module is what
 * the document is checked against. Three things live here, and each one is read
 * by at least two surfaces so that none of them can drift:
 *
 *   • {@link LEGACY_RENAMES} — the four project files v0.2.4 wrote under the
 *     framework's old name. The doc lists them, the site page lists them, the
 *     end-to-end upgrade test performs them, and `faqir`'s "no config found"
 *     error reads the first one to tell a v0.2.4 project what actually happened
 *     to it instead of suggesting `faqir init`, which would forget its
 *     components.
 *   • {@link MIGRATION_STEPS} — the bounded manual procedure. The test executes
 *     the steps in this order; the doc renders them in this order.
 *   • {@link collectBreakingChanges} — every `breaking: true` changelog entry in
 *     the registry. The manifests are the source; the doc must cover all of
 *     them, and `tests/migration/migration-doc.test.ts` fails when it does not.
 *
 * The fourth piece is the gate behind the plan's "no undocumented breaking
 * change exists": {@link extractSurface} reads what a component *honours* —
 * every attribute value its manifest declares or its stylesheet and controller
 * select on — and {@link surfaceLoss} names everything the v0.2.4 release
 * honoured that today's registry does not. A component may lose vocabulary; it
 * may not lose it silently, so every loss must be named in that component's own
 * `changes` notes ({@link uncoveredLosses}). The v0.2.4 side is pinned in
 * `tests/fixtures/v024/surface.json`, extracted from the release tag by
 * `scripts/gen-v024-surface.mjs` with the function below — both sides of the
 * comparison go through one extractor, because a diff run by two readers proves
 * only that the two readers agree.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { findSelectedAttributes } from "./parser/css-parser";
import { PROTOCOL_VALUE_RE } from "./protocol";
import type { ManifestChange } from "./manifest";

/** The release a migrating project is coming from. */
export const MIGRATION_FROM_VERSION = "0.2.4";

/** Layer directories, in registry order. */
const LAYERS = ["primitives", "recipes", "patterns"] as const;

// ── The rename ───────────────────────────────────────────────────────────────

/** One thing a v0.2.4 project holds under the framework's former name. */
export interface LegacyRename {
  /** Path or identifier as v0.2.4 wrote it, relative to the project root. */
  from: string;
  /** What 1.0 calls it. `output_dir` stands in for the configured `ui/`. */
  to: string;
  /** Why it has to move — one sentence, rendered by the doc and the site. */
  why: string;
}

/**
 * The v0.2.4 project surface that changed name before 1.0.
 *
 * Renaming a framework renames its files, and nothing in the CLI can guess that
 * `loom.config.json` was meant to be a Faqir project — `configExists()` returns
 * false and every command stops. These four are the whole list: the config, the
 * cache directory, the CSS bundle and the two core scripts. Everything else a
 * v0.2.4 project contains — the five attributes, `l-*` directives, tokens, part
 * and variant vocabularies — kept its name through the rename.
 */
export const LEGACY_RENAMES: readonly LegacyRename[] = [
  {
    from: "loom.config.json",
    to: "faqir.config.json",
    why: "Every command resolves the project through this file; under the old name there is no project.",
  },
  {
    from: ".loom/",
    to: ".faqir/",
    why: "Generated agent context and the pristine store live here. It is a cache — deleting it instead of renaming it is equally correct.",
  },
  {
    from: "<output_dir>/loom.bundle.css",
    to: "<output_dir>/faqir.bundle.css",
    why: "The bundle path is recorded in the config's `bundle.output`, which has to be updated with the file.",
  },
  {
    from: "<output_dir>/core/loom-core.js",
    to: "<output_dir>/core/faqir-core.js",
    why: "The reactive engine, and the global it publishes: `window.Loom` is now `window.Faqir`. Every page that loads the engine names it in a <script src>.",
  },
  {
    from: "<output_dir>/core/loom.js",
    to: "<output_dir>/core/faqir.js",
    why: "The generated auto-init module. `faqir init --force` rewrites it; the old file has to be deleted by hand.",
  },
] as const;

/** The config file v0.2.4 wrote, from {@link LEGACY_RENAMES}. */
export const LEGACY_CONFIG_FILE = LEGACY_RENAMES[0].from;

/** Absolute path a legacy config would occupy under `cwd`. */
export function legacyConfigPath(cwd: string): string {
  return join(cwd, LEGACY_CONFIG_FILE);
}

/** True when `cwd` holds a v0.2.4-era config under the framework's old name. */
export function legacyConfigExists(cwd: string): boolean {
  return existsSync(legacyConfigPath(cwd));
}

// ── The procedure ────────────────────────────────────────────────────────────

/** One numbered step of the documented upgrade path. */
export interface MigrationStep {
  /** Stable id — the doc's section anchor and the test's case name. */
  id: string;
  /** Imperative one-line title. */
  title: string;
  /** The command to run, or `null` when the step is an edit the user makes. */
  command: string | null;
  /** What it does and why it is where it is in the order. */
  why: string;
}

/**
 * The bounded manual procedure, in the only order that works.
 *
 * The order is load-bearing twice. `rename` comes first because every command
 * after it needs a config to read. `init` comes before `upgrade` because it
 * refreshes tokens, base styles and the engine — the things `upgrade` never
 * touches, since it merges components and nothing else.
 *
 * `tests/migration/upgrade-v024.test.ts` executes exactly these steps against a
 * pinned v0.2.4 project and audits the result, so the list cannot promise a
 * procedure that does not work.
 */
export const MIGRATION_STEPS: readonly MigrationStep[] = [
  {
    id: "commit",
    title: "Commit, or otherwise back up, the working tree",
    command: null,
    why: "`faqir upgrade` writes into your component directories and can leave conflict markers. Nothing here is destructive to content — every side of a conflict is preserved — but the review is much easier against a clean diff.",
  },
  {
    id: "rename",
    title: "Rename the four project files the framework rename left behind",
    command: null,
    why: "Until `faqir.config.json` exists, every command exits with 'no config found'. See the rename table above.",
  },
  {
    id: "init",
    title: "Refresh tokens, base styles and the engine",
    command: "faqir init --force",
    why: "`--force` on an existing project keeps your `installed` lists, theme and bundle settings, and rewrites only what the registry owns: `tokens/`, `base/`, `core/` and the auto-init module. `faqir upgrade` never touches these — it merges components.",
  },
  {
    id: "baseline",
    title: "Give every installed component an upgrade baseline",
    command: "faqir add $(faqir list --json | …)",
    why: "The pristine store (0.5-04) did not exist in v0.2.4, so there is nothing for the three-way merge to use as its base. `faqir add` on an already-installed component backfills one from the version your own copy records — approximate by construction, and warned about once per component.",
  },
  {
    id: "upgrade",
    title: "Merge every component up to its 1.0 version",
    command: "faqir upgrade",
    why: "Prints each component's changelog, breaking entries first, then three-way merges the registry's changes into your copy. Exit code 2 means conflict markers were written — resolve them before continuing.",
  },
  {
    id: "markup",
    title: "Apply the markup migrations the changelog named",
    command: null,
    why: "A merge can move a stylesheet; it cannot rewrite your pages. Each breaking change below states the edit its own vocabulary needs.",
  },
  {
    id: "verify",
    title: "Verify",
    command: "faqir doctor && faqir audit",
    why: "`doctor` checks the project's shape — config fields, output dir, core modules, bundle. `audit` reads your pages and your installed components against the 1.0 manifests. A clean audit is the end of the migration.",
  },
] as const;

// ── The changelog ────────────────────────────────────────────────────────────

/** One breaking changelog entry, with the component that shipped it. */
export interface BreakingChange {
  /** Component name, e.g. `field-group`. */
  component: string;
  /** Layer directory the component lives in. */
  layer: string;
  /** Component version the break shipped in. */
  version: string;
  /** The changelog note, verbatim from the manifest. */
  note: string;
}

/** Numeric-dotted compare, falling back to string order for odd segments. */
function compareVersions(a: string, b: string): number {
  const pa = a.split(".");
  const pb = b.split(".");
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const sa = pa[i] ?? "0";
    const sb = pb[i] ?? "0";
    const na = Number(sa);
    const nb = Number(sb);
    if (Number.isNaN(na) || Number.isNaN(nb)) {
      if (sa !== sb) return sa < sb ? -1 : 1;
      continue;
    }
    if (na !== nb) return na < nb ? -1 : 1;
  }
  return 0;
}

/** The `id` a breaking change is addressed by in the doc and on the site. */
export function breakingChangeId(change: { component: string; version: string }): string {
  return `${change.component}-${change.version.replace(/\./g, "-")}`;
}

/** Read one component's manifest, or `null` when it has none. */
function readManifest(dir: string, name: string): Record<string, unknown> | null {
  const path = join(dir, `${name}.manifest.json`);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Every component directory in a registry, as `{layer, name, dir}`. */
export function listRegistryComponents(registryPath: string): { layer: string; name: string; dir: string }[] {
  const out: { layer: string; name: string; dir: string }[] = [];
  for (const layer of LAYERS) {
    const layerDir = join(registryPath, layer);
    if (!existsSync(layerDir)) continue;
    for (const name of readdirSync(layerDir).sort()) {
      const dir = join(layerDir, name);
      if (existsSync(join(dir, `${name}.manifest.json`))) out.push({ layer, name, dir });
    }
  }
  return out;
}

/**
 * Every `breaking: true` changelog entry in the registry, newest first within a
 * component and alphabetical across components.
 *
 * This is the whole inventory the migration doc has to cover: the manifests'
 * `changes` arrays were maintained from 0.3 onwards for exactly this reading.
 */
export function collectBreakingChanges(registryPath: string): BreakingChange[] {
  const out: BreakingChange[] = [];
  for (const { layer, name, dir } of listRegistryComponents(registryPath)) {
    const manifest = readManifest(dir, name);
    const changes = (manifest?.changes ?? []) as ManifestChange[];
    if (!Array.isArray(changes)) continue;
    for (const change of changes) {
      if (!change?.breaking) continue;
      out.push({ component: name, layer, version: String(change.version), note: String(change.note) });
    }
  }
  return out.sort(
    (a, b) => a.component.localeCompare(b.component) || compareVersions(b.version, a.version),
  );
}

// ── The surface gate ─────────────────────────────────────────────────────────

/**
 * What one component honours: every attribute value its manifest declares or
 * its stylesheet/controller selects on, plus the valueless attributes (`bare`)
 * that are switches rather than vocabularies.
 */
export interface ComponentSurface {
  version: string;
  /** Attribute → sorted values, e.g. `data-part: ["body", "footer"]`. */
  attrs: Record<string, string[]>;
  /** Attributes selected or declared without a value, e.g. `data-full`. */
  bare: string[];
}

/**
 * `data-ui` is the component's own identity rather than part of its vocabulary,
 * and the `l-*` directives belong to the engine, not to any component.
 */
function isVocabularyAttribute(attr: string): boolean {
  return attr.startsWith("data-") && attr !== "data-ui" && attr !== "data-theme";
}

/**
 * A value is vocabulary only when it is a protocol value. This drops what a
 * controller's template literals look like to a scanner (`data-date="${iso}"`)
 * and any interpolated or compound value, neither of which a page can be
 * written against.
 */
function isVocabularyValue(value: string): boolean {
  return PROTOCOL_VALUE_RE.test(value);
}

/**
 * Extract the honoured surface of a component directory.
 *
 * Both the manifest and the implementation are read, because they answer
 * different halves of the question. The manifest is the contract agents are
 * given; the stylesheet and controller are what actually happens. A value in
 * either is a value a v0.2.4 page could legitimately carry, so losing one is
 * something a user has to be told about.
 */
export function extractSurface(dir: string, name: string): ComponentSurface | null {
  const manifest = readManifest(dir, name);
  if (!manifest) return null;
  const attrs = new Map<string, Set<string>>();
  const bare = new Set<string>();

  const add = (attr: string, value: string | null): void => {
    if (!isVocabularyAttribute(attr)) return;
    if (value === null || value === "") {
      bare.add(attr);
      return;
    }
    if (!isVocabularyValue(value)) return;
    let set = attrs.get(attr);
    if (!set) attrs.set(attr, (set = new Set()));
    set.add(value);
  };

  for (const slot of Object.keys((manifest.slots as Record<string, unknown>) ?? {})) add("data-part", slot);
  for (const variant of Object.values((manifest.variants as Record<string, VariantLike>) ?? {})) {
    const attr = typeof variant?.attr === "string" ? variant.attr : "data-variant";
    for (const value of variant?.values ?? []) add(attr, String(value));
  }
  for (const state of Object.keys((manifest.states as Record<string, unknown>) ?? {})) add("data-state", state);
  for (const [prop, def] of Object.entries((manifest.props as Record<string, PropLike>) ?? {})) {
    const attr = typeof def?.attr === "string" ? def.attr : `data-${prop}`;
    if (Array.isArray(def?.values) && def.values.length > 0) {
      for (const value of def.values) add(attr, String(value));
    } else {
      bare.add(attr);
    }
  }

  for (const file of readdirSync(dir).sort()) {
    const path = join(dir, file);
    if (file.endsWith(".css")) {
      for (const selected of findSelectedAttributes(readFileSync(path, "utf8"))) {
        add(selected.attr, selected.value);
      }
    } else if (file.endsWith(".js")) {
      const source = readFileSync(path, "utf8");
      // A controller names its vocabulary two ways: in selectors and template
      // markup (`[data-part='day']`, `data-today="true"`), and through the
      // dataset API (`row.dataset.selected = "true"`), which carries no value.
      for (const match of source.matchAll(/(data-[a-z][a-z0-9-]*)\s*=\s*["']([^"']*)["']/g)) {
        add(match[1], match[2]);
      }
      for (const match of source.matchAll(/\[\s*(data-[a-z][a-z0-9-]*)\s*\]/g)) add(match[1], null);
      for (const match of source.matchAll(/dataset\.([A-Za-z][A-Za-z0-9]*)/g)) {
        add(`data-${match[1].replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`, null);
      }
    }
  }

  return {
    version: String(manifest.version ?? "0.0.0"),
    attrs: Object.fromEntries(
      [...attrs.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([attr, values]) => [attr, [...values].sort()]),
    ),
    bare: [...bare].sort(),
  };
}

interface VariantLike {
  attr?: unknown;
  values?: unknown[];
}

interface PropLike {
  attr?: unknown;
  values?: unknown[];
}

/**
 * Every component's honoured surface in one registry, keyed `layer/name`.
 *
 * The key is the layer path and not the bare name because `empty-state` exists
 * twice — a primitive and a pattern, in both releases — and keying by name
 * silently drops one of them from the gate.
 */
export function extractRegistrySurface(registryPath: string): Record<string, ComponentSurface> {
  const out: Record<string, ComponentSurface> = {};
  for (const { layer, name, dir } of listRegistryComponents(registryPath)) {
    const surface = extractSurface(dir, name);
    if (surface) out[surfaceKey(layer, name)] = surface;
  }
  return out;
}

/** The `layer/name` key {@link extractRegistrySurface} files a component under. */
export function surfaceKey(layer: string, name: string): string {
  return `${layer}/${name}`;
}

/** One piece of vocabulary a component used to honour and no longer does. */
export interface SurfaceLoss {
  /** Attribute the value belongs to, e.g. `data-part`. */
  attr: string;
  /** The lost value, or `null` for a valueless attribute. */
  value: string | null;
  /** How the loss reads in prose and in a changelog note: `data-part="day"`. */
  token: string;
}

/** How a loss is written when it is named in a changelog note. */
function lossToken(attr: string, value: string | null): string {
  return value === null ? attr : `${attr}="${value}"`;
}

/**
 * Everything `before` honoured that `after` does not.
 *
 * A value that became valueless is not a loss: a component whose CSS narrowed
 * from `[data-full="true"]` to `[data-full]` still honours the attribute the
 * page carries. The reverse — an attribute that only ever appeared bare and now
 * requires a value — is a loss, because the page's bare attribute stops
 * matching.
 */
export function surfaceLoss(before: ComponentSurface, after: ComponentSurface | null): SurfaceLoss[] {
  const losses: SurfaceLoss[] = [];
  if (!after) {
    return [{ attr: "data-ui", value: null, token: "the component itself" }];
  }
  for (const [attr, values] of Object.entries(before.attrs)) {
    if (after.bare.includes(attr)) continue;
    const kept = new Set(after.attrs[attr] ?? []);
    for (const value of values) {
      if (!kept.has(value)) losses.push({ attr, value, token: lossToken(attr, value) });
    }
  }
  for (const attr of before.bare) {
    if (after.bare.includes(attr) || after.attrs[attr]) continue;
    losses.push({ attr, value: null, token: lossToken(attr, null) });
  }
  return losses.sort((a, b) => a.token.localeCompare(b.token));
}

/**
 * True when `note` names this loss.
 *
 * Notes are prose, and prose writes a vocabulary change the way a sentence
 * needs to: `data-state="error" is renamed to data-state="invalid"` names one
 * loss with its full token, while `data-max="sm" → "narrow"; "md" → "content"`
 * names three by stating the attribute once and quoting each value. Both count,
 * and neither is satisfied by a note that merely mentions the attribute — the
 * value has to appear.
 */
export function noteNamesLoss(note: string, loss: SurfaceLoss): boolean {
  if (note.includes(loss.token)) return true;
  if (loss.value === null) return note.includes(loss.attr);
  return note.includes(loss.attr) && note.includes(`"${loss.value}"`);
}

/** The losses no `changes` note in `manifest` accounts for. */
export function uncoveredLosses(changes: ManifestChange[] | undefined, losses: SurfaceLoss[]): SurfaceLoss[] {
  const notes = (changes ?? []).map((change) => String(change?.note ?? ""));
  return losses.filter((loss) => !notes.some((note) => noteNamesLoss(note, loss)));
}

/** A component's `changes` array, straight from its manifest. */
export function readChanges(dir: string, name: string): ManifestChange[] {
  const manifest = readManifest(dir, name);
  const changes = manifest?.changes;
  return Array.isArray(changes) ? (changes as ManifestChange[]) : [];
}

// ── The document ─────────────────────────────────────────────────────────────

/**
 * Marker a migration-doc section carries to say which breaking change it
 * documents. An HTML comment, so it is invisible in every markdown renderer and
 * unambiguous to parse: `<!-- @faqir:breaking field-group@2.0.0 -->`.
 */
export const BREAKING_MARKER_RE = /<!--\s*@faqir:breaking\s+([a-z0-9-]+)@([0-9][0-9a-z.-]*)\s*-->/g;

/** One documented breaking change, as the doc addresses it. */
export interface DocumentedBreak {
  component: string;
  version: string;
  /** The `## …` heading text the marker sits under, for the site rendering. */
  heading: string;
  /** The section body, markdown, marker line excluded. */
  body: string;
}

/**
 * Parse `docs/migration-1.0.md` into the breaking changes it documents.
 *
 * A section runs from its marker to the next heading of the same level or the
 * end of the file, which is what lets the site page render the doc's own prose
 * instead of a second copy written for the web.
 */
export function parseMigrationDoc(markdown: string): DocumentedBreak[] {
  const out: DocumentedBreak[] = [];
  const lines = markdown.split("\n");
  for (let i = 0; i < lines.length; i++) {
    BREAKING_MARKER_RE.lastIndex = 0;
    const marker = BREAKING_MARKER_RE.exec(lines[i]);
    if (!marker) continue;
    // The heading immediately above the marker names the section.
    let heading = "";
    let level = 0;
    for (let j = i - 1; j >= 0; j--) {
      const match = /^(#{2,6})\s+(.*)$/.exec(lines[j]);
      if (match) {
        level = match[1].length;
        heading = match[2].trim();
        break;
      }
      if (lines[j].trim() !== "") break; // marker is not attached to a heading
    }
    const body: string[] = [];
    for (let j = i + 1; j < lines.length; j++) {
      const match = /^(#{1,6})\s+/.exec(lines[j]);
      if (match && match[1].length <= level) break;
      body.push(lines[j]);
    }
    out.push({
      component: marker[1],
      version: marker[2],
      heading,
      body: body.join("\n").trim(),
    });
  }
  return out;
}
