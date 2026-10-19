// Piece 6 — the registry-wide test (docs/template.md §11.1, §11.4): every
// primitive and recipe renders through a component call with its defaults and
// its required slots filled, and every output passes `faqir audit` with zero
// errors. A component that cannot be called is on the exception list below,
// with the manifest gap that blocks it.
import { beforeAll, describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { auditHtmlSource, loadRegistryAuditInputs, type RegistryAuditInputs } from "../../../src/audit/checker";
import { registryTemplateTable, tableModule } from "../../../src/commands/template";
import { listRegistryComponents, loadRegistryStylesheetMap } from "../../../src/utils/components";
import { getRegistryPath } from "../../../src/utils/fs";
import { compile } from "../src/compile.js";
import { render } from "../src/index.js";
import { components as table } from "../src/registry.js";

/**
 * Components the template engine cannot call, and why. Each entry would be a
 * gap in the component's manifest, not in the engine. There are none: the
 * table (and the checkbox, radio, switch and toggle manifests, whose
 * `templates.html` is a group of samples) used to be here until the IR read
 * kebab-case boolean props and picked one sample out of a group.
 */
const EXCEPTIONS: Record<string, RegExp> = {};

/**
 * Components that render, but whose reference markup — `templates.html`,
 * which the engine writes exactly — fails one audit rule. Each is a gap in
 * the manifest, not in the engine: the component's own example page
 * (`<name>.html`) gives the trigger `data-ui="button"`, its `templates.html`
 * does not, and `trigger-contract` (which reads the stylesheet: the recipe
 * styles no `trigger` part) asks for it.
 */
const AUDIT_EXCEPTIONS: Record<string, string> = {
  "alert-dialog": "trigger-contract:trigger",
  dialog: "trigger-contract:trigger",
  drawer: "trigger-contract:trigger",
  sheet: "trigger-contract:trigger",
  tooltip: "trigger-contract:trigger",
};

const entries = Object.entries((table as any).components) as [string, any][];
let inputs: RegistryAuditInputs & { styles: Map<string, string> };

beforeAll(async () => {
  inputs = { ...(await loadRegistryAuditInputs(getRegistryPath())), styles: await loadRegistryStylesheetMap(getRegistryPath()) };
});

/**
 * A call with the defaults and every required slot filled — a slot that sits
 * in a repeating part (`within`) inside a fill of that part.
 */
function callFor(name: string, entry: any): string {
  const fills = (outer: string | undefined, pad: string): string[] =>
    Object.entries(entry.slots)
      .filter(([, slot]: [string, any]) => slot.required && slot.within === outer)
      .flatMap(([slot]) => {
        const inner = fills(slot, `${pad}  `);
        return inner.length > 0 ? [`${pad}@${slot}`, ...inner] : [`${pad}@${slot} Sample ${slot}`];
      });
  return [`+${name}`, ...fills(undefined, "  "), ""].join("\n");
}

describe("every registry primitive and recipe", () => {
  it("is in the table or on the exception list, and the list matches the table", () => {
    const registry = [...listRegistryComponents(getRegistryPath(), "primitives"), ...listRegistryComponents(getRegistryPath(), "recipes")].sort();
    const covered = [...entries.map(([name]) => name), ...Object.keys((table as any).unavailable)].sort();
    expect(covered).toEqual(registry);
    expect(Object.keys((table as any).unavailable).sort()).toEqual(Object.keys(EXCEPTIONS).sort());
    for (const [name, reason] of Object.entries(EXCEPTIONS)) expect((table as any).unavailable[name]).toMatch(reason);
  });

  for (const [name, entry] of entries) {
    const gap = AUDIT_EXCEPTIONS[name];
    it(`${name} renders with its defaults and required slots, ${gap ? "with its one known audit gap" : "audit-clean"}`, () => {
      const { ast, diagnostics } = compile(callFor(name, entry), { components: table as any });
      expect(diagnostics).toEqual([]);
      const html = render(ast!, {});
      expect(html).toContain(`data-ui="${name}"`);
      const errors = auditHtmlSource({ source: html, file: `${name}.html`, ...inputs }).filter((r) => r.severity === "error");
      // The exception is exact: that rule, on that part, and nothing else.
      expect(errors.map((e) => `${e.rule_id}:${e.message.match(/\[data-part="([a-z-]+)"\]/)?.[1]}`)).toEqual(gap ? [gap] : []);
    });
  }

  it("lists only audit exceptions that are callable components", () => {
    for (const name of Object.keys(AUDIT_EXCEPTIONS)) expect((table as any).components).toHaveProperty(name);
  });

  it("calls the table, whose kebab-case boolean props are camelCase arguments", () => {
    const { ast, diagnostics } = compile("+table(noResize)\n  @tbody\n    tr\n      td 1\n", { components: table as any });
    expect(diagnostics).toEqual([]);
    expect(render(ast!, {})).toContain('<div data-ui="table" data-no-resize>');
  });

  it("calls one sample of a manifest whose reference is a group of them", () => {
    const { ast, diagnostics } = compile('+checkbox(id="terms" name="terms" checked)\n  @label I agree\n', { components: table as any });
    expect(diagnostics).toEqual([]);
    expect(render(ast!, {})).toBe(
      '<label data-ui="checkbox-label">\n  <input data-ui="checkbox" type="checkbox" checked id="terms" name="terms">\n  <span data-part="label">I agree</span>\n</label>\n',
    );
  });
});

describe("the shipped table", () => {
  it("is the one the bindings IR builds today (build:template-table)", async () => {
    const fresh = tableModule(await registryTemplateTable(getRegistryPath()), "scripts/build-template-table.mjs");
    expect(readFileSync(join(import.meta.dir, "../src/registry.js"), "utf8")).toBe(fresh);
  });
});
