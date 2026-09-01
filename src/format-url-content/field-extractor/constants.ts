import type { FieldSource } from '../types.ts';

export const SOURCE_CONFIDENCE: Record<FieldSource, number> = {
  'json-ld': 0.9,
  microdata: 0.85,
  html: 0.8,
  form: 0.7,
  readability: 0.6,
  metadata: 0.5,
};
