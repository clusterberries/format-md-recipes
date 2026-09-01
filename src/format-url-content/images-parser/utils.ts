const NOISE_PATTERN =
  /(?:^|[^a-z0-9])(logo|icon|avatar|profile|author|sprite|pixel|tracking|analytics|advert|advertisement|banner|promo|sponsor|social|share|facebook|instagram|pinterest|youtube|tiktok|twitter|cookie|consent|newsletter|subscribe|rating|star|badge|menu|search|close|arrow|chevron)/i;

const BAD_IMAGE_EXTENSION_PATTERN = /\.(svg|ico)(?:$|\?)/i;

const TRACKING_URL_PATTERN =
  /\b(pixel|tracking|analytics|doubleclick|googlesyndication|adservice)\b/i;

export function isUsableImageUrl(url: string): boolean {
  let location: string;

  try {
    const parsedUrl = new URL(url);
    location = `${parsedUrl.pathname}${parsedUrl.search}`;
  } catch {
    return false;
  }

  return (
    !url.startsWith('data:') &&
    !BAD_IMAGE_EXTENSION_PATTERN.test(location) &&
    !TRACKING_URL_PATTERN.test(location) &&
    !NOISE_PATTERN.test(location)
  );
}

export function normalizeUrl(
  value: string,
  pageUrl: string,
): string | undefined {
  try {
    const url = new URL(value.trim(), pageUrl);

    if (!['http:', 'https:'].includes(url.protocol)) {
      return undefined;
    }

    url.hash = '';

    return url.href;
  } catch {
    return undefined;
  }
}

export function parseDimension(value?: string): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function hasNoise(value: string): boolean {
  return NOISE_PATTERN.test(value);
}
