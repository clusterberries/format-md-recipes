import { MINI_MODEL } from '../../shared/constants.ts';
import {
  buildFormattingPlan,
  parseClassificationResult,
} from '../../shared/model-routing.ts';
import { callOpenAI } from '../../shared/openai-client.ts';
import { logInfo, logWarning } from '../logger.ts';
import {
  FORMAT_MAX_COMPLETION_TOKENS,
  MAX_FORMAT_INPUT_LENGTH,
  SCOUT_MAX_COMPLETION_TOKENS,
} from './constants.ts';
import { FORMAT_SYSTEM_PROMPT, SCOUT_SYSTEM_PROMPT } from './prompt.ts';
import { validateFormattedNote } from './validation.ts';

/** Returns the AI-formatted note, or the input unchanged when formatting is not possible. */
export async function formatRecipeNote(markdown: string): Promise<string> {
  if (markdown.length > MAX_FORMAT_INPUT_LENGTH) {
    logWarning(
      `AI formatting skipped: content exceeds ${MAX_FORMAT_INPUT_LENGTH} characters.`,
    );
    return markdown;
  }

  try {
    const classification = parseClassificationResult(
      await callOpenAI(markdown, MINI_MODEL, {
        systemPrompt: SCOUT_SYSTEM_PROMPT,
        maxCompletionTokens: SCOUT_MAX_COMPLETION_TOKENS,
      }),
    );
    if (!classification.isRecipe) {
      logWarning(
        `AI formatting skipped: content was not classified as a recipe (${classification.reason}).`,
      );
      return markdown;
    }

    const plan = buildFormattingPlan(classification);
    logInfo(
      `Formatting note with AI (${plan.model}, complexity: ${plan.complexity}).`,
    );
    const result = validateFormattedNote(
      await callOpenAI(markdown, plan.model, {
        systemPrompt: FORMAT_SYSTEM_PROMPT,
        maxCompletionTokens: FORMAT_MAX_COMPLETION_TOKENS,
      }),
      markdown,
    );
    if ('issue' in result) {
      logWarning(
        `AI formatting returned an unusable response (${result.issue}). Using unformatted Markdown.`,
      );
      return markdown;
    }
    return result.markdown;
  } catch (error) {
    logWarning(
      `AI formatting failed: ${error instanceof Error ? error.message : String(error)}. Using unformatted Markdown.`,
    );
    return markdown;
  }
}
