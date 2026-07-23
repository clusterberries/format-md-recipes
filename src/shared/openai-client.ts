import OpenAI from 'openai';

export async function callOpenAI(prompt: string, model: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'OPENAI_API_KEY is required. Set it in your environment or in a .env file.',
    );
  }

  const client = new OpenAI({ apiKey });
  const completion = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: 'You are a markdown formatter.' },
      { role: 'user', content: prompt },
    ],
    // temperature: 0.2,
    max_completion_tokens: 3000,
  });

  const content = completion.choices?.[0]?.message?.content ?? '';

  return content.trim();
}
