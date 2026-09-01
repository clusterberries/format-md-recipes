import type * as cheerio from 'cheerio';
import { Element } from 'domhandler';
import { hasNoise, isUsableImageUrl, parseDimension } from '../utils.ts';
import { getElementFingerprint } from '../../utils.ts';

export function getImageFingerprint(
  $: cheerio.CheerioAPI,
  image: Element,
): string {
  const $image = $(image);
  const closestElement = $image.closest('figure, picture, a, li, div').get(0);

  return [
    getElementFingerprint($, image),
    getElementFingerprint($, $image.parent().get(0)),
    getElementFingerprint(
      $,
      closestElement instanceof Element ? closestElement : undefined,
    ),
    $image.attr('alt'),
    $image.attr('title'),
  ]
    .filter(Boolean)
    .join(' ');
}

export function shouldDiscardHtmlImage(
  $: cheerio.CheerioAPI,
  image: Element,
  url: string,
): boolean {
  const $image = $(image);
  const fingerprint = getImageFingerprint($, image);
  if (!isUsableImageUrl(url)) return true;
  if (hasNoise(fingerprint)) return true;

  const width = parseDimension($image.attr('width'));
  const height = parseDimension($image.attr('height'));
  return Boolean(width && height && width <= 32 && height <= 32);
}
