import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
  cp,
} from 'node:fs/promises';
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
  vi,
} from 'vitest';
import { runUrlContentFormatter } from '../src/format-url-content/url-content-formatter.ts';
import { runBatch } from '../src/format-url-content/batch.ts';
import {
  collectRenderedImages,
  downloadRecipeImages,
} from '../src/format-url-content/image-downloader.ts';
import { parseRecipePage } from '../src/format-url-content/parser/page-parser.ts';

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7S8AAAAASUVORK5CYII=',
  'base64',
);
const requests: string[] = [];
let baseUrl: string;
let directory: string;

function recipeHtml(main: string, step = '/step') {
  return `<html lang="ru"><head><meta charset="utf-8"><title>Суп (домашний)</title>
  <script type="application/ld+json">${JSON.stringify({
    '@type': 'Recipe',
    name: 'Суп (домашний)',
    image: main,
    recipeIngredient: ['2 tomatoes', '1 onion'],
    recipeInstructions: [
      { '@type': 'HowToStep', text: 'Chop the tomatoes.', image: step },
      { '@type': 'HowToStep', text: 'Cook the soup.' },
    ],
  })}</script></head><body><article><h1>Суп (домашний)</h1><p>A simple tomato soup for lunch.</p><img src="/unused" alt="A bowl of soup"></article></body></html>`;
}

const server = createServer((request, response) => {
  const url = request.url ?? '';
  requests.push(url);
  if (url.startsWith('/recipe')) {
    const main =
      new URL(url, 'http://example.com').searchParams.get('main') ??
      '/main?signature=keep';
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(recipeHtml(main));
  } else if (url === '/fallback') {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(
      '<html><head><title>Article</title><meta property="og:image" content="/main"></head><body><article><h1>Article</h1><p>This is an article about cooking and enjoying meals together. It contains no recipe instructions or ingredients.</p></article></body></html>',
    );
  } else if (url === '/no-images') {
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end(
      '<html><head><title>Article</title></head><body><article><p>A plain article with no images and enough text to read.</p></article></body></html>',
    );
  } else if (url === '/redirect') {
    response.writeHead(302, { location: '/main?redirected=yes' });
    response.end();
  } else if (url === '/fake') {
    response.writeHead(200, { 'content-type': 'image/png' });
    response.end('<html>This is an error page, not an image.</html>');
  } else if (url === '/large') {
    response.writeHead(200, {
      'content-type': 'image/png',
      'content-length': String(11 * 1024 * 1024),
    });
    response.end();
  } else if (url.startsWith('/main') || url === '/step') {
    response.writeHead(200, { 'content-type': 'image/png' });
    response.end(png);
  } else {
    response.writeHead(404);
    response.end();
  }
});

async function run(
  input = '/recipe',
  mainImageOnly = false,
  downloadImages = true,
  filename = 'Суп (домашний) #1.md',
) {
  const output = path.join(directory, filename);
  const result = await runUrlContentFormatter({
    inputUrl: baseUrl + input,
    output,
    noAi: true,
    mainImageOnly,
    downloadImages,
    imagesFolder: 'attachments',
  });
  return { output, result, markdown: await readFile(output, 'utf8') };
}

function imageLinks(markdown: string) {
  return [...markdown.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map(
    (match) => match[1]!,
  );
}

describe('local recipe images', () => {
  beforeAll(async () => {
    vi.stubEnv('FORMAT_URL_CONTENT_ALLOW_PRIVATE_HOSTS', '1');
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    const address = server.address();
    if (!address || typeof address === 'string')
      throw new Error('Missing server address');
    baseUrl = `http://127.0.0.1:${address.port}`;
  });
  afterAll(async () => {
    vi.unstubAllEnvs();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'recipe-images-'));
    requests.length = 0;
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(directory, { recursive: true, force: true });
  });

  it('downloads only rendered images, preserves bytes, and uses portable encoded links', async () => {
    const { markdown, result } = await run();
    const links = imageLinks(markdown);
    expect(result?.imageFailures).toBe(0);
    expect(links).toHaveLength(2);
    expect(requests).toContain('/main?signature=keep');
    expect(requests).not.toContain('/unused');
    expect(links[0]).toContain('%20%28');
    for (const link of links) {
      expect(link).not.toContain('\\');
      expect(
        await readFile(path.join(directory, decodeURIComponent(link))),
      ).toEqual(png);
    }
    expect(decodeURIComponent(links[0]!)).toMatch(
      /Суп \(домашний\) -1-main-[a-f0-9]+\.png$/,
    );
    expect(decodeURIComponent(links[1]!)).toContain('-step-01-');
    const moved = path.join(directory, 'relocated');
    await cp(
      path.join(directory, 'attachments'),
      path.join(moved, 'attachments'),
      { recursive: true },
    );
    for (const link of links)
      expect(
        await readFile(path.join(moved, decodeURIComponent(link))),
      ).toEqual(png);
  });

  it('downloads only the main image in main-image-only mode and keeps it before the source footer', async () => {
    const { markdown } = await run('/recipe', true);
    expect(imageLinks(markdown)).toHaveLength(1);
    expect(requests).not.toContain('/step');
    expect(markdown.trim()).toMatch(
      /!\[[^\]]+\]\([^)]+\)\n\n\[Source\]\(<[^>]+>\)$/,
    );
    expect(markdown).toContain(`[Source](<${baseUrl}/recipe>)`);
  });

  it('keeps remote mode unchanged and makes no image requests', async () => {
    const { markdown } = await run('/recipe', false, false);
    expect(imageLinks(markdown).every((link) => link.startsWith(baseUrl))).toBe(
      true,
    );
    expect(requests).toEqual(['/recipe']);
    expect(await readdir(directory)).toEqual(['Суп (домашний) #1.md']);
  });

  it.each(['/missing', '/fake', '/large'])(
    'retains remote URLs and saves the note on image failure: %s',
    async (main) => {
      const { markdown, result } = await run(
        `/recipe?main=${encodeURIComponent(main)}`,
      );
      expect(result?.imageFailures).toBe(1);
      expect(imageLinks(markdown)[0]).toBe(baseUrl + main);
      expect(
        await readFile(
          path.join(directory, decodeURIComponent(imageLinks(markdown)[1]!)),
        ),
      ).toEqual(png);
    },
  );

  it('follows image redirects and detects the extension from bytes', async () => {
    const { markdown } = await run('/recipe?main=/redirect', true);
    expect(requests).toContain('/main?redirected=yes');
    expect(imageLinks(markdown)[0]).toMatch(/\.png$/);
  });

  it('downloads the selected fallback image and handles pages without images', async () => {
    const { markdown } = await run('/fallback');
    expect(imageLinks(markdown)).toHaveLength(1);
    expect(
      await readFile(
        path.join(directory, decodeURIComponent(imageLinks(markdown)[0]!)),
      ),
    ).toEqual(png);
    const noImages = await run('/no-images', false, true, 'plain.md');
    expect(imageLinks(noImages.markdown)).toEqual([]);
    expect(noImages.result?.imageFailures).toBe(0);
  });

  it('deduplicates repeated rendered URLs without mutating source data', async () => {
    const page = await parseRecipePage(baseUrl + '/recipe');
    const recipe = page.reconciledRecipe;
    recipe.instructions.value[0]!.image = recipe.mainImage!;
    const images = collectRenderedImages(recipe, true);
    expect(images).toHaveLength(1);
    requests.length = 0;
    await downloadRecipeImages(images, path.join(directory, 'Soup.md'));
    expect(requests).toEqual(['/main?signature=keep']);
    expect(recipe.mainImage?.url).toBe(baseUrl + '/main?signature=keep');
  });

  it('reuses matching existing attachments and leaves no temporary files', async () => {
    const first = await run();
    const second = await run();
    expect(second.markdown).toBe(first.markdown);
    const attachment = path.dirname(
      path.join(directory, decodeURIComponent(imageLinks(first.markdown)[0]!)),
    );
    expect(await readdir(attachment)).toHaveLength(2);
    expect(
      (await readdir(directory)).some((name) => name.endsWith('.tmp')),
    ).toBe(false);
  });

  it('preserves a conflicting existing attachment and retains the remote URL', async () => {
    const first = await run('/recipe', true);
    const attachment = path.join(
      directory,
      decodeURIComponent(imageLinks(first.markdown)[0]!),
    );
    await writeFile(attachment, 'User-modified attachment');
    const second = await run('/recipe', true);
    expect(second.result?.imageFailures).toBe(1);
    expect(imageLinks(second.markdown)[0]).toBe(
      baseUrl + '/main?signature=keep',
    );
    expect(await readFile(attachment, 'utf8')).toBe('User-modified attachment');
    expect(
      (await readdir(path.dirname(attachment))).some((name) =>
        name.endsWith('.tmp'),
      ),
    ).toBe(false);
  });

  it('limits completed image responses across the whole recipe', async () => {
    const page = await parseRecipePage(baseUrl + '/recipe');
    const image = page.reconciledRecipe.mainImage!;
    const largePng = Buffer.alloc(10 * 1024 * 1024);
    png.copy(largePng);
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() =>
        Promise.resolve(
          new Response(largePng, { headers: { 'content-type': 'image/png' } }),
        ),
      );
    const images = Array.from({ length: 6 }, (_, index) => ({
      image: { ...image, url: `https://example.com/${index}` },
      postfix: `step-${index}`,
    }));
    const result = await downloadRecipeImages(
      images,
      path.join(directory, 'Budget.md'),
    );
    expect(fetch).toHaveBeenCalledTimes(5);
    expect(result.destinations.size).toBe(5);
    expect(result.failed).toBe(1);
  });

  it.each([undefined, 'Фото рецептов'])(
    'saves CLI images in one folder (%s)',
    async (imagesFolder) => {
      const output = path.join(directory, 'CLI.md');
      await promisify(execFile)(
        process.execPath,
        [
          'src/format-url-content.ts',
          '-i',
          baseUrl + '/recipe',
          '-o',
          output,
          '--no-ai',
          '--download-images',
          '--main-image-only',
          ...(imagesFolder ? ['--images-folder', imagesFolder] : []),
        ],
        {
          cwd: process.cwd(),
          env: { ...process.env, FORMAT_URL_CONTENT_ALLOW_PRIVATE_HOSTS: '1' },
        },
      );
      const links = imageLinks(await readFile(output, 'utf8'));
      expect(links).toHaveLength(1);
      const folder = imagesFolder ?? 'attachments';
      expect(decodeURIComponent(links[0]!)).toMatch(
        new RegExp(`^${folder}/CLI-main-[a-f0-9]+\\.png$`),
      );
      expect(
        (
          await readdir(path.join(directory, folder), { withFileTypes: true })
        ).every((entry) => entry.isFile()),
      ).toBe(true);
      expect(
        await readFile(path.join(directory, decodeURIComponent(links[0]!))),
      ).toEqual(png);
    },
  );

  it('uses the collision-resolved batch name and reports partially local notes', async () => {
    const inputFile = path.join(directory, 'urls.txt');
    await writeFile(
      inputFile,
      `${baseUrl}/recipe\n${baseUrl}/recipe?main=/missing\n${baseUrl}/recipe?main=/redirect\n`,
    );
    await writeFile(path.join(directory, 'Суп (домашний).md'), 'Existing note');
    await runBatch({
      inputFile,
      dest: directory,
      noAi: true,
      mainImageOnly: true,
      downloadImages: true,
      imagesFolder: 'images',
    });
    const markdown = await readFile(
      path.join(directory, 'Суп (домашний)-2.md'),
      'utf8',
    );
    expect(decodeURIComponent(imageLinks(markdown)[0]!)).toContain(
      'images/Суп (домашний)-2-main-',
    );
    const lastMarkdown = await readFile(
      path.join(directory, 'Суп (домашний)-4.md'),
      'utf8',
    );
    expect(decodeURIComponent(imageLinks(lastMarkdown)[0]!)).toContain(
      'images/Суп (домашний)-4-main-',
    );
    const images = await readdir(path.join(directory, 'images'), {
      withFileTypes: true,
    });
    expect(images).toHaveLength(2);
    expect(images.every((entry) => entry.isFile())).toBe(true);
    expect(
      await readFile(path.join(directory, 'Суп (домашний).md'), 'utf8'),
    ).toBe('Existing note');
  });

  it('rejects paths for the images folder name before fetching', async () => {
    await expect(
      promisify(execFile)(
        process.execPath,
        [
          'src/format-url-content.ts',
          '-i',
          'https://example.com/recipe',
          '-o',
          path.join(directory, 'recipe.md'),
          '--download-images',
          '--images-folder',
          '../images',
        ],
        { cwd: process.cwd() },
      ),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining(
        'Images folder must be a valid folder name, not a path.',
      ) as unknown,
    });
  });

  it('rejects download mode without an output destination', async () => {
    await expect(
      promisify(execFile)(
        process.execPath,
        [
          'src/format-url-content.ts',
          '-i',
          'https://example.com/recipe',
          '--download-images',
        ],
        { cwd: process.cwd() },
      ),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining(
        '--download-images requires --output',
      ) as unknown,
    });
  });
});
