import { createReadStream, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import iconv from 'iconv-lite';

const fixturesDirectory = path.join(process.cwd(), 'tests', 'fixtures');

export const fixtures = [
  'image-srcset-width',
  'image-srcset-density',
  'image-srcset-lazy',
  'image-srcset-picture',
  'image-srcset-invalid',
  'image-srcset-fallback',
  'image-srcset-relative',
  'source-invalid',
  'source-punctuation',
  'basic-recipe-en',
  'koolinar-main-image',
  'test1-ru',
  'test2-ru',
  'test3-ru',
  'test4-ru',
  'test5-ru',
  'test6-ru',
  'ingredients-structures',
  'ingredients-instructions-overlap',
  'ingredients-partial-overlap',
  'ingredients-shared-word',
  'seo-cleanup',
  'page-noise',
  'no-recipe-article',
  'no-recipe-article-lang-ru',
  'sources-partial-overlap',
  'repeated-json-ld',
  'repeated-microdata',
  'repeated-html',
  'sources-agree',
  'sources-disagree',
  'html-groups',
  'schema-nested-sections',
  'microdata-nested-containers',
  'sources-step-images',
  'schema-array-yield',
  'schema-page-match-url',
  'schema-page-match-id',
  'schema-page-match-main-entity',
  'schema-canonical-match',
  'schema-most-complete',
  'schema-incomplete-alternative',
  'schema-duplicates',
  'schema-malformed',
];

// Store readable UTF-8 HTML; encode the actual HTTP response for these cases.
export const encodingFixtures: {
  name: string;
  encoding: string;
  contentType: string | null;
  metaCharset?: string;
  bom?: boolean;
}[] = [
  {
    name: 'header-utf8',
    encoding: 'utf-8',
    contentType: 'text/html; charset=utf-8',
  },
  {
    name: 'header-windows1251',
    encoding: 'windows-1251',
    contentType: 'text/html; charset="windows-1251"',
  },
  {
    name: 'header-quoted',
    encoding: 'utf-8',
    contentType: 'text/html; Charset = "UTF-8"; other=value',
  },
  {
    name: 'header-over-meta',
    encoding: 'utf-8',
    contentType: 'text/html; charset=utf-8',
    metaCharset: 'windows-1251',
  },
  {
    name: 'bom-over-header',
    encoding: 'utf-8',
    contentType: 'text/html; charset=windows-1251',
    bom: true,
  },
  {
    name: 'meta-no-header',
    encoding: 'utf-8',
    contentType: null,
    metaCharset: 'utf-8',
  },
  {
    name: 'meta-no-charset',
    encoding: 'utf-8',
    contentType: 'text/html',
    metaCharset: 'utf-8',
  },
  {
    name: 'meta-invalid-charset',
    encoding: 'utf-8',
    contentType: 'text/html; charset=unknown',
    metaCharset: 'utf-8',
  },
];

export function createRecipeServer() {
  const server = createServer((request, response) => {
    if (request.url === '/redirect-recipe.html') {
      response.writeHead(302, { location: '/basic-recipe-en.html' });
      response.end();
      return;
    }
    const fixtureName = request.url?.slice(1);
    const encodingFixture = encodingFixtures.find(
      ({ name }) => fixtureName === `${name}.html`,
    );
    if (encodingFixture) {
      let html = readFileSync(
        path.join(fixturesDirectory, 'encoding-recipe.html'),
        'utf8',
      );
      if (encodingFixture.metaCharset)
        html = html.replace(
          '<head>',
          `<head><meta charset="${encodingFixture.metaCharset}">`,
        );
      if (encodingFixture.bom) html = '\uFEFF' + html;
      if (encodingFixture.contentType)
        response.setHeader('content-type', encodingFixture.contentType);
      response.end(iconv.encode(html, encodingFixture.encoding));
      return;
    }
    if (
      fixtureName &&
      fixtures.some((fixture) => `${fixture}.html` === fixtureName)
    ) {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      createReadStream(path.join(fixturesDirectory, fixtureName)).pipe(
        response,
      );
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

  return { server, startServer };
}
