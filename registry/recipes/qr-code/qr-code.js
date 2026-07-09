// @ui:controller qr-code
// @ui:provides render update destroy

/**
 * Minimal QR Code encoder (byte mode, versions 1–10).
 * Produces a boolean matrix suitable for SVG rendering.
 * Covers most practical use-cases (URLs, short text up to ~170 chars at ECL-M).
 */

// ── GF(256) arithmetic for Reed-Solomon ──

const EXP = new Uint8Array(256);
const LOG = new Uint8Array(256);
(() => {
  let v = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = v;
    LOG[v] = i;
    v = (v << 1) ^ (v & 128 ? 0x11d : 0);
  }
  EXP[255] = EXP[0];
})();

function gfMul(a, b) {
  return a === 0 || b === 0 ? 0 : EXP[(LOG[a] + LOG[b]) % 255];
}

function rsGenPoly(n) {
  let poly = [1];
  for (let i = 0; i < n; i++) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], EXP[i]);
    }
    poly = next;
  }
  return poly;
}

function rsEncode(data, ecLen) {
  const gen = rsGenPoly(ecLen);
  const msg = new Array(data.length + ecLen).fill(0);
  data.forEach((v, i) => (msg[i] = v));
  for (let i = 0; i < data.length; i++) {
    const coef = msg[i];
    if (coef !== 0) {
      for (let j = 0; j < gen.length; j++) {
        msg[i + j] ^= gfMul(gen[j], coef);
      }
    }
  }
  return msg.slice(data.length);
}

// ── QR constants ──

const ECL_MAP = { L: 0, M: 1, Q: 2, H: 3 };

// [version][ecl] → { totalBytes, ecPerBlock, blocks }
const VERSION_TABLE = [
  null, // index 0 unused
  // v1
  [{ dc: 19, ec: 7, b: 1 }, { dc: 16, ec: 10, b: 1 }, { dc: 13, ec: 13, b: 1 }, { dc: 9, ec: 17, b: 1 }],
  // v2
  [{ dc: 34, ec: 10, b: 1 }, { dc: 28, ec: 16, b: 1 }, { dc: 22, ec: 22, b: 1 }, { dc: 16, ec: 28, b: 1 }],
  // v3
  [{ dc: 55, ec: 15, b: 1 }, { dc: 44, ec: 26, b: 1 }, { dc: 34, ec: 18, b: 2 }, { dc: 26, ec: 22, b: 2 }],
  // v4
  [{ dc: 80, ec: 20, b: 1 }, { dc: 64, ec: 18, b: 2 }, { dc: 48, ec: 26, b: 2 }, { dc: 36, ec: 16, b: 4 }],
  // v5
  [{ dc: 108, ec: 26, b: 1 }, { dc: 86, ec: 24, b: 2 }, { dc: 62, ec: 18, b: 4 }, { dc: 46, ec: 22, b: 4 }],
  // v6
  [{ dc: 136, ec: 18, b: 2 }, { dc: 108, ec: 16, b: 4 }, { dc: 76, ec: 24, b: 4 }, { dc: 60, ec: 28, b: 4 }],
  // v7
  [{ dc: 156, ec: 20, b: 2 }, { dc: 124, ec: 18, b: 4 }, { dc: 88, ec: 18, b: 6 }, { dc: 66, ec: 26, b: 5 }],
  // v8
  [{ dc: 194, ec: 24, b: 2 }, { dc: 154, ec: 22, b: 4 }, { dc: 110, ec: 22, b: 6 }, { dc: 86, ec: 26, b: 6 }],
  // v9
  [{ dc: 232, ec: 30, b: 2 }, { dc: 182, ec: 22, b: 5 }, { dc: 132, ec: 20, b: 8 }, { dc: 98, ec: 24, b: 8 }],
  // v10
  [{ dc: 274, ec: 18, b: 4 }, { dc: 216, ec: 26, b: 5 }, { dc: 154, ec: 24, b: 8 }, { dc: 119, ec: 28, b: 8 }],
];

const ALIGNMENT_POSITIONS = [
  null, [], [6, 18], [6, 22], [6, 26], [6, 30],
  [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50],
];

function selectVersion(dataLen, ecl) {
  const eclIdx = ECL_MAP[ecl] ?? 1;
  for (let v = 1; v <= 10; v++) {
    const info = VERSION_TABLE[v][eclIdx];
    if (dataLen <= info.dc) return v;
  }
  return -1;
}

// ── Matrix operations ──

function createMatrix(size) {
  return Array.from({ length: size }, () => new Uint8Array(size));
}

function setModule(matrix, row, col, val, reserved) {
  const s = matrix.length;
  if (row >= 0 && row < s && col >= 0 && col < s) {
    matrix[row][col] = val;
    if (reserved) reserved[row][col] = 1;
  }
}

function placeFinderPattern(matrix, reserved, row, col) {
  for (let r = -1; r <= 7; r++) {
    for (let c = -1; c <= 7; c++) {
      const val =
        (r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
        (c >= 0 && c <= 6 && (r === 0 || r === 6)) ||
        (r >= 2 && r <= 4 && c >= 2 && c <= 4)
          ? 1
          : 0;
      setModule(matrix, row + r, col + c, val, reserved);
    }
  }
}

function placeAlignmentPattern(matrix, reserved, row, col) {
  for (let r = -2; r <= 2; r++) {
    for (let c = -2; c <= 2; c++) {
      const val =
        Math.abs(r) === 2 || Math.abs(c) === 2 || (r === 0 && c === 0) ? 1 : 0;
      setModule(matrix, row + r, col + c, val, reserved);
    }
  }
}

function placeTimingPatterns(matrix, reserved) {
  const s = matrix.length;
  for (let i = 8; i < s - 8; i++) {
    const val = i % 2 === 0 ? 1 : 0;
    setModule(matrix, 6, i, val, reserved);
    setModule(matrix, i, 6, val, reserved);
  }
}

function reserveFormatArea(matrix, reserved) {
  const s = matrix.length;
  for (let i = 0; i < 8; i++) {
    setModule(reserved, 8, i, 1);
    setModule(reserved, 8, s - 1 - i, 1);
    setModule(reserved, i, 8, 1);
    setModule(reserved, s - 1 - i, 8, 1);
  }
  setModule(reserved, 8, 8, 1);
  setModule(matrix, s - 8, 8, 1, reserved); // dark module
}

function placeData(matrix, reserved, bits) {
  const s = matrix.length;
  let bitIdx = 0;
  let upward = true;
  for (let col = s - 1; col >= 1; col -= 2) {
    if (col === 6) col = 5; // skip timing column
    const rows = upward
      ? Array.from({ length: s }, (_, i) => s - 1 - i)
      : Array.from({ length: s }, (_, i) => i);
    for (const row of rows) {
      for (let c = 0; c < 2; c++) {
        const cc = col - c;
        if (reserved[row][cc]) continue;
        matrix[row][cc] = bitIdx < bits.length ? bits[bitIdx++] : 0;
      }
    }
    upward = !upward;
  }
}

function applyMask(matrix, reserved, maskId) {
  const s = matrix.length;
  const fns = [
    (r, c) => (r + c) % 2 === 0,
    (r) => r % 2 === 0,
    (_, c) => c % 3 === 0,
    (r, c) => (r + c) % 3 === 0,
    (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
    (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
    (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
    (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
  ];
  const fn = fns[maskId];
  for (let r = 0; r < s; r++) {
    for (let c = 0; c < s; c++) {
      if (!reserved[r][c] && fn(r, c)) {
        matrix[r][c] ^= 1;
      }
    }
  }
}

function placeFormatInfo(matrix, ecl, maskId) {
  const s = matrix.length;
  const eclBits = [1, 0, 3, 2][ECL_MAP[ecl] ?? 1];
  let data = (eclBits << 3) | maskId;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >> 9) * 0x537);
  const bits = ((data << 10) | rem) ^ 0x5412;

  for (let i = 0; i < 15; i++) {
    const bit = (bits >> (14 - i)) & 1;
    // Around top-left finder
    if (i < 6) matrix[8][i] = bit;
    else if (i === 6) matrix[8][7] = bit;
    else if (i === 7) matrix[8][8] = bit;
    else if (i === 8) matrix[7][8] = bit;
    else matrix[14 - i][8] = bit;
    // Around other finders
    if (i < 8) matrix[s - 1 - i][8] = bit;
    else matrix[8][s - 15 + i] = bit;
  }
}

// ── Penalty scoring (simplified) ──

function penalty(matrix) {
  const s = matrix.length;
  let score = 0;
  // Rule 1: runs of same color
  for (let r = 0; r < s; r++) {
    let count = 1;
    for (let c = 1; c < s; c++) {
      if (matrix[r][c] === matrix[r][c - 1]) {
        count++;
        if (count === 5) score += 3;
        else if (count > 5) score++;
      } else count = 1;
    }
  }
  for (let c = 0; c < s; c++) {
    let count = 1;
    for (let r = 1; r < s; r++) {
      if (matrix[r][c] === matrix[r - 1][c]) {
        count++;
        if (count === 5) score += 3;
        else if (count > 5) score++;
      } else count = 1;
    }
  }
  return score;
}

// ── Encode ──

function encodeQR(text, ecl = "M") {
  const data = new TextEncoder().encode(text);
  const version = selectVersion(data.length, ecl);
  if (version < 0) throw new Error("Data too long for QR versions 1–10");

  const eclIdx = ECL_MAP[ecl] ?? 1;
  const info = VERSION_TABLE[version][eclIdx];
  const size = version * 4 + 17;

  // Build data codewords
  const codewords = [];
  // Mode indicator: byte mode = 0100
  // Character count (8 bits for v1-9, 16 bits for v10+)
  const ccBits = version <= 9 ? 8 : 16;
  let bitBuf = 0;
  let bitCount = 0;

  function pushBits(val, len) {
    for (let i = len - 1; i >= 0; i--) {
      bitBuf = (bitBuf << 1) | ((val >> i) & 1);
      bitCount++;
      if (bitCount === 8) {
        codewords.push(bitBuf);
        bitBuf = 0;
        bitCount = 0;
      }
    }
  }

  pushBits(0b0100, 4); // byte mode
  pushBits(data.length, ccBits);
  data.forEach((b) => pushBits(b, 8));
  pushBits(0, 4); // terminator (up to 4 bits)

  // Pad to byte boundary
  if (bitCount > 0) pushBits(0, 8 - bitCount);

  // Pad to capacity
  while (codewords.length < info.dc) {
    codewords.push(0xec);
    if (codewords.length < info.dc) codewords.push(0x11);
  }

  // Split into blocks and compute EC
  const blocks = [];
  const ecBlocks = [];
  const ecPerBlock = info.ec / info.b;
  const dcPerBlock = Math.floor(info.dc / info.b);
  const remainder = info.dc % info.b;
  let offset = 0;

  for (let i = 0; i < info.b; i++) {
    const blockDc = dcPerBlock + (i >= info.b - remainder ? 1 : 0);
    const blockData = codewords.slice(offset, offset + blockDc);
    offset += blockDc;
    blocks.push(blockData);
    ecBlocks.push(rsEncode(blockData, ecPerBlock));
  }

  // Interleave
  const interleaved = [];
  const maxDc = Math.max(...blocks.map((b) => b.length));
  for (let i = 0; i < maxDc; i++) {
    for (const block of blocks) {
      if (i < block.length) interleaved.push(block[i]);
    }
  }
  for (let i = 0; i < ecPerBlock; i++) {
    for (const ec of ecBlocks) {
      if (i < ec.length) interleaved.push(ec[i]);
    }
  }

  // Convert to bit array
  const bits = [];
  interleaved.forEach((byte) => {
    for (let i = 7; i >= 0; i--) bits.push((byte >> i) & 1);
  });

  // Build matrix
  const matrix = createMatrix(size);
  const reserved = createMatrix(size);

  placeFinderPattern(matrix, reserved, 0, 0);
  placeFinderPattern(matrix, reserved, 0, size - 7);
  placeFinderPattern(matrix, reserved, size - 7, 0);

  const alignPos = ALIGNMENT_POSITIONS[version] || [];
  for (const r of alignPos) {
    for (const c of alignPos) {
      if (reserved[r]?.[c]) continue;
      placeAlignmentPattern(matrix, reserved, r, c);
    }
  }

  placeTimingPatterns(matrix, reserved);
  reserveFormatArea(matrix, reserved);

  // Try all masks, pick lowest penalty
  let bestMask = 0;
  let bestScore = Infinity;
  for (let m = 0; m < 8; m++) {
    const test = matrix.map((row) => new Uint8Array(row));
    placeData(test, reserved, bits);
    applyMask(test, reserved, m);
    placeFormatInfo(test, ecl, m);
    const s = penalty(test);
    if (s < bestScore) {
      bestScore = s;
      bestMask = m;
    }
  }

  placeData(matrix, reserved, bits);
  applyMask(matrix, reserved, bestMask);
  placeFormatInfo(matrix, ecl, bestMask);

  return matrix;
}

// ── SVG renderer ──

function matrixToSVG(matrix) {
  const size = matrix.length;
  const quiet = 2; // quiet zone modules
  const total = size + quiet * 2;

  let paths = "";
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (matrix[r][c]) {
        paths += `M${c + quiet},${r + quiet}h1v1h-1z`;
      }
    }
  }

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${total} ${total}`);
  svg.setAttribute("shape-rendering", "crispEdges");
  svg.setAttribute("data-part", "svg");

  // Background
  const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  bg.setAttribute("width", total);
  bg.setAttribute("height", total);
  bg.setAttribute("fill", "var(--color-bg, #fff)");
  svg.appendChild(bg);

  // QR modules
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", paths);
  path.setAttribute("fill", "var(--color-fg, #000)");
  svg.appendChild(path);

  return svg;
}

// ── Controller ──

export function createQRCode(root) {
  if (root._faqirQR) return root._faqirQR;

  function render() {
    const value = root.getAttribute("data-value") || "";
    const ecl = root.getAttribute("data-ecl") || "M";

    // Remove old SVG
    const old = root.querySelector("[data-part='svg']");
    if (old) old.remove();

    if (!value) return;

    try {
      const matrix = encodeQR(value, ecl);
      const svg = matrixToSVG(matrix);
      // Insert before caption if present
      const caption = root.querySelector("[data-part='caption']");
      if (caption) {
        root.insertBefore(svg, caption);
      } else {
        root.appendChild(svg);
      }
    } catch (e) {
      console.warn(`[qr-code] Failed to encode: ${e.message}`);
    }
  }

  function update(newValue, newEcl) {
    if (newValue !== undefined) root.setAttribute("data-value", newValue);
    if (newEcl !== undefined) root.setAttribute("data-ecl", newEcl);
    render();
  }

  // Observe attribute changes
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.attributeName === "data-value" || m.attributeName === "data-ecl") {
        render();
        break;
      }
    }
  });
  observer.observe(root, { attributes: true });

  function destroy() {
    observer.disconnect();
    const svg = root.querySelector("[data-part='svg']");
    if (svg) svg.remove();
    delete root._faqirQR;
  }

  // Initial render
  render();

  const api = { render, update, destroy };
  root._faqirQR = api;
  return api;
}
