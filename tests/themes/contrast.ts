// ═══════════════════════════════════════════════════════════════════════════
// Manual oklch → WCAG contrast computation  [task 0.4-13]
// ═══════════════════════════════════════════════════════════════════════════
//
// Theme stylesheets author colors in oklch. To assert WCAG contrast ratios in
// CI (spot-checks here; the full `contrast` theme gate lands in 0.4-16) we need
// the oklch → linear-sRGB → relative-luminance pipeline done by hand — no
// browser, no color library.
//
// Pipeline (all reference math from the OKLab spec, CSS Color 4 §"OKLab"):
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

/**
 * Parse a CSS color value into linear sRGB. Supports the forms theme
 * stylesheets actually use: `oklch(L C H)`, `oklch(L C H / A)` (alpha is
 * ignored — contrast is defined over opaque colors, and themes must not put
 * translucent colors in fg/bg pairs), plus the `white`/`black` keywords.
 * Returns null for anything else (var() refs, gradients, shadow lists).
 */
export function parseCssColor(value: string): LinearRgb | null {
  const v = value.trim().toLowerCase();
  if (v === "white") return { r: 1, g: 1, b: 1 };
  if (v === "black") return { r: 0, g: 0, b: 0 };

  const m = /^oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+)(?:deg)?\s*(?:\/\s*[\d.]+%?\s*)?\)$/.exec(v);
  if (!m) return null;
  const L = m[1].endsWith("%") ? parseFloat(m[1]) / 100 : parseFloat(m[1]);
  return oklchToLinearRgb(L, parseFloat(m[2]), parseFloat(m[3]));
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
 * Parse a theme stylesheet into name → value maps per scheme. Same walk as
 * `parseThemeSchemes` (tests/themes/theme-coverage.ts) but it keeps the values,
 * and records every custom property (contrast checks may need non-color tokens
 * someday; filtering is the caller's job).
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
