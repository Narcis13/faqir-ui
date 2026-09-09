/**
 * Browser smoke-suite harness — the gate for W2-1.
 *
 * The visual suite renders every component in a real browser but loads **no
 * controller JS**: it captures authored, static markup so a screenshot is
 * deterministic. The `bun test` suites run the controllers, but under happy-dom,
 * where `getComputedStyle` reports no transition and nothing bubbles the way a
 * layout engine bubbles it. Between those two, an entire class of defect had no
 * observer at all — and three shipped in 1.0:
 *
 *   • `l-validate` never ran, because bootstrap only walked out from
 *     `[l-data]` / `[data-ui]` roots and the canonical `<form l-validate>` is
 *     neither;
 *   • `l-effect` (and `l-on`, `l-text`, `l-bind`, `l-show`, `l-model`, `l-ref`)
 *     never ran on a scope root, the exact placement the docs recommend;
 *   • `drawer` never finalised `closing → closed` when dismissed through its
 *     close button — the one control its manifest marks `required` — because a
 *     button's own `background` transitionend bubbles to the panel and was
 *     consumed by a one-shot `transitionend` listener meant for the panel's
 *     `transform`.
 *
 * All three are silent: no error, no warning, correct-looking markup. They are
 * only observable in a real engine, with real CSS, driven by a real pointer.
 * That is what this suite is.
 *
 * Run: `npx playwright test --config=playwright.browser.config.ts`
 */

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { ROOT, REGISTRY, frameworkCss, sanitizeFragment } from "../visual/matrix";

/** The shipped production engine — the bytes a real page loads. */
export function coreJs(): string {
  return readFileSync(join(REGISTRY, "core", "faqir-core.js"), "utf8");
}

/** One plugin's source, by bare name (`validate` → `faqir-validate.js`). */
export function pluginJs(name: string): string {
  return readFileSync(join(REGISTRY, "core", "plugins", `faqir-${name}.js`), "utf8");
}

/** Every plugin that ships a directive, discovered from the registry. */
export const PLUGINS = ["collapse", "intersect", "mask", "persist", "validate"] as const;
export type Plugin = (typeof PLUGINS)[number];

export interface PageOptions {
  /** Plugins to load after the engine, in order. */
  plugins?: readonly string[];
  /** Theme whose CSS is inlined. Durations differ per theme; `default` ships. */
  theme?: string;
  /** Extra CSS appended after the framework sheet. */
  css?: string;
}

/**
 * A complete, live page: the full framework CSS, the engine, and any plugins —
 * assembled the way `faqir init` wires a project up, with nothing stubbed.
 *
 * Motion is deliberately NOT disabled anywhere in this suite. A transition that
 * actually runs is the subject under test, not noise to be suppressed.
 */
export function livePage(body: string, opts: PageOptions = {}): string {
  const scripts = [coreJs(), ...(opts.plugins ?? []).map(pluginJs)]
    // `faqir-core.js` documents its own usage in a header comment containing a
    // literal `</script>`, which would end the inline block and leave the rest
    // of the engine on the page as text — silently, with no error anywhere.
    .map((src) => `<script>${src.replace(/<\/script/gi, "<\\/script")}</script>`)
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en" data-theme="light" dir="ltr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>faqir browser smoke</title>
<style>${frameworkCss(opts.theme ?? "default")}
/* Harness geometry — legitimate HERE and nowhere near the screenshot suite,
   whose baselines must be shipped bytes. This suite drives a real pointer, and
   a reference fragment flush against the viewport edge puts absolutely
   positioned demo content out of reach: the left-anchored popover resolves to
   \`inset-inline-end: 100%\` of a trigger at x≈0, i.e. off-screen. Room around
   the fragment is what makes every documented affordance clickable. */
main.smoke-root { padding: 160px 200px; }
${opts.css ?? ""}</style>
</head>
<body>
<main class="smoke-root">
${body}
</main>
${scripts}
</body>
</html>`;
}

/** A live page built from a registry reference fragment (all instances of it). */
export function liveReferencePage(htmlRel: string, opts: PageOptions = {}): string {
  const path = join(ROOT, htmlRel);
  return livePage(sanitizeFragment(readFileSync(path, "utf8")), opts);
}

// ── recipe metadata, read from the manifests ────────────────────────────────

export interface RecipeManifest {
  name: string;
  states: Record<string, { attr?: string; default?: boolean; transient?: boolean }>;
  slots: Record<string, { selector?: string; required?: boolean }>;
  /** Whether the manifest documents Escape as a dismissal path. */
  escapeCloses: boolean;
  /** Method names from the controller's `@ui:provides` line. */
  provides: string[];
  htmlRel: string;
}

/** Read one recipe's manifest + controller surface, or null if it has neither. */
function readRecipe(name: string): RecipeManifest | null {
  const base = join(REGISTRY, "recipes", name);
  const manifestPath = join(base, `${name}.manifest.json`);
  const jsPath = join(base, `${name}.js`);
  const htmlPath = join(base, `${name}.html`);
  if (!existsSync(manifestPath) || !existsSync(jsPath) || !existsSync(htmlPath)) return null;

  const providesLine = readFileSync(jsPath, "utf8").match(/@ui:provides\s+(.+)/);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  return {
    name,
    states: manifest.states ?? {},
    slots: manifest.slots ?? {},
    escapeCloses: !!(manifest.a11y ?? {}).escape_closes,
    provides: providesLine ? providesLine[1].trim().split(/[\s,]+/) : [],
    htmlRel: `registry/recipes/${name}/${name}.html`,
  };
}

/**
 * Every recipe that declares the `open` ⇄ `closed` state pair and a controller
 * that drives it — the population whose "full open/close cycle" the generic
 * matrix walks. Discovered from the registry, so a new recipe joins it on its
 * own.
 *
 * `toast` (entering/visible/exiting/removed), `tooltip` (hidden/visible) and
 * `sidebar` (expanded/rail/drawer/drawer-open) each speak a different state
 * vocabulary and get their own cases in `recipe-dismiss-special.pw.ts` rather
 * than being bent into this shape.
 */
export function discoverDismissibleRecipes(): RecipeManifest[] {
  const out: RecipeManifest[] = [];
  for (const name of readdirSorted(join(REGISTRY, "recipes"))) {
    const recipe = readRecipe(name);
    if (!recipe) continue;
    if (!recipe.states.open || !recipe.states.closed) continue;
    if (!recipe.provides.includes("open") || !recipe.provides.includes("close")) continue;
    out.push(recipe);
  }
  return out;
}

/** One recipe by name — for the bespoke cases. Throws if it is missing. */
export function recipe(name: string): RecipeManifest {
  const found = readRecipe(name);
  if (!found) throw new Error(`no such recipe: ${name}`);
  return found;
}

function readdirSorted(dir: string): string[] {
  return readdirSync(dir).sort();
}

/** State names the manifest marks `transient` — legal mid-flight, never at rest. */
export function transientStates(recipe: RecipeManifest): string[] {
  return Object.entries(recipe.states)
    .filter(([, def]) => def?.transient)
    .map(([name]) => name);
}
