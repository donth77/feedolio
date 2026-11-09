// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  deleteKey,
  getKey,
  keysStorageKey,
  keysVersion,
  moveKeys,
  removeAllKeys,
  setKey,
  subscribeToKeys,
} from '../../src/features/ai/keys.js';

const ITEM = 'feedolio:ai-keys:v1';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  removeAllKeys();
});

describe('The AI key store', () => {
  it('keeps keys under their own item, never in the reader’s data (US-97)', () => {
    localStorage.setItem('feedolio:v1', '{"version":1}');
    expect(setKey(null, 'general', 'sk-ant-one', true)).toBe(true);
    setKey(null, 'decision', 'sk-or-two', true);

    expect(JSON.parse(localStorage.getItem(ITEM) ?? '')).toEqual({
      general: 'sk-ant-one',
      decision: 'sk-or-two',
    });
    expect(localStorage.getItem('feedolio:v1')).toBe('{"version":1}');
    expect(getKey(null, 'general')).toBe('sk-ant-one');
    expect(getKey(null, 'decision')).toBe('sk-or-two');
  });

  it('keeps keys for this tab only when Remember is off, and moves them when it changes', () => {
    setKey(null, 'general', 'sk-ant-one', false);
    expect(localStorage.getItem(ITEM)).toBeNull();
    expect(JSON.parse(sessionStorage.getItem(ITEM) ?? '')).toEqual({ general: 'sk-ant-one' });

    moveKeys(null, true);
    expect(sessionStorage.getItem(ITEM)).toBeNull();
    expect(JSON.parse(localStorage.getItem(ITEM) ?? '')).toEqual({ general: 'sk-ant-one' });

    // Saving with Remember off takes the key out of the device's storage.
    setKey(null, 'general', 'sk-ant-new', false);
    expect(localStorage.getItem(ITEM)).toBeNull();
    expect(getKey(null, 'general')).toBe('sk-ant-new');
  });

  it('gives each account its own keys', () => {
    setKey(null, 'general', 'guest-key', true);
    setKey('github|42', 'general', 'ada-key', true);
    expect(keysStorageKey('github|42')).toBe(`${ITEM}:github|42`);
    expect(getKey(null, 'general')).toBe('guest-key');
    expect(getKey('github|42', 'general')).toBe('ada-key');
    expect(getKey('github|7', 'general')).toBeNull();
  });

  it('forgets one key, or every key for every account (US-99)', () => {
    setKey(null, 'general', 'a', true);
    setKey(null, 'decision', 'b', true);
    setKey('github|42', 'general', 'c', false);
    localStorage.setItem('feedolio:v1', '{"version":1}');
    localStorage.setItem('feedolio:ai-keys:v10', 'not ours');

    deleteKey(null, 'decision');
    expect(JSON.parse(localStorage.getItem(ITEM) ?? '')).toEqual({ general: 'a' });
    deleteKey(null, 'general');
    expect(localStorage.getItem(ITEM)).toBeNull();

    setKey(null, 'general', 'a', true);
    removeAllKeys();
    expect(getKey(null, 'general')).toBeNull();
    expect(getKey('github|42', 'general')).toBeNull();
    expect(sessionStorage.length).toBe(0);
    expect(localStorage.getItem('feedolio:v1')).toBe('{"version":1}');
    expect(localStorage.getItem('feedolio:ai-keys:v10')).toBe('not ours');
  });

  it('ignores anything in storage that isn’t a key', () => {
    localStorage.setItem(ITEM, '{not json');
    expect(getKey(null, 'general')).toBeNull();
    localStorage.setItem(ITEM, JSON.stringify({ general: 42, decision: '' }));
    expect(getKey(null, 'general')).toBeNull();
    expect(getKey(null, 'decision')).toBeNull();
    localStorage.setItem(ITEM, 'null');
    expect(getKey(null, 'general')).toBeNull();
  });

  it('holds keys in memory when the browser won’t store them', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Blocked', 'SecurityError');
    });
    expect(setKey(null, 'general', 'in-memory', true)).toBe(false);
    expect(getKey(null, 'general')).toBe('in-memory');
    deleteKey(null, 'general');
    expect(getKey(null, 'general')).toBeNull();

    setKey(null, 'general', 'again', true);
    removeAllKeys();
    expect(getKey(null, 'general')).toBeNull();
  });

  it('tells listeners about changes here and in other tabs', () => {
    const heard = vi.fn();
    const stop = subscribeToKeys(heard);
    const before = keysVersion();

    setKey(null, 'general', 'a', true);
    window.dispatchEvent(new StorageEvent('storage', { key: ITEM }));
    window.dispatchEvent(new StorageEvent('storage', { key: 'feedolio:v1' }));
    window.dispatchEvent(new StorageEvent('storage', { key: null }));

    expect(heard).toHaveBeenCalledTimes(3);
    expect(keysVersion()).toBe(before + 3);
    stop();
    deleteKey(null, 'general');
    expect(heard).toHaveBeenCalledTimes(3);
  });
});
