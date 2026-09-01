import type {
  ExtractedField,
  ExtractedIngredient,
  ExtractedInstruction,
  CollectionConflict,
  FieldConflict,
  NormalizedRecipe,
  ReconciledCollection,
  ReconciledField,
  ReconciledRecipe,
} from './types.ts';
import { normalizeText } from './utils.ts';

const SOURCE_PRIORITY: Record<ExtractedField<unknown>['source'], number> = {
  'json-ld': 5,
  microdata: 4,
  html: 3,
  form: 2,
  readability: 1,
  metadata: 0,
};

export function reconcileRecipe(recipe: NormalizedRecipe): ReconciledRecipe {
  const title = reconcileScalar(recipe.title, 'title');
  const description = reconcileScalar(recipe.description, 'description');
  const servings = reconcileScalar(recipe.servings, 'servings');
  const prepTime = reconcileScalar(recipe.prepTime, 'prepTime');
  const cookTime = reconcileScalar(recipe.cookTime, 'cookTime');
  const totalTime = reconcileScalar(recipe.totalTime, 'totalTime');
  const ingredients = reconcileIngredients(recipe.ingredients);
  const instructions = reconcileInstructions(recipe.instructions);

  return {
    title,
    description,
    servings,
    prepTime,
    cookTime,
    totalTime,
    ingredients,
    instructions,
    mainImage: recipe.mainImage,
    stepImages: recipe.stepImages,
    galleryImages: recipe.galleryImages,
    notes: recipe.notes,
    conflicts: [
      ...title.conflicts,
      ...description.conflicts,
      ...servings.conflicts,
      ...prepTime.conflicts,
      ...cookTime.conflicts,
      ...totalTime.conflicts,
      ...ingredients.conflicts,
      ...instructions.conflicts,
    ] as Array<FieldConflict<unknown>>,
    sourceMetadata: recipe.sourceMetadata,
  };
}

function reconcileScalar<T>(
  fields: ExtractedField<T>[],
  fieldName: string,
): ReconciledField<T> {
  const unique = uniqueFields(fields);
  const selected = [...unique].sort(compareFields)[0] ?? null;
  const alternatives = selected
    ? unique.filter((field) => field !== selected)
    : unique;
  const conflicts: FieldConflict<T>[] = alternatives
    .filter((field) => !sameValue(field.value, selected?.value))
    .map((field) => ({
      field: fieldName,
      selected,
      alternatives: [field],
      reason: 'different-values' as const,
    }));

  return {
    value: selected?.value ?? null,
    source: selected?.source ?? null,
    confidence: selected?.confidence ?? 0,
    location: selected?.location ?? null,
    alternatives,
    conflicts,
    selectionReason: selected ? getScalarReason(selected, unique) : null,
  };
}

function reconcileIngredients(
  ingredients: ExtractedIngredient[],
): ReconciledCollection<ExtractedIngredient> {
  const groups = groupBySource(ingredients);
  const orderedGroups = [...groups.entries()].sort((a, b) =>
    compareCollections(a[1], b[1]),
  );
  const selected = orderedGroups[0]?.[1] ?? [];
  const alternatives = orderedGroups.slice(1).map(([, values]) => values);
  const merged = mergeCompatibleIngredients(selected, ingredients);
  const conflicts: CollectionConflict<ExtractedIngredient>[] = alternatives
    .filter((group) => !sameIngredientCollection(group, selected))
    .map((group) => ({
      field: 'ingredients',
      selected,
      alternatives: [group],
      reason: 'different-quantities' as const,
    }));

  return {
    value: merged,
    source: selected[0]?.source ?? null,
    confidence: selected.length ? averageConfidence(selected) : 0,
    alternatives,
    conflicts,
    selectionReason: selected.length ? 'most-complete-source' : null,
  };
}

function reconcileInstructions(
  instructions: ExtractedInstruction[],
): ReconciledCollection<ExtractedInstruction> {
  const groups = groupBySource(instructions);
  const orderedGroups = [...groups.entries()].sort((a, b) =>
    compareCollections(a[1], b[1]),
  );
  const selected = orderedGroups[0]?.[1] ?? [];
  const alternatives = orderedGroups.slice(1).map(([, values]) => values);
  const conflicts: CollectionConflict<ExtractedInstruction>[] = alternatives
    .filter((group) => !sameInstructionCollection(group, selected))
    .map((group) => ({
      field: 'instructions',
      selected,
      alternatives: [group],
      reason: 'different-order' as const,
    }));

  return {
    value: selected,
    source: selected[0]?.source ?? null,
    confidence: selected.length ? averageConfidence(selected) : 0,
    alternatives,
    conflicts,
    selectionReason: selected.length ? 'most-complete-source' : null,
  };
}

function compareFields<T>(a: ExtractedField<T>, b: ExtractedField<T>): number {
  return (
    SOURCE_PRIORITY[b.source] - SOURCE_PRIORITY[a.source] ||
    b.confidence - a.confidence ||
    String(b.value).length - String(a.value).length
  );
}

function compareCollections<
  T extends { source: ExtractedField<unknown>['source']; confidence: number },
>(a: T[], b: T[]): number {
  return (
    b.length - a.length ||
    SOURCE_PRIORITY[b[0]?.source ?? 'metadata'] -
      SOURCE_PRIORITY[a[0]?.source ?? 'metadata'] ||
    averageConfidence(b) - averageConfidence(a)
  );
}

function groupBySource<
  T extends { source: ExtractedField<unknown>['source']; confidence: number },
>(values: T[]): Map<T['source'], T[]> {
  const groups = new Map<T['source'], T[]>();
  values.forEach((value) => {
    const group = groups.get(value.source) ?? [];
    group.push(value);
    groups.set(value.source, group);
  });
  return groups;
}

function mergeCompatibleIngredients(
  selected: ExtractedIngredient[],
  all: ExtractedIngredient[],
): ExtractedIngredient[] {
  const result = [...selected];
  all.forEach((ingredient) => {
    if (isAggregateIngredient(ingredient, selected)) return;
    const existing = result.find((item) =>
      sameIngredientName(item, ingredient),
    );
    if (!existing && ingredient.source !== selected[0]?.source)
      result.push(ingredient);
    else if (existing && isRicherIngredient(ingredient, existing)) {
      result[result.indexOf(existing)] = ingredient;
    }
  });
  return result;
}

function isAggregateIngredient(
  ingredient: ExtractedIngredient,
  selected: ExtractedIngredient[],
): boolean {
  if (selected.length < 3 || ingredient.source === selected[0]?.source)
    return false;
  const text = normalizeIngredient(ingredient.text);
  return selected.every((item) =>
    text.includes(normalizeIngredient(item.text)),
  );
}

function sameIngredientName(
  a: ExtractedIngredient,
  b: ExtractedIngredient,
): boolean {
  return normalizeIngredient(a.text) === normalizeIngredient(b.text);
}

function sameIngredientCollection(
  a: ExtractedIngredient[],
  b: ExtractedIngredient[],
): boolean {
  return (
    a.length === b.length &&
    a.every((item, index) => sameIngredientName(item, b[index] ?? item))
  );
}

function sameInstructionCollection(
  a: ExtractedInstruction[],
  b: ExtractedInstruction[],
): boolean {
  return (
    a.length === b.length &&
    a.every(
      (item, index) => normalize(item.text) === normalize(b[index]?.text ?? ''),
    )
  );
}

function isRicherIngredient(
  a: ExtractedIngredient,
  b: ExtractedIngredient,
): boolean {
  return (
    a.text.length > b.text.length ||
    Boolean(a.quantity && !b.quantity) ||
    Boolean(a.unit && !b.unit)
  );
}

function uniqueFields<T>(fields: ExtractedField<T>[]): ExtractedField<T>[] {
  const seen = new Set<string>();
  return fields.filter((field) => {
    const key = normalize(String(field.value));
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sameValue<T>(a: T | undefined, b: T | undefined): boolean {
  return (
    a !== undefined &&
    b !== undefined &&
    normalize(String(a)) === normalize(String(b))
  );
}

function getScalarReason<T>(
  selected: ExtractedField<T>,
  fields: ExtractedField<T>[],
): string {
  return fields.some(
    (field) =>
      field !== selected &&
      String(field.value).length > String(selected.value).length,
  )
    ? 'highest-source-priority'
    : 'highest-confidence';
}

function averageConfidence<T extends { confidence: number }>(
  values: T[],
): number {
  return values.length
    ? values.reduce((sum, value) => sum + value.confidence, 0) / values.length
    : 0;
}

function normalize(value: string): string {
  return normalizeText(value).toLocaleLowerCase();
}

function normalizeIngredient(value: string): string {
  return normalize(value).replace(/\s*[:\-–—]\s*/g, ' ');
}
