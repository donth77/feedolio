import { describe, expect, it } from 'vitest';
import { checkAddress, parseFeedUrl } from '../../worker/lib/urlGuard.js';

describe('parseFeedUrl', () => {
  it.each([
    ['nothing', null],
    ['an empty value', '   '],
    ['words', 'not a web address'],
    ['an address without a scheme', 'example.com/feed'],
    ['a protocol-relative address', '//example.com/feed'],
    ['ftp', 'ftp://example.com/feed.xml'],
    ['javascript', 'javascript:alert(1)'],
    ['file', 'file:///etc/passwd'],
    ['data', 'data:text/xml,<rss/>'],
    ['credentials', 'https://user:secret@example.com/feed'],
  ])('rejects %s with INVALID_URL', (_, value) => {
    expect(() => parseFeedUrl(value)).toThrow(
      expect.objectContaining({ code: 'INVALID_URL', status: 400 }),
    );
  });

  it('accepts http and https addresses, trimmed and without a fragment', () => {
    expect(parseFeedUrl('  https://Example.com/feed#top ').href).toBe('https://example.com/feed');
    expect(parseFeedUrl('http://example.com').href).toBe('http://example.com/');
  });
});

describe('checkAddress', () => {
  it.each([
    'http://localhost/',
    'http://LOCALHOST./feed',
    'http://app.localhost/',
    'http://127.0.0.1/',
    'http://127.1/',
    'http://2130706433/',
    'http://0x7f000001/',
    'http://0177.0.0.1/',
    'http://0.0.0.0/',
    'http://10.1.2.3/',
    'http://100.64.0.1/',
    'http://169.254.169.254/latest/meta-data/',
    'http://172.16.0.1/',
    'http://172.31.255.255/',
    'http://192.168.1.1/',
    'http://192.0.2.1/',
    'http://198.18.0.1/',
    'http://224.0.0.1/',
    'http://255.255.255.255/',
    'http://[::1]/',
    'http://[::]/',
    'http://[::ffff:127.0.0.1]/',
    'http://[::ffff:10.0.0.1]/',
    'http://[::ffff:0:a00:1]/',
    'http://[64:ff9b::a9fe:a9fe]/',
    'http://[2002:7f00:1::1]/',
    'http://[fd00::1]/',
    'http://[fe80::1]/',
    'http://[fec0::1]/',
    'http://[ff02::1]/',
    'http://[2001:db8::1]/',
    'http://[100::1]/',
    'https://example.com:8443/feed',
    'http://example.com:22/',
  ])('blocks %s', (address) => {
    expect(() => checkAddress(new URL(address))).toThrow(
      expect.objectContaining({ code: 'BLOCKED_HOST', status: 400 }),
    );
  });

  it.each([
    'https://example.com/feed',
    'http://example.com:80/feed',
    'https://example.com:443/feed',
    'https://example.com:80/feed',
    'http://example.com:443/feed',
    'http://8.8.8.8/',
    'http://172.32.0.1/',
    'http://100.128.0.1/',
    'http://[2606:4700:4700::1111]/',
    'http://[::ffff:8.8.8.8]/',
    'https://xn--bcher-kva.example/feed',
  ])('allows %s', (address) => {
    expect(() => checkAddress(new URL(address))).not.toThrow();
  });

  it('blocks schemes other than http and https, as redirects can reach them', () => {
    expect(() => checkAddress(new URL('ftp://example.com/feed'))).toThrow(
      expect.objectContaining({ code: 'BLOCKED_HOST' }),
    );
  });
});
