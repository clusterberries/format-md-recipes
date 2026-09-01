import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import { fetchPageWithRetry } from './page-fetcher.ts';
import { decodePageHtml, extractPageMetadata } from './page-metadata.ts';
import { extractIndependentSources } from '../source-extractor/index.ts';
import { extractNormalizedRecipe } from '../field-extractor/index.ts';
import { reconcileRecipe } from './reconciler.ts';
import { logInfo } from '../../shared/utils.ts';
import type { ParsedRecipePage } from '../types.ts';

export async function parseRecipePage(url: string): Promise<ParsedRecipePage> {
  logInfo(`Fetching page: ${url}`);
  const { response, buffer, contentType } = await fetchPageWithRetry(url);
  logInfo(
    `Page fetched (${buffer.byteLength} bytes, content-type: ${contentType ?? 'unknown'})`,
  );

  const { html, encoding } = decodePageHtml(buffer, contentType);
  const finalUrl = response.url || url;
  const dom = new JSDOM(html, { url: finalUrl });

  const metadata = extractPageMetadata(
    dom.window.document,
    finalUrl,
    encoding,
    contentType,
  );
  logInfo(
    `Detected encoding: ${encoding}, language: ${metadata.language ?? 'unknown'}`,
  );

  const article = new Readability(dom.window.document).parse();
  const parsedArticle = article
    ? {
        title: article.title ?? null,
        excerpt: article.excerpt ?? null,
        contentHtml: article.content ?? '',
        length: article.length ?? 0,
      }
    : null;

  const sources = extractIndependentSources(
    html,
    finalUrl,
    metadata,
    parsedArticle,
  );
  logInfo(
    `Extracted ${sources.candidates.length} recipe candidate(s) ` +
      `(json-ld: ${sources.jsonLd.length}, main image: ${
        sources.images.mainImage ? 'yes' : 'no'
      }, step images: ${sources.images.stepImages.length})`,
  );

  const normalizedRecipe = extractNormalizedRecipe(sources, {
    requestedUrl: url,
    finalUrl,
    canonicalUrl: metadata.canonicalUrl,
    language: metadata.language,
    encoding,
    contentType,
  });
  const reconciledRecipe = reconcileRecipe(normalizedRecipe);
  logInfo(
    `Reconciled recipe: ${reconciledRecipe.ingredients.value.length} ingredient(s), ` +
      `${reconciledRecipe.instructions.value.length} instruction(s), ` +
      `${reconciledRecipe.conflicts.length} conflict(s) detected`,
  );

  return {
    url,
    finalUrl,
    rawHtml: html,
    metadata,
    article: parsedArticle,
    recipe: sources.jsonLd[0] ?? null,
    sources,
    normalizedRecipe,
    reconciledRecipe,
  };
}
