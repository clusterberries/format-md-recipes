import type { RecipeContentCandidate } from '../types.ts';

export function candidateScore(candidate: RecipeContentCandidate): number {
  return candidate.ingredients.length + candidate.instructions.length * 2;
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
