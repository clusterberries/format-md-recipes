import type {
  ExtractedImage,
  ExtractedIngredient,
  ReconciledRecipe,
} from '../types.ts';
import { convertRecipeHtmlToMarkdown } from './markdown-converter.ts';
import { getLanguage, type Language } from './language.ts';
import { markdownTexts } from './texts.ts';

export type RecipeMarkdownOptions = {
  imagePosition?: 'top' | 'bottom';
  includeStepImages?: boolean;
  imageDestinations?: ReadonlyMap<string, string>;
};

export function renderRecipeMarkdown(
  recipe: ReconciledRecipe,
  options: RecipeMarkdownOptions = {},
): string {
  const imagePosition = options.imagePosition ?? 'top';
  const includeStepImages = options.includeStepImages ?? true;
  const language = getLanguage(recipe.sourceMetadata.language);
  const texts = markdownTexts[language];
  const sections: string[] = [];
  const title = recipe.title.value ?? texts.recipe;
  const mainImage = recipe.mainImage
    ? renderImage(
        recipe.mainImage,
        texts.imageAlt,
        language,
        options.imageDestinations,
      )
    : '';

  sections.push(`# ${escapeHeading(title)}`);
  if (imagePosition === 'top' && mainImage) sections.push(mainImage);

  const description = recipe.description.value
    ? convertRecipeHtmlToMarkdown(recipe.description.value)
    : '';
  if (description) sections.push(description);

  const metadata = renderMetadata(recipe, texts);
  if (metadata) sections.push(metadata);

  const ingredients = renderIngredients(recipe.ingredients.value, texts);
  if (ingredients) sections.push(ingredients);

  const instructions = renderInstructions(
    recipe.instructions.value,
    language,
    texts,
    includeStepImages,
    options.imageDestinations,
  );
  if (instructions) sections.push(instructions);

  if (recipe.notes.length) {
    const notes = recipe.notes
      .map((note) => convertRecipeHtmlToMarkdown(note.value))
      .filter(Boolean)
      .join('\n\n');
    if (notes) sections.push(`## ${texts.sections.notes}\n\n${notes}`);
  }

  if (imagePosition === 'bottom' && mainImage) sections.push(mainImage);

  return sections.filter(Boolean).join('\n\n').trim();
}

function renderMetadata(
  recipe: ReconciledRecipe,
  texts: (typeof markdownTexts)[Language],
): string {
  const labels = texts.metadata;
  const lines = [
    formatMetadataLine(labels.servings, recipe.servings.value),
    formatMetadataLine(labels.preparationTime, recipe.prepTime.value),
    formatMetadataLine(labels.cookingTime, recipe.cookTime.value),
    formatMetadataLine(labels.totalTime, recipe.totalTime.value),
  ].filter(Boolean);

  return lines.length
    ? `## ${texts.sections.metadata}\n\n${lines.join('\n')}`
    : '';
}

function formatMetadataLine(label: string, value: string | null): string {
  return value ? `- ${label}: ${escapeListText(value)}` : '';
}

function renderIngredients(
  ingredients: ExtractedIngredient[],
  texts: (typeof markdownTexts)[Language],
): string {
  if (!ingredients.length) return '';

  const lines: string[] = [`## ${texts.sections.ingredients}`];
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
  language: Language,
  texts: (typeof markdownTexts)[Language],
  includeStepImages = true,
  imageDestinations?: ReadonlyMap<string, string>,
): string {
  if (!instructions.length) return '';

  const lines: string[] = [`## ${texts.sections.instructions}`];
  instructions.forEach((instruction, index) => {
    lines.push(`${index + 1}. ${escapeListText(instruction.text)}`);
    if (includeStepImages && instruction.image) {
      const fallbackAlt = texts.stepImageAlt(instruction.stepIndex + 1);
      lines.push(
        '',
        `   ${renderImage(instruction.image, fallbackAlt, language, imageDestinations)}`,
      );
    }
  });

  return lines.join('\n');
}

export function renderImage(
  image: ExtractedImage,
  fallbackAlt: string,
  language: Language = 'en',
  imageDestinations?: ReadonlyMap<string, string>,
): string {
  const actualFallback = markdownTexts[language].imageAlt;
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
  return `![${alt}](${imageDestinations?.get(image.url) ?? image.url})`;
}

function escapeHeading(value: string): string {
  return stripLeadingMarker(value, /^#+\s*/);
}

function escapeListText(value: string): string {
  return stripLeadingMarker(value, /^\s*[-*+]\s+/);
}

function stripLeadingMarker(value: string, leadingMarker: RegExp): string {
  return value.replace(/\r?\n/g, ' ').replace(leadingMarker, '').trim();
}
