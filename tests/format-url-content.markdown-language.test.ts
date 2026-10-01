import { describe, expect, it } from 'vitest';
import { renderRecipeMarkdown } from '../src/format-url-content/markdown/recipe-markdown-renderer.ts';
import type {
  ReconciledField,
  ReconciledRecipe,
} from '../src/format-url-content/types.ts';

function field(value: string | null): ReconciledField<string> {
  return {
    value,
    source: null,
    confidence: 0,
    location: null,
    alternatives: [],
    conflicts: [],
    selectionReason: null,
  };
}

function recipe(language: string | null): ReconciledRecipe {
  return {
    title: field(null),
    description: field(null),
    servings: field('2'),
    prepTime: field('PT5M'),
    cookTime: field('PT10M'),
    totalTime: field('PT15M'),
    ingredients: {
      value: [
        {
          text: 'Соль',
          source: 'html',
          confidence: 1,
          location: 'test',
        },
      ],
      source: 'html',
      confidence: 1,
      alternatives: [],
      conflicts: [],
      selectionReason: null,
    },
    instructions: {
      value: [
        {
          text: 'Добавьте соль.',
          stepIndex: 0,
          source: 'html',
          confidence: 1,
          location: 'test',
          image: {
            url: 'https://example.test/step.jpg',
            source: 'html',
            confidence: 1,
            location: 'test',
            role: 'step',
          },
        },
      ],
      source: 'html',
      confidence: 1,
      alternatives: [],
      conflicts: [],
      selectionReason: null,
    },
    mainImage: null,
    stepImages: [],
    galleryImages: [],
    notes: [
      {
        value: 'Подавайте горячим.',
        source: 'html',
        confidence: 1,
        location: 'test',
      },
    ],
    conflicts: [],
    sourceMetadata: {
      requestedUrl: 'https://example.test/recipe',
      finalUrl: 'https://example.test/recipe',
      canonicalUrl: null,
      language,
      encoding: 'utf-8',
      contentType: 'text/html',
    },
  };
}

describe('recipe Markdown text', () => {
  it('renders generated text in Russian for a Russian locale', () => {
    expect(renderRecipeMarkdown(recipe('ru-RU'))).toBe(
      '# Рецепт\n\n' +
        '## Метаданные\n\n' +
        '- Порции: 2\n' +
        '- Время подготовки: PT5M\n' +
        '- Время приготовления: PT10M\n' +
        '- Общее время: PT15M\n\n' +
        '## Ингредиенты\n- Соль\n\n' +
        '## Приготовление\n' +
        '1. Добавьте соль.\n\n' +
        '   ![Шаг 1](https://example.test/step.jpg)\n\n' +
        '## Примечания\n\nПодавайте горячим.',
    );
  });

  it('uses English when page language is missing', () => {
    const markdown = renderRecipeMarkdown(recipe(null));
    expect(markdown).toContain('# Recipe');
    expect(markdown).toContain('## Notes');
    expect(markdown).toContain('![Step 1](https://example.test/step.jpg)');
  });
});
