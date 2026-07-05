import path from 'path';
import { program } from 'commander';
import type { CliOptions } from './types.ts';

export function parseOptions(): CliOptions {
  program
    .name('format-md')
    .description('Format or convert Markdown files or folders using OpenAI')
    .requiredOption('-i, --input <path>', 'input markdown file or directory')
    .option(
      '-o, --output <file>',
      'output file path; defaults to stdout when omitted',
    )
    .option(
      '-d, --dest <folder>',
      'output directory for input folder or input file',
    )
    .option(
      '--rewrite',
      'rewrite the original file(s) in place instead of writing to a new file or folder',
    )
    .option(
      '--formatted-prefix',
      'create a new formatted file in the same folder with prefix formatted-',
    )
    .option('--dry-run', 'print output to stdout without writing a file')
    .parse(process.argv);

  const options = program.opts();

  if (options.output && options.dest) {
    throw new Error('Cannot use both --output and --dest at the same time.');
  }

  if (options.rewrite && (options.output || options.dest)) {
    throw new Error('Cannot use --rewrite with --output or --dest.');
  }

  if (
    options.formattedPrefix &&
    (options.output || options.dest || options.rewrite)
  ) {
    throw new Error(
      'Cannot use --formatted-prefix with --output, --dest, or --rewrite.',
    );
  }

  return {
    inputPath: path.resolve(options.input),
    output: options.output ? path.resolve(options.output) : null,
    dest: options.dest ? path.resolve(options.dest) : null,
    rewrite: Boolean(options.rewrite),
    formattedPrefix: Boolean(options.formattedPrefix),
    dryRun: Boolean(options.dryRun),
  };
}
