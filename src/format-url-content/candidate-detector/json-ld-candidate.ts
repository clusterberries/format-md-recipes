import type * as cheerio from 'cheerio';
import type { RecipeCandidate } from '../types.ts';
import type { RecipeSchema } from '../images-parser/types.ts';
import { escapeCssSelectorValue } from '../utils/dom-helpers.ts';
import { flattenSchemaInstructions } from '../utils/schema-instructions.ts';
import { createSignals, buildCandidate } from './signals.ts';
import { toString, toStringArray } from './helpers.ts';

export function scoreJsonLdCandidate(
  recipe: RecipeSchema,
  index: number,
  $: cheerio.CheerioAPI,
): RecipeCandidate {
  const ingredients = toStringArray(recipe.recipeIngredient);
  const instructions = flattenSchemaInstructions(
    recipe.recipeInstructions,
  ).flatMap((step) => (typeof step.text === 'string' ? [step.text] : []));
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
