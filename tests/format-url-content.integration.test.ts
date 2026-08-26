import { execFile } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const projectRoot = process.cwd();
const fixturesDirectory = path.join(projectRoot, 'tests', 'fixtures');
const cliPath = path.join(projectRoot, 'src', 'format-url-content.ts');

const fixtures = ['basic-recipe-en', 'test1-ru', 'test2-ru'];

const server = createServer((request, response) => {
  const fixtureName = request.url?.slice(1);
  if (
    fixtureName &&
    fixtures.some((fixture) => `${fixture}.html` === fixtureName)
  ) {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    createReadStream(path.join(fixturesDirectory, fixtureName)).pipe(response);
    return;
  }

  response.writeHead(404);
  response.end();
});

function startServer(): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Could not determine fixture server port'));
        return;
      }
      resolve(address.port);
    });
  });
}

describe('format-url-content integration', () => {
  let port: number;

  beforeAll(async () => {
    port = await startServer();
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  it.each(fixtures)(
    'converts %s into the expected Markdown file',
    async (fixture) => {
      const outputDirectory = await mkdtemp(
        path.join(tmpdir(), 'format-url-content-'),
      );
      const outputPath = path.join(outputDirectory, 'result.md');
      const fixtureUrl = `http://127.0.0.1:${port}/${fixture}.html`;
      const expectedPath = path.join(fixturesDirectory, `${fixture}.md`);

      try {
        await execFileAsync(
          process.execPath,
          [cliPath, '-i', fixtureUrl, '--no-ai', '-o', outputPath],
          { cwd: projectRoot },
        );

        const [actual, expected] = await Promise.all([
          readFile(outputPath, 'utf8'),
          readFile(expectedPath, 'utf8'),
        ]);

        const normalizeMarkdown = (value: string) =>
          value.replace(/\r\n/g, '\n').replace(/\n$/, '');

        expect(normalizeMarkdown(actual)).toBe(normalizeMarkdown(expected));
      } finally {
        await rm(outputDirectory, { recursive: true, force: true });
      }
    },
  );
});
