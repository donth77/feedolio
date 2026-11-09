import { FeedError } from './errors.js';

/**
 * Reads the address a reader asked for. Only absolute http(s) addresses
 * without a username or password are accepted.
 *
 * @param {string|null} raw  The `url` query parameter
 * @returns {URL}
 */
export function parseFeedUrl(raw) {
  const value = raw?.trim();
  if (!value) throw new FeedError('INVALID_URL', 'Add the address of a feed or a website.');

  let url;
  try {
    url = new URL(value);
  } catch {
    throw notAWebAddress();
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw notAWebAddress();
  if (url.username || url.password) {
    throw new FeedError('INVALID_URL', 'Addresses with a username or password aren’t supported.');
  }
  url.hash = '';
  return url;
}

/**
 * Refuses addresses Feedolio won't connect to: other schemes and ports,
 * localhost, and literal private, loopback, link-local or reserved IPs.
 * Runs on every hop, including redirects and discovered feed links.
 *
 * Hostnames aren't resolved first (Workers can't), so a name that resolves
 * to a private address isn't caught. Workers run outside any private network
 * of ours, so there is little behind them to reach.
 *
 * @param {URL} url
 */
export function checkAddress(url) {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw blocked();
  if (url.port !== '' && url.port !== '80' && url.port !== '443') {
    throw new FeedError(
      'BLOCKED_HOST',
      'Feedolio only connects on the standard web ports, 80 and 443.',
    );
  }

  const host = url.hostname.replace(/\.$/, '');
  if (host === 'localhost' || host.endsWith('.localhost')) throw blocked();
  if (host.startsWith('[')) {
    if (isBlockedIPv6(host.slice(1, -1))) throw blocked();
    return;
  }
  const ipv4 = parseIPv4(host);
  if (ipv4 !== null && isBlockedIPv4(ipv4)) throw blocked();
}

function notAWebAddress() {
  return new FeedError(
    'INVALID_URL',
    'That isn’t a web address. Paste a full address that starts with http:// or https://.',
  );
}

function blocked() {
  return new FeedError(
    'BLOCKED_HOST',
    'Feedolio can’t open addresses on this computer or on private networks.',
  );
}

/** IPv4 ranges that are private, loopback, link-local, shared or reserved. */
const BLOCKED_IPV4 = [
  ['0.0.0.0', 8], // "this network"
  ['10.0.0.0', 8], // private
  ['100.64.0.0', 10], // carrier-grade NAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local, including cloud metadata services
  ['172.16.0.0', 12], // private
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // documentation
  ['192.88.99.0', 24], // 6to4 relay
  ['192.168.0.0', 16], // private
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // documentation
  ['203.0.113.0', 24], // documentation
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved, including broadcast
].map(([base, bits]) => ({ base: /** @type {number} */ (parseIPv4(base)), bits }));

/**
 * The URL parser rewrites every IPv4 form (decimal, octal, hex, short) as a
 * valid dotted quad, so this only needs to read that form.
 *
 * @param {string} text
 * @returns {number|null}  The address as an unsigned 32-bit number
 */
function parseIPv4(text) {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(text);
  if (!match) return null;
  const [a, b, c, d] = match.slice(1).map(Number);
  return ((a << 24) | (b << 16) | (c << 8) | d) >>> 0;
}

/** @param {number} address */
function isBlockedIPv4(address) {
  return BLOCKED_IPV4.some(({ base, bits }) => {
    const mask = (~0 << (32 - bits)) >>> 0;
    return (address & mask) >>> 0 === base;
  });
}

/**
 * The URL parser always writes IPv6 as up to eight hex groups, with "::"
 * standing for one run of zeros, so this only needs to read that form.
 *
 * @param {string} address  Without brackets, e.g. "::ffff:7f00:1"
 * @returns {number[]}  Eight 16-bit groups
 */
function parseIPv6(address) {
  const [left, right] = address.split('::');
  const groups = (/** @type {string} */ part) =>
    part ? part.split(':').map((group) => parseInt(group, 16)) : [];
  if (right === undefined) return groups(left);
  const head = groups(left);
  const tail = groups(right);
  return [...head, ...Array(8 - head.length - tail.length).fill(0), ...tail];
}

/** @param {string} address */
function isBlockedIPv6(address) {
  const g = parseIPv6(address);
  const embeddedIPv4 = ((g[6] << 16) | g[7]) >>> 0;
  const zeros = (/** @type {number} */ from, /** @type {number} */ to) =>
    g.slice(from, to).every((group) => group === 0);

  if (zeros(0, 6)) return true; // ::/96: unspecified, loopback, IPv4-compatible
  if (zeros(0, 5) && g[5] === 0xffff) return isBlockedIPv4(embeddedIPv4); // IPv4-mapped
  if (zeros(0, 4) && g[4] === 0xffff && g[5] === 0) return isBlockedIPv4(embeddedIPv4); // IPv4-translated
  if (g[0] === 0x64 && g[1] === 0xff9b && zeros(2, 6)) return isBlockedIPv4(embeddedIPv4); // NAT64
  if (g[0] === 0x2002) return isBlockedIPv4(((g[1] << 16) | g[2]) >>> 0); // 6to4
  if ((g[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((g[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((g[0] & 0xffc0) === 0xfec0) return true; // fec0::/10 site-local
  if ((g[0] & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  if (g[0] === 0x2001 && g[1] === 0x0db8) return true; // documentation
  if (g[0] === 0x0100 && zeros(1, 4)) return true; // discard-only
  return false;
}
