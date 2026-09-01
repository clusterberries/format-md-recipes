import type { CheerioAPI } from 'cheerio';
import type { Element } from 'domhandler';

/** Guards recursive JSON-LD schema traversal against circular/malformed page data. */
export const MAX_SCHEMA_RECURSION_DEPTH = 20;

export function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function getElementFingerprint(
  $: CheerioAPI,
  element?: Element,
): string {
  if (!element) {
    return '';
  }

  const $element = $(element);

  return [
    $element.attr('id'),
    $element.attr('class'),
    $element.attr('role'),
    $element.attr('data-testid'),
    $element.attr('data-test'),
    $element.attr('itemprop'),
    $element.attr('itemtype'),
    $element.attr('aria-label'),
  ]
    .filter(Boolean)
    .join(' ');
}

export function getLinkDensity($: CheerioAPI, element: Element): number {
  const $element = $(element);
  const textLength = normalizeText($element.text()).length;
  const linkTextLength = normalizeText($element.find('a').text()).length;

  return textLength ? linkTextLength / textLength : 0;
}

// Escapes a value for safe use inside a CSS attribute/id selector (CSS.escape-equivalent).
export function escapeCssSelectorValue(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, (char) => `\\${char}`);
}
