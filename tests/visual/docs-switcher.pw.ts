// Docs-site switcher + playground, in a real browser — task 0.7-14 (FAQIR-PLAN §13).
//
// Two claims of task 0.7-14 are browser facts and cannot be asserted against
// strings, so they are asserted here, against the built site served over plain
// HTTP by a deliberately dumb static file server (URL → file, no rewrites):
//
//   • **Instant switching.** Flipping `data-theme` on `<html>` restyles a live
//     document with no reload, and swapping the `href` of the one theme `<link>`
//     restyles it into a different theme with no reload. Both are proved by
//     comparing *computed* colours before and after, and by holding a value in the
//     DOM across the swap — a page that reloaded would lose it.
//   • **A client-side audit.** The playground audits typed markup with no network
//     request other than the page's own files: every request the browser makes is
//     recorded, and the findings list is driven by typing.
//
// Not a screenshot test — it shares the visual suite's runner (this directory) but
// asserts behaviour, so it needs no baselines.

import { test, expect } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  buildDocsSite,
  discoverThemes,
  themePreviewPath,
  PACKAGE_ROOT,
  PLAYGROUND_PAGE,
  THEMES_PAGE,
  THEME_LINK_ID,
} from "../../src/generator/docs";

const files = buildDocsSite();
const themes = discoverThemes(join(PACKAGE_ROOT, "registry"));

let root = "";
let server: Server | null = null;
let origin = "";

test.beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), "faqir-docs-switcher-"));
  for (const f of files) {
    const abs = join(root, f.path);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, f.content);
  }
  server = createServer((req, res) => {
    const path =
      decodeURIComponent(new URL(req.url ?? "/", "http://localhost").pathname).replace(/^\//, "") ||
      "index.html";
    const abs = join(root, path);
    if (!abs.startsWith(root)) {
      res.writeHead(403).end();
      return;
    }
    try {
      const body = readFileSync(abs);
      const type = path.endsWith(".css")
        ? "text/css"
        : path.endsWith(".js")
          ? "text/javascript"
          : "text/html; charset=utf-8";
      res.writeHead(200, { "content-type": type }).end(body);
    } catch {
      res.writeHead(404).end("not found");
    }
  });
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server!.address() as { port: number }).port}`;
});

test.afterAll(async () => {
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  if (root) rmSync(root, { recursive: true, force: true });
});

/**
 * Background and foreground of the document, as the browser computes them.
 * Read from `<html>`, which is where the registry reset paints `--color-bg` /
 * `--color-fg` — the two tokens every theme re-declares first.
 */
const readColours = () => {
  const style = getComputedStyle(document.documentElement);
  return { bg: style.backgroundColor, fg: style.color };
};

test.describe("theme gallery", () => {
  test("shows every registry theme, each in its own frame", async ({ page }) => {
    await page.goto(`${origin}/${THEMES_PAGE}`, { waitUntil: "load" });
    for (const theme of themes) {
      const frame = page.locator(`iframe[data-theme-frame="${theme.name}"]`);
      await expect(frame).toHaveCount(1);
      await expect(frame).toHaveAttribute("src", new RegExp(`theme-preview-${theme.name}\\.html$`));
      await expect(page.locator(`button[data-theme-pick="${theme.name}"]`)).toHaveCount(1);
    }
    expect(themes.length).toBeGreaterThanOrEqual(10);
  });

  test("a data-theme swap restyles the page with no reload", async ({ page }) => {
    await page.goto(`${origin}/${THEMES_PAGE}`, { waitUntil: "load" });
    // A value only this document instance holds: if the page reloaded, it is gone.
    await page.evaluate(() => {
      (window as unknown as { __probe: string }).__probe = "same-document";
    });

    const light = await page.evaluate(readColours);
    await page.click('button[data-scheme-pick="dark"]');
    const dark = await page.evaluate(readColours);

    expect(dark.bg).not.toBe(light.bg);
    expect(dark.fg).not.toBe(light.fg);
    expect(await page.getAttribute("html", "data-theme")).toBe("dark");
    expect(
      await page.evaluate(() => (window as unknown as { __probe?: string }).__probe),
      "the page navigated instead of restyling",
    ).toBe("same-document");

    // …and back, with no reload either.
    await page.click('button[data-scheme-pick="light"]');
    expect(await page.evaluate(readColours)).toEqual(light);
    expect(await page.evaluate(() => (window as unknown as { __probe?: string }).__probe)).toBe(
      "same-document",
    );
  });

  test("picking a theme swaps one link href and restyles the page with no reload", async ({
    page,
  }) => {
    await page.goto(`${origin}/${THEMES_PAGE}`, { waitUntil: "load" });
    await page.evaluate(() => {
      (window as unknown as { __probe: string }).__probe = "same-document";
    });

    const before = await page.evaluate(readColours);
    // A theme that repaints the light scheme decisively.
    await page.click('button[data-theme-pick="terminal"]');
    await expect(page.locator(`#${THEME_LINK_ID}`)).toHaveAttribute(
      "href",
      /styles\/themes\/terminal\.css$/,
    );
    // Wait for the swapped stylesheet to be in force, not merely requested.
    await expect
      .poll(async () => (await page.evaluate(readColours)).bg, { timeout: 5_000 })
      .not.toBe(before.bg);

    expect(await page.getAttribute(`#${THEME_LINK_ID}`, "data-theme-name")).toBe("terminal");
    expect(await page.evaluate(() => (window as unknown as { __probe?: string }).__probe)).toBe(
      "same-document",
    );
    // Exactly one theme button is pressed, and it is the one that was clicked.
    expect(await page.locator('[data-theme-pick][aria-pressed="true"]').count()).toBe(1);
    expect(
      await page.getAttribute('[data-theme-pick][aria-pressed="true"]', "data-theme-pick"),
    ).toBe("terminal");
  });

  test("the scheme reaches every preview frame at once", async ({ page }) => {
    await page.goto(`${origin}/${THEMES_PAGE}`, { waitUntil: "load" });
    // Frames are lazy; scroll the gallery into view so they load.
    await page.locator("#gallery").scrollIntoViewIfNeeded();
    const frames = page.locator("iframe[data-theme-frame]");
    const count = await frames.count();
    expect(count).toBe(themes.length);

    await page.click('button[data-scheme-pick="dark"]');
    await expect
      .poll(
        async () =>
          page.evaluate(() =>
            [...document.querySelectorAll("iframe[data-theme-frame]")].filter(
              (f) =>
                (f as HTMLIFrameElement).contentDocument?.documentElement.getAttribute(
                  "data-theme",
                ) === "dark",
            ).length,
        ),
        { timeout: 10_000 },
      )
      .toBe(count);
  });

  test("each frame renders in its own theme with no script at all", async ({ page }) => {
    // Static correctness: the frame's theme is a `<link>`, so it is right on first
    // paint — JavaScript only ever *changes* it.
    await page.route("**/*.js", (route) => route.abort());
    const first = themes[0];
    const last = themes[themes.length - 1];
    const colours: string[] = [];
    for (const theme of [first, last]) {
      await page.goto(`${origin}/${themePreviewPath(theme.name)}`, { waitUntil: "load" });
      expect(await page.getAttribute(`#${THEME_LINK_ID}`, "data-theme-name")).toBe(theme.name);
      await expect(page.locator('[data-ui="button"]').first()).toBeVisible();
      colours.push((await page.evaluate(readColours)).bg);
    }
    expect(colours[0]).not.toBe(colours[1]);
  });
});

test.describe("audit playground", () => {
  test("audits typed markup client-side, with no request beyond its own files", async ({ page }) => {
    const requested: string[] = [];
    page.on("request", (request) => requested.push(request.url()));

    await page.goto(`${origin}/${PLAYGROUND_PAGE}`, { waitUntil: "load" });

    // The authored sample is dirty on purpose — the page opens with findings.
    const rows = page.locator("#playground-findings tbody tr");
    await expect.poll(async () => rows.count(), { timeout: 5_000 }).toBeGreaterThan(0);
    await expect(page.locator("#playground-count")).not.toHaveText("0");

    // Type clean markup: the list empties and says so.
    await page.fill("#playground-source", '<button data-ui="button" data-variant="primary">Go</button>');
    await expect
      .poll(async () => page.locator("#playground-findings [data-ui=\"callout\"]").count(), {
        timeout: 5_000,
      })
      .toBe(1);
    await expect(page.locator("#playground-count")).toHaveText("0");

    // Type dirty markup: the exact rule the CLI would report shows up.
    await page.fill("#playground-source", '<button data-ui="button" data-variant="nope">Go</button>');
    await expect.poll(async () => rows.count(), { timeout: 5_000 }).toBe(1);
    await expect(rows.first()).toContainText("valid-variant");
    await expect(rows.first()).toContainText('Invalid variant "nope"');

    // Nothing left this origin, and nothing was posted anywhere: the audit ran in
    // the page. (The preview frame's `srcdoc` pulls the site's own CSS/engine.)
    const external = requested.filter((url) => !url.startsWith(origin) && !url.startsWith("data:"));
    expect(external, `the playground reached out to ${external.join(", ")}`).toEqual([]);
  });

  test("renders the typed markup live in the preview frame", async ({ page }) => {
    await page.goto(`${origin}/${PLAYGROUND_PAGE}`, { waitUntil: "load" });
    await page.fill(
      "#playground-source",
      '<span data-ui="badge" data-variant="success" id="probe">shipped</span>',
    );
    const preview = page.frameLocator("#playground-preview");
    await expect(preview.locator("#probe")).toHaveText("shipped");
    // Styled by the site's own stylesheet, inside a sandboxed frame.
    const painted = await preview
      .locator("#probe")
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(painted).not.toBe("rgba(0, 0, 0, 0)");
  });

  test("survives markup that is not valid HTML", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    await page.goto(`${origin}/${PLAYGROUND_PAGE}`, { waitUntil: "load" });

    for (const junk of ["<", '<div data-ui="', "</p></div>", "<div ".repeat(200), "&#x0;"]) {
      await page.fill("#playground-source", junk);
      await expect
        .poll(async () => page.locator("#playground-count").textContent(), { timeout: 5_000 })
        .toMatch(/^\d+$/);
    }
    // Still the page the user started on, still auditing.
    await page.fill("#playground-source", '<button data-ui="button" data-variant="nope">Go</button>');
    await expect
      .poll(async () => page.locator("#playground-findings tbody tr").count(), { timeout: 5_000 })
      .toBe(1);
    expect(errors, `the playground threw: ${errors.join("\n")}`).toEqual([]);
  });
});
