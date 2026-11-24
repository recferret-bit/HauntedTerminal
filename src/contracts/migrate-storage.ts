import { migrateLegacyKeys } from './legacy-keys.js';

/** Import this first in a page entry: it moves saved data from the old key names before anything reads it. */
try {
  migrateLegacyKeys(localStorage);
} catch {
  // storage blocked (private mode, sandboxed frame): nothing to migrate
}
