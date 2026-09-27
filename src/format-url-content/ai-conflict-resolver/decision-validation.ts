import type {
  AiCollectionDecision,
  AiDecision,
  AiFieldDecision,
} from './types.ts';

export function parseDecision(value: string): AiDecision | null {
  try {
    const parsed: unknown = JSON.parse(value);
    return isAiDecision(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isAiDecision(value: unknown): value is AiDecision {
  if (!isRecord(value)) return false;
  if (
    value.unresolved !== undefined &&
    (!Array.isArray(value.unresolved) ||
      !value.unresolved.every((item) => typeof item === 'string'))
  )
    return false;
  if (value.fields === undefined) return true;
  if (!isRecord(value.fields)) return false;
  return Object.entries(value.fields).every(([name, decision]) =>
    name === 'ingredients' || name === 'instructions'
      ? isCollectionDecision(decision)
      : isFieldDecision(decision),
  );
}

function isFieldDecision(value: unknown): value is AiFieldDecision {
  if (!isRecord(value)) return false;
  return (
    (value.action === 'select' ||
      value.action === 'keep-deterministic' ||
      value.action === 'unresolved') &&
    (value.candidateIndex === undefined || isValidIndex(value.candidateIndex))
  );
}

function isCollectionDecision(value: unknown): value is AiCollectionDecision {
  if (!isRecord(value)) return false;
  if (
    value.candidateIndexes !== undefined &&
    (!Array.isArray(value.candidateIndexes) ||
      !value.candidateIndexes.every(isValidIndex))
  )
    return false;
  if (
    value.dropTexts !== undefined &&
    (!Array.isArray(value.dropTexts) ||
      !value.dropTexts.every(
        (text) => typeof text === 'string' && text.trim().length > 0,
      ))
  )
    return false;
  switch (value.action) {
    case 'select':
    case 'merge':
      return (
        Array.isArray(value.candidateIndexes) &&
        value.candidateIndexes.length > 0
      );
    case 'filter':
      return Array.isArray(value.dropTexts) && value.dropTexts.length > 0;
    case 'keep-deterministic':
    case 'unresolved':
      return true;
    default:
      return false;
  }
}

function isValidIndex(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}
