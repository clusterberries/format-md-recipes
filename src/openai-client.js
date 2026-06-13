import OpenAI from 'openai';

export async function callOpenAI(prompt, model) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is required. Set it in your environment or in a .env file.');
  }

  const client = new OpenAI({ apiKey });
  const completion = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: 'You are a markdown formatter.' },
      { role: 'user', content: prompt },
    ],
    temperature: 0.2,
    max_completion_tokens: 2000,
  });

  const content = completion.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('OpenAI returned an empty response.');
  }

  return content.trim();
}
