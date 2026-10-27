import { resolveRecipeConflicts } from './ai-conflict-resolver/index.ts';
import type { AiResolutionResult } from './ai-conflict-resolver/types.ts';
import { logInfo, logWarning } from './logger.ts';
import { getRecipeQualityIssue } from './recipe-quality.ts';
import type { ParsedRecipePage, ReconciledRecipe } from './types.ts';

/** `fallback-article` uses the Readability article (raw HTML if it is empty); `fallback-raw` always uses the raw HTML. */
export type RenderMode = 'structured' | 'fallback-article' | 'fallback-raw';

export interface RecipeDecision {
  recipe: ReconciledRecipe;
  aiResult: AiResolutionResult;
  mode: RenderMode;
}

export async function decideRecipe(
  page: ParsedRecipePage,
  noAi: boolean,
): Promise<RecipeDecision> {
  const aiResolution = await resolveConflicts(page, noAi);
  const qualityIssue =
    !aiResolution.fallbackReason && isRecipeIdentified(aiResolution.recipe)
      ? getRecipeQualityIssue(aiResolution.recipe)
      : null;
  const aiResult: AiResolutionResult = qualityIssue
    ? { ...aiResolution, fallbackReason: qualityIssue }
    : aiResolution;

  return { recipe: aiResult.recipe, aiResult, mode: getRenderMode(aiResult) };
}

export function logDecision(
  decision: RecipeDecision,
  mainImageOnly: boolean,
): void {
  if (decision.mode === 'structured') {
    logInfo(
      mainImageOnly
        ? 'Image mode: main image only (step images skipped, main image at bottom).'
        : 'Image mode: all images (main image after title, step images inline).',
    );
  } else if (decision.aiResult.fallbackReason) {
    logWarning(
      `Falling back to cleaned page content: ${decision.aiResult.fallbackReason}.`,
    );
  } else {
    logWarning(
      'Could not identify recipe (missing ingredients/instructions). Falling back to cleaned page content.',
    );
  }
}

async function resolveConflicts(
  page: ParsedRecipePage,
  noAi: boolean,
): Promise<AiResolutionResult> {
  if (noAi) {
    logInfo(
      'AI disabled (--no-ai). Skipping conflict resolution and note formatting.',
    );
  }

  if (noAi || !isRecipeIdentified(page.reconciledRecipe)) {
    return {
      recipe: page.reconciledRecipe,
      called: false,
      applied: false,
      reasons: [],
    };
  }

  return resolveRecipeConflicts(page.reconciledRecipe, page.sources.candidates);
}

function getRenderMode(aiResult: AiResolutionResult): RenderMode {
  if (aiResult.fallbackReason) return 'fallback-raw';
  return isRecipeIdentified(aiResult.recipe)
    ? 'structured'
    : 'fallback-article';
}

function isRecipeIdentified(recipe: ReconciledRecipe): boolean {
  return (
    recipe.ingredients.value.length > 0 && recipe.instructions.value.length > 0
  );
}
