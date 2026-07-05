import { FULL_MODEL, MINI_MODEL, MEDIUM_MODEL } from './constants.js';

function extractJsonObject(text) {
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
    return JSON.parse(trimmed.slice(start, end + 1));
  } catch {
    return null;
  }
}

//   "complexity": "simple|moderate|complex",
export function parseClassificationResult(rawResult) {
  const parsed = extractJsonObject(rawResult);

  return {
    isRecipe: Boolean(parsed?.isRecipe),
    complexity: parsed?.complexity || 'moderate',
    reason: parsed?.reason || 'No reason provided',
  };
}

const getModelForComplexity = (complexity) => {
  switch (complexity) {
    case 'simple':
      return MINI_MODEL;
    case 'complex':
      return FULL_MODEL;
    default:
      return MEDIUM_MODEL;
  }
};

export function buildFormattingPlan(classification = {}) {
  return {
    ...classification,
    model: getModelForComplexity(classification.complexity),
  };
}
