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
  action: 'select' | 'merge' | 'filter' | 'keep-deterministic' | 'unresolved';
  candidateIndexes?: number[];
  // Exact `text` values (verbatim from the "selected" array) to remove; used with action "filter".
  dropTexts?: string[];
}

export interface AiResolutionResult {
  recipe: ReconciledRecipe;
  called: boolean;
  applied: boolean;
  reasons: string[];
  fallbackReason?: string;
}
