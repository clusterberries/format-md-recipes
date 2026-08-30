import { execFile } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';

const execFileAsync = promisify(execFile);
const projectRoot = process.cwd();
const fixturesDirectory = path.join(projectRoot, 'tests', 'fixtures');
const cliPath = path.join(projectRoot, 'src', 'format-url-content.ts');

const fixtures = [
  'basic-recipe-en',
  'test1-ru',
  'test2-ru',
  'test3-ru',
  'test4-ru',
  'test5-ru',
  'test6-ru',
  'ingredients-structures',
  'seo-cleanup',
  'page-noise',
  'no-recipe-article',
];

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

function normalizeMarkdown(value: string): string {
  return value.replace(/\r\n/g, '\n').replace(/\n$/, '');
}

describe('format-url-content integration', () => {
  let port: number;
  let outputDirectory: string;
  let outputPath: string;

  beforeAll(async () => {
    port = await startServer();
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  beforeEach(async () => {
    outputDirectory = await mkdtemp(path.join(tmpdir(), 'format-url-content-'));
    outputPath = path.join(outputDirectory, 'result.md');
  });

  afterEach(async () => {
    await rm(outputDirectory, { recursive: true, force: true });
  });

  async function runAndCompare(
    fixture: string,
    expectedPath: string,
    extraArgs: string[] = [],
  ): Promise<void> {
    const fixtureUrl = `http://127.0.0.1:${port}/${fixture}.html`;

    await execFileAsync(
      process.execPath,
      [cliPath, '-i', fixtureUrl, '--no-ai', ...extraArgs, '-o', outputPath],
      { cwd: projectRoot },
    );

    const [actual, expected] = await Promise.all([
      readFile(outputPath, 'utf8'),
      readFile(expectedPath, 'utf8'),
    ]);

    expect(normalizeMarkdown(actual)).toBe(normalizeMarkdown(expected));
  }

  describe('default image mode', () => {
    it.each(fixtures)(
      'converts %s into the expected Markdown file',
      async (fixture) => {
        const expectedPath = path.join(fixturesDirectory, `${fixture}.md`);
        await runAndCompare(fixture, expectedPath);
      },
    );
  });

  describe('--main-image-only', () => {
    const mainImageOnlyFixtures = ['test1-ru', 'test6-ru'];

    it.each(mainImageOnlyFixtures)(
      'converts %s into the expected Markdown file with --main-image-only',
      async (fixture) => {
        const expectedPath = path.join(
          fixturesDirectory,
          `${fixture}.main-image-only.md`,
        );
        await runAndCompare(fixture, expectedPath, ['--main-image-only']);
      },
    );
  });
});
