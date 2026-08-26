import { MINI_MODEL } from '../shared/constants.ts';
import { callOpenAI } from '../shared/openai-client.ts';
import { logWarning } from '../shared/utils.ts';
import type {
  ExtractedField,
  ExtractedIngredient,
  ExtractedInstruction,
  RecipeCandidate,
  ReconciledRecipe,
} from './types.ts';

const AI_SYSTEM_PROMPT =
  'You resolve recipe extraction conflicts. Return only valid JSON. Never invent recipe data.';
const SIMILAR_CANDIDATE_SCORE_GAP = 12;
const MAX_AI_INPUT_LENGTH = 12_000;

interface AiDecision {
  fields?: {
    title?: AiFieldDecision;
    description?: AiFieldDecision;
    servings?: AiFieldDecision;
    prepTime?: AiFieldDecision;
    cookTime?: AiFieldDecision;
    totalTime?: AiFieldDecision;
    ingredients?: AiCollectionDecision;
    instructions?: AiCollectionDecision;
  };
  unresolved?: string[];
}

interface AiFieldDecision {
  action: 'select' | 'keep-deterministic' | 'unresolved';
  candidateIndex?: number;
}

interface AiCollectionDecision {
  action: 'select' | 'merge' | 'keep-deterministic' | 'unresolved';
  candidateIndexes?: number[];
}

export interface AiResolutionResult {
  recipe: ReconciledRecipe;
  called: boolean;
  applied: boolean;
  reasons: string[];
}

export async function resolveRecipeConflicts(
  recipe: ReconciledRecipe,
  candidates: RecipeCandidate[],
): Promise<AiResolutionResult> {
  const reasons = getAiReasons(recipe, candidates);
  if (!reasons.length) {
    return { recipe, called: false, applied: false, reasons };
  }

  const payload = buildPayload(recipe, candidates, reasons);
  if (!payload) {
    return { recipe, called: false, applied: false, reasons };
  }

  try {
    const response = await callOpenAI(
      payload,
      MINI_MODEL,
      {
        systemPrompt: AI_SYSTEM_PROMPT,
        maxCompletionTokens: 1200,
      },
    );
    const decision = parseDecision(response);
    if (!decision) {
      logWarning('AI conflict resolution returned an invalid response. Using deterministic result.');
      return { recipe, called: true, applied: false, reasons };
    }

    const resolved = applyDecision(recipe, decision);
    return { recipe: resolved, called: true, applied: resolved !== recipe, reasons };
  } catch (error) {
    logWarning(`AI conflict resolution failed: ${getErrorMessage(error)}. Using deterministic result.`);
    return { recipe, called: true, applied: false, reasons };
  }
}

function getAiReasons(recipe: ReconciledRecipe, candidates: RecipeCandidate[]): string[] {
  const reasons: string[] = [];
  if (recipe.conflicts.length) reasons.push('field conflicts detected');
  if (candidates.length > 1 && candidates[0] && candidates[1] && candidates[0].score - candidates[1].score <= SIMILAR_CANDIDATE_SCORE_GAP) {
    reasons.push('recipe candidates have similar scores');
  }
  if (recipe.ingredients.value.length < 2 && recipe.ingredients.alternatives.some((value) => value.length >= 2)) {
    reasons.push('selected ingredients may be incomplete');
  }
  if (recipe.instructions.value.length < 2 && recipe.instructions.alternatives.some((value) => value.length >= 2)) {
    reasons.push('selected instructions may be incomplete');
  }
  if (recipe.ingredients.conflicts.length || recipe.instructions.conflicts.length) {
    reasons.push('recipe collections disagree');
  }
  return [...new Set(reasons)];
}

function buildPayload(recipe: ReconciledRecipe, candidates: RecipeCandidate[], reasons: string[]): string | null {
  const payload = JSON.stringify({
    reasons,
    fields: {
      title: compactField(recipe.title),
      description: compactField(recipe.description),
      servings: compactField(recipe.servings),
      prepTime: compactField(recipe.prepTime),
      cookTime: compactField(recipe.cookTime),
      totalTime: compactField(recipe.totalTime),
      ingredients: compactCollection(recipe.ingredients.value, recipe.ingredients.alternatives),
      instructions: compactCollection(recipe.instructions.value, recipe.instructions.alternatives),
    },
    candidates: candidates.slice(0, 6).map(({ id, source, score, title }) => ({ id, source, score, title })),
  });
  return payload.length <= MAX_AI_INPUT_LENGTH ? payload : null;
}

function compactField<T>(field: ReconciledRecipe['title']): object {
  return {
    selected: field.value,
    alternatives: field.alternatives.map(({ value, source, confidence }) => ({ value, source, confidence })),
  };
}

function compactCollection<T extends ExtractedIngredient | ExtractedInstruction>(selected: T[], alternatives: T[][]): object {
  return {
    selected: selected.map(compactCollectionItem),
    alternatives: alternatives.map((group) => group.map(compactCollectionItem)),
  };
}

function compactCollectionItem(item: ExtractedIngredient | ExtractedInstruction): object {
  return 'stepIndex' in item
    ? { text: item.text, stepIndex: item.stepIndex, source: item.source, confidence: item.confidence }
    : { text: item.text, quantity: item.quantity, unit: item.unit, name: item.name, source: item.source, confidence: item.confidence };
}

function parseDecision(value: string): AiDecision | null {
  try {
    const parsed: unknown = JSON.parse(value);
    return isAiDecision(parsed) && validateDecision(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isAiDecision(value: unknown): value is AiDecision {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateDecision(decision: AiDecision): boolean {
  if (decision.unresolved && !decision.unresolved.every((item) => typeof item === 'string')) return false;
  if (!decision.fields) return true;
  for (const field of Object.values(decision.fields)) {
    if (!field || !isAllowedAction(field.action)) return false;
    if (field.action === 'select') {
      if ('candidateIndex' in field && !isValidIndex(field.candidateIndex)) return false;
      if ('candidateIndexes' in field && !field.candidateIndexes?.length) return false;
    }
  }
  if (decision.fields.ingredients && !validateCollectionDecision(decision.fields.ingredients)) return false;
  if (decision.fields.instructions && !validateCollectionDecision(decision.fields.instructions)) return false;
  return true;
}

function validateCollectionDecision(decision: AiCollectionDecision): boolean {
  if (!isAllowedAction(decision.action)) return false;
  return decision.action === 'select' || decision.action === 'merge'
    ? Boolean(decision.candidateIndexes?.length && decision.candidateIndexes.every(isValidIndex))
    : true;
}

function isAllowedAction(value: unknown): value is AiFieldDecision['action'] | AiCollectionDecision['action'] {
  return value === 'select' || value === 'merge' || value === 'keep-deterministic' || value === 'unresolved';
}

function isValidIndex(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function applyDecision(recipe: ReconciledRecipe, decision: AiDecision): ReconciledRecipe {
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
  fieldName: 'title' | 'description' | 'servings' | 'prepTime' | 'cookTime' | 'totalTime',
  decision: AiFieldDecision | undefined,
): ReconciledRecipe {
  if (!decision || decision.action !== 'select' || decision.candidateIndex === undefined) return recipe;
  const field = recipe[fieldName];
  const candidates = [
    { value: field.value, source: field.source, confidence: field.confidence, location: field.location },
    ...field.alternatives,
  ];
  const selected = candidates[decision.candidateIndex];
  if (!selected) return recipe;
  return { ...recipe, [fieldName]: { ...field, value: selected.value, source: selected.source, confidence: selected.confidence, location: selected.location, selectionReason: 'ai-selected' } };
}

function applyCollectionDecision(
  recipe: ReconciledRecipe,
  fieldName: 'ingredients' | 'instructions',
  decision: AiCollectionDecision | undefined,
): ReconciledRecipe {
  if (!decision || (decision.action !== 'select' && decision.action !== 'merge') || !decision.candidateIndexes) return recipe;
  const collection = recipe[fieldName];
  const candidates = [collection.value, ...collection.alternatives];
  const selectedGroups = decision.candidateIndexes
    .map((index) => candidates[index])
    .filter(
      (group): group is ExtractedIngredient[] | ExtractedInstruction[] =>
        Boolean(group),
    );
  if (!selectedGroups.length) return recipe;
  const firstGroup = selectedGroups[0];
  const value = decision.action === 'select'
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
      selectionReason: decision.action === 'merge' ? 'ai-merged' : 'ai-selected',
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

function averageCollectionConfidence<T extends { confidence: number }>(values: T[]): number {
  return values.length ? values.reduce((sum, value) => sum + value.confidence, 0) / values.length : 0;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}