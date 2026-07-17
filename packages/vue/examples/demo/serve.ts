// Dev server for the @faqir-ui/vue demo page (task 0.6-13 acceptance).
// Compiles App.vue with vue/compiler-sfc (bundled inside the `vue` package —
// no extra dependency), bundles it with Bun.build, and serves it against the
// REAL Faqir CSS bundle from @faqir-ui/core/dist. Run:
//
//   bun packages/vue/examples/demo/serve.ts   # then open http://localhost:4173
//
// This is a demo harness, not part of the published package surface.

import { join } from "node:path";
import { rmSync } from "node:fs";
import { parse, compileScript } from "vue/compiler-sfc";

const DIR = import.meta.dir;
const CSS = join(DIR, "..", "..", "..", "core", "dist", "faqir.default.css");
const PORT = 4173;

// ── Compile App.vue → a plain TS module (written beside App.vue so its
//    relative imports into ../../src keep resolving), bundle, then clean up.
const source = await Bun.file(join(DIR, "App.vue")).text();
const { descriptor, errors } = parse(source, { filename: "App.vue" });
if (errors.length) throw new Error(errors.map(String).join("\n"));

const compiled = compileScript(descriptor, {
  id: "demo-app",
  inlineTemplate: true,
  genDefaultAs: "__App",
});

const appModule = `${compiled.content}\nexport default __App;\n`;
const appPath = join(DIR, ".App.compiled.ts");
const entryPath = join(DIR, ".main.compiled.ts");
await Bun.write(appPath, appModule);
await Bun.write(
  entryPath,
  `import { createApp } from "vue";\nimport App from "./.App.compiled";\ncreateApp(App).mount("#app");\n`
);

const build = await Bun.build({
  entrypoints: [entryPath],
  target: "browser",
  format: "esm",
  minify: false,
  define: {
    "process.env.NODE_ENV": JSON.stringify("development"),
    __VUE_OPTIONS_API__: "true",
    __VUE_PROD_DEVTOOLS__: "false",
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: "false",
  },
});
rmSync(appPath, { force: true });
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
  <title>@faqir-ui/vue demo</title>
  <link rel="stylesheet" href="/faqir.css">
</head>
<body>
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

console.log(`@faqir-ui/vue demo → http://localhost:${PORT}`);
