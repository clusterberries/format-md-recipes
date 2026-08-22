import type { Cheerio, CheerioAPI } from 'cheerio';
import type { Element } from 'domhandler';
import {
  MAIN_CONTENT_SELECTOR,
  MINIMAL_NOISE_PATTERN,
  RECIPE_COMPONENT_SELECTOR,
  RECIPE_INGREDIENT_SELECTOR,
  RECIPE_INSTRUCTION_SELECTOR,
  RECIPE_ROOT_SELECTOR,
  RECIPE_ROOT_SCORE_SELECTOR,
  RECIPE_SIGNAL_TEXT_LENGTH,
  RECIPE_SIGNAL_PATTERN,
} from './constants.ts';
import { getFingerprint, normalizeText } from './utils.ts';

const ROOT_CANDIDATE_ATTRIBUTE_SELECTOR =
  '[id], [class], [data-testid], [data-test]';
const RECIPE_HEADINGS_SELECTOR = 'h1, h2, h3';
const ROOT_RECIPE_NOISE_SELECTOR = 'nav, footer, aside, [role="navigation"]';

const MINIMUM_CANDIDATE_TEXT_LENGTH = 80;
const MAX_LINK_DENSITY = 0.65;
const MEDIUM_LINK_DENSITY = 0.4;
const MAX_LINK_DENSITY_PENALTY = 120;
const MEDIUM_LINK_DENSITY_PENALTY = 50;
const MINIMAL_NOISE_PENALTY = 160;
const ROOT_NOISE_PENALTY = 250;

/** Find the most likely container for the primary recipe content. */
export function findMainContentRoot($: CheerioAPI): Cheerio<Element> {
  const fallback = $('body').first();
  const semanticRoot = findSemanticRecipeRoot($);

  if (semanticRoot.length) {
    return semanticRoot;
  }

  const candidates = collectRootCandidates($);
  let bestRoot = fallback;
  let bestScore = scoreCandidate($, fallback);

  for (const candidate of candidates) {
    const $candidate = $(candidate);
    const score = scoreCandidate($, $candidate);

    if (score > bestScore) {
      bestScore = score;
      bestRoot = $candidate;
    }
  }

  return bestRoot;
}

function findSemanticRecipeRoot($: CheerioAPI): Cheerio<Element> {
  const recipeRoot = $(RECIPE_ROOT_SELECTOR).first();

  if (recipeRoot.length) {
    return recipeRoot;
  }

  const ingredient = $(RECIPE_INGREDIENT_SELECTOR).first();
  const instruction = $(RECIPE_INSTRUCTION_SELECTOR).first();

  if (!ingredient.length || !instruction.length) {
    return $('body').first().filter(() => false);
  }

  const ancestors = ingredient.parents().filter((_, element) => {
    if (element.type !== 'tag') {
      return false;
    }

    const $ancestor = $(element);

    return (
      $ancestor.find(RECIPE_INGREDIENT_SELECTOR).length > 0 &&
      $ancestor.find(RECIPE_INSTRUCTION_SELECTOR).length > 0
    );
  });

  return ancestors.first().length ? ancestors.first() : $('body').first();
}

function collectRootCandidates($: CheerioAPI): Set<Element> {
  const candidates = new Set<Element>();

  for (const selector of MAIN_CONTENT_SELECTOR) {
    $(selector).each((_, element) => {
      if (element.type === 'tag') {
        candidates.add(element);
      }
    });
  }

  $(ROOT_CANDIDATE_ATTRIBUTE_SELECTOR).each((_, element) => {
    if (element.type !== 'tag') {
      return;
    }

    const fingerprint = getFingerprint($, element);

    if (RECIPE_SIGNAL_PATTERN.test(fingerprint)) {
      candidates.add(element);
    }
  });

  return candidates;
}

function scoreCandidate(
  $: CheerioAPI,
  $candidate: Cheerio<Element>,
): number {
  const text = normalizeText($candidate.text());
  const textLength = text.length;

  if (textLength < MINIMUM_CANDIDATE_TEXT_LENGTH) {
    return -100;
  }

  const fingerprint = getFingerprint($, $candidate.get(0));
  const tagName = $candidate.get(0)?.tagName?.toLowerCase();
  const headingCount = $candidate.find(RECIPE_HEADINGS_SELECTOR).length;
  const paragraphCount = $candidate.find('p').length;
  const listItemCount = $candidate.find('li').length;
  const orderedListCount = $candidate.find('ol').length;
  const imageCount = $candidate.find('img').length;
  const hasRecipeMicrodata =
    $candidate.is(RECIPE_ROOT_SCORE_SELECTOR) ||
    $candidate.find(RECIPE_COMPONENT_SELECTOR).length > 0;
  const hasRecipeWords = RECIPE_SIGNAL_PATTERN.test(
    `${fingerprint} ${text.slice(0, RECIPE_SIGNAL_TEXT_LENGTH)}`,
  );
  const linkTextLength = normalizeText($candidate.find('a').text()).length;
  const linkDensity = textLength ? linkTextLength / textLength : 1;

  let score = 0;

  if (tagName === 'article') score += 50;
  if (tagName === 'main') score += 45;
  if ($candidate.is('[role="main"]')) score += 45;

  if (hasRecipeMicrodata) score += 180;
  if (hasRecipeWords) score += 70;

  if ($candidate.find('h1').length) score += 35;
  score += Math.min(headingCount * 8, 32);
  score += Math.min(paragraphCount * 2, 24);
  score += Math.min(listItemCount * 3, 60);
  score += Math.min(orderedListCount * 12, 36);
  score += Math.min(imageCount * 2, 16);
  score += Math.min(textLength / 100, 80);

  if (linkDensity > MAX_LINK_DENSITY) score -= MAX_LINK_DENSITY_PENALTY;
  else if (linkDensity > MEDIUM_LINK_DENSITY) {
    score -= MEDIUM_LINK_DENSITY_PENALTY;
  }

  if (MINIMAL_NOISE_PATTERN.test(fingerprint)) score -= MINIMAL_NOISE_PENALTY;
  if ($candidate.is(ROOT_RECIPE_NOISE_SELECTOR)) score -= ROOT_NOISE_PENALTY;

  return score;
}