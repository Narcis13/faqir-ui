// The layout doctrine, as data (task 0.8-12).
//
// v0.8 built a layout system: a breakpoint canon (0.8-01), five primitives
// (stack, cluster, grid, container, switcher), a responsive attribute grammar
// declared in manifests (0.8-02) and enforced by the audit (0.8-10). This module
// is the one place the *prose* about that system lives, so the four surfaces an
// agent may read — README.md, docs/layout.md, `faqir context`/llms.txt, and the
// generated skill — quote one source instead of four hand-kept copies.
//
// What is NOT here: anything a manifest, a token file or the breakpoint canon
// already knows. Attribute names and their values come from manifests; the
// ladder comes from `./breakpoints`; the measure and rhythm token VALUES come
// from `registry/tokens/aliases.css`. This module names them and says when to
// reach for them — the tests assert every name here resolves to something real.
//
// `node:*`-free, like `./breakpoints`: the docs-site generator runs under Node
// and Bun both, and the audit bundles for the browser.

import { BREAKPOINT_LIST, PROTOCOL_ATTRIBUTES, TIERS } from "./breakpoints";

/** The three mechanisms of FAQIR-SPEC §15, in the order to reach for them. */
export interface LayoutMechanism {
  /** 1, 2, 3 — the step number in the ladder of mechanisms. */
  step: number;
  /** `intrinsic` · `container` · `viewport` — the key a primitive names. */
  key: "intrinsic" | "container" | "viewport";
  /** The heading the spec gives it. */
  title: string;
  /** One sentence: what it is and why it comes at this step. */
  summary: string;
}

/**
 * The doctrine: reach for the *first* mechanism that solves the problem. Most
 * layouts never get past step 1. Mirrors FAQIR-SPEC §15 "The doctrine".
 */
export const LAYOUT_MECHANISMS: readonly LayoutMechanism[] = Object.freeze([
  Object.freeze({
    step: 1,
    key: "intrinsic",
    title: "Intrinsic first — no query at all",
    summary:
      "auto-fit/minmax(), flex-wrap, clamp() and logical properties adapt to any width without naming one — the only mechanism that is correct at sizes nobody tested.",
  }),
  Object.freeze({
    step: 2,
    key: "container",
    title: "Container queries second — a component responds to its own inline size",
    summary:
      "A component cannot know whether it was placed full-bleed or in a sidebar, and the viewport cannot tell it; its own inline size can.",
  }),
  Object.freeze({
    step: 3,
    key: "viewport",
    title: "Viewport media queries last — page-level only",
    summary:
      "Only patterns and scaffolds, which own the whole page, may ask about the viewport; a primitive that consults it is asserting something it cannot know about its own placement.",
  }),
] as const);

/** One of the five layout primitives, with the mechanism it runs on. */
export interface LayoutPrimitiveDoc {
  /** Registry component name — asserted to exist, and to be `category: layout`. */
  name: string;
  /** Which doctrine step this primitive embodies. */
  mechanism: LayoutMechanism["key"];
  /** "Reach for it when …" — one line, imperative. */
  use: string;
}

/**
 * The five layout primitives, in the order a page is usually built: the column,
 * the row, the field, the measure, the pair. `category: "layout"` in the
 * registry is a broader set (card, surface, separator … are layout-ish); these
 * five are the ones that *structure a page*, and the ones the archetypes below
 * are written in.
 */
export const LAYOUT_PRIMITIVES: readonly LayoutPrimitiveDoc[] = Object.freeze([
  Object.freeze({
    name: "stack",
    mechanism: "intrinsic",
    use: "One direction, one gap — the vertical rhythm of a page and the horizontal row of a toolbar. Make the direction responsive (`data-direction-md`) rather than nesting two stacks.",
  }),
  Object.freeze({
    name: "cluster",
    mechanism: "intrinsic",
    use: "A row that wraps by itself — tags, chips, meta rows, button groups. No breakpoint involved; `data-push` on a child sends it (and everything after) to the far end.",
  }),
  Object.freeze({
    name: "grid",
    mechanism: "intrinsic",
    use: "Columns. `data-cols=\"auto\"` with `data-min` needs no query at all; the `data-cols-<tier>` ladder is for an editorial count, and `data-align-rows` gives direct four-row cards real internal alignment through subgrid.",
  }),
  Object.freeze({
    name: "container",
    mechanism: "intrinsic",
    use: "The centred measure column: caps line length at a `--measure-*` token and centres what is left. Every page-level width in Faqir is one of these, never a hand-written max-width.",
  }),
  Object.freeze({
    name: "switcher",
    mechanism: "container",
    use: "Equal peers side by side that become one column when the switcher itself is narrower than `data-threshold` — correct full-bleed, in a sidebar and in a dialog, from the same markup.",
  }),
] as const);

/** The `--measure-*` ladder: every centred column resolves to one of these. */
export const MEASURE_TOKENS: readonly { token: string; role: string }[] = Object.freeze([
  Object.freeze({ token: "measure-narrow", role: "a single form column, a login card" }),
  Object.freeze({ token: "measure-content", role: "an article body, a settings panel" }),
  Object.freeze({ token: "measure-wide", role: "a page shell — the widest thing still centred" }),
  Object.freeze({
    token: "measure-prose",
    role: "optimal line length in characters, so it tracks the reader's font rather than the layout",
  }),
]);

/** Page rhythm: the air between sections and the inset of the page itself. */
export const RHYTHM_TOKENS: readonly { token: string; role: string }[] = Object.freeze([
  Object.freeze({ token: "section-gap-sm", role: "dense pages — docs, dashboards" }),
  Object.freeze({ token: "section-gap-md", role: "the default marketing rhythm" }),
  Object.freeze({ token: "section-gap-lg", role: "spacious — one idea per screen" }),
  Object.freeze({ token: "content-gutter", role: "the page's own padding-inline" }),
]);

// ---------------------------------------------------------------------------
// Rhythm — FAQIR-SPEC §20, the default this framework had no answer for (0.9-02)
// ---------------------------------------------------------------------------

/**
 * §20 in one sentence. This exact string is what the skill, the context files,
 * README, `docs/layout.md` and the docs site all teach, and what
 * `tests/utils/rhythm.test.ts` re-parses out of FAQIR-SPEC §20 — the same
 * docs-versus-constants drift shape `tests/utils/breakpoints.test.ts` applies to
 * the breakpoint canon.
 */
export const RHYTHM_RULE =
  "Inside a flow root, consecutive block-level Faqir components and nested flow roots are separated by `--flow-space` of vertical space.";

/** The custom property the rule spends, and the token it falls back to. */
export const FLOW_SPACE_PROPERTY = "--flow-space";

/** `--section-gap-sm` (3rem) — the rhythm token a bare sequence gets by default. */
export const FLOW_SPACE_DEFAULT_TOKEN = "section-gap-sm";

/** The attribute that re-tunes (or, at `0`, disables) the rhythm on a flow root. */
export const FLOW_GAP_ATTRIBUTE = "data-gap";

/**
 * A **flow root**: the page's own structure. The HTML sectioning and grouping
 * elements, plus the two Faqir primitives that are plain block boxes. Anything
 * carrying another `data-ui` is not one — a component owns its internal layout,
 * and `stack`/`cluster`/`grid`/`switcher` already space their children with
 * `gap`, so a margin on top of that would double it.
 *
 * Mirrors the selector list in `registry/base/rhythm.css`, which the drift test
 * re-parses and compares — the CSS and this list cannot disagree.
 */
export const FLOW_ROOTS: readonly string[] = Object.freeze([
  "body",
  "main",
  "article",
  "section",
  "aside",
  "header",
  "footer",
  "form",
  "fieldset",
  "dialog",
  "blockquote",
  "figure",
  '[data-ui="container"]',
  '[data-ui="surface"]',
]);

/**
 * The components the rule skips, because their root box is inline-level and a
 * vertical margin on an atomic inline shifts it inside its line box rather than
 * stacking it. CSS cannot select on computed display, so the list is named — but
 * it is *derived*, not maintained: `tests/utils/rhythm.test.ts` recomputes it
 * from every component's root `display` declaration (falling back to the root
 * tag's UA default, which is what puts `link` here) and fails if this list, the
 * CSS and the registry disagree.
 */
export const INLINE_LEVEL_COMPONENTS: readonly string[] = Object.freeze([
  "avatar",
  "badge",
  "barcode",
  "button",
  "calendar",
  "checkbox",
  "chip",
  "combobox",
  "date-picker",
  "dropdown",
  "icon",
  "image",
  "input-otp",
  "kbd",
  "link",
  "menubar",
  "pagination",
  "popover",
  "qr-code",
  "radio",
  "select-custom",
  "spinner",
  "switch",
  "toggle",
  "toggle-group",
  "tooltip",
]);

/**
 * The flow-root **tags** — {@link FLOW_ROOTS} without its two component entries.
 * These are also the elements the rule spaces as *children*: a bare `<section>`
 * run is the commonest page shape there is, and a sectioning element is a block
 * box by definition, so the same margin is safe on it. The child set is
 * therefore `[data-ui]` plus this list — never "any child", which would put 3rem
 * between a heading and its own paragraph.
 */
export const FLOW_ROOT_TAGS: readonly string[] = Object.freeze(
  FLOW_ROOTS.filter((r) => !r.startsWith("[")),
);

/** A mechanism §20 considered and did not choose, with the reason it lost. */
export interface RejectedRhythm {
  /** Short name, as §20 heads it. */
  candidate: string;
  /** Why it lost — one sentence, because the next spacing question will ask again. */
  why: string;
}

/**
 * The two rejected candidates. Recorded as data because a rejected design comes
 * back: the next time somebody asks "why is there no `flow` primitive?", the
 * answer has to be somewhere a generator can print.
 */
export const RHYTHM_REJECTED: readonly RejectedRhythm[] = Object.freeze([
  Object.freeze({
    candidate: "a `flow` primitive",
    why: "It is a wrapper, and a rule whose answer is “wrap it” fails the one test this decision had to pass — an agent must produce spaced output without wrapping anything. It would also spend a sixth layout primitive immediately before the 1.0 schema freeze.",
  }),
  Object.freeze({
    candidate: "a `data-flow` prop on `stack`/`surface`/`container`",
    why: "Still opt-in and still per-element, so it fails the same test — and three manifests would grow an attribute meaning the same thing in three places, which is the drift the manifest system exists to prevent.",
  }),
]);

/**
 * The rule, the default and the escape hatch in one paragraph — used verbatim by
 * the skill, the context markdown and both llms surfaces, so an agent that reads
 * any one of them learns the whole of §20.
 */
export function rhythmLine(): string {
  return (
    `${RHYTHM_RULE} ` +
    `\`${FLOW_SPACE_PROPERTY}\` defaults to \`--${FLOW_SPACE_DEFAULT_TOKEN}\`; ` +
    `\`${FLOW_GAP_ATTRIBUTE}\` on the flow root re-tunes it and \`${FLOW_GAP_ATTRIBUTE}="0"\` turns it off. ` +
    `A flow root is ${FLOW_ROOTS.map((r) => `\`${r}\``).join(", ")} — never a component that lays out its own children.`
  );
}

/** The five canonical page archetypes documented in `docs/layout.md`. */
export interface ArchetypeDoc {
  /** Slug — the anchor on the docs site and the heading's identity. */
  id: string;
  /** Heading, as written in `docs/layout.md`. */
  title: string;
}

/**
 * The archetype set. The prose and the markup live in `docs/layout.md` (which
 * is parsed by {@link parseArchetypes}); this list is the contract that says
 * *which* five must be there, so a deleted archetype is a test failure rather
 * than a quiet gap in the documentation.
 */
export const ARCHETYPES: readonly ArchetypeDoc[] = Object.freeze([
  Object.freeze({ id: "dashboard", title: "Dashboard" }),
  Object.freeze({ id: "landing", title: "Landing page" }),
  Object.freeze({ id: "document", title: "Prose / document" }),
  Object.freeze({ id: "split-view", title: "Split view" }),
  Object.freeze({ id: "centered-form", title: "Centred form" }),
]);

/** The layout rules an agent must follow — the short form of FAQIR-SPEC §15. */
export const LAYOUT_RULES: readonly string[] = Object.freeze([
  "Mobile-first: the unsuffixed value is the phone layout, and each tier enhances it.",
  "`min-width` only — a tier is the floor of a range that never ends, so tiers cannot leave a gap between them.",
  "No fifth number: a threshold that is not a canon tier is off-canon, and usually means an intrinsic layout was the right answer.",
  "Reach for a viewport query last — intrinsic first, then the component's own inline size.",
  "Never hand-write a max-width for a page column; use `container` and a `--measure-*` token.",
  "Vertical rhythm is the default, not an opt-in: block-level components stacked inside a flow root are already spaced, so do not wrap a sequence in a `stack` merely to separate it.",
  "Equal heights are not internal alignment: `switcher` stretches peer boxes, while `grid[data-align-rows]` aligns the header/divider/body/footer rows of direct card children through subgrid and stacks them as the correct fallback when subgrid is unavailable.",
]);

/** `data-<attr>-<tier>` — the responsive attribute grammar, as a literal. */
export const RESPONSIVE_GRAMMAR = "data-<attr>-<tier>";

/** `sm 40rem · md 48rem · lg 64rem · xl 80rem` — the ladder in one line. */
export function ladderLine(): string {
  return BREAKPOINT_LIST.map((b) => `${b.tier} ${b.rem}rem`).join(" · ");
}

/**
 * The grammar in one sentence, with a worked example and the exclusion. Used
 * verbatim by the skill, the context markdown and both llms surfaces — one
 * sentence, four surfaces.
 */
export function grammarLine(): string {
  const md = BREAKPOINT_LIST.find((b) => b.tier === "md")!;
  return (
    `\`${RESPONSIVE_GRAMMAR}\` — \`data-cols-md="2"\` means *two columns from ${md.rem}rem up*, ` +
    `leaving \`data-cols\` as the mobile-first base. Tiers: ${TIERS.join(", ")}. ` +
    `The five protocol attributes (${PROTOCOL_ATTRIBUTES.map((a) => `\`${a}\``).join(", ")}) never take a suffix.`
  );
}

// ---------------------------------------------------------------------------
// docs/layout.md — the archetype source, parsed
// ---------------------------------------------------------------------------

/** One archetype lifted out of `docs/layout.md`. */
export interface ParsedArchetype {
  id: string;
  title: string;
  /** The paragraph directly under the heading. */
  summary: string;
  /** The first ```html fence under the heading — the archetype itself. */
  html: string;
}

/** The heading `docs/layout.md` files its archetypes under. */
export const ARCHETYPE_SECTION_HEADING = "## Page archetypes";

/**
 * Parse the archetypes out of `docs/layout.md`. The doc is the source: the
 * docs site renders what this returns, and the test audits what this returns,
 * so a page that ships and an example that is proven clean are the same bytes.
 *
 * Shape it expects, under {@link ARCHETYPE_SECTION_HEADING}:
 *
 *   ### <Title> {#<id>}
 *   <summary paragraph>
 *   ```html
 *   <markup>
 *   ```
 */
export function parseArchetypes(markdown: string): ParsedArchetype[] {
  const start = markdown.indexOf(ARCHETYPE_SECTION_HEADING);
  if (start === -1) return [];
  const rest = markdown.slice(start + ARCHETYPE_SECTION_HEADING.length);
  const end = rest.indexOf("\n## ");
  const section = end === -1 ? rest : rest.slice(0, end);

  const out: ParsedArchetype[] = [];
  const blocks = section.split(/^### /m).slice(1);
  for (const block of blocks) {
    const newline = block.indexOf("\n");
    if (newline === -1) continue;
    const heading = block.slice(0, newline).trim();
    const anchor = /\{#([a-z0-9-]+)\}\s*$/.exec(heading);
    const title = heading.replace(/\s*\{#[a-z0-9-]+\}\s*$/, "").trim();
    const body = block.slice(newline + 1);

    const fence = /```html\n([\s\S]*?)```/.exec(body);
    const summary = body
      .slice(0, fence ? fence.index : undefined)
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean)[0];

    out.push({
      id: anchor ? anchor[1] : title.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      title,
      summary: summary ?? "",
      html: fence ? fence[1].trimEnd() : "",
    });
  }
  return out;
}
