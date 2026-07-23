import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import iconv from 'iconv-lite';
import sniffHTMLEncoding from 'html-encoding-sniffer';
import type { ParsedRecipePage, RecipeSchema } from './types.ts';

export async function parseRecipePage(url: string): Promise<ParsedRecipePage> {
  const response = await fetch(url, {
    headers: {
      // Some sites reject requests without a browser-like UA.
      'User-Agent':
        'Mozilla/5.0 (compatible; RecipeParser/1.0; +https://example.com)',
    },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch ${url}: ${response.status} ${response.statusText}`,
    );
  }

  const buffer = Buffer.from(await response.arrayBuffer());

  const encoding = sniffHTMLEncoding(buffer, {
    transportLayerEncodingLabel:
      response.headers.get('content-type') ?? undefined,
    defaultEncoding: 'windows-1252',
  });

  const html = iconv.decode(buffer, encoding);
  const dom = new JSDOM(html, { url });

  // Extract Recipe JSON-LD
  const recipe = extractRecipeSchema(dom.window.document);

  // Extract main article
  const article = new Readability(dom.window.document).parse();

  return {
    url,
    article: article
      ? {
          title: article.title ?? null,
          excerpt: article.excerpt ?? null,
          contentHtml: article.content ?? '',
          length: article.length ?? 0,
        }
      : null,
    recipe,
  };
}

function extractRecipeSchema(doc: Document): RecipeSchema | null {
  const scripts = doc.querySelectorAll('script[type="application/ld+json"]');

  for (const script of scripts) {
    const text = script.textContent?.trim();

    if (!text) continue;

    console.log('script text:', text?.slice(0, 100)); // Log the first 100 characters of the script content
    let json: unknown;

    try {
      json = JSON.parse(text);
    } catch {
      continue;
    }

    const recipe = findRecipe(json);

    if (recipe) {
      return recipe;
    }
  }

  return null;
}

function findRecipe(value: unknown): RecipeSchema | null {
  if (!value) return null;

  if (Array.isArray(value)) {
    for (const item of value) {
      const recipe = findRecipe(item);

      if (recipe) return recipe;
    }

    return null;
  }

  if (typeof value !== 'object') {
    return null;
  }

  const obj = value as Record<string, unknown>;

  // Direct Recipe object
  if (isRecipeType(obj['@type'])) {
    return obj;
  }

  // JSON-LD graph
  if (Array.isArray(obj['@graph'])) {
    const recipe = findRecipe(obj['@graph']);

    if (recipe) return recipe;
  }

  // Some sites wrap objects differently
  for (const child of Object.values(obj)) {
    const recipe = findRecipe(child);

    if (recipe) return recipe;
  }

  return null;
}

function isRecipeType(type: unknown): boolean {
  if (typeof type === 'string') {
    return type === 'Recipe';
  }

  if (Array.isArray(type)) {
    return type.includes('Recipe');
  }

  return false;
}
