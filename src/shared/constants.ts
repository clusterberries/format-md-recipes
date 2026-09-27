import 'dotenv/config';

export const FULL_MODEL = process.env.OPENAI_MODEL_FULL ?? 'gpt-6-sol';
export const MEDIUM_MODEL = process.env.OPENAI_MODEL_MEDIUM ?? 'gpt-6-sol';
export const MINI_MODEL = process.env.OPENAI_MODEL_MINI ?? 'gpt-6-luna';
