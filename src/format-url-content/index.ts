import { parseOptions } from './cli.ts';
import { runUrlContentFormatter } from './url-content-formatter.ts';

export async function run() {
  const options = parseOptions();
  await runUrlContentFormatter(options);
}
