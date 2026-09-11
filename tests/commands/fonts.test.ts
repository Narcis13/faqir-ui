import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { init } from "../../src/commands/init";
import { doctor } from "../../src/commands/doctor";
import { fonts, FONTS_JSON_VERSION } from "../../src/commands/fonts";
import { readConfig, writeConfig } from "../../src/utils/config";
import { generateBundle } from "../../src/utils/bundler";
import { familyClass } from "../../src/theme/axes";
import { THEME_FONT_ROLES } from "../../src/theme-manifest";
import {
  FONT_CATALOG,
  UNICODE_RANGES,
  fallbackFor,
  familyBytes,
  findFamily,
  roleStack,
} from "../../src/fonts/catalog";
import {
  MANAGED_MARKER,
  ROLE_TOKENS,
  __setFetchImpl,
  assignRoles,
  referencedFiles,
  renderFontsCss,
  verifyFontBytes,
} from "../../src/fonts/install";

const ROOT = join(import.meta.dir, "../..");
const TEST_DIR = join(import.meta.dir, "../.tmp-fonts-test");
const FIXTURES = join(import.meta.dir, "../fixtures/fonts");

// Instrument Serif is the smallest family in the catalog (32 KB for its two
// Latin faces) and the one `tests/fixtures/fonts/` carries, so it is what the
// install path is exercised with. The fixture bytes are the REAL upstream
// files, which is the only way an `add` can get past the hash check — see that
// directory's README.
const FAMILY = "instrument-serif";

/** URL → bytes, from the fixture directory. `missing`/`tamper` break one file. */
const missing = new Set<string>();
const tamper = new Map<string, Uint8Array>();
const requested: string[] = [];
let restoreFetch: () => void;

/** A `Response` body from bytes, copied so the view's own backing buffer is irrelevant. */
function asBody(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function fixtureFetch(url: string): Promise<Response> {
  requested.push(url);
  const file = url.slice(url.lastIndexOf("/") + 1);
  if (missing.has(file)) return Promise.resolve(new Response("not found", { status: 404 }));
  const forced = tamper.get(file);
  if (forced) return Promise.resolve(new Response(asBody(forced), { status: 200 }));
  const path = join(FIXTURES, file);
  if (!existsSync(path)) {
    throw new Error(`test fetch: no fixture for ${file} (only ${FAMILY} is available)`);
  }
  return Promise.resolve(new Response(readFileSync(path)));
}

beforeAll(() => {
  restoreFetch = __setFetchImpl(fixtureFetch);
});

afterAll(() => {
  restoreFetch();
});

beforeEach(() => {
  missing.clear();
  tamper.clear();
  requested.length = 0;
  rmSync(TEST_DIR, { recursive: true, force: true });
  mkdirSync(TEST_DIR, { recursive: true });
  process.chdir(TEST_DIR);
});

afterEach(() => {
  process.chdir(ROOT);
  rmSync(TEST_DIR, { recursive: true, force: true });
});

/**
 * Capture what a command prints. `console.log` is where `emitJSON` writes when
 * JSON mode is unarmed, and `console.error` is where `log.error` goes — which
 * is how `doctor` reports a failed check, so both are needed here.
 */
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

/** Swallow the human log lines a command writes, so the test output stays readable. */
async function quiet(fn: () => Promise<void>): Promise<void> {
  await captureStdout(fn);
}

/** The thrown message, or null when the call succeeded. */
async function failure(fn: () => Promise<void>): Promise<string | null> {
  try {
    await quiet(fn);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

const uiPath = (...parts: string[]) => join(TEST_DIR, "ui", ...parts);
const readCss = () => readFileSync(uiPath("fonts.css"), "utf8");

// ═══════════════════════════════════════════════════════════════════════════
// The catalog itself
// ═══════════════════════════════════════════════════════════════════════════

describe("the OFL catalog", () => {
  it("ships the sixteen curated families, each installable", () => {
    expect(FONT_CATALOG.length).toBe(16);
    expect(new Set(FONT_CATALOG.map((entry) => entry.id)).size).toBe(16);

    for (const entry of FONT_CATALOG) {
      // Licence: the whole premise of self-hosting. Anything not OFL may not be
      // redistributed into a user's project, so there is no "mostly" here.
      expect(entry.license, `${entry.id} licence`).toMatch(/^OFL/);
      expect(entry.licenseUrl).toMatch(/^https:\/\//);

      expect(entry.files.length, `${entry.id} has no files`).toBeGreaterThanOrEqual(1);
      expect(entry.roles.length, `${entry.id} has no roles`).toBeGreaterThanOrEqual(1);
      for (const role of entry.roles) expect(THEME_FONT_ROLES).toContain(role);

      // A fallback that ends in a CSS generic is what a reader who blocks
      // webfonts actually gets.
      expect(entry.fallback.length, `${entry.id} fallback`).toBeGreaterThan(0);
      expect(entry.fallback).toMatch(/(sans-serif|serif|monospace|system-ui|ui-rounded)$/);
      expect(entry.fallback.toLowerCase()).not.toContain(entry.family.toLowerCase());

      for (const file of entry.files) {
        expect(file.sha256, `${entry.id}/${file.file} hash`).toMatch(/^[0-9a-f]{64}$/);
        expect(file.bytes).toBeGreaterThan(1024);
        expect(file.file).toEndWith(".woff2");
        expect(file.url).toEndWith(`/${file.file}`);
        expect(Object.keys(UNICODE_RANGES)).toContain(file.subset);
        // A single weight, or a variable range. DM Sans's ladder really does
        // reach 1000, so the bound is four digits, not three.
        expect(file.weight, `${entry.id}/${file.file} weight`).toMatch(/^\d{3,4}( \d{3,4})?$/);
      }
    }
  });

  it("pins every download to an immutable, versioned URL", () => {
    // A hash pin is only a pin if the URL cannot change underneath it: a bare
    // `@latest` or a Google Fonts CSS endpoint would make every hash in the
    // catalog a time bomb rather than a guarantee.
    for (const entry of FONT_CATALOG) {
      for (const file of entry.files) {
        expect(file.url, `${entry.id} url`).toMatch(
          /^https:\/\/cdn\.jsdelivr\.net\/npm\/@fontsource(-variable)?\/[a-z0-9-]+@\d+\.\d+\.\d+\/files\//,
        );
        expect(file.url).not.toContain("@latest");
        expect(file.url).not.toContain("fonts.googleapis.com");
        expect(file.url).not.toContain("fonts.gstatic.com");
      }
    }
  });

  it("declares the class `axesFromCss` will actually report for it", () => {
    // The catalog's `class` is a CLAIM about the family → `type.pairing` table
    // in src/theme/axes.ts. If a family is added to one table and not the
    // other, a theme that names it reports a different pairing than the family
    // it was installed as — which is the drift this case exists to prevent.
    for (const entry of FONT_CATALOG) {
      expect(familyClass(`"${entry.family}"`), `${entry.id} bare`).toBe(entry.class);
      expect(familyClass(roleStack(entry)), `${entry.id} full stack`).toBe(entry.class);
    }
  });

  it("resolves a family by id or by display name", () => {
    expect(findFamily("fraunces")?.family).toBe("Fraunces");
    expect(findFamily("Fraunces")?.id).toBe("fraunces");
    expect(findFamily("IBM Plex Sans")?.id).toBe("ibm-plex-sans");
    expect(findFamily("ibm-plex-sans")?.family).toBe("IBM Plex Sans");
    expect(findFamily("comic sans")).toBeNull();
  });

  it("drops the family from its own fallback stack", () => {
    // `--font-body: "Inter", …, Inter, sans-serif` is not wrong, just noise —
    // and the noise would be in every generated stylesheet.
    expect(fallbackFor("sans-grotesque", "Inter")).not.toContain("Inter");
    expect(fallbackFor("sans-grotesque", "Inter")).toContain("Helvetica Neue");
    expect(roleStack(findFamily("inter")!)).toStartWith('"Inter", ');
  });

  it("prices a family from its files", () => {
    const entry = findFamily(FAMILY)!;
    expect(familyBytes(entry)).toBe(entry.files.reduce((n, f) => n + f.bytes, 0));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// fonts.css, rendered from the install list
// ═══════════════════════════════════════════════════════════════════════════

describe("renderFontsCss", () => {
  it("renders @font-face per subset and a role block", () => {
    const css = renderFontsCss([{ id: "fraunces", roles: ["heading"] }]);
    const entry = findFamily("fraunces")!;

    expect(css).toContain(MANAGED_MARKER);
    expect(css).toContain('font-family: "Fraunces";');
    expect(css).toContain("font-display: swap;");
    // Variable family → a weight RANGE, so one file covers the whole ladder.
    expect(css).toContain("font-weight: 100 900;");
    expect(css).toContain(`unicode-range: ${UNICODE_RANGES.latin};`);
    expect(css).toContain(`unicode-range: ${UNICODE_RANGES["latin-ext"]};`);
    for (const file of entry.files) {
      expect(css).toContain(`url("fonts/fraunces/${file.file}") format("woff2")`);
    }
    expect(css).toContain(`  --font-heading: ${roleStack(entry)};`);
    expect(css).not.toContain("--font-body:");
  });

  it("renders one declaration per weight for a static family", () => {
    const css = renderFontsCss([{ id: "ibm-plex-mono", roles: ["mono"] }]);
    expect(css).toContain("font-weight: 400;");
    expect(css).toContain("font-weight: 700;");
    expect(css).toContain("--font-mono:");
    // 2 weights × 2 subsets.
    expect(css.match(/@font-face/g)?.length).toBe(4);
  });

  it("is deterministic regardless of the order families were added", () => {
    const a = renderFontsCss([
      { id: "fraunces", roles: ["heading"] },
      { id: "inter", roles: ["ui", "body"] },
    ]);
    const b = renderFontsCss([
      { id: "inter", roles: ["body", "ui"] },
      { id: "fraunces", roles: ["heading"] },
    ]);
    expect(a).toBe(b);
    // Roles in a fixed order, whatever order they were asked for in.
    expect(a.indexOf("--font-heading")).toBeLessThan(a.indexOf("--font-body"));
    expect(a.indexOf("--font-body")).toBeLessThan(a.indexOf("--font-ui"));
  });

  it("renders nothing for an empty install list", () => {
    expect(renderFontsCss([])).toBe("");
    expect(renderFontsCss([{ id: "inter", roles: [] }])).toBe("");
  });

  it("names every role token exactly once", () => {
    const css = renderFontsCss([
      { id: "fraunces", roles: ["heading"] },
      { id: "inter", roles: ["body", "ui"] },
      { id: "jetbrains-mono", roles: ["mono"] },
    ]);
    for (const token of Object.values(ROLE_TOKENS)) {
      expect(css.match(new RegExp(`${token}:`, "g"))?.length, token).toBe(1);
    }
  });
});

describe("assignRoles", () => {
  it("gives a role exactly one family, taking it off the previous holder", () => {
    const fraunces = findFamily("fraunces")!;
    const lora = findFamily("lora")!;
    const first = assignRoles([], fraunces, ["heading"]);
    expect(first.fonts).toEqual([{ id: "fraunces", roles: ["heading"] }]);

    const second = assignRoles(first.fonts, lora, ["heading"]);
    expect(second.displaced).toEqual([["heading", "fraunces"]]);
    expect(second.dropped).toEqual(["fraunces"]);
    expect(second.fonts).toEqual([{ id: "lora", roles: ["heading"] }]);
  });

  it("is idempotent, and merges a second role onto the same family", () => {
    const inter = findFamily("inter")!;
    const once = assignRoles([], inter, ["body"]);
    expect(assignRoles(once.fonts, inter, ["body"]).fonts).toEqual(once.fonts);

    const both = assignRoles(once.fonts, inter, ["ui"]);
    expect(both.fonts).toEqual([{ id: "inter", roles: ["body", "ui"] }]);
    expect(both.displaced).toEqual([]);
  });

  it("keeps a displaced family that still holds another role", () => {
    const inter = findFamily("inter")!;
    const geist = findFamily("geist")!;
    const start = assignRoles([], inter, ["body", "ui"]).fonts;
    const after = assignRoles(start, geist, ["ui"]);
    expect(after.fonts).toEqual([
      { id: "inter", roles: ["body"] },
      { id: "geist", roles: ["ui"] },
    ]);
    expect(after.dropped).toEqual([]);
  });
});

describe("verifyFontBytes", () => {
  const file = findFamily(FAMILY)!.files[0];
  const real = () => new Uint8Array(readFileSync(join(FIXTURES, file.file)));

  it("accepts the pinned bytes", () => {
    expect(verifyFontBytes(file, real())).toBeNull();
  });

  it("refuses bytes that are not a WOFF2", () => {
    const html = new TextEncoder().encode("<!doctype html>" + "x".repeat(64));
    expect(verifyFontBytes(file, html)).toContain("not a WOFF2");
  });

  it("refuses a truncated file", () => {
    expect(verifyFontBytes(file, real().subarray(0, 20))).toContain("too short");
    // A truncation past the header trips the length field, not the hash: the
    // more useful message of the two.
    expect(verifyFontBytes(file, real().subarray(0, 200))).toContain("WOFF2 header");
  });

  it("refuses a real WOFF2 that is the wrong file", () => {
    const other = findFamily(FAMILY)!.files[1];
    const bytes = new Uint8Array(readFileSync(join(FIXTURES, other.file)));
    expect(verifyFontBytes(file, bytes)).toContain("failed its hash check");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// faqir fonts add / remove, in a real project
// ═══════════════════════════════════════════════════════════════════════════

describe("faqir fonts add", () => {
  beforeEach(async () => {
    await quiet(() => init([]));
  });

  it("downloads, verifies and installs a family", async () => {
    await quiet(() => fonts(["add", FAMILY, "--role", "heading"]));

    const entry = findFamily(FAMILY)!;
    for (const file of entry.files) {
      const path = uiPath("fonts", FAMILY, file.file);
      expect(existsSync(path), file.file).toBe(true);
      // Byte-identical to what the host served, and to the pinned hash.
      expect(createHash("sha256").update(readFileSync(path)).digest("hex")).toBe(file.sha256);
    }

    const css = readCss();
    expect(css).toContain('font-family: "Instrument Serif";');
    expect(css).toContain(`--font-heading: ${roleStack(entry)};`);

    const config = await readConfig(TEST_DIR);
    expect(config.fonts).toEqual([{ id: FAMILY, roles: ["heading"] }]);
  });

  it("takes the family's primary role when --role is omitted", async () => {
    await quiet(() => fonts(["add", FAMILY]));
    const config = await readConfig(TEST_DIR);
    expect(config.fonts).toEqual([{ id: FAMILY, roles: ["heading"] }]);
  });

  it("accepts a display name and repeated --role flags", async () => {
    await quiet(() => fonts(["add", "Instrument Serif", "--role", "heading", "--role=body"]));
    const config = await readConfig(TEST_DIR);
    expect(config.fonts).toEqual([{ id: FAMILY, roles: ["heading", "body"] }]);
    const css = readCss();
    expect(css).toContain("--font-heading:");
    expect(css).toContain("--font-body:");
  });

  it("warns but installs when the role is not one the family is catalogued for", async () => {
    // Taste is advice, not a rule — but it must not be silent advice.
    const out = await captureStdout(() => fonts(["add", FAMILY, "--role", "mono"]));
    expect(out).toContain("catalogued for heading, not mono");
    expect((await readConfig(TEST_DIR)).fonts).toEqual([{ id: FAMILY, roles: ["mono"] }]);
    expect(readCss()).toContain("--font-mono:");
  });

  it("is idempotent: re-running writes the same bytes and the same config", async () => {
    await quiet(() => fonts(["add", FAMILY, "--role", "heading"]));
    const css = readCss();
    const config = await readConfig(TEST_DIR);

    await quiet(() => fonts(["add", FAMILY, "--role", "heading"]));
    expect(readCss()).toBe(css);
    expect((await readConfig(TEST_DIR)).fonts).toEqual(config.fonts);
  });

  it("takes a role off the family that held it, and reports the move", async () => {
    // A second family without a second fixture: the install list is what
    // `fonts.css` is rendered from, so writing the entry a previous `add` would
    // have left is enough to test the displacement. Only the family being added
    // is downloaded, which is why this needs no bytes for Inter.
    await quiet(() => fonts(["add", FAMILY, "--role", "heading"]));
    const config = await readConfig(TEST_DIR);
    config.fonts = [...config.fonts!, { id: "inter", roles: ["body"] }];
    await writeConfig(config, TEST_DIR);

    const out = await captureStdout(() => fonts(["add", FAMILY, "--role", "body"]));
    expect(out).toContain("--font-body moved off inter");
    expect((await readConfig(TEST_DIR)).fonts).toEqual([
      { id: FAMILY, roles: ["heading", "body"] },
    ]);
    const css = readCss();
    expect(css).not.toContain("Inter");
    expect(css.match(/--font-(heading|body):/g)?.length).toBe(2);
  });

  it("refuses a hash mismatch and writes nothing", async () => {
    // The host serves a real, valid WOFF2 — just not the one that was pinned.
    // This is the substituted-font attack the hashes exist for.
    const entry = findFamily(FAMILY)!;
    tamper.set(
      entry.files[0].file,
      new Uint8Array(readFileSync(join(FIXTURES, entry.files[1].file))),
    );

    const message = await failure(() => fonts(["add", FAMILY, "--role", "heading"]));
    expect(message).toContain("failed its hash check");
    expect(existsSync(uiPath("fonts"))).toBe(false);
    expect(existsSync(uiPath("fonts.css"))).toBe(false);
    expect((await readConfig(TEST_DIR)).fonts).toBeUndefined();
  });

  it("refuses a dead URL and writes nothing", async () => {
    missing.add(findFamily(FAMILY)!.files[1].file);
    const message = await failure(() => fonts(["add", FAMILY, "--role", "heading"]));
    expect(message).toContain("HTTP 404");
    // The FIRST file verified fine; a family is all-or-nothing, so it is not on
    // disk either.
    expect(existsSync(uiPath("fonts"))).toBe(false);
    expect(existsSync(uiPath("fonts.css"))).toBe(false);
  });

  it("refuses an unknown family, with the near misses", async () => {
    const message = await failure(() => fonts(["add", "serif"]));
    expect(message).toContain("Unknown font family 'serif'");
    expect(message).toContain("instrument-serif");
    expect(requested).toEqual([]);
  });

  it("refuses an unknown role before downloading anything", async () => {
    const message = await failure(() => fonts(["add", FAMILY, "--role", "display"]));
    expect(message).toContain("Unknown role 'display'");
    expect(requested).toEqual([]);
  });

  it("refuses to overwrite a fonts.css it did not write", async () => {
    writeFileSync(uiPath("fonts.css"), "/* mine */\n@font-face { font-family: Mine; }\n");
    const message = await failure(() => fonts(["add", FAMILY, "--role", "heading"]));
    expect(message).toContain("refusing to overwrite");
    expect(readCss()).toContain("/* mine */");
    expect(requested).toEqual([]);
  });

  it("emits the documented --json shape", async () => {
    const out = await captureStdout(() => fonts(["add", FAMILY, "--role", "heading", "--json"]));
    const payload = JSON.parse(out);

    expect(payload.fonts_schema_version).toBe(FONTS_JSON_VERSION);
    expect(Object.keys(payload).sort()).toEqual([
      "bundle_regenerated",
      "displaced",
      "fonts",
      "fonts_schema_version",
      "installed",
      "stylesheet",
      "tokens",
      "warnings",
    ]);
    expect(payload.installed.id).toBe(FAMILY);
    expect(payload.installed.license).toMatch(/^OFL/);
    expect(payload.installed.roles).toEqual(["heading"]);
    expect(payload.installed.files).toEqual(
      findFamily(FAMILY)!.files.map((file) => `fonts/${FAMILY}/${file.file}`),
    );
    expect(payload.tokens).toEqual(["--font-heading"]);
    expect(payload.stylesheet).toBe("./ui/fonts.css");
    expect(payload.warnings).toEqual([]);
    expect(payload.bundle_regenerated).toBe(true);
  });
});

describe("faqir fonts remove", () => {
  beforeEach(async () => {
    await quiet(() => init([]));
  });

  it("reverses an add", async () => {
    await quiet(() => fonts(["add", FAMILY, "--role", "heading"]));
    expect(existsSync(uiPath("fonts", FAMILY))).toBe(true);

    await quiet(() => fonts(["remove", FAMILY]));
    expect(existsSync(uiPath("fonts", FAMILY))).toBe(false);
    // No stray empty `fonts/` directory and no empty stylesheet left behind.
    expect(existsSync(uiPath("fonts"))).toBe(false);
    expect(existsSync(uiPath("fonts.css"))).toBe(false);
    expect((await readConfig(TEST_DIR)).fonts).toBeUndefined();
  });

  it("keeps the other families and rewrites the stylesheet", async () => {
    // Two families without a second fixture: install one, then hand-write the
    // install list the way a second `add` would have left it, so `remove` has
    // something to keep. The stylesheet is rendered from that list either way.
    await quiet(() => fonts(["add", FAMILY, "--role", "heading"]));
    const config = await readConfig(TEST_DIR);
    config.fonts = [...config.fonts!, { id: "inter", roles: ["body"] }];
    await writeConfig(config, TEST_DIR);

    await quiet(() => fonts(["remove", FAMILY]));
    const css = readCss();
    expect(css).toContain("--font-body:");
    expect(css).not.toContain("Instrument Serif");
    expect((await readConfig(TEST_DIR)).fonts).toEqual([{ id: "inter", roles: ["body"] }]);
  });

  it("refuses a family that is not installed", async () => {
    expect(await failure(() => fonts(["remove", "fraunces"]))).toContain("is not installed");
  });

  it("refuses to delete a fonts.css it did not write", async () => {
    // `remove` replaces the stylesheet just as `add` does, so it needs the same
    // guard: the install list can name a family whose `fonts.css` is the user's.
    await quiet(() => fonts(["add", FAMILY, "--role", "heading"]));
    writeFileSync(uiPath("fonts.css"), "/* mine */\n");
    expect(await failure(() => fonts(["remove", FAMILY]))).toContain("refusing to overwrite");
    expect(readCss()).toContain("/* mine */");
    expect(existsSync(uiPath("fonts", FAMILY))).toBe(true);
  });

  it("emits --json", async () => {
    await quiet(() => fonts(["add", FAMILY, "--role", "heading"]));
    const out = await captureStdout(() => fonts(["remove", FAMILY, "--json"]));
    const payload = JSON.parse(out);
    expect(payload.fonts_schema_version).toBe(FONTS_JSON_VERSION);
    expect(payload.removed).toBe(FAMILY);
    expect(payload.fonts).toEqual([]);
    expect(payload.stylesheet).toBeNull();
  });
});

describe("faqir fonts list", () => {
  it("prints every family without needing a project", async () => {
    const out = await captureStdout(() => fonts(["list"]));
    for (const entry of FONT_CATALOG) expect(out).toContain(entry.id);
    expect(out).toContain("Open Font License");
  });

  it("emits --json, and marks what is installed", async () => {
    await quiet(() => init([]));
    await quiet(() => fonts(["add", FAMILY, "--role", "heading"]));

    const payload = JSON.parse(await captureStdout(() => fonts(["list", "--json"])));
    expect(payload.fonts_schema_version).toBe(FONTS_JSON_VERSION);
    expect(payload.families.length).toBe(16);

    const row = payload.families.find((f: { id: string }) => f.id === FAMILY);
    expect(row.installed_roles).toEqual(["heading"]);
    expect(row.license).toMatch(/^OFL/);
    expect(row.class).toBe("serif-modern");
    expect(row.files[0].sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(payload.families.find((f: { id: string }) => f.id === "inter").installed_roles).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Integration: the bundle order, and doctor
// ═══════════════════════════════════════════════════════════════════════════

describe("the bundle", () => {
  beforeEach(async () => {
    await quiet(() => init([]));
  });

  it("places fonts.css after the theme", async () => {
    // Order is the whole contract: both files declare on `:root`, so whichever
    // is last wins, and the installed family has to.
    await quiet(() => fonts(["add", FAMILY, "--role", "heading"]));
    const result = await generateBundle(TEST_DIR, { output: uiPath("faqir.bundle.css") });

    expect(result.files).toContain("fonts.css");
    expect(result.files.indexOf("fonts.css")).toBe(result.files.indexOf("tokens/theme.css") + 1);

    const bundle = readFileSync(uiPath("faqir.bundle.css"), "utf8");
    expect(bundle.indexOf("=== fonts.css ===")).toBeGreaterThan(
      bundle.indexOf("=== tokens/theme.css ==="),
    );
    expect(bundle.indexOf("=== fonts.css ===")).toBeLessThan(bundle.indexOf("=== base/reset.css ==="));
    expect(bundle).toContain('src: url("fonts/instrument-serif/');
  });

  it("omits fonts.css when no family is installed", async () => {
    const result = await generateBundle(TEST_DIR, { output: uiPath("faqir.bundle.css") });
    expect(result.files).not.toContain("fonts.css");
  });

  it("re-bases the font urls when the bundle is written outside the ui directory", async () => {
    // Inlining moves a stylesheet's relative urls. A 404 for a font is
    // invisible — the page just renders in the fallback — so the paths are
    // rewritten rather than left to break quietly.
    await quiet(() => fonts(["add", FAMILY, "--role", "heading"]));
    mkdirSync(join(TEST_DIR, "dist"), { recursive: true });
    await generateBundle(TEST_DIR, { output: join(TEST_DIR, "dist/bundle.css") });

    const bundle = readFileSync(join(TEST_DIR, "dist/bundle.css"), "utf8");
    expect(bundle).toContain('src: url("../ui/fonts/instrument-serif/');
    expect(bundle).not.toContain('url("fonts/instrument-serif/');
  });
});

describe("faqir doctor", () => {
  beforeEach(async () => {
    await quiet(() => init([]));
  });

  /** doctor sets process.exitCode rather than throwing; read it back. */
  async function runDoctor(): Promise<{ out: string; code: number }> {
    const previous = process.exitCode;
    process.exitCode = 0;
    const out = await captureStdout(async () => {
      await doctor([]);
    });
    const code = typeof process.exitCode === "number" ? process.exitCode : 0;
    process.exitCode = previous;
    return { out, code };
  }

  it("reports the installed files as hash-verified", async () => {
    await quiet(() => fonts(["add", FAMILY, "--role", "heading"]));
    const { out, code } = await runDoctor();
    expect(out).toContain("2 self-hosted file(s) present and hash-verified");
    expect(code).toBe(0);
  });

  it("says nothing about fonts in a project with none", async () => {
    const { out, code } = await runDoctor();
    expect(out).not.toContain("Fonts:");
    expect(code).toBe(0);
  });

  it("flags a font file fonts.css names but that is gone", async () => {
    await quiet(() => fonts(["add", FAMILY, "--role", "heading"]));
    const file = findFamily(FAMILY)!.files[0].file;
    rmSync(uiPath("fonts", FAMILY, file));

    const { out, code } = await runDoctor();
    expect(out).toContain(`fonts/${FAMILY}/${file} is named by fonts.css but missing`);
    expect(out).toContain("faqir fonts add");
    expect(code).toBe(1);
  });

  it("flags a font file that no longer matches its pinned hash", async () => {
    await quiet(() => fonts(["add", FAMILY, "--role", "heading"]));
    const entry = findFamily(FAMILY)!;
    // A real WOFF2, wrong file: a swap the file's mere presence cannot catch.
    writeFileSync(
      uiPath("fonts", FAMILY, entry.files[0].file),
      readFileSync(join(FIXTURES, entry.files[1].file)),
    );

    const { out, code } = await runDoctor();
    expect(out).toContain("does not match its pinned hash");
    expect(code).toBe(1);
  });

  it("flags a config that records a family with no stylesheet", async () => {
    const config = await readConfig(TEST_DIR);
    config.fonts = [{ id: "fraunces", roles: ["heading"] }];
    await writeConfig(config, TEST_DIR);

    const { out, code } = await runDoctor();
    expect(out).toContain("fraunces recorded in faqir.config.json");
    expect(code).toBe(1);
  });
});

describe("referencedFiles", () => {
  it("reads every font file out of a stylesheet", () => {
    const css = renderFontsCss([
      { id: "fraunces", roles: ["heading"] },
      { id: "jetbrains-mono", roles: ["mono"] },
    ]);
    const refs = referencedFiles(css);
    expect(refs.length).toBe(4);
    expect(refs.map((ref) => ref.id)).toEqual([
      "fraunces",
      "fraunces",
      "jetbrains-mono",
      "jetbrains-mono",
    ]);
    expect(refs[0].file).toEndWith(".woff2");
    expect(referencedFiles("/* nothing here */")).toEqual([]);
  });
});
