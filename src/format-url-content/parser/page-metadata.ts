import iconv from 'iconv-lite';
import sniffHTMLEncoding from 'html-encoding-sniffer';
import type { PageMetadata } from '../types.ts';

export function decodePageHtml(
  buffer: Buffer,
  contentType: string | null,
): { html: string; encoding: string } {
  const encoding = sniffHTMLEncoding(buffer, {
    transportLayerEncodingLabel: contentType ?? undefined,
    defaultEncoding: 'windows-1252',
  });

  const html = iconv.decode(buffer, encoding);
  return { html, encoding };
}

export function extractPageMetadata(
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
