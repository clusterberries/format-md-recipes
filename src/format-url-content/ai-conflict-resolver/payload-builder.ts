import type {
  ExtractedIngredient,
  ExtractedInstruction,
  RecipeCandidate,
  ReconciledRecipe,
} from '../types.ts';
import { MAX_AI_INPUT_LENGTH } from './constants.ts';

export function buildPayload(
  recipe: ReconciledRecipe,
  candidates: RecipeCandidate[],
  reasons: string[],
): string | null {
  const payload = JSON.stringify({
    reasons,
    fields: {
      title: compactField(recipe.title),
      description: compactField(recipe.description),
      servings: compactField(recipe.servings),
      prepTime: compactField(recipe.prepTime),
      cookTime: compactField(recipe.cookTime),
      totalTime: compactField(recipe.totalTime),
      ingredients: compactCollection(
        recipe.ingredients.value,
        recipe.ingredients.alternatives,
      ),
      instructions: compactCollection(
        recipe.instructions.value,
        recipe.instructions.alternatives,
      ),
    },
    candidates: candidates
      .slice(0, 6)
      .map(({ id, source, score, title }) => ({ id, source, score, title })),
  });
  return payload.length <= MAX_AI_INPUT_LENGTH ? payload : null;
}

function compactField(field: ReconciledRecipe['title']): object {
  return {
    selected: field.value,
    alternatives: field.alternatives.map(({ value, source, confidence }) => ({
      value,
      source,
      confidence,
    })),
  };
}

function compactCollection<
  T extends ExtractedIngredient | ExtractedInstruction,
>(selected: T[], alternatives: T[][]): object {
  return {
    selected: selected.map(compactCollectionItem),
    alternatives: alternatives.map((group) => group.map(compactCollectionItem)),
  };
}

function compactCollectionItem(
  item: ExtractedIngredient | ExtractedInstruction,
): object {
  return 'stepIndex' in item
    ? {
        text: item.text,
        stepIndex: item.stepIndex,
        source: item.source,
        confidence: item.confidence,
      }
    : {
        text: item.text,
        quantity: item.quantity,
        unit: item.unit,
        name: item.name,
        source: item.source,
        confidence: item.confidence,
      };
}
