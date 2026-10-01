import type { Language } from './language.ts';

type MarkdownTexts = {
  recipe: string;
  sections: {
    metadata: string;
    ingredients: string;
    instructions: string;
    notes: string;
  };
  metadata: {
    servings: string;
    preparationTime: string;
    cookingTime: string;
    totalTime: string;
  };
  source: string;
  imageAlt: string;
  stepImageAlt: (step: number) => string;
};

export const markdownTexts: Record<Language, MarkdownTexts> = {
  en: {
    recipe: 'Recipe',
    sections: {
      metadata: 'Metadata',
      ingredients: 'Ingredients',
      instructions: 'Instructions',
      notes: 'Notes',
    },
    metadata: {
      servings: 'Servings',
      preparationTime: 'Preparation time',
      cookingTime: 'Cooking time',
      totalTime: 'Total time',
    },
    source: 'Source',
    imageAlt: 'Recipe image',
    stepImageAlt: (step) => `Step ${step}`,
  },
  ru: {
    recipe: 'Рецепт',
    sections: {
      metadata: 'Метаданные',
      ingredients: 'Ингредиенты',
      instructions: 'Приготовление',
      notes: 'Примечания',
    },
    metadata: {
      servings: 'Порции',
      preparationTime: 'Время подготовки',
      cookingTime: 'Время приготовления',
      totalTime: 'Общее время',
    },
    source: 'Источник',
    imageAlt: 'Изображение рецепта',
    stepImageAlt: (step) => `Шаг ${step}`,
  },
};
