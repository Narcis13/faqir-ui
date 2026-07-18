// Dev server for the @faqir-ui/react demo page (task 0.7-02 acceptance).
// Bundles App.tsx with Bun.build (target=browser) and serves it against the
// REAL Faqir CSS bundle from @faqir-ui/core/dist. Run:
//
//   bun packages/react/examples/demo/serve.ts   # then open http://localhost:4174
//
// This is a demo harness, not part of the published package surface.

import { join } from "node:path";
import { rmSync } from "node:fs";

const DIR = import.meta.dir;
const CSS = join(DIR, "..", "..", "..", "core", "dist", "faqir.default.css");
const PORT = 4174;

// Mount under StrictMode so the create→destroy→create effect double-invoke is
// exercised in a real browser, not just in the test env.
const entryPath = join(DIR, ".main.compiled.tsx");
await Bun.write(
  entryPath,
  `import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
createRoot(document.getElementById("app")!).render(<StrictMode><App /></StrictMode>);
`
);

const build = await Bun.build({
  entrypoints: [entryPath],
  target: "browser",
  format: "esm",
  minify: false,
  define: { "process.env.NODE_ENV": JSON.stringify("development") },
});
rmSync(entryPath, { force: true });
if (!build.success) {
  for (const log of build.logs) console.error(log);
  process.exit(1);
}
const appJs = await build.outputs[0].text();

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>@faqir-ui/react demo</title>
  <link rel="stylesheet" href="/faqir.css">
</head>
<body style="padding: 2rem; max-width: 720px; margin: 0 auto">
  <div id="app"></div>
  <script type="module" src="/app.js"></script>
</body>
</html>`;

Bun.serve({
  port: PORT,
  fetch(req) {
    const path = new URL(req.url).pathname;
    if (path === "/app.js")
      return new Response(appJs, { headers: { "content-type": "text/javascript" } });
    if (path === "/faqir.css")
      return new Response(Bun.file(CSS), { headers: { "content-type": "text/css" } });
    return new Response(html, { headers: { "content-type": "text/html" } });
  },
});

console.log(`@faqir-ui/react demo → http://localhost:${PORT}`);
