import { writeFileAtomically } from './utils/atomic-file.ts';
import {
  collectRenderedImages,
  downloadRecipeImages,
} from './image-downloader.ts';
import type {
  CliOptions,
  ParsedRecipePage,
  ReconciledRecipe,
} from './types.ts';
import type { AiResolutionResult } from './ai-conflict-resolver/types.ts';
import { logInfo, logProgress, logSuccess, logWarning } from './logger.ts';
import { parseRecipePage } from './parser/page-parser.ts';
import { renderRecipeMarkdown } from './markdown/recipe-markdown-renderer.ts';
import { buildFallbackMarkdown } from './markdown/fallback-markdown.ts';
import { getLanguage } from './markdown/language.ts';
import { markdownTexts } from './markdown/texts.ts';
import { resolveRecipeConflicts } from './ai-conflict-resolver/index.ts';
import { getRecipeQualityIssue } from './recipe-quality.ts';

export async function runUrlContentFormatter(
  options: CliOptions,
  saveResult?: (
    title: string,
    renderForOutput: (output: string) => Promise<string>,
  ) => Promise<void>,
) {
  const { inputUrl, noAi, mainImageOnly } = options;

  try {
    if (options.downloadImages && !options.output && !saveResult) {
      throw new Error('Downloading images requires an output path.');
    }
    let imageFailures = 0;
    const pageContent = await parseRecipePage(inputUrl);
    const aiResolution = await resolveConflicts(pageContent, noAi);
    const qualityIssue =
      !aiResolution.fallbackReason && isRecipeIdentified(aiResolution.recipe)
        ? getRecipeQualityIssue(aiResolution.recipe)
        : null;
    const aiResult: AiResolutionResult = qualityIssue
      ? { ...aiResolution, fallbackReason: qualityIssue }
      : aiResolution;
    const structuredRecipe =
      isRecipeIdentified(aiResult.recipe) && !aiResult.fallbackReason;
    if (structuredRecipe) {
      logInfo(
        mainImageOnly
          ? 'Image mode: main image only (step images skipped, main image at bottom).'
          : 'Image mode: all images (main image after title, step images inline).',
      );
    } else if (aiResult.fallbackReason) {
      logWarning(
        `Falling back to cleaned page content: ${aiResult.fallbackReason}.`,
      );
    } else {
      logInfo(
        'Could not identify recipe (missing ingredients/instructions). Falling back to cleaned page content.',
      );
    }
    const markdown = generateMarkdown(
      pageContent,
      aiResult.recipe,
      mainImageOnly,
      structuredRecipe,
      Boolean(aiResult.fallbackReason),
    );

    if (!markdown) {
      if (saveResult) throw new Error('No content or recipe found.');
      logWarning(`No content or recipe found for ${inputUrl}.`);
      return;
    }

    const renderForOutput = async (output: string): Promise<string> => {
      if (!options.downloadImages) return markdown;
      const images = collectRenderedImages(
        aiResult.recipe,
        structuredRecipe && !mainImageOnly,
      );
      const { destinations, failed } = await downloadRecipeImages(
        images,
        output,
        options.imagesFolder,
      );
      imageFailures = failed;
      return generateMarkdown(
        pageContent,
        aiResult.recipe,
        mainImageOnly,
        structuredRecipe,
        Boolean(aiResult.fallbackReason),
        destinations,
      );
    };
    if (saveResult) {
      await saveResult(
        (structuredRecipe
          ? aiResult.recipe.title.value
          : pageContent.article?.title || aiResult.recipe.title.value) ?? '',
        renderForOutput,
      );
    } else {
      await handleOutput(
        options,
        pageContent,
        aiResult,
        structuredRecipe,
        options.output ? await renderForOutput(options.output) : markdown,
      );
    }
    return { imageFailures };
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

  if (!isRecipeIdentified(content.reconciledRecipe)) {
    logInfo(
      'Could not identify recipe (missing ingredients/instructions). Skipping AI conflict resolution.',
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

function isRecipeIdentified(recipe: ReconciledRecipe): boolean {
  return (
    recipe.ingredients.value.length > 0 && recipe.instructions.value.length > 0
  );
}

function generateMarkdown(
  content: ParsedRecipePage,
  recipe: ReconciledRecipe,
  mainImageOnly: boolean,
  structuredRecipe: boolean,
  preferRawFallback: boolean,
  imageDestinations?: ReadonlyMap<string, string>,
): string {
  const originalContentHtml =
    !structuredRecipe && preferRawFallback
      ? content.rawHtml
      : content.article?.contentHtml?.trim() ||
        (!structuredRecipe ? content.rawHtml : '');
  const imagePosition = mainImageOnly ? 'bottom' : 'top';

  const markdown = structuredRecipe
    ? renderRecipeMarkdown(recipe, {
        imagePosition,
        includeStepImages: !mainImageOnly,
        ...(imageDestinations ? { imageDestinations } : {}),
      })
    : buildFallbackMarkdown(
        originalContentHtml,
        recipe,
        content.article?.title ?? null,
        imagePosition,
        imageDestinations,
      );
  if (!markdown) return '';

  const source = [
    recipe.sourceMetadata.canonicalUrl,
    recipe.sourceMetadata.finalUrl,
    recipe.sourceMetadata.requestedUrl,
  ].find((url) => url && /^https?:\/\//i.test(url));
  // Angle brackets and encoded delimiters keep URL punctuation out of Markdown syntax.
  const sourceLink = source
    ? `[${markdownTexts[getLanguage(recipe.sourceMetadata.language)].source}](<${source.replace(/[<>\s]/g, encodeURIComponent)}>)`
    : '';
  return [markdown, sourceLink].filter(Boolean).join('\n\n');
}

async function handleOutput(
  options: CliOptions,
  content: ParsedRecipePage,
  aiResult: AiResolutionResult,
  structuredRecipe: boolean,
  markdown: string,
) {
  const { output } = options;

  if (output) {
    await writeFileAtomically(output, markdown);
    logProgress(`Saved to ${output}`);
  } else {
    logSuccess('Diagnostic JSON sent to stdout.');
    process.stdout.write(
      `${JSON.stringify(
        {
          recipe: content.recipe,
          title: content.article?.title ?? null,
          excerpt: content.article?.excerpt ?? null,
          images: content.sources.images,
          candidates: content.sources.candidates,
          normalizedRecipe: content.normalizedRecipe,
          reconciledRecipe: aiResult.recipe,
          ai: aiResult,
          fallback: !structuredRecipe,
          content: markdown ? `${markdown.slice(0, 100)}...` : null,
        },
        null,
        2,
      )}\n`,
    );
  }
}
