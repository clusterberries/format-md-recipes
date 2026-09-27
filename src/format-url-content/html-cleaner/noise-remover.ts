import type { Cheerio, CheerioAPI } from 'cheerio';
import type { Element } from 'domhandler';
import { ElementType } from 'domelementtype';
import {
  GLOBAL_NOISE_SELECTOR,
  MAX_RECIPE_TEXT_LENGTH,
  MINIMAL_NOISE_PATTERN,
  RECIPE_COMPONENT_SELECTOR,
  RECIPE_PROTECTION_SELECTOR,
} from './constants.ts';
import { getElementFingerprint, normalizeText } from '../utils/dom-helpers.ts';

const NAMED_NOISE_ATTRIBUTE_SELECTOR =
  '[id], [class], [data-testid], [data-test], [role]';
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

export function removeNamedNoise($: CheerioAPI, root: Cheerio<Element>): void {
  root.find(NAMED_NOISE_ATTRIBUTE_SELECTOR).each((_, el) => {
    const $element = $(el);
    if (shouldProtectRecipeElement($element)) return;
    if (MINIMAL_NOISE_PATTERN.test(getElementFingerprint($, el)))
      $element.remove();
  });
}

/** Protect nodes that explicitly contain recipe components from noise removal. */
export function shouldProtectRecipeElement(
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
