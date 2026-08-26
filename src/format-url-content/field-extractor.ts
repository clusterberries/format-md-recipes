import type {
  ExtractedField,
  ExtractedImage,
  ExtractedIngredient,
  ExtractedInstruction,
  ExtractedPageSources,
  FieldSource,
  NormalizedRecipe,
  PageMetadata,
  RecipeSchema,
  SourceMetadata,
} from './types.ts';
import type { RecipeImage } from './images-parser/types.ts';

const SOURCE_CONFIDENCE: Record<FieldSource, number> = {
  'json-ld': 0.9,
  microdata: 0.85,
  html: 0.8,
  form: 0.7,
  readability: 0.6,
  metadata: 0.5,
};

export function extractNormalizedRecipe(
  sources: ExtractedPageSources,
  sourceMetadata: SourceMetadata,
): NormalizedRecipe {
  const title = [
    ...sources.jsonLd.flatMap((recipe, index) =>
      fieldFromValue<string>(recipe.name, 'json-ld', `json-ld-${index}.name`),
    ),
    ...sources.microdata.flatMap((candidate) =>
      fieldFromValue<string>(candidate.title, 'microdata', candidate.location),
    ),
    ...sources.recipeHtml.flatMap((candidate) =>
      fieldFromValue<string>(candidate.title, 'html', candidate.location),
    ),
    ...fieldFromValue<string>(
      sources.readability?.title,
      'readability',
      'readability.title',
    ),
    ...fieldFromValue<string>(sources.metadata.title, 'metadata', 'metadata.title'),
  ];
  const description = [
    ...sources.jsonLd.flatMap((recipe, index) =>
      fieldFromValue<string>(
        recipe.description,
        'json-ld',
        `json-ld-${index}.description`,
      ),
    ),
    ...fieldFromValue<string>(
      sources.metadata.description,
      'metadata',
      'metadata.description',
    ),
    ...fieldFromValue<string>(
      sources.readability?.excerpt,
      'readability',
      'readability.excerpt',
    ),
  ];

  const normalized: NormalizedRecipe = {
    title,
    description,
    servings: extractSchemaField(sources.jsonLd, 'recipeYield', 'servings'),
    prepTime: extractSchemaField(sources.jsonLd, 'prepTime', 'prepTime'),
    cookTime: extractSchemaField(sources.jsonLd, 'cookTime', 'cookTime'),
    totalTime: extractSchemaField(sources.jsonLd, 'totalTime', 'totalTime'),
    ingredients: extractIngredients(sources),
    instructions: extractInstructions(sources),
    mainImage: null,
    stepImages: [],
    galleryImages: [],
    notes: [],
    sourceMetadata,
  };

  const images = extractImages(sources.images, sources.metadata);
  normalized.mainImage = images.mainImage;
  normalized.stepImages = images.stepImages;
  normalized.galleryImages = images.galleryImages;
  normalized.instructions = normalized.instructions.map((instruction) => {
    const image = normalized.stepImages.find(
      (candidate) => candidate.stepIndex === instruction.stepIndex,
    );
    return image ? { ...instruction, image } : instruction;
  });

  return normalized;
}

function extractIngredients(sources: ExtractedPageSources): ExtractedIngredient[] {
  const ingredients: ExtractedIngredient[] = [];

  sources.jsonLd.forEach((recipe, recipeIndex) => {
    toStrings(recipe.recipeIngredient).forEach((text, index) => {
      if (!isLikelyIngredientText(text)) return;
      ingredients.push(createIngredient(text, 'json-ld', `json-ld-${recipeIndex}.recipeIngredient[${index}]`));
    });
  });

  sources.microdata.forEach((candidate) => {
    candidate.ingredients.forEach((text, index) => {
      if (!isLikelyIngredientText(text)) return;
      ingredients.push(createIngredient(text, 'microdata', `${candidate.location}.ingredients[${index}]`));
    });
  });

  sources.recipeHtml.forEach((candidate) => {
    candidate.ingredients.forEach((text, index) => {
      if (!isLikelyIngredientText(text)) return;
      ingredients.push(createIngredient(text, 'html', `${candidate.location}.ingredients[${index}]`));
    });
  });

  sources.forms
    .filter((value) => /ingredient|ингредиент/i.test(`${value.label ?? ''} ${value.name ?? ''}`))
    .forEach((value) => {
      if (!isLikelyIngredientText(value.value)) return;
      ingredients.push(createIngredient(value.value, 'form', value.location));
    });

  return deduplicateIngredients(ingredients);
}

function extractInstructions(sources: ExtractedPageSources): ExtractedInstruction[] {
  const instructions: ExtractedInstruction[] = [];

  sources.jsonLd.forEach((recipe, recipeIndex) => {
    flattenInstructions(recipe.recipeInstructions).forEach((text, index) => {
      instructions.push(createInstruction(text, index, 'json-ld', `json-ld-${recipeIndex}.recipeInstructions[${index}]`));
    });
  });

  [...sources.microdata, ...sources.recipeHtml].forEach((candidate) => {
      candidate.instructions.forEach((text, index) => {
      instructions.push(createInstruction(text, index, candidate.source, `${candidate.location}.instructions[${index}]`));
    });
  });

  return instructions.filter((instruction) => instruction.text.length > 0);
}

function extractSchemaField(
  recipes: RecipeSchema[],
  property: string,
  fieldName: string,
): ExtractedField<string>[] {
  return recipes.flatMap((recipe, index) =>
     fieldFromValue<string>(recipe[property], 'json-ld', `json-ld-${index}.${fieldName}`),
  );
}

function fieldFromValue<T>(
  value: unknown,
  source: FieldSource,
  location: string,
): ExtractedField<T>[] {
  if (typeof value !== 'string' && typeof value !== 'number') return [];
  const normalized = String(value).trim();
  if (!normalized) return [];
  return [{
    value: normalized as T,
    source,
    confidence: SOURCE_CONFIDENCE[source],
    location,
    originalValue: value,
  }];
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

function createInstruction(
  text: string,
  stepIndex: number,
  source: FieldSource,
  location: string,
): ExtractedInstruction {
  return {
    text: normalizeInstructionText(text),
    stepIndex,
    source,
    confidence: SOURCE_CONFIDENCE[source],
    location,
  };
}

function normalizeInstructionText(value: string): string {
  return value
    .replace(/<img\b[^>]*>/gi, ' ')
    .replace(/<\/?(?:picture|source)\b[^>]*>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseIngredient(
  text: string,
): Pick<ExtractedIngredient, 'quantity' | 'unit' | 'name'> {
  const quantityFirstMatch = text.match(
    /^((?:\d+[\d\s.,\/-]*|[½⅓⅔¼¾]|по вкусу|по желанию)\s*)(г|гр|кг|мл|л|ч\. л\.|ст\. л\.|tsp|tbsp|g|kg|ml|l)?\s*(.*)$/i,
  );
  const nameFirstMatch = text.match(
    /^(.*?)\s*[-:]\s*((?:\d+[\d\s.,\/-]*|[½⅓⅔¼¾]|по вкусу|по желанию)\s*)(г|гр|кг|мл|л|ч\. л\.|ст\. л\.|tsp|tbsp|g|kg|ml|l)?\s*$/i,
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
  if (/(?:kcal|kkal|ккал|калори(?:я|и|й))/i.test(text)) return false;
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

function extractImages(
  images: ExtractedPageSources['images'],
  metadata: PageMetadata,
): {
  mainImage: ExtractedImage | null;
  stepImages: ExtractedImage[];
  galleryImages: ExtractedImage[];
} {
  const mainImage = images.mainImage
    ? toExtractedImage(images.mainImage, 'main', 'images.mainImage')
    : metadata.openGraphImage
      ? toExtractedImage(
          { url: metadata.openGraphImage, source: 'metadata', score: 500 },
          'main',
          'metadata.openGraphImage',
        )
      : null;
  const stepImages = images.stepImages.map((image) =>
    toExtractedImage(image, 'step', `images.stepImages[${image.stepIndex}]`),
  );
  const galleryImages = images.htmlCandidates
    .filter(
      (image) =>
        image.url !== mainImage?.url &&
        !stepImages.some((step) => step.url === image.url),
    )
    .map((image) =>
      toExtractedImage(image, 'gallery', `images.htmlCandidates[${image.url}]`),
    );
  return { mainImage, stepImages, galleryImages };
}

function toExtractedImage(
  image: RecipeImage,
  role: ExtractedImage['role'],
  location: string,
): ExtractedImage {
  const extracted: ExtractedImage = {
    url: image.url,
    source: image.source,
    confidence: Math.max(0, Math.min(1, image.score / 1000)),
    location,
    role,
  };
  if (image.alt) extracted.alt = image.alt;
  if ('stepIndex' in image && typeof image.stepIndex === 'number')
    extracted.stepIndex = image.stepIndex;
  if (image.isFallback) extracted.isFallback = true;
  if (image.fallbackReason) extracted.fallbackReason = image.fallbackReason;
  return extracted;
}

function toStrings(value: unknown): string[] {
  if (typeof value === 'string') return value.trim() ? [value.trim()] : [];
  if (Array.isArray(value)) return value.flatMap(toStrings);
  return [];
}

function flattenInstructions(value: unknown): string[] {
  if (typeof value === 'string') return value.trim() ? [value.trim()] : [];
  if (Array.isArray(value)) return value.flatMap(flattenInstructions);
  if (typeof value !== 'object' || value === null) return [];
  const item = value as Record<string, unknown>;
  if (typeof item.text === 'string') return [item.text];
  return flattenInstructions(
    item.itemListElement ?? item.steps ?? item.recipeInstructions,
  );
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
  return value
    .replace(/\s*[:\-–—]\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase();
}