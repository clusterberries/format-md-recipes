import type { RecipeCandidate, RecipeContentCandidate } from '../types.ts';
import { NOISE_PATTERN, TIME_PATTERN } from './patterns.ts';
import { createSignals, buildCandidate } from './signals.ts';

export function scoreContentCandidate(
  candidate: RecipeContentCandidate,
  id: string,
  hasMicrodata: boolean,
): RecipeCandidate {
  const context = candidate.context;
  const contextText = context?.text ?? '';
  const text = [
    candidate.title ?? '',
    ...candidate.ingredients,
    ...candidate.instructions,
  ].join(' ');
  const signals = createSignals({
    ingredientCount: candidate.ingredients.length,
    instructionCount: candidate.instructions.length,
    vocabularyText: `${text} ${contextText}`,
    hasTitle: Boolean(candidate.title),
    hasServings: /servings?|yield|порци/i.test(contextText),
    hasTimes: TIME_PATTERN.test(contextText),
    hasImages: context?.hasImages ?? false,
    hasMicrodata,
    linkDensity: context?.linkDensity ?? 0,
    noisePenalty: NOISE_PATTERN.test(contextText) ? 1 : 0,
    consistencyText: text,
  });

  return buildCandidate(
    id,
    candidate.source,
    candidate.location,
    candidate.title,
    signals,
  );
}
