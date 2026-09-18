import { createReadStream } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';

const fixturesDirectory = path.join(process.cwd(), 'tests', 'fixtures');

export const fixtures = [
  'basic-recipe-en',
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
];

export function createRecipeServer() {
  const server = createServer((request, response) => {
    const fixtureName = request.url?.slice(1);
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
