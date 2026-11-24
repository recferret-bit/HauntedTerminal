#!/usr/bin/env node
// Unit check of the storage key migration (spec rename-out-of-credits, Req 2-3): old only, new only, both, twice.
//   node scripts/harness/legacy-keys-unit.mjs
import assert from 'node:assert/strict';
import { createServer } from 'vite';

const server = await createServer({ configFile: 'vite.config.ts', server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { migrateLegacyKeys, renamedKey } = await server.ssrLoadModule('/src/contracts/legacy-keys.ts');
  const makeStore = (init) => {
    const m = new Map(Object.entries(init));
    return {
      map: m,
      get length() { return m.size; },
      key: (i) => [...m.keys()][i] ?? null,
      getItem: (k) => (m.has(k) ? m.get(k) : null),
      setItem: (k, v) => void m.set(k, v),
    };
  };

  assert.equal(renamedKey('haunted-terminal:achievements:v1'), 'out-of-credits:achievements:v1');
  assert.equal(renamedKey('haunted.laptop.progress'), 'credits.laptop.progress');
  assert.equal(renamedKey('other:key'), null);

  const oldOnly = makeStore({ 'haunted-terminal:progress:v1': 'P', 'haunted.skipIntro': '1', unrelated: 'x' });
  assert.equal(migrateLegacyKeys(oldOnly), 2);
  assert.equal(oldOnly.getItem('out-of-credits:progress:v1'), 'P');
  assert.equal(oldOnly.getItem('credits.skipIntro'), '1');
  assert.equal(oldOnly.getItem('haunted-terminal:progress:v1'), 'P', 'old key stays for a rollback');

  const newOnly = makeStore({ 'out-of-credits:progress:v1': 'N' });
  assert.equal(migrateLegacyKeys(newOnly), 0);
  assert.equal(newOnly.getItem('out-of-credits:progress:v1'), 'N');

  const both = makeStore({ 'haunted-terminal:progress:v1': 'OLD', 'out-of-credits:progress:v1': 'NEW' });
  assert.equal(migrateLegacyKeys(both), 0);
  assert.equal(both.getItem('out-of-credits:progress:v1'), 'NEW', 'the new key wins and is unchanged');

  const twice = makeStore({ 'haunted-terminal:metagame:v1': 'M' });
  assert.equal(migrateLegacyKeys(twice), 1);
  assert.equal(migrateLegacyKeys(twice), 0);
  assert.equal(twice.map.size, 2);
  console.log('legacy-keys-unit OK');
} finally {
  await server.close();
}
