import type { RecipeImage, RecipeSchema, StepImage } from './types.ts';
import { isRecord, isUsableImageUrl, normalizeUrl } from './utils.ts';
import { MAX_SCHEMA_RECURSION_DEPTH } from '../utils.ts';

export function extractSchemaMainImages(
  schema: RecipeSchema,
  pageUrl: string,
): RecipeImage[] {
  const imageValues = extractImageUrlsFromUnknown(schema.image, pageUrl).filter(
    isUsableImageUrl,
  );

  return imageValues.map((url, index) => ({
    url,
    source: 'schema-main',
    score: 1_000 - index,
  }));
}

export function extractSchemaStepImages(
  schema: RecipeSchema,
  pageUrl: string,
): StepImage[] {
  const steps = flattenSchemaInstructions(schema.recipeInstructions);

  const rawStepImages = steps.flatMap((step, stepIndex) => {
    const urls = extractImageUrlsFromUnknown(step.image, pageUrl).filter(
      isUsableImageUrl,
    );

    return urls.map((url) => ({
      url,
      source: 'schema-step' as const,
      score: 900,
      stepIndex,
    }));
  });

  const uniqueImages = new Map<string, StepImage>();

  for (const image of rawStepImages) {
    uniqueImages.set(`${image.stepIndex}:${image.url}`, image);
  }

  return [...uniqueImages.values()];
}

function flattenSchemaInstructions(value: unknown, depth = 0): RecipeSchema[] {
  if (depth > MAX_SCHEMA_RECURSION_DEPTH) {
    return [];
  }

  if (!value) {
    return [];
  }

  if (typeof value === 'string') {
    return [{ text: value }];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => flattenSchemaInstructions(item, depth + 1));
  }

  if (!isRecord(value)) {
    return [];
  }

  const type = getSchemaType(value);

  if (type.includes('HowToSection')) {
    return flattenSchemaInstructions(
      value.itemListElement ??
        value.recipeInstructions ??
        value.steps ??
        value.itemList,
      depth + 1,
    );
  }

  if (
    type.includes('HowToStep') ||
    typeof value.text === 'string' ||
    value.image !== undefined
  ) {
    return [value];
  }

  return [];
}

function getSchemaType(value: Record<string, unknown>): string[] {
  const type = value['@type'];

  if (typeof type === 'string') {
    return [type];
  }

  if (Array.isArray(type)) {
    return type.filter((item): item is string => typeof item === 'string');
  }

  return [];
}

function extractImageUrlsFromUnknown(
  value: unknown,
  pageUrl: string,
): string[] {
  if (typeof value === 'string') {
    const url = normalizeUrl(value, pageUrl);

    return url ? [url] : [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => extractImageUrlsFromUnknown(item, pageUrl));
  }

  if (!isRecord(value)) {
    return [];
  }

  return [value.url, value.contentUrl, value.thumbnailUrl, value.image].flatMap(
    (item) => extractImageUrlsFromUnknown(item, pageUrl),
  );
}
