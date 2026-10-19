// `faqir fonts` against the forecraft upstream notes:
//   18 — a one-weight heading family gets a synthesized bold;
//   35 — `--role none` installs faces and assigns no role;
//   37 — opt-in true italics (`--italic`) under the same pinning guarantees.
//
// Network-free like tests/commands/fonts.test.ts: Instrument Serif's two real
// WOFF2 files in tests/fixtures/fonts/ are served through the fetch seam, so
// every install here passes the real hash check.

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "bun:test";
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { init } from "../../src/commands/init";
import { fonts, headingVoiceWeight, weightWarnings } from "../../src/commands/fonts";
import { readConfig, writeConfig } from "../../src/utils/config";
import { FONT_CATALOG, findFamily, isSingleWeight, staticWeights, type CatalogFile } from "../../src/fonts/catalog";
import {
  __setFetchImpl,
  assignRoles,
  checkReferences,
  renderFontsCss,
  singleWeightHeading,
} from "../../src/fonts/install";

const ROOT = join(import.meta.dir, "../..");
const TEST_DIR = join(import.meta.dir, "../.tmp-forecraft-fonts-test");
const FIXTURES = join(import.meta.dir, "../fixtures/fonts");
const FAMILY = "instrument-serif";

/** Test-only italic file name → the fixture whose bytes stand in for it. */
const aliases = new Map<string, string>();
const requested: string[] = [];
let restoreFetch: () => void;

function fixtureFetch(url: string): Promise<Response> {
  requested.push(url);
  const name = url.slice(url.lastIndexOf("/") + 1);
  const path = join(FIXTURES, aliases.get(name) ?? name);
  if (!existsSync(path)) throw new Error(`test fetch: no fixture for ${name}`);
  return Promise.resolve(new Response(readFileSync(path)));
}

beforeAll(() => {
  restoreFetch = __setFetchImpl(fixtureFetch);
});
afterAll(() => restoreFetch());

beforeEach(() => {
  aliases.clear();
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
const readCss = () => readFileSync(uiPath("fonts.css"), "utf8");
/** The `:root` role block of a rendered fonts.css, from its comment to its end. */
const roleBlock = (css: string) => {
  const at = css.indexOf("/* Role tokens");
  return at === -1 ? null : css.slice(at);
};

// ═══════════════════════════════════════════════════════════════════════════
// 35 — `--role none`
// ═══════════════════════════════════════════════════════════════════════════

describe("--role none (note 35)", () => {
  const base = [
    { id: "fraunces", roles: ["heading" as const] },
    { id: "inter", roles: ["body" as const, "ui" as const] },
  ];

  it("adding a role-less family leaves the role block byte-identical", () => {
    const before = renderFontsCss(base);
    const after = renderFontsCss([...base, { id: FAMILY, roles: [] }]);
    expect(roleBlock(after)).toBe(roleBlock(before));
    // …and its faces ARE there.
    expect(after).toContain('font-family: "Instrument Serif";');
    expect(after).toContain(`url("fonts/${FAMILY}/instrument-serif-latin-400-normal.woff2")`);
    expect(after).toContain("No role (--role none)");
    expect(before).not.toContain("Instrument Serif");
  });

  it("renders faces and no :root block when no family holds a role", () => {
    const css = renderFontsCss([{ id: FAMILY, roles: [] }]);
    expect(css).toContain("@font-face");
    expect(roleBlock(css)).toBeNull();
    expect(css).not.toContain(":root");
  });

  it("a role-less family survives other families' role moves", () => {
    const lora = findFamily("lora")!;
    const start = [...base, { id: FAMILY, roles: [] }];
    const next = assignRoles(start, lora, ["heading"]);
    expect(next.fonts.find((f) => f.id === FAMILY)).toEqual({ id: FAMILY, roles: [] });
    // Fraunces lost its only role and leaves, as before.
    expect(next.dropped).toEqual(["fraunces"]);
  });

  it("re-adding a role-holding family with no role keeps its roles", () => {
    const fraunces = findFamily("fraunces")!;
    expect(assignRoles(base, fraunces, []).fonts).toEqual(assignRoles(base, fraunces, ["heading"]).fonts);
  });

  it("installs end to end without touching the role block", async () => {
    await quiet(() => init([]));
    // A project whose heading is already Fraunces (no download needed: the
    // stylesheet is rendered from the config).
    const config = await readConfig(TEST_DIR);
    config.fonts = [{ id: "fraunces", roles: ["heading"] }];
    await writeConfig(config, TEST_DIR);
    writeFileSync(uiPath("fonts.css"), renderFontsCss(config.fonts));
    const before = roleBlock(readCss());

    const payload = JSON.parse(
      await captureStdout(() => fonts(["add", FAMILY, "--role", "none", "--json"])),
    );
    expect(payload.installed.roles).toEqual([]);
    expect(payload.tokens).toEqual([]);
    expect(payload.displaced).toEqual([]);

    expect(roleBlock(readCss())).toBe(before);
    expect(readCss()).toContain('font-family: "Instrument Serif";');
    for (const file of findFamily(FAMILY)!.files) {
      expect(existsSync(uiPath("fonts", FAMILY, file.file))).toBe(true);
    }
    expect((await readConfig(TEST_DIR)).fonts).toEqual([
      { id: "fraunces", roles: ["heading"] },
      { id: FAMILY, roles: [] },
    ]);

    // `fonts list` reports it installed, with no role.
    const list = JSON.parse(await captureStdout(() => fonts(["list", "--json"])));
    const row = list.families.find((f: { id: string }) => f.id === FAMILY);
    expect(row.installed).toBe(true);
    expect(row.installed_roles).toEqual([]);

    // `remove` takes it back out and leaves Fraunces' block alone.
    await quiet(() => fonts(["remove", FAMILY]));
    expect(roleBlock(readCss())).toBe(before);
    expect(existsSync(uiPath("fonts", FAMILY))).toBe(false);
  });

  it("refuses none combined with a real role", async () => {
    await quiet(() => init([]));
    for (const args of [
      ["add", FAMILY, "--role", "none", "--role", "heading"],
      ["add", FAMILY, "--role", "heading,none"],
    ]) {
      expect(await failure(() => fonts(args))).toContain("--role none cannot be combined");
    }
    expect(existsSync(uiPath("fonts.css"))).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 18 — a one-weight heading family
// ═══════════════════════════════════════════════════════════════════════════

describe("a single-weight heading family (note 18)", () => {
  it("knows which catalogued families ship one weight", () => {
    const single = FONT_CATALOG.filter(isSingleWeight).map((entry) => entry.id);
    expect(single).toEqual([FAMILY]);
    expect(staticWeights(findFamily(FAMILY)!)).toEqual([400]);
    expect(staticWeights(findFamily("ibm-plex-serif")!)).toEqual([400, 700]);
    expect(staticWeights(findFamily("fraunces")!)).toBeNull();
  });

  it("turns weight synthesis off in the role block when it holds the heading", () => {
    const css = renderFontsCss([{ id: FAMILY, roles: ["heading"] }]);
    const block = roleBlock(css)!;
    expect(block).toContain("--font-heading:");
    expect(block).toContain("font-synthesis-weight: none;");
    expect(singleWeightHeading([{ id: FAMILY, roles: ["heading"] }])?.id).toBe(FAMILY);
  });

  it("leaves synthesis alone for multi-weight families, text roles and role-less installs", () => {
    for (const fonts of [
      [{ id: "fraunces", roles: ["heading" as const] }],
      [{ id: "ibm-plex-serif", roles: ["heading" as const] }],
      [{ id: FAMILY, roles: ["heading" as const, "body" as const] }],
      [{ id: FAMILY, roles: [] }, { id: "inter", roles: ["body" as const] }],
    ]) {
      expect(renderFontsCss(fonts)).not.toContain("font-synthesis-weight");
    }
  });

  it("warns at install with the active theme's heading weight", async () => {
    await quiet(() => init([]));
    const heading = headingVoiceWeight(uiPath());
    expect(heading).not.toBeNull();
    expect(heading!.weight).toBeGreaterThan(400);

    const payload = JSON.parse(
      await captureStdout(() => fonts(["add", FAMILY, "--role", "heading", "--json"])),
    );
    expect(payload.warnings).toHaveLength(1);
    expect(payload.warnings[0]).toContain("ships one weight (400)");
    expect(payload.warnings[0]).toContain(`draws headings at ${heading!.weight} (${heading!.voice})`);
    expect(readCss()).toContain("font-synthesis-weight: none;");
  });

  it("does not warn when the theme's heading voice is regular", async () => {
    await quiet(() => init([]));
    appendFileSync(uiPath("tokens", "theme.css"), "\n:root { --heading-weight: var(--weight-normal); }\n");
    expect(headingVoiceWeight(uiPath())).toEqual({ voice: "regular", weight: 400 });

    const payload = JSON.parse(
      await captureStdout(() => fonts(["add", FAMILY, "--role", "heading", "--json"])),
    );
    expect(payload.warnings).toEqual([]);
  });

  it("warns differently for text roles and role-less installs, never for variable families", () => {
    const entry = findFamily(FAMILY)!;
    expect(weightWarnings(entry, ["body"], null)[0]).toContain("is synthesized by the browser");
    expect(weightWarnings(entry, [], null)[0]).toContain("font-synthesis-weight: none");
    expect(weightWarnings(findFamily("lora")!, ["heading"], { voice: "bold", weight: 700 })).toEqual([]);
    expect(weightWarnings(findFamily("ibm-plex-serif")!, ["heading"], { voice: "semibold", weight: 600 })).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 37 — opt-in italics
// ═══════════════════════════════════════════════════════════════════════════

describe("--italic (note 37)", () => {
  it("every pinned italic is held to the upright faces' pinning rules", () => {
    for (const entry of FONT_CATALOG) {
      for (const file of entry.italics ?? []) {
        expect(file.url, file.file).toMatch(/^https:\/\/cdn\.jsdelivr\.net\/npm\/@fontsource(-variable)?\/[a-z0-9-]+@\d+\.\d+\.\d+\/files\//);
        expect(file.url.endsWith(`/${file.file}`)).toBe(true);
        expect(file.file).toContain("italic");
        expect(file.sha256).toMatch(/^[0-9a-f]{64}$/);
      }
    }
  });

  it("refuses a family with no pinned italics before downloading anything", async () => {
    await quiet(() => init([]));
    const message = await failure(() => fonts(["add", FAMILY, "--italic"]));
    expect(message).toContain("no italic faces pinned");
    expect(requested).toEqual([]);
    expect(existsSync(uiPath("fonts"))).toBe(false);
    expect((await readConfig(TEST_DIR)).fonts).toBeUndefined();
  });

  describe("with a pinned italic row", () => {
    // A test-only row standing in for a real pin: the upright Latin fixture's
    // bytes under an italic name, hashed here, so the installer's real
    // download → verify → write path runs end to end.
    const entry = findFamily(FAMILY)! as { italics?: readonly CatalogFile[] };
    const upright = findFamily(FAMILY)!.files[0];
    const italicName = "instrument-serif-latin-400-italic.woff2";
    const bytes = readFileSync(join(FIXTURES, upright.file));
    const row: CatalogFile = {
      ...upright,
      file: italicName,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      url: upright.url.replace(upright.file, italicName),
    };

    beforeEach(() => {
      entry.italics = [row];
      aliases.set(italicName, upright.file);
    });
    afterEach(() => {
      delete entry.italics;
    });

    it("downloads, verifies and declares the italic faces", async () => {
      await quiet(() => init([]));
      const payload = JSON.parse(
        await captureStdout(() => fonts(["add", FAMILY, "--role", "heading", "--italic", "--json"])),
      );
      expect(payload.installed.italic).toBe(true);
      expect(payload.installed.files).toContain(`fonts/${FAMILY}/${italicName}`);
      expect(existsSync(uiPath("fonts", FAMILY, italicName))).toBe(true);

      const css = readCss();
      const italicFace = css.split("@font-face").find((block) => block.includes(italicName))!;
      expect(italicFace).toContain("font-style: italic;");
      expect(italicFace).toContain('font-family: "Instrument Serif";');
      expect((await readConfig(TEST_DIR)).fonts).toEqual([{ id: FAMILY, roles: ["heading"], italic: true }]);

      // doctor's reference check knows the italic file and its pin.
      const issues = await checkReferences(css, async (ref) => {
        const path = uiPath("fonts", ref.id, ref.file);
        return existsSync(path) ? new Uint8Array(readFileSync(path)) : null;
      });
      expect(issues).toEqual([]);

      // A later add without --italic keeps them.
      await quiet(() => fonts(["add", FAMILY, "--role", "heading"]));
      expect(readCss()).toContain(italicName);
    });

    it("refuses an italic that fails its hash, writing nothing", async () => {
      await quiet(() => init([]));
      entry.italics = [{ ...row, sha256: "0".repeat(64) }];
      const message = await failure(() => fonts(["add", FAMILY, "--italic"]));
      expect(message).toContain("failed its hash check");
      expect(existsSync(uiPath("fonts"))).toBe(false);
    });

    it("installs upright only without the flag", async () => {
      await quiet(() => init([]));
      await quiet(() => fonts(["add", FAMILY, "--role", "heading"]));
      expect(requested.some((url) => url.endsWith(italicName))).toBe(false);
      expect(readCss()).not.toContain("font-style: italic");
    });
  });
});
