#!/usr/bin/env node
// Unit gate for the Interactive Terminal Field Manual data, search, chmod math, and shell integration.
//   node scripts/harness/manual-unit.mjs     exit 0 = all assertions passed
import assert from 'node:assert/strict';
import { readChapter, listChapterSlugs } from './lib/chapter-compile.mjs';
import { withProcgen } from './lib/load.mjs';
import { testRunner } from './lib/test-kit.mjs';

const { test, count } = testRunner();

await withProcgen(async (_p, vite) => {
  const load = (path) => vite.ssrLoadModule(path);
  const { COMMANDS, helpText, runMan } = await load('/src/game/manual.ts');
  const { ITEMS, ITEM_IDS } = await load('/src/contracts/inventory.ts');
  const { starterInventory } = await load('/src/game/inventory.ts');
  const { CHAPTER_COMMANDS } = await load('/src/chapters/session-state.ts');
  const { createSession } = await load('/src/game/session.ts');
  const { createChapterSession } = await load('/src/chapters/chapter-session.ts');
  const { modeText } = await import('./props/terminal.mjs');
  const {
    buildMotherboardTopology,
    resolveLevelByQuery,
  } = await load('/src/ui/chapter-map-model.ts');
  const {
    BOOK_PAGES,
    BOOK_SECTIONS,
    MANUAL_COMMANDS,
    MANUAL_GUIDES,
    findCommandDoc,
    formatChmodPreview,
    resolveManualPageIndex,
    searchManual,
  } = await load('/src/game/manual-catalog.ts');

  const slug = listChapterSlugs()[0];

  test('every shell command and alias is documented via findCommandDoc with flags and examples', () => {
    const missing = [...new Set([...COMMANDS, ...CHAPTER_COMMANDS])].filter((c) => !findCommandDoc(c));
    assert.deepEqual(missing, [], `Undocumented shell commands: ${missing.join(', ')}`);
    for (const alias of ['.', 'logout', 'inv', 'nano', 'vim', 'code', 'dossier', 'rig', 'ach', 'trophies']) {
      assert.ok(findCommandDoc(alias), `alias ${alias} missing from findCommandDoc`);
    }

    for (const cmd of MANUAL_COMMANDS) {
      assert.ok(cmd.syntax.trim().length > 0, `${cmd.command} missing syntax`);
      assert.ok(cmd.summary.trim().length > 0, `${cmd.command} missing summary`);
      assert.ok(cmd.realWorld.trim().length > 0, `${cmd.command} missing realWorld`);
      assert.ok(cmd.inGame.trim().length > 0, `${cmd.command} missing inGame`);
      assert.ok(cmd.examples.length >= 1, `${cmd.command} must include >= 1 example`);
      for (const field of [cmd.summary, cmd.realWorld, cmd.inGame, ...cmd.pitfalls, ...cmd.examples.map((e) => e.outcome)]) {
        const ticks = (field.match(/`/g) ?? []).length;
        assert.equal(ticks % 2, 0, `${cmd.command} has unbalanced backticks in: ${field}`);
      }
      for (const f of cmd.flags) {
        assert.ok(f.flag.trim().length > 0 && f.meaning.trim().length > 0, `${cmd.command} has empty flag entry`);
        for (const textField of [f.meaning, f.detail ?? '']) {
          const ticks = (textField.match(/`/g) ?? []).length;
          assert.equal(ticks % 2, 0, `${cmd.command} flag ${f.flag} has unbalanced backticks in: ${textField}`);
        }
      }
    }

    const catDoc = findCommandDoc('cat');
    assert.ok(catDoc, 'cat doc missing');
    assert.match(`${catDoc.inGame}\n${catDoc.examples.map((e) => `${e.command} ${e.outcome}`).join('\n')}`, /cat <malware>|malware/i);
    assert.match(`${catDoc.inGame}\n${catDoc.examples.map((e) => e.outcome).join('\n')}`, /strings|weakness/i);
  });

  test('BOOK_PAGES and BOOK_SECTIONS have valid monotonic indices and cover guides + commands', () => {
    assert.ok(BOOK_PAGES.length >= MANUAL_COMMANDS.length + MANUAL_GUIDES.length + 2);
    BOOK_PAGES.forEach((p, idx) => {
      assert.equal(p.index, idx, `page ${idx} has mismatched index`);
    });
    for (const sec of BOOK_SECTIONS) {
      assert.ok(sec.startPage >= 0 && sec.startPage < BOOK_PAGES.length, `section ${sec.id} startPage out of range`);
    }
    const pageCommands = new Set(BOOK_PAGES.filter((p) => p.kind === 'command').map((p) => p.entry.command));
    for (const cmd of MANUAL_COMMANDS) {
      assert.ok(pageCommands.has(cmd.command), `${cmd.command} missing command page`);
    }
    const guideIds = new Set(MANUAL_GUIDES.map((g) => g.id));
    for (const id of ['guide-chmod-numbers', 'guide-kill-signals', 'guide-shell-syntax', 'guide-malware-matrix']) {
      assert.ok(guideIds.has(id), `missing guide ${id}`);
    }
  });

  test('kill and chmod entries deeply explain -9/SIGKILL, unsupported signals, -R/-v, and numeric octal modes', () => {
    const kill = findCommandDoc('kill');
    const pkill = findCommandDoc('pkill');
    const chmod = findCommandDoc('chmod');
    assert.ok(kill && pkill && chmod);
    const killFlags = kill.flags.map((f) => `${f.flag} ${f.alias ?? ''} ${f.meaning} ${f.detail ?? ''}`).join('\n');
    assert.match(killFlags, /-9/);
    assert.match(killFlags, /SIGKILL/i);
    assert.match(killFlags, /-15/);
    assert.match(killFlags, /SIGTERM/i);
    assert.match(killFlags, /-STOP/i);
    assert.match(killFlags, /-CONT/i);
    assert.match(kill.pitfalls.join('\n'), /SIGHUP|SIGINT/i);
    assert.match(pkill.flags.map((f) => f.flag).join(' '), /-9/);

    const chmodFlags = chmod.flags.map((f) => `${f.flag} ${f.meaning} ${f.detail ?? ''}`).join('\n');
    for (const oct of ['755', '644', '600', '700', '777', '444', '400', '000']) {
      assert.match(chmodFlags, new RegExp(oct), `chmod docs missing octal example ${oct}`);
    }
    assert.match(chmodFlags, /-R/);
    assert.match(chmod.realWorld, /4.*read|4=r|4\s*=\s*read/i);
  });

  test('formatChmodPreview matches POSIX ls -l mode strings, symbolic view, and real shell chmod output', () => {
    const game = createSession();
    assert.equal(game.exec('touch modecheck.txt').code, 0);
    for (const mode of [0o755, 0o644, 0o600, 0o700, 0o777, 0o555, 0o444, 0o400, 0o000]) {
      const preview = formatChmodPreview(mode);
      assert.equal(preview.octal, mode.toString(8).padStart(3, '0'));
      assert.equal(preview.modeText, modeText(preview.octal));
      assert.match(preview.symbolic, /^u=[rwx]*,g=[rwx]*,o=[rwx]*$/);
      assert.equal(game.exec(`chmod ${preview.octal} modecheck.txt`).code, 0);
      assert.ok(game.exec('ls -l modecheck.txt').output.includes(preview.modeText), `ls -l missing ${preview.modeText}`);
    }
  });

  test('searchManual ranks -9, 644, natural-language queries, aliases, filters, and handles empty/missing queries safely', () => {
    const nineHits = searchManual('-9');
    assert.ok(nineHits.length >= 2);
    assert.ok(nineHits.slice(0, 3).some((h) => /kill/i.test(h.title)), `top hits for -9 should contain kill, got ${nineHits.slice(0, 3).map((h) => h.title)}`);

    const naturalKill = searchManual('what is -9 for kill');
    assert.equal(naturalKill[0]?.title, 'kill', `expected kill #1 for natural query, got ${naturalKill[0]?.title}`);

    const chmodHits = searchManual('644');
    assert.ok(chmodHits.length >= 1);
    assert.ok(chmodHits.slice(0, 3).some((h) => /chmod/i.test(h.title)));

    const naturalChmod = searchManual('specific number for chmod');
    assert.ok(naturalChmod.slice(0, 2).some((h) => /chmod/i.test(h.title)));

    const replaceHits = searchManual('replace text');
    assert.equal(replaceHits[0]?.title, 'sed', `expected sed #1 for 'replace text', got ${replaceHits[0]?.title}`);
    assert.equal(BOOK_PAGES[resolveManualPageIndex('replace text')]?.entry?.command, 'sed');

    assert.equal(searchManual('-P')[0]?.title, 'pkill');
    assert.equal(BOOK_PAGES[resolveManualPageIndex('-P')]?.entry?.command, 'pkill');
    assert.equal(BOOK_PAGES[resolveManualPageIndex('-p')]?.entry?.command, 'mkdir');
    assert.equal(BOOK_PAGES[resolveManualPageIndex('|')]?.guide?.id, 'guide-shell-syntax');

    assert.deepEqual(searchManual(''), []);
    assert.deepEqual(searchManual('   '), []);
    assert.deepEqual(searchManual('xyzzynotarealcommand999'), []);

    const procsOnly = searchManual('', 'procs');
    assert.ok(procsOnly.length >= 3);
    for (const h of procsOnly) {
      const filters = h.entry?.filters ?? h.guide?.filters ?? [];
      assert.ok(filters.includes('procs'), `hit ${h.title} missing procs filter`);
    }

    const idxChmod = resolveManualPageIndex('chmod');
    assert.equal(BOOK_PAGES[idxChmod]?.kind, 'command');
    assert.equal(BOOK_PAGES[idxChmod]?.entry.command, 'chmod');
    assert.equal(BOOK_PAGES[resolveManualPageIndex('inv')]?.entry?.command, 'inventory');
    assert.equal(resolveManualPageIndex(''), 0);
  });

  test('classic session runs manual, queues modal request, completes topics, preserves man/help', () => {
    const game = createSession();
    assert.match(helpText('hint'), /\bmanual\b/);
    assert.equal(runMan(['manual']).code, 0);

    const openEmpty = game.exec('manual');
    assert.equal(openEmpty.code, 0);
    assert.equal(game.consumeManualRequest(), '');
    assert.equal(game.consumeManualRequest(), null);

    const openNine = game.exec('manual -9');
    assert.equal(openNine.code, 0);
    assert.match(openNine.output, /kill/i);
    assert.equal(game.consumeManualRequest(), '-9');

    const comp = game.complete('manual ch');
    assert.ok(comp.matches.includes('chmod'), `expected chmod completion in ${JSON.stringify(comp)}`);
    assert.equal(game.exec('man chmod').code, 0);
  });

  test('chapter session runs manual, carries manual inventory item, keeps non-paused battle clock on manual cmd', () => {
    assert.ok(ITEM_IDS.includes('manual'), 'manual is registered in ITEM_IDS');
    assert.equal(ITEMS.manual.model, 'item.manual');
    assert.equal(ITEMS.manual.heroModel, 'vibecoder.dev_manual');
    assert.ok(starterInventory().items.includes('manual'), 'starterInventory carries manual by default');
    assert.match(findCommandDoc('hold')?.inGame ?? '', /manual/);
    assert.match(findCommandDoc('inventory')?.summary ?? '', /manual/);
    assert.doesNotMatch(findCommandDoc('manual')?.summary ?? '', /pauses battle timer/i);
    assert.match(findCommandDoc('manual')?.inGame ?? '', /keeps the 30s battle turn timer live/i);

    const chapterManifest = readChapter(slug).manifest;
    assert.ok(chapterManifest.startItems?.includes('manual'), 'chapter 1 startItems carries manual');

    const session = createChapterSession({ chapterId: slug, preview: true });
    session.skipTutorial();
    assert.ok(session.snapshot().inventory.items.includes('manual'), 'chapter session starts carrying manual');
    assert.equal(session.exec('hold manual').code, 0);
    assert.equal(session.snapshot().inventory.held, 'manual');
    assert.ok(session.complete('hold m').matches.includes('manual'));

    const snapBefore = session.snapshot();
    const res = session.exec('manual chmod');
    assert.equal(res.code, 0);
    assert.match(res.output, /chmod/i);
    assert.equal(session.consumeManualRequest(), 'chmod');
    assert.equal(session.consumeManualRequest(), null);
    assert.equal(session.snapshot().commands, snapBefore.commands + 1);
    assert.equal(session.snapshot().paused, false);

    const openBlank = session.exec('manual');
    assert.equal(openBlank.code, 0);
    assert.equal(session.consumeManualRequest(), '');

    const comp = session.complete('manual k');
    assert.ok(comp.matches.includes('kill') && comp.matches.includes('kiro'), `expected kill & kiro in ${JSON.stringify(comp)}`);

    const chapter = readChapter(slug);
    const battleLevel = chapter.levels.map((l) => l.spec).find((l) => l.enemies.length > 0 && !l.script?.safe);
    assert.ok(battleLevel, 'expected at least one non-safe combat level in chapter');
    if (battleLevel) {
      session.jumpToLevel(battleLevel.id);
      session.exec('ls');
      session.skipBattleIntro();
      const b1 = session.snapshot().battle;
      assert.equal(b1?.phase, 'player');
      session.tick();
      assert.equal(session.snapshot().battle?.secondsLeft, (b1?.secondsLeft ?? 30) - 1, 'live battle timer decrements on tick when not paused');
      session.setPaused(true);
      session.tick();
      assert.equal(session.snapshot().battle?.secondsLeft, (b1?.secondsLeft ?? 30) - 1, 'explicit game pause stops battle timer');
      session.setPaused(false);
      // Verify full unpaused 30s countdown reaches timeout -> enemy turn without stalling or crashing (Q4)
      const turnEvents = [];
      for (let i = 0; i < 29; i++) turnEvents.push(...session.tick().events);
      assert.ok(turnEvents.filter((e) => e.type === 'BATTLE_TURN').length >= 2, 'unpaused battle countdown fires BATTLE_TURN transition on 0s timeout');
      assert.equal(session.snapshot().battle?.secondsLeft, 30, 'battle turn timer resets to 30s after timeout enemy turn');
    }
  });

  test('skip tutorial drops later dialogs and still hands over the terminal', () => {
    const session = createChapterSession({ chapterId: slug, preview: true });
    session.skipIntro();
    const skipped = session.skipTutorial();
    const kinds = skipped.events.map((event) => event.type);
    assert.ok(!kinds.includes('DIALOG_BOX'), `skip still emitted a dialog: ${kinds.join(',')}`);
    assert.ok(!kinds.includes('VIBECODER_EMOTE'), `skip still emitted an emote: ${kinds.join(',')}`);
    assert.equal(session.snapshot().tutorial, null);
    assert.ok(session.snapshot().inventory.items.includes('terminal'), 'skip still gives the terminal');
    const later = [];
    for (let i = 0; i < 40; i++) later.push(...session.tick().events);
    const late = later.filter((event) => event.type === 'DIALOG_BOX' || event.type === 'VIBECODER_EMOTE' || event.type === 'AGENT_TAUNT');
    assert.deepEqual(late, []);
  });

  test('chapter motherboard map item, command, and 4-stage Kiroween topology', () => {
    assert.ok(ITEM_IDS.includes('map'), 'map is registered in ITEM_IDS');
    assert.equal(ITEMS.map.model, 'item.map');
    assert.equal(ITEMS.map.heroModel, 'vibecoder.dev_map');
    assert.ok(starterInventory().items.includes('map'), 'starterInventory carries map by default');
    assert.ok(findCommandDoc('map'), 'map command is documented in Field Manual');

    const chapterManifest = readChapter(slug).manifest;
    assert.ok(chapterManifest.startItems?.includes('map'), 'chapter 1 startItems carries map');

    const topo = buildMotherboardTopology(chapterManifest, {}, chapterManifest.levels[0].id);
    assert.equal(topo.totalCount, chapterManifest.levels.length);
    assert.equal(topo.bootBlock?.level.index, 1, 'boot ROM socket holds level 1');
    assert.equal(topo.channels.length, 3, 'three motherboard data channels for Kiroween');
    assert.equal(topo.channels[0].taskBlocks.map((b) => b.level.index).join(','), '2,3');
    assert.equal(topo.channels[0].hubBlock?.level.index, 4);
    assert.equal(topo.channels[0].hubBlock?.coreGrant, 'QWEN');
    assert.equal(topo.channels[1].taskBlocks.map((b) => b.level.index).join(','), '5,6');
    assert.equal(topo.channels[1].hubBlock?.level.index, 7);
    assert.equal(topo.channels[1].hubBlock?.coreGrant, 'DEEPSEEK');
    assert.equal(topo.channels[2].taskBlocks.map((b) => b.level.index).join(','), '8,9');
    assert.equal(topo.channels[2].hubBlock?.level.index, 10);
    assert.equal(topo.channels[2].hubBlock?.coreGrant, 'LLAMA');
    assert.equal(topo.coreBlocks.length, 1);
    assert.equal(topo.coreBlocks[0].level.index, 11, 'CPU core socket holds boss level 11');
    assert.equal(topo.bootBlock?.status, 'current');
    assert.equal(topo.channels[0].taskBlocks[0].status, 'unknown', 'unreached level 2 starts as unknown');
    assert.equal(topo.coreBlocks[0].status, 'unknown', 'unreached boss level starts as unknown');

    const clearedLvl1Progress = {
      [slug]: {
        [chapterManifest.levels[0].id]: {
          cleared: true,
          bestRank: 'S',
          bestCommands: 3,
          bestTimeSec: 12,
          chaosCleared: false,
        },
      },
    };
    const nextTopo = buildMotherboardTopology(chapterManifest, clearedLvl1Progress, chapterManifest.levels[0].id);
    assert.equal(nextTopo.channels[0].taskBlocks[0].status, 'ready', 'clearing level 1 opens level 2 as ready');
    assert.equal(nextTopo.channels[0].taskBlocks[1].status, 'unknown', 'level 3 stays unknown until level 2 clears');

    assert.equal(resolveLevelByQuery(chapterManifest, '4').index, 4);
    assert.equal(resolveLevelByQuery(chapterManifest, 'boot').index, 1);
    assert.equal(resolveLevelByQuery(chapterManifest, 'boss').index, 11);
    assert.equal(resolveLevelByQuery(chapterManifest, 'deepseek').index, 7);

    const classic = createSession();
    assert.equal(classic.exec('map 2').code, 0);
    assert.equal(classic.consumeMapRequest(), '2');
    assert.equal(classic.consumeMapRequest(), null);
    assert.ok(classic.complete('map ').matches.includes('boot'));

    const session = createChapterSession({ chapterId: slug, preview: true });
    session.skipTutorial();
    assert.ok(session.snapshot().inventory.items.includes('map'), 'chapter session starts carrying map');
    assert.equal(session.exec('hold map').code, 0);
    assert.equal(session.snapshot().inventory.held, 'map');
    assert.ok(session.complete('hold m').matches.includes('map'));
    const mapRes = session.exec('map 4');
    assert.equal(mapRes.code, 0);
    assert.equal(session.consumeMapRequest(), '4');
    assert.equal(session.consumeMapRequest(), null);
    assert.ok(session.complete('map 1').matches.includes('11'));
  });
});

console.log(`\nmanual unit: ${count()} tests passed`);
