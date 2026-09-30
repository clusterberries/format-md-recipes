import { mkdtempSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll } from 'vitest';
import { closeLogger } from '../src/format-url-content/logger.ts';

const logDirectory = mkdtempSync(
  path.join(tmpdir(), 'format-url-content-tests-'),
);
process.env.FORMAT_URL_CONTENT_LOG_FILE = path.join(logDirectory, 'run.log');

afterAll(async () => {
  await closeLogger();
  await rm(logDirectory, { recursive: true, force: true });
});
