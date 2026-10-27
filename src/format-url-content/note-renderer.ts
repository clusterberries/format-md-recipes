import { formatRecipeNote } from './ai-formatter/index.ts';
import {
  collectRenderedImages,
  downloadRecipeImages,
} from './image-downloader.ts';
import { buildFallbackMarkdown } from './markdown/fallback-markdown.ts';
import { getLanguage } from './markdown/language.ts';
import { renderRecipeMarkdown } from './markdown/recipe-markdown-renderer.ts';
import { markdownTexts } from './markdown/texts.ts';
import type { RecipeDecision, RenderMode } from './recipe-decision.ts';
import type {
  CliOptions,
  ParsedRecipePage,
  ReconciledRecipe,
} from './types.ts';

export interface RenderPlan {
  page: ParsedRecipePage;
  recipe: ReconciledRecipe;
  mode: RenderMode;
  imagePosition: 'top' | 'bottom';
  includeStepImages: boolean;
}

export interface RenderedNote {
  markdown: string;
  /** Images that stay remote because they could not be downloaded. */
  imageFailures: number;
}

export function createRenderPlan(
  page: ParsedRecipePage,
  decision: RecipeDecision,
  mainImageOnly: boolean,
): RenderPlan {
  return {
    page,
    recipe: decision.recipe,
    mode: decision.mode,
    imagePosition: mainImageOnly ? 'bottom' : 'top',
    includeStepImages: !mainImageOnly,
  };
}

export function renderBody(
  plan: RenderPlan,
  imageDestinations?: ReadonlyMap<string, string>,
): string {
  const { page, recipe, mode, imagePosition } = plan;

  if (mode === 'structured') {
    return renderRecipeMarkdown(recipe, {
      imagePosition,
      includeStepImages: plan.includeStepImages,
      ...(imageDestinations ? { imageDestinations } : {}),
    });
  }

  const contentHtml =
    mode === 'fallback-raw'
      ? page.rawHtml
      : page.article?.contentHtml?.trim() || page.rawHtml;
  return buildFallbackMarkdown(
    contentHtml,
    recipe,
    page.article?.title ?? null,
    imagePosition,
    imageDestinations,
  );
}

export function buildSourceLink(recipe: ReconciledRecipe): string {
  const source = [
    recipe.sourceMetadata.canonicalUrl,
    recipe.sourceMetadata.finalUrl,
    recipe.sourceMetadata.requestedUrl,
  ].find((url) => url && /^https?:\/\//i.test(url));
  // Angle brackets and encoded delimiters keep URL punctuation out of Markdown syntax.
  return source
    ? `[${markdownTexts[getLanguage(recipe.sourceMetadata.language)].source}](<${source.replace(/[<>\s]/g, encodeURIComponent)}>)`
    : '';
}

export function joinNote(body: string, sourceLink: string): string {
  return body ? [body, sourceLink].filter(Boolean).join('\n\n') : '';
}

/** Renders the final note for `output`: local images (if requested), AI formatting, source link. */
export async function renderNote(
  plan: RenderPlan,
  settings: Pick<CliOptions, 'noAi' | 'downloadImages' | 'imagesFolder'>,
  sourceLink: string,
  output: string,
): Promise<RenderedNote> {
  let body: string;
  let imageFailures = 0;

  if (settings.downloadImages) {
    const images = collectRenderedImages(
      plan.recipe,
      plan.mode === 'structured' && plan.includeStepImages,
    );
    const { destinations, failed } = await downloadRecipeImages(
      images,
      output,
      settings.imagesFolder,
    );
    imageFailures = failed;
    body = renderBody(plan, destinations);
  } else {
    body = renderBody(plan);
  }

  if (!settings.noAi && body) {
    // The source link is appended afterwards so the model cannot alter it.
    body = await formatRecipeNote(body);
  }

  return { markdown: joinNote(body, sourceLink), imageFailures };
}
