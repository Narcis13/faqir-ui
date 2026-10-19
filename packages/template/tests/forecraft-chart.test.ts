// forecraft #36 — a chart from a server template.
//
// `+chart` renders the chart's table-first markup: the numbers a report
// prints whether or not JavaScript ever runs. Its controller ships as an
// opt-in plugin rather than in faqir-core, and the page still has to be told
// to load it — so the table built from the registry maps `chart` to
// `faqir-chart.js`, read from the plugin's own `@ui:controller` header, and the
// compiled template's `@ui:requires` names it.
import { beforeAll, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { auditHtmlSource, loadRegistryAuditInputs, type RegistryAuditInputs } from "../../../src/audit/checker";
import { buildTemplateTable, pluginControllerTable, registryTemplateTable } from "../../../src/commands/template";
import { loadRegistryStylesheetMap } from "../../../src/utils/components";
import { getRegistryPath } from "../../../src/utils/fs";
import { compile } from "../src/compile.js";
import { render } from "../src/index.js";

const SOURCE = `+chart(variant="bar")
  @caption Revenue by region, thousand euro
  @data
    thead
      tr
        th(scope="col") Region
        each y in years
          th(scope="col") {{ y }}
    tbody
      each r in rows
        tr
          th(scope="row") {{ r.name }}
          each v in r.values
            td {{ v }}
`;

const DATA = {
  years: ["2024", "2025"],
  rows: [
    { name: "North", values: ["1,240", "1,380"] },
    { name: "South", values: ["860", "940"] },
  ],
};

let table: any;
let inputs: RegistryAuditInputs & { styles: Map<string, string> };

beforeAll(async () => {
  table = await registryTemplateTable(getRegistryPath());
  inputs = { ...(await loadRegistryAuditInputs(getRegistryPath())), styles: await loadRegistryStylesheetMap(getRegistryPath()) };
});

describe("+chart in a server template", () => {
  it("maps the chart to the plugin that carries its controller", () => {
    expect(table.controllers.chart).toEqual(["faqir-chart.js"]);
    expect(pluginControllerTable(join(getRegistryPath(), "core", "plugins"))).toEqual({ chart: "faqir-chart.js" });
  });

  it("renders the table-first markup, names the plugin it needs, and passes the audit", () => {
    const { ast, diagnostics } = compile(SOURCE, { components: table });
    expect(diagnostics).toEqual([]);
    if (!ast) throw new Error("the chart template did not compile");
    expect(ast.requires).toContain("faqir-chart.js");
    const html = render(ast, DATA);
    expect(html.split("\n")[0]).toContain("faqir-chart.js");
    expect(html).toContain('<figure data-ui="chart" data-variant="bar">');
    expect(html).toContain('<figcaption data-part="caption">Revenue by region, thousand euro</figcaption>');
    expect(html).toContain('<table data-part="data">');
    expect(html).toMatch(/<th scope="row">North<\/th>\s*<td>1,240<\/td>\s*<td>1,380<\/td>/);

    const findings = auditHtmlSource({ source: html, file: "chart.html", ...inputs }).filter(
      (r) => r.severity === "error" || r.severity === "critical",
    );
    expect(findings).toEqual([]);
  });

  it("leaves the requires list alone for a table built without plugin controllers", async () => {
    const dir = mkdtempSync(join(tmpdir(), "faqir-chart-plugins-"));
    try {
      writeFileSync(join(dir, "faqir-plain.js"), "// @ui:plugin faqir-plain\n// @ui:provides l-plain\n");
      expect(pluginControllerTable(dir)).toEqual({});
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    const bare = buildTemplateTable([], {});
    expect(bare.controllers).toEqual({});
  });
});
