#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { program } from 'commander';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function buildPrompt(content, options) {
  return `Convert and format this markdown into a clean recipe-style markdown document with ingredients, steps, and notes where appropriate.\n\nMarkdown input:\n\n${content}\n\nDeliver only markdown output with no additional explanation.`;
}

async function callOpenAI(prompt, model) {
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
    max_completion_tokens: 2000
  });

  const content = completion.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('OpenAI returned an empty response.');
  }

  return content.trim();
}

async function main() {
  program
    .name('format-md')
    .description('Format or convert Markdown files using OpenAI')
    .requiredOption('-i, --input <file>', 'input markdown file')
    .option('-o, --output <file>', 'output file path; defaults to stdout when omitted')
    .option('-m, --model <model>', 'OpenAI model to use', 'gpt-4o-mini')
    .option('--dry-run', 'print output to stdout without writing a file')
    .parse(process.argv);

  const options = program.opts();
  const inputFile = path.resolve(options.input);

  if (!fs.existsSync(inputFile)) {
    throw new Error(`Input file does not exist: ${inputFile}`);
  }

  const inputText = fs.readFileSync(inputFile, 'utf8');
  const prompt = buildPrompt(inputText, options);
  const formatted = await callOpenAI(prompt, options.model);

  if (options.output && !options.dryRun) {
    const outputPath = path.resolve(options.output);
    fs.writeFileSync(outputPath, formatted, 'utf8');
    console.log(`Formatted markdown written to ${outputPath}`);
  } else {
    process.stdout.write(formatted + '\n');
  }
}

main().catch((error) => {
  console.error('Error:', error.message);
  process.exit(1);
});
