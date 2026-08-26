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

const RECIPE_SIGNAL_PATTERN =
  /\b(recipe|ingredients?|instructions?|directions?|method|preparation|steps?|how-to|ингредиент|приготовлен|инструкц|рецепт|шаг)\b/i;
const INGREDIENT_PATTERN = /\b(ingredients?|ингредиент)/i;
const INSTRUCTION_PATTERN =
  /\b(instructions?|directions?|method|preparation|steps?|how-to|инструкц|приготовлен|шаг)/i;
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
  const microdata = extractMicrodataCandidates(document);
  const recipeHtml = extractRecipeHtmlCandidates(document);
  const forms = extractRecipeFormValues(document);
  const images = buildRecipeImagesResult(
    jsonLd.flatMap((recipe) => extractSchemaMainImages(recipe, pageUrl)),
    jsonLd.flatMap((recipe) => extractSchemaStepImages(recipe, pageUrl)),
    extractHtmlImages(document, pageUrl),
    [
      ...metadataImage(metadata.openGraphImage, 'metadata.og:image'),
      ...metadataImage(metadata.twitterImage, 'metadata.twitter:image'),
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
      ingredients: extractElementValues($,
        $root.find('[itemprop="recipeIngredient" i]'),
      ),
      instructions: extractInstructionValues($,
        $root.find('[itemprop="recipeInstructions" i]'),
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

  const candidates: RecipeContentCandidate[] = [];

  for (const [index, root] of [...roots].entries()) {
    const $root = $(root);
    const ingredientContainer = findSection($, $root, INGREDIENT_PATTERN);
    const instructionContainer = findSection($, $root, INSTRUCTION_PATTERN);

    const candidate = {
      source: 'html' as const,
      location: `recipe-html-${index}`,
      title: extractElementValue($root.find('h1, h2, h3').first()),
      ingredients: extractListValues($, ingredientContainer),
      instructions: extractListValues($, instructionContainer),
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
          ? $container.find(`label[for="${escapeSelectorValue(id)}"]`).first().text().trim()
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

function findSection(
  $: cheerio.CheerioAPI,
  $root: cheerio.Cheerio<Element>,
  pattern: RegExp,
): cheerio.Cheerio<Element> {
  const matching = $root.find('[class], [id], h1, h2, h3, h4, section, div').filter(
    (_, element) => pattern.test(getFingerprint($, element) + ' ' + $(element).text().slice(0, 300)),
  );

  return matching.first();
}

function extractListValues(
  $: cheerio.CheerioAPI,
  $container: cheerio.Cheerio<Element>,
): string[] {
  if (!$container.length) return [];

  const items = $container.find('li, tr, p').map((_, element) => $(element).text().trim()).get();
  return uniqueStrings(items.length ? items : [$container.text().trim()]);
}

function extractInstructionValues(
  $: cheerio.CheerioAPI,
  $elements: cheerio.Cheerio<Element>,
): string[] {
  return uniqueStrings(
    $elements
      .map((_, element) => $(element).text().trim())
      .get()
      .filter(Boolean),
  );
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

function extractElementValue($element: cheerio.Cheerio<Element>): string | null {
  const value =
    $element.attr('content')?.trim() ||
    $element.attr('value')?.trim() ||
    $element.text().trim();
  return value || null;
}

function hasRecipeContent(candidate: RecipeContentCandidate): boolean {
  return candidate.ingredients.length > 0 || candidate.instructions.length > 0;
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
  const values = typeof type === 'string' ? [type] : Array.isArray(type) ? type : [];
  return values.some(
    (value) => typeof value === 'string' && value.split(/[/:]/).at(-1)?.toLowerCase() === 'recipe',
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

function metadataImage(
  url: string | null,
  location: string,
): RecipeImage[] {
  return url
    ? [{ url, source: 'metadata', score: 700, alt: location }]
    : [];
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
  return /^\s*<(?:img|picture|source)\b[^>]*>(?:\s*<\/[^>]+>)?\s*$/i.test(value);
}

function escapeSelectorValue(value: string): string {
  return value.replace(/(["\\])/g, '\\$1');
}