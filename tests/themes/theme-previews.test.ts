// Theme preview parity (task 1.0R-10).
//
// Twelve `*.theme.json` declared `"preview": "<name>.preview.html"`; seven of
// those files existed. `preview` is a REQUIRED field of the frozen manifest
// schema, so the field cannot be dropped — which makes the FILE the thing that
// has to be there. These tests hold that line from three directions: every
// declared preview resolves, every generated one still equals a fresh render,
// and every stylesheet a preview links exists (a harness that links nothing is
// a preview of the base tokens, not of the theme).

import { describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join, normalize, dirname } from "node:path";
import {
  BESPOKE_PREVIEWS,
  GALLERY_PREVIEWS,
  previewStylesheets,
  renderThemePreview,
} from "../../src/theme-preview";
import { theme } from "../../src/commands/theme";
import { validateThemeManifest } from "../../src/theme-manifest";

const REPO = join(import.meta.dir, "../..");
const THEMES = join(REPO, "registry", "themes");

const themeNames = readdirSync(THEMES)
  .filter((f) => f.endsWith(".css"))
  .map((f) => f.replace(/\.css$/, ""))
  .sort();

function manifestOf(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(THEMES, `${name}.theme.json`), "utf8"));
}

/** Every local file a preview references — stylesheets and scripts, fragments excluded. */
function referencedFiles(html: string): string[] {
  const out: string[] = [];
  for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const ref = match[1];
    if (ref.startsWith("#") || /^[a-z]+:/i.test(ref) || ref.startsWith("//")) continue;
    out.push(ref);
  }
  return out;
}

describe("shipped theme previews", () => {
  it("ships one for every theme, and every manifest points at a file that is there", () => {
    expect(themeNames.length).toBe(12);
    for (const name of themeNames) {
      const manifest = manifestOf(name);
      expect(validateThemeManifest(manifest)).toEqual([]);
      // The schema makes `preview` required, so a manifest without one is not
      // the fix — the file is.
      expect(typeof manifest.preview, `${name}.theme.json declares no preview`).toBe("string");
      const path = join(THEMES, manifest.preview as string);
      expect(existsSync(path), `${name}.theme.json names ${manifest.preview}, which is not on disk`).toBe(true);
    }
  });

  it("links only stylesheets that exist — for the generated seven and the bespoke five alike", () => {
    for (const name of themeNames) {
      const file = join(THEMES, `${name}.preview.html`);
      const refs = referencedFiles(readFileSync(file, "utf8"));
      // A preview that inlines its CSS references nothing; one that links must
      // link its theme at minimum.
      for (const ref of refs) {
        const resolved = normalize(join(dirname(file), ref));
        expect(existsSync(resolved), `${name}.preview.html references ${ref}, which is not on disk`).toBe(true);
      }
      expect(
        refs.some((ref) => ref === `${name}.css`),
        `${name}.preview.html never links its own theme`,
      ).toBe(true);
    }
  });

  it("splits every theme between generated and hand-authored, with no overlap and no gap", () => {
    const generated = GALLERY_PREVIEWS.map((spec) => spec.name);
    const bespoke: string[] = [...BESPOKE_PREVIEWS];
    expect(generated.filter((name) => bespoke.includes(name))).toEqual([]);
    expect([...generated, ...bespoke].sort()).toEqual(themeNames);
  });

  it("keeps every generated preview byte-identical to a fresh render", () => {
    for (const spec of GALLERY_PREVIEWS) {
      const onDisk = readFileSync(join(THEMES, `${spec.name}.preview.html`), "utf8");
      expect(onDisk, `${spec.name}.preview.html drifted — run 'bun run gen:theme-previews'`).toBe(
        renderThemePreview(spec),
      );
    }
  });

  it("never leaves a hand-authored preview carrying the generated header", () => {
    for (const name of BESPOKE_PREVIEWS) {
      const html = readFileSync(join(THEMES, `${name}.preview.html`), "utf8");
      expect(html, `${name}.preview.html claims to be generated but no spec renders it`).not.toContain(
        "gen:theme-previews",
      );
    }
  });

  it("renders one panel for a single-scheme theme and a split for a dual-scheme one", () => {
    const light = GALLERY_PREVIEWS.find((spec) => spec.scheme === "light")!;
    const both = GALLERY_PREVIEWS.find((spec) => spec.scheme === "both")!;
    expect(manifestOf(light.name).scheme).toBe("light");
    expect(renderThemePreview(light)).not.toContain("createElement(\"iframe\")");
    expect(renderThemePreview(both)).toContain("createElement(\"iframe\")");
  });

  it("links and inlines the same stylesheet list, in the same order", () => {
    const spec = GALLERY_PREVIEWS[0];
    const sheets = previewStylesheets(spec);
    const linked = referencedFiles(renderThemePreview(spec))
      .map((ref) => ref.replace(/^\.\.\//, ""))
      .map((ref) => (ref.includes("/") ? ref : `themes/${ref}`));
    expect(linked).toEqual(sheets);
    // …and the inline form links nothing at all.
    expect(referencedFiles(renderThemePreview({ ...spec, inlineCss: "/* x */" }))).toEqual([]);
  });
});

describe("faqir theme generate", () => {
  const TEST_DIR = join(import.meta.dir, "../.tmp-theme-preview");

  it("writes the preview its manifest declares, self-contained", async () => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DIR, { recursive: true });
    const origCwd = process.cwd();
    process.chdir(TEST_DIR);
    try {
      await theme(["generate", "acme", "--accent", "#168c5b", "--document"]);

      const written = readdirSync(join(TEST_DIR, "themes")).sort();
      expect(written).toEqual([
        "acme-document.css",
        "acme-document.preview.html",
        "acme-document.theme.json",
        "acme.css",
        "acme.preview.html",
        "acme.theme.json",
      ]);

      for (const name of ["acme", "acme-document"]) {
        const manifest = JSON.parse(
          readFileSync(join(TEST_DIR, "themes", `${name}.theme.json`), "utf8"),
        );
        expect(manifest.preview).toBe(`${name}.preview.html`);
        const html = readFileSync(join(TEST_DIR, "themes", manifest.preview), "utf8");
        // `themes/` here is a drop folder with no registry beside it, so the
        // harness must reference no file at all — it carries its CSS.
        expect(referencedFiles(html)).toEqual([]);
        expect(html).toContain(`<title>Faqir UI — ${name} theme preview</title>`);
        // The theme's own CSS is in there, not just the base tokens.
        expect(html).toContain(readFileSync(join(TEST_DIR, "themes", `${name}.css`), "utf8").trim().slice(0, 200));
        // …and so is every component the gallery renders.
        expect(html).toContain('[data-ui="button"]');
        expect(html).toContain('[data-ui="table"]');
      }

      // The document companion is light-only and says so by rendering one panel.
      const doc = readFileSync(join(TEST_DIR, "themes", "acme-document.preview.html"), "utf8");
      expect(doc).not.toContain("createElement(\"iframe\")");
    } finally {
      process.chdir(origCwd);
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });
});
