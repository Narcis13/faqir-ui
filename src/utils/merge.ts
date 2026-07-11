// Zero-dependency three-way (diff3) merge (task 0.5-05, FAQIR-PLAN §9.3).
//
// Backs `faqir upgrade`: given the *base* (the pristine, as-installed copy), the
// user's *ours* (their edited working copy), and the registry's *theirs* (the
// new version), reconcile all three. Non-overlapping edits from either side are
// applied cleanly; regions both sides changed differently are emitted with
// standard git conflict markers so a human — or an agent, which is the design
// bet — resolves them. No case ever discards user content: everything ours (and
// theirs) contributed is either merged or preserved inside a conflict marker.
//
// The line-level engine reuses the same LCS backtrace as `src/utils/diff.ts`.
// Two independent base↔ours and base↔theirs diffs are aligned on the base lines
// they both match ("sync points"); the slices between sync points are the merge
// regions. Components are tiny, so the O(n·m) DP is never a concern.

import { diffLines } from "./diff";

// ── Conflict markers ─────────────────────────────────────────────────────────

/** The four git conflict-marker tokens (7 characters each, as git emits them). */
const OURS_MARK = "<<<<<<<";
const BASE_MARK = "|||||||";
const SEP_MARK = "=======";
const THEIRS_MARK = ">>>>>>>";

export interface Merge3Options {
  /** Label after the `<<<<<<<` marker (the working-copy side). */
  oursLabel?: string;
  /** Label after the `>>>>>>>` marker (the registry-new side). */
  theirsLabel?: string;
  /** Label after the `|||||||` marker (the pristine base). */
  baseLabel?: string;
  /**
   * Include the base section (`|||||||`) between ours and theirs — git's
   * `diff3` conflict style. On by default: it hands the resolver the common
   * ancestor, which is exactly what makes a conflict resolvable. Set false for
   * the terser two-way style.
   */
  includeBase?: boolean;
}

export interface Merge3Result {
  /** True when no region conflicted — `text` is a fully merged file. */
  clean: boolean;
  /** The merged file text (with conflict markers when `clean` is false). */
  text: string;
  /** Number of conflict regions emitted. */
  conflicts: number;
}

// ── Line splitting that keeps terminators ────────────────────────────────────
//
// Unlike the differ (which strips the trailing newline and tracks it out of
// band), the merge keeps each line's own "\n" so concatenating the merged lines
// reproduces the file byte-for-byte — including the presence or absence of a
// final newline. A last line without a terminator is thus distinct from one
// with it, which is the correct trailing-newline sensitivity.

/** Split text into lines, each retaining its trailing "\n" (last line may not). */
function splitKeepEnds(text: string): string[] {
  if (text === "") return [];
  const parts = text.split("\n");
  const out: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    if (i < parts.length - 1) out.push(parts[i] + "\n");
    else if (parts[i] !== "") out.push(parts[i]); // trailing "" means text ended in "\n"
  }
  return out;
}

/** Matched `[baseIdx, sideIdx]` line pairs (an LCS) between base and one side. */
function matchPairs(base: string[], side: string[]): Array<[number, number]> {
  const ops = diffLines(base, side);
  const pairs: Array<[number, number]> = [];
  let bi = 0;
  let si = 0;
  for (const op of ops) {
    if (op.type === "eq") {
      pairs.push([bi, si]);
      bi++;
      si++;
    } else if (op.type === "del") {
      bi++; // present in base, absent in side
    } else {
      si++; // present in side, absent in base
    }
  }
  return pairs;
}

/** A merge region: either a run shared by all three, or a diverging slice. */
type Region =
  | { stable: true; lines: string[] }
  | { stable: false; base: string[]; ours: string[]; theirs: string[] };

/**
 * Align base/ours/theirs on the base lines that BOTH sides still match (joint
 * sync points), then carve the sequences into stable runs (all three agree) and
 * unstable slices (the pieces strictly between two sync points).
 */
function diff3Regions(baseL: string[], oursL: string[], theirsL: string[]): Region[] {
  const aMap = new Map<number, number>(); // baseIdx → oursIdx
  for (const [o, a] of matchPairs(baseL, oursL)) aMap.set(o, a);
  const bMap = new Map<number, number>(); // baseIdx → theirsIdx
  for (const [o, b] of matchPairs(baseL, theirsL)) bMap.set(o, b);

  // Sync points: base indices matched in ours AND theirs, ascending. Because
  // each map derives from an increasing LCS, the intersection is monotonically
  // increasing in all three coordinates — so every slice below is well-formed.
  const syncBase: number[] = [];
  for (const o of aMap.keys()) if (bMap.has(o)) syncBase.push(o);
  syncBase.sort((x, y) => x - y);

  const syncs: Array<{ o: number; a: number; b: number }> = [{ o: -1, a: -1, b: -1 }];
  for (const o of syncBase) syncs.push({ o, a: aMap.get(o)!, b: bMap.get(o)! });
  syncs.push({ o: baseL.length, a: oursL.length, b: theirsL.length });

  const regions: Region[] = [];
  for (let i = 0; i < syncs.length - 1; i++) {
    const cur = syncs[i];
    const next = syncs[i + 1];
    const base = baseL.slice(cur.o + 1, next.o);
    const ours = oursL.slice(cur.a + 1, next.a);
    const theirs = theirsL.slice(cur.b + 1, next.b);
    if (base.length || ours.length || theirs.length) {
      regions.push({ stable: false, base, ours, theirs });
    }
    // Emit the sync line itself (identical in all three) — unless it's the end
    // sentinel, which has no real line.
    if (i + 1 < syncs.length - 1) regions.push({ stable: true, lines: [baseL[next.o]] });
  }
  return regions;
}

function linesEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** Ensure a block's last line ends in "\n" so a following marker starts a line. */
function terminated(lines: string[]): string[] {
  if (lines.length === 0) return lines;
  const out = lines.slice();
  const last = out[out.length - 1];
  if (!last.endsWith("\n")) out[out.length - 1] = last + "\n";
  return out;
}

function marker(token: string, label: string | undefined): string {
  return (label ? `${token} ${label}` : token) + "\n";
}

/**
 * Three-way line merge of `base` → {`ours`, `theirs`}. Regions only one side
 * changed apply cleanly; regions both sides changed differently become a git
 * conflict block. Identical inputs and one-sided rewrites short-circuit to a
 * byte-exact result before any line splitting.
 */
export function merge3(
  base: string,
  ours: string,
  theirs: string,
  opts: Merge3Options = {}
): Merge3Result {
  // Whole-file fast paths (byte-exact, no marker risk).
  if (ours === theirs) return { clean: true, text: ours, conflicts: 0 };
  if (base === ours) return { clean: true, text: theirs, conflicts: 0 };
  if (base === theirs) return { clean: true, text: ours, conflicts: 0 };

  const includeBase = opts.includeBase ?? true;
  const regions = diff3Regions(splitKeepEnds(base), splitKeepEnds(ours), splitKeepEnds(theirs));

  const out: string[] = [];
  let conflicts = 0;
  for (const r of regions) {
    if (r.stable) {
      out.push(...r.lines);
      continue;
    }
    if (linesEqual(r.ours, r.theirs)) {
      out.push(...r.ours); // both made the same change
    } else if (linesEqual(r.ours, r.base)) {
      out.push(...r.theirs); // only theirs changed
    } else if (linesEqual(r.theirs, r.base)) {
      out.push(...r.ours); // only ours changed
    } else {
      conflicts++;
      out.push(marker(OURS_MARK, opts.oursLabel));
      out.push(...terminated(r.ours));
      if (includeBase) {
        out.push(marker(BASE_MARK, opts.baseLabel));
        out.push(...terminated(r.base));
      }
      out.push(SEP_MARK + "\n");
      out.push(...terminated(r.theirs));
      out.push(marker(THEIRS_MARK, opts.theirsLabel));
    }
  }

  return { clean: conflicts === 0, text: out.join(""), conflicts };
}

// ── File-level three-way merge ───────────────────────────────────────────────

export type FileMergeStatus =
  | "unchanged" // working copy needs no change
  | "updated" // clean merge produced new content
  | "added" // a new file the registry introduced
  | "deleted" // a file removed by the update (and the user hadn't diverged) / user deletion respected
  | "conflict"; // conflict markers written, or a delete/modify kept — needs resolution

/** The action the caller applies to the working copy for one file. */
export type FileMergeAction = "write" | "delete" | "none";

/** One file across the three sides — `null` means the file is absent there. */
export interface FileMergeInput {
  path: string;
  base: string | null; // pristine / as-installed
  ours: string | null; // working copy
  theirs: string | null; // registry-new
}

export interface FileMergeOutcome {
  path: string;
  status: FileMergeStatus;
  /** Conflict-region count (0 unless `status === "conflict"`). */
  conflicts: number;
  /** A short explanation for non-obvious (e.g. delete/modify) outcomes. */
  note?: string;
  action: FileMergeAction;
  /** Bytes to write when `action === "write"`. */
  content?: string;
}

/**
 * Decide the fate of a single file given all three sides. The presence pattern
 * (which of base/ours/theirs exist) selects the case; within a case the texts
 * drive a three-way {@link merge3}. Every branch is loss-free: user content is
 * kept, merged, or wrapped in conflict markers — never silently dropped.
 */
export function mergeFile(input: FileMergeInput, opts: Merge3Options = {}): FileMergeOutcome {
  const { path } = input;
  const hasBase = input.base !== null;
  const hasOurs = input.ours !== null;
  const hasTheirs = input.theirs !== null;
  const base = input.base ?? "";
  const ours = input.ours ?? "";
  const theirs = input.theirs ?? "";

  // ── The registry-new version does not contain this file ──
  if (!hasTheirs) {
    if (!hasBase) {
      // A file only the user has (never came from the registry) — leave it be.
      return { path, status: "unchanged", conflicts: 0, action: "none" };
    }
    if (!hasOurs) {
      // Removed by both the user and the registry — already gone.
      return { path, status: "deleted", conflicts: 0, action: "none" };
    }
    if (ours === base) {
      // registry-deleted, user untouched → apply the deletion.
      return { path, status: "deleted", conflicts: 0, action: "delete" };
    }
    // registry-deleted a file the user changed → modify/delete conflict. Keep
    // ours verbatim (nothing to lose) and report it for resolution.
    return {
      path,
      status: "conflict",
      conflicts: 1,
      note: "modify/delete — the update removed a file you had changed; your version was kept",
      action: "none",
    };
  }

  // ── The registry-new version contains this file ──
  if (!hasBase && !hasOurs) {
    // Brand-new file introduced by the update.
    return { path, status: "added", conflicts: 0, action: "write", content: theirs };
  }

  if (!hasBase && hasOurs) {
    // add/add: absent from the baseline, present in both ours and theirs.
    if (ours === theirs) return { path, status: "unchanged", conflicts: 0, action: "none" };
    const m = merge3("", ours, theirs, opts);
    if (m.clean) {
      return {
        path,
        status: m.text === ours ? "unchanged" : "updated",
        conflicts: 0,
        action: m.text === ours ? "none" : "write",
        content: m.text,
      };
    }
    return {
      path,
      status: "conflict",
      conflicts: m.conflicts,
      note: "add/add — you and the update both introduced this file",
      action: "write",
      content: m.text,
    };
  }

  if (hasBase && !hasOurs) {
    // The user deleted a file the registry still ships.
    if (theirs === base) {
      // registry left it unchanged → respect the user's deletion.
      return { path, status: "deleted", conflicts: 0, action: "none" };
    }
    // delete/modify — the update changed a file the user deleted. Restore it
    // with conflict markers so the registry's new content is never lost.
    const m = merge3(base, "", theirs, opts);
    return {
      path,
      status: "conflict",
      conflicts: Math.max(1, m.conflicts),
      note: "delete/modify — you deleted a file the update changed; restored with conflict markers",
      action: "write",
      content: m.text,
    };
  }

  // ── The common case: the file exists on all three sides ──
  if (ours === theirs) return { path, status: "unchanged", conflicts: 0, action: "none" };
  if (ours === base) {
    // User untouched → fast-forward to the registry-new content.
    return { path, status: "updated", conflicts: 0, action: "write", content: theirs };
  }
  if (theirs === base) {
    // Registry untouched → keep the user's edits.
    return { path, status: "unchanged", conflicts: 0, action: "none" };
  }

  const m = merge3(base, ours, theirs, opts);
  if (m.clean) {
    return {
      path,
      status: m.text === ours ? "unchanged" : "updated",
      conflicts: 0,
      action: m.text === ours ? "none" : "write",
      content: m.text,
    };
  }
  return {
    path,
    status: "conflict",
    conflicts: m.conflicts,
    note: "overlapping edits",
    action: "write",
    content: m.text,
  };
}
