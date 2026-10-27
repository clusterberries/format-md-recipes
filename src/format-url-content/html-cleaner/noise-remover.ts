import type { Cheerio, CheerioAPI } from 'cheerio';
import type { Element } from 'domhandler';
import { ElementType } from 'domelementtype';
import {
  GLOBAL_NOISE_SELECTOR,
  MAX_RECIPE_TEXT_LENGTH,
  MIN_WRAPPER_FORM_TEXT_LENGTH,
  MINIMAL_NOISE_PATTERN,
  RECIPE_COMPONENT_SELECTOR,
  RECIPE_PROTECTION_SELECTOR,
} from './constants.ts';
import { getElementFingerprint, normalizeText } from '../utils/dom-helpers.ts';

const NAMED_NOISE_ATTRIBUTE_SELECTOR =
  '[id], [class], [data-testid], [data-test], [role]';
const FORM_CONTROL_SELECTOR =
  'script, style, input, button, select, textarea, option';
const FORM_CONTENT_SELECTOR =
  'main, article, [role="main"], [itemtype*="Recipe"], [itemprop="recipeIngredient"], [itemprop="recipeInstructions"]';
const RECIPE_INGREDIENT_HEADING_PATTERN =
  /(?<![\p{L}\p{N}])(?:ingredients?|ингредиент\p{L}*)(?![\p{L}\p{N}])/iu;
const RECIPE_INSTRUCTION_HEADING_PATTERN =
  /(?<![\p{L}\p{N}])(?:instructions?|directions?|method|steps?|(?:приготовлени|инструкци|шаг)\p{L}*)(?![\p{L}\p{N}])/iu;

/**
 * Some sites (e.g. ASP.NET WebForms) wrap the whole page in one <form>. Such forms become plain
 * containers so the hard removal of forms does not delete the content; search, comment and
 * newsletter forms stay removable.
 */
export function convertContentFormsToContainers($: CheerioAPI): void {
  $('form').each((_, form) => {
    const $form = $(form);
    const $withoutControls = $form.clone();
    $withoutControls.find(FORM_CONTROL_SELECTOR).remove();
    const hasPageContent =
      normalizeText($withoutControls.text()).length >=
        MIN_WRAPPER_FORM_TEXT_LENGTH ||
      $form.find(FORM_CONTENT_SELECTOR).length > 0;

    if (hasPageContent) form.tagName = 'div';
  });
}

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
