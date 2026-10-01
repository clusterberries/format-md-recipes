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
import { runUrlContentFormatter } from '../src/format-url-content/url-content-formatter.ts';
import { unwrapKnownRedirectUrl } from '../src/format-url-content/parser/redirect-notice.ts';
import { getRecipeQualityIssue } from '../src/format-url-content/recipe-quality.ts';
import { reconcileRecipe } from '../src/format-url-content/parser/reconciler.ts';
import { parseRecipePage } from '../src/format-url-content/parser/page-parser.ts';
import { extractRecipe, jsonLd } from './helpers/extract-recipe.ts';

vi.mock('../src/shared/openai-client.ts', () => ({ callOpenAI: vi.fn() }));

const article = `<article><h1>Soup</h1>
  <p>Use one onion and keep the resting liquid for the soup.</p>
  <p>Cook the onion. Then serve the soup with the liquid.</p>
</article>`;
const recipeSchema = {
  '@type': 'Recipe',
  name: 'Soup',
  recipeIngredient: ['1 onion', 'Keep the resting liquid for the soup.'],
  recipeInstructions: ['Cook the onion.'],
};
const server = createServer((request, response) => {
  response.setHeader('content-type', 'text/html; charset=utf-8');
  if (request.url === '/notice') {
    const destination = `http://${request.headers.host}/recipe`;
    response.end(`<html lang="lt"><head><title>Nukreipimo pranešimas</title></head>
      <body><a href="${destination}">${destination}</a></body></html>`);
  } else if (request.url === '/empty-notice') {
    response.end(
      '<html><head><title>Redirect Notice</title></head><body>No destination</body></html>',
    );
  } else if (request.url === '/recipe') {
    response.end(`<html><head><title>Soup tutorial</title>
      <script type="application/ld+json">${JSON.stringify(recipeSchema)}</script>
      </head><body>${article}</body></html>`);
  } else if (request.url === '/collapsed') {
    response.end(`<html><head><title>Soup</title><script type="application/ld+json">
      ${JSON.stringify({ ...recipeSchema, recipeInstructions: ['Step 1 Cook the onion. Step 2 Serve the soup.'] })}
      </script></head><body>${article}</body></html>`);
  } else if (request.url === '/recipe-outside-article') {
    response.end(`<html><head><title>Плескавица</title><script type="application/ld+json">
      ${JSON.stringify({
        '@type': 'Recipe',
        name: 'Плескавица',
        recipeIngredient: ['500 г фарша', '1 луковица'],
        recipeInstructions: [
          'Плескавица 14683 38 Время приготовления: 35 минут Количество порций: 2 Калорийность: 127 kCal',
        ],
      })}
      </script></head><body>
      <main><article><h1>Плескавица</h1><p>${'Вкусный балканский рецепт для ужина. '.repeat(20)}</p></article></main>
      <div class="recipe"><h2>Ингредиенты</h2><ul><li>500 г фарша</li><li>1 луковица</li></ul>
      <ol><li>Смешайте фарш с луком.</li><li>Сформируйте котлеты и пожарьте.</li></ol></div>
      </body></html>`);
  } else {
    response.writeHead(404);
    response.end();
  }
});

describe('recipe content safety', () => {
  let baseUrl: string;
  let directory: string;

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
    directory = await mkdtemp(path.join(tmpdir(), 'recipe-safety-'));
    vi.mocked(callOpenAI).mockReset();
  });
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  async function run(input: string, noAi: boolean) {
    const output = path.join(directory, 'recipe.md');
    await runUrlContentFormatter({
      inputUrl: `${baseUrl}${input}`,
      output,
      noAi,
      mainImageOnly: false,
      downloadImages: false,
      imagesFolder: 'attachments',
    });
    return readFile(output, 'utf8');
  }

  it('keeps intact article content when instructions are unresolved', async () => {
    vi.mocked(callOpenAI).mockResolvedValue(
      JSON.stringify({
        fields: {
          ingredients: {
            action: 'filter',
            dropTexts: ['Keep the resting liquid for the soup.'],
          },
          instructions: { action: 'unresolved' },
        },
        unresolved: ['instructions'],
      }),
    );
    const markdown = await run('/recipe', false);
    expect(callOpenAI).toHaveBeenCalledOnce();
    expect(markdown).toContain('keep the resting liquid for the soup');
    expect(markdown).not.toContain('## Ingredients');
  });

  it('keeps page content when numbered steps collapse into one extracted item', async () => {
    const markdown = await run('/collapsed', true);
    expect(markdown).toContain('Cook the onion. Then serve the soup');
    expect(markdown).not.toContain('## Ingredients');
  });

  it('uses the full page when Readability misses recipe sections', async () => {
    const page = await parseRecipePage(`${baseUrl}/recipe-outside-article`);
    expect(page.article?.contentHtml).not.toContain('500 г фарша');
    const markdown = await run('/recipe-outside-article', true);
    expect(markdown).toContain('500 г фарша');
    expect(markdown).toContain('Сформируйте котлеты и пожарьте');
    expect(markdown).not.toContain('## Ingredients');
  });

  it('keeps quantified ingredients and merges bare-name duplicates one-to-one', () => {
    const { normalized } = extractRecipe(jsonLd(recipeSchema));
    const title = 'Овощи запечённые с курицей и грибами под сырной корочкой';
    normalized.title = [
      { value: title, source: 'html', confidence: 0.8, location: 'h1' },
    ];
    const htmlNames = [
      title,
      'куриная грудка - 450 г',
      'грибы (шампиньоны) - 350 г',
      'помидоры - 4 шт. + 1 шт. (крупные)',
      'прованские травы,чабрец,куркума(сары-кёк),соль',
      'перец - .',
      'лук репчатый - 2 шт.',
      'заливка:',
      'яйца - 3 шт.',
      'сметана - 150 г',
      'сыр - 200 г',
    ];
    const microdataNames = [
      'куриная грудка',
      'грибы шампиньоны',
      'помидоры крупные',
      'прованские травы',
      'чабрец',
      'куркума сары кёк',
      'соль',
      'йогурт',
    ];
    normalized.ingredients = [
      ...htmlNames.map((text, index) => ({
        text,
        source: 'html' as const,
        confidence: 0.8,
        location: `html[${index}]`,
      })),
      ...microdataNames.map((text, index) => ({
        text,
        source: 'microdata' as const,
        confidence: 0.8,
        location: `microdata[${index}]`,
      })),
    ];
    const merged = reconcileRecipe(normalized).ingredients.value;
    expect(merged.map(({ text }) => text)).toEqual([
      ...htmlNames.filter((text) => text !== title && text !== 'заливка:'),
      'йогурт',
    ]);
    expect(merged.find(({ text }) => text === 'яйца - 3 шт.')?.group).toBe(
      'заливка',
    );
    expect(merged.find(({ text }) => text === 'йогурт')?.group).toBeUndefined();
  });

  it('follows an HTML redirect notice before extracting the recipe', async () => {
    const markdown = await run('/notice', true);
    expect(markdown).toContain('## Ingredients');
    expect(markdown).toContain(`[Source](<${baseUrl}/recipe>)`);
    expect(markdown).not.toContain('Nukreipimo pranešimas');
  });

  it('rejects a redirect notice with no destination', async () => {
    await expect(run('/empty-notice', true)).rejects.toThrow('redirect notice');
  });

  it('unwraps the Google AMP URL from the logged failure', () => {
    expect(
      unwrapKnownRedirectUrl(
        'https://www.google.com/amp/s/example.com/cooking/61657-bulgur-s-ovoschami-na-skovorode',
      ),
    ).toBe('https://example.com/cooking/61657-bulgur-s-ovoschami-na-skovorode');
  });

  it.each([
    [
      'Плескавица 14683 38 Время приготовления: 35 минут Количество порций: 2 Калорийность: 127 kCal',
      'page metadata',
    ],
    [
      'Шаг 1 Подготовьте фасоль. window.yaContextCb.push(() => {})',
      'embedded script',
    ],
  ])('rejects the malformed instruction from the logs: %s', (text, issue) => {
    const { recipe } = extractRecipe(
      jsonLd({
        '@type': 'Recipe',
        name: 'Soup',
        recipeIngredient: ['1 onion'],
        recipeInstructions: [text],
      }),
    );
    expect(getRecipeQualityIssue(recipe)).toContain(issue);
  });
});
