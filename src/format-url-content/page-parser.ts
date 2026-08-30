import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import iconv from 'iconv-lite';
import sniffHTMLEncoding from 'html-encoding-sniffer';
import { extractIndependentSources } from './source-extractor.ts';
import { extractNormalizedRecipe } from './field-extractor.ts';
import { reconcileRecipe } from './reconciler.ts';
import { logInfo, logWarning } from '../shared/utils.ts';
import type { PageMetadata, ParsedRecipePage } from './types.ts';

const REQUEST_TIMEOUT_MS = 20_000;
const MAX_RESPONSE_BYTES = 10 * 1024 * 1024;
const MAX_FETCH_ATTEMPTS = 3;
const RETRY_DELAY_MS = 250;

class RetryableFetchError extends Error {}

export async function parseRecipePage(url: string): Promise<ParsedRecipePage> {
  logInfo(`Fetching page: ${url}`);
  const { response, buffer, contentType } = await fetchPageWithRetry(url);
  logInfo(
    `Page fetched (${buffer.byteLength} bytes, content-type: ${contentType ?? 'unknown'})`,
  );

  const encoding = sniffHTMLEncoding(buffer, {
    transportLayerEncodingLabel: contentType ?? undefined,
    defaultEncoding: 'windows-1252',
  });

  const html = iconv.decode(buffer, encoding);
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

  // Extract main article
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

async function fetchPageWithRetry(url: string): Promise<{
  response: Response;
  buffer: Buffer;
  contentType: string | null;
}> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_FETCH_ATTEMPTS; attempt++) {
    try {
      return await fetchPageAttempt(url);
    } catch (error) {
      lastError = error;

      if (attempt === MAX_FETCH_ATTEMPTS || !isRetryableFetchError(error)) {
        throw error;
      }

      logWarning(
        `Fetch attempt ${attempt}/${MAX_FETCH_ATTEMPTS} failed for ${url}: ${getErrorMessage(error)}. Retrying...`,
      );
      await waitBeforeRetry(attempt);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`Failed to fetch ${url}`);
}

async function fetchPageAttempt(url: string): Promise<{
  response: Response;
  buffer: Buffer;
  contentType: string | null;
}> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    let response: Response;

    try {
      response = await fetch(url, {
        headers: {
          // Some sites reject requests without a browser-like UA.
          'User-Agent':
            'Mozilla/5.0 (compatible; RecipeParser/1.0; +https://example.com)',
        },
        signal: controller.signal,
      });
    } catch (error) {
      throw new RetryableFetchError(getErrorMessage(error));
    }

    if (!response.ok) {
      const error = new Error(
        `Failed to fetch ${url}: ${response.status} ${response.statusText}`,
      );

      if (isRetryableStatus(response.status)) {
        throw new RetryableFetchError(error.message);
      }

      throw error;
    }

    const contentType = response.headers.get('content-type');

    if (
      contentType &&
      !/text\/html|application\/xhtml\+xml/i.test(contentType)
    ) {
      throw new Error(`Expected an HTML response, received ${contentType}`);
    }

    const buffer = await readResponseBuffer(response);

    return {
      response,
      buffer,
      contentType,
    };
  } catch (error) {
    if (error instanceof RetryableFetchError) {
      throw error;
    }

    if (isRetryableFetchError(error)) {
      throw new RetryableFetchError(getErrorMessage(error));
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function isRetryableFetchError(error: unknown): boolean {
  if (error instanceof RetryableFetchError) return true;

  return error instanceof Error && error.name === 'AbortError';
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function waitBeforeRetry(attempt: number): Promise<void> {
  const delay = RETRY_DELAY_MS * 2 ** (attempt - 1);
  await new Promise<void>((resolve) => setTimeout(resolve, delay));
}

async function readResponseBuffer(response: Response): Promise<Buffer> {
  if (!response.body) {
    const buffer = Buffer.from(await response.arrayBuffer());

    if (buffer.byteLength > MAX_RESPONSE_BYTES) {
      throw new Error(`Response exceeds the ${MAX_RESPONSE_BYTES}-byte limit`);
    }

    return buffer;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      totalBytes += value.byteLength;

      if (totalBytes > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new Error(
          `Response exceeds the ${MAX_RESPONSE_BYTES}-byte limit`,
        );
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
}

function extractPageMetadata(
  doc: Document,
  baseUrl: string,
  encoding: string,
  contentType: string | null,
): PageMetadata {
  const getMetaContent = (selector: string): string | null =>
    doc.querySelector(selector)?.getAttribute('content')?.trim() || null;

  const language =
    doc.documentElement.getAttribute('lang')?.trim() ||
    getMetaContent('meta[http-equiv="content-language"]') ||
    getMetaContent('meta[property="og:locale"]') ||
    getMetaContent('meta[name="language"]') ||
    null;

  const canonical = doc
    .querySelector('link[rel="canonical"]')
    ?.getAttribute('href');

  return {
    contentType,
    encoding,
    title:
      getMetaContent('meta[property="og:title"]') ??
      doc.querySelector('title')?.textContent?.trim() ??
      null,
    description:
      getMetaContent('meta[name="description"]') ??
      getMetaContent('meta[property="og:description"]'),
    canonicalUrl: normalizeMetadataUrl(canonical, baseUrl),
    language,
    openGraphImage: (() => {
      const image = getMetaContent('meta[property="og:image"]');
      return normalizeMetadataUrl(image, baseUrl);
    })(),
    twitterImage: (() => {
      const image =
        getMetaContent('meta[name="twitter:image"]') ??
        getMetaContent('meta[property="twitter:image"]');
      return normalizeMetadataUrl(image, baseUrl);
    })(),
  };
}

function normalizeMetadataUrl(
  value: string | null | undefined,
  baseUrl: string,
): string | null {
  if (!value) return null;

  try {
    return new URL(value, baseUrl).href;
  } catch {
    return null;
  }
}
