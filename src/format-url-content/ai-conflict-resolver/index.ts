import { MINI_MODEL } from '../../shared/constants.ts';
import { callOpenAI } from '../../shared/openai-client.ts';
import { logInfo, logWarning } from '../logger.ts';
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

  logInfo('Built AI payload.', payload);

  try {
    logInfo(`Calling AI (${MINI_MODEL}) to resolve recipe conflicts...`);
    const requestOptions = {
      systemPrompt: AI_SYSTEM_PROMPT,
      maxCompletionTokens: 1200,
    };
    let decision = parseDecision(
      await callOpenAI(payload, MINI_MODEL, requestOptions),
    );
    if (!decision) {
      logWarning(
        'AI conflict resolution returned an invalid response. Retrying once.',
      );
      decision = parseDecision(
        await callOpenAI(payload, MINI_MODEL, {
          ...requestOptions,
          systemPrompt: `${AI_SYSTEM_PROMPT}\n\nYour previous response could not be parsed. Return only a corrected JSON object that follows the required response format.`,
        }),
      );
    }
    if (!decision) {
      logWarning(
        'AI conflict resolution retry returned an invalid response. Using deterministic result.',
      );
      return { recipe, called: true, applied: false, reasons };
    }

    logInfo('AI conflict resolution returned a valid decision.', decision);

    const unresolvedCollections = (
      ['ingredients', 'instructions'] as const
    ).filter(
      (field) =>
        decision.fields?.[field]?.action === 'unresolved' ||
        decision.unresolved?.includes(field),
    );
    if (unresolvedCollections.length) {
      const fallbackReason = `AI could not resolve ${unresolvedCollections.join(' and ')}`;
      logWarning(
        `${fallbackReason}. Keeping the page content for later cleanup.`,
      );
      return {
        recipe,
        called: true,
        applied: false,
        reasons,
        fallbackReason,
      };
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
