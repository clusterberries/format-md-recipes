import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
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
import { runUrlContentFormatter } from '../src/format-url-content/url-content-formatter.ts';

vi.mock('../src/shared/openai-client.ts', () => ({ callOpenAI: vi.fn() }));
vi.mock('../src/shared/constants.ts', () => ({
  MINI_MODEL: 'mini',
  MEDIUM_MODEL: 'medium',
  FULL_MODEL: 'full',
}));

const note = `## Ингредиенты

- 2 помидора
- 1 луковица

## Приготовление

1. Нарежьте овощи.

   ![Шаг 1](https://example.com/step.jpg)`;

const formatted = `---
tags:
  - рецепты
  - суп
ингредиенты:
  - помидоры
  - лук
---

${note}`;

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
      .mockResolvedValueOnce(formatted);

    expect(await formatRecipeNote(note)).toBe(formatted);
    expect(callOpenAI).toHaveBeenCalledTimes(2);
    expect(vi.mocked(callOpenAI).mock.calls[0]?.[1]).toBe('mini');
    expect(vi.mocked(callOpenAI).mock.calls[1]?.[1]).toBe(model);
    expect(vi.mocked(callOpenAI).mock.calls[1]?.[0]).toBe(note);
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
${note}
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
    ['missing frontmatter', note],
    ['missing ingredients field', `---\ntags:\n  - рецепты\n---\n\n${note}`],
    [
      'lost image',
      formatted.replace('![Шаг 1](https://example.com/step.jpg)', ''),
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

const recipePage = `<html lang="ru"><head><title>Томатный суп</title>
  <script type="application/ld+json">${JSON.stringify({
    '@type': 'Recipe',
    name: 'Томатный суп',
    recipeIngredient: ['2 помидора', '1 луковица'],
    recipeInstructions: ['Нарежьте овощи.', 'Тушите до мягкости.'],
  })}</script></head><body><article><h1>Томатный суп</h1></article></body></html>`;

describe('AI note formatting in the pipeline', () => {
  const server = createServer((_request, response) => {
    response.setHeader('content-type', 'text/html; charset=utf-8');
    response.end(recipePage);
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
});
