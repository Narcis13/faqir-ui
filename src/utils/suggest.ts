// Typo-suggestion util — Levenshtein distance + nearest-candidate lookup.
//
// Shared by the CLI dispatcher (`faqir <typo>` → "did you mean …"), the icon
// subsetting command (`faqir add icons --only chekc` → "did you mean check"),
// and the `icon-name` and `unknown-component` audit rules. One implementation so
// every "did you mean" suggestion in the tool behaves identically.

/**
 * Classic Wagner–Fischer edit distance (insertions/deletions/substitutions,
 * cost 1), carrying **two rows** rather than the full (m+1)×(n+1) matrix.
 *
 * The result is identical to the textbook matrix version; only the allocation
 * differs, and it is the allocation that matters here. `unknown-component`
 * (task 1.0R-11) calls this once per registry name for every unrecognised
 * `data-ui`, and a `data-ui` is attacker-shaped input — the audit fuzz corpus
 * feeds it multi-kilobyte values. A matrix of JS arrays made that
 * ~110 × |input| × |name| array cells per element and turned a 150ms fuzz pass
 * into 8s; two `Uint32Array` rows make the same pass cost nothing.
 */
export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  let prev = new Uint32Array(n + 1);
  let curr = new Uint32Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    const ca = a[i - 1];
    for (let j = 1; j <= n; j++) {
      curr[j] = ca === b[j - 1]
        ? prev[j - 1]
        : 1 + Math.min(prev[j], curr[j - 1], prev[j - 1]);
    }
    const swap = prev;
    prev = curr;
    curr = swap;
  }

  return prev[n];
}

/**
 * Return the candidate closest to `input` by edit distance, or `null` when the
 * best match is farther than `maxDistance`. Ties resolve to the first candidate
 * in input order, so the result is deterministic for a given candidate list.
 *
 * Candidates whose *length* already differs by more than `maxDistance` are
 * skipped without measuring: each edit changes the length by at most one, so
 * such a candidate can never come within `maxDistance` and therefore can never
 * be the value returned. That makes the common bad case — a long, junk input
 * against a list of short names — free rather than quadratic in the junk.
 */
export function suggestClosest(input: string, candidates: Iterable<string>, maxDistance = 3): string | null {
  let best: { name: string; distance: number } | null = null;
  for (const candidate of candidates) {
    if (Math.abs(candidate.length - input.length) > maxDistance) continue;
    const d = levenshtein(input, candidate);
    if (best === null || d < best.distance) best = { name: candidate, distance: d };
    if (best.distance === 0) break;
  }
  return best && best.distance <= maxDistance ? best.name : null;
}
