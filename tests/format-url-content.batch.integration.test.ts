import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
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
import { createRecipeServer } from './helpers/recipe-server.ts';

const execFileAsync = promisify(execFile);
const projectRoot = process.cwd();
const fixturesDirectory = path.join(projectRoot, 'tests', 'fixtures');
const cliPath = path.join(projectRoot, 'src', 'format-url-content.ts');

const { server, startServer } = createRecipeServer();

function normalizeMarkdown(value: string): string {
  return value.replace(/\r\n/g, '\n').replace(/\n$/, '');
}

describe('format-url-content batch integration', () => {
  let port: number;
  let outputDirectory: string;

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
  });

  afterEach(async () => {
    await rm(outputDirectory, { recursive: true, force: true });
  });

  async function runBatchImport(lines: string[]) {
    const inputFile = path.join(outputDirectory, 'urls.txt');
    await writeFile(inputFile, `\uFEFF${lines.join('\r\n')}`, 'utf8');
    return execFileAsync(
      process.execPath,
      [
        cliPath,
        '--input-file',
        inputFile,
        '--dest',
        path.join(outputDirectory, 'recipes'),
        '--no-ai',
      ],
      {
        cwd: projectRoot,
        env: { ...process.env, FORMAT_URL_CONTENT_ALLOW_PRIVATE_HOSTS: '1' },
      },
    );
  }

  it('imports a URL list into separate files named after recipe titles', async () => {
    const first = `http://127.0.0.1:${port}/basic-recipe-en.html`;
    const { stdout } = await runBatchImport([
      '# Bookmarked recipes',
      first,
      '',
      `http://127.0.0.1:${port}/test1-ru.html`,
      first,
    ]);
    const dest = path.join(outputDirectory, 'recipes');
    expect((await readdir(dest)).sort()).toEqual(
      [
        'Tomato Soup.md',
        'Мелкая молодая картошка в духовке в кожуре целиком.md',
      ].sort(),
    );
    expect(
      normalizeMarkdown(
        await readFile(path.join(dest, 'Tomato Soup.md'), 'utf8'),
      ),
    ).toBe(
      normalizeMarkdown(
        await readFile(
          path.join(fixturesDirectory, 'basic-recipe-en.md'),
          'utf8',
        ),
      ),
    );
    expect(stdout).toContain('Finished: 2 of 2 successful, 0 failures.');
  });

  it('continues after a failed URL and reports batch results', async () => {
    await expect(
      runBatchImport([
        `http://127.0.0.1:${port}/missing.html`,
        `http://127.0.0.1:${port}/basic-recipe-en.html`,
      ]),
    ).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringContaining(
        'Finished: 1 of 2 successful, 1 failure.',
      ) as unknown,
      stderr: expect.stringContaining('missing.html') as unknown,
    });
    expect(
      await readFile(
        path.join(outputDirectory, 'recipes', 'Tomato Soup.md'),
        'utf8',
      ),
    ).toContain('# Tomato Soup');
  });
});
