import { parseOptions } from './cli.ts';
import { runUrlContentFormatter } from './url-content-formatter.ts';
import { runBatch } from './batch.ts';
import { enableConsoleLogging, logInfo } from './logger.ts';

export async function run() {
  const options = parseOptions();
  enableConsoleLogging();
  logInfo('=== Run started ===');
  if ('inputFile' in options) {
    await runBatch(options);
  } else {
    await runUrlContentFormatter(options);
  }
}
