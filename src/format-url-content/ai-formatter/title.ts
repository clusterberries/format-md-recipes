import { MINI_MODEL } from '../../shared/constants.ts';
import { callOpenAI } from '../../shared/openai-client.ts';
import { logInfo, logWarning } from '../logger.ts';
import {
  MAX_TITLE_INPUT_LENGTH,
  MAX_TITLE_LENGTH,
  TITLE_MAX_COMPLETION_TOKENS,
} from './constants.ts';
import { TITLE_SYSTEM_PROMPT } from './prompt.ts';

/** Returns a short file-name-friendly title, or the input unchanged when shortening is not possible. */
export async function shortenRecipeTitle(title: string): Promise<string> {
  const original = title.trim();
  if (!original || original.length > MAX_TITLE_INPUT_LENGTH) return title;

  try {
    const shortened = cleanTitle(
      await callOpenAI(original, MINI_MODEL, {
        systemPrompt: TITLE_SYSTEM_PROMPT,
        maxCompletionTokens: TITLE_MAX_COMPLETION_TOKENS,
      }),
    );
    if (!shortened || shortened.length > MAX_TITLE_LENGTH) {
      logWarning('AI title shortening returned an unusable title.');
      return title;
    }
    if (!usesOnlyWordsFrom(shortened, original)) {
      logWarning(
        `AI title shortening added new words ("${shortened}"). Using the original title.`,
      );
      return title;
    }
    if (shortened !== original) {
      logInfo(`Shortened title: "${original}" -> "${shortened}"`);
    }
    return shortened;
  } catch (error) {
    logWarning(
      `AI title shortening failed: ${error instanceof Error ? error.message : String(error)}. Using the original title.`,
    );
    return title;
  }
}

function cleanTitle(raw: string): string {
  const [firstLine = ''] = raw.trim().split(/\r?\n/);
  return firstLine
    .replace(/^["'«»“”]+|["'«»“”]+$/g, '')
    .replace(/\.+$/, '')
    .trim();
}

function getWords(value: string): string[] {
  return (
    value
      .toLowerCase()
      .replace(/ё/g, 'е')
      .match(/[\p{L}\p{N}]+/gu) ?? []
  );
}

// Prevents the model from inventing words that the page did not contain.
function usesOnlyWordsFrom(candidate: string, original: string): boolean {
  const allowed = getWords(original).filter(isSignificant);
  const words = getWords(candidate).filter(isSignificant);
  return (
    words.length > 0 &&
    words.every((word) => allowed.some((known) => sameWord(word, known)))
  );
}

// Short words (prepositions, conjunctions) may change form, e.g. "с" -> "со".
function isSignificant(word: string): boolean {
  return word.length > 2;
}

// Russian endings change with case, so words match when their stems do.
function sameWord(a: string, b: string): boolean {
  const shortest = Math.min(a.length, b.length);
  const required = Math.min(shortest, Math.max(4, shortest - 2));
  let common = 0;
  while (common < shortest && a[common] === b[common]) common++;
  return common >= required;
}
