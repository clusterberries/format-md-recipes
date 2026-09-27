import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchWithRetry } from '../src/format-url-content/utils/http-fetch.ts';
import { fetchPageWithRetry } from '../src/format-url-content/parser/page-fetcher.ts';
import { assertSafeUrl } from '../src/format-url-content/utils/url-guard.ts';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('shared bounded fetch', () => {
  it('retries transient errors for both consumers', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response('busy', { status: 503 }))
      .mockResolvedValueOnce(new Response('ok'));
    vi.stubGlobal('fetch', fetch);
    expect(
      (await fetchWithRetry('https://example.com/image')).buffer.toString(),
    ).toBe('ok');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('does not retry permanent HTTP failures', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response('missing', { status: 404 }));
    vi.stubGlobal('fetch', fetch);
    await expect(fetchWithRetry('https://example.com/image')).rejects.toThrow(
      '404',
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('limits streamed bodies even without Content-Length', async () => {
    let cancelled = false;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new Uint8Array(8));
            },
            cancel() {
              cancelled = true;
            },
          }),
        ),
      ),
    );
    await expect(
      fetchWithRetry('https://example.com/image', { maxBytes: 4 }),
    ).rejects.toThrow('4-byte limit');
    expect(cancelled).toBe(true);
  });

  it('aborts a slow response body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((_url: string, init: RequestInit) =>
        Promise.resolve(
          new Response(
            new ReadableStream({
              start(controller) {
                init.signal?.addEventListener('abort', () =>
                  controller.error(new DOMException('Timed out', 'AbortError')),
                );
              },
            }),
          ),
        ),
      ),
    );
    await expect(
      fetchWithRetry('https://example.com/image', {
        timeoutMs: 10,
        attempts: 1,
      }),
    ).rejects.toThrow('Timed out');
  });

  it.each([
    'http://127.0.0.1/private',
    'http://[::ffff:127.0.0.1]/private',
    'http://[::ffff:7f00:1]/private',
    'http://[::ffff:192.168.1.1]/private',
    'http://[::ffff:169.254.169.254]/private',
    'http://[fe90::1]/private',
  ])(
    'validates redirect destination %s before requesting it',
    async (location) => {
      vi.stubEnv('FORMAT_URL_CONTENT_ALLOW_PRIVATE_HOSTS', '0');
      const fetch = vi.fn().mockResolvedValue(
        new Response(null, {
          status: 302,
          headers: { location },
        }),
      );
      vi.stubGlobal('fetch', fetch);
      await expect(fetchWithRetry('https://example.com/image')).rejects.toThrow(
        'private/local',
      );
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    'https://fcooking.example/recipe',
    'https://fdrecipes.example/recipe',
    'https://[::ffff:8.8.8.8]/recipe',
    'https://[2606:4700:4700::1111]/recipe',
  ])('allows public hostname or address %s', (url) => {
    vi.stubEnv('FORMAT_URL_CONTENT_ALLOW_PRIVATE_HOSTS', '0');
    expect(assertSafeUrl(url).href).toBe(new URL(url).href);
  });

  it('rejects unsupported schemes before fetching', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(fetchWithRetry('file:///etc/passwd')).rejects.toThrow(
      'Unsupported URL scheme',
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it('bounds redirect loops', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(null, { status: 302, headers: { location: '/again' } }),
      );
    vi.stubGlobal('fetch', fetch);
    await expect(fetchWithRetry('https://example.com/image')).rejects.toThrow(
      'Too many redirects',
    );
    expect(fetch).toHaveBeenCalledTimes(6);
  });

  it('preserves HTML-specific validation in the page fetcher', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response('image', { headers: { 'content-type': 'image/png' } }),
        ),
    );
    await expect(
      fetchPageWithRetry('https://example.com/recipe'),
    ).rejects.toThrow('Expected an HTML response');
  });
});
