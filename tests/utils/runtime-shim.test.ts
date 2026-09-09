// ═══════════════════════════════════════════════════════════════════════════
// The Bun → Node runtime shim, against the runtime it stands in for  [W3-5]
// ═══════════════════════════════════════════════════════════════════════════
//
// `src/utils/runtime-shim.ts` had ZERO references in the suite — not one test
// imported it, mentioned it, or exercised a path through it. That is a strange
// gap for 260 lines of hand-rolled runtime, because `bin/faqir` is
// `#!/usr/bin/env node`: on a machine with no Bun installed, every `Bun.file`,
// `Bun.write` and `Bun.Glob` call in thirty `src/` modules is one of these.
//
// A polyfill is correct exactly insofar as it agrees with the thing it replaces,
// so this is a DIFFERENTIAL test: `NodeGlob` and the real `Bun.Glob` walk the
// same tree with the same pattern and must return the same set. It runs under
// `bun test`, where the native `Bun` global is present and the shim is inert —
// which is precisely what makes the comparison possible.
//
// The four patterns at the bottom are the ones the CLI issues and the Node path
// had never been shown to handle: `NodeGlob` was only ever exercised on Node
// with `**/*` and `*/`, while `**/*.html` (the audit's file sweep),
// `*/*.manifest.json` (the skill generator), `theme-*.css` and `*.css` (the
// theme readers) went through it untested.

import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { NodeGlob, globToRegExp } from "../../src/utils/runtime-shim";

let root: string;

/** A tree with the shapes every pattern below needs to distinguish. */
const FILES = [
  "index.html",
  "about.html",
  "readme.md",
  "theme-default.css",
  "theme-dark.css",
  "styles.css",
  "pages/index.html",
  "pages/deep/nested.html",
  "pages/deep/notes.md",
  "button/button.manifest.json",
  "button/button.css",
  "card/card.manifest.json",
  "card/deep/deep.manifest.json",
  "tokens/theme-brand.css",
  "tokens/palette.css",
];

// Directories that exist with no file of their own, so the `*/` pattern has
// something to find.  (A line comment: `*/` inside a block comment ends it.)
const EMPTY_DIRS = ["empty-dir", "pages/empty"];

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "faqir-glob-"));
  for (const rel of FILES) {
    const abs = join(root, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, rel);
  }
  for (const rel of EMPTY_DIRS) mkdirSync(join(root, rel), { recursive: true });
});

afterAll(() => {
  if (root) rmSync(root, { recursive: true, force: true });
});

const sorted = (xs: Iterable<string>) => [...xs].sort();

/** Both implementations, over the same tree, with the same options. */
function bothScans(pattern: string, opts: Record<string, unknown> = {}) {
  const options = { cwd: root, ...opts };
  const shim = sorted(new NodeGlob(pattern).scanSync(options as never));
  const native = sorted(new Bun.Glob(pattern).scanSync(options as never));
  return { shim, native };
}

// ── the patterns the CLI actually issues ────────────────────────────────────

describe("NodeGlob agrees with Bun.Glob", () => {
  const PATTERNS = [
    // Already exercised on the Node path by `faqir add` / `faqir list`.
    ["**/*", "every file, at any depth — `add`, `diff`, `upgrade`, `pristine`"],

    // Never exercised on the Node path before W3-5.
    ["**/*.html", "the audit's page sweep (`faqir audit`)"],
    ["*/*.manifest.json", "one manifest per component dir (the skill generator)"],
    ["theme-*.css", "a prefixed filename in one directory"],
    ["*.css", "the theme reader's flat scan"],
  ] as const;

  for (const [pattern, why] of PATTERNS) {
    it(`${pattern} — ${why}`, () => {
      const { shim, native } = bothScans(pattern);
      expect(shim).toEqual(native);
      // A pattern that matches nothing on both sides would pass vacuously.
      expect(native.length).toBeGreaterThan(0);
    });
  }

  it("agrees on onlyFiles: false, which adds directories to the result", () => {
    const { shim, native } = bothScans("**/*", { onlyFiles: false });
    expect(shim).toEqual(native);
    expect(native).toContain("empty-dir");
  });

  // `*/` is how `list`, `search` and the registry index enumerate component
  // directories, and it is always issued WITH `onlyFiles: false`. Both forms are
  // asserted: the shim used to return every directory for the default form,
  // where Bun returns nothing — a divergence no call site could reveal.
  it("agrees on `*/` with onlyFiles: false — the form the CLI issues", () => {
    const { shim, native } = bothScans("*/", { onlyFiles: false });
    expect(shim).toEqual(native);
    expect(native).toContain("button");
    expect(native).not.toContain("index.html");
  });

  it("agrees on `*/` with the default options, where it matches nothing", () => {
    const { shim, native } = bothScans("*/");
    expect(shim).toEqual(native);
    expect(native).toEqual([]);
  });

  it("agrees on dotfiles being excluded by default and included with dot", () => {
    mkdirSync(join(root, ".hidden"), { recursive: true });
    writeFileSync(join(root, ".hidden", "secret.css"), "x");

    expect(bothScans("**/*.css").shim).toEqual(bothScans("**/*.css").native);
    expect(bothScans("**/*.css").native).not.toContain(".hidden/secret.css");

    const withDot = bothScans("**/*.css", { dot: true });
    expect(withDot.shim).toEqual(withDot.native);
    expect(withDot.native).toContain(".hidden/secret.css");

    rmSync(join(root, ".hidden"), { recursive: true, force: true });
  });
});

// ── match(), the path `faqir conform`'s --include/--exclude runs through ────

describe("NodeGlob.match agrees with Bun.Glob.match", () => {
  const CASES: Array<[string, string]> = [
    ["**/*.html", "pages/deep/nested.html"],
    ["**/*.html", "index.html"],
    ["**/*.html", "readme.md"],
    ["pages/**", "pages/deep/nested.html"],
    ["pages/**", "button/button.css"],
    ["*/*.manifest.json", "button/button.manifest.json"],
    ["*/*.manifest.json", "card/deep/deep.manifest.json"],
    ["theme-*.css", "theme-default.css"],
    ["theme-*.css", "tokens/theme-brand.css"],
    ["*.css", "styles.css"],
    ["*.css", "button/button.css"],
    ["**/*", "anything/at/all.txt"],
  ];

  for (const [pattern, path] of CASES) {
    it(`${pattern} vs ${path}`, () => {
      expect(new NodeGlob(pattern).match(path)).toBe(new Bun.Glob(pattern).match(path));
    });
  }
});

// ── the translation itself ──────────────────────────────────────────────────

describe("globToRegExp", () => {
  it("anchors both ends", () => {
    const re = globToRegExp("*.css");
    expect(re.test("a.css")).toBe(true);
    expect(re.test("a.css.map")).toBe(false);
    expect(re.test("dir/a.css")).toBe(false);
  });

  it("`*` stops at a separator and `**` does not", () => {
    expect(globToRegExp("*").test("a/b")).toBe(false);
    expect(globToRegExp("**").test("a/b")).toBe(true);
  });

  it("`**/` matches zero leading directories", () => {
    const re = globToRegExp("**/*.html");
    expect(re.test("index.html")).toBe(true);
    expect(re.test("a/index.html")).toBe(true);
    expect(re.test("a/b/index.html")).toBe(true);
  });

  it("escapes regex metacharacters in literal segments", () => {
    // A dot must be a dot: `theme.css` is not a match for `theme-css`.
    expect(globToRegExp("theme.css").test("themeXcss")).toBe(false);
    expect(globToRegExp("a+b.css").test("a+b.css")).toBe(true);
  });

  it("`?` matches exactly one non-separator character", () => {
    expect(globToRegExp("a?.css").test("ab.css")).toBe(true);
    expect(globToRegExp("a?.css").test("a.css")).toBe(false);
    expect(globToRegExp("a?.css").test("a/.css")).toBe(false);
  });
});
