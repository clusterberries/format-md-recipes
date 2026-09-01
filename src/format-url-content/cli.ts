import path from 'path';
import { program } from 'commander';
import type { CliOptions } from './types.ts';
import { assertSafeUrl } from './utils/url-guard.ts';

interface CommanderOptions {
  input: string;
  output?: string;
  ai?: boolean;
  mainImageOnly?: boolean;
}

export function parseOptions(): CliOptions {
  program
    .name('format-url-content')
    .description('Fetch URL content and parse it using OpenAI')
    .requiredOption(
      '-i, --input <url>',
      'url to download and parse content from',
    )
    .option(
      '-o, --output <file>',
      'output file path; defaults to stdout when omitted',
    )
    .option('--no-ai', 'disable conditional AI conflict resolution')
    .option(
      '--main-image-only',
      'include only the main image (skip step images); main image is placed at the bottom',
    )
    .parse(process.argv);

  const options = program.opts<CommanderOptions>();

  try {
    assertSafeUrl(options.input);
  } catch (error) {
    program.error(error instanceof Error ? error.message : String(error));
  }

  return {
    inputUrl: options.input,
    output: options.output ? path.resolve(options.output) : null,
    noAi: options.ai === false,
    mainImageOnly: Boolean(options.mainImageOnly),
  };
}
