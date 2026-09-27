import type * as cheerio from 'cheerio';
import type { Element } from 'domhandler';
import { normalizeUrl } from '../utils.ts';

const IMAGE_URL_ATTRIBUTES = [
  'data-src',
  'data-lazy-src',
  'data-original',
  'data-fallback-src',
  'src',
] as const;

const IMAGE_SRCSET_ATTRIBUTES = [
  'data-srcset',
  'data-lazy-srcset',
  'srcset',
] as const;

export function extractHtmlImageUrl(
  $: cheerio.CheerioAPI,
  image: Element,
  pageUrl: string,
): string | undefined {
  const $image = $(image);

  // Responsive variants carry explicit sizes; single URLs may be thumbnails.
  for (const element of [
    $image,
    ...$image
      .closest('picture')
      .find('source')
      .toArray()
      .map((source) => $(source)),
  ]) {
    for (const attribute of IMAGE_SRCSET_ATTRIBUTES) {
      const url = selectBestSrcsetUrl(element.attr(attribute), pageUrl);
      if (url) return url;
    }
  }

  for (const attribute of IMAGE_URL_ATTRIBUTES) {
    const value = $image.attr(attribute);
    const url = value ? normalizeUrl(value, pageUrl) : undefined;
    if (url) return url;
  }

  return undefined;
}

function selectBestSrcsetUrl(
  srcset: string | undefined,
  pageUrl: string,
): string | undefined {
  let remaining = srcset ?? '';
  let bestUrl: string | undefined;
  let bestWeight = 0;

  // Read URLs before descriptors: commas can belong to URLs (including data URLs).
  while (remaining) {
    remaining = remaining.replace(/^[\s,]+/, '');
    const token = remaining.match(/^\S+/)?.[0];
    if (!token) break;
    remaining = remaining.slice(token.length);
    let descriptor = '1x';
    if (!token.endsWith(',')) {
      const separator = remaining.indexOf(',');
      descriptor =
        (separator < 0 ? remaining : remaining.slice(0, separator)).trim() ||
        '1x';
      remaining = separator < 0 ? '' : remaining.slice(separator + 1);
    }
    const weight = /^(?:\d+w|(?:\d*\.)?\d+x)$/.test(descriptor)
      ? Number.parseFloat(descriptor)
      : 0;
    const url = normalizeUrl(token.replace(/,+$/, ''), pageUrl);
    if (url && weight > bestWeight) {
      bestUrl = url;
      bestWeight = weight;
    }
  }
  return bestUrl;
}
