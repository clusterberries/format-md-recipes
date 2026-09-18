import { parseOptions } from './cli.ts';
import { runUrlContentFormatter } from './url-content-formatter.ts';
import { runBatch } from './batch.ts';

export async function run() {
  const options = parseOptions();
  if ('inputFile' in options) {
    await runBatch(options);
  } else {
    await runUrlContentFormatter(options);
  }
}
