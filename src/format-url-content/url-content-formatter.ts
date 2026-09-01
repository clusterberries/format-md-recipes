import { writeFile } from '../shared/file-utils.ts';
import type { CliOptions, ReconciledRecipe } from './types.ts';
import { logInfo, logSuccess, logWarning } from '../shared/utils.ts';
import { parseRecipePage } from './page-parser.ts';
import { cleanRecipeContent } from './html-cleaner/index.ts';
import { convertRecipeHtmlToMarkdown } from './markdown-converter.ts';
import {
  renderImage,
  renderRecipeMarkdown,
} from './recipe-markdown-renderer.ts';
import { getDefaultImageAlt, getLanguage } from './language.ts';
import { resolveRecipeConflicts } from './ai-conflict-resolver/index.ts';

export async function runUrlContentFormatter(options: CliOptions) {
  const { inputUrl, output } = options;

  try {
    const content = await parseRecipePage(inputUrl);

    if (options.noAi) {
      logInfo(
        'AI conflict resolution disabled (--no-ai). Using deterministic result.',
      );
    }
    const aiResult = options.noAi
      ? {
          recipe: content.reconciledRecipe,
          called: false,
          applied: false,
          reasons: [],
        }
      : await resolveRecipeConflicts(
          content.reconciledRecipe,
          content.sources.candidates,
        );

    if (content) {
      const originalContentHtml = content.article?.contentHtml?.trim() ?? '';
      const recipeIdentified =
        aiResult.recipe.ingredients.value.length > 0 &&
        aiResult.recipe.instructions.value.length > 0;

      const images = content.sources.images;
      const imagePosition = options.mainImageOnly ? 'bottom' : 'top';

      let markdown: string;
      if (recipeIdentified) {
        logInfo(
          options.mainImageOnly
            ? 'Image mode: main image only (step images skipped, main image at bottom).'
            : 'Image mode: all images (main image after title, step images inline).',
        );
        markdown = renderRecipeMarkdown(aiResult.recipe, {
          imagePosition,
          includeStepImages: !options.mainImageOnly,
        });
      } else {
        logInfo(
          'Could not identify recipe (missing ingredients/instructions). Falling back to cleaned page content.',
        );
        markdown = buildFallbackMarkdown(
          originalContentHtml,
          aiResult.recipe,
          content.article?.title ?? null,
          imagePosition,
        );

        if (!markdown) {
          logWarning(`No content or recipe found for ${inputUrl}.`);
          return;
        }
      }

      if (output) {
        if (!markdown) {
          logWarning(`Content is empty for ${inputUrl}.`);
        } else {
          await writeFile(output, markdown);
          logSuccess(`Saved to ${output}`);
        }
      } else {
        logSuccess('Output sent to stdout.');
        console.log(
          JSON.stringify(
            {
              recipe: content.recipe,
              title: content.article?.title ?? null,
              excerpt: content.article?.excerpt ?? null,
              images: images,
              candidates: content.sources.candidates,
              normalizedRecipe: content.normalizedRecipe,
              reconciledRecipe: aiResult.recipe,
              ai: aiResult,
              fallback: !recipeIdentified,
              content: markdown ? `${markdown?.slice(0, 100)}...` : null, // Log the first 100 characters of the content
            },
            null,
            2,
          ),
        );
      }
    }
  } catch (error) {
    throw new Error(
      `Error formatting ${inputUrl}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
}

function buildFallbackMarkdown(
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
