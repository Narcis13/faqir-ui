// Typo-suggestion util — Levenshtein distance + nearest-candidate lookup.
//
// Shared by the CLI dispatcher (`faqir <typo>` → "did you mean …"), the icon
// subsetting command (`faqir add icons --only chekc` → "did you mean check"),
// and the `icon-name` audit rule. One implementation so every "did you mean"
// suggestion in the tool behaves identically.

/** Classic Wagner–Fischer edit distance (insertions/deletions/substitutions, cost 1). */
export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }

  return dp[m][n];
}

/**
 * Return the candidate closest to `input` by edit distance, or `null` when the
 * best match is farther than `maxDistance`. Ties resolve to the first candidate
 * in input order, so the result is deterministic for a given candidate list.
 */
export function suggestClosest(input: string, candidates: Iterable<string>, maxDistance = 3): string | null {
  let best: { name: string; distance: number } | null = null;
  for (const candidate of candidates) {
    const d = levenshtein(input, candidate);
    if (best === null || d < best.distance) best = { name: candidate, distance: d };
  }
  return best && best.distance <= maxDistance ? best.name : null;
}
