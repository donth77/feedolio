/**
 * Where the reader's AI keys are kept: on this device only, apart from all
 * other data (never in feedolio:v1), and never sent anywhere but the
 * provider each key belongs to.
 *
 * - "Remember on this device" on: localStorage["feedolio:ai-keys:v1"].
 * - Off: sessionStorage, so the keys go when the tab closes.
 * - Signed-in readers have their own: "feedolio:ai-keys:v1:<user id>".
 * - If the browser blocks both, keys live in memory until the page closes.
 *
 * Stored shape: { general?: string, decision?: string }
 */

export const KEYS_PREFIX = 'feedolio:ai-keys:v1';

/** @typedef {'general'|'decision'} KeyRole */
/** @typedef {Partial<Record<KeyRole, string>>} Keys */

/** @type {Map<string, Keys>} Keys that couldn't be stored */
const memory = new Map();
const listeners = new Set();
let version = 0;
let listening = false;

/**
 * Where an account's keys are kept.
 *
 * @param {string|null|undefined} userId
 */
export function keysStorageKey(userId) {
  return userId ? `${KEYS_PREFIX}:${userId}` : KEYS_PREFIX;
}

/** @param {'local'|'session'} kind @returns {Storage|null} */
function storage(kind) {
  try {
    return (kind === 'local' ? globalThis.localStorage : globalThis.sessionStorage) ?? null;
  } catch {
    return null;
  }
}

/**
 * @param {Storage|null} target
 * @param {string} name
 * @returns {Keys}
 */
function readFrom(target, name) {
  let parsed;
  try {
    parsed = JSON.parse(target?.getItem(name) ?? 'null');
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== 'object') return {};
  /** @type {Keys} */
  const keys = {};
  for (const role of /** @type {KeyRole[]} */ (['general', 'decision'])) {
    if (typeof parsed[role] === 'string' && parsed[role]) keys[role] = parsed[role];
  }
  return keys;
}

/**
 * @param {Storage|null} target
 * @param {string} name
 * @param {Keys} keys
 * @returns {boolean} whether it was stored
 */
function writeTo(target, name, keys) {
  if (!target) return false;
  try {
    if (Object.keys(keys).length === 0) target.removeItem(name);
    else target.setItem(name, JSON.stringify(keys));
    return true;
  } catch {
    return false;
  }
}

/** @param {Keys} keys @param {KeyRole} role */
function without(keys, role) {
  const rest = { ...keys };
  delete rest[role];
  return rest;
}

function notify() {
  version += 1;
  for (const listener of listeners) listener();
}

/**
 * An account's key for one role, or null.
 *
 * @param {string|null|undefined} userId
 * @param {KeyRole} role
 */
export function getKey(userId, role) {
  const name = keysStorageKey(userId);
  return (
    memory.get(name)?.[role] ??
    readFrom(storage('session'), name)[role] ??
    readFrom(storage('local'), name)[role] ??
    null
  );
}

/**
 * Saves a key, on the device or for this tab only.
 *
 * @param {string|null|undefined} userId
 * @param {KeyRole} role
 * @param {string} key
 * @param {boolean} remember
 * @returns {boolean} false when the browser wouldn't store it (it's kept in memory instead)
 */
export function setKey(userId, role, key, remember) {
  const name = keysStorageKey(userId);
  const [target, other] = remember
    ? [storage('local'), storage('session')]
    : [storage('session'), storage('local')];
  const stored = writeTo(target, name, { ...readFrom(target, name), [role]: key });
  writeTo(other, name, without(readFrom(other, name), role));
  const held = without(memory.get(name) ?? {}, role);
  if (!stored) held[role] = key;
  if (Object.keys(held).length) memory.set(name, held);
  else memory.delete(name);
  notify();
  return stored;
}

/**
 * Forgets one key.
 *
 * @param {string|null|undefined} userId
 * @param {KeyRole} role
 */
export function deleteKey(userId, role) {
  const name = keysStorageKey(userId);
  for (const kind of /** @type {const} */ (['local', 'session'])) {
    const target = storage(kind);
    writeTo(target, name, without(readFrom(target, name), role));
  }
  const held = without(memory.get(name) ?? {}, role);
  if (Object.keys(held).length) memory.set(name, held);
  else memory.delete(name);
  notify();
}

/**
 * Moves an account's keys when "Remember on this device" changes.
 *
 * @param {string|null|undefined} userId
 * @param {boolean} remember
 */
export function moveKeys(userId, remember) {
  const name = keysStorageKey(userId);
  const local = storage('local');
  const session = storage('session');
  const keys = { ...readFrom(local, name), ...readFrom(session, name) };
  const [target, other] = remember ? [local, session] : [session, local];
  if (writeTo(target, name, keys)) writeTo(other, name, {});
  notify();
}

/**
 * Removes every AI key Feedolio has in this browser, for every account, from
 * both kinds of storage.
 */
export function removeAllKeys() {
  for (const kind of /** @type {const} */ (['local', 'session'])) {
    const target = storage(kind);
    if (!target) continue;
    try {
      const names = [];
      for (let index = 0; index < target.length; index += 1) {
        const name = target.key(index);
        if (name === KEYS_PREFIX || name?.startsWith(`${KEYS_PREFIX}:`)) names.push(name);
      }
      for (const name of names) target.removeItem(name);
    } catch {
      // Blocked storage holds nothing to remove.
    }
  }
  memory.clear();
  notify();
}

/**
 * Calls back when keys change, here or in another tab.
 *
 * @param {() => void} listener
 * @returns {() => void} unsubscribe
 */
export function subscribeToKeys(listener) {
  listeners.add(listener);
  if (!listening && typeof window !== 'undefined') {
    listening = true;
    window.addEventListener('storage', (event) => {
      if (event.key === null || event.key.startsWith(KEYS_PREFIX)) notify();
    });
  }
  return () => listeners.delete(listener);
}

/** Changes whenever keys do, for useSyncExternalStore. */
export function keysVersion() {
  return version;
}
