import path from 'path';
import { program } from 'commander';
import type { FormatListCliOptions } from './types.ts';

export function parseOptions(): FormatListCliOptions {
  program
    .name('format-list')
    .description('Format list of words in specific way')
    .requiredOption('-i, --input <path>', 'input file')
    .option('--dry-run', 'print output to stdout without writing a file')
    .parse(process.argv);

  const options = program.opts();

  return {
    inputPath: path.resolve(options.input),
    dryRun: Boolean(options.dryRun),
  };
}
