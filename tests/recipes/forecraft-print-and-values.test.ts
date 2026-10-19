// forecraft #42, #45 and the barcode half of #51 — CSS-level contracts.
//
//   #42  table: a tfoot is a table-footer-group in print, which Chromium
//        repeats at the foot of every printed page. data-print-footer="last"
//        prints it once, as a plain row group.
//   #45  progress: the fill width could only come from style="width: …", which
//        a server template rightly refuses. data-value on the root sets it in
//        pure CSS (5 % steps everywhere, exact with typed attr()).
//   #51  barcode: the bars are drawn flush and the quiet zone is padding.

import { describe, it, expect, beforeAll, afterEach } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { auditHtmlSource } from "../../src/audit/html-audit";
import { loadRegistryManifestMap, loadRegistryStylesheetMap } from "../../src/utils/components";
import { createBarcode } from "../../registry/recipes/barcode/barcode.js";

const REGISTRY = join(import.meta.dir, "../../registry");
const read = (rel: string) => readFileSync(join(REGISTRY, rel), "utf8");
const strip = (css: string) => css.replace(/\/\*[^]*?\*\//g, "");

/** The body of the first rule whose selector is exactly `selector`, inside `css`. */
function ruleBody(css: string, selector: string): string | null {
  for (const m of strip(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (m[1].trim() === selector) return m[2];
  }
  return null;
}

/** The text of the `@media print { … }` block. */
function printBlock(css: string): string {
  const code = strip(css);
  const start = code.indexOf("@media print");
  let depth = 0;
  for (let i = code.indexOf("{", start); i < code.length; i++) {
    if (code[i] === "{") depth++;
    else if (code[i] === "}" && --depth === 0) return code.slice(start, i + 1);
  }
  throw new Error("unterminated @media print");
}

let manifests: Awaited<ReturnType<typeof loadRegistryManifestMap>>;
let styles: Awaited<ReturnType<typeof loadRegistryStylesheetMap>>;
beforeAll(async () => {
  manifests = await loadRegistryManifestMap(REGISTRY);
  styles = await loadRegistryStylesheetMap(REGISTRY);
});
const audit = (source: string) =>
  auditHtmlSource({ source, file: "f.html", manifests, styles, strict: true }).map((f) => `${f.rule_id}: ${f.message}`);

// ── #42 table print footer ───────────────────────────────────────────────────

const TFOOT = '[data-ui="table"] > :where([data-part="table"]) > [data-part="tfoot"]';
const TFOOT_LAST = '[data-ui="table"][data-print-footer="last"] > :where([data-part="table"]) > [data-part="tfoot"]';

const invoice = (attr: string) => `<div data-ui="table"${attr}>
  <table data-part="table">
    <thead data-part="thead"><tr data-part="tr"><th data-part="th" scope="col">Item</th><th data-part="th" scope="col">Amount</th></tr></thead>
    <tbody data-part="tbody"><tr data-part="tr"><td data-part="td">Work</td><td data-part="td">10</td></tr></tbody>
    <tfoot data-part="tfoot"><tr data-part="tr"><td data-part="td">Total</td><td data-part="td">10</td></tr></tfoot>
  </table>
</div>`;

describe("table data-print-footer (forecraft #42)", () => {
  it("prints the footer as a repeating footer group by default, beside the repeating header", () => {
    const print = printBlock(read("recipes/table/table.css"));
    expect(ruleBody(print.slice(print.indexOf("{") + 1), TFOOT)).toContain("display: table-footer-group");
    expect(print).toContain("display: table-header-group");
  });

  it('data-print-footer="last" makes the footer a plain row group in print — and only there', () => {
    const css = read("recipes/table/table.css");
    const print = printBlock(css);
    const body = ruleBody(print.slice(print.indexOf("{") + 1), TFOOT_LAST);
    expect(body).toContain("display: table-row-group");
    // Same chain plus one attribute on the root: strictly more specific, so it
    // beats the repeating default whatever the order.
    expect(TFOOT_LAST.replace('[data-print-footer="last"]', "")).toBe(TFOOT);
    // Screen rendering is untouched.
    expect(strip(css).replace(print, "")).not.toContain("data-print-footer");
  });

  it("is a declared prop: last and repeat audit clean, anything else is a vocabulary error", () => {
    const prop = manifests.get("table")!.props!.printFooter as any;
    expect(prop).toMatchObject({ attr: "data-print-footer", values: ["repeat", "last"], default: "repeat" });
    expect(audit(invoice(' data-print-footer="last"'))).toEqual([]);
    expect(audit(invoice(' data-print-footer="repeat"'))).toEqual([]);
    expect(audit(invoice(' data-print-footer="once"')).some((f) => f.startsWith("attribute-vocabulary"))).toBe(true);
  });
});

// ── #45 progress data-value ──────────────────────────────────────────────────

const FILL = '[data-ui="progress"][data-value] > :where([data-part="track"]) > [data-part="fill"]';

describe("progress data-value (forecraft #45)", () => {
  const css = read("primitives/progress/progress.css");

  it("sets the fill from data-value, clamped to the track, empty when unparsed", () => {
    expect(ruleBody(css, FILL)).toContain("width: clamp(0%, var(--faqir-progress, 0%), 100%)");
  });

  it("draws every whole 5 % step without typed attr()", () => {
    for (let v = 5; v <= 100; v += 5) {
      expect([v, ruleBody(css, `[data-ui="progress"][data-value="${v}"]`)]).toEqual([v, ` --faqir-progress: ${v}%; `]);
    }
  });

  it("reads any number exactly where typed attr() is supported", () => {
    const code = strip(css);
    const at = code.indexOf("@supports (width: attr(data-value %, 0%))");
    expect(at).toBeGreaterThan(code.indexOf('[data-value="100"]')); // later, so it wins
    expect(code.slice(at)).toContain("--faqir-progress: attr(data-value %, 0%);");
  });

  it("is a declared prop, and the template form carries no style attribute", () => {
    const m = manifests.get("progress")! as any;
    expect(m.props.value).toMatchObject({ type: "number", attr: "data-value" });
    expect(m.templates.html).toContain('data-value="{value}"');
    expect(m.templates.html).not.toContain("style=");
  });

  it("the reference markup uses data-value, never a style, and audits clean", () => {
    const html = read("primitives/progress/progress.html");
    expect(html.replace(/<!--[^]*?-->/g, "")).not.toMatch(/<[^>]+\sstyle="/);
    expect(audit(html)).toEqual([]);
  });

  it("an inline style on the fill still works beside it (the original form)", () => {
    const html = `<div data-ui="progress" data-value="40" role="progressbar" aria-label="Upload" aria-valuenow="42" aria-valuemin="0" aria-valuemax="100"><div data-part="track"><div data-part="fill" style="width: 42%"></div></div><span data-part="label">42%</span></div>`;
    expect(audit(html)).toEqual([]);
  });
});

// ── #51 barcode quiet zone ───────────────────────────────────────────────────

describe("barcode quiet zone as padding (forecraft #51)", () => {
  let box: HTMLElement | null = null;
  let api: { destroy(): void } | null = null;
  afterEach(() => {
    api?.destroy();
    api = null;
    box?.remove();
    box = null;
  });

  function mount(value: string) {
    box = document.createElement("div");
    box.innerHTML = `<div data-ui="barcode" data-value="${value}" role="img" aria-label="Barcode"></div>`;
    document.body.appendChild(box);
    const root = box.firstElementChild as HTMLElement;
    api = createBarcode(root);
    return root;
  }

  it("draws the bars flush: the first bar at x = 0, the viewBox exactly the symbol", () => {
    const svg = mount("INV-42").querySelector("[data-part='svg']")!;
    const width = [...svg.getAttribute("data-pattern")!].reduce((s, d) => s + Number(d), 0);
    expect(svg.getAttribute("viewBox")).toBe(`0 0 ${width} 50`);
    expect(svg.getAttribute("width")).toBe(String(width));
    expect(svg.querySelector("rect")!.getAttribute("width")).toBe(String(width));
    const d = svg.querySelector("path")!.getAttribute("d")!;
    expect(d.startsWith("M0,0")).toBe(true);
    // The last bar (the stop pattern ends in a bar) ends on the right edge.
    const last = [...d.matchAll(/M(\d+),0h(\d+)/g)].pop()!;
    expect(Number(last[1]) + Number(last[2])).toBe(width);
  });

  it("puts the ten-module quiet zone in inline padding (--barcode-quiet, modules of height / 50)", () => {
    const css = read("recipes/barcode/barcode.css");
    const body = ruleBody(css, '[data-ui="barcode"] > [data-part="svg"]')!;
    expect(body).toContain("padding-inline: calc(var(--barcode-height) * var(--barcode-quiet, 10) / 50)");
    expect(body).toContain("block-size: var(--barcode-height)");
    expect(body).toContain("background-color: var(--color-bg)");
  });

  it("an unencodable value also fires faqir:error", () => {
    const seen: CustomEvent[] = [];
    const on = (e: Event) => seen.push(e as CustomEvent);
    document.addEventListener("faqir:error", on);
    const warn = console.warn;
    console.warn = () => {};
    try {
      const root = mount("café");
      expect(root.dataset.state).toBe("error");
      expect(seen).toHaveLength(1);
      expect(seen[0].detail.message).toContain("printable ASCII only");
    } finally {
      console.warn = warn;
      document.removeEventListener("faqir:error", on);
    }
  });
});
