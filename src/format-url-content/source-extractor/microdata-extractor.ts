import type * as cheerio from 'cheerio';
import type { Element } from 'domhandler';
import type { RecipeContentCandidate } from '../types.ts';
import {
  extractElementValue,
  extractElementValues,
  extractListItemText,
  hasRecipeContent,
  uniqueStrings,
} from './extraction-helpers.ts';

export function extractMicrodataCandidates(
  $: cheerio.CheerioAPI,
): RecipeContentCandidate[] {
  const candidates: RecipeContentCandidate[] = [];

  $('[itemtype*="Recipe" i]').each((index, element) => {
    const $root = $(element);
    candidates.push({
      source: 'microdata',
      location: `itemtype-recipe-${index}`,
      title: extractElementValue($root.find('[itemprop="name" i]').first()),
      description: extractElementValue(
        $root.find('[itemprop="description" i]').first(),
      ),
      ingredients: extractMicrodataIngredients($, $root),
      instructions: extractMicrodataInstructions($, $root),
      servings: extractElementValue(
        $root.find('[itemprop="recipeYield" i]').first(),
      ),
      totalTime: extractElementValue(
        $root.find('[itemprop="totalTime" i]').first(),
      ),
      prepTime: extractElementValue(
        $root.find('[itemprop="prepTime" i]').first(),
      ),
      cookTime: extractElementValue(
        $root.find('[itemprop="cookTime" i]').first(),
      ),
    });
  });

  return candidates.filter(hasRecipeContent);
}

function extractMicrodataIngredients(
  $: cheerio.CheerioAPI,
  $root: cheerio.Cheerio<Element>,
): string[] {
  const metaIngredients = $root
    .find('meta[itemprop="recipeIngredient" i][content]')
    .map((_, element) => $(element).attr('content')?.trim() ?? '')
    .get()
    .filter(Boolean);

  if (metaIngredients.length) return uniqueStrings(metaIngredients);

  return extractElementValues($, $root.find('[itemprop="recipeIngredient" i]'));
}

function extractMicrodataInstructions(
  $: cheerio.CheerioAPI,
  $root: cheerio.Cheerio<Element>,
): string[] {
  const steps: string[] = [];

  $root.find('[itemprop="recipeInstructions" i]').each((_, container) => {
    const $container = $(container);
    const listItems = $container.is('ol, ul')
      ? $container.children('li')
      : $container.find('ol > li, ul > li');

    if (listItems.length) {
      listItems.each((_, element) => {
        const text = extractListItemText($, element);
        if (text) steps.push(text);
      });
      return;
    }

    const text = extractElementValue($container);
    if (text) steps.push(text);
  });

  return uniqueStrings(steps);
}
