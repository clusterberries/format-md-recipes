import path from 'path';
import {
  DEFAULT_IMAGES_FOLDER,
  validateImagesFolder,
} from './utils/images-folder.ts';
import { program } from 'commander';
import type { CliOptions } from './types.ts';
import { assertSafeUrl } from './utils/url-guard.ts';

interface CommanderOptions {
  input?: string;
  inputFile?: string;
  dest?: string;
  output?: string;
  ai?: boolean;
  mainImageOnly?: boolean;
  downloadImages?: boolean;
  imagesFolder: string;
}

export interface BatchOptions {
  inputFile: string;
  dest: string;
  noAi: boolean;
  mainImageOnly: boolean;
  downloadImages: boolean;
  imagesFolder: string;
}

export function parseOptions(): CliOptions | BatchOptions {
  program
    .name('format-url-content')
    .description('Fetch URL content and parse it using OpenAI')
    .option('-i, --input <url>', 'url to download and parse content from')
    .option('--input-file <file>', 'UTF-8 file containing one URL per line')
    .option('-d, --dest <folder>', 'output directory for a URL list')
    .option(
      '-o, --output <file>',
      'output file path; defaults to stdout when omitted',
    )
    .option(
      '--download-images',
      'save selected images beside the note and use local links',
    )
    .option(
      '--images-folder <name>',
      'images folder name beside the notes (used with --download-images)',
      DEFAULT_IMAGES_FOLDER,
    )
    .option('--no-ai', 'disable conditional AI conflict resolution')
    .option(
      '--main-image-only',
      'include only the main image (skip step images); main image is placed at the bottom',
    )
    .parse(process.argv);

  const options = program.opts<CommanderOptions>();
  try {
    validateImagesFolder(options.imagesFolder);
  } catch (error) {
    program.error(error instanceof Error ? error.message : String(error));
  }

  if (Boolean(options.input) === Boolean(options.inputFile)) {
    program.error('Specify exactly one of --input or --input-file.');
  }
  if (options.inputFile) {
    if (!options.dest || options.output) {
      program.error('--input-file requires --dest and cannot use --output.');
    }
    return {
      inputFile: path.resolve(options.inputFile),
      dest: path.resolve(options.dest),
      noAi: options.ai === false,
      mainImageOnly: Boolean(options.mainImageOnly),
      downloadImages: Boolean(options.downloadImages),
      imagesFolder: options.imagesFolder,
    };
  }
  if (options.dest) {
    program.error('--dest requires --input-file.');
  }
  if (options.downloadImages && !options.output) {
    program.error(
      '--download-images requires --output or --input-file with --dest.',
    );
  }
  const inputUrl = options.input!;

  try {
    assertSafeUrl(inputUrl);
  } catch (error) {
    program.error(error instanceof Error ? error.message : String(error));
  }

  return {
    inputUrl,
    output: options.output ? path.resolve(options.output) : null,
    noAi: options.ai === false,
    mainImageOnly: Boolean(options.mainImageOnly),
    downloadImages: Boolean(options.downloadImages),
    imagesFolder: options.imagesFolder,
  };
}
