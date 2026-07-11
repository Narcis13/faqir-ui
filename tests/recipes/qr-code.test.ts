// ═══════════════════════════════════════════════════════════════════════════
// qr-code — controller contract  [task 0.4-20 · Controller tests C]
// ═══════════════════════════════════════════════════════════════════════════
//
// CONTRACT
//   • createQRCode(root) reads data-value + data-ecl and renders an inline <svg
//     data-part="svg"> (a white background rect + a black module path) into the
//     root, before [data-part='caption'] if present. Empty value → no <svg>.
//   • Data too long for versions 1–10 is swallowed (console.warn, no <svg>) — the
//     controller never throws out of render.
//   • update(value, ecl) rewrites the attributes and re-renders; a direct
//     data-value / data-ecl attribute change re-renders via a MutationObserver.
//   • Double init returns the same api; destroy() disconnects the observer and
//     removes the <svg>.
//
// VERIFICATION STRATEGY
//   The module matrix is reconstructed from the rendered SVG path and checked two
//   independent ways, so a placement/encoding bug cannot pass silently:
//     1. Known-good structural vectors — the three 7×7 finder patterns and the
//        timing runs are spec-fixed and asserted byte-for-byte.
//     2. Round-trip decode — a QR reader written here FROM THE SPEC (byte mode,
//        version 1, single block; shares no code with the encoder) recovers the
//        original string, proving the matrix is genuinely scannable. Two known
//        inputs ("HELLO", "faqir.dev") are our two test vectors.

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createQRCode } from "../../registry/recipes/qr-code/qr-code.js";

// Every controller is tracked and torn down after each test. The controller
// installs a MutationObserver; a stray Faqir.start() from an earlier suite also
// leaves a global body observer that auto-inits any added [data-ui] node. Both
// must be quiesced or their async callbacks re-render QR matrices during later,
// unrelated test files (noisy "[qr-code] Failed to encode" logs + flakiness).
const controllers: Array<{ destroy(): void }> = [];

// ── Render + reconstruct the boolean module matrix from the SVG path ──────────
// matrixToSVG emits one `M${c+quiet},${r+quiet}h1v1h-1z` sub-path per dark
// module (quiet zone = 2). Invert to dark cells at (r,c); infer size = 4v+17.
function matrixFromSVG(svg: SVGElement): number[][] {
  const path = svg.querySelector("[fill='var(--color-fg, #000)']") as SVGPathElement;
  const d = path.getAttribute("d") || "";
  const quiet = 2;
  const cells: Array<[number, number]> = [];
  let maxSpan = 0;
  const re = /M(\d+),(\d+)h1v1h-1z/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(d)) !== null) {
    const c = parseInt(m[1], 10) - quiet;
    const r = parseInt(m[2], 10) - quiet;
    cells.push([r, c]);
    maxSpan = Math.max(maxSpan, r + 1, c + 1);
  }
  let size = 21;
  for (let v = 1; v <= 10; v++) {
    const s = v * 4 + 17;
    if (s >= maxSpan) { size = s; break; }
  }
  const matrix = Array.from({ length: size }, () => new Array(size).fill(0));
  for (const [r, c] of cells) matrix[r][c] = 1;
  return matrix;
}

function render(value: string | null, ecl?: string) {
  const attrs =
    (value === null ? "" : ` data-value="${value}"`) + (ecl ? ` data-ecl="${ecl}"` : "");
  document.body.innerHTML = `<div data-ui="qr-code"${attrs} role="img" aria-label="QR"></div>`;
  const root = document.querySelector("[data-ui='qr-code']") as HTMLElement;
  const api = createQRCode(root);
  controllers.push(api);
  return { root, api };
}

function matrixOf(root: HTMLElement): number[][] {
  const svg = root.querySelector("[data-part='svg']") as SVGElement | null;
  if (!svg) throw new Error("no svg rendered");
  return matrixFromSVG(svg);
}

// ── Independent QR reader (spec-derived; byte mode, version 1, single block) ───
function buildReservedV1(size: number): number[][] {
  const reserved = Array.from({ length: size }, () => new Array(size).fill(0));
  const mark = (r: number, c: number) => {
    if (r >= 0 && r < size && c >= 0 && c < size) reserved[r][c] = 1;
  };
  const finder = (row: number, col: number) => {
    for (let r = -1; r <= 7; r++) for (let c = -1; c <= 7; c++) mark(row + r, col + c);
  };
  finder(0, 0);
  finder(0, size - 7);
  finder(size - 7, 0);
  for (let i = 8; i < size - 8; i++) { mark(6, i); mark(i, 6); }
  for (let i = 0; i < 8; i++) { mark(8, i); mark(8, size - 1 - i); mark(i, 8); mark(size - 1 - i, 8); }
  mark(8, 8);
  mark(size - 8, 8);
  return reserved;
}

// Read the redundant 15-bit format string near the top-left finder.
function readFormat(matrix: number[][]): { eclBits: number; mask: number } {
  let bits = 0;
  for (let i = 0; i < 15; i++) {
    let bit: number;
    if (i < 6) bit = matrix[8][i];
    else if (i === 6) bit = matrix[8][7];
    else if (i === 7) bit = matrix[8][8];
    else if (i === 8) bit = matrix[7][8];
    else bit = matrix[14 - i][8];
    bits = (bits << 1) | bit;
  }
  const data = ((bits ^ 0x5412) >> 10) & 0x1f; // 5-bit (eclBits<<3)|mask
  return { eclBits: (data >> 3) & 3, mask: data & 7 };
}

const ECL_BITS: Record<string, number> = { L: 1, M: 0, Q: 3, H: 2 };

function unmask(matrix: number[][], reserved: number[][], maskId: number): number[][] {
  const fns = [
    (r: number, c: number) => (r + c) % 2 === 0,
    (r: number) => r % 2 === 0,
    (_: number, c: number) => c % 3 === 0,
    (r: number, c: number) => (r + c) % 3 === 0,
    (r: number, c: number) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
    (r: number, c: number) => ((r * c) % 2) + ((r * c) % 3) === 0,
    (r: number, c: number) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
    (r: number, c: number) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
  ];
  const fn = fns[maskId];
  const s = matrix.length;
  const out = matrix.map((row) => row.slice());
  for (let r = 0; r < s; r++) {
    for (let c = 0; c < s; c++) {
      if (!reserved[r][c] && fn(r, c)) out[r][c] ^= 1;
    }
  }
  return out;
}

function readDataBits(matrix: number[][], reserved: number[][]): number[] {
  const s = matrix.length;
  const bits: number[] = [];
  let upward = true;
  for (let col = s - 1; col >= 1; col -= 2) {
    if (col === 6) col = 5;
    const rows = upward
      ? Array.from({ length: s }, (_, i) => s - 1 - i)
      : Array.from({ length: s }, (_, i) => i);
    for (const row of rows) {
      for (let c = 0; c < 2; c++) {
        const cc = col - c;
        if (reserved[row][cc]) continue;
        bits.push(matrix[row][cc]);
      }
    }
    upward = !upward;
  }
  return bits;
}

// Decode a version-1 byte-mode QR back to its string (no error correction — the
// generated matrix is clean, so the data codewords are read directly).
function decodeV1(matrix: number[][]): string {
  const size = matrix.length;
  if (size !== 21) throw new Error(`decodeV1 expects a 21×21 (v1) matrix, got ${size}`);
  const reserved = buildReservedV1(size);
  const { mask } = readFormat(matrix);
  const bits = readDataBits(unmask(matrix, reserved, mask), reserved);
  let p = 0;
  const take = (n: number) => {
    let v = 0;
    for (let i = 0; i < n; i++) v = (v << 1) | bits[p++];
    return v;
  };
  const mode = take(4);
  if (mode !== 0b0100) throw new Error(`expected byte mode 0100, got ${mode.toString(2)}`);
  const len = take(8);
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = take(8);
  return new TextDecoder().decode(bytes);
}

const FINDER = [
  [1, 1, 1, 1, 1, 1, 1],
  [1, 0, 0, 0, 0, 0, 1],
  [1, 0, 1, 1, 1, 0, 1],
  [1, 0, 1, 1, 1, 0, 1],
  [1, 0, 1, 1, 1, 0, 1],
  [1, 0, 0, 0, 0, 0, 1],
  [1, 1, 1, 1, 1, 1, 1],
];

function finderAt(matrix: number[][], row: number, col: number): number[][] {
  return Array.from({ length: 7 }, (_, r) =>
    Array.from({ length: 7 }, (_, c) => matrix[row + r][col + c]),
  );
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("qr-code controller", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    for (const c of controllers) {
      try {
        c.destroy();
      } catch {
        /* already destroyed */
      }
    }
    controllers.length = 0;
    document.body.innerHTML = "";
  });

  // ── rendering shell ────────────────────────────────────────────────────────
  it("renders an inline <svg data-part='svg'> with bg + fg layers", () => {
    const { root } = render("HELLO");
    const svg = root.querySelector("[data-part='svg']") as SVGElement;
    expect(svg).not.toBeNull();
    expect(svg.tagName.toLowerCase()).toBe("svg");
    expect(svg.getAttribute("shape-rendering")).toBe("crispEdges");
    expect(svg.querySelector("rect")).not.toBeNull(); // background
    expect(svg.querySelector("path")).not.toBeNull(); // modules
  });

  it("renders the SVG before an existing caption", () => {
    document.body.innerHTML =
      `<div data-ui="qr-code" data-value="HELLO"><span data-part="caption">Scan</span></div>`;
    const root = document.querySelector("[data-ui='qr-code']") as HTMLElement;
    createQRCode(root);
    const kids = [...root.children].map((c) => c.getAttribute("data-part"));
    expect(kids).toEqual(["svg", "caption"]);
  });

  // ── known-good structural vectors ──────────────────────────────────────────
  it("produces the three canonical 7×7 finder patterns (v1)", () => {
    const m = matrixOf(render("HELLO").root);
    expect(m.length).toBe(21);
    expect(finderAt(m, 0, 0)).toEqual(FINDER); // top-left
    expect(finderAt(m, 0, 14)).toEqual(FINDER); // top-right
    expect(finderAt(m, 14, 0)).toEqual(FINDER); // bottom-left
  });

  it("lays alternating timing patterns on row 6 and column 6", () => {
    const m = matrixOf(render("HELLO").root);
    for (let i = 8; i <= 12; i++) {
      const expected = i % 2 === 0 ? 1 : 0;
      expect(m[6][i]).toBe(expected);
      expect(m[i][6]).toBe(expected);
    }
  });

  // ── round-trip: the two known test vectors ─────────────────────────────────
  it("test vector 1 — 'HELLO' round-trips to a scannable matrix", () => {
    const m = matrixOf(render("HELLO").root);
    expect(decodeV1(m)).toBe("HELLO");
  });

  it("test vector 2 — 'faqir.dev' round-trips to a scannable matrix", () => {
    const m = matrixOf(render("faqir.dev").root);
    expect(m.length).toBe(21);
    expect(decodeV1(m)).toBe("faqir.dev");
  });

  it("round-trips inputs with multi-byte UTF-8 (byte mode)", () => {
    // "café" = 5 bytes (é → 2 bytes) — still v1 at ECL-M.
    const m = matrixOf(render("café").root);
    expect(decodeV1(m)).toBe("café");
  });

  // ── error-correction level option ──────────────────────────────────────────
  it("honors the ECL: the format bits encode the requested level (L/M/Q/H)", () => {
    for (const ecl of ["L", "M", "Q", "H"] as const) {
      const m = matrixOf(render("HI", ecl).root); // 2 bytes → v1 at every ECL
      expect(readFormat(m).eclBits).toBe(ECL_BITS[ecl]);
    }
  });

  it("round-trips the same short input at every ECL", () => {
    for (const ecl of ["L", "M", "Q", "H"] as const) {
      const m = matrixOf(render("HELLO", ecl).root); // ≤7 bytes → v1 even at H
      expect(m.length).toBe(21);
      expect(decodeV1(m)).toBe("HELLO");
    }
  });

  it("defaults to ECL-M when data-ecl is absent", () => {
    const m = matrixOf(render("HELLO").root);
    expect(readFormat(m).eclBits).toBe(ECL_BITS.M);
  });

  it("a bigger payload bumps the version (bigger matrix)", () => {
    const small = matrixOf(render("HELLO").root).length; // v1 → 21
    const big = matrixOf(render("x".repeat(40)).root).length; // needs > v1
    expect(small).toBe(21);
    expect(big).toBeGreaterThan(21);
  });

  // ── empty / oversize handling ──────────────────────────────────────────────
  it("renders nothing for an empty value", () => {
    const { root } = render("");
    expect(root.querySelector("[data-part='svg']")).toBeNull();
  });

  it("renders nothing when the data-value attribute is missing", () => {
    const { root } = render(null);
    expect(root.querySelector("[data-part='svg']")).toBeNull();
  });

  it("swallows oversize input (beyond v10) — no throw, no svg", () => {
    // ~3000 bytes exceeds the v10 capacity for every ECL.
    const huge = "A".repeat(3000);
    expect(() => render(huge)).not.toThrow();
    const root = document.querySelector("[data-ui='qr-code']") as HTMLElement;
    expect(root.querySelector("[data-part='svg']")).toBeNull();
  });

  // ── update() + reactive attribute observation ──────────────────────────────
  it("update(value) re-renders and replaces the previous SVG", () => {
    const { root, api } = render("HELLO");
    const first = root.querySelector("[data-part='svg']");
    api.update("faqir.dev");
    const second = root.querySelector("[data-part='svg']");
    expect(second).not.toBe(first);
    expect(root.querySelectorAll("[data-part='svg']").length).toBe(1);
    expect(decodeV1(matrixOf(root))).toBe("faqir.dev");
  });

  it("update(value, ecl) changes the error-correction level", () => {
    const { root, api } = render("HELLO", "M");
    api.update("HELLO", "Q");
    expect(readFormat(matrixOf(root)).eclBits).toBe(ECL_BITS.Q);
  });

  it("update('') clears the rendered SVG", () => {
    const { root, api } = render("HELLO");
    api.update("");
    expect(root.querySelector("[data-part='svg']")).toBeNull();
  });

  it("re-renders when data-value changes via a MutationObserver", async () => {
    const { root } = render("HELLO");
    root.setAttribute("data-value", "faqir.dev");
    await tick();
    expect(decodeV1(matrixOf(root))).toBe("faqir.dev");
  });

  // ── lifecycle ──────────────────────────────────────────────────────────────
  it("prevents double initialization", () => {
    const { root, api } = render("HELLO");
    expect(createQRCode(root)).toBe(api);
  });

  it("destroy removes the SVG and stops observing", async () => {
    const { root, api } = render("HELLO");
    // Drain any queued global auto-init (Faqir.start's body observer) so it can't
    // re-adopt the root after destroy() clears the _faqirQR marker below.
    await tick();
    api.destroy();
    expect(root.querySelector("[data-part='svg']")).toBeNull();
    expect((root as any)._faqirQR).toBeUndefined();
    // The controller's own observer no longer reacts to attribute changes.
    root.setAttribute("data-value", "faqir.dev");
    await tick();
    expect(root.querySelector("[data-part='svg']")).toBeNull();
  });
});
