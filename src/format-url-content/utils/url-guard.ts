// Blocks obvious SSRF targets (scheme, loopback/private/link-local literals).
// Does not resolve DNS, so rebinding attacks against public hostnames are not covered.

const IPV4_PATTERN = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const IPV4_MAPPED_IPV6_PATTERN =
  /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i;

export function assertSafeUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Invalid URL: ${value}`);
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`Unsupported URL scheme: ${url.protocol}`);
  }

  // Explicit opt-in only, e.g. for local test fixture servers; never set in production.
  if (process.env.FORMAT_URL_CONTENT_ALLOW_PRIVATE_HOSTS === '1') {
    return url;
  }

  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');

  if (isBlockedHostname(hostname)) {
    throw new Error(`Refusing to fetch a private/local address: ${hostname}`);
  }

  return url;
}

function isBlockedHostname(hostname: string): boolean {
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) return true;

  const mappedMatch = hostname.match(IPV4_MAPPED_IPV6_PATTERN);
  const ipv4Candidate = mappedMatch?.[1] ?? hostname;
  const ipv4Match = ipv4Candidate.match(IPV4_PATTERN);

  if (ipv4Match) {
    const octets = ipv4Match.slice(1, 5).map(Number);
    if (octets.some((octet) => octet > 255)) return false;
    return isPrivateIpv4(octets);
  }

  if (hostname === '::1' || hostname === '::') return true;
  if (hostname.startsWith('fc') || hostname.startsWith('fd')) return true; // fc00::/7
  if (hostname.startsWith('fe80:')) return true; // link-local

  return false;
}

function isPrivateIpv4(octets: number[]): boolean {
  const [a, b] = octets as [number, number, number, number];

  if (a === 127) return true; // loopback
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 (link-local + cloud metadata)
  if (a === 0) return true; // 0.0.0.0/8

  return false;
}
