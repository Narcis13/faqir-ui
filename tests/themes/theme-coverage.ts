// ═══════════════════════════════════════════════════════════════════════════
// Theme coverage model  [task 0.3-11]
// ═══════════════════════════════════════════════════════════════════════════
//
// A theme must define values for every semantic color token and every shadow
// token in each color scheme it ships. Light values come from the shared base
// (tokens/semantic.css + tokens/effects.css) that every theme builds on; a dark
// scheme cannot inherit those (the base :root holds the *light* values), so each
// dark block must redefine all of them or the token renders with its light value
// in dark mode.
//
// Everything here is derived by parsing CSS — the required-token list comes from
// semantic.css/effects.css and the per-scheme coverage comes from the theme file.
// Nothing is hand-maintained, so adding a sixth theme (or a 28th token) needs no
// edits here.

import { extractTokenDefinitions } from "../../src/parser/css-parser";

/** The color schemes a theme can ship, addressed by the DOM that activates them. */
export type Scheme = "light" | "dark" | "auto";

/** Token names (without the leading `--`) defined in each scheme's blocks. */
export interface SchemeTokens {
  /** `:root` blocks (the theme's light overrides; base fills the rest). */
  light: Set<string>;
  /** `[data-theme="dark"]` blocks. */
  dark: Set<string>;
  /** `@media (prefers-color-scheme: dark) [data-theme="auto"]` blocks. */
  auto: Set<string>;
}

/** Strip `/* … *\/` block comments so selectors/values parse cleanly. */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

/**
 * Parse a theme stylesheet into the set of custom properties it defines in each
 * scheme. Walks the source with brace matching so declarations are attributed to
 * their enclosing selector (and any enclosing `@media`), rather than by line.
 */
export function parseThemeSchemes(css: string): SchemeTokens {
  const src = stripComments(css);
  const light = new Set<string>();
  const dark = new Set<string>();
  const auto = new Set<string>();
  const stack: string[] = []; // enclosing selector / at-rule preludes, outermost first
  let buf = "";

  const inDarkMedia = () =>
    stack.some(h => /@media[^{]*prefers-color-scheme\s*:\s*dark/i.test(h));

  const record = (decl: string) => {
    const m = /^\s*--([a-zA-Z][\w-]*)\s*:\s*(.+?)\s*$/s.exec(decl);
    if (!m) return;
    const name = m[1];
    if (!name.startsWith("color-") && !name.startsWith("shadow-")) return;
    const selector = stack[stack.length - 1] ?? "";
    if (inDarkMedia() && /\[data-theme\s*=\s*["']?auto["']?\s*\]/.test(selector)) {
      auto.add(name);
    } else if (/\[data-theme\s*=\s*["']?dark["']?\s*\]/.test(selector)) {
      dark.add(name);
    } else if (/(^|\s):root(\s|$)/.test(selector)) {
      light.add(name);
    }
  };

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === "{") {
      stack.push(buf.trim());
      buf = "";
    } else if (c === "}") {
      if (buf.trim()) record(buf); // flush a final declaration with no trailing ;
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

/**
 * The required tokens every theme scheme must cover: the semantic color tokens
 * (from semantic.css) plus the shadow tokens (from effects.css). Parsed, never
 * hand-listed.
 */
export function requiredTokens(semanticCss: string, effectsCss: string): {
  colors: string[];
  shadows: string[];
  all: string[];
} {
  const colors = uniq(
    extractTokenDefinitions(semanticCss)
      .map(d => d.name)
      .filter(n => n.startsWith("color-")),
  );
  const shadows = uniq(
    extractTokenDefinitions(effectsCss)
      .map(d => d.name)
      .filter(n => n.startsWith("shadow-")),
  );
  return { colors, shadows, all: [...colors, ...shadows] };
}

function uniq(xs: string[]): string[] {
  return [...new Set(xs)];
}

/**
 * The schemes a theme declares it ships. Dual light+dark is the default; a theme
 * opts into a narrower set with a `@ui:schemes …` header directive, e.g.
 * `@ui:schemes light` for a single-scheme (light-only) theme. The directive is
 * read from the *raw* source (it lives in a comment).
 */
export function declaredSchemes(rawCss: string): Scheme[] {
  const m = /@ui:schemes\s+([a-z ,]+)/i.exec(rawCss);
  if (!m) return ["light", "dark"];
  const parsed = m[1]
    .toLowerCase()
    .split(/[\s,]+/)
    .filter((s): s is Scheme => s === "light" || s === "dark");
  return parsed.length ? parsed : ["light", "dark"];
}

/**
 * The coverage-relevant schemes a theme ships, derived from its manifest's
 * `scheme` field (task 0.4-12) — the source of truth for the matrix, replacing
 * the `@ui:schemes` CSS heuristic. `light` → light-only (no dark block allowed);
 * `dark`/`both` → dark (+ auto) required. Light always resolves through the base,
 * so every non-`light` value maps to a light+dark requirement.
 */
export function schemesFromManifest(scheme: "light" | "dark" | "both"): Scheme[] {
  return scheme === "light" ? ["light"] : ["light", "dark"];
}

/** Per-scheme coverage result: which required tokens are missing from a block. */
export interface Coverage {
  scheme: Scheme;
  /** DOM block the scheme resolves through, for messages. */
  block: string;
  missing: string[];
  covered: boolean;
}

/**
 * Compute coverage for one theme against the required token set.
 *
 * - **light** is satisfied by the shared base (semantic.css/effects.css) unioned
 *   with the theme's own `:root` overrides — so it passes as long as the base is
 *   complete. Base tokens are passed in as `baseTokens`.
 * - **dark** must be self-contained in the theme's `[data-theme="dark"]` block.
 * - **auto** (the system-preference mirror of dark) must match dark when the theme
 *   ships a dark scheme; a theme that declares dark must provide both blocks.
 *
 * A theme that does NOT declare a dark scheme must also carry no stray dark/auto
 * declarations (else its single-scheme claim is inconsistent).
 */
export function computeCoverage(
  themeCss: string,
  required: string[],
  baseTokens: Set<string>,
  declaredSchemesList?: Scheme[],
): Coverage[] {
  const schemes = parseThemeSchemes(themeCss);
  // Prefer explicitly declared schemes (from the theme manifest, task 0.4-12);
  // fall back to the `@ui:schemes` CSS heuristic when none are supplied.
  const declared = new Set(declaredSchemesList ?? declaredSchemes(themeCss));
  const results: Coverage[] = [];

  // Light: base ∪ theme :root overrides.
  const lightEffective = new Set<string>([...baseTokens, ...schemes.light]);
  results.push(coverageOf("light", ":root (+ base)", required, lightEffective));

  if (declared.has("dark")) {
    // Dark is self-contained — base holds light values, so it can't fill gaps here.
    results.push(coverageOf("dark", '[data-theme="dark"]', required, schemes.dark));
    // The system-preference mirror must be just as complete.
    results.push(
      coverageOf("auto", '@media (prefers-color-scheme: dark) [data-theme="auto"]', required, schemes.auto),
    );
  } else {
    // Single-scheme themes must not half-define a dark scheme.
    const stray = [...schemes.dark, ...schemes.auto];
    results.push({
      scheme: "dark",
      block: "(single-scheme: no dark block expected)",
      missing: stray, // any dark declaration is an inconsistency, surfaced as "missing" from the claim
      covered: stray.length === 0,
    });
  }

  return results;
}

function coverageOf(scheme: Scheme, block: string, required: string[], have: Set<string>): Coverage {
  const missing = required.filter(t => !have.has(t));
  return { scheme, block, missing, covered: missing.length === 0 };
}
