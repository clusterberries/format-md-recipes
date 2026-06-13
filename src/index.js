import { parseOptions } from './cli.js';
import { runFormatter } from './formatter.js';

export async function run() {
  const options = parseOptions();
    await runFormatter(options);
}
