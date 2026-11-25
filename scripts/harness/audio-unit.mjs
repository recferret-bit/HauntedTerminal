#!/usr/bin/env node
// App bus, SFX and music (.kiro/specs/app-events-audio/).
// Every manifest cue is named by the player, the pool of 10 reuses the oldest voice,
// and music priority matches the design.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { listChapterSlugs, readChapter } from './lib/chapter-compile.mjs';
import { testRunner } from './lib/test-kit.mjs';
import { withProcgen } from './lib/load.mjs';

const { test, count } = testRunner();
const sfxManifest = JSON.parse(readFileSync('public/sfx/manifest.json', 'utf8'));
const musicManifest = JSON.parse(readFileSync('public/music/manifest.json', 'utf8'));
const sfxNames = sfxManifest.sounds.map((row) => row.name);
const musicNames = musicManifest.cues.map((row) => row.name);

const audioSrc = readdirSync('src/audio')
  .filter((name) => name.endsWith('.ts') && name !== 'catalog.ts')
  .map((name) => readFileSync(`src/audio/${name}`, 'utf8'))
  .join('\n');

await test('every sfx id is mapped outside the catalog', () => {
  const missing = sfxNames.filter((name) => !audioSrc.includes(`'${name}'`));
  assert.deepEqual(missing, []);
});

await test('every music id is mapped outside the catalog', () => {
  const missing = musicNames.filter((name) => !audioSrc.includes(`'${name}'`));
  assert.deepEqual(missing, []);
});

await withProcgen(async (_procgen, vite) => {
  const busMod = await vite.ssrLoadModule('/src/contracts/app-bus.ts');
  const sfxMod = await vite.ssrLoadModule('/src/audio/sfx-for.ts');
  const musicMod = await vite.ssrLoadModule('/src/audio/music-for.ts');
  const voices = await vite.ssrLoadModule('/src/audio/voices.ts');
  const catalog = await vite.ssrLoadModule('/src/audio/catalog.ts');
  const limits = await vite.ssrLoadModule('/src/audio/limits.ts');

  await test('catalog matches the manifests, assets exist on disk, and the pool starts at 10', () => {
    assert.deepEqual([...catalog.SFX_IDS], sfxNames);
    assert.deepEqual([...catalog.MUSIC_IDS], musicNames);
    assert.equal(limits.SOUND_SOURCES, 10);
    assert.equal(busMod.SOUND_SOURCES, undefined);
    for (const id of catalog.SFX_IDS) {
      const url = catalog.sampleUrl('sfx', id);
      assert.ok(url && existsSync(join('public', url.slice(1))), `missing sfx file on disk: ${url}`);
    }
    for (const id of catalog.MUSIC_IDS) {
      const url = catalog.sampleUrl('music', id);
      assert.ok(url && existsSync(join('public', url.slice(1))), `missing music file on disk: ${url}`);
      const asset = catalog.musicAsset(id);
      const bedUrl = catalog.sampleUrl('music', asset.bed);
      assert.ok(bedUrl && existsSync(join('public', bedUrl.slice(1))), `missing music bed on disk: ${bedUrl}`);
      if (asset.intro) {
        const introUrl = catalog.sampleUrl('music', asset.intro);
        assert.ok(introUrl && existsSync(join('public', introUrl.slice(1))), `missing music intro on disk: ${introUrl}`);
      }
    }
    for (const [id, entry] of Object.entries(catalog.MUSIC_SPLIT)) {
      for (const part of [entry.intro, entry.bed]) {
        const url = catalog.sampleUrl('music', part);
        assert.ok(url && existsSync(join('public', url.slice(1))), `missing split music ${id} (${part}) on disk: ${url}`);
      }
    }
  });

  await test('kernel events pick the sample for that action', () => {
    const kill = sfxMod.sfxFor({
      kind: 'kernel',
      event: { type: 'ENEMY_KILLED', entityId: 'e', model: 'boss.kernel', how: 'SIGKILL' },
    });
    assert.ok(kill.includes('kill') && kill.includes('boss_defeated'));
    const door = sfxMod.sfxFor({
      kind: 'kernel',
      event: {
        type: 'ROOM_TRANSITION', fromDir: 1, toDir: 2, toPath: '/var/dungeon/entrance/iron_gate',
        upwardPanelsSmashed: 0, viaSymlinkLoop: false,
      },
    });
    assert.deepEqual(door, ['door_firewall']);
    const hop = sfxMod.sfxFor({
      kind: 'kernel',
      event: {
        type: 'ROOM_TRANSITION', fromDir: 1, toDir: 2, toPath: '/home/dev/desk/drawer',
        upwardPanelsSmashed: 0, viaSymlinkLoop: false,
      },
    });
    assert.deepEqual(hop, ['hop']);
    assert.deepEqual(sfxMod.sfxFor({ kind: 'command', result: 'locked' }), ['cmd_locked']);
    assert.deepEqual(sfxMod.sfxFor({ kind: 'key', key: 'press' }), ['key_press']);
    assert.deepEqual(sfxMod.sfxFor({ kind: 'laptop', action: 'run' }), ['lap_run']);
    assert.deepEqual(sfxMod.sfxFor({ kind: 'letter', letter: 'slam' }), ['cine_sfx_slam']);
    assert.equal(sfxMod.hpBand(40), sfxMod.hpBand(21));
    assert.ok(sfxMod.hpBand(20) < sfxMod.hpBand(21));
  });

  await test('music priority: rank, menu, low hp, boss, floor', () => {
    const scene = (patch) => musicMod.sceneFor('play', patch);
    assert.equal(musicMod.musicFor(musicMod.sceneFor('rank', { menu: true, battle: 'boss' })), 'rank_card');
    assert.equal(musicMod.musicFor(scene({ menu: true, battle: 'boss', lowHp: true })), 'menu_bed');
    assert.equal(musicMod.musicFor(scene({ reading: true, battle: 'fight' })), 'manual_bed');
    assert.equal(musicMod.musicFor(scene({ battle: 'boss', lowHp: true, floorTheme: 5 })), 'low_hp_bed');
    assert.equal(musicMod.musicFor(scene({ battle: 'boss', floorTheme: 5 })), 'battle_boss');
    assert.equal(musicMod.musicFor(scene({ battle: 'fight', floorTheme: 2 })), 'battle_loop');
    assert.equal(musicMod.musicFor(scene({ hub: true, floorTheme: 1 })), 'hub_matrix');
    assert.equal(musicMod.musicFor(scene({ floorTheme: 1 })), 'floor_attic');
    assert.equal(musicMod.musicFor(scene({ floorTheme: 2 })), 'floor_crypt');
    assert.equal(musicMod.musicFor(scene({ floorTheme: 3 })), 'floor_maze');
    assert.equal(musicMod.musicFor(scene({ floorTheme: 4 })), 'floor_furnace');
    assert.equal(musicMod.musicFor(scene({ floorTheme: 5 })), 'floor_core');
    assert.equal(musicMod.musicFor(musicMod.sceneFor('title')), 'title_theme');
    assert.equal(musicMod.musicFor(musicMod.sceneFor('level-select')), 'level_select');
    assert.equal(musicMod.musicFor(musicMod.sceneFor('manual')), 'manual_bed');
    assert.equal(musicMod.musicFor(musicMod.sceneFor('achievements')), 'achievements_bed');
    assert.equal(musicMod.musicFor(musicMod.sceneFor('comic')), 'comic_reader');
    assert.equal(musicMod.musicFor(musicMod.sceneFor('laptop')), 'laptop_bed');
    assert.equal(musicMod.musicFor(musicMod.sceneFor('lab')), 'lab_bed');
    assert.equal(musicMod.musicFor(musicMod.sceneFor('cine-intro')), 'cine_intro');
    assert.equal(musicMod.musicFor(musicMod.sceneFor('cine-outro')), 'cine_outro');
    const heard = new Set(musicNames.map((name) => audioSrc.includes(`'${name}'`)));
    assert.deepEqual([...heard], [true]);
  });

  await test('a full pool of 10 reuses the oldest voice', () => {
    const started = Array.from({ length: 10 }, (_v, i) => i + 1);
    assert.equal(voices.pickSlot(started), 0);
    started[3] = -1;
    assert.equal(voices.pickSlot(started), 3);
    assert.equal(voices.pickSlot([-1, 5, 4]), 0);
  });

  await test('a classic command publishes the command and its kernel events once', async () => {
    const sessionMod = await vite.ssrLoadModule('/src/game/session.ts');
    const session = sessionMod.createSession();
    session.exec('ls');
    const recent = session.bus.recent();
    const commands = recent.filter((event) => event.kind === 'command');
    const kernels = recent.filter((event) => event.kind === 'kernel');
    assert.equal(commands.length, 1);
    assert.equal(commands[0].result, 'ok');
    assert.ok(kernels.length > 0);
    session.exec('ls');
    assert.equal(session.bus.recent().filter((event) => event.kind === 'command').length, 2);
  });

  await test('the bus records events and unsubscribe stops delivery', () => {
    const bus = busMod.createAppBus();
    const seen = [];
    const stop = bus.subscribe((event) => seen.push(event.kind));
    busMod.publishKernel(bus, [{ type: 'GAME_ENDED', rank: 'A', timeSec: 1, commands: 1 }]);
    bus.emit({ kind: 'page' });
    stop();
    bus.emit({ kind: 'menu', action: 'open' });
    assert.deepEqual(seen, ['kernel', 'page']);
    assert.equal(bus.recent().length, 3);
    busMod.publishKernel(undefined, [{ type: 'GAME_ENDED', rank: 'A', timeSec: 1, commands: 1 }]);
  });

  await test('failed VIBECODER_ACTION emits no action SFX, hold emits item_lit, dialogs/tutorial/lightning map cleanly', () => {
    for (const action of ['cast', 'collect', 'lantern', 'read', 'type']) {
      assert.deepEqual(
        sfxMod.sfxFor({ kind: 'kernel', event: { type: 'VIBECODER_ACTION', action, command: 'x', failed: true } }),
        [],
      );
    }
    assert.deepEqual(
      sfxMod.sfxFor({ kind: 'kernel', event: { type: 'VIBECODER_ACTION', action: 'collect', command: 'hold lantern' } }),
      ['item_lit'],
    );
    assert.deepEqual(
      sfxMod.sfxFor({ kind: 'kernel', event: { type: 'VIBECODER_ACTION', action: 'collect', command: 'mv energy.cell ~' } }),
      ['hero_collect'],
    );
    assert.deepEqual(
      sfxMod.sfxFor({ kind: 'kernel', event: { type: 'VIBECODER_ACTION', action: 'lantern', command: 'ls -a' } }),
      [],
      'lantern action defers to LANTERN_REVEAL so ls -a does not double-play lantern_on',
    );
    assert.deepEqual(
      sfxMod.sfxFor({ kind: 'kernel', event: { type: 'VIBECODER_EMOTE', emote: 'confused' } }),
      ['emote_shock'],
    );
    assert.deepEqual(
      sfxMod.sfxFor({ kind: 'kernel', event: { type: 'VIBECODER_EMOTE', emote: 'determined' } }),
      ['emote_relief'],
    );
    assert.deepEqual(
      sfxMod.sfxFor({ kind: 'kernel', event: { type: 'PROC_SIGNALED', pid: 1, signal: 'SIGKILL', outcome: 'KILLED' } }),
      ['lightning'],
    );
    assert.deepEqual(
      sfxMod.sfxFor({ kind: 'kernel', event: { type: 'PROC_SIGNALED', pid: 1, signal: 'SIGTERM', outcome: 'KILLED' } }),
      ['lightning'],
    );
    assert.deepEqual(
      sfxMod.sfxFor({ kind: 'kernel', event: { type: 'PROC_SIGNALED', pid: 77, signal: 'SIGTERM', outcome: 'KILLED' } }),
      [],
      'non-PID-1 SIGTERM kill defers to ENEMY_KILLED so sigterm plays once',
    );
    assert.deepEqual(
      sfxMod.sfxFor({ kind: 'kernel', event: { type: 'ENEMY_STATE', entityId: 'e1', state: 'frozen' } }),
      [],
    );
    assert.deepEqual(
      sfxMod.sfxFor({ kind: 'kernel', event: { type: 'ENEMY_STATE', entityId: 'e1', state: 'enraged' } }),
      [],
    );
    assert.deepEqual(
      sfxMod.sfxFor({ kind: 'kernel', event: { type: 'GAME_ENDED', rank: 'S', timeSec: 10, commands: 5 } }),
      ['lightning', 'rank_reveal'],
    );
    assert.deepEqual(
      sfxMod.sfxFor({ kind: 'kernel', event: { type: 'DIALOG_BOX', id: 'd1', speaker: 'kiro', text: 'hi' } }),
      ['kiro_advice'],
    );
    assert.deepEqual(
      sfxMod.sfxFor({ kind: 'kernel', event: { type: 'DIALOG_BOX', id: 'd2', speaker: 'vibecoder', text: 'uh' } }),
      ['cine_bubble_pop'],
    );
    assert.deepEqual(
      sfxMod.sfxFor({ kind: 'kernel', event: { type: 'TUTORIAL_STEP', step: 1, total: 5, agent: 'kiro', prompt: 'hi' } }),
      ['cine_caption_in'],
    );
    assert.deepEqual(
      sfxMod.sfxFor({ kind: 'kernel', event: { type: 'TUTORIAL_STEP', step: 1, total: 5, agent: 'kiro', prompt: 'hi', done: true } }),
      [],
      'completed tutorial step does not double-fire cine_caption_in',
    );
    assert.deepEqual(
      sfxMod.sfxFor({ kind: 'kernel', event: { type: 'ITEM_CARRIED', entityId: 'kiro', item: 'terminal', model: 'item.terminal' } }),
      ['pickup_hover'],
    );
    assert.deepEqual(
      sfxMod.sfxFor({ kind: 'kernel', event: { type: 'ITEM_GIVEN', item: 'terminal', model: 'item.terminal' } }),
      ['item_lit'],
    );
  });

  await test('every chapter and classic directory resolves to a door cue while unknown rooms fall back to hop', () => {
    const dirs = [
      'desk', 'chronicles', 'ram_slots', 'pedestal', 'vram_crate', 'port_445', 'drive_bay',
      'iron_gate', 'chasm', 'hidden_wing', 'furnace_hall', 'cellar_hatch', 'crypt_stairs',
      'boiler_shaft', 'core_elevator', 'hub_uplink', 'gpu_alley', 'server_hub_1', 'server_hub_2',
      'server_hub_3', 'logic_cell', 'compose_furnace', 'north_exit', 'east_exit', 'south_exit',
      'wing_a', 'null', 'devnull', 'catwalk', 'entrance', 'cell_9', 'floor_3',
      'nightmare_workspace', 'boiler_room', 'panic_chamber', 'labyrinth', 'cache_vault',
      'wires_and_chips', 'ui_dashboard', 'sector_ui_grid', 'docker_forge',
      'sector_docker_forge', 'clod_kernel_core', 'clod_overlord_core',
    ];
    for (const d of dirs) {
      const cues = sfxMod.sfxFor({
        kind: 'kernel',
        event: { type: 'ROOM_TRANSITION', fromDir: 1, toDir: 2, toPath: `/root/${d}`, upwardPanelsSmashed: 0, viaSymlinkLoop: false },
      });
      assert.equal(cues.length, 1);
      assert.notEqual(cues[0], 'hop', `${d} should map to a door cue`);
    }
  });

  await test('all app events and pointer control ids map cleanly without nulls or double triggers', () => {
    const valid = new Set(catalog.SFX_IDS);
    const appEvents = [
      { kind: 'key', key: 'press' },
      { kind: 'key', key: 'enter' },
      { kind: 'key', key: 'backspace' },
      { kind: 'key', key: 'tab' },
      { kind: 'command', result: 'ok' },
      { kind: 'command', result: 'fail' },
      { kind: 'command', result: 'locked' },
      { kind: 'menu', action: 'open' },
      { kind: 'menu', action: 'close' },
      { kind: 'menu', action: 'move' },
      { kind: 'restart', step: 'arm' },
      { kind: 'restart', step: 'go' },
      { kind: 'manual', open: true },
      { kind: 'manual', open: false },
      { kind: 'timer', secondsLeft: 3 },
      { kind: 'page' },
      ...['thunder', 'thunder-far', 'zap', 'burst', 'shatter', 'lightning'].map((cue) => ({ kind: 'cine', cue })),
      ...['open', 'close', 'post', 'disk', 'ready', 'trackpad', 'run', 'loop-guard', 'shutdown', 'key'].map((action) => ({ kind: 'laptop', action })),
      ...['flash', 'glitch', 'pixel', 'invert', 'shake', 'slam', 'caption', 'bubble'].map((letter) => ({ kind: 'letter', letter })),
    ];
    for (const ev of appEvents) {
      const cues = sfxMod.sfxFor(ev);
      assert.ok(cues.length >= 1, `${JSON.stringify(ev)} produced no cue`);
      for (const c of cues) assert.ok(valid.has(c), `invalid SFX id ${String(c)} for ${JSON.stringify(ev)}`);
    }
    assert.deepEqual(
      sfxMod.sfxFor({ kind: 'command', result: 'fail' }),
      ['cmd_fail'],
    );
    assert.deepEqual(
      sfxMod.sfxFor({ kind: 'kernel', event: { type: 'PROC_SIGNALED', pid: 4001, targetName: 'virus', signal: 'SIGCONT', outcome: 'RESUMED' } }),
      ['sigcont'],
    );
    assert.deepEqual(
      sfxMod.sfxFor({ kind: 'kernel', event: { type: 'HUD_OVERLAY_TOGGLED', mode: 'PS_XRAY', processes: [], active: true } }),
      ['xray_on'],
    );
    assert.deepEqual(
      sfxMod.sfxFor({ kind: 'kernel', event: { type: 'HUD_OVERLAY_TOGGLED', mode: 'PS_XRAY', processes: [], active: false } }),
      ['xray_off'],
    );
    assert.deepEqual(sfxMod.sfxFor({ kind: 'pointer', surface: 'play', id: 'item-slot' }), ['item_lit']);
    assert.deepEqual(sfxMod.sfxFor({ kind: 'pointer', surface: 'play', id: 'custom-item-toggle' }), ['menu_move']);
    assert.deepEqual(sfxMod.sfxFor({ kind: 'pointer', surface: 'play', id: 'hud-hint' }), ['menu_move']);
    assert.deepEqual(sfxMod.sfxFor({ kind: 'pointer', surface: 'play', id: 'htc-btn-skip' }), ['menu_close']);
    assert.deepEqual(sfxMod.sfxFor({ kind: 'pointer', surface: 'play', id: 'mb-insert-btn' }), ['tab_complete']);
    assert.deepEqual(sfxMod.sfxFor({ kind: 'pointer', surface: 'play', id: 'outro-export' }), ['cmd_ok']);
    assert.deepEqual(sfxMod.sfxFor({ kind: 'pointer', surface: 'play', id: 'export-save-btn' }), ['cmd_ok']);
    assert.deepEqual(sfxMod.sfxFor({ kind: 'pointer', surface: 'play', id: 'outro-again' }), ['level_restart']);
    assert.deepEqual(sfxMod.sfxFor({ kind: 'pointer', surface: 'play', id: 'btn-heal' }), ['pickup_energy']);
    for (const silentId of [
      'esc-close', 'esc-mute', 'mb-close-btn', 'mb-nav-btn', 'mb-cover-chip', 'comix-prev', 'lt-key',
      'btn-lightning', 'sandbox-toggle-btn', 'hint-dialog-close', 'hint-dialog-x', 'ce-save', 'ce-close', 'ce-chip',
      'chapters-export-save-btn', 'waitlist-export-btn', 'waitlist-submit-btn', 'll-sound',
      'dev-ev:kill9', 'dev-give:energy', 'perk-action-btn', 'unknown', 'background',
    ]) {
      assert.deepEqual(sfxMod.sfxFor({ kind: 'pointer', surface: 'play', id: silentId }), [], `${silentId} should stay silent in pointer cues`);
    }
  });

  await test('attackCue triggers indirect zero-damage attacks without masking genuine misses', async () => {
    const models = await vite.ssrLoadModule('/src/audio/sfx-models.ts');
    assert.equal(models.attackCue('malware.crack', 0), 'atk_crack');
    assert.equal(models.attackCue('malware.crack', 5), 'atk_crack');
    assert.equal(models.attackCue('malware.ransomware', 0), 'atk_ransomware');
    assert.equal(models.attackCue('boss.forkbomb', 0), 'boss_forkbomb');
    assert.equal(models.attackCue('boss.forkbomb', 18), 'boss_forkbomb');
    assert.equal(models.attackCue('malware.bug', 0), 'enemy_miss');
    assert.equal(models.attackCue('malware.zombie', 0), 'enemy_miss');
    assert.equal(models.attackCue('malware.rootkit', 0), 'enemy_miss');
    assert.equal(models.attackCue('malware.trojan', -1), 'enemy_miss');
    assert.equal(models.attackCue(undefined, 0), 'enemy_miss');
    assert.equal(models.attackCue('malware.trojan', 12), 'atk_trojan');
  });

  await test('hp_tier_drop fires on first tier drop from full HP and post-heal tier drop', async () => {
    const orchMod = await vite.ssrLoadModule('/src/audio/orchestrators.ts');
    const bus = busMod.createAppBus();
    const played = [];
    const fakePlayer = {
      live: true,
      muted: false,
      volume: 1,
      play(id) { played.push(id); },
      loop() {},
      bed() {},
      hold() {},
      setMuted() {},
      setVolume() {},
      dispose() {},
    };
    const off = orchMod.attachOrchestrators(bus, fakePlayer);
    try {
      bus.emit({ kind: 'kernel', event: { type: 'PLAYER_DAMAGED', amount: 15, hpRemaining: 85, sourceId: 'e1', sourceName: 'bug' } });
      assert.ok(!played.includes('hp_tier_drop'), '100 -> 85 stays in band 4');
      bus.emit({ kind: 'kernel', event: { type: 'PLAYER_DAMAGED', amount: 20, hpRemaining: 65, sourceId: 'e1', sourceName: 'bug' } });
      assert.equal(played.filter((x) => x === 'hp_tier_drop').length, 1, '85 -> 65 crosses 75% tier');
      // After healing to 100 and taking 40 damage -> 60 crosses tier again cleanly
      bus.emit({ kind: 'kernel', event: { type: 'PLAYER_DAMAGED', amount: 40, hpRemaining: 60, sourceId: 'e1', sourceName: 'bug' } });
      assert.equal(played.filter((x) => x === 'hp_tier_drop').length, 2, '100 -> 60 post-heal drop crosses tier again');
    } finally {
      off();
    }
  });

  await test('CineAudio dispose cleanly stops rain_loop and clears audio-hold', async () => {
    const { CineAudio } = await vite.ssrLoadModule('/src/cinematic/audio.ts');
    const bus = busMod.createAppBus();
    const seen = [];
    bus.subscribe((ev) => seen.push(ev));
    const cine = new CineAudio(false, bus);
    cine.rain(true);
    cine.setPaused(true);
    cine.dispose();
    const rainStops = seen.filter((e) => e.kind === 'loop' && e.cue === 'rain_loop' && e.on === false);
    const holdsOff = seen.filter((e) => e.kind === 'audio-hold' && e.paused === false);
    assert.equal(rainStops.length, 1);
    assert.equal(holdsOff.length, 1);
  });

  const withFakeWindow = async (fn, search = '') => {
    let stopped = 0, resumes = 0, now = 0;
    const activeSources = [], starts = [], gains = [], listeners = new Map(), storage = new Map();
    class FakeAudioContext {
      constructor() { this.state = 'suspended'; this.destination = {}; }
      get currentTime() { return now; }
      createGain() {
        const g = { gain: { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {}, cancelScheduledValues() {} }, connect() { return this; } };
        gains.push(g);
        return g;
      }
      createBufferSource() {
        const node = {
          buffer: null, loop: false, onended: null, connect() { return { connect() {} }; },
          start(_w = 0, offset = 0) { activeSources.push(node); starts.push({ loop: node.loop, offset }); },
          stop() { stopped += 1; },
        };
        return node;
      }
      async decodeAudioData() { return { duration: 10 }; }
      async resume() { resumes += 1; this.state = 'running'; }
      async suspend() { this.state = 'suspended'; }
      async close() { this.state = 'closed'; }
    }
    const [prevWin, prevFetch, prevDoc, prevLS] = [globalThis.window, globalThis.fetch, globalThis.document, globalThis.localStorage];
    const ls = {
      getItem: (k) => (storage.has(k) ? storage.get(k) : null),
      setItem: (k, v) => { storage.set(k, String(v)); },
      removeItem: (k) => { storage.delete(k); },
    };
    globalThis.localStorage = ls;
    globalThis.document = { addEventListener() {}, removeEventListener() {} };
    globalThis.window = {
      AudioContext: FakeAudioContext, location: { search }, localStorage: ls,
      addEventListener(type, fn2) { listeners.set(type, fn2); },
      removeEventListener(type, fn2) { if (listeners.get(type) === fn2) listeners.delete(type); },
    };
    globalThis.fetch = async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });
    try {
      await fn({
        state: () => ({ stopped, resumes, activeSources, starts, gains, listeners }),
        advance: (sec) => { now += sec; },
        setSearch: (s) => { globalThis.window.location.search = s; },
      });
    } finally {
      globalThis.window = prevWin; globalThis.fetch = prevFetch; globalThis.document = prevDoc; globalThis.localStorage = prevLS;
    }
  };

  await test('WebAudio hold pauses loops and beds while allowing UI one-shots and holding deferred beds', async () => {
    const engineMod = await vite.ssrLoadModule('/src/audio/engine.ts');
    await withFakeWindow(async (env) => {
      const eng = engineMod.createGraph(10);
      assert.equal(eng.live, true);
      env.state().listeners.get('pointerdown')();
      await new Promise((r) => setTimeout(r, 10));
      assert.equal(env.state().resumes, 1, 'gesture listener calls ctx.resume()');
      assert.equal(env.state().listeners.size, 0, 'gesture listeners unbind once running');

      eng.hold(true);
      for (let i = 0; i < 11; i += 1) eng.play('menu_move');
      await new Promise((r) => setTimeout(r, 25));
      assert.equal(env.state().activeSources.length, 11);
      assert.equal(env.state().stopped, 1, '11th voice evicts oldest voice at currentTime === 0');
      eng.loop('rain_loop', true);
      eng.bed('title_theme');
      await new Promise((r) => setTimeout(r, 25));
      assert.equal(env.state().activeSources.length, 11, 'loop/bed stay held while hold(true) is active');
      eng.hold(false);
      await new Promise((r) => setTimeout(r, 25));
      assert.equal(env.state().activeSources.length, 13, 'loop and bed start once hold(false) releases');
      const beforeDispose = env.state().stopped;
      eng.dispose();
      assert.ok(env.state().stopped >= beforeDispose + 12, 'dispose stops active voices, loop, and bed');

      const eng2 = engineMod.createGraph(10);
      eng2.bed('cine_intro');
      eng2.loop('rain_loop', true);
      await new Promise((r) => setTimeout(r, 25));
      assert.equal(env.state().activeSources.length, 15);
      env.advance(2.5);
      const stopsBeforeHold = env.state().stopped;
      const resumesBeforeHold = env.state().resumes;
      eng2.hold(true);
      assert.equal(env.state().stopped, stopsBeforeHold + 2, 'hold(true) stops active bed and loop');
      eng2.play('menu_move');
      await new Promise((r) => setTimeout(r, 25));
      assert.equal(env.state().activeSources.length, 16, 'UI one-shot plays while held without resuming bed/loop');
      assert.equal(env.state().resumes, resumesBeforeHold);
      eng2.hold(false);
      await new Promise((r) => setTimeout(r, 25));
      const resumedStarts = env.state().starts.slice(16);
      assert.equal(resumedStarts.length, 2, 'hold(false) resumes both loop and cine_intro');
      assert.ok(resumedStarts.every((s) => Math.abs(s.offset - 2.5) < 0.01), 'paused bed/loop resume at offset 2.5');
      env.advance(20);
      eng2.hold(true);
      eng2.hold(false);
      await new Promise((r) => setTimeout(r, 25));
      const afterDone = env.state().starts.slice(18);
      assert.equal(afterDone.length, 1, 'completed non-looping cine_intro does not replay on unpause');
      assert.equal(afterDone[0].loop, true, 'only looping rain_loop restarts');
      eng2.dispose();

      const eng3 = engineMod.createGraph(10);
      const countBeforeClose = env.state().activeSources.length;
      eng3.bed('title_theme');
      eng3.dispose();
      await new Promise((r) => setTimeout(r, 25));
      assert.equal(env.state().activeSources.length, countBeforeClose, 'closed engine discards pending async music decode');
    });
  });

  await test('startPageAudio initializes muted/volume from readSoundPref unless overridden', async () => {
    const pageMod = await vite.ssrLoadModule('/src/audio/page.ts');
    const prefMod = await vite.ssrLoadModule('/src/contracts/sound-pref.ts');
    await withFakeWindow(async (env) => {
      prefMod.writeSoundPref({ muted: true, volume: 0.42 }, globalThis.localStorage);
      const p1 = pageMod.startPageAudio('title', globalThis.document);
      assert.equal(p1.muted, true, 'persisted muted=true applies by default');
      assert.equal(env.state().gains[0].gain.value, 0, 'master gain starts muted');
      p1.dispose();

      prefMod.writeSoundPref({ muted: false, volume: 0.8 }, globalThis.localStorage);
      env.setSearch('?mute=1');
      const p2 = pageMod.startPageAudio('title', globalThis.document);
      assert.equal(p2.muted, true, '?mute=1 overrides persisted muted=false');
      assert.equal(env.state().gains[1].gain.value, 0, '?mute=1 mutes master gain');
      p2.dispose();

      env.setSearch('');
      prefMod.writeSoundPref({ muted: true, volume: 0.3 }, globalThis.localStorage);
      const p3 = pageMod.startPageAudio('title', globalThis.document, { muted: false, volume: 0.65 });
      assert.equal(p3.muted, false, 'explicit options override persisted muted=true');
      assert.equal(env.state().gains[2].gain.value, 0.65, 'explicit volume applies');
      p3.dispose();
    });
  });

  await test('ChapterSession & ClassicSession emit SFX events for empty scan, denials, signals, file ops, and intro restart', async () => {
    const { createChapterSession } = await vite.ssrLoadModule('/src/chapters/chapter-session.ts');
    const { createSession } = await vite.ssrLoadModule('/src/game/session.ts');
    const real = readChapter(listChapterSlugs()[0]);
    const mkPack = (files, enemies) => ({
      manifest: { ...real.manifest, id: 'audio-unit-pack', levels: [{
        index: 1, id: 'au-1', title: 'AU', cwd: '/arena', roomKind: 'lab_hall', floorTheme: 2,
        mechanic: 'terminal', mechanicLabel: 'AU', difficulty: 1, teaches: [], enemies: enemies.map((e) => e.type),
      }], grants: [] },
      levels: [{
        id: 'au-1', index: 1, title: 'AU', cwd: '/arena', roomKind: 'lab_hall', floorTheme: 2,
        mechanic: 'terminal', summary: 'AU', files, enemies, pickups: [], patches: [],
        winRules: [{ kind: 'read_file', path: '/arena/notes.txt', description: 'read' }], solutionCommands: ['cat notes.txt'],
      }],
      dialogs: { levels: {} },
    });
    const cues = (res) => res.events.flatMap((e) => sfxMod.sfxFor({ kind: 'kernel', event: e }));

    // Empty room scan, permission denials, and file ops
    const s1 = createChapterSession({
      chapterId: 'au',
      pack: mkPack([
        { path: '/arena/notes.txt', kind: 'file', content: 'hello\n' },
        { path: '/arena/ro.txt', kind: 'file', content: 'abc\n', mode: 0o444 },
        { path: '/arena/secret.txt', kind: 'file', content: 'sec\n', mode: 0o000 },
        { path: '/arena/rodir', kind: 'dir', mode: 0o555 },
        { path: '/arena/nodir', kind: 'dir', mode: 0o000 },
        { path: '/arena/nodir/inner.txt', kind: 'file', content: 'x\n', mode: 0o644 },
        { path: '/arena/side', kind: 'dir' },
      ], []),
      preview: true,
      startLevelId: 'au-1',
    });
    s1.skipIntro();
    assert.ok(cues(s1.exec('kiro scan')).includes('xray_on'), 'empty-room kiro scan emits xray_on');
    assert.ok(cues(s1.exec('sed -i s/a/b/ ro.txt')).includes('perm_denied'), 'sed -i read-only emits perm_denied');
    assert.ok(cues(s1.exec('touch rodir/new.txt')).includes('perm_denied'), 'touch in read-only dir emits perm_denied');
    assert.ok(cues(s1.exec('chmod 755 nodir/inner.txt')).includes('perm_denied'), 'chmod through 000 dir emits perm_denied');
    assert.ok(cues(s1.exec('kiro inspect secret.txt')).includes('perm_denied'), 'kiro inspect 000 emits perm_denied');
    assert.ok(cues(s1.exec('chmod 644 ro.txt')).includes('chmod'), 'chmod emits chmod');
    assert.ok(cues(s1.exec('mv notes.txt side/notes.txt')).includes('file_move'), 'mv emits file_move');
    assert.ok(cues(s1.exec('mv side/notes.txt /dev/null')).includes('null_suck'), 'mv /dev/null emits null_suck');
    assert.ok(cues(s1.exec('rm ro.txt')).includes('file_remove'), 'rm emits file_remove');

    const introRestart = s1.restart({ intro: true });
    assert.equal(introRestart.events.length, 0, 'restart({ intro: true }) defers arrival/spawn/floor cues');
    assert.ok(s1.restart().events.some((e) => e.type === 'FLOOR_ENTERED'), 'headless restart() emits FLOOR_ENTERED');

    // Shielded boss PID 1 + battle signals (-STOP, -CONT, -15, -9)
    const bossLevel = real.levels[real.levels.length - 1].spec;
    const bossSess = createChapterSession({ chapterId: real.manifest.id, preview: true, startLevelId: bossLevel.id });
    bossSess.skipIntro();
    bossSess.exec('ls');
    bossSess.skipBattleIntro();
    assert.ok(cues(bossSess.exec('kill -9 1')).includes('perm_denied'), 'shielded PID 1 emits perm_denied');

    const sigSess = createChapterSession({ chapterId: 'au', pack: mkPack([{ path: '/arena/n.txt', kind: 'file', content: 'hi\n' }], [{ id: 's1', type: 'spyware', path: '/arena/spy.bin', pid: 4001 }]), preview: true, startLevelId: 'au-1' });
    sigSess.skipIntro();
    sigSess.exec('ls');
    sigSess.skipBattleIntro();
    assert.ok(cues(sigSess.exec('kill -STOP 4001')).includes('sigstop'), 'kill -STOP emits sigstop');
    assert.ok(cues(sigSess.exec('kill -CONT 4001')).includes('sigcont'), 'kill -CONT emits sigcont');
    assert.ok(cues(sigSess.exec('kill -15 4001')).includes('sigterm'), 'kill -15 on spyware emits sigterm');

    const killSess = createChapterSession({ chapterId: 'au', pack: mkPack([{ path: '/arena/n.txt', kind: 'file', content: 'hi\n' }], [{ id: 'v1', type: 'virus', path: '/arena/virus.exe', pid: 4001 }]), preview: true, startLevelId: 'au-1' });
    killSess.skipIntro();
    killSess.exec('ls');
    killSess.skipBattleIntro();
    const k9 = cues(killSess.exec('kill -9 4001'));
    assert.ok(k9.includes('lightning') && k9.includes('kill'), 'kill -9 emits lightning and kill');

    const mvDenySess = createChapterSession({
      chapterId: 'au',
      pack: mkPack([
        { path: '/arena/nodir', kind: 'dir', mode: 0o000 },
        { path: '/arena/nodir/inner.txt', kind: 'file', content: 'x\n', mode: 0o644 },
        { path: '/arena/keygen.exe', kind: 'file', content: 'x\n', mode: 0o755 },
        { path: '/arena/virus.exe', kind: 'file', content: 'x\n', mode: 0o755 },
      ], [
        { id: 'cr1', type: 'crack', path: '/arena/keygen.exe', pid: 4002 },
        { id: 'vi1', type: 'virus', path: '/arena/virus.exe', pid: 4003 },
      ]),
      preview: true,
      startLevelId: 'au-1',
    });
    mvDenySess.skipIntro();
    assert.ok(cues(mvDenySess.exec('mv nodir/inner.txt out.txt')).includes('perm_denied'), 'ChapterSession mv through 000 dir emits perm_denied');
    assert.ok(cues(mvDenySess.exec('rm keygen.exe')).includes('perm_denied'), 'ChapterSession rm veto on busy crack emits perm_denied');
    assert.ok(cues(mvDenySess.exec('mv keygen.exe /dev/null')).includes('perm_denied'), 'ChapterSession mv /dev/null veto emits perm_denied');
    const virusSplitCues = cues(mvDenySess.exec('rm virus.exe'));
    assert.ok(virusSplitCues.includes('virus_split') && !virusSplitCues.includes('perm_denied'), `ChapterSession rm virus split emits virus_split without perm_denied (${JSON.stringify(virusSplitCues)})`);

    const classic = createSession();
    assert.ok(cues(classic.exec('kiro scan')).includes('xray_on'), 'ClassicSession empty kiro scan emits xray_on');
    assert.ok(cues(classic.exec('kill -9 1')).includes('perm_denied'), 'ClassicSession kernel kill emits perm_denied');
    classic.skipIntro();
    classic.exec('echo secret > c000.txt && chmod 000 c000.txt && chmod 000 ../drive_bay');
    assert.ok(cues(classic.exec('cat c000.txt')).includes('perm_denied'), 'ClassicSession cat 000 file emits perm_denied');
    assert.ok(cues(classic.exec('cat ../drive_bay/labels.txt')).includes('perm_denied'), 'ClassicSession cat via 000 dir emits perm_denied');
    assert.ok(cues(classic.exec('ls ../drive_bay/labels.txt')).includes('perm_denied'), 'ClassicSession ls via 000 dir emits perm_denied');
    assert.ok(cues(classic.exec('chmod 644 ../drive_bay/labels.txt')).includes('perm_denied'), 'ClassicSession chmod via 000 dir emits perm_denied');
    assert.ok(cues(classic.exec('mv ../drive_bay/labels.txt out.txt')).includes('perm_denied'), 'ClassicSession mv via 000 dir emits perm_denied');
    classic.debugTeleport(4);
    assert.ok(cues(classic.exec('mv /srv/attic/catwalk/ransom.exe /dev/null')).length >= 0, 'ClassicSession teleport to floor 4 runs');
    classic.debugTeleport(2);
    assert.ok(cues(classic.exec('mv keygen.exe /dev/null')).includes('perm_denied'), 'ClassicSession mv /dev/null veto emits perm_denied');
  });

  await test('CineAudio skipping while paused clears scene before releasing hold so bed does not restart', async () => {
    const { CineAudio, cineScene } = await vite.ssrLoadModule('/src/cinematic/audio.ts');
    const engineMod = await vite.ssrLoadModule('/src/audio/engine.ts');
    const orchMod = await vite.ssrLoadModule('/src/audio/orchestrators.ts');
    const { createAppBus } = await vite.ssrLoadModule('/src/contracts/app-bus.ts');
    await withFakeWindow(async (env) => {
      const bus = createAppBus();
      const graph = engineMod.createGraph(10);
      const stopOrch = orchMod.attachOrchestrators(bus, graph);
      const cine = new CineAudio(false, bus);
      bus.emit({ kind: 'scene', scene: cineScene('cine-intro') });
      cine.rain(true);
      await new Promise((r) => setTimeout(r, 25));
      const startsBeforePause = env.state().starts.length;
      cine.setPaused(true);
      assert.equal(cine.reset !== undefined, true);
      cine.dispose();
      await new Promise((r) => setTimeout(r, 25));
      assert.equal(env.state().starts.length, startsBeforePause, 'disposing paused CineAudio never restarts cine_intro or rain_loop');
      stopOrch();
      graph.dispose();
    });
  });
}, '/src/audio/sfx-for.ts');

console.log(`audio-unit: ${count()} checks passed`);
