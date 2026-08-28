import { writeFile } from '../shared/file-utils.ts';
import type { CliOptions } from './types.ts';
import { logInfo, logSuccess, logWarning } from '../shared/utils.ts';
import { parseRecipePage } from './page-parser.ts';
import { cleanRecipeContent } from './html-cleaner/index.ts';
import { renderRecipeMarkdown } from './recipe-markdown-renderer.ts';
import { resolveRecipeConflicts } from './ai-conflict-resolver.ts';

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
      // TODO: contentHtml is only used for the empty-content check below; the
      // final markdown is built from aiResult.recipe, not this cleaned HTML.
      const contentHtml = cleanRecipeContent(
        originalContentHtml,
        'recipe-only',
      )?.trim();

      const hasRecipeSchema =
        content.recipe && Object.keys(content.recipe).length > 0;
      const hasRecipeCandidate = content.sources.candidates.length > 0;

      if (!contentHtml && !hasRecipeSchema && !hasRecipeCandidate) {
        logWarning(`No content or recipe schema found for ${inputUrl}.`);
        return;
      }

      const images = content.sources.images;

      logInfo(
        options.mainImageOnly
          ? 'Image mode: main image only (step images skipped, main image at bottom).'
          : 'Image mode: all images (main image after title, step images inline).',
      );
      const markdown = renderRecipeMarkdown(aiResult.recipe, {
        imagePosition: options.mainImageOnly ? 'bottom' : 'top',
        includeStepImages: !options.mainImageOnly,
      });

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
              content: markdown ? `${markdown?.slice(0, 100)}...` : null, // Log the first 100 characters of the content
            },
            null,
            2,
          ),
        );
      }
    }
  } catch (error: any) {
    throw new Error(`Error formatting ${inputUrl}: ${error.message}`);
  }
}
