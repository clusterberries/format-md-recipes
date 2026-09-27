import { extractIndependentSources } from '../../src/format-url-content/source-extractor/index.ts';
import { extractNormalizedRecipe } from '../../src/format-url-content/field-extractor/index.ts';
import { reconcileRecipe } from '../../src/format-url-content/parser/reconciler.ts';
import type { PageMetadata } from '../../src/format-url-content/types.ts';

export function extractRecipe(
  html: string,
  overrides: Partial<PageMetadata> = {},
) {
  const url = 'https://example.com/soup';
  const metadata: PageMetadata = {
    title: null,
    description: null,
    canonicalUrl: null,
    language: 'en',
    encoding: 'UTF-8',
    contentType: 'text/html',
    openGraphImage: null,
    twitterImage: null,
    ...overrides,
  };
  const sources = extractIndependentSources(html, url, metadata, null);
  const normalized = extractNormalizedRecipe(sources, {
    requestedUrl: url,
    finalUrl: url,
    canonicalUrl: metadata.canonicalUrl,
    language: metadata.language,
    encoding: metadata.encoding,
    contentType: metadata.contentType,
  });
  return { sources, normalized, recipe: reconcileRecipe(normalized) };
}

export function jsonLd(value: unknown): string {
  return `<script type="application/ld+json">${JSON.stringify(value)}</script>`;
}
