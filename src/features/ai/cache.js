/**
 * Keeps AI results in the browser's IndexedDB ("feedolio-ai"), so the same
 * question is never paid for twice (§7.5).
 *
 * - answers: summaries, translations, explanations and digests, keyed by
 *   account, story, action, language and model.
 * - judgments: rule checks, keyed by account, story, rule and rule version.
 *
 * Entries older than 30 days are trimmed when the database opens. Where
 * IndexedDB is missing or blocked, results are kept in memory for the page.
 */

const DB_NAME = 'feedolio-ai';
const DB_VERSION = 1;
export const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/** @typedef {'answers'|'judgments'} CacheStore */
/** @typedef {{ key: string, value: unknown, savedAt: number }} CacheRecord */

const STORES = /** @type {CacheStore[]} */ (['answers', 'judgments']);

/** @type {Promise<IDBDatabase|null>|null} */
let opening = null;
/** @type {Map<string, CacheRecord>} */
const memory = new Map();

/**
 * @template T
 * @param {IDBRequest<T>} request
 * @returns {Promise<T>}
 */
function settled(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** @returns {Promise<IDBDatabase|null>} */
function open() {
  opening ??= new Promise((resolve) => {
    /** @type {IDBOpenDBRequest} */
    let request;
    try {
      request = globalThis.indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const name of STORES) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath: 'key' }).createIndex('savedAt', 'savedAt');
        }
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        opening = null;
      };
      void trim(db);
      resolve(db);
    };
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
  return opening;
}

/**
 * Deletes entries older than MAX_AGE_MS.
 *
 * @param {IDBDatabase} db
 * @returns {Promise<void>}
 */
function trim(db) {
  return new Promise((resolve) => {
    const cutoff = IDBKeyRange.upperBound(Date.now() - MAX_AGE_MS);
    const transaction = db.transaction(STORES, 'readwrite');
    for (const name of STORES) {
      const request = transaction.objectStore(name).index('savedAt').openCursor(cutoff);
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        cursor.delete();
        cursor.continue();
      };
    }
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => resolve();
    transaction.onabort = () => resolve();
  });
}

/**
 * A saved result, or null.
 *
 * @param {CacheStore} store
 * @param {string} key
 * @returns {Promise<unknown>}
 */
export async function readCached(store, key) {
  const db = await open();
  if (!db) return fresh(memory.get(`${store}\n${key}`))?.value ?? null;
  try {
    const record = /** @type {CacheRecord|undefined} */ (
      await settled(db.transaction(store).objectStore(store).get(key))
    );
    return fresh(record)?.value ?? null;
  } catch {
    return null;
  }
}

/**
 * Saves a result.
 *
 * @param {CacheStore} store
 * @param {string} key
 * @param {unknown} value
 */
export async function writeCached(store, key, value) {
  /** @type {CacheRecord} */
  const record = { key, value, savedAt: Date.now() };
  const db = await open();
  if (!db) {
    memory.set(`${store}\n${key}`, record);
    return;
  }
  try {
    await settled(db.transaction(store, 'readwrite').objectStore(store).put(record));
  } catch {
    memory.set(`${store}\n${key}`, record);
  }
}

/** @param {CacheRecord|undefined} record */
function fresh(record) {
  return record && record.savedAt > Date.now() - MAX_AGE_MS ? record : undefined;
}

/**
 * The key for an answer: whose, which story, which action, which language
 * and which model wrote it.
 *
 * @param {{ scope: string|null, storyId: string, action: string, language?: string, model: string }} parts
 */
export function answerKey({ scope, storyId, action, language = '', model }) {
  return [scope ?? 'guest', storyId, action, language, model].join('|');
}

/** Lets go of the database, so tests can start with a fresh one. */
export async function closeCache() {
  const db = await opening;
  db?.close();
  opening = null;
  memory.clear();
}
