import type * as cheerio from 'cheerio';
import type { Element } from 'domhandler';
import type { RecipeContentCandidate } from '../types.ts';
import { normalizeText } from '../utils.ts';

export function extractElementValue(
  $element: cheerio.Cheerio<Element>,
): string | null {
  const value =
    $element.attr('content')?.trim() ||
    $element.attr('value')?.trim() ||
    $element.text().trim();
  return value || null;
}

export function extractElementValues(
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

export function uniqueStrings(values: string[]): string[] {
  return [
    ...new Set(
      values
        .map((value) => normalizeText(value))
        .filter((value) => value && !isImageOnlyMarkup(value)),
    ),
  ];
}

function isImageOnlyMarkup(value: string): boolean {
  return /^\s*<(?:img|picture|source)\b[^>]*>(?:\s*<\/[^>]+>)?\s*$/i.test(
    value,
  );
}

export function hasRecipeContent(candidate: RecipeContentCandidate): boolean {
  return candidate.ingredients.length > 0 || candidate.instructions.length > 0;
}

export function extractListItemText(
  $: cheerio.CheerioAPI,
  element: Element,
): string {
  const $element = $(element);
  if (isSkippedInstructionItem($element)) return '';

  const instruction = $element.find('.instruction').first().text().trim();
  if (instruction) return instruction;

  return normalizeText($element.text());
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

/** Includes `name` (for form controls); distinct from the shared getElementFingerprint in ../utils.ts. */
export function getFingerprint(
  $: cheerio.CheerioAPI,
  element: Element,
): string {
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
