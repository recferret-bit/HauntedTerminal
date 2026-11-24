import { DEV_KEY_PREFIX, LEGACY_DEV_KEY_PREFIX, LEGACY_SLUG, PROJECT_SLUG } from './brand.js';

/** The part of `Storage` the migration uses, so a test can pass a plain object. */
export interface KeyStore {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const RENAMES: readonly (readonly [string, string])[] = [
  [`${LEGACY_SLUG}:`, `${PROJECT_SLUG}:`],
  [LEGACY_DEV_KEY_PREFIX, DEV_KEY_PREFIX],
];

/** The new name of an old key, or null when the key is not an old one. */
export function renamedKey(oldKey: string): string | null {
  for (const [from, to] of RENAMES) if (oldKey.startsWith(from)) return to + oldKey.slice(from.length);
  return null;
}

/**
 * Copy every old key to its new name. A new key that already exists wins and is left unchanged; the old key stays, so a
 * rollback keeps its data. Safe to run on every page load. Returns how many keys it copied.
 */
export function migrateLegacyKeys(store: KeyStore): number {
  const olds: string[] = [];
  for (let i = 0; i < store.length; i++) {
    const k = store.key(i);
    if (k !== null && renamedKey(k) !== null) olds.push(k);
  }
  let copied = 0;
  for (const oldKey of olds) {
    const newKey = renamedKey(oldKey);
    const value = store.getItem(oldKey);
    if (newKey === null || value === null || store.getItem(newKey) !== null) continue;
    store.setItem(newKey, value);
    copied++;
  }
  return copied;
}
