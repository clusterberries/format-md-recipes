import { parseOptions } from './cli.ts';
import { runFormatter } from './list-formatter.ts';

export async function run() {
  const options = parseOptions();
    await runFormatter(options);
}
