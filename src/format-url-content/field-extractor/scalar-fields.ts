import type { ExtractedField, FieldSource } from '../types.ts';
import type { RecipeSchema } from '../images-parser/types.ts';
import { SOURCE_CONFIDENCE } from './constants.ts';

export function fieldFromValue<T>(
  value: unknown,
  source: FieldSource,
  location: string,
): ExtractedField<T>[] {
  if (typeof value !== 'string' && typeof value !== 'number') return [];
  const normalized = String(value).trim();
  if (!normalized) return [];
  return [
    {
      value: normalized as T,
      source,
      confidence: SOURCE_CONFIDENCE[source],
      location,
      originalValue: value,
    },
  ];
}

export function extractSchemaField(
  recipes: RecipeSchema[],
  property: string,
  fieldName: string,
): ExtractedField<string>[] {
  return recipes.flatMap((recipe, index) =>
    fieldFromValue<string>(
      recipe[property],
      'json-ld',
      `json-ld-${index}.${fieldName}`,
    ),
  );
}

export function extractCandidateMetaFields(
  candidates: Array<{
    source: FieldSource;
    location: string;
    servings?: string | null;
    prepTime?: string | null;
    cookTime?: string | null;
    totalTime?: string | null;
  }>,
  property: 'servings' | 'prepTime' | 'cookTime' | 'totalTime',
): ExtractedField<string>[] {
  return candidates.flatMap((candidate) => {
    const value = candidate[property];
    if (typeof value !== 'string' || !value.trim()) return [];
    return fieldFromValue<string>(
      value,
      candidate.source,
      `${candidate.location}.${property}`,
    );
  });
}

export function cleanRecipeTitle(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  const cleaned = value
    .replace(/\s+(?:от|by)\s+.+$/i, '')
    .replace(
      /\s*[-–—]\s*(?:.*(?:сайт|site)|рецепт(?:\s+с\s+фото)?(?:\s+пошагово)?|recipe(?:\s+with\s+photo)?(?:\s+step\s+by\s+step)?)\s*$/i,
      '',
    )
    .trim();
  return cleaned || null;
}

export function cleanRecipeDescription(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  const text = value.replace(/\s+/g, ' ').trim();
  if (/^(?:как приготовить(?: блюдо)?|рецепт\s+|recipe\s+)/i.test(text)) {
    const withoutLead = text
      .replace(/^(?:как приготовить блюдо\s+|рецепт\s+|recipe\s+)/i, '')
      .trim();
    if (!withoutLead) return null;
    if (/(?:пошагово|step[- ]?by[- ]?step|с фото|with photo)/i.test(text)) {
      return null;
    }
    return withoutLead;
  }

  if (
    /(?:пошаговый рецепт|поиск по ингредиентам|пошагово.*с фото)/i.test(text)
  ) {
    return null;
  }

  const cleaned = text
    .replace(
      /\s+(?:от автора|от\s+автора)\s+.*?(?:на сайте|on the site).*$/i,
      '',
    )
    .replace(/\s+\(.*?\)\s*$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || null;
}
