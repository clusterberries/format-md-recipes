import type {
  ExtractedImage,
  ExtractedIngredient,
  ReconciledRecipe,
} from './types.ts';
import { convertRecipeHtmlToMarkdown } from './markdown-converter.ts';

export type RecipeMarkdownOptions = {
  imagePosition?: 'top' | 'bottom';
};

export function renderRecipeMarkdown(
  recipe: ReconciledRecipe,
  options: RecipeMarkdownOptions = {},
): string {
  const imagePosition = options.imagePosition ?? 'bottom';
  const sections: string[] = [];
  const title = recipe.title.value ?? 'Recipe';
  const mainImage = recipe.mainImage
    ? renderImage(recipe.mainImage, 'Recipe image')
    : '';

  if (imagePosition === 'top' && mainImage) sections.push(mainImage);
  sections.push(`# ${escapeHeading(title)}`);

  const description = recipe.description.value
    ? convertRecipeHtmlToMarkdown(recipe.description.value)
    : '';
  if (description) sections.push(description);

  const metadata = renderMetadata(recipe);
  if (metadata) sections.push(metadata);

  const ingredients = renderIngredients(recipe.ingredients.value);
  if (ingredients) sections.push(ingredients);

  const instructions = renderInstructions(recipe.instructions.value);
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
  const lines = [
    formatMetadataLine('Servings', recipe.servings.value),
    formatMetadataLine('Preparation time', recipe.prepTime.value),
    formatMetadataLine('Cooking time', recipe.cookTime.value),
    formatMetadataLine('Total time', recipe.totalTime.value),
  ].filter(Boolean);

  return lines.length ? `## Metadata\n\n${lines.join('\n')}` : '';
}

function formatMetadataLine(label: string, value: string | null): string {
  return value ? `- ${label}: ${escapeListText(value)}` : '';
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
): string {
  if (!instructions.length) return '';

  const lines: string[] = ['## Instructions'];
  instructions.forEach((instruction, index) => {
    lines.push(`${index + 1}. ${escapeListText(instruction.text)}`);
    if (instruction.image) {
      lines.push('', `   ${renderImage(instruction.image, `Step ${instruction.stepIndex + 1}`)}`);
    }
  });

  return lines.join('\n');
}

function renderImage(image: ExtractedImage, fallbackAlt: string): string {
  const alt = (image.alt || fallbackAlt).replace(/[\[\]]/g, '').trim();
  return `![${alt}](${image.url})`;
}

function escapeHeading(value: string): string {
  return value.replace(/\r?\n/g, ' ').replace(/^#+\s*/, '').trim();
}

function escapeListText(value: string): string {
  return value.replace(/\r?\n/g, ' ').replace(/^\s*[-*+]\s+/, '').trim();
}
