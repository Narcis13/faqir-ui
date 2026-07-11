// Zero-dependency line diff + unified-diff formatter (task 0.5-04, FAQIR-PLAN §9.3).
//
// Backs `faqir diff` (user drift vs the pristine store) and, later, the human
// side of `faqir upgrade`. The algorithm is a classic LCS backtrace over lines:
// deterministic, small, and independent of any npm diff library. Component
// files are tiny, so the O(n·m) DP is never a concern.
//
// The output is standard unified-diff text — `--- / +++` headers and `@@` hunk
// headers with `context` lines of surrounding context — so a human reads it as
// a patch and an agent parses it as one. `diffSummary` exposes the same edit
// counts for the `--json` surface without re-parsing the text.

/** One line-level edit operation. */
export interface DiffOp {
  type: "eq" | "del" | "add";
  line: string;
}

/** A single unified-diff hunk. */
export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  /** Lines prefixed with " " (context), "-" (removed), or "+" (added). */
  lines: string[];
}

/** Aggregate edit counts for a file pair. */
export interface DiffSummary {
  added: number;
  removed: number;
  hunks: number;
}

/**
 * Split text into lines, tracking whether the content ends with a newline so a
 * trailing-newline change is not silently swallowed. Empty input has no lines.
 */
function splitLines(text: string): { lines: string[]; finalNewline: boolean } {
  if (text === "") return { lines: [], finalNewline: true };
  const finalNewline = text.endsWith("\n");
  const body = finalNewline ? text.slice(0, -1) : text;
  return { lines: body.split("\n"), finalNewline };
}

/**
 * Line-level diff via longest-common-subsequence backtrace. Ties favor
 * deletions before additions, which keeps the output stable across runs.
 */
export function diffLines(a: string[], b: string[]): DiffOp[] {
  const n = a.length;
  const m = b.length;

  // dp[i][j] = LCS length of a[i:] and b[j:].
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const ops: DiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ type: "eq", line: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ type: "del", line: a[i] });
      i++;
    } else {
      ops.push({ type: "add", line: b[j] });
      j++;
    }
  }
  while (i < n) ops.push({ type: "del", line: a[i++] });
  while (j < m) ops.push({ type: "add", line: b[j++] });
  return ops;
}

/**
 * Group edit operations into unified-diff hunks with `context` lines of shared
 * context around each change. Changes separated by more than `2 * context`
 * unchanged lines become separate hunks; closer ones merge so their context
 * windows do not overlap.
 */
export function buildHunks(ops: DiffOp[], context: number): DiffHunk[] {
  const changeIdx: number[] = [];
  for (let i = 0; i < ops.length; i++) {
    if (ops[i].type !== "eq") changeIdx.push(i);
  }
  if (changeIdx.length === 0) return [];

  // Group change indices whose gap of unchanged lines is small enough to merge.
  const groups: Array<[number, number]> = [];
  let start = changeIdx[0];
  let prev = changeIdx[0];
  for (let k = 1; k < changeIdx.length; k++) {
    const c = changeIdx[k];
    if (c - prev - 1 > 2 * context) {
      groups.push([start, prev]);
      start = c;
    }
    prev = c;
  }
  groups.push([start, prev]);

  return groups.map(([first, last]) => {
    const from = Math.max(0, first - context);
    const to = Math.min(ops.length, last + 1 + context);

    // Line numbers (1-based) at the hunk's first line.
    let oldNum = 0;
    let newNum = 0;
    for (let i = 0; i < from; i++) {
      const t = ops[i].type;
      if (t === "eq") {
        oldNum++;
        newNum++;
      } else if (t === "del") {
        oldNum++;
      } else {
        newNum++;
      }
    }

    const lines: string[] = [];
    let oldLines = 0;
    let newLines = 0;
    for (let i = from; i < to; i++) {
      const op = ops[i];
      if (op.type === "eq") {
        lines.push(" " + op.line);
        oldLines++;
        newLines++;
      } else if (op.type === "del") {
        lines.push("-" + op.line);
        oldLines++;
      } else {
        lines.push("+" + op.line);
        newLines++;
      }
    }

    // Unified-diff convention: a zero-length side points at the line before.
    return {
      oldStart: oldLines === 0 ? oldNum : oldNum + 1,
      oldLines,
      newStart: newLines === 0 ? newNum : newNum + 1,
      newLines,
      lines,
    };
  });
}

function formatHunkHeader(h: DiffHunk): string {
  const oldRange = h.oldLines === 1 ? `${h.oldStart}` : `${h.oldStart},${h.oldLines}`;
  const newRange = h.newLines === 1 ? `${h.newStart}` : `${h.newStart},${h.newLines}`;
  return `@@ -${oldRange} +${newRange} @@`;
}

export interface UnifiedDiffOptions {
  oldLabel?: string;
  newLabel?: string;
  context?: number;
}

/**
 * Render a standard unified diff between two texts. Returns an empty string when
 * the inputs are identical (the "no drift" signal callers rely on). When one
 * side is empty its label becomes `/dev/null`, matching how tools render a
 * whole-file add or delete.
 */
export function unifiedDiff(oldText: string, newText: string, opts: UnifiedDiffOptions = {}): string {
  if (oldText === newText) return "";

  const context = opts.context ?? 3;
  const a = splitLines(oldText);
  const b = splitLines(newText);
  const ops = diffLines(a.lines, b.lines);
  const hunks = buildHunks(ops, context);
  if (hunks.length === 0) return "";

  const oldLabel = oldText === "" ? "/dev/null" : opts.oldLabel ?? "a";
  const newLabel = newText === "" ? "/dev/null" : opts.newLabel ?? "b";

  const out: string[] = [`--- ${oldLabel}`, `+++ ${newLabel}`];
  for (const h of hunks) {
    out.push(formatHunkHeader(h));
    out.push(...h.lines);
  }
  return out.join("\n") + "\n";
}

/** Edit counts (added/removed lines, hunk count) between two texts. */
export function diffSummary(oldText: string, newText: string, context = 3): DiffSummary {
  if (oldText === newText) return { added: 0, removed: 0, hunks: 0 };
  const a = splitLines(oldText);
  const b = splitLines(newText);
  const ops = diffLines(a.lines, b.lines);
  let added = 0;
  let removed = 0;
  for (const op of ops) {
    if (op.type === "add") added++;
    else if (op.type === "del") removed++;
  }
  return { added, removed, hunks: buildHunks(ops, context).length };
}
