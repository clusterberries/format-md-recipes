import { describe, expect, it } from 'vitest';
import { extractRecipe, jsonLd } from './helpers/extract-recipe.ts';

// Candidate signals control AI triggers and are not visible in rendered Markdown.
describe('recipe candidate scoring', () => {
  it.each(['html', 'microdata'] as const)(
    'scores the actual %s root independently of preceding page noise',
    (source) => {
      const markup = `<article class="recipe" ${source === 'microdata' ? 'itemscope itemtype="https://schema.org/Recipe"' : ''}>
        <h1 itemprop="name">Soup</h1><h2>Ingredients</h2><ul><li itemprop="recipeIngredient">1 onion</li></ul>
        <h2>Instructions</h2><ol itemprop="recipeInstructions"><li>Boil onion.</li></ol>
        <img src="https://example.com/soup.jpg"><p>Servings: 2. Cook time: 10 minutes.</p>
      </article>`;
      const prefix =
        '<div class="advertisement"><a href="/ad">Advertisement</a></div>';
      const base = extractRecipe(markup).sources.candidates.find(
        (candidate) => candidate.source === source,
      )!;
      const withNoise = extractRecipe(prefix + markup).sources.candidates.find(
        (candidate) => candidate.source === source,
      )!;
      expect(withNoise.signals).toEqual(base.signals);
      expect(withNoise.score).toBe(base.score);
      expect(withNoise.signals).toMatchObject({
        hasImages: true,
        hasServings: true,
        hasTimes: true,
        noisePenalty: 0,
        linkDensity: 0,
      });
    },
  );

  it('counts nested schema steps using the same traversal as extraction', () => {
    const { sources, recipe } = extractRecipe(
      jsonLd({
        '@type': 'Recipe',
        name: 'Soup',
        recipeIngredient: ['1 onion'],
        recipeInstructions: [
          {
            '@type': 'HowToSection',
            text: 'Make soup',
            itemListElement: [
              { '@type': 'HowToStep', text: 'Chop onion.' },
              {
                '@type': 'HowToSection',
                text: 'Cook soup',
                itemListElement: [
                  { '@type': 'HowToStep', text: 'Boil water.' },
                  { '@type': 'HowToStep', text: 'Add onion.' },
                ],
              },
            ],
          },
        ],
      }),
    );
    expect(recipe.instructions.value.map((step) => step.text)).toEqual([
      'Chop onion.',
      'Boil water.',
      'Add onion.',
    ]);
    expect(
      sources.candidates.find((candidate) => candidate.source === 'json-ld')
        ?.signals.instructionCount,
    ).toBe(3);
  });

  it('keeps candidate context serializable for diagnostic output', () => {
    const { sources } = extractRecipe(
      '<article class="recipe"><h2>Ingredients</h2><ul><li>1 onion</li></ul><h2>Instructions</h2><ol><li>Boil onion.</li></ol></article>',
    );
    expect(() => JSON.stringify(sources)).not.toThrow();
  });
});
