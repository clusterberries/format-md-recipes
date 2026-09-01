import { hasNoise } from '../utils.ts';

const MAIN_IMAGE_PATTERN =
  /\b(hero|featured|feature|cover|main|lead|primary|recipe-image|recipe-photo|post-thumbnail|wp-post-image|dish)\b/i;

const SCHEMA_IMAGE_PROP_BONUS = 90;
const MAIN_IMAGE_PATTERN_BONUS = 45;
const RECIPE_ALT_TEXT_BONUS = 35;
const EARLY_DOCUMENT_POSITION_THRESHOLD = 3;
const EARLY_DOCUMENT_POSITION_BONUS = 15;
const LARGE_IMAGE_AREA_THRESHOLD = 250_000;
const LARGE_IMAGE_BONUS = 30;
const MEDIUM_IMAGE_AREA_THRESHOLD = 80_000;
const MEDIUM_IMAGE_BONUS = 15;
const TINY_IMAGE_AREA_THRESHOLD = 4_096;
const TINY_IMAGE_PENALTY = 100;
const STEP_IMAGE_BONUS = 25;
const NOISE_PENALTY = 150;

export function scoreHtmlImage(params: {
  isSchemaImageProp: boolean;
  imageDescription: string;
  alt?: string | undefined;
  stepIndex?: number | undefined;
  documentIndex: number;
  width?: number | undefined;
  height?: number | undefined;
}): number {
  const {
    isSchemaImageProp,
    imageDescription,
    alt,
    stepIndex,
    documentIndex,
    width,
    height,
  } = params;
  let score = 0;

  if (isSchemaImageProp) score += SCHEMA_IMAGE_PROP_BONUS;
  if (MAIN_IMAGE_PATTERN.test(imageDescription))
    score += MAIN_IMAGE_PATTERN_BONUS;
  if (stepIndex === undefined && /recipe|рецепт/i.test(alt ?? ''))
    score += RECIPE_ALT_TEXT_BONUS;
  if (documentIndex < EARLY_DOCUMENT_POSITION_THRESHOLD)
    score += EARLY_DOCUMENT_POSITION_BONUS;

  if (width && height) {
    const area = width * height;

    if (area >= LARGE_IMAGE_AREA_THRESHOLD) score += LARGE_IMAGE_BONUS;
    else if (area >= MEDIUM_IMAGE_AREA_THRESHOLD) score += MEDIUM_IMAGE_BONUS;
    else if (area < TINY_IMAGE_AREA_THRESHOLD) score -= TINY_IMAGE_PENALTY;
  }

  if (stepIndex !== undefined) score += STEP_IMAGE_BONUS;
  if (hasNoise(imageDescription)) score -= NOISE_PENALTY;

  return score;
}
