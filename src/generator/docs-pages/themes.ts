/**
 * Theme System 2.0 — the nested pages under `themes/` (the gallery at
 * `themes/index.html` stays with docs.ts).
 *
 *   themes/axes/index.html        the fourteen axes, value by value, with the
 *                                 shipped themes that land on each one
 *   themes/<name>/index.html      one specimen sheet per registry theme
 *   themes/authoring/index.html   how a theme is made, gated and installed
 *
 * Every fact on these pages is read from a source-of-truth module — the axis
 * vocabulary and defaults from `theme-manifest.ts`, the flag names from
 * `seed.ts`, the token families from `families.ts`, the thresholds from
 * `axes.ts` and `distinctiveness.ts`, the font catalogue from
 * `fonts/catalog.ts` — or from the theme manifests and seeds in the registry.
 * Nothing here is typed from memory, so a vocabulary change reaches these pages
 * on the same commit.
 *
 * Import discipline: `../docs` imports this module, so nothing from `../docs`
 * is evaluated at module top level (see `context.ts`).
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  THEME_AXIS_VALUES,
  THEME_DERIVED_AXES,
  THEME_SEED_AXES,
  THEME_SEED_DEFAULTS,
  type ThemeAxes,
  type ThemeManifest,
  type ThemeSeed,
} from "../../theme-manifest";
import {
  AXIS_PATHS,
  axisFlag,
  axisLeaves,
  axisMatches,
  accentCell,
  themeKind,
  type AxisPath,
  type ThemeKind,
} from "../../theme/describe";
import {
  BORDER_HAIRLINE_MAX_PX,
  BORDER_REGULAR_MAX_PX,
  BUTTON_RECT_MAX_PX,
  CONTRAST_HIGH_BORDER_MIN,
  CONTRAST_HIGH_TEXT_MIN,
  DEPTH_LAYERED_MIN_BLUR_PX,
  FOCUS_BOLD_MIN_WIDTH_PX,
  HEADING_TRACKING_EM,
  HEADING_WEIGHT_MAX,
  LINK_OFFSET_MIN_EM,
  LINK_THICK_MIN_PX,
  MOTION_MINIMAL_MAX_MS,
  MOTION_SNAPPY_MAX_MS,
  NEUTRAL_COOL_HUE,
  NEUTRAL_GRAY_MAX_CHROMA,
  NEUTRAL_WARM_HUE,
  PILL_MIN_PX,
  RADIUS_CRISP_MAX_PX,
  RADIUS_SOFT_MAX_PX,
} from "../../theme/axes";
import {
  BORDER_ROLES,
  DURATION_RAMPS,
  GLASS_BACKDROP,
  GLASS_SURFACE_ALPHA,
  HEADING_TRACKINGS,
  HEADING_WEIGHTS,
  NEUTRAL_CHROMA,
  NEUTRAL_HUES,
  NEUTRAL_TINT_MIN_CHROMA,
  PAIRING_STACKS,
  PLAYFUL_HOVER_LIFT,
  RADIUS_RAMPS,
} from "../../theme/families";
import { PILL_COUPLING, SEED_FLAGS, THEME_NAME_PATTERN } from "../../theme/seed";
import {
  ACCENT_CHROMA_BUCKET,
  ACCENT_HUE_BUCKET_DEG,
  AXIS_MIN,
  TOKEN_MIN,
} from "../../theme/distinctiveness";
import { defaultScopeSelector } from "../../theme/scope";
import { FONT_CATALOG, familyBytes } from "../../fonts/catalog";
import {
  THEMES_PAGE,
  code,
  esc,
  escAttr,
  relUrl,
  renderShell,
  section,
  table,
  themePreviewPath,
} from "../docs";
import type { PageContext, SiteFile } from "./context";

// ── Page paths ──────────────────────────────────────────────────────────────

export const THEME_AXES_PAGE = "themes/axes/index.html";
export const THEME_AUTHORING_PAGE = "themes/authoring/index.html";

/** The specimen sheet for one theme. */
export function themeDetailPath(name: string): string {
  return `themes/${name}/index.html`;
}

/** Route segments under `themes/` that are pages of their own, not themes. */
const RESERVED_THEME_SEGMENTS = new Set(["axes", "authoring", "index.html"]);

// ── What each axis value does (derived from families.ts / axes.ts) ──────────

const px = (n: number) => `${n}px`;
const ramp = (values: number[]) => values.map(px).join(" / ");
const ms = (values: number[]) => values.map((n) => `${n}ms`).join(" / ");
const firstFamily = (stack: string) => stack.split(",")[0].trim().replace(/^'|'$/g, "");

/** One sentence per axis value, naming the tokens the value drives. */
const VALUE_NOTES: Record<AxisPath, Record<string, string>> = {
  neutral: {
    gray: `A true gray: the neutral ramp carries no tint, so --color-bg reads under ${NEUTRAL_GRAY_MAX_CHROMA} OKLCH chroma.`,
    cool: `The neutral ramp is tinted toward hue ${NEUTRAL_HUES.cool}° at chroma ${NEUTRAL_CHROMA.cool}; the classifier reads --color-bg in the ${NEUTRAL_COOL_HUE.min}–${NEUTRAL_COOL_HUE.max}° window.`,
    warm: `The neutral ramp is tinted toward hue ${NEUTRAL_HUES.warm}° at chroma ${NEUTRAL_CHROMA.warm}; the classifier reads --color-bg in the ${NEUTRAL_WARM_HUE.min}–${NEUTRAL_WARM_HUE.max}° window.`,
    tinted: `The neutral ramp borrows the accent's own hue at chroma ${NEUTRAL_CHROMA.tinted} (floored at ${NEUTRAL_TINT_MIN_CHROMA}); a tint that lands in the cool or warm window is reported as that word instead.`,
  },
  scheme: {
    light: "Only a :root block ships; the @ui:schemes header says light and dark_mode is none.",
    dark: "Only a dark rendering ships; :root is the dark side and the @ui:schemes header says dark.",
    both: "Both schemes ship — as one :root block of light-dark() pairs, or as three blocks with --legacy-blocks.",
  },
  "type.pairing": {
    system: `--font-heading, --font-body and --font-ui all take the ${firstFamily(PAIRING_STACKS.system)} stack.`,
    "sans-humanist": `Heading and body stacks lead with ${firstFamily(PAIRING_STACKS["sans-humanist"])}; --font-ui follows.`,
    "sans-grotesque": `Heading and body stacks lead with ${firstFamily(PAIRING_STACKS["sans-grotesque"])}; --font-ui follows.`,
    "sans-geometric": `Heading and body stacks lead with ${firstFamily(PAIRING_STACKS["sans-geometric"])}; --font-ui follows.`,
    rounded: `Heading and body stacks lead with ${firstFamily(PAIRING_STACKS.rounded)}; --font-ui follows.`,
    "serif-editorial": `Heading and body stacks lead with ${firstFamily(PAIRING_STACKS["serif-editorial"])}; --font-ui stays on the system sans so controls never set in a serif.`,
    "serif-modern": `Heading and body stacks lead with ${firstFamily(PAIRING_STACKS["serif-modern"])}; --font-ui stays on the system sans.`,
    slab: `Heading and body stacks lead with ${firstFamily(PAIRING_STACKS.slab)}; --font-ui stays on the system sans.`,
    mono: `Every role token, controls included, takes the ${firstFamily(PAIRING_STACKS.mono)} stack — a terminal theme means the controls too.`,
    custom: "Derived only: the heading and body faces classify differently, which no single pairing names. A seed that asks for it is refused.",
  },
  "type.scale": Object.fromEntries(
    THEME_AXIS_VALUES["type.scale"].map((ratio) => [
      String(ratio),
      `Every --text-* step is ${ratio}× the one below it; the classifier snaps the median consecutive ratio of the ramp to the nearest vocabulary value.`,
    ]),
  ),
  "type.base": Object.fromEntries(
    THEME_AXIS_VALUES["type.base"].map((base) => [
      String(base),
      `--text-base is ${base}px and the rest of the ramp is built from it by the scale ratio.`,
    ]),
  ),
  "type.voice.weight": {
    regular: `--heading-weight is ${HEADING_WEIGHTS.regular}; anything under ${HEADING_WEIGHT_MAX.regular} reads as regular.`,
    medium: `--heading-weight is ${HEADING_WEIGHTS.medium}; the band runs to ${HEADING_WEIGHT_MAX.medium}.`,
    semibold: `--heading-weight is ${HEADING_WEIGHTS.semibold}; the band runs to ${HEADING_WEIGHT_MAX.semibold}.`,
    bold: `--heading-weight is ${HEADING_WEIGHTS.bold}; the band runs to ${HEADING_WEIGHT_MAX.bold}.`,
    black: `--heading-weight is ${HEADING_WEIGHTS.black} — past the token ladder, so it is the one voice written as a number.`,
  },
  "type.voice.tracking": {
    tight: `--heading-tracking is ${HEADING_TRACKINGS.tight}, well under the −${HEADING_TRACKING_EM}em band edge.`,
    normal: `--heading-tracking is ${HEADING_TRACKINGS.normal}.`,
    wide: `--heading-tracking is ${HEADING_TRACKINGS.wide}, well over the +${HEADING_TRACKING_EM}em band edge.`,
  },
  "type.voice.transform": {
    none: "--heading-transform is none.",
    uppercase: "--heading-transform is uppercase; the pattern headlines that read it set in capitals.",
    "small-caps": "--heading-transform is small-caps; emitted as asked, though no consumer renders it yet (follow-up 1.1A-25).",
  },
  "shape.radius": {
    sharp: `The --radius-sm…2xl ramp is ${ramp(RADIUS_RAMPS.sharp)}; --radius-md at 0 is what the classifier reads as sharp.`,
    crisp: `The ramp is ${ramp(RADIUS_RAMPS.crisp)}; --radius-md at or under ${RADIUS_CRISP_MAX_PX}px reads as crisp (the 1.0 --radius sm ramp).`,
    soft: `The ramp is ${ramp(RADIUS_RAMPS.soft)}; --radius-md at or under ${RADIUS_SOFT_MAX_PX}px reads as soft (the 1.0 --radius md ramp).`,
    round: `The ramp is ${ramp(RADIUS_RAMPS.round)}; --radius-md above ${RADIUS_SOFT_MAX_PX}px reads as round (the 1.0 --radius lg ramp).`,
    pill: `The round ramp plus --button-radius: var(--radius-full); a --button-radius of ${PILL_MIN_PX}px or more is the only thing that reads as pill, which is why controls.button must agree.`,
  },
  "shape.border": {
    hairline: `--border-width is ${BORDER_ROLES.hairline[0]} and --border-width-strong is ${BORDER_ROLES.hairline[1]}; at most ${BORDER_HAIRLINE_MAX_PX}px.`,
    regular: `--border-width is ${BORDER_ROLES.regular[0]} and --border-width-strong is ${BORDER_ROLES.regular[1]}; at most ${BORDER_REGULAR_MAX_PX}px.`,
    heavy: `--border-width is ${BORDER_ROLES.heavy[0]} and --border-width-strong is one hairline more; anything over ${BORDER_REGULAR_MAX_PX}px.`,
  },
  "shape.corner": {
    round: "--corner-shape is round — the ordinary circular corner.",
    bevel: "--corner-shape is bevel; needs a non-zero radius to draw, which the generated-themes gate enforces.",
    scoop: "--corner-shape is scoop; needs a non-zero radius to draw.",
    notch: "--corner-shape is notch; needs a non-zero radius to draw.",
  },
  depth: {
    flat: "Every --shadow-* step is none; checked before glass, because removing every shadow is a statement a backdrop filter does not undo.",
    soft: "The registry's own five-step --shadow-* ramp, heavier in alpha under the dark scheme.",
    layered: `Three layers per step and a --shadow-md blur of at least ${DEPTH_LAYERED_MIN_BLUR_PX}px — ambient, contact and hairline.`,
    hard: "Zero-blur offset shadows at 0.9 alpha — a drawn mark rather than a lift — cast in --shadow-color: 1 0 0 under the dark scheme.",
    glass: `A shadow ramp plus --surface-backdrop: ${GLASS_BACKDROP} and a --card-bg that lets ${GLASS_SURFACE_ALPHA}% of the surface show through.`,
    inset: "Every --shadow-* step is an inset shadow: surfaces read as pressed wells rather than raised cards.",
  },
  material: {
    none: "No texture; the theme emits nothing because the --texture-page role is already none.",
    grain: "--texture-page: var(--texture-grain) — a fine film grain on the page ground.",
    paper: "--texture-page: var(--texture-paper) — a laid-paper fibre on the page ground.",
    dots: "--texture-page: var(--texture-dots) — a faint dot field on the page ground.",
    grid: "--texture-page: var(--texture-grid) — a ruled grid on the page ground.",
    stripes: "--texture-page: var(--texture-stripes) — a fine stripe on the page ground.",
    mesh: "--texture-page: var(--texture-mesh) — a soft gradient mesh on the page ground.",
  },
  motion: {
    none: `The --duration-* ramp is ${ms(DURATION_RAMPS.none)}; the theme simply does not animate (prefers-reduced-motion still applies on top).`,
    minimal: `The ramp is ${ms(DURATION_RAMPS.minimal)}; --duration-normal at or under ${MOTION_MINIMAL_MAX_MS}ms.`,
    smooth: `The registry's own ramp, ${ms(DURATION_RAMPS.smooth)}.`,
    snappy: `The ramp is ${ms(DURATION_RAMPS.snappy)} and --ease-default is the theme's own --ease-out; --duration-normal at or under ${MOTION_SNAPPY_MAX_MS}ms on that curve.`,
    springy: `The ramp is ${ms(DURATION_RAMPS.springy)} and --ease-default is var(--ease-spring).`,
    playful: `The ramp is ${ms(DURATION_RAMPS.playful)}, --ease-default is var(--ease-spring), and --motion-hover-lift is ${PLAYFUL_HOVER_LIFT} so surfaces rise under the pointer.`,
  },
  density: {
    compact: "No token: the theme states /* @ui:density compact */ in its header and the preview stamps data-density=\"compact\" — spacing tightens and controls drop to the short ramp.",
    comfortable: "The base ramp. A theme that says nothing lands here.",
    spacious: "The theme states /* @ui:density spacious */; data-density=\"spacious\" scales spacing by 1.25 and grows controls to 36 / 44 / 52px.",
  },
  focus: {
    ring: "--focus-ring-width: 2px with --focus-ring-offset: 2px, solid, in --color-ring.",
    glow: "The 2px ring plus --focus-shadow: 0 0 0 4px var(--color-primary-subtle) — any --focus-shadow other than none reads as glow.",
    inset: "--focus-ring-offset: −2px draws the ring inside the control's edge.",
    bold: `--focus-ring-width of ${FOCUS_BOLD_MIN_WIDTH_PX}px or more — the border ladder's lg step.`,
  },
  "decoration.link": {
    none: "--link-decoration: none — links are told apart by colour alone.",
    plain: "An underline of 1px sitting on the baseline: --link-underline-offset is 0.",
    offset: `A 1px underline lifted --link-underline-offset: 0.2em off the baseline (at least ${LINK_OFFSET_MIN_EM}em reads as offset).`,
    thick: `--link-thickness of ${LINK_THICK_MIN_PX}px or more, whatever its offset.`,
  },
  "decoration.divider": {
    solid: "--divider-style: solid.",
    dashed: "--divider-style: dashed.",
    dotted: "--divider-style: dotted.",
    double: "--divider-style: double.",
  },
  "controls.button": {
    rect: `--button-radius: 0 — a corner at or under ${BUTTON_RECT_MAX_PX}px reads as rect.`,
    pill: `--button-radius: var(--radius-full) — ${PILL_MIN_PX}px or more reads as pill.`,
    soft: "--button-radius: var(--radius-md), so it follows the shape ramp; under a sharp shape it names its own 4px instead.",
  },
  "controls.input": {
    box: "--input-border-width: var(--border-width) on every side and --input-fill: var(--input-bg).",
    filled: "The same box edge with --input-fill: var(--input-bg-filled) — a fill that differs from the plain input background reads as filled.",
    underline: "--input-border-width: 0 0 var(--border-width) 0 — only a bottom rule.",
  },
  "controls.checkbox": {
    square: "--checkbox-radius: var(--radius-sm).",
    round: "--checkbox-radius: var(--radius-full).",
  },
  "controls.switch": {
    pill: "--switch-radius: var(--radius-full).",
    square: "--switch-radius: var(--radius-sm).",
  },
  contrast: {
    standard: "The 1.0 neutral ramp: AA text everywhere, borders at their ordinary weight.",
    high: `--color-fg on --color-bg at ${CONTRAST_HIGH_TEXT_MIN}:1 or better and --color-border-strong at ${CONTRAST_HIGH_BORDER_MIN}:1 or better, in every scheme the theme ships.`,
  },
};

/** What each of the fourteen top-level axes decides, in one line. */
const AXIS_INTROS: Record<(typeof THEME_SEED_AXES)[number], string> = {
  accent:
    "The one required seed input: the brand colour the whole --palette-<name>-* ramp is built from. The derived block records where --color-primary landed, as an OKLCH hue and chroma, rather than what the seed asked for.",
  neutral: "The tint of the neutral ramp behind everything — page, surfaces, borders, muted text.",
  scheme: "Which colour schemes the stylesheet ships, read from the @ui:schemes header or from the blocks it declares.",
  type: "Which families set the page, how steep the size ramp is, and how headings are voiced.",
  shape: "The silhouette: the radius ramp, the edge weight, and the corner shape.",
  depth: "How surfaces lift off the page — the --shadow-* ramp and, for glass, the backdrop.",
  material: "The texture the page ground is dressed in, via the --texture-page role.",
  motion: "The duration ramp and easing personality every transition reads.",
  density: "The spacing and control ramp a page starts at. The only axis with no token: it is a header directive and a data-density modifier.",
  focus: "The focus ring's width, offset and glow.",
  decoration: "How links are underlined and how dividers are drawn.",
  controls: "The silhouette of the four controls a theme is recognised by: button, input, checkbox, switch.",
  contrast: "Whether the neutral ramp clears the ordinary AA bar or the high-contrast one.",
  document:
    "Seed only. true also emits a <name>-document print companion — white paper, light only, no axes of its own — which is why the derived block drops it.",
};

/** The leaf paths under one top-level axis, in vocabulary order. */
function leavesOf(axis: string): AxisPath[] {
  return AXIS_PATHS.filter((path) => path === axis || path.startsWith(`${axis}.`));
}

// ── Small renderers (all use ../docs helpers inside functions only) ─────────

interface ThemeEntry {
  name: string;
  manifest: ThemeManifest | null;
  cssPath: string;
  stylePath: string;
}

function kindOf(manifest: ThemeManifest | null): ThemeKind {
  return manifest ? themeKind(manifest) : "authored";
}

function withAxes(themes: ThemeEntry[]): (ThemeEntry & { manifest: ThemeManifest & { axes: ThemeAxes } })[] {
  return themes.filter(
    (t): t is ThemeEntry & { manifest: ThemeManifest & { axes: ThemeAxes } } => !!t.manifest?.axes,
  );
}

function readSeed(registryRoot: string, name: string): string | null {
  const path = join(registryRoot, "themes", `${name}.seed.json`);
  return existsSync(path) ? readFileSync(path, "utf8").trimEnd() : null;
}

/** The exact `faqir theme generate` invocation, one flag per seed leaf. */
export function generateInvocation(seed: ThemeSeed): string {
  const parts = [`faqir theme generate ${seed.name}`];
  const leaf = (path: string): unknown => {
    let node: unknown = seed;
    for (const key of path.split(".")) {
      if (node === null || typeof node !== "object") return undefined;
      node = (node as Record<string, unknown>)[key];
    }
    return node;
  };
  for (const [flag, path] of Object.entries(SEED_FLAGS)) {
    const value = leaf(path);
    if (value === undefined) continue;
    const text = String(value);
    parts.push(`--${flag} ${/[\s()#]/.test(text) ? `"${text}"` : text}`);
  }
  if (seed.document) parts.push("--document");
  return parts.join(" \\\n  ");
}

// ── Entry point ─────────────────────────────────────────────────────────────

export function renderThemeSystemPages(ctx: PageContext): SiteFile[] {
  const themes: ThemeEntry[] = [...ctx.themes].sort((a, b) => (a.name < b.name ? -1 : 1));
  for (const theme of themes) {
    if (RESERVED_THEME_SEGMENTS.has(theme.name)) {
      throw new Error(`Theme '${theme.name}' collides with a reserved themes/ route segment.`);
    }
  }
  return [
    renderAxesPage(ctx, themes),
    ...themes.map((theme, index) => renderThemePage(ctx, themes, index)),
    renderAuthoringPage(ctx, themes),
  ];
}

// ── themes/axes ─────────────────────────────────────────────────────────────

function renderAxesPage(ctx: PageContext, themes: ThemeEntry[]): SiteFile {
  const pagePath = THEME_AXES_PAGE;
  const u = (to: string) => escAttr(relUrl(pagePath, to));
  const peers = withAxes(themes);
  const companions = themes.filter((t) => kindOf(t.manifest) === "companion");

  const chip = (name: string) =>
    `<a data-ui="link" data-docs-themes-chip href="${u(themeDetailPath(name))}">${esc(name)}</a>`;
  const chips = (names: string[]) =>
    names.length
      ? `<span data-ui="cluster" data-gap="1" data-docs-themes-chips>${names.map(chip).join("")}</span>`
      : `<span data-ui="text" data-variant="subtle">no shipped theme</span>`;

  const toc = (items: [string, string][]) =>
    `      <nav aria-label="On this page" data-docs-toc data-docs-themes-toc>\n        <ul>\n${items
      .map(([id, label]) => `          <li><a data-ui="link" href="#${escAttr(id)}">${esc(label)}</a></li>`)
      .join("\n")}\n        </ul>\n      </nav>`;

  // The vocabulary table: accent first, then every enumerated leaf.
  const vocabRows: string[][] = [
    [code("accent"), code("--accent"), "any opaque oklch(), #rgb or #rrggbb", "required"],
    ...AXIS_PATHS.map((path) => [
      `<a data-ui="link" href="#axis-${escAttr(path.split(".")[0])}">${code(path)}</a>`,
      axisFlag(path) ? code(axisFlag(path)!) : "—",
      THEME_AXIS_VALUES[path].map((v) => code(String(v))).join(" "),
      code(String((THEME_SEED_DEFAULTS as Record<string, string | number | boolean>)[path])),
    ]),
    [code("document"), code("--document"), `${code("true")} ${code("false")}`, code("false")],
  ];

  // One section per top-level axis.
  const axisSections = THEME_SEED_AXES.map((axis) => {
    const id = `axis-${axis}`;
    let body = `      <p>${esc(AXIS_INTROS[axis])}</p>\n`;
    if (axis === "accent") {
      const rows = peers.map((t) => [
        chip(t.name),
        esc(accentCell(t.manifest.axes)),
        esc(t.manifest.seed?.accent ?? "authored by hand"),
      ]);
      body +=
        `      <p>Two numbers in the derived block: ${code("accent_hue")} (0–360°) and ${code(
          "accent_chroma",
        )} (0–0.5), read off the resolved ${code("--color-primary")}. The distinctiveness gate treats accents at least ${ACCENT_HUE_BUCKET_DEG}° apart on the wheel, or ${ACCENT_CHROMA_BUCKET} apart in chroma, as different accents.</p>\n` +
        table(["Theme", "Hue · chroma", "Seed accent"], rows, "No theme carries axes.");
    } else if (axis === "document") {
      const withCompanion = themes.filter((t) => t.manifest?.seed?.document);
      body +=
        `      <p>${code("document: true")} in a seed writes a second stylesheet beside the theme. ` +
        `Companions in this registry: ${
          companions.length ? companions.map((t) => chip(t.name)).join(" ") : "none"
        }. Seeds that ask for one: ${withCompanion.length ? withCompanion.map((t) => chip(t.name)).join(" ") : "none"}.</p>\n`;
    } else {
      body += leavesOf(axis)
        .map((path) => {
          const rows = THEME_AXIS_VALUES[path].map((value) => {
            const takers = peers.filter((t) => axisMatches(t.manifest.axes, path, value)).map((t) => t.name);
            const isDefault = (THEME_SEED_DEFAULTS as Record<string, unknown>)[path] === value;
            return [
              `${code(String(value))}${isDefault ? ` <span data-ui="badge" data-variant="secondary" data-size="sm">default</span>` : ""}`,
              esc(VALUE_NOTES[path][String(value)] ?? ""),
              chips(takers),
            ];
          });
          const flag = axisFlag(path);
          return (
            `      <h3 id="leaf-${escAttr(path.replace(/\./g, "-"))}">${code(path)}${
              flag ? ` <span data-ui="text" data-variant="subtle" data-size="sm">${esc(flag)}</span>` : ""
            }</h3>\n` + table(["Value", "What it does", "Shipped themes"], rows, "No values.")
          );
        })
        .join("\n");
    }
    return section(id, axis, body);
  });

  const body = [
    `      <h1>The fourteen axes</h1>`,
    `      <p data-docs-themes-lede>A theme's character is fourteen axes — ${THEME_SEED_AXES.join(", ")} — and every one of them is a fact about the stylesheet, not a claim its author types. ${code("axesFromCss")} reads the axes out of the CSS through the same cascade model the contrast gate uses, ${code("gen:theme-manifests")} writes them into the manifest's ${code("axes")} block, and the manifest gate re-derives and compares, so a hand edit is drift that fails rather than documentation that goes stale. ${peers.length} of the ${themes.length} shipped themes carry axes; the ${companions.length} print companions carry none.</p>`,
    toc([
      ["derived", "Derived, not declared"],
      ["vocabulary", "The vocabulary"],
      ...THEME_SEED_AXES.map((axis): [string, string] => [`axis-${axis}`, axis]),
      ["amendments", "Protocol amendments"],
    ]),
    section(
      "derived",
      "Derived, not declared",
      `      <p>The vocabulary is stated once, as data, in ${code("THEME_AXIS_VALUES")} (${code(
        "src/theme-manifest.ts",
      )}). It drives the seed validator, the one-flag-per-axis command line of ${code(
        "faqir theme generate",
      )}, the ${code("manifest.schema.json")} contract, the MCP theme tools and this page. The seed side counts fourteen axes with ${code(
        "accent",
      )} and ${code("document")}; the derived side trades them for ${code("accent_hue")} and ${code(
        "accent_chroma",
      )} and drops ${code("document")}, so both sides count fourteen: ${THEME_DERIVED_AXES.map((a) => code(a)).join(" ")}.</p>\n` +
        `      <p>Every threshold the classifier uses is a named constant in ${code(
          "src/theme/axes.ts",
        )}, and every value the generator emits in ${code(
          "src/theme/families.ts",
        )} is chosen to clear that constant — the generator runs the classifier over its own output before writing a byte, and refuses if the round trip disagrees.</p>`,
    ),
    section(
      "vocabulary",
      "The vocabulary",
      `      <p>Every leaf a seed may state, the flag that sets it, and what an unstated leaf means. The defaults together describe the shipped ${chip(
        "default",
      )} theme, which is what makes ${code('{ "name", "accent" }')} a complete seed.</p>\n` +
        table(["Axis", "Flag", "Values", "Default"], vocabRows, "No axes."),
    ),
    ...axisSections,
    section(
      "amendments",
      "Protocol amendments",
      `      <p>Two additive amendments to SPEC-1.0 §4, made for the theme system (task 1.1A-09):</p>\n` +
        `      <ul>\n` +
        `        <li><strong>${code("data-skin")}</strong> joined the sanctioned token modifiers as the fourth: it selects which installed theme's token declarations a subtree resolves, and its vocabulary is <em>open</em> — any theme name is already legal. It is what ${code(
          "faqir theme bundle <name> --scope",
        )} writes its scoped stylesheet against; see <a data-ui="link" href="${u(THEME_AUTHORING_PAGE)}#scoped">scoped themes</a>.</li>\n` +
        `        <li><strong>${code('data-density="spacious"')}</strong> joined ${code(
          "data-density",
        )}'s closed vocabulary beside ${code("compact")} and ${code(
          "comfortable",
        )}: spacing scales by 1.25 and the control-height ramp grows to 36 / 44 / 52px, gentler than the spacing multiplier because a hit target has a ceiling as well as a floor. It is how the ${code(
          "density",
        )} axis reaches the page.</li>\n` +
        `      </ul>\n` +
        `      <pre tabindex="0"><code>${esc(
          '<div data-skin="midnight">\n  <div data-ui="card">…resolves the midnight theme\'s tokens…</div>\n</div>\n\n<section data-density="spacious">…roomy hero, kiosk UI…</section>',
        )}</code></pre>`,
    ),
  ].join("\n");

  return {
    path: pagePath,
    content: renderShell({
      pagePath,
      title: `The fourteen axes · ${ctx.config.title}`,
      description:
        "Every axis of a Faqir theme, its vocabulary, the tokens each value drives, and which shipped themes land on it.",
      body,
      config: ctx.config,
      components: ctx.components,
      themes: ctx.themes,
      current: pagePath,
      layout: "reference",
      scripts: [],
    }),
  };
}

// ── themes/<name> ───────────────────────────────────────────────────────────

function renderThemePage(ctx: PageContext, themes: ThemeEntry[], index: number): SiteFile {
  const theme = themes[index];
  const m = theme.manifest;
  const pagePath = themeDetailPath(theme.name);
  const u = (to: string) => escAttr(relUrl(pagePath, to));
  const kind = kindOf(m);
  const frame = themePreviewPath(theme.name);
  const prev = themes[index - 1];
  const next = themes[index + 1];
  const badge = (variant: string, text: string, extra = "") =>
    `<span data-ui="badge" data-variant="${variant}"${extra}>${esc(text)}</span>`;
  const themeLink = (name: string) =>
    `<a data-ui="link" data-docs-themes-chip href="${u(themeDetailPath(name))}">${esc(name)}</a>`;

  const tocItems: [string, string][] = [["preview", "Preview"], ["axes", "Axes"]];
  if (kind !== "companion") tocItems.push(["distinctiveness", "Distinctiveness"]);
  tocItems.push(["fonts", "Fonts"], ["tokens", "Tokens"]);
  if (m?.seed) tocItems.push(["seed", "Seed"]);
  tocItems.push(["use", "Use this theme"]);

  const header =
    `      <h1>${esc(theme.name)}</h1>\n` +
    `      <p data-docs-themes-lede>${
      m
        ? `${esc(kind === "companion" ? `The print companion of ${m.pairs_with[0] ?? "its parent"}: the same seed on white paper, light only, with no axes of its own.` : kind === "generated" ? `A generated theme: reproduced byte for byte from the seed below by faqir theme generate, and gated for contrast, elevation, token parity, an axes round trip and distinctiveness before it was written.` : "An authored theme: written by hand as token declarations, with its axes and token lists derived from the stylesheet.")}`
        : "This theme ships no manifest."
    }</p>\n` +
    `      <div data-ui="cluster" data-gap="2" data-docs-themes-meta>\n` +
    `        ${badge(kind === "generated" ? "primary" : kind === "companion" ? "secondary" : "default", kind)}\n` +
    (m
      ? `        ${badge("secondary", `${m.scheme} scheme`)}\n        ${badge("secondary", `dark mode: ${m.dark_mode}`)}\n` +
        m.mood.map((mood) => `        ${badge("default", mood, " data-docs-themes-mood")}`).join("\n") +
        "\n"
      : "") +
    `      </div>\n` +
    `      <nav aria-label="On this page" data-docs-toc data-docs-themes-toc>\n        <ul>\n${tocItems
      .map(([id, label]) => `          <li><a data-ui="link" href="#${id}">${esc(label)}</a></li>`)
      .join("\n")}\n        </ul>\n      </nav>`;

  const preview = section(
    "preview",
    "Preview",
    `      <p>The same manifest-derived document the gallery shows — one button per declared variant, one swatch per semantic colour token — loaded with this theme's stylesheet. Use the appearance controls in the header to see it in the other scheme.</p>\n` +
      `      <div data-docs-themes-frame>\n        <iframe src="${u(frame)}" title="${escAttr(
        `${theme.name} theme preview`,
      )}" loading="lazy" data-docs-theme-frame="${escAttr(theme.name)}"></iframe>\n      </div>\n` +
      `      <p><a data-ui="link" href="${u(frame)}">Open the frame on its own</a> · <a data-ui="link" href="${u(
        theme.stylePath,
      )}"><span data-ui="text" data-variant="mono">${esc(theme.name)}.css</span></a></p>`,
  );

  const axes = section(
    "axes",
    "Axes",
    m?.axes
      ? `      <p>All fourteen, as <a data-ui="link" href="${u(THEME_AXES_PAGE)}">derived from the stylesheet</a>.</p>\n` +
          `      <div data-ui="grid" data-cols="2" data-cols-md="3" data-cols-lg="4" data-gap="2" data-docs-themes-axis-grid>\n` +
          axisLeaves(m.axes)
            .map(([path, value]) => {
              const shown =
                path === "accent_hue"
                  ? `${Math.round(Number(value))}°`
                  : path === "accent_chroma"
                    ? Number(value).toFixed(2)
                    : String(value);
              const anchor = path.startsWith("accent")
                ? "#axis-accent"
                : `#leaf-${path.replace(/\./g, "-")}`;
              return (
                `        <a data-ui="link" href="${u(THEME_AXES_PAGE)}${anchor}" data-docs-themes-axis-cell>` +
                `<span data-docs-themes-axis-path>${esc(path)}</span>` +
                `<strong data-docs-themes-axis-value>${esc(shown)}</strong></a>`
              );
            })
            .join("\n") +
          `\n      </div>`
      : `      <p>A print companion carries no ${code("axes")} block: its stylesheet is its parent's seed rendered for paper, and ${code(
          "renderDocumentCss",
        )} emits none of the axis families. Read the axes on ${
          m?.pairs_with[0] ? themeLink(m.pairs_with[0]) : "the parent theme"
        }.</p>`,
  );

  const distinct =
    kind === "companion"
      ? ""
      : section(
          "distinctiveness",
          "Distinctiveness",
          m?.distinctiveness
            ? `      <div data-ui="grid" data-cols="1" data-cols-md="3" data-gap="3" data-docs-themes-scorecard>\n` +
                `        <div data-ui="stat" data-variant="card"><span data-part="label">Nearest theme</span><span data-part="value">${themeLink(
                  m.distinctiveness.nearest,
                )}</span></div>\n` +
                `        <div data-ui="stat" data-variant="card"><span data-part="label">Axes that differ (min ${AXIS_MIN} of ${THEME_DERIVED_AXES.length})</span><span data-part="value">${esc(
                  String(m.distinctiveness.axis_distance),
                )}</span></div>\n` +
                `        <div data-ui="stat" data-variant="card"><span data-part="label">Colour distance, mean OKLab ΔE (min ${TOKEN_MIN})</span><span data-part="value">${esc(
                  m.distinctiveness.token_distance == null ? "n/a" : m.distinctiveness.token_distance.toFixed(4),
                )}</span></div>\n` +
                `      </div>\n` +
                `      <p>Written by the pair gate: the nearest theme is the one with the smallest colour distance over the schemes both ship. A shipped pair must differ on at least ${AXIS_MIN} axes and sit at least ${TOKEN_MIN} apart in mean ΔE — the same separation the framework demands between a card and the page it lies on.${
                  m.distinctiveness.token_distance == null
                    ? " The colour measure abstains here because the two themes share no scheme, so the pair is judged on axes alone."
                    : ""
                }</p>`
            : `      <p>No ${code("distinctiveness")} block on this manifest.</p>`,
        );

  const fonts = section(
    "fonts",
    "Fonts",
    m?.fonts?.length
      ? table(
          ["Family", "Role", "Licence", "Source"],
          m.fonts.map((f) => [esc(f.family), code(f.role), esc(f.license), f.source ? esc(f.source) : "—"]),
          "No fonts.",
        )
      : `      <p>No self-hosted family: the role tokens name system faces and fall back to a CSS generic. Install one with <a data-ui="link" href="${u(
          THEME_AUTHORING_PAGE,
        )}#fonts">${code("faqir fonts add")}</a>.</p>`,
  );

  const tokens = section(
    "tokens",
    "Tokens",
    m
      ? `      <p>${code(String(m.tokens_overridden.length))} tokens re-declared, ${code(
          String(m.tokens_inherited.length),
        )} surface tokens left at their base value. Both lists are derived from the stylesheet by ${code(
          "gen:theme-manifests",
        )} and asserted by the manifest gate.</p>\n` +
        `      <details data-ui="collapsible" data-variant="bordered">\n        <summary data-part="trigger">Overridden (${m.tokens_overridden.length})</summary>\n        <div data-part="content"><p data-docs-themes-token-list>${m.tokens_overridden
          .map((t) => code(`--${t}`))
          .join(" ")}</p></div>\n      </details>\n` +
        `      <details data-ui="collapsible" data-variant="bordered">\n        <summary data-part="trigger">Inherited (${m.tokens_inherited.length})</summary>\n        <div data-part="content"><p data-docs-themes-token-list>${m.tokens_inherited
          .map((t) => code(`--${t}`))
          .join(" ")}</p></div>\n      </details>`
      : `      <p>No manifest, so no token lists.</p>`,
  );

  const seedText = m?.seed ? readSeed(ctx.registryRoot, theme.name) ?? JSON.stringify(m.seed, null, 2) : null;
  const seed = m?.seed
    ? section(
        "seed",
        "Seed",
        `      <p>The generator input, verbatim from ${code(`registry/themes/${theme.name}.seed.json`)} — the same object the manifest carries, so regenerating from it reproduces the stylesheet byte for byte.</p>\n` +
          `      <pre tabindex="0"><code>${esc(seedText!)}</code></pre>`,
      )
    : "";

  const scopeSelector = defaultScopeSelector(theme.name);
  const use = section(
    "use",
    "Use this theme",
    `      <pre tabindex="0"><code>${esc(
      `faqir init --theme ${theme.name}          # a new project\n` +
        `faqir theme set ${theme.name}             # switch an existing project\n` +
        `faqir theme bundle ${theme.name} --scope   # ${theme.name}.scoped.css, under ${scopeSelector}\n` +
        `faqir theme bundle ${theme.name} --scope=".preview"   # your own selector`,
    )}</code></pre>\n` +
      (m?.seed
        ? `      <p>Regenerate it from its seed, or state the same axes as flags:</p>\n` +
          `      <pre tabindex="0"><code>${esc(
            `faqir theme generate ${theme.name} --seed registry/themes/${theme.name}.seed.json --out registry/themes\n\n${generateInvocation(m.seed)}`,
          )}</code></pre>\n`
        : "") +
      (m?.pairs_with.length
        ? `      <p>Pairs with ${m.pairs_with.map(themeLink).join(" ")}.</p>\n`
        : "") +
      `      <nav aria-label="Theme sequence" data-docs-themes-sequence>\n` +
      (prev ? `        <a data-ui="link" href="${u(themeDetailPath(prev.name))}">← ${esc(prev.name)}</a>\n` : `        <span></span>\n`) +
      `        <a data-ui="link" href="${u(THEMES_PAGE)}">All themes</a>\n` +
      (next ? `        <a data-ui="link" href="${u(themeDetailPath(next.name))}">${esc(next.name)} →</a>\n` : `        <span></span>\n`) +
      `      </nav>`,
  );

  const body = [header, preview, axes, distinct, fonts, tokens, seed, use].filter(Boolean).join("\n");

  return {
    path: pagePath,
    content: renderShell({
      pagePath,
      title: `${theme.name} theme · ${ctx.config.title}`,
      description: m
        ? `The ${theme.name} theme: ${m.mood.join(", ")}. ${m.scheme} scheme, ${kind}.`
        : `The ${theme.name} theme.`,
      body,
      config: ctx.config,
      components: ctx.components,
      themes: ctx.themes,
      current: pagePath,
      layout: "wide",
      scripts: [],
    }),
  };
}

// ── themes/authoring ────────────────────────────────────────────────────────

/** A real excerpt of the one-block `light-dark()` form, from a shipped theme. */
function lightDarkExcerpt(themes: ThemeEntry[]): { name: string; css: string } | null {
  const preferred = themes.find((t) => t.name === "nordic") ?? themes.find((t) => readFileSync(t.cssPath, "utf8").includes("light-dark("));
  if (!preferred) return null;
  const lines = readFileSync(preferred.cssPath, "utf8").split("\n");
  const wanted = /^\s*--color-(bg|bg-subtle|surface-1|fg|fg-muted|primary|primary-fg|border)\s*:/;
  const picked = lines.filter((line) => wanted.test(line) && !line.includes("@media"));
  if (picked.length === 0) return null;
  return { name: preferred.name, css: [":root {", ...picked, "  /* … */", "}"].join("\n") };
}

function renderAuthoringPage(ctx: PageContext, themes: ThemeEntry[]): SiteFile {
  const pagePath = THEME_AUTHORING_PAGE;
  const u = (to: string) => escAttr(relUrl(pagePath, to));
  const excerpt = lightDarkExcerpt(themes);
  const generated = themes.filter((t) => kindOf(t.manifest) === "generated");
  const sample = generated[0];

  const toc = [
    ["generate", "Generate from a seed"],
    ["scorecard", "The scorecard"],
    ["gate", "The distinctiveness gate"],
    ["light-dark", "Authoring both schemes"],
    ["rules", "What a theme may contain"],
    ["scoped", "Scoped themes and data-skin"],
    ["fonts", "Self-hosted fonts"],
    ["manifest", "Manifest fields"],
  ] as [string, string][];

  const seedFieldRows: string[][] = [
    [code("name"), "required", `kebab-case, ${code(THEME_NAME_PATTERN.source)} — it becomes the infix of every ${code("--palette-<name>-<step>")} property`],
    [code("accent"), "required", "an opaque oklch(), #rgb or #rrggbb brand colour"],
    ...AXIS_PATHS.map((path) => [
      code(path),
      `optional, default ${code(String((THEME_SEED_DEFAULTS as Record<string, unknown>)[path]))}`,
      THEME_AXIS_VALUES[path].map((v) => code(String(v))).join(" "),
    ]),
    [code("document"), `optional, default ${code("false")}`, `${code("true")} also emits the ${code("<name>-document")} print companion`],
  ];

  const flagRows = Object.entries(SEED_FLAGS).map(([flag, path]) => [code(`--${flag}`), code(path)]);

  const fontRows = FONT_CATALOG.map((entry) => [
    code(entry.id),
    esc(entry.family),
    code(entry.class),
    entry.roles.map((r) => code(r)).join(" "),
    esc([...new Set(entry.files.map((f) => f.weight))].join(", ") + (entry.variable ? " (variable)" : "")),
    esc(entry.license),
    esc(`${(familyBytes(entry) / 1024).toFixed(0)} KB`),
  ]);

  const manifestRows: string[][] = [
    [code("seed"), "generated themes only", "The generator input, identical to the sibling .seed.json: name, accent and any of the fourteen axes."],
    [code("axes"), "derived", `The fourteen axes as axesFromCss reads them out of the stylesheet — every key required when present; a print companion carries none.`],
    [code("fonts"), "optional", "Self-hosted families the role tokens name: family, license, role (heading | body | ui | mono), optional source. No shipped theme sets it yet."],
    [code("distinctiveness"), "derived", "nearest, axis_distance and token_distance to the closest other shipped theme, written by the pair gate."],
    [code("visual_matrix"), "optional", "false opts the theme out of the full screenshot and axe cross-product into the patterns-only sweep. Absent means the full sweep."],
  ];

  const body = [
    `      <h1>Author a theme</h1>`,
    `      <p data-docs-themes-lede>A theme is a stylesheet of token declarations and nothing else. There are two ways to make one: generate it from a seed and let the gates prove it, or write the tokens by hand and let the same gates read its character back. Either way the manifest beside it is derived, never typed, and the registry refuses a theme that is a look-alike of one it already ships.</p>`,
    `      <nav aria-label="On this page" data-docs-toc data-docs-themes-toc>\n        <ul>\n${toc
      .map(([id, label]) => `          <li><a data-ui="link" href="#${id}">${esc(label)}</a></li>`)
      .join("\n")}\n        </ul>\n      </nav>`,
    section(
      "generate",
      "Generate from a seed",
      `      <p>One brand colour is a complete seed. Every other axis is optional and takes the documented default, which together describe the shipped ${code(
        "default",
      )} theme.</p>\n` +
        `      <pre tabindex="0"><code>${esc(
          'faqir theme generate my-brand --accent "oklch(0.55 0.2 150)"\nfaqir theme generate my-brand --seed my-brand.seed.json --depth hard --motion snappy\n\n# writes themes/my-brand.css  .theme.json  .seed.json  .preview.html',
        )}</code></pre>\n` +
        `      <p>Flags deep-merge over ${code("--seed <file>")} and win. Other options: ${code("--out <dir>")} (default ${code(
          "themes/",
        )}), ${code("--document")}, ${code("--legacy-blocks")} (three colour blocks instead of one ${code(
          "light-dark()",
        )} block), ${code("--allow-similar")} (write past a distinctiveness collision), ${code(
          "--radius sm|md|lg",
        )} (the 1.0 flag, mapped onto ${code("shape.radius")} as crisp | soft | round) and ${code(
          "--json",
        )} (the full scorecard). One coupling to know: ${esc(PILL_COUPLING)}</p>\n` +
        `      <h3 id="seed-format">The seed file</h3>\n` +
        table(["Field", "Presence", "Values"], seedFieldRows, "No fields.") +
        `\n      <h3 id="seed-flags">One flag per leaf</h3>\n` +
        table(["Flag", "Seed path"], flagRows, "No flags.") +
        (sample?.manifest?.seed
          ? `\n      <p>A shipped seed, for shape — ${code(`registry/themes/${sample.name}.seed.json`)}:</p>\n      <pre tabindex="0"><code>${esc(
              readSeed(ctx.registryRoot, sample.name) ?? JSON.stringify(sample.manifest.seed, null, 2),
            )}</code></pre>`
          : ""),
    ),
    section(
      "scorecard",
      "The scorecard",
      `      <p>${code("generateThemeBundle")} is a pure function: CSS string in, objects out, and it runs four checks in memory before anything is written — text contrast at AA 4.5:1 for sixteen pairs per scheme, elevation (an adjacent OKLab ΔE of at least 0.03 up the bg → surface-1 → surface-2 ramp, borders included), token parity against the base surface, and an axes round trip through the real ${code(
        "axesFromCss",
      )} that must derive the seed back. ${code("--json")} prints everything it learned:</p>\n` +
        table(
          ["Block", "What it records"],
          [
            [code("seed"), "the seed filled out to every axis — byte-identical to <name>.seed.json"],
            [code("axes"), "the fourteen axes the emitted CSS derives back to"],
            [code("generated"), "each file written: kind (theme | document), css, manifest, preview, seed"],
            [code("contrast"), "every text pair, per scheme, with its ratio and whether it passed"],
            [code("elevation"), "each bg → surface step with its ΔE against the 0.03 floor"],
            [code("focus_ring"), "--color-ring against five surfaces at 3:1; a translucent ring is a finding, not a skip"],
            [code("tap_targets"), "control heights at the seed's density against the 24px minimum"],
            [code("distinctiveness"), `nearest peer, axis_distance, token_distance, the axes that differ, thresholds, passes`],
          ],
          "No blocks.",
        ),
    ),
    section(
      "gate",
      "The distinctiveness gate",
      `      <p>Two shipped themes must differ on at least ${AXIS_MIN} of the ${THEME_DERIVED_AXES.length} axes, and their colour surfaces must sit at least ${TOKEN_MIN} apart in mean OKLab ΔE over every ${code(
        "color-*",
      )} token, in every scheme both ship. The colour floor is not a fresh number: it is the separation the framework already demands between a card and the page under it, so a theme closer to another than that is a colourway of it whatever its axes say. Accents count as different at ${ACCENT_HUE_BUCKET_DEG}° of hue or ${ACCENT_CHROMA_BUCKET} of chroma.</p>\n` +
        `      <p>${code("faqir theme generate")} measures against whatever is already in ${code(
          "--out",
        )} and refuses with every collision named — the axes that are identical, the ΔE and the sample count — unless ${code(
          "--allow-similar",
        )} is passed. In the repository the same rule is a test: ${code(
          "tests/themes/distinctiveness.test.ts",
        )} pins the thresholds and sweeps every shipped pair with zero exemptions, and ${code(
          "tests/themes/generated-themes.test.ts",
        )} regenerates every seeded theme and its companions and compares the committed CSS byte for byte. Each theme's own numbers are on its page under Distinctiveness.</p>`,
    ),
    section(
      "light-dark",
      "Authoring both schemes",
      `      <p>The one-block form is preferred since 1.1: each scheme-dependent token states both sides with ${code(
        "light-dark()",
      )}, which reads ${code("color-scheme")} — and ${code("registry/base/reset.css")} maps ${code(
        "data-theme",
      )} onto it once, so ${code("auto")} follows the OS with no ${code("prefers-color-scheme")} mirror in the theme.${
        excerpt ? ` From ${code(`registry/themes/${excerpt.name}.css`)}:` : ""
      }</p>\n` +
        (excerpt ? `      <pre tabindex="0"><code>${esc(excerpt.css)}</code></pre>\n` : "") +
        `      <p>Two consequences. The light side can no longer be inherited from the base tokens — a token cannot read its own base value — so the one-block form restates it, and ${code(
          "tests/themes/light-dark.test.ts",
        )} compares every restated light value against the base. And the shadow ramp stays in blocks: ${code(
          "light-dark()",
        )} is a colour function, and a shadow list whose two schemes differ in geometry has no honest one-block spelling. The three-block form — ${code(
          ":root",
        )}, ${code('[data-theme="dark"]')} and a ${code("prefers-color-scheme")} mirror for ${code(
          '[data-theme="auto"]',
        )} — is still accepted, and ${code("--legacy-blocks")} emits it.</p>`,
    ),
    section(
      "rules",
      "What a theme may contain",
      `      <p>Declarations only. ${code("tests/themes/coverage.test.ts")} holds every shipped stylesheet to two rules:</p>\n` +
        `      <ul>\n` +
        `        <li>No selector mentions a protocol attribute — ${code("data-ui")}, ${code("data-part")}, ${code(
          "data-variant",
        )}, ${code("data-size")} or ${code("data-state")}. A theme is tokens; a rule that selects a component is a change no manifest can describe.</li>\n` +
        `        <li>Every selector is ${code(":root")} or a sanctioned modifier: ${code('[data-theme="dark"]')}, ${code(
          '[data-theme="auto"]',
        )} or ${code(':root [data-theme="dark"]')}. ${code("@media")} and ${code("@supports")} may nest them; nothing else opens a block.</li>\n` +
        `      </ul>\n` +
        `      <p>The generator obeys three more, each gated: a renderer names only tokens the base layer already declares (a theme that invents a token invents an axis nobody reads), every declaration lands in one ${code(
          ":root",
        )} block, and the classifier must read each family back to the value that produced it. An authored theme drops into ${code(
          "registry/themes/",
        )} with an editorial entry in ${code("scripts/gen-theme-manifests.mjs")}, then ${code(
          "bun run gen:theme-manifests",
        )} derives its manifest; a project theme is ${code("faqir theme create <name>")}, which writes a commented template to ${code(
          "<output_dir>/tokens/theme-<name>.css",
        )}.</p>`,
    ),
    section(
      "scoped",
      "Scoped themes and data-skin",
      `      <p>A theme declares its tokens on ${code(":root")}, which is the whole page. ${code(
        "faqir theme bundle <name> --scope",
      )} rewrites those declarations onto a subtree so two themes can be live at once — a customer's brand previewed inside your admin, a gallery, two candidates side by side.</p>\n` +
        `      <pre tabindex="0"><code>${esc(
          `faqir theme bundle aurora --scope                 # → aurora.scoped.css under ${defaultScopeSelector("aurora")}\nfaqir theme bundle aurora --scope=".brand-preview"  # your own selector\nfaqir theme bundle aurora --scope --json           # the rewrite report\n\n<link rel="stylesheet" href="ui/faqir.bundle.css">\n<link rel="stylesheet" href="ui/aurora.scoped.css">\n<div data-skin="aurora">…resolves aurora's tokens…</div>`,
        )}</code></pre>\n` +
        `      <p>The rewrite is structural, not textual: the sheet is parsed into blocks with comments and strings masked, and only preludes are edited. ${code(
          ":root",
        )} becomes the scope selector; every ${code("[data-theme]")} block becomes both the compound form ${code(
          '[data-skin="x"][data-theme="dark"]',
        )} and the descendant form ${code('[data-skin="x"] [data-theme="dark"]')}, so a scheme switch inside an island switches the island. ${code(
          "@media",
        )}, ${code("@supports")}, ${code("@container")}, ${code("@layer")} and ${code(
          "@scope",
        )} are descended; ${code("@page")} is left as authored and reported. The scope root restates ${code(
          "color-scheme",
        )}, ${code("color")}, ${code("background-color")}, ${code("background-image")} and ${code(
          "font-family",
        )} — the five the reset declares on the document — and ${code(
          "light-dark()",
        )} passes through untouched because it resolves against that ${code(
          "color-scheme",
        )}. The token set before and after must be identical or the transform throws. A theme with a print companion bundles both, each to its own ${code(
          "data-skin",
        )}; an explicit selector names one subtree and leaves the companion to a second run.</p>`,
    ),
    section(
      "fonts",
      "Self-hosted fonts",
      `      <p>${code("faqir fonts add <family> [--role heading|body|ui|mono]")} installs one family from a curated catalogue of ${FONT_CATALOG.length} SIL Open Font License families, pinned to versioned jsDelivr Fontsource URLs with a SHA-256 per file. Every file is downloaded and verified — WOFF2 signature, declared length, hash — before a single byte is written; a dead URL leaves no files, no stylesheet and no config change.</p>\n` +
        `      <pre tabindex="0"><code>${esc(
          "faqir fonts list\nfaqir fonts add fraunces --role heading\nfaqir fonts add inter --role body --role ui\nfaqir fonts remove fraunces",
        )}</code></pre>\n` +
        `      <p>What ${code("fonts add")} writes: ${code("<output_dir>/fonts/<id>/*.woff2")} (Latin and Latin-extended subsets, one ${code(
          "@font-face",
        )} each), a managed ${code("<output_dir>/fonts.css")} rendered whole from the config — it carries a managed marker and the CLI refuses to overwrite a ${code(
          "fonts.css",
        )} without one — with a ${code(":root")} block that sets ${code("--font-heading")}, ${code("--font-body")}, ${code(
          "--font-ui",
        )} or ${code("--font-mono")} to the family plus its same-class fallback stack, and a ${code(
          "fonts",
        )} entry of ${code("{ id, roles }")} in ${code("faqir.config.json")}. A role has exactly one family, so assigning it displaces the previous holder (its files stay until ${code(
          "fonts remove",
        )}); omit ${code("--role")} for the family's first catalogued role. The bundle is regenerated when ${code(
          "faqir.bundle.css",
        )} exists, and ${code("fonts.css")} is linked after the theme so the role tokens win.</p>\n` +
        table(["Id", "Family", "Class", "Roles", "Weights", "Licence", "Size"], fontRows, "No families."),
    ),
    section(
      "manifest",
      "Manifest fields",
      `      <p>Schema 1.1 added five optional fields to the theme manifest (${code(
        "manifest.schema.json")}, validated by ${code("validateThemeManifest")}). Two are derived and written by generators, exactly like ${code(
        "tokens_overridden",
      )} has been since 0.4.</p>\n` + table(["Field", "Presence", "Meaning"], manifestRows, "No fields."),
    ),
    `      <p>See also: <a data-ui="link" href="${u(THEME_AXES_PAGE)}">the fourteen axes</a> · <a data-ui="link" href="${u(
      THEMES_PAGE,
    )}">every theme side by side</a>.</p>`,
  ].join("\n");

  return {
    path: pagePath,
    content: renderShell({
      pagePath,
      title: `Author a theme · ${ctx.config.title}`,
      description:
        "Generate a Faqir theme from a seed, author one by hand with light-dark(), scope it with data-skin, self-host its fonts, and read its manifest.",
      body,
      config: ctx.config,
      components: ctx.components,
      themes: ctx.themes,
      current: pagePath,
      layout: "reference",
      scripts: [],
    }),
  };
}
