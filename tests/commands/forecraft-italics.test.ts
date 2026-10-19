// Forecraft note 37, second half: the true-italic PINS behind `faqir fonts add
// <family> --italic`. The installer path already existed; these tests hold the
// pinned rows to the rules the upright rows follow, and install one family's
// italics from its real upstream bytes.
//
// Network-free: Instrument Serif's four real WOFF2 files (upright and italic)
// in tests/fixtures/fonts/ are served through the fetch seam, so the install
// below passes the real hash check against the catalog's real pins.

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { init } from "../../src/commands/init";
import { fonts } from "../../src/commands/fonts";
import { readConfig } from "../../src/utils/config";
import { FONT_CATALOG, UNICODE_RANGES, findFamily, italicFiles } from "../../src/fonts/catalog";
import { __setFetchImpl, checkReferences, renderFontsCss } from "../../src/fonts/install";

const ROOT = join(import.meta.dir, "../..");
const TEST_DIR = join(import.meta.dir, "../.tmp-forecraft-italics-test");
const FIXTURES = join(import.meta.dir, "../fixtures/fonts");
const FAMILY = "instrument-serif";

/** Requested file name → fixture served instead (to feed a file the wrong bytes). */
const swaps = new Map<string, string>();
const requested: string[] = [];
let restoreFetch: () => void;

function fixtureFetch(url: string): Promise<Response> {
  requested.push(url);
  const name = url.slice(url.lastIndexOf("/") + 1);
  const path = join(FIXTURES, swaps.get(name) ?? name);
  if (!existsSync(path)) throw new Error(`test fetch: no fixture for ${name}`);
  return Promise.resolve(new Response(readFileSync(path)));
}

beforeAll(() => {
  restoreFetch = __setFetchImpl(fixtureFetch);
});
afterAll(() => restoreFetch());

beforeEach(() => {
  swaps.clear();
  requested.length = 0;
  rmSync(TEST_DIR, { recursive: true, force: true });
  mkdirSync(TEST_DIR, { recursive: true });
  process.chdir(TEST_DIR);
});
afterEach(() => {
  process.chdir(ROOT);
  rmSync(TEST_DIR, { recursive: true, force: true });
});

async function captureStdout(fn: () => Promise<void>): Promise<string> {
  const chunks: string[] = [];
  const original = { log: console.log, error: console.error };
  const capture = (...args: unknown[]) => {
    chunks.push(args.map(String).join(" ") + "\n");
  };
  console.log = capture;
  console.error = capture;
  try {
    await fn();
  } finally {
    console.log = original.log;
    console.error = original.error;
  }
  return chunks.join("");
}
const quiet = async (fn: () => Promise<void>) => void (await captureStdout(fn));
async function failure(fn: () => Promise<void>): Promise<string | null> {
  try {
    await quiet(fn);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}
const uiPath = (...parts: string[]) => join(TEST_DIR, "ui", ...parts);
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
/** The `@font-face` blocks of a stylesheet that declare `font-style: italic`. */
const italicFaces = (css: string) =>
  css
    .split("@font-face")
    .slice(1)
    .filter((block) => block.includes("font-style: italic;"));

// ═══════════════════════════════════════════════════════════════════════════
// The pins themselves (offline)
// ═══════════════════════════════════════════════════════════════════════════

describe("italic pins (note 37)", () => {
  it("pins every family whose upstream package ships an italic", () => {
    // Manrope, Space Grotesk and Bricolage Grotesque declare
    // `styles: ["normal"]` in their Fontsource metadata.json at 5.3.0; every
    // other family declares "italic" too and so must carry rows.
    const uprightOnly = FONT_CATALOG.filter((entry) => italicFiles(entry).length === 0).map((entry) => entry.id);
    expect(uprightOnly).toEqual(["manrope", "space-grotesk", "bricolage-grotesque"]);
    for (const id of ["ibm-plex-sans", "ibm-plex-serif", "source-serif-4", "newsreader"]) {
      expect(italicFiles(findFamily(id)!).length, id).toBeGreaterThan(0);
    }
  });

  it("every italic row is the -italic twin of an upright row: same version, subset, weight and URL shape", () => {
    for (const entry of FONT_CATALOG) {
      const italics = italicFiles(entry);
      if (italics.length === 0) continue;
      expect(italics.length, entry.id).toBe(entry.files.length);
      entry.files.forEach((upright, index) => {
        const italic = italics[index];
        const label = `${entry.id} ${italic.file}`;
        expect(upright.file, label).toMatch(/-normal\.woff2$/);
        expect(italic.file, label).toBe(upright.file.replace(/-normal\.woff2$/, "-italic.woff2"));
        expect(italic.subset, label).toBe(upright.subset);
        expect(italic.weight, label).toBe(upright.weight);
        // Same package, same exact version, same /files/ directory: only the
        // basename differs.
        expect(italic.url, label).toBe(upright.url.slice(0, -upright.file.length) + italic.file);
        expect(italic.url, label).toMatch(
          /^https:\/\/cdn\.jsdelivr\.net\/npm\/@fontsource(-variable)?\/[a-z0-9-]+@\d+\.\d+\.\d+\/files\/[a-z0-9-]+\.woff2$/,
        );
        // Variable families are one `wght` file per subset; static ones one
        // file per (subset, weight).
        expect(italic.file, label).toContain(entry.variable ? "-wght-italic" : `-${italic.weight}-italic`);
        // The same hash encoding as the upright rows: lowercase hex SHA-256.
        expect(italic.sha256, label).toMatch(/^[0-9a-f]{64}$/);
        expect(italic.sha256, label).not.toBe(upright.sha256);
        expect(Number.isInteger(italic.bytes) && italic.bytes > 48, label).toBe(true);
      });
    }
  });

  it("no two catalogued files share a hash", () => {
    const hashes = FONT_CATALOG.flatMap((entry) => [...entry.files, ...italicFiles(entry)].map((file) => file.sha256));
    expect(new Set(hashes).size).toBe(hashes.length);
  });

  it("the fixture's italic bytes are the pinned ones", () => {
    for (const file of italicFiles(findFamily(FAMILY)!)) {
      const bytes = readFileSync(join(FIXTURES, file.file));
      expect(bytes.byteLength, file.file).toBe(file.bytes);
      expect(sha256(bytes), file.file).toBe(file.sha256);
      expect(bytes.subarray(0, 4).toString("latin1")).toBe("wOF2");
    }
  });

  it("renders static italics per weight and variable italics as a range", () => {
    const serif = italicFaces(renderFontsCss([{ id: "ibm-plex-serif", roles: ["body"], italic: true }]));
    expect(serif).toHaveLength(4);
    expect(serif.filter((face) => face.includes("font-weight: 400;"))).toHaveLength(2);
    expect(serif.filter((face) => face.includes("font-weight: 700;"))).toHaveLength(2);

    const source = italicFaces(renderFontsCss([{ id: "source-serif-4", roles: ["body"], italic: true }]));
    expect(source).toHaveLength(2);
    for (const face of source) {
      expect(face).toContain('font-family: "Source Serif 4";');
      expect(face).toContain("font-weight: 200 900;");
    }
    expect(source[0]).toContain(`unicode-range: ${UNICODE_RANGES.latin};`);
    expect(source[1]).toContain(`unicode-range: ${UNICODE_RANGES["latin-ext"]};`);

    // Without the flag, no italic face is declared even though rows exist.
    expect(italicFaces(renderFontsCss([{ id: "source-serif-4", roles: ["body"] }]))).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// `faqir fonts add <family> --italic`, end to end against the real bytes
// ═══════════════════════════════════════════════════════════════════════════

describe("fonts add --italic (note 37)", () => {
  it("lists the families that have italics", async () => {
    await quiet(() => init([]));
    const list = JSON.parse(await captureStdout(() => fonts(["list", "--json"])));
    for (const row of list.families as { id: string; italics: { file: string; sha256: string }[] }[]) {
      expect(row.italics.map((file) => file.sha256)).toEqual(
        italicFiles(findFamily(row.id)!).map((file) => file.sha256),
      );
    }
    expect(await captureStdout(() => fonts(["list"]))).toContain("italics with --italic");
  });

  it("downloads, verifies and writes the font-style: italic faces", async () => {
    await quiet(() => init([]));
    const entry = findFamily(FAMILY)!;
    const payload = JSON.parse(
      await captureStdout(() => fonts(["add", FAMILY, "--role", "heading", "--italic", "--json"])),
    );
    expect(payload.installed.italic).toBe(true);
    for (const file of [...entry.files, ...italicFiles(entry)]) {
      expect(payload.installed.files).toContain(`fonts/${FAMILY}/${file.file}`);
      const onDisk = readFileSync(uiPath("fonts", FAMILY, file.file));
      expect(sha256(onDisk), file.file).toBe(file.sha256);
    }
    expect(requested.filter((url) => url.endsWith("-italic.woff2"))).toEqual(
      italicFiles(entry).map((file) => file.url),
    );

    const css = readFileSync(uiPath("fonts.css"), "utf8");
    const faces = italicFaces(css);
    expect(faces).toHaveLength(2);
    italicFiles(entry).forEach((file, index) => {
      expect(faces[index]).toContain('font-family: "Instrument Serif";');
      expect(faces[index]).toContain(`url("fonts/${FAMILY}/${file.file}")`);
      expect(faces[index]).toContain("font-weight: 400;");
      expect(faces[index]).toContain(`unicode-range: ${UNICODE_RANGES[file.subset]};`);
    });
    expect((await readConfig(TEST_DIR)).fonts).toEqual([{ id: FAMILY, roles: ["heading"], italic: true }]);

    // doctor's reference check accepts the installed italics against their pins.
    const issues = await checkReferences(css, async (ref) => {
      const path = uiPath("fonts", ref.id, ref.file);
      return existsSync(path) ? new Uint8Array(readFileSync(path)) : null;
    });
    expect(issues).toEqual([]);
  });

  it("refuses italic bytes that are not the pinned ones, writing nothing", async () => {
    await quiet(() => init([]));
    const entry = findFamily(FAMILY)!;
    // Serve the upright Latin file where the italic one is asked for.
    swaps.set(italicFiles(entry)[0].file, entry.files[0].file);
    const message = await failure(() => fonts(["add", FAMILY, "--italic"]));
    expect(message).toContain("failed its hash check");
    expect(existsSync(uiPath("fonts"))).toBe(false);
    expect(existsSync(uiPath("fonts.css"))).toBe(false);
    expect((await readConfig(TEST_DIR)).fonts).toBeUndefined();
  });

  it("still refuses an upright-only family by name", async () => {
    await quiet(() => init([]));
    const message = await failure(() => fonts(["add", "space-grotesk", "--italic"]));
    expect(message).toContain("Space Grotesk has no italic faces pinned");
    expect(message).toContain("ships upright only");
    expect(requested).toEqual([]);
  });

  it("names the upright-only families in the help text", async () => {
    const help = await captureStdout(() => fonts(["--help"]));
    expect(help).toContain("--italic");
    expect(help).toContain("Manrope, Space Grotesk, Bricolage Grotesque ship upright only");
  });
});
