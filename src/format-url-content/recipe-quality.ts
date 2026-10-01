import type { ReconciledRecipe } from './types.ts';

const SCRIPT_PATTERN =
  /\b(?:window|document)\s*\.\s*[\w$]+|\badsbygoogle\b|<script\b/iu;
const STEP_MARKER_PATTERN = /(?:^|\s)(?:step|шаг)\s*\d+\b/giu;
const METADATA_LABEL_PATTERN =
  /(?:время приготовления|количество порций|калорийность|cooking time|number of servings|calories)\s*:/giu;

/** A malformed collection should be saved as page content, not as recipe steps. */
export function getRecipeQualityIssue(recipe: ReconciledRecipe): string | null {
  const ingredientText = recipe.ingredients.value.map((item) => item.text);
  const instructionText = recipe.instructions.value.map((item) => item.text);

  if (
    [...ingredientText, ...instructionText].some((text) =>
      SCRIPT_PATTERN.test(text),
    )
  )
    return 'extracted recipe text contains embedded script code';

  if (
    instructionText.some(
      (text) => [...text.matchAll(STEP_MARKER_PATTERN)].length > 1,
    )
  )
    return 'multiple numbered steps were collapsed into one instruction';

  if (
    instructionText.length === 1 &&
    [...instructionText[0]!.matchAll(METADATA_LABEL_PATTERN)].length > 1
  )
    return 'the only instruction contains page metadata instead of cooking directions';

  return null;
}
