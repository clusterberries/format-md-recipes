import type { ReconciledRecipe } from '../types.ts';

export interface AiDecision {
  fields?: {
    title?: AiFieldDecision;
    description?: AiFieldDecision;
    servings?: AiFieldDecision;
    prepTime?: AiFieldDecision;
    cookTime?: AiFieldDecision;
    totalTime?: AiFieldDecision;
    ingredients?: AiCollectionDecision;
    instructions?: AiCollectionDecision;
  };
  unresolved?: string[];
}

export interface AiFieldDecision {
  action: 'select' | 'keep-deterministic' | 'unresolved';
  candidateIndex?: number;
}

export interface AiCollectionDecision {
  action: 'select' | 'merge' | 'keep-deterministic' | 'unresolved';
  candidateIndexes?: number[];
}

export interface AiResolutionResult {
  recipe: ReconciledRecipe;
  called: boolean;
  applied: boolean;
  reasons: string[];
}
