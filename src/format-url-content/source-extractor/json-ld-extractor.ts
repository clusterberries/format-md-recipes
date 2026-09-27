import type * as cheerio from 'cheerio';
import type { RecipeSchema } from '../images-parser/types.ts';
import { MAX_SCHEMA_RECURSION_DEPTH } from '../utils/dom-helpers.ts';
import { flattenSchemaInstructions } from '../utils/schema-instructions.ts';

export function extractJsonLdRecipes($: cheerio.CheerioAPI): RecipeSchema[] {
  const recipes: RecipeSchema[] = [];

  $('script[type="application/ld+json"]').each((_, script) => {
    const text = $(script).text().trim();
    if (!text) return;

    try {
      collectRecipeObjects(JSON.parse(text), recipes);
    } catch {
      // Ignore malformed JSON-LD and continue with the other sources.
    }
  });

  return deduplicateRecipeObjects(recipes);
}

function collectRecipeObjects(
  value: unknown,
  recipes: RecipeSchema[],
  depth = 0,
): void {
  if (depth > MAX_SCHEMA_RECURSION_DEPTH) return;
  if (Array.isArray(value)) {
    value.forEach((item) => collectRecipeObjects(item, recipes, depth + 1));
    return;
  }

  if (!isRecord(value)) return;

  if (isRecipeType(value['@type'])) {
    recipes.push(value);
  }

  Object.values(value).forEach((child) =>
    collectRecipeObjects(child, recipes, depth + 1),
  );
}

/** Select an entire entity; never mix fields or images from different recipes. */
export function selectJsonLdRecipe(
  recipes: RecipeSchema[],
  pageUrl: string,
  canonicalUrl: string | null,
): RecipeSchema | undefined {
  const pageUrls = new Set(
    [pageUrl, canonicalUrl]
      .map((url) => documentUrl(url, pageUrl))
      .filter(Boolean),
  );
  return recipes
    .map((recipe) => {
      const matchesPage = [
        recipe.url,
        recipe['@id'],
        recipe.mainEntityOfPage,
      ].some((value) => {
        const url = isRecord(value) ? (value['@id'] ?? value.url) : value;
        return pageUrls.has(documentUrl(url, pageUrl));
      });
      const ingredients = Array.isArray(recipe.recipeIngredient)
        ? recipe.recipeIngredient.filter(
            (value) => typeof value === 'string' && value.trim(),
          ).length
        : typeof recipe.recipeIngredient === 'string' &&
            recipe.recipeIngredient.trim()
          ? 1
          : 0;
      const instructions = flattenSchemaInstructions(
        recipe.recipeInstructions,
      ).filter(
        (step) => typeof step.text === 'string' && step.text.trim(),
      ).length;
      return {
        recipe,
        matchesPage,
        complete: ingredients > 0 && instructions > 0,
        size: ingredients + instructions,
      };
    })
    .sort(
      (a, b) =>
        Number(b.matchesPage) - Number(a.matchesPage) ||
        Number(b.complete) - Number(a.complete) ||
        b.size - a.size,
    )[0]?.recipe;
}

function documentUrl(value: unknown, baseUrl: string): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value, baseUrl);
    url.hash = '';
    return url.href;
  } catch {
    return null;
  }
}

function isRecipeType(type: unknown): boolean {
  const values =
    typeof type === 'string' ? [type] : Array.isArray(type) ? type : [];
  return values.some(
    (value) =>
      typeof value === 'string' &&
      value.split(/[/:]/).at(-1)?.toLowerCase() === 'recipe',
  );
}

function isRecord(value: unknown): value is RecipeSchema {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function deduplicateRecipeObjects(recipes: RecipeSchema[]): RecipeSchema[] {
  const seen = new Set<string>();
  return recipes.filter((recipe) => {
    const key = JSON.stringify(recipe);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
