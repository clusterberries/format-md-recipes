import { parseOptions } from './cli.ts';
import { runFormatter } from './formatter.ts';

export async function run() {
  const options = parseOptions();
  await runFormatter(options);
}
