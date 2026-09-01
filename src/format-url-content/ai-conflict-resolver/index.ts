import { MINI_MODEL } from '../../shared/constants.ts';
import { callOpenAI } from '../../shared/openai-client.ts';
import { logInfo, logWarning } from '../../shared/utils.ts';
import type { RecipeCandidate, ReconciledRecipe } from '../types.ts';
import { AI_SYSTEM_PROMPT } from './prompt.ts';
import { MAX_AI_INPUT_LENGTH } from './constants.ts';
import { getAiReasons } from './trigger-reasons.ts';
import { buildPayload } from './payload-builder.ts';
import { parseDecision } from './decision-validation.ts';
import { applyDecision } from './decision-application.ts';
import type { AiResolutionResult } from './types.ts';

export async function resolveRecipeConflicts(
  recipe: ReconciledRecipe,
  candidates: RecipeCandidate[],
): Promise<AiResolutionResult> {
  const reasons = getAiReasons(recipe, candidates);
  if (!reasons.length) {
    logInfo('No conflicts detected. Skipping AI conflict resolution.');
    return { recipe, called: false, applied: false, reasons };
  }

  logInfo(`AI conflict resolution triggered: ${reasons.join('; ')}`);

  const payload = buildPayload(recipe, candidates, reasons);
  if (!payload) {
    logWarning(
      `AI conflict resolution skipped: payload exceeds ${MAX_AI_INPUT_LENGTH} characters.`,
    );
    return { recipe, called: false, applied: false, reasons };
  }

  try {
    logInfo(`Calling AI (${MINI_MODEL}) to resolve recipe conflicts...`);
    const response = await callOpenAI(payload, MINI_MODEL, {
      systemPrompt: AI_SYSTEM_PROMPT,
      maxCompletionTokens: 1200,
    });
    const decision = parseDecision(response);
    if (!decision) {
      logWarning(
        'AI conflict resolution returned an invalid response. Using deterministic result.',
      );
      return { recipe, called: true, applied: false, reasons };
    }

    const resolved = applyDecision(recipe, decision);
    const applied = resolved !== recipe;
    logInfo(
      applied
        ? 'AI conflict resolution applied changes.'
        : 'AI conflict resolution made no changes.',
    );
    return { recipe: resolved, called: true, applied, reasons };
  } catch (error) {
    logWarning(
      `AI conflict resolution failed: ${getErrorMessage(error)}. Using deterministic result.`,
    );
    return { recipe, called: true, applied: false, reasons };
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
