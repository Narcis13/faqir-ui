/**
 * Facts about a Chromium-printed PDF, read without Poppler.
 *
 * The pixel matrix (`print.pw.ts`) needs `pdftoppm`, and its baselines are only
 * canonical inside the pinned Linux container. The contract cases in
 * `forecraft-print.pw.ts` assert things that do not depend on a rasteriser at
 * all — the size of each physical page and the text printed on it — so they
 * read the PDF directly: page dictionaries for `/MediaBox`, Flate-compressed
 * content streams for the text operators, and each font's `/ToUnicode` CMap to
 * turn glyph ids back into characters.
 *
 * This is deliberately a reader for what Skia (Chromium's PDF backend) writes,
 * not a general PDF parser: uncompressed object headers, no object streams, no
 * cross-reference streams, `Tj`/`TJ` with hex strings. If Chromium ever changes
 * that shape the helper throws rather than returning an empty page, so a case
 * can never pass vacuously.
 *
 * Dependency-free (`node:zlib` only) so it runs under the Playwright runner.
 */

import { inflateSync } from "node:zlib";

export interface PdfPage {
  /** `[width, height]` in PostScript points, from the page's `/MediaBox`. */
  size: [number, number];
  /** Every glyph the page's content stream shows, in paint order, NFKC-joined. */
  text: string;
  /**
   * The glyphs grouped into text lines: consecutive glyphs on one baseline.
   * `y` is the baseline in the CSS-pixel space Skia draws that text in — the
   * sheet for page-margin boxes, the page area for the document's own flow —
   * so two lines compare only when they come from the same kind of box.
   */
  lines: Array<{ text: string; x: number; y: number }>;
  /** Filled rectangles (`re` … `f`) painted in the sheet's own space, in CSS px. */
  rects: Array<{ x: number; y: number; w: number; h: number }>;
  /** One entry per text-showing operator (Skia shows one glyph per operator). */
  runs: Array<{ text: string; x: number; y: number }>;
}

interface PdfObject {
  dict: string;
  stream: Buffer | null;
}

function parseObjects(pdf: Buffer): Map<number, PdfObject> {
  const objects = new Map<number, PdfObject>();
  const latin = pdf.toString("latin1");
  const header = /(\d+) 0 obj\s*/g;
  let match: RegExpExecArray | null;
  while ((match = header.exec(latin))) {
    const id = Number(match[1]);
    const start = match.index + match[0].length;
    const end = latin.indexOf("endobj", start);
    if (end < 0) break;
    const body = latin.slice(start, end);
    const streamAt = body.indexOf("stream");
    let dict = body;
    let stream: Buffer | null = null;
    if (streamAt >= 0 && /\/Length\s+\d+/.test(body.slice(0, streamAt))) {
      dict = body.slice(0, streamAt);
      let dataStart = start + streamAt + "stream".length;
      if (latin[dataStart] === "\r") dataStart++;
      if (latin[dataStart] === "\n") dataStart++;
      const length = Number(/\/Length\s+(\d+)/.exec(dict)![1]);
      const raw = pdf.subarray(dataStart, dataStart + length);
      stream = /\/FlateDecode/.test(dict) ? inflateSync(raw) : Buffer.from(raw);
    }
    objects.set(id, { dict, stream });
    header.lastIndex = end;
  }
  if (objects.size === 0) throw new Error("pdf-facts: no objects found — not a PDF Skia wrote?");
  if ([...objects.values()].some((o) => /\/Type\s*\/ObjStm/.test(o.dict))) {
    throw new Error("pdf-facts: object streams are not supported by this reader");
  }
  return objects;
}

function ref(dict: string, key: string): number | null {
  const m = new RegExp(`/${key}\\s+(\\d+) 0 R`).exec(dict);
  return m ? Number(m[1]) : null;
}

function refs(dict: string, key: string): number[] {
  const array = new RegExp(`/${key}\\s*\\[([^\\]]*)\\]`).exec(dict);
  if (array) return [...array[1].matchAll(/(\d+) 0 R/g)].map((m) => Number(m[1]));
  const single = ref(dict, key);
  return single == null ? [] : [single];
}

function hexToCodepoints(hex: string): string {
  let out = "";
  for (let i = 0; i + 4 <= hex.length; i += 4) out += String.fromCodePoint(parseInt(hex.slice(i, i + 4), 16));
  return out;
}

/** glyph-id (as a hex string of the source width) → text, from a ToUnicode CMap. */
function parseCMap(cmap: string): { map: Map<number, string>; width: number } {
  const map = new Map<number, string>();
  let width = 4;
  for (const block of cmap.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const m of block[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g)) {
      width = m[1].length;
      map.set(parseInt(m[1], 16), hexToCodepoints(m[2]));
    }
  }
  for (const block of cmap.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const m of block[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g)) {
      width = m[1].length;
      const lo = parseInt(m[1], 16);
      const hi = parseInt(m[2], 16);
      const base = parseInt(m[3], 16);
      for (let code = lo; code <= hi; code++) map.set(code, String.fromCodePoint(base + code - lo));
    }
  }
  return { map, width };
}

function fontMaps(objects: Map<number, PdfObject>, resourcesDict: string) {
  const fonts = new Map<string, { map: Map<number, string>; width: number }>();
  const fontDictMatch = /\/Font\s*<<([\s\S]*?)>>/.exec(resourcesDict);
  let fontEntries = fontDictMatch?.[1] ?? "";
  if (!fontDictMatch) {
    const fontRef = ref(resourcesDict, "Font");
    if (fontRef != null) fontEntries = objects.get(fontRef)?.dict ?? "";
  }
  for (const m of fontEntries.matchAll(/\/([\w.+-]+)\s+(\d+) 0 R/g)) {
    const font = objects.get(Number(m[2]));
    const toUnicode = font ? ref(font.dict, "ToUnicode") : null;
    const cmap = toUnicode != null ? objects.get(toUnicode)?.stream : null;
    fonts.set(m[1], cmap ? parseCMap(cmap.toString("latin1")) : { map: new Map(), width: 4 });
  }
  return fonts;
}

function decode(hex: string, font: { map: Map<number, string>; width: number } | undefined): string {
  if (!font) return "";
  let out = "";
  for (let i = 0; i + font.width <= hex.length; i += font.width) {
    out += font.map.get(parseInt(hex.slice(i, i + font.width), 16)) ?? "";
  }
  return out;
}

function pageText(content: string, fonts: ReturnType<typeof fontMaps>): PdfPage["runs"] {
  const runs: PdfPage["runs"] = [];
  let font: string | undefined;
  let x = 0;
  let y = 0;
  const ops = /\/([\w.+-]+)\s+[\d.]+\s+Tf|([-\d.]+)\s+([-\d.]+)\s+(?:Td|TD)|[-\d.]+\s+[-\d.]+\s+[-\d.]+\s+[-\d.]+\s+([-\d.]+)\s+([-\d.]+)\s+Tm|<([0-9a-fA-F]*)>\s*Tj|\[((?:[^\]]|\n)*?)\]\s*TJ/g;
  let m: RegExpExecArray | null;
  while ((m = ops.exec(content))) {
    if (m[1]) font = m[1];
    else if (m[2] != null) { x += Number(m[2]); y += Number(m[3]); }
    else if (m[4] != null) { x = Number(m[4]); y = Number(m[5]); }
    else {
      const hex = m[6] ?? [...(m[7] ?? "").matchAll(/<([0-9a-fA-F]*)>/g)].map((h) => h[1]).join("");
      const text = decode(hex, font ? fonts.get(font) : undefined);
      if (text) runs.push({ text, x, y });
    }
  }
  return runs;
}

function groupLines(runs: PdfPage["runs"]): PdfPage["lines"] {
  const lines: PdfPage["lines"] = [];
  for (const run of runs) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(last.y - run.y) < 0.5 && run.x >= last.x) last.text += run.text;
    else lines.push({ ...run });
  }
  for (const line of lines) line.text = line.text.normalize("NFKC");
  return lines;
}

/**
 * Filled rectangles in the stream's first graphics block — the one Skia paints
 * the sheet in (page background and page-margin boxes), before it clips to the
 * page area for the document flow.
 */
function sheetRects(content: string): PdfPage["rects"] {
  const clip = content.search(/\bW\*?\s+n\b/);
  const sheet = clip < 0 ? content : content.slice(0, clip);
  return [...sheet.matchAll(/([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+re\s+f\b/g)].map((m) => ({
    x: Number(m[1]),
    y: Number(m[2]),
    w: Number(m[3]),
    h: Number(m[4]),
  }));
}

/** Every physical page of a Chromium PDF: its size and the text painted on it. */
export function readPdf(pdf: Buffer): PdfPage[] {
  const objects = parseObjects(pdf);
  const catalog = [...objects.values()].find((o) => /\/Type\s*\/Catalog/.test(o.dict));
  if (!catalog) throw new Error("pdf-facts: no /Catalog");

  const pages: PdfPage[] = [];
  const visit = (id: number, inherited: string) => {
    const node = objects.get(id);
    if (!node) throw new Error(`pdf-facts: missing object ${id}`);
    if (/\/Type\s*\/Pages\b/.test(node.dict)) {
      for (const kid of refs(node.dict, "Kids")) visit(kid, node.dict);
      return;
    }
    const box = /\/MediaBox\s*\[\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*\]/.exec(node.dict) ??
      /\/MediaBox\s*\[\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*\]/.exec(inherited);
    if (!box) throw new Error(`pdf-facts: page ${id} has no /MediaBox`);
    const resourcesRef = ref(node.dict, "Resources");
    const resources = resourcesRef != null
      ? objects.get(resourcesRef)?.dict ?? ""
      : /\/Resources\s*<<([\s\S]*)>>/.exec(node.dict)?.[1] ?? "";
    const fonts = fontMaps(objects, resources);
    const content = refs(node.dict, "Contents")
      .map((c) => objects.get(c)?.stream?.toString("latin1") ?? "")
      .join("\n");
    const runs = pageText(content, fonts);
    pages.push({
      size: [Number(box[3]) - Number(box[1]), Number(box[4]) - Number(box[2])],
      text: runs.map((r) => r.text).join("").normalize("NFKC"),
      lines: groupLines(runs),
      rects: sheetRects(content),
      runs,
    });
  };
  const root = ref(catalog.dict, "Pages");
  if (root == null) throw new Error("pdf-facts: /Catalog has no /Pages");
  visit(root, "");
  return pages;
}
