import { IDBFactory } from 'fake-indexeddb';
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  answerKey,
  closeCache,
  MAX_AGE_MS,
  readAllCached,
  readCached,
  writeAllCached,
  writeCached,
} from '../../src/features/ai/cache.js';

const NOW = new Date('2026-11-09T12:00:00Z');

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
});

afterEach(async () => {
  await closeCache();
  vi.useRealTimers();
});

describe('The AI cache', () => {
  it('keys answers by account, story, action, language and model', () => {
    expect(
      answerKey({ scope: null, storyId: 's_1', action: 'summarize', model: 'claude-opus-5-5' }),
    ).toBe('guest|s_1|summarize||claude-opus-5-5');
    expect(
      answerKey({
        scope: 'github|42',
        storyId: 's_1',
        action: 'translate',
        language: 'es',
        model: 'gpt-5',
      }),
    ).toBe('github|42|s_1|translate|es|gpt-5');
  });

  it('keeps results in IndexedDB', async () => {
    await writeCached('answers', 'a', { text: 'Summary' });
    await writeCached('judgments', 'a', { confidence: 0.9 });
    expect(await readCached('answers', 'a')).toEqual({ text: 'Summary' });
    expect(await readCached('judgments', 'a')).toEqual({ confidence: 0.9 });
    expect(await readCached('answers', 'missing')).toBeNull();

    // A new page finds them again.
    await closeCache();
    expect(await readCached('answers', 'a')).toEqual({ text: 'Summary' });
  });

  it('forgets results after 30 days, and trims them when it opens', async () => {
    await writeCached('answers', 'old', 'Old summary');
    vi.setSystemTime(NOW.getTime() + 10 * 24 * 60 * 60 * 1000);
    await writeCached('answers', 'newer', 'Newer summary');

    vi.setSystemTime(NOW.getTime() + MAX_AGE_MS + 1);
    expect(await readCached('answers', 'old')).toBeNull();
    expect(await readCached('answers', 'newer')).toBe('Newer summary');

    // Reopening deletes what's too old.
    await closeCache();
    await readCached('answers', 'newer');
    const records = await new Promise((resolve) => {
      const request = indexedDB.open('feedolio-ai', 1);
      request.onsuccess = () => {
        const all = request.result.transaction('answers').objectStore('answers').getAllKeys();
        all.onsuccess = () => {
          request.result.close();
          resolve(all.result);
        };
      };
    });
    expect(records).toEqual(['newer']);
  });

  it('never trims what it was told to keep, and reads one account’s entries at once', async () => {
    await writeCached('judgments', 'guest|s1|r1', { verdict: 'match' }, { keep: true });
    await writeCached('judgments', 'guest|s2|r1', { verdict: 'no' });
    await writeCached('judgments', 'github|42|s1|r1', { verdict: 'maybe' }, { keep: true });
    expect(await readAllCached('judgments', 'guest|')).toEqual([
      { verdict: 'match' },
      { verdict: 'no' },
    ]);

    vi.setSystemTime(NOW.getTime() + MAX_AGE_MS + 1);
    await closeCache();
    expect(await readAllCached('judgments', 'guest|')).toEqual([{ verdict: 'match' }]);
    expect(await readAllCached('judgments', 'github|42|')).toEqual([{ verdict: 'maybe' }]);
    expect(await readCached('judgments', 'guest|s1|r1')).toEqual({ verdict: 'match' });
  });

  it('saves a batch in one go', async () => {
    await writeAllCached('judgments', [
      { key: 'guest|s1|r1', value: 'one', keep: true },
      { key: 'guest|s2|r1', value: 'two' },
    ]);
    expect(await readAllCached('judgments', 'guest|')).toEqual(['one', 'two']);
  });

  it('keeps results in memory where IndexedDB is missing or fails', async () => {
    globalThis.indexedDB = /** @type {any} */ ({
      open() {
        throw new Error('Blocked');
      },
    });
    await writeCached('answers', 'a', 'In memory');
    expect(await readCached('answers', 'a')).toBe('In memory');
    expect(await readCached('answers', 'b')).toBeNull();
    await writeCached('judgments', 'guest|s1|r1', 'Kept', { keep: true });
    await writeCached('judgments', 'github|42|s1|r1', 'Theirs');
    await writeAllCached('judgments', [{ key: 'guest|s2|r1', value: 'Batch' }]);
    expect(await readAllCached('judgments', 'guest|')).toEqual(['Kept', 'Batch']);
  });

  it('copes with a database that won’t open', async () => {
    globalThis.indexedDB = /** @type {any} */ ({
      open() {
        const request = /** @type {any} */ ({});
        queueMicrotask(() => request.onerror?.());
        return request;
      },
    });
    await writeCached('answers', 'a', 'In memory');
    expect(await readCached('answers', 'a')).toBe('In memory');
  });
});
