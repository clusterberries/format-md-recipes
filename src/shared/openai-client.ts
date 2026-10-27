import OpenAI from 'openai';

const REQUEST_TIMEOUT_MS = 120_000;

export interface OpenAIRequestOptions {
  systemPrompt?: string;
  maxCompletionTokens?: number;
}

export async function callOpenAI(
  prompt: string,
  model: string,
  options: OpenAIRequestOptions = {},
) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'OPENAI_API_KEY is required. Set it in your environment or in a .env file.',
    );
  }

  const client = new OpenAI({ apiKey, timeout: REQUEST_TIMEOUT_MS });
  const completion = await client.chat.completions.create({
    model,
    messages: [
      {
        role: 'system',
        content: options.systemPrompt ?? 'You are a markdown formatter.',
      },
      { role: 'user', content: prompt },
    ],
    // temperature: 0.2,
    max_completion_tokens: options.maxCompletionTokens ?? 3000,
  });

  const choice = completion.choices?.[0];
  if (choice?.message?.refusal) {
    throw new Error(`The model refused the request: ${choice.message.refusal}`);
  }
  // A cut-off response can still look valid, so it must never be used.
  if (choice?.finish_reason === 'length') {
    throw new Error(
      'The model response was truncated (max_completion_tokens reached).',
    );
  }

  return (choice?.message?.content ?? '').trim();
}
