import type { ReconciledRecipe } from '../types.ts';

export function getAiReasons(recipe: ReconciledRecipe): string[] {
  const reasons: string[] = [];
  if (recipe.conflicts.length) reasons.push('field conflicts detected');
  if (
    recipe.ingredients.conflicts.length ||
    recipe.instructions.conflicts.length
  ) {
    reasons.push('recipe collections disagree');
  }
  if (
    recipe.ingredients.value.some((ingredient) =>
      looksLikeInstructionText(ingredient.text),
    )
  ) {
    reasons.push('ingredients may contain instruction-like text');
  }
  return reasons;
}

// Heuristic: real ingredient entries are short phrases, not full sentences describing an action.
function looksLikeInstructionText(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.split(/\s+/).length > 12 && /[.!?]/.test(trimmed);
}
