import * as cheerio from 'cheerio';
import type { Element } from 'domhandler';
import {
  extractSchemaMainImages,
  extractSchemaStepImages,
} from './images-parser/extract-schema-images.ts';
import { extractHtmlImages } from './images-parser/extract-html-images.ts';
import { buildRecipeImagesResult } from './images-parser/build-images-result.ts';
import { detectRecipeCandidates } from './candidate-detector.ts';
import type {
  ExtractedPageSources,
  FormRecipeValue,
  PageMetadata,
  ParsedArticle,
  RecipeContentCandidate,
  RecipeSchema,
} from './types.ts';
import type { RecipeImage } from './images-parser/types.ts';
import { escapeCssSelectorValue } from './css-selector-utils.ts';

const RECIPE_SIGNAL_PATTERN =
  /(?:\b(recipe|ingredients?|instructions?|directions?|method|preparation|steps?|how-to)\b|ингредиент\w*|приготовлени\w*|рецепт\w*|шаг(?:\s|$))/iu;
const INGREDIENT_PATTERN =
  /(?:\b(ingredients?|prepare|you will need)\b|ингредиент\w*|подготовьте)/iu;
const INSTRUCTION_PATTERN =
  /(?:\b(instructions?|directions?|method|preparation|steps?|how-to)\b|инструкц\w*|приготовлени\w*|шаг(?:\s|$))/iu;
const FORM_SIGNAL_PATTERN =
  /\b(recipe|ingredient|quantity|amount|unit|serving|рецепт|ингредиент|количеств|единиц|порци)/i;

export function extractIndependentSources(
  html: string,
  pageUrl: string,
  metadata: PageMetadata,
  readability: ParsedArticle | null,
): ExtractedPageSources {
  const document = cheerio.load(html);
  const jsonLd = extractJsonLdRecipes(document);
  const microdata = selectBestCandidates(
    deduplicateOverlappingCandidates(extractMicrodataCandidates(document)),
  );
  const recipeHtml = selectBestCandidates(
    deduplicateOverlappingCandidates(extractRecipeHtmlCandidates(document)),
  );
  const forms = extractRecipeFormValues(document);
  const images = buildRecipeImagesResult(
    jsonLd.flatMap((recipe) => extractSchemaMainImages(recipe, pageUrl)),
    jsonLd.flatMap((recipe) => extractSchemaStepImages(recipe, pageUrl)),
    extractHtmlImages(document, pageUrl),
    [
      ...metadataImage(metadata.openGraphImage),
      ...metadataImage(metadata.twitterImage),
    ],
  );
  const candidates = detectRecipeCandidates({
    $: document,
    jsonLd,
    microdata,
    recipeHtml,
    forms,
    readability,
  });
  return {
    jsonLd,
    microdata,
    recipeHtml,
    forms,
    images,
    metadata,
    readability,
    candidates,
  };
}

export function pickBestRecipeCandidate(
  candidates: RecipeContentCandidate[],
): RecipeContentCandidate | null {
  const deduped = deduplicateOverlappingCandidates(candidates);
  return selectBestCandidates(deduped)[0] ?? null;
}

function extractJsonLdRecipes($: cheerio.CheerioAPI): RecipeSchema[] {
  const recipes: RecipeSchema[] = [];

  $('script[type="application/ld+json"]').each((_, script) => {
    const text = $(script).text().trim();
    if (!text) return;

    try {
      collectRecipeObjects(JSON.parse(text), recipes);
    } catch {
      // Ignore malformed JSON-LD and continue with the other sources.
    }
  });

  return deduplicateRecipeObjects(recipes);
}

function collectRecipeObjects(value: unknown, recipes: RecipeSchema[]): void {
  if (Array.isArray(value)) {
    value.forEach((item) => collectRecipeObjects(item, recipes));
    return;
  }

  if (!isRecord(value)) return;

  if (isRecipeType(value['@type'])) {
    recipes.push(value);
  }

  Object.values(value).forEach((child) => collectRecipeObjects(child, recipes));
}

function extractMicrodataCandidates(
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

function extractRecipeHtmlCandidates(
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

function extractRecipeFormValues($: cheerio.CheerioAPI): FormRecipeValue[] {
  const values: FormRecipeValue[] = [];

  $('form, [role="form"], [class*="recipe" i], [id*="recipe" i]').each(
    (_, container) => {
      const $container = $(container);
      const context = getFingerprint($, container) + ' ' + $container.text();

      if (!FORM_SIGNAL_PATTERN.test(context)) return;

      $container.find('input, textarea, select, output').each((_, control) => {
        const $control = $(control);
        const value =
          $control.attr('value')?.trim() ||
          $control.find('option:selected').text().trim() ||
          $control.text().trim();

        if (!value) return;

        const id = $control.attr('id');
        const label = id
          ? getLabelForId($container, id)
          : $control.closest('label').text().trim();

        values.push({
          location: 'recipe-form',
          label: label || null,
          name: $control.attr('name')?.trim() || null,
          value,
        });
      });
    },
  );

  return deduplicateFormValues(values);
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

function extractListItemText($: cheerio.CheerioAPI, element: Element): string {
  const $element = $(element);
  if (isSkippedInstructionItem($element)) return '';

  const instruction = $element.find('.instruction').first().text().trim();
  if (instruction) return instruction;

  return $element.text().replace(/\s+/g, ' ').trim();
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

function extractElementValues(
  $: cheerio.CheerioAPI,
  $elements: cheerio.Cheerio<Element>,
): string[] {
  return uniqueStrings(
    $elements
      .map((_, element) => extractElementValue($(element)))
      .get()
      .filter((value): value is string => Boolean(value)),
  );
}

function extractElementValue(
  $element: cheerio.Cheerio<Element>,
): string | null {
  const value =
    $element.attr('content')?.trim() ||
    $element.attr('value')?.trim() ||
    $element.text().trim();
  return value || null;
}

function hasRecipeContent(candidate: RecipeContentCandidate): boolean {
  return candidate.ingredients.length > 0 || candidate.instructions.length > 0;
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

function candidateScore(candidate: RecipeContentCandidate): number {
  return candidate.ingredients.length + candidate.instructions.length * 2;
}

function deduplicateOverlappingCandidates(
  candidates: RecipeContentCandidate[],
): RecipeContentCandidate[] {
  return candidates.filter(
    (candidate, index) =>
      !candidates.some((other, otherIndex) => {
        if (index === otherIndex) return false;
        if (candidateScore(other) <= candidateScore(candidate)) return false;
        return isCandidateSubset(candidate, other);
      }),
  );
}

function isCandidateSubset(
  candidate: RecipeContentCandidate,
  other: RecipeContentCandidate,
): boolean {
  if (
    other.ingredients.length < candidate.ingredients.length ||
    other.instructions.length < candidate.instructions.length
  ) {
    return false;
  }

  const otherText = [...other.ingredients, ...other.instructions]
    .join('\n')
    .toLocaleLowerCase();

  return [...candidate.ingredients, ...candidate.instructions].every((item) =>
    otherText.includes(item.slice(0, 40).toLocaleLowerCase()),
  );
}

function selectBestCandidates(
  candidates: RecipeContentCandidate[],
): RecipeContentCandidate[] {
  if (!candidates.length) return [];

  const best = [...candidates].sort(
    (a, b) => candidateScore(b) - candidateScore(a),
  )[0];

  return best ? [best] : [];
}

function isSkippedInstructionItem($element: cheerio.Cheerio<Element>): boolean {
  const className = $element.attr('class') ?? '';
  if (/\bas-ad-step\b/i.test(className)) return true;
  if (
    /\bnoprint\b/i.test(className) &&
    !$element.find('.instruction, p').text().trim()
  ) {
    return true;
  }
  return false;
}

function getFingerprint($: cheerio.CheerioAPI, element: Element): string {
  const $element = $(element);
  return [
    $element.attr('id'),
    $element.attr('class'),
    $element.attr('name'),
    $element.attr('itemprop'),
    $element.attr('itemtype'),
    $element.attr('aria-label'),
  ]
    .filter(Boolean)
    .join(' ');
}

function isRecipeType(type: unknown): boolean {
  const values =
    typeof type === 'string' ? [type] : Array.isArray(type) ? type : [];
  return values.some(
    (value) =>
      typeof value === 'string' &&
      value.split(/[/:]/).at(-1)?.toLowerCase() === 'recipe',
  );
}

function isRecord(value: unknown): value is RecipeSchema {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function deduplicateRecipeObjects(recipes: RecipeSchema[]): RecipeSchema[] {
  const seen = new Set<string>();
  return recipes.filter((recipe) => {
    const key = JSON.stringify(recipe);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function metadataImage(url: string | null): RecipeImage[] {
  return url ? [{ url, source: 'metadata', score: 700 }] : [];
}

function deduplicateFormValues(values: FormRecipeValue[]): FormRecipeValue[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = `${value.label ?? ''}:${value.name ?? ''}:${value.value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function uniqueStrings(values: string[]): string[] {
  return [
    ...new Set(
      values
        .map((value) => value.replace(/\s+/g, ' ').trim())
        .filter((value) => value && !isImageOnlyMarkup(value)),
    ),
  ];
}

function isImageOnlyMarkup(value: string): boolean {
  return /^\s*<(?:img|picture|source)\b[^>]*>(?:\s*<\/[^>]+>)?\s*$/i.test(
    value,
  );
}

function getLabelForId(
  $container: cheerio.Cheerio<Element>,
  id: string,
): string {
  try {
    return $container
      .find(`label[for="${escapeCssSelectorValue(id)}"]`)
      .first()
      .text()
      .trim();
  } catch {
    // Malformed id from page content; fall back to no label.
    return '';
  }
}
