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
  const { giveItem, starterInventory } = await load('/src/game/inventory.ts');
  const { CHAPTER_COMMANDS } = await load('/src/chapters/session-state.ts');
  const { getChapterPack, isFieldManualAvailable, recordLevelClear, resetInMemoryStoresForTest } = await load('/src/chapters/catalog.ts');
  const { ACHIEVEMENT_SPECS, isManualUnlocked } = await load('/src/chapters/achievements.ts');
  const { createSession } = await load('/src/game/session.ts');
  const { createChapterSession } = await load('/src/chapters/chapter-session.ts');
  const { modeText } = await import('./props/terminal.mjs');
  const {
    buildMotherboardTopology,
    resolveLevelByQuery,
  } = await load('/src/ui/chapter-map-model.ts');
  const { chapterMapTopologyKey } = await load('/src/ui/chapter-map.ts');
  const {
    MAP_SPARK_STATES,
    MAP_SPARK_TIME_WRAP_S,
    buildMapSparkFragmentShader,
    buildMapSparkVertexShader,
  } = await load('/src/shaders/map-sparks.ts');
  const {
    buildSparkRibbonData,
    patchSparkRibbonStates,
    toBoardLocalBox,
  } = await load('/src/ui/chapter-map-sparks.ts');
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
    for (const alias of ['.', 'kiro.d', 'logout', 'inv', 'nano', 'vim', 'code', 'dossier', 'rig', 'ach', 'trophies']) {
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

  test('classic session gates manual until carried, then queues modal request, completes topics, preserves man/help', () => {
    const game = createSession();
    assert.match(helpText('hint'), /\bmanual\b/);
    assert.equal(runMan(['manual']).code, 0);

    assert.equal(game.exec('manual').code, 1, 'classic manual command is locked before carrying manual');
    assert.equal(game.consumeManualRequest(), null);
    game.run.inventory = giveItem(game.run.inventory, 'manual');

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

  test('chapter session gates manual until Hub #1 gift, unlocks ACH_FIELD_MANUAL, and keeps non-paused battle clock on manual cmd', () => {
    assert.ok(ITEM_IDS.includes('manual'), 'manual is registered in ITEM_IDS');
    assert.equal(ITEMS.manual.model, 'item.manual');
    assert.equal(ITEMS.manual.heroModel, 'vibecoder.dev_manual');
    assert.equal(starterInventory().items.includes('manual'), false, 'starterInventory does NOT carry manual by default');
    assert.ok(ACHIEVEMENT_SPECS.some((a) => a.id === 'field_manual' && a.steamApiName === 'ACH_FIELD_MANUAL'), 'ACH_FIELD_MANUAL exists');
    assert.match(findCommandDoc('hold')?.inGame ?? '', /manual/);
    assert.match(findCommandDoc('inventory')?.summary ?? '', /manual/);
    assert.doesNotMatch(findCommandDoc('manual')?.summary ?? '', /pauses battle timer/i);
    assert.match(findCommandDoc('manual')?.inGame ?? '', /keeps the 30s battle turn timer live/i);

    const chapterManifest = readChapter(slug).manifest;
    assert.equal(chapterManifest.startItems?.includes('manual') ?? false, false, 'chapter 1 startItems omits manual');

    resetInMemoryStoresForTest();
    assert.equal(isManualUnlocked(), false, 'Field Manual starts locked on landing/standalone');
    assert.equal(isFieldManualAvailable(), false, 'isFieldManualAvailable starts false');
    const liveSession = createChapterSession({ chapterId: slug });
    liveSession.skipTutorial();
    assert.equal(liveSession.snapshot().inventory.items.includes('manual'), false, 'Level 1 does not carry manual');
    assert.equal(liveSession.exec('manual').code, 1, 'manual command is locked before Hub #1');
    liveSession.jumpToLevel('level-04-hub-model-one');
    liveSession.arriveLevel();
    const hubGift = liveSession.skipOpeningDialog();
    assert.ok(hubGift.events.some((e) => e.type === 'ACHIEVEMENT_UNLOCKED' && e.id === 'field_manual'), 'Hub #1 unlocks ACH_FIELD_MANUAL');
    assert.equal(isManualUnlocked(), true, 'Field Manual unlocks once obtained from Old Coder');
    assert.equal(isFieldManualAvailable(), true, 'isFieldManualAvailable unlocks via ACH_FIELD_MANUAL');
    resetInMemoryStoresForTest();
    recordLevelClear(slug, 'level-04-hub-model-one', 'A', 4, 20);
    assert.equal(isFieldManualAvailable(), true, 'isFieldManualAvailable also unlocks for legacy saves that cleared Hub #1');
    resetInMemoryStoresForTest();

    const session = createChapterSession({ chapterId: slug, startLevelId: 'level-05-task-ui-grid', preview: true });
    session.arriveLevel();
    session.skipOpeningDialog();
    assert.ok(session.snapshot().inventory.items.includes('manual'), 'levels after Hub #1 carry manual via grants');
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
    const battleLevel = chapter.levels
      .map((l) => l.spec)
      .find((l) => l.index >= 5 && l.enemies.some((e) => !e.appearWhen && e.type !== 'ransomware' && e.type !== 'spyware' && e.type !== 'rootkit') && !l.script?.safe);
    assert.ok(battleLevel, 'expected at least one post-Hub combat level in chapter');
    if (battleLevel) {
      session.jumpToLevel(battleLevel.id);
      session.arriveLevel();
      session.skipOpeningDialog();
      assert.equal(session.snapshot().battle?.phase, 'intro', 'battle begins immediately once opening dialog finishes');
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
    for (let i = 0; i < 100; i++) later.push(...session.tick().events);
    const late = later.filter((event) => event.type === 'DIALOG_BOX' || event.type === 'VIBECODER_EMOTE' || event.type === 'AGENT_TAUNT');
    assert.deepEqual(late, []);
  });

  test('chapter motherboard map item, command, and 4-stage Kiroween topology', () => {
    assert.ok(ITEM_IDS.includes('map'), 'map is registered in ITEM_IDS');
    assert.equal(ITEMS.map.model, 'item.map');
    assert.equal(ITEMS.map.heroModel, 'vibecoder.dev_map');
    assert.equal(starterInventory().items.includes('map'), false, 'starterInventory does NOT carry map by default');
    assert.ok(findCommandDoc('map'), 'map command is documented in Field Manual');

    const chapterManifest = readChapter(slug).manifest;
    assert.equal(chapterManifest.startItems?.includes('map') ?? false, false, 'chapter 1 startItems omits map');

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
    classic.run.inventory = starterInventory(['terminal']);
    const classicBasicLs = classic.exec('ls');
    assert.equal(classicBasicLs.code, 0, 'classic basic ls works without tube transistor');
    assert.ok(classicBasicLs.output.includes('todo.note'), 'classic basic ls lists visible files');
    assert.equal(classic.exec('ls ..').code, 0, 'classic ls <path> works without tube transistor');
    assert.equal(classic.exec('ls ..').output.includes('readme.txt'), true, 'classic ls .. lists visible parent files');
    assert.equal(classic.exec('ls ..').output.includes('.spycam'), false, 'classic ls .. hides dotfiles without tube transistor');
    assert.equal(classic.exec('ls ..').output.includes('.poltergeist.lock'), false, 'classic ls .. hides rootkit dotfiles without tube transistor');
    for (const flagCmd of ['ls -a', 'ls -l', 'ls -la', 'ls -la ..']) {
      const gated = classic.exec(flagCmd);
      assert.equal(gated.code, 1, `classic \`${flagCmd}\` is refused without tube transistor`);
      assert.match(gated.stderr ?? '', /Tube Transistor/i);
      assert.equal(gated.events.some((e) => e.type === 'LANTERN_REVEAL'), false, `\`${flagCmd}\` without tube transistor must not emit LANTERN_REVEAL`);
    }
    classic.run.inventory = giveItem(classic.run.inventory, 'tube_transistor');
    assert.equal(classic.exec('ls -l').code, 0, 'classic ls -l works once tube transistor is carried');
    const classicLitSweep = classic.exec('ls -la ..');
    assert.equal(classicLitSweep.code, 0, 'classic ls -la .. works once tube transistor is carried');
    assert.ok(classicLitSweep.output.includes('.spycam'), 'classic ls -la exposes hidden dotfiles once tube transistor is carried');
    assert.equal(classic.exec('map 2').code, 1, 'classic map command is locked before carrying map');
    assert.equal(classic.consumeMapRequest(), null);
    classic.run.inventory = giveItem(classic.run.inventory, 'map');
    assert.equal(classic.exec('map 2').code, 0);
    assert.equal(classic.consumeMapRequest(), '2');
    assert.equal(classic.consumeMapRequest(), null);
    assert.ok(classic.complete('map ').matches.includes('boot'));

    const earlySession = createChapterSession({ chapterId: slug, preview: true });
    earlySession.skipTutorial();
    assert.equal(earlySession.snapshot().inventory.items.includes('map'), false, 'Level 1 does not carry map');
    assert.equal(earlySession.exec('map 4').code, 1, 'map command is locked before Hub #1');

    const session = createChapterSession({ chapterId: slug, startLevelId: 'level-05-task-ui-grid', preview: true });
    session.arriveLevel();
    session.skipOpeningDialog();
    assert.ok(session.snapshot().inventory.items.includes('map'), 'levels after Hub #1 carry map via grants');
    assert.equal(session.exec('hold map').code, 0);
    assert.equal(session.snapshot().inventory.held, 'map');
    assert.ok(session.complete('hold m').matches.includes('map'));
    const mapRes = session.exec('map 4');
    assert.equal(mapRes.code, 0);
    assert.equal(session.consumeMapRequest(), '4');
    assert.equal(session.consumeMapRequest(), null);
    assert.ok(session.complete('map 1').matches.includes('11'));

    assert.equal(runMan(['kiro.d']).code, 0);
    assert.match(runMan(['kiro.d']).stdout, /Unix background daemon/i);
    assert.equal(classic.exec('kiro.d status').code, 0);
    assert.match(classic.exec('kiro.d status').output, /LOCAL UNIX INFERENCE DAEMON/);
    const legalClassic = classic.exec('kiro.d disclaimer');
    assert.equal(legalClassic.code, 0);
    assert.match(legalClassic.output, /Amazon\.com, Inc\./);
    assert.match(legalClassic.output, /reworked into original IP after the hackathon/i);
    const pipedClassic = classic.exec('echo "API_KEY=sk_live_123" | kiro.d');
    assert.equal(pipedClassic.code, 0);
    assert.match(pipedClassic.output, /Leaked live secret detected/);

    assert.equal(session.exec('kiro.d disclaimer').code, 0);
    assert.ok(session.complete('kiro.d ').matches.includes('scan'));
    const lockPack = structuredClone(getChapterPack(slug));
    lockPack.levels[1].script = {
      ...lockPack.levels[1].script,
      locks: [{ command: 'kiro', until: { kind: 'has_item', item: 'tube_transistor' }, message: 'kiro: locked in the dark!' }],
    };
    const lockedA = createChapterSession({ chapterId: slug, pack: structuredClone(lockPack), startLevelId: lockPack.levels[1].id, pidSeed: 42, preview: true });
    const lockedB = createChapterSession({ chapterId: slug, pack: structuredClone(lockPack), startLevelId: lockPack.levels[1].id, pidSeed: 42, preview: true });
    lockedA.arriveLevel();
    lockedB.arriveLevel();
    const kiroLock = lockedA.exec('kiro scan');
    const kirodLock = lockedB.exec('kiro.d scan');
    assert.equal(kiroLock.code, 1);
    assert.equal(kirodLock.code, 1);
    assert.equal(kirodLock.output, kiroLock.output, 'kiro.d must respect script.locks for kiro identically');
  });

  test('chapter map topology key stability and WebGL electricity spark shader + ribbon geometry', () => {
    const chapterManifest = readChapter(slug).manifest;
    const topoA = buildMotherboardTopology(chapterManifest, {}, chapterManifest.levels[0].id);
    const topoB = buildMotherboardTopology(chapterManifest, {}, chapterManifest.levels[0].id);
    const topoC = buildMotherboardTopology(chapterManifest, {}, chapterManifest.levels[1].id);
    assert.equal(chapterMapTopologyKey(topoA), chapterMapTopologyKey(topoB), 'identical state produces identical board key');
    assert.notEqual(chapterMapTopologyKey(topoA), chapterMapTopologyKey(topoC), 'changing current level invalidates board key');

    const vs = buildMapSparkVertexShader();
    const fs = buildMapSparkFragmentShader();
    for (const sym of ['arcHash', 'arcPacket', 'sparkEnergy', 'uTime', 'uResolution', 'aPos', 'aPerp', 'aCross', 'aWire']) {
      assert.ok(vs.includes(sym), `map spark vertex shader missing ${sym}`);
    }
    for (const sym of ['arcPacket', 'sparkEnergy', 'boltNode', 'sdSeg', 'outerYellow', 'brightYellow', 'hotCore', 'gl_FragColor']) {
      assert.ok(fs.includes(sym), `map spark fragment shader missing ${sym}`);
    }
    for (const [name, cfg] of Object.entries(MAP_SPARK_STATES)) {
      assert.equal((cfg.speed * MAP_SPARK_TIME_WRAP_S) % cfg.spacing, 0, `${name} primary spark wrap must be an exact integer cycle`);
      assert.equal((cfg.speed * MAP_SPARK_TIME_WRAP_S) % (cfg.spacing * 0.5), 0, `${name} short-wire primary wrap must be an exact integer cycle`);
      assert.ok(vs.includes(`${cfg.speed}.0`), `${name} primary speed must stay synced with shader GLSL`);
      if (cfg.speed2 > 0) {
        assert.equal((cfg.speed2 * MAP_SPARK_TIME_WRAP_S) % cfg.spacing2, 0, `${name} secondary spark wrap must be an exact integer cycle`);
        assert.equal((cfg.speed2 * MAP_SPARK_TIME_WRAP_S) % (cfg.spacing2 * 0.5), 0, `${name} short-wire secondary wrap must be an exact integer cycle`);
        assert.ok(vs.includes(`${cfg.speed2}.0`), `${name} secondary speed must stay synced with shader GLSL`);
      }
    }

    // CSS transform + border normalization (e.g. cm-dialog-pop scale(0.96) + 4px board border) recovers exact padding-box coords
    const scaledBox = toBoardLocalBox(
      { left: 100 + (4 + 900) * 0.96, right: 100 + (4 + 904) * 0.96, top: 50 + (4 + 600) * 0.96, bottom: 50 + (4 + 604) * 0.96 },
      { left: 100, top: 50, width: 1008 * 0.96, height: 708 * 0.96 },
      1008,
      708,
      4,
      4,
    );
    assert.equal(Math.round(scaledBox.left), 900);
    assert.equal(Math.round(scaledBox.right), 904);
    assert.equal(Math.round(scaledBox.top), 600);
    assert.equal(Math.round(scaledBox.bottom), 604);

    const empty = buildSparkRibbonData([]);
    assert.equal(empty.geom.length, 0);
    assert.equal(empty.indices.length, 0);
    assert.equal(empty.ranges.length, 0);

    const ribbon = buildSparkRibbonData([
      { x1: 10, y1: 20, x2: 490, y2: 20, state: 'active', seed: 0.1 },
      { x1: 50, y1: 50, x2: 50, y2: 50, state: 'powered', seed: 0.2 }, // degenerate zero-length span
      { x1: 20, y1: 30, x2: 20, y2: 180, state: 'standby', seed: 0.7 },
    ]);
    assert.equal(ribbon.ranges.length, 3);
    // Long 480px rail must sample <= 3px per segment so micro-bolts never alias or collapse
    const longRailSegs = ribbon.ranges[0].count / 2 - 1;
    assert.ok(480 / longRailSegs <= 3, `expected <= 3px/seg on 480px rail, got ${(480 / longRailSegs).toFixed(2)}px/seg`);
    assert.equal(ribbon.ranges[1].count, 0, 'degenerate span emits 0 vertices while preserving range index');
    assert.ok(ribbon.ranges[2].count > 0);
    assert.equal(ribbon.wire[ribbon.ranges[0].start * 4 + 3], MAP_SPARK_STATES.active.code);
    assert.equal(ribbon.wire[ribbon.ranges[2].start * 4 + 3], MAP_SPARK_STATES.standby.code);
    // Horizontal span perpendicular should be unit vertical (0, 1)
    assert.equal(Math.round(ribbon.geom[2] * 1000), 0);
    assert.equal(Math.round(ribbon.geom[3] * 1000), 1000);

    assert.equal(patchSparkRibbonStates(ribbon.wire, ribbon.ranges, ['active', 'powered', 'standby']), false, 'no-op state patch returns false');
    assert.equal(patchSparkRibbonStates(ribbon.wire, ribbon.ranges, ['powered', 'off', 'active']), true, 'state change patch returns true');
    assert.equal(ribbon.wire[ribbon.ranges[0].start * 4 + 3], MAP_SPARK_STATES.powered.code);
    assert.equal(ribbon.wire[ribbon.ranges[2].start * 4 + 3], MAP_SPARK_STATES.active.code);
  });
});

console.log(`\nmanual unit: ${count()} tests passed`);
