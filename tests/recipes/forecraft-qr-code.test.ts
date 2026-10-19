// forecraft #44 + #51: the QR encoder stopped at version 10 (about 213 bytes at
// ECL M), failed with only a console warning, and drew a 2-module quiet zone
// inside its SVG. It now encodes versions 1–40, reports a failure as
// data-state="error" plus a `faqir:error` event, and draws the modules flush
// with the quiet zone as CSS padding (`--qr-quiet`, 4 modules by default).
//
// VERIFICATION
//   Everything below is checked against tables written here from ISO/IEC 18004,
//   never against the encoder's own: Table 9 (EC codewords and blocks), Table 7
//   (byte-mode capacity), Annex D (version words) and Annex E (alignment
//   centres). Table 9 is itself checked against Table 7 through a module count
//   taken from the reserved-area map this file builds, so a wrong entry in
//   either table, or in the map, fails here before it can vouch for the encoder.
//   The reader shares no code with the encoder: it unmasks, de-interleaves,
//   checks every Reed-Solomon block's syndromes and parses the byte-mode
//   payload. (While writing this the encoder was also decoded by jsQR at every
//   version and ECL; jsQR misplaces one version-23 alignment centre — 74 for 78
//   — so its v23-L, which has too little EC to absorb that, is its bug, not ours.)

import { describe, it, expect, afterEach } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createQRCode } from "../../registry/recipes/qr-code/qr-code.js";

const CSS = readFileSync(join(import.meta.dir, "../../registry/recipes/qr-code/qr-code.css"), "utf8");

// ── ISO/IEC 18004 tables ─────────────────────────────────────────────────────

/** Table 9: per version, [EC codewords per block, block count] for L, M, Q, H. */
const TABLE_9: number[][][] = [
  [[7, 1], [10, 1], [13, 1], [17, 1]], [[10, 1], [16, 1], [22, 1], [28, 1]],
  [[15, 1], [26, 1], [18, 2], [22, 2]], [[20, 1], [18, 2], [26, 2], [16, 4]],
  [[26, 1], [24, 2], [18, 4], [22, 4]], [[18, 2], [16, 4], [24, 4], [28, 4]],
  [[20, 2], [18, 4], [18, 6], [26, 5]], [[24, 2], [22, 4], [22, 6], [26, 6]],
  [[30, 2], [22, 5], [20, 8], [24, 8]], [[18, 4], [26, 5], [24, 8], [28, 8]],
  [[20, 4], [30, 5], [28, 8], [24, 11]], [[24, 4], [22, 8], [26, 10], [28, 11]],
  [[26, 4], [22, 9], [24, 12], [22, 16]], [[30, 4], [24, 9], [20, 16], [24, 16]],
  [[22, 6], [24, 10], [30, 12], [24, 18]], [[24, 6], [28, 10], [24, 17], [30, 16]],
  [[28, 6], [28, 11], [28, 16], [28, 19]], [[30, 6], [26, 13], [28, 18], [28, 21]],
  [[28, 7], [26, 14], [26, 21], [26, 25]], [[28, 8], [26, 16], [30, 20], [28, 25]],
  [[28, 8], [26, 17], [28, 23], [30, 25]], [[28, 9], [28, 17], [30, 23], [24, 34]],
  [[30, 9], [28, 18], [30, 25], [30, 30]], [[30, 10], [28, 20], [30, 27], [30, 32]],
  [[26, 12], [28, 21], [30, 29], [30, 35]], [[28, 12], [28, 23], [28, 34], [30, 37]],
  [[30, 12], [28, 25], [30, 34], [30, 40]], [[30, 13], [28, 26], [30, 35], [30, 42]],
  [[30, 14], [28, 28], [30, 38], [30, 45]], [[30, 15], [28, 29], [30, 40], [30, 48]],
  [[30, 16], [28, 31], [30, 43], [30, 51]], [[30, 17], [28, 33], [30, 45], [30, 54]],
  [[30, 18], [28, 35], [30, 48], [30, 57]], [[30, 19], [28, 37], [30, 51], [30, 60]],
  [[30, 19], [28, 38], [30, 53], [30, 63]], [[30, 20], [28, 40], [30, 56], [30, 66]],
  [[30, 21], [28, 43], [30, 59], [30, 70]], [[30, 22], [28, 45], [30, 62], [30, 74]],
  [[30, 24], [28, 47], [30, 65], [30, 77]], [[30, 25], [28, 49], [30, 68], [30, 81]],
];

/** Table 7: byte-mode capacity in bytes, per version, for L, M, Q, H. */
const TABLE_7: number[][] = [
  [17, 14, 11, 7], [32, 26, 20, 14], [53, 42, 32, 24], [78, 62, 46, 34], [106, 84, 60, 44],
  [134, 106, 74, 58], [154, 122, 86, 64], [192, 152, 108, 84], [230, 180, 130, 98], [271, 213, 151, 119],
  [321, 251, 177, 137], [367, 287, 203, 155], [425, 331, 241, 177], [458, 362, 258, 194], [520, 412, 292, 220],
  [586, 450, 322, 250], [644, 504, 364, 280], [718, 560, 394, 310], [792, 624, 442, 338], [858, 666, 482, 382],
  [929, 711, 509, 403], [1003, 779, 565, 439], [1091, 857, 611, 461], [1171, 911, 661, 511], [1273, 997, 715, 535],
  [1367, 1059, 751, 593], [1465, 1125, 805, 625], [1528, 1190, 868, 658], [1628, 1264, 908, 698], [1732, 1370, 982, 742],
  [1840, 1452, 1030, 790], [1952, 1538, 1112, 842], [2068, 1628, 1168, 898], [2188, 1722, 1228, 958], [2303, 1809, 1283, 983],
  [2431, 1911, 1351, 1051], [2563, 1989, 1423, 1093], [2699, 2099, 1499, 1139], [2809, 2213, 1579, 1219], [2953, 2331, 1663, 1273],
];

/** Annex E: alignment pattern centre rows/columns, versions 2–40. */
const ANNEX_E: Record<number, number[]> = {
  2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34],
  7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50], 11: [6, 30, 54], 12: [6, 32, 58], 13: [6, 34, 62],
  14: [6, 26, 46, 66], 15: [6, 26, 48, 70], 16: [6, 26, 50, 74], 17: [6, 30, 54, 78], 18: [6, 30, 56, 82],
  19: [6, 30, 58, 86], 20: [6, 34, 62, 90],
  21: [6, 28, 50, 72, 94], 22: [6, 26, 50, 74, 98], 23: [6, 30, 54, 78, 102], 24: [6, 28, 54, 80, 106],
  25: [6, 32, 58, 84, 110], 26: [6, 30, 58, 86, 114], 27: [6, 34, 62, 90, 118],
  28: [6, 26, 50, 74, 98, 122], 29: [6, 30, 54, 78, 102, 126], 30: [6, 26, 52, 78, 104, 130],
  31: [6, 30, 56, 82, 108, 134], 32: [6, 34, 60, 86, 112, 138], 33: [6, 30, 58, 86, 114, 142],
  34: [6, 34, 62, 90, 118, 146],
  35: [6, 30, 54, 78, 102, 126, 150], 36: [6, 24, 50, 76, 102, 128, 154], 37: [6, 28, 54, 80, 106, 132, 158],
  38: [6, 32, 58, 84, 110, 136, 162], 39: [6, 26, 54, 82, 110, 138, 166], 40: [6, 30, 58, 86, 114, 142, 170],
};

/** Annex D: the 18-bit version information word, versions 7–40. */
const ANNEX_D = [
  0x07c94, 0x085bc, 0x09a99, 0x0a4d3, 0x0bbf6, 0x0c762, 0x0d847, 0x0e60d, 0x0f928, 0x10b78,
  0x1145d, 0x12a17, 0x13532, 0x149a6, 0x15683, 0x168c9, 0x177ec, 0x18ec4, 0x191e1, 0x1afab,
  0x1b08e, 0x1cc1a, 0x1d33f, 0x1ed75, 0x1f250, 0x209d5, 0x216f0, 0x228ba, 0x2379f, 0x24b0b,
  0x2542e, 0x26a64, 0x27541, 0x28c69,
];

const ECLS = ["L", "M", "Q", "H"] as const;
/** Format-information ECL bits → index into the tables (L, M, Q, H). */
const ECL_FROM_BITS: Record<number, number> = { 1: 0, 0: 1, 3: 2, 2: 3 };

// ── an independent reader ────────────────────────────────────────────────────

/** Function-pattern modules: finders + separators + format areas, timing, alignment, version info. */
function reservedMap(version: number): number[][] {
  const size = version * 4 + 17;
  const m = Array.from({ length: size }, () => new Array(size).fill(0));
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if ((r < 9 && c < 9) || (r < 9 && c >= size - 8) || (r >= size - 8 && c < 9)) m[r][c] = 1;
      if (r === 6 || c === 6) m[r][c] = 1;
    }
  }
  const centres = ANNEX_E[version] ?? [];
  for (const r of centres) {
    for (const c of centres) {
      if ((r < 9 && c < 9) || (r < 9 && c >= size - 8) || (r >= size - 8 && c < 9)) continue;
      for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) m[r + dr][c + dc] = 1;
    }
  }
  if (version >= 7) {
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 3; j++) {
        m[i][size - 11 + j] = 1;
        m[size - 11 + j][i] = 1;
      }
    }
  }
  return m;
}

/** Codewords a version holds: its data modules, counted on the map, / 8. */
function totalCodewords(version: number): number {
  return Math.floor(reservedMap(version).flat().filter((x) => x === 0).length / 8);
}

function dataCodewords(version: number, ecl: number): number {
  const [ec, blocks] = TABLE_9[version - 1][ecl];
  return totalCodewords(version) - ec * blocks;
}

const MASKS: Array<(i: number, j: number) => boolean> = [
  (i, j) => (i + j) % 2 === 0,
  (i) => i % 2 === 0,
  (_, j) => j % 3 === 0,
  (i, j) => (i + j) % 3 === 0,
  (i, j) => (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0,
  (i, j) => ((i * j) % 2) + ((i * j) % 3) === 0,
  (i, j) => (((i * j) % 2) + ((i * j) % 3)) % 2 === 0,
  (i, j) => (((i + j) % 2) + ((i * j) % 3)) % 2 === 0,
];

function gfMul(a: number, b: number): number {
  let p = 0;
  for (let i = 0; i < 8; i++) {
    if (b & 1) p ^= a;
    b >>= 1;
    a = a & 0x80 ? ((a << 1) ^ 0x11d) & 0xff : a << 1;
  }
  return p;
}

function syndromesClean(block: number[], ec: number): boolean {
  let alpha = 1;
  for (let i = 0; i < ec; i++) {
    let acc = 0;
    for (const v of block) acc = gfMul(acc, alpha) ^ v;
    if (acc !== 0) return false;
    alpha = gfMul(alpha, 2);
  }
  return true;
}

interface Decoded { text: string; version: number; ecl: string; mask: number; rsClean: boolean }

function decode(matrix: number[][]): Decoded {
  const size = matrix.length;
  const version = (size - 17) / 4;
  const reserved = reservedMap(version);

  let format = 0;
  for (let i = 0; i < 15; i++) {
    const bit = i < 6 ? matrix[8][i] : i === 6 ? matrix[8][7] : i === 7 ? matrix[8][8] : i === 8 ? matrix[7][8] : matrix[14 - i][8];
    format = (format << 1) | bit;
  }
  const info = (format ^ 0x5412) >> 10;
  const eclIdx = ECL_FROM_BITS[info >> 3];
  const mask = info & 7;

  const bits: number[] = [];
  for (let right = size - 1, up = true; right >= 1; right -= 2, up = !up) {
    if (right === 6) right = 5;
    for (let n = 0; n < size; n++) {
      const r = up ? size - 1 - n : n;
      for (const c of [right, right - 1]) {
        if (reserved[r][c]) continue;
        bits.push(matrix[r][c] ^ (MASKS[mask](r, c) ? 1 : 0));
      }
    }
  }
  const codewords: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    let v = 0;
    for (let j = 0; j < 8; j++) v = (v << 1) | bits[i + j];
    codewords.push(v);
  }

  const [ec, count] = TABLE_9[version - 1][eclIdx];
  const dc = dataCodewords(version, eclIdx);
  const short = Math.floor(dc / count);
  const longBlocks = dc % count;
  const sizes = Array.from({ length: count }, (_, b) => short + (b >= count - longBlocks ? 1 : 0));
  const blocks: number[][] = sizes.map(() => []);
  let p = 0;
  for (let i = 0; i <= short; i++) sizes.forEach((n, b) => i < n && blocks[b].push(codewords[p++]));
  for (let i = 0; i < ec; i++) blocks.forEach((b) => b.push(codewords[p++]));
  const rsClean = blocks.every((b) => syndromesClean(b, ec));

  const data = blocks.flatMap((b, i) => b.slice(0, sizes[i]));
  let bp = 0;
  const take = (n: number) => {
    let v = 0;
    for (let i = 0; i < n; i++, bp++) v = (v << 1) | ((data[bp >> 3] >> (7 - (bp & 7))) & 1);
    return v;
  };
  if (take(4) !== 0b0100) throw new Error("expected byte mode");
  const len = take(version <= 9 ? 8 : 16);
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = take(8);
  return { text: new TextDecoder().decode(bytes), version, ecl: ECLS[eclIdx], mask, rsClean };
}

// ── rendering ────────────────────────────────────────────────────────────────

let box: HTMLElement | null = null;
const apis: Array<{ destroy(): void }> = [];
afterEach(() => {
  for (const a of apis.splice(0)) a.destroy();
  box?.remove();
  box = null;
});

function mount(value: string | null, ecl?: string) {
  box?.remove();
  box = document.createElement("div");
  const root = document.createElement("div");
  root.setAttribute("data-ui", "qr-code");
  if (value !== null) root.setAttribute("data-value", value);
  if (ecl) root.setAttribute("data-ecl", ecl);
  box.appendChild(root);
  document.body.appendChild(box);
  const api = createQRCode(root);
  apis.push(api);
  return { root, api };
}

/** The module matrix, read back from the flush SVG: the viewBox is the symbol. */
function matrixOf(root: HTMLElement): number[][] {
  const svg = root.querySelector("[data-part='svg']")!;
  const [, , w, h] = svg.getAttribute("viewBox")!.split(" ").map(Number);
  expect(w).toBe(h);
  const m = Array.from({ length: w }, () => new Array(w).fill(0));
  const d = svg.querySelector("path")!.getAttribute("d")!;
  for (const [, c, r] of d.matchAll(/M(\d+),(\d+)h1v1h-1z/g)) m[Number(r)][Number(c)] = 1;
  return m;
}

const payload = (n: number, seed = 0) =>
  Array.from({ length: n }, (_, i) => String.fromCharCode(33 + ((i * 7 + seed) % 90))).join("");

// Silence the controller's console.warn in the error tests.
function quietly<T>(fn: () => T): T {
  const warn = console.warn;
  console.warn = () => {};
  try {
    return fn();
  } finally {
    console.warn = warn;
  }
}

describe("qr-code ISO tables (forecraft #44)", () => {
  it("Table 9 and Table 7 agree at every version and ECL", () => {
    const wrong: string[] = [];
    for (let v = 1; v <= 40; v++) {
      for (let e = 0; e < 4; e++) {
        const capacity = dataCodewords(v, e) - (v <= 9 ? 2 : 3); // mode + length header
        if (capacity !== TABLE_7[v - 1][e]) wrong.push(`v${v}-${ECLS[e]}: ${capacity} ≠ ${TABLE_7[v - 1][e]}`);
      }
    }
    expect(wrong).toEqual([]);
  });
});

describe("qr-code versions 1–40 (forecraft #44)", () => {
  it("fills every version at every ECL to capacity and reads back with clean RS blocks", () => {
    const wrong: string[] = [];
    for (let v = 1; v <= 40; v++) {
      for (let e = 0; e < 4; e++) {
        const text = payload(TABLE_7[v - 1][e], v + e);
        const { root } = mount(text, ECLS[e]);
        const d = decode(matrixOf(root));
        if (d.version !== v || d.ecl !== ECLS[e] || d.text !== text || !d.rsClean) {
          wrong.push(`v${v}-${ECLS[e]}: got v${d.version}-${d.ecl}, text ${d.text === text}, rs ${d.rsClean}`);
        }
      }
    }
    expect(wrong).toEqual([]);
  }, 60_000);

  it("moves to the next version one byte past each capacity", () => {
    for (let v = 1; v < 40; v++) {
      const { root } = mount("y".repeat(TABLE_7[v - 1][1] + 1), "M");
      expect([v, matrixOf(root).length]).toEqual([v, (v + 1) * 4 + 17]);
    }
  }, 30_000);

  it("writes the Annex D version word in both blocks, versions 7–40", () => {
    for (let v = 7; v <= 40; v++) {
      const m = matrixOf(mount("v".repeat(TABLE_7[v - 1][0]), "L").root);
      const s = m.length;
      let topRight = 0;
      let bottomLeft = 0;
      for (let i = 0; i < 18; i++) {
        topRight |= m[Math.floor(i / 3)][s - 11 + (i % 3)] << i;
        bottomLeft |= m[s - 11 + (i % 3)][Math.floor(i / 3)] << i;
      }
      expect([v, topRight, bottomLeft]).toEqual([v, ANNEX_D[v - 7], ANNEX_D[v - 7]]);
    }
  }, 30_000);

  it("places an alignment pattern at every Annex E centre", () => {
    for (let v = 2; v <= 40; v++) {
      const m = matrixOf(mount("a".repeat(TABLE_7[v - 1][3]), "H").root);
      const s = m.length;
      const centres = ANNEX_E[v];
      for (const r of centres) {
        for (const c of centres) {
          if ((r < 9 && c < 9) || (r < 9 && c >= s - 8) || (r >= s - 8 && c < 9)) continue;
          for (let dr = -2; dr <= 2; dr++) {
            for (let dc = -2; dc <= 2; dc++) {
              const ring = Math.max(Math.abs(dr), Math.abs(dc));
              expect([v, r + dr, c + dc, m[r + dr][c + dc]]).toEqual([v, r + dr, c + dc, ring === 1 ? 0 : 1]);
            }
          }
        }
      }
    }
  }, 30_000);

  it("renders a 300-byte payload (the downstream case) as a version-13 symbol", () => {
    const text = "https://example.test/invoice?" + payload(271, 3);
    expect(text.length).toBe(300);
    const { root } = mount(text, "M");
    expect(root.dataset.state).toBe("ready");
    const d = decode(matrixOf(root));
    expect(d).toMatchObject({ text, version: 13, ecl: "M", rsClean: true });
  });

  it("encodes UTF-8 past version 10", () => {
    const text = "Factură — ".repeat(30);
    const d = decode(matrixOf(mount(text, "Q").root));
    expect(d.version).toBeGreaterThan(10);
    expect(d.text).toBe(text);
    expect(d.rsClean).toBe(true);
  });
});

describe("qr-code failure is visible (forecraft #44)", () => {
  it("data too long: data-state=error, a faqir:error event, no svg", () => {
    const events: CustomEvent[] = [];
    const onError = (e: Event) => events.push(e as CustomEvent);
    document.addEventListener("faqir:error", onError);
    try {
      const { root } = quietly(() => mount("x".repeat(TABLE_7[39][0] + 1), "L"));
      expect(root.dataset.state).toBe("error");
      expect(root.querySelector("[data-part='svg']")).toBeNull();
      expect(events).toHaveLength(1);
      expect(events[0].target).toBe(root);
      expect(events[0].detail.message).toMatch(/too long/);
      expect(events[0].detail.ecl).toBe("L");
    } finally {
      document.removeEventListener("faqir:error", onError);
    }
  });

  it("recovers on the next good value, and reports empty as empty", () => {
    const { root, api } = quietly(() => mount("x".repeat(3000), "H"));
    expect(root.dataset.state).toBe("error");
    api.update("HELLO");
    expect(root.dataset.state).toBe("ready");
    api.update("");
    expect(root.dataset.state).toBe("empty");
    expect(root.querySelector("[data-part='svg']")).toBeNull();
  });

  it("destroy() removes the state it wrote", () => {
    const { root, api } = mount("HELLO");
    api.destroy();
    apis.length = 0;
    expect(root.hasAttribute("data-state")).toBe(false);
  });
});

describe("qr-code quiet zone as padding (forecraft #51)", () => {
  it("draws the modules flush: the viewBox is the symbol and the finder starts at 0,0", () => {
    const { root } = mount("HELLO");
    const svg = root.querySelector("[data-part='svg']") as SVGSVGElement;
    expect(svg.getAttribute("viewBox")).toBe("0 0 21 21");
    expect(svg.querySelector("rect")!.getAttribute("width")).toBe("21");
    expect(svg.querySelector("path")!.getAttribute("d")!.startsWith("M0,0h1v1h-1z")).toBe(true);
    expect(svg.style.getPropertyValue("--qr-modules")).toBe("21");
  });

  it("expresses the quiet zone as padding of --qr-quiet modules (default 4) inside the declared size", () => {
    const rule = CSS.match(/\[data-ui="qr-code"\] > \[data-part="svg"\][^{]*\{([^}]*)\}/)![1];
    expect(rule).toContain("box-sizing: border-box");
    expect(rule).toMatch(/padding: calc\(var\(--qr-size\) \* var\(--qr-quiet, 4\) \/ \(var\(--qr-modules, 21\) \+ 2 \* var\(--qr-quiet, 4\)\)\)/);
    expect(rule).toMatch(/background-color: var\(--color-bg\)/);
  });
});
