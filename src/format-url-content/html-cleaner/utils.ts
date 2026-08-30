import type { CheerioAPI } from 'cheerio';
import type { Element } from 'domhandler';

export function getFingerprint($: CheerioAPI, element?: Element): string {
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
    $element.attr('aria-label'),
  ]
    .filter(Boolean)
    .join(' ');
}

export function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function getLinkDensity(
  $: CheerioAPI,
  element: ReturnType<CheerioAPI>,
): number {
  const textLength = normalizeText(element.text()).length;
  const linkTextLength = normalizeText(element.find('a').text()).length;

  return textLength ? linkTextLength / textLength : 0;
}

export function normalizeHtml(html: string): string {
  return html
    .replace(/>\s+</g, '><')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
