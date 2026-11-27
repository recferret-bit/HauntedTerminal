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
    assert.equal(limits.TYPING_SOUND_SOURCES, 3);
    assert.equal(limits.TYPING_MIN_INTERVAL_MS, 100);
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
    assert.deepEqual(
      sfxMod.sfxFor({ kind: 'kernel', event: { type: 'INODE_MODE_CHANGED', inodeId: 9, oldMode: 0, newMode: 0o755 } }),
      ['gate_open', 'lap_run'],
    );
    assert.deepEqual(
      sfxMod.sfxFor({ kind: 'kernel', event: { type: 'INODE_MODE_CHANGED', inodeId: 9, oldMode: 0o755, newMode: 0 } }),
      ['gate_locked'],
    );
    assert.deepEqual(
      sfxMod.sfxFor({ kind: 'kernel', event: { type: 'INODE_MODE_CHANGED', inodeId: 9, oldMode: 0o644, newMode: 0o600 } }),
      ['chmod'],
    );
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

  await test('pickCappedSlot caps typing voices at 3 without blocking or evicting other voices', () => {
    const started = Array.from({ length: 10 }, () => -1);
    const tagged = Array.from({ length: 10 }, () => false);
    for (let i = 0; i < 3; i += 1) {
      const slot = voices.pickCappedSlot(started, tagged, true, 3);
      assert.equal(slot, i);
      started[slot] = i + 1;
      tagged[slot] = true;
    }
    assert.equal(voices.pickCappedSlot(started, tagged, true, 3), 0);
    started[0] = 4;
    assert.equal(voices.pickCappedSlot(started, tagged, true, 3), 1);
    started[1] = 5;
    const nonTypingSlot = voices.pickCappedSlot(started, tagged, false, 3);
    assert.equal(nonTypingSlot, 3);
    started[nonTypingSlot] = 6;
    tagged[nonTypingSlot] = false;
    started[2] = -1;
    tagged[2] = false;
    assert.equal(voices.pickCappedSlot(started, tagged, true, 3), 2);
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
      sfxMod.sfxFor({ kind: 'kernel', event: { type: 'VIBECODER_ACTION', action: 'collect', command: 'hold tube_transistor' } }),
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
      sfxMod.sfxFor({ kind: 'kernel', event: { type: 'DIALOG_BOX', id: 'd3', speaker: 'clod', text: 'ha' } }),
      ['taunt_clod_1'],
    );
    assert.deepEqual(
      sfxMod.sfxFor({ kind: 'kernel', event: { type: 'DIALOG_BOX', id: 'd4', speaker: 'antigravy', text: 'yo' } }),
      ['taunt_antigravy_1'],
    );
    assert.deepEqual(
      sfxMod.sfxFor({ kind: 'kernel', event: { type: 'DIALOG_BOX', id: 'd2', speaker: 'vibecoder', text: 'uh' } }),
      ['dialog_hero'],
    );
    assert.deepEqual(
      sfxMod.sfxFor({ kind: 'dialog', speaker: 'dad' }),
      ['dad_cheer'],
    );
    assert.deepEqual(
      sfxMod.sfxFor({ kind: 'kernel', event: { type: 'AGENT_TAUNT', agent: 'codec', model: 'agent.codec', text: 'ha', mood: 'smug' } }),
      ['taunt_codec_1'],
    );
    assert.deepEqual(
      sfxMod.sfxFor({ kind: 'dialog', speaker: 'gork' }),
      ['taunt_gork_1'],
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
      ['term_boot'],
    );
    assert.deepEqual(
      sfxMod.sfxFor({ kind: 'kernel', event: { type: 'ITEM_GIVEN', item: 'tube_transistor', model: 'item.tube_transistor' } }),
      ['item_lit'],
    );
    assert.deepEqual(sfxMod.sfxFor({ kind: 'cine', cue: 'boot' }), ['term_boot']);
  });

  await test('classic directories resolve to door cues, unknown rooms fall back to hop, and declarative sfx/music overrides win', () => {
    const classicDirs = [
      'desk', 'nightmare_workspace', 'chronicles', 'ram_slots', 'pedestal', 'drive_bay', 'port_445',
      'iron_gate', 'chasm', 'hidden_wing', 'furnace_hall', 'cellar_hatch', 'crypt_stairs',
      'boiler_shaft', 'core_elevator', 'north_exit', 'east_exit', 'south_exit', 'wing_a',
      'null', 'devnull', 'catwalk', 'entrance', 'cell_9', 'floor_3', 'boiler_room', 'panic_chamber', 'labyrinth',
    ];
    for (const d of classicDirs) {
      const cues = sfxMod.sfxFor({
        kind: 'kernel',
        event: { type: 'ROOM_TRANSITION', fromDir: 1, toDir: 2, toPath: `/root/${d}`, upwardPanelsSmashed: 0, viaSymlinkLoop: false },
      });
      assert.equal(cues.length, 1);
      assert.notEqual(cues[0], 'hop', `${d} should map to a classic door cue`);
    }
    for (const d of ['wires_and_chips', 'gpu_alley', 'clod_overlord_core']) {
      assert.deepEqual(
        sfxMod.sfxFor({
          kind: 'kernel',
          event: { type: 'ROOM_TRANSITION', fromDir: 1, toDir: 2, toPath: `/srv/${d}`, upwardPanelsSmashed: 0, viaSymlinkLoop: false },
        }),
        ['hop'],
        `chapter-specific basename ${d} is no longer hardcoded in sfx-doors`,
      );
    }
    assert.deepEqual(
      sfxMod.sfxFor({ kind: 'kernel', event: { type: 'ROOM_TRANSITION', fromDir: 1, toDir: 2, toPath: '/srv/gpu_alley', upwardPanelsSmashed: 0, viaSymlinkLoop: false, sfx: 'door_ethernet' } }),
      ['door_ethernet'],
    );
    assert.deepEqual(
      sfxMod.sfxFor({ kind: 'kernel', event: { type: 'PERMISSION_DENIED_RATTLE', targetId: 'd1', command: 'cd', sfx: 'door_firewall' } }),
      ['door_firewall'],
    );
    assert.deepEqual(
      sfxMod.sfxFor({ kind: 'kernel', event: { type: 'ENEMY_ATTACK', entityId: 'e1', enemyType: 'bug', amount: 1, sfx: 'atk_bug' } }),
      ['atk_bug'],
    );
    assert.deepEqual(
      sfxMod.sfxFor({ kind: 'kernel', event: { type: 'ENEMY_KILLED', entityId: 'e1', enemyType: 'virus', how: 'rm', sfx: 'kill_null' } }),
      ['kill_null'],
    );
    assert.deepEqual(
      sfxMod.sfxFor({ kind: 'kernel', event: { type: 'PICKUP_COLLECTED', entityId: 'p1', pickupType: 'ram', amount: 16, sfx: 'pickup_ssd' } }),
      ['pickup_ssd', 'hero_collect'],
    );
    assert.deepEqual(
      sfxMod.sfxFor({ kind: 'kernel', event: { type: 'FILE_REMOVED', path: '/a/b', kind: 'file', sfx: 'crate_bridge' } }),
      ['crate_bridge'],
    );
    assert.deepEqual(sfxMod.sfxFor({ kind: 'kernel', event: { type: 'SOUND_CUE', cue: 'shatter' } }), ['shatter']);
    assert.deepEqual(sfxMod.sfxFor({ kind: 'sfx', cue: 'teleport_zap' }), ['teleport_zap']);
    assert.deepEqual(sfxMod.sfxFor({ kind: 'sfx', cue: 'not_a_real_cue' }), []);
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
      ...['open', 'close', 'post', 'disk', 'ready', 'trackpad', 'run', 'loop-guard', 'shutdown', 'key', 'solved', 'check-fail', 'win-open', 'win-min', 'win-close'].map((action) => ({ kind: 'laptop', action })),
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
    assert.deepEqual(sfxMod.sfxFor({ kind: 'pointer', surface: 'laptop', id: 'button' }), ['lap_trackpad']);
    assert.deepEqual(sfxMod.sfxFor({ kind: 'laptop', action: 'check-fail' }), ['gate_locked']);
    assert.deepEqual(sfxMod.sfxFor({ kind: 'laptop', action: 'solved' }), ['puzzle_solved']);
    assert.deepEqual(sfxMod.sfxFor({ kind: 'laptop', action: 'win-open' }), ['file_create']);
    assert.deepEqual(sfxMod.sfxFor({ kind: 'laptop', action: 'win-min' }), ['file_move']);
    assert.deepEqual(sfxMod.sfxFor({ kind: 'laptop', action: 'win-close' }), ['file_remove']);
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

  await test('ambientLoopsFor maps the greybeard rig to his two loops and every other model to none', async () => {
    const models = await vite.ssrLoadModule('/src/audio/sfx-models.ts');
    assert.deepEqual([...models.ambientLoopsFor(['npc.greybeard_rig'])], ['dad_typing_loop', 'dad_rig_loop']);
    assert.deepEqual([...models.ambientLoopsFor(['malware.bug', undefined, 'npc.greybeard_rig', 'npc.greybeard_rig'])], ['dad_typing_loop', 'dad_rig_loop'], 'no duplicates');
    assert.deepEqual([...models.ambientLoopsFor(['malware.bug', 'boss.kernel', undefined])], []);
    assert.deepEqual([...models.ambientLoopsFor([])], []);
  });

  await test('the play page turns the old coder loops on when he is in the hero\'s room and off when he leaves or the surface is not play', async () => {
    const sync = await vite.ssrLoadModule('/src/play/audio-sync.ts');
    const emitted = [];
    let actors = [];
    const held = null;
    let ended = false;
    const play = {
      session: {
        bus: { emit: (e) => emitted.push(e) },
        snapshot: () => ({
          battle: null, ended, rank: ended ? 'A' : null, hp: 100, maxHp: 100, floor: 1, hub: false,
          inventory: { held }, room: { actors },
        }),
      },
      lifecycle: { phase: () => 'play' },
      holdMusic: false,
      terminalLab: false,
      menu: { isOpen: () => false },
      manualBook: { isOpen: () => false },
    };
    const loops = () => emitted.splice(0).filter((e) => e.kind === 'loop').map((e) => `${e.cue}:${e.on}`);
    sync.syncPlayAudio(play);
    assert.deepEqual(loops(), [], 'no dad, no loops');
    actors = [{ key: 'socket', model: 'npc.greybeard_rig' }];
    sync.syncPlayAudio(play);
    assert.deepEqual(loops(), ['dad_typing_loop:true', 'dad_rig_loop:true']);
    sync.syncPlayAudio(play);
    assert.deepEqual(loops(), [], 'steady state publishes nothing');
    actors = [{ key: 'ghost', model: 'malware.bug' }];
    sync.syncPlayAudio(play);
    assert.deepEqual(loops(), ['dad_typing_loop:false', 'dad_rig_loop:false'], 'he left the room');
    actors = [{ key: 'socket', model: 'npc.greybeard_rig' }];
    sync.syncPlayAudio(play);
    loops();
    ended = true;
    sync.syncPlayAudio(play);
    assert.deepEqual(loops(), ['dad_typing_loop:false', 'dad_rig_loop:false'], 'the rank screen is not the play surface');

    ended = false;
    actors = [];
    let ambient = { loops: ['rain_loop'] };
    play.session.snapshot = () => ({
      battle: null, ended, rank: null, hp: 100, maxHp: 100, floor: 1, hub: false,
      inventory: { held }, room: { actors, ambient },
    });
    sync.syncPlayAudio(play);
    assert.deepEqual(loops(), ['rain_loop:true'], 'room.ambient.loops starts declared loop cue');
    ambient = { loops: [] };
    sync.syncPlayAudio(play);
    assert.deepEqual(loops(), ['rain_loop:false'], 'removing room.ambient.loops stops it');
  });

  await test('musicFor & orchestrators honor declarative levelMusic and script music AppEvents', async () => {
    const musicMod = await vite.ssrLoadModule('/src/audio/music-for.ts');
    const orchMod = await vite.ssrLoadModule('/src/audio/orchestrators.ts');
    assert.equal(
      musicMod.musicFor(musicMod.sceneFor('play', { floorTheme: 2, music: 'floor_core' })),
      'floor_core',
      'valid music override replaces default floor bed outside battle',
    );
    assert.equal(
      musicMod.musicFor(musicMod.sceneFor('play', { floorTheme: 2, music: 'invalid_bed' })),
      'floor_crypt',
      'unknown music string falls back cleanly to floor bed',
    );
    assert.equal(
      musicMod.musicFor(musicMod.sceneFor('play', { floorTheme: 5, battle: 'fight', music: 'battle_boss' })),
      'battle_boss',
      'explicit battle_* track overrides default battle loop',
    );
    const bus = busMod.createAppBus();
    const beds = [];
    const fakePlayer = { live: true, muted: false, volume: 1, play() {}, loop() {}, bed(id) { beds.push(id); }, hold() {}, setMuted() {}, setVolume() {}, dispose() {} };
    const off = orchMod.attachOrchestrators(bus, fakePlayer);
    try {
      bus.emit({ kind: 'music', cue: 'cine_outro' });
      bus.emit({ kind: 'music', cue: null });
      bus.emit({ kind: 'scene', scene: musicMod.sceneFor('play', { floorTheme: 3, music: 'hub_matrix' }) });
    } finally {
      off();
    }
    assert.equal(beds[0], 'cine_outro');
    assert.equal(beds[beds.length - 1], 'hub_matrix');
  });

  await test('loop events for the dad loops start and stop their cue on the graph', async () => {
    const orchMod = await vite.ssrLoadModule('/src/audio/orchestrators.ts');
    const bus = busMod.createAppBus();
    const calls = [];
    const fakePlayer = { live: true, muted: false, volume: 1, play() {}, loop(id, on) { calls.push([id, on]); }, bed() {}, hold() {}, setMuted() {}, setVolume() {}, dispose() {} };
    const off = orchMod.attachOrchestrators(bus, fakePlayer);
    try {
      for (const cue of ['dad_typing_loop', 'dad_rig_loop']) {
        bus.emit({ kind: 'loop', cue, on: true });
        bus.emit({ kind: 'loop', cue, on: false });
      }
    } finally {
      off();
    }
    assert.deepEqual(calls, [['dad_typing_loop', true], ['dad_typing_loop', false], ['dad_rig_loop', true], ['dad_rig_loop', false]]);
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
    const activeSources = [], stoppedNodes = [], starts = [], gains = [], listeners = new Map(), storage = new Map();
    const abUrls = new WeakMap();
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
          buffer: null, loop: false, playbackRate: { value: 1 }, onended: null, connect() { return { connect() {} }; },
          start(_w = 0, offset = 0, duration) {
            activeSources.push(node);
            starts.push({ url: node.buffer?.url ?? '', loop: node.loop, offset, duration, rate: node.playbackRate.value });
          },
          stop() { stopped += 1; stoppedNodes.push(node); },
        };
        return node;
      }
      async decodeAudioData(raw) { return { duration: 10, url: abUrls.get(raw) ?? '' }; }
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
    globalThis.fetch = async (url) => ({
      ok: true,
      arrayBuffer: async () => {
        const ab = new ArrayBuffer(8);
        abUrls.set(ab, String(url));
        return ab;
      },
    });
    try {
      await fn({
        state: () => ({ stopped, stoppedNodes, resumes, activeSources, starts, gains, listeners }),
        advance: (sec) => { now += sec; },
        setSearch: (s) => { globalThis.window.location.search = s; },
      });
    } finally {
      globalThis.window = prevWin; globalThis.fetch = prevFetch; globalThis.document = prevDoc; globalThis.localStorage = prevLS;
    }
  };

  await test('WebAudio plays dad_typing_loop on loop and dad_rig_loop as a crossfaded single seamless loop; loop-off stops either; pickTake avoids back-to-back repeats', async () => {
    const engineMod = await vite.ssrLoadModule('/src/audio/engine.ts');
    const takesMod = await vite.ssrLoadModule('/src/audio/loop-takes.ts');
    await withFakeWindow(async (env) => {
      const eng = engineMod.createGraph(10);
      env.state().listeners.get('pointerdown')();
      await new Promise((r) => setTimeout(r, 10));
      const typingBefore = env.state().starts.length;
      eng.loop('dad_typing_loop', true);
      await new Promise((r) => setTimeout(r, 25));
      const typing = env.state().starts.slice(typingBefore);
      assert.equal(typing.length, 1, 'dad_typing_loop starts one voice');
      assert.ok(typing[0].url.includes('dad_typing_loop') && typing[0].loop === true, 'the typing loop plays its file on loop');
      const stopsBefore = env.state().stopped;
      eng.loop('dad_typing_loop', false);
      assert.equal(env.state().stopped, stopsBefore + 1, 'dad_typing_loop off stops its voice');
      eng.loop('dad_typing_loop', false);
      assert.equal(env.state().stopped, stopsBefore + 1, 'off twice stops nothing more');

      // The rig loop: single seamless crossfaded bed via playBed (not node.loop), pauses/resumes on hold, stops cleanly.
      const rigBefore = env.state().starts.length;
      eng.loop('dad_rig_loop', true);
      await new Promise((r) => setTimeout(r, 25));
      const rig = env.state().starts.slice(rigBefore);
      assert.equal(rig.length, 1, 'dad_rig_loop starts one seamless voice');
      assert.ok(rig[0].url.includes('dad_rig_loop.mp3') && rig[0].loop === false, 'dad_rig_loop uses playBed overlap crossfade rather than raw node.loop');
      env.advance(3.2);
      const stopsBeforeHold = env.state().stopped;
      eng.hold(true);
      assert.equal(env.state().stopped, stopsBeforeHold + 1, 'hold(true) pauses dad_rig_loop');
      eng.hold(false);
      await new Promise((r) => setTimeout(r, 25));
      const resumed = env.state().starts.slice(rigBefore + 1);
      assert.equal(resumed.length, 1, 'hold(false) resumes dad_rig_loop');
      assert.ok(Math.abs(resumed[0].offset - 3.2) < 0.01, 'dad_rig_loop resumes at its saved offset');
      const stopsBeforeOff = env.state().stopped;
      eng.loop('dad_rig_loop', false);
      assert.equal(env.state().stopped, stopsBeforeOff + 1, 'dad_rig_loop off stops its crossfaded bed');
      eng.loop('dad_rig_loop', false);
      assert.equal(env.state().stopped, stopsBeforeOff + 1, 'off twice stops nothing more');
      eng.dispose();
    });
    const takes = ['a', 'b', 'c', 'd'];
    let last;
    const seen = new Set();
    for (let i = 0; i < 60; i += 1) {
      const next = takesMod.pickTake(takes, last);
      assert.notEqual(next, last, 'pickTake never repeats back to back');
      seen.add(next);
      last = next;
    }
    assert.equal(seen.size, takes.length, 'pickTake reaches every take');
  });

  await test('startLoopAccents fires random-interval beeps/sparks without immediate repeats and stops cleanly', async () => {
    const { pickAccentDelay, startLoopAccents } = await vite.ssrLoadModule('/src/audio/loop-accents.ts');
    assert.equal(pickAccentDelay(100, 300, () => 0), 100);
    assert.equal(pickAccentDelay(100, 300, () => 1), 300);
    assert.equal(pickAccentDelay(10, 20, () => 0), 50, 'clamps to >= 50ms');
    const fired = [];
    let alive = true;
    const handle = startLoopAccents({
      spec: { cues: ['dad_rig_beep', 'dad_rig_spark'], minIntervalMs: 50, maxIntervalMs: 50, gain: 0.08, rateJitter: 0.08 },
      play: (cue, gain, rate) => fired.push({ cue, gain, rate }),
      still: () => alive,
    });
    await new Promise((r) => setTimeout(r, 260));
    handle.stop();
    const countAtStop = fired.length;
    await new Promise((r) => setTimeout(r, 140));
    assert.ok(countAtStop >= 3, `expected >= 3 accents fired, got ${countAtStop}`);
    assert.equal(fired.length, countAtStop, 'stop() cancels further accents');
    for (let i = 1; i < fired.length; i += 1) assert.notEqual(fired[i].cue, fired[i - 1].cue, 'no back-to-back repeat');
    for (const f of fired) {
      assert.equal(f.gain, 0.08);
      assert.ok(f.rate >= 0.92 && f.rate <= 1.08, `rate in jitter range: ${f.rate}`);
    }
    alive = false;
  });

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
    assert.ok(cues(sigSess.exec('kill -STOP {pid:s1}')).includes('sigstop'), 'kill -STOP emits sigstop');
    assert.ok(cues(sigSess.exec('kill -CONT {pid:s1}')).includes('sigcont'), 'kill -CONT emits sigcont');
    assert.ok(cues(sigSess.exec('kill -15 {pid:s1}')).includes('sigterm'), 'kill -15 on spyware emits sigterm');

    const killSess = createChapterSession({ chapterId: 'au', pack: mkPack([{ path: '/arena/n.txt', kind: 'file', content: 'hi\n' }], [{ id: 'v1', type: 'virus', path: '/arena/virus.exe', pid: 4001 }]), preview: true, startLevelId: 'au-1' });
    killSess.skipIntro();
    killSess.exec('ls');
    killSess.skipBattleIntro();
    const k9 = cues(killSess.exec('kill -9 {pid:v1}'));
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

  await test('WebAudio typing cues cap at 3 simultaneous voices without evicting other SFX', async () => {
    const engineMod = await vite.ssrLoadModule('/src/audio/engine.ts');
    await withFakeWindow(async (env) => {
      const eng = engineMod.createGraph(10, 3);
      for (const id of ['key_press', 'key_backspace', 'key_enter', 'tab_complete', 'key_press', 'key_press', 'key_backspace']) {
        eng.play(id);
        env.advance(0.11);
      }
      await new Promise((r) => setTimeout(r, 25));
      assert.equal(env.state().activeSources.length, 7);
      assert.equal(env.state().stopped, 4, '7 spaced typing sounds evict 4 older typing voices to stay at 3 active');
      const startOf = (url) => env.state().starts.find((s) => s.url === url);
      assert.ok(Math.abs((startOf('/sfx/key_press.mp3')?.offset ?? -1) - 0.105) < 1e-6, 'key_press trims leading silence');
      assert.ok(Math.abs((startOf('/sfx/key_press.mp3')?.duration ?? -1) - 0.215) < 1e-6, 'key_press trims tail');
      assert.ok(Math.abs((startOf('/sfx/key_press_2.mp3')?.offset ?? -1) - 0.098) < 1e-6, 'key_press_2 rotates and trims leading silence');
      assert.ok(Math.abs((startOf('/sfx/key_press_2.mp3')?.duration ?? -1) - 0.185) < 1e-6, 'key_press_2 trims tail');
      assert.ok(Math.abs((startOf('/sfx/key_press_3.mp3')?.offset ?? -1) - 0.045) < 1e-6, 'key_press_3 rotates and trims leading silence');
      assert.ok(Math.abs((startOf('/sfx/key_press_3.mp3')?.duration ?? -1) - 0.28) < 1e-6, 'key_press_3 trims tail');
      assert.ok(Math.abs((startOf('/sfx/key_backspace.mp3')?.offset ?? -1) - 0.085) < 1e-6, 'key_backspace trims leading silence');
      assert.ok(Math.abs((startOf('/sfx/key_backspace.mp3')?.duration ?? -1) - 0.22) < 1e-6, 'key_backspace trims tail');
      assert.ok(Math.abs((startOf('/sfx/key_backspace_2.mp3')?.offset ?? -1) - 0.085) < 1e-6, 'key_backspace_2 rotates and trims leading silence');
      assert.ok(Math.abs((startOf('/sfx/key_backspace_2.mp3')?.duration ?? -1) - 0.15) < 1e-6, 'key_backspace_2 trims tail');
      assert.equal(startOf('/sfx/key_enter.mp3')?.offset, 0, 'key_enter starts at 0');
      assert.equal(startOf('/sfx/tab_complete.mp3')?.offset, 0, 'tab_complete starts at 0');
      assert.notEqual(startOf('/sfx/key_press.mp3')?.rate, startOf('/sfx/key_press_2.mp3')?.rate, 'typing applies subtle pitch variation');

      for (const id of ['cmd_ok', 'menu_move', 'hop', 'door_usb']) eng.play(id);
      await new Promise((r) => setTimeout(r, 25));
      assert.equal(env.state().stopped, 4, 'non-typing SFX take free slots without triggering eviction');

      eng.play('key_press');
      env.advance(0.11);
      eng.play('key_press');
      await new Promise((r) => setTimeout(r, 25));
      assert.equal(env.state().stopped, 6, 'further typing evicts only older typing voices');
      const nonTypingUrls = new Set(['/sfx/cmd_ok.mp3', '/sfx/menu_move.mp3', '/sfx/hop.mp3', '/sfx/door_usb.mp3']);
      const evictedNonTyping = env.state().stoppedNodes.filter((n) => nonTypingUrls.has(n.buffer?.url));
      assert.deepEqual(evictedNonTyping, [], 'typing cap never evicts active non-typing SFX');
      eng.dispose();

      const tiny = engineMod.createGraph(2);
      const stoppedBeforeTiny = env.state().stopped;
      tiny.play('key_press');
      env.advance(0.11);
      tiny.play('key_press');
      env.advance(0.11);
      tiny.play('key_press');
      await new Promise((r) => setTimeout(r, 25));
      assert.equal(env.state().stopped, stoppedBeforeTiny + 1, 'typing cap clamps to pool size when sources < TYPING_SOUND_SOURCES');
      tiny.dispose();
    });
  });

  await test('WebAudio rapid typing sounds are rate-limited to 100ms while Enter and Tab always play', async () => {
    const engineMod = await vite.ssrLoadModule('/src/audio/engine.ts');
    await withFakeWindow(async (env) => {
      const eng = engineMod.createGraph(10, 3, 100);
      const before = env.state().activeSources.length;
      const startLen = env.state().starts.length;
      for (let i = 0; i < 6; i += 1) eng.play('key_press');
      await new Promise((r) => setTimeout(r, 25));
      assert.equal(env.state().activeSources.length - before, 1, 'rapid burst at t=0 plays key_press once');
      assert.equal(env.state().starts[startLen]?.url, '/sfx/key_press.mp3');

      env.advance(0.05);
      eng.play('key_backspace');
      await new Promise((r) => setTimeout(r, 25));
      assert.equal(env.state().activeSources.length - before, 1, 'key_backspace inside 100ms cooldown is skipped');

      eng.play('key_enter');
      eng.play('tab_complete');
      await new Promise((r) => setTimeout(r, 25));
      assert.equal(env.state().activeSources.length - before, 3, 'key_enter and tab_complete never wait on typing cooldown');

      env.advance(0.06);
      eng.play('key_press');
      await new Promise((r) => setTimeout(r, 25));
      assert.equal(env.state().activeSources.length - before, 4, 'key_press plays again once 100ms has elapsed');

      env.advance(0.11);
      eng.play('key_press');
      await new Promise((r) => setTimeout(r, 25));
      assert.equal(env.state().activeSources.length - before, 5, 'subsequent key_press rotates to third variant');
      const playedPressUrls = env.state().starts.slice(startLen).map((s) => s.url).filter((u) => u.includes('key_press'));
      assert.deepEqual(playedPressUrls.sort(), ['/sfx/key_press.mp3', '/sfx/key_press_2.mp3', '/sfx/key_press_3.mp3']);
      eng.dispose();
    });
  });

  await test('attachOrchestrators drops hero_type after a successful command while keeping standalone type cues', async () => {
    const orchMod = await vite.ssrLoadModule('/src/audio/orchestrators.ts');
    const { createChapterSession } = await vite.ssrLoadModule('/src/chapters/chapter-session.ts');
    const { createSession } = await vite.ssrLoadModule('/src/game/session.ts');
    assert.deepEqual(
      sfxMod.sfxFor({ kind: 'kernel', event: { type: 'VIBECODER_ACTION', action: 'type', command: 'echo hi' } }),
      ['hero_type'],
    );
    const makeFakeGraph = (played) => ({
      live: true,
      setMuted() {},
      setVolume() {},
      play(id) { played.push(id); },
      loop() {},
      bed() {},
      hold() {},
      dispose() {},
    });

    const chSlug = listChapterSlugs()[0];
    const chSess = createChapterSession({ chapterId: chSlug, preview: true });
    chSess.skipIntro();
    const chPlayed = [];
    const chOff = orchMod.attachOrchestrators(chSess.bus, makeFakeGraph(chPlayed));
    chSess.exec('echo hi');
    await Promise.resolve();
    chOff();
    assert.ok(chPlayed.includes('cmd_ok'), 'ChapterSession echo emits cmd_ok');
    assert.ok(!chPlayed.includes('hero_type'), 'ChapterSession echo suppresses redundant hero_type');

    const clSess = createSession();
    clSess.skipIntro();
    const clPlayed = [];
    const clOff = orchMod.attachOrchestrators(clSess.bus, makeFakeGraph(clPlayed));
    clSess.exec('echo hi');
    await Promise.resolve();
    clOff();
    assert.ok(clPlayed.includes('cmd_ok'), 'ClassicSession echo emits cmd_ok');
    assert.ok(!clPlayed.includes('hero_type'), 'ClassicSession echo suppresses redundant hero_type');

    const bareBus = busMod.createAppBus();
    const barePlayed = [];
    const bareOff = orchMod.attachOrchestrators(bareBus, makeFakeGraph(barePlayed));
    bareBus.emit({ kind: 'kernel', event: { type: 'VIBECODER_ACTION', action: 'type', command: 'echo hi' } });
    bareOff();
    assert.deepEqual(barePlayed, ['hero_type'], 'standalone VIBECODER_ACTION type without command ok still plays hero_type');
  });

  await test('terminal handleKey suppresses audible key sounds when repeat is true while still editing', async () => {
    const keysMod = await vite.ssrLoadModule('/src/ui/terminal-keys.ts');
    const drawMod = await vite.ssrLoadModule('/src/ui/terminal-draw.ts');
    const heard = [];
    const ran = [];
    const st = drawMod.createLineState(
      { cols: 80, write() {} },
      {
        run(line) { ran.push(line); return { output: '' }; },
        complete(before) { return { line: `${before}x`, matches: [`${before}x`] }; },
        prompt() { return { cwd: '/home/dev', gold: false }; },
        onAudibleKey(k) { heard.push(k); },
      },
    );

    keysMod.handleKey(st, 'a', false);
    assert.equal(st.buffer, 'a');
    assert.deepEqual(heard, ['press']);

    keysMod.handleKey(st, 'a', true);
    assert.equal(st.buffer, 'aa');
    assert.deepEqual(heard, ['press'], 'held printable key does not re-emit press');

    keysMod.handleKey(st, '\t', true);
    assert.equal(st.buffer, 'aax ');
    assert.deepEqual(heard, ['press'], 'held Tab does not emit tab');

    keysMod.handleKey(st, '\t', false);
    assert.deepEqual(heard, ['press', 'tab']);

    const lenBeforeDel = st.buffer.length;
    keysMod.handleKey(st, '\x7f', true);
    assert.equal(st.buffer.length, lenBeforeDel - 1);
    assert.deepEqual(heard, ['press', 'tab'], 'held Backspace edits without emitting backspace');

    keysMod.handleKey(st, '\x7f', false);
    assert.deepEqual(heard, ['press', 'tab', 'backspace']);

    keysMod.handleKey(st, '\x1b[D', false);
    keysMod.handleKey(st, '\x1b[3~', true);
    assert.deepEqual(heard, ['press', 'tab', 'backspace'], 'held Delete edits without emitting backspace');

    keysMod.handleKey(st, '\r', true);
    assert.equal(ran.length, 1);
    assert.deepEqual(heard, ['press', 'tab', 'backspace'], 'held Enter runs without emitting enter');

    keysMod.handleKey(st, 'ls', false);
    keysMod.handleKey(st, '\r', false);
    assert.deepEqual(heard, ['press', 'tab', 'backspace', 'press', 'enter']);

    keysMod.handleKey(st, '\x1b[A', true);
    assert.equal(st.buffer, 'ls');
    assert.deepEqual(heard, ['press', 'tab', 'backspace', 'press', 'enter'], 'held ArrowUp recalls history silently');

    keysMod.handleKey(st, '\x1b[A', false);
    assert.deepEqual(heard, ['press', 'tab', 'backspace', 'press', 'enter', 'press']);
  });

  await test('attachOrchestrators plays dialog/taunt voices synchronously on dialog open, rotating per-agent variants cleanly', async () => {
    const orchMod = await vite.ssrLoadModule('/src/audio/orchestrators.ts');
    const engineMod = await vite.ssrLoadModule('/src/audio/engine.ts');
    const bus = busMod.createAppBus();
    const played = [];
    const fakePlayer = {
      live: true, muted: false, volume: 1,
      play(id) { played.push(id); },
      loop() {}, bed() {}, hold() {}, setMuted() {}, setVolume() {}, dispose() {},
    };
    const off = orchMod.attachOrchestrators(bus, fakePlayer);
    try {
      bus.emit({ kind: 'kernel', event: { type: 'DIALOG_BOX', id: 'd1', speaker: 'antigravy', name: 'ANTIGRAVY', model: 'agent.antigravy', text: 'hi', holdMs: 1780 } });
      bus.emit({ kind: 'kernel', event: { type: 'AGENT_TAUNT', agent: 'clod', model: 'agent.clod', text: 'ha', mood: 'laugh' } });
      assert.deepEqual(played, [], 'queued DIALOG_BOX and AGENT_TAUNT kernel events do not trigger premature voice playback');
      bus.emit({ kind: 'dialog', speaker: 'antigravy' });
      bus.emit({ kind: 'dialog', speaker: 'clod' });
      bus.emit({ kind: 'dialog', speaker: 'kiro' });
      bus.emit({ kind: 'dialog', speaker: 'vibecoder' });
      bus.emit({ kind: 'dialog', speaker: 'dad' });
      assert.deepEqual(played, ['taunt_antigravy_1', 'taunt_clod_1', 'kiro_advice', 'dialog_hero', 'dad_cheer']);
    } finally {
      off();
    }

    await withFakeWindow(async (env) => {
      const eng = engineMod.createGraph(10, 3);
      env.state().listeners.get('pointerdown')();
      await new Promise((r) => setTimeout(r, 15));
      for (let i = 0; i < 24; i += 1) eng.play('taunt_antigravy_1');
      for (let i = 0; i < 12; i += 1) eng.play('taunt_codec_1');
      for (let i = 0; i < 12; i += 1) eng.play('kiro_advice');
      await new Promise((r) => setTimeout(r, 25));
      const playedVoices = env.state().starts.filter((s) => s.url.includes('/sfx/taunt_') || s.url.includes('/sfx/kiro_advice'));
      const gravyUrls = playedVoices.filter((s) => s.url.includes('/sfx/taunt_antigravy_')).map((s) => s.url);
      const codecUrls = playedVoices.filter((s) => s.url.includes('/sfx/taunt_codec_')).map((s) => s.url);
      const kiroUrls = playedVoices.filter((s) => s.url.includes('/sfx/kiro_advice')).map((s) => s.url);
      assert.equal(gravyUrls.length, 24);
      assert.equal(codecUrls.length, 12);
      assert.equal(kiroUrls.length, 12);
      assert.ok(gravyUrls.every((u) => /^\/sfx\/taunt_antigravy_(?:[1-9]|10)\.mp3$/.test(u)), 'antigravy randomly picks across its 10 variants');
      assert.ok(codecUrls.every((u) => /^\/sfx\/taunt_codec_(?:[1-9]|10)\.mp3$/.test(u)), 'codec randomly picks across its 10 variants');
      assert.ok(kiroUrls.every((u) => /^\/sfx\/kiro_advice(?:|_2|_3|_4|_5|_6|_7|_8|_9|_10)\.mp3$/.test(u)), 'kiro randomly picks across its 10 praise/cheer variants');
      for (let i = 1; i < gravyUrls.length; i += 1) {
        assert.notEqual(gravyUrls[i], gravyUrls[i - 1], 'antigravy avoids repeating the same variant back-to-back');
      }
      for (let i = 1; i < codecUrls.length; i += 1) {
        assert.notEqual(codecUrls[i], codecUrls[i - 1], 'codec avoids repeating the same variant back-to-back');
      }
      for (let i = 1; i < kiroUrls.length; i += 1) {
        assert.notEqual(kiroUrls[i], kiroUrls[i - 1], 'kiro avoids repeating the same praise variant back-to-back');
      }
      assert.ok(new Set(gravyUrls).size >= 4, 'random selection samples multiple distinct antigravy variants');
      assert.ok(new Set(codecUrls).size >= 3, 'random selection samples multiple distinct codec variants');
      assert.ok(new Set(kiroUrls).size >= 3, 'random selection samples multiple distinct kiro praise variants');
      assert.ok(playedVoices.every((s) => s.rate === 1), 'robot voice taunts and kiro cheers preserve native pitch/speed');
      for (const s of playedVoices) {
        if (s.url.endsWith('/taunt_antigravy_2.mp3')) {
          assert.equal(s.offset, 0, 'taunt_antigravy_2 starts immediately without unnecessary trim');
        } else {
          assert.ok(s.offset > 0, `${s.url} trims leading silence`);
        }
      }
      assert.ok(env.state().stopped >= 46, 'starting the next dialog voice fades out the previous active speech cleanly');
      const before = env.state().starts.length;
      for (let i = 0; i < 200; i += 1) eng.play('dad_cheer');
      await new Promise((r) => setTimeout(r, 25));
      const dadUrls = env.state().starts.slice(before).filter((s) => s.url.includes('/sfx/dad_cheer')).map((s) => s.url);
      assert.equal(dadUrls.length, 200);
      assert.ok(dadUrls.every((u) => /^\/sfx\/dad_cheer(?:|_[2-9]|_10)\.mp3$/.test(u)), 'the old coder plays only dad_cheer variants');
      for (let i = 1; i < dadUrls.length; i += 1) {
        assert.notEqual(dadUrls[i], dadUrls[i - 1], 'the old coder avoids repeating the same cheer back-to-back');
      }
      assert.equal(new Set(dadUrls).size, 10, 'every one of the ten old coder cheers is reachable');
      eng.dispose();
    });
  });

  await test('FLOOR_CLEARED sfx override, locked subdir deny sfx, entryPort return sfx, and CineAudio ambient loops work cleanly', async () => {
    const { createChapterSession } = await vite.ssrLoadModule('/src/chapters/chapter-session.ts');
    const { CineAudio } = await vite.ssrLoadModule('/src/cinematic/audio.ts');
    assert.deepEqual(
      sfxMod.sfxFor({ kind: 'kernel', event: { type: 'FLOOR_CLEARED', floorId: 1, speedrunBonus: false, commandsCount: 2, sfx: 'rank_reveal' } }),
      ['rank_reveal', 'sting_clear'],
      'FLOOR_CLEARED honors valid sfx override',
    );
    assert.deepEqual(
      sfxMod.sfxFor({ kind: 'kernel', event: { type: 'FLOOR_CLEARED', floorId: 1, speedrunBonus: false, commandsCount: 2 } }),
      ['level_clear', 'sting_clear'],
      'FLOOR_CLEARED falls back to level_clear',
    );

    const real = readChapter(listChapterSlugs()[0]);
    const customPack = {
      manifest: { ...real.manifest, id: 'sfx-stage-unit', levels: [{ index: 1, id: 's1', title: 'S1', cwd: '/lvl', roomKind: 'lab_hall', floorTheme: 2, mechanic: 'terminal', mechanicLabel: 'T', difficulty: 1, teaches: [], enemies: [] }] },
      levels: [{
        id: 's1', index: 1, title: 'S1', cwd: '/lvl', roomKind: 'lab_hall', floorTheme: 2, mechanic: 'terminal', summary: 'sfx test',
        stage: {
          entryPort: { sfx: 'door_serial' },
          sfx: { enter: 'title_card', exit: 'rank_reveal', deny: 'gate_locked' },
          subdirs: { '/lvl/open_sub': { sfx: 'door_hdmi' } },
        },
        files: [
          { path: '/lvl/locked_sub', kind: 'dir', mode: 0o644 },
          { path: '/lvl/open_sub', kind: 'dir', mode: 0o755 },
          { path: '/lvl/fw_sub', kind: 'dir', mode: 0o755, model: 'door.firewall' },
          { path: '/lvl/plain_sub', kind: 'dir', mode: 0o755 },
          { path: '/lvl/exit_gate', kind: 'dir', mode: 0o755 },
        ],
        enemies: [],
        pickups: [],
        patches: [],
        winRules: [{ kind: 'dir_accessible', path: '/lvl/exit_gate', description: 'open' }],
        exitDir: '/lvl/exit_gate',
        solutionCommands: ['cd exit_gate'],
      }],
      dialogs: { levels: {} },
    };
    const sess = createChapterSession({ chapterId: 'sfx-stage-unit', pack: customPack, preview: true, startLevelId: 's1' });
    sess.skipIntro();
    const denyRes = sess.exec('cd locked_sub');
    const denyEv = denyRes.events.find((e) => e.type === 'PERMISSION_DENIED_RATTLE');
    assert.equal(denyEv?.sfx, 'gate_locked', 'locked subdir cd uses stage.sfx.deny');
    const subRes = sess.exec('cd open_sub');
    assert.equal(subRes.events.find((e) => e.type === 'ROOM_TRANSITION')?.sfx, 'door_hdmi', 'subdir entry uses subdir sfx');
    const backRes = sess.exec('cd ..');
    assert.equal(backRes.events.find((e) => e.type === 'ROOM_TRANSITION')?.sfx, 'door_serial', 'returning to cwd uses stage.entryPort.sfx');
    const fwRes = sess.exec('cd fw_sub');
    const fwTr = fwRes.events.find((e) => e.type === 'ROOM_TRANSITION');
    assert.equal(fwTr?.doorModel, 'door.firewall');
    assert.deepEqual(sfxMod.sfxFor({ kind: 'kernel', event: fwTr }), ['door_firewall'], 'ROOM_TRANSITION falls back to doorModelCue from LevelFileSpec.model');
    assert.equal(sess.exec('cd ..').code, 0);
    const plainRes = sess.exec('cd plain_sub');
    const plainTr = plainRes.events.find((e) => e.type === 'ROOM_TRANSITION');
    assert.equal(plainTr?.doorModel, 'door.usb');
    assert.deepEqual(sfxMod.sfxFor({ kind: 'kernel', event: plainTr }), ['door_usb'], 'plain subdir falls back to door.usb -> door_usb');
    assert.equal(sess.exec('cd ..').code, 0);
    assert.deepEqual(
      sfxMod.sfxFor({
        kind: 'kernel',
        event: { type: 'ROOM_TRANSITION', fromDir: 1, toDir: 2, toPath: '/var/dungeon/entrance/iron_gate', upwardPanelsSmashed: 0, viaSymlinkLoop: false, doorModel: 'door.usb', sfx: 'hop' },
      }),
      ['hop'],
      'ROOM_TRANSITION explicit sfx wins over doorModelCue and path doorCue',
    );
    const clearRes = sess.exec('cd exit_gate');
    assert.equal(clearRes.events.find((e) => e.type === 'FLOOR_CLEARED')?.sfx, 'rank_reveal', 'exiting level attaches stage.sfx.exit');

    const bus = busMod.createAppBus();
    const emitted = [];
    const off = bus.subscribe((ev) => { if (ev.kind === 'loop') emitted.push(`${ev.cue}:${ev.on}`); });
    try {
      const ca = new CineAudio(false, bus);
      ca.loop('dad_rig_loop', true);
      ca.rain(true);
      ca.stopLoops();
      assert.deepEqual(emitted, ['dad_rig_loop:true', 'rain_loop:true', 'dad_rig_loop:false', 'rain_loop:false']);
    } finally {
      off();
    }
  });
}, '/src/audio/sfx-for.ts');

console.log(`audio-unit: ${count()} checks passed`);
