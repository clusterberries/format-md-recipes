import type {
  ExtractedIngredient,
  ExtractedInstruction,
  ReconciledRecipe,
} from '../types.ts';
import type {
  AiCollectionDecision,
  AiDecision,
  AiFieldDecision,
} from './types.ts';

export function applyDecision(
  recipe: ReconciledRecipe,
  decision: AiDecision,
): ReconciledRecipe {
  let result = recipe;
  const fields = decision.fields;
  if (!fields) return result;
  result = applyScalarDecision(result, 'title', fields.title);
  result = applyScalarDecision(result, 'description', fields.description);
  result = applyScalarDecision(result, 'servings', fields.servings);
  result = applyScalarDecision(result, 'prepTime', fields.prepTime);
  result = applyScalarDecision(result, 'cookTime', fields.cookTime);
  result = applyScalarDecision(result, 'totalTime', fields.totalTime);
  result = applyCollectionDecision(result, 'ingredients', fields.ingredients);
  result = applyCollectionDecision(result, 'instructions', fields.instructions);
  return result;
}

function applyScalarDecision(
  recipe: ReconciledRecipe,
  fieldName:
    | 'title'
    | 'description'
    | 'servings'
    | 'prepTime'
    | 'cookTime'
    | 'totalTime',
  decision: AiFieldDecision | undefined,
): ReconciledRecipe {
  if (
    !decision ||
    decision.action !== 'select' ||
    decision.candidateIndex === undefined
  )
    return recipe;
  const field = recipe[fieldName];
  const candidates = [
    {
      value: field.value,
      source: field.source,
      confidence: field.confidence,
      location: field.location,
    },
    ...field.alternatives,
  ];
  const selected = candidates[decision.candidateIndex];
  if (!selected) return recipe;
  return {
    ...recipe,
    [fieldName]: {
      ...field,
      value: selected.value,
      source: selected.source,
      confidence: selected.confidence,
      location: selected.location,
      selectionReason: 'ai-selected',
    },
  };
}

function applyCollectionDecision(
  recipe: ReconciledRecipe,
  fieldName: 'ingredients' | 'instructions',
  decision: AiCollectionDecision | undefined,
): ReconciledRecipe {
  if (!decision) return recipe;
  const collection = recipe[fieldName];

  if (decision.action === 'filter')
    return applyFilterDecision(recipe, fieldName, collection, decision);

  if (
    (decision.action !== 'select' && decision.action !== 'merge') ||
    !decision.candidateIndexes
  )
    return recipe;
  const candidates = [collection.value, ...collection.alternatives];
  const selectedGroups = decision.candidateIndexes
    .map((index) => candidates[index])
    .filter((group): group is ExtractedIngredient[] | ExtractedInstruction[] =>
      Boolean(group),
    );
  if (!selectedGroups.length) return recipe;
  const firstGroup = selectedGroups[0];
  const value =
    decision.action === 'select'
      ? firstGroup
      : deduplicateCollection(selectedGroups.flat());
  if (!value) return recipe;
  return {
    ...recipe,
    [fieldName]: {
      ...collection,
      value,
      source: value[0]?.source ?? collection.source,
      confidence: averageCollectionConfidence(value),
      selectionReason:
        decision.action === 'merge' ? 'ai-merged' : 'ai-selected',
    },
  };
}

function applyFilterDecision<
  T extends ExtractedIngredient | ExtractedInstruction,
>(
  recipe: ReconciledRecipe,
  fieldName: 'ingredients' | 'instructions',
  collection: ReconciledRecipe[typeof fieldName],
  decision: AiCollectionDecision,
): ReconciledRecipe {
  if (!decision.dropTexts?.length) return recipe;
  const dropSet = new Set(
    decision.dropTexts.map((text) => text.trim().toLocaleLowerCase()),
  );
  const value = (collection.value as T[]).filter(
    (item) => !dropSet.has(item.text.trim().toLocaleLowerCase()),
  );
  // Never let a bad AI response wipe out the whole collection.
  if (!value.length) return recipe;
  return {
    ...recipe,
    [fieldName]: {
      ...collection,
      value,
      source: value[0]?.source ?? collection.source,
      confidence: averageCollectionConfidence(value),
      selectionReason: 'ai-filtered',
    },
  };
}

function deduplicateCollection<T extends { text: string }>(values: T[]): T[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.text.trim().toLocaleLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function averageCollectionConfidence<T extends { confidence: number }>(
  values: T[],
): number {
  return values.length
    ? values.reduce((sum, value) => sum + value.confidence, 0) / values.length
    : 0;
}
