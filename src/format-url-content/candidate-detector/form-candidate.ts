import type { FormRecipeValue, RecipeCandidate } from '../types.ts';
import { TIME_PATTERN } from './patterns.ts';
import { createSignals, buildCandidate } from './signals.ts';

export function scoreFormCandidates(
  forms: FormRecipeValue[],
): RecipeCandidate[] {
  if (!forms.length) return [];

  const text = forms
    .map((form) => `${form.label ?? ''} ${form.name ?? ''} ${form.value}`)
    .join(' ');
  const signals = createSignals({
    ingredientCount: forms.filter((form) =>
      /ingredient|ингредиент/i.test(`${form.label} ${form.name}`),
    ).length,
    instructionCount: 0,
    vocabularyText: text,
    hasTitle: false,
    hasServings: /serving|порци/i.test(text),
    hasTimes: TIME_PATTERN.test(text),
    hasImages: false,
    hasMicrodata: false,
    linkDensity: 0,
    noisePenalty: 0,
    consistencyText: text,
  });

  return [buildCandidate('form-0', 'form', 'recipe-form', null, signals)];
}
