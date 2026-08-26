import 'dotenv/config';

export const FULL_MODEL = process.env.OPENAI_MODEL_FULL ?? 'gpt-5.5';
export const MEDIUM_MODEL = process.env.OPENAI_MODEL_MEDIUM ?? 'gpt-5.4';
export const MINI_MODEL = process.env.OPENAI_MODEL_MINI ?? 'gpt-5.4-mini';

// 'gpt-5.5' - good, precise, but slow
// 'gpt-4.1' - in general not bad, but didn't move some notes to appropriate sections
// 'gpt-5.4' and 'gpt-5.4-mini' - made some mistakes in formatting, but overall good