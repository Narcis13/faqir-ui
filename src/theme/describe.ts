// ═══════════════════════════════════════════════════════════════════════════
// Describing a theme by its axes — one derivation for every surface [1.1A-20]
// ═══════════════════════════════════════════════════════════════════════════
//
// Every theme manifest carries an `axes` block DERIVED from its stylesheet
// (1.1A-08): the fourteen character axes of FAQIR-VISION §5.2, as the CSS
// actually lands on them. Until this task the surfaces an agent reads — the
// README's theme table, the skill's gallery, `faqir context`, the MCP theme
// tools, the docs-site gallery — described a theme by its `mood` adjectives and
// nothing else, so "make it dark and calm" chose by vibe while the manifest
// sat there knowing the theme is `depth: flat`, `motion: minimal`,
// `density: spacious`.
//
// This module is the ONE place a theme's axes are turned into words: a table
// row, a vocabulary table, a one-line summary, the chips and filter attributes
// the gallery uses. Every surface renders through it, so a new axis added to
// `THEME_AXIS_VALUES` reaches all of them on the same commit — and the surface
// tests compare against these renderers rather than against prose of their own.
//
// Nothing here reads the filesystem. Callers pass manifests in.

import {
  THEME_AXIS_VALUES,
  THEME_SEED_DEFAULTS,
  type ThemeAxes,
  type ThemeManifest,
} from "../theme-manifest";
import { SEED_FLAGS } from "./seed";

/** A dotted leaf path of the axis vocabulary (`depth`, `type.pairing`, …). */
export type AxisPath = keyof typeof THEME_AXIS_VALUES;

/** Every enumerated leaf path, in the order the vocabulary states them. */
export const AXIS_PATHS = Object.keys(THEME_AXIS_VALUES) as AxisPath[];

/** Whether `path` is an enumerated axis leaf. */
export function isAxisPath(path: string): path is AxisPath {
  return Object.prototype.hasOwnProperty.call(THEME_AXIS_VALUES, path);
}

/** The vocabulary of one leaf, or `null` for a path that is not an axis. */
export function axisVocabulary(path: string): readonly (string | number)[] | null {
  return isAxisPath(path) ? THEME_AXIS_VALUES[path] : null;
}

/**
 * The `faqir theme generate` flag that sets a leaf (`type.pairing` → `--type`),
 * read out of {@link SEED_FLAGS} so the docs cannot name a flag the CLI lacks.
 */
export function axisFlag(path: string): string | null {
  for (const [flag, target] of Object.entries(SEED_FLAGS)) {
    if (target === path) return `--${flag}`;
  }
  return null;
}

/** Read one dotted path out of an `axes` block. */
export function axisValue(axes: ThemeAxes, path: string): string | number | undefined {
  let node: unknown = axes;
  for (const key of path.split(".")) {
    if (node === null || typeof node !== "object" || !(key in (node as Record<string, unknown>))) {
      return undefined;
    }
    node = (node as Record<string, unknown>)[key];
  }
  return typeof node === "string" || typeof node === "number" ? node : undefined;
}

/**
 * A theme's axes flattened to `[path, value]` pairs: the accent's two numbers
 * first, then every enumerated leaf in vocabulary order. This is the shape a
 * filter compares on and the shape a diff between two themes is read in.
 */
export function axisLeaves(axes: ThemeAxes): [string, string | number][] {
  const leaves: [string, string | number][] = [
    ["accent_hue", axes.accent_hue],
    ["accent_chroma", axes.accent_chroma],
  ];
  for (const path of AXIS_PATHS) {
    const value = axisValue(axes, path);
    if (value !== undefined) leaves.push([path, value]);
  }
  return leaves;
}

/** Whether a theme's axes land on `value` at `path` (numbers compare as numbers). */
export function axisMatches(axes: ThemeAxes, path: string, value: string | number): boolean {
  const actual = axisValue(axes, path);
  if (actual === undefined) return false;
  if (typeof actual === "number") return actual === Number(value);
  return actual === String(value);
}

/** `256° · 0.07` — the accent as hue and chroma, the way the manifest carries it. */
export function accentCell(axes: ThemeAxes): string {
  return `${Math.round(axes.accent_hue)}° · ${axes.accent_chroma.toFixed(2)}`;
}

/** `serif-editorial · 1.333/17px · semibold tight` — the pairing, ramp and heading voice. */
export function typeCell(axes: ThemeAxes): string {
  const { pairing, scale, base, voice } = axes.type;
  const voiceWords = [voice.weight];
  if (voice.tracking !== "normal") voiceWords.push(voice.tracking);
  if (voice.transform !== "none") voiceWords.push(voice.transform);
  return `${pairing} · ${scale}/${base}px · ${voiceWords.join(" ")}`;
}

/**
 * One column per top-level derived axis, with the accent's two numbers folded
 * into one cell — twelve columns, in the schema's order, that with the
 * manifest's own `scheme` field make the fourteen.
 */
export interface AxisColumn {
  /** The top-level key in the `axes` block (`accent` for the folded pair). */
  key: string;
  /** Table header. */
  label: string;
  /** The cell for one theme. */
  cell: (axes: ThemeAxes) => string;
}

const dotted = (...values: string[]) => values.join(" · ");

export const AXIS_COLUMNS: readonly AxisColumn[] = [
  { key: "accent", label: "Accent", cell: accentCell },
  { key: "neutral", label: "Neutral", cell: (a) => a.neutral },
  { key: "type", label: "Type", cell: typeCell },
  { key: "shape", label: "Shape", cell: (a) => dotted(a.shape.radius, a.shape.border, a.shape.corner) },
  { key: "depth", label: "Depth", cell: (a) => a.depth },
  { key: "material", label: "Material", cell: (a) => a.material },
  { key: "motion", label: "Motion", cell: (a) => a.motion },
  { key: "density", label: "Density", cell: (a) => a.density },
  { key: "focus", label: "Focus", cell: (a) => a.focus },
  { key: "decoration", label: "Decoration", cell: (a) => dotted(a.decoration.link, a.decoration.divider) },
  {
    key: "controls",
    label: "Controls",
    cell: (a) => dotted(a.controls.button, a.controls.input, a.controls.checkbox, a.controls.switch),
  },
  { key: "contrast", label: "Contrast", cell: (a) => a.contrast },
];

/** The cell placed where a theme has no `axes` block (a print companion). */
export const NO_AXES_CELL = "—";

/** The twelve axis cells for a manifest, `—` throughout when it carries no axes. */
export function axisCells(manifest: Pick<ThemeManifest, "axes">): string[] {
  const axes = manifest.axes;
  return AXIS_COLUMNS.map((column) => (axes ? column.cell(axes) : NO_AXES_CELL));
}

/**
 * `accent 256° · 0.07; neutral gray; type serif-editorial · 1.333/17px · semibold tight; …`
 * — every axis on one line, for the surfaces that describe one theme rather
 * than table many (`faqir context`'s active-theme block).
 */
export function axisSummary(axes: ThemeAxes): string {
  return AXIS_COLUMNS.map((column) => `${column.key} ${column.cell(axes)}`).join("; ");
}

/**
 * How a theme came to be, read off the manifest: `generated` when it carries
 * the seed it was produced from, `companion` for the print medium a seed with
 * `document: true` emits (no axes of its own), `authored` otherwise.
 */
export type ThemeKind = "authored" | "generated" | "companion";

export function themeKind(manifest: Pick<ThemeManifest, "seed" | "axes">): ThemeKind {
  if (manifest.seed) return "generated";
  if (!manifest.axes) return "companion";
  return "authored";
}

// ── Markdown renderers ──────────────────────────────────────────────────────

/**
 * The axis vocabulary as a table — one row per enumerated leaf, with the flag
 * that sets it and the value a seed gets when it says nothing. Prefixed by the
 * accent, the one required input, so the table reads as "everything a seed may
 * state". Every leaf appears exactly once, in backticks, which is what the
 * skill test counts.
 */
export function renderAxisVocabularyTable(): string[] {
  const lines = ["| Axis | Flag | Values | Default |", "|------|------|--------|---------|"];
  lines.push("| `accent` | `--accent` | any CSS colour — the one required input | — |");
  for (const path of AXIS_PATHS) {
    const values = THEME_AXIS_VALUES[path].map((v) => `\`${v}\``).join(" · ");
    const fallback = (THEME_SEED_DEFAULTS as Record<string, string | number>)[path];
    const flag = axisFlag(path);
    lines.push(`| \`${path}\` | ${flag ? `\`${flag}\`` : "—"} | ${values} | \`${fallback}\` |`);
  }
  return lines;
}

export interface ThemeTableOptions {
  /** Add a `Kind` column (authored / generated / companion). */
  kind?: boolean;
  /** Add a `Mood` column from the manifest's adjectives. */
  mood?: boolean;
  /** Add `Dark mode` and `Pairs with` columns (the skill's original table). */
  extended?: boolean;
}

/** The header cells a theme table carries under `options`, in order. */
export function themeTableHeaders(options: ThemeTableOptions = {}): string[] {
  const headers = ["Theme"];
  if (options.kind) headers.push("Kind");
  if (options.mood) headers.push("Mood");
  headers.push("Scheme");
  if (options.extended) headers.push("Dark mode", "Pairs with");
  headers.push(...AXIS_COLUMNS.map((column) => column.label));
  return headers;
}

/** One theme table row under `options`, as cells. */
export function themeTableCells(manifest: ThemeManifest, options: ThemeTableOptions = {}): string[] {
  const cells = [`\`${manifest.name}\``];
  if (options.kind) cells.push(themeKind(manifest));
  if (options.mood) cells.push(manifest.mood.join(", "));
  cells.push(manifest.scheme);
  if (options.extended) {
    cells.push(
      manifest.dark_mode,
      manifest.pairs_with.length > 0 ? manifest.pairs_with.map((t) => `\`${t}\``).join(", ") : "—",
    );
  }
  cells.push(...axisCells(manifest));
  return cells;
}

/**
 * A markdown table with one row per manifest, in the order given, and one
 * column per axis. The same renderer feeds the README and the skill so the two
 * cannot disagree about what a theme is.
 */
export function renderThemeTable(manifests: ThemeManifest[], options: ThemeTableOptions = {}): string[] {
  const headers = themeTableHeaders(options);
  const lines = [
    `| ${headers.join(" | ")} |`,
    `|${headers.map((h) => "-".repeat(Math.max(3, h.length + 2))).join("|")}|`,
  ];
  for (const manifest of manifests) lines.push(`| ${themeTableCells(manifest, options).join(" | ")} |`);
  return lines;
}

// ── The docs-site gallery ───────────────────────────────────────────────────

/**
 * The axes the gallery shows as chips on every card and offers as filters —
 * the ones a reader compares themes on at a glance. The numeric leaves and the
 * per-control silhouettes are in the manifest and the reference table, not on
 * the card.
 */
export const GALLERY_AXES = [
  "neutral",
  "type.pairing",
  "shape.radius",
  "depth",
  "material",
  "motion",
  "density",
  "focus",
  "contrast",
] as const satisfies readonly AxisPath[];

/** `type.pairing` → `type-pairing`: a dotted path as an attribute-name suffix. */
export function axisSlug(path: string): string {
  return path.replace(/\./g, "-");
}

/** The `data-theme-axis-<slug>` attribute name a gallery card carries for `path`. */
export function galleryAxisAttribute(path: string): string {
  return `data-theme-axis-${axisSlug(path)}`;
}

/**
 * The chips for one theme's card: `[path, value]` for each gallery axis, in
 * {@link GALLERY_AXES} order. Empty for a theme with no axes.
 */
export function galleryChips(manifest: Pick<ThemeManifest, "axes">): [string, string][] {
  const axes = manifest.axes;
  if (!axes) return [];
  const chips: [string, string][] = [];
  for (const path of GALLERY_AXES) {
    const value = axisValue(axes, path);
    if (value !== undefined) chips.push([path, String(value)]);
  }
  return chips;
}

/**
 * For each gallery axis, the values some theme in `manifests` actually lands
 * on, in vocabulary order — so a filter offers no option that selects nothing.
 */
export function galleryFilterOptions(
  manifests: Pick<ThemeManifest, "axes">[],
): { path: AxisPath; values: string[] }[] {
  return GALLERY_AXES.map((path) => {
    const present = new Set<string>();
    for (const m of manifests) {
      const value = m.axes ? axisValue(m.axes, path) : undefined;
      if (value !== undefined) present.add(String(value));
    }
    const values = THEME_AXIS_VALUES[path].map(String).filter((v) => present.has(v));
    return { path, values };
  });
}

// ── Generated blocks in hand-written docs ───────────────────────────────────
//
// README.md is prose, but its theme tables are FACTS about the manifests, and
// facts in prose drift: the 1.0 README described "twelve themes" for two tasks
// after there were twenty-four. `bun run gen:theme-docs` writes the blocks
// below between `<!-- @faqir:<name> start -->` / `end` markers and
// `check:theme-docs` fails when a committed block differs from a fresh render —
// the same shape as `check:skill`, for the same reason.

/** The blocks `gen:theme-docs` maintains, by marker name. */
export function renderThemeDocBlocks(manifests: ThemeManifest[]): Record<string, string> {
  const themes = manifests.filter((m) => themeKind(m) !== "companion");
  const companions = manifests.filter((m) => themeKind(m) === "companion");
  const table = renderThemeTable(themes, { kind: true });
  if (companions.length > 0) {
    table.push(
      "",
      `${companions.length} print companion${companions.length === 1 ? "" : "s"} — ` +
        companions.map((m) => `\`${m.name}\``).join(", ") +
        " — carry no axes of their own: each is its parent theme on white paper, light only.",
    );
  }
  return {
    "theme-axes": renderAxisVocabularyTable().join("\n"),
    "theme-table": table.join("\n"),
  };
}

const blockPattern = (name: string) =>
  new RegExp(`(<!-- @faqir:${name} start -->)[\\s\\S]*?(<!-- @faqir:${name} end -->)`);

/** The text between two markers with the one newline each side of it removed. */
function blockBody(match: RegExpMatchArray): string {
  return match[0].slice(match[1].length, -match[2].length).replace(/^\n/, "").replace(/\n$/, "");
}

/**
 * `markdown` with every block replaced between its markers. A block whose
 * markers are missing is reported rather than appended — the marker is where
 * the author chose to put it.
 */
export function applyDocBlocks(
  markdown: string,
  blocks: Record<string, string>,
): { markdown: string; missing: string[] } {
  const missing: string[] = [];
  let out = markdown;
  for (const [name, content] of Object.entries(blocks)) {
    const pattern = blockPattern(name);
    if (!pattern.test(out)) {
      missing.push(name);
      continue;
    }
    out = out.replace(pattern, (_m, start: string, end: string) => `${start}\n${content}\n${end}`);
  }
  return { markdown: out, missing };
}

/** The names of the blocks in `markdown` that differ from `blocks`, or are missing. */
export function docBlockDrift(markdown: string, blocks: Record<string, string>): string[] {
  const stale: string[] = [];
  for (const [name, content] of Object.entries(blocks)) {
    const match = markdown.match(blockPattern(name));
    if (!match) {
      stale.push(`${name} (markers missing)`);
      continue;
    }
    if (blockBody(match) !== content) stale.push(name);
  }
  return stale;
}
