import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspect } from 'node:util';
import winston from 'winston';

export function getLogFile(): string {
  return path.resolve(
    process.env.FORMAT_URL_CONTENT_LOG_FILE ??
      fileURLToPath(
        new URL('../../logs/format-url-content.log', import.meta.url),
      ),
  );
}

let logger: winston.Logger | undefined;
let consoleLoggingEnabled = false;

function getLogger(): winston.Logger {
  if (!logger) {
    const logFile = getLogFile();
    mkdirSync(path.dirname(logFile), { recursive: true });
    logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(
          ({ timestamp, level, message }) =>
            `${String(timestamp)} [${level.toUpperCase()}] ${String(message)}`,
        ),
      ),
      transports: [
        new winston.transports.File({
          filename: logFile,
          maxsize: 5 * 1024 * 1024,
          maxFiles: 4,
          tailable: true,
        }),
      ],
    });
    logger.on('error', (error: Error) => {
      process.stderr.write(`Could not write to ${logFile}: ${error.message}\n`);
      process.exitCode = 1;
    });
  }
  return logger;
}

export function enableConsoleLogging(): void {
  if (consoleLoggingEnabled) return;
  getLogger().add(
    new winston.transports.Console({
      level: 'warn',
      stderrLevels: ['warn', 'error'],
      format: winston.format.printf(({ level, message }) => {
        const firstLine = String(message).split(/\r?\n/u, 1)[0] ?? '';
        return `${level.toUpperCase()}: ${level === 'error' ? firstLine.replace(/^Error: /u, '') : firstLine}`;
      }),
    }),
  );
  consoleLoggingEnabled = true;
}

export function isConsoleLoggingEnabled(): boolean {
  return consoleLoggingEnabled;
}

function withDetails(message: string, details?: unknown): string {
  if (details === undefined) return message;
  if (details instanceof Error)
    return `${message}\n${inspect(details, { depth: null, colors: false })}`;
  try {
    const json = JSON.stringify(details, null, 2);
    if (json !== undefined) return `${message}\n${json}`;
  } catch {
    // Circular references and BigInt cannot be serialized as JSON.
  }
  return `${message}\n${inspect(details, { depth: null, colors: false })}`;
}

export function logInfo(message: string, details?: unknown): void {
  getLogger().info(withDetails(message, details));
}

export function logProgress(message: string, details?: unknown): void {
  logInfo(message, details);
  if (consoleLoggingEnabled) process.stdout.write(`${message}\n`);
}

export function logWarning(message: string, details?: unknown): void {
  getLogger().warn(withDetails(message, details));
}

export function logSuccess(message: string, details?: unknown): void {
  getLogger().info(withDetails(message, details));
}

export function logError(message: string, details?: unknown): void {
  getLogger().error(withDetails(message, details));
}

export async function closeLogger(): Promise<void> {
  if (!logger) return;
  const activeLogger = logger;
  await new Promise<void>((resolve, reject) => {
    activeLogger.once('finish', resolve);
    activeLogger.once('error', reject);
    activeLogger.end();
  });
  logger = undefined;
  consoleLoggingEnabled = false;
}
