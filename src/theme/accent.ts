// The runtime accent — `data-accent`, the fifth sanctioned token modifier
// (SPEC-1.0 §4, forecraft #9).
//
// `registry/tokens/accent.css` is the implementation; this module is its
// vocabulary as data, for the contrast gate and the tests. The CSS states each
// hue once and `tests/tokens/forecraft-accent.test.ts` holds the two equal, and
// holds `TOKEN_MODIFIERS` in `src/protocol.ts` to `ACCENT_VALUES`.
//
// Deliberately free of imports: the audit engine is bundled for the browser.

/** The attribute. */
export const ACCENT_ATTRIBUTE = "data-accent";

/** The custom property a `custom` accent reads its hue from (degrees or an angle). */
export const ACCENT_HUE_TOKEN = "--accent-hue";

/** The value that takes its hue from {@link ACCENT_HUE_TOKEN} instead of naming one. */
export const ACCENT_CUSTOM = "custom";

/**
 * The named hues, name → OKLCH hue in degrees, in hue order.
 *
 * Chosen by measurement, not taste. Seventeen candidates — the conventional hue
 * names, each at the hue of the Tailwind CSS v4 palette's 500 step, rounded to
 * the degree — were re-hued into every shipped theme, light and dark, and run
 * through every pair the `contrast-tokens` gate checks, under both gamut models
 * (per-channel clipping, which the gate uses, and chroma reduction at constant
 * lightness, which CSS Color 4 specifies). The first round kept four, violet to
 * pink; a retune of the four themes that bound the rest (neumorph, memphis,
 * aurora and paper — a darker light-scheme primary, by 0.005–0.013 OKLCH
 * lightness) admitted rose, red, orange, blue and indigo, each clearing the
 * muted plate by at least the 4.59:1 the first four did. Both rounds' numbers,
 * and the hues still out, are in `tests/tokens/forecraft-accent.test.ts`.
 * Adding a hue is additive under SPEC-1.0 §8.2 — and has to clear that same
 * test. Removing one is not.
 */
export const ACCENT_HUES: Readonly<Record<string, number>> = Object.freeze({
  rose: 16,
  red: 25,
  orange: 48,
  blue: 260,
  indigo: 277,
  violet: 293,
  purple: 304,
  fuchsia: 322,
  pink: 354,
});

/** The complete value vocabulary, as SPEC-1.0 §4 lists it: the named hues, then `custom`. */
export const ACCENT_VALUES: readonly string[] = Object.freeze([...Object.keys(ACCENT_HUES), ACCENT_CUSTOM]);
