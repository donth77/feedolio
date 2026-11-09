import { describe, expect, it } from 'vitest';
import {
  decodeEntities,
  excerptOf,
  parseAttributes,
  safeHttpUrl,
  textLength,
  truncate,
} from '../../worker/lib/text.js';

describe('decodeEntities', () => {
  it.each([
    ['named', 'Fish &amp; chips &mdash; &eacute;t&eacute;', 'Fish & chips — été'],
    ['decimal and hex', '&#8220;Hi&#x201D;', '“Hi”'],
    ['Windows-1252 numbers, as browsers read them', 'it&#146;s &#151; done', 'it’s — done'],
    ['unknown names, left alone', '&notanentity; &copy', '&notanentity; &copy'],
    ['impossible code points', '&#0; &#xD800; &#x110000;', '\uFFFD \uFFFD \uFFFD'],
  ])('decodes %s', (_, input, output) => {
    expect(decodeEntities(input)).toBe(output);
  });
});

describe('truncate and excerptOf', () => {
  it('cuts a single long word where it must', () => {
    expect(truncate('a'.repeat(300), 10)).toBe(`${'a'.repeat(9)}…`);
  });

  it('reads further into the HTML when the start is all markup', () => {
    const html = `<div>${'<span></span>'.repeat(2_000)}</div><p>${'Words here. '.repeat(30)}</p>`;
    expect(excerptOf(html, 50)).toMatch(/^Words here\. Words here\./);
  });
});

describe('textLength', () => {
  it('counts readable characters, with tags and whitespace runs as one space', () => {
    expect(textLength('<p>Hello   <b>world</b></p>\n<p>&amp; more</p>')).toBe(
      'Hello world & more'.length,
    );
  });

  it('stops at an unclosed tag, and once past its limit', () => {
    expect(textLength('Hi <unclosed and more')).toBe(2);
    expect(textLength('x'.repeat(10_000), 400)).toBe(401);
  });
});

describe('parseAttributes', () => {
  it('reads every quoting style, lower-cases names and keeps the first duplicate', () => {
    expect({
      ...parseAttributes(` SRC='/a.jpg' alt="A &amp; B" width=600 hidden src="/b.jpg"`),
    }).toEqual({
      src: '/a.jpg',
      alt: 'A & B',
      width: '600',
      hidden: '',
    });
  });
});

describe('safeHttpUrl', () => {
  it.each([
    ['mailto:', 'mailto:jo@site.test'],
    ['a relative address without a base', '/feed'],
    ['nothing', ''],
    ['a non-string', 42],
  ])('rejects %s', (_, value) => {
    expect(safeHttpUrl(value)).toBeNull();
  });
});
