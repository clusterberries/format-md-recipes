// Blocks obvious SSRF targets (scheme, loopback/private/link-local/reserved literals, local-only names).
// Does not resolve DNS, so public hostnames that point to private addresses are not covered.

const IPV4_PATTERN = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const LOCAL_HOST_SUFFIXES = [
  '.localhost',
  '.local',
  '.internal',
  '.localdomain',
  '.home.arpa',
];

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

  // A trailing dot ("localhost.") is the same host in DNS.
  const hostname = url.hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.+$/, '');

  if (isBlockedHostname(hostname)) {
    throw new Error(`Refusing to fetch a private/local address: ${hostname}`);
  }

  return url;
}

function isBlockedHostname(hostname: string): boolean {
  if (
    hostname === 'localhost' ||
    LOCAL_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix))
  )
    return true;

  const ipv4Match = hostname.match(IPV4_PATTERN);
  if (ipv4Match) return isPrivateIpv4(ipv4Match.slice(1, 5).map(Number));

  if (!hostname.includes(':')) return false;
  const groups = parseIpv6(hostname);
  // The URL parser already validated the literal; refuse anything unparseable.
  return groups ? isPrivateIpv6(groups) : true;
}

/** Expands an IPv6 literal (as normalized by URL, so no dotted tail) into eight 16-bit groups. */
function parseIpv6(host: string): number[] | null {
  const halves = host.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves[1] ? halves[1].split(':') : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 2 ? missing < 1 : missing !== 0) return null;

  const groups = [...head, ...Array<string>(missing).fill('0'), ...tail].map(
    (group) => (/^[\da-f]{1,4}$/i.test(group) ? parseInt(group, 16) : NaN),
  );
  return groups.some(Number.isNaN) ? null : groups;
}

function isPrivateIpv6(groups: number[]): boolean {
  const [g0, g1, g2] = groups as [number, number, number];
  const embeddedIpv4 = (high: number, low: number): number[] => [
    high >> 8,
    high & 255,
    low >> 8,
    low & 255,
  ];
  const last = embeddedIpv4(groups[6]!, groups[7]!);

  // ::, ::1, IPv4-compatible (::a.b.c.d) and IPv4-mapped (::ffff:a.b.c.d).
  if (groups.slice(0, 5).every((group) => group === 0)) {
    if (groups[5] === 0 || groups[5] === 0xffff) return isPrivateIpv4(last);
  }
  // NAT64: 64:ff9b::/96 embeds an IPv4 address; 64:ff9b:1::/48 is local-use.
  if (g0 === 0x64 && g1 === 0xff9b) {
    return g2 !== 0 || groups.slice(3, 6).some(Boolean) || isPrivateIpv4(last);
  }
  // 6to4 embeds an IPv4 address in the next 32 bits.
  if (g0 === 0x2002) return isPrivateIpv4(embeddedIpv4(g1, g2));
  // Teredo (2001::/32) obfuscates its embedded address.
  if (g0 === 0x2001 && g1 === 0) return true;

  return (
    (g0 & 0xfe00) === 0xfc00 || // fc00::/7 unique local
    (g0 & 0xffc0) === 0xfe80 || // fe80::/10 link-local
    (g0 & 0xffc0) === 0xfec0 || // fec0::/10 site-local (deprecated)
    (g0 & 0xff00) === 0xff00 // ff00::/8 multicast
  );
}

function isPrivateIpv4(octets: number[]): boolean {
  const [a, b, c] = octets as [number, number, number, number];

  if (a === 0 || a === 10 || a === 127) return true; // "this" network, private, loopback
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 carrier-grade NAT
  if (a === 169 && b === 254) return true; // link-local + cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 192 && b === 0 && c === 0) return true; // 192.0.0.0/24 IETF protocol assignments
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 benchmarking
  return a >= 224; // multicast, reserved, broadcast
}
