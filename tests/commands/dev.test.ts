/**
 * `faqir dev` — the inspector overlay it injects.  [task 0.7-12]
 *
 * The overlay lives in the CLI (src/dev/overlay.ts), not in the registry, so it
 * cannot travel into a user's project: the only way to get it is to be served
 * by this dev server. That containment is asserted here against the real
 * registry tree, and the injection itself is asserted end-to-end against a real
 * spawned server.
 */
import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { request } from "node:http";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  OVERLAY_ROUTE,
  OVERLAY_SCRIPT_TAG,
  OVERLAY_SHORTCUT,
  OVERLAY_SOURCE,
  injectOverlay,
} from "../../src/dev/overlay";

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");

const tmpDirs: string[] = [];
function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), "faqir-dev-"));
  tmpDirs.push(d);
  return d;
}
afterAll(() => {
  for (const d of tmpDirs) rmSync(d, { recursive: true, force: true });
});

describe("injectOverlay", () => {
  test("inserts the script tag just before </body>", () => {
    const out = injectOverlay("<html><body><h1>hi</h1></body></html>");
    expect(out).toContain(OVERLAY_SCRIPT_TAG);
    expect(out.indexOf(OVERLAY_SCRIPT_TAG)).toBeLessThan(out.indexOf("</body>"));
    expect(out).toContain("<h1>hi</h1>");
  });

  test("falls back to </html>, then to appending", () => {
    expect(injectOverlay("<html><h1>hi</h1></html>")).toMatch(
      new RegExp(`${escapeRe(OVERLAY_SCRIPT_TAG)}\\s*</html>`),
    );
    const fragment = injectOverlay("<h1>hi</h1>");
    expect(fragment.startsWith("<h1>hi</h1>")).toBe(true);
    expect(fragment).toContain(OVERLAY_SCRIPT_TAG);
  });

  test("is idempotent — a page is never given two overlays", () => {
    const once = injectOverlay("<body></body>");
    expect(injectOverlay(once)).toBe(once);
  });

  test("uses the last </body> so a page mentioning it in text is unharmed", () => {
    const html = "<body><code>&lt;/body&gt;</code><p>x</p></body>";
    const out = injectOverlay(html);
    expect(out.indexOf(OVERLAY_SCRIPT_TAG)).toBeGreaterThan(out.indexOf("<p>x</p>"));
  });

  test("the tag carries the marker attribute and points at the served route", () => {
    expect(OVERLAY_SCRIPT_TAG).toContain("data-faqir-dev-overlay");
    expect(OVERLAY_SCRIPT_TAG).toContain(`src="${OVERLAY_ROUTE}"`);
    expect(OVERLAY_ROUTE.startsWith("/__faqir/")).toBe(true);
  });
});

describe("the overlay never leaves the dev server", () => {
  const NEEDLES = ["__FAQIR_OVERLAY__", "data-faqir-dev-overlay", "faqir-devtools-overlay"];

  function walk(dir: string, hits: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
      const abs = join(dir, name);
      if (statSync(abs).isDirectory()) {
        walk(abs, hits);
        continue;
      }
      if (!/\.(js|mjs|css|html|json)$/.test(name)) continue;
      const body = readFileSync(abs, "utf8");
      if (NEEDLES.some((n) => body.includes(n))) hits.push(abs);
    }
    return hits;
  }

  test("no registry file mentions it — `faqir init` cannot copy it into a project", () => {
    expect(walk(join(ROOT, "registry"))).toEqual([]);
  });

  test("no CDN artifact carries it either", () => {
    const dist = join(ROOT, "packages", "core", "dist");
    if (!existsSync(dist)) return; // gitignored build output; covered when present
    expect(walk(dist)).toEqual([]);
  });

  test("neither engine build contains it", () => {
    for (const file of ["faqir-core.js", "faqir-core.dev.js"]) {
      const code = readFileSync(join(ROOT, "registry", "core", file), "utf8");
      for (const needle of NEEDLES) expect(code).not.toContain(needle);
    }
  });
});

describe("overlay runtime", () => {
  const Faqir = require("../../registry/core/faqir-core.dev.js");

  /**
   * Render a page, boot the engine on it, then evaluate the served overlay
   * script exactly as a browser would. The trailing tick lets the engine's
   * MutationObserver finish reacting to the new markup, so every assertion
   * afterwards reads one settled set of scopes.
   */
  async function bootPage(html: string) {
    // The suite shares one realm, so pin the global the overlay reads to THIS
    // engine's handle (a browser page only ever has one engine).
    (globalThis as any).window.__FAQIR_DEVTOOLS__ = Faqir.devtools;
    document.body.innerHTML = html;
    Faqir.start();
    new Function(OVERLAY_SOURCE)();
    await new Promise((r) => setTimeout(r, 0));
    return (globalThis as any).window.__FAQIR_OVERLAY__;
  }

  function press(key: string, mods: Record<string, boolean> = {}) {
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...mods }),
    );
  }

  afterEach(() => {
    const overlay = (globalThis as any).window.__FAQIR_OVERLAY__;
    if (overlay) overlay.hide(); // clears the refresh interval
  });

  test("installs itself once and starts hidden", async () => {
    const overlay = await bootPage(`<div l-data="{ n: 1 }"></div>`);
    expect(overlay.version).toBe(1);
    expect(overlay.isOpen()).toBe(false);
    expect(overlay.host()).toBeNull(); // nothing mounted until first shown

    new Function(OVERLAY_SOURCE)(); // a second injection is a no-op
    expect((globalThis as any).window.__FAQIR_OVERLAY__).toBe(overlay);
  });

  test("the shortcut toggles it, and Escape closes it", async () => {
    const overlay = await bootPage(`<div l-data="{ n: 1 }"></div>`);

    press("F", { ctrlKey: true, shiftKey: true });
    expect(overlay.isOpen()).toBe(true);

    press("F", { ctrlKey: true, shiftKey: true });
    expect(overlay.isOpen()).toBe(false);

    press("F", { metaKey: true, shiftKey: true }); // Cmd on macOS
    expect(overlay.isOpen()).toBe(true);

    press("Escape");
    expect(overlay.isOpen()).toBe(false);
  });

  test("ignores the key without both modifiers", async () => {
    const overlay = await bootPage(`<div l-data="{ n: 1 }"></div>`);
    press("F");
    press("f", { ctrlKey: true });
    press("f", { shiftKey: true });
    expect(overlay.isOpen()).toBe(false);
  });

  test("renders scopes, components and the build flavour into a shadow root", async () => {
    const overlay = await bootPage(`
      <main l-data="{ title: 'Cart', qty: 7 }">
        <div data-ui="tabs" data-variant="underline" data-state="ready">
          <div data-part="list" role="tablist">
            <button data-part="trigger" role="tab">One</button>
          </div>
        </div>
      </main>
    `);
    overlay.show();

    const host = overlay.host();
    expect(host.getAttribute("data-faqir-dev-overlay")).toBe("");
    const text = host.shadowRoot.textContent;
    expect(text).toContain("FAQIR");
    expect(text).toContain("dev build");
    expect(text).toContain("Scopes (1)");
    expect(text).toContain('"title": "Cart"');
    expect(text).toContain('"qty": 7');
    expect(text).toContain("tabs");
    expect(text).toContain("variant=underline");
    expect(text).toContain("state=ready");
    expect(text).toContain("parts: list, trigger");
  });

  test("re-renders live scope data on demand", async () => {
    const overlay = await bootPage(`
      <main l-data="{ n: 1 }"><button @click="n++">+</button></main>
    `);
    overlay.show();
    expect(overlay.host().shadowRoot.textContent).toContain('"n": 1');

    (document.querySelector("button") as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 0));
    overlay.render();
    expect(overlay.host().shadowRoot.textContent).toContain('"n": 2');
  });

  test("shows recorded diagnostics from the dev engine", async () => {
    const warn = console.warn;
    console.warn = () => {};
    try {
      const overlay = await bootPage(`<main l-data="{}"><p id="bad" l-text="a.b.c"></p></main>`);
      await new Promise((r) => setTimeout(r, 0));
      overlay.show();
      expect(overlay.host().shadowRoot.textContent).toContain("expression");
      expect(overlay.host().shadowRoot.textContent).toContain("p#bad");
    } finally {
      console.warn = warn;
    }
  });

  test("escapes page-controlled text — a scope value cannot inject markup", async () => {
    const overlay = await bootPage(`<main l-data="{ evil: '&lt;img src=x onerror=boom&gt;' }"></main>`);
    overlay.show();
    const html = overlay.host().shadowRoot.innerHTML;
    expect(html).toContain("&lt;img");
    expect(overlay.host().shadowRoot.querySelector("img")).toBeNull();
  });

  test("degrades to a notice when Faqir is not on the page", async () => {
    const overlay = await bootPage(`<div>plain page</div>`);
    const saved = (globalThis as any).window.__FAQIR_DEVTOOLS__;
    delete (globalThis as any).window.__FAQIR_DEVTOOLS__;
    try {
      overlay.show();
      expect(overlay.host().shadowRoot.textContent).toContain("not detected");
    } finally {
      (globalThis as any).window.__FAQIR_DEVTOOLS__ = saved;
    }
  });
});

describe("the dev server serves and injects it", () => {
  test("HTML gets the tag, the route serves the script, other files are untouched", async () => {
    const dir = tmp();
    writeFileSync(join(dir, "index.html"), "<html><body><h1>hello</h1></body></html>");
    writeFileSync(join(dir, "app.js"), "console.log('untouched');\n");

    const port = 42000 + Math.floor(Math.random() * 10000);
    // `faqir dev` resolves --dir against the cwd, so the fixture directory is
    // the cwd and the CLI entry is addressed absolutely.
    const server = spawn("bun", [join(ROOT, "src", "index.ts"), "dev", "--port", String(port)], {
      cwd: dir,
      stdio: ["ignore", "pipe", "pipe"],
    });

    try {
      await waitForListening(server, port);

      const html = await get(port, "/index.html");
      expect(html.body).toContain("<h1>hello</h1>");
      expect(html.body).toContain("data-faqir-dev-overlay");
      expect(html.body).toContain(`src="${OVERLAY_ROUTE}"`);
      // …and the file on disk was not rewritten.
      expect(readFileSync(join(dir, "index.html"), "utf8")).not.toContain("faqir-dev-overlay");

      const script = await get(port, OVERLAY_ROUTE);
      expect(script.headers["content-type"]).toContain("javascript");
      expect(script.body).toBe(OVERLAY_SOURCE);

      const js = await get(port, "/app.js");
      expect(js.body).toBe("console.log('untouched');\n");
    } finally {
      server.kill("SIGKILL");
    }
  }, 30_000);

  test("--no-overlay serves the page verbatim and 404s the route", async () => {
    const dir = tmp();
    writeFileSync(join(dir, "index.html"), "<html><body><h1>hello</h1></body></html>");

    const port = 42000 + Math.floor(Math.random() * 10000);
    const server = spawn(
      "bun",
      [join(ROOT, "src", "index.ts"), "dev", "--port", String(port), "--no-overlay"],
      { cwd: dir, stdio: ["ignore", "pipe", "pipe"] },
    );

    try {
      await waitForListening(server, port);
      expect((await get(port, "/index.html")).body).toBe("<html><body><h1>hello</h1></body></html>");
      expect((await get(port, OVERLAY_ROUTE)).status).toBe(404);
    } finally {
      server.kill("SIGKILL");
    }
  }, 30_000);

  test("--json describes the overlay it would inject", async () => {
    const proc = Bun.spawn(["bun", "src/index.ts", "dev", "--json", "--dir", "."], { cwd: ROOT });
    const out = JSON.parse(await new Response(proc.stdout).text());
    expect(out.overlay).toBe(true);
    expect(out.overlay_route).toBe(OVERLAY_ROUTE);
    expect(out.overlay_shortcut).toBe(OVERLAY_SHORTCUT);

    const off = Bun.spawn(["bun", "src/index.ts", "dev", "--json", "--no-overlay"], { cwd: ROOT });
    const offOut = JSON.parse(await new Response(off.stdout).text());
    expect(offOut.overlay).toBe(false);
    expect(offOut.overlay_route).toBeNull();
  }, 30_000);

  test("--help documents the shortcut and the opt-out", async () => {
    const proc = Bun.spawn(["bun", "src/index.ts", "dev", "--help"], { cwd: ROOT });
    const out = await new Response(proc.stdout).text();
    expect(out).toContain("--no-overlay");
    expect(out).toContain(OVERLAY_SHORTCUT);
  }, 30_000);
});

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * A plain node:http GET. The suite registers happy-dom globally, whose `fetch`
 * enforces a same-origin policy against the document's origin and would refuse
 * to talk to the spawned server.
 */
function get(port: number, path: string): Promise<{ status: number; headers: Record<string, any>; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port, path, method: "GET" }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers as any, body }));
    });
    req.on("error", reject);
    req.end();
  });
}

/** Resolve once the spawned dev server answers on `port`. */
async function waitForListening(server: ReturnType<typeof spawn>, port: number) {
  let stderr = "";
  server.stderr?.on("data", (b) => (stderr += b));
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error(`dev server exited: ${stderr}`);
    try {
      await get(port, "/");
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw new Error(`dev server never listened on ${port}: ${stderr}`);
}
