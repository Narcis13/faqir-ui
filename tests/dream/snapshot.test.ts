// ═══════════════════════════════════════════════════════════════════════════
// The light/dark pair the taste gate looks at                   [task 1.1N-01]
// ═══════════════════════════════════════════════════════════════════════════
//
// Playwright is already a devDependency and the browser is already installed
// for the visual suite, so the capture costs nothing new — but launching one
// here would make the cheapest thing in the suite one of the slowest, to check
// two filenames and a query string. So the module is split: `snapshotPlan` is
// pure and is tested directly, and `captureSnapshots` takes its browser as an
// argument and is tested against a fake one.
//
// The one fact worth pinning is the URL. A generated preview inlines every
// stylesheet it needs and reads `?scheme=light|dark` to set `data-theme` on its
// root — that is what lets one file yield both pictures with no server. If the
// preview stops honouring the query, both shots are the same picture and the
// scorecard says nothing; asserting the query here is what makes that a failure
// rather than a puzzling pair of images.

import { describe, expect, it, beforeAll } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadSnapshot, ROOT, type SnapshotModule } from "./load";

let snapshot: SnapshotModule;
beforeAll(async () => {
  snapshot = await loadSnapshot();
});

describe("the plan", () => {
  it("shoots light and dark, in that order", () => {
    expect(snapshot.SNAPSHOT_SCHEMES).toEqual(["light", "dark"]);
    const plan = snapshot.snapshotPlan({ theme: "editorial", outDir: ".faqir-dreams/out/x" });
    expect(plan.shots.map((s) => s.scheme)).toEqual(["light", "dark"]);
  });

  it("points at the theme's own preview as a file:// URL with the scheme query", () => {
    const plan = snapshot.snapshotPlan({ theme: "editorial", outDir: "out" });
    expect(plan.preview).toBe(join(ROOT, "registry", "themes", "editorial.preview.html"));
    expect(plan.shots[0].url).toStartWith("file://");
    expect(plan.shots[0].url).toEndWith("?scheme=light");
    expect(plan.shots[1].url).toEndWith("?scheme=dark");
  });

  it("names the two files after the theme and the scheme", () => {
    const plan = snapshot.snapshotPlan({ theme: "editorial", outDir: "/tmp/bundle" });
    expect(plan.shots.map((s) => s.file)).toEqual([
      "/tmp/bundle/editorial-light.png",
      "/tmp/bundle/editorial-dark.png",
    ]);
  });

  it("resolves a relative --out against the repository, and leaves an absolute one alone", () => {
    expect(snapshot.snapshotPlan({ theme: "editorial", outDir: "out/x" }).outDir).toBe(join(ROOT, "out", "x"));
    expect(snapshot.snapshotPlan({ theme: "editorial", outDir: "/tmp/x" }).outDir).toBe("/tmp/x");
  });

  it("refuses a theme name that is not one", () => {
    for (const theme of ["Editorial", "../etc/passwd", "my theme", ""]) {
      expect(() => snapshot.snapshotPlan({ theme, outDir: "out" }), theme).toThrow(/is not a theme name/);
    }
  });

  it("captures at a width where the gallery lays out as designed", () => {
    // A picture of the narrow-tier fallback would score the wrong thing, and a
    // full-page capture stitches, which is not comparable between runs.
    expect(snapshot.SNAPSHOT_VIEWPORT.width).toBeGreaterThanOrEqual(1024);
    expect(snapshot.SNAPSHOT_VIEWPORT.height).toBeGreaterThan(snapshot.SNAPSHOT_VIEWPORT.width);
  });

  it("the preview it plans for actually honours ?scheme=", () => {
    // The whole approach rests on this. Read out of a shipped preview rather
    // than assumed, so the day the harness stops reading the query, this fails
    // instead of the images quietly becoming identical.
    const preview = readFileSync(join(ROOT, "registry", "themes", "editorial.preview.html"), "utf8");
    expect(preview).toContain("scheme");
    expect(preview).toContain('setAttribute("data-theme"');
  });
});

describe("capturing", () => {
  /** A browser that records what it was asked to do and writes nothing real. */
  function fakeBrowser() {
    const visited: string[] = [];
    const shot: string[] = [];
    let closed = false;
    const pagesClosed: number[] = [];
    const browser = {
      newPage: async (options: { viewport: { width: number } }) => ({
        goto: async (url: string) => void visited.push(`${url} @${options.viewport.width}`),
        waitForTimeout: async () => {},
        screenshot: async ({ path }: { path: string }) => void shot.push(path),
        close: async () => void pagesClosed.push(1),
      }),
      close: async () => {
        closed = true;
      },
    };
    return { browser, visited, shot, pagesClosed, isClosed: () => closed };
  }

  it("visits both URLs, writes both files and closes everything it opened", async () => {
    const dir = mkdtempSync(join(tmpdir(), "faqir-shot-"));
    try {
      const fake = fakeBrowser();
      const plan = snapshot.snapshotPlan({ theme: "editorial", outDir: dir });
      const written = await snapshot.captureSnapshots(plan, { launch: async () => fake.browser });

      expect(fake.visited.map((v) => v.split("?")[1])).toEqual(["scheme=light @1280", "scheme=dark @1280"]);
      expect(written).toEqual(plan.shots.map((s) => s.file));
      expect(fake.shot).toEqual(written);
      expect(fake.pagesClosed.length).toBe(2);
      expect(fake.isClosed()).toBe(true);
      expect(existsSync(dir)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("closes the browser even when a shot throws", async () => {
    // A leaked Chromium is a process that outlives the nightly run and the one
    // after it. The `finally` is the point of the test.
    const fake = fakeBrowser();
    const launch = async () => ({
      ...fake.browser,
      newPage: async () => {
        throw new Error("no display");
      },
    });
    const plan = snapshot.snapshotPlan({ theme: "editorial", outDir: mkdtempSync(join(tmpdir(), "faqir-shot-")) });
    await expect(snapshot.captureSnapshots(plan, { launch })).rejects.toThrow(/no display/);
    expect(fake.isClosed()).toBe(true);
  });

  it("says what is missing when the theme has no preview", async () => {
    const plan = snapshot.snapshotPlan({ theme: "not-a-theme", outDir: "/tmp/x" });
    await expect(snapshot.captureSnapshots(plan, { launch: async () => fakeBrowser().browser })).rejects.toThrow(
      /No preview at .*not-a-theme\.preview\.html/,
    );
  });
});

describe("the command line", () => {
  it("requires both options", () => {
    expect(() => snapshot.parseSnapshotArgs([])).toThrow(/--theme <name> is required/);
    expect(() => snapshot.parseSnapshotArgs(["--theme", "editorial"])).toThrow(/--out <dir> is required/);
  });

  it("accepts both spellings and refuses anything else", () => {
    expect(snapshot.parseSnapshotArgs(["--theme", "editorial", "--out", "x"])).toEqual({
      theme: "editorial",
      outDir: "x",
    });
    expect(snapshot.parseSnapshotArgs(["--theme=editorial", "--out=x"])).toEqual({
      theme: "editorial",
      outDir: "x",
    });
    expect(snapshot.parseSnapshotArgs(["--help"])).toBeNull();
    expect(() => snapshot.parseSnapshotArgs(["--full-page"])).toThrow(/Unknown option/);
  });
});
