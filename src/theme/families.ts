// ═══════════════════════════════════════════════════════════════════════════
// families — one axis value, one group of declarations          [task 1.1A-10]
// ═══════════════════════════════════════════════════════════════════════════
//
// `axesFromCss` (1.1A-08) classifies a stylesheet into fourteen axes. This file
// is its inverse for the nine axes that are pure token families: given an axis
// value, what must a theme declare for the classifier to read that value back?
//
// Every renderer is a pure `(NormalizedSeed) => Declaration[]`, which is what
// makes each one unit-testable on its own and what lets Night Shift (1.1N)
// assemble a candidate theme without going through the CLI.
//
// THREE RULES EVERY RENDERER OBEYS, and each is gated:
//
//  1. **Only surface tokens.** A renderer may name only a token the base token
//     layer already declares (`surfaceTokens`). A theme that invents a token
//     invents an axis nobody reads — the dead-axis drift 1.1A-21 tracks.
//  2. **No component is ever selected.** A theme is tokens. Every declaration
//     here lands in one `:root` block.
//  3. **The classifier reads it back.** Each renderer's output must derive to
//     the axis value that produced it, which `generateThemeBundle`'s closed
//     loop checks on every single generated theme — not just in tests.
//
// Where a value here looks oddly specific, it is answering a threshold in
// `axes.ts` rather than a taste: those sites name the constant they clear.

import {
  BORDER_HAIRLINE_MAX_PX,
  BORDER_REGULAR_MAX_PX,
  DEPTH_LAYERED_MIN_BLUR_PX,
  DIVIDER_DOUBLE_MIN_PX,
  FOCUS_BOLD_MIN_WIDTH_PX,
  HEADING_TRACKING_EM,
  HEADING_WEIGHT_MAX,
  LINK_OFFSET_MIN_EM,
  LINK_THICK_MIN_PX,
  MOTION_MINIMAL_MAX_MS,
  MOTION_PLAYFUL_LIFT_MAX_PX,
  MOTION_SNAPPY_MAX_MS,
  NEUTRAL_COOL_HUE,
  NEUTRAL_GRAY_MAX_CHROMA,
  NEUTRAL_WARM_HUE,
  PILL_MIN_PX,
  RADIUS_CRISP_MAX_PX,
  RADIUS_SOFT_MAX_PX,
  ROOT_FONT_PX,
  TEXT_STEPS,
} from "./axes";
import type { Axis, NormalizedSeed } from "./seed";

/** A `--name: value` pair. The name never carries its leading `--`. */
export type Declaration = readonly [name: string, value: string];

// ── Type ────────────────────────────────────────────────────────────────────

/**
 * One font stack per pairing class. Each stack's FIRST family is one the
 * `FAMILY_CLASSES` table in `axes.ts` names, because that is what the
 * classifier keys on — which is also what a browser does, so the axis a
 * manifest reports is the class the reader actually sees.
 *
 * Every stack ends in a CSS generic so a machine with none of the named faces
 * still lands in the right class. Until `faqir fonts add` ships the OFL catalog
 * (1.1A-18) these are all faces a reader plausibly already has, plus the
 * generics; a self-hosted family added there gets a row in both tables.
 */
export const PAIRING_STACKS: Record<
  Exclude<Axis<"type.pairing">, "custom">,
  string
> = {
  system: "system-ui, -apple-system, 'Segoe UI', sans-serif",
  "sans-humanist": "'Lato', 'Segoe UI', 'Open Sans', system-ui, sans-serif",
  "sans-grotesque": "'Inter', 'Helvetica Neue', 'Arial', system-ui, sans-serif",
  "sans-geometric": "'Poppins', 'Avenir Next', 'Futura', system-ui, sans-serif",
  rounded: "'Nunito', 'Quicksand', ui-rounded, system-ui, sans-serif",
  "serif-editorial": "'Charter', 'Iowan Old Style', 'Georgia', ui-serif, serif",
  "serif-modern": "'Playfair Display', 'Didot', 'Times New Roman', serif",
  slab: "'Roboto Slab', 'Zilla Slab', 'Rockwell', ui-serif, serif",
  mono: "ui-monospace, 'Cascadia Code', 'JetBrains Mono', monospace",
};

/**
 * The pairings whose controls stay on the system sans. A serif or slab theme
 * sets its voice in the headings and the prose; putting the same face inside a
 * 32px-tall select is where "themed" starts to read as "broken". `mono` is
 * deliberately NOT in this list — a terminal theme means the controls too.
 *
 * `--font-ui` is not classified by `axesFromCss` (the pairing axis is read off
 * heading + body), so this choice is free of the round trip. It is stated here
 * rather than left implicit because it is the one place the three role tokens
 * disagree.
 */
export const SYSTEM_UI_PAIRINGS: ReadonlySet<string> = new Set([
  "serif-editorial",
  "serif-modern",
  "slab",
]);

/** `--heading-weight`, per voice class. Each sits inside its `HEADING_WEIGHT_MAX` band. */
export const HEADING_WEIGHTS: Record<Axis<"type.voice.weight">, string> = {
  regular: "var(--weight-normal)",
  medium: "var(--weight-medium)",
  semibold: "var(--weight-semibold)",
  bold: "var(--weight-bold)",
  // The ladder stops at 700, so `black` is the one voice with no token to name.
  black: "800",
};

/**
 * `--heading-tracking`, per voice class, in `em` so it composes inside the
 * `calc()` a heading already uses for its own optical tightening (1.1A-01).
 * `tight`/`wide` clear `HEADING_TRACKING_EM` by a factor of four, so rounding
 * in a browser's computed value can never move a theme across the band.
 */
export const HEADING_TRACKINGS: Record<Axis<"type.voice.tracking">, string> = {
  tight: "-0.02em",
  normal: "0em",
  wide: "0.04em",
};

/** Round a rem length the way the ramp is authored: 4 decimals, no trailing zeros. */
function rem(px: number): string {
  const value = Number((px / ROOT_FONT_PX).toFixed(4));
  return `${value}rem`;
}

/**
 * The `--text-*` ramp: `--text-base` is the seed's base size and every other
 * step is one power of the ratio away from it, so the classifier's median
 * consecutive ratio is the seed's ratio exactly.
 */
export function typeRamp(base: number, ratio: number): Declaration[] {
  const baseIndex = TEXT_STEPS.indexOf("text-base");
  return TEXT_STEPS.map((step, index) => [
    step,
    rem(base * ratio ** (index - baseIndex)),
  ] as const);
}

export function typeFamily(seed: NormalizedSeed): Declaration[] {
  const stack = PAIRING_STACKS[seed.type.pairing];
  const ui = SYSTEM_UI_PAIRINGS.has(seed.type.pairing) ? PAIRING_STACKS.system : stack;
  return [
    ["font-heading", stack],
    ["font-body", stack],
    ["font-ui", ui],
    ...typeRamp(seed.type.base, seed.type.scale),
    ["heading-weight", HEADING_WEIGHTS[seed.type.voice.weight]],
    ["heading-tracking", HEADING_TRACKINGS[seed.type.voice.tracking]],
    ...headingCase(seed.type.voice.transform),
  ];
}

/**
 * One axis, two tokens [1.1A-25]. `small-caps` is in the frozen 1.1A-07
 * vocabulary but is not a `text-transform` value — it is `font-variant-caps` —
 * so it is spelled on `--heading-caps`, which every heading that reads
 * `--heading-transform` reads beside it. `none` and `uppercase` leave
 * `--heading-caps` at its `normal` default rather than restating it, so the
 * themes generated before the token existed regenerate byte for byte.
 */
export function headingCase(transform: Axis<"type.voice.transform">): Declaration[] {
  return transform === "small-caps"
    ? [["heading-transform", "none"], ["heading-caps", "small-caps"]]
    : [["heading-transform", transform]];
}

// ── Shape ───────────────────────────────────────────────────────────────────

/**
 * The five-step radius ramp per `shape.radius`, in px so the bands in
 * `axes.ts` are readable beside them. `--radius-md` is the step the classifier
 * reads: 0 is `sharp`, ≤ `RADIUS_CRISP_MAX_PX` is `crisp`,
 * ≤ `RADIUS_SOFT_MAX_PX` is `soft`, above it `round`.
 *
 * `crisp`/`soft`/`round` reproduce the 1.0 `--radius sm|md|lg` ramps exactly,
 * which is what keeps a legacy input's output byte-identical.
 *
 * `pill` shares the `round` ramp: no ramp value expresses a pill, because the
 * classifier reads that axis off `--button-radius` alone (see `PILL_COUPLING`).
 */
export const RADIUS_RAMPS: Record<Axis<"shape.radius">, number[]> = {
  sharp: [0, 0, 0, 0, 0],
  crisp: [2, 4, 6, 8, 12],
  soft: [4, 6, 8, 12, 16],
  round: [6, 10, 14, 20, 28],
  pill: [6, 10, 14, 20, 28],
};

const RADIUS_STEPS = ["radius-sm", "radius-md", "radius-lg", "radius-xl", "radius-2xl"] as const;

/**
 * The edge weights per `shape.border`. `--border-width` is the role the
 * classifier reads; `--border-width-strong` is the emphasis role that has to
 * move with it, or a `heavy` theme's thick rules would be thinner than its
 * ordinary ones.
 */
export const BORDER_ROLES: Record<Axis<"shape.border">, [string, string]> = {
  // ≤ BORDER_HAIRLINE_MAX_PX (1px).
  hairline: ["var(--border-width-sm)", "var(--border-width-md)"],
  // ≤ BORDER_REGULAR_MAX_PX (2px).
  regular: ["var(--border-width-md)", "var(--border-width-lg)"],
  // Above it. The ladder stops at `lg`, so emphasis is one more step of it.
  heavy: ["var(--border-width-lg)", "calc(var(--border-width-lg) + var(--border-width-sm))"],
};

export function shapeFamily(seed: NormalizedSeed): Declaration[] {
  const ramp = RADIUS_RAMPS[seed.shape.radius];
  const [width, strong] = BORDER_ROLES[seed.shape.border];
  return [
    ...RADIUS_STEPS.map((step, index) => [step, ramp[index] === 0 ? "0" : rem(ramp[index])] as const),
    // `--radius-full` is deliberately NOT part of the ramp: it is the pill
    // primitive, not a step, and squaring it would take the switch's default
    // pill and the badge's capsule away from every `sharp` theme — including
    // ones that asked for a pill switch. A theme squares those through the
    // `controls` axis, which is where that decision belongs.
    ["border-width", width],
    ["border-width-strong", strong],
    ["corner-shape", seed.shape.corner],
  ];
}

// ── Depth ───────────────────────────────────────────────────────────────────

/** `oklch(var(--shadow-color) / a)` — the tintable channel 1.1A-04 published. */
function shadow(alpha: number): string {
  return `oklch(var(--shadow-color) / ${alpha})`;
}

/**
 * The five-step shadow ramp per `depth`, per scheme.
 *
 * Depth is the one family with a scheme of its own: a shadow is not a colour,
 * so `light-dark()` cannot collapse it (1.1A-06), and a dark page needs a much
 * heavier alpha than a light one to show the same lift. The `light` and `dark`
 * ramps therefore differ in ALPHA, never in geometry — the classifier reads
 * `--shadow-md`'s first layer, so a theme that changed its silhouette between
 * schemes would derive two different depth axes.
 *
 * `soft` reproduces the 1.0 generator's two ramps declaration for declaration:
 * it is what `depth` meant before there was an axis to name it.
 */
export const SHADOW_RAMPS: Record<Axis<"depth">, { light: string[]; dark: string[] }> = {
  // Every step `none`: checked before `glass`, because a theme that has removed
  // its shadows has said something a backdrop filter does not undo.
  flat: {
    light: ["none", "none", "none", "none", "none"],
    dark: ["none", "none", "none", "none", "none"],
  },
  soft: {
    light: [
      `0 1px 2px ${shadow(0.04)}`,
      `0 1px 3px ${shadow(0.06)}, 0 1px 2px ${shadow(0.04)}`,
      `0 4px 6px ${shadow(0.06)}, 0 2px 4px ${shadow(0.04)}`,
      `0 10px 15px ${shadow(0.08)}, 0 4px 6px ${shadow(0.05)}`,
      `0 20px 25px ${shadow(0.1)}, 0 8px 10px ${shadow(0.05)}`,
    ],
    dark: [
      "none",
      `0 1px 3px ${shadow(0.3)}`,
      `0 4px 6px ${shadow(0.3)}`,
      `0 10px 15px ${shadow(0.4)}`,
      `0 20px 25px ${shadow(0.5)}`,
    ],
  },
  // `--shadow-md`'s first layer blurs past DEPTH_LAYERED_MIN_BLUR_PX, and every
  // step carries three: a deep ambient layer, a contact layer, and a hairline.
  layered: {
    light: [
      `0 1px 2px ${shadow(0.06)}, 0 1px 1px ${shadow(0.04)}`,
      `0 4px 8px ${shadow(0.07)}, 0 2px 3px ${shadow(0.05)}, 0 1px 1px ${shadow(0.04)}`,
      `0 12px 20px ${shadow(0.09)}, 0 4px 8px ${shadow(0.06)}, 0 1px 2px ${shadow(0.04)}`,
      `0 24px 40px ${shadow(0.11)}, 0 8px 16px ${shadow(0.07)}, 0 2px 4px ${shadow(0.05)}`,
      `0 40px 64px ${shadow(0.14)}, 0 16px 28px ${shadow(0.09)}, 0 4px 8px ${shadow(0.05)}`,
    ],
    dark: [
      `0 1px 2px ${shadow(0.3)}, 0 1px 1px ${shadow(0.2)}`,
      `0 4px 8px ${shadow(0.35)}, 0 2px 3px ${shadow(0.25)}, 0 1px 1px ${shadow(0.2)}`,
      `0 12px 20px ${shadow(0.45)}, 0 4px 8px ${shadow(0.3)}, 0 1px 2px ${shadow(0.2)}`,
      `0 24px 40px ${shadow(0.55)}, 0 8px 16px ${shadow(0.35)}, 0 2px 4px ${shadow(0.25)}`,
      `0 40px 64px ${shadow(0.65)}, 0 16px 28px ${shadow(0.45)}, 0 4px 8px ${shadow(0.25)}`,
    ],
  },
  // Zero blur, real offset: the flat drop shadow a brutalist theme draws. Its
  // alpha is the same in both schemes because the mark is the shape, not the
  // depth — a theme moves it with one `--shadow-color` declaration.
  hard: {
    light: [
      `1px 1px 0 ${shadow(0.9)}`,
      `2px 2px 0 ${shadow(0.9)}`,
      `3px 3px 0 ${shadow(0.9)}`,
      `5px 5px 0 ${shadow(0.9)}`,
      `8px 8px 0 ${shadow(0.9)}`,
    ],
    dark: [
      `1px 1px 0 ${shadow(0.9)}`,
      `2px 2px 0 ${shadow(0.9)}`,
      `3px 3px 0 ${shadow(0.9)}`,
      `5px 5px 0 ${shadow(0.9)}`,
      `8px 8px 0 ${shadow(0.9)}`,
    ],
  },
  // A frosted theme still casts a shadow — the backdrop filter is what makes it
  // glass, and `--surface-backdrop` is where the classifier looks.
  glass: {
    light: [
      `0 1px 2px ${shadow(0.05)}`,
      `0 2px 6px ${shadow(0.07)}`,
      `0 6px 16px ${shadow(0.09)}`,
      `0 16px 32px ${shadow(0.12)}`,
      `0 28px 56px ${shadow(0.16)}`,
    ],
    dark: [
      `0 1px 2px ${shadow(0.25)}`,
      `0 2px 6px ${shadow(0.3)}`,
      `0 6px 16px ${shadow(0.4)}`,
      `0 16px 32px ${shadow(0.5)}`,
      `0 28px 56px ${shadow(0.6)}`,
    ],
  },
  // Pressed rather than raised. `inset` is checked before the blur bands, so
  // the geometry below is free to be whatever reads as a well.
  inset: {
    light: [
      `inset 0 1px 1px ${shadow(0.05)}`,
      `inset 0 1px 2px ${shadow(0.07)}`,
      `inset 0 2px 4px ${shadow(0.09)}`,
      `inset 0 3px 6px ${shadow(0.11)}`,
      `inset 0 4px 10px ${shadow(0.13)}`,
    ],
    dark: [
      `inset 0 1px 1px ${shadow(0.3)}`,
      `inset 0 1px 2px ${shadow(0.35)}`,
      `inset 0 2px 4px ${shadow(0.45)}`,
      `inset 0 3px 6px ${shadow(0.55)}`,
      `inset 0 4px 10px ${shadow(0.65)}`,
    ],
  },
};

const SHADOW_STEPS = ["shadow-xs", "shadow-sm", "shadow-md", "shadow-lg", "shadow-xl"] as const;

/** What a `glass` theme puts behind its floating surfaces. */
export const GLASS_BACKDROP = "blur(12px) saturate(140%)";
/**
 * …and how much of the surface below shows through. The fill goes on
 * `--card-bg`, not on `--color-surface-1`: the surface ramp is a CONTRAST-PAIR
 * background, and a translucent one has no context-free ratio — the gate
 * reports it rather than guessing a backdrop. A card is where a reader
 * actually sees the frost, and it is nobody's contrast pair.
 */
export const GLASS_SURFACE_ALPHA = 72;

/**
 * The channel a depth is cast in, when black is the wrong answer.
 *
 * `hard` is the one case: its shadow is a GRAPHIC MARK, not a suggestion of
 * lift, and a black mark on a dark page is no mark at all. Every other depth
 * is an ambient shadow, which is black in both schemes — a dark page shows it
 * by raising the alpha, which is what `SHADOW_RAMPS` does.
 */
export const SHADOW_COLORS: Partial<Record<Axis<"depth">, { light: string; dark: string }>> = {
  hard: { light: "0 0 0", dark: "1 0 0" },
};
/** Black, as bare OKLCH channels — what every other depth casts in. */
export const SHADOW_COLOR_DEFAULT = "0 0 0";

/**
 * The depth family, for one scheme. The only renderer that takes a second
 * argument, for the reason `SHADOW_RAMPS` states: its tokens are the one
 * family that cannot be written once and read by both schemes.
 */
export function depthFamily(seed: NormalizedSeed, scheme: "light" | "dark" = "light"): Declaration[] {
  const ramp = SHADOW_RAMPS[seed.depth][scheme];
  const out: Declaration[] = [
    // The channel every step above is cast in (1.1A-04). Emitted in BOTH
    // schemes: a dark block that omitted it would leave the five steps it does
    // write reading a channel from the light block.
    ["shadow-color", SHADOW_COLORS[seed.depth]?.[scheme] ?? SHADOW_COLOR_DEFAULT],
    ...SHADOW_STEPS.map((step, index) => [step, ramp[index]] as const),
  ];
  if (seed.depth === "glass") {
    out.push(
      ["surface-backdrop", GLASS_BACKDROP],
      ["card-bg", `color-mix(in oklab, var(--color-surface-1) ${GLASS_SURFACE_ALPHA}%, transparent)`],
    );
  }
  return out;
}

// ── Material ────────────────────────────────────────────────────────────────

/**
 * The page gets the texture, not the surfaces that sit on it: the classifier
 * asks `--texture-page` first for the same reason a reader notices it first,
 * and grain on the page AND on every card is two statements where the axis
 * makes one. `none` emits nothing — the role already is `none`, and a theme
 * that restates a default has overridden a token to say nothing.
 */
export function materialFamily(seed: NormalizedSeed): Declaration[] {
  return seed.material === "none" ? [] : [["texture-page", `var(--texture-${seed.material})`]];
}

// ── Motion ──────────────────────────────────────────────────────────────────

/** `[instant, fast, normal, slow, slower]` in ms, per motion personality. */
export const DURATION_RAMPS: Record<Axis<"motion">, number[]> = {
  // Not `prefers-reduced-motion` — that is the user's switch, and it still
  // applies on top. This is a theme that simply does not animate.
  none: [0, 0, 0, 0, 0],
  // `--duration-normal` at or under MOTION_MINIMAL_MAX_MS.
  minimal: [30, 60, 100, 140, 200],
  // Under MOTION_SNAPPY_MAX_MS, and on the theme's own `--ease-out`.
  snappy: [40, 80, 150, 200, 300],
  // The registry's own ramp.
  smooth: [50, 100, 200, 300, 500],
  // A spring wants room to overshoot and settle.
  springy: [50, 120, 240, 360, 560],
  playful: [60, 140, 280, 420, 640],
};

const DURATION_STEPS = [
  "duration-instant",
  "duration-fast",
  "duration-normal",
  "duration-slow",
  "duration-slower",
] as const;

/**
 * How far an interactive surface rises under the pointer, as a `translate`
 * value. `playful` clears MOTION_PLAYFUL_LIFT_MAX_PX, which is what separates
 * it from `springy`: the same curve, but the surface moves too.
 */
export const PLAYFUL_HOVER_LIFT = "0 -3px";

export function motionFamily(seed: NormalizedSeed): Declaration[] {
  const ramp = DURATION_RAMPS[seed.motion];
  const out: Declaration[] = DURATION_STEPS.map((step, index) => [step, `${ramp[index]}ms`] as const);
  if (seed.motion === "snappy") out.push(["ease-default", "var(--ease-out)"]);
  if (seed.motion === "springy" || seed.motion === "playful") {
    out.push(["ease-default", "var(--ease-spring)"]);
  }
  if (seed.motion === "playful") out.push(["motion-hover-lift", PLAYFUL_HOVER_LIFT]);
  return out;
}

/**
 * `density` is the one axis with no token to declare: `data-density` is a
 * subtree MODIFIER and `density.css` deliberately declares nothing at `:root`,
 * so a theme states the density it wants a page to start at in a header
 * directive — exactly as it narrows its schemes with `@ui:schemes`.
 */
export function densityDirective(seed: NormalizedSeed): string {
  return `/* @ui:density ${seed.density} */`;
}

// ── Focus ───────────────────────────────────────────────────────────────────

export function focusFamily(seed: NormalizedSeed): Declaration[] {
  const base: Declaration[] = [
    ["focus-ring-style", "solid"],
    ["focus-ring-color", "var(--color-ring)"],
  ];
  switch (seed.focus) {
    case "ring":
      return [["focus-ring-width", "2px"], ["focus-ring-offset", "2px"], ...base];
    case "bold":
      // FOCUS_BOLD_MIN_WIDTH_PX is the 1.1A-02 ladder's `--border-width-lg`.
      return [
        ["focus-ring-width", `${FOCUS_BOLD_MIN_WIDTH_PX}px`],
        ["focus-ring-offset", "2px"],
        ...base,
      ];
    case "inset":
      // A plain negative length, not `calc(-1 * …)`: the classifier reads a
      // length, and a browser-free gate cannot evaluate a calc().
      return [["focus-ring-width", "2px"], ["focus-ring-offset", "-2px"], ...base];
    case "glow":
      return [
        ["focus-ring-width", "2px"],
        ["focus-ring-offset", "2px"],
        ...base,
        ["focus-shadow", "0 0 0 4px var(--color-primary-subtle)"],
      ];
  }
}

// ── Decoration ──────────────────────────────────────────────────────────────

export function decorationFamily(seed: NormalizedSeed): Declaration[] {
  const link: Declaration[] =
    seed.decoration.link === "none"
      ? [["link-decoration", "none"]]
      : [
          ["link-decoration", "underline"],
          [
            "link-thickness",
            seed.decoration.link === "thick" ? `${LINK_THICK_MIN_PX}px` : "1px",
          ],
          [
            "link-underline-offset",
            // `plain` is an underline sitting ON the baseline, so its offset has
            // to read as under LINK_OFFSET_MIN_EM rather than be left unstated.
            seed.decoration.link === "plain" ? "0" : "0.2em",
          ],
        ];
  // A double rule needs its own width [1.1A-26]: `separator` draws at
  // `--divider-width`, which follows `--border-width` — a hairline in most
  // themes, and a 1px `double` paints one line. Any other style leaves the
  // width following the edge, so it is not restated.
  const width: Declaration[] =
    seed.decoration.divider === "double" ? [["divider-width", `${DIVIDER_DOUBLE_MIN_PX}px`]] : [];
  return [...link, ["divider-style", seed.decoration.divider], ...width];
}

// ── Controls ────────────────────────────────────────────────────────────────

/**
 * The button radius per silhouette. `soft` normally follows the shape ramp —
 * but under a `sharp` shape that ramp is `0`, which would derive `rect`, so a
 * soft button inside a sharp theme names its own radius. That combination is a
 * deliberate contrast, not a contradiction: square panels, rounded buttons.
 */
function buttonRadius(seed: NormalizedSeed): string {
  if (seed.controls.button === "rect") return "0";
  if (seed.controls.button === "pill") return "var(--radius-full)";
  return seed.shape.radius === "sharp" ? rem(RADIUS_RAMPS.crisp[1]) : "var(--radius-md)";
}

export function controlsFamily(seed: NormalizedSeed): Declaration[] {
  const out: Declaration[] = [
    ["button-radius", buttonRadius(seed)],
    // The three component radii the 1.0 generator has always stated. They track
    // the ramp, so they move with `shape.radius` and say nothing on their own.
    ["card-radius", "var(--radius-lg)"],
    ["input-radius", "var(--radius-md)"],
    ["dialog-radius", "var(--radius-xl)"],
    ["checkbox-radius", seed.controls.checkbox === "round" ? "var(--radius-full)" : "var(--radius-sm)"],
    ["switch-radius", seed.controls.switch === "pill" ? "var(--radius-full)" : "var(--radius-sm)"],
  ];
  switch (seed.controls.input) {
    case "box":
      out.push(["input-border-width", "var(--border-width)"], ["input-fill", "var(--input-bg)"]);
      break;
    case "filled":
      out.push(["input-border-width", "var(--border-width)"], ["input-fill", "var(--input-bg-filled)"]);
      break;
    case "underline":
      // Only a bottom rule. A four-value box shorthand, which is why
      // input/textarea/select declare `border-width` as a longhand rather than
      // through the `border:` shorthand — a shorthand's width slot takes one value.
      out.push(
        ["input-border-width", "0 0 var(--border-width) 0"],
        ["input-fill", "var(--input-bg)"],
      );
      break;
  }
  return out;
}

// ── The neutral tint, shared by the generator and the round-trip prediction ──

/** How a neutral ramp is tinted, in OKLCH. `null` is a true gray. */
export interface NeutralTint {
  c: number;
  h: number;
}

/**
 * A tint this weak is achromatic — the classifier's own line for `gray`. The
 * light end of a neutral ramp scales its chroma down hard (a page is near
 * white), and at the 1.0 scale factors the tint landed at 0.0015: BELOW this
 * line, so `--neutral cool` produced a page the classifier called gray, and
 * correctly so. Every tinted neutral is floored here instead, which is what
 * makes the axis a fact about the output rather than a label on the input.
 */
export const NEUTRAL_TINT_MIN_CHROMA = 0.008;

/** The named hue windows. `tinted` has none — it borrows the accent's. */
export const NEUTRAL_HUES: Record<"cool" | "warm", number> = { cool: 250, warm: 75 };
/** Base chroma of a tinted neutral before the per-step scale is applied. */
export const NEUTRAL_CHROMA = { cool: 0.015, warm: 0.015, tinted: 0.025 } as const;

/**
 * The tint a seed's neutral ramp is built from. `tinted` takes the ACCENT's own
 * hue — the only non-arbitrary choice, since the vocabulary carries no hue —
 * at a higher chroma than `cool`/`warm`, because "tinted" is a neutral you can
 * see the brand in.
 */
export function neutralTint(
  neutral: Axis<"neutral">,
  accentHue: number,
): NeutralTint | null {
  switch (neutral) {
    case "gray":
      return null;
    case "cool":
      return { c: NEUTRAL_CHROMA.cool, h: NEUTRAL_HUES.cool };
    case "warm":
      return { c: NEUTRAL_CHROMA.warm, h: NEUTRAL_HUES.warm };
    case "tinted":
      return { c: NEUTRAL_CHROMA.tinted, h: accentHue };
  }
}

/**
 * What `axesFromCss` will call a ramp built from `tint` — the SAME windows
 * `neutralAxis` uses, stated once here so the prediction and the classifier
 * cannot drift. A `tinted` seed whose accent already lives in the cool or warm
 * window lands on that name, which is the truth: a neutral tinted blue is a
 * cool neutral, and the vocabulary has no finer word for it.
 */
export function neutralAxisFor(tint: NeutralTint | null): Axis<"neutral"> {
  if (!tint || tint.c < NEUTRAL_GRAY_MAX_CHROMA) return "gray";
  if (tint.h >= NEUTRAL_COOL_HUE.min && tint.h <= NEUTRAL_COOL_HUE.max) return "cool";
  if (tint.h >= NEUTRAL_WARM_HUE.min && tint.h <= NEUTRAL_WARM_HUE.max) return "warm";
  return "tinted";
}

// ── The table, and the whole group ──────────────────────────────────────────

/**
 * Every axis of a seed, and which family renders it. `color` names the five
 * the accent pipeline in `theme-generate.ts` owns — the ramp, the neutral
 * surfaces, the scheme blocks, the contrast level and the document companion —
 * which is why they are listed rather than left out: an axis with no owner is
 * an axis nobody emits.
 */
export const AXIS_FAMILY = {
  accent: "color",
  neutral: "color",
  scheme: "color",
  contrast: "color",
  document: "color",
  type: "type",
  shape: "shape",
  depth: "depth",
  material: "material",
  motion: "motion",
  density: "density",
  focus: "focus",
  decoration: "decoration",
  controls: "controls",
} as const;

/** The token families, by name. `density` is absent: it renders a directive. */
export const THEME_FAMILIES: Record<string, (seed: NormalizedSeed) => Declaration[]> = {
  type: typeFamily,
  shape: shapeFamily,
  depth: depthFamily,
  material: materialFamily,
  motion: motionFamily,
  focus: focusFamily,
  decoration: decorationFamily,
  controls: controlsFamily,
};

/**
 * The families that render into the theme's one scheme-independent group, in a
 * stable order. `controls` comes after `shape` on purpose: a control's own
 * silhouette outranks the ramp it would otherwise inherit, which is how a
 * `sharp` theme can still have soft buttons.
 *
 * `depth` is absent because it is scheme-dependent — it renders beside the
 * colours, once per scheme, which is where the shadow ramp has always lived.
 */
export const FAMILY_ORDER = [
  "type",
  "shape",
  "material",
  "motion",
  "focus",
  "decoration",
  "controls",
] as const;

export function axisDeclarations(seed: NormalizedSeed): Declaration[] {
  return FAMILY_ORDER.flatMap((family) => THEME_FAMILIES[family](seed));
}

/** Re-exported so a renderer's threshold and its test read the same constant. */
export {
  BORDER_HAIRLINE_MAX_PX,
  BORDER_REGULAR_MAX_PX,
  DEPTH_LAYERED_MIN_BLUR_PX,
  DIVIDER_DOUBLE_MIN_PX,
  FOCUS_BOLD_MIN_WIDTH_PX,
  HEADING_TRACKING_EM,
  HEADING_WEIGHT_MAX,
  LINK_OFFSET_MIN_EM,
  LINK_THICK_MIN_PX,
  MOTION_MINIMAL_MAX_MS,
  MOTION_PLAYFUL_LIFT_MAX_PX,
  MOTION_SNAPPY_MAX_MS,
  PILL_MIN_PX,
  RADIUS_CRISP_MAX_PX,
  RADIUS_SOFT_MAX_PX,
};
