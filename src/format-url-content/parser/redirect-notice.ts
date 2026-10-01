const GOOGLE_HOST_PATTERN =
  /^(?:www\.|m\.)?google\.(?:com|[a-z]{2}|(?:com|co)\.[a-z]{2})$/iu;
const NOTICE_TITLE_PATTERN =
  /^(?:redirect notice|notice of redirection|nukreipimo pranešimas|уведомление о переадресации)$/iu;

/** Google AMP and /url links sometimes serve an HTML notice instead of the page. */
export function unwrapKnownRedirectUrl(value: string): string {
  const url = new URL(value);
  if (!GOOGLE_HOST_PATTERN.test(url.hostname)) return value;

  if (url.pathname.startsWith('/amp/s/')) {
    return `https://${url.pathname.slice('/amp/s/'.length)}${url.search}${url.hash}`;
  }

  if (url.pathname === '/url') return url.searchParams.get('q') ?? value;
  return value;
}

export function inspectRedirectNotice(
  document: Document,
  pageUrl: string,
): { isNotice: boolean; target: string | null } {
  const title = document.title.trim();
  if (!NOTICE_TITLE_PATTERN.test(title))
    return { isNotice: false, target: null };

  const links = [...document.querySelectorAll<HTMLAnchorElement>('a[href]')]
    .flatMap((anchor) => {
      try {
        const href = new URL(anchor.getAttribute('href')!, pageUrl).href;
        return [
          {
            href: unwrapKnownRedirectUrl(href),
            label: anchor.textContent?.trim() ?? '',
          },
        ];
      } catch {
        return [];
      }
    })
    .filter(({ href }) => href !== pageUrl && /^https?:\/\//iu.test(href));

  const target =
    links.find(({ label }) => /^https?:\/\//iu.test(label))?.href ??
    links.find(({ href }) => new URL(href).origin !== new URL(pageUrl).origin)
      ?.href ??
    null;
  return { isNotice: true, target };
}
