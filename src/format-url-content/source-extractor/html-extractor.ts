import type * as cheerio from 'cheerio';
import type { Element } from 'domhandler';
import type { RecipeContentCandidate } from '../types.ts';
import {
  extractElementValue,
  extractListItemText,
  getFingerprint,
  hasRecipeContent,
  uniqueStrings,
} from './extraction-helpers.ts';

const RECIPE_SIGNAL_PATTERN =
  /(?:\b(recipe|ingredients?|instructions?|directions?|method|preparation|steps?|how-to)\b|ингредиент\w*|приготовлени\w*|рецепт\w*|шаг(?:\s|$))/iu;
const INGREDIENT_PATTERN =
  /(?:\b(ingredients?|prepare|you will need)\b|ингредиент\w*|подготовьте)/iu;
const INSTRUCTION_PATTERN =
  /(?:\b(instructions?|directions?|method|preparation|steps?|how-to)\b|инструкц\w*|приготовлени\w*|шаг(?:\s|$))/iu;

export function extractRecipeHtmlCandidates(
  $: cheerio.CheerioAPI,
): RecipeContentCandidate[] {
  const roots = new Set<Element>();

  $('[class], [id], article, main, section').each((_, element) => {
    const fingerprint = getFingerprint($, element);
    if (RECIPE_SIGNAL_PATTERN.test(fingerprint)) roots.add(element);
  });

  $('article, .entry-content, main').each((_, element) => {
    if (hasBlogRecipeStructure($, $(element))) roots.add(element);
  });

  $('.recbody, .entry-content').each((_, element) => {
    roots.add(element);
  });

  const candidates: RecipeContentCandidate[] = [];

  for (const [index, root] of [...roots].entries()) {
    const $root = $(root);
    const ingredientContainer = resolveListSection(
      $,
      $root,
      INGREDIENT_PATTERN,
    );
    const instructionContainer = resolveListSection(
      $,
      $root,
      INSTRUCTION_PATTERN,
    );

    const candidate: RecipeContentCandidate = {
      source: 'html',
      location: `recipe-html-${index}`,
      title: extractElementValue($root.find('h1').first()),
      description:
        extractHtmlDescription($, $('.entry-content').first()) ??
        extractHtmlDescription($, $root),
      ingredients: extractListValues($, ingredientContainer).length
        ? extractListValues($, ingredientContainer)
        : extractListValues($, $('.ingredients').first()),
      instructions: extractListValues($, instructionContainer),
      ...extractHtmlRecipeMeta($, $root),
    };

    if (hasRecipeContent(candidate)) candidates.push(candidate);
  }

  return candidates;
}

function resolveListSection(
  $: cheerio.CheerioAPI,
  $root: cheerio.Cheerio<Element>,
  pattern: RegExp,
): cheerio.Cheerio<Element> {
  const heading = $root
    .find('h2, h3, h4')
    .filter((_, element) => pattern.test($(element).text().slice(0, 200)))
    .first();

  if (heading.length) {
    const list = heading.nextAll('ul, ol').first();
    if (list.length && !list.is('.ilparams')) return list;

    const parent = heading.parent();
    if (parent.find('p').length) return parent;
  }

  return findSection($, $root, pattern);
}

function findSection(
  $: cheerio.CheerioAPI,
  $root: cheerio.Cheerio<Element>,
  pattern: RegExp,
): cheerio.Cheerio<Element> {
  const matching = $root
    .find('[class], [id], h1, h2, h3, h4, section, div')
    .filter((_, element) =>
      pattern.test(
        getFingerprint($, element) + ' ' + $(element).text().slice(0, 300),
      ),
    );

  const match = matching.first();
  if (!match.length) return match;

  const list = match.find('> ul, > ol').first();
  if (list.length) return list;

  const nestedList = match.find('ul, ol').first();
  return nestedList.length ? nestedList : match;
}

function extractListValues(
  $: cheerio.CheerioAPI,
  $container: cheerio.Cheerio<Element>,
): string[] {
  if (!$container.length) return [];

  const ingredientParagraphs = $container
    .find('.ilist > div > p')
    .map((_, element) => $(element).text().replace(/\s+/g, ' ').trim())
    .get()
    .filter(Boolean);
  if (ingredientParagraphs.length) return uniqueStrings(ingredientParagraphs);

  const stepItems = $container
    .find('.step_n')
    .map((_, element) => $(element).find('p').first().text().trim())
    .get()
    .filter(Boolean);
  if (stepItems.length) return uniqueStrings(stepItems);

  const recipeSteps = $container
    .find('.recipe-step')
    .map((_, element) => $(element).find('p').first().text().trim())
    .get()
    .filter(Boolean);
  if (recipeSteps.length) return uniqueStrings(recipeSteps);

  const directListItems = $container.is('ol, ul')
    ? $container.children('li')
    : $container.children('ol, ul').children('li');
  const directListValues = directListItems
    .map((_, element) => extractListItemText($, element))
    .get()
    .filter(Boolean);
  if (directListValues.length) return uniqueStrings(directListValues);

  const nestedListItems = $container
    .find('ol:not(.ilparams) > li, ul:not(.ilparams) > li')
    .map((_, element) => extractListItemText($, element))
    .get()
    .filter(Boolean);
  if (nestedListItems.length) return uniqueStrings(nestedListItems);

  const tableRows = $container
    .find('tr')
    .map((_, element) => $(element).text().trim())
    .get()
    .filter(Boolean);
  if (tableRows.length) return uniqueStrings(tableRows);

  const paragraphs = $container
    .find('p')
    .map((_, element) => $(element).text().trim())
    .get()
    .filter(Boolean);
  if (paragraphs.length) return uniqueStrings(paragraphs);

  const fallback = $container.text().trim();
  return fallback ? uniqueStrings([fallback]) : [];
}

function extractHtmlDescription(
  $: cheerio.CheerioAPI,
  $root: cheerio.Cheerio<Element>,
): string | null {
  const descriptionSection = $root
    .find(
      'section.description, .description-text, .recdescription, .quick-description-quote',
    )
    .first();
  if (descriptionSection.length) {
    if (descriptionSection.text().trim())
      return descriptionSection.html() ?? null;
  }

  const entryParts: string[] = [];
  const contentRoot = $root.is('.entry-content')
    ? $root
    : $root.find('.entry-content').first();
  const descriptionRoot = contentRoot.length ? contentRoot : $root;
  const descriptionElements = contentRoot.length
    ? contentRoot.children('p, h2')
    : descriptionRoot.children('p, h2');
  descriptionElements.each((_, element) => {
    const $element = $(element);
    const tag = element.tagName.toLowerCase();
    const text = $element.text().replace(/\s+/g, ' ').trim();
    if (!text) return;
    if (
      tag === 'h2' &&
      (INGREDIENT_PATTERN.test(text) || INSTRUCTION_PATTERN.test(text))
    )
      return;
    if (tag === 'h2') {
      entryParts.push($.html(element));
      return;
    }
    entryParts.push($.html(element));
  });

  if (entryParts.length) return entryParts.join('\n\n');

  return null;
}

function extractHtmlRecipeMeta(
  $: cheerio.CheerioAPI,
  $root: cheerio.Cheerio<Element>,
): Pick<
  RecipeContentCandidate,
  'servings' | 'totalTime' | 'prepTime' | 'cookTime'
> {
  const meta: Pick<
    RecipeContentCandidate,
    'servings' | 'totalTime' | 'prepTime' | 'cookTime'
  > = {};

  $root
    .find(
      '.sub_info .el, .recipe-meta span, .recipe-meta [itemprop], .single-meta span',
    )
    .each((_, element) => {
      const text = $(element).text().replace(/\s+/g, ' ').trim();
      if (!text) return;

      const servingsMatch = text.match(/(\d+)\s*порци/i);
      if (servingsMatch && !meta.servings) {
        meta.servings = servingsMatch[1] ?? null;
        return;
      }

      const durationMatch = text.match(
        /(?:(\d+)\s*(?:ч\.?|час(?:а|ов)?))?\s*(?:(\d+)\s*мин)/i,
      );
      const minutesMatch = text.match(/(\d+)\s*мин/i);
      if (minutesMatch && !meta.totalTime) {
        const hours = durationMatch?.[1] ? Number(durationMatch[1]) : 0;
        const minutes = durationMatch?.[2]
          ? Number(durationMatch[2])
          : Number(minutesMatch[1]);
        meta.totalTime = hours
          ? `PT${hours}H${minutes ? `${minutes}M` : ''}`
          : `PT${minutes}M`;
      }
    });

  const yieldValue = extractElementValue(
    $root.find('[itemprop="recipeYield" i]').first(),
  );
  if (yieldValue) meta.servings = yieldValue;

  return meta;
}

function hasBlogRecipeStructure(
  $: cheerio.CheerioAPI,
  $root: cheerio.Cheerio<Element>,
): boolean {
  const ingredientSection = $root
    .find('h2, h3, h4')
    .filter((_, element) =>
      INGREDIENT_PATTERN.test($(element).text().slice(0, 200)),
    );
  const instructionSection = $root
    .find('h2, h3, h4')
    .filter((_, element) =>
      INSTRUCTION_PATTERN.test($(element).text().slice(0, 200)),
    );

  const hasIngredientList =
    ($root.find('ul li').length >= 2 &&
      (ingredientSection.length > 0 || $root.find('ul li').length >= 4)) ||
    $root.find('ul li').length >= 6;

  const hasInstructionList =
    ($root.find('ol li').length >= 2 &&
      (instructionSection.length > 0 || $root.find('ol li').length >= 4)) ||
    $root.find('ol li').length >= 6;

  return hasIngredientList && hasInstructionList;
}
