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

  for (const attribute of IMAGE_URL_ATTRIBUTES) {
    const value = $image.attr(attribute);
    const url = value ? normalizeUrl(value, pageUrl) : undefined;
    if (url) return url;
  }

  for (const attribute of IMAGE_SRCSET_ATTRIBUTES) {
    const srcsetUrl = selectBestSrcsetUrl($image.attr(attribute));
    if (srcsetUrl) return normalizeUrl(srcsetUrl, pageUrl);
  }

  const $picture = $image.closest('picture');
  if (!$picture.length) return undefined;

  for (const source of $picture.find('source').toArray()) {
    const $source = $(source);
    for (const attribute of IMAGE_SRCSET_ATTRIBUTES) {
      const srcsetUrl = selectBestSrcsetUrl($source.attr(attribute));
      if (srcsetUrl) return normalizeUrl(srcsetUrl, pageUrl);
    }
  }

  return undefined;
}

function selectBestSrcsetUrl(srcset?: string): string | undefined {
  if (!srcset?.trim()) return undefined;

  const variants = srcset
    .split(',')
    .map((item) => item.trim())
    .map((item) => {
      const [url, descriptor = '1x'] = item.split(/\s+/, 2);
      const weight = Number.parseFloat(descriptor);
      return { url, weight: Number.isFinite(weight) ? weight : 1 };
    })
    .filter((item) => Boolean(item.url))
    .sort((a, b) => b.weight - a.weight);

  return variants[0]?.url;
}
