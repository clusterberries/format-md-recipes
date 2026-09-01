import type { RecipeCandidate, RecipeCandidateSignals } from '../types.ts';
import { RECIPE_WORD_PATTERN } from './patterns.ts';
import { countMatches } from './helpers.ts';

const INGREDIENT_COUNT_CAP = 20;
const INGREDIENT_COUNT_WEIGHT = 4;
const INSTRUCTION_COUNT_CAP = 20;
const INSTRUCTION_COUNT_WEIGHT = 5;
const VOCABULARY_CAP = 8;
const VOCABULARY_WEIGHT = 3;
const TITLE_BONUS = 8;
const SERVINGS_BONUS = 5;
const TIMES_BONUS = 5;
const IMAGES_BONUS = 4;
// Microdata is a near-certain recipe signal, so it outweighs the other flat bonuses.
const MICRODATA_BONUS = 12;
const CONSISTENCY_WEIGHT = 10;
const MAX_LINK_DENSITY_PENALTY_WEIGHT = 20;
const NOISE_PENALTY_WEIGHT = 20;

export function createSignals(
  input: Omit<
    RecipeCandidateSignals,
    'recipeVocabulary' | 'internalConsistency'
  > & { vocabularyText: string; consistencyText: string },
): RecipeCandidateSignals {
  return {
    ingredientCount: input.ingredientCount,
    instructionCount: input.instructionCount,
    recipeVocabulary: countMatches(input.vocabularyText, RECIPE_WORD_PATTERN),
    hasTitle: input.hasTitle,
    hasServings: input.hasServings,
    hasTimes: input.hasTimes,
    hasImages: input.hasImages,
    hasMicrodata: input.hasMicrodata,
    linkDensity: input.linkDensity,
    noisePenalty: input.noisePenalty,
    internalConsistency: getInternalConsistency(
      input.ingredientCount,
      input.instructionCount,
      input.consistencyText,
    ),
  };
}

export function buildCandidate(
  id: string,
  source: RecipeCandidate['source'],
  location: string,
  title: string | null,
  signals: RecipeCandidateSignals,
): RecipeCandidate {
  const score =
    Math.min(signals.ingredientCount, INGREDIENT_COUNT_CAP) *
      INGREDIENT_COUNT_WEIGHT +
    Math.min(signals.instructionCount, INSTRUCTION_COUNT_CAP) *
      INSTRUCTION_COUNT_WEIGHT +
    Math.min(signals.recipeVocabulary, VOCABULARY_CAP) * VOCABULARY_WEIGHT +
    (signals.hasTitle ? TITLE_BONUS : 0) +
    (signals.hasServings ? SERVINGS_BONUS : 0) +
    (signals.hasTimes ? TIMES_BONUS : 0) +
    (signals.hasImages ? IMAGES_BONUS : 0) +
    (signals.hasMicrodata ? MICRODATA_BONUS : 0) +
    signals.internalConsistency * CONSISTENCY_WEIGHT -
    Math.min(signals.linkDensity, 1) * MAX_LINK_DENSITY_PENALTY_WEIGHT -
    signals.noisePenalty * NOISE_PENALTY_WEIGHT;

  return { id, source, location, score, title, signals };
}

function getInternalConsistency(
  ingredientCount: number,
  instructionCount: number,
  text: string,
): number {
  if (!ingredientCount && !instructionCount) return 0;
  let score = 0.3;
  if (ingredientCount >= 2) score += 0.3;
  if (instructionCount >= 2) score += 0.3;
  if (text.trim().length >= 40) score += 0.1;
  return Math.min(score, 1);
}
