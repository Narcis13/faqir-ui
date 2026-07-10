// ═══════════════════════════════════════════════════════════════════════════
// Icon system build — scripts/build-icons.mjs  [task 0.4-04 · §B4]
// ═══════════════════════════════════════════════════════════════════════════
//
// The build script ingests the curated Lucide (ISC) SVG subset vendored under
// scripts/icons/lucide/ and emits registry/primitives/icon/{icons.css,
// icon.manifest.json, icon.html}. These tests pin the *build* half of the task:
//   • the pure transforms (curation parsing, SVG optimization, data-URI encoding)
//   • determinism — same inputs → byte-identical icons.css
//   • the committed artifacts are in sync with a fresh in-memory build (so a
//     stale checkout, or a forgotten `bun run build:icons`, fails CI)
//   • a missing vendored SVG is a hard build error.
// The registry-facing assertions (bijection, data-URI validity, base rule,
// license attribution) live in tests/primitives/icon.test.ts.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "../..");
const SCRIPT = join(ROOT, "scripts", "build-icons.mjs");
const ICON_DIR = join(ROOT, "registry", "primitives", "icon");
const SVG_DIR = join(ROOT, "scripts", "icons", "lucide");

// build-icons.mjs is plain JS; import via a computed specifier so its exports
// load at runtime without a hand-written declaration file.
type BuildModule = {
  ROOT: string;
  SVG_DIR: string;
  CURATION_LIST: string;
  OUT_DIR: string;
  ICON_SET: { source: string; license: string; version: string; attribution_file: string; package: string };
  parseCurationList: (text: string) => string[];
  optimizeSvg: (raw: string, name?: string) => string;
  encodeSvgDataUri: (svg: string) => string;
  buildIconEntry: (name: string, raw: string) => { name: string; dataUri: string };
  buildIconEntries: (names: string[], svgDir?: string) => { name: string; dataUri: string }[];
  buildIconsCss: (entries: { name: string; dataUri: string }[]) => string;
  buildIconManifest: (names: string[]) => any;
  buildReferenceHtml: (names: string[]) => string;
  buildIcons: (opts?: { write?: boolean }) => {
    names: string[];
    css: string;
    manifestJson: string;
    html: string;
    stats: { count: number; cssBytes: number; cssGzipBytes: number };
  };
};

let mod: BuildModule;
beforeAll(async () => {
  mod = (await import(SCRIPT)) as unknown as BuildModule;
});

// ── Curation list parsing ────────────────────────────────────────────────────
describe("parseCurationList", () => {
  test("drops blanks and #-comments, trims, sorts, de-dupes", () => {
    const text = "# header\n\n  zap \nactivity\n# c\nactivity\nbell\n";
    expect(mod.parseCurationList(text)).toEqual(["activity", "bell", "zap"]);
  });

  test("the real curated list parses to exactly the vendored set", () => {
    const names = mod.parseCurationList(readFileSync(join(ROOT, "scripts/icons/curated-icons.txt"), "utf8"));
    expect(names.length).toBe(120);
    // Sorted + unique.
    expect([...names].sort()).toEqual(names);
    expect(new Set(names).size).toBe(names.length);
    // Every name has a vendored SVG.
    for (const n of names) expect(existsSync(join(SVG_DIR, `${n}.svg`))).toBe(true);
  });
});

// ── SVG optimization ─────────────────────────────────────────────────────────
describe("optimizeSvg", () => {
  const RAW_CHECK =
    `<!-- @license lucide-static v1.24.0 - ISC -->\n<svg class="lucide lucide-check" ` +
    `xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" ` +
    `stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">\n  ` +
    `<path d="M20 6 9 17l-5-5" />\n</svg>\n`;

  test("emits a single normalized <svg> with the standard Lucide stroke presentation", () => {
    const out = mod.optimizeSvg(RAW_CHECK, "check");
    expect(out).toStartWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"');
    expect(out).toContain('fill="none"');
    expect(out).toContain('stroke="currentColor"');
    expect(out).toContain('stroke-width="2"');
    expect(out).toContain('stroke-linecap="round"');
    expect(out).toContain('stroke-linejoin="round"');
    expect(out).toEndWith("</svg>");
    // The license banner and the class / intrinsic width|height bloat are gone
    // (stroke-width is presentation and stays).
    expect(out).not.toContain("@license");
    expect(out).not.toContain("class=");
    expect(out).not.toContain('width="24"');
    expect(out).not.toContain('height="24"');
  });

  test("preserves the inner drawing element(s) verbatim", () => {
    expect(mod.optimizeSvg(RAW_CHECK, "check")).toContain('<path d="M20 6 9 17l-5-5"/>');
  });

  test("keeps every child of a multi-element icon (circle-user: 2 circles + 1 path)", () => {
    const raw = readFileSync(join(SVG_DIR, "circle-user.svg"), "utf8");
    const out = mod.optimizeSvg(raw, "circle-user");
    expect((out.match(/<circle\b/g) || []).length).toBe(2);
    expect((out.match(/<path\b/g) || []).length).toBe(1);
  });

  test("throws when there is no <svg> element", () => {
    expect(() => mod.optimizeSvg("<div>nope</div>", "bad")).toThrow();
  });
});

// ── Data-URI encoding ────────────────────────────────────────────────────────
describe("encodeSvgDataUri", () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>';

  test("produces an image/svg+xml data URI with the reserved chars escaped", () => {
    const uri = mod.encodeSvgDataUri(svg);
    expect(uri).toStartWith("data:image/svg+xml,");
    const payload = uri.slice("data:image/svg+xml,".length);
    // No raw angle brackets, hashes, or double-quotes survive in the payload.
    expect(payload).not.toContain("<");
    expect(payload).not.toContain(">");
    expect(payload).not.toContain("#");
    expect(payload).not.toContain('"');
    // Attributes use single quotes so the value can sit inside url("…").
    expect(payload).toContain("%3Csvg");
  });

  test("round-trips: decodeURIComponent yields the SVG back (single→double quotes)", () => {
    const uri = mod.encodeSvgDataUri(svg);
    const decoded = decodeURIComponent(uri.slice("data:image/svg+xml,".length)).replace(/'/g, '"');
    expect(decoded).toBe(svg);
  });

  test("escapes % first so introduced escapes are not double-encoded", () => {
    // A literal % in the source becomes %25, and a following '#' still becomes %23.
    const uri = mod.encodeSvgDataUri("<svg>%#</svg>");
    expect(uri).toContain("%25");
    expect(uri).toContain("%23");
    expect(uri).not.toContain("%2523");
  });
});

// ── Determinism ──────────────────────────────────────────────────────────────
describe("build determinism", () => {
  test("buildIcons({write:false}) is byte-identical across runs", () => {
    const a = mod.buildIcons({ write: false });
    const b = mod.buildIcons({ write: false });
    expect(a.css).toBe(b.css);
    expect(a.manifestJson).toBe(b.manifestJson);
    expect(a.html).toBe(b.html);
  });

  test("buildIconsCss is a pure function of its (sorted) entries", () => {
    const names = mod.parseCurationList(readFileSync(join(ROOT, "scripts/icons/curated-icons.txt"), "utf8"));
    const entries = mod.buildIconEntries(names);
    expect(mod.buildIconsCss(entries)).toBe(mod.buildIconsCss(entries));
  });
});

// ── Committed artifacts are in sync with a fresh build ───────────────────────
describe("committed artifacts match a fresh in-memory build", () => {
  const fresh = () => mod.buildIcons({ write: false });

  test("registry/primitives/icon/icons.css is up to date", () => {
    expect(readFileSync(join(ICON_DIR, "icons.css"), "utf8")).toBe(fresh().css);
  });

  test("registry/primitives/icon/icon.manifest.json is up to date", () => {
    expect(readFileSync(join(ICON_DIR, "icon.manifest.json"), "utf8")).toBe(fresh().manifestJson);
  });

  test("registry/primitives/icon/icon.html is up to date", () => {
    expect(readFileSync(join(ICON_DIR, "icon.html"), "utf8")).toBe(fresh().html);
  });
});

// ── A missing vendored SVG is a hard error ───────────────────────────────────
describe("buildIconEntries", () => {
  test("throws a clear error when a curated name has no vendored SVG", () => {
    expect(() => mod.buildIconEntries(["definitely-not-an-icon"])).toThrow(/vendored SVG missing/);
  });
});

// ── Recorded size (acceptance: full icons.css size is recorded) ──────────────
describe("icons.css size", () => {
  test("is recorded and in the documented band (~45 KB raw, subsetting is 0.4-05)", () => {
    const { stats } = mod.buildIcons({ write: false });
    // A guard rail, not a golden byte count: the full 120-icon sheet is ~45 KB
    // raw / ~6 KB gzip. Subsetting (0.4-05) trims this to the icons a project uses.
    expect(stats.count).toBe(120);
    expect(stats.cssBytes).toBeGreaterThan(35_000);
    expect(stats.cssBytes).toBeLessThan(60_000);
  });
});

afterAll(() => {
  // Nothing to clean up — every test used write:false or the committed inputs.
});
