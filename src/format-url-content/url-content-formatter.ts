import { writeFile } from '../shared/file-utils.ts';
import { buildPrompt } from './prompt-builder.ts';
import { callOpenAI } from '../shared/openai-client.ts';
import { MINI_MODEL } from '../shared/constants.ts';
import type { CliOptions } from './types.ts';
import { logWarning } from '../shared/utils.ts';
import { parseRecipePage } from './page-parser.ts';
import { cleanRecipeContent } from './html-cleaner/clean-content.ts';

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

export async function runUrlContentFormatter(options: CliOptions) {
  const { inputUrl, output } = options;

  try {
    const content = await parseRecipePage(inputUrl);

    if (content) {
      const originalContentHtml = content.article?.contentHtml?.trim() ?? '';
      const contentHtml = cleanRecipeContent(
        originalContentHtml,
        'recipe-only',
      );

      if (output) {
        if (!contentHtml || contentHtml.trim() === '') {
          logWarning(`Content is empty for ${inputUrl}.`);
        } else {
          writeFile(output, contentHtml);
          console.log(`✅ Saved to ${output}`);
        }
      } else {
        console.log('✅ Output sent to stdout.');
        console.log(
          JSON.stringify(
            {
              recipe: content.recipe,
              title: content.article?.title ?? null,
              excerpt: content.article?.excerpt ?? null,
              content: contentHtml ? `${contentHtml?.slice(0, 100)}...` : null, // Log the first 100 characters of the content
            },
            null,
            2,
          ),
        );
      }
    }
  } catch (error: any) {
    throw new Error(`Error formatting ${inputUrl}: ${error.message}`);
  }
}
