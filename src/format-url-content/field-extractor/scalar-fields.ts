import type { ExtractedField, FieldSource } from '../types.ts';
import type { RecipeSchema } from '../images-parser/types.ts';
import { SOURCE_CONFIDENCE } from './constants.ts';

export function fieldFromValue(
  value: unknown,
  source: FieldSource,
  location: string,
): ExtractedField<string>[] {
  if (typeof value !== 'string' && typeof value !== 'number') return [];
  const normalized = String(value).trim();
  if (!normalized) return [];
  return [
    {
      value: normalized,
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
    fieldFromValue(
      Array.isArray(recipe[property])
        ? recipe[property]
            .filter(
              (value: unknown) =>
                typeof value === 'string' || typeof value === 'number',
            )
            .join(', ')
        : recipe[property],
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
    return fieldFromValue(
      value,
      candidate.source,
      `${candidate.location}.${property}`,
    );
  });
}

// Case-sensitive on purpose: a capitalised name distinguishes "by Jane Doe" from "by the Sea".
const AUTHOR_AFTER_SEPARATOR_PATTERN = /\s*[,|·–—-]\s*(?:[Оо]т|[Bb]y)\s+.+$/u;
const AUTHOR_NAME_PATTERN =
  /\s+(?:[Оо]т|[Bb]y)\s+\p{Lu}[\p{L}.'’-]*(?:\s+(?:\p{Lu}[\p{L}.'’-]*|сайт|site)){0,2}$/u;
const SEO_DESCRIPTION_MAX_LENGTH = 300;

export function cleanRecipeTitle(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  const cleaned = value
    .replace(
      /\s*[-–—]\s*(?:.*(?:сайт|site)|рецепт(?:\s+с\s+фото)?(?:\s+пошагово)?|recipe(?:\s+with\s+photo)?(?:\s+step\s+by\s+step)?)\s*$/i,
      '',
    )
    .replace(AUTHOR_AFTER_SEPARATOR_PATTERN, '')
    .replace(AUTHOR_NAME_PATTERN, '')
    .trim();
  return cleaned || null;
}

export function cleanRecipeDescription(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  const text = value.replace(/\s+/g, ' ').trim();
  // Boilerplate is short; a long description that mentions photos is real content.
  const mayBeSeoBoilerplate = text.length <= SEO_DESCRIPTION_MAX_LENGTH;

  if (/^(?:как приготовить(?: блюдо)?|рецепт\s+|recipe\s+)/i.test(text)) {
    if (
      mayBeSeoBoilerplate &&
      /(?:пошагово|step[- ]?by[- ]?step|с фото|with photo)/i.test(text)
    ) {
      return null;
    }
    return text.replace(/^как приготовить блюдо\s+/i, '').trim() || null;
  }

  if (
    mayBeSeoBoilerplate &&
    /(?:пошаговый рецепт|поиск по ингредиентам|пошагово.*с фото)/i.test(text)
  ) {
    return null;
  }

  const cleaned = text
    .replace(
      /\s+(?:от автора|от\s+автора)\s+.*?(?:на сайте|on the site).*$/i,
      '',
    )
    // Only parentheses that advertise the site or photos, not "(serves 4)".
    .replace(
      /\s+\([^()]*(?:сайт|фото|рецепт|site|photo|recipe)[^()]*\)\s*$/i,
      '',
    )
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || null;
}
