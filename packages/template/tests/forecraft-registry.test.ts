// Upstream note 46 (forecraft): `+table` was `unknown-component` in 1.2.5,
// listed as unavailable because its boolean prop `no-resize` "is not a valid
// prop name". Since 3dfb0d6 the bindings IR turns a kebab-case manifest name
// into its camelCase argument. This guards the whole registry: no component
// may be unavailable for a naming reason, and every boolean prop with an
// attribute is callable under its camelCase name.
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { listRegistryComponents } from "../../../src/utils/components";
import { getRegistryPath } from "../../../src/utils/fs";
import { compile } from "../src/compile.js";
import { render } from "../src/index.js";
import { components as table } from "../src/registry.js";

const NAMING = /not a valid prop name|collides with an existing prop/;
const t = table as any;

function manifestOf(kind: string, name: string): any {
  return JSON.parse(readFileSync(join(getRegistryPath(), kind, name, `${name}.manifest.json`), "utf8"));
}

describe("the registry's template table", () => {
  it("lists no component as unavailable for a naming reason", () => {
    const naming = Object.entries(t.unavailable as Record<string, string>).filter(([, reason]) => NAMING.test(reason));
    expect(naming).toEqual([]);
  });

  it("takes every boolean prop with an attribute as its camelCase argument", () => {
    const missing: string[] = [];
    for (const kind of ["primitives", "recipes"]) {
      for (const name of listRegistryComponents(getRegistryPath(), kind as any)) {
        const entry = t.components[name];
        if (!entry) continue;
        for (const [prop, spec] of Object.entries((manifestOf(kind, name).props ?? {}) as Record<string, any>)) {
          // `attr on [data-part='x']` is a part's attribute, not an argument.
          if (spec.type !== "boolean" || !spec.attr || spec.attr.includes(" on [")) continue;
          const arg = prop.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());
          if (entry.states?.[arg]?.attr !== spec.attr) missing.push(`${name}.${prop} → ${arg}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it("writes only valid attribute names for state and boolean arguments", () => {
    // file-upload's `multiple on [data-part='input']` used to become a root
    // attribute named `multiple on [data-part`.
    const bad: string[] = [];
    for (const [name, entry] of Object.entries(t.components as Record<string, any>)) {
      for (const [arg, state] of Object.entries((entry.states ?? {}) as Record<string, any>)) {
        if (!/^[a-z][a-z0-9-]*$/.test(state.attr)) bad.push(`${name}.${arg}: ${state.attr}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("calls +table, writing the manifest's attribute for noResize", () => {
    const { ast, diagnostics } = compile("+table(noResize csvSkip)\n  @tbody\n    tr\n      td 1\n", { components: t });
    expect(diagnostics).toEqual([]);
    const out = render(ast!, {});
    expect(out).toContain("data-no-resize");
    expect(out).toContain("data-csv-skip");
  });
});
