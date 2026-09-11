// Installing a catalogued family into a project (task 1.1A-18, §5.5).
//
// Everything here is either pure (the state transitions and the `fonts.css`
// renderer) or takes its bytes from a caller, so the command layer owns all of
// the IO and this module can be exercised without a socket or a filesystem.
//
// ── `fonts.css` is DERIVED, not appended to ──────────────────────────────────
//
// The plan describes `add` as appending an `@font-face` and a role block to
// `ui/fonts.css`. What is implemented is the same file rendered WHOLE from the
// install list in `faqir.config.json`, because appending cannot answer the two
// questions the command has to answer anyway: what `remove` takes back out, and
// what a second `add` of the same family does. Rendering from state makes both
// free — re-running `add` is idempotent by construction, and `remove` rewrites
// the file without that family — and it keeps one source of truth for what is
// installed, which is the config the rest of the CLI already reads.
//
// The cost is that a hand-edited `fonts.css` would be overwritten, so it isn't:
// the file carries {@link MANAGED_MARKER}, and a `fonts.css` without that line
// is treated as the user's and refused rather than clobbered.

import { join } from "node:path";
import { sha256Hex } from "../utils/registry-index";
import {
  FONT_CATALOG,
  UNICODE_RANGES,
  findFamily,
  roleStack,
  type CatalogEntry,
  type CatalogFile,
  type FontRole,
} from "./catalog";

/** The managed stylesheet, relative to the project's `output_dir`. */
export const FONTS_CSS_FILENAME = "fonts.css";
/** Where the WOFF2 files live, relative to `output_dir`. */
export const FONTS_DIR = "fonts";
/** Present in every generated `fonts.css`; its absence means the file is the user's. */
export const MANAGED_MARKER = "Managed by `faqir fonts add`";

/** One installed family, as recorded in `faqir.config.json`. */
export interface InstalledFont {
  /** Catalog id (`src/fonts/catalog.ts`). */
  id: string;
  /** The role tokens this family is pointed at. Never empty. */
  roles: FontRole[];
}

/** Which custom property each role sets. */
export const ROLE_TOKENS: Record<FontRole, string> = {
  heading: "--font-heading",
  body: "--font-body",
  ui: "--font-ui",
  mono: "--font-mono",
};

/**
 * The order roles are written in — cascade-irrelevant (they are four different
 * properties) but fixed, so the rendered file is byte-stable.
 */
export const ROLE_ORDER: readonly FontRole[] = ["heading", "body", "ui", "mono"];

/** Catalog position, so the rendered file follows the catalog rather than insertion order. */
function catalogIndex(id: string): number {
  const index = FONT_CATALOG.findIndex((entry) => entry.id === id);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

/** The install list in rendering order: catalog order, roles in {@link ROLE_ORDER}. */
export function normalizeInstalled(fonts: readonly InstalledFont[]): InstalledFont[] {
  return fonts
    .filter((font) => font.roles.length > 0)
    .map((font) => ({
      id: font.id,
      roles: ROLE_ORDER.filter((role) => font.roles.includes(role)),
    }))
    .sort((a, b) => catalogIndex(a.id) - catalogIndex(b.id));
}

/** What {@link assignRoles} changed, so the command can report it honestly. */
export interface AssignResult {
  fonts: InstalledFont[];
  /** Roles taken off another family, as `[role, displacedFamilyId]`. */
  displaced: [FontRole, string][];
  /** Families that held no role afterwards and were dropped from the list. */
  dropped: string[];
}

/**
 * Point `roles` at `entry`, returning the new install list.
 *
 * A role has exactly ONE family — `--font-body` is a single declaration — so
 * assigning a role takes it away from whoever held it, and a family left with
 * no roles leaves the list (its files are then removable). This is why `add` is
 * idempotent: assigning the roles a family already holds is a no-op that still
 * produces the same list.
 */
export function assignRoles(
  fonts: readonly InstalledFont[],
  entry: CatalogEntry,
  roles: readonly FontRole[],
): AssignResult {
  const displaced: [FontRole, string][] = [];
  const next: InstalledFont[] = [];

  for (const font of fonts) {
    if (font.id === entry.id) continue;
    const kept = font.roles.filter((role) => {
      if (!roles.includes(role)) return true;
      displaced.push([role, font.id]);
      return false;
    });
    if (kept.length > 0) next.push({ id: font.id, roles: kept });
  }

  const existing = fonts.find((font) => font.id === entry.id);
  const merged = new Set<FontRole>([...(existing?.roles ?? []), ...roles]);
  next.push({ id: entry.id, roles: [...merged] });

  const dropped = fonts
    .filter((font) => font.id !== entry.id && !next.some((kept) => kept.id === font.id))
    .map((font) => font.id);

  return { fonts: normalizeInstalled(next), displaced, dropped };
}

/** The install list without `id`. Returns null when the family was not installed. */
export function removeFamily(
  fonts: readonly InstalledFont[],
  id: string,
): InstalledFont[] | null {
  if (!fonts.some((font) => font.id === id)) return null;
  return normalizeInstalled(fonts.filter((font) => font.id !== id));
}

/** The `src` url a `@font-face` uses — relative to `fonts.css`, which sits beside `fonts/`. */
export function fontUrlPath(id: string, file: string): string {
  return `${FONTS_DIR}/${id}/${file}`;
}

/** Where a file lands on disk, given the project's resolved output directory. */
export function fontFilePath(outputDir: string, id: string, file: string): string {
  return join(outputDir, FONTS_DIR, id, file);
}

function fontFaceBlock(entry: CatalogEntry, file: CatalogFile): string {
  return [
    "@font-face {",
    `  font-family: "${entry.family}";`,
    "  font-style: normal;",
    `  font-weight: ${file.weight};`,
    "  font-display: swap;",
    `  src: url("${fontUrlPath(entry.id, file.file)}") format("woff2");`,
    `  unicode-range: ${UNICODE_RANGES[file.subset]};`,
    "}",
  ].join("\n");
}

/**
 * Render the whole managed stylesheet from the install list.
 *
 * Deterministic: same list in, same bytes out, whatever order the families were
 * added in. An empty list renders nothing — the caller deletes the file instead
 * of leaving an empty one for the bundler to inline.
 */
export function renderFontsCss(fonts: readonly InstalledFont[]): string {
  const installed = normalizeInstalled(fonts);
  if (installed.length === 0) return "";

  const entries = installed.map((font) => {
    const entry = findFamily(font.id);
    if (!entry) throw new Error(`Unknown font family '${font.id}' in the install list.`);
    return { font, entry };
  });

  const out: string[] = [
    "/* Faqir UI — self-hosted fonts, licensed under the SIL Open Font License.",
    ` * ${MANAGED_MARKER} / \`faqir fonts remove\`: hand edits are overwritten.`,
    " * Bundled after the theme, so the role tokens below win over it.",
    " */",
    "",
  ];

  for (const { entry } of entries) {
    out.push(`/* ── ${entry.family} · ${entry.license} · ${entry.licenseUrl} ── */`);
    for (const file of entry.files) out.push(fontFaceBlock(entry, file));
    out.push("");
  }

  out.push("/* Role tokens — what components read (1.1A-01). */", ":root {");
  for (const role of ROLE_ORDER) {
    const holder = entries.find(({ font }) => font.roles.includes(role));
    if (holder) out.push(`  ${ROLE_TOKENS[role]}: ${roleStack(holder.entry)};`);
  }
  out.push("}", "");

  return out.join("\n");
}

/** Whether this `fonts.css` is one the CLI wrote (and may therefore rewrite). */
export function isManagedFontsCss(css: string): boolean {
  return css.includes(MANAGED_MARKER);
}

/** A `fonts/<id>/<file>` reference read back out of a stylesheet. */
export interface FontReference {
  id: string;
  file: string;
}

/**
 * Every font file a stylesheet's `src: url(…)` names. Read from the CSS rather
 * than from the config on purpose: `doctor` is checking whether the stylesheet
 * the browser loads resolves, which is a question about the file's own contents.
 */
export function referencedFiles(css: string): FontReference[] {
  const out: FontReference[] = [];
  const pattern = new RegExp(`url\\(["']?${FONTS_DIR}/([^/"')]+)/([^"')]+)["']?\\)`, "g");
  for (const match of css.matchAll(pattern)) {
    out.push({ id: match[1], file: match[2] });
  }
  return out;
}

/** One thing wrong with an installed font file. */
export interface FontIssue {
  reference: FontReference;
  kind: "missing" | "mismatch" | "uncatalogued";
  message: string;
}

/**
 * Check every file a `fonts.css` names: present on disk, and still hashing to
 * the catalog's pin. `read` returns the bytes, or null when the file is absent —
 * the caller supplies it so this stays runtime-agnostic.
 */
export async function checkReferences(
  css: string,
  read: (ref: FontReference) => Promise<Uint8Array | null>,
): Promise<FontIssue[]> {
  const issues: FontIssue[] = [];
  for (const reference of referencedFiles(css)) {
    const entry = findFamily(reference.id);
    const file = entry?.files.find((candidate) => candidate.file === reference.file);
    if (!entry || !file) {
      issues.push({
        reference,
        kind: "uncatalogued",
        message: `${fontUrlPath(reference.id, reference.file)} is not a catalogued font file`,
      });
      continue;
    }
    const bytes = await read(reference);
    if (bytes === null) {
      issues.push({
        reference,
        kind: "missing",
        message: `${fontUrlPath(reference.id, reference.file)} is named by fonts.css but missing`,
      });
      continue;
    }
    const actual = sha256Hex(bytes);
    if (actual !== file.sha256) {
      issues.push({
        reference,
        kind: "mismatch",
        message:
          `${fontUrlPath(reference.id, reference.file)} does not match its pinned hash ` +
          `(expected ${file.sha256.slice(0, 16)}…, got ${actual.slice(0, 16)}…)`,
      });
    }
  }
  return issues;
}

// ── Download seam ────────────────────────────────────────────────────────────
// All network access goes through `activeFetch`, so the tests install a fetch
// that serves a fixture and no test ever opens a socket. Production never
// touches the hook — `activeFetch` is the global `fetch`, which both Bun and
// Node >= 18 provide, so there is nothing for the Node shim to stand in for.
type FetchLike = (url: string) => Promise<Response>;
let activeFetch: FetchLike = (url) => fetch(url);

/** Test-only: install a fetch implementation. Returns a restore function. */
export function __setFetchImpl(fn: FetchLike): () => void {
  const previous = activeFetch;
  activeFetch = fn;
  return () => {
    activeFetch = previous;
  };
}

/** WOFF2's magic number — the first four bytes of every `.woff2` file. */
const WOFF2_SIGNATURE = "wOF2";

/**
 * Verify downloaded bytes are the file the catalog pinned: a WOFF2 whose own
 * header agrees about its length, and whose SHA-256 is the pinned one. Returns
 * the reason it is not, or null when it is.
 *
 * The hash alone would be enough to detect any corruption; the signature check
 * is there for the case the hash cannot catch — a catalog row re-pinned from
 * the wrong file — where the useful error is "that is not a font", not "the
 * bytes you got are the bytes we expected".
 */
export function verifyFontBytes(file: CatalogFile, bytes: Uint8Array): string | null {
  if (bytes.byteLength < 48) {
    return `${file.file} is ${bytes.byteLength} bytes — too short to be a WOFF2`;
  }
  const signature = String.fromCharCode(...bytes.subarray(0, 4));
  if (signature !== WOFF2_SIGNATURE) {
    return `${file.file} is not a WOFF2 (signature ${JSON.stringify(signature)})`;
  }
  const declared = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(8);
  if (declared !== bytes.byteLength) {
    return `${file.file} declares ${declared} bytes in its WOFF2 header but is ${bytes.byteLength}`;
  }
  const actual = sha256Hex(bytes);
  if (actual !== file.sha256) {
    return (
      `${file.file} failed its hash check — expected ${file.sha256.slice(0, 16)}…, ` +
      `got ${actual.slice(0, 16)}…. Refusing to install.`
    );
  }
  return null;
}

/** A verified file, held in memory until the whole family has arrived. */
export interface DownloadedFile {
  file: CatalogFile;
  bytes: Uint8Array;
}

/**
 * Download and verify every file of a family. Nothing is written here: a single
 * failed hash, missing file or network error throws before any byte reaches the
 * disk, so a family is never half-installed (the same all-or-nothing rule
 * `faqir add --registry` follows).
 */
export async function downloadFamily(entry: CatalogEntry): Promise<DownloadedFile[]> {
  const files: DownloadedFile[] = [];
  for (const file of entry.files) {
    let response: Response;
    try {
      response = await activeFetch(file.url);
    } catch (error) {
      throw new Error(
        `network error fetching ${file.url}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (!response.ok) throw new Error(`HTTP ${response.status} fetching ${file.url}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    const problem = verifyFontBytes(file, bytes);
    if (problem) throw new Error(problem);
    files.push({ file, bytes });
  }
  return files;
}
