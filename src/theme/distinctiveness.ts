// ═══════════════════════════════════════════════════════════════════════════
// Distinctiveness — how far two themes sit apart              [task 1.1A-12]
// ═══════════════════════════════════════════════════════════════════════════
//
// FAQIR-VISION §5.2 states the rule in one sentence: "Two shipped themes MUST
// differ on at least four of [the fourteen axes] — a rule the theme gate
// enforces, so the sameness problem cannot return." This file is that gate.
//
// Two numbers, because one is not enough:
//
//   • AXIS DISTANCE — how many of the fourteen axes the two themes land on
//     differently. It is the vision's own rule, and it is what catches a theme
//     that is a recolour of another: same silhouette, same type, same depth,
//     a different hue.
//
//   • TOKEN DISTANCE — the mean OKLab ΔE between the two themes' resolved
//     colour surface, per shared scheme. It catches the converse, which the
//     axis rule cannot see: two themes whose stated axes differ on paper while
//     every colour a reader actually looks at is the same.
//
// Both are browser-free and deterministic — the axes come from the manifest
// block `axesFromCss` derives (1.1A-08) and the colours are resolved through
// `buildSchemeLookups`, the same cascade model the contrast gate uses. So the
// gate reports a fact about two stylesheets rather than a claim about them.

import { buildSchemeLookups, ELEVATION_MIN_DELTA, perceptualDelta } from "../audit/contrast-tokens";
import { resolveColorString } from "../utils/oklch";
import {
  surfaceTokens,
  THEME_DERIVED_AXES,
  type ThemeAxes,
  type ThemeSchemeDecl,
} from "../theme-manifest";

/** The two schemes a theme can be rendered in. `auto` mirrors `dark` by construction. */
export type Scheme = "light" | "dark";

// ── Thresholds ──────────────────────────────────────────────────────────────

/**
 * The vision's rule, verbatim: two shipped themes must differ on at least FOUR
 * of the fourteen axes. Four is not a measurement — it is the stated contract,
 * and the 66-pair table in this task's commit body records which shipped pairs
 * do not meet it yet (an obligation for 1.1A-14/15, which is what arms the
 * shipped-pair gate).
 */
export const AXIS_MIN = 4;

/**
 * The minimum mean OKLab ΔE between two themes' colour surfaces.
 *
 * Deliberately NOT a fresh number: it is {@link ELEVATION_MIN_DELTA}, the
 * separation the framework already demands between two ADJACENT surfaces
 * INSIDE one theme (`--color-bg` → `--color-surface-1`). The argument is a
 * comparison a reader can check: if the average colour of theme A sits closer
 * to theme B's than a card sits to the page it is lying on, then the two
 * themes are a colourway of each other — whatever their axes say.
 *
 * Measured over the twelve shipped themes (66 pairs, this task's commit body),
 * the closest pair is `glass`/`slate` at 0.0282, the only one below this line.
 */
export const TOKEN_MIN = ELEVATION_MIN_DELTA;

/**
 * `accent_hue` is a continuous number, so it is compared as a bucket: two
 * accents at least this far apart on the OKLCH hue wheel are different accents.
 * 30° is a twelfth of the wheel — the step at which a named hue becomes the
 * next named hue (indigo → violet → magenta).
 *
 * The comparison is a CIRCULAR DISTANCE rather than a bucket index, which is a
 * deliberate deviation from the plan's sketch ("as a 30° bucket"): fixed
 * buckets put 359° and 1° — the same red — in different ones, so a bucket index
 * would report a difference that nobody can see.
 */
export const ACCENT_HUE_BUCKET_DEG = 30;

/**
 * `accent_chroma`'s bucket, on the same principle. 0.05 is a quarter of the
 * usable sRGB chroma range (~0.2 at a mid lightness), which is the step that
 * separates the four bands a reader would name: near-gray, muted, rich, vivid.
 */
export const ACCENT_CHROMA_BUCKET = 0.05;

// ── Axis distance ───────────────────────────────────────────────────────────

/**
 * A theme, in the two forms this gate reads it: the axes its manifest carries
 * and the stylesheet its colours are resolved from.
 *
 * `axes` is the DERIVED block (`axesFromCss`), never a hand-written claim —
 * which is what makes an axis distance a fact about the two stylesheets.
 */
export interface DistinctivenessTheme {
  name: string;
  /** The theme stylesheet, for the colour comparison. */
  css: string;
  /** Which schemes the theme ships, from its manifest. */
  scheme: ThemeSchemeDecl;
  axes: ThemeAxes;
}

/** Circular distance between two OKLCH hues, in degrees (0–180). */
export function hueDistance(a: number, b: number): number {
  const diff = Math.abs(((a - b) % 360) + 360) % 360;
  return diff > 180 ? 360 - diff : diff;
}

/**
 * Whether one axis differs between two themes.
 *
 * Three shapes, because the fourteen axes have three:
 *   • the two continuous accent axes compare against their bucket width;
 *   • a COMPOUND axis (`type`, `shape`, `decoration`, `controls`) differs when
 *     any of its leaves differs — the vision counts `shape` as ONE axis whose
 *     value is a radius, a border weight and a corner shape together;
 *   • everything else is an enum, compared by equality.
 *
 * A numeric leaf inside a compound axis (`type.scale`, `type.base`) is compared
 * by equality too: both sides are snapped to the vocabulary by `axesFromCss`
 * before they ever reach here, so a bucket would be a second, weaker copy of a
 * snap that already happened.
 */
function axisDiffers(axis: (typeof THEME_DERIVED_AXES)[number], a: ThemeAxes, b: ThemeAxes): boolean {
  if (axis === "accent_hue") return hueDistance(a.accent_hue, b.accent_hue) >= ACCENT_HUE_BUCKET_DEG;
  if (axis === "accent_chroma") {
    return Math.abs(a.accent_chroma - b.accent_chroma) >= ACCENT_CHROMA_BUCKET;
  }
  const left = a[axis] as unknown;
  const right = b[axis] as unknown;
  if (left !== null && typeof left === "object" && right !== null && typeof right === "object") {
    return JSON.stringify(sortedLeaves(left)) !== JSON.stringify(sortedLeaves(right));
  }
  return left !== right;
}

/** A compound axis flattened to `path → value` pairs, key-sorted so order cannot matter. */
function sortedLeaves(value: unknown, prefix = ""): Array<[string, unknown]> {
  if (value === null || typeof value !== "object") return [[prefix, value]];
  const out: Array<[string, unknown]> = [];
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    out.push(...sortedLeaves((value as Record<string, unknown>)[key], prefix ? `${prefix}.${key}` : key));
  }
  return out;
}

export interface AxisDistance {
  /** How many of the fourteen differ. */
  distance: number;
  /** Which ones, in {@link THEME_DERIVED_AXES} order — so a refusal can name them. */
  differing: string[];
}

/**
 * How many of the fourteen axes two themes land on differently.
 *
 * The fourteen are {@link THEME_DERIVED_AXES} — the keys a manifest's `axes`
 * block actually carries (1.1A-07 trades the seed's `accent` and `document` for
 * `accent_hue` + `accent_chroma`, which is why both sides count fourteen). The
 * list is read from that constant rather than written out again here, so an
 * axis added to the vocabulary is counted by this gate on the same commit.
 */
export function axisDistance(a: ThemeAxes, b: ThemeAxes): AxisDistance {
  const differing = THEME_DERIVED_AXES.filter((axis) => axisDiffers(axis, a, b));
  return { distance: differing.length, differing: [...differing] };
}

// ── Token distance ──────────────────────────────────────────────────────────

/**
 * The colour half of the themeable surface: every `color-*` token the base
 * layer defines, sorted. Derived from the same `surfaceTokens` the manifest's
 * `tokens_inherited` is, so "the colour surface" means one thing in the repo.
 */
export function colorSurfaceTokens(baseCssSources: string[]): string[] {
  return surfaceTokens(baseCssSources).filter((token) => token.startsWith("color-"));
}

/**
 * Everything the comparison needs that does not depend on which two themes are
 * being compared: the base layer, read once. Building it per pair would reparse
 * the whole token layer 66 times for the shipped set.
 */
export interface DistinctivenessContext {
  baseCss: string;
  colorTokens: string[];
}

export function distinctivenessContext(baseCssSources: string[]): DistinctivenessContext {
  return { baseCss: baseCssSources.join("\n"), colorTokens: colorSurfaceTokens(baseCssSources) };
}

/** A theme with its per-scheme lookups already built — the unit `nearest` reuses. */
export interface PreparedTheme {
  name: string;
  scheme: ThemeSchemeDecl;
  axes: ThemeAxes;
  lookups: Record<Scheme, Map<string, string>>;
}

export function prepareTheme(theme: DistinctivenessTheme, context: DistinctivenessContext): PreparedTheme {
  return {
    name: theme.name,
    scheme: theme.scheme,
    axes: theme.axes,
    lookups: buildSchemeLookups(theme.css, context.baseCss),
  };
}

/** The schemes two themes both ship — the only ones in which they can be confused. */
export function sharedSchemes(a: ThemeSchemeDecl, b: ThemeSchemeDecl): Scheme[] {
  const ships = (decl: ThemeSchemeDecl, scheme: Scheme): boolean => decl === "both" || decl === scheme;
  return (["light", "dark"] as const).filter((scheme) => ships(a, scheme) && ships(b, scheme));
}

export interface TokenDistance {
  /**
   * Mean OKLab ΔE over every colour token both themes resolve opaquely, in
   * every shared scheme. `null` when there is nothing to compare — see
   * {@link distinctiveness} for what that means.
   */
  distance: number | null;
  schemes: Scheme[];
  /** How many (token × scheme) readings the mean is over; 0 when unmeasurable. */
  samples: number;
  /** Colour tokens skipped because one side was translucent or unresolvable. */
  skipped: number;
}

/**
 * Mean perceptual distance between two themes' colour surfaces.
 *
 * A token is skipped when either side does not resolve to an OPAQUE colour —
 * `perceptualDelta` is a distance in OKLab and a translucent value has no
 * position there without a backdrop. The count of skips is reported rather than
 * swallowed, because a mean over three tokens and a mean over sixty-two are not
 * the same claim.
 */
export function tokenDistance(a: PreparedTheme, b: PreparedTheme, context: DistinctivenessContext): TokenDistance {
  const schemes = sharedSchemes(a.scheme, b.scheme);
  let total = 0;
  let samples = 0;
  let skipped = 0;
  for (const scheme of schemes) {
    for (const token of context.colorTokens) {
      const delta = tokenDelta(a.lookups[scheme], b.lookups[scheme], token);
      if (delta == null) skipped++;
      else {
        total += delta;
        samples++;
      }
    }
  }
  return { distance: samples > 0 ? total / samples : null, schemes, samples, skipped };
}

function tokenDelta(a: Map<string, string>, b: Map<string, string>, token: string): number | null {
  const rawA = a.get(token);
  const rawB = b.get(token);
  if (rawA == null || rawB == null) return null;
  const colorA = resolveColorString(rawA, a);
  const colorB = resolveColorString(rawB, b);
  if (!colorA || !colorB) return null;
  return perceptualDelta(colorA, colorB);
}

// ── The pair, and the nearest ───────────────────────────────────────────────

export interface DistinctivenessResult {
  /** The other theme this result is about. */
  nearest: string;
  axis_distance: number;
  /** `null` when the two themes share no scheme — see {@link distinctiveness}. */
  token_distance: number | null;
  /** Which of the fourteen axes differ, in schema order. */
  axes_differing: string[];
  schemes: Scheme[];
  samples: number;
  /** True when BOTH measures clear their threshold. */
  passes: boolean;
}

/** Round a distance the way a manifest and a scorecard both print it. */
function roundDelta(value: number | null): number | null {
  return value == null ? null : Number(value.toFixed(4));
}

/**
 * Both measures for one pair.
 *
 * `token_distance` is `null` when the two themes share no scheme — a light-only
 * theme and a dark-only one are never on screen in the same mode, so there is
 * no shared rendering to compare and inventing a number would be the kind of
 * quiet fiction §3 forbids. Such a pair is judged on the AXIS rule alone: the
 * colour measure abstains rather than voting either way.
 */
export function distinctiveness(
  a: PreparedTheme,
  b: PreparedTheme,
  context: DistinctivenessContext,
): DistinctivenessResult {
  const axes = axisDistance(a.axes, b.axes);
  const tokens = tokenDistance(a, b, context);
  const distance = roundDelta(tokens.distance);
  return {
    nearest: b.name,
    axis_distance: axes.distance,
    token_distance: distance,
    axes_differing: axes.differing,
    schemes: tokens.schemes,
    samples: tokens.samples,
    passes: axes.distance >= AXIS_MIN && (distance == null || distance >= TOKEN_MIN),
  };
}

/**
 * The theme `subject` is closest to, or `null` when there is nothing to compare
 * it with (an empty output directory — the ordinary case for a first
 * `faqir theme generate`).
 *
 * "Closest" is the smallest TOKEN distance, not the smallest axis distance:
 * axis distance is a coarse integer with many ties across a dozen themes, while
 * the colour distance is continuous and is what "these two read the same"
 * actually means to the person looking at them. Ties break on the smaller axis
 * distance, then on the name, so the answer is deterministic.
 *
 * A candidate whose token distance is unmeasurable (no shared scheme) is never
 * the nearest while a measurable one exists.
 */
export function nearest(
  subject: PreparedTheme,
  others: PreparedTheme[],
  context: DistinctivenessContext,
): DistinctivenessResult | null {
  const results = others
    .filter((other) => other.name !== subject.name)
    .map((other) => distinctiveness(subject, other, context));
  if (results.length === 0) return null;
  return results.sort(compareByCloseness)[0];
}

function compareByCloseness(x: DistinctivenessResult, y: DistinctivenessResult): number {
  const xd = x.token_distance ?? Infinity;
  const yd = y.token_distance ?? Infinity;
  if (xd !== yd) return xd - yd;
  if (x.axis_distance !== y.axis_distance) return x.axis_distance - y.axis_distance;
  return x.nearest < y.nearest ? -1 : x.nearest > y.nearest ? 1 : 0;
}

/**
 * Every candidate `subject` is too close to, worst first. Empty means the theme
 * is distinct from everything it was compared against.
 */
export function collisions(
  subject: PreparedTheme,
  others: PreparedTheme[],
  context: DistinctivenessContext,
): DistinctivenessResult[] {
  return others
    .filter((other) => other.name !== subject.name)
    .map((other) => distinctiveness(subject, other, context))
    .filter((result) => !result.passes)
    .sort(compareByCloseness);
}

/** One collision, as the sentence the generator refuses with. */
export function collisionMessage(subject: string, result: DistinctivenessResult): string {
  const reasons: string[] = [];
  if (result.axis_distance < AXIS_MIN) {
    const same = THEME_DERIVED_AXES.length - result.axis_distance;
    reasons.push(
      `it differs on only ${result.axis_distance} of the ${THEME_DERIVED_AXES.length} axes (${AXIS_MIN} required; ` +
        `${same} are identical` +
        (result.axes_differing.length > 0 ? `, the differences are ${result.axes_differing.join(", ")}` : "") +
        `)`,
    );
  }
  if (result.token_distance != null && result.token_distance < TOKEN_MIN) {
    reasons.push(
      `its colour surface is ${result.token_distance.toFixed(4)} away in mean OKLab ΔE ` +
        `(${TOKEN_MIN} required, over ${result.samples} readings)`,
    );
  }
  return `'${subject}' is too close to '${result.nearest}': ${reasons.join(" and ")}.`;
}

/**
 * Refuse a theme that would ship as a look-alike.
 *
 * Throws naming every collision — not just the nearest, because a seed that
 * collides with three shipped themes has three things to fix and being told
 * about them one regeneration at a time is the slowest way to learn that.
 */
export function assertDistinct(
  subject: PreparedTheme,
  others: PreparedTheme[],
  context: DistinctivenessContext,
): DistinctivenessResult[] {
  const found = collisions(subject, others, context);
  if (found.length > 0) {
    throw new Error(
      found.map((result) => collisionMessage(subject.name, result)).join(" ") +
        ` Change an axis or the accent, or pass --allow-similar to write it anyway.`,
    );
  }
  return found;
}
