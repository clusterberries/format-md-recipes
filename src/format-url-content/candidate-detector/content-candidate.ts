import type * as cheerio from 'cheerio';
import type { Element } from 'domhandler';
import type { RecipeCandidate, RecipeContentCandidate } from '../types.ts';
import { getLinkDensity } from '../utils.ts';
import { NOISE_PATTERN, TIME_PATTERN } from './patterns.ts';
import { createSignals, buildCandidate } from './signals.ts';

export function scoreContentCandidate(
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

function getNoisePenalty($: cheerio.CheerioAPI, element: Element): number {
  return NOISE_PATTERN.test(getElementContext($, element)) ? 1 : 0;
}
