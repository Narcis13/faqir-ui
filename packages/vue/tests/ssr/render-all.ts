// SSR proof script (task 0.6-13): executed via `bun run` by ssr.test.ts, so
// the bunfig test preload (happy-dom) does NOT apply — there is no window,
// document, or DOM of any kind here. Rendering every recipe component to a
// string in this environment proves the wrappers never touch the DOM at
// render time (controllers attach in onMounted, which SSR never runs).
// Output: one JSON object { name: html } on stdout.

import { createSSRApp } from "vue";
import { renderToString } from "vue/server-renderer";
import { loadRecipeBundle } from "../../../../src/bindings/recipe-ir";
import { getRegistryPath } from "../../../../src/utils/fs";
import * as barrel from "../../src/index";

if (typeof window !== "undefined" || typeof document !== "undefined") {
  throw new Error("SSR proof invalidated: a DOM global is present");
}

const recipes = await loadRecipeBundle(getRegistryPath());
const out: Record<string, string> = {};

for (const ir of recipes.irs) {
  const component = (barrel as Record<string, unknown>)[ir.componentName];
  if (!component) throw new Error(`missing barrel export ${ir.componentName}`);
  const app = createSSRApp(component as Parameters<typeof createSSRApp>[0]);
  out[ir.name] = await renderToString(app);
}

console.log(JSON.stringify(out));
