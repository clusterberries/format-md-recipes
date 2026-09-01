import type { ReconciledRecipe } from '../types.ts';
import { cleanRecipeContent } from '../html-cleaner/index.ts';
import { convertRecipeHtmlToMarkdown } from './markdown-converter.ts';
import { renderImage } from './recipe-markdown-renderer.ts';
import { getDefaultImageAlt, getLanguage } from './language.ts';

export function buildFallbackMarkdown(
  originalContentHtml: string,
  recipe: ReconciledRecipe,
  articleTitle: string | null,
  imagePosition: 'top' | 'bottom',
): string {
  const cleanedHtml = cleanRecipeContent(
    originalContentHtml,
    'minimal',
  )?.trim();
  const title = articleTitle?.trim() || recipe.title.value || '';

  if (!cleanedHtml && !title && !recipe.mainImage) {
    return '';
  }

  const language = getLanguage(recipe.sourceMetadata.language);
  const mainImage = recipe.mainImage
    ? renderImage(recipe.mainImage, getDefaultImageAlt(language), language)
    : '';
  const body = cleanedHtml ? convertRecipeHtmlToMarkdown(cleanedHtml) : '';

  const sections: string[] = [];
  if (title) sections.push(`# ${title}`);
  if (imagePosition === 'top' && mainImage) sections.push(mainImage);
  if (body) sections.push(body);
  if (imagePosition === 'bottom' && mainImage) sections.push(mainImage);

  return sections.filter(Boolean).join('\n\n').trim();
}
