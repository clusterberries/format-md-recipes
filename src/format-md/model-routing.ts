import { FULL_MODEL, MINI_MODEL, MEDIUM_MODEL } from '../shared/constants.ts';
import type { ClassificationResult, Complexity } from './types.ts';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function extractJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }

  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');

  if (start === -1 || end === -1 || end <= start) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(trimmed.slice(start, end + 1));
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isComplexity(value: unknown): value is Complexity {
  return value === 'simple' || value === 'moderate' || value === 'complex';
}

export function parseClassificationResult(
  rawResult: string,
): ClassificationResult {
  const parsed = extractJsonObject(rawResult);

  return {
    isRecipe: typeof parsed?.isRecipe === 'boolean' ? parsed.isRecipe : false,
    complexity: isComplexity(parsed?.complexity)
      ? parsed.complexity
      : 'moderate',
    reason:
      typeof parsed?.reason === 'string' && parsed.reason
        ? parsed.reason
        : 'No reason provided',
  };
}

const getModelForComplexity = (complexity?: Complexity) => {
  switch (complexity) {
    case 'simple':
      return MINI_MODEL;
    case 'complex':
      return FULL_MODEL;
    default:
      return MEDIUM_MODEL;
  }
};

export function buildFormattingPlan(classification: ClassificationResult) {
  return {
    ...classification,
    model: getModelForComplexity(classification.complexity),
  };
}
