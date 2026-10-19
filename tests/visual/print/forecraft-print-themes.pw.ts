// forecraft #48 — the five print themes, printing the invoice scaffold, are
// five typographic identities rather than one page in five inks.
//
// The five are the two AUTHORED print themes (`document`, `document-serif`) and
// the three generated companions (`editorial-document`, `ink-document`,
// `swiss-document`). Each prints the invoice `faqir scaffold invoice` writes,
// with that theme in place of `document`, and every assertion reads either the
// computed style (Playwright getComputedStyle) or the PDF itself — the faces
// it embeds, the thickness of each rule Skia fills, the sizes it sets text at.
// No rasteriser and no PNG baseline, so this runs without Poppler and a
// failure is a contract change, never noise.
//
// Colour is deliberately left out of both fingerprints: the companions always
// differed in hue, and hue is not an identity. What must differ, pairwise, is
// the TYPOGRAPHY — and before #48 the three companions were identical in it.

import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { inflateSync } from "node:zlib";
import { buildDocumentScaffoldPage } from "../../scaffolds/document-pages";
import { contrastRatio, parseCssColor } from "../../../src/utils/oklch";
import { REGISTRY } from "./matrix";
import { readPdf } from "./pdf-facts";

const PRINT_THEMES = [
  "document",
  "document-serif",
  "editorial-document",
  "ink-document",
  "swiss-document",
] as const;
type PrintTheme = (typeof PRINT_THEMES)[number];

const DOCUMENT_THEME = readFileSync(join(REGISTRY, "themes/document.css"), "utf8");

/** The invoice scaffold, with `theme` printed in place of the `document` theme. */
function invoiceIn(theme: PrintTheme): string {
  const page = buildDocumentScaffoldPage("invoice");
  if (!page.includes(DOCUMENT_THEME)) throw new Error("the scaffold page no longer inlines themes/document.css");
  const css = readFileSync(join(REGISTRY, `themes/${theme}.css`), "utf8");
  return page.replace(DOCUMENT_THEME, () => css);
}

// ── A few more PDF facts than pdf-facts.ts reads ────────────────────────────
// The faces a PDF embeds, and every thin filled rectangle Skia paints — which
// is how Chromium prints a border. Same shape of reader as pdf-facts.ts, for
// the same Skia output; it throws rather than returning nothing.

function contentStreams(pdf: Buffer): string[] {
  const latin = pdf.toString("latin1");
  const streams: string[] = [];
  const header = /(\d+) 0 obj\s*/g;
  let match: RegExpExecArray | null;
  while ((match = header.exec(latin))) {
    const start = match.index + match[0].length;
    const end = latin.indexOf("endobj", start);
    if (end < 0) break;
    const body = latin.slice(start, end);
    const at = body.indexOf("stream");
    const dict = at >= 0 ? body.slice(0, at) : "";
    if (at >= 0 && /\/Length\s+\d+/.test(dict) && !/\/(Subtype|Type)\s*\/(Image|XObject|FontFile|Type1C|CIDFontType0C|OpenType)|\/Length1|ToUnicode/.test(dict)) {
      let dataStart = start + at + "stream".length;
      if (latin[dataStart] === "\r") dataStart++;
      if (latin[dataStart] === "\n") dataStart++;
      const raw = pdf.subarray(dataStart, dataStart + Number(/\/Length\s+(\d+)/.exec(dict)![1]));
      try {
        const text = (/\/FlateDecode/.test(dict) ? inflateSync(raw) : raw).toString("latin1");
        if (/\b(re|Tf)\b/.test(text)) streams.push(text);
      } catch {
        // not a stream we read
      }
    }
    header.lastIndex = end;
  }
  if (streams.length === 0) throw new Error("forecraft-print-themes: no content streams — not a PDF Skia wrote?");
  return streams;
}

interface PrintFacts {
  /** Embedded faces, subset prefix stripped: `DejaVuSerif-Bold`. */
  fonts: string[];
  /** Horizontal rules: thickness (CSS px) and the grey level they are filled in. */
  rules: Array<{ h: number; grey: number }>;
  /** Every size text is set at (CSS px), sorted. */
  sizes: number[];
  /** How many text runs are set at each size (Skia selects the font per run). */
  runsAt: Record<string, number>;
}

function printFacts(pdf: Buffer): PrintFacts {
  const latin = pdf.toString("latin1");
  const fonts = [...new Set([...latin.matchAll(/\/BaseFont\s*\/([^\s/<>[\]()]+)/g)].map((m) => m[1].replace(/^[A-Z]{6}\+/, "")))].sort();
  const rules: PrintFacts["rules"] = [];
  const runsAt = new Map<number, number>();
  for (const content of contentStreams(pdf)) {
    let grey = 0;
    const ops = /([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+rg\b|([-\d.]+)\s+([-\d.]+)\s+([\d.]+)\s+([\d.]+)\s+re\s+f\b|\/[\w.+-]+\s+([\d.]+)\s+Tf\b/g;
    let m: RegExpExecArray | null;
    while ((m = ops.exec(content))) {
      if (m[1] != null) grey = (Number(m[1]) + Number(m[2]) + Number(m[3])) / 3;
      else if (m[4] != null) {
        const w = Number(m[6]);
        const h = Number(m[7]);
        if (w >= 20 && h > 0 && h <= 4) rules.push({ h, grey: Number(grey.toFixed(3)) });
      } else {
        const size = Number(Number(m[8]).toFixed(2));
        runsAt.set(size, (runsAt.get(size) ?? 0) + 1);
      }
    }
  }
  if (fonts.length === 0) throw new Error("forecraft-print-themes: the PDF embeds no font");
  if (runsAt.size === 0) throw new Error("forecraft-print-themes: the PDF sets no text");
  const sizes = [...runsAt.keys()].sort((a, b) => a - b);
  return { fonts, rules, sizes, runsAt: Object.fromEntries(sizes.map((s) => [String(s), runsAt.get(s)!])) };
}

/**
 * The typographic fingerprint of a printed invoice: the faces embedded, how
 * many rules are filled at each weight, and how many text runs are set at each
 * size. Colour is not in it.
 */
function pdfFingerprint(facts: PrintFacts): string {
  const rules: Record<string, number> = {};
  for (const rule of facts.rules) rules[rule.h] = (rules[rule.h] ?? 0) + 1;
  return JSON.stringify({ fonts: facts.fonts, rules, runsAt: facts.runsAt });
}

// ── What the browser computed ───────────────────────────────────────────────

/** Typographic document tokens only — no colour, which is hue, not identity. */
const TYPE_TOKENS = [
  "--doc-font",
  "--doc-heading-font",
  "--doc-heading-weight",
  "--doc-font-size",
  "--doc-line-height",
  "--doc-table-font-size",
  "--doc-table-num-scale",
  "--doc-table-header-weight",
  "--doc-table-cell-pad-y",
  "--doc-table-cell-pad-x",
  "--doc-table-flush",
  "--doc-rule-scale",
  "--doc-rule-strong-scale",
  "--page-margin-left",
  "--page-margin-right",
] as const;

interface Computed {
  tokens: Record<string, string>;
  h1Font: string;
  bodyFont: string;
  serifRole: string;
  lineHeight: number;
  fontSize: number;
  th: { bottom: number; weight: number; bg: string; fg: string };
  td: { bottom: number; size: number; padStart: number };
  num: { size: number };
  tfootTop: number;
  pageBg: string;
}

async function computed(page: Page): Promise<Computed> {
  return page.evaluate((names) => {
    const doc = document.querySelector('[data-ui="document"]')!;
    const style = (el: Element) => getComputedStyle(el);
    const px = (value: string) => parseFloat(value);
    const th = document.querySelector('[data-part="thead"] [data-part="th"]')!;
    const td = document.querySelector('[data-part="tbody"] [data-part="td"]')!;
    const num = document.querySelector('[data-part="tbody"] [data-part="td"][data-format="currency"]')!;
    const tfoot = document.querySelector('[data-part="tfoot"] [data-part="td"]')!;
    const body = doc.querySelector("p, dd, address, span") ?? doc;
    const root = style(document.documentElement);
    return {
      tokens: Object.fromEntries(names.map((name) => [name, style(doc).getPropertyValue(name).trim()])),
      h1Font: style(doc.querySelector("h1")!).fontFamily,
      bodyFont: style(body).fontFamily,
      serifRole: root.getPropertyValue("--font-serif").trim(),
      lineHeight: px(style(doc).lineHeight) / px(style(doc).fontSize),
      fontSize: px(style(doc).fontSize),
      th: {
        bottom: px(style(th).borderBottomWidth),
        weight: Number(style(th).fontWeight),
        bg: style(th).backgroundColor,
        fg: style(th).color,
      },
      td: {
        bottom: px(style(td).borderBottomWidth),
        size: px(style(td).fontSize),
        padStart: px(style(td).paddingInlineStart),
      },
      num: { size: px(style(num).fontSize) },
      tfootTop: px(style(tfoot).borderTopWidth),
      pageBg: style(doc).backgroundColor,
    };
  }, [...TYPE_TOKENS]);
}

interface Printed {
  computed: Computed;
  facts: PrintFacts;
  text: string;
}

async function printInvoice(page: Page, theme: PrintTheme): Promise<Printed> {
  await page.route(/^https?:\/\//, (route) => route.abort());
  await page.emulateMedia({ media: "print" });
  await page.setContent(invoiceIn(theme), { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  const result = await computed(page);
  const pdf = await page.pdf({
    preferCSSPageSize: true,
    printBackground: true,
    displayHeaderFooter: false,
    tagged: false,
    outline: false,
  });
  return {
    computed: result,
    facts: printFacts(pdf),
    text: readPdf(pdf).map((p) => p.text).join("\n"),
  };
}

/** Every unordered pair whose two values are equal. */
function collisions<T>(values: Record<PrintTheme, T>, key: (value: T) => string): string[] {
  const out: string[] = [];
  for (let i = 0; i < PRINT_THEMES.length; i++) {
    for (let j = i + 1; j < PRINT_THEMES.length; j++) {
      const a = PRINT_THEMES[i];
      const b = PRINT_THEMES[j];
      if (key(values[a]) === key(values[b])) out.push(`${a} = ${b}`);
    }
  }
  return out;
}

const L = (color: string) => {
  const m = /oklch\(\s*([\d.]+)/.exec(color);
  if (!m) throw new Error(`not an oklch() colour: ${color}`);
  return Number(m[1]);
};

test.describe.configure({ mode: "serial" });

test.describe("#48 the five print themes print the invoice as five identities", () => {
  const printed = {} as Record<PrintTheme, Printed>;

  test.beforeAll(async ({ browser }) => {
    for (const theme of PRINT_THEMES) {
      const page = await browser.newPage();
      printed[theme] = await printInvoice(page, theme);
      await page.close();
    }
  });

  test("every theme prints the invoice", () => {
    for (const theme of PRINT_THEMES) {
      expect(printed[theme].text, theme).toContain("Invoice");
      expect(printed[theme].text, theme).toContain("6,944.00");
      expect(printed[theme].facts.rules.length, theme).toBeGreaterThan(0);
    }
  });

  test("no two of the five compute the same typographic document tokens", () => {
    expect(collisions(printed, (p) => JSON.stringify(p.computed.tokens))).toEqual([]);
  });

  test("no two of the five print the same faces, rule weights and type sizes", () => {
    expect(collisions(printed, (p) => pdfFingerprint(p.facts))).toEqual([]);
  });

  test("editorial: a serif heading voice over sans copy, a wider measure, softer rules", () => {
    const editorial = printed["editorial-document"];
    const plain = printed.document;

    // The heading is set in the project's serif role, the copy is not.
    const family = (list: string) => list.replace(/['"]/g, "");
    expect(family(editorial.computed.h1Font)).toBe(family(editorial.computed.serifRole));
    expect(editorial.computed.bodyFont).not.toBe(editorial.computed.h1Font);
    expect(plain.computed.h1Font).toBe(plain.computed.bodyFont);
    // …and the paper carries a face the plain document never embeds.
    const added = editorial.facts.fonts.filter((f) => !plain.facts.fonts.includes(f));
    expect(added.length).toBeGreaterThan(0);

    // A wider measure: narrower inline page margins, with more leading for it.
    expect(parseFloat(editorial.computed.tokens["--page-margin-left"])).toBeLessThan(
      parseFloat(plain.computed.tokens["--page-margin-left"]),
    );
    expect(editorial.computed.lineHeight).toBeGreaterThan(plain.computed.lineHeight);

    // Softer rules: no rule heavier than a hairline, and each one lighter.
    expect(Math.max(...editorial.facts.rules.map((r) => r.h))).toBe(1);
    expect(Math.max(...plain.facts.rules.map((r) => r.h))).toBe(2);
    expect(Math.min(...editorial.facts.rules.map((r) => r.grey))).toBeGreaterThan(
      Math.min(...plain.facts.rules.map((r) => r.grey)),
    );
  });

  test("swiss: a tight grotesk setting, flush rules, larger tabular numerals", () => {
    const swiss = printed["swiss-document"];
    const plain = printed.document;

    // Tight: less leading than any other print theme.
    for (const theme of PRINT_THEMES.filter((t) => t !== "swiss-document")) {
      expect(swiss.computed.lineHeight, theme).toBeLessThan(printed[theme].computed.lineHeight);
    }
    // A sans voice throughout — the heading in the body's face.
    expect(swiss.computed.h1Font).toBe(swiss.computed.bodyFont);

    // Flush: the first column's text starts on the rule's edge, and the head
    // is marked by its rule alone — no tinted band.
    expect(swiss.computed.td.padStart).toBe(0);
    expect(plain.computed.td.padStart).toBeGreaterThan(0);
    expect(swiss.computed.th.bg).toBe(swiss.computed.pageBg);
    // …and the rules are black, not grey.
    const black = (t: PrintTheme) => printed[t].facts.rules.filter((r) => r.grey < 0.1).length;
    expect(black("swiss-document")).toBeGreaterThan(4);
    expect(black("document")).toBe(0);

    // Larger tabular numerals: an amount is set above the row's own size, and
    // the paper sets more text at that size than the plain document does.
    expect(swiss.computed.num.size).toBeGreaterThan(swiss.computed.td.size);
    expect(plain.computed.num.size).toBe(plain.computed.td.size);
    const numSize = String(Number(swiss.computed.num.size.toFixed(2)));
    expect(swiss.facts.runsAt[numSize] ?? 0).toBeGreaterThan(plain.facts.runsAt[numSize] ?? 0);
  });

  test("ink: heavier rules, a table head in stronger contrast", () => {
    const ink = printed["ink-document"];
    const plain = printed.document;

    // Heavier: rows at 2px, head and totals at 3px — the heaviest of the five.
    expect(ink.computed.td.bottom).toBe(2);
    expect(ink.computed.th.bottom).toBe(3);
    expect(ink.computed.tfootTop).toBe(3);
    const heaviest = (t: PrintTheme) => Math.max(...printed[t].facts.rules.map((r) => r.h));
    expect(heaviest("ink-document")).toBe(3);
    for (const theme of PRINT_THEMES.filter((t) => t !== "ink-document")) {
      expect(heaviest(theme), theme).toBeLessThan(3);
    }
    expect(ink.facts.rules.filter((r) => r.h >= 2).length).toBeGreaterThan(
      plain.facts.rules.filter((r) => r.h >= 2).length,
    );

    // The head stands further apart: a deeper band than the plain document's,
    // bold, and its darkest ink on it at better than AAA.
    expect(L(ink.computed.th.bg)).toBeLessThan(L(plain.computed.th.bg));
    expect(ink.computed.th.weight).toBeGreaterThan(plain.computed.th.weight);
    const fg = parseCssColor(ink.computed.th.fg);
    const bg = parseCssColor(ink.computed.th.bg);
    expect(fg && bg).toBeTruthy();
    expect(contrastRatio(fg!, bg!)).toBeGreaterThanOrEqual(7);
  });
});
