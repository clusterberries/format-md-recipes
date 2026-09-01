import type * as cheerio from 'cheerio';
import type { RecipeSchema } from '../images-parser/types.ts';

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

function collectRecipeObjects(value: unknown, recipes: RecipeSchema[]): void {
  if (Array.isArray(value)) {
    value.forEach((item) => collectRecipeObjects(item, recipes));
    return;
  }

  if (!isRecord(value)) return;

  if (isRecipeType(value['@type'])) {
    recipes.push(value);
  }

  Object.values(value).forEach((child) => collectRecipeObjects(child, recipes));
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
