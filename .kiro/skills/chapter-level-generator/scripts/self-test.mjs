#!/usr/bin/env node
// Comprehensive unit + edge-case self-test for chapter-level-generator, src/chapters/validators.ts,
// src/chapters/catalog.ts, and src/chapters/chapter-session.ts.
import assert from 'node:assert/strict';
import { withProcgen } from '../../../../scripts/harness/lib/load.mjs';

await withProcgen(async (_p, vite) => {
  const validators = await vite.ssrLoadModule('/src/chapters/validators.ts');
  const catalog = await vite.ssrLoadModule('/src/chapters/catalog.ts');
  const achievements = await vite.ssrLoadModule('/src/chapters/achievements.ts');
  const portableSave = await vite.ssrLoadModule('/src/chapters/portable-save.ts');
  const { createChapterSession } = await vite.ssrLoadModule('/src/chapters/chapter-session.ts');

  catalog.resetInMemoryStoresForTest();

  // ---- 1. HTML + CSS Storefront Validator Edge Cases ----
  assert.equal(validators.validateStorefrontHtmlCss('', '').ok, false, 'empty HTML/CSS must fail');

  const brokenHtml = `
    <section class="product-grid">
      <article data-sku="gpu"></article>
      <article data-sku="ram"></article>
      <article data-sku="ssd"></article>
    </section>
    <button id="checkout-btn" class="buy-btn" disabled>BUY</button>
  `;
  const brokenCss = `
    /* .product-grid { display: grid; } */
    .product-grid { display: none; }
    .cart-drawer { width: 0%; z-index: -1; }
  `;
  const vHtmlFail = validators.validateStorefrontHtmlCss(brokenHtml, brokenCss);
  assert.equal(vHtmlFail.ok, false);
  assert.ok(vHtmlFail.errors.some((e) => e.includes('disabled')));
  assert.ok(vHtmlFail.errors.some((e) => e.includes('.product-grid')));
  assert.ok(vHtmlFail.errors.some((e) => e.includes('.cart-drawer')));

  // Unbalanced CSS braces
  assert.equal(
    validators.validateStorefrontHtmlCss(brokenHtml.replace('disabled', ''), '.product-grid { display: grid; ').ok,
    false,
  );

  // Valid HTML + CSS (including unconventional compound selectors, HTML comment with old disabled btn, and omitted width -> auto)
  const unconventionalHtml = `
    <!-- <button id="checkout-btn" disabled>OLD</button> -->
    <section class="product-grid">
      <article data-sku="gpu"></article>
      <article data-sku="ram"></article>
      <article data-sku="ssd"></article>
    </section>
    <button id="checkout-btn" class="buy-btn">BUY</button>
  `;
  const unconventionalCss = `
    main .product-grid { display: flex !important; }
    aside.cart-drawer { min-width: 320px; z-index: 5; }
  `;
  assert.equal(validators.validateStorefrontHtmlCss(unconventionalHtml, unconventionalCss).ok, true);

  // ---- 2. Cart JS Validator Edge Cases ----
  assert.equal(validators.validateCartJs('').ok, false);
  assert.equal(
    validators.validateCartJs('export function computeCartTotal(price, shipping) { return price + shipping; }').ok,
    false,
  );
  assert.equal(
    validators.validateCartJs(
      'export function computeCartTotal(price, shipping, qty = 1) { if (qty <= 0) return 0; return Number(price) + Number(shipping); }',
    ).ok,
    false,
    'ignoring qty > 1 multiplication must fail multi-item test vector',
  );
  // Keeping `// BUG:` comment in valid fixed JS must STILL PASS!
  assert.equal(
    validators.validateCartJs(
      '// BUG: used to concatenate strings\nexport const computeCartTotal = (price, shipping, qty = 1) => qty <= 0 ? 0 : Number(price) * Number(qty) + Number(shipping);',
    ).ok,
    true,
    'valid arrow function with untouched // BUG: comment must pass',
  );

  // ---- 3. Dockerfile Validator Edge Cases ----
  assert.equal(validators.validateDockerfile('').ok, false);
  assert.equal(
    validators.validateDockerfile('FROM node:99-vibe-turbo\nCOPY . .\nEXPOSE 3000\nCMD ["node", "server.js"]').ok,
    false,
  );
  assert.equal(
    validators.validateDockerfile('FROM node:20-alpine\nCOPY . .\nRUN ./cryptominer.sh\nEXPOSE 3000\nCMD ["node", "server.js"]').ok,
    false,
  );
  // Unconventional valid Dockerfile: --platform flag, multi-stage AS alias, EXPOSE 3000/tcp, backslash continuation, shell CMD
  assert.equal(
    validators.validateDockerfile(
      'FROM --platform=linux/amd64 node:22-slim AS runtime\nWORKDIR /app\nCOPY --chown=node:node . .\nRUN npm install \\\n  --omit=dev\nEXPOSE 3000/tcp\nCMD node server.js',
    ).ok,
    true,
  );

  // ---- 4. Docker Compose Validator Edge Cases (2-space, 4-space, indentless lists, inline comments) ----
  assert.equal(validators.validateDockerCompose('').ok, false);
  assert.equal(validators.validateDockerCompose('services:\n\tnginx:\n    image: nginx:alpine').ok, false, 'tabs must fail YAML check');
  const fourSpaceCompose = [
    "version: '3.9'",
    'services:',
    '    nginx:',
    '        image: "nginx:1.27-alpine" # edge proxy',
    '        ports:',
    '        - "0.0.0.0:8080:80/tcp"',
    '    website:',
    '        image: byterig-web:1.0',
    '        environment:',
    '            PAYMENT_URL: "http://payment:4002/charge" # internal DNS',
    '    payment:',
    '        image: byterig-pay:1.0',
    '        environment:',
    '        - PAYMENT_MODE=production',
  ].join('\n');
  assert.equal(validators.validateDockerCompose(fourSpaceCompose).ok, true, '4-space YAML + indentless lists + /tcp + comments must pass');

  // ---- 7. Chapter 01 Kiroween: 11-Level Arc, Scripted Awakening, Kiro Tutorial, Matrix Greybeard Hub & Father Twist ----
  const kiroRealtime = createChapterSession({
    chapterId: 'chapter-01-kiroween',
  });
  // While intro card is active (before arriveLevel), Vibecoder rises alone in dark wires & chips with NO bug and NO Kiro yet
  assert.equal(
    kiroRealtime.snapshot().room.actors.some((a) => a.id === 'kiro'),
    false,
    'Before arriveLevel(), Kiro Ghost must not already be flying around on stage',
  );
  assert.equal(
    kiroRealtime.snapshot().room.actors.some((a) => a.id === 'tutorial_virus_1'),
    false,
    'At Level 1 spawn, tutorial bug must not already be standing on stage',
  );
  assert.equal(kiroRealtime.snapshot().enemiesLeft, 0, 'At Level 1 spawn, HUD enemiesLeft must be 0');
  const arrival = kiroRealtime.arriveLevel();
  // Level 1 opens in the dark: empty pockets (no manual, no map, no lantern, no terminal), opening dialog gate active.
  assert.ok(arrival.output.includes('pitch black'), 'Level 1 must open in the dark');
  assert.ok(arrival.events.some((e) => e.type === 'VIBECODER_EMOTE' && e.emote === 'shock'));
  assert.equal(arrival.snapshot.room.dark, true, 'Without the lantern the room is dark');
  assert.equal(arrival.snapshot.openingDialog, true, 'Level 1 opens with openingDialog gate active until Vibecoder + Kiro finish talking');
  assert.deepEqual(arrival.snapshot.inventory, { items: [], held: null, vram: 0 }, 'He starts empty-handed (no manual, map, lantern, or terminal)');
  const isBox = (e, speaker) => e.type === 'DIALOG_BOX' && e.speaker === speaker;
  const timeline = [];
  const kiroSeen = [];
  const openingStates = [];
  for (let t = 0; t < 70; t++) { // 60 s covers Vibecoder + Kiro's opening briefing, terminal delivery, and Big Four taunt
    const r = kiroRealtime.tick();
    timeline.push(...r.events);
    kiroSeen.push(r.snapshot.room.actors.some((a) => a.id === 'kiro' && a.model === 'npc.kiro_ghost'));
    openingStates.push(Boolean(r.snapshot.openingDialog));
  }
  assert.equal(openingStates[55], true, 'Opening dialog lock stays active while Vibecoder speaks his closing reaction line at 54..60s');
  assert.equal(kiroRealtime.snapshot().openingDialog, false, 'Opening dialog gate unlocks once Vibecoder + Kiro finish talking');
  const firstKiroEventIdx = timeline.findIndex((e) => isBox(e, 'kiro'));
  const lastDialogBoxIdx = timeline.findLastIndex((e) => e.type === 'DIALOG_BOX');
  const clodTauntEventIdx = timeline.findIndex((e) => e.type === 'AGENT_TAUNT' && e.agent === 'clod');
  assert.ok(firstKiroEventIdx >= 2, 'Vibecoder speaks before Kiro glides in');
  assert.ok(clodTauntEventIdx > lastDialogBoxIdx, 'Big Four (Clod) taunts ONLY AFTER every Vibecoder and Kiro opening dialog box has fired');
  const kiroLines = timeline.filter((e) => isBox(e, 'kiro')).map((e) => e.text).join(' ');
  assert.equal(/MAX HEALTH|REVIVE/i.test(kiroLines), false, 'Tutorial opening dialog must NOT explain RAM (Max HP) or SSD (Revive) before first pickup');
  assert.ok(/CHAPTER MISSION|open-weight/i.test(kiroLines), 'Kiro explains the whole-chapter mission');
  assert.ok(/Tube Transistor/i.test(kiroLines), 'Kiro explains the Tube Transistor ls -la lock');
  assert.ok(timeline.some((e) => e.type === 'ENTITY_SPAWNED' && e.entityId === 'kiro' && e.entrance === 'glide'), 'Kiro glides in');
  assert.ok(timeline.some((e) => e.type === 'ITEM_CARRIED' && e.item === 'terminal'), 'Kiro carries the terminal over');
  assert.ok(timeline.some((e) => e.type === 'ITEM_GIVEN' && e.item === 'terminal' && e.held === true), 'Kiro delivers the terminal into his hand');
  assert.equal(kiroRealtime.snapshot().inventory.held, 'terminal', 'After the timed script on Level 1, Vibecoder holds the terminal');
  assert.equal(kiroSeen[5], false, 'Kiro is not on stage before his entrance');
  assert.equal(kiroSeen[15], false, 'Kiro is not on stage yet during Vibecoder shout');
  assert.equal(kiroSeen[kiroSeen.length - 1], true, 'After the entrance, Kiro Ghost (npc.kiro_ghost) is on stage');
  // Even after real-time ticks in Level 1 Tutorial, player takes 0 damage (tutorial truce)
  const startHp = kiroRealtime.snapshot().hp;
  for (let t = 0; t < 15; t++) {
    kiroRealtime.tick();
  }
  assert.equal(kiroRealtime.snapshot().hp, startHp, 'Level 1 tutorial truce must prevent any bug damage');
  // `ls` flags (`-a`, `-l`, `-la`), `manual`, and `map` are disabled before their items are obtained, while basic `ls` works!
  for (const gated of ['ls -a', 'ls -l', 'ls -la']) {
    const r = kiroRealtime.exec(gated);
    assert.equal(r.code, 1, `${gated} must be disabled on Level 1 before obtaining the Tube Transistor`);
    assert.match(r.stderr ?? r.output, /Tube Transistor/i, `${gated} refusal mentions Tube Transistor`);
  }
  assert.equal(kiroRealtime.exec('manual').code, 1, 'manual must be disabled before Dad gives it at Hub #1');
  assert.equal(kiroRealtime.exec('map').code, 1, 'map must be disabled before Dad gives it at Hub #1');
  // Level 1 teaches the 6 core shell commands in order starting with basic `ls`: ls -> mv -> cat -> ps -> kill -> cd hub_uplink
  const stepLs = kiroRealtime.exec('ls');
  assert.equal(stepLs.code, 0, 'basic ls works on Level 1 before obtaining the Tube Transistor');
  assert.ok(stepLs.output.includes('kiro_story.txt') && stepLs.output.includes('starter_ram_8gb.dimm'), 'basic ls lists visible files on Level 1');
  assert.equal(stepLs.output.includes('glitch_spark.exe'), false, 'basic ls keeps hidden tutorial bug hidden');
  assert.equal(stepLs.snapshot.tutorial?.step, 2);
  assert.equal(stepLs.snapshot.tutorial?.command, 'mv starter_ram_8gb.dimm ~');
  const stepMv = kiroRealtime.exec('mv starter_ram_8gb.dimm ~');
  assert.ok(
    stepMv.events.some((e) => isBox(e, 'kiro') && /MAX HEALTH|\+10 Max HP/i.test(e.text)) &&
      stepMv.events.some((e) => isBox(e, 'vibecoder') && /RAM/i.test(e.text)),
    'First-ever RAM pickup triggers Kiro.d + Vibecoder RAM explanation dialog',
  );
  assert.equal(stepMv.events.some((e) => e.type === 'DIALOG_BOX' && /SSD|REVIVE/i.test(e.text)), false, 'First RAM pickup must NOT show SSD dialog');
  assert.equal(stepMv.snapshot.tutorial?.step, 3);
  assert.equal(stepMv.snapshot.tutorial?.command, 'cat kiro_story.txt');
  const stepCat = kiroRealtime.exec('cat kiro_story.txt');
  assert.equal(stepCat.snapshot.tutorial?.step, 4);
  assert.equal(stepCat.snapshot.tutorial?.command, 'ps');
  assert.ok(
    stepCat.snapshot.room.actors.some((a) => a.id === 'tutorial_virus_1'),
    'Tutorial bug phases onto stage once player reaches the ps step',
  );
  const stepPs = kiroRealtime.exec('ps');
  assert.equal(stepPs.snapshot.tutorial?.step, 5);
  const tutorialPid = kiroRealtime.rt.pids.get('tutorial_virus_1');
  assert.ok(tutorialPid >= 1100 && tutorialPid <= 8899 && tutorialPid !== 1011, `the tutorial PID is random, got ${tutorialPid}`);
  assert.equal(stepPs.snapshot.tutorial?.command, `kill -9 ${tutorialPid}`);
  const stepKill = kiroRealtime.exec(`kill -9 ${tutorialPid}`);
  assert.equal(stepKill.snapshot.tutorial?.step, 6);
  assert.equal(stepKill.snapshot.tutorial?.command, 'cd hub_uplink');
  assert.equal(
    stepKill.snapshot.room.actors.some((a) => a.id === 'kiro'),
    false,
    'Once Level 1 tutorial commands are done, Kiro Ghost goes ahead to the Hub',
  );

  // Level 2 opening dialog -> Big Four taunt -> turn-based battle start, visible gargoyle enemy, Tube Transistor drops on ground after petrification, SSD replaces tensor image!
  const l2 = createChapterSession({ chapterId: 'chapter-01-kiroween', startLevelId: 'level-02-task-ram-heist' });
  const l2Arrival = l2.arriveLevel();
  assert.deepEqual(l2Arrival.snapshot.inventory, { items: ['terminal'], held: 'terminal', vram: 0 }, 'Level 2 opens carrying only the terminal');
  assert.equal(l2Arrival.snapshot.openingDialog, true, 'Level 2 holds terminal & battle until Vibecoder + Kiro finish talking');
  assert.equal(l2Arrival.snapshot.battle, null, 'Battle does NOT begin before opening dialog finishes');
  assert.ok(
    l2Arrival.snapshot.room.actors.some((a) => a.id === 'trojan_l2' && !a.hidden),
    'Level 2 features a visible Big Four gargoyle minion (`trojan_l2`), not an invisible enemy',
  );
  assert.equal(
    l2Arrival.snapshot.room.actors.some((a) => a.id === 'pickup_l2_transistor'),
    false,
    'Tube Transistor must stay hidden before trojan_l2 is petrified',
  );
  assert.ok(
    l2Arrival.snapshot.room.actors.some((a) => a.id === 'pickup_l2_ssd' && a.model === 'pickup.ssd'),
    'Level 2 SSD disk uses pickup.ssd model (replacing tensor GPU image)',
  );
  const l2Ticks = [];
  for (let t = 0; t < 36; t++) {
    if (t < 35) assert.equal(l2.snapshot().battle, null, 'Battle stays held during opening dialog ticks');
    l2Ticks.push(...l2.tick().events);
  }
  assert.equal(l2.snapshot().openingDialog, false, 'Opening dialog completes at openingSec');
  const l2KiroText = l2Ticks.filter((e) => isBox(e, 'kiro')).map((e) => e.text).join(' ');
  assert.ok(/DANGEROUS/i.test(l2KiroText) && /TURN-BASED BATTLE/i.test(l2KiroText) && /30s/i.test(l2KiroText), 'Kiro explains battle danger, turn rules, and 30s timer');
  assert.equal(/MAX HEALTH|REVIVE/i.test(l2KiroText), false, 'Level 2 opening dialog does not spoil RAM/SSD effects before first pickup');
  assert.ok(l2Arrival.output.includes('vault_notes.txt') && l2KiroText.includes('vault_notes.txt'), 'Level 2 names vault_notes.txt without needing ls');
  assert.ok(l2Ticks.some((e) => e.type === 'BATTLE_STARTED' && e.agent === 'antigravy'), 'When Level 2 dialog finishes, Anti-Gravy taunts and battle begins immediately');
  assert.equal(l2.snapshot().battle?.phase, 'intro', 'Level 2 enters battle intro right after opening dialog');
  const l2BasicLs = l2.exec('ls');
  assert.equal(l2BasicLs.code, 0, 'basic ls works on Level 2 without the Tube Transistor');
  assert.ok(l2BasicLs.output.includes('vault_notes.txt') && l2BasicLs.output.includes('ssd_256gb.img'), 'Level 2 basic ls lists vault_notes.txt and ssd_256gb.img');
  assert.equal(l2BasicLs.output.includes('tube_transistor'), false, 'tube_transistor is hidden from ls before petrification');
  assert.equal(l2BasicLs.output.includes('.vault_beacon'), false, '.vault_beacon is hidden from plain ls');
  assert.equal(l2.exec('ls tube_transistor').code, 1, 'ls tube_transistor must not leak hidden appearWhen pickup before petrification');
  assert.equal(l2.exec('edit tube_transistor').code, 1, 'edit tube_transistor must not open hidden appearWhen pickup before petrification');
  assert.equal(l2.exec('touch tube_transistor').code, 1, 'touch tube_transistor must not leak hidden appearWhen pickup before petrification');
  assert.equal(l2.exec('echo hack > tube_transistor').code, 1, 'redirect must not overwrite hidden appearWhen pickup before petrification');
  assert.equal(l2.exec('mv tube_transistor ~').code, 1, 'cannot grab tube_transistor before petrifying trojan_l2');
  assert.equal(l2.exec('ls -la').code, 1, 'ls -la remains locked on Level 2 until grabbing the Tube Transistor');
  assert.equal(l2.exec('ls -l').code, 1, 'ls -l remains locked on Level 2 until grabbing the Tube Transistor');

  // Also test `skipOpeningDialog()` (`Skip Dialog »` button) jumping straight past the opening conversation into battle!
  const l2SkipSess = createChapterSession({ chapterId: 'chapter-01-kiroween', startLevelId: 'level-02-task-ram-heist' });
  l2SkipSess.arriveLevel();
  const l2Skip = l2SkipSess.skipOpeningDialog();
  assert.ok(l2Skip, 'skipOpeningDialog() skips the opening conversation cleanly');
  assert.equal(l2Skip.snapshot.openingDialog, false);
  assert.equal(l2Skip.events.some((e) => e.type === 'DIALOG_BOX'), false, 'skipOpeningDialog() discards unread opening dialog boxes');
  assert.ok(l2Skip.events.some((e) => e.type === 'BATTLE_STARTED' && e.agent === 'antigravy'), 'skipOpeningDialog() immediately starts the Big Four battle');

  // Level 3 opens with the Tube Transistor, `ls -la` & `ls` flags unlocked, ALL 3 enemies hidden until `ls -la` + `.transistor_rune` riddle!
  const l3 = createChapterSession({ chapterId: 'chapter-01-kiroween', startLevelId: 'level-03-task-gpu-salvage' });
  const l3Arrival = l3.arriveLevel();
  assert.deepEqual(l3Arrival.snapshot.inventory, { items: ['terminal', 'tube_transistor'], held: 'tube_transistor', vram: 0 }, 'Level 3 opens holding the Tube Transistor');
  assert.equal(l3Arrival.snapshot.room.dark, false, 'Level 3 is lit by the Tube Transistor');
  const l3HiddenBefore = l3Arrival.snapshot.room.actors.filter((a) => a.kind === 'enemy');
  assert.ok(l3HiddenBefore.length >= 3 && l3HiddenBefore.every((a) => a.state === 'hidden' && (a.alpha ?? 1) < 0.1), 'All 3 enemies on Level 3 start hidden until ls -la');
  l3.skipOpeningDialog();
  assert.equal(l3.snapshot().battle?.phase, 'intro', 'Level 3 starts Codec battle right after opening dialog');
  const l3PlainLs = l3.exec('ls');
  assert.equal(l3PlainLs.output.includes('.codec_spycam') || l3PlainLs.output.includes('.keygen.exe'), false, 'plain ls on Level 3 does not reveal hidden enemies');
  const l3Sweep = l3.exec('ls -la');
  assert.equal(l3Sweep.code, 0, 'ls -la works on Level 3 with the Tube Transistor');
  assert.ok(
    l3Sweep.output.includes('.codec_spycam') && l3Sweep.output.includes('.keygen.exe') && l3Sweep.output.includes('.transistor_rune'),
    'ls -la exposes hidden enemies and riddle dotfile on Level 3',
  );
  const l3AfterSweepEnemies = l3Sweep.snapshot.room.actors.filter((a) => a.kind === 'enemy');
  assert.ok(l3AfterSweepEnemies.length >= 3 && l3AfterSweepEnemies.every((a) => a.state !== 'hidden' && (a.alpha ?? 1) === 1), 'ls -la reveals all 3 hidden enemies on stage (including worm_l3)');
  assert.ok(
    l3Sweep.events.some((e) => isBox(e, 'vibecoder')) && l3Sweep.events.some((e) => isBox(e, 'kiro')),
    'ls -la on Level 3 triggers Vibecoder + Kiro.d reaction dialogs',
  );
  const l3Riddle = l3.exec('echo warm_filament > transistor_gate.sock');
  assert.equal(l3Riddle.code, 0, 'Solving transistor_gate.sock with the dotfile rune succeeds');
  assert.equal(
    l3.getChecklist().find((c) => c.description.includes('transistor_gate.sock'))?.done,
    true,
    'riddle_solved winRule marks transistor_gate.sock complete',
  );

  // Subdir `ls -la port_445` on a fresh Level 3 must also reveal hidden worm_l3 inside port_445.
  const l3Sub = createChapterSession({ chapterId: 'chapter-01-kiroween', startLevelId: 'level-03-task-gpu-salvage' });
  l3Sub.arriveLevel();
  l3Sub.skipOpeningDialog();
  const l3SubSweep = l3Sub.exec('ls -la port_445');
  assert.equal(l3SubSweep.code, 0, 'ls -la port_445 succeeds with Tube Transistor');
  assert.ok(l3SubSweep.events.some((e) => e.type === 'LANTERN_REVEAL'), 'ls -la port_445 emits LANTERN_REVEAL');
  const wormAfterSub = l3SubSweep.snapshot.room.actors.find((a) => a.id === 'worm_l3');
  assert.ok(wormAfterSub && wormAfterSub.state !== 'hidden' && (wormAfterSub.alpha ?? 1) === 1, 'ls -la port_445 reveals hidden worm_l3');

  const kiroChap = createChapterSession({
    chapterId: 'chapter-01-kiroween',
  });
  kiroChap.skipIntro();
  assert.equal(kiroChap.getLevels().length, 11, 'chapter-01-kiroween must have 11 executable levels');
  assert.equal(kiroChap.getCurrentLevel().id, 'level-01-tutorial-awakening');
  assert.equal(kiroChap.exec('ls -la').code, 1, 'ls -la locked on Level 1 without Tube Transistor');
  const kiroL1Ls = kiroChap.exec('ls');
  assert.equal(kiroL1Ls.code, 0, 'basic ls works on Level 1');
  assert.ok(kiroL1Ls.output.includes('kiro_story.txt'));
  const l1RamCollect = kiroChap.exec('mv starter_ram_8gb.dimm ~');
  assert.ok(l1RamCollect.output.includes('[COLLECTED]'));
  assert.ok(l1RamCollect.events.some((e) => isBox(e, 'kiro') && /MAXIMUM HEALTH|\+10 Max HP/i.test(e.text)), 'Level 1 first RAM pickup shows RAM dialog');
  assert.ok(kiroChap.exec('cat kiro_story.txt').output.includes('CHAPTER MISSION'));
  assert.ok(kiroChap.exec('ps').output.includes(String(kiroChap.rt.pids.get('tutorial_virus_1'))));
  const killProbe = kiroChap.exec('kill -9 {pid:tutorial_virus_1}');
  assert.equal(killProbe.snapshot.enemiesLeft, 0);
  assert.ok(killProbe.output.includes('hub_uplink'));
  kiroChap.exec('cd hub_uplink');
  assert.equal(kiroChap.getCurrentLevel().id, 'level-02-task-ram-heist');
  assert.equal(kiroChap.snapshot().inventory.held, 'terminal', 'Level 2 grants and holds the terminal');
  assert.ok(!kiroChap.snapshot().inventory.items.includes('tube_transistor'), 'Level 2 does not carry the Tube Transistor yet');
  assert.equal(kiroChap.exec('ls -la').code, 1, 'ls -la locked on Level 2 before grabbing the Tube Transistor');
  assert.equal(
    kiroChap.snapshot().room.actors.some((a) => a.id === 'kiro'),
    false,
    'Kiro is waiting at the Hub during Levels 2 & 3',
  );
  kiroChap.exec('cat vault_notes.txt');
  const petrifyRes = kiroChap.exec('chmod -x gravy_sentry.bin');
  assert.ok(
    petrifyRes.events.some((e) => e.type === 'ENTITY_SPAWNED' && e.entityId === 'pickup_l2_transistor' && e.model === 'item.tube_transistor' && e.reason === 'script'),
    'Petrifying gravy_sentry.bin drops item.tube_transistor onto the ground',
  );
  assert.ok(
    petrifyRes.snapshot.room.actors.some((a) => a.id === 'pickup_l2_transistor' && a.model === 'item.tube_transistor'),
    'Fallen Tube Transistor appears on the stage floor',
  );
  assert.ok(
    petrifyRes.events.some((e) => isBox(e, 'vibecoder') && /ground/i.test(e.text)) &&
      petrifyRes.events.some((e) => isBox(e, 'kiro') && /mv tube_transistor ~/i.test(e.text)),
    'Petrifying trojan_l2 triggers Vibecoder + Kiro.d ground-drop dialogs',
  );
  // Inventory gear pickups cannot be deleted, trashed to /dev/null, or renamed away to bypass file_absent.
  assert.equal(kiroChap.exec('rm tube_transistor').code, 1, 'rm tube_transistor must be refused so the player cannot destroy their gear');
  assert.equal(kiroChap.exec('mv tube_transistor /dev/null').code, 1, 'mv tube_transistor /dev/null must be refused');
  assert.equal(kiroChap.exec('mv tube_transistor renamed_tube').code, 1, 'renaming tube_transistor must be refused');
  assert.equal(kiroChap.snapshot().inventory.items.includes('tube_transistor'), false, 'failed rm/mv must not grant tube_transistor');
  const grabTransistor = kiroChap.exec('mv tube_transistor ~');
  assert.equal(grabTransistor.code, 0, 'mv tube_transistor ~ grabs the Tube Transistor off the ground');
  assert.ok(grabTransistor.events.some((e) => e.type === 'PICKUP_COLLECTED' && e.item === 'tube_transistor'), 'Grabbing Tube Transistor emits PICKUP_COLLECTED');
  assert.equal(grabTransistor.snapshot.inventory.held, 'tube_transistor', 'Vibecoder immediately holds the Tube Transistor');
  assert.equal(grabTransistor.snapshot.room.dark, false, 'Tube Transistor immediately lights up Cache Vault');
  assert.ok(
    grabTransistor.events.some((e) => isBox(e, 'vibecoder')) &&
      grabTransistor.events.some((e) => isBox(e, 'kiro') && /ls -la/i.test(e.text)),
    'Grabbing Tube Transistor triggers Vibecoder + Kiro.d dialogs encouraging ls -la',
  );
  const l2Sweep = kiroChap.exec('ls -la');
  assert.equal(l2Sweep.code, 0, 'ls -la unlocks immediately after grabbing the Tube Transistor');
  assert.ok(l2Sweep.output.includes('.vault_beacon'), 'ls -la reveals .vault_beacon on Level 2');
  assert.ok(
    l2Sweep.events.some((e) => isBox(e, 'vibecoder') && /\.vault_beacon/i.test(e.text)) &&
      l2Sweep.events.some((e) => isBox(e, 'kiro') && /gpu_alley/i.test(e.text)),
    'Running ls -la on Level 2 triggers Vibecoder + Kiro.d reaction dialogs warning about Level 3',
  );
  assert.equal(kiroChap.exec('ls -l').code, 0, 'ls -l unlocks immediately after grabbing the Tube Transistor');
  const l2RamCollect = kiroChap.exec('mv ram_16gb.dimm ~');
  assert.equal(
    l2RamCollect.events.some((e) => isBox(e, 'kiro') && /MAXIMUM HEALTH|\+10 Max HP/i.test(e.text)),
    false,
    'Second RAM pickup must NOT repeat the first-time RAM dialog',
  );
  const ssdCollect = kiroChap.exec('mv ssd_256gb.img ~');
  assert.equal(ssdCollect.output.includes('Local GPU Tensor Chip'), false, 'Level 2 SSD disk is an SSD pickup, not a GPU Tensor Chip');
  assert.ok(
    ssdCollect.events.some((e) => isBox(e, 'kiro') && /REVIVE/i.test(e.text)) &&
      ssdCollect.events.some((e) => isBox(e, 'vibecoder') && /SSD/i.test(e.text)),
    'First-ever SSD pickup triggers Kiro.d + Vibecoder SSD explanation dialog',
  );
  const l2Clear = kiroChap.exec('cd gpu_alley');
  assert.equal(kiroChap.getCurrentLevel().id, 'level-03-task-gpu-salvage');
  assert.equal(l2Clear.events.some((e) => e.type === 'ITEM_GIVEN' && e.item === 'tube_transistor'), false, 'Stepping into Level 3 does not double-emit Tube Transistor');
  assert.equal(kiroChap.snapshot().inventory.held, 'tube_transistor', 'Vibecoder holds the Tube Transistor entering Level 3');
  const l3SecondSsd = kiroChap.exec('mv gpu_shader_core_01.img ~');
  assert.equal(
    l3SecondSsd.events.some((e) => isBox(e, 'kiro') && /REVIVE/i.test(e.text)),
    false,
    'Second SSD pickup must NOT repeat the first-time SSD dialog',
  );

  // Jump to Hub 1 (Level 4): verify Dad gifts map + manual on first Hub enter, unlocks ACH_FIELD_MANUAL, and kiro load qwen disables ANTI-GRAVY
  assert.equal(achievements.isManualUnlocked(), false, 'Field Manual is locked before Hub 1');
  kiroChap.jumpToLevel('level-04-hub-model-one');
  const hub1Arr = kiroChap.arriveLevel();
  assert.equal(hub1Arr.events.some((e) => e.type === 'OBSTACLE_DIALOGUE_RENDERED'), false, 'Hub 1 arrival does not pop a stuck 3D socket balloon');
  assert.equal(kiroChap.snapshot().inventory.items.includes('map'), false, 'Before Hub 1 dialog finishes, Vibecoder does not have map yet');
  assert.equal(kiroChap.snapshot().inventory.items.includes('manual'), false, 'Before Hub 1 dialog finishes, Vibecoder does not have manual yet');
  const hub1Skip = kiroChap.skipOpeningDialog();
  assert.ok(hub1Skip.events.some((e) => e.type === 'ITEM_GIVEN' && e.item === 'map'), 'Old Bearded Coder gives map at Hub 1');
  assert.ok(hub1Skip.events.some((e) => e.type === 'ITEM_GIVEN' && e.item === 'manual'), 'Old Bearded Coder gives manual at Hub 1');
  assert.ok(hub1Skip.output.includes('[ITEM RECEIVED] Obtained MAP') && hub1Skip.output.includes('[ITEM RECEIVED] Obtained MANUAL'), 'Hub 1 skipOpeningDialog prints terminal item announcements');
  assert.ok(hub1Skip.events.some((e) => e.type === 'ACHIEVEMENT_UNLOCKED' && e.id === 'field_manual'), 'Receiving manual unlocks ACH_FIELD_MANUAL');
  assert.equal(achievements.isManualUnlocked(), true, 'Field Manual is unlocked on landing/standalone after Hub 1');

  // Verify replay of Hub 1 when ACH_FIELD_MANUAL is already unlocked still announces map + manual,
  // Hub 2 & Hub 3 include Vibecoder + Dad + Kiro before Big Four taunt without arrival socket balloons,
  // and Level 6 plays opening dialog even if entered already holding `laptop`.
  {
    const hub1Replay = createChapterSession({ chapterId: 'chapter-01-kiroween', startLevelId: 'level-04-hub-model-one' });
    hub1Replay.arriveLevel();
    const replaySkip = hub1Replay.skipOpeningDialog();
    assert.ok(replaySkip.output.includes('[ITEM RECEIVED] Obtained MAP') && replaySkip.output.includes('[ITEM RECEIVED] Obtained MANUAL'), 'Hub 1 replay still prints MAP and MANUAL item receipts when achievement is already unlocked');

    for (const [hubId, expectedFoe] of [['level-07-hub-model-two', 'codec'], ['level-10-hub-model-three', 'gork']]) {
      const hs = createChapterSession({ chapterId: 'chapter-01-kiroween', startLevelId: hubId });
      const harr = hs.arriveLevel();
      assert.equal(harr.events.some((e) => e.type === 'OBSTACLE_DIALOGUE_RENDERED'), false, `${hubId} arrival emits no 3D socket balloon`);
      const hEvents = [];
      for (let t = 0; t < 24; t++) hEvents.push(...hs.tick().events);
      assert.equal(hs.snapshot().openingDialog, false, `${hubId} opening dialog finishes at openingSec`);
      for (const sp of ['vibecoder', 'dad', 'kiro']) {
        assert.ok(hEvents.some((e) => isBox(e, sp)), `${hubId} opening conversation includes ${sp}`);
      }
      assert.ok(hEvents.some((e) => e.type === 'AGENT_TAUNT' && e.agent === expectedFoe), `${hubId} emits ${expectedFoe} taunt when opening dialog finishes`);
    }

    const l6WithLaptop = createChapterSession({ chapterId: 'chapter-01-kiroween', startLevelId: 'level-06-task-logic-purge' });
    l6WithLaptop.arriveLevel();
    l6WithLaptop.inventory = { items: [...l6WithLaptop.inventory.items, 'laptop'], held: 'laptop' };
    const l6Events = [];
    for (let t = 0; t < 18; t++) l6Events.push(...l6WithLaptop.tick().events);
    assert.ok(l6Events.some((e) => isBox(e, 'vibecoder')) && l6Events.some((e) => isBox(e, 'kiro')), 'Level 6 still plays Vibecoder + Kiro opening dialog when already holding laptop');
  }
  assert.ok(
    kiroChap.snapshot().room.actors.some((a) => a.model === 'npc.greybeard_rig'),
    'Hub room must render npc.greybeard_rig for dad.tty.sock',
  );
  // Before running `kiro load qwen`, the `kiro_loaded` winRule must NOT be satisfied!
  assert.equal(
    kiroChap.getChecklist().find((c) => c.description.includes('kiro load qwen'))?.done,
    false,
    'Hub 1 kiro_loaded rule must be false before running kiro load qwen',
  );
  assert.ok(kiroChap.exec('cat server_rack.conf').output.includes('Are you a god'));
  const dadOut = kiroChap.exec('dad').output;
  assert.ok(dadOut.includes('Motherboard Map') && dadOut.includes('Field Manual'));
  // Attempting to exit before `kiro load qwen` must fail with gate locked!
  assert.ok(kiroChap.exec('cd sector_ui_grid').output.includes('Sector gate locked'));
  // Loading an out-of-order core (`llama`) in Hub 1 must NOT satisfy `kiro_loaded: "qwen"` or emit Hub 3's banner!
  const wrongHubCore = kiroChap.exec('kiro load llama');
  assert.ok(
    wrongHubCore.output.includes('kiro load qwen') && !wrongHubCore.output.includes('GORK DISABLED'),
    'Out-of-order kiro load in Hub 1 must prompt for kiro load qwen',
  );
  assert.equal(
    kiroChap.getChecklist().find((c) => c.description.includes('kiro load qwen'))?.done,
    false,
  );
  const hubReboot1 = kiroChap.exec('kiro load qwen');
  assert.ok(hubReboot1.output.includes('ANTI-GRAVY DISABLED'));
  assert.equal(
    kiroChap.getChecklist().find((c) => c.description.includes('kiro load qwen'))?.done,
    true,
  );

  // Verify interactive `edit` modal (`readEditableFile` + patch chips + `saveEditableFile`) on Levels 5, 6, 8, 9
  kiroChap.jumpToLevel('level-05-task-ui-grid');
  assert.ok(kiroChap.exec('dad').output.includes('storefront.css'));
  assert.ok(kiroChap.exec('dad').output.includes('#checkout-btn'));
  assert.ok(kiroChap.exec('dad').output.includes("sed -i 's/ disabled//' index.html"));
  const editCss = kiroChap.readEditableFile('storefront.css');
  assert.equal(editCss.ok, true);
  const patchedCss = editCss.content.replace(editCss.patches[0].find, editCss.patches[0].replace);
  assert.ok(kiroChap.saveEditableFile('storefront.css', patchedCss).output.includes('[SAVED]'));
  const editHtml = kiroChap.readEditableFile('index.html');
  assert.equal(editHtml.ok, true);
  const patchedHtml = editHtml.content.replace(editHtml.patches[0].find, editHtml.patches[0].replace);
  assert.ok(kiroChap.saveEditableFile('index.html', patchedHtml).output.includes('200 OK'));
  kiroChap.exec('mv gpu_tensor_chip_02.img ~');
  kiroChap.exec('mv ram_16gb.dimm ~');
  kiroChap.exec('cd logic_cell');
  assert.equal(kiroChap.getCurrentLevel().id, 'level-06-task-logic-purge');
  assert.ok(kiroChap.exec('edit cart.js').output.includes('laptop'), 'edit is locked on Level 6 until the laptop is taken');
  assert.ok(kiroChap.exec("sed -i 's/foo/bar/' cart.js").output.includes('laptop'), 'sed is locked on Level 6 until the laptop is taken');
  const laptopPick = kiroChap.exec('mv laptop ~');
  assert.ok(laptopPick.output.includes('[COLLECTED]'), 'mv laptop ~ collects the laptop on Level 6');
  assert.equal(laptopPick.snapshot.inventory.held, 'laptop', 'Level 6 holds the laptop after pickup');
  const editCart = kiroChap.readEditableFile('cart.js');
  assert.equal(editCart.ok, true, 'edit works once laptop is held');

  // Jump to Hub 2 (Level 7) & Hub 3 (Level 10): verify DeepSeek disables Codec and Llama disables Gork
  kiroChap.jumpToLevel('level-07-hub-model-two');
  assert.ok(kiroChap.exec('kiro load deepseek').output.includes('CODEC DISABLED'));
  kiroChap.jumpToLevel('level-10-hub-model-three');
  const hubReboot3 = kiroChap.exec('kiro load llama');
  assert.ok(hubReboot3.output.includes('GORK DISABLED') && hubReboot3.output.includes('Only CLOD survives'));

  // Jump to Level 11 Boss: verify Clod supervisor cameo on stage, zero actor overlaps, Kiro advisor inspect, and Father twist on exit
  kiroChap.jumpToLevel('level-11-boss-clod-core');
  const bossActors = kiroChap.snapshot().room.actors;
  assert.ok(
    bossActors.some((a) => a.model === 'agent.clod'),
    'Boss room must render agent.clod alongside boss.kernel',
  );
  // Check that no two ground actors in Level 11 overlap in x
  const groundActors = bossActors.filter((a) => a.id !== 'kiro');
  for (let i = 0; i < groundActors.length; i++) {
    for (let j = i + 1; j < groundActors.length; j++) {
      const dx = Math.abs(groundActors[i].x - groundActors[j].x);
      assert.ok(
        dx >= 0.35,
        `Boss room actors ${groundActors[i].id} (x=${groundActors[i].x}) and ${groundActors[j].id} (x=${groundActors[j].x}) overlap (dx=${dx})`,
      );
    }
  }
  // Verify Kiro Advisor inspects all 3 Boss files accurately
  assert.ok(kiroChap.exec('kiro inspect clod_prompt_flood.stream').output.includes('/dev/null'));
  assert.ok(kiroChap.exec('kiro inspect open_weights_advisor.log').output.includes('OPEN_WEIGHT_SIG='));
  assert.ok(kiroChap.exec('kiro inspect core_anchor.conf').output.includes('clod_supervisor_lock=false'));
  assert.ok(kiroChap.exec('exit').output.includes('Clod & Kernel Overlord'));
  kiroChap.exec('cat clod_prompt_flood.stream > /dev/null');
  kiroChap.exec('grep OPEN_WEIGHT_SIG open_weights_advisor.log > kiro_override.sock');
  kiroChap.exec("sed -i 's/clod_supervisor_lock=true/clod_supervisor_lock=false/' core_anchor.conf");
  assert.ok(kiroChap.exec('kill -9 1').output.includes('Clod & Kernel Overlord'));

  // Kiro parody & non-affiliation notice (`kiro disclaimer`, `kiro legal`, and `kiro` status footer).
  assert.ok(kiroChap.exec('kiro').output.includes('kiro disclaimer'), 'kiro status must list kiro disclaimer');
  for (const alias of ['kiro disclaimer', 'kiro legal']) {
    const disc = kiroChap.exec(alias);
    assert.equal(disc.code, 0, `${alias} must exit 0`);
    for (const needle of ['PARODY & NON-AFFILIATION NOTICE', 'Anti-Gravy', 'Codec', 'Gork', 'Clod', 'no real AI brands']) {
      assert.ok((disc.output + disc.events.map((e) => ('text' in e ? e.text : '')).join('\n')).includes(needle), `${alias} missing ${needle}`);
    }
  }

  const kiroExit = kiroChap.exec('exit');
  assert.equal(kiroExit.snapshot.ended, true);
  assert.ok(kiroExit.output.includes('CLOD ESCAPES'));
  assert.ok(kiroExit.output.includes('I am your father'));
  assert.ok(kiroExit.output.includes('NOOOO'));
  assert.ok(kiroExit.output.includes('12 hours a day, 7 days a week'));
  assert.ok(kiroExit.output.includes('Work/Life Balance'));
  assert.ok(
    kiroExit.snapshot.room.actors.some((a) => a.id === 'father:outro' && a.model === 'npc.greybeard_rig'),
    'Real-world ending must include Father (npc.greybeard_rig) alongside Vibecoder',
  );

  // Chapter-declared codex cards come from the manifest, not from code.
  const dossier = catalog.dossierOf(catalog.getChapterManifest('chapter-01-kiroween'));
  assert.ok(dossier.some((d) => d.id === 'dad.tty'), 'manifest.dossier must add the chapter ally to the bestiary');
  assert.ok(!catalog.BESTIARY_DOSSIER.some((d) => d.id === 'dad.tty'), 'the shared bestiary must not name a chapter ally');

  // ---- 8. Local Achievements (1:1 Steamworks ACH_*), Preview Isolation & Portable Save Bundle Edge Cases ----
  const achAfterRun = achievements.readAchievements();
  for (const expectedId of ['first_boot', 'sigkill_hunter', 'field_manual', 'open_weights_init', 'big_four_silenced', 'campaign_clear']) {
    assert.ok(achAfterRun.unlocked[expectedId], `Expected achievement "${expectedId}" to be unlocked during campaign run`);
    assert.match(achAfterRun.unlocked[expectedId].steamApiName, /^ACH_[A-Z0-9_]+$/);
  }
  assert.equal(
    achAfterRun.unlocked.zero_panic_run,
    undefined,
    'zero_panic_run must NOT unlock when levels were skipped via jumpToLevel()',
  );

  // Verify full 11-level 0-death S-rank playthrough unlocks all 12 non-chaos/non-workshop/non-energy achievements (including full_loadout & zero_panic_run)
  catalog.resetInMemoryStoresForTest();
  const fullRunSession = createChapterSession({ chapterId: 'chapter-01-kiroween' });
  fullRunSession.skipIntro();
  for (const lvl of catalog.getChapterLevels('chapter-01-kiroween')) {
    for (const cmd of lvl.solutionCommands) {
      fullRunSession.exec(cmd);
    }
  }
  const fullRunAch = achievements.readAchievements();
  for (const expectedId of [
    'first_boot',
    'lantern_sweep',
    'sigkill_hunter',
    'stone_cold_chmod',
    'field_manual',
    'open_weights_init',
    'full_stack_fixer',
    'big_four_silenced',
    'speed_demon_s',
    'full_loadout',
    'campaign_clear',
    'zero_panic_run',
  ]) {
    assert.ok(fullRunAch.unlocked[expectedId], `Full 11-level run must unlock "${expectedId}"`);
  }
  assert.equal(
    fullRunAch.unlocked.hardware_hoarder,
    undefined,
    'hardware_hoarder must NOT unlock until energy pickup is collected too',
  );
  // Grabbing energy.cell on Level 11 completes all 5 pickup types and unlocks hardware_hoarder!
  const energyRun = createChapterSession({ chapterId: 'chapter-01-kiroween', startLevelId: 'level-11-boss-clod-core' });
  energyRun.skipIntro();
  const energyRes = energyRun.exec('mv energy.cell ~');
  assert.ok(
    energyRes.events.some((e) => e.type === 'ACHIEVEMENT_UNLOCKED' && e.id === 'hardware_hoarder' && e.steamApiName === 'ACH_HARDWARE_HOARDER'),
    'Collecting the remaining energy pickup unlocks ACH_HARDWARE_HOARDER',
  );
  assert.ok(achievements.readAchievements().unlocked.hardware_hoarder, 'hardware_hoarder persists in achievement store');
  // Regression: clicking Skip Tutorial on Level 1 (`skipTutorial()`) must still record `terminal` in AchievementStore so `full_loadout` remains unlockable.
  catalog.resetInMemoryStoresForTest();
  const skipTutAch = createChapterSession({ chapterId: 'chapter-01-kiroween' });
  skipTutAch.arriveLevel();
  const skipTutRes = skipTutAch.skipTutorial();
  assert.ok(skipTutRes.events.some((e) => e.type === 'ITEM_GIVEN' && e.item === 'terminal'), 'skipTutorial() grants terminal');
  assert.ok(
    achievements.readAchievements().stats.collectedItems.includes('terminal'),
    'skipTutorial() records terminal in achievement collectedItems',
  );
  // Restore full run achievement store for CLI checks below
  catalog.resetInMemoryStoresForTest();
  for (const id of [
    'first_boot', 'lantern_sweep', 'sigkill_hunter', 'stone_cold_chmod', 'field_manual',
    'open_weights_init', 'full_stack_fixer', 'big_four_silenced', 'speed_demon_s',
    'full_loadout', 'hardware_hoarder', 'campaign_clear', 'zero_panic_run',
  ]) achievements.unlockAchievement(id);
  // Idempotent: unlocking an already-unlocked achievement returns null
  assert.equal(achievements.unlockAchievement('first_boot'), null, 'Duplicate unlock must return null');

  // CLI commands: `achievements`, `ach combat`, `achievements export`, `achievements sync`, `man achievements`
  const achListOut = kiroChap.exec('achievements').output;
  assert.ok(achListOut.includes('LOCAL ACHIEVEMENTS') && achListOut.includes('ACH_FIRST_BOOT'));
  assert.ok(achListOut.includes('Open Weights & Family Ties'), 'Unlocked secret achievement must reveal its real title');
  const achCombatOut = kiroChap.exec('ach combat').output;
  assert.ok(achCombatOut.includes('ACH_SIGKILL_HUNTER') && !achCombatOut.includes('ACH_FIRST_BOOT'));
  const achExport = JSON.parse(kiroChap.exec('achievements export').output);
  assert.equal(achExport.schemaVersion, 1);
  assert.equal(achExport.totalCount, 15);
  assert.ok(
    achExport.steamApiNames.includes('ACH_CAMPAIGN_CLEAR') &&
      achExport.steamApiNames.includes('ACH_FIELD_MANUAL') &&
      achExport.steamApiNames.includes('ACH_FULL_LOADOUT') &&
      achExport.steamApiNames.includes('ACH_HARDWARE_HOARDER'),
  );
  assert.ok(kiroChap.exec('achievements sync').output.includes('ACH_*'));
  assert.ok(kiroChap.exec('man achievements').output.includes('achievements export'));
  assert.ok(
    kiroChap.exec('achievements; ls').output.includes('Issue complete!'),
    'Post-end achievements pass-through must block chained shell commands',
  );

  // Preview isolation: a preview session neither emits ACHIEVEMENT_UNLOCKED nor leaks unlocked state
  const previewSess = createChapterSession({ chapterId: 'chapter-01-kiroween', preview: true });
  previewSess.skipIntro();
  const prevKill = previewSess.exec('kill -9 {pid:tutorial_virus_1}');
  assert.equal(
    prevKill.events.some((e) => e.type === 'ACHIEVEMENT_UNLOCKED'),
    false,
    'Preview sessions must never emit ACHIEVEMENT_UNLOCKED',
  );
  const prevAchJson = JSON.parse(previewSess.exec('achievements export').output);
  assert.equal(prevAchJson.unlockedCount, 0, 'Preview sessions must report 0 unlocked achievements deterministically');

  // Secret masking before unlock + portable save export/import validation & merge
  const savedBundle = portableSave.exportPortableSaveBundle();
  assert.equal(savedBundle.format, 'out-of-credits-save');
  catalog.resetInMemoryStoresForTest();
  assert.equal(Object.keys(achievements.readAchievements().unlocked).length, 0);
  const freshSession = createChapterSession({ chapterId: 'chapter-01-kiroween', startLevelId: 'level-04-hub-model-one' });
  freshSession.arriveLevel();
  const emptyDirSweep = freshSession.exec('ls -a');
  assert.equal(
    emptyDirSweep.events.some((e) => e.type === 'ACHIEVEMENT_UNLOCKED' && e.id === 'lantern_sweep'),
    false,
    'ls -a in a directory with 0 dotfiles must NOT falsely unlock lantern_sweep',
  );
  const freshList = freshSession.exec('achievements').output;
  assert.ok(freshList.includes('???? (Secret Achievement)'), 'Locked secret achievements must mask their title');
  assert.ok(!freshList.includes('Open Weights & Family Ties'), 'Locked secret achievement must not leak spoiler title');
  const freshExportOut = freshSession.exec('achievements export').output;
  assert.ok(
    !freshExportOut.includes('Open Weights & Family Ties') && !freshExportOut.includes('Zero Kernel Panics'),
    'achievements export must mask locked secret achievement titles until unlocked',
  );

  // Reject malformed / wrong-format / oversized inputs cleanly
  assert.equal(portableSave.importPortableSaveBundle('').ok, false);
  assert.equal(portableSave.importPortableSaveBundle('{not json').ok, false);
  assert.equal(portableSave.importPortableSaveBundle('{"format":"other","version":1}').ok, false);

  // Sanitize unknown achievement IDs & prototype pollution keys while restoring valid unlocks
  const tampered = structuredClone(savedBundle);
  tampered.achievements.unlocked.fake_injected = { id: 'fake_injected', steamApiName: 'ACH_FAKE', unlockedAt: 123 };
  tampered.progress.__proto__ = { bad: { cleared: true, bestRank: 'S', bestCommands: 1, bestTimeSec: 1, updatedAt: 1 } };
  const imported = portableSave.importPortableSaveBundle(JSON.stringify(tampered));
  assert.equal(imported.ok, true);
  assert.equal(achievements.readAchievements().unlocked.fake_injected, undefined, 'Unknown achievement IDs must be stripped');
  assert.ok(achievements.readAchievements().unlocked.campaign_clear, 'Valid achievements must be restored on import');

  // Auto-Cloud hydration must NOT dirty-rewrite out-of-credits-save.json on read-only boots when local state adds nothing new
  const diskJson = JSON.stringify(portableSave.exportPortableSaveBundle());
  const fakeStorage = new Map();
  const prevStorage = globalThis.localStorage;
  const prevWin = globalThis.window;
  try {
    globalThis.localStorage = {
      getItem: (k) => fakeStorage.get(k) ?? null,
      setItem: (k, v) => fakeStorage.set(k, String(v)),
    };
    const tauriCalls = [];
    globalThis.window = {
      __TAURI_INTERNALS__: {
        invoke: async (cmd) => {
          tauriCalls.push(cmd);
          if (cmd === 'desktop_read_save_bundle') return diskJson;
          return true;
        },
      },
    };
    const hydrated = await portableSave.hydrateFromDesktopSaveBundle();
    await new Promise((r) => setTimeout(r, 15));
    assert.equal(hydrated, true, 'Empty localStorage must hydrate from populated desktop save bundle');
    assert.equal(
      tauriCalls.includes('desktop_write_save_bundle'),
      false,
      'Read-only Tauri boot hydration must NOT dirty-rewrite out-of-credits-save.json on disk',
    );
    // Second boot when localStorage already matches diskJson -> changedLocal is false, still 0 disk writes
    const secondHydrate = await portableSave.hydrateFromDesktopSaveBundle();
    await new Promise((r) => setTimeout(r, 15));
    assert.equal(secondHydrate, false, 'Identical Tauri boot hydration must report no local mutation');
    assert.equal(tauriCalls.includes('desktop_write_save_bundle'), false);
  } finally {
    if (prevStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = prevStorage;
    if (prevWin === undefined) delete globalThis.window;
    else globalThis.window = prevWin;
  }

  catalog.resetInMemoryStoresForTest();
  console.log('chapter-level-generator self-test PASS (all validator, chroot, hint, boss, achievements & metagame edge cases verified)');
});
