import type { Cheerio, CheerioAPI } from 'cheerio';
import type { Element } from 'domhandler';
import { ElementType } from 'domelementtype';
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
import { getElementFingerprint, normalizeText } from '../utils.ts';

const ROOT_CANDIDATE_ATTRIBUTE_SELECTOR =
  '[id], [class], [data-testid], [data-test]';
const RECIPE_HEADINGS_SELECTOR = 'h1, h2, h3';
const ROOT_RECIPE_NOISE_SELECTOR = 'nav, footer, aside, [role="navigation"]';

const MINIMUM_CANDIDATE_TEXT_LENGTH = 80;
const TOO_SHORT_TEXT_SCORE = -100;
const MAX_LINK_DENSITY = 0.65;
const MEDIUM_LINK_DENSITY = 0.4;
const MAX_LINK_DENSITY_PENALTY = 120;
const MEDIUM_LINK_DENSITY_PENALTY = 50;
const MINIMAL_NOISE_PENALTY = 160;
const ROOT_NOISE_PENALTY = 250;

// Semantic-tag bonuses: <article>/<main>/[role=main] are the strongest structural hints.
const ARTICLE_TAG_BONUS = 50;
const MAIN_TAG_BONUS = 45;
const MAIN_ROLE_BONUS = 45;
// Recipe microdata is a near-certain signal, so it outweighs every other bonus combined.
const RECIPE_MICRODATA_BONUS = 180;
const RECIPE_WORDS_BONUS = 70;
const H1_BONUS = 35;

const HEADING_SCORE_PER_ITEM = 8;
const HEADING_SCORE_CAP = 32;
const PARAGRAPH_SCORE_PER_ITEM = 2;
const PARAGRAPH_SCORE_CAP = 24;
const LIST_ITEM_SCORE_PER_ITEM = 3;
const LIST_ITEM_SCORE_CAP = 60;
const ORDERED_LIST_SCORE_PER_ITEM = 12;
const ORDERED_LIST_SCORE_CAP = 36;
const IMAGE_SCORE_PER_ITEM = 2;
const IMAGE_SCORE_CAP = 16;
const TEXT_LENGTH_SCORE_DIVISOR = 100;
const TEXT_LENGTH_SCORE_CAP = 80;

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
    return $('body')
      .first()
      .filter(() => false);
  }

  const ancestors = ingredient.parents().filter((_, element) => {
    if (element.type !== ElementType.Tag) {
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
      if (element.type === ElementType.Tag) {
        candidates.add(element);
      }
    });
  }

  $(ROOT_CANDIDATE_ATTRIBUTE_SELECTOR).each((_, element) => {
    if (element.type !== ElementType.Tag) {
      return;
    }

    const fingerprint = getElementFingerprint($, element);

    if (RECIPE_SIGNAL_PATTERN.test(fingerprint)) {
      candidates.add(element);
    }
  });

  return candidates;
}

function scoreCandidate($: CheerioAPI, $candidate: Cheerio<Element>): number {
  const text = normalizeText($candidate.text());
  const textLength = text.length;

  if (textLength < MINIMUM_CANDIDATE_TEXT_LENGTH) {
    return TOO_SHORT_TEXT_SCORE;
  }

  const fingerprint = getElementFingerprint($, $candidate.get(0));
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

  if (tagName === 'article') score += ARTICLE_TAG_BONUS;
  if (tagName === 'main') score += MAIN_TAG_BONUS;
  if ($candidate.is('[role="main"]')) score += MAIN_ROLE_BONUS;

  if (hasRecipeMicrodata) score += RECIPE_MICRODATA_BONUS;
  if (hasRecipeWords) score += RECIPE_WORDS_BONUS;

  if ($candidate.find('h1').length) score += H1_BONUS;
  score += Math.min(headingCount * HEADING_SCORE_PER_ITEM, HEADING_SCORE_CAP);
  score += Math.min(
    paragraphCount * PARAGRAPH_SCORE_PER_ITEM,
    PARAGRAPH_SCORE_CAP,
  );
  score += Math.min(
    listItemCount * LIST_ITEM_SCORE_PER_ITEM,
    LIST_ITEM_SCORE_CAP,
  );
  score += Math.min(
    orderedListCount * ORDERED_LIST_SCORE_PER_ITEM,
    ORDERED_LIST_SCORE_CAP,
  );
  score += Math.min(imageCount * IMAGE_SCORE_PER_ITEM, IMAGE_SCORE_CAP);
  score += Math.min(
    textLength / TEXT_LENGTH_SCORE_DIVISOR,
    TEXT_LENGTH_SCORE_CAP,
  );

  if (linkDensity > MAX_LINK_DENSITY) score -= MAX_LINK_DENSITY_PENALTY;
  else if (linkDensity > MEDIUM_LINK_DENSITY) {
    score -= MEDIUM_LINK_DENSITY_PENALTY;
  }

  if (MINIMAL_NOISE_PATTERN.test(fingerprint)) score -= MINIMAL_NOISE_PENALTY;
  if ($candidate.is(ROOT_RECIPE_NOISE_SELECTOR)) score -= ROOT_NOISE_PENALTY;

  return score;
}
