import path from 'path';
import { program } from 'commander';

const DEFAULT_MODEL = 'gpt-4o-mini';

export function parseOptions() {
  program
    .name('format-md')
    .description('Format or convert Markdown files or folders using OpenAI')
    .requiredOption('-i, --input <path>', 'input markdown file or directory')
    .option('-o, --output <file>', 'output file path; defaults to stdout when omitted')
    .option('-d, --dest <folder>', 'output directory for input folder or input file')
    .option('-m, --model <model>', 'OpenAI model to use', DEFAULT_MODEL)
    .option('--dry-run', 'print output to stdout without writing a file')
    .parse(process.argv);

  const options = program.opts();

  if (options.output && options.dest) {
    throw new Error('Cannot use both --output and --dest at the same time.');
  }

  return {
    inputPath: path.resolve(options.input),
    output: options.output ? path.resolve(options.output) : null,
    dest: options.dest ? path.resolve(options.dest) : null,
    model: options.model || DEFAULT_MODEL,
    dryRun: Boolean(options.dryRun),
  };
}
