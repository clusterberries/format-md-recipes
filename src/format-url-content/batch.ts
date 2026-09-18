import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { BatchOptions } from './cli.ts';
import { runUrlContentFormatter } from './url-content-formatter.ts';
import { assertSafeUrl } from './utils/url-guard.ts';

function safeName(value: string): string {
  const name = Array.from(value.replace(/[<>:"/\\|?*\p{Cc}]/gu, '-').trim())
    .slice(0, 100)
    .join('')
    .replace(/[. ]+$/u, '');
  return /^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/iu.test(name)
    ? `_${name}`
    : name;
}

function outputName(title: string, inputUrl: string): string {
  if (safeName(title)) return safeName(title);
  const url = new URL(inputUrl);
  let segment = url.pathname.split('/').filter(Boolean).pop() ?? '';
  try {
    segment = decodeURIComponent(segment);
  } catch {
    // Keep the original segment if its percent encoding is malformed.
  }
  return (
    safeName(segment.replace(/\.(html?|php|aspx?)$/iu, '')) ||
    safeName(url.hostname)
  );
}

async function saveMarkdown(dest: string, name: string, markdown: string) {
  for (let suffix = 1; ; suffix++) {
    const output = path.join(
      dest,
      `${name}${suffix === 1 ? '' : `-${suffix}`}.md`,
    );
    try {
      await writeFile(output, markdown, { encoding: 'utf8', flag: 'wx' });
      console.log(`Saved to ${output}`);
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
  }
}

export async function runBatch(options: BatchOptions) {
  const text = await readFile(options.inputFile, 'utf8');
  const seen = new Set<string>();
  const entries = text.split(/\r?\n/u).flatMap((line, index) => {
    const url = line.trim();
    if (!url || url.startsWith('#') || seen.has(url)) return [];
    seen.add(url);
    return [{ url, line: index + 1 }];
  });
  if (!entries.length) throw new Error('The input file contains no URLs.');
  await mkdir(options.dest, { recursive: true });

  const failures: string[] = [];
  let successful = 0;
  for (const [index, entry] of entries.entries()) {
    console.log(`[${index + 1}/${entries.length}] Processing ${entry.url}`);
    try {
      assertSafeUrl(entry.url);
      await runUrlContentFormatter(
        {
          inputUrl: entry.url,
          output: null,
          noAi: options.noAi,
          mainImageOnly: options.mainImageOnly,
        },
        (title, markdown) =>
          saveMarkdown(options.dest, outputName(title, entry.url), markdown),
      );
      successful++;
    } catch (error) {
      const failure = `Line ${entry.line}: ${entry.url} — ${error instanceof Error ? error.message : String(error)}`;
      failures.push(failure);
      console.error(failure);
    }
  }
  console.log(
    `Finished: ${successful} of ${entries.length} successful, ${failures.length} failure${failures.length === 1 ? '' : 's'}.`,
  );
  if (failures.length) {
    console.error(`Failed URLs:\n${failures.join('\n')}`);
    process.exitCode = 1;
  }
}
