import path from 'path';
import { program } from 'commander';
import type { CliOptions } from './types.ts';

export function parseOptions(): CliOptions {
  program
    .name('format-url-content')
    .description('Fetch URL content and parse it using OpenAI')
    .requiredOption('-i, --input <url>', 'url to download and parse content from')
    .option(
      '-o, --output <file>',
      'output file path; defaults to stdout when omitted',
    )
    .parse(process.argv);

  const options = program.opts();

  return {
    inputUrl: options.input,
    output: options.output ? path.resolve(options.output) : null,
  };
}
