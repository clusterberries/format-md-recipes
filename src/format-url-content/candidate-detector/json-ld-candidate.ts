import type * as cheerio from 'cheerio';
import type { RecipeCandidate } from '../types.ts';
import type { RecipeSchema } from '../images-parser/types.ts';
import {
  escapeCssSelectorValue,
  MAX_SCHEMA_RECURSION_DEPTH,
} from '../utils/dom-helpers.ts';
import { createSignals, buildCandidate } from './signals.ts';
import { toString, toStringArray } from './helpers.ts';

export function scoreJsonLdCandidate(
  recipe: RecipeSchema,
  index: number,
  $: cheerio.CheerioAPI,
): RecipeCandidate {
  const ingredients = toStringArray(recipe.recipeIngredient);
  const instructions = flattenInstructions(recipe.recipeInstructions);
  const title = toString(recipe.name);
  const signals = createSignals({
    ingredientCount: ingredients.length,
    instructionCount: instructions.length,
    vocabularyText: JSON.stringify(recipe),
    hasTitle: Boolean(title),
    hasServings: Boolean(recipe.recipeYield),
    hasTimes: Boolean(recipe.prepTime || recipe.cookTime || recipe.totalTime),
    hasImages: Boolean(recipe.image),
    hasMicrodata: false,
    linkDensity: 0,
    noisePenalty: 0,
    consistencyText: `${ingredients.join(' ')} ${instructions.join(' ')}`,
  });

  const association = findSchemaAssociation($, recipe);
  signals.recipeVocabulary += association ? 1 : 0;

  return buildCandidate(
    `json-ld-${index}`,
    'json-ld',
    `json-ld-${index}${association ? `:${association}` : ''}`,
    title,
    signals,
  );
}

function findSchemaAssociation(
  $: cheerio.CheerioAPI,
  recipe: RecipeSchema,
): string | null {
  const ids = [recipe['@id'], recipe.mainEntityOfPage].flatMap((value) =>
    typeof value === 'string' ? [value, value.replace(/^#/, '')] : [],
  );
  for (const id of ids) {
    try {
      if ($(`#${escapeCssSelectorValue(id)}`).length) return id;
    } catch {
      // Malformed id from page content; skip this candidate id.
    }
  }
  return null;
}

function flattenInstructions(value: unknown, depth = 0): string[] {
  if (depth > MAX_SCHEMA_RECURSION_DEPTH) return [];
  if (typeof value === 'string') return [value];
  if (Array.isArray(value))
    return value.flatMap((item) => flattenInstructions(item, depth + 1));
  if (typeof value === 'object' && value !== null) {
    const item = value as Record<string, unknown>;
    return typeof item.text === 'string'
      ? [item.text]
      : flattenInstructions(item.itemListElement ?? item.steps, depth + 1);
  }
  return [];
}
