import type {
  ExtractedInstruction,
  ExtractedPageSources,
  FieldSource,
} from '../types.ts';
import {
  MAX_SCHEMA_RECURSION_DEPTH,
  normalizeText,
} from '../utils/dom-helpers.ts';
import { SOURCE_CONFIDENCE } from './constants.ts';

export function extractInstructions(
  sources: ExtractedPageSources,
): ExtractedInstruction[] {
  const instructions: ExtractedInstruction[] = [];

  sources.jsonLd.forEach((recipe, recipeIndex) => {
    flattenInstructions(recipe.recipeInstructions).forEach((text, index) => {
      if (!isLikelyInstructionText(text)) return;
      instructions.push(
        createInstruction(
          text,
          index,
          'json-ld',
          `json-ld-${recipeIndex}.recipeInstructions[${index}]`,
        ),
      );
    });
  });

  [...sources.microdata, ...sources.recipeHtml].forEach((candidate) => {
    candidate.instructions.forEach((text, index) => {
      if (!isLikelyInstructionText(text)) return;
      instructions.push(
        createInstruction(
          text,
          index,
          candidate.source,
          `${candidate.location}.instructions[${index}]`,
        ),
      );
    });
  });

  return deduplicateInstructions(instructions);
}

function flattenInstructions(value: unknown, depth = 0): string[] {
  if (depth > MAX_SCHEMA_RECURSION_DEPTH) return [];
  if (typeof value === 'string') return value.trim() ? [value.trim()] : [];
  if (Array.isArray(value))
    return value.flatMap((item) => flattenInstructions(item, depth + 1));
  if (typeof value !== 'object' || value === null) return [];
  const item = value as Record<string, unknown>;
  if (typeof item.text === 'string') return [item.text];
  return flattenInstructions(
    item.itemListElement ?? item.steps ?? item.recipeInstructions,
    depth + 1,
  );
}

function createInstruction(
  text: string,
  stepIndex: number,
  source: FieldSource,
  location: string,
): ExtractedInstruction {
  return {
    text: normalizeInstructionText(text),
    stepIndex,
    source,
    confidence: SOURCE_CONFIDENCE[source],
    location,
  };
}

function normalizeInstructionText(value: string): string {
  return normalizeText(
    value
      .replace(/<img\b[^>]*>/gi, ' ')
      .replace(/<\/?(?:picture|source)\b[^>]*>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  );
}

function isLikelyInstructionText(value: string): boolean {
  const text = normalizeInstructionText(value);
  if (!text || text.length < 2) return false;
  if (/^(?:шаг|step)\s*\d+$/i.test(text)) return false;
  if (/^\d+(?:[.,]\d+)?$/.test(text)) return false;
  if (/^(?:шаг|step)\s*\d+\s*[:.-]?\s*$/i.test(text)) return false;
  if (/^[\d\s\p{P}\p{S}]+$/u.test(text)) return false;
  return true;
}

function deduplicateInstructions(
  instructions: ExtractedInstruction[],
): ExtractedInstruction[] {
  const seen = new Set<string>();
  return instructions.filter((instruction) => {
    const text = normalizeInstructionText(instruction.text);
    if (!text || !isLikelyInstructionText(text)) return false;
    const key = text.replace(/\s+/g, ' ').trim().toLocaleLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
