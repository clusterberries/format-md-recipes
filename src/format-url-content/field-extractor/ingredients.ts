import type {
  ExtractedIngredient,
  ExtractedPageSources,
  FieldSource,
} from '../types.ts';
import { normalizeText } from '../utils.ts';
import { SOURCE_CONFIDENCE } from './constants.ts';

export function extractIngredients(
  sources: ExtractedPageSources,
): ExtractedIngredient[] {
  const ingredients: ExtractedIngredient[] = [];

  sources.jsonLd.forEach((recipe, recipeIndex) => {
    toStrings(recipe.recipeIngredient).forEach((text, index) => {
      if (!isLikelyIngredientText(text)) return;
      ingredients.push(
        createIngredient(
          text,
          'json-ld',
          `json-ld-${recipeIndex}.recipeIngredient[${index}]`,
        ),
      );
    });
  });

  sources.microdata.forEach((candidate) => {
    candidate.ingredients.forEach((text, index) => {
      if (!isLikelyIngredientText(text)) return;
      ingredients.push(
        createIngredient(
          text,
          'microdata',
          `${candidate.location}.ingredients[${index}]`,
        ),
      );
    });
  });

  sources.recipeHtml.forEach((candidate) => {
    candidate.ingredients.forEach((text, index) => {
      if (!isLikelyIngredientText(text)) return;
      ingredients.push(
        createIngredient(
          text,
          'html',
          `${candidate.location}.ingredients[${index}]`,
        ),
      );
    });
  });

  sources.forms
    .filter((value) =>
      /ingredient|ингредиент/i.test(`${value.label ?? ''} ${value.name ?? ''}`),
    )
    .forEach((value) => {
      if (!isLikelyIngredientText(value.value)) return;
      ingredients.push(createIngredient(value.value, 'form', value.location));
    });

  return deduplicateIngredients(ingredients);
}

function toStrings(value: unknown): string[] {
  if (typeof value === 'string') return value.trim() ? [value.trim()] : [];
  if (Array.isArray(value)) return value.flatMap(toStrings);
  return [];
}

function createIngredient(
  text: string,
  source: FieldSource,
  location: string,
): ExtractedIngredient {
  const normalized = text.replace(/\s+/g, ' ').trim();
  const parsed = parseIngredient(normalized);
  return {
    text: normalized,
    ...parsed,
    source,
    confidence: SOURCE_CONFIDENCE[source],
    location,
  };
}

function parseIngredient(
  text: string,
): Pick<ExtractedIngredient, 'quantity' | 'unit' | 'name'> {
  const quantityFirstMatch = text.match(
    /^((?:\d+[\d\s.,/-]*|[½⅓⅔¼¾]|по вкусу|по желанию)\s*)(г|гр|кг|мл|л|ч\. л\.|ст\. л\.|tsp|tbsp|g|kg|ml|l)?\s*(.*)$/i,
  );
  const nameFirstMatch = text.match(
    /^(.*?)\s*[-:]\s*((?:\d+[\d\s.,/-]*|[½⅓⅔¼¾]|по вкусу|по желанию)\s*)(г|гр|кг|мл|л|ч\. л\.|ст\. л\.|tsp|tbsp|g|kg|ml|l)?\s*$/i,
  );

  if (!quantityFirstMatch && !nameFirstMatch) {
    return text ? { name: text } : {};
  }

  const quantity = (
    nameFirstMatch ? nameFirstMatch[2] : quantityFirstMatch?.[1]
  )?.trim();
  const unit = (
    nameFirstMatch ? nameFirstMatch[3] : quantityFirstMatch?.[2]
  )?.trim();
  const name = (
    nameFirstMatch ? nameFirstMatch[1] : quantityFirstMatch?.[3]
  )?.trim();
  return {
    ...(quantity ? { quantity } : {}),
    ...(unit ? { unit } : {}),
    ...(name ? { name } : {}),
  };
}

function isLikelyIngredientText(value: string): boolean {
  const text = value.replace(/\s+/g, ' ').trim();
  if (!text || text.length < 2) return false;
  if (text.length > 200) return false;
  if (/^(?:порци(?:и|я|й)|servings?)/i.test(text)) return false;
  if (
    /^(?:гр|г|кг|шт|мл|л|с\.?л\.|ч\.?л\.|порци(?:и|я)|добавить|вкус|шаг|step|назад|далее)$/i.test(
      text,
    )
  )
    return false;
  if (/(?:kcal|kkal|ккал|калори(?:я|и|й))/i.test(text)) return false;
  if (
    /^(?:не выключать экран|выключать экран|подписаться|реклама|ждать|обновить|просто|subscribe|advertisement|do not turn off (?:the )?screen|keep (?:the )?screen on|wait|refresh|just)$/i.test(
      text,
    )
  )
    return false;
  if (/^\(.*\)$/i.test(text)) return false;
  if (/\b(?:гр|г|кг|шт|мл|л)\b/i.test(text) && text.split(/\s+/).length <= 2)
    return false;
  if (
    /\b(?:prep|cook|total)\s*time\b|время\s+(?:приготовления|подготовки)/i.test(
      text,
    )
  )
    return false;
  if (
    /^\d+\s*(?:ч\.?|час(?:а|ов)?|h(?:ours?)?)\s*\.?\s*\d*\s*(?:мин(?:ут(?:ы|а)?)?\.?|m(?:in(?:ute)?s?)?)?$/i.test(
      text,
    )
  )
    return false;
  if (
    /^\d+\s*(?:ч\.|час(?:а|ов)?|мин(?:ут(?:ы|а)?)?\.?|h|m(?:in)?)\s*\d*$/i.test(
      text,
    )
  )
    return false;
  return true;
}

function deduplicateIngredients(
  ingredients: ExtractedIngredient[],
): ExtractedIngredient[] {
  const seen = new Set<string>();
  return ingredients.filter((ingredient) => {
    const key = canonicalIngredientKey(ingredient.text);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function canonicalIngredientKey(value: string): string {
  return normalizeText(
    value.replace(/\s*[:\-–—]\s*/g, ' ').replace(/\s*\([^)]*\)/g, ' '),
  ).toLocaleLowerCase();
}
