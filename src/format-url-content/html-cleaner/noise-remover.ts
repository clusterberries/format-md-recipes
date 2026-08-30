import type { Cheerio, CheerioAPI } from 'cheerio';
import type { Element } from 'domhandler';
import { ElementType } from 'domelementtype';
import {
  BRANDING_IMAGE_SELECTOR,
  GLOBAL_NOISE_SELECTOR,
  MAX_RECIPE_TEXT_LENGTH,
  MINIMAL_NOISE_PATTERN,
  NOISE_TEXT_PATTERN,
  RECIPE_ONLY_BLOCK_TEXT_PATTERN,
  RECIPE_ONLY_NOISE_PATTERN,
  RECIPE_ONLY_STRUCTURAL_NOISE_SELECTOR,
  RECIPE_COMPONENT_SELECTOR,
  RECIPE_PROTECTION_SELECTOR,
} from './constants.ts';
import { getFingerprint, getLinkDensity, normalizeText } from './utils.ts';
import type { CleanupMode } from './types.ts';

const NAMED_NOISE_ATTRIBUTE_SELECTOR =
  '[id], [class], [data-testid], [data-test], [role]';
const TEXT_NOISE_ELEMENT_SELECTOR =
  'p, div, section, span, h2, h3, h4, h5, h6, header';
const NOISE_HEADING_SELECTOR = 'h2, h3, h4, h5, h6, header';
const NOISE_CONTAINER_SELECTOR = 'div, section, article';
const HIGH_LINK_DENSITY = 0.55;
const MINIMUM_LINKED_TEXT_LENGTH = 25;
const NOISE_HEADING_PATTERN =
  /^(автор|поддержать|запланировать|рейтинг|эмоции)$/i;
const RECIPE_INGREDIENT_HEADING_PATTERN = /\b(ingredients?|ингредиенты?)\b/i;
const RECIPE_INSTRUCTION_HEADING_PATTERN =
  /\b(instructions?|directions?|method|steps?|приготовление|инструкции|шаги)\b/i;

export function removeHtmlComments(root: Cheerio<Element>): void {
  root
    .add(root.find('*'))
    .contents()
    .filter((_, node) => node.type === ElementType.Comment)
    .remove();
}

export function removeGlobalNoise(root: Cheerio<Element>): void {
  root.find(GLOBAL_NOISE_SELECTOR).remove();
}

export function removeNamedNoise(
  $: CheerioAPI,
  root: Cheerio<Element>,
  cleanupMode: CleanupMode,
): void {
  const pattern =
    cleanupMode === 'recipe-only'
      ? RECIPE_ONLY_NOISE_PATTERN
      : MINIMAL_NOISE_PATTERN;

  if (cleanupMode === 'recipe-only') {
    removeBrandingImages($, root);

    root.find(RECIPE_ONLY_STRUCTURAL_NOISE_SELECTOR).each((_, el) => {
      const $element = $(el);

      if (!shouldProtectRecipeElement($, $element)) {
        $element.remove();
      }
    });
  }

  root.find(NAMED_NOISE_ATTRIBUTE_SELECTOR).each((_, el) => {
    const $element = $(el);

    if (shouldProtectRecipeElement($, $element)) {
      return;
    }

    const fingerprint = getFingerprint($, el);

    if (pattern.test(fingerprint)) {
      $element.remove();
    }
  });
}

export function removeNoiseByText(
  $: CheerioAPI,
  root: Cheerio<Element>,
  cleanupMode: CleanupMode,
): void {
  if (cleanupMode !== 'recipe-only') {
    return;
  }

  root.find(TEXT_NOISE_ELEMENT_SELECTOR).each((_, el) => {
    const $element = $(el);

    if (shouldProtectRecipeElement($, $element)) {
      return;
    }

    const text = normalizeText($element.text());

    if (!text || text.length > MAX_RECIPE_TEXT_LENGTH) {
      return;
    }

    const hasHighLinkDensity = getLinkDensity($, $element) > HIGH_LINK_DENSITY;
    const hasRecipeOnlyNoiseText = RECIPE_ONLY_BLOCK_TEXT_PATTERN.test(text);

    if (
      NOISE_TEXT_PATTERN.test(text) ||
      hasRecipeOnlyNoiseText ||
      (hasHighLinkDensity && text.length >= MINIMUM_LINKED_TEXT_LENGTH)
    ) {
      const isNoiseHeading =
        $element.is(NOISE_HEADING_SELECTOR) || NOISE_HEADING_PATTERN.test(text);
      const $container = isNoiseHeading
        ? $element.closest(NOISE_CONTAINER_SELECTOR).first()
        : $element;

      if ($container.length && $container.get(0) !== root.get(0)) {
        $container.remove();
      }
    }
  });
}

/** Protect nodes that explicitly contain recipe components from noise removal. */
export function shouldProtectRecipeElement(
  $: CheerioAPI,
  $element: Cheerio<Element>,
): boolean {
  if ($element.is(RECIPE_PROTECTION_SELECTOR)) {
    return true;
  }

  if ($element.find(RECIPE_COMPONENT_SELECTOR).length > 0) {
    return true;
  }

  const text = normalizeText($element.text()).slice(0, MAX_RECIPE_TEXT_LENGTH);
  const containsIngredientHeading =
    RECIPE_INGREDIENT_HEADING_PATTERN.test(text);
  const containsInstructionHeading =
    RECIPE_INSTRUCTION_HEADING_PATTERN.test(text);
  const hasList = $element.find('li').length >= 2;

  return hasList && (containsIngredientHeading || containsInstructionHeading);
}

function removeBrandingImages($: CheerioAPI, root: Cheerio<Element>): void {
  root.find(BRANDING_IMAGE_SELECTOR).each((_, el) => {
    const $image = $(el);
    const $link = $image.closest('a');

    if (
      $link.length &&
      $link
        .find('img')
        .toArray()
        .every((image) => $(image).is(BRANDING_IMAGE_SELECTOR)) &&
      !normalizeText($link.clone().find('img').remove().end().text())
    ) {
      $link.remove();
    } else {
      $image.remove();
    }
  });
}
