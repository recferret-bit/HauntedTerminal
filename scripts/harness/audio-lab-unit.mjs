#!/usr/bin/env node
// Unit tests for /audio-lab metadata, audio config bounds, and MusicScene/AppBus resolution.
import assert from 'node:assert/strict';
import { withProcgen } from './lib/load.mjs';

await withProcgen(async (_p, vite) => {
  const { SFX_IDS, MUSIC_IDS } = await vite.ssrLoadModule('/src/audio/catalog.ts');
  const {
    DEFAULT_LOOP_GAIN,
    KEY_GAINS,
    KEY_RATES,
    KEY_VARIANTS,
    LOOP_ACCENTS,
    LOOP_CUE_IDS,
    LOOP_GAINS,
    SFX_TRIM,
    SPEECH_SFX,
    TAUNT_VARIANTS,
  } = await vite.ssrLoadModule('/src/audio/config.ts');
  const {
    buildCatalogItems,
    defaultLoopGainFor,
    defaultTrimFor,
    filterCatalogItems,
    formatTrimSnippet,
  } = await vite.ssrLoadModule('/src/audio-lab/catalog-meta.ts');
  const { musicFor, sceneFor } = await vite.ssrLoadModule('/src/audio/music-for.ts');
  const { sfxFor } = await vite.ssrLoadModule('/src/audio/sfx-for.ts');

  const sfxSet = new Set(SFX_IDS);
  const musicSet = new Set(MUSIC_IDS);

  assert.ok(DEFAULT_LOOP_GAIN > 0 && DEFAULT_LOOP_GAIN < 1);
  assert.ok(KEY_RATES.length >= 3 && KEY_RATES.every((r) => r > 0.5 && r < 2));
  assert.ok(KEY_GAINS.length >= 3 && KEY_GAINS.every((g) => g > 0 && g <= 1));

  for (const [id, win] of Object.entries(SFX_TRIM)) {
    assert.ok(sfxSet.has(id), `SFX_TRIM key "${id}" must exist in SFX_IDS`);
    assert.ok(Number.isFinite(win.offset) && win.offset >= 0, `SFX_TRIM.${id}.offset must be >= 0`);
    if (win.duration !== undefined) {
      assert.ok(Number.isFinite(win.duration) && win.duration > 0, `SFX_TRIM.${id}.duration must be > 0`);
    }
  }

  for (const id of LOOP_CUE_IDS) {
    assert.ok(sfxSet.has(id), `LOOP_CUE_IDS entry "${id}" must exist in SFX_IDS`);
  }
  for (const [id, gain] of Object.entries(LOOP_GAINS)) {
    assert.ok(sfxSet.has(id), `LOOP_GAINS key "${id}" must exist in SFX_IDS`);
    assert.ok(Number.isFinite(gain) && gain > 0 && gain <= 1, `LOOP_GAINS.${id} out of range`);
  }
  for (const [id, spec] of Object.entries(LOOP_ACCENTS)) {
    assert.ok(sfxSet.has(id), `LOOP_ACCENTS key "${id}" must exist in SFX_IDS`);
    assert.ok(Array.isArray(spec.cues) && spec.cues.length > 0, `LOOP_ACCENTS.${id}.cues must be non-empty`);
    for (const c of spec.cues) assert.ok(sfxSet.has(c), `LOOP_ACCENTS.${id} cue "${c}" must exist in SFX_IDS`);
    assert.ok(spec.minIntervalMs >= 50 && spec.maxIntervalMs >= spec.minIntervalMs, `LOOP_ACCENTS.${id} interval bounds invalid`);
    assert.ok(spec.gain > 0 && spec.gain <= 1, `LOOP_ACCENTS.${id}.gain out of range`);
  }
  for (const [base, group] of [...Object.entries(KEY_VARIANTS), ...Object.entries(TAUNT_VARIANTS)]) {
    assert.ok(sfxSet.has(base), `variant key "${base}" must exist in SFX_IDS`);
    assert.ok(Array.isArray(group) && group.length > 0);
    for (const v of group) assert.ok(sfxSet.has(v), `variant "${v}" must exist in SFX_IDS`);
  }
  assert.ok(SPEECH_SFX.has('dialog_hero'));

  const items = buildCatalogItems();
  assert.equal(items.length, SFX_IDS.length + MUSIC_IDS.length);
  assert.equal(filterCatalogItems(items, 'music', '').length, MUSIC_IDS.length);
  assert.equal(filterCatalogItems(items, 'trimmed', '').length, Object.keys(SFX_TRIM).length);
  assert.ok(filterCatalogItems(items, 'voice', '').length >= SPEECH_SFX.size);
  assert.ok(filterCatalogItems(items, 'loop', '').length >= LOOP_CUE_IDS.length);
  assert.ok(filterCatalogItems(items, 'all', 'KEY_PRESS').some((i) => i.id === 'key_press'));

  assert.deepEqual(defaultTrimFor('key_press'), SFX_TRIM.key_press);
  assert.deepEqual(defaultTrimFor('unknown_cue'), { offset: 0 });
  assert.equal(defaultLoopGainFor('rain_loop'), 0.22);
  assert.equal(defaultLoopGainFor('low_hp_loop'), DEFAULT_LOOP_GAIN);
  assert.equal(
    formatTrimSnippet('key_press', { offset: 0.1, duration: 0.2 }),
    'key_press: { offset: 0.1, duration: 0.2 },',
  );
  assert.equal(formatTrimSnippet('key_enter', { offset: 0.05 }), 'key_enter: { offset: 0.05 },');

  const bossBed = musicFor(sceneFor('play', { battle: 'boss', floorTheme: 5 }));
  assert.ok(musicSet.has(bossBed), `expected boss music in MUSIC_IDS, got ${bossBed}`);
  const killCues = sfxFor({ kind: 'kernel', event: { type: 'PROC_SIGNALED', pid: 1, signal: 'SIGKILL', outcome: 'KILLED' } });
  assert.ok(killCues.length > 0 && killCues.every((c) => sfxSet.has(c)));

  console.log(`audio-lab unit: ${items.length} cues (${SFX_IDS.length} SFX, ${MUSIC_IDS.length} music), ${Object.keys(SFX_TRIM).length} trim entries OK`);
});
