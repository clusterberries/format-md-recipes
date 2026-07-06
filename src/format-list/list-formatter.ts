import path from 'path';
import { readFile, writeFile } from '../shared/file-utils.ts';
import type { FormatListCliOptions } from './types.ts';
import { logWarning } from '../shared/utils.ts';

export function formatText(text: string): string {
  const blocks = text
    .replace(/\r\n?/g, '\n')
    .trim()
    .split(/\n(?:[ \t]*\n)+/)
    .map((block) =>
      block
        .split('\n')
        .map((line) => line.trim().replace(/\s*-\s*/g, ', '))
        .filter(Boolean)
        .join('; '),
    )
    .filter(Boolean);

  const result: string[] = [];

  for (let i = 0; i < blocks.length; i += 2) {
    const left = blocks[i] ?? '';
    const right = blocks[i + 1] ?? '';
    result.push(right ? `${left} - ${right}` : left);
  }

  return result.join('\n');
}

async function formatSingleFile(inputPath: string, dryRun: boolean) {
  const inputText = await readFile(inputPath);
  let formatted = '';

  if (!inputText || inputText.trim() === '') {
    logWarning(`Input file is empty: ${inputPath}.`);
    formatted = '';
  } else {
    console.log(`Formatting file: ${inputPath}`);
    formatted = formatText(inputText);
  }

  if (dryRun) {
    console.log(`\n=== Dry run preview: \n${formatted}\n===\n`);
    return null;
  }

  await writeFile(inputPath, formatted);

  return inputPath;
}

export async function runFormatter(options: FormatListCliOptions) {
  const { inputPath, dryRun } = options;

  if (!path.isAbsolute(inputPath)) {
    throw new Error(`Input path must be absolute: ${inputPath}`);
  }

  try {
    const written = await formatSingleFile(inputPath, dryRun);

    if (!dryRun) {
      if (written) {
        console.log('✅ File formatted.');
      }
    } else {
      console.log('✅ Dry run complete.');
    }
  } catch (error: any) {
    throw new Error(`Error formatting ${inputPath}: ${error.message}`);
  }
}
