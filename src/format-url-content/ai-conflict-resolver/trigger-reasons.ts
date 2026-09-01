import type { RecipeCandidate, ReconciledRecipe } from '../types.ts';
import { SIMILAR_CANDIDATE_SCORE_GAP } from './constants.ts';

export function getAiReasons(
  recipe: ReconciledRecipe,
  candidates: RecipeCandidate[],
): string[] {
  const reasons: string[] = [];
  if (recipe.conflicts.length) reasons.push('field conflicts detected');
  if (
    candidates.length > 1 &&
    candidates[0] &&
    candidates[1] &&
    candidates[0].score - candidates[1].score <= SIMILAR_CANDIDATE_SCORE_GAP
  ) {
    reasons.push('recipe candidates have similar scores');
  }
  if (
    recipe.ingredients.alternatives.some(
      (value) => value.length > recipe.ingredients.value.length,
    )
  ) {
    reasons.push('selected ingredients may be incomplete');
  }
  if (
    recipe.instructions.alternatives.some(
      (value) => value.length > recipe.instructions.value.length,
    )
  ) {
    reasons.push('selected instructions may be incomplete');
  }
  if (
    recipe.ingredients.conflicts.length ||
    recipe.instructions.conflicts.length
  ) {
    reasons.push('recipe collections disagree');
  }
  return [...new Set(reasons)];
}
