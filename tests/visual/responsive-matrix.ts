/**
 * The viewport axis of the visual/a11y matrices — task 0.8-11 (FAQIR-NEXT §19).
 *
 * The main matrix (`./matrix`) sweeps component × theme × scheme × direction at
 * ONE viewport. That proves colour and direction, but every responsive rule
 * shipped in phase 0.8 — grid 2.0's mobile-first ladder, the dashboard-shell
 * drawer, the inbox pane swap, auth-form's full bleed — is invisible to it. This
 * module adds the missing axis, deliberately narrow:
 *
 *     the layout-bearing set  ×  { 390, 768, 1280 }  ×  default · light · ltr
 *
 * **Why not the full cross-product.** ×12 themes ×2 schemes ×2 directions would
 * be 3 744 more captures for information the single-viewport matrix already
 * carries: a theme changes colours, a direction mirrors the axis, and neither
 * changes which `@media (min-width: …)` block matched. What only a second
 * viewport can show is *structure*, and structure is theme-independent.
 *
 * **The set is discovered, never listed.** A component is layout-bearing iff its
 * manifest says `category: "layout"` or `kind: "pattern"` — read from the same
 * manifests the docs, the skill and the bindings read. A new layout primitive or
 * a new pattern therefore enters this suite the moment it ships, with zero edits
 * here, exactly as it enters the main matrix by carrying an `@ui:component`
 * header. `responsive-matrix.test.ts` asserts that property directly.
 *
 * **Pre-assertions live here too**, as pure functions over a plain facts object
 * (`LayoutFacts`) gathered in the page. The 0.7-11 rule is that a screenshot
 * cannot go green on an inert attribute — so every capture first asks the
 * browser what it actually computed and checks it against the ladder the markup
 * authored. Keeping the check pure (and the gathering separate) means the
 * failure modes are unit-testable in `bun test` without a browser, and the
 * browser spec is a thin call site.
 *
 * Dependency-free beyond `node:fs`/`node:path` and the canon, like `./matrix`,
 * so it runs identically under Bun (the meta-test) and Node (Playwright).
 */

import { readFileSync, existsSync } from "node:fs";
import {
  discoverComponents,
  buildPageHtml,
  type Case,
  type Component,
} from "./matrix";
import { BREAKPOINTS, TIERS, type Tier } from "../../src/utils/breakpoints";

// ── the viewport axis ────────────────────────────────────────────────────────

/**
 * The three widths. Chosen so each one asks a different question of the canon:
 *
 * | px   | why |
 * | ---- | --- |
 * | 390  | an iPhone 14 — below every canon floor, so the mobile-first BASE rules are what render |
 * | 768  | the `md` floor exactly — mobile-first `min-width` semantics put a boundary width on the WIDE side, which is the off-by-one a `max-width` ladder gets wrong |
 * | 1280 | the `xl` floor and a laptop — the top of the ladder |
 *
 * Note 1280 is also the main matrix's width, which is the point: the `1280`
 * capture of a component is its main-matrix `default__light__ltr` capture
 * modulo the viewport *height*, so a diff between them is a harness bug.
 */
export const RESPONSIVE_WIDTHS = [390, 768, 1280] as const;
export type ResponsiveWidth = (typeof RESPONSIVE_WIDTHS)[number];

/** Viewport height for every responsive capture (`fullPage` grows past it). */
export const RESPONSIVE_HEIGHT = 900;

/** The single theme/scheme/direction cell the viewport axis is swept in. */
export const RESPONSIVE_THEME = "default";
export const RESPONSIVE_SCHEME = "light" as const;
export const RESPONSIVE_DIRECTION = "ltr" as const;

// ── manifest-driven discovery ────────────────────────────────────────────────

/** The manifest fields this module reads. Everything else is ignored. */
export interface LayoutManifestFacts {
  kind?: string;
  category?: string;
}

/** Registry manifest for a discovered component — the sibling of its `.html`. */
export function manifestPathFor(component: Component): string {
  return component.htmlPath.replace(/\.html$/, ".manifest.json");
}

/** Read a component's manifest, or `null` if it has none. */
export function readLayoutManifest(component: Component): LayoutManifestFacts | null {
  const path = manifestPathFor(component);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8")) as LayoutManifestFacts;
}

/** A manifest reader — injectable so the meta-test can prove the discovery
 *  property with a synthetic component instead of writing to the registry. */
export type LayoutManifestReader = (component: Component) => LayoutManifestFacts | null;

/** The manifest `category` that makes a component layout-bearing on its own. */
export const LAYOUT_CATEGORY = "layout";
/** The manifest `kind` (the registry layer) that is layout-bearing wholesale. */
export const LAYOUT_LAYER = "pattern";

/**
 * Is this component layout-bearing? Two clauses, both read from the manifest:
 *
 * - `category: "layout"` — the primitives and recipes whose entire job is
 *   arrangement (grid, stack, cluster, container, switcher, card, surface, …).
 *   A `card` has no media query of its own, but it is the box every collapsing
 *   layout puts things in, so a reflow bug shows up in its capture first.
 * - `kind: "pattern"` — every pattern, whatever its category. A pattern owns a
 *   page, which per the doctrine (FAQIR-SPEC §15) is the only layer allowed to
 *   ask about the *viewport* at all. If anything can break at 390px, it is here.
 *
 * A manifest that declares neither is not layout-bearing; a missing manifest is
 * treated as not layout-bearing (and cannot happen — `responsive-matrix.test.ts`
 * asserts every discovered component has one).
 */
export function isLayoutBearing(manifest: LayoutManifestFacts | null): boolean {
  if (!manifest) return false;
  return manifest.category === LAYOUT_CATEGORY || manifest.kind === LAYOUT_LAYER;
}

/**
 * The layout-bearing components, in the main matrix's deterministic order.
 * Both arguments are injectable purely for the meta-test.
 */
export function discoverLayoutBearing(
  components: Component[] = discoverComponents(),
  read: LayoutManifestReader = readLayoutManifest,
): Component[] {
  return components.filter((c) => isLayoutBearing(read(c)));
}

// ── the matrix ───────────────────────────────────────────────────────────────

/** One responsive capture. Extends the main matrix `Case` so `buildPageHtml`
 *  consumes it unchanged — one page builder, no second code path to drift. */
export interface ResponsiveCase extends Case {
  width: ResponsiveWidth;
}

export function buildResponsiveMatrix(
  components: Component[] = discoverLayoutBearing(),
): ResponsiveCase[] {
  const cases: ResponsiveCase[] = [];
  for (const component of components) {
    for (const width of RESPONSIVE_WIDTHS) {
      cases.push({
        component,
        theme: RESPONSIVE_THEME,
        scheme: RESPONSIVE_SCHEME,
        dir: RESPONSIVE_DIRECTION,
        width,
        id: `responsive__${component.kind}__${component.name}__${width}`,
      });
    }
  }
  return cases;
}

// Re-exported so the specs assemble pages through the exact same builder the
// main visual and a11y suites use.
export { buildPageHtml, discoverComponents };

// ── the ladder, resolved ─────────────────────────────────────────────────────

/**
 * The value of a responsive attribute group at `width`, mobile-first: the base
 * `data-<attr>`, overridden by every `data-<attr>-<tier>` whose canon floor the
 * width has reached. Ascending tier order means the widest matching tier wins,
 * which is what the specificity ladder in the sheets encodes.
 *
 * This is the *expectation* side of the pre-assertion. It reads only the markup
 * and the canon — never the stylesheet — so a sheet that stopped implementing
 * its own ladder fails instead of agreeing with itself.
 */
export function resolveTierValue(
  attrs: Readonly<Record<string, string>>,
  base: string,
  width: number,
): string | undefined {
  let value = attrs[`data-${base}`];
  for (const tier of TIERS) {
    if (width < BREAKPOINTS[tier].px) break;
    const at = attrs[`data-${base}-${tier}`];
    if (at !== undefined) value = at;
  }
  return value;
}

/** The tiers active at `width` — documentation for a failure message. */
export function activeTiers(width: number): Tier[] {
  return TIERS.filter((t) => width >= BREAKPOINTS[t].px);
}

// ── in-page facts ────────────────────────────────────────────────────────────

/** One `[data-ui="grid"]` element as the page reports it. */
export interface GridFacts {
  /** A readable path to the element, for failure messages. */
  where: string;
  /** Its `data-*` attributes, verbatim (a valueless attribute reads `""`). */
  attrs: Record<string, string>;
  /** `getComputedStyle().display`. */
  display: string;
  /** Used track count — `grid-template-columns` split on whitespace, or 0 for `none`. */
  trackCount: number;
}

/** The dashboard-shell drawer as the page reports it. */
export interface DrawerFacts {
  /** `getComputedStyle().position` of `[data-part="sidebar"]`. */
  position: string;
  /** Number of tracks the shell's own `grid-template-columns` resolves to. */
  shellTrackCount: number;
}

/** The inbox panes as the page reports them (with `list` forced active). */
export interface PaneFacts {
  listVisible: boolean;
  detailVisible: boolean;
  backVisible: boolean;
}

/**
 * Everything the pre-assertion needs, gathered in one `page.evaluate`. Archetype
 * fields are optional: a page with no grid reports no grids, and only the two
 * structural patterns report a drawer or panes.
 */
export interface LayoutFacts {
  width: number;
  grids: GridFacts[];
  drawer?: DrawerFacts;
  panes?: PaneFacts;
}

// ── the pre-assertion ────────────────────────────────────────────────────────

/**
 * Check gathered facts against the ladder the markup authored and the canon.
 * Returns one human-readable line per violation; an empty array is a pass.
 *
 * Pure on purpose. The browser gathers, this decides — so every failure mode
 * (a grid that ignored its `md` override, a drawer that stayed fixed at 768, an
 * inbox showing both panes on a phone) is reproducible in `bun test` from a
 * literal facts object, and the same function is what the screenshot suite runs.
 */
export function checkLayoutFacts(facts: LayoutFacts): string[] {
  const problems: string[] = [];
  const at = `@${facts.width}px`;
  const tiers = activeTiers(facts.width);
  const tierNote = tiers.length ? `tiers active: ${tiers.join(", ")}` : "below every canon floor";

  for (const grid of facts.grids) {
    const scroll = "data-scroll" in grid.attrs;
    // A `data-scroll` grid is a flex snap strip below `sm`, a grid from `sm` up.
    if (scroll && facts.width < BREAKPOINTS.sm.px) {
      if (grid.display !== "flex") {
        problems.push(
          `${at} ${grid.where}: data-scroll should be a flex snap strip below the sm floor (${BREAKPOINTS.sm.px}px), got display: ${grid.display}`,
        );
      }
      continue;
    }

    if (grid.display !== "grid" && grid.display !== "inline-grid") {
      problems.push(`${at} ${grid.where}: expected display: grid, got ${grid.display}`);
      continue;
    }

    const cols = resolveTierValue(grid.attrs, "cols", facts.width);
    if (cols === undefined) continue; // no column ladder authored — nothing to check
    if (cols === "auto") {
      // Intrinsic mode: the count derives from available space, so the honest
      // assertion is that auto-fit produced *some* track rather than collapsing.
      if (grid.trackCount < 1) {
        problems.push(`${at} ${grid.where}: data-cols="auto" resolved to no tracks`);
      }
      continue;
    }

    const expected = Number(cols);
    if (!Number.isFinite(expected)) continue; // not a numeric ladder
    if (grid.trackCount !== expected) {
      problems.push(
        `${at} ${grid.where}: expected ${expected} columns (${tierNote}), computed ${grid.trackCount}`,
      );
    }
  }

  if (facts.drawer) {
    const wide = facts.width >= BREAKPOINTS.md.px;
    const { position, shellTrackCount } = facts.drawer;
    if (wide) {
      if (position !== "static") {
        problems.push(
          `${at} dashboard-shell sidebar: expected position: static from the md floor up, got ${position}`,
        );
      }
      if (shellTrackCount !== 2) {
        problems.push(
          `${at} dashboard-shell: expected a two-column shell from the md floor up, computed ${shellTrackCount}`,
        );
      }
    } else {
      if (position !== "fixed") {
        problems.push(
          `${at} dashboard-shell sidebar: expected an off-canvas drawer (position: fixed) below the md floor, got ${position}`,
        );
      }
      if (shellTrackCount !== 1) {
        problems.push(
          `${at} dashboard-shell: expected a single-column shell below the md floor, computed ${shellTrackCount}`,
        );
      }
    }
  }

  if (facts.panes) {
    const wide = facts.width >= BREAKPOINTS.md.px;
    const { listVisible, detailVisible, backVisible } = facts.panes;
    if (wide) {
      if (!listVisible || !detailVisible) {
        problems.push(
          `${at} inbox: expected both panes from the md floor up (list: ${listVisible}, detail: ${detailVisible})`,
        );
      }
      if (backVisible) {
        problems.push(`${at} inbox: the back link is phone-only, but it is visible`);
      }
    } else {
      if (!listVisible || detailVisible) {
        problems.push(
          `${at} inbox: expected exactly the active pane below the md floor (list: ${listVisible}, detail: ${detailVisible})`,
        );
      }
    }
  }

  return problems;
}

// ── the gatherer (runs in the page) ──────────────────────────────────────────

/**
 * Collect {@link LayoutFacts} from the currently-rendered document. Written as a
 * self-contained function body so Playwright can serialise it into the page —
 * it must reference nothing from this module's scope.
 *
 * The two structural patterns are put into a *known* state first, because their
 * reference pages author one: dashboard-shell ships `data-state="expanded"` (an
 * open drawer, the right thing for a screenshot) and inbox ships a selection.
 * The pre-assertion is about the CSS ladder, not the authored state, so the
 * gatherer forces the closed drawer / list-active selection, reads the facts,
 * and restores exactly what it found — the screenshot that follows is of the
 * page as authored.
 */
export function gatherLayoutFacts(width: number): LayoutFacts {
  const describe = (el: Element, index: number): string => {
    const part = el.getAttribute("data-part");
    return `[data-ui="grid"]${part ? `[data-part="${part}"]` : ""}#${index}`;
  };

  const grids: GridFacts[] = [];
  const gridEls = Array.from(document.querySelectorAll('[data-ui="grid"]'));
  gridEls.forEach((el, index) => {
    const attrs: Record<string, string> = {};
    for (const a of Array.from(el.attributes)) {
      if (a.name.startsWith("data-")) attrs[a.name] = a.value;
    }
    const style = getComputedStyle(el);
    const tracks = style.getPropertyValue("grid-template-columns").trim();
    grids.push({
      where: describe(el, index),
      attrs,
      display: style.display,
      trackCount: tracks === "" || tracks === "none" ? 0 : tracks.split(/\s+/).length,
    });
  });

  const facts: LayoutFacts = { width, grids };

  const shell = document.querySelector('[data-ui="dashboard-shell"]');
  if (shell) {
    const sidebar = shell.querySelector('[data-part="sidebar"]');
    if (sidebar) {
      const authored = sidebar.getAttribute("data-state");
      sidebar.removeAttribute("data-state"); // the CLOSED drawer is the ladder's claim
      const shellTracks = getComputedStyle(shell).getPropertyValue("grid-template-columns").trim();
      facts.drawer = {
        position: getComputedStyle(sidebar).position,
        shellTrackCount:
          shellTracks === "" || shellTracks === "none" ? 0 : shellTracks.split(/\s+/).length,
      };
      if (authored === null) sidebar.removeAttribute("data-state");
      else sidebar.setAttribute("data-state", authored);
    }
  }

  const inbox = document.querySelector('[data-ui="inbox"]');
  if (inbox) {
    const list = inbox.querySelector('[data-part="list-pane"]') as HTMLElement | null;
    const detail = inbox.querySelector('[data-part="detail-pane"]') as HTMLElement | null;
    const back = inbox.querySelector('[data-part="back"]') as HTMLElement | null;
    if (list && detail) {
      const before = [list.getAttribute("data-state"), detail.getAttribute("data-state")] as const;
      list.setAttribute("data-state", "active");
      detail.setAttribute("data-state", "inactive");
      const shown = (el: HTMLElement | null): boolean =>
        el !== null && el.getClientRects().length > 0;
      facts.panes = {
        listVisible: shown(list),
        detailVisible: shown(detail),
        backVisible: shown(back),
      };
      const restore = (el: HTMLElement, value: string | null): void => {
        if (value === null) el.removeAttribute("data-state");
        else el.setAttribute("data-state", value);
      };
      restore(list, before[0]);
      restore(detail, before[1]);
    }
  }

  return facts;
}
