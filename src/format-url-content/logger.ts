import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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

export function logInfo(message: string): void {
  getLogger().info(message);
}

export function logProgress(message: string): void {
  logInfo(message);
  if (consoleLoggingEnabled) process.stdout.write(`${message}\n`);
}

export function logWarning(message: string): void {
  getLogger().warn(message);
}

export function logSuccess(message: string): void {
  getLogger().info(message);
}

export function logError(message: string): void {
  getLogger().error(message);
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
