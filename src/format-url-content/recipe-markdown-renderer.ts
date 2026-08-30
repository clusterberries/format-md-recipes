import type {
  ExtractedImage,
  ExtractedIngredient,
  ReconciledRecipe,
} from './types.ts';
import { convertRecipeHtmlToMarkdown } from './markdown-converter.ts';

export type RecipeMarkdownOptions = {
  imagePosition?: 'top' | 'bottom';
  includeStepImages?: boolean;
};

export function renderRecipeMarkdown(
  recipe: ReconciledRecipe,
  options: RecipeMarkdownOptions = {},
): string {
  const imagePosition = options.imagePosition ?? 'top';
  const includeStepImages = options.includeStepImages ?? true;
  const language = getLanguage(recipe.sourceMetadata.language);
  const sections: string[] = [];
  const title = recipe.title.value ?? 'Recipe';
  const mainImage = recipe.mainImage
    ? renderImage(
        recipe.mainImage,
        language === 'ru' ? 'Изображение рецепта' : 'Recipe image',
        language,
      )
    : '';

  sections.push(`# ${escapeHeading(title)}`);
  if (imagePosition === 'top' && mainImage) sections.push(mainImage);

  const description = recipe.description.value
    ? convertRecipeHtmlToMarkdown(recipe.description.value)
    : '';
  if (description) sections.push(description);

  const metadata = renderMetadata(recipe);
  if (metadata) sections.push(metadata);

  const ingredients = renderIngredients(recipe.ingredients.value);
  if (ingredients) sections.push(ingredients);

  const instructions = renderInstructions(
    recipe.instructions.value,
    language,
    includeStepImages,
  );
  if (instructions) sections.push(instructions);

  if (recipe.notes.length) {
    const notes = recipe.notes
      .map((note) => convertRecipeHtmlToMarkdown(note.value))
      .filter(Boolean)
      .join('\n\n');
    if (notes) sections.push(`## Notes\n\n${notes}`);
  }

  if (imagePosition === 'bottom' && mainImage) sections.push(mainImage);

  return sections.filter(Boolean).join('\n\n').trim();
}

function renderMetadata(recipe: ReconciledRecipe): string {
  const lang = getLanguage(recipe.sourceMetadata.language);
  const labels = getMetadataLabels(lang);
  const lines = [
    formatMetadataLine(labels.servings, recipe.servings.value),
    formatMetadataLine(labels.preparationTime, recipe.prepTime.value),
    formatMetadataLine(labels.cookingTime, recipe.cookTime.value),
    formatMetadataLine(labels.totalTime, recipe.totalTime.value),
  ].filter(Boolean);

  return lines.length ? `## Metadata\n\n${lines.join('\n')}` : '';
}

function formatMetadataLine(label: string, value: string | null): string {
  return value ? `- ${label}: ${escapeListText(value)}` : '';
}

export function getLanguage(language: string | null): 'ru' | 'en' {
  return language?.toLowerCase().startsWith('ru') ? 'ru' : 'en';
}

function getMetadataLabels(language: 'ru' | 'en'): {
  servings: string;
  preparationTime: string;
  cookingTime: string;
  totalTime: string;
} {
  if (language === 'ru') {
    return {
      servings: 'Порции',
      preparationTime: 'Время подготовки',
      cookingTime: 'Время приготовления',
      totalTime: 'Общее время',
    };
  }

  return {
    servings: 'Servings',
    preparationTime: 'Preparation time',
    cookingTime: 'Cooking time',
    totalTime: 'Total time',
  };
}

function renderIngredients(ingredients: ExtractedIngredient[]): string {
  if (!ingredients.length) return '';

  const lines: string[] = ['## Ingredients'];
  let currentGroup: string | undefined;

  for (const ingredient of ingredients) {
    if (ingredient.group && ingredient.group !== currentGroup) {
      lines.push('', `### ${escapeHeading(ingredient.group)}`);
      currentGroup = ingredient.group;
    }
    lines.push(`- ${escapeListText(ingredient.text)}`);
  }

  return lines.join('\n');
}

function renderInstructions(
  instructions: ReconciledRecipe['instructions']['value'],
  language: 'ru' | 'en' = 'en',
  includeStepImages = true,
): string {
  if (!instructions.length) return '';

  const lines: string[] = ['## Instructions'];
  instructions.forEach((instruction, index) => {
    lines.push(`${index + 1}. ${escapeListText(instruction.text)}`);
    if (includeStepImages && instruction.image) {
      const fallbackAlt =
        language === 'ru'
          ? `Шаг ${instruction.stepIndex + 1}`
          : `Step ${instruction.stepIndex + 1}`;
      lines.push(
        '',
        `   ${renderImage(instruction.image, fallbackAlt, language)}`,
      );
    }
  });

  return lines.join('\n');
}

export function renderImage(
  image: ExtractedImage,
  fallbackAlt: string,
  language: 'ru' | 'en' = 'en',
): string {
  const actualFallback =
    language === 'ru' ? 'Изображение рецепта' : 'Recipe image';
  let altSource =
    image.role === 'main'
      ? fallbackAlt || actualFallback
      : image.alt && !/^metadata\./i.test(image.alt)
        ? image.alt
        : fallbackAlt || actualFallback;
  if (
    image.role === 'main' &&
    /^(?:Фото\s*(?:к рецепту|рецепта)?|Photo\s*(?:to recipe)?|Image\s*(?:recipe)?)/i.test(
      altSource.trim(),
    )
  ) {
    altSource = fallbackAlt || actualFallback;
  }
  const alt = altSource.replace(/[[\]]/g, '').trim();
  return `![${alt}](${image.url})`;
}

function escapeHeading(value: string): string {
  return value
    .replace(/\r?\n/g, ' ')
    .replace(/^#+\s*/, '')
    .trim();
}

function escapeListText(value: string): string {
  return value
    .replace(/\r?\n/g, ' ')
    .replace(/^\s*[-*+]\s+/, '')
    .trim();
}
