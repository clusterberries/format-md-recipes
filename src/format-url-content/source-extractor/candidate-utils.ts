import type { RecipeContentCandidate } from '../types.ts';

export function candidateScore(candidate: RecipeContentCandidate): number {
  return candidate.ingredients.length + candidate.instructions.length * 2;
}

export function deduplicateOverlappingCandidates(
  candidates: RecipeContentCandidate[],
): RecipeContentCandidate[] {
  return candidates.filter(
    (candidate, index) =>
      !candidates.some((other, otherIndex) => {
        if (index === otherIndex) return false;
        if (candidateScore(other) <= candidateScore(candidate)) return false;
        return isCandidateSubset(candidate, other);
      }),
  );
}

function isCandidateSubset(
  candidate: RecipeContentCandidate,
  other: RecipeContentCandidate,
): boolean {
  if (
    other.ingredients.length < candidate.ingredients.length ||
    other.instructions.length < candidate.instructions.length
  ) {
    return false;
  }

  const otherText = [...other.ingredients, ...other.instructions]
    .join('\n')
    .toLocaleLowerCase();

  return [...candidate.ingredients, ...candidate.instructions].every((item) =>
    otherText.includes(item.slice(0, 40).toLocaleLowerCase()),
  );
}

export function selectBestCandidates(
  candidates: RecipeContentCandidate[],
): RecipeContentCandidate[] {
  if (!candidates.length) return [];

  const best = [...candidates].sort(
    (a, b) => candidateScore(b) - candidateScore(a),
  )[0];

  return best ? [best] : [];
}
