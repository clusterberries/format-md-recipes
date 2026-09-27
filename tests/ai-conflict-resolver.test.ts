import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { callOpenAI } from '../src/shared/openai-client.ts';
import { resolveRecipeConflicts } from '../src/format-url-content/ai-conflict-resolver/index.ts';
import { extractRecipe, jsonLd } from './helpers/extract-recipe.ts';

vi.mock('../src/shared/openai-client.ts', () => ({ callOpenAI: vi.fn() }));

function conflictingRecipe() {
  return extractRecipe(
    jsonLd({
      '@type': 'Recipe',
      name: 'Soup',
      recipeIngredient: ['1 onion'],
      recipeInstructions: ['Chop onion.', 'Boil water.'],
    }) +
      `<article class="recipe"><h2>Ingredients</h2><ul><li>1 onion</li></ul>
    <h2>Instructions</h2><ol><li>Roast onion.</li><li>Serve cold.</li></ol></article>`,
  ).recipe;
}

describe('AI conflict resolution', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.mocked(callOpenAI).mockReset();
  });

  it('selects an entire alternative without mutating the deterministic recipe', async () => {
    const recipe = conflictingRecipe();
    const before = structuredClone(recipe);
    vi.mocked(callOpenAI).mockResolvedValue(
      JSON.stringify({
        fields: {
          instructions: { action: 'select', candidateIndexes: [1] },
        },
      }),
    );
    const result = await resolveRecipeConflicts(recipe, []);
    expect(result.applied).toBe(true);
    expect(result.recipe.instructions.value.map((step) => step.text)).toEqual([
      'Roast onion.',
      'Serve cold.',
    ]);
    expect(recipe).toEqual(before);
  });

  it('merges the same ingredient from two sources into one entry', async () => {
    const recipe = conflictingRecipe();
    const onion = recipe.ingredients.value[0]!;
    recipe.ingredients.alternatives = [
      [
        { ...onion, source: 'html', location: 'html.ingredients[0]' },
        {
          ...onion,
          text: '1 carrot',
          name: 'carrot',
          source: 'html',
          location: 'html.ingredients[1]',
        },
      ],
    ];
    vi.mocked(callOpenAI).mockResolvedValue(
      JSON.stringify({
        fields: {
          ingredients: { action: 'merge', candidateIndexes: [0, 1] },
        },
      }),
    );
    const result = await resolveRecipeConflicts(recipe, []);
    expect(result.recipe.ingredients.value.map((item) => item.text)).toEqual([
      '1 onion',
      '1 carrot',
    ]);
  });

  it('preserves separate oil quantities for dough and coating when merging sources', async () => {
    const recipe = conflictingRecipe();
    const ingredient = recipe.ingredients.value[0]!;
    // These are two uses in one recipe, not two extractions of the same use.
    const doughOil = {
      ...ingredient,
      text: '1 tbsp oil',
      quantity: '1',
      unit: 'tbsp',
      name: 'oil',
      group: 'Dough',
      location: 'json-ld.ingredients[0]',
    };
    const coatingOil = {
      ...doughOil,
      group: 'Coating',
      location: 'json-ld.ingredients[1]',
    };
    recipe.ingredients.value = [doughOil, coatingOil];
    recipe.ingredients.alternatives = [
      [
        { ...doughOil, source: 'html', location: 'html.ingredients[0]' },
        { ...coatingOil, source: 'html', location: 'html.ingredients[1]' },
      ],
    ];
    vi.mocked(callOpenAI).mockResolvedValue(
      JSON.stringify({
        fields: {
          ingredients: { action: 'merge', candidateIndexes: [0, 1] },
        },
      }),
    );
    const result = await resolveRecipeConflicts(recipe, []);
    expect(
      result.recipe.ingredients.value.map(({ text, group }) => ({
        text,
        group,
      })),
    ).toEqual([
      { text: '1 tbsp oil', group: 'Dough' },
      { text: '1 tbsp oil', group: 'Coating' },
    ]);
  });

  it.each([
    { action: 'select', candidateIndexes: [999] },
    { action: 'merge', candidateIndexes: [0, 999] },
    { action: 'select', candidateIndexes: [-1] },
    { action: 'select', candidateIndexes: [0.5] },
    { action: 'select', candidateIndexes: '1' },
  ])(
    'keeps the deterministic recipe for invalid indexes: %j',
    async (decision) => {
      const recipe = conflictingRecipe();
      vi.mocked(callOpenAI).mockResolvedValue(
        JSON.stringify({ fields: { instructions: decision } }),
      );
      const result = await resolveRecipeConflicts(recipe, []);
      expect(result.recipe).toBe(recipe);
      expect(result.applied).toBe(false);
    },
  );

  it.each(['not JSON', '[]', '{"fields":{"instructions":null}}'])(
    'handles malformed response %s',
    async (response) => {
      const recipe = conflictingRecipe();
      vi.mocked(callOpenAI).mockResolvedValue(response);
      const result = await resolveRecipeConflicts(recipe, []);
      expect(result.recipe).toBe(recipe);
      expect(result.applied).toBe(false);
    },
  );

  it('refuses to filter out every instruction', async () => {
    const recipe = conflictingRecipe();
    vi.mocked(callOpenAI).mockResolvedValue(
      JSON.stringify({
        fields: {
          instructions: {
            action: 'filter',
            dropTexts: recipe.instructions.value.map((step) => step.text),
          },
        },
      }),
    );
    expect((await resolveRecipeConflicts(recipe, [])).recipe).toBe(recipe);
  });

  it('falls back when the API fails', async () => {
    const recipe = conflictingRecipe();
    vi.mocked(callOpenAI).mockRejectedValue(new Error('API unavailable'));
    const result = await resolveRecipeConflicts(recipe, []);
    expect(result).toMatchObject({ recipe, called: true, applied: false });
  });

  it('does not call the API when sources agree', async () => {
    const { recipe } = extractRecipe(
      jsonLd({
        '@type': 'Recipe',
        name: 'Soup',
        recipeIngredient: ['1 onion'],
        recipeInstructions: ['Chop onion.'],
      }) +
        `<article class="recipe"><h2>Ingredients</h2><ul><li>1 onion</li></ul>
        <h2>Instructions</h2><ol><li>Chop onion.</li></ol></article>`,
    );
    expect(recipe.ingredients.conflicts).toEqual([]);
    expect(recipe.instructions.conflicts).toEqual([]);
    expect((await resolveRecipeConflicts(recipe, [])).called).toBe(false);
    expect(callOpenAI).not.toHaveBeenCalled();
  });
});
