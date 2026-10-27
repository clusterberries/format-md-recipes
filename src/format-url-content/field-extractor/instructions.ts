import type {
  ExtractedInstruction,
  ExtractedPageSources,
  FieldSource,
} from '../types.ts';
import { normalizeText } from '../utils/dom-helpers.ts';
import { flattenSchemaInstructions } from '../utils/schema-instructions.ts';
import { SOURCE_CONFIDENCE } from './constants.ts';

export function extractInstructions(
  sources: ExtractedPageSources,
): ExtractedInstruction[] {
  const instructions: ExtractedInstruction[] = [];

  sources.jsonLd.forEach((recipe, recipeIndex) => {
    flattenSchemaInstructions(recipe.recipeInstructions).forEach(
      (step, index) => {
        const text = step.text;
        if (typeof text !== 'string') return;
        const normalized = normalizeInstructionText(text);
        if (!isLikelyInstructionText(normalized)) return;
        instructions.push(
          createInstruction(
            normalized,
            index,
            'json-ld',
            `json-ld-${recipeIndex}.recipeInstructions[${index}]`,
          ),
        );
      },
    );
  });

  [...sources.microdata, ...sources.recipeHtml].forEach((candidate) => {
    candidate.instructions.forEach((text, index) => {
      const normalized = normalizeInstructionText(text);
      if (!isLikelyInstructionText(normalized)) return;
      instructions.push(
        createInstruction(
          normalized,
          index,
          candidate.source,
          `${candidate.location}.instructions[${index}]`,
        ),
      );
    });
  });

  return instructions;
}

function createInstruction(
  normalizedText: string,
  stepIndex: number,
  source: FieldSource,
  location: string,
): ExtractedInstruction {
  return {
    text: normalizedText,
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

function isLikelyInstructionText(text: string): boolean {
  if (!text || text.length < 2) return false;
  if (/^\d+(?:[.,]\d+)?$/.test(text)) return false;
  if (/^(?:шаг|step)\s*\d+\s*[:.-]?\s*$/i.test(text)) return false;
  if (/^[\d\s\p{P}\p{S}]+$/u.test(text)) return false;
  return true;
}
