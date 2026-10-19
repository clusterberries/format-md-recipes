import { createServer } from 'node:http';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
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
import { callOpenAI } from '../src/shared/openai-client.ts';
import { formatRecipeNote } from '../src/format-url-content/ai-formatter/index.ts';
import { shortenRecipeTitle } from '../src/format-url-content/ai-formatter/title.ts';
import { runBatch } from '../src/format-url-content/batch.ts';
import { runUrlContentFormatter } from '../src/format-url-content/url-content-formatter.ts';

vi.mock('../src/shared/openai-client.ts', () => ({ callOpenAI: vi.fn() }));
vi.mock('../src/shared/constants.ts', () => ({
  MINI_MODEL: 'mini',
  MEDIUM_MODEL: 'medium',
  FULL_MODEL: 'full',
}));

const imageTarget = '99%20images2/%D0%A1%D1%83%D0%BF-step-02-f3a4.jpg';

const note = `## Ингредиенты

- 2 помидора
- 1 луковица

## Приготовление

1. Нарежьте овощи.

   ![Шаг 1](${imageTarget})`;
// The model sees short ids instead of image paths.
const maskedNote = note.replace(imageTarget, 'image-1');

const frontmatter = `---
tags:
  - рецепты
  - суп
ингредиенты:
  - помидоры
  - лук
---`;
const formatted = `${frontmatter}\n\n${note}`;
const formattedMasked = `${frontmatter}\n\n${maskedNote}`;

const scout = (complexity: string, isRecipe = true) =>
  JSON.stringify({ isRecipe, complexity, reason: 'test' });

describe('AI note formatting', () => {
  beforeEach(() => {
    vi.mocked(callOpenAI).mockReset();
  });

  it.each([
    ['simple', 'mini'],
    ['moderate', 'medium'],
    ['complex', 'full'],
  ])('routes %s notes to the %s model', async (complexity, model) => {
    vi.mocked(callOpenAI)
      .mockResolvedValueOnce(scout(complexity))
      .mockResolvedValueOnce(formattedMasked);

    expect(await formatRecipeNote(note)).toBe(formatted);
    expect(callOpenAI).toHaveBeenCalledTimes(2);
    expect(vi.mocked(callOpenAI).mock.calls[0]?.[1]).toBe('mini');
    expect(vi.mocked(callOpenAI).mock.calls[1]?.[1]).toBe(model);
    expect(vi.mocked(callOpenAI).mock.calls[1]?.[0]).toBe(maskedNote);
  });

  it('unwraps a code fence and normalizes tags', async () => {
    const response = `\`\`\`markdown
---
tags:
  - суп
  - придуманный_тег
ингредиенты:
  - "помидоры: свежие"
---
${maskedNote}
\`\`\``;
    vi.mocked(callOpenAI)
      .mockResolvedValueOnce(scout('simple'))
      .mockResolvedValueOnce(response);

    const result = await formatRecipeNote(note);
    expect(result).toContain('tags:\n  - рецепты\n  - суп\nингредиенты:');
    expect(result).not.toContain('придуманный_тег');
    expect(result).toContain('  - "помидоры: свежие"');
  });

  it('keeps the note when the scout says it is not a recipe', async () => {
    vi.mocked(callOpenAI).mockResolvedValueOnce(scout('simple', false));

    expect(await formatRecipeNote(note)).toBe(note);
    expect(callOpenAI).toHaveBeenCalledOnce();
  });

  it('keeps the note when the scout response is malformed', async () => {
    vi.mocked(callOpenAI).mockResolvedValueOnce('not json');

    expect(await formatRecipeNote(note)).toBe(note);
    expect(callOpenAI).toHaveBeenCalledOnce();
  });

  it.each([
    ['empty output', ''],
    ['missing frontmatter', maskedNote],
    [
      'missing ingredients field',
      `---\ntags:\n  - рецепты\n---\n\n${maskedNote}`,
    ],
    ['lost image', formattedMasked.replace('![Шаг 1](image-1)', '')],
    [
      'rewritten image path',
      formattedMasked.replace('image-1', decodeURIComponent(imageTarget)),
    ],
    ['missing sections', '---\nингредиенты:\n  - лук\n---\n\nТолько текст'],
  ])('keeps the note on invalid output: %s', async (_name, response) => {
    vi.mocked(callOpenAI)
      .mockResolvedValueOnce(scout('simple'))
      .mockResolvedValueOnce(response);

    expect(await formatRecipeNote(note)).toBe(note);
  });

  it('keeps the note when the API fails', async () => {
    vi.mocked(callOpenAI).mockRejectedValue(new Error('API unavailable'));

    expect(await formatRecipeNote(note)).toBe(note);
  });

  it('does not call the API for oversized content', async () => {
    expect(await formatRecipeNote('x'.repeat(30_001))).toHaveLength(30_001);
    expect(callOpenAI).not.toHaveBeenCalled();
  });
});

const longTitle = 'Томатный суп: пошаговый рецепт с фото';

describe('AI title shortening', () => {
  beforeEach(() => {
    vi.mocked(callOpenAI).mockReset();
  });

  it('returns the shortened title', async () => {
    vi.mocked(callOpenAI).mockResolvedValueOnce('"Томатный суп."\nПояснение');

    expect(await shortenRecipeTitle(longTitle)).toBe('Томатный суп');
    expect(vi.mocked(callOpenAI).mock.calls[0]?.[0]).toBe(longTitle);
    expect(vi.mocked(callOpenAI).mock.calls[0]?.[1]).toBe('mini');
  });

  it.each([
    [
      'Как приготовить пасту болоньезе с фаршем по итальянскому рецепту',
      'Паста болоньезе с фаршем',
    ],
    ['Пирог со свежими персиками и творогом', 'Пирог с персиками и творогом'],
  ])('accepts changed word endings: %s', async (original, shortened) => {
    vi.mocked(callOpenAI).mockResolvedValueOnce(shortened);

    expect(await shortenRecipeTitle(original)).toBe(shortened);
  });

  it.each([
    ['empty response', ''],
    ['invented words', 'Овощной суп'],
    ['too long', `Томатный суп ${'суп '.repeat(30)}`],
  ])('keeps the original title on %s', async (_name, response) => {
    vi.mocked(callOpenAI).mockResolvedValueOnce(response);

    expect(await shortenRecipeTitle(longTitle)).toBe(longTitle);
  });

  it('keeps the original title when the API fails', async () => {
    vi.mocked(callOpenAI).mockRejectedValue(new Error('API unavailable'));

    expect(await shortenRecipeTitle(longTitle)).toBe(longTitle);
  });

  it('does not call the API for empty or oversized titles', async () => {
    expect(await shortenRecipeTitle('  ')).toBe('  ');
    expect(await shortenRecipeTitle('с'.repeat(301))).toHaveLength(301);
    expect(callOpenAI).not.toHaveBeenCalled();
  });
});

const buildRecipePage = (
  name: string,
) => `<html lang="ru"><head><title>${name}</title>
  <script type="application/ld+json">${JSON.stringify({
    '@type': 'Recipe',
    name,
    recipeIngredient: ['2 помидора', '1 луковица'],
    recipeInstructions: ['Нарежьте овощи.', 'Тушите до мягкости.'],
  })}</script></head><body><article><h1>${name}</h1></article></body></html>`;

describe('AI note formatting in the pipeline', () => {
  const server = createServer((request, response) => {
    response.setHeader('content-type', 'text/html; charset=utf-8');
    response.end(
      buildRecipePage(request.url === '/long' ? longTitle : 'Томатный суп'),
    );
  });
  let url: string;
  let directory: string;
  let output: string;

  const run = async (noAi: boolean) => {
    await runUrlContentFormatter({
      inputUrl: url,
      output,
      noAi,
      mainImageOnly: false,
      downloadImages: false,
      imagesFolder: 'attachments',
    });
    return readFile(output, 'utf8');
  };

  beforeAll(async () => {
    vi.stubEnv('FORMAT_URL_CONTENT_ALLOW_PRIVATE_HOSTS', '1');
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    const address = server.address();
    if (!address || typeof address === 'string')
      throw new Error('Missing server address');
    url = `http://127.0.0.1:${address.port}/`;
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'recipe-ai-format-'));
    output = path.join(directory, 'recipe.md');
    vi.mocked(callOpenAI).mockReset();
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('saves the formatted note followed by the unmodified source link', async () => {
    vi.mocked(callOpenAI)
      .mockResolvedValueOnce(scout('simple'))
      .mockResolvedValueOnce(formatted);

    const markdown = await run(false);
    expect(markdown.startsWith('---\ntags:\n  - рецепты\n  - суп\n')).toBe(
      true,
    );
    expect(markdown).toContain('## Приготовление');
    expect(markdown).toMatch(
      /\n\n\[Источник\]\(<http:\/\/127\.0\.0\.1:\d+\/>\)$/,
    );
  });

  it('saves the deterministic note when formatting fails', async () => {
    vi.mocked(callOpenAI).mockRejectedValue(new Error('API unavailable'));

    const markdown = await run(false);
    expect(markdown.startsWith('# Томатный суп')).toBe(true);
    expect(markdown).toContain('- 2 помидора');
  });

  it('makes no AI calls with --no-ai', async () => {
    const markdown = await run(true);

    expect(callOpenAI).not.toHaveBeenCalled();
    expect(markdown.startsWith('# Томатный суп')).toBe(true);
  });

  describe('batch file names', () => {
    const runImport = async (noAi: boolean) => {
      const inputFile = path.join(directory, 'urls.txt');
      await writeFile(inputFile, `${url}long\n`);
      await runBatch({
        inputFile,
        dest: directory,
        noAi,
        mainImageOnly: false,
        downloadImages: false,
        imagesFolder: 'attachments',
      });
    };

    it('names the note after the shortened title', async () => {
      vi.mocked(callOpenAI)
        .mockResolvedValueOnce('Томатный суп')
        .mockRejectedValue(new Error('API unavailable'));

      await runImport(false);
      expect(await readdir(directory)).toContain('Томатный суп.md');
    });

    it('names the note after the full title with --no-ai', async () => {
      await runImport(true);

      expect(callOpenAI).not.toHaveBeenCalled();
      expect(await readdir(directory)).toContain(
        `${longTitle.replace(':', '-')}.md`,
      );
    });
  });
});
