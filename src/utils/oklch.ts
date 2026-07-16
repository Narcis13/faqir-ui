// ═══════════════════════════════════════════════════════════════════════════
// oklch → WCAG contrast, and token-graph resolution  [tasks 0.4-13, 0.4-16]
// ═══════════════════════════════════════════════════════════════════════════
//
// Theme stylesheets author colors in oklch. To compute WCAG contrast ratios
// without a browser or color library we do the oklch → linear-sRGB →
// relative-luminance pipeline by hand. This is the shared util behind both the
// theme spot-checks (0.4-13) and the `contrast-tokens` audit rule (0.4-16).
//
// Pipeline (reference math from the OKLab spec, CSS Color 4 §"OKLab"):
//   oklch(L C H) → OKLab (a = C·cos H, b = C·sin H)
//              → LMS (linear map, then cube)
//              → linear sRGB (linear map)
//              → WCAG relative luminance Y = 0.2126R + 0.7152G + 0.0722B
//   contrast = (Y_lighter + 0.05) / (Y_darker + 0.05)
//
// WCAG defines luminance over decoded (i.e. linear) sRGB channels, so we use
// the linear values directly. Out-of-gamut results are clamped per channel —
// theme colors should be in-gamut anyway; the clamp only guards rounding spill.

/** A color as linear-light sRGB channels in [0, 1]. */
export interface LinearRgb {
  r: number;
  g: number;
  b: number;
}

/** A normalized OKLCH color. Lightness is [0, 1], chroma is non-negative, hue is [0, 360). */
export interface OklchColor {
  l: number;
  c: number;
  h: number;
}

/** oklch(L C H) → linear sRGB, channels clamped to [0, 1]. H in degrees. */
export function oklchToLinearRgb(L: number, C: number, H: number): LinearRgb {
  const hRad = (H * Math.PI) / 180;
  const a = C * Math.cos(hRad);
  const b = C * Math.sin(hRad);

  // OKLab → non-linear LMS (inverse of the M2 matrix), then cube.
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;

  // LMS → linear sRGB (inverse of the M1·sRGB matrix).
  const clamp = (x: number) => Math.min(1, Math.max(0, x));
  return {
    r: clamp(+4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: clamp(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: clamp(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  };
}

/** WCAG relative luminance of a linear sRGB color. */
export function relativeLuminance(rgb: LinearRgb): number {
  return 0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b;
}

// Matches `oklch(L C H)` / `oklch(L C H / A)`, L as a number or percentage,
// an optional `deg` on the hue, and an optional alpha. Shared by the parse and
// alpha helpers so both agree on exactly which forms count as an oklch color.
const NUMBER = "[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)";
const OKLCH_RE = new RegExp(
  `^oklch\\(\\s*(${NUMBER}%?)\\s+(${NUMBER})\\s+(${NUMBER})(?:deg)?\\s*` +
    `(?:\\/\\s*(${NUMBER}%?)\\s*)?\\)$`,
);
const HEX_RE = /^#([\da-f]{3}|[\da-f]{6})$/i;

function normalizeHue(hue: number): number {
  return ((hue % 360) + 360) % 360;
}

/** Parse an `oklch()` string without converting it through clamped sRGB. */
export function parseOklch(value: string): OklchColor | null {
  const m = OKLCH_RE.exec(value.trim().toLowerCase());
  if (!m) return null;

  const l = m[1].endsWith("%") ? parseFloat(m[1]) / 100 : parseFloat(m[1]);
  const c = parseFloat(m[2]);
  const h = parseFloat(m[3]);
  const alpha = m[4] == null
    ? 1
    : m[4].endsWith("%")
      ? parseFloat(m[4]) / 100
      : parseFloat(m[4]);

  if (![l, c, h, alpha].every(Number.isFinite)) return null;
  if (l < 0 || l > 1 || c < 0 || alpha < 0 || alpha > 1) return null;
  return { l, c, h: normalizeHue(h) };
}

/** Parse `#rgb` / `#rrggbb` into linear-light sRGB. */
export function parseHexColor(value: string): LinearRgb | null {
  const m = HEX_RE.exec(value.trim());
  if (!m) return null;
  const full = m[1].length === 3
    ? [...m[1]].map((digit) => digit + digit).join("")
    : m[1];
  const decode = (offset: number) => {
    const encoded = parseInt(full.slice(offset, offset + 2), 16) / 255;
    return encoded <= 0.04045
      ? encoded / 12.92
      : ((encoded + 0.055) / 1.055) ** 2.4;
  };
  return { r: decode(0), g: decode(2), b: decode(4) };
}

/** Linear-light sRGB → OKLCH. Useful for turning hex brand colors into ramp seeds. */
export function linearRgbToOklch(rgb: LinearRgb): OklchColor {
  const l = Math.cbrt(0.4122214708 * rgb.r + 0.5363325363 * rgb.g + 0.0514459929 * rgb.b);
  const m = Math.cbrt(0.2119034982 * rgb.r + 0.6806995451 * rgb.g + 0.1073969566 * rgb.b);
  const s = Math.cbrt(0.0883024619 * rgb.r + 0.2817188376 * rgb.g + 0.6299787005 * rgb.b);

  const lightness = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const b = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const chroma = Math.sqrt(a * a + b * b);
  const hue = chroma < 1e-7 ? 0 : normalizeHue((Math.atan2(b, a) * 180) / Math.PI);

  return { l: lightness, c: chroma, h: hue };
}

/**
 * Parse a supported brand-color input into OKLCH. The generator deliberately
 * accepts portable, deterministic syntaxes only: `oklch()`, `#rgb`, `#rrggbb`,
 * plus black/white. Browser-dependent named-color tables are not consulted.
 */
export function cssColorToOklch(value: string): OklchColor | null {
  const v = value.trim().toLowerCase();
  const parsed = parseOklch(v);
  if (parsed) {
    if (colorAlpha(v) !== 1) return null;
    return parsed;
  }
  if (v === "white") return { l: 1, c: 0, h: 0 };
  if (v === "black") return { l: 0, c: 0, h: 0 };
  const hex = parseHexColor(v);
  return hex ? linearRgbToOklch(hex) : null;
}

/**
 * Parse a CSS color value into linear sRGB. Supports the forms theme
 * stylesheets and brand inputs use: `oklch(L C H)`, `oklch(L C H / A)` (alpha
 * is ignored here — callers can inspect it with `colorAlpha`), `#rgb`,
 * `#rrggbb`, and the `white`/`black` keywords. Returns null for anything else
 * (var() refs, gradients, shadow lists).
 */
export function parseCssColor(value: string): LinearRgb | null {
  const v = value.trim().toLowerCase();
  if (v === "white") return { r: 1, g: 1, b: 1 };
  if (v === "black") return { r: 0, g: 0, b: 0 };

  const hex = parseHexColor(v);
  if (hex) return hex;

  const parsed = parseOklch(v);
  if (!parsed) return null;
  return oklchToLinearRgb(parsed.l, parsed.c, parsed.h);
}

/**
 * Alpha of a CSS color string in [0, 1]. `white`/`black` and alpha-less oklch
 * are opaque (1). `oklch(… / A)` returns A (a `%` alpha is divided by 100).
 * Returns null for values that aren't a recognized solid color (var()/gradient),
 * so callers can tell "opaque" apart from "not a color".
 */
export function colorAlpha(value: string): number | null {
  const v = value.trim().toLowerCase();
  if (v === "white" || v === "black" || HEX_RE.test(v)) return 1;
  const m = OKLCH_RE.exec(v);
  if (!m) return null;
  if (m[4] == null) return 1;
  return m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
}

/** True iff `value` is a fully-opaque solid color (alpha === 1). */
export function isOpaqueColor(value: string): boolean {
  return colorAlpha(value) === 1;
}

/** WCAG contrast ratio between two colors, always ≥ 1 (order-independent). */
export function contrastRatio(c1: LinearRgb, c2: LinearRgb): number {
  const y1 = relativeLuminance(c1);
  const y2 = relativeLuminance(c2);
  const [darker, lighter] = y1 < y2 ? [y1, y2] : [y2, y1];
  return (lighter + 0.05) / (darker + 0.05);
}

/** Convenience: contrast ratio straight from two CSS color strings. Throws on unparseable values. */
export function contrastOf(cssColor1: string, cssColor2: string): number {
  const c1 = parseCssColor(cssColor1);
  const c2 = parseCssColor(cssColor2);
  if (!c1) throw new Error(`Unparseable color: ${cssColor1}`);
  if (!c2) throw new Error(`Unparseable color: ${cssColor2}`);
  return contrastRatio(c1, c2);
}

// ── Per-scheme token VALUES (the coverage model only tracks names) ──────────

/** Token name → raw CSS value, per scheme block. Last declaration wins. */
export interface SchemeValues {
  light: Map<string, string>;
  dark: Map<string, string>;
  auto: Map<string, string>;
}

/**
 * Parse a theme/token stylesheet into name → value maps per scheme. It keeps
 * the values (unlike the coverage model, which only tracks names) and records
 * every custom property, so callers can resolve non-color tokens along a chain;
 * filtering to colors is the caller's job.
 *
 * Scheme assignment mirrors the cascade themes rely on: `:root` is the light
 * (default) scheme, `[data-theme="dark"]` is dark, and a `[data-theme="auto"]`
 * block inside `@media (prefers-color-scheme: dark)` is auto.
 */
export function parseThemeValues(css: string): SchemeValues {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const light = new Map<string, string>();
  const dark = new Map<string, string>();
  const auto = new Map<string, string>();
  const stack: string[] = [];
  let buf = "";

  const inDarkMedia = () =>
    stack.some((h) => /@media[^{]*prefers-color-scheme\s*:\s*dark/i.test(h));

  const record = (decl: string) => {
    const m = /^\s*--([a-zA-Z][\w-]*)\s*:\s*(.+?)\s*$/s.exec(decl);
    if (!m) return;
    const selector = stack[stack.length - 1] ?? "";
    if (inDarkMedia() && /\[data-theme\s*=\s*["']?auto["']?\s*\]/.test(selector)) {
      auto.set(m[1], m[2]);
    } else if (/\[data-theme\s*=\s*["']?dark["']?\s*\]/.test(selector)) {
      dark.set(m[1], m[2]);
    } else if (/(^|\s):root(\s|$)/.test(selector)) {
      light.set(m[1], m[2]);
    }
  };

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === "{") {
      stack.push(buf.trim());
      buf = "";
    } else if (c === "}") {
      if (buf.trim()) record(buf);
      buf = "";
      stack.pop();
    } else if (c === ";") {
      record(buf);
      buf = "";
    } else {
      buf += c;
    }
  }

  return { light, dark, auto };
}

// ── Token-graph resolution (alias → semantic → palette) ─────────────────────
//
// Theme colors are authored two ways: a raw `oklch(…)` value, or a `var(--x)`
// indirection into another token that itself may be a `var(--y)` — the base
// registry chains component alias → semantic → palette before hitting a literal.
// To compute contrast on a declared pair we must first resolve each side to a
// concrete color string, following those var() hops within a single scheme.

const VAR_RE = /^var\(\s*(--[\w-]+)\s*(?:,\s*([\s\S]+))?\)$/;

/**
 * Flatten ordered layers into one name → value lookup, earlier layers winning.
 * Used to model the scheme cascade (theme override beats base default) as a
 * single map before resolution.
 */
export function flattenLayers(layers: Array<Map<string, string>>): Map<string, string> {
  const out = new Map<string, string>();
  for (let i = layers.length - 1; i >= 0; i--) {
    for (const [k, v] of layers[i]) out.set(k, v);
  }
  return out;
}

/**
 * Resolve a CSS value to a concrete solid-color string within a single scheme's
 * `lookup` (name → raw value, no leading `--`), following `var()` indirection
 * through the token graph. Honors a `var(--x, fallback)` fallback when `--x` is
 * undefined or itself dead-ends. Returns the literal color string (e.g.
 * `oklch(0.55 0.22 264)` / `white`) or null when the chain dead-ends at an
 * undefined token or a non-color value (gradient, keyword we don't model).
 *
 * Cycle-safe: a token already on the current resolution path is not re-entered.
 */
export function resolveColorString(
  value: string,
  lookup: Map<string, string>,
  seen: Set<string> = new Set(),
): string | null {
  const v = value.trim();

  // A literal color (opaque or translucent) terminates the chain.
  if (colorAlpha(v) != null) return v;

  const m = VAR_RE.exec(v);
  if (!m) return null;
  const name = m[1].slice(2); // strip leading `--`
  const fallback = m[2];

  if (!seen.has(name) && lookup.has(name)) {
    const next = new Set(seen);
    next.add(name);
    const resolved = resolveColorString(lookup.get(name)!, lookup, next);
    if (resolved) return resolved;
  }

  // Undefined token or a chain that dead-ended: try the inline fallback.
  if (fallback != null) return resolveColorString(fallback, lookup, seen);
  return null;
}
