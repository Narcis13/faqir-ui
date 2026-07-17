// SSR tests for the Vue recipe wrappers (task 0.6-13, FAQIR-NEXT §11.2):
// - renderToString succeeds for EVERY recipe in a subprocess with no DOM
//   registered at all (bun run skips the happy-dom test preload), proving no
//   window/document access at render time;
// - the server markup is plain contract HTML with the `hidden` FOUC guards;
// - client mount over the SSR output hydrates without a single Vue warning.

import { describe, it, expect } from "bun:test";
import { join } from "node:path";
import { createSSRApp } from "vue";
import { renderToString } from "vue/server-renderer";
import { loadRecipeBundle } from "../../../src/bindings/recipe-ir";
import { getRegistryPath } from "../../../src/utils/fs";
import * as barrel from "../src/index";
import { __activeControllers } from "../src/index";

const recipes = await loadRecipeBundle(getRegistryPath());

function componentOf(ir: { componentName: string }) {
  return (barrel as Record<string, unknown>)[ir.componentName] as Parameters<typeof createSSRApp>[0];
}

describe("SSR renderToString (subprocess, zero DOM globals)", () => {
  const proc = Bun.spawnSync([process.execPath, "run", join(import.meta.dir, "ssr", "render-all.ts")], {
    cwd: join(import.meta.dir, "..", "..", ".."),
  });
  const stderr = proc.stderr.toString();
  const rendered = proc.exitCode === 0
    ? (JSON.parse(proc.stdout.toString()) as Record<string, string>)
    : {};

  it("renders every recipe component without window access", () => {
    expect(stderr).toBe("");
    expect(proc.exitCode).toBe(0);
    expect(Object.keys(rendered).sort()).toEqual(recipes.irs.map((ir) => ir.name).sort());
  });

  it("server markup carries the attribute contract and FOUC guards", () => {
    for (const ir of recipes.irs) {
      expect(rendered[ir.name]).toContain(`data-ui="${ir.name}"`);
    }
    // Overlay recipes ship closed: panels/overlays are hidden in initial HTML.
    for (const name of ["dialog", "alert-dialog", "drawer", "sheet", "popover", "dropdown", "tooltip", "command-palette"]) {
      expect(rendered[name]).toContain("hidden");
      expect(rendered[name]).toMatch(/data-state="(closed|hidden)"/);
    }
  });
});

describe("hydration (client mount over SSR output)", () => {
  it("hydrates every recipe without Vue warnings, then attaches the controller", async () => {
    for (const ir of recipes.irs) {
      const component = componentOf(ir);
      const html = await renderToString(createSSRApp(component));

      const container = document.createElement("div");
      document.body.appendChild(container);
      container.innerHTML = html;

      const warnings: string[] = [];
      const origWarn = console.warn;
      const origError = console.error;
      console.warn = (...args: unknown[]) => warnings.push(args.join(" "));
      console.error = (...args: unknown[]) => warnings.push(args.join(" "));

      const before = __activeControllers.size;
      let app: ReturnType<typeof createSSRApp> | null = null;
      try {
        app = createSSRApp(component);
        app.mount(container);
      } finally {
        console.warn = origWarn;
        console.error = origError;
      }

      expect({ recipe: ir.name, warnings }).toEqual({ recipe: ir.name, warnings: [] });
      expect(__activeControllers.size).toBe(before + 1); // controller attached on mount
      app.unmount();
      expect(__activeControllers.size).toBe(before);
      container.remove();
    }
  });
});
