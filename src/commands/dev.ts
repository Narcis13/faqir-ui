import { existsSync, watch } from "node:fs";
import { join, extname } from "node:path";
import { log } from "../utils/logger";
import { emitJSON } from "../utils/json-output";
import { configExists, readConfig } from "../utils/config";
import { generateBundle } from "../utils/bundler";
import {
  OVERLAY_ROUTE,
  OVERLAY_SHORTCUT,
  OVERLAY_SOURCE,
  injectOverlay,
} from "../dev/overlay";

interface DevOptions {
  port: number;
  dir: string;
  open: boolean;
  autoBundle: boolean;
  overlay: boolean;
}

function parseArgs(args: string[]): DevOptions {
  const opts: DevOptions = {
    port: 3000,
    dir: ".",
    open: false,
    autoBundle: false,
    overlay: true,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--port":
        opts.port = parseInt(args[++i], 10) || 3000;
        break;
      case "--dir":
        opts.dir = args[++i] || ".";
        break;
      case "--open":
        opts.open = true;
        break;
      case "--bundle":
        opts.autoBundle = true;
        break;
      case "--no-overlay":
        opts.overlay = false;
        break;
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
    }
  }

  return opts;
}

function printHelp() {
  log.heading("faqir dev");
  log.blank();
  console.log("Start a local development server.");
  log.blank();
  console.log("Usage:");
  console.log("  faqir dev");
  console.log("  faqir dev --port 8080");
  console.log("  faqir dev --bundle");
  log.blank();
  console.log("Options:");
  log.table([
    ["--port <number>", "Port to listen on (default: 3000)"],
    ["--dir <path>", "Directory to serve (default: '.')"],
    ["--open", "Open browser automatically"],
    ["--bundle", "Auto-rebuild CSS bundle on file changes"],
    ["--no-overlay", "Do not inject the inspector overlay into served HTML"],
  ]);
  log.blank();
  console.log(
    `Served HTML gets the Faqir inspector overlay — press ${OVERLAY_SHORTCUT} to toggle it.\n` +
      "It is injected by this server only and is never written into your project.",
  );
}

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".txt": "text/plain",
  ".xml": "application/xml",
  ".webp": "image/webp",
};

export async function dev(args: string[]): Promise<void> {
  const opts = parseArgs(args);
  const cwd = process.cwd();
  const rootDir = join(cwd, opts.dir);

  // `--json` describes the server it *would* start (a blocking server can't
  // satisfy the single-document JSON contract) and returns without listening.
  if (args.includes("--json")) {
    emitJSON({
      command: "dev",
      port: opts.port,
      dir: opts.dir,
      url: `http://localhost:${opts.port}`,
      auto_bundle: opts.autoBundle,
      overlay: opts.overlay,
      overlay_route: opts.overlay ? OVERLAY_ROUTE : null,
      overlay_shortcut: opts.overlay ? OVERLAY_SHORTCUT : null,
      serves: existsSync(rootDir),
    });
    return;
  }

  if (!existsSync(rootDir)) {
    log.error(`Directory '${opts.dir}' not found.`);
    process.exit(1);
  }

  const server = Bun.serve({
    port: opts.port,
    async fetch(req) {
      const url = new URL(req.url);

      // The inspector overlay is served from the dev server itself — it is not
      // a file in the user's project and never becomes one. [task 0.7-12]
      if (opts.overlay && url.pathname === OVERLAY_ROUTE) {
        return new Response(OVERLAY_SOURCE, {
          headers: {
            "Content-Type": "application/javascript",
            "Cache-Control": "no-cache",
          },
        });
      }

      let filePath = join(rootDir, decodeURIComponent(url.pathname));

      // Directory → index.html
      if (filePath.endsWith("/")) {
        filePath += "index.html";
      }

      // Try the path, then try with index.html appended
      let file = Bun.file(filePath);
      if (!(await file.exists())) {
        file = Bun.file(filePath + "/index.html");
        if (!(await file.exists())) {
          return new Response("Not Found", { status: 404 });
        }
      }

      const ext = extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || "application/octet-stream";

      // HTML is rewritten on the way out to carry the overlay script tag. The
      // file on disk is never touched.
      if (opts.overlay && contentType === "text/html") {
        return new Response(injectOverlay(await file.text()), {
          headers: {
            "Content-Type": contentType,
            "Cache-Control": "no-cache",
          },
        });
      }

      // Read bytes explicitly so the response body is a plain BodyInit that
      // works under both the Bun runtime and the Node runtime shim.
      return new Response(await file.arrayBuffer(), {
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "no-cache",
        },
      });
    },
  });

  const url = `http://localhost:${server.port}`;
  log.heading("Faqir Dev Server");
  log.success(`Serving ${opts.dir}/ at ${url}`);

  if (opts.overlay) {
    log.step(`Inspector overlay injected — press ${OVERLAY_SHORTCUT} in the page to toggle.`);
  }

  if (opts.autoBundle && configExists(cwd)) {
    const config = await readConfig(cwd);
    const outputDir = join(cwd, config.output_dir);

    if (existsSync(outputDir)) {
      let debounceTimer: ReturnType<typeof setTimeout> | null = null;

      watch(outputDir, { recursive: true }, (eventType, filename) => {
        if (!filename?.endsWith(".css")) return;
        if (filename === "faqir.bundle.css") return;

        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(async () => {
          await generateBundle(cwd);
          log.step("Bundle rebuilt.");
        }, 200);
      });

      log.step("Watching for CSS changes, auto-rebuilding bundle.");
    }
  }

  log.dim("Press Ctrl+C to stop.");

  if (opts.open) {
    const { exec } = await import("node:child_process");
    exec(`open ${url}`);
  }

  // Keep process alive
  await new Promise(() => {});
}
