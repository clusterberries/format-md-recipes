import * as cheerio from 'cheerio';
import type { Element } from 'domhandler';
import type {
  FormRecipeValue,
  ParsedArticle,
  RecipeCandidate,
  RecipeCandidateSignals,
  RecipeContentCandidate,
  RecipeSchema,
} from './types.ts';

const RECIPE_WORD_PATTERN =
  /\b(recipe|ingredients?|instructions?|directions?|method|preparation|steps?|how-to|servings?|рецепт|ингредиент|инструкц|приготовлен|шаг|порци)\b/gi;
const NOISE_PATTERN =
  /\b(ad|advert|advertisement|banner|cookie|consent|newsletter|subscribe|popup|modal|comment|review|related|recommend|sidebar|реклама|подпис|комментар|похож|рекоменд)/i;
const TIME_PATTERN = /(?:prep|cook|total)[a-z -]*time|(?:врем|минут|час)/i;

export function detectRecipeCandidates(params: {
  $: cheerio.CheerioAPI;
  jsonLd: RecipeSchema[];
  microdata: RecipeContentCandidate[];
  recipeHtml: RecipeContentCandidate[];
  forms: FormRecipeValue[];
  readability: ParsedArticle | null;
}): RecipeCandidate[] {
  const candidates = [
    ...params.jsonLd.map((recipe, index) =>
      scoreJsonLdCandidate(recipe, index, params.$),
    ),
    ...params.microdata.map((candidate, index) =>
      scoreContentCandidate(candidate, `microdata-${index}`, params.$, true),
    ),
    ...params.recipeHtml.map((candidate, index) =>
      scoreContentCandidate(candidate, `html-${index}`, params.$, false),
    ),
    ...scoreFormCandidates(params.forms),
    ...(params.readability
      ? [scoreReadabilityCandidate(params.readability, params.$)]
      : []),
  ];

  return candidates.sort((a, b) => b.score - a.score);
}

function scoreJsonLdCandidate(
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

function scoreContentCandidate(
  candidate: RecipeContentCandidate,
  id: string,
  $: cheerio.CheerioAPI,
  hasMicrodata: boolean,
): RecipeCandidate {
  const element = findElementByLocation(
    $,
    candidate.location,
    candidate.source,
  );
  const text = [
    candidate.title ?? '',
    ...candidate.ingredients,
    ...candidate.instructions,
  ].join(' ');
  const signals = createSignals({
    ingredientCount: candidate.ingredients.length,
    instructionCount: candidate.instructions.length,
    vocabularyText: `${text} ${element ? getElementContext($, element) : ''}`,
    hasTitle: Boolean(candidate.title),
    hasServings: hasNearbySignal($, element, /servings?|yield|порци/i),
    hasTimes: hasNearbySignal($, element, TIME_PATTERN),
    hasImages: Boolean(element && $(element).find('img').length),
    hasMicrodata,
    linkDensity: element ? getLinkDensity($, element) : 0,
    noisePenalty: element ? getNoisePenalty($, element) : 0,
    consistencyText: text,
  });

  return buildCandidate(
    id,
    candidate.source,
    candidate.location,
    candidate.title,
    signals,
  );
}

function scoreFormCandidates(forms: FormRecipeValue[]): RecipeCandidate[] {
  if (!forms.length) return [];

  const text = forms
    .map((form) => `${form.label ?? ''} ${form.name ?? ''} ${form.value}`)
    .join(' ');
  const signals = createSignals({
    ingredientCount: forms.filter((form) =>
      /ingredient|ингредиент/i.test(`${form.label} ${form.name}`),
    ).length,
    instructionCount: 0,
    vocabularyText: text,
    hasTitle: false,
    hasServings: /serving|порци/i.test(text),
    hasTimes: TIME_PATTERN.test(text),
    hasImages: false,
    hasMicrodata: false,
    linkDensity: 0,
    noisePenalty: 0,
    consistencyText: text,
  });

  return [buildCandidate('form-0', 'form', 'recipe-form', null, signals)];
}

function scoreReadabilityCandidate(
  article: ParsedArticle,
  $: cheerio.CheerioAPI,
): RecipeCandidate {
  const text = `${article.title ?? ''} ${article.excerpt ?? ''} ${article.contentHtml}`;
  const signals = createSignals({
    ingredientCount: countMatches(text, /ingredient|ингредиент/gi),
    instructionCount: countMatches(
      text,
      /instruction|direction|step|инструкц|шаг/gi,
    ),
    vocabularyText: text,
    hasTitle: Boolean(article.title),
    hasServings: /servings?|yield|порци/i.test(text),
    hasTimes: TIME_PATTERN.test(text),
    hasImages: /<img\b/i.test(article.contentHtml),
    hasMicrodata: false,
    linkDensity: getHtmlLinkDensity($, article.contentHtml),
    noisePenalty: NOISE_PATTERN.test(text) ? 1 : 0,
    consistencyText: text,
  });

  return buildCandidate(
    'readability-0',
    'readability',
    'readability',
    article.title,
    signals,
  );
}

function createSignals(
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

function buildCandidate(
  id: string,
  source: RecipeCandidate['source'],
  location: string,
  title: string | null,
  signals: RecipeCandidateSignals,
): RecipeCandidate {
  const score =
    Math.min(signals.ingredientCount, 20) * 4 +
    Math.min(signals.instructionCount, 20) * 5 +
    Math.min(signals.recipeVocabulary, 8) * 3 +
    (signals.hasTitle ? 8 : 0) +
    (signals.hasServings ? 5 : 0) +
    (signals.hasTimes ? 5 : 0) +
    (signals.hasImages ? 4 : 0) +
    (signals.hasMicrodata ? 12 : 0) +
    signals.internalConsistency * 10 -
    Math.min(signals.linkDensity, 1) * 20 -
    signals.noisePenalty * 20;

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

function findElementByLocation(
  $: cheerio.CheerioAPI,
  location: string,
  source: RecipeContentCandidate['source'],
): Element | undefined {
  const index = Number(location.split('-').at(-1));
  if (!Number.isInteger(index)) return undefined;
  const selector =
    source === 'microdata'
      ? '[itemtype*="Recipe" i]'
      : '[class], [id], article, main, section';
  const elements = $(selector).toArray();
  return elements[index];
}

function findSchemaAssociation(
  $: cheerio.CheerioAPI,
  recipe: RecipeSchema,
): string | null {
  const ids = [recipe['@id'], recipe.mainEntityOfPage].flatMap((value) =>
    typeof value === 'string' ? [value, value.replace(/^#/, '')] : [],
  );
  for (const id of ids) {
    if ($(`#${escapeSelectorValue(id)}`).length) return id;
  }
  return null;
}

function hasNearbySignal(
  $: cheerio.CheerioAPI,
  element: Element | undefined,
  pattern: RegExp,
): boolean {
  return Boolean(element && pattern.test(getElementContext($, element)));
}

function getElementContext($: cheerio.CheerioAPI, element: Element): string {
  return `${$(element).attr('id') ?? ''} ${$(element).attr('class') ?? ''} ${$(element).text().slice(0, 2000)}`;
}

function getLinkDensity($: cheerio.CheerioAPI, element: Element): number {
  const text = $(element).text().trim().length;
  return text ? $(element).find('a').text().trim().length / text : 0;
}

function getNoisePenalty($: cheerio.CheerioAPI, element: Element): number {
  return NOISE_PATTERN.test(getElementContext($, element)) ? 1 : 0;
}

function getHtmlLinkDensity($: cheerio.CheerioAPI, html: string): number {
  const fragment = cheerio.load(`<div>${html}</div>`);
  const text = fragment('div').text().trim().length;
  return text ? fragment('a').text().trim().length / text : 0;
}

function countMatches(value: string, pattern: RegExp): number {
  return value.match(pattern)?.length ?? 0;
}

function toString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is string =>
          typeof item === 'string' && Boolean(item.trim()),
      )
    : typeof value === 'string' && value.trim()
      ? [value.trim()]
      : [];
}

function flattenInstructions(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(flattenInstructions);
  if (typeof value === 'object' && value !== null) {
    const item = value as Record<string, unknown>;
    return typeof item.text === 'string'
      ? [item.text]
      : flattenInstructions(item.itemListElement ?? item.steps);
  }
  return [];
}

function escapeSelectorValue(value: string): string {
  return value.replace(/(["\\])/g, '\\$1');
}
