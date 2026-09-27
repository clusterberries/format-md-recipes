import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
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
import {
  createRecipeServer,
  encodingFixtures,
  fixtures,
} from './helpers/recipe-server.ts';

const execFileAsync = promisify(execFile);
const projectRoot = process.cwd();
const fixturesDirectory = path.join(projectRoot, 'tests', 'fixtures');
const cliPath = path.join(projectRoot, 'src', 'format-url-content.ts');
// CLI startup can exceed Vitest's default 5s on a busy machine.
const cliTimeout = 25_000;
const testTimeout = 30_000;

const { server, startServer } = createRecipeServer();

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
      {
        cwd: projectRoot,
        timeout: cliTimeout,
        env: {
          ...process.env,
          // Fixture server runs on 127.0.0.1; opt into the SSRF guard's local-host allowance for tests only.
          FORMAT_URL_CONTENT_ALLOW_PRIVATE_HOSTS: '1',
        },
      },
    );

    const [actual, expected] = await Promise.all([
      readFile(outputPath, 'utf8'),
      readFile(expectedPath, 'utf8'),
    ]);

    expect(normalizeMarkdown(actual)).toBe(
      normalizeMarkdown(
        expected
          .replaceAll('{{PAGE_URL}}', fixtureUrl)
          .replaceAll('{{ORIGIN}}', `http://127.0.0.1:${port}`),
      ),
    );
  }

  it(
    'records the final URL after a redirect',
    async () => {
      await runAndCompare(
        'redirect-recipe',
        path.join(fixturesDirectory, 'source-redirect.md'),
      );
    },
    testTimeout,
  );

  describe('default image mode', () => {
    it.each(fixtures)(
      'converts %s into the expected Markdown file',
      async (fixture) => {
        const expectedPath = path.join(fixturesDirectory, `${fixture}.md`);
        await runAndCompare(fixture, expectedPath);
      },
      testTimeout,
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
      testTimeout,
    );
  });

  describe('HTTP encoding', () => {
    it.each(encodingFixtures)(
      'converts $name into readable Markdown',
      async ({ name }) => {
        await runAndCompare(
          name,
          path.join(fixturesDirectory, 'encoding-recipe.md'),
        );
      },
      testTimeout,
    );
  });
});
