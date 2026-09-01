import { writeFile } from '../shared/file-utils.ts';
import type {
  CliOptions,
  ParsedRecipePage,
  ReconciledRecipe,
} from './types.ts';
import type { AiResolutionResult } from './ai-conflict-resolver/types.ts';
import { logInfo, logSuccess, logWarning } from '../shared/utils.ts';
import { parseRecipePage } from './parser/page-parser.ts';
import { renderRecipeMarkdown } from './markdown/recipe-markdown-renderer.ts';
import { buildFallbackMarkdown } from './markdown/fallback-markdown.ts';
import { resolveRecipeConflicts } from './ai-conflict-resolver/index.ts';

export async function runUrlContentFormatter(options: CliOptions) {
  const { inputUrl, noAi, mainImageOnly } = options;

  try {
    const pageContent = await parseRecipePage(inputUrl);
    const aiResult = await resolveConflicts(pageContent, noAi);
    const markdown = generateMarkdown(
      pageContent,
      aiResult.recipe,
      mainImageOnly,
    );

    if (!markdown) {
      logWarning(`No content or recipe found for ${inputUrl}.`);
      return;
    }

    await handleOutput(options, pageContent, aiResult, markdown);
  } catch (error) {
    throw new Error(
      `Error formatting ${inputUrl}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
}

async function resolveConflicts(
  content: ParsedRecipePage,
  noAi: boolean,
): Promise<AiResolutionResult> {
  if (noAi) {
    logInfo(
      'AI conflict resolution disabled (--no-ai). Using deterministic result.',
    );
    return {
      recipe: content.reconciledRecipe,
      called: false,
      applied: false,
      reasons: [],
    };
  }

  return resolveRecipeConflicts(
    content.reconciledRecipe,
    content.sources.candidates,
  );
}

function generateMarkdown(
  content: ParsedRecipePage,
  recipe: ReconciledRecipe,
  mainImageOnly: boolean,
): string {
  const originalContentHtml = content.article?.contentHtml?.trim() ?? '';
  const recipeIdentified =
    recipe.ingredients.value.length > 0 && recipe.instructions.value.length > 0;
  const imagePosition = mainImageOnly ? 'bottom' : 'top';

  if (recipeIdentified) {
    logInfo(
      mainImageOnly
        ? 'Image mode: main image only (step images skipped, main image at bottom).'
        : 'Image mode: all images (main image after title, step images inline).',
    );
    return renderRecipeMarkdown(recipe, {
      imagePosition,
      includeStepImages: !mainImageOnly,
    });
  }

  logInfo(
    'Could not identify recipe (missing ingredients/instructions). Falling back to cleaned page content.',
  );
  return buildFallbackMarkdown(
    originalContentHtml,
    recipe,
    content.article?.title ?? null,
    imagePosition,
  );
}

async function handleOutput(
  options: CliOptions,
  content: ParsedRecipePage,
  aiResult: AiResolutionResult,
  markdown: string,
) {
  const { output } = options;
  const recipeIdentified =
    aiResult.recipe.ingredients.value.length > 0 &&
    aiResult.recipe.instructions.value.length > 0;

  if (output) {
    await writeFile(output, markdown);
    logSuccess(`Saved to ${output}`);
  } else {
    logSuccess('Output sent to stdout.');
    console.log(
      JSON.stringify(
        {
          recipe: content.recipe,
          title: content.article?.title ?? null,
          excerpt: content.article?.excerpt ?? null,
          images: content.sources.images,
          candidates: content.sources.candidates,
          normalizedRecipe: content.normalizedRecipe,
          reconciledRecipe: aiResult.recipe,
          ai: aiResult,
          fallback: !recipeIdentified,
          content: markdown ? `${markdown.slice(0, 100)}...` : null,
        },
        null,
        2,
      ),
    );
  }
}
