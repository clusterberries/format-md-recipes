import * as cheerio from 'cheerio';
import type { HtmlImageCandidate } from '../types.ts';
import { parseDimension } from '../utils.ts';
import { normalizeText } from '../../utils.ts';
import { extractHtmlImageUrl } from './url-extractor.ts';
import {
  findStepContainers,
  findStepIndex,
  inferStepIndexFromText,
} from './step-detector.ts';
import { getImageFingerprint, shouldDiscardHtmlImage } from './fingerprint.ts';
import { scoreHtmlImage } from './scorer.ts';

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
      inferStepIndexFromText(alt, $(image).attr('title')) ??
      findStepIndex($, image, stepContainers);
    const imageDescription = `${fingerprint} ${alt ?? ''}`;
    const score = scoreHtmlImage({
      isSchemaImageProp: $(image).is('[itemprop="image"]'),
      imageDescription,
      alt,
      stepIndex,
      documentIndex,
      width,
      height,
    });

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

function deduplicateHtmlCandidates(
  candidates: HtmlImageCandidate[],
): HtmlImageCandidate[] {
  const byLocation = new Map<string, HtmlImageCandidate>();
  for (const candidate of candidates) {
    const key = `${candidate.url}:${candidate.stepIndex ?? 'main'}`;
    const existing = byLocation.get(key);
    if (!existing || candidate.score > existing.score)
      byLocation.set(key, candidate);
  }
  return [...byLocation.values()].sort(
    (a, b) => a.documentIndex - b.documentIndex,
  );
}
