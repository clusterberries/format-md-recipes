#!/usr/bin/env node
import dotenv from 'dotenv';
import { run } from './format-url-content/index.ts';
import {
  closeLogger,
  getLogFile,
  isConsoleLoggingEnabled,
  logError,
  logInfo,
} from './format-url-content/logger.ts';

dotenv.config();

async function main(): Promise<void> {
  try {
    await run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logError(error instanceof Error ? (error.stack ?? message) : message);
    if (!isConsoleLoggingEnabled()) process.stderr.write(`Error: ${message}\n`);
    process.stderr.write(`See log: ${getLogFile()}\n`);
    process.exitCode = 1;
  } finally {
    logInfo(`=== Run finished (exit code ${process.exitCode ?? 0}) ===`);
    await closeLogger();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(
    `Logging failed: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
