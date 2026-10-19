// The curated OFL font catalog `faqir fonts add` installs from (task 1.1A-18,
// FAQIR-VISION §5.5 and ratified decision 3).
//
// ── Why a pinned catalog, and not a Google Fonts <link> ──────────────────────
//
// A `<link href="fonts.googleapis.com/…">` is a third-party request on every
// page load: a second origin in the critical path, a DNS + TLS round trip
// before any text can paint, and a record of the reader's visit sent somewhere
// the project does not control. A Faqir project has no build step and no
// runtime dependency, so the same reasoning that keeps the registry offline-
// first applies to type: the bytes are downloaded ONCE, by the CLI, verified
// against a hash pinned here, and then served from the project's own directory
// like any other asset.
//
// Every family below is licensed under the SIL Open Font License, which is what
// makes self-hosting legal without further permission. `license` records the
// version the upstream metadata declares; nothing here is installed that does
// not say OFL.
//
// ── How the pins were derived, and how to add a family ───────────────────────
//
// The URLs point at Fontsource's npm packages on jsDelivr, addressed by exact
// version — an immutable URL, unlike a `@latest` or a bare Google Fonts CSS
// endpoint, which is the property that makes a hash pin mean anything. For one
// family:
//
//   V=5.3.0; P=@fontsource-variable/lora        # or @fontsource/<id>, if static
//   curl -sS "https://cdn.jsdelivr.net/npm/$P@$V/metadata.json"   # family, license, wght range
//   curl -sS "https://cdn.jsdelivr.net/npm/$P@$V/unicode.json"    # the subset ranges below
//   curl -sSO "https://cdn.jsdelivr.net/npm/$P@$V/files/lora-latin-wght-normal.woff2"
//   shasum -a 256 lora-latin-wght-normal.woff2
//
// An italic row is the same procedure on the `-italic` twin of each upright
// file (`lora-latin-wght-italic.woff2`; `ibm-plex-serif-latin-400-italic.woff2`
// for a static family), taken only when `metadata.json`'s `styles` lists
// "italic" — `<wght|weight>-italic.css` in the same package confirms the
// face's `font-weight` and `unicode-range` match the upright row's.
//
// A new family needs a row here AND a row in `FAMILY_CLASSES`
// (`src/theme/axes.ts`), because `class` below is a claim about what
// `axesFromCss` will report for a stylesheet that names it —
// `tests/commands/fonts.test.ts` checks the two agree for all sixteen.
//
// ── What is deliberately NOT here ────────────────────────────────────────────
//
// * The non-Latin subsets. A real omission, not an oversight: a project that
//   needs Cyrillic is past what a curated list can decide for it, and the file
//   layout here (one directory per family, one `@font-face` per subset) is what
//   a hand-added face slots into.
// * Italics for Manrope, Space Grotesk and Bricolage Grotesque. Their Fontsource
//   packages ship `styles: ["normal"]` only, so there is nothing to pin, and
//   `--italic` refuses them by name; emphasis in them is a browser-slanted
//   upright. Every other family carries an `italics` row (opt-in with
//   `faqir fonts add <family> --italic`, the same download → hash check →
//   all-or-nothing write as the upright faces), pinned by the procedure above
//   from the bytes themselves: Fontsource's `…-wght-italic.woff2` (variable) or
//   `…-<weight>-italic.woff2` (static, the same weights as the upright rows)
//   beside the upright files, at the same package version, with the same
//   subsets and `unicode-range`s. `tests/commands/forecraft-italics.test.ts`
//   holds every italic row to its upright twin.
// * `size-adjust` / `ascent-override` metrics, which would let a fallback face
//   occupy the same space as the webfont and remove the layout shift on swap.
//   They cannot be written by hand — they are measured out of the font's `head`
//   and `hhea` tables — so they wait for a metrics extractor (see the 1.1 plan's
//   note on this task).

import { PAIRING_STACKS } from "../theme/families";
import type { Axis } from "../theme/seed";
import type { ThemeFont } from "../theme-manifest";

/** The role tokens a self-hosted family may be pointed at. */
export type FontRole = ThemeFont["role"];

/** The `type.pairing` classes a catalogued family can belong to. */
export type FontClass = Exclude<Axis<"type.pairing">, "custom">;

/**
 * The two Latin subsets this catalog installs, with the `unicode-range` each
 * covers. Verified identical across all sixteen families' `unicode.json`
 * (they are Google's standard subset definitions), which is why they are two
 * shared constants rather than a field on every file.
 *
 * The overlap on U+0304/0308/0329 is upstream's and is kept verbatim: the
 * combining marks are in both subsets so a decomposed character renders from
 * whichever file the browser already has.
 */
export const UNICODE_RANGES = {
  latin:
    "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329," +
    "U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD",
  "latin-ext":
    "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329," +
    "U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F," +
    "U+A720-A7FF",
} as const;

export type FontSubset = keyof typeof UNICODE_RANGES;

/** One WOFF2 file: where it comes from, what it must hash to, what it covers. */
export interface CatalogFile {
  /** Basename on disk, under `<output_dir>/fonts/<id>/`. */
  file: string;
  /** Which Latin subset, i.e. which `unicode-range` the `@font-face` carries. */
  subset: FontSubset;
  /** The `font-weight` descriptor: a range for a variable face, else one value. */
  weight: string;
  /** Size in bytes, so `fonts list` can price a family before downloading it. */
  bytes: number;
  /** Lowercase hex SHA-256 the downloaded bytes must match, or nothing is written. */
  sha256: string;
  /** Immutable, version-pinned download URL. */
  url: string;
}

/** A catalogued family, before its fallback stack is resolved. */
interface CatalogFamilyInput {
  id: string;
  family: string;
  license: string;
  licenseUrl: string;
  class: FontClass;
  roles: readonly FontRole[];
  variable: boolean;
  /** The upright (`font-style: normal`) faces — what every install gets. */
  files: readonly CatalogFile[];
  /**
   * The true-italic faces, installed only on request (`--italic`): one per
   * upright file, same subset and weight. Absent means the family's upstream
   * package ships no italic, so the catalog pins none.
   */
  italics?: readonly CatalogFile[];
}

/** A catalogued family as callers see it: the row plus its resolved fallback. */
export interface CatalogEntry extends CatalogFamilyInput {
  /**
   * What follows the family in a role token's stack — the same-class substitutes
   * `PAIRING_STACKS` names, minus the family itself. Always ends in a CSS
   * generic, so a reader who blocks webfonts still gets the right silhouette.
   */
  fallback: string;
}

const FAMILIES: readonly CatalogFamilyInput[] = [
  {
    id: "inter",
    family: "Inter",
    license: "OFL-1.1",
    licenseUrl: "https://openfontlicense.org",
    class: "sans-grotesque",
    roles: ["body", "ui", "heading"],
    variable: true,
    files: [
      {
        file: "inter-latin-wght-normal.woff2",
        subset: "latin",
        weight: "100 900",
        bytes: 48256,
        sha256: "3100e775e8616cd2611beecfa23a4263d7037586789b43f035236a2e6fbd4c62",
        url: "https://cdn.jsdelivr.net/npm/@fontsource-variable/inter@5.3.0/files/inter-latin-wght-normal.woff2",
      },
      {
        file: "inter-latin-ext-wght-normal.woff2",
        subset: "latin-ext",
        weight: "100 900",
        bytes: 85068,
        sha256: "34b9c504cab7a73e37b746343a449132e56cf7b5481af2cb81dc74dcff25c956",
        url: "https://cdn.jsdelivr.net/npm/@fontsource-variable/inter@5.3.0/files/inter-latin-ext-wght-normal.woff2",
      },
    ],
    italics: [
      {
        file: "inter-latin-wght-italic.woff2",
        subset: "latin",
        weight: "100 900",
        bytes: 51832,
        sha256: "7291b5970da2237441273c03b424a504b70b18f09791473fab99687dcc314720",
        url: "https://cdn.jsdelivr.net/npm/@fontsource-variable/inter@5.3.0/files/inter-latin-wght-italic.woff2",
      },
      {
        file: "inter-latin-ext-wght-italic.woff2",
        subset: "latin-ext",
        weight: "100 900",
        bytes: 91900,
        sha256: "71254244ccb1ec21e14db3480fef6f6826d1136dc4aca1c7d3ca7ce31294fcce",
        url: "https://cdn.jsdelivr.net/npm/@fontsource-variable/inter@5.3.0/files/inter-latin-ext-wght-italic.woff2",
      },
    ],
  },
  {
    id: "geist",
    family: "Geist",
    license: "OFL-1.1",
    licenseUrl: "https://openfontlicense.org",
    class: "sans-grotesque",
    roles: ["ui", "body", "heading"],
    variable: true,
    files: [
      {
        file: "geist-latin-wght-normal.woff2",
        subset: "latin",
        weight: "100 900",
        bytes: 29400,
        sha256: "19f9c92546aa300c312235e3125af1b81394d8db9a4bc4a425cd5b641d2d54e1",
        url: "https://cdn.jsdelivr.net/npm/@fontsource-variable/geist@5.3.0/files/geist-latin-wght-normal.woff2",
      },
      {
        file: "geist-latin-ext-wght-normal.woff2",
        subset: "latin-ext",
        weight: "100 900",
        bytes: 16512,
        sha256: "824f485b5d26e2f2da3c2b236132ece1bc8e4e43373452950bb0e40548b4313f",
        url: "https://cdn.jsdelivr.net/npm/@fontsource-variable/geist@5.3.0/files/geist-latin-ext-wght-normal.woff2",
      },
    ],
    italics: [
      {
        file: "geist-latin-wght-italic.woff2",
        subset: "latin",
        weight: "100 900",
        bytes: 31008,
        sha256: "9b10496762af92659f3b05d2b084b0c8f962c3ecdf637aa764e3b7fd17f5acaf",
        url: "https://cdn.jsdelivr.net/npm/@fontsource-variable/geist@5.3.0/files/geist-latin-wght-italic.woff2",
      },
      {
        file: "geist-latin-ext-wght-italic.woff2",
        subset: "latin-ext",
        weight: "100 900",
        bytes: 17892,
        sha256: "56dc9ac98e3fc45e7ee487d03ee205b35858c672f2e15053eabbb119c0bc1e74",
        url: "https://cdn.jsdelivr.net/npm/@fontsource-variable/geist@5.3.0/files/geist-latin-ext-wght-italic.woff2",
      },
    ],
  },
  {
    id: "manrope",
    family: "Manrope",
    license: "OFL-1.1",
    licenseUrl: "https://openfontlicense.org",
    class: "sans-grotesque",
    roles: ["heading", "ui", "body"],
    variable: true,
    files: [
      {
        file: "manrope-latin-wght-normal.woff2",
        subset: "latin",
        weight: "200 800",
        bytes: 24836,
        sha256: "a30ddcd349703aff7464c34bef3fffdff405ee50c113440d7c8693c02d210972",
        url: "https://cdn.jsdelivr.net/npm/@fontsource-variable/manrope@5.3.0/files/manrope-latin-wght-normal.woff2",
      },
      {
        file: "manrope-latin-ext-wght-normal.woff2",
        subset: "latin-ext",
        weight: "200 800",
        bytes: 15120,
        sha256: "3911b66d9f2e005a4b989223405d0e5032619c668597ba467cc76a23c8fffcfb",
        url: "https://cdn.jsdelivr.net/npm/@fontsource-variable/manrope@5.3.0/files/manrope-latin-ext-wght-normal.woff2",
      },
    ],
  },
  {
    id: "dm-sans",
    family: "DM Sans",
    license: "OFL-1.1",
    licenseUrl: "https://openfontlicense.org",
    class: "sans-geometric",
    roles: ["heading", "body", "ui"],
    variable: true,
    files: [
      {
        file: "dm-sans-latin-wght-normal.woff2",
        subset: "latin",
        weight: "100 1000",
        bytes: 36932,
        sha256: "9fea608a947e67020c33cad9a6fe3d60c54119dfb8cff87768a8117a15ed7543",
        url: "https://cdn.jsdelivr.net/npm/@fontsource-variable/dm-sans@5.3.0/files/dm-sans-latin-wght-normal.woff2",
      },
      {
        file: "dm-sans-latin-ext-wght-normal.woff2",
        subset: "latin-ext",
        weight: "100 1000",
        bytes: 18228,
        sha256: "a5d38fe99f930275684999b462c7123faa063d9e44e73b4b241723d884aa0f49",
        url: "https://cdn.jsdelivr.net/npm/@fontsource-variable/dm-sans@5.3.0/files/dm-sans-latin-ext-wght-normal.woff2",
      },
    ],
    italics: [
      {
        file: "dm-sans-latin-wght-italic.woff2",
        subset: "latin",
        weight: "100 1000",
        bytes: 39712,
        sha256: "f1a235db5bcb8730707844188d35201ecdf63e56c5dcce97bab24a9c7066091d",
        url: "https://cdn.jsdelivr.net/npm/@fontsource-variable/dm-sans@5.3.0/files/dm-sans-latin-wght-italic.woff2",
      },
      {
        file: "dm-sans-latin-ext-wght-italic.woff2",
        subset: "latin-ext",
        weight: "100 1000",
        bytes: 20808,
        sha256: "6e646d2022808fb4532e77d38a9348e4dcf832796be2acc43a79052b60900db2",
        url: "https://cdn.jsdelivr.net/npm/@fontsource-variable/dm-sans@5.3.0/files/dm-sans-latin-ext-wght-italic.woff2",
      },
    ],
  },
  {
    id: "space-grotesk",
    family: "Space Grotesk",
    license: "OFL-1.1",
    licenseUrl: "https://openfontlicense.org",
    class: "sans-grotesque",
    roles: ["heading", "ui"],
    variable: true,
    files: [
      {
        file: "space-grotesk-latin-wght-normal.woff2",
        subset: "latin",
        weight: "300 700",
        bytes: 22288,
        sha256: "0640890476fc1198ab4de571fb658de443c4d85b66466ec09534a8737ab1ce9d",
        url: "https://cdn.jsdelivr.net/npm/@fontsource-variable/space-grotesk@5.3.0/files/space-grotesk-latin-wght-normal.woff2",
      },
      {
        file: "space-grotesk-latin-ext-wght-normal.woff2",
        subset: "latin-ext",
        weight: "300 700",
        bytes: 18940,
        sha256: "952dddb45d2f96f71cbf3b7f510b24379afc3c89ea02fcf89d377b45d62c0166",
        url: "https://cdn.jsdelivr.net/npm/@fontsource-variable/space-grotesk@5.3.0/files/space-grotesk-latin-ext-wght-normal.woff2",
      },
    ],
  },
  {
    id: "bricolage-grotesque",
    family: "Bricolage Grotesque",
    license: "OFL-1.1",
    licenseUrl: "https://openfontlicense.org",
    class: "sans-grotesque",
    roles: ["heading"],
    variable: true,
    files: [
      {
        file: "bricolage-grotesque-latin-wght-normal.woff2",
        subset: "latin",
        weight: "200 800",
        bytes: 41344,
        sha256: "a97804dc9fbe5fc972a08018c5eda4dab7ef2346f64c57e61419d05e6de4ea1c",
        url: "https://cdn.jsdelivr.net/npm/@fontsource-variable/bricolage-grotesque@5.3.0/files/bricolage-grotesque-latin-wght-normal.woff2",
      },
      {
        file: "bricolage-grotesque-latin-ext-wght-normal.woff2",
        subset: "latin-ext",
        weight: "200 800",
        bytes: 18668,
        sha256: "e808f16b56f84dc7933e498cc8a41d4a5cd853adc6eef154584baa5de1008b15",
        url: "https://cdn.jsdelivr.net/npm/@fontsource-variable/bricolage-grotesque@5.3.0/files/bricolage-grotesque-latin-ext-wght-normal.woff2",
      },
    ],
  },
  {
    id: "ibm-plex-sans",
    family: "IBM Plex Sans",
    license: "OFL-1.1",
    licenseUrl: "https://openfontlicense.org",
    class: "sans-grotesque",
    roles: ["body", "ui", "heading"],
    variable: true,
    files: [
      {
        file: "ibm-plex-sans-latin-wght-normal.woff2",
        subset: "latin",
        weight: "100 700",
        bytes: 45712,
        sha256: "e2291e842cf5af167122a22881a740c7f2dda7716f1e8cd76680264f4a859470",
        url: "https://cdn.jsdelivr.net/npm/@fontsource-variable/ibm-plex-sans@5.3.0/files/ibm-plex-sans-latin-wght-normal.woff2",
      },
      {
        file: "ibm-plex-sans-latin-ext-wght-normal.woff2",
        subset: "latin-ext",
        weight: "100 700",
        bytes: 30964,
        sha256: "d160e20920ae4d6556518d352d3af27a74e9b0de3d8fe17b1c1044fc75aa2f81",
        url: "https://cdn.jsdelivr.net/npm/@fontsource-variable/ibm-plex-sans@5.3.0/files/ibm-plex-sans-latin-ext-wght-normal.woff2",
      },
    ],
    italics: [
      {
        file: "ibm-plex-sans-latin-wght-italic.woff2",
        subset: "latin",
        weight: "100 700",
        bytes: 50184,
        sha256: "4363757d2695c7633f98472855849f7c30528eba869d7968ee35b58c87cf14c1",
        url: "https://cdn.jsdelivr.net/npm/@fontsource-variable/ibm-plex-sans@5.3.0/files/ibm-plex-sans-latin-wght-italic.woff2",
      },
      {
        file: "ibm-plex-sans-latin-ext-wght-italic.woff2",
        subset: "latin-ext",
        weight: "100 700",
        bytes: 33900,
        sha256: "bf44b77cc751203b2f0ce95c048a9d8f984313f84b58106c7c4410ca50314016",
        url: "https://cdn.jsdelivr.net/npm/@fontsource-variable/ibm-plex-sans@5.3.0/files/ibm-plex-sans-latin-ext-wght-italic.woff2",
      },
    ],
  },
  {
    id: "ibm-plex-serif",
    family: "IBM Plex Serif",
    license: "OFL-1.1",
    licenseUrl: "https://openfontlicense.org",
    class: "serif-editorial",
    roles: ["body", "heading"],
    variable: false,
    files: [
      {
        file: "ibm-plex-serif-latin-400-normal.woff2",
        subset: "latin",
        weight: "400",
        bytes: 19580,
        sha256: "cb2c5eee2c0a43ff30d2365407c7bc8b20e3bd90720a4a64102ba0b328022a02",
        url: "https://cdn.jsdelivr.net/npm/@fontsource/ibm-plex-serif@5.3.0/files/ibm-plex-serif-latin-400-normal.woff2",
      },
      {
        file: "ibm-plex-serif-latin-700-normal.woff2",
        subset: "latin",
        weight: "700",
        bytes: 19904,
        sha256: "886ea167faf6610c3448a7dd058dbe7c7438f710229c9ff52343ef006960939c",
        url: "https://cdn.jsdelivr.net/npm/@fontsource/ibm-plex-serif@5.3.0/files/ibm-plex-serif-latin-700-normal.woff2",
      },
      {
        file: "ibm-plex-serif-latin-ext-400-normal.woff2",
        subset: "latin-ext",
        weight: "400",
        bytes: 15476,
        sha256: "8b4077bd28d36819590924090252e811d4d0b2c78cb4bf1e4abe46d7428a2781",
        url: "https://cdn.jsdelivr.net/npm/@fontsource/ibm-plex-serif@5.3.0/files/ibm-plex-serif-latin-ext-400-normal.woff2",
      },
      {
        file: "ibm-plex-serif-latin-ext-700-normal.woff2",
        subset: "latin-ext",
        weight: "700",
        bytes: 15568,
        sha256: "4c47e5be83b18b0851ffb58d6ec94ef439bd52a190b66ea479cfb19298720f68",
        url: "https://cdn.jsdelivr.net/npm/@fontsource/ibm-plex-serif@5.3.0/files/ibm-plex-serif-latin-ext-700-normal.woff2",
      },
    ],
    italics: [
      {
        file: "ibm-plex-serif-latin-400-italic.woff2",
        subset: "latin",
        weight: "400",
        bytes: 20900,
        sha256: "d3f861b1ca55e50ca94de4c1756cb0d67c73de615172adf6b5b2078d939c723a",
        url: "https://cdn.jsdelivr.net/npm/@fontsource/ibm-plex-serif@5.3.0/files/ibm-plex-serif-latin-400-italic.woff2",
      },
      {
        file: "ibm-plex-serif-latin-700-italic.woff2",
        subset: "latin",
        weight: "700",
        bytes: 21336,
        sha256: "8cf0a1103f7785a0b457568d47467d40f2283c9f743a82a80c77b8acf6e7db47",
        url: "https://cdn.jsdelivr.net/npm/@fontsource/ibm-plex-serif@5.3.0/files/ibm-plex-serif-latin-700-italic.woff2",
      },
      {
        file: "ibm-plex-serif-latin-ext-400-italic.woff2",
        subset: "latin-ext",
        weight: "400",
        bytes: 16296,
        sha256: "68091cb647810f7ac24fb72fe7ac506ffc4769ef51435a87969345249fc7f035",
        url: "https://cdn.jsdelivr.net/npm/@fontsource/ibm-plex-serif@5.3.0/files/ibm-plex-serif-latin-ext-400-italic.woff2",
      },
      {
        file: "ibm-plex-serif-latin-ext-700-italic.woff2",
        subset: "latin-ext",
        weight: "700",
        bytes: 16588,
        sha256: "683b44b3a162d257171b19d98a66abd27ba811c2eafd94cb39b484f875746ebb",
        url: "https://cdn.jsdelivr.net/npm/@fontsource/ibm-plex-serif@5.3.0/files/ibm-plex-serif-latin-ext-700-italic.woff2",
      },
    ],
  },
  {
    id: "ibm-plex-mono",
    family: "IBM Plex Mono",
    license: "OFL-1.1",
    licenseUrl: "https://openfontlicense.org",
    class: "mono",
    roles: ["mono"],
    variable: false,
    files: [
      {
        file: "ibm-plex-mono-latin-400-normal.woff2",
        subset: "latin",
        weight: "400",
        bytes: 14708,
        sha256: "08949f728dc52d528e69b1667d15c89a5686a4ee9a296ff90983985f99c380f7",
        url: "https://cdn.jsdelivr.net/npm/@fontsource/ibm-plex-mono@5.3.0/files/ibm-plex-mono-latin-400-normal.woff2",
      },
      {
        file: "ibm-plex-mono-latin-700-normal.woff2",
        subset: "latin",
        weight: "700",
        bytes: 14908,
        sha256: "4f84d86cfd060f4ded334358ff8a4c81d4db2ed5addd568359d693f44a87765a",
        url: "https://cdn.jsdelivr.net/npm/@fontsource/ibm-plex-mono@5.3.0/files/ibm-plex-mono-latin-700-normal.woff2",
      },
      {
        file: "ibm-plex-mono-latin-ext-400-normal.woff2",
        subset: "latin-ext",
        weight: "400",
        bytes: 13348,
        sha256: "6bc0f226a5b7884a8170e3f62c63d7675609d4631bdc5931b5cdab81821f00eb",
        url: "https://cdn.jsdelivr.net/npm/@fontsource/ibm-plex-mono@5.3.0/files/ibm-plex-mono-latin-ext-400-normal.woff2",
      },
      {
        file: "ibm-plex-mono-latin-ext-700-normal.woff2",
        subset: "latin-ext",
        weight: "700",
        bytes: 13380,
        sha256: "5b9b81f54dd69635c7adcaacd4c4545a73fe4809c528e22734b238a83a74135f",
        url: "https://cdn.jsdelivr.net/npm/@fontsource/ibm-plex-mono@5.3.0/files/ibm-plex-mono-latin-ext-700-normal.woff2",
      },
    ],
    italics: [
      {
        file: "ibm-plex-mono-latin-400-italic.woff2",
        subset: "latin",
        weight: "400",
        bytes: 16448,
        sha256: "0840095faae86403735a8c04014b72cb29e7923646b222b360b7e8252932e4e3",
        url: "https://cdn.jsdelivr.net/npm/@fontsource/ibm-plex-mono@5.3.0/files/ibm-plex-mono-latin-400-italic.woff2",
      },
      {
        file: "ibm-plex-mono-latin-700-italic.woff2",
        subset: "latin",
        weight: "700",
        bytes: 16540,
        sha256: "2bb0d4c82652472446ed1a5a89a0553f2db1e4ea17cbda66a45e690899d83e91",
        url: "https://cdn.jsdelivr.net/npm/@fontsource/ibm-plex-mono@5.3.0/files/ibm-plex-mono-latin-700-italic.woff2",
      },
      {
        file: "ibm-plex-mono-latin-ext-400-italic.woff2",
        subset: "latin-ext",
        weight: "400",
        bytes: 14524,
        sha256: "1b07eee6df7d26b31864581c2365131d384077605e0b63ae67c4a0a64363a6de",
        url: "https://cdn.jsdelivr.net/npm/@fontsource/ibm-plex-mono@5.3.0/files/ibm-plex-mono-latin-ext-400-italic.woff2",
      },
      {
        file: "ibm-plex-mono-latin-ext-700-italic.woff2",
        subset: "latin-ext",
        weight: "700",
        bytes: 14684,
        sha256: "18c8dc28d75ecbda23c88fb11126852b2232916ec2e6d6dc0225def886a0cc98",
        url: "https://cdn.jsdelivr.net/npm/@fontsource/ibm-plex-mono@5.3.0/files/ibm-plex-mono-latin-ext-700-italic.woff2",
      },
    ],
  },
  {
    id: "source-serif-4",
    family: "Source Serif 4",
    license: "OFL-1.1",
    // Upstream's metadata still gives SIL's pre-2023 `http://scripts.sil.org/OFL`
    // here; it is the same licence, and this is the https spelling of its
    // current home — which matters because the URL is emitted into `fonts.css`.
    licenseUrl: "https://openfontlicense.org",
    class: "serif-editorial",
    roles: ["body", "heading"],
    variable: true,
    files: [
      {
        file: "source-serif-4-latin-wght-normal.woff2",
        subset: "latin",
        weight: "200 900",
        bytes: 50824,
        sha256: "c1df4596be5029233ed2afbb8b2f6ea20784b3fb1aa5d6b5c6519ccd85eb3dfb",
        url: "https://cdn.jsdelivr.net/npm/@fontsource-variable/source-serif-4@5.3.0/files/source-serif-4-latin-wght-normal.woff2",
      },
      {
        file: "source-serif-4-latin-ext-wght-normal.woff2",
        subset: "latin-ext",
        weight: "200 900",
        bytes: 42040,
        sha256: "41529a5b38008d9ea01e28ec18693a714a3216669ee477d83a5b9db999369625",
        url: "https://cdn.jsdelivr.net/npm/@fontsource-variable/source-serif-4@5.3.0/files/source-serif-4-latin-ext-wght-normal.woff2",
      },
    ],
    italics: [
      {
        file: "source-serif-4-latin-wght-italic.woff2",
        subset: "latin",
        weight: "200 900",
        bytes: 51516,
        sha256: "663e7ef3037a56dce81dfc33f68c1e6445995ffd8887991b3c0b68a7689c9da5",
        url: "https://cdn.jsdelivr.net/npm/@fontsource-variable/source-serif-4@5.3.0/files/source-serif-4-latin-wght-italic.woff2",
      },
      {
        file: "source-serif-4-latin-ext-wght-italic.woff2",
        subset: "latin-ext",
        weight: "200 900",
        bytes: 44260,
        sha256: "515639854d3566c43860d2005770645c590df8b43a0144c70fe2566c33015ede",
        url: "https://cdn.jsdelivr.net/npm/@fontsource-variable/source-serif-4@5.3.0/files/source-serif-4-latin-ext-wght-italic.woff2",
      },
    ],
  },
  {
    id: "fraunces",
    family: "Fraunces",
    license: "OFL-1.1",
    licenseUrl: "https://openfontlicense.org",
    class: "serif-editorial",
    roles: ["heading"],
    variable: true,
    files: [
      {
        file: "fraunces-latin-wght-normal.woff2",
        subset: "latin",
        weight: "100 900",
        bytes: 36620,
        sha256: "7f9d191d999336d3b9790afa72e1358e50a13b06d4f289341e92a311967a80f9",
        url: "https://cdn.jsdelivr.net/npm/@fontsource-variable/fraunces@5.3.0/files/fraunces-latin-wght-normal.woff2",
      },
      {
        file: "fraunces-latin-ext-wght-normal.woff2",
        subset: "latin-ext",
        weight: "100 900",
        bytes: 33584,
        sha256: "a21ecfbf41fbc393e24ef9b7e38532a27e8da5e0a074aa7d66802d1b5ccec2f0",
        url: "https://cdn.jsdelivr.net/npm/@fontsource-variable/fraunces@5.3.0/files/fraunces-latin-ext-wght-normal.woff2",
      },
    ],
    italics: [
      {
        file: "fraunces-latin-wght-italic.woff2",
        subset: "latin",
        weight: "100 900",
        bytes: 45656,
        sha256: "bceec2ef4d549efbc8df0194a8d5280b6a64c3e399244dffccd9ea1bd9ad6db7",
        url: "https://cdn.jsdelivr.net/npm/@fontsource-variable/fraunces@5.3.0/files/fraunces-latin-wght-italic.woff2",
      },
      {
        file: "fraunces-latin-ext-wght-italic.woff2",
        subset: "latin-ext",
        weight: "100 900",
        bytes: 40528,
        sha256: "877bcc2fd1be299c950d0971578336818ca5818e1e956f12e0d8c6736436ca45",
        url: "https://cdn.jsdelivr.net/npm/@fontsource-variable/fraunces@5.3.0/files/fraunces-latin-ext-wght-italic.woff2",
      },
    ],
  },
  {
    id: "instrument-serif",
    family: "Instrument Serif",
    license: "OFL-1.1",
    licenseUrl: "https://openfontlicense.org",
    class: "serif-modern",
    roles: ["heading"],
    variable: false,
    files: [
      {
        file: "instrument-serif-latin-400-normal.woff2",
        subset: "latin",
        weight: "400",
        bytes: 21032,
        sha256: "5eb09b5ac0e28b67c2f041c8ba6d244604ca0c0980d65912ab2d47fed84ddc31",
        url: "https://cdn.jsdelivr.net/npm/@fontsource/instrument-serif@5.3.0/files/instrument-serif-latin-400-normal.woff2",
      },
      {
        file: "instrument-serif-latin-ext-400-normal.woff2",
        subset: "latin-ext",
        weight: "400",
        bytes: 11604,
        sha256: "290e6267dd833bf5f899eba4c29ad0a9b09dbe53f6075b18af38057159e1ff20",
        url: "https://cdn.jsdelivr.net/npm/@fontsource/instrument-serif@5.3.0/files/instrument-serif-latin-ext-400-normal.woff2",
      },
    ],
    italics: [
      {
        file: "instrument-serif-latin-400-italic.woff2",
        subset: "latin",
        weight: "400",
        bytes: 22128,
        sha256: "5a51946dfffa82972bc98745359c46761515641fda557c25116459a9f83da4a7",
        url: "https://cdn.jsdelivr.net/npm/@fontsource/instrument-serif@5.3.0/files/instrument-serif-latin-400-italic.woff2",
      },
      {
        file: "instrument-serif-latin-ext-400-italic.woff2",
        subset: "latin-ext",
        weight: "400",
        bytes: 12384,
        sha256: "d0014821252a8a770bf7551641572f239a8ede83d75652d84fef0c3627751baf",
        url: "https://cdn.jsdelivr.net/npm/@fontsource/instrument-serif@5.3.0/files/instrument-serif-latin-ext-400-italic.woff2",
      },
    ],
  },
  {
    id: "newsreader",
    family: "Newsreader",
    license: "OFL-1.1",
    licenseUrl: "https://openfontlicense.org",
    class: "serif-editorial",
    roles: ["body", "heading"],
    variable: true,
    files: [
      {
        file: "newsreader-latin-wght-normal.woff2",
        subset: "latin",
        weight: "200 800",
        bytes: 58084,
        sha256: "62981321d9a3cc7a61a73792729043703fd6112da86e8ec848bb57f088578757",
        url: "https://cdn.jsdelivr.net/npm/@fontsource-variable/newsreader@5.3.0/files/newsreader-latin-wght-normal.woff2",
      },
      {
        file: "newsreader-latin-ext-wght-normal.woff2",
        subset: "latin-ext",
        weight: "200 800",
        bytes: 36244,
        sha256: "ac6fa9ed533278f4c8fd3ae44a1fc78c7df736040237ab86fc1160d020af0af2",
        url: "https://cdn.jsdelivr.net/npm/@fontsource-variable/newsreader@5.3.0/files/newsreader-latin-ext-wght-normal.woff2",
      },
    ],
    italics: [
      {
        file: "newsreader-latin-wght-italic.woff2",
        subset: "latin",
        weight: "200 800",
        bytes: 64520,
        sha256: "48bc8861b9b2ca9300747cad4fd6a3b4ac3028d364df00bd1b72097baa75e509",
        url: "https://cdn.jsdelivr.net/npm/@fontsource-variable/newsreader@5.3.0/files/newsreader-latin-wght-italic.woff2",
      },
      {
        file: "newsreader-latin-ext-wght-italic.woff2",
        subset: "latin-ext",
        weight: "200 800",
        bytes: 39684,
        sha256: "d8c263970d52e0b94b3d5d4250d5962fe39f8f3b6fa9ad13b406d73ff3f4b036",
        url: "https://cdn.jsdelivr.net/npm/@fontsource-variable/newsreader@5.3.0/files/newsreader-latin-ext-wght-italic.woff2",
      },
    ],
  },
  {
    id: "lora",
    family: "Lora",
    license: "OFL-1.1",
    licenseUrl: "https://openfontlicense.org",
    class: "serif-editorial",
    roles: ["body", "heading"],
    variable: true,
    files: [
      {
        file: "lora-latin-wght-normal.woff2",
        subset: "latin",
        weight: "400 700",
        bytes: 37788,
        sha256: "ddb8c66035104e233fc024669183aad3738b6daa16deee2ebb1241bd0f98ace1",
        url: "https://cdn.jsdelivr.net/npm/@fontsource-variable/lora@5.3.0/files/lora-latin-wght-normal.woff2",
      },
      {
        file: "lora-latin-ext-wght-normal.woff2",
        subset: "latin-ext",
        weight: "400 700",
        bytes: 20088,
        sha256: "2a2d9c22c9863086a23f5013fede1428585321812b25f2662542c39d02967c5e",
        url: "https://cdn.jsdelivr.net/npm/@fontsource-variable/lora@5.3.0/files/lora-latin-ext-wght-normal.woff2",
      },
    ],
    italics: [
      {
        file: "lora-latin-wght-italic.woff2",
        subset: "latin",
        weight: "400 700",
        bytes: 40772,
        sha256: "d824d807d4d832d12c87932d0b8ec1314dcfd502157a56dee6bb04cf8a3768ae",
        url: "https://cdn.jsdelivr.net/npm/@fontsource-variable/lora@5.3.0/files/lora-latin-wght-italic.woff2",
      },
      {
        file: "lora-latin-ext-wght-italic.woff2",
        subset: "latin-ext",
        weight: "400 700",
        bytes: 21128,
        sha256: "45f989df83f3a9f40007d2ecdea98bff248c8767a1a0bbe60e94fb37b605ecee",
        url: "https://cdn.jsdelivr.net/npm/@fontsource-variable/lora@5.3.0/files/lora-latin-ext-wght-italic.woff2",
      },
    ],
  },
  {
    id: "nunito",
    family: "Nunito",
    license: "OFL-1.1",
    licenseUrl: "https://openfontlicense.org",
    class: "rounded",
    roles: ["body", "ui", "heading"],
    variable: true,
    files: [
      {
        file: "nunito-latin-wght-normal.woff2",
        subset: "latin",
        weight: "200 1000",
        bytes: 39128,
        sha256: "ba344451eab25b217a165363b1982048a5e5830a0daf36577973955a04cac793",
        url: "https://cdn.jsdelivr.net/npm/@fontsource-variable/nunito@5.3.0/files/nunito-latin-wght-normal.woff2",
      },
      {
        file: "nunito-latin-ext-wght-normal.woff2",
        subset: "latin-ext",
        weight: "200 1000",
        bytes: 35588,
        sha256: "2c8d792869818ecb253a46bc3c63c7013df7aac2f69291c3c85e5cdc94160960",
        url: "https://cdn.jsdelivr.net/npm/@fontsource-variable/nunito@5.3.0/files/nunito-latin-ext-wght-normal.woff2",
      },
    ],
    italics: [
      {
        file: "nunito-latin-wght-italic.woff2",
        subset: "latin",
        weight: "200 1000",
        bytes: 41760,
        sha256: "6cfcc3786d5ba3b5c3a41797f95272e57f4290ccbd283a4bfd0033a3d857e64c",
        url: "https://cdn.jsdelivr.net/npm/@fontsource-variable/nunito@5.3.0/files/nunito-latin-wght-italic.woff2",
      },
      {
        file: "nunito-latin-ext-wght-italic.woff2",
        subset: "latin-ext",
        weight: "200 1000",
        bytes: 39072,
        sha256: "1bb48a49c837d76a727223515b78eb2a14eaab783563be84b0718f338c56c846",
        url: "https://cdn.jsdelivr.net/npm/@fontsource-variable/nunito@5.3.0/files/nunito-latin-ext-wght-italic.woff2",
      },
    ],
  },
  {
    id: "jetbrains-mono",
    family: "JetBrains Mono",
    license: "OFL-1.1",
    licenseUrl: "https://openfontlicense.org",
    class: "mono",
    roles: ["mono"],
    variable: true,
    files: [
      {
        file: "jetbrains-mono-latin-wght-normal.woff2",
        subset: "latin",
        weight: "100 800",
        bytes: 40404,
        sha256: "18be452724bfdc236c074ca94a249a7f41a86752c7d04ab258ce9ed5651f6a7e",
        url: "https://cdn.jsdelivr.net/npm/@fontsource-variable/jetbrains-mono@5.3.0/files/jetbrains-mono-latin-wght-normal.woff2",
      },
      {
        file: "jetbrains-mono-latin-ext-wght-normal.woff2",
        subset: "latin-ext",
        weight: "100 800",
        bytes: 15196,
        sha256: "79bfdab9ba467e26eea4122e6f2567e188dd8a09a8c730d501fc487c4ab99c6e",
        url: "https://cdn.jsdelivr.net/npm/@fontsource-variable/jetbrains-mono@5.3.0/files/jetbrains-mono-latin-ext-wght-normal.woff2",
      },
    ],
    italics: [
      {
        file: "jetbrains-mono-latin-wght-italic.woff2",
        subset: "latin",
        weight: "100 800",
        bytes: 42964,
        sha256: "a8afa085e9ca5e53434e2ee918ba6b65c7dd4dda56509976b36591478c99d62e",
        url: "https://cdn.jsdelivr.net/npm/@fontsource-variable/jetbrains-mono@5.3.0/files/jetbrains-mono-latin-wght-italic.woff2",
      },
      {
        file: "jetbrains-mono-latin-ext-wght-italic.woff2",
        subset: "latin-ext",
        weight: "100 800",
        bytes: 16520,
        sha256: "60652c78382d7e5021ce4c3ed8985fc41d8f3d1b1a3bedcec2a44ed8979fe5eb",
        url: "https://cdn.jsdelivr.net/npm/@fontsource-variable/jetbrains-mono@5.3.0/files/jetbrains-mono-latin-ext-wght-italic.woff2",
      },
    ],
  },
];

/** Split a font stack on top-level commas, trimming each family. */
function splitStack(stack: string): string[] {
  return stack
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

/** Whether two stack entries name the same family, ignoring quotes and case. */
function sameFamily(a: string, b: string): boolean {
  const bare = (s: string) => s.replace(/^["']|["']$/g, "").toLowerCase();
  return bare(a) === bare(b);
}

/**
 * The fallback stack for a family: its class's `PAIRING_STACKS` entry with the
 * family removed, so `--font-body: "Inter", <fallback>` never names Inter twice.
 */
export function fallbackFor(cls: FontClass, family: string): string {
  return splitStack(PAIRING_STACKS[cls])
    .filter((entry) => !sameFamily(entry, family))
    .join(", ");
}

/** The curated catalog, each family carrying its resolved fallback stack. */
export const FONT_CATALOG: readonly CatalogEntry[] = FAMILIES.map((entry) => ({
  ...entry,
  fallback: fallbackFor(entry.class, entry.family),
}));

/** Catalog ids, in catalog order — the order `fonts list` prints. */
export const FONT_IDS: readonly string[] = FONT_CATALOG.map((entry) => entry.id);

/**
 * Look a family up by catalog id or by display name, case- and space-insensitively
 * (`fraunces`, `Fraunces`, `IBM Plex Sans` and `ibm-plex-sans` all resolve).
 * Returns null so the caller owns the error message.
 */
export function findFamily(name: string): CatalogEntry | null {
  const key = name.trim().toLowerCase().replace(/[\s_]+/g, "-");
  return (
    FONT_CATALOG.find(
      (entry) => entry.id === key || entry.family.toLowerCase().replace(/\s+/g, "-") === key,
    ) ?? null
  );
}

/** The full stack a role token is set to: the family first, then its fallbacks. */
export function roleStack(entry: CatalogEntry): string {
  return `"${entry.family}", ${entry.fallback}`;
}

/** Total download size of a family's upright faces, in bytes. */
export function familyBytes(entry: CatalogEntry): number {
  return entry.files.reduce((total, file) => total + file.bytes, 0);
}

/** The pinned italic faces of a family — empty when the catalog has none for it. */
export function italicFiles(entry: CatalogEntry): readonly CatalogFile[] {
  return entry.italics ?? [];
}

/**
 * The weights a STATIC family ships, ascending and de-duplicated (`["400", "700"]`
 * for IBM Plex Serif). A variable family covers a range instead, so it returns
 * null: any weight inside the range is drawn, never synthesized.
 */
export function staticWeights(entry: CatalogEntry): number[] | null {
  if (entry.variable) return null;
  return [...new Set(entry.files.map((file) => Number(file.weight)))].sort((a, b) => a - b);
}

/**
 * A static family with exactly one weight (Instrument Serif: 400 only). Asked
 * for a heavier weight — the default heading voice is bold — the browser fakes
 * one by smearing the outlines, which is the one weight a display face designed
 * for 400 never wants.
 */
export function isSingleWeight(entry: CatalogEntry): boolean {
  return staticWeights(entry)?.length === 1;
}
