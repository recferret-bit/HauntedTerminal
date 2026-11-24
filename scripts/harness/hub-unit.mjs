#!/usr/bin/env node
// Unit tests for the landing tabs (spec .kiro/specs/landing-tabs/): the Comix tile model and the header table.
//   node scripts/harness/hub-unit.mjs
// Pure logic through Vite SSR, no browser. The pages themselves are checked by scripts/desktop/landing-smoke.mjs.
import assert from 'node:assert/strict';
import { withProcgen } from './lib/load.mjs';
import { testRunner } from './lib/test-kit.mjs';

const { test, count } = testRunner();
const rec = (cleared) => ({ cleared, bestRank: 'S', bestCommands: 1, bestTimeSec: 1, updatedAt: 0 });
const manifest = (id, status, levels = 3) => ({ id, title: `T ${id}`, subtitle: `S ${id}`, badge: `B ${id}`, status, levels: Array.from({ length: levels }, (_, i) => ({ id: `l${i}` })) });

await withProcgen(async (tiles) => {
  const { buildComixTiles, buildSequenceTiles, buildComixSections } = tiles;

  await test('intro and outro become Watch tiles by role, with the player href, and ignore other sequences', () => {
    const seq = (id, role, status = 'playable') => ({ id, title: `T ${id}`, subtitle: `S ${id}`, role, status });
    const out = buildSequenceTiles([seq('a b', 'opening'), seq('z', 'ending'), seq('m', 'interlude'), seq('d', 'opening', 'draft')]);
    assert.deepEqual(out.map((t) => [t.key, t.badge, t.kind]), [['a b', 'INTRO', 'sequence'], ['z', 'OUTRO', 'sequence']]);
    assert.equal(out[0].watchHref, '/cinematic.html?play=a%20b');
  });

  await test('sections: CHAPTER 1 holds intro, issue, outro; chapters 2 to 5 follow without a header', () => {
    const seq = (id, role) => ({ id, title: id, subtitle: '', role, status: 'playable' });
    const out = buildComixSections([seq('i', 'opening'), seq('o', 'ending')], [manifest('c1', 'playable')], {});
    assert.deepEqual(out.map((s) => s.heading), ['CHAPTER 1', undefined]);
    assert.deepEqual(out[0].tiles.map((t) => t.key), ['i', 'c1', 'o']);
    assert.deepEqual(out[1].tiles.map((t) => t.title), ['CHAPTER 2', 'CHAPTER 3', 'CHAPTER 4', 'CHAPTER 5']);
  });

  await test('a playable chapter is an open tile with progress from cleared levels only', () => {
    const out = buildComixTiles([manifest('c1', 'playable')], { c1: { l0: rec(true), l1: rec(false), l2: rec(true) } }, []);
    assert.equal(out.length, 1);
    assert.equal(out[0].kind, 'open');
    assert.deepEqual(out[0].progress, { cleared: 2, total: 3 });
    assert.equal(out[0].readHref, '/comic.html?chapter=c1');
    assert.equal(out[0].playHref, '/play/c1');
  });

  await test('a chapter with no saved progress is open with 0 cleared', () => {
    assert.deepEqual(buildComixTiles([manifest('c1', 'playable', 11)], {}, [])[0].progress, { cleared: 0, total: 11 });
  });

  await test('a chapter that is not playable is a locked tile with no links and no progress', () => {
    const t = buildComixTiles([manifest('c2', 'spec')], {}, [])[0];
    assert.equal(t.kind, 'locked');
    assert.equal(t.readHref, undefined);
    assert.equal(t.playHref, undefined);
    assert.equal(t.progress, undefined);
  });

  await test('the roadmap adds locked tiles CHAPTER 2 to 5 after the chapters, by default', () => {
    const out = buildComixTiles([manifest('c1', 'playable')], {});
    assert.deepEqual(out.map((t) => t.kind), ['open', 'locked', 'locked', 'locked', 'locked']);
    assert.deepEqual(out.slice(1).map((t) => t.title), ['CHAPTER 2', 'CHAPTER 3', 'CHAPTER 4', 'CHAPTER 5']);
    assert.ok(out.slice(1).every((t) => !t.readHref && !t.playHref && !t.progress));
  });

  await test('ids with special characters are escaped in the links', () => {
    const t = buildComixTiles([manifest('a b&c', 'playable')], {}, [])[0];
    assert.equal(t.readHref, '/comic.html?chapter=a%20b%26c');
    assert.equal(t.playHref, '/play/a%20b%26c');
  });

  await test('no manifests still gives the roadmap tiles', () => {
    assert.equal(buildComixTiles([], {}).length, 4);
  });
}, '/src/hub/comix-tiles.ts');

await withProcgen(async (tabs) => {
  await test('the header table: six items, three tabs with their own pages, Steam as the action', () => {
    const items = tabs.hubItems();
    assert.deepEqual(items.map((i) => i.id), ['play', 'steam', 'desktop', 'achievements', 'comix', 'chapters']);
    assert.deepEqual(items.filter((i) => i.kind === 'tab').map((i) => [i.tab, i.href]), [['desktop', '/desktop.html'], ['achievements', '/achievements.html'], ['comix', '/comix.html']]);
    assert.equal(items.find((i) => i.kind === 'steam').href, '/?wishlist=1');
    assert.equal(items.find((i) => i.id === 'chapters').href, '/chapters.html');
    assert.match(items.find((i) => i.id === 'play').href, /^\/play\/[^/]+$/);
  });
}, '/src/hub/tabs.ts');

console.log(`\nhub unit: ${count()} tests passed`);
