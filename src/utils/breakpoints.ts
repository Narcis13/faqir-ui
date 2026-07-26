// The breakpoint canon (task 0.8-01, FAQIR-NEXT §19, FAQIR-SPEC §15).
//
// ONE responsive ladder for the whole framework. Before this module the registry
// shipped three incompatible ones: `grid` used viewport *ranges*
// (`max-width: 640px` / `min-width: 641px and max-width: 1024px`), `table` used
// container thresholds at 30rem/48rem/64rem where `sm` meant 480px rather than
// grid's 640px, and `surface` hardcoded 640/768/1024/1280/1400 max-widths. The
// ranges were not merely inconsistent, they were *wrong*: at a fractional
// viewport width of 640.5px neither `max-width: 640px` nor `min-width: 641px`
// matches, so a 12-column grid rendered twelve columns on a phone.
//
// The canon is therefore min-width-only and mobile-first. A tier names the
// **floor** of a range that never ends, so consecutive tiers can never leave a
// gap and no author has to reason about ±1px arithmetic.
//
// Why a TypeScript module and not a token: media and container queries cannot
// read custom properties — `@media (min-width: var(--bp-md))` is invalid CSS in
// every engine. The numbers must therefore be literal in the CSS, which means
// the only way to keep the registry, the generators, the tests and the audit
// agreeing on them is a single exported constant that all four read. The spec
// carries the same table in prose and a drift test (tests/utils/breakpoints.test.ts)
// re-parses it, so documentation and code cannot diverge silently.
//
// Deliberately dependency-free and free of `node:*` imports: the audit bundles
// for the browser (src/audit/browser.ts), and the layout rules of 0.8-10 read
// this canon.

/** The four canon tiers, mobile-first, in ascending order. */
export const TIERS = ["sm", "md", "lg", "xl"] as const;

/** A canon breakpoint tier name. */
export type Tier = (typeof TIERS)[number];

/**
 * Root font size the px column of the canon assumes. The ladder is authored in
 * `rem` so it scales with a user's browser font-size preference; the px values
 * are the equivalent at the browser default and exist for documentation, tests
 * and tooling — never as the authored unit.
 */
export const ROOT_FONT_SIZE_PX = 16;

/** One rung of the ladder. */
export interface Breakpoint {
  /** Tier name, as used in the `data-<attr>-<tier>` grammar. */
  tier: Tier;
  /** Authored value — the unit that appears in CSS. */
  rem: number;
  /** Equivalent at a 16px root, for docs and tooling. Never the authored unit. */
  px: number;
}

/**
 * **The canon.** Every responsive threshold in Faqir is one of these four
 * numbers, applied as a `min-width` floor.
 *
 * | Tier | rem | px  |
 * |------|-----|-----|
 * | `sm` | 40  | 640 |
 * | `md` | 48  | 768 |
 * | `lg` | 64  | 1024|
 * | `xl` | 80  | 1280|
 */
export const BREAKPOINTS: Readonly<Record<Tier, Breakpoint>> = Object.freeze({
  sm: Object.freeze({ tier: "sm", rem: 40, px: 640 }),
  md: Object.freeze({ tier: "md", rem: 48, px: 768 }),
  lg: Object.freeze({ tier: "lg", rem: 64, px: 1024 }),
  xl: Object.freeze({ tier: "xl", rem: 80, px: 1280 }),
}) as Readonly<Record<Tier, Breakpoint>>;

/** The canon as an ascending array — the order tiers must appear in CSS. */
export const BREAKPOINT_LIST: readonly Breakpoint[] = Object.freeze(
  TIERS.map((tier) => BREAKPOINTS[tier]),
);

/**
 * The five protocol attributes (FAQIR-NEXT §3 P1). Frozen — and excluded from
 * the responsive grammar below. `data-size-md` would be a sixth attribute in all
 * but name, and `data-state` is owned by controllers at runtime, not by CSS
 * thresholds.
 */
export const PROTOCOL_ATTRIBUTES = Object.freeze([
  "data-ui",
  "data-part",
  "data-state",
  "data-variant",
  "data-size",
] as const);

/** `true` if `name` is one of the five frozen protocol attributes. */
export function isProtocolAttribute(name: string): boolean {
  return (PROTOCOL_ATTRIBUTES as readonly string[]).includes(normalizeAttribute(name));
}

/** `true` if `value` names a canon tier. */
export function isTier(value: string): value is Tier {
  return (TIERS as readonly string[]).includes(value);
}

/** `data-cols` ↔ `cols`: accept either spelling, return the `data-` form. */
function normalizeAttribute(attr: string): string {
  return attr.startsWith("data-") ? attr : `data-${attr}`;
}

/**
 * The canon condition for a tier — `"min-width: 48rem"`.
 * Always `min-width`, always `rem`: a `max-width` query is off-canon by
 * construction (it is what produced grid's dead zone).
 */
export function minWidth(tier: Tier): string {
  return `min-width: ${BREAKPOINTS[tier].rem}rem`;
}

/**
 * A page-level viewport query — `"@media (min-width: 48rem)"`. Last resort in
 * the doctrine hierarchy: only patterns and scaffolds, which own the page, may
 * ask about the viewport.
 */
export function mediaQuery(tier: Tier): string {
  return `@media (${minWidth(tier)})`;
}

/**
 * A container query — `"@container faqir-table (min-width: 48rem)"`, or the
 * unnamed `"@container (min-width: 48rem)"` when no container name is given.
 * The preferred mechanism for components: a component responds to the space it
 * was actually given, so it is correct inside a sidebar as well as full-bleed.
 */
export function containerQuery(tier: Tier, container?: string): string {
  const name = container ? `${container} ` : "";
  return `@container ${name}(${minWidth(tier)})`;
}

/**
 * The responsive attribute grammar: `data-<attr>-<tier>` means "this value from
 * that tier up". Component attributes only — passing a protocol attribute
 * throws, because the protocol is frozen (P1).
 *
 * ```ts
 * responsiveAttribute("cols", "md"); // "data-cols-md"
 * ```
 */
export function responsiveAttribute(attr: string, tier: Tier): string {
  const base = normalizeAttribute(attr);
  if (isProtocolAttribute(base)) {
    throw new Error(
      `${base} is a protocol attribute; the responsive grammar applies to component attributes only (FAQIR-NEXT §3 P1)`,
    );
  }
  if (!isTier(tier)) {
    throw new Error(`${tier} is not a canon tier (${TIERS.join(", ")})`);
  }
  return `${base}-${tier}`;
}

/** A parsed `data-<attr>-<tier>` attribute name. */
export interface ResponsiveAttribute {
  /** The base attribute, `data-` prefixed — e.g. `data-cols`. */
  base: string;
  /** The tier the value applies from. */
  tier: Tier;
}

/**
 * Inverse of {@link responsiveAttribute}. Returns `null` for anything that is
 * not a responsive component attribute — an unsuffixed name, an unknown tier
 * suffix (`data-cols-xs`), or a suffixed *protocol* attribute (`data-size-md`),
 * which the grammar does not reach and 0.8-10 flags.
 */
export function parseResponsiveAttribute(name: string): ResponsiveAttribute | null {
  const dash = name.lastIndexOf("-");
  if (dash <= 0) return null;
  const suffix = name.slice(dash + 1);
  if (!isTier(suffix)) return null;
  const base = name.slice(0, dash);
  if (!base.startsWith("data-") || base === "data") return null;
  if (isProtocolAttribute(base)) return null;
  return { base, tier: suffix };
}
