import { writeFile } from '../shared/file-utils.ts';
import { buildPrompt } from './prompt-builder.ts';
import { callOpenAI } from '../shared/openai-client.ts';
import { MINI_MODEL } from '../shared/constants.ts';
import type { CliOptions } from './types.ts';
import { logWarning } from '../shared/utils.ts';
import { parseRecipePage } from './page-parser.ts';

async function formatWithOpenAI(inputText: string, inputUrl: string) {
  let formatted = '';

  if (!inputText || inputText.trim() === '') {
    logWarning(`Content is empty for ${inputUrl}.`);
    formatted = '';
  } else {
    const prompt = buildPrompt(inputText);
    formatted = await callOpenAI(prompt, MINI_MODEL);

    if (formatted === '') {
      logWarning(`OpenAI returned no content for ${inputUrl}.`);
    }
  }

  process.stdout.write(formatted + '\n');

  return formatted;
}

// TODO: convert to MD, remove unnecessary info if possible
// TODO: send to OpenAI for formatting and update prompt
// TODO: support multiple URLs in a single run
export async function runUrlContentFormatter(options: CliOptions) {
  const { inputUrl, output } = options;

  try {
    const content = await parseRecipePage(inputUrl);

    if (content) {
      if (output) {
        writeFile(output, content.article?.contentHtml ?? '');
        console.log(`✅ Saved to ${output}`);
      } else {
        console.log('✅ Output sent to stdout.');
        console.log({
          recipe: content.recipe,
          title: content?.article?.title ?? null,
          excerpt: content?.article?.excerpt ?? null,
        });
      }
    }
  } catch (error: any) {
    throw new Error(`Error formatting ${inputUrl}: ${error.message}`);
  }
}
