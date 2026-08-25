import * as cheerio from 'cheerio';
import { Element } from 'domhandler';
import type { HtmlImageCandidate } from './types.ts';
import {
  hasNoise,
  isUsableImageUrl,
  normalizeText,
  normalizeUrl,
  parseDimension,
} from './utils.ts';

const IMAGE_URL_ATTRIBUTES = [
  'data-src',
  'data-lazy-src',
  'data-original',
  'data-fallback-src',
  'src',
] as const;

const IMAGE_SRCSET_ATTRIBUTES = ['data-srcset', 'data-lazy-srcset', 'srcset'] as const;
const MAIN_IMAGE_PATTERN =
  /\b(hero|featured|feature|cover|main|lead|primary|recipe-image|recipe-photo|post-thumbnail|wp-post-image|dish)\b/i;
const STEP_PATTERN =
  /\b(step|instruction|direction|method|preparation|howto|how-to|process|этап|шаг|инструкц|приготовлен)\b/i;

export function extractHtmlImages(
  $: cheerio.CheerioAPI,
  pageUrl: string,
): HtmlImageCandidate[] {
  const stepContainers = findStepContainers($);
  const candidates: HtmlImageCandidate[] = [];

  $('img').each((documentIndex, image) => {
    const url = extractHtmlImageUrl($, image, pageUrl);

    if (!url || shouldDiscardHtmlImage($, image, url)) {
      return;
    }

    const alt = normalizeText($(image).attr('alt') ?? '') || undefined;
    const fingerprint = getImageFingerprint($, image);
    const width = parseDimension($(image).attr('width'));
    const height = parseDimension($(image).attr('height'));
    const stepIndex =
      findStepIndex($, image, stepContainers) ??
      inferStepIndexFromText(alt, $(image).attr('title'));
    const imageDescription = `${fingerprint} ${alt ?? ''}`;
    let score = 0;

    if ($(image).is('[itemprop="image"]')) score += 90;
    if (MAIN_IMAGE_PATTERN.test(imageDescription)) score += 45;
    if (stepIndex === undefined && /recipe|рецепт/i.test(alt ?? '')) score += 35;
    if (documentIndex < 3) score += 15;

    if (width && height) {
      const area = width * height;

      if (area >= 250_000) score += 30;
      else if (area >= 80_000) score += 15;
      else if (area < 4_096) score -= 100;
    }

    if (stepIndex !== undefined) score += 25;
    if (hasNoise(imageDescription)) score -= 150;

    const candidate: HtmlImageCandidate = {
      url,
      source: 'html',
      score,
      documentIndex,
    };

    if (alt) candidate.alt = alt;
    if (stepIndex !== undefined) candidate.stepIndex = stepIndex;
    candidates.push(candidate);
  });

  return deduplicateHtmlCandidates(candidates);
}

function extractHtmlImageUrl(
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

function shouldDiscardHtmlImage($: cheerio.CheerioAPI, image: Element, url: string): boolean {
  const $image = $(image);
  const fingerprint = getImageFingerprint($, image);
  if (!isUsableImageUrl(url)) return true;
  if (hasNoise(fingerprint)) return true;

  const width = parseDimension($image.attr('width'));
  const height = parseDimension($image.attr('height'));
  return Boolean(width && height && width <= 32 && height <= 32);
}

function findStepContainers($: cheerio.CheerioAPI): Element[] {
  const containers = new Set<Element>();
  $('[itemtype*="HowToStep"]').each((_, element) => {
    containers.add(element);
  });

  $('[class], [id], [data-testid], [data-test]').each((_, element) => {
    const fingerprint = getElementFingerprint($, element);
    const $element = $(element);
    if (STEP_PATTERN.test(fingerprint) && $element.find('img').length > 0 && $element.text().trim().length > 20) {
      containers.add(element);
    }
  });

  $('li').each((_, element) => {
    const $item = $(element);
    const parentFingerprint = getElementFingerprint($, $item.parent().get(0));
    const grandParentFingerprint = getElementFingerprint($, $item.parent().parent().get(0));
    if (STEP_PATTERN.test(`${parentFingerprint} ${grandParentFingerprint}`) && $item.find('img').length > 0) {
      containers.add(element);
    }
  });

  const documentOrder = new Map<Element, number>();
  $('body *').each((index, element) => {
    documentOrder.set(element, index);
  });
  return [...containers].sort((a, b) => (documentOrder.get(a) ?? 0) - (documentOrder.get(b) ?? 0));
}

function findStepIndex($: cheerio.CheerioAPI, image: Element, stepContainers: Element[]): number | undefined {
  const ancestors = $(image).parents().toArray();
  for (let index = 0; index < stepContainers.length; index++) {
    const stepContainer = stepContainers[index];
    if (stepContainer && ancestors.includes(stepContainer)) return index;
  }
  return undefined;
}

function inferStepIndexFromText(alt?: string, title?: string): number | undefined {
  const match = `${alt ?? ''} ${title ?? ''}`.match(/(?:step|шаг)\s*[#№]?\s*(\d+)/i);
  if (!match) return undefined;
  const stepNumber = Number.parseInt(match[1] ?? '', 10);
  return Number.isInteger(stepNumber) && stepNumber > 0 ? stepNumber - 1 : undefined;
}

function deduplicateHtmlCandidates(candidates: HtmlImageCandidate[]): HtmlImageCandidate[] {
  const byLocation = new Map<string, HtmlImageCandidate>();
  for (const candidate of candidates) {
    const key = `${candidate.url}:${candidate.stepIndex ?? 'main'}`;
    const existing = byLocation.get(key);
    if (!existing || candidate.score > existing.score) byLocation.set(key, candidate);
  }
  return [...byLocation.values()].sort((a, b) => a.documentIndex - b.documentIndex);
}

function getImageFingerprint($: cheerio.CheerioAPI, image: Element): string {
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

function getElementFingerprint($: cheerio.CheerioAPI, element?: Element): string {
  if (!element) return '';
  const $element = $(element);
  return [
    $element.attr('id'),
    $element.attr('class'),
    $element.attr('data-testid'),
    $element.attr('data-test'),
    $element.attr('itemprop'),
    $element.attr('itemtype'),
    $element.attr('aria-label'),
  ].filter(Boolean).join(' ');
}