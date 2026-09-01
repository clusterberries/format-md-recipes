import type {
  AiCollectionDecision,
  AiDecision,
  AiFieldDecision,
} from './types.ts';

export function parseDecision(value: string): AiDecision | null {
  try {
    const parsed: unknown = JSON.parse(value);
    return isAiDecision(parsed) && validateDecision(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isAiDecision(value: unknown): value is AiDecision {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateDecision(decision: AiDecision): boolean {
  if (
    decision.unresolved &&
    !decision.unresolved.every((item) => typeof item === 'string')
  )
    return false;
  if (!decision.fields) return true;
  for (const field of Object.values(decision.fields)) {
    if (!field || !isAllowedAction(field.action)) return false;
    if (field.action === 'select') {
      if ('candidateIndex' in field && !isValidIndex(field.candidateIndex))
        return false;
      if ('candidateIndexes' in field && !field.candidateIndexes?.length)
        return false;
    }
  }
  if (
    decision.fields.ingredients &&
    !validateCollectionDecision(decision.fields.ingredients)
  )
    return false;
  if (
    decision.fields.instructions &&
    !validateCollectionDecision(decision.fields.instructions)
  )
    return false;
  return true;
}

function validateCollectionDecision(decision: AiCollectionDecision): boolean {
  if (!isAllowedAction(decision.action)) return false;
  return decision.action === 'select' || decision.action === 'merge'
    ? Boolean(
        decision.candidateIndexes?.length &&
        decision.candidateIndexes.every(isValidIndex),
      )
    : true;
}

function isAllowedAction(
  value: unknown,
): value is AiFieldDecision['action'] | AiCollectionDecision['action'] {
  return (
    value === 'select' ||
    value === 'merge' ||
    value === 'keep-deterministic' ||
    value === 'unresolved'
  );
}

function isValidIndex(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}
