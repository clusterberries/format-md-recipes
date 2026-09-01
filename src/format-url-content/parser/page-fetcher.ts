import { logWarning } from '../../shared/utils.ts';
import { assertSafeUrl } from '../utils/url-guard.ts';

const REQUEST_TIMEOUT_MS = 20_000;
const MAX_RESPONSE_BYTES = 10 * 1024 * 1024;
const MAX_FETCH_ATTEMPTS = 3;
const RETRY_DELAY_MS = 250;
const MAX_REDIRECTS = 5;

class RetryableFetchError extends Error {}

export async function fetchPageWithRetry(url: string): Promise<{
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
    const response = await fetchFollowingRedirects(url, controller.signal);

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

async function fetchFollowingRedirects(
  url: string,
  signal: AbortSignal,
): Promise<Response> {
  let currentUrl = assertSafeUrl(url).href;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let response: Response;

    try {
      response = await fetch(currentUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (compatible; RecipeParser/1.0; +https://example.com)',
        },
        redirect: 'manual',
        signal,
      });
    } catch (error) {
      throw new RetryableFetchError(getErrorMessage(error));
    }

    if (!isRedirectStatus(response.status)) {
      return response;
    }

    if (hop === MAX_REDIRECTS) {
      throw new Error(`Too many redirects while fetching ${url}`);
    }

    const location = response.headers.get('location');
    if (!location) {
      throw new Error(
        `Redirect response missing Location header for ${currentUrl}`,
      );
    }

    currentUrl = assertSafeUrl(new URL(location, currentUrl).href).href;
  }

  throw new Error(`Too many redirects while fetching ${url}`);
}

function isRedirectStatus(status: number): boolean {
  return (
    status === 301 ||
    status === 302 ||
    status === 303 ||
    status === 307 ||
    status === 308
  );
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
    const contentLength = Number(response.headers.get('content-length'));

    if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
      throw new Error(`Response exceeds the ${MAX_RESPONSE_BYTES}-byte limit`);
    }

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
